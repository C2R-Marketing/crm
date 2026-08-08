import { buildReceptionistDemoSpec } from "../agent/sales/demo";
import { createReceptionistSession, type ReceptionistTurn } from "../agent/sales/receptionist";
import type { CampaignContract, ObservedFact } from "../agent/sales/types";

type ProspectDemoInput = {
  facts: ObservedFact[];
  sampleLead?: {
    name: string;
    callbackNumber: string;
    requestSummary: string;
  };
};

const campaign: CampaignContract = {
  id: "receptionist-prospect-demo-v1",
  name: "Prospect-specific evidence-bounded receptionist demo",
  allowedChannels: ["synthetic"],
  gateBEnabled: false,
  killSwitch: false,
  approvedClaimIds: ["receptionist.demo.available", "receptionist.lead.capture"],
  maxActionsPerProspect: 8,
  maxRetries: 1,
};

function fail(message: string): never {
  console.error(`receptionist prospect demo: ${message}`);
  process.exit(2);
}

function validateFacts(value: unknown): ObservedFact[] {
  if (!Array.isArray(value) || value.length === 0) fail("facts must be a non-empty array");

  const facts: ObservedFact[] = value.map((item, index) => {
    if (!item || typeof item !== "object") fail(`facts[${index}] must be an object`);
    const row = item as Record<string, unknown>;
    const field = typeof row.field === "string" ? row.field.trim() : "";
    const factValue = typeof row.value === "string" ? row.value.trim() : "";
    const evidenceId = typeof row.evidenceId === "string" ? row.evidenceId.trim() : "";
    if (!field || !factValue || !evidenceId) {
      fail(`facts[${index}] requires non-empty field, value, and evidenceId`);
    }
    return { field, value: factValue, evidenceId };
  });

  if (!facts.some((fact) => fact.field === "businessName")) {
    fail("an evidence-backed businessName fact is required");
  }
  if (!facts.some((fact) => ["service", "serviceArea", "hours", "faq"].includes(fact.field))) {
    fail("at least one receptionist-answerable fact is required (service, serviceArea, hours, or faq)");
  }
  return facts;
}

function validateSampleLead(value: unknown): ProspectDemoInput["sampleLead"] | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") fail("sampleLead must be an object when supplied");
  const row = value as Record<string, unknown>;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const callbackNumber = typeof row.callbackNumber === "string" ? row.callbackNumber.trim() : "";
  const requestSummary = typeof row.requestSummary === "string" ? row.requestSummary.trim() : "";
  if (!name || !callbackNumber || !requestSummary) {
    fail("sampleLead requires name, callbackNumber, and requestSummary");
  }
  return { name, callbackNumber, requestSummary };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseArgs(argv: string[]): { inputPath: string; htmlPath?: string } {
  const inputPath = argv[0];
  if (!inputPath) fail("usage: receptionist:prospect-demo <facts.json> [--html <output.html>]");
  const htmlIndex = argv.indexOf("--html");
  const htmlPath = htmlIndex >= 0 ? argv[htmlIndex + 1] : undefined;
  if (htmlIndex >= 0 && !htmlPath) fail("--html requires an output path");
  return { inputPath, htmlPath };
}

const { inputPath, htmlPath } = parseArgs(process.argv.slice(2));
const raw = (await Bun.file(inputPath).json()) as ProspectDemoInput;
const facts = validateFacts(raw?.facts);
const sampleLead = validateSampleLead(raw?.sampleLead);
const spec = buildReceptionistDemoSpec(facts, campaign);
const receptionist = createReceptionistSession(spec);

const turns: ReceptionistTurn[] = [];
if (spec.services.length) turns.push({ kind: "services" });
if (spec.hours) turns.push({ kind: "hours" });
if (spec.serviceArea) turns.push({ kind: "service-area" });
if (spec.services[0]) turns.push({ kind: "service", value: spec.services[0].value });
turns.push({ kind: "price" });

const transcript = turns.map((caller) => ({ caller, receptionist: receptionist.respond(caller) }));
const lead = sampleLead ? receptionist.captureLead(sampleLead) : null;
const proof = {
  proofVersion: 1,
  product: "prospect-specific evidence-bounded AI receptionist demo",
  campaignId: campaign.id,
  businessName: spec.businessName,
  disclosure: spec.disclosure,
  evidenceIds: [...new Set(facts.map((fact) => fact.evidenceId))],
  transcript,
  lead,
  assertions: {
    businessNameEvidenceBacked: Boolean(spec.businessNameEvidenceId),
    answerableFactPresent: Boolean(spec.services.length || spec.hours || spec.serviceArea || spec.faqs.length),
    unknownPriceNotInvented: transcript.some(
      (turn) => turn.caller.kind === "price" && turn.receptionist.kind === "unknown" && !/\$\d/.test(turn.receptionist.text),
    ),
    gateBLocked: campaign.gateBEnabled === false,
    syntheticOnly: campaign.allowedChannels.length === 1 && campaign.allowedChannels[0] === "synthetic",
  },
};

if (!Object.values(proof.assertions).every(Boolean)) fail("generated proof failed one or more assertions");

console.log(JSON.stringify(proof, null, 2));

if (htmlPath) {
  const transcriptHtml = transcript
    .map(
      ({ caller, receptionist: answer }) => `
        <article class="turn">
          <div class="caller"><strong>Caller:</strong> ${escapeHtml(JSON.stringify(caller))}</div>
          <div class="answer"><strong>Receptionist:</strong> ${escapeHtml(answer.text)}</div>
          <div class="evidence"><strong>Evidence:</strong> ${escapeHtml(answer.evidenceIds.join(", ") || "none — unknown fallback")}</div>
          <button type="button" onclick="speechSynthesis.speak(new SpeechSynthesisUtterance(${JSON.stringify(answer.text)}))">Speak answer</button>
        </article>`,
    )
    .join("\n");
  const leadHtml = lead
    ? `<section><h2>Lead capture proof</h2><p>${escapeHtml(lead.name)} · ${escapeHtml(lead.callbackNumber)} · ${escapeHtml(lead.requestSummary)}</p></section>`
    : "";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(spec.businessName)} — AI Receptionist Demo</title>
<style>
body{font-family:system-ui,sans-serif;max-width:860px;margin:0 auto;padding:40px 20px;line-height:1.5;background:#fafafa;color:#111}
.badge{display:inline-block;padding:6px 10px;border:1px solid #bbb;border-radius:999px;font-size:13px}.turn,section{background:white;border:1px solid #ddd;border-radius:14px;padding:18px;margin:14px 0}.answer{font-size:18px;margin:10px 0}.evidence{font-size:13px;color:#555}button{margin-top:12px;padding:10px 14px;border-radius:8px;border:1px solid #222;background:#111;color:white;cursor:pointer}h1{margin-bottom:6px}.disclosure{color:#555}.unknown{font-style:italic}
</style>
</head>
<body>
<span class="badge">Gate A · synthetic/no-contact demo</span>
<h1>${escapeHtml(spec.businessName)} AI Receptionist Demo</h1>
<p class="disclosure">${escapeHtml(spec.disclosure)}</p>
<p>This page is generated only from evidence-backed business facts. Unknown pricing or availability is intentionally refused rather than invented.</p>
${transcriptHtml}
${leadHtml}
<section><h2>What this proves</h2><ul><li>Business answers cite source evidence IDs.</li><li>Unknown details fail closed.</li><li>A callback lead can be captured.</li><li>No real call, message, booking, charge, or paid inference occurs in this demo.</li></ul></section>
</body>
</html>`;
  await Bun.write(htmlPath, html);
  console.error(`wrote prospect demo HTML: ${htmlPath}`);
}
