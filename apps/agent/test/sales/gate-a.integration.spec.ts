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

const fixture = {
  prospectId,
  businessName: "Example Organization.test",
  website: "https://example-organization.test",
  observedFacts: [{ field: "offering", value: "Consultation", evidenceId: "fixture:offering" }],
};

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("Gate A receptionist product trigger", () => {
  test("seeds one synthetic campaign/prospect/task idempotently", async () => {
    const input = {
      ...fixture,
      observedFacts: [
        { field: "offering", value: "Consultation", evidenceId: "fixture:consultation" },
        { field: "hours", value: "Mon-Fri 8am-5pm", evidenceId: "fixture:hours" },
      ],
    };
    const first = await seedGateAReceptionistRun(input);
    const second = await seedGateAReceptionistRun(input);

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

  test("never clears an existing kill switch", async () => {
    await seedGateAReceptionistRun(fixture);
    await db.$executeRaw`UPDATE "salesCampaign" SET "killSwitch" = true WHERE id = 'receptionist-gate-a-v1'`;

    await expect(seedGateAReceptionistRun(fixture)).rejects.toThrow("Gate A campaign kill switch is active");

    const rows = await db.$queryRaw<Array<{ killSwitch: boolean }>>`
      SELECT "killSwitch" FROM "salesCampaign" WHERE id = 'receptionist-gate-a-v1'
    `;
    expect(rows[0]?.killSwitch).toBe(true);
  });

  test("refuses to mutate a campaign that has already crossed Gate B", async () => {
    await seedGateAReceptionistRun(fixture);
    await db.$executeRaw`UPDATE "salesCampaign" SET "gateBEnabled" = true WHERE id = 'receptionist-gate-a-v1'`;

    await expect(seedGateAReceptionistRun(fixture)).rejects.toThrow("Gate A seeder refuses a Gate B campaign");
  });

  test("never clears prospect suppression or opt-out state", async () => {
    await seedGateAReceptionistRun(fixture);
    await db.$executeRaw`UPDATE "salesProspect" SET suppressed = true, "optedOut" = true WHERE id = ${prospectId}`;

    await expect(seedGateAReceptionistRun(fixture)).rejects.toThrow("Gate A prospect is suppressed or opted out");

    const rows = await db.$queryRaw<Array<{ suppressed: boolean; optedOut: boolean }>>`
      SELECT suppressed, "optedOut" FROM "salesProspect" WHERE id = ${prospectId}
    `;
    expect(rows[0]).toEqual({ suppressed: true, optedOut: true });
  });

  test("refuses a non-.test website so Gate A cannot accidentally seed a real prospect", async () => {
    await expect(
      seedGateAReceptionistRun({ ...fixture, businessName: "Real Organization", website: "https://example.com" }),
    ).rejects.toThrow("Gate A requires a reserved .test synthetic website");
  });

  test("requires evidence-backed observed facts", async () => {
    await expect(
      seedGateAReceptionistRun({ ...fixture, observedFacts: [{ field: "offering", value: "Consultation", evidenceId: "" }] }),
    ).rejects.toThrow("every observed fact requires an evidenceId");
  });
});
