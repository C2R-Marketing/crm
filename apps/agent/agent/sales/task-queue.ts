import type { LeasedTask } from "../lib/tasks";

export function isSalesTask(task: Pick<LeasedTask, "kind" | "salesProspectId">): task is Pick<LeasedTask, "kind" | "salesProspectId"> & { salesProspectId: string } {
  return task.kind.startsWith("sales:") && Boolean(task.salesProspectId);
}

export function salesTaskBrief(task: LeasedTask): string {
  if (!isSalesTask(task)) throw new Error("sales task requires salesProspectId and sales:* kind");
  const retry = task.attempts > 1
    ? ` This is bounded retry ${task.attempts}; resume the durable session and do not restart discovery.`
    : "";
  return `Advance prospect ${task.salesProspectId} by at most one deterministic sales stage. ${task.reason} Read the durable campaign/prospect state and product-truth gates from the session preamble. Do not perform external contact unless Gate B and every deterministic policy gate explicitly permit it.${retry}`;
}

export function salesTaskAttributes(task: LeasedTask): Record<string, string> {
  if (!isSalesTask(task)) throw new Error("sales task requires salesProspectId and sales:* kind");
  return {
    taskKind: task.kind,
    reason: task.reason,
    budget: String(task.budget),
    salesProspectId: task.salesProspectId,
  };
}
