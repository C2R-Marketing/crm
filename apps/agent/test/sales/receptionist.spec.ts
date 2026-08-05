import { describe, expect, test } from "bun:test";
import { buildReceptionistDemoSpec } from "../../agent/sales/demo";
import { createReceptionistSession } from "../../agent/sales/receptionist";
import type { CampaignContract, ObservedFact } from "../../agent/sales/types";

const campaign: CampaignContract = {
  id: "campaign-1",
  name: "Synthetic receptionist demo",
  allowedChannels: ["synthetic"],
  gateBEnabled: false,
  killSwitch: false,
  approvedClaimIds: ["receptionist.demo.available", "receptionist.lead.capture"],
  maxActionsPerProspect: 8,
  maxRetries: 1,
};

const facts: ObservedFact[] = [
  { field: "businessName", value: "Northstar Roofing.test", evidenceId: "e1" },
  { field: "service", value: "Roof repair", evidenceId: "e2" },
  { field: "service", value: "Roof inspection", evidenceId: "e3" },
  { field: "serviceArea", value: "Example County", evidenceId: "e4" },
  { field: "hours", value: "Mon-Fri 8am-5pm", evidenceId: "e5" },
  { field: "faq", value: "Emergency requests are captured for callback.", evidenceId: "e6" },
];

function session() {
  return createReceptionistSession(buildReceptionistDemoSpec(facts, campaign));
}

describe("bounded receptionist runtime", () => {
  test("answers service, hours, and area questions only from evidence-backed demo facts", () => {
    const s = session();
    expect(s.respond({ kind: "services" })).toMatchObject({
      kind: "answer",
      text: "Verified services: Roof repair; Roof inspection.",
      evidenceIds: ["e2", "e3"],
    });
    expect(s.respond({ kind: "hours" })).toMatchObject({
      kind: "answer",
      text: "Verified hours: Mon-Fri 8am-5pm.",
      evidenceIds: ["e5"],
    });
    expect(s.respond({ kind: "service-area" })).toMatchObject({
      kind: "answer",
      text: "Verified service area: Example County.",
      evidenceIds: ["e4"],
    });
  });

  test("unknown price or unsupported service is never invented", () => {
    const s = session();
    const price = s.respond({ kind: "price" });
    expect(price.kind).toBe("unknown");
    expect(price.text).toContain("verified information");
    expect(price.text).not.toMatch(/\$\d/);

    const unsupported = s.respond({ kind: "service", value: "Plumbing" });
    expect(unsupported.kind).toBe("unknown");
    expect(unsupported.text).not.toContain("yes");
    expect(unsupported.evidenceIds).toEqual([]);
  });

  test("known service inquiry cites only the exact matching fact", () => {
    const s = session();
    expect(s.respond({ kind: "service", value: "roof repair" })).toEqual({
      kind: "answer",
      text: "Yes. Roof repair is in the verified service list.",
      evidenceIds: ["e2"],
    });
  });

  test("captures a bounded callback lead without adding fields", () => {
    const s = session();
    const result = s.captureLead({
      name: "Casey Example",
      callbackNumber: "+1 555 010 0200",
      requestSummary: "Leak above the garage",
      extra: "must be dropped",
    } as never);

    expect(result).toEqual({
      name: "Casey Example",
      callbackNumber: "+1 555 010 0200",
      requestSummary: "Leak above the garage",
    });
    expect(JSON.stringify(result)).not.toContain("extra");
  });

  test("missing required lead values fail closed", () => {
    const s = session();
    expect(() => s.captureLead({ name: "", callbackNumber: "555", requestSummary: "roof leak" })).toThrow(
      "lead name is required",
    );
    expect(() => s.captureLead({ name: "Casey", callbackNumber: "", requestSummary: "roof leak" })).toThrow(
      "callback number is required",
    );
    expect(() => s.captureLead({ name: "Casey", callbackNumber: "555", requestSummary: "" })).toThrow(
      "request summary is required",
    );
  });
});
