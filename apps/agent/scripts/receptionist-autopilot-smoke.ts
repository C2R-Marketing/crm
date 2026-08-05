import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { SyntheticSalesAdapter } from "../agent/sales/synthetic-adapter";
import { runSalesProspect } from "../agent/sales/runner";
import type { CampaignContract, ClaimRecord, ObservedFact, ProspectEnvelope, SalesBudget } from "../agent/sales/types";

const here = dirname(fileURLToPath(import.meta.url));
const configDir = resolve(here, "../agent/sales/config");
const offer = JSON.parse(readFileSync(resolve(configDir, "receptionist-offer.v1.json"), "utf8")) as { claims: ClaimRecord[] };
const campaignConfig = JSON.parse(readFileSync(resolve(configDir, "receptionist-campaign.gate-a.v1.json"), "utf8")) as {
  id: string;
  name: string;
  allowedChannels: CampaignContract["allowedChannels"];
  gateBEnabled: boolean;
  killSwitch: boolean;
  approvedClaimIds: string[];
  caps: {
    maxActionsPerProspect: number;
    maxRetries: number;
    maxTokensPerProspect: number;
    maxCostUsdPerProspect: number;
  };
};

const campaign: CampaignContract = {
  id: campaignConfig.id,
  name: campaignConfig.name,
  allowedChannels: campaignConfig.allowedChannels,
  gateBEnabled: campaignConfig.gateBEnabled,
  killSwitch: campaignConfig.killSwitch,
  approvedClaimIds: campaignConfig.approvedClaimIds,
  maxActionsPerProspect: campaignConfig.caps.maxActionsPerProspect,
  maxRetries: campaignConfig.caps.maxRetries,
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
  maxTokens: campaignConfig.caps.maxTokensPerProspect,
  maxCostUsd: campaignConfig.caps.maxCostUsdPerProspect,
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
  proofVersion: 2,
  fixture: prospect.id,
  campaignContract: campaignConfig.id,
  receipt,
  outgoing: adapter.outgoing.map((action) => ({ kind: action.kind, claimIds: action.claimIds, external: action.external })),
  followups: adapter.followups.map((action) => ({ kind: action.kind, claimIds: action.claimIds, external: action.external })),
  assertions: {
    readyForHandoff: receipt.status === "READY_FOR_HANDOFF",
    exactTerminalStage: receipt.finalStage === "EVALUATE_LEARN",
    zeroExternalActions: receipt.externalActions === 0 && adapter.outgoing.every((action) => !action.external),
    twoObjectionsHandled: receipt.objectionsHandled === 2,
    gateBLocked: receipt.gateBEnabled === false,
    zeroPaidBudget: receipt.budget.maxCostUsd === 0,
    identityAttested: receipt.adapterIdentity.identityStatus === "VERIFIED",
    exactSyntheticProvider: receipt.adapterIdentity.provider === "synthetic" && receipt.adapterIdentity.model === "deterministic-script",
    claimsPinnedToCampaign: receipt.claimIds.every((claimId) => campaign.approvedClaimIds.includes(claimId)),
  },
};

console.log(JSON.stringify(proof, null, 2));

if (!Object.values(proof.assertions).every(Boolean)) process.exit(1);
