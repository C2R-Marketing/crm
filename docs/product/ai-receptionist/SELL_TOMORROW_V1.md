# C2R AI Receptionist — Sell-Tomorrow Package v1

Date: 2026-08-08
Status: INTERNAL SALES PACKAGE — OWNER APPROVAL REQUIRED BEFORE PUBLICATION / CHARGE / REAL CUSTOMER CONTACT
Owning code: `C2R-Marketing/crm` branch `feat/receptionist-revenue-autopilot-v1`

## Product truth

The product core is business-agnostic. The canonical receptionist facts are:

- `businessName`
- `offering`
- `location`
- `hours`
- `faq`

Legacy `service` / `serviceArea` fields are compatibility aliases only; they do not define the product domain.

The current exact product slice can:

- build a prospect-specific receptionist demo from evidence-backed organization facts;
- answer only from approved/evidenced offerings, locations, hours, and FAQ facts;
- refuse unknown pricing/availability rather than inventing an answer;
- capture a bounded callback lead: name, callback number, request summary;
- produce evidence IDs with demo answers;
- persist campaign/prospect/receipt state in Postgres;
- queue durable sales work through the existing AgentTask scheduler;
- enforce product-claim, consent/provenance, suppression/opt-out, kill-switch, action/retry, token, and cost gates;
- run a synthetic evidence-to-pitch sales flow through objections to handoff with no external actions under Gate A.

## Exact current proof

Exact head: `f35215d895b608ff76c61f28637b90c5d96937e5`
GitHub Actions run: `31274730997`
Job: `93146374949`
Environment: GitHub-hosted Ubuntu 24.04, Node 24, Bun 1.3.12, disposable Postgres 16.

Observed run results:

- sales suite: 52 pass, 0 fail, 153 assertions across 11 files;
- synthetic sale proof: `READY_FOR_HANDOFF`, final `EVALUATE_LEARN`, 4 actions, 2 objections handled, 0 external actions, Gate B locked, $0 max cost;
- callable receptionist demo: evidence-backed generic offerings/hours, unknown price refused, callback lead captured;
- same code generated a professional-office demo and a community-ministry demo;
- cross-vertical output checks passed and neither generated demo contained an invented dollar price;
- Gate-A product trigger executed twice and DB proof retained exactly one prospect + one open AgentTask;
- TypeScript check exited 0;
- Eve/Nitro build exited 0.

This proves the bounded synthetic/demo layer. It does NOT prove live PSTN/SIP/telephony, a public production deployment, a real customer interaction, a real payment, or revenue.

## What we sell first

### C2R AI Receptionist Founding Pilot

Buyer outcome:

> Turn approved facts about an organization into a guarded AI front desk that can answer routine questions, capture a callback lead, and hand off unknowns instead of inventing them.

The sale is a managed implementation around the existing software core, not a claim that every live-channel integration is already production-enabled.

### Deliverables

1. Evidence-backed organization fact packet.
2. Prospect/customer-specific AI receptionist demo.
3. Approved answer/unknown/escalation policy.
4. Lead-capture fields and handoff rules.
5. One approved live inbound channel integration after provider/account approval and live-channel QA.
6. CRM/receipt logging appropriate to the selected deployment.
7. Kill switch and rollback instructions.
8. First 30 days of bounded tuning/support.

### Draft founding price — owner approval required

- Setup: **$497 one time**.
- Managed service after live acceptance: **$297/month**.
- External telephony/model usage: pass-through or bundled only after actual provider costs and a hard allowance are proven and written into the customer agreement.
- No performance/revenue guarantee.

Reason for this test price: current public competitors demonstrate a real paid category ranging from low-cost self-service to done-for-you implementations. Current examples checked 2026-08-08 include Smith.ai ($150/mo Pro, $500/mo Enterprise), Goodcall ($79/$129/$249 per agent), AgentZap ($109–$899/mo plus $499 setup), and WildRun ($497–$1,997/mo plus $1,500 setup on Starter/Growth). These are market references, not proof that C2R will convert at the proposed price.

Sources:

- https://smith.ai/pricing/ai-receptionist
- https://www.goodcall.com/pricing
- https://agentzap.ai/pricing
- https://wildrunai.com/pricing
- https://www.retellai.com/pricing

## Why this is not another commodity receptionist

C2R v1 differentiation to test with buyers:

1. **Demo before commitment** — prospect-specific evidence demo can be generated from a small fact packet.
2. **Evidence-bounded answers** — answers carry source/evidence IDs and unknowns fail closed.
3. **No invented price or policy** — unsupported fields do not enter the demo specification.
4. **Auditable control layer** — durable receipts and deterministic gates exist around claims, consent, suppression, budgets, retries and kill-switch state.
5. **Business-agnostic core** — no roofing, dental, legal, church, clinic, or other vertical is encoded into the product model.
6. **Managed implementation** — compete on configuration, verification and integration rather than raw voice-minute commodity pricing.

These are product-design differentiators. Superiority versus competitors remains NOT PROVEN until comparative/live tests and customer outcomes exist.

## Five-minute sales demo

1. Show the prospect's evidence fact packet.
2. Generate their local HTML demo with `receptionist:prospect-demo`.
3. Show offerings / hours / location answer with evidence IDs.
4. Ask an unsupported pricing or availability question and show the fail-closed response.
5. Demonstrate callback lead capture.
6. Show the Gate-A receipt proving no live actions or spend occurred.
7. Offer the $497 Founding Pilot only after owner approval of the price and external sales batch.

## Before accepting the first live customer

Must complete or explicitly contract as implementation-stage work:

- choose and approve the live inbound transport/provider;
- implement/test one provider adapter or approved customer-owned telephony path;
- prove live-call disclosure/recording/retention behavior required for the customer jurisdiction/use case;
- prove external-action receipts and kill switch on the selected live path;
- define actual included usage/overage economics;
- define customer data retention/deletion and secrets handling;
- execute one test-mode/live-sandbox call with owner-approved credentials;
- produce a rollback receipt.

## Tomorrow sales posture

Safe claim:

> We have a working evidence-bounded receptionist core and can build you a business-specific demo before you buy. The founding pilot is a managed implementation to connect that guarded core to your approved live call workflow.

Do NOT claim:

- that C2R has live customers or revenue from this product;
- that the current branch is already handling production phone calls;
- guaranteed bookings/revenue/savings;
- a conversion rate;
- that it is HIPAA/legal/compliance certified;
- that it is better than named competitors without a reproduced comparison.

## Revenue math — target only

At the proposed founding price, two setup sales/day = $994 in setup revenue before recurring service. This is target arithmetic, not a forecast or achieved revenue.

## Owner gate

Before external launch, owner must approve:

- `$497 setup / $297 monthly` test price or replacement price;
- initial prospect/customer batch and channel;
- live telephony/provider/account/spend if used;
- exact landing page/public destination;
- payment path.

Until then: build, test, generate demos, prepare sales assets, and run synthetic/local proofs only.
