/**
 * agent.test.mjs — Messages tool loop (agent/index.ts).
 *  - a `read_view` tool_use call runs exactly once against the (stub) data client
 *  - the loop returns the model's final text once it stops calling tools
 *  - a tool that throws comes back to the model as an `is_error` tool_result,
 *    not a thrown exception out of runAgent
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { runAgent } from "../agent/index.ts";

/** Chainable stand-in for a supabase-js query builder: every filter/order/limit
 *  call returns itself, and it resolves like a promise once awaited. */
function fakeQuery(rows) {
  const q = {
    eq: () => q,
    gte: () => q,
    lt: () => q,
    lte: () => q,
    order: () => q,
    limit: () => q,
    then: (resolve) => resolve({ data: rows, error: null }),
  };
  return q;
}

test("agent: calls read_view once via runTool and returns the final text", async () => {
  const readViewCalls = [];
  const ai = {
    defaultModel: "claude-haiku-4-5",
    createCalls: [],
    messages: {
      create: async (params) => {
        ai.createCalls.push(params);
        if (ai.createCalls.length === 1) {
          return {
            stop_reason: "tool_use",
            content: [{ type: "tool_use", id: "t1", name: "read_view", input: { view: "money_v1" } }],
          };
        }
        return { stop_reason: "end_turn", content: [{ type: "text", text: "done" }] };
      },
    },
  };

  // Stand in for the DataClient seam runTool actually touches (client.views[view]()).
  const data = {
    views: {
      money_v1: () => {
        readViewCalls.push(true);
        return fakeQuery([{ id: 1 }]);
      },
    },
  };

  const text = await runAgent("how's revenue", { ai, data });

  assert.equal(ai.createCalls.length, 2, "one turn to request the tool, one to finish");
  assert.equal(readViewCalls.length, 1, "read_view invoked exactly once");
  assert.equal(text, "done");
});

test("agent: a tool error becomes an is_error tool_result, loop continues", async () => {
  const data = {
    views: {
      money_v1: () => {
        throw new Error("boom");
      },
    },
  };
  const ai = {
    defaultModel: "claude-haiku-4-5",
    createCalls: [],
    messages: {
      create: async (params) => {
        ai.createCalls.push(params);
        if (ai.createCalls.length === 1) {
          return {
            stop_reason: "tool_use",
            content: [{ type: "tool_use", id: "t1", name: "read_view", input: { view: "money_v1" } }],
          };
        }
        return { stop_reason: "end_turn", content: [{ type: "text", text: "recovered" }] };
      },
    },
  };

  const text = await runAgent("x", { ai, data, tools: { rpcs: [] } });

  // Second create() call's messages carry the tool_result we produced for turn 1.
  const secondCallMessages = ai.createCalls[1].messages;
  const toolResultMessage = secondCallMessages.at(-1);
  const toolResult = toolResultMessage.content[0];
  assert.equal(toolResult.type, "tool_result");
  assert.equal(toolResult.is_error, true, "an unexposed/failed tool call must set is_error");
  assert.equal(text, "recovered");
});

test("agent: running out of maxTurns throws instead of returning empty text", async () => {
  const data = { views: { money_v1: () => fakeQuery([]) } };
  const ai = {
    defaultModel: "claude-haiku-4-5",
    messages: {
      create: async () => ({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "read_view", input: { view: "money_v1" } }],
      }),
    },
  };
  await assert.rejects(runAgent("x", { ai, data, maxTurns: 2 }), /stopped after 2 turns/);
});
