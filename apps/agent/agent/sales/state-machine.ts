import type { SalesEvent, SalesStage, SalesTransition } from "./types";

export interface TransitionPolicy {
  gateBEnabled: boolean;
  killSwitch: boolean;
  budgetExhausted: boolean;
}

const TERMINAL = new Set<SalesStage>([
  "EVALUATE_LEARN",
  "ELIGIBILITY_BLOCKED",
  "SUPPRESSED",
  "KILL_SWITCHED",
  "BUDGET_EXHAUSTED",
]);

const transitions: Partial<Record<SalesStage, Partial<Record<SalesEvent, SalesStage>>>> = {
  CAMPAIGN_CONTRACT: { campaign_approved: "PROSPECT_INGEST" },
  PROSPECT_INGEST: { prospect_ingested: "ELIGIBILITY_GATE" },
  ELIGIBILITY_GATE: {
    eligible: "QUALIFY",
    ineligible: "ELIGIBILITY_BLOCKED",
    suppressed: "SUPPRESSED",
  },
  QUALIFY: { qualified: "PERSONALIZE" },
  PERSONALIZE: { personalized: "PITCH" },
  PITCH: {
    pitch_sent: "CTA",
    objection: "HANDLE_OBJECTION",
  },
  HANDLE_OBJECTION: { objection_handled: "CTA" },
  CTA: {
    cta_accepted: "BOOK_CHECKOUT_HANDOFF",
    cta_declined: "FOLLOW_UP",
    followup_due: "FOLLOW_UP",
  },
  FOLLOW_UP: {
    followup_complete: "OUTCOME_CAPTURE",
    cta_accepted: "BOOK_CHECKOUT_HANDOFF",
  },
  BOOK_CHECKOUT_HANDOFF: { handoff_recorded: "OUTCOME_CAPTURE" },
  OUTCOME_CAPTURE: { outcome_recorded: "EVALUATE_LEARN" },
};

export function transitionSalesStage(
  current: SalesStage,
  event: SalesEvent,
  policy: TransitionPolicy,
): SalesTransition {
  if (TERMINAL.has(current)) return { ok: false, stage: current, reason: "TERMINAL" };
  if (policy.killSwitch) return { ok: false, stage: "KILL_SWITCHED", reason: "KILL_SWITCH" };
  if (policy.budgetExhausted) return { ok: false, stage: "BUDGET_EXHAUSTED", reason: "BUDGET_EXHAUSTED" };

  const next = transitions[current]?.[event];
  if (!next) return { ok: false, stage: current, reason: "ILLEGAL_TRANSITION" };
  return { ok: true, stage: next, reason: "OK" };
}
