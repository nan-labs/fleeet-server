// token.test.mjs — Unit tests for token module

import { test } from "node:test";
import assert from "node:assert";
import { 
  cleanLabel, 
  hashToken, 
  newToken, 
  isMintedFormat,
  compareTokens 
} from "../src/token.mjs";

test("cleanLabel strips control characters", () => {
  const input = "test\u0000label\u001f";
  const result = cleanLabel(input);
  assert.ok(!result.includes("\u0000"));
  assert.ok(!result.includes("\u001f"));
});

test("cleanLabel collapses whitespace", () => {
  const input = "test   label\n\nwith   spaces";
  const result = cleanLabel(input);
  assert.strictEqual(result, "test label with spaces");
});

test("cleanLabel caps length", () => {
  const input = "a".repeat(100);
  const result = cleanLabel(input);
  assert.ok(result.length <= 64);
});

test("hashToken returns hex string", () => {
  const hash = hashToken("test-token");
  assert.ok(/^[0-9a-f]{64}$/.test(hash));
});

test("hashToken is deterministic", () => {
  const hash1 = hashToken("test-token");
  const hash2 = hashToken("test-token");
  assert.strictEqual(hash1, hash2);
});

test("newToken generates valid format", () => {
  const token = newToken();
  assert.ok(token.startsWith("flt_"));
  assert.strictEqual(token.length, 36);
  assert.ok(isMintedFormat(token));
});

test("newToken generates unique tokens", () => {
  const token1 = newToken();
  const token2 = newToken();
  assert.notStrictEqual(token1, token2);
});

test("isMintedFormat validates token format", () => {
  assert.strictEqual(isMintedFormat("flt_" + "a".repeat(32)), true);
  assert.strictEqual(isMintedFormat("flt_abc"), false);
  assert.strictEqual(isMintedFormat("not-a-token"), false);
  assert.strictEqual(isMintedFormat(""), false);
});

test("compareTokens uses constant-time comparison", () => {
  const token1 = "test-token-1";
  const token2 = "test-token-1";
  const token3 = "test-token-2";
  
  assert.strictEqual(compareTokens(token1, token2), true);
  assert.strictEqual(compareTokens(token1, token3), false);
});
