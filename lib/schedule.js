// The league runs the same fixture list every year: a 9-round robin across
// weeks 1-9, then weeks 10-11 replay weeks 1-2 with home/away flipped.
// Pairs are [home, away] by manager name.
export const SCHEDULE = [
  // Week 1
  [['Frank Carris', 'AJ Weine'], ['Aiden Foreman', 'Ethan Pestine'], ['Jake Freed', 'Drew Ruchim'], ['Justin Tumpowsky', 'Brandon Turofsky'], ['Brandon Frankel', 'Danny Schechter']],
  // Week 2
  [['AJ Weine', 'Ethan Pestine'], ['Drew Ruchim', 'Frank Carris'], ['Brandon Turofsky', 'Aiden Foreman'], ['Danny Schechter', 'Jake Freed'], ['Brandon Frankel', 'Justin Tumpowsky']],
  // Week 3
  [['Drew Ruchim', 'AJ Weine'], ['Ethan Pestine', 'Brandon Turofsky'], ['Frank Carris', 'Danny Schechter'], ['Aiden Foreman', 'Brandon Frankel'], ['Jake Freed', 'Justin Tumpowsky']],
  // Week 4
  [['AJ Weine', 'Brandon Turofsky'], ['Danny Schechter', 'Drew Ruchim'], ['Brandon Frankel', 'Ethan Pestine'], ['Justin Tumpowsky', 'Frank Carris'], ['Jake Freed', 'Aiden Foreman']],
  // Week 5
  [['Danny Schechter', 'AJ Weine'], ['Brandon Turofsky', 'Brandon Frankel'], ['Drew Ruchim', 'Justin Tumpowsky'], ['Ethan Pestine', 'Jake Freed'], ['Frank Carris', 'Aiden Foreman']],
  // Week 6
  [['AJ Weine', 'Brandon Frankel'], ['Justin Tumpowsky', 'Danny Schechter'], ['Jake Freed', 'Brandon Turofsky'], ['Aiden Foreman', 'Drew Ruchim'], ['Frank Carris', 'Ethan Pestine']],
  // Week 7
  [['Justin Tumpowsky', 'AJ Weine'], ['Brandon Frankel', 'Jake Freed'], ['Danny Schechter', 'Aiden Foreman'], ['Brandon Turofsky', 'Frank Carris'], ['Drew Ruchim', 'Ethan Pestine']],
  // Week 8
  [['AJ Weine', 'Jake Freed'], ['Aiden Foreman', 'Justin Tumpowsky'], ['Frank Carris', 'Brandon Frankel'], ['Ethan Pestine', 'Danny Schechter'], ['Drew Ruchim', 'Brandon Turofsky']],
  // Week 9
  [['Aiden Foreman', 'AJ Weine'], ['Jake Freed', 'Frank Carris'], ['Justin Tumpowsky', 'Ethan Pestine'], ['Brandon Frankel', 'Drew Ruchim'], ['Danny Schechter', 'Brandon Turofsky']],
  // Week 10 — Week 1 rematch
  [['AJ Weine', 'Frank Carris'], ['Ethan Pestine', 'Aiden Foreman'], ['Drew Ruchim', 'Jake Freed'], ['Brandon Turofsky', 'Justin Tumpowsky'], ['Danny Schechter', 'Brandon Frankel']],
  // Week 11 — Week 2 rematch
  [['Ethan Pestine', 'AJ Weine'], ['Frank Carris', 'Drew Ruchim'], ['Aiden Foreman', 'Brandon Turofsky'], ['Jake Freed', 'Danny Schechter'], ['Justin Tumpowsky', 'Brandon Frankel']],
]

export const REG_SEASON_WEEKS = SCHEDULE.length

export const SCHEDULE_MANAGERS = [...new Set(SCHEDULE.flat(2))]

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** Matches a schedule manager name to a season's team row. */
const findTeam = (name, teams) => {
  const n = norm(name)
  const named = teams.map(t => ({ t, n: norm(t.manager?.name), team: norm(t.team_name) }))
  const exact = named.find(x => x.n === n)
  if (exact) return exact.t

  const parts = name.split('/').map(norm).filter(Boolean)
  for (const p of parts) {
    const hit = named.find(x => x.n === p || x.n.startsWith(p) || p.startsWith(x.n))
    if (hit) return hit.t
  }
  return named.find(x => x.n.includes(n) || n.includes(x.n) || x.team.includes(n))?.t || null
}

/**
 * Maps the fixed schedule onto a season's team rows.
 * Returns resolved games plus any manager names that couldn't be matched.
 */
export function resolveSchedule(teams) {
  if (!teams?.length) return { games: [], unresolved: SCHEDULE_MANAGERS }

  const lookup = {}
  const unresolved = []
  SCHEDULE_MANAGERS.forEach(name => {
    const t = findTeam(name, teams)
    if (t) lookup[name] = t
    else unresolved.push(name)
  })

  const games = []
  SCHEDULE.forEach((pairs, i) => {
    pairs.forEach(([home, away]) => {
      const h = lookup[home]
      const a = lookup[away]
      if (h && a) games.push({ week: i + 1, homeId: h.id, awayId: a.id })
    })
  })
  return { games, unresolved }
}

/**
 * Every game of a season: database rows where they exist, the fixed fixture
 * list for weeks that haven't synced. `useFixed` should be false for past
 * seasons, whose schedules are already complete in the database.
 */
export function buildFixtures({ matchups = [], teams = [], useFixed = true }) {
  const weeksWithRows = new Set(matchups.map(m => m.week))
  const out = matchups.map(m => ({
    key: m.id,
    week: m.week,
    homeId: m.home_team?.id,
    awayId: m.away_team?.id,
    m,
  }))
  if (useFixed) {
    resolveSchedule(teams).games.forEach(g => {
      if (weeksWithRows.has(g.week)) return
      out.push({ key: `s-${g.week}-${g.homeId}-${g.awayId}`, ...g, m: null })
    })
  }
  return out.filter(f => f.homeId && f.awayId)
}
