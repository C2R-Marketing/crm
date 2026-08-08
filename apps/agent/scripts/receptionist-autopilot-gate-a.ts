import { db } from "@crm/db";
import { seedGateAReceptionistRun } from "../agent/sales/gate-a";

const receipt = await seedGateAReceptionistRun({
  prospectId: "synthetic-example-organization-v1",
  businessName: "Example Organization.test",
  website: "https://example-organization.test",
  observedFacts: [
    { field: "businessName", value: "Example Organization.test", evidenceId: "fixture:business-name" },
    { field: "offering", value: "Consultation", evidenceId: "fixture:offering-consultation" },
    { field: "offering", value: "Appointment", evidenceId: "fixture:offering-appointment" },
    { field: "location", value: "Example City", evidenceId: "fixture:location" },
    { field: "hours", value: "Mon-Fri 8am-5pm", evidenceId: "fixture:hours" },
    { field: "faq", value: "Messages are captured for human follow-up.", evidenceId: "fixture:faq-follow-up" },
  ],
});

console.log(JSON.stringify(receipt, null, 2));
await db.$disconnect();
