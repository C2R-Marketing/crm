import { defineTool } from "eve/tools";
import { z } from "zod";
import { executeSalesAgentDecision } from "../sales/agent-action";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default defineTool({
  description:
    "Advance exactly one bounded step for the durable sales prospect bound to this Eve session. Inputs are decisions, never arbitrary customer-facing copy. The tool enforces state transitions, product-truth claims, idempotency, Gate B, kill switch, and durable receipts.",
  inputSchema: z.object({
    decision: z.enum([
      "mark_qualified",
      "mark_personalized",
      "present_offer",
      "handle_objection",
      "accept_cta",
      "decline_cta",
      "complete_followup",
      "record_handoff",
      "record_outcome",
    ]),
    sequence: z.number().int().min(1).max(8).describe("Monotonic action number within this bounded sales session; max 8."),
  }),
  async execute({ decision, sequence }, ctx) {
    const prospectId = asString(ctx.session.auth.current?.attributes?.salesProspectId);
    if (!prospectId) {
      return { ok: false, reason: "SESSION_NOT_BOUND_TO_SALES_PROSPECT" };
    }

    return executeSalesAgentDecision({
      prospectId,
      decision,
      idempotencyKey: `${ctx.session.id}:${sequence}:${decision}`,
      identity: {
        provider: "eve",
        model: "unverified",
        tool: "sales_advance",
        identityStatus: "UNVERIFIED",
      },
    });
  },
});
