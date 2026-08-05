import { describe, expect, test } from "bun:test";
import { SyntheticSalesAdapter } from "../../agent/sales/synthetic-adapter";
import { runSalesProspect } from "../../agent/sales/runner";
import type { CampaignContract, ClaimRecord, ObservedFact, ProspectEnvelope, SalesBudget } from "../../agent/sales/types";

const claims: ClaimRecord[] = [
  {
    id: "receptionist.demo.available",
    wording: "We can build a prospect-specific AI receptionist demo before you decide whether to buy.",
    evidenceRef: "product-spec:receptionist-demo-v1",
    limitations: ["Demo only."],
    status: "APPROVED",
  },
  {
    id: "receptionist.lead.capture",
    wording: "The demo can show lead capture for follow-up.",
    evidenceRef: "product-code:demo",
    limitations: ["Synthetic under Gate A."],
    status: "APPROVED",
  },
];

const campaign: CampaignContract = {
  id: "campaign-1",
  name: "Synthetic receptionist sale",
  allowedChannels: ["synthetic"],
  gateBEnabled: false,
  killSwitch: false,
  approvedClaimIds: claims.map((claim) => claim.id),
  maxActionsPerProspect: 8,
  maxRetries: 1,
};

const prospect: ProspectEnvelope = {
  id: "prospect-1",
  companyName: "Fictional Roofing Co",
  channel: "synthetic",
  consent: "NOT_REQUIRED_SYNTHETIC",
  suppressed: false,
  optedOut: false,
  evidenceIds: ["fixture:prospect-1"],
};

const facts: ObservedFact[] = [
  { field: "businessName", value: "Fictional Roofing Co", evidenceId: "e1" },
  { field: "service", value: "Roof repair", evidenceId: "e2" },
];

const budget: SalesBudget = { maxTokens: 5000, maxCostUsd: 0, tokensUsed: 0, costUsd: 0 };

describe("synthetic sales runner", () => {
  test("completes a two-objection synthetic sale with zero external actions", async () => {
    const adapter = new SyntheticSalesAdapter([
      { kind: "objection", text: "We already answer most calls." },
      { kind: "objection", text: "I do not want a big commitment." },
      { kind: "accept", text: "Show me the next step." },
    ]);

    const receipt = await runSalesProspect({ campaign, prospect, facts, claims, budget, adapter });

    expect(receipt.status).toBe("READY_FOR_HANDOFF");
    expect(receipt.finalStage).toBe("EVALUATE_LEARN");
    expect(receipt.externalActions).toBe(0);
    expect(receipt.claimIds.every((id) => campaign.approvedClaimIds.includes(id))).toBe(true);
    expect(adapter.outgoing.every((action) => action.external === false)).toBe(true);
    expect(receipt.objectionsHandled).toBe(2);
  });

  test("opt-out terminates before any pitch", async () => {
    const adapter = new SyntheticSalesAdapter([{ kind: "opt-out", text: "Stop." }]);
    const receipt = await runSalesProspect({ campaign, prospect: { ...prospect, optedOut: true }, facts, claims, budget, adapter });
    expect(receipt.status).toBe("BLOCKED");
    expect(receipt.reason).toBe("OPTED_OUT");
    expect(adapter.outgoing).toHaveLength(0);
  });

  test("kill switch terminates before any action", async () => {
    const adapter = new SyntheticSalesAdapter([{ kind: "accept", text: "Yes" }]);
    const receipt = await runSalesProspect({ campaign: { ...campaign, killSwitch: true }, prospect, facts, claims, budget, adapter });
    expect(receipt.status).toBe("BLOCKED");
    expect(receipt.reason).toBe("KILL_SWITCH");
    expect(adapter.outgoing).toHaveLength(0);
  });

  test("unknown pitch claim is rejected before adapter boundary", async () => {
    const adapter = new SyntheticSalesAdapter([{ kind: "accept", text: "Yes" }]);
    const receipt = await runSalesProspect({
      campaign: { ...campaign, approvedClaimIds: [...campaign.approvedClaimIds, "source.$500-per-day"] },
      prospect,
      facts,
      claims,
      budget,
      adapter,
    });
    expect(receipt.status).toBe("BLOCKED");
    expect(receipt.reason).toBe("UNSUPPORTED_CLAIM");
    expect(adapter.outgoing).toHaveLength(0);
  });

  test("provider/adapter failure obeys retry cap", async () => {
    const adapter = new SyntheticSalesAdapter([], { failSends: 2 });
    const receipt = await runSalesProspect({ campaign, prospect, facts, claims, budget, adapter });
    expect(receipt.status).toBe("BLOCKED");
    expect(receipt.reason).toBe("RETRY_CAP");
    expect(receipt.retryCount).toBe(2);
  });
});
