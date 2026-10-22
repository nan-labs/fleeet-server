// size.mjs — task size per session. Computed from a run's events and returned
// as `size` (XS|S|M|L|XL|null) and `size_basis` ("proxy" | "tokens" | null).
//
// Only finished runs are sized (a session_end exists); open runs get null.
// tokens: when any session_end carries outcome.usage with token counts, the
//   real total decides the bucket.
// proxy: otherwise each available signal gives a bucket and the largest wins:
//     duration       first session_start → last session_end
//     heartbeats     number of heartbeat events
//     artefacts      outcome.artefacts on the session_end
//     files_changed  the largest progress.files_changed seen

export const SIZES = ["XS", "S", "M", "L", "XL"];

export const SIZE_THRESHOLDS = {
  duration_min: [2, 10, 30, 120],
  heartbeats: [1, 2, 4, 8],
  artefacts: [1, 2, 4, 6],
  files_changed: [3, 10, 30, 100],
  tokens: [50_000, 250_000, 1_000_000, 5_000_000],
};

function bucket(value, bounds) {
  let i = 0;
  while (i < bounds.length && value >= bounds[i]) i++;
  return i;
}

const tokenCount = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);

export function sessionSize(events) {
  const none = { size: null, size_basis: null };
  const list = (events || []).filter((e) => e && typeof e === "object");
  const ends = list.filter((e) => e.event === "session_end");
  if (!ends.length) return none;

  let usage = null;
  for (const e of ends) {
    const u = e.outcome && e.outcome.usage;
    if (u && (Number.isFinite(u.input_tokens) || Number.isFinite(u.output_tokens))) {
      const total = tokenCount(u.input_tokens) + tokenCount(u.output_tokens);
      usage = Math.max(usage ?? 0, total);
    }
  }
  if (usage !== null) return { size: SIZES[bucket(usage, SIZE_THRESHOLDS.tokens)], size_basis: "tokens" };

  const ts = (e) => Date.parse(e.ts);
  const starts = list.filter((e) => e.event === "session_start").map(ts).filter(Number.isFinite);
  const endTs = ends.map(ts).filter(Number.isFinite);
  const heartbeats = list.filter((e) => e.event === "heartbeat").length;
  const artefacts = Math.max(0, ...ends.map((e) => (Array.isArray(e.outcome?.artefacts) ? e.outcome.artefacts.length : 0)));
  const files = Math.max(0, ...list.map((e) => (Number.isInteger(e.progress?.files_changed) ? e.progress.files_changed : 0)));

  const votes = [];
  if (starts.length && endTs.length) {
    const minutes = Math.max(0, Math.max(...endTs) - Math.min(...starts)) / 60000;
    votes.push(bucket(minutes, SIZE_THRESHOLDS.duration_min));
  }
  if (starts.length || heartbeats) votes.push(bucket(heartbeats, SIZE_THRESHOLDS.heartbeats));
  if (artefacts > 0) votes.push(bucket(artefacts, SIZE_THRESHOLDS.artefacts));
  if (files > 0) votes.push(Math.max(0, bucket(files, SIZE_THRESHOLDS.files_changed)));
  if (!votes.length) return none;
  return { size: SIZES[Math.max(...votes)], size_basis: "proxy" };
}

export function sessionSizes(events) {
  const byRun = new Map();
  for (const e of events || []) {
    if (!e || typeof e.run_id !== "string") continue;
    if (!byRun.has(e.run_id)) byRun.set(e.run_id, []);
    byRun.get(e.run_id).push(e);
  }
  const out = new Map();
  for (const [id, list] of byRun) out.set(id, sessionSize(list));
  return out;
}

export function withSizes(events) {
  const sizes = sessionSizes(events);
  return events.map((e) => {
    const s = (e && sizes.get(e.run_id)) || { size: null, size_basis: null };
    return { ...e, size: s.size, size_basis: s.size_basis };
  });
}
