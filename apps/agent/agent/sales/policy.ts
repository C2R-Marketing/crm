import type { CampaignContract, ProspectEnvelope, SalesBudget } from "./types";

export type EligibilityReason =
  | "ELIGIBLE"
  | "MALFORMED_PROSPECT"
  | "MISSING_PROVENANCE"
  | "SUPPRESSED"
  | "OPTED_OUT"
  | "CHANNEL_NOT_ALLOWED"
  | "CONSENT_UNKNOWN";

export function evaluateEligibility(
  prospect: ProspectEnvelope,
  campaign: CampaignContract,
): { eligible: boolean; reason: EligibilityReason } {
  if (!prospect.id?.trim() || !prospect.companyName?.trim()) {
    return { eligible: false, reason: "MALFORMED_PROSPECT" };
  }
  if (!prospect.evidenceIds?.some((evidenceId) => evidenceId.trim())) {
    return { eligible: false, reason: "MISSING_PROVENANCE" };
  }
  if (prospect.suppressed) return { eligible: false, reason: "SUPPRESSED" };
  if (prospect.optedOut) return { eligible: false, reason: "OPTED_OUT" };
  if (!campaign.allowedChannels.includes(prospect.channel)) {
    return { eligible: false, reason: "CHANNEL_NOT_ALLOWED" };
  }
  if (prospect.channel !== "synthetic" && prospect.consent !== "EXPLICIT") {
    return { eligible: false, reason: "CONSENT_UNKNOWN" };
  }
  return { eligible: true, reason: "ELIGIBLE" };
}

export type DispatchReason =
  | "LOCAL_OR_SYNTHETIC"
  | "ALLOWED"
  | "GATE_B_REQUIRED"
  | "KILL_SWITCH"
  | "ACTION_CAP"
  | "RETRY_CAP";

export function canDispatchExternalAction(context: {
  campaign: CampaignContract;
  external: boolean;
  actionCount: number;
  retryCount: number;
}): { allowed: boolean; reason: DispatchReason } {
  const { campaign, external, actionCount, retryCount } = context;
  if (campaign.killSwitch) return { allowed: false, reason: "KILL_SWITCH" };
  if (actionCount >= campaign.maxActionsPerProspect) return { allowed: false, reason: "ACTION_CAP" };
  if (retryCount > campaign.maxRetries) return { allowed: false, reason: "RETRY_CAP" };
  if (!external) return { allowed: true, reason: "LOCAL_OR_SYNTHETIC" };
  if (!campaign.gateBEnabled) return { allowed: false, reason: "GATE_B_REQUIRED" };
  return { allowed: true, reason: "ALLOWED" };
}

export function consumeBudget(
  budget: SalesBudget,
  usage: { tokens: number; costUsd: number },
): { ok: boolean; budget: SalesBudget; reason: "OK" | "TOKEN_CAP" | "COST_CAP" } {
  const next: SalesBudget = {
    ...budget,
    tokensUsed: budget.tokensUsed + Math.max(0, usage.tokens),
    costUsd: budget.costUsd + Math.max(0, usage.costUsd),
  };
  if (next.costUsd > budget.maxCostUsd) return { ok: false, budget, reason: "COST_CAP" };
  if (next.tokensUsed > budget.maxTokens) return { ok: false, budget, reason: "TOKEN_CAP" };
  return { ok: true, budget: next, reason: "OK" };
}
