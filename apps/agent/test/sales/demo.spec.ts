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
  { field: "businessName", value: "Example Organization.test", evidenceId: "e1" },
  { field: "offering", value: "Consultation", evidenceId: "e2" },
  { field: "location", value: "Example City", evidenceId: "e3" },
  { field: "hours", value: "Mon-Fri 8am-5pm", evidenceId: "e4" },
  { field: "faq", value: "Messages are routed to the appropriate team member.", evidenceId: "e5" },
];

describe("prospect-specific receptionist demo", () => {
  test("builds only from generic observed facts and carries evidence ids", () => {
    const spec = buildReceptionistDemoSpec(facts, campaign);
    expect(spec.businessName).toBe("Example Organization.test");
    expect(spec.offerings).toEqual([{ value: "Consultation", evidenceId: "e2" }]);
    expect(spec.locations).toEqual([{ value: "Example City", evidenceId: "e3" }]);
    expect(spec.hours).toEqual({ value: "Mon-Fri 8am-5pm", evidenceId: "e4" });
    expect(spec.faqs).toEqual([
      { value: "Messages are routed to the appropriate team member.", evidenceId: "e5" },
    ]);
    expect(spec.disclosure).toContain("AI receptionist demo");
  });

  test("legacy service vocabulary normalizes into the generic model", () => {
    const spec = buildReceptionistDemoSpec(
      [
        { field: "businessName", value: "Legacy Example.test", evidenceId: "l1" },
        { field: "service", value: "Legacy service", evidenceId: "l2" },
        { field: "serviceArea", value: "Legacy area", evidenceId: "l3" },
      ],
      campaign,
    );
    expect(spec.offerings).toEqual([{ value: "Legacy service", evidenceId: "l2" }]);
    expect(spec.locations).toEqual([{ value: "Legacy area", evidenceId: "l3" }]);
  });

  test("missing facts become explicit unknowns rather than guesses", () => {
    const spec = buildReceptionistDemoSpec(
      [{ field: "businessName", value: "Example.test", evidenceId: "e1" }],
      campaign,
    );
    expect(spec.offerings).toEqual([]);
    expect(spec.locations).toEqual([]);
    expect(spec.hours).toBeNull();
    expect(spec.unknownFallback).toBeTruthy();
  });

  test("unsupported fields never enter the demo spec", () => {
    const spec = buildReceptionistDemoSpec(
      [
        ...facts,
        { field: "price", value: "$99", evidenceId: "e6" },
        { field: "unsupportedOffering", value: "Unverified thing", evidenceId: "e7" },
      ],
      campaign,
    );
    expect(JSON.stringify(spec)).not.toContain("$99");
    expect(JSON.stringify(spec)).not.toContain("Unverified thing");
  });
});
