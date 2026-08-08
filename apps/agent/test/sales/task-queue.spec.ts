import { describe, expect, test } from "bun:test";
import { isSalesTask, salesTaskAttributes, salesTaskBrief } from "../../agent/sales/task-queue";

const task = {
  id: "task-1",
  contactId: null,
  companyId: null,
  salesProspectId: "prospect-1",
  kind: "sales:advance",
  reason: "Advance one deterministic stage.",
  budget: 2,
  attempts: 1,
};

describe("sales AgentTask routing", () => {
  test("recognizes only durable sales tasks", () => {
    expect(isSalesTask(task)).toBe(true);
    expect(isSalesTask({ ...task, kind: "identify", salesProspectId: null })).toBe(false);
    expect(isSalesTask({ ...task, kind: "sales:advance", salesProspectId: null })).toBe(false);
  });

  test("brief is bounded and does not ask Eve to rediscover the product architecture", () => {
    const brief = salesTaskBrief(task);
    expect(brief).toContain("prospect prospect-1");
    expect(brief).toContain("one deterministic sales stage");
    expect(brief).toContain("Do not perform external contact");
    expect(brief).not.toContain("Handle this:");
  });

  test("auth attributes preserve sales prospect identity and budget", () => {
    expect(salesTaskAttributes(task)).toEqual({
      taskKind: "sales:advance",
      reason: "Advance one deterministic stage.",
      budget: "2",
      salesProspectId: "prospect-1",
    });
  });
});
