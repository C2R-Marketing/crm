import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { db } from "@crm/db";
import {
  appendSalesReceipt,
  createSalesCampaign,
  createSalesProspect,
  getSalesProspect,
  scheduleSalesTask,
} from "../../agent/sales/store";

const campaignId = "sales-campaign-integration-fixture";
const prospectId = "sales-prospect-integration-fixture";

async function cleanup() {
  await db.$executeRaw`DELETE FROM "salesReceipt" WHERE "campaignId" = ${campaignId}`;
  await db.$executeRaw`DELETE FROM "agentTask" WHERE "salesProspectId" = ${prospectId}`;
  await db.$executeRaw`DELETE FROM "salesProspect" WHERE id = ${prospectId}`;
  await db.$executeRaw`DELETE FROM "salesCampaign" WHERE id = ${campaignId}`;
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("durable sales store", () => {
  test("persists a campaign and prospect with consent/suppression state", async () => {
    await createSalesCampaign({
      id: campaignId,
      name: "Integration fixture",
      gateBEnabled: false,
      killSwitch: false,
      contract: { allowedChannels: ["synthetic"], maxActionsPerProspect: 8 },
    });
    await createSalesProspect({
      id: prospectId,
      campaignId,
      provenance: { source: "fixture", evidenceIds: ["fixture:e1"] },
      consentBasis: "NOT_REQUIRED_SYNTHETIC",
      currentStage: "PROSPECT_INGEST",
      suppressed: false,
      optedOut: false,
    });

    const stored = await getSalesProspect(prospectId);
    expect(stored).toMatchObject({
      id: prospectId,
      campaignId,
      consentBasis: "NOT_REQUIRED_SYNTHETIC",
      currentStage: "PROSPECT_INGEST",
      suppressed: false,
      optedOut: false,
    });
  });

  test("receipt writes are idempotent and never duplicate an action", async () => {
    await createSalesCampaign({ id: campaignId, name: "Integration fixture", gateBEnabled: false, killSwitch: false, contract: {} });
    await createSalesProspect({
      id: prospectId,
      campaignId,
      provenance: { source: "fixture" },
      consentBasis: "NOT_REQUIRED_SYNTHETIC",
      currentStage: "PITCH",
      suppressed: false,
      optedOut: false,
    });

    const input = {
      idempotencyKey: "fixture-run:pitch:1",
      runId: "fixture-run",
      campaignId,
      prospectId,
      stageBefore: "PITCH",
      stageAfter: "CTA",
      action: "pitch",
      evidenceIds: ["fixture:e1"],
      claimIds: ["receptionist.demo.available"],
      budget: { tokens: 0, costUsd: 0 },
      externalAction: false,
      retryCount: 0,
    };
    const first = await appendSalesReceipt(input);
    const second = await appendSalesReceipt(input);
    expect(second.id).toBe(first.id);

    const rows = await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "salesReceipt" WHERE "idempotencyKey" = ${input.idempotencyKey}`;
    expect(Number(rows[0]?.count ?? 0n)).toBe(1);
  });

  test("queues sales work in the existing AgentTask scheduler", async () => {
    await createSalesCampaign({ id: campaignId, name: "Integration fixture", gateBEnabled: false, killSwitch: false, contract: {} });
    await createSalesProspect({
      id: prospectId,
      campaignId,
      provenance: { source: "fixture" },
      consentBasis: "NOT_REQUIRED_SYNTHETIC",
      currentStage: "QUALIFY",
      suppressed: false,
      optedOut: false,
    });

    const task = await scheduleSalesTask({
      salesProspectId: prospectId,
      kind: "advance",
      reason: "Continue the bounded synthetic sales fixture.",
      dueAt: new Date("2026-08-05T00:00:00Z"),
      priority: 50,
      budget: 2,
    });

    const rows = await db.$queryRaw<Array<{ id: string; salesProspectId: string | null; kind: string }>>`
      SELECT id, "salesProspectId", kind FROM "agentTask" WHERE id = ${task.id}
    `;
    expect(rows[0]).toEqual({ id: task.id, salesProspectId: prospectId, kind: "sales:advance" });
  });
});
