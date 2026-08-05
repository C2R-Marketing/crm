import { randomUUID } from "node:crypto";
import { db } from "@crm/db";
import type { SalesStage } from "./types";

type JsonObject = Record<string, unknown>;

export async function createSalesCampaign(input: {
  id?: string;
  name: string;
  gateBEnabled: boolean;
  killSwitch: boolean;
  contract: JsonObject;
}): Promise<{ id: string }> {
  const id = input.id ?? randomUUID();
  const contract = JSON.stringify(input.contract);
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "salesCampaign" (id, name, "gateBEnabled", "killSwitch", contract)
    VALUES (${id}, ${input.name}, ${input.gateBEnabled}, ${input.killSwitch}, ${contract}::jsonb)
    RETURNING id
  `;
  return rows[0] ?? { id };
}

export async function createSalesProspect(input: {
  id?: string;
  campaignId: string;
  contactId?: string | null;
  companyId?: string | null;
  provenance: JsonObject;
  consentBasis: string;
  currentStage: SalesStage;
  suppressed: boolean;
  optedOut: boolean;
  nextActionAt?: Date | null;
}): Promise<{ id: string }> {
  const id = input.id ?? randomUUID();
  const provenance = JSON.stringify(input.provenance);
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "salesProspect" (
      id, "campaignId", "contactId", "companyId", provenance, "consentBasis",
      suppressed, "optedOut", "currentStage", "nextActionAt"
    )
    VALUES (
      ${id}, ${input.campaignId}, ${input.contactId ?? null}, ${input.companyId ?? null},
      ${provenance}::jsonb, ${input.consentBasis}, ${input.suppressed}, ${input.optedOut},
      ${input.currentStage}, ${input.nextActionAt ?? null}
    )
    RETURNING id
  `;
  return rows[0] ?? { id };
}

export async function getSalesProspect(id: string): Promise<{
  id: string;
  campaignId: string;
  contactId: string | null;
  companyId: string | null;
  provenance: unknown;
  consentBasis: string;
  suppressed: boolean;
  optedOut: boolean;
  currentStage: SalesStage;
  nextActionAt: Date | null;
} | null> {
  const rows = await db.$queryRaw<Array<{
    id: string;
    campaignId: string;
    contactId: string | null;
    companyId: string | null;
    provenance: unknown;
    consentBasis: string;
    suppressed: boolean;
    optedOut: boolean;
    currentStage: SalesStage;
    nextActionAt: Date | null;
  }>>`
    SELECT id, "campaignId", "contactId", "companyId", provenance, "consentBasis",
           suppressed, "optedOut", "currentStage", "nextActionAt"
    FROM "salesProspect"
    WHERE id = ${id}
  `;
  return rows[0] ?? null;
}

export type SalesSessionContext = {
  prospectId: string;
  campaignId: string;
  campaignName: string;
  gateBEnabled: boolean;
  killSwitch: boolean;
  contract: unknown;
  contactId: string | null;
  companyId: string | null;
  provenance: unknown;
  consentBasis: string;
  suppressed: boolean;
  optedOut: boolean;
  currentStage: SalesStage;
  nextActionAt: Date | null;
};

export async function getSalesSessionContext(prospectId: string): Promise<SalesSessionContext | null> {
  const rows = await db.$queryRaw<SalesSessionContext[]>`
    SELECT
      p.id AS "prospectId",
      p."campaignId" AS "campaignId",
      c.name AS "campaignName",
      c."gateBEnabled" AS "gateBEnabled",
      c."killSwitch" AS "killSwitch",
      c.contract,
      p."contactId" AS "contactId",
      p."companyId" AS "companyId",
      p.provenance,
      p."consentBasis" AS "consentBasis",
      p.suppressed,
      p."optedOut" AS "optedOut",
      p."currentStage" AS "currentStage",
      p."nextActionAt" AS "nextActionAt"
    FROM "salesProspect" p
    JOIN "salesCampaign" c ON c.id = p."campaignId"
    WHERE p.id = ${prospectId}
  `;
  return rows[0] ?? null;
}

export async function updateSalesProspectStage(input: {
  id: string;
  stage: SalesStage;
  nextActionAt?: Date | null;
}): Promise<boolean> {
  const changed = await db.$executeRaw`
    UPDATE "salesProspect"
    SET "currentStage" = ${input.stage}, "nextActionAt" = ${input.nextActionAt ?? null}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${input.id}
  `;
  return changed === 1;
}

export async function appendSalesReceipt(input: {
  idempotencyKey: string;
  runId: string;
  campaignId: string;
  prospectId: string;
  stageBefore: string;
  stageAfter: string;
  provider?: string | null;
  model?: string | null;
  tool?: string | null;
  action: string;
  evidenceIds: string[];
  claimIds: string[];
  budget: JsonObject;
  externalAction: boolean;
  outcome?: string | null;
  error?: string | null;
  retryCount: number;
}): Promise<{ id: string }> {
  const id = randomUUID();
  const evidenceIds = JSON.stringify(input.evidenceIds);
  const claimIds = JSON.stringify(input.claimIds);
  const budget = JSON.stringify(input.budget);
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "salesReceipt" (
      id, "idempotencyKey", "runId", "campaignId", "prospectId", "stageBefore", "stageAfter",
      provider, model, tool, action, "evidenceIds", "claimIds", budget, "externalAction",
      outcome, error, "retryCount"
    )
    VALUES (
      ${id}, ${input.idempotencyKey}, ${input.runId}, ${input.campaignId}, ${input.prospectId},
      ${input.stageBefore}, ${input.stageAfter}, ${input.provider ?? null}, ${input.model ?? null},
      ${input.tool ?? null}, ${input.action}, ${evidenceIds}::jsonb, ${claimIds}::jsonb,
      ${budget}::jsonb, ${input.externalAction}, ${input.outcome ?? null}, ${input.error ?? null}, ${input.retryCount}
    )
    ON CONFLICT ("idempotencyKey") DO UPDATE SET "idempotencyKey" = EXCLUDED."idempotencyKey"
    RETURNING id
  `;
  return rows[0] ?? { id };
}

async function currentTaskAttempt(taskId: string): Promise<number> {
  const rows = await db.$queryRaw<Array<{ attempts: number }>>`
    SELECT attempts FROM "agentTask" WHERE id = ${taskId}
  `;
  return rows[0]?.attempts ?? 0;
}

export async function recordSalesTaskFailure(input: {
  taskId: string;
  prospectId: string;
  attempt?: number;
  reason: string;
}): Promise<{ id: string } | null> {
  const context = await getSalesSessionContext(input.prospectId);
  if (!context) return null;
  const attempt = input.attempt ?? (await currentTaskAttempt(input.taskId));
  return appendSalesReceipt({
    idempotencyKey: `${input.taskId}:dispatch:${attempt}`,
    runId: input.taskId,
    campaignId: context.campaignId,
    prospectId: context.prospectId,
    stageBefore: context.currentStage,
    stageAfter: context.currentStage,
    action: "agent-task-dispatch",
    evidenceIds: [],
    claimIds: [],
    budget: { attempt },
    externalAction: false,
    error: input.reason.slice(0, 500),
    retryCount: Math.max(0, attempt - 1),
  });
}

export async function recordSalesTaskCompletion(input: {
  taskId: string;
  prospectId: string;
  outcome?: string;
}): Promise<{ id: string } | null> {
  const context = await getSalesSessionContext(input.prospectId);
  if (!context) return null;
  const attempt = await currentTaskAttempt(input.taskId);
  return appendSalesReceipt({
    idempotencyKey: `${input.taskId}:turn-complete`,
    runId: input.taskId,
    campaignId: context.campaignId,
    prospectId: context.prospectId,
    stageBefore: context.currentStage,
    stageAfter: context.currentStage,
    action: "agent-task-turn-complete",
    evidenceIds: [],
    claimIds: [],
    budget: { attempt },
    externalAction: false,
    outcome: (input.outcome ?? "Eve turn completed").slice(0, 500),
    retryCount: Math.max(0, attempt - 1),
  });
}

export async function scheduleSalesTask(input: {
  salesProspectId: string;
  kind: string;
  reason: string;
  dueAt: Date;
  priority?: number;
  budget?: number;
}): Promise<{ id: string }> {
  const kind = input.kind.startsWith("sales:") ? input.kind : `sales:${input.kind}`;
  const existing = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "agentTask"
    WHERE "salesProspectId" = ${input.salesProspectId}
      AND kind = ${kind}
      AND "finishedAt" IS NULL
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;

  if (existing[0]) {
    await db.$executeRaw`
      UPDATE "agentTask"
      SET "dueAt" = ${input.dueAt}, reason = ${input.reason}, priority = ${input.priority ?? 0}, budget = ${input.budget ?? 2}
      WHERE id = ${existing[0].id}
    `;
    return existing[0];
  }

  const id = randomUUID();
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "agentTask" (id, "salesProspectId", kind, reason, "dueAt", priority, budget)
    VALUES (${id}, ${input.salesProspectId}, ${kind}, ${input.reason}, ${input.dueAt}, ${input.priority ?? 0}, ${input.budget ?? 2})
    RETURNING id
  `;
  return rows[0] ?? { id };
}
