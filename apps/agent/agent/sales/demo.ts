import type { CampaignContract, EvidenceValue, ObservedFact, ReceptionistDemoSpec } from "./types";

function firstFact(facts: readonly ObservedFact[], field: string): EvidenceValue | null {
  const fact = facts.find((item) => item.field === field && item.value.trim() && item.evidenceId.trim());
  return fact ? { value: fact.value, evidenceId: fact.evidenceId } : null;
}

function allFacts(facts: readonly ObservedFact[], field: string): EvidenceValue[] {
  return facts
    .filter((item) => item.field === field && item.value.trim() && item.evidenceId.trim())
    .map((item) => ({ value: item.value, evidenceId: item.evidenceId }));
}

export function buildReceptionistDemoSpec(
  facts: readonly ObservedFact[],
  campaign: CampaignContract,
): ReceptionistDemoSpec {
  const businessName = firstFact(facts, "businessName");
  return {
    campaignId: campaign.id,
    businessName: businessName?.value ?? "this business",
    businessNameEvidenceId: businessName?.evidenceId ?? null,
    services: allFacts(facts, "service"),
    serviceArea: firstFact(facts, "serviceArea"),
    hours: firstFact(facts, "hours"),
    faqs: allFacts(facts, "faq"),
    leadCaptureFields: ["name", "callbackNumber", "requestSummary"],
    disclosure: "This is an AI receptionist demo built from observed business information; unknown details are not invented.",
    unknownFallback: "I don't have verified information for that yet. I can capture your question and request a human follow-up.",
  };
}
