import { randomUUID } from "node:crypto";
import { db } from "@crm/db";
import campaignConfig from "./config/receptionist-campaign.gate-a.v1.json";
import { scheduleSalesTask } from "./store";
import type { ObservedFact } from "./types";

export type GateASeedInput = {
  prospectId: string;
  businessName: string;
  website: string;
  observedFacts: ObservedFact[];
};

export type GateASeedReceipt = {
  version: 1;
  campaignId: string;
  prospectId: string;
  taskId: string;
  currentStage: "QUALIFY";
  gateBEnabled: false;
  maxCostUsd: 0;
  syntheticOnly: true;
  externalActions: 0;
};

function assertSyntheticWebsite(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Gate A requires a valid synthetic website URL");
  }
  if (!url.hostname.toLowerCase().endsWith(".test")) {
    throw new Error("Gate A requires a reserved .test synthetic website");
  }
}

function assertEvidence(facts: ObservedFact[]): void {
  if (!facts.length) throw new Error("Gate A requires at least one observed fact");
  if (facts.some((fact) => !fact.field?.trim() || !fact.value?.trim())) {
    throw new Error("every observed fact requires a field and value");
  }
  if (facts.some((fact) => !fact.evidenceId?.trim())) {
    throw new Error("every observed fact requires an evidenceId");
  }
}

export async function seedGateAReceptionistRun(input: GateASeedInput): Promise<GateASeedReceipt> {
  if (!input.prospectId.trim()) throw new Error("prospectId is required");
  if (!input.businessName.trim()) throw new Error("businessName is required");
  assertSyntheticWebsite(input.website);
  assertEvidence(input.observedFacts);

  const campaignId = campaignConfig.id;
  const contract = JSON.stringify({
    offerId: campaignConfig.offerId,
    allowedChannels: campaignConfig.allowedChannels,
    approvedClaimIds: campaignConfig.approvedClaimIds,
    maxActionsPerProspect: campaignConfig.caps.maxActionsPerProspect,
    maxRetries: campaignConfig.caps.maxRetries,
    maxTokensPerProspect: campaignConfig.caps.maxTokensPerProspect,
    maxCostUsdPerProspect: campaignConfig.caps.maxCostUsdPerProspect,
    stopCriteria: campaignConfig.stopCriteria,
  });
  const provenance = JSON.stringify({
    source: "gate-a-synthetic-fixture",
    website: input.website,
    businessName: input.businessName,
    observedFacts: input.observedFacts,
    evidenceIds: input.observedFacts.map((fact) => fact.evidenceId),
  });

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "salesCampaign" (id, name, status, "gateBEnabled", "killSwitch", contract)
      VALUES (${campaignId}, ${campaignConfig.name}, 'GATE_A', false, false, ${contract}::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        status = 'GATE_A',
        "gateBEnabled" = false,
        "killSwitch" = false,
        contract = EXCLUDED.contract,
        "updatedAt" = CURRENT_TIMESTAMP
    `;

    await tx.$executeRaw`
      INSERT INTO "salesProspect" (
        id, "campaignId", provenance, "consentBasis", suppressed, "optedOut", "currentStage"
      )
      VALUES (${input.prospectId}, ${campaignId}, ${provenance}::jsonb, 'NOT_REQUIRED_SYNTHETIC', false, false, 'QUALIFY')
      ON CONFLICT (id) DO UPDATE SET
        "campaignId" = EXCLUDED."campaignId",
        provenance = EXCLUDED.provenance,
        "consentBasis" = 'NOT_REQUIRED_SYNTHETIC',
        suppressed = false,
        "optedOut" = false,
        "updatedAt" = CURRENT_TIMESTAMP
    `;

    const idempotencyKey = `${input.prospectId}:gate-a-deterministic-gates`;
    const evidenceIds = JSON.stringify(input.observedFacts.map((fact) => fact.evidenceId));
    const budget = JSON.stringify({ maxCostUsd: 0, externalAction: false, gateBEnabled: false });
    await tx.$executeRaw`
      INSERT INTO "salesReceipt" (
        id, "idempotencyKey", "runId", "campaignId", "prospectId", "stageBefore", "stageAfter",
        provider, model, tool, action, "evidenceIds", "claimIds", budget, "externalAction", outcome, "retryCount"
      )
      VALUES (
        ${randomUUID()}, ${idempotencyKey}, ${input.prospectId}, ${campaignId}, ${input.prospectId},
        'CAMPAIGN_CONTRACT', 'QUALIFY', 'deterministic', 'none', 'gate-a-seed', 'eligibility-gates',
        ${evidenceIds}::jsonb, '[]'::jsonb, ${budget}::jsonb, false,
        'Campaign contract, synthetic provenance, and Gate-A eligibility passed deterministically.', 0
      )
      ON CONFLICT ("idempotencyKey") DO NOTHING
    `;
  });

  const task = await scheduleSalesTask({
    salesProspectId: input.prospectId,
    kind: "advance",
    reason: "Advance exactly one bounded Gate A receptionist sales stage from durable state.",
    dueAt: new Date(),
    priority: 100,
    budget: 2,
  });

  return {
    version: 1,
    campaignId,
    prospectId: input.prospectId,
    taskId: task.id,
    currentStage: "QUALIFY",
    gateBEnabled: false,
    maxCostUsd: 0,
    syntheticOnly: true,
    externalActions: 0,
  };
}
