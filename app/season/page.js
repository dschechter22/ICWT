'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'
import RosterDrawer from '../../components/RosterDrawer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function SeasonPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, rowAlt, highlight, green, red, gold, blue } = useLayout()

  const [seasons, setSeasons] = useState([])
  const [selectedYear, setSelectedYear] = useState(2025)
  const [matchups, setMatchups] = useState([])
  const [teams, setTeams] = useState([])
  const [managers, setManagers] = useState([])
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [rosterTeam, setRosterTeam] = useState(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    supabase.from('seasons').select('year, season_number').order('year', { ascending: false }).then(({ data }) => setSeasons(data || []))
    supabase.from('managers').select('*').then(({ data }) => setManagers(data || []))
  }, [])

  useEffect(() => {
    setSelectedTeam(null)
    setMatchups([])
    setTeams([])
    supabase.from('matchups')
      .select('*, home_team:home_team_id(id, manager_id, team_name), away_team:away_team_id(id, manager_id, team_name), season:season_id(year)')
      .then(({ data }) => setMatchups((data || []).filter(m => m.season?.year === selectedYear)))
    supabase.from('teams')
      .select('*, manager:manager_id(name, slug, id), season:season_id(year)')
      .then(({ data }) => setTeams((data || []).filter(t => t.season?.year === selectedYear).sort((a, b) => a.final_standing - b.final_standing)))
  }, [selectedYear])

  if (!mounted) return null

  const getManagerName = (managerId) => managers.find(m => m.id === managerId)?.name || '—'
  const getTeamByManagerId = (managerId) => teams.find(t => t.manager?.id === managerId)

  const regMatchups = matchups.filter(m => !m.is_playoff)
  const playoffMatchups = matchups.filter(m => m.is_playoff && !m.is_mol_bowl && !m.is_consolation)
  const molBowlMatchups = matchups.filter(m => m.is_mol_bowl)
  const weeks = [...new Set(regMatchups.map(m => m.week))].sort((a, b) => a - b)
  const playoffWeeks = [...new Set(playoffMatchups.map(m => m.week))].sort((a, b) => a - b)

  const filteredReg = selectedTeam ? regMatchups.filter(m => m.home_team?.id === selectedTeam || m.away_team?.id === selectedTeam) : regMatchups
  const filteredPlayoff = selectedTeam ? playoffMatchups.filter(m => m.home_team?.id === selectedTeam || m.away_team?.id === selectedTeam) : playoffMatchups

  const getPlayoffSeed = (teamId) => {
    const team = teams.find(t => t.id === teamId)
    return team?.playoff_seed ?? 99
  }

  const playoffTeams = teams.filter(t => t.made_playoffs).sort((a, b) => (a.playoff_seed ?? 99) - (b.playoff_seed ?? 99))

  // Standings totals
  const standingsTotals = teams.length > 0 ? {
    wins: teams.reduce((s, t) => s + (t.wins || 0), 0),
    losses: teams.reduce((s, t) => s + (t.losses || 0), 0),
    pf: teams.reduce((s, t) => s + (t.points_for || 0), 0),
    pa: teams.reduce((s, t) => s + (t.points_against || 0), 0),
    diff: teams.reduce((s, t) => s + (t.points_for - t.points_against), 0),
    ppgDiff: teams.reduce((s, t) => {
      const g = t.wins + t.losses
      return s + (g > 0 ? (t.points_for - t.points_against) / g : 0)
    }, 0) / teams.length,
  } : null

  // ---- STATS ----
  const calcStats = () => {
    if (regMatchups.length === 0 || teams.length === 0) return null
    const teamScores = {}
    teams.forEach(t => { teamScores[t.id] = [] })
    regMatchups.forEach(m => {
      if (teamScores[m.home_team?.id] !== undefined) teamScores[m.home_team.id].push({ score: m.home_score, week: m.week, oppScore: m.away_score, oppManagerId: m.away_team?.manager_id, won: m.home_score > m.away_score })
      if (teamScores[m.away_team?.id] !== undefined) teamScores[m.away_team.id].push({ score: m.away_score, week: m.week, oppScore: m.home_score, oppManagerId: m.home_team?.manager_id, won: m.away_score > m.home_score })
    })
    const allPlaySum = {}
    teams.forEach(t => { allPlaySum[t.id] = 0 })
    weeks.forEach(week => {
      const weekGames = regMatchups.filter(m => m.week === week)
      const allScores = []
      weekGames.forEach(m => {
        allScores.push({ teamId: m.home_team?.id, score: m.home_score })
        allScores.push({ teamId: m.away_team?.id, score: m.away_score })
      })
      const n = allScores.length
      if (n < 2) return
      allScores.forEach(({ teamId, score }) => {
        if (allPlaySum[teamId] === undefined) return
        allPlaySum[teamId] += allScores.filter(o => o.teamId !== teamId && score > o.score).length / (n - 1)
      })
    })
    const median = (arr) => {
      if (!arr.length) return 0
      const s = [...arr].sort((a, b) => a - b)
      const mid = Math.floor(s.length / 2)
      return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2
    }
    const teamMetrics = teams.map(t => {
      const scores = teamScores[t.id]?.map(g => g.score) || []
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
      const medianScore = median(scores)
      const winPct = (t.wins + t.losses) > 0 ? t.wins / (t.wins + t.losses) : 0
      const allPlayWinPct = weeks.length > 0 ? allPlaySum[t.id] / weeks.length : 0
      return { t, winPct, avgScore, medianScore, allPlayWinPct }
    })
    const maxWin = Math.max(...teamMetrics.map(r => r.winPct))
    const maxAvg = Math.max(...teamMetrics.map(r => r.avgScore))
    const maxMed = Math.max(...teamMetrics.map(r => r.medianScore))
    const maxAp = Math.max(...teamMetrics.map(r => r.allPlayWinPct))
    const composites = teamMetrics.map(r => {
      const score = ((r.winPct / (maxWin || 1) * 100 * 2) + (r.avgScore / (maxAvg || 1) * 100 * 4) + (r.allPlayWinPct / (maxAp || 1) * 100 * 2) + (r.medianScore / (maxMed || 1) * 100 * 2)) / 10
      return { t: r.t, score: parseFloat(score.toFixed(2)), winPct: r.winPct, avgScore: r.avgScore }
    })
    const getLuck = (t) => parseFloat((t.wins - (allPlaySum[t.id] || 0)).toFixed(2))
    let highGame = null
    regMatchups.forEach(m => {
      if (!highGame || m.home_score > highGame.score) highGame = { score: m.home_score, managerId: m.home_team?.manager_id, week: m.week, oppScore: m.away_score, oppManagerId: m.away_team?.manager_id, won: m.home_score > m.away_score }
      if (m.away_score > (highGame?.score || 0)) highGame = { score: m.away_score, managerId: m.away_team?.manager_id, week: m.week, oppScore: m.home_score, oppManagerId: m.home_team?.manager_id, won: m.away_score > m.home_score }
    })
    let lowGame = null
    regMatchups.forEach(m => {
      if (!lowGame || m.home_score < lowGame.score) lowGame = { score: m.home_score, managerId: m.home_team?.manager_id, week: m.week, oppScore: m.away_score, oppManagerId: m.away_team?.manager_id, won: m.home_score > m.away_score }
      if (m.away_score < (lowGame?.score ?? Infinity)) lowGame = { score: m.away_score, managerId: m.away_team?.manager_id, week: m.week, oppScore: m.home_score, oppManagerId: m.home_team?.manager_id, won: m.away_score > m.home_score }
    })
    let bigBlowout = null
    regMatchups.forEach(m => {
      const diff = parseFloat(Math.abs(m.home_score - m.away_score).toFixed(2))
      if (!bigBlowout || diff > bigBlowout.diff) bigBlowout = { diff, winnerId: m.home_score > m.away_score ? m.home_team?.manager_id : m.away_team?.manager_id, loserId: m.home_score > m.away_score ? m.away_team?.manager_id : m.home_team?.manager_id, winnerScore: Math.max(m.home_score, m.away_score), loserScore: Math.min(m.home_score, m.away_score), week: m.week }
    })
    let closestGame = null
    regMatchups.forEach(m => {
      const diff = parseFloat(Math.abs(m.home_score - m.away_score).toFixed(2))
      if (!closestGame || diff < closestGame.diff) closestGame = { diff, winnerId: m.home_score > m.away_score ? m.home_team?.manager_id : m.away_team?.manager_id, loserId: m.home_score > m.away_score ? m.away_team?.manager_id : m.home_team?.manager_id, winnerScore: Math.max(m.home_score, m.away_score), loserScore: Math.min(m.home_score, m.away_score), week: m.week }
    })
    const stdDevs = teams.map(t => {
      const scores = teamScores[t.id]?.map(g => g.score) || []
      if (scores.length < 2) return { t, std: 0, mean: 0 }
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length
      const std = Math.sqrt(scores.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / scores.length)
      return { t, std: parseFloat(std.toFixed(2)), mean: parseFloat(mean.toFixed(2)) }
    })
    const mostConsistent = [...stdDevs].sort((a, b) => a.std - b.std)[0]
    const boomOrBust = [...stdDevs].sort((a, b) => b.std - a.std)[0]
    let unluckiest = null, luckiest = null
    teams.forEach(t => {
      const luck = getLuck(t)
      const expected = parseFloat((allPlaySum[t.id] || 0).toFixed(1))
      if (!unluckiest || luck < unluckiest.luck) unluckiest = { t, luck, actual: t.wins, expected }
      if (!luckiest || luck > luckiest.luck) luckiest = { t, luck, actual: t.wins, expected }
    })
    const halfPoint = Math.floor(weeks.length / 2)
    let bestSecondHalf = null
    teams.forEach(t => {
      const getWins = (wks) => regMatchups.filter(m => wks.includes(m.week)).filter(m => (m.home_team?.id === t.id && m.home_score > m.away_score) || (m.away_team?.id === t.id && m.away_score > m.home_score)).length
      const firstW = getWins(weeks.slice(0, halfPoint))
      const secondW = getWins(weeks.slice(halfPoint))
      if (!bestSecondHalf || (secondW - firstW) > bestSecondHalf.improvement) bestSecondHalf = { t, improvement: secondW - firstW, firstW, secondW }
    })
    const mostDominant = [...composites].sort((a, b) => b.score - a.score)[0]
    const worstSeason = [...composites].sort((a, b) => a.score - b.score)[0]
    const closeCount = {}
    teams.forEach(t => { closeCount[t.id] = 0 })
    regMatchups.forEach(m => {
      if (Math.abs(m.home_score - m.away_score) < 10) {
        if (closeCount[m.home_team?.id] !== undefined) closeCount[m.home_team.id]++
        if (closeCount[m.away_team?.id] !== undefined) closeCount[m.away_team.id]++
      }
    })
    let mostCloseGames = null
    teams.forEach(t => {
      const count = closeCount[t.id] || 0
      if (!mostCloseGames || count > mostCloseGames.count) mostCloseGames = { t, count }
    })
    let choker = null
    if (playoffMatchups.length > 0 && playoffWeeks.length > 1) {
      const finalWeek = playoffWeeks[playoffWeeks.length - 1]
      const upsets = []
      playoffMatchups.filter(m => m.week !== finalWeek).forEach(m => {
        const homeWon = m.home_score > m.away_score
        const loserManagerId = homeWon ? m.away_team?.manager_id : m.home_team?.manager_id
        const winnerManagerId = homeWon ? m.home_team?.manager_id : m.away_team?.manager_id
        const loserTeam = teams.find(t => t.manager?.id === loserManagerId)
        const winnerTeam = teams.find(t => t.manager?.id === winnerManagerId)
        if (!loserTeam?.made_playoffs || !winnerTeam?.made_playoffs) return
        const loserComp = composites.find(c => c.t.id === loserTeam.id)
        const winnerComp = composites.find(c => c.t.id === winnerTeam.id)
        if (loserComp && winnerComp && loserComp.score > winnerComp.score)
          upsets.push({ loserTeam, loserComp, winnerTeam, winnerComp, gap: parseFloat((loserComp.score - winnerComp.score).toFixed(2)) })
      })
      if (upsets.length > 0) choker = upsets.sort((a, b) => b.gap - a.gap)[0]
    }
    return { highGame, lowGame, bigBlowout, closestGame, mostConsistent, boomOrBust, unluckiest, luckiest, bestSecondHalf, mostDominant, worstSeason, mostCloseGames, choker }
  }

  const stats = calcStats()

  const BracketGameCard = ({ game }) => {
    if (!game) return null
    const homeTeam = getTeamByManagerId(game.home_team?.manager_id)
    const awayTeam = getTeamByManagerId(game.away_team?.manager_id)
    const homeSeed = getPlayoffSeed(homeTeam?.id)
    const awaySeed = getPlayoffSeed(awayTeam?.id)
    const homeWon = game.home_score > game.away_score
    const awayWon = game.away_score > game.home_score
    const Line = ({ name, teamName, seed, score, won }) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: won ? (d ? 'rgba(255,255,255,0.05)' : 'rgba(13,33,82,0.06)') : 'transparent' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: '10px', color: won ? gold : muted, fontWeight: '700', minWidth: '14px' }}>{seed}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '13px', color: won ? text : muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: effectiveMobile ? '90px' : '130px' }}>{name}</div>
            <div style={{ fontSize: '10px', color: muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: effectiveMobile ? '90px' : '130px' }}>{teamName}</div>
          </div>
        </div>
        <span style={{ fontSize: '14px', fontWeight: '600', color: won ? text : muted, marginLeft: '8px', flexShrink: 0 }}>{score}</span>
      </div>
    )
    return (
      <div style={{ border: `1px solid ${border}`, background: cardBg, marginBottom: '10px' }}>
        <Line name={getManagerName(game.away_team?.manager_id)} teamName={awayTeam?.team_name} seed={awaySeed} score={game.away_score} won={awayWon} />
        <div style={{ height: '1px', background: border }} />
        <Line name={getManagerName(game.home_team?.manager_id)} teamName={homeTeam?.team_name} seed={homeSeed} score={game.home_score} won={homeWon} />
      </div>
    )
  }

  const colStyle = { flex: 1, minWidth: effectiveMobile ? '150px' : '190px', maxWidth: effectiveMobile ? '170px' : '230px' }
  const roundLabel = (label) => <div style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: muted, marginBottom: '14px', textAlign: 'center' }}>{label}</div>
  const connector = <div style={{ width: '16px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '16px', height: '1px', background: border }} /></div>
  const render8TeamBracket = () => {
    const r1Games = playoffMatchups.filter(m => m.week === playoffWeeks[0])
    const r2Games = playoffMatchups.filter(m => m.week === playoffWeeks[1])
    const r3Games = playoffMatchups.filter(m => m.week === playoffWeeks[2])

    const gameTeamIds = (g) => [
      getTeamByManagerId(g.home_team?.manager_id)?.id,
      getTeamByManagerId(g.away_team?.manager_id)?.id,
    ]
    const gameSeeds = (g) => gameTeamIds(g).map(id => getPlayoffSeed(id)).sort((a, b) => a - b)
    const hasSeeds = (g, a, b) => {
      const [s1, s2] = gameSeeds(g)
      return (s1 === a && s2 === b) || (s1 === b && s2 === a)
    }
    const winnerTeamId = (g) => {
      const [homeId, awayId] = gameTeamIds(g)
      return g.home_score > g.away_score ? homeId : awayId
    }

    // Standard 8-team seeding: 1v8 and 4v5 feed one semifinal, 3v6 and 2v7
    // feed the other -- display in that fixed bracket order, not by score.
    const topHalfGames = [r1Games.find(g => hasSeeds(g, 1, 8)), r1Games.find(g => hasSeeds(g, 4, 5))].filter(Boolean)
    const botHalfGames = [r1Games.find(g => hasSeeds(g, 3, 6)), r1Games.find(g => hasSeeds(g, 2, 7))].filter(Boolean)
    const topHalfTeamIds = new Set(topHalfGames.flatMap(gameTeamIds))
    const r1Winners = new Set(r1Games.map(winnerTeamId))

    // Round 2 also carries the placement (5th-8th) bracket -- keep only the
    // games between two round-1 winners; those are the true semifinals.
    const semis = r2Games.filter(g => gameTeamIds(g).every(id => r1Winners.has(id)))
    const topSemi = semis.find(g => gameTeamIds(g).some(id => topHalfTeamIds.has(id)))
    const botSemi = semis.find(g => g !== topSemi)
    const semiWinners = new Set(semis.map(winnerTeamId))

    // Round 3 likewise carries the 3rd/5th/7th place games -- the championship
    // is the one game between two semifinal winners.
    const championship = r3Games.find(g => gameTeamIds(g).every(id => semiWinners.has(id)))

    return (
      <div style={{ display: 'flex', gap: '0', minWidth: effectiveMobile ? '500px' : '640px' }}>
        <div style={colStyle}>
          {roundLabel('Round 1')}
          {topHalfGames.map(g => <BracketGameCard key={g.id} game={g} />)}
          <div style={{ height: '16px' }} />
          {botHalfGames.map(g => <BracketGameCard key={g.id} game={g} />)}
        </div>
        {connector}
        <div style={colStyle}>
          {roundLabel('Semifinals')}
          <div style={{ height: '46px' }} />
          {topSemi && <BracketGameCard game={topSemi} />}
          <div style={{ height: '20px' }} />
          {botSemi && <BracketGameCard game={botSemi} />}
        </div>
        {connector}
        <div style={colStyle}>
          {roundLabel('Championship')}
          <div style={{ height: '90px' }} />
          <BracketGameCard game={championship} />
        </div>
      </div>
    )
  }

  const StatCard = ({ label, value, sub, color }) => (
    <div style={{ background: cardBg, padding: '20px 24px', borderTop: `2px solid ${color || border}` }}>
      <div style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: muted, marginBottom: '10px' }}>{label}</div>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '15px' : '17px', color: text, marginBottom: '5px', lineHeight: 1.3 }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: muted, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  )

  const hStyle = (align = 'left') => ({ padding: effectiveMobile ? '8px 10px' : '10px 14px', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, textAlign: align, borderBottom: `1px solid ${border}`, fontWeight: '500', whiteSpace: 'nowrap' })
  const cStyle = (align = 'left') => ({ padding: effectiveMobile ? '10px' : '14px', fontSize: effectiveMobile ? '12px' : '13px', textAlign: align, borderBottom: `1px solid ${border}`, color: text, whiteSpace: 'nowrap' })

  const MatchupRow = ({ m, i }) => {
    const homeWon = m.home_score > m.away_score
    const awayWon = m.away_score > m.home_score
    const isHighlighted = selectedTeam && (m.home_team?.id === selectedTeam || m.away_team?.id === selectedTeam)
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: effectiveMobile ? '10px' : '14px', borderBottom: `1px solid ${border}`, background: isHighlighted ? highlight : i % 2 === 0 ? 'transparent' : rowAlt }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '12px' : '14px', color: awayWon ? muted : text }}>{getManagerName(m.away_team?.manager_id)}</div>
          {!effectiveMobile && <div style={{ fontSize: '11px', color: muted }}>{m.away_team?.team_name}</div>}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '0 12px' }}>
          <span style={{ fontSize: effectiveMobile ? '13px' : '16px', fontWeight: '600', color: awayWon ? text : muted, minWidth: '50px', textAlign: 'right' }}>{m.away_score}</span>
          <span style={{ fontSize: '11px', color: muted }}>–</span>
          <span style={{ fontSize: effectiveMobile ? '13px' : '16px', fontWeight: '600', color: homeWon ? text : muted, minWidth: '50px' }}>{m.home_score}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '12px' : '14px', color: homeWon ? text : muted }}>{getManagerName(m.home_team?.manager_id)}</div>
          {!effectiveMobile && <div style={{ fontSize: '11px', color: muted }}>{m.home_team?.team_name}</div>}
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '20px', marginBottom: '48px', flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px, 6vw, 72px)', fontWeight: '400', letterSpacing: '-0.02em' }}>Season</h1>
          <div style={{ paddingBottom: '8px' }}>
            <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} style={{ background: cardBg, color: text, border: `1px solid ${border}`, padding: '10px 16px', fontSize: '14px', fontFamily: "'Playfair Display', serif", cursor: 'pointer', outline: 'none' }}>
              {seasons.map(s => <option key={s.year} value={s.year}>{s.year} — Year {s.season_number}</option>)}
            </select>
          </div>
        </div>

        {/* Bracket */}
        {playoffMatchups.length > 0 && (
          <div style={{ marginBottom: '60px' }}>
            <p style={{ fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', color: muted, marginBottom: '24px' }}>Playoff Bracket</p>
            <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
              {render8TeamBracket()}
            </div>
          </div>
        )}

        {/* Standings */}
        {teams.length > 0 && (
          <div style={{ marginBottom: '48px' }}>
            <p style={{ fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', color: muted, marginBottom: '16px' }}>
              Final Standings · <span style={{ fontWeight: '400' }}>click row to filter matchups · click jersey icon to view roster</span>
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
                <thead>
                  <tr style={{ background: cardBg }}>
                    <th style={hStyle('center')}>Rk</th>
                    <th style={hStyle()}>Manager</th>
                    {!effectiveMobile && <th style={hStyle()}>Team</th>}
                    <th style={hStyle('center')}>W</th>
                    <th style={hStyle('center')}>L</th>
                    <th style={hStyle('right')}>PF</th>
                    {!effectiveMobile && <th style={hStyle('right')}>PA</th>}
                    <th style={hStyle('right')}>Diff</th>
                    <th style={hStyle('center')}>Result</th>
                    <th style={hStyle('center')}></th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t, i) => {
                    const diff = parseFloat((t.points_for - t.points_against).toFixed(2))
                    const isSelected = selectedTeam === t.id
                    return (
                      <tr key={t.id} style={{ background: isSelected ? highlight : i % 2 === 0 ? 'transparent' : rowAlt }}>
                        <td style={{ ...cStyle('center'), color: muted }}>{t.final_standing}</td>
                        <td
                          style={{ ...cStyle(), fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '13px' : '15px', cursor: 'pointer' }}
                          onClick={() => setSelectedTeam(isSelected ? null : t.id)}
                        >
                          {t.manager?.name}
                        </td>
                        {!effectiveMobile && <td style={{ ...cStyle(), color: muted, fontSize: '12px', cursor: 'pointer' }} onClick={() => setSelectedTeam(isSelected ? null : t.id)}>{t.team_name}</td>}
                        <td style={{ ...cStyle('center'), cursor: 'pointer' }} onClick={() => setSelectedTeam(isSelected ? null : t.id)}>{t.wins}</td>
                        <td style={{ ...cStyle('center'), cursor: 'pointer' }} onClick={() => setSelectedTeam(isSelected ? null : t.id)}>{t.losses}</td>
                        <td style={{ ...cStyle('right'), cursor: 'pointer' }} onClick={() => setSelectedTeam(isSelected ? null : t.id)}>{t.points_for.toFixed(effectiveMobile ? 0 : 2)}</td>
                        {!effectiveMobile && <td style={{ ...cStyle('right'), cursor: 'pointer' }} onClick={() => setSelectedTeam(isSelected ? null : t.id)}>{t.points_against.toFixed(2)}</td>}
                        <td style={{ ...cStyle('right'), color: diff >= 0 ? green : red, fontWeight: '500', cursor: 'pointer' }} onClick={() => setSelectedTeam(isSelected ? null : t.id)}>
                          {diff >= 0 ? '+' : ''}{diff.toFixed(effectiveMobile ? 0 : 2)}
                        </td>
                        <td style={{ ...cStyle('center'), fontSize: '11px', color: t.playoff_result === 'Champion' ? gold : t.playoff_result?.includes('Sacko') ? red : muted, cursor: 'pointer' }} onClick={() => setSelectedTeam(isSelected ? null : t.id)}>
                          {effectiveMobile ? (t.playoff_result === 'Champion' ? '🏆' : t.playoff_result?.includes('Sacko') ? 'Sko' : t.made_playoffs ? '✓' : '—') : (t.playoff_result || '—')}
                        </td>
                        <td style={{ ...cStyle('center') }}>
                          <button
                            onClick={() => setRosterTeam(t)}
                            style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '4px 8px', cursor: 'pointer', fontSize: '11px', fontFamily: "'Inter', sans-serif" }}
                            title="View Roster"
                          >
                            📋
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {/* Totals row */}
                  {standingsTotals && (
                    <tr style={{ background: d ? 'rgba(255,255,255,0.03)' : 'rgba(13,33,82,0.04)', fontWeight: '600' }}>
                      <td style={{ ...cStyle('center'), color: muted, fontSize: '10px', letterSpacing: '0.1em' }}>TOT</td>
                      <td style={{ ...cStyle(), fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted }}>League Totals</td>
                      {!effectiveMobile && <td style={cStyle()} />}
                      <td style={cStyle('center')}>{standingsTotals.wins}</td>
                      <td style={cStyle('center')}>{standingsTotals.losses}</td>
                      <td style={cStyle('right')}>{standingsTotals.pf.toFixed(effectiveMobile ? 0 : 2)}</td>
                      {!effectiveMobile && <td style={cStyle('right')}>{standingsTotals.pa.toFixed(2)}</td>}
                      <td style={{ ...cStyle('right'), color: standingsTotals.diff >= 0 ? green : red }}>
                        {standingsTotals.diff >= 0 ? '+' : ''}{standingsTotals.diff.toFixed(effectiveMobile ? 0 : 2)}
                      </td>
                      <td style={cStyle('center')} />
                      <td style={cStyle('center')} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {selectedTeam && (
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '12px', color: muted }}>
                  Showing: <span style={{ color: text, fontFamily: "'Playfair Display', serif" }}>{teams.find(t => t.id === selectedTeam)?.manager?.name}</span>
                </span>
                <button onClick={() => setSelectedTeam(null)} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '4px 10px', cursor: 'pointer', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif" }}>Clear</button>
              </div>
            )}
          </div>
        )}

        {/* Season Highlights */}
        {stats && (
          <div style={{ marginBottom: '60px' }}>
            <p style={{ fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', color: muted, marginBottom: '24px' }}>Season Highlights</p>
            <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1px', background: border }}>
              <StatCard label="Highest Score" value={`${getManagerName(stats.highGame?.managerId)} — ${stats.highGame?.score}`} sub={`Week ${stats.highGame?.week} · ${stats.highGame?.won ? 'Won' : 'Still lost'} vs ${getManagerName(stats.highGame?.oppManagerId)} (${stats.highGame?.oppScore})`} color={green} />
              <StatCard label="Lowest Score" value={`${getManagerName(stats.lowGame?.managerId)} — ${stats.lowGame?.score}`} sub={`Week ${stats.lowGame?.week} · ${stats.lowGame?.won ? 'Still won' : 'Lost'} vs ${getManagerName(stats.lowGame?.oppManagerId)} (${stats.lowGame?.oppScore})`} color={red} />
              <StatCard label="Biggest Blowout" value={`${getManagerName(stats.bigBlowout?.winnerId)} def. ${getManagerName(stats.bigBlowout?.loserId)}`} sub={`${stats.bigBlowout?.winnerScore} – ${stats.bigBlowout?.loserScore} · Margin: ${stats.bigBlowout?.diff} · Week ${stats.bigBlowout?.week}`} color={gold} />
              <StatCard label="Closest Game" value={`${getManagerName(stats.closestGame?.winnerId)} def. ${getManagerName(stats.closestGame?.loserId)}`} sub={`${stats.closestGame?.winnerScore} – ${stats.closestGame?.loserScore} · Margin: ${stats.closestGame?.diff} · Week ${stats.closestGame?.week}`} color={blue} />
              <StatCard label="Most Consistent" value={stats.mostConsistent?.t?.manager?.name || '—'} sub={`Std dev: ${stats.mostConsistent?.std} · Avg: ${stats.mostConsistent?.mean} PPG`} color={green} />
              <StatCard label="Boom or Bust" value={stats.boomOrBust?.t?.manager?.name || '—'} sub={`Std dev: ${stats.boomOrBust?.std} · Avg: ${stats.boomOrBust?.mean} PPG`} color={red} />
              <StatCard label="Unluckiest Team" value={stats.unluckiest?.t?.manager?.name || '—'} sub={`Actual: ${stats.unluckiest?.actual}W · Expected: ${stats.unluckiest?.expected}W · ${stats.unluckiest?.luck > 0 ? '+' : ''}${stats.unluckiest?.luck} wins`} color={red} />
              <StatCard label="Luckiest Team" value={stats.luckiest?.t?.manager?.name || '—'} sub={`Actual: ${stats.luckiest?.actual}W · Expected: ${stats.luckiest?.expected}W · +${stats.luckiest?.luck} wins`} color={green} />
              <StatCard label="Best Second Half" value={stats.bestSecondHalf?.t?.manager?.name || '—'} sub={`First half: ${stats.bestSecondHalf?.firstW}W · Second half: ${stats.bestSecondHalf?.secondW}W · +${stats.bestSecondHalf?.improvement}`} color={blue} />
              <StatCard label="Most Dominant" value={stats.mostDominant?.t?.manager?.name || '—'} sub={`Power score: ${stats.mostDominant?.score} · ${(stats.mostDominant?.winPct * 100).toFixed(1)}% win rate · ${stats.mostDominant?.avgScore?.toFixed(1)} PPG`} color={gold} />
              <StatCard label="Worst Season" value={stats.worstSeason?.t?.manager?.name || '—'} sub={`Power score: ${stats.worstSeason?.score} · ${(stats.worstSeason?.winPct * 100).toFixed(1)}% win rate · ${stats.worstSeason?.avgScore?.toFixed(1)} PPG`} color={red} />
              <StatCard label="Most Close Games" value={`${stats.mostCloseGames?.t?.manager?.name || '—'} — ${stats.mostCloseGames?.count}`} sub="Games decided by under 10 points" color={blue} />
              {stats.choker && <StatCard label="The Choker" value={stats.choker.loserTeam?.manager?.name || '—'} sub={`Power score ${stats.choker.loserComp?.score} upset by ${stats.choker.winnerTeam?.manager?.name} (${stats.choker.winnerComp?.score}) · Gap: ${stats.choker.gap}`} color={red} />}
            </div>
          </div>
        )}

        {/* Regular season schedule */}
        {weeks.length > 0 && (
          <div style={{ marginBottom: '60px' }}>
            <p style={{ fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', color: muted, marginBottom: '24px' }}>Regular Season Schedule</p>
            {weeks.map(week => {
              const weekGames = filteredReg.filter(m => m.week === week)
              if (weekGames.length === 0) return null
              return (
                <div key={week} style={{ marginBottom: '28px' }}>
                  <p style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: muted, marginBottom: '10px', paddingLeft: '10px' }}>Week {week}</p>
                  <div style={{ borderTop: `1px solid ${border}` }}>
                    {weekGames.map((m, i) => <MatchupRow key={m.id} m={m} i={i} />)}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Playoff schedule */}
        {playoffWeeks.length > 0 && filteredPlayoff.length > 0 && (
          <div>
            <p style={{ fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', color: muted, marginBottom: '24px' }}>Playoff Schedule</p>
            {playoffWeeks.map((week, idx) => {
              const weekGames = filteredPlayoff.filter(m => m.week === week)
              if (weekGames.length === 0) return null
              const labels = ['Round 1', 'Semifinals', 'Championship']
              return (
                <div key={week} style={{ marginBottom: '28px' }}>
                  <p style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: muted, marginBottom: '10px', paddingLeft: '10px' }}>{labels[idx] || `Round ${idx + 1}`}</p>
                  <div style={{ borderTop: `1px solid ${border}` }}>
                    {weekGames.map((m, i) => <MatchupRow key={m.id} m={m} i={i} />)}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {matchups.length === 0 && teams.length === 0 && (
          <p style={{ color: muted, fontSize: '14px' }}>No data available for this season yet.</p>
        )}
      </div>

      {/* Roster Drawer */}
      {rosterTeam && <RosterDrawer team={rosterTeam} onClose={() => setRosterTeam(null)} />}
    </div>
  )
}
