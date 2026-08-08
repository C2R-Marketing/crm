import { getSalesSessionContext } from "./store";

export type SalesTaskMetadata = {
  kind: string | null;
  reason: string | null;
  budget: number | null;
};

export async function salesSessionPreamble(
  salesProspectId: string,
  task: SalesTaskMetadata,
): Promise<{
  markdown: string;
  focus: { contactId: string | null; companyId: string | null };
}> {
  const context = await getSalesSessionContext(salesProspectId);
  if (!context) {
    return {
      markdown: [
        "# Sales task blocked",
        `Sales prospect: ${salesProspectId}`,
        "The durable prospect/campaign record is missing. Stop. Do not call any model or external tool.",
      ].join("\n\n"),
      focus: { contactId: null, companyId: null },
    };
  }

  const stopReasons = [
    context.killSwitch ? "KILL SWITCH ACTIVE" : null,
    context.suppressed ? "PROSPECT SUPPRESSED" : null,
    context.optedOut ? "PROSPECT OPTED OUT" : null,
  ].filter((value): value is string => Boolean(value));

  const header = [
    "# Bounded autonomous sales task",
    `Sales prospect: ${context.prospectId}`,
    `Campaign: ${context.campaignName} (${context.campaignId})`,
    `Current stage: ${context.currentStage}`,
    `Consent basis: ${context.consentBasis}`,
    `Gate B: ${context.gateBEnabled ? "ENABLED" : "LOCKED"}`,
    `Task: ${task.kind ?? "sales:advance"}`,
    `Reason: ${task.reason ?? "Advance only the current deterministic sales stage."}`,
    `Vendor-call budget units: ${task.budget ?? 0}`,
  ];

  if (stopReasons.length) {
    return {
      markdown: [
        ...header,
        ...stopReasons.map((reason) => `STOP CONDITION: ${reason}`),
        "Do not call any model or external tool. Do not send, schedule, publish, call, book, charge, or deploy anything. Record the blocked state and finish.",
      ].join("\n\n"),
      focus: { contactId: context.contactId, companyId: context.companyId },
    };
  }

  const boundaries = context.gateBEnabled
    ? [
        "Gate B is enabled for this campaign, but every external action still requires the campaign contract, approved channel, consent basis, claim gate, hard budget, and kill-switch checks in code.",
      ]
    : [
        "Gate A only. No external contact: no real email, phone call, web message, booking, checkout, publish, deploy, credential mutation, or spend.",
        "Use only synthetic/local actions and approved evidence-backed product claims. Unsupported claims must stop before an adapter boundary.",
      ];

  return {
    markdown: [
      ...header,
      ...boundaries,
      "Required tool flow: call sales_state first. Then, if and only if the durable state and evidence support a legal next step, make exactly one sales_advance call for this task. sales_advance accepts a decision enum rather than free-form customer copy and writes the guarded state transition plus receipt atomically.",
      "Do not invent prospect facts. Do not bypass sales_state or sales_advance with generic tools. Keep the turn bounded; if a deterministic gate blocks, report the exact blocker instead of exploring around it.",
    ].join("\n\n"),
    focus: { contactId: context.contactId, companyId: context.companyId },
  };
}
