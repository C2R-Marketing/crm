import type { CampaignContract, EvidenceValue, ObservedFact, ReceptionistDemoSpec } from "./types";

function firstFact(facts: readonly ObservedFact[], fields: readonly string[]): EvidenceValue | null {
  const fact = facts.find(
    (item) => fields.includes(item.field) && item.value.trim() && item.evidenceId.trim(),
  );
  return fact ? { value: fact.value, evidenceId: fact.evidenceId } : null;
}

function allFacts(facts: readonly ObservedFact[], fields: readonly string[]): EvidenceValue[] {
  const seen = new Set<string>();
  const values: EvidenceValue[] = [];
  for (const item of facts) {
    if (!fields.includes(item.field) || !item.value.trim() || !item.evidenceId.trim()) continue;
    const key = `${item.value.trim().toLocaleLowerCase()}\u0000${item.evidenceId.trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    values.push({ value: item.value, evidenceId: item.evidenceId });
  }
  return values;
}

export function buildReceptionistDemoSpec(
  facts: readonly ObservedFact[],
  campaign: CampaignContract,
): ReceptionistDemoSpec {
  const businessName = firstFact(facts, ["businessName"]);
  return {
    campaignId: campaign.id,
    businessName: businessName?.value ?? "this organization",
    businessNameEvidenceId: businessName?.evidenceId ?? null,
    // Canonical vocabulary is business-agnostic. Legacy service/serviceArea
    // evidence is normalized here so old packets remain usable without making
    // the product architecture contractor-specific.
    offerings: allFacts(facts, ["offering", "service"]),
    locations: allFacts(facts, ["location", "serviceArea"]),
    hours: firstFact(facts, ["hours"]),
    faqs: allFacts(facts, ["faq"]),
    leadCaptureFields: ["name", "callbackNumber", "requestSummary"],
    disclosure: "This is an AI receptionist demo built from observed organization information; unknown details are not invented.",
    unknownFallback: "I don't have verified information for that yet. I can capture your question and request a human follow-up.",
  };
}
