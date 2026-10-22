// colors.mjs — agent identity colours.
//
// Each agent can have a badge/identity colour (preset swatch or any hex).
// Stored as { "<agent>": "#RRGGBB" }
//
// Collision rule: an identity colour must never be mistaken for "needs you".
// A colour is rejected when its OKLab distance (ΔEok) to any protected colour
// is below MIN_DISTANCE.

export const NEEDS_YOU = "#C2703D";
export const PROTECTED_COLORS = Object.freeze([
  { hex: "#C2703D", name: "needs-you orange" },
  { hex: "#A8592B", name: "needs-you text" },
  { hex: "#D9844F", name: "needs-you orange (dark mode)" },
  { hex: "#E8A070", name: "needs-you text (dark mode)" },
]);
export const MIN_DISTANCE = 0.1;

export const PRESET_COLORS = Object.freeze(["#2563EB", "#0D9488", "#16A34A", "#7C3AED", "#DB2777", "#64748B"]);

export const MAX_AGENT_COLORS = 100;
export const MAX_AGENT_NAME = 80;

export function normalizeHex(v) {
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.replace(/./g, (c) => c + c);
  return /^[0-9a-f]{6}$/i.test(s) ? "#" + s.toUpperCase() : null;
}

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function oklab(hex) {
  const h = normalizeHex(hex);
  if (!h) throw new Error("bad hex");
  const n = parseInt(h.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => lin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function deltaEOK(a, b) {
  const x = oklab(a), y = oklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

export function checkAgentColor(v) {
  const hex = normalizeHex(v);
  if (!hex) return { ok: false, error: "bad_hex" };
  let worst = null;
  for (const p of PROTECTED_COLORS) {
    const d = deltaEOK(hex, p.hex);
    if (!worst || d < worst.d) worst = { d, p };
  }
  if (worst.d < MIN_DISTANCE) {
    return { ok: false, error: "too_close", hex, near: worst.p.hex, near_name: worst.p.name, distance: Math.round(worst.d * 1000) / 1000 };
  }
  return { ok: true, hex };
}

const cleanName = (k) => (typeof k === "string" ? k.trim() : "");

export function mergeAgentColors(current, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { errors: [{ error: "agent_colors must be an object of { agent: \"#RRGGBB\" | null }" }] };
  }
  const next = { ...(current && typeof current === "object" ? current : {}) };
  const errors = [];
  for (const [rawName, value] of Object.entries(input)) {
    const agent = cleanName(rawName);
    if (!agent || agent.length > MAX_AGENT_NAME) {
      errors.push({ agent: String(rawName).slice(0, MAX_AGENT_NAME), error: "bad_agent" });
      continue;
    }
    for (const k of Object.keys(next)) if (k.toLowerCase() === agent.toLowerCase()) delete next[k];
    if (value === null || value === "") continue;
    const c = checkAgentColor(value);
    if (!c.ok) {
      const { ok, ...rest } = c;
      errors.push({ agent, ...rest });
      continue;
    }
    next[agent] = c.hex;
  }
  if (!errors.length && Object.keys(next).length > MAX_AGENT_COLORS) {
    errors.push({ error: `too many agent colours (max ${MAX_AGENT_COLORS})` });
  }
  return errors.length ? { errors } : { colors: next };
}

export function cleanAgentColors(stored) {
  const out = {};
  if (!stored || typeof stored !== "object") return out;
  for (const [k, v] of Object.entries(stored)) {
    const name = cleanName(k), hex = normalizeHex(v);
    if (name && name.length <= MAX_AGENT_NAME && hex) out[name] = hex;
  }
  return out;
}

export function visibleAgentColors(colors, events) {
  const seen = new Set(events.map((e) => String(e?.agent ?? "").trim().toLowerCase()));
  return Object.fromEntries(Object.entries(colors).filter(([k]) => seen.has(k.toLowerCase())));
}
