import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { db } from "@crm/db";
import { salesSessionPreamble } from "../../agent/sales/preamble";
import { createSalesCampaign, createSalesProspect } from "../../agent/sales/store";

const campaignId = "sales-preamble-campaign-fixture";
const prospectId = "sales-preamble-prospect-fixture";

async function cleanup() {
  await db.$executeRaw`DELETE FROM "agentTask" WHERE "salesProspectId" = ${prospectId}`;
  await db.$executeRaw`DELETE FROM "salesReceipt" WHERE "prospectId" = ${prospectId}`;
  await db.$executeRaw`DELETE FROM "salesProspect" WHERE id = ${prospectId}`;
  await db.$executeRaw`DELETE FROM "salesCampaign" WHERE id = ${campaignId}`;
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("sales session preamble", () => {
  test("loads durable prospect policy and gives Eve a bounded Gate-A-safe objective", async () => {
    await createSalesCampaign({
      id: campaignId,
      name: "Synthetic receptionist campaign",
      gateBEnabled: false,
      killSwitch: false,
      contract: { approvedClaimIds: ["receptionist.demo.available"], maxActionsPerProspect: 8 },
    });
    await createSalesProspect({
      id: prospectId,
      campaignId,
      provenance: { source: "fixture", evidenceIds: ["fixture:e1"] },
      consentBasis: "NOT_REQUIRED_SYNTHETIC",
      currentStage: "QUALIFY",
      suppressed: false,
      optedOut: false,
    });

    const preamble = await salesSessionPreamble(prospectId, {
      kind: "sales:advance",
      reason: "Continue the synthetic fixture.",
      budget: 2,
    });

    expect(preamble.markdown).toContain("Sales prospect: sales-preamble-prospect-fixture");
    expect(preamble.markdown).toContain("Current stage: QUALIFY");
    expect(preamble.markdown).toContain("Gate B: LOCKED");
    expect(preamble.markdown).toContain("No external contact");
    expect(preamble.markdown).toContain("NOT_REQUIRED_SYNTHETIC");
    expect(preamble.focus).toEqual({ contactId: null, companyId: null });
  });

  test("kill switch produces a stop-only preamble", async () => {
    await createSalesCampaign({ id: campaignId, name: "Stopped", gateBEnabled: false, killSwitch: true, contract: {} });
    await createSalesProspect({
      id: prospectId,
      campaignId,
      provenance: { source: "fixture" },
      consentBasis: "NOT_REQUIRED_SYNTHETIC",
      currentStage: "PITCH",
      suppressed: false,
      optedOut: false,
    });

    const preamble = await salesSessionPreamble(prospectId, { kind: "sales:advance", reason: "fixture", budget: 2 });
    expect(preamble.markdown).toContain("KILL SWITCH ACTIVE");
    expect(preamble.markdown).toContain("Do not call any model or external tool");
  });
});
