import { EnrichmentStatus } from "@crm/db";
import { defineSchedule } from "eve/schedules";
import crm from "../channels/crm";
import { markRunning, settle } from "../lib/enrichment";
import { claimDue, MAX_ATTEMPTS, noteSession, retireExhausted, type LeasedTask } from "../lib/tasks";
import { recordSalesTaskFailure } from "../sales/store";
import { isSalesTask, salesTaskAttributes, salesTaskBrief } from "../sales/task-queue";

/** Per tick. The cap is concurrency, not ambition — the queue keeps. */
const BATCH = 5;

export default defineSchedule({
	cron: "* * * * *",
	async run({ receive, waitUntil, appAuth }) {
		waitUntil(
			(async () => {
				// Retirement is type-aware: enrichment rows update enrichment status;
				// sales rows write sales receipts and must never mutate enrichment state.
				try {
					for (const abandoned of await retireExhausted()) {
						if (abandoned.kind.startsWith("sales:") && abandoned.salesProspectId) {
							await recordSalesTaskFailure({
								taskId: abandoned.id,
								prospectId: abandoned.salesProspectId,
								attempt: MAX_ATTEMPTS,
								reason: `Agent task exhausted after ${MAX_ATTEMPTS} attempts without a completed turn.`,
							}).catch(() => {});
							continue;
						}
						await settle(
							abandoned,
							EnrichmentStatus.FAILED,
							"Research was attempted several times and never completed.",
						);
					}
				} catch {}

				const tasks = await claimDue(BATCH);
				if (tasks.length === 0) return;

				await Promise.all(
					tasks.map(async (task) => {
						const sales = isSalesTask(task);
						try {
							if (!sales) await markRunning(task);

							const attributes = sales
								? salesTaskAttributes(task)
								: {
									taskKind: task.kind,
									reason: task.reason,
									budget: String(task.budget),
									...(task.contactId ? { contactId: task.contactId } : {}),
									...(task.companyId ? { companyId: task.companyId } : {}),
								};

							const session = await receive(crm, {
								message: sales ? salesTaskBrief(task) : brief(task),
								target: { taskId: task.id },
								auth: { ...appAuth, attributes },
							});

							// Hand-off, not completion. The CRM channel retires the task at
							// `session.waiting`, when the actual turn is finished.
							await noteSession(task.id, session.id);
						} catch (error) {
							const reason = error instanceof Error ? error.message : String(error);
							if (sales) {
								await recordSalesTaskFailure({
									taskId: task.id,
									prospectId: task.salesProspectId,
									attempt: task.attempts,
									reason,
								}).catch(() => {});
								return;
							}

							await settle(task, EnrichmentStatus.FAILED, reason).catch(() => {});
						}
					}),
				);
			})(),
		);
	},
});

/**
 * What a legacy enrichment session is asked to do. Sales tasks deliberately
 * bypass this generic fallback and use `salesTaskBrief`.
 */
function brief(task: LeasedTask): string {
	const again =
		task.attempts > 1
			? `This is attempt ${task.attempts}; the earlier one did not finish. Carry on from what is already in this thread rather than starting again. `
			: "";

	return again + work(task.kind, task.reason);
}

function work(kind: string, reason: string): string {
	switch (kind) {
		case "identify":
			return "Work out who this contact actually is, and record what you find. Read what we already have before spending anything.";
		case "profile":
		case "recheck":
			return "Bring this contact's record up to date: their background, their current role, and anything that has changed since we last looked.";
		case "meeting-prep":
			return "There is a meeting with this person soon. Make sure whoever is taking it opens the record knowing who they are dealing with.";
		case "company-profile":
			return "Fill in what we know about this company: brand, industry, location, links. Write a brief if there is something worth saying.";
		default:
			return `Handle this: ${reason}`;
	}
}
