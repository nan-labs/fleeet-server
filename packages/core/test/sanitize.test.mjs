// sanitize.test.mjs — Unit tests for sanitize module

import { test } from "node:test";
import assert from "node:assert";
import { sanitizeEvent, scrubText, stripInvisible, normalizeTrigger } from "../src/sanitize.mjs";

test("stripInvisible removes invisible characters", () => {
  const input = "hello\u202Eworld\u2066test";
  const output = stripInvisible(input);
  assert.strictEqual(output, "helloworldtest");
});

test("scrubText redacts secrets", () => {
  const input = "My API key is sk-abc123def456ghi789jkl012";
  const result = scrubText(input, 200);
  assert.ok(result.includes("[redacted key]"));
  assert.ok(!result.includes("sk-abc123def456ghi789jkl012"));
});

test("scrubText redacts email addresses", () => {
  const input = "Contact me at test@example.com";
  const result = scrubText(input, 200);
  assert.ok(result.includes("[email]"));
  assert.ok(!result.includes("test@example.com"));
});

test("scrubText removes code blocks", () => {
  const input = "Here is code:\n```\nconst x = 1;\n```\nDone";
  const result = scrubText(input, 200);
  assert.ok(result.includes("[code]"));
  assert.ok(!result.includes("const x"));
});

test("normalizeTrigger maps synonyms", () => {
  assert.strictEqual(normalizeTrigger("cron"), "routine");
  assert.strictEqual(normalizeTrigger("human"), "user");
  assert.strictEqual(normalizeTrigger("bot"), "agent");
  assert.strictEqual(normalizeTrigger("user"), "user");
});

test("sanitizeEvent validates and scrubs event", () => {
  const event = {
    event: "session_start",
    run_id: "test-run-123",
    ts: "2024-01-01T00:00:00Z",
    agent: "test-agent",
    summary: "Testing with secret sk-abc123def456ghi789jkl012",
    task: "Test task",
  };
  
  const { event: sanitized, redactions } = sanitizeEvent(event);
  assert.strictEqual(sanitized.event, "session_start");
  assert.strictEqual(sanitized.run_id, "test-run-123");
  assert.strictEqual(sanitized.agent, "test-agent");
  assert.ok(sanitized.summary.includes("[redacted key]"));
  assert.ok(redactions > 0);
});

test("sanitizeEvent removes unknown fields", () => {
  const event = {
    event: "heartbeat",
    run_id: "test-run",
    ts: "2024-01-01T00:00:00Z",
    agent: "test",
    summary: "test",
    unknown_field: "should be removed",
  };
  
  const { event: sanitized } = sanitizeEvent(event);
  assert.strictEqual(sanitized.unknown_field, undefined);
});

test("sanitizeEvent caps field lengths", () => {
  const longAgent = "a".repeat(100);
  const event = {
    event: "heartbeat",
    run_id: "test-run",
    ts: "2024-01-01T00:00:00Z",
    agent: longAgent,
    summary: "test",
  };
  
  const { event: sanitized } = sanitizeEvent(event);
  assert.ok(sanitized.agent.length <= 64);
});
