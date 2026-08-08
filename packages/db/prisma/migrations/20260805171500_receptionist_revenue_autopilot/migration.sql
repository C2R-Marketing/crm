-- Durable state for the Gate-A-safe Receptionist Revenue Autopilot.
-- External actions remain disabled in product policy until Gate B.

CREATE TABLE "salesCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "gateBEnabled" BOOLEAN NOT NULL DEFAULT false,
    "killSwitch" BOOLEAN NOT NULL DEFAULT false,
    "contract" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "salesCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "salesProspect" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT,
    "companyId" TEXT,
    "provenance" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "consentBasis" TEXT NOT NULL,
    "suppressed" BOOLEAN NOT NULL DEFAULT false,
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "currentStage" TEXT NOT NULL,
    "nextActionAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "salesProspect_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "salesReceipt" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "stageBefore" TEXT NOT NULL,
    "stageAfter" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "tool" TEXT,
    "action" TEXT NOT NULL,
    "evidenceIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "claimIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "budget" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "externalAction" BOOLEAN NOT NULL DEFAULT false,
    "outcome" TEXT,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "salesReceipt_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agentTask" ADD COLUMN "salesProspectId" TEXT;

CREATE UNIQUE INDEX "salesReceipt_idempotencyKey_key" ON "salesReceipt"("idempotencyKey");
CREATE INDEX "salesProspect_campaignId_currentStage_nextActionAt_idx" ON "salesProspect"("campaignId", "currentStage", "nextActionAt");
CREATE INDEX "salesProspect_contactId_idx" ON "salesProspect"("contactId");
CREATE INDEX "salesProspect_companyId_idx" ON "salesProspect"("companyId");
CREATE INDEX "salesReceipt_prospectId_createdAt_idx" ON "salesReceipt"("prospectId", "createdAt");
CREATE INDEX "salesReceipt_campaignId_createdAt_idx" ON "salesReceipt"("campaignId", "createdAt");
CREATE INDEX "agentTask_salesProspectId_idx" ON "agentTask"("salesProspectId");

ALTER TABLE "salesProspect"
  ADD CONSTRAINT "salesProspect_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "salesCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "salesProspect"
  ADD CONSTRAINT "salesProspect_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "salesProspect"
  ADD CONSTRAINT "salesProspect_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "salesReceipt"
  ADD CONSTRAINT "salesReceipt_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "salesCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "salesReceipt"
  ADD CONSTRAINT "salesReceipt_prospectId_fkey"
  FOREIGN KEY ("prospectId") REFERENCES "salesProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agentTask"
  ADD CONSTRAINT "agentTask_salesProspectId_fkey"
  FOREIGN KEY ("salesProspectId") REFERENCES "salesProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
