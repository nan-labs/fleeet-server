// model.test.mjs — Unit tests for model module

import { test } from "node:test";
import assert from "node:assert";
import { 
  isGenericAgent, 
  normalizeSurface, 
  cleanProject, 
  normalizeProject, 
  applyModel,
  legacyDisplay 
} from "../src/model.mjs";

test("isGenericAgent identifies generic names", () => {
  assert.strictEqual(isGenericAgent("agent"), true);
  assert.strictEqual(isGenericAgent("box"), true);
  assert.strictEqual(isGenericAgent("Claude"), false);
  assert.strictEqual(isGenericAgent("ronan-bot"), false);
});

test("normalizeSurface normalizes surface names", () => {
  assert.strictEqual(normalizeSurface("claude.ai"), "claude.ai");
  assert.strictEqual(normalizeSurface("CURSOR"), "Cursor");
  assert.strictEqual(normalizeSurface("chatgpt"), "ChatGPT");
  assert.strictEqual(normalizeSurface("custom-surface"), "custom-surface");
});

test("cleanProject extracts repo name from owner/repo", () => {
  assert.strictEqual(cleanProject("owner/repo"), "repo");
  assert.strictEqual(cleanProject("nan-labs/fleeet"), "fleeet");
});

test("cleanProject extracts repo name from URL", () => {
  assert.strictEqual(cleanProject("https://github.com/owner/repo"), "repo");
  assert.strictEqual(cleanProject("git@github.com:owner/repo.git"), "repo");
});

test("cleanProject removes .git suffix", () => {
  assert.strictEqual(cleanProject("repo.git"), "repo");
  assert.strictEqual(cleanProject("my-project.git"), "my-project");
});

test("normalizeProject falls back to source.repo then general", () => {
  assert.strictEqual(normalizeProject(null, { repo: "source-repo" }), "source-repo");
  assert.strictEqual(normalizeProject(null, null), "general");
  assert.strictEqual(normalizeProject("my-project", null), "my-project");
});

test("applyModel sets defaults and validates agent", () => {
  const event = {
    event: "heartbeat",
    agent: "Claude",
    surface: "claude.ai",
    project: "test-project",
  };
  
  const { event: result } = applyModel(event);
  assert.strictEqual(result.trigger, "user");
  assert.strictEqual(result.agent, "Claude");
  assert.strictEqual(result.project, "test-project");
});

test("applyModel rejects generic agent without label", () => {
  const event = {
    event: "heartbeat",
    agent: "agent",
  };
  
  const { error } = applyModel(event);
  assert.ok(error);
  assert.ok(error.includes("generic names"));
});

test("applyModel uses label for generic agent", () => {
  const event = {
    event: "heartbeat",
    agent: "agent",
  };
  
  const { event: result } = applyModel(event, { label: "MyAgent" });
  assert.strictEqual(result.agent, "MyAgent");
});

test("legacyDisplay maps old mcp-client to Claude", () => {
  const event = {
    event: "heartbeat",
    agent: "mcp-client",
  };
  
  const result = legacyDisplay(event);
  assert.strictEqual(result.agent, "Claude");
  assert.strictEqual(result.surface, "claude.ai");
});
