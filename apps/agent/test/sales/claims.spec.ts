import { describe, expect, test } from "bun:test";
import { resolveApprovedClaim, validatePitchClaims } from "../../agent/sales/claims";
import type { ClaimRecord } from "../../agent/sales/types";

const registry: ClaimRecord[] = [
  {
    id: "receptionist.demo.available",
    wording: "We can build a prospect-specific AI receptionist demo before you decide whether to buy.",
    evidenceRef: "product-spec:receptionist-demo-v1",
    limitations: ["Demo only; production deployment is separate."],
    status: "APPROVED",
  },
  {
    id: "expired.claim",
    wording: "Old wording",
    evidenceRef: "fixture:expired",
    limitations: [],
    status: "APPROVED",
    expiresAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("product truth claims", () => {
  test("resolves only approved non-expired claims", () => {
    expect(resolveApprovedClaim("receptionist.demo.available", registry, new Date("2026-08-05T00:00:00Z"))?.id).toBe(
      "receptionist.demo.available",
    );
    expect(resolveApprovedClaim("expired.claim", registry, new Date("2026-08-05T00:00:00Z"))).toBeNull();
    expect(resolveApprovedClaim("missing", registry, new Date("2026-08-05T00:00:00Z"))).toBeNull();
  });

  test("fails the complete pitch when any claim is unsupported", () => {
    expect(validatePitchClaims(["receptionist.demo.available", "missing"], registry, new Date("2026-08-05T00:00:00Z"))).toEqual({
      ok: false,
      approved: ["receptionist.demo.available"],
      rejected: ["missing"],
    });
  });

  test("source-video revenue examples are not product claims", () => {
    expect(validatePitchClaims(["source.$500-per-day", "source.$20000-roofing-job"], registry, new Date())).toEqual({
      ok: false,
      approved: [],
      rejected: ["source.$500-per-day", "source.$20000-roofing-job"],
    });
  });
});
