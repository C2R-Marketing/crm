import type { SalesAction, SalesChannelAdapter } from "./adapter";
import { validatePitchClaims } from "./claims";
import { buildReceptionistDemoSpec } from "./demo";
import { canDispatchExternalAction, evaluateEligibility } from "./policy";
import { transitionSalesStage } from "./state-machine";
import type {
  CampaignContract,
  ClaimRecord,
  ObservedFact,
  ProspectEnvelope,
  SalesBudget,
  SalesStage,
} from "./types";

export interface SalesRunReceipt {
  status: "READY_FOR_HANDOFF" | "FOLLOWUP_SCHEDULED" | "BLOCKED";
  reason: string;
  prospectId: string;
  campaignId: string;
  finalStage: SalesStage;
  actionCount: number;
  externalActions: number;
  retryCount: number;
  objectionsHandled: number;
  claimIds: string[];
  evidenceIds: string[];
  gateBEnabled: boolean;
  killSwitch: boolean;
}

interface RunInput {
  campaign: CampaignContract;
  prospect: ProspectEnvelope;
  facts: ObservedFact[];
  claims: ClaimRecord[];
  budget: SalesBudget;
  adapter: SalesChannelAdapter;
}

class RunBlocked extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

export async function runSalesProspect(input: RunInput): Promise<SalesRunReceipt> {
  const { campaign, prospect, facts, claims, adapter } = input;
  let stage: SalesStage = "CAMPAIGN_CONTRACT";
  let actionCount = 0;
  let externalActions = 0;
  let retryCount = 0;
  let objectionsHandled = 0;
  const usedClaimIds = new Set<string>();

  const receipt = (status: SalesRunReceipt["status"], reason: string): SalesRunReceipt => ({
    status,
    reason,
    prospectId: prospect.id,
    campaignId: campaign.id,
    finalStage: stage,
    actionCount,
    externalActions,
    retryCount,
    objectionsHandled,
    claimIds: [...usedClaimIds],
    evidenceIds: [...new Set([...prospect.evidenceIds, ...facts.map((fact) => fact.evidenceId)])],
    gateBEnabled: campaign.gateBEnabled,
    killSwitch: campaign.killSwitch,
  });

  if (campaign.killSwitch) return receipt("BLOCKED", "KILL_SWITCH");

  const eligibility = evaluateEligibility(prospect, campaign);
  if (!eligibility.eligible) return receipt("BLOCKED", eligibility.reason);

  const claimCheck = validatePitchClaims(campaign.approvedClaimIds, claims);
  if (!claimCheck.ok) return receipt("BLOCKED", "UNSUPPORTED_CLAIM");

  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  const demo = buildReceptionistDemoSpec(facts, campaign);
  const policy = () => ({
    gateBEnabled: campaign.gateBEnabled,
    killSwitch: campaign.killSwitch,
    budgetExhausted:
      input.budget.tokensUsed > input.budget.maxTokens || input.budget.costUsd > input.budget.maxCostUsd,
  });

  const move = (event: Parameters<typeof transitionSalesStage>[1]) => {
    const result = transitionSalesStage(stage, event, policy());
    if (!result.ok) throw new RunBlocked(result.reason);
    stage = result.stage;
  };

  const guardedSend = async (action: SalesAction) => {
    for (const claimId of action.claimIds) {
      if (!claimById.has(claimId) || !campaign.approvedClaimIds.includes(claimId)) {
        throw new RunBlocked("UNSUPPORTED_CLAIM");
      }
    }

    while (true) {
      const decision = canDispatchExternalAction({
        campaign,
        external: adapter.external || action.external,
        actionCount,
        retryCount,
      });
      if (!decision.allowed) throw new RunBlocked(decision.reason);
      try {
        await adapter.send({ ...action, external: adapter.external || action.external });
        actionCount += 1;
        if (adapter.external || action.external) externalActions += 1;
        for (const claimId of action.claimIds) usedClaimIds.add(claimId);
        return;
      } catch {
        retryCount += 1;
        if (retryCount > campaign.maxRetries) throw new RunBlocked("RETRY_CAP");
      }
    }
  };

  try {
    move("campaign_approved");
    move("prospect_ingested");
    move("eligible");
    move("qualified");
    move("personalized");

    const pitchClaims = campaign.approvedClaimIds;
    const pitchText = [
      `I prepared an AI receptionist demo for ${demo.businessName}.`,
      ...pitchClaims.map((claimId) => claimById.get(claimId)?.wording).filter((value): value is string => Boolean(value)),
      demo.unknownFallback,
    ].join(" ");

    await guardedSend({ kind: "pitch", text: pitchText, claimIds: pitchClaims, external: false });
    move("pitch_sent");

    while (true) {
      const turn = await adapter.receive();
      if (!turn) {
        move("cta_declined");
        const followup: SalesAction = {
          kind: "follow-up",
          text: "Synthetic follow-up parked; no external message was sent.",
          claimIds: [],
          external: false,
        };
        await adapter.scheduleFollowup(followup);
        move("followup_complete");
        move("outcome_recorded");
        await adapter.close();
        return receipt("FOLLOWUP_SCHEDULED", "NO_BUYER_TURN");
      }

      if (turn.kind === "opt-out") {
        await adapter.close();
        return receipt("BLOCKED", "OPTED_OUT");
      }

      if (turn.kind === "objection") {
        move("objection");
        const fallbackClaim = "receptionist.demo.available";
        const claimIds = campaign.approvedClaimIds.includes(fallbackClaim) ? [fallbackClaim] : [];
        await guardedSend({
          kind: "objection-response",
          text: claimIds.length
            ? `${claimById.get(fallbackClaim)?.wording ?? ""} The demo stays bounded to verified facts so you can evaluate the workflow without a production commitment.`
            : "The demo stays bounded to verified facts so you can evaluate the workflow without a production commitment.",
          claimIds,
          external: false,
        });
        objectionsHandled += 1;
        move("objection_handled");
        continue;
      }

      if (turn.kind === "accept") {
        move("cta_accepted");
        await guardedSend({
          kind: "handoff",
          text: "Synthetic handoff recorded. Gate B remains locked; no booking, checkout, call, or external outreach was executed.",
          claimIds: [],
          external: false,
        });
        move("handoff_recorded");
        move("outcome_recorded");
        await adapter.close();
        return receipt("READY_FOR_HANDOFF", "CTA_ACCEPTED_SYNTHETIC");
      }

      move("cta_declined");
      const followup: SalesAction = {
        kind: "follow-up",
        text: "Synthetic follow-up parked; no external message was sent.",
        claimIds: [],
        external: false,
      };
      await adapter.scheduleFollowup(followup);
      move("followup_complete");
      move("outcome_recorded");
      await adapter.close();
      return receipt("FOLLOWUP_SCHEDULED", "CTA_DECLINED");
    }
  } catch (error) {
    await adapter.close();
    if (error instanceof RunBlocked) return receipt("BLOCKED", error.reason);
    return receipt("BLOCKED", "UNEXPECTED_RUNNER_ERROR");
  }
}
