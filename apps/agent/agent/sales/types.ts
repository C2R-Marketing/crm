export type SalesStage =
  | "CAMPAIGN_CONTRACT"
  | "PROSPECT_INGEST"
  | "ELIGIBILITY_GATE"
  | "QUALIFY"
  | "PERSONALIZE"
  | "PITCH"
  | "HANDLE_OBJECTION"
  | "CTA"
  | "FOLLOW_UP"
  | "BOOK_CHECKOUT_HANDOFF"
  | "OUTCOME_CAPTURE"
  | "EVALUATE_LEARN"
  | "ELIGIBILITY_BLOCKED"
  | "SUPPRESSED"
  | "KILL_SWITCHED"
  | "BUDGET_EXHAUSTED";

export type SalesEvent =
  | "campaign_approved"
  | "prospect_ingested"
  | "eligible"
  | "ineligible"
  | "suppressed"
  | "qualified"
  | "personalized"
  | "pitch_sent"
  | "objection"
  | "objection_handled"
  | "cta_accepted"
  | "cta_declined"
  | "followup_due"
  | "followup_complete"
  | "handoff_recorded"
  | "outcome_recorded";

export type SalesTransitionReason =
  | "OK"
  | "TERMINAL"
  | "ILLEGAL_TRANSITION"
  | "KILL_SWITCH"
  | "BUDGET_EXHAUSTED";

export interface SalesTransition {
  ok: boolean;
  stage: SalesStage;
  reason: SalesTransitionReason;
}

export interface CampaignContract {
  id: string;
  name: string;
  allowedChannels: Array<"synthetic" | "email" | "web-chat" | "web-voice" | "pstn">;
  gateBEnabled: boolean;
  killSwitch: boolean;
  approvedClaimIds: string[];
  maxActionsPerProspect: number;
  maxRetries: number;
}

export interface ClaimRecord {
  id: string;
  wording: string;
  evidenceRef: string;
  limitations: string[];
  status: "APPROVED" | "REJECTED" | "RETIRED";
  expiresAt?: string;
}

export type ProspectConsent = "EXPLICIT" | "UNKNOWN" | "NOT_REQUIRED_SYNTHETIC";

export interface ProspectEnvelope {
  id: string;
  companyName: string;
  channel: CampaignContract["allowedChannels"][number];
  consent: ProspectConsent;
  suppressed: boolean;
  optedOut: boolean;
  evidenceIds: string[];
}

export interface SalesBudget {
  maxTokens: number;
  maxCostUsd: number;
  tokensUsed: number;
  costUsd: number;
}

/**
 * Canonical demo fields are business-agnostic. `service` and `serviceArea` remain
 * accepted as legacy input aliases so older evidence packets do not break.
 */
export type ObservedFactField =
  | "businessName"
  | "offering"
  | "location"
  | "hours"
  | "faq"
  | "service"
  | "serviceArea"
  | string;

export interface ObservedFact {
  field: ObservedFactField;
  value: string;
  evidenceId: string;
}

export interface EvidenceValue {
  value: string;
  evidenceId: string;
}

export interface ReceptionistDemoSpec {
  campaignId: string;
  businessName: string;
  businessNameEvidenceId: string | null;
  offerings: EvidenceValue[];
  locations: EvidenceValue[];
  hours: EvidenceValue | null;
  faqs: EvidenceValue[];
  leadCaptureFields: string[];
  disclosure: string;
  unknownFallback: string;
}
