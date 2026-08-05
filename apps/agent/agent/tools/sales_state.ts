import { defineTool } from "eve/tools";
import { z } from "zod";
import offerConfig from "../sales/config/receptionist-offer.v1.json";
import { getSalesSessionContext } from "../sales/store";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function approvedClaimIds(contract: unknown): string[] {
  if (!contract || typeof contract !== "object") return [];
  const value = (contract as { approvedClaimIds?: unknown }).approvedClaimIds;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function evidenceIds(provenance: unknown): string[] {
  if (!provenance || typeof provenance !== "object") return [];
  const value = (provenance as { evidenceIds?: unknown }).evidenceIds;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

export default defineTool({
  description:
    "Read the durable sales campaign/prospect state for the sales prospect bound to this Eve session. Use this before deciding the next sales action. It never returns secret values.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const prospectId = asString(ctx.session.auth.current?.attributes?.salesProspectId);
    if (!prospectId) {
      return { ok: false, reason: "SESSION_NOT_BOUND_TO_SALES_PROSPECT" };
    }

    const state = await getSalesSessionContext(prospectId);
    if (!state) return { ok: false, reason: "PROSPECT_NOT_FOUND", prospectId };

    const allowed = approvedClaimIds(state.contract);
    const claims = offerConfig.claims
      .filter((claim) => allowed.includes(claim.id) && claim.status === "APPROVED")
      .map((claim) => ({
        id: claim.id,
        wording: claim.wording,
        evidenceRef: claim.evidenceRef,
        limitations: claim.limitations,
      }));

    return {
      ok: true,
      prospectId: state.prospectId,
      campaignId: state.campaignId,
      campaignName: state.campaignName,
      currentStage: state.currentStage,
      consentBasis: state.consentBasis,
      suppressed: state.suppressed,
      optedOut: state.optedOut,
      gateBEnabled: state.gateBEnabled,
      killSwitch: state.killSwitch,
      nextActionAt: state.nextActionAt,
      evidenceIds: evidenceIds(state.provenance),
      approvedClaims: claims,
      externalActionPolicy: state.gateBEnabled
        ? "Gate B enabled; downstream external-action tools must still re-check consent, claims, budgets, and kill switch."
        : "LOCKED: no real email, message, call, booking, checkout, deployment, credential mutation, or spend.",
    };
  },
});
