import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { db } from "@crm/db";
import { executeSalesAgentDecision } from "../../agent/sales/agent-action";
import { createSalesCampaign, createSalesProspect, getSalesProspect } from "../../agent/sales/store";

const campaignId = "sales-agent-action-campaign";
const prospectId = "sales-agent-action-prospect";

async function cleanup() {
  await db.$executeRaw`DELETE FROM "salesReceipt" WHERE "campaignId" = ${campaignId}`;
  await db.$executeRaw`DELETE FROM "agentTask" WHERE "salesProspectId" = ${prospectId}`;
  await db.$executeRaw`DELETE FROM "salesProspect" WHERE id = ${prospectId}`;
  await db.$executeRaw`DELETE FROM "salesCampaign" WHERE id = ${campaignId}`;
}

async function seed(stage: string, overrides: { gateBEnabled?: boolean; killSwitch?: boolean } = {}) {
  await createSalesCampaign({
    id: campaignId,
    name: "Gate A action fixture",
    gateBEnabled: overrides.gateBEnabled ?? false,
    killSwitch: overrides.killSwitch ?? false,
    contract: {
      approvedClaimIds: ["receptionist.demo.available", "receptionist.lead.capture"],
      maxActionsPerProspect: 8,
      maxRetries: 1,
    },
  });
  await createSalesProspect({
    id: prospectId,
    campaignId,
    provenance: { source: "fixture", evidenceIds: ["fixture:e1"] },
    consentBasis: "NOT_REQUIRED_SYNTHETIC",
    currentStage: stage as never,
    suppressed: false,
    optedOut: false,
  });
}

const identity = {
  provider: "eve-test",
  model: "test-model",
  tool: "sales_advance",
  identityStatus: "VERIFIED" as const,
};

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("durable Eve sales action boundary", () => {
  test("present_offer advances PITCH -> CTA and writes one idempotent receipt", async () => {
    await seed("PITCH");
    const first = await executeSalesAgentDecision({
      prospectId,
      decision: "present_offer",
      idempotencyKey: "session-1:PITCH:present_offer",
      identity,
    });
    const second = await executeSalesAgentDecision({
      prospectId,
      decision: "present_offer",
      idempotencyKey: "session-1:PITCH:present_offer",
      identity,
    });

    expect(first).toMatchObject({ ok: true, stageBefore: "PITCH", stageAfter: "CTA", duplicate: false });
    expect(second).toMatchObject({ ok: true, stageBefore: "PITCH", stageAfter: "CTA", duplicate: true });
    expect((await getSalesProspect(prospectId))?.currentStage).toBe("CTA");

    const rows = await db.$queryRaw<Array<{ count: bigint; externalAction: boolean; provider: string | null; model: string | null; tool: string | null }>>`
      SELECT COUNT(*)::bigint AS count,
             BOOL_OR("externalAction") AS "externalAction",
             MAX(provider) AS provider,
             MAX(model) AS model,
             MAX(tool) AS tool
      FROM "salesReceipt"
      WHERE "idempotencyKey" = ${"session-1:PITCH:present_offer"}
    `;
    expect(Number(rows[0]?.count ?? 0n)).toBe(1);
    expect(rows[0]).toMatchObject({ externalAction: false, provider: "eve-test", model: "test-model", tool: "sales_advance" });
  });

  test("objection handling is one bounded CTA -> CTA action through HANDLE_OBJECTION", async () => {
    await seed("CTA");
    const result = await executeSalesAgentDecision({
      prospectId,
      decision: "handle_objection",
      idempotencyKey: "session-2:CTA:handle_objection",
      identity,
    });
    expect(result).toMatchObject({ ok: true, stageBefore: "CTA", stageAfter: "CTA", action: "objection-response" });
  });

  test("decline schedules a durable follow-up and never contacts externally", async () => {
    await seed("CTA");
    const result = await executeSalesAgentDecision({
      prospectId,
      decision: "decline_cta",
      idempotencyKey: "session-3:CTA:decline_cta",
      identity,
    });
    expect(result).toMatchObject({ ok: true, stageAfter: "FOLLOW_UP", externalAction: false });
    const tasks = await db.$queryRaw<Array<{ kind: string; salesProspectId: string | null }>>`
      SELECT kind, "salesProspectId" FROM "agentTask"
      WHERE "salesProspectId" = ${prospectId} AND "finishedAt" IS NULL
    `;
    expect(tasks).toEqual([{ kind: "sales:advance", salesProspectId: prospectId }]);
  });

  test("hard action cap blocks a ninth sales_advance mutation", async () => {
    await seed("PITCH");
    for (let i = 0; i < 8; i += 1) {
      await db.$executeRaw`
        INSERT INTO "salesReceipt" (
          id, "idempotencyKey", "runId", "campaignId", "prospectId", "stageBefore", "stageAfter",
          provider, model, tool, action, "evidenceIds", "claimIds", budget, "externalAction", "retryCount"
        )
        VALUES (
          ${`cap-receipt-${i}`}, ${`cap-key-${i}`}, ${`cap-run-${i}`}, ${campaignId}, ${prospectId},
          'PITCH', 'PITCH', 'eve-test', 'test-model', 'sales_advance', 'fixture-action', '[]'::jsonb, '[]'::jsonb,
          '{}'::jsonb, false, 0
        )
      `;
    }

    const result = await executeSalesAgentDecision({
      prospectId,
      decision: "present_offer",
      idempotencyKey: "session-cap:PITCH:present_offer",
      identity,
    });
    expect(result).toMatchObject({ ok: false, reason: "ACTION_CAP" });
    expect((await getSalesProspect(prospectId))?.currentStage).toBe("PITCH");
  });

  test("kill switch blocks before durable mutation", async () => {
    await seed("PITCH", { killSwitch: true });
    const result = await executeSalesAgentDecision({
      prospectId,
      decision: "present_offer",
      idempotencyKey: "session-4:PITCH:present_offer",
      identity,
    });
    expect(result).toMatchObject({ ok: false, reason: "KILL_SWITCH" });
    expect((await getSalesProspect(prospectId))?.currentStage).toBe("PITCH");
  });

  test("wrong-stage decision fails closed without receipt", async () => {
    await seed("QUALIFY");
    const result = await executeSalesAgentDecision({
      prospectId,
      decision: "present_offer",
      idempotencyKey: "session-5:QUALIFY:present_offer",
      identity,
    });
    expect(result).toMatchObject({ ok: false, reason: "ILLEGAL_TRANSITION" });
    const rows = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "salesReceipt" WHERE "idempotencyKey" = ${"session-5:QUALIFY:present_offer"}
    `;
    expect(Number(rows[0]?.count ?? 0n)).toBe(0);
  });
});
