import { describe, expect, test } from "bun:test";
import { transitionSalesStage } from "../../agent/sales/state-machine";

const policy = { gateBEnabled: false, killSwitch: false, budgetExhausted: false } as const;

describe("sales state machine", () => {
  test("walks the synthetic happy path without skipping gates", () => {
    const path = [
      ["CAMPAIGN_CONTRACT", "campaign_approved", "PROSPECT_INGEST"],
      ["PROSPECT_INGEST", "prospect_ingested", "ELIGIBILITY_GATE"],
      ["ELIGIBILITY_GATE", "eligible", "QUALIFY"],
      ["QUALIFY", "qualified", "PERSONALIZE"],
      ["PERSONALIZE", "personalized", "PITCH"],
      ["PITCH", "objection", "HANDLE_OBJECTION"],
      ["HANDLE_OBJECTION", "objection_handled", "CTA"],
      ["CTA", "cta_accepted", "BOOK_CHECKOUT_HANDOFF"],
      ["BOOK_CHECKOUT_HANDOFF", "handoff_recorded", "OUTCOME_CAPTURE"],
      ["OUTCOME_CAPTURE", "outcome_recorded", "EVALUATE_LEARN"],
    ] as const;

    for (const [current, event, next] of path) {
      expect(transitionSalesStage(current, event, policy)).toEqual({ ok: true, stage: next, reason: "OK" });
    }
  });

  test("blocks illegal skip transitions", () => {
    expect(transitionSalesStage("PROSPECT_INGEST", "qualified", policy)).toEqual({
      ok: false,
      stage: "PROSPECT_INGEST",
      reason: "ILLEGAL_TRANSITION",
    });
  });

  test("terminal fail-closed states cannot leave", () => {
    for (const stage of ["ELIGIBILITY_BLOCKED", "SUPPRESSED", "KILL_SWITCHED", "BUDGET_EXHAUSTED"] as const) {
      expect(transitionSalesStage(stage, "eligible", policy)).toEqual({ ok: false, stage, reason: "TERMINAL" });
    }
  });

  test("kill switch and exhausted budget override any normal transition", () => {
    expect(transitionSalesStage("PITCH", "objection", { ...policy, killSwitch: true }).stage).toBe("KILL_SWITCHED");
    expect(transitionSalesStage("PITCH", "objection", { ...policy, budgetExhausted: true }).stage).toBe("BUDGET_EXHAUSTED");
  });
});
