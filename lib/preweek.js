import { PLAYOFF_SPOTS, BYE_SPOTS, normalCdf } from './predictions.js'

// Box–Muller, kept local so the sim doesn't share a spare with other callers.
let spare = null
const gauss = (m, sd) => {
  if (spare !== null) { const v = spare; spare = null; return m + sd * v }
  let u = 0, v = 0, s = 0
  do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s = u * u + v * v } while (s === 0 || s >= 1)
  const f = Math.sqrt((-2 * Math.log(s)) / s)
  spare = v * f
  return m + sd * u * f
}

const blank = () => ({ playoffs: 0, bye: 0, semis: 0, finals: 0, title: 0, seedSum: 0, winsSum: 0 })

/**
 * One Monte Carlo of the rest of the season that also records outcomes
 * conditioned on who won each game of `trackWeek`.
 *
 * The two conditionals are read off the *same* simulated seasons rather than
 * from two disjoint buckets of them. Each season is scored once as it fell, and
 * then once per tracked game with only that game's result reversed — every
 * other week of that season held exactly as it was. Pairing the branches this
 * way cancels the noise they share, so what is left measures the tracked game
 * itself instead of thirteen weeks of unrelated variance. It matters most when
 * the teams are evenly matched: unpaired, two identical teams still show a
 * ragged spread of leverage at 8,000 seasons purely from sampling.
 */
export function simulateLeverage({ rows, schedule = [], randomWeeks = 0, trackWeek = null, sims = 8000 }) {
  const n = rows.length
  if (n < 2) return null

  const idx = new Map(rows.map((r, i) => [r.id, i]))
  const known = schedule
    .map(g => ({ h: idx.get(g.homeId), a: idx.get(g.awayId), week: g.week, homeId: g.homeId, awayId: g.awayId }))
    .filter(g => g.h != null && g.a != null)

  const tracked = []
  // slot[k] is the tracked index of known game k, or -1.
  const slot = known.map(() => -1)
  known.forEach((g, i) => { if (g.week === trackWeek) { slot[i] = tracked.length; tracked.push(i) } })

  const base = rows.map(blank)
  // cond[t][side] — side 0 is the home team winning, 1 the away team. Both
  // sides now see every season, so each ends up with `sims` observations.
  const cond = tracked.map(() => [
    { n: 0, teams: rows.map(blank) },
    { n: 0, teams: rows.map(blank) },
  ])
  const homeWins = new Array(tracked.length).fill(0)

  const wins = new Array(n)
  const pf = new Array(n)
  const flipWins = new Array(n)
  const flipPf = new Array(n)
  const order = [...Array(n).keys()]
  // The two scores of each tracked game this season, kept so the game can be
  // replayed the other way without disturbing anything else.
  const tScore = tracked.map(() => [0, 0])

  const draw = i => gauss(rows[i].rating, rows[i].sigma)
  const winnerOf = (i, j) => (draw(i) >= draw(j) ? i : j)

  // Seed the field from a win/points-for vector, run the bracket, and fold the
  // result into every accumulator handed in.
  const tally = (accs, w, p) => {
    const seeds = [...Array(n).keys()].sort((a, b) => w[b] - w[a] || p[b] - p[a])
    const seedOf = new Array(n)
    seeds.forEach((t, i) => { seedOf[t] = i + 1 })

    const made = new Array(n).fill(false)
    const gotBye = new Array(n).fill(false)
    const inSemis = new Array(n).fill(false)
    const inFinals = new Array(n).fill(false)
    let champ = -1

    if (n >= PLAYOFF_SPOTS) {
      const pl = seeds.slice(0, PLAYOFF_SPOTS)
      pl.forEach(i => { made[i] = true })
      // Same bracket order the season page's own bracket display uses:
      // 1v8 and 4v5 feed one semifinal, 3v6 and 2v7 feed the other. No byes
      // -- BYE_SPOTS is 0, so gotBye never gets set, which is correct.
      const topA = winnerOf(pl[0], pl[7])
      const topB = winnerOf(pl[3], pl[4])
      const botA = winnerOf(pl[2], pl[5])
      const botB = winnerOf(pl[1], pl[6])
      inSemis[topA] = true; inSemis[topB] = true; inSemis[botA] = true; inSemis[botB] = true
      const f1 = winnerOf(topA, topB)
      const f2 = winnerOf(botA, botB)
      inFinals[f1] = true; inFinals[f2] = true
      champ = winnerOf(f1, f2)
    }

    for (const acc of accs) {
      for (let t = 0; t < n; t++) {
        const A = acc[t]
        A.seedSum += seedOf[t]
        A.winsSum += w[t]
        if (made[t]) A.playoffs++
        if (gotBye[t]) A.bye++
        if (inSemis[t]) A.semis++
        if (inFinals[t]) A.finals++
        if (champ === t) A.title++
      }
    }
  }

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < n; i++) { wins[i] = rows[i].wins; pf[i] = rows[i].pf }

    for (let k = 0; k < known.length; k++) {
      const g = known[k]
      const si = draw(g.h)
      const sj = draw(g.a)
      pf[g.h] += si; pf[g.a] += sj
      if (si >= sj) wins[g.h]++; else wins[g.a]++
      if (slot[k] >= 0) { tScore[slot[k]][0] = si; tScore[slot[k]][1] = sj }
    }

    for (let w = 0; w < randomWeeks; w++) {
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[order[i], order[j]] = [order[j], order[i]]
      }
      for (let i = 0; i + 1 < n; i += 2) {
        const si = draw(order[i])
        const sj = draw(order[i + 1])
        pf[order[i]] += si; pf[order[i + 1]] += sj
        if (si >= sj) wins[order[i]]++; else wins[order[i + 1]]++
      }
    }

    // Score the season as it fell — once, into the overall totals and into the
    // side each tracked game actually landed on.
    const accs = [base]
    for (let t = 0; t < tracked.length; t++) {
      const side = tScore[t][0] >= tScore[t][1] ? 0 : 1
      if (side === 0) homeWins[t]++
      accs.push(cond[t][side].teams)
      cond[t][side].n++
    }
    tally(accs, wins, pf)

    // Then replay each tracked game the other way, alone, against that same
    // season: swap its two scores so the loser's total goes to the winner and
    // the league's points-for stays whole.
    for (let t = 0; t < tracked.length; t++) {
      const g = known[tracked[t]]
      const [si, sj] = tScore[t]
      const homeWon = si >= sj
      for (let i = 0; i < n; i++) { flipWins[i] = wins[i]; flipPf[i] = pf[i] }
      if (homeWon) { flipWins[g.h]--; flipWins[g.a]++ } else { flipWins[g.h]++; flipWins[g.a]-- }
      flipPf[g.h] += sj - si
      flipPf[g.a] += si - sj
      const other = homeWon ? 1 : 0
      cond[t][other].n++
      tally([cond[t][other].teams], flipWins, flipPf)
    }
  }

  const rate = (acc, count) => ({
    playoffs: acc.playoffs / count,
    bye: acc.bye / count,
    semis: acc.semis / count,
    finals: acc.finals / count,
    title: acc.title / count,
    avgSeed: acc.seedSum / count,
    wins: acc.winsSum / count,
  })

  return {
    sims,
    base: Object.fromEntries(rows.map((r, i) => [r.id, rate(base[i], sims)])),
    games: tracked.map((k, g) => {
      const [h, a] = [cond[g][0], cond[g][1]]
      return {
        homeId: known[k].homeId,
        awayId: known[k].awayId,
        pHome: homeWins[g] / sims,
        home: h.n ? Object.fromEntries(rows.map((r, i) => [r.id, rate(h.teams[i], h.n)])) : null,
        away: a.n ? Object.fromEntries(rows.map((r, i) => [r.id, rate(a.teams[i], a.n)])) : null,
      }
    }),
  }
}

/**
 * Raw leverage: how much postseason positioning hinges on one game, measured
 * in probability points swung for the two teams playing it. Bye odds count
 * half because seeding matters less than making the field at all.
 */
export function rawLeverage(game) {
  if (!game?.home || !game?.away) return 0
  let raw = 0
  for (const id of [game.homeId, game.awayId]) {
    const h = game.home[id], a = game.away[id]
    if (!h || !a) continue
    raw += Math.abs(h.playoffs - a.playoffs) + 0.5 * Math.abs(h.bye - a.bye)
  }
  return raw
}

// Calibrated in scripts/calibrate-importance.mjs against a full simulated
// season. MU is Week 1 leverage: with no results on the board every team rates
// the same, so all five openers carry identical stakes and land on 50. SIGMA is
// set so a last-week win-and-in for both teams reaches 99.
export const IMPORTANCE_MU = 0.544
export const IMPORTANCE_SIGMA = 0.560

/** Raw leverage mapped onto a 0-100 curve. */
export function importanceScore(raw) {
  if (!(raw > 0)) return 0
  return Math.round(100 * normalCdf(Math.log(raw / IMPORTANCE_MU) / IMPORTANCE_SIGMA))
}

/**
 * Which side of each other game a team wants, ranked by how much it moves
 * their own playoff odds.
 */
export function rootingGuide({ sim, teamId, teams }) {
  if (!sim) return []
  const name = id => teams.find(t => t.id === id)?.name || '?'
  return sim.games
    .filter(g => g.homeId !== teamId && g.awayId !== teamId && g.home && g.away)
    .map(g => {
      const h = g.home[teamId], a = g.away[teamId]
      if (!h || !a) return null
      const diff = h.playoffs - a.playoffs
      const byeDiff = h.bye - a.bye
      return {
        homeId: g.homeId,
        awayId: g.awayId,
        want: diff >= 0 ? g.homeId : g.awayId,
        wantName: diff >= 0 ? name(g.homeId) : name(g.awayId),
        overName: diff >= 0 ? name(g.awayId) : name(g.homeId),
        playoffSwing: Math.abs(diff),
        byeSwing: Math.abs(byeDiff),
      }
    })
    .filter(Boolean)
    .sort((x, y) => y.playoffSwing - x.playoffSwing)
}

/**
 * Postseason status from the simulation: anything that happens in every
 * simulated season is treated as settled.
 */
export function clinchStatus({ sim, teamId, game }) {
  const b = sim?.base?.[teamId]
  if (!b) return null
  if (b.playoffs >= 0.9995) return { kind: 'clinched', label: 'Clinched a playoff spot' }
  if (b.playoffs <= 0.0005) return { kind: 'eliminated', label: 'Eliminated from playoff contention' }
  if (b.bye >= 0.9995) return { kind: 'clinched', label: 'Clinched a bye' }

  if (game?.home && game?.away) {
    const isHome = game.homeId === teamId
    const onWin = isHome ? game.home[teamId] : game.away[teamId]
    const onLoss = isHome ? game.away[teamId] : game.home[teamId]
    if (onWin && onLoss) {
      if (onWin.playoffs >= 0.9995 && onLoss.playoffs < 0.9995) return { kind: 'winAndIn', label: 'Win and in' }
      if (onLoss.playoffs <= 0.0005 && onWin.playoffs > 0.0005) return { kind: 'mustWin', label: 'Must win to stay alive' }
      if (onWin.bye >= 0.9995 && onLoss.bye < 0.9995) return { kind: 'winAndIn', label: 'Win and clinch a bye' }
    }
  }
  return null
}

/** All-time head-to-head between two managers, newest meeting first. */
export function headToHead({ allMatchups, teamsByManager, aManagerId, bManagerId }) {
  if (!aManagerId || !bManagerId) return null
  const teamsOf = id => new Set(teamsByManager[id] || [])
  const A = teamsOf(aManagerId), B = teamsOf(bManagerId)
  if (!A.size || !B.size) return null

  const meetings = allMatchups
    .filter(m => {
      const h = m.home_team?.id, a = m.away_team?.id
      return (A.has(h) && B.has(a)) || (B.has(h) && A.has(a))
    })
    .filter(m => (m.home_score ?? 0) > 0 || (m.away_score ?? 0) > 0)
    .map(m => {
      const aHome = A.has(m.home_team?.id)
      const aScore = aHome ? m.home_score : m.away_score
      const bScore = aHome ? m.away_score : m.home_score
      return {
        id: m.id,
        year: m.season?.year,
        week: m.week,
        isPlayoff: !!m.is_playoff,
        aScore, bScore,
        aWon: aScore > bScore,
      }
    })
    .sort((x, y) => (y.year - x.year) || (y.week - x.week))

  if (!meetings.length) return { meetings: [], aWins: 0, bWins: 0, streak: null, biggest: null }

  const aWins = meetings.filter(m => m.aWon).length
  const streakWinner = meetings[0].aWon
  let streak = 0
  for (const m of meetings) { if (m.aWon === streakWinner) streak++; else break }
  const biggest = meetings.reduce((best, m) =>
    Math.abs(m.aScore - m.bScore) > Math.abs(best.aScore - best.bScore) ? m : best)

  return {
    meetings,
    aWins,
    bWins: meetings.length - aWins,
    streak: { who: streakWinner ? 'a' : 'b', n: streak },
    biggest,
  }
}
