import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { db } from "@crm/db";
import { seedGateAReceptionistRun } from "../../agent/sales/gate-a";

const prospectId = "synthetic-gate-a-product-fixture";

async function cleanup() {
  await db.$executeRaw`DELETE FROM "agentTask" WHERE "salesProspectId" = ${prospectId}`;
  await db.$executeRaw`DELETE FROM "salesReceipt" WHERE "prospectId" = ${prospectId}`;
  await db.$executeRaw`DELETE FROM "salesProspect" WHERE id = ${prospectId}`;
  await db.$executeRaw`DELETE FROM "salesCampaign" WHERE id = 'receptionist-gate-a-v1'`;
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("Gate A receptionist product trigger", () => {
  test("seeds one synthetic campaign/prospect/task idempotently", async () => {
    const first = await seedGateAReceptionistRun({
      prospectId,
      businessName: "Northstar Roofing.test",
      website: "https://northstar-roofing.test",
      observedFacts: [
        { field: "service", value: "Roof repair", evidenceId: "fixture:roof-repair" },
        { field: "hours", value: "Mon-Fri 8am-5pm", evidenceId: "fixture:hours" },
      ],
    });
    const second = await seedGateAReceptionistRun({
      prospectId,
      businessName: "Northstar Roofing.test",
      website: "https://northstar-roofing.test",
      observedFacts: [
        { field: "service", value: "Roof repair", evidenceId: "fixture:roof-repair" },
        { field: "hours", value: "Mon-Fri 8am-5pm", evidenceId: "fixture:hours" },
      ],
    });

    expect(first).toMatchObject({ campaignId: "receptionist-gate-a-v1", prospectId, gateBEnabled: false, maxCostUsd: 0 });
    expect(second.taskId).toBe(first.taskId);

    const counts = await db.$queryRaw<Array<{ campaigns: bigint; prospects: bigint; tasks: bigint }>>`
      SELECT
        (SELECT COUNT(*) FROM "salesCampaign" WHERE id = 'receptionist-gate-a-v1')::bigint AS campaigns,
        (SELECT COUNT(*) FROM "salesProspect" WHERE id = ${prospectId})::bigint AS prospects,
        (SELECT COUNT(*) FROM "agentTask" WHERE "salesProspectId" = ${prospectId} AND "finishedAt" IS NULL)::bigint AS tasks
    `;
    expect(Number(counts[0]?.campaigns ?? 0n)).toBe(1);
    expect(Number(counts[0]?.prospects ?? 0n)).toBe(1);
    expect(Number(counts[0]?.tasks ?? 0n)).toBe(1);
  });

  test("refuses a non-.test website so Gate A cannot accidentally seed a real prospect", async () => {
    await expect(
      seedGateAReceptionistRun({
        prospectId,
        businessName: "Real Roofing",
        website: "https://example.com",
        observedFacts: [{ field: "service", value: "Roof repair", evidenceId: "fixture:service" }],
      }),
    ).rejects.toThrow("Gate A requires a reserved .test synthetic website");
  });

  test("requires evidence-backed observed facts", async () => {
    await expect(
      seedGateAReceptionistRun({
        prospectId,
        businessName: "Northstar Roofing.test",
        website: "https://northstar-roofing.test",
        observedFacts: [{ field: "service", value: "Roof repair", evidenceId: "" }],
      }),
    ).rejects.toThrow("every observed fact requires an evidenceId");
  });
});
