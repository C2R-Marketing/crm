import { defineDynamic, defineInstructions } from "eve/instructions";
import { focusOn, setBudget } from "../lib/focus";
import { sessionPreamble } from "../lib/preamble";
import { salesSessionPreamble } from "../sales/preamble";

/**
 * What this particular session is for.
 *
 * `instructions.md` is the agent's permanent identity and is the same every
 * time. This is the opposite: resolved once per session from whoever started
 * it, so a run opens already knowing its durable subject, task and budget.
 *
 * Resolved at `session.started` rather than per turn. Prompt caches are keyed
 * on the prompt, so a preamble that changed every turn would re-ingest the
 * whole conversation at uncached prices for information that does not change.
 */
export default defineDynamic({
	events: {
		"session.started": async (_event, ctx) => {
			const attributes = ctx.session.auth.current?.attributes ?? {};
			const budget = asNumber(attributes.budget);
			const kind = asString(attributes.taskKind);
			const salesProspectId = asString(attributes.salesProspectId);

			if (budget) setBudget(budget);

			if (salesProspectId) {
				const sales = await salesSessionPreamble(salesProspectId, {
					kind,
					reason: asString(attributes.reason),
					budget,
				});
				focusOn({ ...sales.focus, sessionId: ctx.session.id });
				return defineInstructions({ markdown: sales.markdown });
			}

			const { markdown, focus } = await sessionPreamble(
				{
					contactId: asString(attributes.contactId),
					companyId: asString(attributes.companyId),
					dealId: asString(attributes.dealId),
				},
				{
					// The dispatcher names a task; the panel never does. That is the
					// only signal available at session start, and it is a reliable one.
					dispatched: Boolean(kind),
					kind,
					reason: asString(attributes.reason),
					budget,
				},
			);

			focusOn({ ...focus, sessionId: ctx.session.id });

			return defineInstructions({ markdown });
		},
	},
});

function asString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
	const parsed = typeof value === "string" ? Number(value) : value;
	return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}
