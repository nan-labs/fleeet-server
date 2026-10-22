// colors.test.mjs — Unit tests for colors module

import { test } from "node:test";
import assert from "node:assert";
import { 
  normalizeHex, 
  oklab, 
  deltaEOK, 
  checkAgentColor,
  mergeAgentColors,
  cleanAgentColors 
} from "../src/colors.mjs";

test("normalizeHex expands 3-char hex", () => {
  assert.strictEqual(normalizeHex("#abc"), "#AABBCC");
  assert.strictEqual(normalizeHex("abc"), "#AABBCC");
});

test("normalizeHex uppercases hex", () => {
  assert.strictEqual(normalizeHex("#aabbcc"), "#AABBCC");
  assert.strictEqual(normalizeHex("aabbcc"), "#AABBCC");
});

test("normalizeHex rejects invalid hex", () => {
  assert.strictEqual(normalizeHex("not-hex"), null);
  assert.strictEqual(normalizeHex("#gg0000"), null);
  assert.strictEqual(normalizeHex(123), null);
});

test("oklab converts hex to OKLab", () => {
  const lab = oklab("#FF0000");
  assert.ok(Array.isArray(lab));
  assert.strictEqual(lab.length, 3);
  assert.ok(lab[0] > 0);
});

test("deltaEOK calculates color distance", () => {
  const d1 = deltaEOK("#FF0000", "#FF0000");
  assert.strictEqual(d1, 0);
  
  const d2 = deltaEOK("#FF0000", "#00FF00");
  assert.ok(d2 > 0);
});

test("checkAgentColor accepts colors far from protected", () => {
  const result = checkAgentColor("#2563EB");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.hex, "#2563EB");
});

test("checkAgentColor rejects colors too close to protected", () => {
  const result = checkAgentColor("#C2703D");
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, "too_close");
});

test("mergeAgentColors merges new colors", () => {
  const current = { "Agent1": "#2563EB" };
  const input = { "Agent2": "#16A34A" };
  
  const result = mergeAgentColors(current, input);
  assert.ok(result.colors);
  assert.strictEqual(result.colors["Agent1"], "#2563EB");
  assert.strictEqual(result.colors["Agent2"], "#16A34A");
});

test("mergeAgentColors removes colors with null", () => {
  const current = { "Agent1": "#2563EB", "Agent2": "#16A34A" };
  const input = { "Agent1": null };
  
  const result = mergeAgentColors(current, input);
  assert.ok(result.colors);
  assert.strictEqual(result.colors["Agent1"], undefined);
  assert.strictEqual(result.colors["Agent2"], "#16A34A");
});

test("mergeAgentColors rejects bad colors", () => {
  const input = { "Agent1": "#C2703D" };
  
  const result = mergeAgentColors({}, input);
  assert.ok(result.errors);
  assert.ok(result.errors.length > 0);
  assert.strictEqual(result.errors[0].error, "too_close");
});

test("cleanAgentColors filters invalid entries", () => {
  const stored = {
    "Valid": "#2563EB",
    "InvalidHex": "not-a-hex",
    "": "#16A34A",
  };
  
  const result = cleanAgentColors(stored);
  assert.strictEqual(result["Valid"], "#2563EB");
  assert.strictEqual(result["InvalidHex"], undefined);
  assert.strictEqual(result[""], undefined);
});
