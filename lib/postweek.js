import { buildRatings, makeLine, isPlayed } from './predictions.js'

/**
 * Prices every played game of a week using only what was known going into it,
 * then grades the result. Ratings are rebuilt through the prior week so a
 * line is never informed by the game it is pricing.
 */
export function gradeWeek({ teams, matchups, rosterProj, baseline, weeklyProj, week }) {
  const { byId } = buildRatings({ teams, matchups, throughWeek: week - 1, rosterProj, baseline, weeklyProj })
  return matchups
    .filter(m => m.week === week && isPlayed(m))
    .map(m => {
      const a = byId[m.home_team?.id]
      const b = byId[m.away_team?.id]
      if (!a || !b) return null
      const line = makeLine(a, b)
      const sA = m.home_score, sB = m.away_score
      const margin = sA - sB
      const total = sA + sB
      const atsMargin = margin + line.spread
      const favSide = line.spread < 0 ? 'a' : line.spread > 0 ? 'b' : null
      const winner = margin > 0 ? 'a' : margin < 0 ? 'b' : 'push'
      return {
        id: m.id, week, a, b, line, sA, sB, margin, total,
        ats: atsMargin > 0 ? 'a' : atsMargin < 0 ? 'b' : 'push',
        atsMargin,
        ou: total > line.total ? 'over' : total < line.total ? 'under' : 'push',
        ouMargin: total - line.total,
        winner,
        // Did the side the model favored actually win?
        favHit: favSide ? winner === favSide : null,
        // Probability the model gave the team that won.
        pWinner: winner === 'a' ? line.pA : winner === 'b' ? line.pB : 0.5,
        upset: winner !== 'push' && (winner === 'a' ? line.pA : line.pB) < 0.5,
      }
    })
    .filter(Boolean)
}

/**
 * Cumulative accuracy of the line model across every played week, graded the
 * same way — each week priced off the weeks before it only.
 */
export function modelRecord({ teams, matchups, rosterProj, baseline, weeklyProj, throughWeek }) {
  const weeks = [...new Set(matchups.filter(isPlayed).map(m => m.week))]
    .filter(w => w <= throughWeek).sort((a, b) => a - b)

  const rec = {
    ats: { w: 0, l: 0, p: 0 },
    ou: { over: 0, under: 0, p: 0 },
    fav: { w: 0, l: 0 },
    games: 0,
    brierSum: 0,
    byWeek: [],
  }

  weeks.forEach(w => {
    // Week 1 has no prior results, so absent a supplied projection its games
    // price as coin flips and contribute no edge either way.
    const games = gradeWeek({ teams, matchups, rosterProj, baseline, weeklyProj, week: w })
    let favW = 0, favL = 0
    games.forEach(g => {
      rec.games++
      if (g.ats === 'push') rec.ats.p++
      if (g.ou === 'push') rec.ou.p++
      else if (g.ou === 'over') rec.ou.over++
      else rec.ou.under++
      if (g.favHit === true) { rec.fav.w++; favW++ }
      else if (g.favHit === false) { rec.fav.l++; favL++ }
      // Brier on the home side's win probability.
      const outcome = g.winner === 'a' ? 1 : g.winner === 'b' ? 0 : 0.5
      rec.brierSum += (g.line.pA - outcome) ** 2
    })
    if (games.length) rec.byWeek.push({ week: w, favW, favL, games: games.length })
  })

  const graded = rec.fav.w + rec.fav.l
  return {
    ...rec,
    favPct: graded ? rec.fav.w / graded : 0,
    brier: rec.games ? rec.brierSum / rec.games : null,
    weeks: weeks.length,
  }
}

const pick = (arr, fn) => (arr.length ? arr.reduce((best, x) => (fn(x) > fn(best) ? x : best)) : null)

/** Week awards, drawn from the graded games. */
export function superlatives(games) {
  if (!games.length) return []
  const sides = games.flatMap(g => [
    { team: g.a, score: g.sA, opp: g.b, oppScore: g.sB },
    { team: g.b, score: g.sB, opp: g.a, oppScore: g.sA },
  ])

  const high = pick(sides, s => s.score)
  const low = pick(sides, s => -s.score)
  const closest = pick(games, g => -Math.abs(g.margin))
  const blowout = pick(games, g => Math.abs(g.margin))
  const shootout = pick(games, g => g.total)
  const upset = pick(games.filter(g => g.upset), g => -g.pWinner)

  const out = [
    high && { label: 'Top Score', value: high.score.toFixed(2), who: high.team.name, note: `beat ${high.opp.name}` },
    low && { label: 'Low Score', value: low.score.toFixed(2), who: low.team.name, note: `against ${low.opp.name}` },
    closest && {
      label: 'Nail Biter', value: `${Math.abs(closest.margin).toFixed(2)}`, who: `${closest.a.name} vs ${closest.b.name}`,
      note: `${closest.margin > 0 ? closest.a.name : closest.b.name} survived`,
    },
    blowout && {
      label: 'Blowout', value: `${Math.abs(blowout.margin).toFixed(2)}`, who: `${blowout.margin > 0 ? blowout.a.name : blowout.b.name}`,
      note: `over ${blowout.margin > 0 ? blowout.b.name : blowout.a.name}`,
    },
    shootout && { label: 'Shootout', value: shootout.total.toFixed(2), who: `${shootout.a.name} vs ${shootout.b.name}`, note: 'combined points' },
    upset && {
      label: 'Upset', value: `${(upset.pWinner * 100).toFixed(0)}%`, who: upset.winner === 'a' ? upset.a.name : upset.b.name,
      note: `won as a ${Math.abs(upset.line.spread).toFixed(1)}-point dog over ${upset.winner === 'a' ? upset.b.name : upset.a.name}`,
    },
  ].filter(Boolean)

  // Nail Biter and Blowout collapse onto the same game in a one-game week.
  return out.filter((x, i) => out.findIndex(y => y.label === x.label) === i)
}
