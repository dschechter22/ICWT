// Line-making + season simulation engine for the Predictions page.

export const DEFAULT_REG_WEEKS = 14
export const PLAYOFF_SPOTS = 6
export const BYE_SPOTS = 2

const PRIOR_GAMES = 4        // shrinkage weight toward league average
const FORM_WINDOW = 3        // recent games counted as "form"
const FALLBACK_SD = 22
const FALLBACK_AVG = 120     // scoring level assumed when there is no history at all

// Weight on the prior season's scoring level when setting this season's scale.
// Roughly two weeks of a ten-team league, so the scale eases across the Week 0
// boundary rather than lurching the moment the first results land.
const SCALE_PRIOR_GAMES = 20

// How much a supplied projection for the coming week is allowed to move a
// rating before any results exist. Decays as real games accumulate.
const PROJ_WEIGHT = 0.5

export const isPlayed = m => (m.home_score ?? 0) > 0 || (m.away_score ?? 0) > 0

export const round5 = n => Math.round(n * 2) / 2

export const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`)

// A zero spread is a pick'em, not a zero-point favourite.
export const fmtSpread = n => (n === 0 ? 'PK' : n > 0 ? `+${n}` : `${n}`)

const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)

const variance = a => {
  if (a.length < 2) return 0
  const m = mean(a)
  return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)
}

const median = a => {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2)
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z > 0 ? 1 - p : p
}

// Favorites bottom out near -4900 the way a real book caps them; longshots
// are allowed to stretch so a 0.3% team doesn't share a price with a 0.03% one.
export function americanFromProb(p) {
  const q = Math.min(Math.max(p, 0.001), 0.98)
  const raw = q >= 0.5 ? (-100 * q) / (1 - q) : (100 * (1 - q)) / q
  const abs = Math.abs(raw)
  const step = abs < 300 ? 5 : abs < 1000 ? 10 : 100
  const rounded = Math.sign(raw) * Math.round(abs / step) * step
  return Math.abs(rounded) < 100 ? Math.sign(rounded) * 100 : rounded
}

// Prices a two-way market with proportional overround.
export function priceTwoWay(pA, vig = 0.05) {
  const over = 1 + vig
  return [americanFromProb(pA * over), americanFromProb((1 - pA) * over)]
}

// Sum of the best available lineup's per-game averages — a roster-makeup projection.
export function projectedStarterPoints(entries) {
  const byPos = { QB: [], RB: [], WR: [], TE: [], K: [], 'D/ST': [] }
  entries.forEach(e => {
    const pos = e.player?.position
    if (byPos[pos]) byPos[pos].push(e.avg_pts || 0)
  })
  Object.values(byPos).forEach(a => a.sort((x, y) => y - x))
  const take = (pos, n) => byPos[pos].splice(0, n)
  const starters = [...take('QB', 1), ...take('RB', 2), ...take('WR', 2), ...take('TE', 1), ...take('D/ST', 1), ...take('K', 1)]
  const flex = [...byPos.RB, ...byPos.WR, ...byPos.TE].sort((a, b) => b - a)
  starters.push(...flex.slice(0, 2))
  return starters.reduce((s, v) => s + v, 0)
}

/**
 * League-wide scoring level and spread taken from a set of played games,
 * normally the seasons before the one being modelled. It anchors the scale for
 * a season that has not yet produced enough games of its own.
 *
 * Deliberately league-wide: it fixes where scoring sits without separating any
 * two teams, so it can inform Week 1 without prejudging it.
 */
export function leagueBaseline(matchups) {
  const scores = (matchups || []).filter(isPlayed).flatMap(m => [m.home_score, m.away_score])
  if (scores.length < 2) return { avg: FALLBACK_AVG, sd: FALLBACK_SD }
  return { avg: mean(scores), sd: Math.sqrt(variance(scores)) || FALLBACK_SD }
}

/**
 * Builds a per-team rating (projected weekly score) and volatility from every
 * game played through `throughWeek`.
 *
 * Only results already on the board inform a rating. Before a season's first
 * kickoff every team rates identically, so Week 1 is a coin flip across the
 * board and the field separates only as games are played.
 *
 * `weeklyProj` is the hook for a genuine forward projection (ESPN's, uploaded
 * before the week runs). `rosterProj` is carried for display only and is
 * deliberately kept out of the rating: `avg_pts` is a full-season average, so
 * feeding it in would let a season's outcome leak backwards into its own
 * Week 1 forecast.
 */
export function buildRatings({ teams, matchups, throughWeek, rosterProj = {}, baseline, weeklyProj = {} }) {
  const games = matchups.filter(m => m.week <= throughWeek && isPlayed(m))
  const weeks = [...new Set(games.map(m => m.week))].sort((a, b) => a - b)

  const td = {}
  teams.forEach(t => { td[t.id] = { team: t, scores: [], log: [], wins: 0, losses: 0, pf: 0, pa: 0, allPlaySum: 0 } })

  games.forEach(m => {
    const h = td[m.home_team?.id]
    const a = td[m.away_team?.id]
    if (h) {
      h.scores.push(m.home_score); h.pf += m.home_score; h.pa += m.away_score
      h.log.push({ week: m.week, score: m.home_score, opp: m.away_score })
      if (m.home_score > m.away_score) h.wins++; else if (m.home_score < m.away_score) h.losses++
    }
    if (a) {
      a.scores.push(m.away_score); a.pf += m.away_score; a.pa += m.home_score
      a.log.push({ week: m.week, score: m.away_score, opp: m.home_score })
      if (m.away_score > m.home_score) a.wins++; else if (m.away_score < m.home_score) a.losses++
    }
  })

  weeks.forEach(w => {
    const all = []
    games.filter(m => m.week === w).forEach(m => {
      all.push({ id: m.home_team?.id, score: m.home_score })
      all.push({ id: m.away_team?.id, score: m.away_score })
    })
    if (all.length < 2) return
    all.forEach(({ id, score }) => {
      if (td[id]) td[id].allPlaySum += all.filter(o => o.id !== id && score > o.score).length / (all.length - 1)
    })
  })

  const allScores = games.flatMap(m => [m.home_score, m.away_score])
  const prior = baseline || { avg: FALLBACK_AVG, sd: FALLBACK_SD }

  // Scale eases from last season's level to this one's as results land, so a
  // rating built through Week 0 and one built through Week 1 sit on the same
  // scale and can be compared directly.
  const priorVar = prior.sd ** 2
  const seasonVar = allScores.length > 1 ? variance(allScores) : priorVar
  const denom = allScores.length + SCALE_PRIOR_GAMES
  const leagueAvg = (allScores.reduce((s, x) => s + x, 0) + prior.avg * SCALE_PRIOR_GAMES) / denom
  const leagueVar = (allScores.length * seasonVar + SCALE_PRIOR_GAMES * priorVar) / denom
  const leagueSd = Math.sqrt(leagueVar)

  const base = Object.values(td).map(t => {
    const n = t.scores.length
    const games_ = t.wins + t.losses
    const winPct = games_ ? t.wins / games_ : 0
    const avgScore = n ? t.pf / n : 0
    const medScore = median(t.scores)
    const allPlayWinPct = weeks.length ? t.allPlaySum / weeks.length : 0

    // Nothing played yet means nothing to tell teams apart: everyone rates as
    // the league average team, so every Week 1 game prices as a coin flip.
    let rating = leagueAvg
    if (n > 0) {
      const shrunk = (t.pf + leagueAvg * PRIOR_GAMES) / (n + PRIOR_GAMES)
      const recent = [...t.log].sort((a, b) => b.week - a.week).slice(0, FORM_WINDOW).map(g => g.score)
      const form = n >= FORM_WINDOW ? mean(recent) : shrunk
      rating = 0.65 * shrunk + 0.35 * form
    }

    // A projection for the week ahead is a real forecast rather than hindsight,
    // so it may move the rating — hardest before any results exist, then fading
    // out as the season supplies its own evidence.
    const proj = weeklyProj[t.team.id] || 0
    if (proj > 0) {
      const w = PROJ_WEIGHT * (PRIOR_GAMES / (n + PRIOR_GAMES))
      rating = (1 - w) * rating + w * proj
    }

    const teamVar = n >= 2 ? variance(t.scores) : leagueVar
    const sigma = Math.sqrt((n * teamVar + PRIOR_GAMES * leagueVar) / (n + PRIOR_GAMES)) || FALLBACK_SD

    return {
      id: t.team.id,
      team: t.team,
      name: t.team.manager?.name || t.team.team_name || '?',
      teamName: t.team.team_name,
      wins: t.wins, losses: t.losses, pf: t.pf, pa: t.pa,
      gamesPlayed: n, winPct, avgScore, medScore, allPlayWinPct,
      luck: parseFloat((t.wins - t.allPlaySum).toFixed(2)),
      rosterProj: rosterProj[t.team.id] || 0,
      rating: parseFloat(rating.toFixed(2)),
      sigma: parseFloat(sigma.toFixed(2)),
    }
  })

  // Power score, same formula the Power Rankings page uses.
  const mx = key => Math.max(...base.map(r => r[key])) || 1
  const [mW, mA, mAp, mM] = [mx('winPct'), mx('avgScore'), mx('allPlayWinPct'), mx('medScore')]
  const rows = base.map(r => ({
    ...r,
    powerScore: parseFloat((
      (r.winPct / mW) * 100 * 2 +
      (r.avgScore / mA) * 100 * 4 +
      (r.allPlayWinPct / mAp) * 100 * 2 +
      (r.medScore / mM) * 100 * 2
    ) / 10 || 0),
  })).sort((a, b) => b.powerScore - a.powerScore)
    // Before any results every team scores zero and the order is arbitrary, so
    // there is no rank to report yet.
    .map((r, i) => ({ ...r, powerRank: weeks.length ? i + 1 : null }))

  const byId = Object.fromEntries(rows.map(r => [r.id, r]))
  return { rows, byId, leagueAvg, leagueSd, weeksPlayed: weeks.length }
}

// Spread / total / moneyline for one matchup. Spread is from team A's side.
export function makeLine(a, b, vig = 0.05) {
  const margin = a.rating - b.rating
  const sd = Math.sqrt(a.sigma ** 2 + b.sigma ** 2) || FALLBACK_SD * Math.SQRT2
  const pA = normalCdf(margin / sd)
  const [mlA, mlB] = priceTwoWay(pA, vig)
  return {
    projA: a.rating,
    projB: b.rating,
    spread: round5(-margin),
    total: round5(a.rating + b.rating),
    pA, pB: 1 - pA, mlA, mlB,
  }
}

let spare = null
const gauss = (m, sd) => {
  if (spare !== null) { const v = spare; spare = null; return m + sd * v }
  let u = 0, v = 0, s = 0
  do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s = u * u + v * v } while (s === 0 || s >= 1)
  const f = Math.sqrt((-2 * Math.log(s)) / s)
  spare = v * f
  return m + sd * u * f
}

/**
 * Monte Carlo of the rest of the regular season plus the playoff bracket.
 * `schedule` holds known unplayed matchups; `randomWeeks` covers weeks whose
 * pairings aren't in the database yet (simulated as neutral random pairings).
 */
export function simulateFutures({ rows, schedule = [], randomWeeks = 0, sims = 10000 }) {
  const n = rows.length
  if (n < 2) return []

  const idx = new Map(rows.map((r, i) => [r.id, i]))
  const known = schedule
    .map(g => [idx.get(g.homeId), idx.get(g.awayId)])
    .filter(([h, a]) => h != null && a != null)

  const maxWins = rows[0].wins + rows[0].losses + known.length + randomWeeks + n
  const tally = rows.map(() => new Array(maxWins + 1).fill(0))
  const counts = rows.map(() => ({ playoffs: 0, bye: 0, semis: 0, finals: 0, title: 0, winsSum: 0, seedSum: 0 }))

  const wins = new Array(n)
  const pf = new Array(n)
  const order = [...Array(n).keys()]

  const play = (i, j) => {
    const si = gauss(rows[i].rating, rows[i].sigma)
    const sj = gauss(rows[j].rating, rows[j].sigma)
    pf[i] += si; pf[j] += sj
    if (si >= sj) { wins[i]++; return i }
    wins[j]++
    return j
  }
  const winnerOf = (i, j) => (gauss(rows[i].rating, rows[i].sigma) >= gauss(rows[j].rating, rows[j].sigma) ? i : j)

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < n; i++) { wins[i] = rows[i].wins; pf[i] = rows[i].pf }

    for (const [h, a] of known) play(h, a)

    for (let w = 0; w < randomWeeks; w++) {
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[order[i], order[j]] = [order[j], order[i]]
      }
      for (let i = 0; i + 1 < n; i += 2) play(order[i], order[i + 1])
    }

    const seeds = [...Array(n).keys()].sort((a, b) => wins[b] - wins[a] || pf[b] - pf[a])
    for (let i = 0; i < n; i++) {
      const t = seeds[i]
      tally[t][Math.min(wins[t], maxWins)]++
      counts[t].winsSum += wins[t]
      counts[t].seedSum += i + 1
    }

    if (n < PLAYOFF_SPOTS) continue
    const p = seeds.slice(0, PLAYOFF_SPOTS)
    p.forEach(i => counts[i].playoffs++)
    p.slice(0, BYE_SPOTS).forEach(i => { counts[i].bye++; counts[i].semis++ })

    const q1 = winnerOf(p[2], p[5])
    const q2 = winnerOf(p[3], p[4])
    counts[q1].semis++; counts[q2].semis++

    // Top seed draws the worst remaining seed.
    const worse = p.indexOf(q1) > p.indexOf(q2) ? q1 : q2
    const better = worse === q1 ? q2 : q1
    const f1 = winnerOf(p[0], worse)
    const f2 = winnerOf(p[1], better)
    counts[f1].finals++; counts[f2].finals++
    counts[winnerOf(f1, f2)].title++
  }

  return rows.map((r, i) => {
    const c = counts[i]
    const winsMean = c.winsSum / sims
    let line = Math.round(winsMean * 2) / 2
    if (Number.isInteger(line)) line += winsMean >= line ? 0.5 : -0.5
    let over = 0
    for (let w = Math.ceil(line); w <= maxWins; w++) over += tally[i][w]
    const pOver = over / sims
    const [oddsOver, oddsUnder] = priceTwoWay(pOver)
    return {
      id: r.id,
      winsMean: parseFloat(winsMean.toFixed(2)),
      avgSeed: parseFloat((c.seedSum / sims).toFixed(2)),
      winTotal: line,
      pOver,
      oddsOver,
      oddsUnder,
      markets: [
        ['playoffs', c.playoffs / sims],
        ['bye', c.bye / sims],
        ['semis', c.semis / sims],
        ['finals', c.finals / sims],
        ['title', c.title / sims],
      ].reduce((acc, [k, p]) => {
        acc[k] = { p, odds: americanFromProb(p * 1.05) }
        return acc
      }, {}),
    }
  })
}
