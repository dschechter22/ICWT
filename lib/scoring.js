// This league's scoring rules, as configured in ESPN. Field names on the
// right are Sleeper's raw per-player stat keys (same shape the player-detail
// page already pulls from api.sleeper.com/stats/nfl/player/{id}). Missing
// stats score as 0 rather than throwing, since a bye-week or DNP player's
// stat line is legitimately empty.
//
// Kicking is yardage-based (no flat make bonus) with separate miss penalties
// bucketed by distance — mirrors ESPN's "distance-based" kicker scoring
// exactly as configured, not the more common flat-3/4/5 scheme.
const RULES = {
  pass_yd: 0.04,
  pass_td: 6,
  pass_int: -2,
  pass_2pt: 2,

  rush_yd: 0.1,
  rush_td: 6,
  rush_fd: 0.5,
  rush_2pt: 2,

  rec: 0.5,
  rec_yd: 0.1,
  rec_td: 6,
  rec_fd: 0.5,
  rec_2pt: 2,

  xpm: 1,
  fgm_yds: 0.1,
  fgmiss_0_39: -1,
  fgmiss_40_49: -1,
  fgmiss_50_59: -1,

  kr_td: 6,
  pr_td: 6,
  fum_rec_td: 6,
  fum_lost: -2,
  int_td: 6,
  fum_ret_td: 6,
  blk_kick_ret_td: 6,
  '2pt_ret': 2,
  safe: 1,
}

// Sleeper's raw field names vary slightly by source; this maps the common
// aliases seen in their per-player and per-week payloads onto the RULES keys
// above so either shape scores the same way.
const ALIASES = {
  pass_yd: ['pass_yd', 'py'],
  pass_td: ['pass_td', 'pass_td_lng', 'ptd'],
  pass_int: ['pass_int', 'int'],
  pass_2pt: ['pass_2pt'],
  rush_yd: ['rush_yd', 'ry'],
  rush_td: ['rush_td', 'rtd'],
  rush_fd: ['rush_fd'],
  rush_2pt: ['rush_2pt'],
  rec: ['rec'],
  rec_yd: ['rec_yd', 'rey'],
  rec_td: ['rec_td', 'retd'],
  rec_fd: ['rec_fd'],
  rec_2pt: ['rec_2pt'],
  xpm: ['xpm', 'fgm_pat'],
  fgm_yds: ['fgm_yds'],
  fgmiss_0_39: ['fgmiss_0_19', 'fgmiss_20_29', 'fgmiss_30_39'],
  fgmiss_40_49: ['fgmiss_40_49'],
  fgmiss_50_59: ['fgmiss_50_59', 'fgmiss_60p'],
  kr_td: ['kr_td'],
  pr_td: ['pr_td'],
  fum_rec_td: ['fum_rec_td'],
  fum_lost: ['fum_lost'],
  int_td: ['def_int_td', 'int_td'],
  fum_ret_td: ['fum_ret_td'],
  blk_kick_ret_td: ['blk_kick_ret_td'],
  '2pt_ret': ['def_2pt', '2pt_ret'],
  safe: ['safe'],
}

const statValue = (stats, ruleKey) => {
  const aliases = ALIASES[ruleKey] || [ruleKey]
  return aliases.reduce((sum, key) => sum + (stats?.[key] || 0), 0)
}

/** Fantasy points for one player's raw Sleeper stat line, under this league's rules. */
export function scorePlayer(stats) {
  if (!stats) return 0
  return Object.entries(RULES).reduce((total, [key, pts]) => total + statValue(stats, key) * pts, 0)
}

/**
 * Live points for a roster this week: sums scorePlayer() for whichever
 * players are in the app's heuristic "starting lineup" (best current-week
 * projection, falling back to season avg_pts for anyone with no projection).
 * This is an approximation, not a read of ESPN's actual set lineup — the app
 * has no record of who a manager benched, so it always scores the strongest
 * available nine.
 */
export function liveTeamScore(entries, weekStatsByPlayerId) {
  const withLive = entries.map(e => ({
    ...e,
    liveScore: e.player?.sleeper_id ? scorePlayer(weekStatsByPlayerId[e.player.sleeper_id]) : 0,
  }))
  const byPos = { QB: [], RB: [], WR: [], TE: [], K: [], 'D/ST': [] }
  withLive.forEach(e => { if (byPos[e.player?.position]) byPos[e.player.position].push(e) })
  const rank = e => (e.proj ?? e.avg_pts ?? -1)
  Object.values(byPos).forEach(a => a.sort((x, y) => rank(y) - rank(x)))

  const starters = []
  const usedIds = new Set()
  const take = (pos, slot, n = 1) => {
    for (let i = 0; i < n; i++) {
      const p = byPos[pos]?.find(e => !usedIds.has(e.id))
      if (p) { usedIds.add(p.id); starters.push({ ...p, slot }) }
    }
  }
  take('QB', 'QB'); take('RB', 'RB', 2); take('WR', 'WR', 2); take('TE', 'TE')
  take('D/ST', 'D/ST'); take('K', 'K')
  const flexPool = [...byPos.RB, ...byPos.WR, ...byPos.TE].filter(e => !usedIds.has(e.id)).sort((a, b) => rank(b) - rank(a))
  if (flexPool[0]) { usedIds.add(flexPool[0].id); starters.push({ ...flexPool[0], slot: 'FLEX' }) }
  if (flexPool[1]) { usedIds.add(flexPool[1].id); starters.push({ ...flexPool[1], slot: 'FLEX' }) }

  return {
    starters,
    total: starters.reduce((s, e) => s + e.liveScore, 0),
  }
}
