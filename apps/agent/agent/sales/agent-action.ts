import { randomUUID } from "node:crypto";
import { db } from "@crm/db";
import offerConfig from "./config/receptionist-offer.v1.json";
import { validatePitchClaims } from "./claims";
import { getSalesSessionContext } from "./store";
import { transitionSalesStage } from "./state-machine";
import type { ClaimRecord, SalesStage } from "./types";
import type { SalesAdapterIdentity } from "./adapter";

export type SalesAgentDecision =
  | "mark_qualified"
  | "mark_personalized"
  | "present_offer"
  | "handle_objection"
  | "accept_cta"
  | "decline_cta"
  | "complete_followup"
  | "record_handoff"
  | "record_outcome";

export type SalesAgentDecisionResult = {
  ok: boolean;
  reason: string;
  duplicate: boolean;
  prospectId: string;
  campaignId?: string;
  stageBefore?: SalesStage;
  stageAfter?: SalesStage;
  action?: string;
  claimIds: string[];
  safeMessage?: string;
  externalAction: false;
  identity: SalesAdapterIdentity;
};

type DecisionPlan = {
  stageBefore: SalesStage;
  stageAfter: SalesStage;
  action: string;
  claimIds: string[];
  safeMessage: string;
  followupDelayMs?: number;
};

const offerClaims = offerConfig.claims as ClaimRecord[];

function contractClaimIds(contract: unknown): string[] {
  if (!contract || typeof contract !== "object") return [];
  const value = (contract as { approvedClaimIds?: unknown }).approvedClaimIds;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

function contractMaxActions(contract: unknown): number {
  if (!contract || typeof contract !== "object") return 0;
  const value = (contract as { maxActionsPerProspect?: unknown }).maxActionsPerProspect;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function applyEvents(stage: SalesStage, events: Parameters<typeof transitionSalesStage>[1][]): SalesStage | null {
  let current = stage;
  for (const event of events) {
    const result = transitionSalesStage(current, event, {
      gateBEnabled: false,
      killSwitch: false,
      budgetExhausted: false,
    });
    if (!result.ok) return null;
    current = result.stage;
  }
  return current;
}

function buildPlan(
  stage: SalesStage,
  decision: SalesAgentDecision,
  approvedClaimIds: string[],
): DecisionPlan | null {
  const plans: Record<SalesAgentDecision, { events: Parameters<typeof transitionSalesStage>[1][]; action: string; claims?: string[]; message: string; followupDelayMs?: number }> = {
    mark_qualified: {
      events: ["qualified"],
      action: "qualification-recorded",
      message: "Qualification recorded from the durable prospect evidence.",
    },
    mark_personalized: {
      events: ["personalized"],
      action: "personalization-recorded",
      message: "Personalization is ready from verified prospect facts; unsupported details remain unknown.",
    },
    present_offer: {
      events: ["pitch_sent"],
      action: "pitch",
      claims: approvedClaimIds,
      message: "",
    },
    handle_objection: {
      events: ["objection", "objection_handled"],
      action: "objection-response",
      claims: approvedClaimIds.includes("receptionist.demo.available") ? ["receptionist.demo.available"] : [],
      message: "The demo is deliberately bounded: it can be evaluated before any production commitment, and unknown business details are not invented.",
    },
    accept_cta: {
      events: ["cta_accepted"],
      action: "cta-accepted",
      message: "The synthetic CTA was accepted. A handoff may be recorded, but Gate B still blocks any real booking, checkout, call, message, deployment, or spend.",
    },
    decline_cta: {
      events: ["cta_declined"],
      action: "follow-up-scheduled",
      message: "A bounded follow-up was scheduled in durable CRM state. No external message was sent.",
      followupDelayMs: 60_000,
    },
    complete_followup: {
      events: ["followup_complete"],
      action: "follow-up-complete",
      message: "The bounded follow-up step completed without an external action.",
    },
    record_handoff: {
      events: ["handoff_recorded"],
      action: "handoff-recorded",
      message: "The synthetic handoff was recorded. Gate B remains required before any real downstream mutation.",
    },
    record_outcome: {
      events: ["outcome_recorded"],
      action: "outcome-recorded",
      message: "The bounded sales outcome was captured for deterministic evaluation.",
    },
  };

  const candidate = plans[decision];
  const stageAfter = applyEvents(stage, candidate.events);
  if (!stageAfter) return null;

  const claimIds = candidate.claims ?? [];
  let safeMessage = candidate.message;
  if (decision === "present_offer") {
    const claimCheck = validatePitchClaims(claimIds, offerClaims);
    if (!claimIds.length || !claimCheck.ok) return null;
    const wording = claimIds
      .map((claimId) => offerClaims.find((claim) => claim.id === claimId)?.wording)
      .filter((value): value is string => Boolean(value));
    safeMessage = `${wording.join(" ")} This demonstration uses only verified prospect facts; unknown details are left unknown.`;
  } else if (claimIds.length && !validatePitchClaims(claimIds, offerClaims).ok) {
    return null;
  }

  return {
    stageBefore: stage,
    stageAfter,
    action: candidate.action,
    claimIds,
    safeMessage,
    followupDelayMs: candidate.followupDelayMs,
  };
}

export async function executeSalesAgentDecision(input: {
  prospectId: string;
  decision: SalesAgentDecision;
  idempotencyKey: string;
  identity: SalesAdapterIdentity;
}): Promise<SalesAgentDecisionResult> {
  const base = {
    prospectId: input.prospectId,
    claimIds: [] as string[],
    externalAction: false as const,
    identity: { ...input.identity },
  };

  const existing = await db.$queryRaw<Array<{ campaignId: string; stageBefore: SalesStage; stageAfter: SalesStage; action: string; claimIds: unknown }>>`
    SELECT "campaignId", "stageBefore", "stageAfter", action, "claimIds"
    FROM "salesReceipt"
    WHERE "idempotencyKey" = ${input.idempotencyKey}
    LIMIT 1
  `;
  if (existing[0]) {
    return {
      ...base,
      ok: true,
      reason: "IDEMPOTENT_REPLAY",
      duplicate: true,
      campaignId: existing[0].campaignId,
      stageBefore: existing[0].stageBefore,
      stageAfter: existing[0].stageAfter,
      action: existing[0].action,
      claimIds: Array.isArray(existing[0].claimIds) ? existing[0].claimIds.filter((item): item is string => typeof item === "string") : [],
    };
  }

  const context = await getSalesSessionContext(input.prospectId);
  if (!context) return { ...base, ok: false, reason: "PROSPECT_NOT_FOUND", duplicate: false };
  if (context.killSwitch) return { ...base, ok: false, reason: "KILL_SWITCH", duplicate: false, campaignId: context.campaignId };
  if (context.suppressed) return { ...base, ok: false, reason: "SUPPRESSED", duplicate: false, campaignId: context.campaignId };
  if (context.optedOut) return { ...base, ok: false, reason: "OPTED_OUT", duplicate: false, campaignId: context.campaignId };

  const maxActions = contractMaxActions(context.contract);
  if (!maxActions) {
    return { ...base, ok: false, reason: "ACTION_CAP_UNCONFIGURED", duplicate: false, campaignId: context.campaignId };
  }
  const actionCountRows = await db.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "salesReceipt"
    WHERE "prospectId" = ${input.prospectId} AND tool = 'sales_advance'
  `;
  if (Number(actionCountRows[0]?.count ?? 0n) >= maxActions) {
    return { ...base, ok: false, reason: "ACTION_CAP", duplicate: false, campaignId: context.campaignId, stageBefore: context.currentStage };
  }

  const approvedClaimIds = contractClaimIds(context.contract);
  const plan = buildPlan(context.currentStage, input.decision, approvedClaimIds);
  if (!plan) {
    return {
      ...base,
      ok: false,
      reason: input.decision === "present_offer" && context.currentStage === "PITCH" ? "UNSUPPORTED_CLAIM" : "ILLEGAL_TRANSITION",
      duplicate: false,
      campaignId: context.campaignId,
      stageBefore: context.currentStage,
    };
  }

  const result = await db.$transaction(async (tx) => {
    const replay = await tx.$queryRaw<Array<{ campaignId: string; stageBefore: SalesStage; stageAfter: SalesStage; action: string; claimIds: unknown }>>`
      SELECT "campaignId", "stageBefore", "stageAfter", action, "claimIds"
      FROM "salesReceipt"
      WHERE "idempotencyKey" = ${input.idempotencyKey}
      LIMIT 1
    `;
    if (replay[0]) return { duplicate: true as const, replay: replay[0] };

    const countRows = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "salesReceipt"
      WHERE "prospectId" = ${input.prospectId} AND tool = 'sales_advance'
    `;
    if (Number(countRows[0]?.count ?? 0n) >= maxActions) {
      return { duplicate: false as const, blocked: true as const, reason: "ACTION_CAP" as const };
    }

    const changed = await tx.$executeRaw`
      UPDATE "salesProspect" AS p
      SET "currentStage" = ${plan.stageAfter},
          "nextActionAt" = ${plan.followupDelayMs ? new Date(Date.now() + plan.followupDelayMs) : null},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE p.id = ${input.prospectId}
        AND p."currentStage" = ${plan.stageBefore}
        AND p.suppressed = false
        AND p."optedOut" = false
        AND EXISTS (
          SELECT 1 FROM "salesCampaign" c
          WHERE c.id = p."campaignId" AND c."killSwitch" = false
        )
    `;
    if (changed !== 1) return { duplicate: false as const, blocked: true as const, reason: "STATE_GUARD" as const };

    const receiptId = randomUUID();
    const claimIds = JSON.stringify(plan.claimIds);
    const budget = JSON.stringify({ maxActionsPerProspect: maxActions, maxCostUsd: 0, externalAction: false, identityStatus: input.identity.identityStatus });
    await tx.$executeRaw`
      INSERT INTO "salesReceipt" (
        id, "idempotencyKey", "runId", "campaignId", "prospectId", "stageBefore", "stageAfter",
        provider, model, tool, action, "evidenceIds", "claimIds", budget, "externalAction",
        outcome, "retryCount"
      )
      VALUES (
        ${receiptId}, ${input.idempotencyKey}, ${input.idempotencyKey}, ${context.campaignId}, ${input.prospectId},
        ${plan.stageBefore}, ${plan.stageAfter}, ${input.identity.provider}, ${input.identity.model}, ${input.identity.tool},
        ${plan.action}, '[]'::jsonb, ${claimIds}::jsonb, ${budget}::jsonb, false, ${plan.safeMessage}, 0
      )
    `;

    if (plan.followupDelayMs) {
      const kind = "sales:advance";
      const dueAt = new Date(Date.now() + plan.followupDelayMs);
      const reason = "Continue the bounded follow-up from durable sales state.";
      const current = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "agentTask"
        WHERE "salesProspectId" = ${input.prospectId} AND kind = ${kind} AND "finishedAt" IS NULL
        LIMIT 1
      `;
      if (current[0]) {
        await tx.$executeRaw`
          UPDATE "agentTask" SET "dueAt" = ${dueAt}, reason = ${reason}, budget = 2
          WHERE id = ${current[0].id}
        `;
      } else {
        await tx.$executeRaw`
          INSERT INTO "agentTask" (id, "salesProspectId", kind, reason, "dueAt", priority, budget)
          VALUES (${randomUUID()}, ${input.prospectId}, ${kind}, ${reason}, ${dueAt}, 50, 2)
        `;
      }
    }

    return { duplicate: false as const, blocked: false as const };
  });

  if (result.duplicate && "replay" in result) {
    return {
      ...base,
      ok: true,
      reason: "IDEMPOTENT_REPLAY",
      duplicate: true,
      campaignId: result.replay.campaignId,
      stageBefore: result.replay.stageBefore,
      stageAfter: result.replay.stageAfter,
      action: result.replay.action,
      claimIds: Array.isArray(result.replay.claimIds) ? result.replay.claimIds.filter((item): item is string => typeof item === "string") : [],
    };
  }
  if ("blocked" in result && result.blocked) {
    if ("reason" in result && result.reason === "ACTION_CAP") {
      return { ...base, ok: false, reason: "ACTION_CAP", duplicate: false, campaignId: context.campaignId, stageBefore: context.currentStage };
    }
    const latest = await getSalesSessionContext(input.prospectId);
    const reason = latest?.killSwitch ? "KILL_SWITCH" : latest?.suppressed ? "SUPPRESSED" : latest?.optedOut ? "OPTED_OUT" : "STALE_STATE";
    return { ...base, ok: false, reason, duplicate: false, campaignId: context.campaignId, stageBefore: context.currentStage };
  }

  return {
    ...base,
    ok: true,
    reason: "OK",
    duplicate: false,
    campaignId: context.campaignId,
    stageBefore: plan.stageBefore,
    stageAfter: plan.stageAfter,
    action: plan.action,
    claimIds: plan.claimIds,
    safeMessage: plan.safeMessage,
  };
}
