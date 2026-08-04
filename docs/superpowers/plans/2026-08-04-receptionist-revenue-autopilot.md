# Receptionist Revenue Autopilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a durable, evidence-gated autonomous AI sales worker inside the existing CRM that can complete a prospect-specific receptionist-demo sales cycle in synthetic/dry-run mode with no human turn after Gate A, while remaining incapable of real external contact until Gate B.

**Architecture:** Extend the existing `apps/agent` Eve worker and `AgentTask` durable queue. Put deterministic transition, eligibility, claims, budgets, receipt, and demo-generation logic in focused TypeScript modules under `apps/agent/agent/sales`. Persist campaign/prospect/receipt state in Postgres through `@crm/db`; keep intelligence out of Nest API. Use a synthetic channel/model adapter for the first end-to-end proof; real email/WebRTC/SIP adapters remain disabled behind the Gate B external-action switch.

**Tech Stack:** TypeScript 5.9, Bun test, Eve 0.29.4, Prisma/Postgres via `@crm/db`, existing CRM `AgentTask` scheduler, Zod 4.

## Global Constraints

- Base work from exact commit `856ae2fc855757e45c31d31cebee03fbfbe46029` or explicitly record and reconcile any newer base before editing.
- Read `AGENTS.md`, `docs/agent.md`, `docs/api.md`, `docs/environment.md`, `SECURITY.md`, `CONTRIBUTING.md`, and the installed Eve documentation relevant to each Eve API used.
- Intelligence remains in `apps/agent`; Nest API only reports events or serves authenticated data.
- No real customer data in tests, docs, fixtures, screenshots, or receipts.
- No real outreach, calls, publish/deploy, spend, credential changes, or charging before Gate B.
- No unbounded retries/agent loops; all actions have hard caps.
- No silent paid fallback.
- No unsupported factual pitch claim may cross an adapter boundary.
- Suppression/opt-out and kill-switch decisions fail closed.
- Existing research/enrichment functionality must remain intact.

---

### Task 1: Recover and hash the exact source-video evidence

**Files:**
- Create: `docs/research/source-video--aUjJB6-hvk.md`
- Create when available: `docs/research/source-video--aUjJB6-hvk.metadata.json`
- Create when available: `docs/research/source-video--aUjJB6-hvk.transcript.txt`

**Interfaces:**
- Consumes: exact URL `https://www.youtube.com/watch?v=-aUjJB6-hvk`; Agent Reach / yt-dlp.
- Produces: immutable primary-source evidence and transcript SHA-256 referenced by later prompt/claim work.

- [ ] Verify canonical Agent Reach upstream, immutable SHA, MIT license, and the YouTube/yt-dlp path before execution.
- [ ] Run `agent-reach doctor` in an isolated user environment and preserve command, version, output, and exit status.
- [ ] Run the documented YouTube metadata/subtitle extraction route against the exact URL; preserve exact command and exit status.
- [ ] Record title/channel/date/duration/description, subtitle language inventory, yt-dlp version, and file hashes.
- [ ] If a caption file is returned, normalize it to plain text without changing wording and hash both source and normalized files.
- [ ] If captions are unavailable, record the exact blocker and keep recovered metadata; do not synthesize a transcript.
- [ ] Commit only non-secret public-source artifacts.

### Task 2: Add deterministic sales domain contracts

**Files:**
- Create: `apps/agent/agent/sales/types.ts`
- Create: `apps/agent/agent/sales/state-machine.ts`
- Test: `apps/agent/test/sales/state-machine.spec.ts`

**Interfaces:**
- Produces: `SalesStage`, `CampaignContract`, `ClaimRecord`, `ProspectEnvelope`, `SalesBudget`, `SalesTransition`, `transitionSalesStage()`.
- `transitionSalesStage(current, event, policy): SalesTransition` is pure and must never perform I/O.

- [ ] Write failing Bun tests for every legal happy-path transition and illegal skip/backdoor transitions.
- [ ] Add tests proving `ELIGIBILITY_BLOCKED`, `SUPPRESSED`, `KILL_SWITCHED`, and `BUDGET_EXHAUSTED` are terminal/fail-closed outcomes.
- [ ] Implement the minimal discriminated unions and transition table to pass the tests.
- [ ] Run `bun test apps/agent/test/sales/state-machine.spec.ts` and preserve output/exit code.
- [ ] Commit the domain-contract slice.

### Task 3: Add claim registry and product-truth gate

**Files:**
- Create: `apps/agent/agent/sales/claims.ts`
- Create: `apps/agent/agent/sales/config/receptionist-offer.v1.json`
- Test: `apps/agent/test/sales/claims.spec.ts`

**Interfaces:**
- Produces: `resolveApprovedClaim(claimId, registry, now)` and `validatePitchClaims(claimIds, registry, now)`.
- A valid claim contains stable id, approved wording/bounded paraphrase rule, evidence reference, limitations, status, and optional expiry.

- [ ] Write tests proving approved claims resolve and disallowed/expired/unknown claims fail.
- [ ] Add a test proving the source video's `$500/day` and generic `$20,000 roofing job` numbers are not automatically approved product claims.
- [ ] Implement claim validation as deterministic code; no model confidence field exists.
- [ ] Create a minimal v1 receptionist offer registry using only facts supportable by the product specification, with no testimonial or income claims.
- [ ] Run the claims test and commit.

### Task 4: Add eligibility, consent, suppression, and budget policy

**Files:**
- Create: `apps/agent/agent/sales/policy.ts`
- Test: `apps/agent/test/sales/policy.spec.ts`

**Interfaces:**
- Produces: `evaluateEligibility(prospect, campaign)`, `canDispatchExternalAction(context)`, `consumeBudget(budget, usage)`.

- [ ] Write tests for unknown consent, explicit opt-out, suppression, channel mismatch, Gate B disabled, kill switch, retry cap, action cap, token cap, and cost cap.
- [ ] Write tests proving synthetic/local actions are permitted while external actions remain blocked under Gate A.
- [ ] Implement fail-closed policy functions and exact reason codes.
- [ ] Run tests and commit.

### Task 5: Add prospect-specific receptionist demo builder

**Files:**
- Create: `apps/agent/agent/sales/demo.ts`
- Test: `apps/agent/test/sales/demo.spec.ts`

**Interfaces:**
- Produces: `buildReceptionistDemoSpec(observedFacts, campaign): ReceptionistDemoSpec`.
- Input facts each carry an evidence id and observed value. Missing data must generate an explicit fallback, never a guessed value.

- [ ] Write a synthetic local-business fixture using only `.test` domains and fictional names.
- [ ] Test business name, observed services, service area, hours, allowed FAQs, lead-capture fields, disclosure, and unknown-information fallback.
- [ ] Test that an unsupported service/price/hours value cannot enter the demo spec.
- [ ] Implement the pure builder and run tests.
- [ ] Commit.

### Task 6: Add durable sales persistence

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: one timestamped Prisma migration under `packages/db/prisma/migrations/`
- Create: `apps/agent/agent/sales/store.ts`
- Test: `apps/agent/test/sales/store.integration.spec.ts`

**Interfaces:**
- Persist `SalesCampaign`, `SalesProspect`, and `SalesReceipt` records.
- `SalesProspect` links to existing contact/company ids where available and persists consent/suppression/current stage/next action.
- `SalesReceipt` records run id, stage before/after, provider/model/tool/action, evidence/claim ids, budget counters, external-action flag, outcome/error, timestamps.

- [ ] Add integration tests first using only fictional records and cleanup hooks following existing test conventions.
- [ ] Add schema enums/models with indexes for due prospects and campaign/state lookups.
- [ ] Generate a migration using the repo's guarded local-database workflow; do not use `db:push`.
- [ ] Implement store functions with idempotent receipt writes and no secret/message-body logging.
- [ ] Run integration tests and commit.

### Task 7: Reuse AgentTask for sales dispatch rather than adding a scheduler

**Files:**
- Modify: `apps/agent/agent/lib/tasks.ts`
- Modify: `apps/agent/agent/schedules/dispatch.ts`
- Modify only as required: `apps/agent/agent/instructions/task.ts`
- Create: `apps/agent/agent/sales/preamble.ts`
- Test: `apps/agent/test/sales/dispatch.spec.ts`

**Interfaces:**
- New bounded task kinds use prefix `sales:` and carry a `salesProspectId` through durable task/auth/session context.
- Dispatcher still has exactly one schedule and the existing lease/attempt behavior.

- [ ] Write tests proving normal research task behavior is unchanged.
- [ ] Write tests proving a due sales task starts/resumes one durable session and receives the campaign/prospect preamble.
- [ ] Extend the task record only as required for a sales-prospect relation; preserve existing claim/lease/attempt semantics.
- [ ] Update `brief()`/task routing to give sales sessions a bounded objective instead of generic `Handle this` prose.
- [ ] Run affected task/dispatch/preamble tests and commit.

### Task 8: Add sales tools and instructions inside the Eve agent

**Files:**
- Create: `apps/agent/agent/skills/sales-receptionist.md`
- Create: `apps/agent/agent/tools/read_sales_context.ts`
- Create: `apps/agent/agent/tools/record_sales_action.ts`
- Create: `apps/agent/agent/tools/advance_sales_stage.ts`
- Test: `apps/agent/test/sales/tools.spec.ts`

**Interfaces:**
- Tools read campaign/prospect/demo/product-truth context through app-runtime DB access.
- `record_sales_action` validates claim ids and policy before persistence.
- `advance_sales_stage` calls the deterministic state machine; the model cannot write an arbitrary next stage.

- [ ] Read the exact installed Eve tool/skill documentation before writing the first tool.
- [ ] Write tool tests for valid stage action, unsupported claim rejection, suppression rejection, Gate B external-action rejection, and kill switch.
- [ ] Implement the tools using the repository's existing Eve patterns and Zod schemas.
- [ ] Write `sales-receptionist.md` to require discovery -> demo -> objections -> CTA, source-backed claims, and explicit stop behavior.
- [ ] Run tests/typecheck and commit.

### Task 9: Add provider-neutral conversation/channel adapter and synthetic proof adapter

**Files:**
- Create: `apps/agent/agent/sales/adapter.ts`
- Create: `apps/agent/agent/sales/synthetic-adapter.ts`
- Create: `apps/agent/agent/sales/runner.ts`
- Test: `apps/agent/test/sales/runner.spec.ts`

**Interfaces:**
- `SalesChannelAdapter` exposes `send`, `receive`, `scheduleFollowup`, and `close` with explicit `external: boolean` metadata.
- `SyntheticSalesAdapter` consumes scripted synthetic buyer turns and captures every outgoing action.
- `runSalesProspect()` drives one prospect until a terminal/parked state using policy/state-machine/tool outputs and hard caps.

- [ ] Write the synthetic adapter tests first.
- [ ] Add a full synthetic scenario: qualification -> demo -> objection 1 -> objection 2 -> CTA accepted -> outcome captured.
- [ ] Add failure scenarios: opt-out, unsupported claim request, malformed prospect, provider failure/retry exhaustion, spend/action cap, kill switch, CTA declined/follow-up.
- [ ] Implement the adapter/runner with no network dependency.
- [ ] Assert zero external actions in every Gate A scenario.
- [ ] Run tests and commit.

### Task 10: Prove source workflow with an end-to-end synthetic receptionist sale

**Files:**
- Create: `apps/agent/test/sales/receptionist-autopilot.e2e.spec.ts`
- Create: `docs/production-readiness/receptionist-revenue-autopilot-dry-run.md`

**Interfaces:**
- Produces one machine-readable end-to-end receipt bundle tied to exact branch SHA and test fixture id.

- [ ] Seed a fictional roofing/service-business prospect using `.test` data and explicit evidence ids.
- [ ] Queue the sales task through `AgentTask`; do not call the runner in a way that bypasses scheduling/policy.
- [ ] Run through demo, two objections, CTA, follow-up/outcome with no human input after setup.
- [ ] Assert all outgoing claims map to approved claim ids and all external action flags remain false.
- [ ] Capture exact commands, environment identity, output, exit codes, and receipt ids in the dry-run report.
- [ ] Commit.

### Task 11: Voice adapter adoption audit, no telephony enablement

**Files:**
- Create: `docs/research/voice-adapter-livekit-vs-pipecat-2026-08-04.md`

**Interfaces:**
- Produces an adoption verdict and immutable upstream SHAs/licenses for LiveKit Agents and Pipecat; no runtime dependency is added unless the audit passes and the chosen adapter can remain disabled.

- [ ] Inspect canonical upstream README, license, package/dependency manifests, relevant telephony/source files, tests, workflows, security docs, release state, and official docs for each candidate.
- [ ] Record feature overlap/gaps with `SalesChannelAdapter`, self-hosting requirements, provider requirements, platform fit, estimated operational cost categories, and rollback.
- [ ] Prefer the smallest adapter surface. Do not add a second orchestration framework to the CRM.
- [ ] If one candidate is accepted for a future adapter, pin immutable SHA/version in the report; do not enable PSTN/SIP under Gate A.
- [ ] Commit the audit.

### Task 12: Verification, independent review, feature preservation, and PRA

**Files:**
- Modify: `docs/production-readiness/receptionist-revenue-autopilot-dry-run.md`

**Interfaces:**
- Produces the final `READY_FOR_GATE_B` evidence packet or a precise blocked/failed status.

- [ ] Run repo-prescribed `bun run check-types` and preserve exit code/output.
- [ ] Run repo-prescribed `bun run lint` and preserve exit code/output.
- [ ] Run repo-prescribed `bun run test` and preserve exit code/output.
- [ ] Run `bun run --filter=agent build` (or the exact repo-supported equivalent) and preserve exit code/output.
- [ ] Run secret scan/security checks already available in the environment; do not introduce paid tooling.
- [ ] Compare changed files/diff against the intended scope and prove existing enrichment/research tests remain green.
- [ ] Run kill-switch and rollback reproduction.
- [ ] Have a fresh-context independent reviewer inspect the exact post-test artifact SHA for claim safety, consent/suppression, feature preservation, and receipt integrity.
- [ ] Fix findings and rerun affected tests; do not let a reviewer self-certify its own changes.
- [ ] Complete PRA sections: Built / Inspected / Tested / Working / Broken / Not Verified / Security-Compliance / Costs-Limits / Rollback.
- [ ] Report `READY_FOR_GATE_B` only if every acceptance criterion is evidenced. Otherwise report the exact narrower status.

## Execution handoff

Use fresh-context workers per task where possible. Do not ask the owner to transport instructions or evidence between agents. The owner is interrupted only for an actual Gate B decision or a stop condition named in the controlling Company OS ticket.