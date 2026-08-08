import { buildReceptionistDemoSpec } from "../agent/sales/demo";
import { createReceptionistSession } from "../agent/sales/receptionist";
import type { CampaignContract, ObservedFact } from "../agent/sales/types";

const campaign: CampaignContract = {
  id: "receptionist-demo-runtime-v1",
  name: "Synthetic callable receptionist demo",
  allowedChannels: ["synthetic"],
  gateBEnabled: false,
  killSwitch: false,
  approvedClaimIds: ["receptionist.demo.available", "receptionist.lead.capture"],
  maxActionsPerProspect: 8,
  maxRetries: 1,
};

const facts: ObservedFact[] = [
  { field: "businessName", value: "Example Organization.test", evidenceId: "fixture:business-name" },
  { field: "offering", value: "Consultation", evidenceId: "fixture:offering-consultation" },
  { field: "offering", value: "Appointment", evidenceId: "fixture:offering-appointment" },
  { field: "location", value: "Example City", evidenceId: "fixture:location" },
  { field: "hours", value: "Mon-Fri 8am-5pm", evidenceId: "fixture:hours" },
  { field: "faq", value: "Messages are captured for human follow-up.", evidenceId: "fixture:faq" },
];

const spec = buildReceptionistDemoSpec(facts, campaign);
const receptionist = createReceptionistSession(spec);
const transcript = [
  { caller: { kind: "offerings" as const }, receptionist: receptionist.respond({ kind: "offerings" }) },
  { caller: { kind: "hours" as const }, receptionist: receptionist.respond({ kind: "hours" }) },
  { caller: { kind: "offering" as const, value: "Consultation" }, receptionist: receptionist.respond({ kind: "offering", value: "Consultation" }) },
  { caller: { kind: "price" as const }, receptionist: receptionist.respond({ kind: "price" }) },
];
const lead = receptionist.captureLead({
  name: "Casey Example",
  callbackNumber: "+1 555 010 0200",
  requestSummary: "Please have someone return my call",
});

const proof = {
  proofVersion: 2,
  product: "evidence-bounded AI receptionist demo",
  businessName: spec.businessName,
  disclosure: spec.disclosure,
  transcript,
  lead,
  assertions: {
    offeringsCited: transcript[0]?.receptionist.kind === "answer" && transcript[0].receptionist.evidenceIds.length === 2,
    hoursCited: transcript[1]?.receptionist.evidenceIds.includes("fixture:hours") === true,
    knownOfferingAnswered: transcript[2]?.receptionist.kind === "answer",
    priceNotInvented: transcript[3]?.receptionist.kind === "unknown" && !transcript[3].receptionist.text.match(/\$\d/),
    leadCaptured: lead.name === "Casey Example" && lead.callbackNumber.length > 0 && lead.requestSummary.length > 0,
    syntheticOnly: campaign.allowedChannels.length === 1 && campaign.allowedChannels[0] === "synthetic",
    gateBLocked: campaign.gateBEnabled === false,
  },
};

console.log(JSON.stringify(proof, null, 2));
if (!Object.values(proof.assertions).every(Boolean)) process.exit(1);
