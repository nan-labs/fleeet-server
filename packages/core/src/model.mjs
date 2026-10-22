// model.mjs — event data model rules, shared by ingest and public read path.
//
//   trigger     user | routine | agent, default "user" (synonyms like "cron" are mapped by sanitizer)
//   surface     where the agent runs, normalised to one spelling per product
//   project     the workspace/repo/project name. Trimmed, whitespace collapsed,
//               owner/repo reduced to the repo, ".git" dropped, max 80.
//               Case is kept. Missing → source.repo → "general".
//   agent       the agent's own name. Generic placeholders ("agent", "box", ...)
//               never reach the board: token label → surface → error.

const GENERIC_AGENTS = new Set([
  "", "mcp-client", "mcp client", "mcp_client", "mcpclient", "client",
  "assistant", "ai", "unknown", "agent", "box", "bot", "the box",
]);

export function isGenericAgent(a) {
  if (typeof a !== "string") return true;
  return GENERIC_AGENTS.has(a.trim().toLowerCase());
}

const SURFACES = [
  [/^claude[\s._-]*ai$/i, "claude.ai"],
  [/^claude[\s._-]*code$/i, "Claude Code"],
  [/^claude[\s._-]*desktop$/i, "Claude Desktop"],
  [/^cursor([\s._-]*(agent|ide|bg|background))?$/i, "Cursor"],
  [/^(chat[\s._-]*gpt|openai)$/i, "ChatGPT"],
  [/^(grok|grok[\s._-]*bot)$/i, "Grok Bot"],
  [/^(vs[\s._-]*code|visual studio code)$/i, "VS Code"],
  [/^zed$/i, "Zed"],
  [/^codex([\s._-]*cli)?$/i, "Codex"],
];

export function normalizeSurface(raw) {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const s = raw.trim();
  for (const [re, name] of SURFACES) if (re.test(s)) return name;
  return s.slice(0, 32);
}

export const MAX_PROJECT = 80;
export const GENERAL_PROJECT = "general";

export function repoName(raw) {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const s = raw.trim().replace(/\.git$/i, "").replace(/[/\\]+$/, "");
  const last = s.split(/[/\\:]/).filter(Boolean).pop();
  return last ? capProject(last) : undefined;
}

function capProject(s) {
  const cps = [...s];
  return (cps.length > MAX_PROJECT ? cps.slice(0, MAX_PROJECT).join("") : s).trim();
}

export function cleanProject(raw) {
  if (typeof raw !== "string") return undefined;
  let p = raw.replace(/\s+/g, " ").trim();
  if (!p) return undefined;
  const url = p.match(/^(?:[a-z][a-z0-9+.-]*:\/\/[^/\s]+|git@[^:\s]+:)\/?(\S*)$/i);
  if (url) {
    const segs = url[1].replace(/\.git$/i, "").split("/").filter(Boolean);
    p = segs.length >= 2 ? segs[1] : segs[0] || "";
  } else if (!/\s/.test(p) && /[/\\]/.test(p)) {
    p = p.split(/[/\\]/).filter(Boolean).pop() || "";
  }
  p = p.replace(/\.git$/i, "").trim();
  return p ? capProject(p) : undefined;
}

export function normalizeProject(project, source) {
  return cleanProject(project) || cleanProject(source?.repo) || GENERAL_PROJECT;
}

export function applyModel(e, { label } = {}) {
  if (!e || typeof e !== "object") return { event: e };
  const out = { trigger: "user", ...e };
  const surface = normalizeSurface(out.surface);
  if (surface) out.surface = surface; else delete out.surface;
  out.project = normalizeProject(out.project, out.source);
  if (isGenericAgent(out.agent)) {
    if (label) out.agent = label;
    else if (surface && !isGenericAgent(surface)) out.agent = surface;
    else {
      return {
        error: `agent: send your own name (e.g. "Claude", "Elliot"); generic names like "${out.agent || ""}" are retired`,
      };
    }
  }
  return { event: out };
}

export function legacyDisplay(e) {
  const out = { ...e };
  if (!out.trigger) out.trigger = "user";
  const agent = String(out.agent || "").trim().toLowerCase();
  if (/^mcp[-_ ]?client$/.test(agent)) {
    out.agent = "Claude";
    out.surface = out.surface || "claude.ai";
  } else if (isGenericAgent(out.agent)) {
    out.agent = normalizeSurface(out.surface) || "Agent";
  }
  const surface = normalizeSurface(out.surface);
  if (surface) out.surface = surface;
  out.project = normalizeProject(out.project, out.source);
  return out;
}
