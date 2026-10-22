// token.mjs — token helpers: hashing, generation, and constant-time comparison

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { stripInvisible } from "./sanitize.mjs";

export const TOKEN_PREFIX = "flt_";
export const MAX_LABEL_LENGTH = 64;
const MINTED_RE = /^flt_[A-Za-z0-9]{32}$/;
const B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function cleanLabel(raw) {
  if (typeof raw !== "string") return undefined;
  const s = stripInvisible(raw).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, MAX_LABEL_LENGTH) : undefined;
}

export function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

export function newToken() {
  let out = "";
  while (out.length < 32) {
    for (const b of randomBytes(48)) {
      if (b < 248 && out.length < 32) out += B62[b % 62];
    }
  }
  return TOKEN_PREFIX + out;
}

export function isMintedFormat(token) {
  return typeof token === "string" && MINTED_RE.test(token);
}

export function bearer(req) {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function compareTokens(a, b) {
  return safeEqual(a, b);
}
