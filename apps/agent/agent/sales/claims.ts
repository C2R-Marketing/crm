import type { ClaimRecord } from "./types";

export function resolveApprovedClaim(
  claimId: string,
  registry: readonly ClaimRecord[],
  now = new Date(),
): ClaimRecord | null {
  const claim = registry.find((item) => item.id === claimId);
  if (!claim || claim.status !== "APPROVED") return null;
  if (claim.expiresAt && new Date(claim.expiresAt).getTime() <= now.getTime()) return null;
  if (!claim.evidenceRef.trim() || !claim.wording.trim()) return null;
  return claim;
}

export function validatePitchClaims(
  claimIds: readonly string[],
  registry: readonly ClaimRecord[],
  now = new Date(),
): { ok: boolean; approved: string[]; rejected: string[] } {
  const approved: string[] = [];
  const rejected: string[] = [];
  for (const claimId of claimIds) {
    if (resolveApprovedClaim(claimId, registry, now)) approved.push(claimId);
    else rejected.push(claimId);
  }
  return { ok: rejected.length === 0, approved, rejected };
}
