import { EnrichmentStatus } from "@crm/db";
import { defineChannel } from "eve/channels";
import { settle } from "../lib/enrichment";
import { completeTask, taskSubject } from "../lib/tasks";
import { recordSalesTaskCompletion, recordSalesTaskFailure } from "../sales/store";

/** The token format this channel owns. eve namespaces it by file stem. */
function taskToken(taskId: string): string {
	return `crm:task:${taskId}`;
}

/** The task a session is working for, or null if it is not working for one. */
function taskFromToken(token: string | undefined): string | null {
	if (!token) return null;
	const prefix = "crm:task:";
	return token.startsWith(prefix) ? token.slice(prefix.length) : null;
}

export default defineChannel({
	routes: [],

	events: {
		async "session.waiting"(_data, channel) {
			const taskId = taskFromToken(channel.continuationToken);
			if (!taskId) return;

			const subject = await completeTask(taskId, "ran");
			if (!subject) return;

			// Sales has its own durable state and receipts. Never project a sales
			// task onto a contact/company enrichment status just because both share
			// the same AgentTask scheduler.
			if (subject.kind.startsWith("sales:") && subject.salesProspectId) {
				await recordSalesTaskCompletion({
					taskId,
					prospectId: subject.salesProspectId,
					outcome: "Eve sales task turn completed.",
				});
				return;
			}

			await settle(subject, EnrichmentStatus.COMPLETE);
		},

		async "turn.failed"(data, channel) {
			const taskId = taskFromToken(channel.continuationToken);
			if (!taskId) return;

			const reason =
				typeof data === "object" && data && "error" in data
					? String((data as { error: unknown }).error)
					: "The agent turn failed.";

			const subject = await taskSubject(taskId);
			if (!subject) return;

			if (subject.kind.startsWith("sales:") && subject.salesProspectId) {
				await recordSalesTaskFailure({
					taskId,
					prospectId: subject.salesProspectId,
					reason,
				});
				return;
			}

			// Enrichment rows deliberately remain open for the bounded retry path.
			await settle(subject, EnrichmentStatus.FAILED, reason);
		},
	},

	async receive(input, { send }) {
		const taskId = typeof input.target?.taskId === "string" ? input.target.taskId : null;

		// The token is the task, so a lease retry resumes the same durable
		// session rather than paying for a fresh context and repeating discovery.
		return send(input.message, {
			auth: input.auth,
			continuationToken: taskId ? taskToken(taskId) : `crm:adhoc:${crypto.randomUUID()}`,
		});
	},
});
