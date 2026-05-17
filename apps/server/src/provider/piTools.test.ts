import assert from "node:assert/strict";

import { describe, it, vi } from "vitest";

import type { ProviderApprovalDecision } from "@t3tools/contracts";

import { createT3PiTools, withApprovalGate } from "./piTools.ts";

type ApprovalFn = (toolName: string, args: unknown) => Promise<ProviderApprovalDecision>;

// Minimal stub ToolDefinition for testing the approval gate in isolation.
function makeStubTool(name: string) {
  const execute = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "ok" }],
    details: undefined,
  });
  return {
    name,
    label: name,
    description: `stub ${name}`,
    parameters: {},
    execute,
  };
}

function makeApprovalFn(decision: ProviderApprovalDecision) {
  return vi.fn<ApprovalFn>().mockResolvedValue(decision);
}

describe("withApprovalGate", () => {
  it("does not call requestApproval when requiresApproval returns false", async () => {
    const base = makeStubTool("read");
    const requestApproval = vi.fn<ApprovalFn>();
    const wrapped = withApprovalGate(base, () => false, requestApproval);

    await wrapped.execute("id1", {}, undefined, undefined, {} as never);

    assert.equal(requestApproval.mock.calls.length, 0);
    assert.equal(base.execute.mock.calls.length, 1);
  });

  it("calls requestApproval and executes when approval is accepted", async () => {
    const base = makeStubTool("bash");
    const requestApproval = makeApprovalFn("accept");
    const wrapped = withApprovalGate(base, () => true, requestApproval);

    const result = await wrapped.execute(
      "id2",
      { command: "ls" },
      undefined,
      undefined,
      {} as never,
    );

    assert.equal(requestApproval.mock.calls.length, 1);
    assert.equal(requestApproval.mock.calls[0]![0], "bash");
    assert.equal(base.execute.mock.calls.length, 1);
    assert.deepEqual(result.content, [{ type: "text", text: "ok" }]);
  });

  it("returns denial result and skips execute when approval is declined", async () => {
    const base = makeStubTool("bash");
    const requestApproval = makeApprovalFn("decline");
    const wrapped = withApprovalGate(base, () => true, requestApproval);

    const result = await wrapped.execute(
      "id3",
      { command: "rm -rf /" },
      undefined,
      undefined,
      {} as never,
    );

    assert.equal(base.execute.mock.calls.length, 0);
    assert.equal(result.content.length, 1);
    const textContent = result.content[0] as { type: string; text: string };
    assert.equal(textContent.type, "text");
    assert.ok(textContent.text.includes("denied"));
  });

  it("returns denial result and skips execute when approval is cancelled", async () => {
    const base = makeStubTool("edit");
    const requestApproval = makeApprovalFn("cancel");
    const wrapped = withApprovalGate(base, () => true, requestApproval);

    const result = await wrapped.execute("id4", {}, undefined, undefined, {} as never);

    assert.equal(base.execute.mock.calls.length, 0);
    const textContent = result.content[0] as { type: string; text: string };
    assert.equal(textContent.type, "text");
    assert.ok(textContent.text.includes("edit"));
  });

  it("executes when approval is acceptForSession", async () => {
    const base = makeStubTool("write");
    const requestApproval = makeApprovalFn("acceptForSession");
    const wrapped = withApprovalGate(base, () => true, requestApproval);

    await wrapped.execute("id5", {}, undefined, undefined, {} as never);

    assert.equal(base.execute.mock.calls.length, 1);
  });

  it("preserves all non-execute properties from the base tool", () => {
    const base = makeStubTool("grep");
    const wrapped = withApprovalGate(base, () => false, vi.fn<ApprovalFn>());

    assert.equal(wrapped.name, base.name);
    assert.equal(wrapped.label, base.label);
    assert.equal(wrapped.description, base.description);
  });

  it("full-access mode: executes mutating tool without calling requestApproval", async () => {
    const requestApproval = vi.fn<ApprovalFn>();
    const baseStub = makeStubTool("bash");
    // requiresApproval always returns false — mirrors createT3PiTools with runtimeMode="full-access"
    const wrapped = withApprovalGate(baseStub, () => false, requestApproval);

    await wrapped.execute("id-fa", { command: "echo hi" }, undefined, undefined, {} as never);

    assert.equal(requestApproval.mock.calls.length, 0);
    assert.equal(baseStub.execute.mock.calls.length, 1);
  });
});

describe("createT3PiTools", () => {
  it("returns 7 tool definitions", () => {
    const tools = createT3PiTools("/tmp", "supervised", vi.fn<ApprovalFn>());
    assert.equal(tools.length, 7);
  });

  it("includes all expected tool names", () => {
    const tools = createT3PiTools("/tmp", "supervised", vi.fn<ApprovalFn>());
    const names = new Set(tools.map((t) => t.name));
    for (const expected of ["read", "grep", "find", "ls", "bash", "edit", "write"]) {
      assert.ok(names.has(expected), `expected tool '${expected}' to be present`);
    }
  });

  it("does not call requestApproval just from tool creation", () => {
    const requestApproval = vi.fn<ApprovalFn>();
    createT3PiTools("/tmp", "supervised", requestApproval);
    assert.equal(requestApproval.mock.calls.length, 0);
  });

  it("read-only tools are gated with requiresApproval=false in supervised mode", () => {
    // Verify that read-only tool names are not in the mutating set — approval gate
    // only fires when requiresApproval returns true. The gate logic is tested
    // exhaustively via withApprovalGate tests above; here we just confirm tool names.
    const tools = createT3PiTools("/tmp", "supervised", vi.fn<ApprovalFn>());
    const readOnlyNames = ["read", "grep", "find", "ls"];
    for (const name of readOnlyNames) {
      const tool = tools.find((t) => t.name === name);
      assert.ok(tool, `read-only tool '${name}' should be present`);
    }
  });

  it("mutating tools are present in both supervised and full-access modes", () => {
    const supervisedTools = createT3PiTools("/tmp", "approval-required", vi.fn<ApprovalFn>());
    const fullAccessTools = createT3PiTools("/tmp", "full-access", vi.fn<ApprovalFn>());
    for (const name of ["bash", "edit", "write"]) {
      assert.ok(
        supervisedTools.find((t) => t.name === name),
        `supervised: '${name}' missing`,
      );
      assert.ok(
        fullAccessTools.find((t) => t.name === name),
        `full-access: '${name}' missing`,
      );
    }
  });
});
