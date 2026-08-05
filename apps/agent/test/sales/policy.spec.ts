import { describe, expect, test } from "bun:test";
import { canDispatchExternalAction, consumeBudget, evaluateEligibility } from "../../agent/sales/policy";
import type { CampaignContract, ProspectEnvelope, SalesBudget } from "../../agent/sales/types";

const campaign: CampaignContract = {
  id: "campaign-1",
  name: "Synthetic receptionist demo",
  allowedChannels: ["synthetic", "email"],
  gateBEnabled: false,
  killSwitch: false,
  approvedClaimIds: ["receptionist.demo.available"],
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

describe("sales policy", () => {
  test("permits synthetic prospect and rejects unknown external consent", () => {
    expect(evaluateEligibility(prospect, campaign)).toEqual({ eligible: true, reason: "ELIGIBLE" });
    expect(evaluateEligibility({ ...prospect, channel: "email", consent: "UNKNOWN" }, campaign)).toEqual({
      eligible: false,
      reason: "CONSENT_UNKNOWN",
    });
  });

  test("suppression and opt-out fail closed", () => {
    expect(evaluateEligibility({ ...prospect, suppressed: true }, campaign).reason).toBe("SUPPRESSED");
    expect(evaluateEligibility({ ...prospect, optedOut: true }, campaign).reason).toBe("OPTED_OUT");
  });

  test("Gate A allows local/synthetic but blocks external actions", () => {
    expect(canDispatchExternalAction({ campaign, external: false, actionCount: 0, retryCount: 0 })).toEqual({
      allowed: true,
      reason: "LOCAL_OR_SYNTHETIC",
    });
    expect(canDispatchExternalAction({ campaign, external: true, actionCount: 0, retryCount: 0 })).toEqual({
      allowed: false,
      reason: "GATE_B_REQUIRED",
    });
  });

  test("kill switch and caps block even when Gate B is enabled", () => {
    const enabled = { ...campaign, gateBEnabled: true };
    expect(canDispatchExternalAction({ campaign: { ...enabled, killSwitch: true }, external: true, actionCount: 0, retryCount: 0 }).reason).toBe(
      "KILL_SWITCH",
    );
    expect(canDispatchExternalAction({ campaign: enabled, external: true, actionCount: 8, retryCount: 0 }).reason).toBe("ACTION_CAP");
    expect(canDispatchExternalAction({ campaign: enabled, external: true, actionCount: 0, retryCount: 2 }).reason).toBe("RETRY_CAP");
  });

  test("budget consumption never silently crosses a hard cap", () => {
    const budget: SalesBudget = { maxTokens: 100, maxCostUsd: 0, tokensUsed: 90, costUsd: 0 };
    expect(consumeBudget(budget, { tokens: 9, costUsd: 0 })).toEqual({
      ok: true,
      budget: { ...budget, tokensUsed: 99 },
      reason: "OK",
    });
    expect(consumeBudget(budget, { tokens: 11, costUsd: 0 }).reason).toBe("TOKEN_CAP");
    expect(consumeBudget(budget, { tokens: 0, costUsd: 0.001 }).reason).toBe("COST_CAP");
  });
});
