import { describe, expect, test } from "bun:test";
import { buildReceptionistDemoSpec } from "../../agent/sales/demo";
import type { CampaignContract, ObservedFact } from "../../agent/sales/types";

const campaign: CampaignContract = {
  id: "campaign-1",
  name: "Synthetic receptionist demo",
  allowedChannels: ["synthetic"],
  gateBEnabled: false,
  killSwitch: false,
  approvedClaimIds: ["receptionist.demo.available"],
  maxActionsPerProspect: 8,
  maxRetries: 1,
};

const facts: ObservedFact[] = [
  { field: "businessName", value: "Acme Roofing.test", evidenceId: "e1" },
  { field: "service", value: "Roof repair", evidenceId: "e2" },
  { field: "serviceArea", value: "Example County", evidenceId: "e3" },
  { field: "hours", value: "Mon-Fri 8am-5pm", evidenceId: "e4" },
  { field: "faq", value: "Emergency calls are captured for callback.", evidenceId: "e5" },
];

describe("prospect-specific receptionist demo", () => {
  test("builds only from observed facts and carries evidence ids", () => {
    const spec = buildReceptionistDemoSpec(facts, campaign);
    expect(spec.businessName).toBe("Acme Roofing.test");
    expect(spec.services).toEqual([{ value: "Roof repair", evidenceId: "e2" }]);
    expect(spec.serviceArea).toEqual({ value: "Example County", evidenceId: "e3" });
    expect(spec.hours).toEqual({ value: "Mon-Fri 8am-5pm", evidenceId: "e4" });
    expect(spec.faqs).toEqual([{ value: "Emergency calls are captured for callback.", evidenceId: "e5" }]);
    expect(spec.disclosure).toContain("AI receptionist demo");
  });

  test("missing facts become explicit unknowns rather than guesses", () => {
    const spec = buildReceptionistDemoSpec([{ field: "businessName", value: "Example.test", evidenceId: "e1" }], campaign);
    expect(spec.services).toEqual([]);
    expect(spec.serviceArea).toBeNull();
    expect(spec.hours).toBeNull();
    expect(spec.unknownFallback).toBeTruthy();
  });

  test("unsupported fields never enter the demo spec", () => {
    const spec = buildReceptionistDemoSpec(
      [...facts, { field: "price", value: "$99", evidenceId: "e6" }, { field: "unsupportedService", value: "Plumbing", evidenceId: "e7" }],
      campaign,
    );
    expect(JSON.stringify(spec)).not.toContain("$99");
    expect(JSON.stringify(spec)).not.toContain("Plumbing");
  });
});
