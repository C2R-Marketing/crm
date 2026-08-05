import { db, type Prisma } from "@crm/db";

/**
 * The work queue the agent both reads and writes.
 *
 * The point of a table rather than a cron expression per kind of work: a cron
 * can only say "every hour, for everybody". A row can say *this person, in
 * fourteen days, because a job change here would move a live deal* — and the
 * reason is the agent's own words, shown to the rep on the record.
 */

export type LeasedTask = {
	id: string;
	contactId: string | null;
	companyId: string | null;
	/** Present only for `sales:*` work. Added by the revenue-autopilot migration. */
	salesProspectId: string | null;
	kind: string;
	reason: string;
	budget: number;
	attempts: number;
};

/** The durable subject of a row. */
export type TaskSubject = {
	id: string;
	contactId: string | null;
	companyId: string | null;
	salesProspectId: string | null;
	kind: string;
};

/** How long a dispatcher tick holds a row before another one may retry it. */
const LEASE_MS = 10 * 60_000;

/**
 * How many hand-offs a row gets before it is given up on.
 *
 * The lease makes a crashed run recoverable; this makes an unrecoverable one
 * stop. Three is enough to ride out a redeploy and a transient vendor outage,
 * and small enough that a task which can never park costs three model turns
 * rather than one every ten minutes until somebody notices.
 */
export const MAX_ATTEMPTS = 3;

/** Claims due work atomically with the durable subject identity intact. */
export async function claimDue(limit: number): Promise<LeasedTask[]> {
	const now = new Date();
	const until = new Date(now.getTime() + LEASE_MS);

	return db.$queryRaw<LeasedTask[]>`
		UPDATE "agentTask" AS t
		SET "leasedUntil" = ${until},
			"startedAt" = COALESCE(t."startedAt", ${now}),
			"attempts" = t."attempts" + 1
		FROM (
			SELECT id FROM "agentTask"
			WHERE "finishedAt" IS NULL
				AND "dueAt" <= ${now}
				AND ("leasedUntil" IS NULL OR "leasedUntil" < ${now})
				AND "attempts" < ${MAX_ATTEMPTS}
			ORDER BY "priority" DESC, "dueAt" ASC
			LIMIT ${limit}
			FOR UPDATE SKIP LOCKED
		) AS due
		WHERE t.id = due.id
		RETURNING t.id, t."contactId", t."companyId", t."salesProspectId", t.kind, t.reason, t.budget, t.attempts;
	`;
}

/** Gives up on rows that spent their bounded hand-off allowance. */
export async function retireExhausted(): Promise<TaskSubject[]> {
	const now = new Date();

	return db.$queryRaw<TaskSubject[]>`
		UPDATE "agentTask" AS t
		SET "finishedAt" = ${now},
			"outcome" = ${`Gave up after ${MAX_ATTEMPTS} attempts: the session never reported back.`}
		WHERE t."finishedAt" IS NULL
			AND t."attempts" >= ${MAX_ATTEMPTS}
			AND (t."leasedUntil" IS NULL OR t."leasedUntil" < ${now})
		RETURNING t.id, t."contactId", t."companyId", t."salesProspectId", t.kind;
	`;
}

/**
 * Retires a row once. The follow-up raw read preserves salesProspectId without
 * requiring the generated Prisma client to know about the additive migration.
 */
export async function completeTask(
	taskId: string,
	outcome: string,
	sessionId?: string,
): Promise<TaskSubject | null> {
	const { count } = await db.agentTask.updateMany({
		where: { id: taskId, finishedAt: null },
		data: {
			finishedAt: new Date(),
			outcome: outcome.slice(0, 500),
			...(sessionId ? { sessionId } : {}),
		},
	});

	if (count === 0) return null;
	return taskSubject(taskId);
}

/** Who a row is about, without disturbing it. */
export async function taskSubject(taskId: string): Promise<TaskSubject | null> {
	const rows = await db.$queryRaw<TaskSubject[]>`
		SELECT id, "contactId", "companyId", "salesProspectId", kind
		FROM "agentTask"
		WHERE id = ${taskId}
	`;
	return rows[0] ?? null;
}

/** Records which durable session took the work. */
export async function noteSession(
	taskId: string,
	sessionId: string,
): Promise<void> {
	await db.agentTask.updateMany({
		where: { id: taskId, finishedAt: null },
		data: { sessionId },
	});
}

/** Books the next look at a contact/company enrichment subject. */
export async function scheduleTask(input: {
	contactId?: string | null;
	companyId?: string | null;
	kind: string;
	reason: string;
	dueAt: Date;
	priority?: number;
	budget?: number;
}): Promise<{ id: string }> {
	const existing = await db.agentTask.findFirst({
		where: {
			kind: input.kind,
			finishedAt: null,
			contactId: input.contactId ?? undefined,
			companyId: input.companyId ?? undefined,
		},
		select: { id: true },
	});

	if (existing) {
		await db.agentTask.update({
			where: { id: existing.id },
			data: { dueAt: input.dueAt, reason: input.reason },
		});
		return existing;
	}

	return db.agentTask.create({
		data: {
			contactId: input.contactId ?? null,
			companyId: input.companyId ?? null,
			kind: input.kind,
			reason: input.reason,
			dueAt: input.dueAt,
			priority: input.priority ?? 0,
			budget: input.budget ?? 4,
		},
		select: { id: true },
	});
}

/** What the agent last decided about a contact, for the sheet to show. */
export async function lastDecision(contactId: string) {
	return db.agentTask.findFirst({
		where: { contactId },
		orderBy: { createdAt: "desc" },
		select: {
			kind: true,
			reason: true,
			dueAt: true,
			finishedAt: true,
			outcome: true,
		},
	});
}

/** Kept for the raw query above to stay type-checked against the schema. */
export type { Prisma };
