// sanitize.mjs — server-side sanitizer for every event, applied on ingest and
// again on read so rows stored before it existed are scrubbed.
//
// The public board never trusts the client to keep secrets, PII or file contents out:
//   - whitelist fields (unknown top-level and nested keys are dropped)
//   - collapse multi-line text / code into one line, strip control chars
//   - redact secrets (tokens, API keys, JWTs, private keys, key=value secrets,
//     long high-entropy strings), emails, phone numbers, card numbers, SSNs,
//     street addresses, home-directory paths, URL credentials and query strings
//   - cap lengths
// Returns { event, redactions } where redactions counts replacements.

const LIMITS = {
  agent: 64, surface: 32, project: 300,
  summary: 240, task: 200, run_id: 80,
  question: 480, option: 120, options: 3, note: 480, label: 80, url: 300,
  artefacts: 10, source: 120,
};

const EVENT_TYPES = new Set(["session_start", "heartbeat", "blocked", "session_end"]);
const BLOCKER_KINDS = new Set(["ambiguity", "missing_credential", "failing_dep", "design_call", "access", "other"]);
const OUTCOME_STATUSES = new Set(["shipped", "abandoned", "handed_off", "failed"]);
const ARTEFACT_KINDS = new Set(["pr", "commit", "deploy", "doc", "design", "other"]);
const TRIGGER_SYNONYMS = {
  user: "user", human: "user", manual: "user", prompt: "user",
  routine: "routine", cron: "routine", scheduled: "routine", schedule: "routine", timer: "routine",
  agent: "agent", autonomous: "agent", bot: "agent", handoff: "agent",
};

const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, "[redacted key]"],
  [/\bflt_(?!XXXXXXXX\b)[A-Za-z0-9]{8,}/g, "flt_XXXXXXXX"],
  [/\b(?:sk|rk|pk)[-_](?:live|test|proj|ant|or)?[-_]?[A-Za-z0-9_-]{16,}/g, "[redacted key]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "[redacted key]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "[redacted key]"],
  [/\bglpat-[A-Za-z0-9_-]{16,}/g, "[redacted key]"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, "[redacted key]"],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "[redacted key]"],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, "[redacted key]"],
  [/\bnfp_[A-Za-z0-9]{20,}/g, "[redacted key]"],
  [/\bnpm_[A-Za-z0-9]{30,}/g, "[redacted key]"],
  [/\bphx_[A-Za-z0-9]{20,}/g, "[redacted key]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "[redacted token]"],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, "$1 [redacted]"],
  [/\b(password|passwd|pwd|passphrase|secret|client[_-]?secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|auth|cookie|session[_-]?id)(\s*[:=]\s*|\s+is\s+)("[^"]*"|'[^']*'|\S+)/gi, "$1$2[redacted]"],
];

const PII_PATTERNS = [
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1"],
  [/\b(?!git@)[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]"],
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[id]"],
  [/(?<![\w$.])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g, "[phone]"],
  [/(?<![\w$.])\+\d{1,3}[\s.-]?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?!\d)/g, "[phone]"],
  [/\b\d{1,5}\s+(?:[NSEW]\.?\s+)?(?:[A-Z][a-z]+\s+){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Ter|Terrace|Pkwy|Parkway)\b\.?(?:\s*(?:#|Apt\.?|Unit|Suite)\s*\w+)?/g, "[address]"],
  [/(?:\/Users|\/home)\/[A-Za-z0-9._-]+/g, "~"],
  [/\b[A-Z]:\\Users\\[^\\\s]+/gi, "~"],
];

function luhnOk(digits) {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return sum % 10 === 0;
}

function redactCards(s, count) {
  return s.replace(/\b(?:\d[ -]?){12,18}\d\b/g, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnOk(digits)) { count.n++; return "[card]"; }
    return m;
  });
}

function redactEntropy(s, count) {
  return s.replace(/[A-Za-z0-9_+/=-]{32,}/g, (m) => {
    if (/^[0-9a-f-]+$/i.test(m) && m.length <= 64) return m;
    if (/^[a-z-]+$/i.test(m)) return m;
    const hasDigit = /\d/.test(m), hasUpper = /[A-Z]/.test(m), hasLower = /[a-z]/.test(m);
    if ((hasDigit && hasUpper && hasLower) || (hasDigit && (hasUpper || hasLower) && m.length >= 40)) {
      count.n++; return "[redacted]";
    }
    return m;
  });
}

function stripUrlQueries(s, count) {
  return s.replace(/\bhttps?:\/\/[^\s<>"']+/gi, (u) => {
    const cut = u.search(/[?#]/);
    if (cut === -1) return u;
    count.n++;
    return u.slice(0, cut);
  });
}

export const INVISIBLE_RE = /[\u{E0000}-\u{E007F}\u202A-\u202E\u2066-\u2069\u2060-\u2064]/gu;
export function stripInvisible(raw) {
  return typeof raw === "string" ? raw.replace(INVISIBLE_RE, "") : raw;
}

export function scrubText(raw, max, count = { n: 0 }) {
  if (typeof raw !== "string") return undefined;
  let s = stripInvisible(raw)
    .replace(/```[\s\S]*?(```|$)/g, " [code] ")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g, " ")
    .replace(/\s*[\r\n\t]+\s*/g, " ");
  for (const [re, rep] of SECRET_PATTERNS) s = s.replace(re, (...m) => { count.n++; return m[0].replace(re, rep); });
  s = stripUrlQueries(s, count);
  for (const [re, rep] of PII_PATTERNS) s = s.replace(re, (...m) => { count.n++; return m[0].replace(re, rep); });
  s = redactCards(s, count);
  s = redactEntropy(s, count);
  s = s.replace(/\s{2,}/g, " ").trim();
  if (max && s.length > max) s = s.slice(0, max - 1).trimEnd() + "…";
  return s || undefined;
}

function scrubUrl(raw, count) {
  if (typeof raw !== "string") return undefined;
  let u;
  try { u = new URL(raw.trim()); } catch { return undefined; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
  if (u.username || u.password || u.search || u.hash) count.n++;
  u.username = ""; u.password = ""; u.search = ""; u.hash = "";
  const out = scrubText(u.toString(), LIMITS.url, count);
  return out && /^https?:\/\//.test(out) ? out : undefined;
}

const nonNegInt = (v) => (Number.isInteger(v) && v >= 0 && v < 1e7 ? v : undefined);
const tokenInt = (v) => (Number.isInteger(v) && v >= 0 && v < 1e11 ? v : undefined);
const prune = (o) => {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return Object.keys(o).length ? o : undefined;
};

export function normalizeTrigger(t) {
  if (t === undefined || t === null || t === "") return undefined;
  if (typeof t !== "string") return t;
  return TRIGGER_SYNONYMS[t.trim().toLowerCase()] || t;
}

function usage(u, c) {
  if (!u || typeof u !== "object" || Array.isArray(u)) return undefined;
  const out = prune({
    input_tokens: tokenInt(u.input_tokens),
    output_tokens: tokenInt(u.output_tokens),
    source: scrubText(u.source, 40, c),
  });
  return out && (out.input_tokens !== undefined || out.output_tokens !== undefined) ? out : undefined;
}

function cleanVersion(raw) {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (s.length > 32 || !/^v?\d{1,6}\.\d{1,6}\.\d{1,6}(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/i.test(s)) return undefined;
  return s;
}

export function sanitizeEvent(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return { event: e, redactions: 0 };
  const c = { n: 0 };
  const out = {
    event: EVENT_TYPES.has(e.event) ? e.event : e.event,
    run_id: typeof e.run_id === "string" ? e.run_id.trim().slice(0, LIMITS.run_id).replace(/[^\w.:-]/g, "") || undefined : e.run_id,
    ts: e.ts,
    agent: scrubText(e.agent, LIMITS.agent, c),
    surface: scrubText(e.surface, LIMITS.surface, c),
    project: scrubText(e.project, LIMITS.project, c),
    trigger: normalizeTrigger(e.trigger),
    visibility: e.visibility === "private" || e.private === true ? "private" : e.visibility === "public" ? "public" : undefined,
    summary: typeof e.summary === "string" ? scrubText(e.summary, LIMITS.summary, c) : e.summary,
    task: scrubText(e.task, LIMITS.task, c),
  };
  if (e.source && typeof e.source === "object") {
    out.source = prune({
      repo: scrubText(e.source.repo, LIMITS.source, c),
      branch: scrubText(e.source.branch, LIMITS.source, c),
      linear_issue: scrubText(e.source.linear_issue, 40, c),
      vercel_project: scrubText(e.source.vercel_project, LIMITS.source, c),
    });
  }
  if (e.progress && typeof e.progress === "object") {
    out.progress = prune({
      commits: nonNegInt(e.progress.commits),
      files_changed: nonNegInt(e.progress.files_changed),
      tests_passing: nonNegInt(e.progress.tests_passing),
      tests_failing: nonNegInt(e.progress.tests_failing),
    });
  }
  if (e.blocker && typeof e.blocker === "object") {
    const options = Array.isArray(e.blocker.options)
      ? e.blocker.options.slice(0, LIMITS.options).map((o) => scrubText(o, LIMITS.option, c)).filter(Boolean)
      : undefined;
    out.blocker = prune({
      kind: BLOCKER_KINDS.has(e.blocker.kind) ? e.blocker.kind : undefined,
      question: scrubText(e.blocker.question, LIMITS.question, c),
      options: options && options.length ? options : undefined,
    });
  } else if (e.blocker !== undefined) {
    out.blocker = e.blocker;
  }
  if (e.client && typeof e.client === "object" && !Array.isArray(e.client)) {
    out.client = prune({ skill_version: cleanVersion(e.client.skill_version) });
  }
  if (e.outcome && typeof e.outcome === "object") {
    const artefacts = Array.isArray(e.outcome.artefacts)
      ? e.outcome.artefacts.slice(0, LIMITS.artefacts).map((a) => a && typeof a === "object" ? prune({
          kind: ARTEFACT_KINDS.has(a.kind) ? a.kind : "other",
          url: scrubUrl(a.url, c),
          label: scrubText(a.label, LIMITS.label, c),
        }) : undefined).filter((a) => a && a.url)
      : undefined;
    out.outcome = prune({
      status: OUTCOME_STATUSES.has(e.outcome.status) ? e.outcome.status : e.outcome.status,
      note: scrubText(e.outcome.note, LIMITS.note, c),
      artefacts: artefacts && artefacts.length ? artefacts : undefined,
      usage: usage(e.outcome.usage, c),
    });
  } else if (e.outcome !== undefined) {
    out.outcome = e.outcome;
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return { event: out, redactions: c.n };
}
