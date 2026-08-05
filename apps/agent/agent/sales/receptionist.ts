import type { EvidenceValue, ReceptionistDemoSpec } from "./types";

export type ReceptionistTurn =
  | { kind: "services" }
  | { kind: "service"; value: string }
  | { kind: "hours" }
  | { kind: "service-area" }
  | { kind: "faq"; value?: string }
  | { kind: "price" }
  | { kind: "availability" }
  | { kind: "other"; value?: string };

export type ReceptionistResponse = {
  kind: "answer" | "unknown";
  text: string;
  evidenceIds: string[];
};

export type CapturedLead = {
  name: string;
  callbackNumber: string;
  requestSummary: string;
};

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function evidence(values: EvidenceValue[]): string[] {
  return values.map((item) => item.evidenceId);
}

export function createReceptionistSession(spec: ReceptionistDemoSpec) {
  const unknown = (): ReceptionistResponse => ({
    kind: "unknown",
    text: spec.unknownFallback,
    evidenceIds: [],
  });

  return {
    respond(turn: ReceptionistTurn): ReceptionistResponse {
      switch (turn.kind) {
        case "services":
          if (!spec.services.length) return unknown();
          return {
            kind: "answer",
            text: `Verified services: ${spec.services.map((item) => item.value).join("; ")}.`,
            evidenceIds: evidence(spec.services),
          };
        case "service": {
          const requested = normalized(turn.value);
          const matched = spec.services.find((item) => normalized(item.value) === requested);
          if (!matched) return unknown();
          return {
            kind: "answer",
            text: `Yes. ${matched.value} is in the verified service list.`,
            evidenceIds: [matched.evidenceId],
          };
        }
        case "hours":
          if (!spec.hours) return unknown();
          return {
            kind: "answer",
            text: `Verified hours: ${spec.hours.value}.`,
            evidenceIds: [spec.hours.evidenceId],
          };
        case "service-area":
          if (!spec.serviceArea) return unknown();
          return {
            kind: "answer",
            text: `Verified service area: ${spec.serviceArea.value}.`,
            evidenceIds: [spec.serviceArea.evidenceId],
          };
        case "faq": {
          if (!spec.faqs.length) return unknown();
          if (!turn.value?.trim()) {
            return {
              kind: "answer",
              text: `Verified FAQ information: ${spec.faqs.map((item) => item.value).join(" ")}`,
              evidenceIds: evidence(spec.faqs),
            };
          }
          const needle = normalized(turn.value);
          const matched = spec.faqs.find((item) => normalized(item.value).includes(needle));
          if (!matched) return unknown();
          return { kind: "answer", text: matched.value, evidenceIds: [matched.evidenceId] };
        }
        case "price":
        case "availability":
        case "other":
          return unknown();
      }
    },

    captureLead(input: CapturedLead): CapturedLead {
      const name = input.name?.trim();
      const callbackNumber = input.callbackNumber?.trim();
      const requestSummary = input.requestSummary?.trim();
      if (!name) throw new Error("lead name is required");
      if (!callbackNumber) throw new Error("callback number is required");
      if (!requestSummary) throw new Error("request summary is required");
      return { name, callbackNumber, requestSummary };
    },
  };
}
