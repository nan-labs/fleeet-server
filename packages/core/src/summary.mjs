// summary.mjs — snapshot counts: volume only, no run text.

export const PERIODS = { day: 86400000, week: 7 * 86400000 };

// SNAPSHOT-COUNTS-BEGIN
function snapshotCounts(runs, now, period) {
  const span = period === "week" ? 7 * 86400000 : 86400000;
  const cur = runs.filter((r) => r.lastAt >= now - span && r.lastAt <= now);
  const prev = runs.filter((r) => r.lastAt >= now - 2 * span && r.lastAt < now - span);
  const agents = (l) => new Set(l.map((r) => r.agent)).size;
  const tasks = cur.length, prevTasks = prev.length;
  const delta = prevTasks >= 5 ? Math.round(((tasks - prevTasks) / prevTasks) * 100) : null;
  const named = cur.filter((r) => typeof r.project === "string" && r.project.trim() && r.project.trim().toLowerCase() !== "general")
    .sort((a, b) => a.lastAt - b.lastAt);
  const keys = new Set(named.map((r) => r.project.trim().toLowerCase()));
  const heads = new Map();
  for (const k of keys) { const t = k.split(/[-\s_]/)[0]; if (t && t !== k) heads.set(t, (heads.get(t) || 0) + 1); }
  const parentOf = (k) => { const t = k.split(/[-\s_]/)[0]; return t && t !== k && (keys.has(t) || heads.get(t) >= 2) ? t : k; };
  const title = (s) => s.split(/[-\s_]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  const by = new Map();
  for (const r of named) {
    const raw = r.project.trim(), k = parentOf(raw.toLowerCase());
    const g = by.get(k) || { label: title(k === raw.toLowerCase() ? raw : raw.slice(0, k.length)), count: 0 };
    if (!by.has(k) && keys.has(k)) { const own = named.find((x) => x.project.trim().toLowerCase() === k); g.label = title(own.project.trim()); }
    g.count++; by.set(k, g);
  }
  let other = cur.length - named.length;
  const sorted = [...by.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  other += sorted.slice(5).reduce((n, g) => n + g.count, 0);
  const groups = sorted.slice(0, 5).concat(other ? [{ label: "Other", count: other, other: true }] : []);
  return { period: period === "week" ? "week" : "day", tasks, agents: agents(cur), prev_tasks: prevTasks, prev_agents: agents(prev), delta, fresh: !prevTasks && tasks > 0, groups };
}
// SNAPSHOT-COUNTS-END
export { snapshotCounts };
