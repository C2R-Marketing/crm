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
  { field: "businessName", value: "Example Organization.test", evidenceId: "e1" },
  { field: "offering", value: "Consultation", evidenceId: "e2" },
  { field: "offering", value: "Appointment", evidenceId: "e3" },
  { field: "location", value: "Example City", evidenceId: "e4" },
  { field: "hours", value: "Mon-Fri 8am-5pm", evidenceId: "e5" },
  { field: "faq", value: "Messages are captured for human follow-up.", evidenceId: "e6" },
];

function session() {
  return createReceptionistSession(buildReceptionistDemoSpec(facts, campaign));
}

describe("bounded receptionist runtime", () => {
  test("answers offering, hours, and location questions only from evidence-backed facts", () => {
    const s = session();
    expect(s.respond({ kind: "offerings" })).toMatchObject({
      kind: "answer",
      text: "Verified offerings: Consultation; Appointment.",
      evidenceIds: ["e2", "e3"],
    });
    expect(s.respond({ kind: "hours" })).toMatchObject({
      kind: "answer",
      text: "Verified hours: Mon-Fri 8am-5pm.",
      evidenceIds: ["e5"],
    });
    expect(s.respond({ kind: "location" })).toMatchObject({
      kind: "answer",
      text: "Verified location or service area: Example City.",
      evidenceIds: ["e4"],
    });
  });

  test("unknown price or unsupported offering is never invented", () => {
    const s = session();
    const price = s.respond({ kind: "price" });
    expect(price.kind).toBe("unknown");
    expect(price.text).toContain("verified information");
    expect(price.text).not.toMatch(/\$\d/);

    const unsupported = s.respond({ kind: "offering", value: "Unverified offering" });
    expect(unsupported.kind).toBe("unknown");
    expect(unsupported.text).not.toContain("yes");
    expect(unsupported.evidenceIds).toEqual([]);
  });

  test("known offering inquiry cites only the exact matching fact", () => {
    const s = session();
    expect(s.respond({ kind: "offering", value: "consultation" })).toEqual({
      kind: "answer",
      text: "Yes. Consultation is in the verified offering list.",
      evidenceIds: ["e2"],
    });
  });

  test("legacy service intents remain compatible without controlling the domain model", () => {
    const s = session();
    expect(s.respond({ kind: "services" })).toEqual(s.respond({ kind: "offerings" }));
    expect(s.respond({ kind: "service", value: "Appointment" })).toEqual(
      s.respond({ kind: "offering", value: "Appointment" }),
    );
    expect(s.respond({ kind: "service-area" })).toEqual(s.respond({ kind: "location" }));
  });

  test("captures a bounded callback lead without adding fields", () => {
    const s = session();
    const result = s.captureLead({
      name: "Casey Example",
      callbackNumber: "+1 555 010 0200",
      requestSummary: "Please have someone return my call",
      extra: "must be dropped",
    } as never);

    expect(result).toEqual({
      name: "Casey Example",
      callbackNumber: "+1 555 010 0200",
      requestSummary: "Please have someone return my call",
    });
    expect(JSON.stringify(result)).not.toContain("extra");
  });

  test("missing required lead values fail closed", () => {
    const s = session();
    expect(() => s.captureLead({ name: "", callbackNumber: "555", requestSummary: "question" })).toThrow(
      "lead name is required",
    );
    expect(() => s.captureLead({ name: "Casey", callbackNumber: "", requestSummary: "question" })).toThrow(
      "callback number is required",
    );
    expect(() => s.captureLead({ name: "Casey", callbackNumber: "555", requestSummary: "" })).toThrow(
      "request summary is required",
    );
  });
});
