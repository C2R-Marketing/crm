# Receptionist Revenue Autopilot — Design

Date: 2026-08-04
Controlling Company OS ticket: `C2R-Marketing/company-os#320`
Source video: `https://www.youtube.com/watch?v=-aUjJB6-hvk`
Observed source title: **How To Make $500/Day Giving Away Free AI Receptionist**
Owner Gate A: approved
Owner Gate B: required before any real outreach, call, publish/deploy, spend, credential change, or charging

## Goal

Build an autonomous sales worker inside the existing agentic CRM that can take an approved campaign from prospect intake through qualification, prospect-specific AI receptionist demo generation, AI pitch, objection handling, CTA, follow-up, and outcome capture without routine human intervention.

The build reproduces the useful business mechanism recovered from the source video — local-business prospecting -> CRM qualification -> free prospect-specific AI receptionist demo -> pitch/close — without adopting the proprietary Client One stack.

## Non-goals

- No real customer contact before Gate B.
- No PSTN/SIP dependency for the dry-run proof.
- No new top-level orchestrator or scheduler.
- No sales intelligence in the Nest API.
- No invented prospect facts, product claims, testimonials, conversion rates, or ROI numbers.
- No real customer data in fixtures.

## Existing architecture we reuse

The CRM is already agentic-first. `apps/agent` owns intelligence. `AgentTask` is the durable queue, `schedules/dispatch.ts` leases due work, Eve sessions survive redeploys, and agent events provide an audit trail. The sales system must extend those seams rather than create a parallel workflow engine.

## State machine

```text
CAMPAIGN_CONTRACT
  -> PROSPECT_INGEST
  -> ELIGIBILITY
  -> QUALIFY
  -> BUILD_DEMO
  -> PERSONALIZE
  -> PITCH
  -> HANDLE_OBJECTION
  -> CTA
  -> FOLLOW_UP
  -> BOOK_OR_CHECKOUT_HANDOFF
  -> OUTCOME_CAPTURE
  -> LEARN
```

Every transition is deterministic and fail-closed. The model may propose content inside a stage, but it may not choose an illegal transition, bypass consent/suppression, exceed a hard budget, or assert a claim that is not in the approved claim registry.

## Core domain objects

### CampaignContract

A versioned, immutable-at-run-start contract containing:

- campaign id and version;
- offer name and version;
- target segment;
- allowed channels;
- approved CTA(s);
- hard action/retry/token/cost caps;
- stop criteria;
- claim registry id/version;
- whether external actions are enabled (`false` until Gate B);
- kill switch.

### ClaimRegistry

A set of customer-facing claims. Each claim has:

- stable id;
- exact approved wording or bounded paraphrase rule;
- evidence reference;
- limitation/qualification;
- status (`APPROVED`, `DISALLOWED`, `EXPIRED`).

Any factual pitch sentence that cannot resolve to an approved claim must be rejected before it reaches a channel adapter.

### ProspectEnvelope

A bounded prospect record containing:

- contact/company record ids where available;
- provenance/source class;
- observed public facts and evidence ids;
- consent state;
- suppression/opt-out state;
- channel eligibility;
- qualification findings;
- current state;
- next eligible action time.

Model inference is never stored as an observed fact.

### ReceptionistDemoSpec

A prospect-specific demo configuration built only from approved public/CRM facts:

- business name;
- service categories explicitly observed;
- service area explicitly observed;
- hours explicitly observed;
- allowed FAQs and answers;
- lead-capture fields;
- booking/transfer behavior;
- disclosure copy;
- unsupported-information fallback.

The demo must say it does not know rather than fabricate unavailable business details.

### SalesReceipt

Machine-readable evidence for every material stage:

- run id / prospect id / campaign version;
- state before and after;
- provider/model where a model was used;
- tool/action identifier;
- evidence/claim ids supplied;
- token/cost counters when available;
- retry counters;
- external-action flag;
- outcome/error;
- timestamps.

## Sales conversation policy

The AI sales rep follows this sequence:

1. establish context and disclose that it is an AI where required;
2. ask bounded discovery questions;
3. connect an observed pain/opportunity to the approved offer;
4. demonstrate the prospect-specific receptionist behavior;
5. answer objections only from the claim registry and approved product truth;
6. never manufacture scarcity, urgency, testimonials, revenue claims, or guarantees;
7. ask for the approved CTA;
8. if the prospect declines or opts out, stop and suppress the appropriate channel;
9. schedule follow-up only when policy permits;
10. capture the outcome and reason for the next step.

## Qualification policy

Qualification must use evidence the CRM can show, not stereotypes. A prospect may be considered worth a demo when the campaign contract names objective signals, for example:

- the business is in the approved service category/geography;
- valid business contact route exists;
- the business advertises/markets or otherwise demonstrates active lead acquisition;
- the offer can plausibly service the business based on observed service information;
- no suppression/opt-out/eligibility block exists.

The source video's roofing example and high-value-job framing are treated as a hypothesis to test, not as a fact about every roofer.

## Adapter boundary

The sales engine talks to channels through a narrow interface. The first implementation is synthetic/local only so the complete sales logic can be proven without paid telephony or contacting anyone.

Future adapters:

- CRM/web chat;
- approved outbound email;
- browser voice/WebRTC;
- SIP/PSTN only after consent/eligibility policy passes.

LiveKit Agents is the leading voice candidate because its official docs support AI agents in rooms and outbound SIP participants; Pipecat remains the principal alternative. Neither is adopted in this feature branch until a full repo/dependency/security/license audit is recorded.

## Kill switch and budgets

The engine fails closed when any of these is true:

- campaign kill switch is set;
- Gate B external-action flag is false and an adapter requests a real external action;
- prospect is suppressed/opted out;
- channel is ineligible;
- claim resolution fails;
- action/retry/token/cost budget is exhausted;
- provider returns an unrecoverable error;
- required evidence is missing.

No free/included lane may silently fall back to a paid provider.

## Data and privacy

- No real customer data in fixtures/docs.
- Do not write contact content to third-party queries unless the existing data-boundary policy explicitly permits it.
- The sandbox still receives no database credential and no egress.
- Sales receipts must not log secrets, raw credentials, or unnecessary message bodies.
- Suppression/opt-out state survives rollback and feature disablement.

## Testing strategy

### Deterministic unit tests

Cover transition legality, claim gating, eligibility/suppression, kill switch, budgets, retry exhaustion, malformed input, and receipt shape.

### Synthetic end-to-end scenarios

At minimum:

1. qualified service-business prospect -> demo -> two objections -> CTA accepted;
2. unqualified prospect -> no pitch;
3. opted-out/suppressed prospect -> hard stop;
4. unsupported product claim requested -> claim rejected;
5. provider failure -> bounded retry -> safe stop;
6. spend/action cap -> hard stop;
7. kill switch mid-run -> no further action;
8. CTA declined -> permitted follow-up or terminal close according to contract.

Synthetic scenarios must be explicitly labeled synthetic.

## Completion boundary

The branch may reach `READY_FOR_GATE_B` only when:

- exact source video transcript/metadata recovery has either succeeded or has an evidenced blocker;
- repo-native tests/typecheck/lint/build for affected paths pass on the exact artifact;
- end-to-end synthetic sales run completes without a human relay after Gate A;
- an independent fresh-context reviewer checks the exact artifact;
- security/secret scan and feature-preservation checks are recorded;
- kill-switch and rollback are reproduced;
- Production Readiness Audit separates Built / Inspected / Tested / Working / Broken / Not Verified / Security-Compliance / Costs-Limits / Rollback.

`READY_FOR_GATE_B` is not permission to contact customers. Gate B is the owner's final external-action approval.