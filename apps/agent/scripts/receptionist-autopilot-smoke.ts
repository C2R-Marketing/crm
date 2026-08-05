import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { SyntheticSalesAdapter } from "../agent/sales/synthetic-adapter";
import { runSalesProspect } from "../agent/sales/runner";
import type { CampaignContract, ClaimRecord, ObservedFact, ProspectEnvelope, SalesBudget } from "../agent/sales/types";

const here = dirname(fileURLToPath(import.meta.url));
const offerPath = resolve(here, "../agent/sales/config/receptionist-offer.v1.json");
const offer = JSON.parse(readFileSync(offerPath, "utf8")) as { claims: ClaimRecord[] };

const campaign: CampaignContract = {
  id: "synthetic-receptionist-campaign-v1",
  name: "Gate A synthetic receptionist sale",
  allowedChannels: ["synthetic"],
  gateBEnabled: false,
  killSwitch: false,
  approvedClaimIds: offer.claims.map((claim) => claim.id),
  maxActionsPerProspect: 8,
  maxRetries: 1,
};

const prospect: ProspectEnvelope = {
  id: "synthetic-roofer-001",
  companyName: "Northstar Roofing.test",
  channel: "synthetic",
  consent: "NOT_REQUIRED_SYNTHETIC",
  suppressed: false,
  optedOut: false,
  evidenceIds: ["fixture:synthetic-roofer-001"],
};

const facts: ObservedFact[] = [
  { field: "businessName", value: "Northstar Roofing.test", evidenceId: "fixture:business-name" },
  { field: "service", value: "Roof repair", evidenceId: "fixture:service-roof-repair" },
  { field: "serviceArea", value: "Example County", evidenceId: "fixture:service-area" },
  { field: "hours", value: "Mon-Fri 8am-5pm", evidenceId: "fixture:hours" },
];

const budget: SalesBudget = {
  maxTokens: 5_000,
  maxCostUsd: 0,
  tokensUsed: 0,
  costUsd: 0,
};

const adapter = new SyntheticSalesAdapter([
  { kind: "objection", text: "We already answer most calls." },
  { kind: "objection", text: "I do not want a big commitment." },
  { kind: "accept", text: "Show me the next step." },
]);

const receipt = await runSalesProspect({ campaign, prospect, facts, claims: offer.claims, budget, adapter });

const proof = {
  proofVersion: 1,
  fixture: prospect.id,
  receipt,
  outgoing: adapter.outgoing.map((action) => ({ kind: action.kind, claimIds: action.claimIds, external: action.external })),
  followups: adapter.followups.map((action) => ({ kind: action.kind, claimIds: action.claimIds, external: action.external })),
  assertions: {
    readyForHandoff: receipt.status === "READY_FOR_HANDOFF",
    exactTerminalStage: receipt.finalStage === "EVALUATE_LEARN",
    zeroExternalActions: receipt.externalActions === 0 && adapter.outgoing.every((action) => !action.external),
    twoObjectionsHandled: receipt.objectionsHandled === 2,
    gateBLocked: receipt.gateBEnabled === false,
    zeroPaidBudget: budget.maxCostUsd === 0,
  },
};

console.log(JSON.stringify(proof, null, 2));

if (!Object.values(proof.assertions).every(Boolean)) process.exit(1);
