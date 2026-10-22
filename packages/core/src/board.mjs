// board.mjs — what the public board may show.
//
// Personal runs are HIDDEN, never deleted. A run is hidden when any of:
//   - one of its events was sent with visibility: "private"
//   - the owner hid the run id
//   - its agent or project is on the board's hidden list, unless the run
//     explicitly says visibility: "public"

import { cleanAgentColors } from "./colors.mjs";

const norm = (s) => String(s ?? "").trim().toLowerCase();
const cleanList = (v) =>
  Array.isArray(v)
    ? [...new Set(v.filter((x) => typeof x === "string").map((x) => x.trim().slice(0, 80)).filter(Boolean))].slice(0, 100)
    : undefined;

export function boardSettings(account) {
  const s = account?.board_settings || {};
  return {
    hidden_agents: s.hidden_agents ?? [],
    hidden_projects: s.hidden_projects ?? [],
    public_projects: s.public_projects ?? [],
    agent_colors: cleanAgentColors(s.agent_colors),
  };
}

export function settingsPatch(body) {
  const out = {};
  const agents = cleanList(body?.hidden_agents);
  const projects = cleanList(body?.hidden_projects);
  if (agents) out.hidden_agents = agents;
  if (projects) out.hidden_projects = projects;
  const allow = cleanList(body?.public_projects);
  if (allow) out.public_projects = allow;
  return out;
}

export function hiddenRunIds(events, settings, hiddenRuns = new Set()) {
  const agents = new Set(settings.hidden_agents.map(norm));
  const projects = new Set(settings.hidden_projects.map(norm));
  const hidden = new Set(hiddenRuns);
  const explicitPublic = new Set(events.filter((e) => e.visibility === "public").map((e) => e.run_id));
  const allow = new Set((settings.public_projects || []).map(norm));
  const allowedRuns = new Set(events.filter((e) => e.project && allow.has(norm(e.project))).map((e) => e.run_id));
  for (const e of events) {
    if (e.visibility === "private") hidden.add(e.run_id);
    else if (allow.size && !explicitPublic.has(e.run_id) && !allowedRuns.has(e.run_id)) hidden.add(e.run_id);
    else if (!explicitPublic.has(e.run_id) && (agents.has(norm(e.agent)) || (e.project && projects.has(norm(e.project))))) {
      hidden.add(e.run_id);
    }
  }
  return hidden;
}
