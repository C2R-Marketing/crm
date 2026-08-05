import { db } from "@crm/db";
import { seedGateAReceptionistRun } from "../agent/sales/gate-a";

const receipt = await seedGateAReceptionistRun({
  prospectId: "synthetic-northstar-roofing-v1",
  businessName: "Northstar Roofing.test",
  website: "https://northstar-roofing.test",
  observedFacts: [
    { field: "businessName", value: "Northstar Roofing.test", evidenceId: "fixture:business-name" },
    { field: "service", value: "Roof repair", evidenceId: "fixture:service-roof-repair" },
    { field: "service", value: "Roof inspection", evidenceId: "fixture:service-roof-inspection" },
    { field: "serviceArea", value: "Example County", evidenceId: "fixture:service-area" },
    { field: "hours", value: "Mon-Fri 8am-5pm", evidenceId: "fixture:hours" },
    { field: "faq", value: "Emergency requests are captured for callback.", evidenceId: "fixture:faq-emergency-callback" },
  ],
});

console.log(JSON.stringify(receipt, null, 2));
await db.$disconnect();
