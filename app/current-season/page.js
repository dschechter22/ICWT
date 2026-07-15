'use client'
import { useState, useEffect } from 'react'
import { supabase, LEAGUE_ID } from '../../lib/supabase'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'
export const dynamic = 'force-dynamic'

const ADMIN_PIN = '2910'
const NUM_PICKS = 10
const SEASON = '2026-27'
const SEASON_YEAR = 2026

const median = (arr) => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export default function CurrentSeasonPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, rowAlt, green, red, gold, blue } = useLayout()

  // ── shared data ──
  const [matchups, setMatchups] = useState([])
  const [teams, setTeams] = useState([])
  const [managers, setManagers] = useState([])
  const [mounted, setMounted] = useState(false)

  // ── draft state ──
  const [picks, setPicks] = useState([])
  const [slots, setSlots] = useState(Array(NUM_PICKS).fill(''))
  const [editing, setEditing] = useState(false)
  const [pinModal, setPinModal] = useState(null)
  const [clearTarget, setClearTarget] = useState(null)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState('')

  // ── recap generator state ──
  const [recapWeek, setRecapWeek] = useState(null)
  const [summary, setSummary] = useState('')
  const [copied, setCopied] = useState(false)

  // ── sportsbook state ──
  const [sbGames, setSbGames] = useState([])

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    supabase.from('managers').select('id, name').eq('league_id', LEAGUE_ID).order('name').then(({ data }) => setManagers(data || []))
    supabase.from('draft_order').select('*').eq('season', SEASON).order('pick_number').then(({ data }) => setPicks(data || []))
    supabase.from('matchups')
      .select('*, home_team:home_team_id(id, manager_id, team_name), away_team:away_team_id(id, manager_id, team_name), season:season_id(year)')
      .eq('league_id', LEAGUE_ID)
      .eq('is_playoff', false)
      .then(({ data }) => setMatchups((data || []).filter(m => m.season?.year === SEASON_YEAR)))
    supabase.from('teams')
      .select('*, manager:manager_id(name, slug, id), season:season_id(year)')
      .eq('league_id', LEAGUE_ID)
      .then(({ data }) => setTeams((data || []).filter(t => t.season?.year === SEASON_YEAR)))
    supabase.from('sb_games')
      .select('*')
      .eq('season', SEASON)
      .eq('is_settled', false)
      .order('week', { ascending: false })
      .then(({ data }) => {
        if (!data?.length) return
        const latestWeek = data[0].week
        setSbGames(data.filter(g => g.week === latestWeek))
      })
  }, [])

  const fetchDraft = () => supabase.from('draft_order').select('*').eq('season', SEASON).order('pick_number').then(({ data }) => setPicks(data || []))

  const handlePinSubmit = () => {
    if (pinInput !== ADMIN_PIN) { setPinError('Incorrect PIN'); return }
    setPinError(''); setPinInput('')
    if (pinModal === 'edit') {
      const current = Array(NUM_PICKS).fill('')
      picks.forEach(p => { if (p.pick_number >= 1 && p.pick_number <= NUM_PICKS) current[p.pick_number - 1] = p.manager_name })
      setSlots(current); setEditing(true); setPinModal(null)
    } else if (pinModal === 'clear-one' && clearTarget) {
      supabase.from('draft_order').delete().eq('id', clearTarget).then(() => { setClearTarget(null); setPinModal(null); fetchDraft() })
    } else if (pinModal === 'clear-all') {
      supabase.from('draft_order').delete().eq('season', SEASON).then(() => { setPinModal(null); fetchDraft() })
    }
  }

  const handleSave = async () => {
    if (slots.every(s => !s)) return setSaveError('Assign at least one pick.')
    setSaveError(''); setSubmitting(true)
    await supabase.from('draft_order').delete().eq('season', SEASON)
    const inserts = slots.map((name, i) => name ? { pick_number: i + 1, manager_name: name, season: SEASON } : null).filter(Boolean)
    const { error } = await supabase.from('draft_order').insert(inserts)
    if (error) { setSaveError('Failed to save.'); setSubmitting(false); return }
    setEditing(false); setSubmitting(false); fetchDraft()
  }

  // ── computed stats ──
  const weeks = [...new Set(matchups.map(m => m.week))].sort((a, b) => a - b)

  const computeTeamData = () => {
    const td = {}
    teams.forEach(t => { td[t.id] = { name: t.manager?.name || '?', scores: [], wins: 0, losses: 0, pf: 0, pa: 0, allPlaySum: 0, gameLog: [] } })
    matchups.forEach(m => {
      const hId = m.home_team?.id, aId = m.away_team?.id
      if (td[hId]) { td[hId].scores.push(m.home_score); td[hId].pf += m.home_score; td[hId].pa += m.away_score; td[hId].gameLog.push({ week: m.week, score: m.home_score, oppScore: m.away_score, won: m.home_score > m.away_score }); if (m.home_score > m.away_score) td[hId].wins++; else if (m.home_score < m.away_score) td[hId].losses++ }
      if (td[aId]) { td[aId].scores.push(m.away_score); td[aId].pf += m.away_score; td[aId].pa += m.home_score; td[aId].gameLog.push({ week: m.week, score: m.away_score, oppScore: m.home_score, won: m.away_score > m.home_score }); if (m.away_score > m.home_score) td[aId].wins++; else if (m.away_score < m.home_score) td[aId].losses++ }
    })
    weeks.forEach(wk => {
      const wkGames = matchups.filter(m => m.week === wk)
      const allScores = []
      wkGames.forEach(m => { allScores.push({ teamId: m.home_team?.id, score: m.home_score }); allScores.push({ teamId: m.away_team?.id, score: m.away_score }) })
      const n = allScores.length
      if (n < 2) return
      allScores.forEach(({ teamId, score }) => { if (td[teamId]) td[teamId].allPlaySum += allScores.filter(o => o.teamId !== teamId && score > o.score).length / (n - 1) })
    })
    return td
  }

  const teamData = teams.length > 0 && matchups.length > 0 ? computeTeamData() : {}

  const rows = Object.values(teamData).map(({ name, scores, wins, losses, pf, pa, allPlaySum, gameLog }) => {
    const games = wins + losses
    const winPct = games > 0 ? wins / games : 0
    const avgScore = scores.length > 0 ? pf / scores.length : 0
    const med = median(scores)
    const allPlayWinPct = weeks.length > 0 ? allPlaySum / weeks.length : 0
    const luckRaw = parseFloat((wins - allPlaySum).toFixed(2))
    const std = scores.length > 1 ? parseFloat(Math.sqrt(scores.reduce((s, x) => s + Math.pow(x - avgScore, 2), 0) / scores.length).toFixed(2)) : 0
    const sortedLog = [...gameLog].sort((a, b) => a.week - b.week)
    let curStreak = 0, streakType = null
    for (let i = sortedLog.length - 1; i >= 0; i--) {
      const w = sortedLog[i].won
      if (streakType === null) { streakType = w; curStreak = 1 }
      else if (w === streakType) curStreak++
      else break
    }
    return { name, wins, losses, pf, pa, winPct, avgScore, medScore: med, allPlayWinPct, allPlaySum, luckRaw, std, streak: curStreak, streakWin: streakType, scores, gameLog: sortedLog }
  })

  const maxWin = Math.max(...rows.map(r => r.winPct)) || 1
  const maxAvg = Math.max(...rows.map(r => r.avgScore)) || 1
  const maxMed = Math.max(...rows.map(r => r.medScore)) || 1
  const maxAp = Math.max(...rows.map(r => r.allPlayWinPct)) || 1

  const ranked = rows.map(r => ({
    ...r,
    powerScore: parseFloat(((r.winPct / maxWin * 100 * 2) + (r.avgScore / maxAvg * 100 * 4) + (r.allPlayWinPct / maxAp * 100 * 2) + (r.medScore / maxMed * 100 * 2)) / 10),
  })).sort((a, b) => b.powerScore - a.powerScore)

  const standings = [...rows].sort((a, b) => b.wins - a.wins || b.pf - a.pf)
  const ljRanked = [...rows].sort((a, b) => b.allPlayWinPct - a.allPlayWinPct)

  // ── power ranking movement ──
  const prevRanked = (() => {
    if (weeks.length < 2) return []
    const prevWeeks = weeks.slice(0, -1)
    const ptd = {}
    teams.forEach(t => { ptd[t.id] = { name: t.manager?.name || '?', scores: [], wins: 0, losses: 0, pf: 0, allPlaySum: 0 } })
    matchups.filter(m => prevWeeks.includes(m.week)).forEach(m => {
      const hId = m.home_team?.id, aId = m.away_team?.id
      if (ptd[hId]) { ptd[hId].scores.push(m.home_score); ptd[hId].pf += m.home_score; if (m.home_score > m.away_score) ptd[hId].wins++; else if (m.home_score < m.away_score) ptd[hId].losses++ }
      if (ptd[aId]) { ptd[aId].scores.push(m.away_score); ptd[aId].pf += m.away_score; if (m.away_score > m.home_score) ptd[aId].wins++; else if (m.away_score < m.home_score) ptd[aId].losses++ }
    })
    prevWeeks.forEach(wk => {
      const wkGames = matchups.filter(m => m.week === wk)
      const allScores = []
      wkGames.forEach(m => { allScores.push({ teamId: m.home_team?.id, score: m.home_score }); allScores.push({ teamId: m.away_team?.id, score: m.away_score }) })
      const n = allScores.length; if (n < 2) return
      allScores.forEach(({ teamId, score }) => { if (ptd[teamId]) ptd[teamId].allPlaySum += allScores.filter(o => o.teamId !== teamId && score > o.score).length / (n - 1) })
    })
    const prevRows = Object.values(ptd).map(({ name, scores, wins, losses, pf, allPlaySum }) => {
      const games = wins + losses, winPct = games > 0 ? wins / games : 0
      const avgScore = scores.length > 0 ? pf / scores.length : 0, med = median(scores)
      const allPlayWinPct = prevWeeks.length > 0 ? allPlaySum / prevWeeks.length : 0
      return { name, winPct, avgScore, medScore: med, allPlayWinPct }
    })
    const pm = Math.max(...prevRows.map(r => r.winPct)) || 1, pa2 = Math.max(...prevRows.map(r => r.avgScore)) || 1
    const pm2 = Math.max(...prevRows.map(r => r.medScore)) || 1, pa3 = Math.max(...prevRows.map(r => r.allPlayWinPct)) || 1
    return prevRows.map(r => ({ name: r.name, powerScore: ((r.winPct / pm * 100 * 2) + (r.avgScore / pa2 * 100 * 4) + (r.allPlayWinPct / pa3 * 100 * 2) + (r.medScore / pm2 * 100 * 2)) / 10 })).sort((a, b) => b.powerScore - a.powerScore)
  })()

  // ── superlatives ──
  const superlatives = (() => {
    if (!rows.length || !matchups.length) return null
    const allScoresFlat = matchups.flatMap(m => [
      { name: teamData[m.home_team?.id]?.name, score: m.home_score, won: m.home_score > m.away_score, week: m.week, oppScore: m.away_score },
      { name: teamData[m.away_team?.id]?.name, score: m.away_score, won: m.away_score > m.home_score, week: m.week, oppScore: m.home_score },
    ]).filter(x => x.name)

    const highScore = [...allScoresFlat].sort((a, b) => b.score - a.score)[0]
    const lowScore = [...allScoresFlat].sort((a, b) => a.score - b.score)[0]
    const highLoss = [...allScoresFlat].filter(x => !x.won).sort((a, b) => b.score - a.score)[0]

    const margins = matchups.map(m => ({ winner: teamData[m.home_team?.id]?.name || '?', loser: teamData[m.away_team?.id]?.name || '?', winScore: m.home_score > m.away_score ? m.home_score : m.away_score, loseScore: m.home_score > m.away_score ? m.away_score : m.home_score, margin: parseFloat(Math.abs(m.home_score - m.away_score).toFixed(2)), week: m.week, ...(m.home_score < m.away_score ? { winner: teamData[m.away_team?.id]?.name, loser: teamData[m.home_team?.id]?.name } : {}) }))
    const biggestWin = [...margins].sort((a, b) => b.margin - a.margin)[0]
    const closestGame = [...margins].sort((a, b) => a.margin - b.margin)[0]

    const seasonMedian = median(allScoresFlat.map(x => x.score))
    const medianMan = rows.reduce((best, r) => !best || Math.abs(r.avgScore - seasonMedian) < Math.abs(best.avgScore - seasonMedian) ? r : best, null)

    // weekly luck: for each week find who lost H2H but won all-play and vice versa
    let mostUnluckyWeek = null, mostLuckyWeek = null
    weeks.forEach(wk => {
      const wkGames = matchups.filter(m => m.week === wk)
      const allScores = []
      wkGames.forEach(m => { allScores.push({ teamId: m.home_team?.id, name: teamData[m.home_team?.id]?.name, score: m.home_score }); allScores.push({ teamId: m.away_team?.id, name: teamData[m.away_team?.id]?.name, score: m.away_score }) })
      const n = allScores.length; if (n < 2) return
      const apWins = {}
      allScores.forEach(({ teamId, score }) => { apWins[teamId] = allScores.filter(o => o.teamId !== teamId && score > o.score).length })
      wkGames.forEach(m => {
        const hWon = m.home_score > m.away_score
        const hAp = apWins[m.home_team?.id] || 0, aAp = apWins[m.away_team?.id] || 0
        const hName = teamData[m.home_team?.id]?.name, aName = teamData[m.away_team?.id]?.name
        if (!hWon && hAp > aAp) { if (!mostUnluckyWeek || hAp > mostUnluckyWeek.apWins) mostUnluckyWeek = { name: hName, week: wk, score: m.home_score, oppScore: m.away_score, apWins: hAp } }
        if (hWon && aAp > hAp) { if (!mostUnluckyWeek || aAp > mostUnluckyWeek.apWins) mostUnluckyWeek = { name: aName, week: wk, score: m.away_score, oppScore: m.home_score, apWins: aAp } }
        if (hWon && hAp < aAp) { if (!mostLuckyWeek || (n - 1 - hAp) > (mostLuckyWeek.apLosses || 0)) mostLuckyWeek = { name: hName, week: wk, score: m.home_score, oppScore: m.away_score, apLosses: n - 1 - hAp } }
        if (!hWon && aAp < hAp) { if (!mostLuckyWeek || (n - 1 - aAp) > (mostLuckyWeek.apLosses || 0)) mostLuckyWeek = { name: aName, week: wk, score: m.away_score, oppScore: m.home_score, apLosses: n - 1 - aAp } }
      })
    })

    const leader = standings[0]
    const basement = standings[standings.length - 1]
    const hotStreak = [...rows].filter(r => r.streakWin).sort((a, b) => b.streak - a.streak)[0]
    const coldStreak = [...rows].filter(r => r.streakWin === false).sort((a, b) => b.streak - a.streak)[0]
    const mostVolatile = [...rows].sort((a, b) => b.std - a.std)[0]
    const mostConsistent = [...rows].sort((a, b) => a.std - b.std)[0]
    const mostPF = [...rows].sort((a, b) => b.pf - a.pf)[0]
    const mostPA = [...rows].sort((a, b) => b.pa - a.pa)[0]
    const prLeader = ranked[0]
    const ljLeader = ljRanked[0]
    const luckiest = [...rows].sort((a, b) => b.luckRaw - a.luckRaw)[0]
    const unluckiest = [...rows].sort((a, b) => a.luckRaw - b.luckRaw)[0]

    let prRise = null, prDrop = null
    if (prevRanked.length) {
      ranked.forEach((r, curIdx) => {
        const prev = prevRanked.findIndex(p => p.name === r.name)
        if (prev < 0) return
        const move = prev - curIdx
        if (!prRise || move > prRise.move) prRise = { name: r.name, move, from: prev + 1, to: curIdx + 1 }
        if (!prDrop || move < prDrop.move) prDrop = { name: r.name, move, from: prev + 1, to: curIdx + 1 }
      })
    }

    return { highScore, lowScore, highLoss, biggestWin, closestGame, medianMan, mostUnluckyWeek, mostLuckyWeek, leader, basement, hotStreak, coldStreak, mostVolatile, mostConsistent, mostPF, mostPA, prLeader, prRise, prDrop, ljLeader, luckiest, unluckiest }
  })()

  const generateSummary = (wk) => {
    if (!wk || !matchups.length) return
    const weekGames = matchups.filter(m => m.week === wk)
    const priorGames = matchups.filter(m => m.week <= wk)
    const priorWeeks = [...new Set(priorGames.map(m => m.week))].sort((a, b) => a - b)

    // standings + metrics through this week
    const td = {}
    teams.forEach(t => { td[t.id] = { name: t.manager?.name || '?', scores: [], wins: 0, losses: 0, pf: 0, pa: 0, allPlaySum: 0 } })
    priorGames.forEach(m => {
      const hId = m.home_team?.id, aId = m.away_team?.id
      if (td[hId]) { td[hId].scores.push(m.home_score); td[hId].pf += m.home_score; td[hId].pa += m.away_score; if (m.home_score > m.away_score) td[hId].wins++; else if (m.home_score < m.away_score) td[hId].losses++ }
      if (td[aId]) { td[aId].scores.push(m.away_score); td[aId].pf += m.away_score; td[aId].pa += m.home_score; if (m.away_score > m.home_score) td[aId].wins++; else if (m.away_score < m.home_score) td[aId].losses++ }
    })
    priorWeeks.forEach(w => {
      const wkGames = priorGames.filter(m => m.week === w)
      const allScores = []
      wkGames.forEach(m => { allScores.push({ teamId: m.home_team?.id, score: m.home_score }); allScores.push({ teamId: m.away_team?.id, score: m.away_score }) })
      const n = allScores.length; if (n < 2) return
      allScores.forEach(({ teamId, score }) => { if (td[teamId]) td[teamId].allPlaySum += allScores.filter(o => o.teamId !== teamId && score > o.score).length / (n - 1) })
    })
    const wkRows = Object.values(td).map(({ name, scores, wins, losses, pf, pa, allPlaySum }) => {
      const games = wins + losses, winPct = games > 0 ? wins / games : 0
      const avgScore = scores.length > 0 ? pf / scores.length : 0, med = median(scores)
      const allPlayWinPct = priorWeeks.length > 0 ? allPlaySum / priorWeeks.length : 0
      return { name, wins, losses, pf, pa, winPct, avgScore, medScore: med, allPlayWinPct, allPlaySum }
    })
    const mxW = Math.max(...wkRows.map(r => r.winPct)) || 1, mxA = Math.max(...wkRows.map(r => r.avgScore)) || 1
    const mxM = Math.max(...wkRows.map(r => r.medScore)) || 1, mxAp = Math.max(...wkRows.map(r => r.allPlayWinPct)) || 1
    const wkRanked = wkRows.map(r => ({ ...r, powerScore: parseFloat(((r.winPct / mxW * 100 * 2) + (r.avgScore / mxA * 100 * 4) + (r.allPlayWinPct / mxAp * 100 * 2) + (r.medScore / mxM * 100 * 2)) / 10) })).sort((a, b) => b.powerScore - a.powerScore)
    const wkStandings = [...wkRows].sort((a, b) => b.wins - a.wins || b.pf - a.pf)
    const wkLj = [...wkRows].sort((a, b) => b.allPlayWinPct - a.allPlayWinPct)

    const allWeekScores = []
    weekGames.forEach(m => {
      allWeekScores.push({ name: td[m.home_team?.id]?.name, score: m.home_score, won: m.home_score > m.away_score })
      allWeekScores.push({ name: td[m.away_team?.id]?.name, score: m.away_score, won: m.away_score > m.home_score })
    })
    const highScore = [...allWeekScores].sort((a, b) => b.score - a.score)[0]
    const lowScore = [...allWeekScores].sort((a, b) => a.score - b.score)[0]
    const margins = weekGames.map(m => {
      const hWon = m.home_score > m.away_score
      return { winner: td[hWon ? m.home_team?.id : m.away_team?.id]?.name, loser: td[hWon ? m.away_team?.id : m.home_team?.id]?.name, margin: parseFloat(Math.abs(m.home_score - m.away_score).toFixed(2)), winScore: Math.max(m.home_score, m.away_score), loseScore: Math.min(m.home_score, m.away_score) }
    })
    const biggestWin = [...margins].sort((a, b) => b.margin - a.margin)[0]
    const closestGame = [...margins].sort((a, b) => a.margin - b.margin)[0]

    const lines = []
    lines.push(`🏈 WEEK ${wk} RECAP — 2026-27 SEASON`)
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    lines.push('')
    lines.push('📊 MATCHUP RESULTS')
    weekGames.forEach(m => {
      const hWon = m.home_score > m.away_score
      const hName = td[m.home_team?.id]?.name, aName = td[m.away_team?.id]?.name
      lines.push(`  ${hWon ? '✅' : '❌'} ${hName}: ${m.home_score?.toFixed(2)}  vs  ${aName}: ${m.away_score?.toFixed(2)} ${!hWon ? '✅' : '❌'}`)
    })
    lines.push('')
    lines.push('📈 STANDINGS')
    wkStandings.forEach((r, i) => { lines.push(`  ${ordinal(i + 1).padEnd(4)} ${r.name.padEnd(12)} ${r.wins}-${r.losses}  (${r.pf.toFixed(1)} PF)`) })
    lines.push('')
    lines.push('⚡ POWER RANKINGS')
    wkRanked.forEach((r, i) => { lines.push(`  ${ordinal(i + 1).padEnd(4)} ${r.name.padEnd(12)} ${r.wins}-${r.losses}  PWR: ${r.powerScore.toFixed(1)}`) })
    lines.push('')
    lines.push('🎯 LJ INDEX (ALL-PLAY WIN%)')
    wkLj.forEach((r, i) => { lines.push(`  ${ordinal(i + 1).padEnd(4)} ${r.name.padEnd(12)} ${(r.allPlayWinPct * 100).toFixed(1)}%  (${r.allPlaySum.toFixed(1)} all-play W)`) })
    lines.push('')
    lines.push(`🏆 WEEK ${wk} SUPERLATIVES`)
    if (highScore) lines.push(`  🔥 High Score:   ${highScore.name} — ${highScore.score?.toFixed(2)} pts`)
    if (lowScore) lines.push(`  💀 Low Score:    ${lowScore.name} — ${lowScore.score?.toFixed(2)} pts`)
    if (biggestWin) lines.push(`  📈 Biggest Win:  ${biggestWin.winner} def. ${biggestWin.loser} by ${biggestWin.margin}`)
    if (closestGame) lines.push(`  😰 Closest:      ${closestGame.winner} def. ${closestGame.loser} by ${closestGame.margin}`)

    setSummary(lines.join('\n'))
  }

  if (!mounted) return null

  const inp = { background: d ? '#111' : '#e8e4dc', border: `1px solid ${border}`, color: text, padding: '8px 12px', fontSize: '13px', fontFamily: "'Inter', sans-serif", outline: 'none', width: '100%' }
  const hStyle = (align = 'left') => ({ padding: '10px 14px', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, textAlign: align, borderBottom: `1px solid ${border}`, fontWeight: '500', whiteSpace: 'nowrap' })
  const cStyle = (align = 'left') => ({ padding: '12px 14px', fontSize: '13px', textAlign: align, borderBottom: `1px solid ${border}`, color: text, whiteSpace: 'nowrap' })

  const SectionLabel = ({ children }) => (
    <p style={{ fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', color: muted, marginBottom: '20px' }}>{children}</p>
  )

  const StatCard = ({ label, value, sub, color }) => (
    <div style={{ background: cardBg, padding: '18px 20px', borderTop: `2px solid ${color || border}` }}>
      <div style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: muted, marginBottom: '8px' }}>{label}</div>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '15px', color: text, marginBottom: '4px', lineHeight: 1.3 }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: muted, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />

      {/* PIN modal */}
      {pinModal && (
        <>
          <div onClick={() => { setPinModal(null); setPinInput(''); setPinError('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 201, background: d ? '#0a0a0a' : '#f4f1ec', border: `1px solid ${border}`, padding: '32px', width: effectiveMobile ? '90vw' : '340px' }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', color: text, marginBottom: '8px' }}>
              {pinModal === 'edit' ? 'Edit Draft Order' : 'Clear Draft'}
            </h3>
            <p style={{ fontSize: '12px', color: muted, marginBottom: '20px' }}>Admin PIN required.</p>
            <input type="password" placeholder="PIN" value={pinInput} onChange={e => { setPinInput(e.target.value); setPinError('') }} onKeyDown={e => e.key === 'Enter' && handlePinSubmit()} style={{ ...inp, marginBottom: '8px' }} />
            {pinError && <p style={{ fontSize: '12px', color: red, marginBottom: '8px' }}>{pinError}</p>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button onClick={handlePinSubmit} style={{ background: pinModal === 'edit' ? text : red, color: pinModal === 'edit' ? bg : '#fff', border: 'none', padding: '10px 20px', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif", fontWeight: '500', flex: 1 }}>{pinModal === 'edit' ? 'Unlock' : 'Confirm'}</button>
              <button onClick={() => { setPinModal(null); setPinInput(''); setPinError('') }} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '10px 20px', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
            </div>
          </div>
        </>
      )}

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px,6vw,72px)', fontWeight: '400', letterSpacing: '-0.02em', marginBottom: '4px' }}>2026-27 Season</h1>
        <p style={{ color: muted, fontSize: '13px', marginBottom: '56px' }}>Live dashboard — updates as scores come in</p>

        {/* ── SECTION 1: DRAFT ORDER ── */}
        <div style={{ marginBottom: '64px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <SectionLabel>Draft Order</SectionLabel>
            {!editing && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setPinModal('edit'); setPinInput(''); setPinError('') }} style={{ background: text, color: bg, border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", fontWeight: '500' }}>
                  {picks.length > 0 ? 'Edit' : 'Set Order'}
                </button>
                {picks.length > 0 && (
                  <button onClick={() => { setPinModal('clear-all'); setPinInput(''); setPinError('') }} style={{ background: 'none', border: `1px solid ${red}`, color: red, padding: '8px 12px', cursor: 'pointer', fontSize: '11px', fontFamily: "'Inter', sans-serif" }}>Clear</button>
                )}
              </div>
            )}
            {editing && <button onClick={() => { setEditing(false); setSaveError('') }} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '8px 16px', cursor: 'pointer', fontSize: '11px', fontFamily: "'Inter', sans-serif" }}>Cancel</button>}
          </div>

          {!editing && picks.length === 0 && (
            <p style={{ color: muted, fontSize: '13px' }}>No draft order set yet.</p>
          )}
          {!editing && picks.length > 0 && (
            <div style={{ border: `1px solid ${border}`, maxWidth: '400px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr', padding: '8px 14px', borderBottom: `1px solid ${border}`, background: cardBg }}>
                <span style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted }}>Pick</span>
                <span style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted }}>Manager</span>
              </div>
              {picks.map((pick, i) => (
                <div key={pick.id} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', alignItems: 'center', padding: '12px 14px', borderBottom: i < picks.length - 1 ? `1px solid ${border}` : 'none', background: i % 2 === 0 ? 'transparent' : (d ? '#080808' : '#e8e4dc') }}>
                  <span style={{ fontSize: '20px', fontWeight: '700', color: gold, fontFamily: "'Playfair Display', serif" }}>{pick.pick_number}</span>
                  <span style={{ fontSize: '15px', color: text, fontFamily: "'Playfair Display', serif" }}>{pick.manager_name}</span>
                </div>
              ))}
            </div>
          )}
          {editing && (
            <div style={{ maxWidth: '400px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                {slots.map((val, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 1fr', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '18px', fontWeight: '700', color: gold, fontFamily: "'Playfair Display', serif", textAlign: 'right' }}>{i + 1}</span>
                    <select value={val} onChange={e => setSlots(s => { const n = [...s]; n[i] = e.target.value; return n })} style={{ ...inp, cursor: 'pointer' }}>
                      <option value="">— unassigned —</option>
                      {managers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {saveError && <p style={{ fontSize: '12px', color: red, marginBottom: '12px' }}>{saveError}</p>}
              <button onClick={handleSave} disabled={submitting} style={{ background: text, color: bg, border: 'none', padding: '12px 24px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", fontWeight: '500', opacity: submitting ? 0.6 : 1 }}>
                {submitting ? 'Saving...' : 'Save Draft Order'}
              </button>
            </div>
          )}
        </div>

        {/* ── SECTION 2: STANDINGS ── */}
        {standings.length > 0 && (
          <div style={{ marginBottom: '64px' }}>
            <SectionLabel>Standings</SectionLabel>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
                <thead>
                  <tr style={{ background: cardBg }}>
                    <th style={hStyle('center')}>Rk</th>
                    <th style={hStyle()}>Manager</th>
                    <th style={hStyle('center')}>W</th>
                    <th style={hStyle('center')}>L</th>
                    <th style={hStyle('right')}>PF</th>
                    <th style={hStyle('right')}>PA</th>
                    <th style={hStyle('right')}>Diff</th>
                    <th style={hStyle('right')}>Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((r, i) => {
                    const diff = parseFloat((r.pf - r.pa).toFixed(2))
                    const playoff = i < 6
                    const bubble = i === 5
                    return (
                      <tr key={r.name} style={{ background: i % 2 === 0 ? 'transparent' : rowAlt }}>
                        <td style={{ ...cStyle('center'), color: playoff ? (bubble ? gold : green) : muted, fontWeight: '600' }}>{ordinal(i + 1)}</td>
                        <td style={{ ...cStyle(), fontFamily: "'Playfair Display', serif", fontSize: '15px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {r.name}
                            {playoff && !bubble && <span style={{ fontSize: '9px', color: green, border: `1px solid ${green}`, padding: '1px 4px', letterSpacing: '0.1em' }}>IN</span>}
                            {bubble && <span style={{ fontSize: '9px', color: gold, border: `1px solid ${gold}`, padding: '1px 4px', letterSpacing: '0.1em' }}>BUBBLE</span>}
                          </span>
                        </td>
                        <td style={cStyle('center')}>{r.wins}</td>
                        <td style={cStyle('center')}>{r.losses}</td>
                        <td style={cStyle('right')}>{r.pf.toFixed(1)}</td>
                        <td style={cStyle('right')}>{r.pa.toFixed(1)}</td>
                        <td style={{ ...cStyle('right'), color: diff >= 0 ? green : red }}>{diff >= 0 ? '+' : ''}{diff.toFixed(1)}</td>
                        <td style={cStyle('right')}>{r.avgScore.toFixed(1)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── SECTION 3: POWER RANKINGS ── */}
        {ranked.length > 0 && (
          <div style={{ marginBottom: '64px' }}>
            <SectionLabel>Power Rankings</SectionLabel>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
                <thead>
                  <tr style={{ background: cardBg }}>
                    <th style={hStyle('center')}>Rk</th>
                    <th style={hStyle()}>Manager</th>
                    <th style={hStyle('center')}>W-L</th>
                    <th style={hStyle('right')}>Power</th>
                    <th style={hStyle('right')}>Avg PPG</th>
                    <th style={hStyle('right')}>All-Play %</th>
                    {!effectiveMobile && <th style={hStyle('right')}>Trend</th>}
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((r, i) => {
                    const prev = prevRanked.findIndex(p => p.name === r.name)
                    const move = prev >= 0 ? prev - i : 0
                    return (
                      <tr key={r.name} style={{ background: i % 2 === 0 ? 'transparent' : rowAlt }}>
                        <td style={{ ...cStyle('center'), fontWeight: '700', color: i === 0 ? gold : muted }}>{i + 1}</td>
                        <td style={{ ...cStyle(), fontFamily: "'Playfair Display', serif", fontSize: '15px' }}>{r.name}</td>
                        <td style={cStyle('center')}>{r.wins}-{r.losses}</td>
                        <td style={{ ...cStyle('right'), fontWeight: '600' }}>{r.powerScore.toFixed(1)}</td>
                        <td style={cStyle('right')}>{r.avgScore.toFixed(1)}</td>
                        <td style={cStyle('right')}>{(r.allPlayWinPct * 100).toFixed(1)}%</td>
                        {!effectiveMobile && (
                          <td style={{ ...cStyle('right'), color: move > 0 ? green : move < 0 ? red : muted, fontWeight: '500' }}>
                            {prev < 0 ? '—' : move > 0 ? `▲${move}` : move < 0 ? `▼${Math.abs(move)}` : '—'}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── SECTION 4: LJ INDEX ── */}
        {ljRanked.length > 0 && (
          <div style={{ marginBottom: '64px' }}>
            <SectionLabel>LJ Index — All-Play Win %</SectionLabel>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
                <thead>
                  <tr style={{ background: cardBg }}>
                    <th style={hStyle('center')}>Rk</th>
                    <th style={hStyle()}>Manager</th>
                    <th style={hStyle('center')}>W-L</th>
                    <th style={hStyle('right')}>All-Play %</th>
                    <th style={hStyle('right')}>All-Play W</th>
                    <th style={hStyle('right')}>Luck</th>
                    <th style={hStyle('right')}>Avg PPG</th>
                  </tr>
                </thead>
                <tbody>
                  {ljRanked.map((r, i) => (
                    <tr key={r.name} style={{ background: i % 2 === 0 ? 'transparent' : rowAlt }}>
                      <td style={{ ...cStyle('center'), fontWeight: '700', color: i === 0 ? gold : muted }}>{i + 1}</td>
                      <td style={{ ...cStyle(), fontFamily: "'Playfair Display', serif", fontSize: '15px' }}>{r.name}</td>
                      <td style={cStyle('center')}>{r.wins}-{r.losses}</td>
                      <td style={{ ...cStyle('right'), fontWeight: '600' }}>{(r.allPlayWinPct * 100).toFixed(1)}%</td>
                      <td style={cStyle('right')}>{r.allPlaySum.toFixed(1)}</td>
                      <td style={{ ...cStyle('right'), color: r.luckRaw > 0 ? green : r.luckRaw < 0 ? red : muted, fontWeight: '500' }}>
                        {r.luckRaw > 0 ? '+' : ''}{r.luckRaw}
                      </td>
                      <td style={cStyle('right')}>{r.avgScore.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── SECTION 5: SUPERLATIVES ── */}
        {superlatives && (
          <div style={{ marginBottom: '64px' }}>
            <SectionLabel>Season Superlatives</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1px', background: border }}>
              <StatCard label="🔥 High Score" value={`${superlatives.highScore?.name} — ${superlatives.highScore?.score?.toFixed(2)}`} sub={`Week ${superlatives.highScore?.week} · ${superlatives.highScore?.won ? 'Won' : 'Still lost'}`} color={green} />
              <StatCard label="💀 Low Score" value={`${superlatives.lowScore?.name} — ${superlatives.lowScore?.score?.toFixed(2)}`} sub={`Week ${superlatives.lowScore?.week} · ${superlatives.lowScore?.won ? 'Still won' : 'Lost'}`} color={red} />
              <StatCard label="📈 Biggest Win" value={`${superlatives.biggestWin?.winner} def. ${superlatives.biggestWin?.loser}`} sub={`${superlatives.biggestWin?.winScore?.toFixed(2)} – ${superlatives.biggestWin?.loseScore?.toFixed(2)} · Margin: ${superlatives.biggestWin?.margin} · Wk ${superlatives.biggestWin?.week}`} color={gold} />
              <StatCard label="😰 Closest Game" value={`${superlatives.closestGame?.winner} def. ${superlatives.closestGame?.loser}`} sub={`${superlatives.closestGame?.winScore?.toFixed(2)} – ${superlatives.closestGame?.loseScore?.toFixed(2)} · Margin: ${superlatives.closestGame?.margin} · Wk ${superlatives.closestGame?.week}`} color={blue} />
              <StatCard label="🏆 Best Loss" value={`${superlatives.highLoss?.name} — ${superlatives.highLoss?.score?.toFixed(2)}`} sub={`Week ${superlatives.highLoss?.week} · Lost to ${superlatives.highLoss?.oppScore?.toFixed(2)}`} color={gold} />
              <StatCard label="🎯 Median Man" value={superlatives.medianMan?.name} sub={`Avg ${superlatives.medianMan?.avgScore?.toFixed(1)} PPG — closest to league median`} color={border} />
              <StatCard label="🍀 Luckiest Week" value={superlatives.mostLuckyWeek?.name || '—'} sub={superlatives.mostLuckyWeek ? `Week ${superlatives.mostLuckyWeek.week} · Won H2H (${superlatives.mostLuckyWeek.score?.toFixed(1)}) despite poor all-play` : 'No data yet'} color={green} />
              <StatCard label="😤 Unluckiest Week" value={superlatives.mostUnluckyWeek?.name || '—'} sub={superlatives.mostUnluckyWeek ? `Week ${superlatives.mostUnluckyWeek.week} · Lost H2H (${superlatives.mostUnluckyWeek.score?.toFixed(1)}) despite strong all-play` : 'No data yet'} color={red} />
              <StatCard label="👑 Season Leader" value={superlatives.leader?.name} sub={`${superlatives.leader?.wins}-${superlatives.leader?.losses} · ${superlatives.leader?.pf?.toFixed(1)} PF`} color={gold} />
              <StatCard label="🗑️ Basement" value={superlatives.basement?.name} sub={`${superlatives.basement?.wins}-${superlatives.basement?.losses} · ${superlatives.basement?.pf?.toFixed(1)} PF`} color={red} />
              <StatCard label="⚡ Hot Streak" value={superlatives.hotStreak ? `${superlatives.hotStreak.name} — ${superlatives.hotStreak.streak}W` : 'No active streak'} sub={superlatives.hotStreak ? `${superlatives.hotStreak.streak} straight wins` : ''} color={green} />
              <StatCard label="❄️ Cold Streak" value={superlatives.coldStreak ? `${superlatives.coldStreak.name} — ${superlatives.coldStreak.streak}L` : 'No active streak'} sub={superlatives.coldStreak ? `${superlatives.coldStreak.streak} straight losses` : ''} color={red} />
              <StatCard label="🎢 Boom or Bust" value={superlatives.mostVolatile?.name} sub={`Std dev: ${superlatives.mostVolatile?.std} · Avg: ${superlatives.mostVolatile?.avgScore?.toFixed(1)} PPG`} color={red} />
              <StatCard label="🏹 Most Consistent" value={superlatives.mostConsistent?.name} sub={`Std dev: ${superlatives.mostConsistent?.std} · Avg: ${superlatives.mostConsistent?.avgScore?.toFixed(1)} PPG`} color={green} />
              <StatCard label="📊 Most PF" value={`${superlatives.mostPF?.name} — ${superlatives.mostPF?.pf?.toFixed(1)}`} sub={`${superlatives.mostPF?.avgScore?.toFixed(1)} PPG`} color={green} />
              <StatCard label="🥶 Most PA" value={`${superlatives.mostPA?.name} — ${superlatives.mostPA?.pa?.toFixed(1)}`} sub="Most points allowed this season" color={red} />
              <StatCard label="🔝 Power #1" value={superlatives.prLeader?.name} sub={`Power score: ${superlatives.prLeader?.powerScore?.toFixed(1)}`} color={gold} />
              <StatCard label="📉 PR Drop" value={superlatives.prDrop ? `${superlatives.prDrop.name}` : '—'} sub={superlatives.prDrop && superlatives.prDrop.move < 0 ? `Fell ${Math.abs(superlatives.prDrop.move)} spot${Math.abs(superlatives.prDrop.move) > 1 ? 's' : ''} (${ordinal(superlatives.prDrop.from)} → ${ordinal(superlatives.prDrop.to)})` : 'Needs 2+ weeks'} color={red} />
              <StatCard label="📈 PR Rise" value={superlatives.prRise ? `${superlatives.prRise.name}` : '—'} sub={superlatives.prRise && superlatives.prRise.move > 0 ? `Rose ${superlatives.prRise.move} spot${superlatives.prRise.move > 1 ? 's' : ''} (${ordinal(superlatives.prRise.from)} → ${ordinal(superlatives.prRise.to)})` : 'Needs 2+ weeks'} color={green} />
              <StatCard label="🧮 LJ Leader" value={superlatives.ljLeader?.name} sub={`${(superlatives.ljLeader?.allPlayWinPct * 100)?.toFixed(1)}% all-play · ${superlatives.ljLeader?.luckRaw > 0 ? '+' : ''}${superlatives.ljLeader?.luckRaw} luck`} color={blue} />
            </div>
          </div>
        )}

        {/* ── SECTION 6: WEEKLY RECAP GENERATOR ── */}
        {weeks.length > 0 && (
          <div style={{ marginBottom: '64px' }}>
            <SectionLabel>Weekly Recap Generator</SectionLabel>
            <p style={{ fontSize: '12px', color: muted, marginBottom: '20px' }}>Pick a week and copy the formatted recap to paste in your group chat.</p>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
              <select
                value={recapWeek || ''}
                onChange={e => { setRecapWeek(parseInt(e.target.value)); setSummary('') }}
                style={{ background: d ? '#111' : '#e8e4dc', border: `1px solid ${border}`, color: text, padding: '8px 14px', fontSize: '13px', fontFamily: "'Inter', sans-serif", outline: 'none', cursor: 'pointer' }}
              >
                <option value="">Select week…</option>
                {weeks.map(w => <option key={w} value={w}>Week {w}</option>)}
              </select>
              <button
                onClick={() => generateSummary(recapWeek)}
                disabled={!recapWeek}
                style={{ background: text, color: bg, border: 'none', padding: '10px 24px', cursor: recapWeek ? 'pointer' : 'not-allowed', fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", fontWeight: '500', opacity: recapWeek ? 1 : 0.4 }}
              >
                Generate
              </button>
            </div>
            {summary && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', color: muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Ready to copy</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(summary); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                    style={{ background: copied ? green : text, color: bg, border: 'none', padding: '8px 20px', cursor: 'pointer', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", fontWeight: '500', transition: 'background 0.2s' }}
                  >
                    {copied ? '✓ Copied!' : 'Copy'}
                  </button>
                </div>
                <pre style={{ background: cardBg, border: `1px solid ${border}`, padding: '20px', fontSize: '13px', fontFamily: "'Courier New', monospace", lineHeight: 1.7, color: text, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                  {summary}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ── SECTION 7: WEEKLY BETTING LINES ── */}
        {sbGames.length > 0 && (
          <div style={{ marginBottom: '64px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <SectionLabel>Week {sbGames[0]?.week} Betting Lines</SectionLabel>
              <a href="/sportsbook" style={{ fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: muted, textDecoration: 'none', border: `1px solid ${border}`, padding: '6px 14px' }}>
                Full Sportsbook →
              </a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: border }}>
              {sbGames.map(game => (
                <div key={game.id} style={{ background: cardBg, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '15px', color: text }}>
                      {game.team_a} vs {game.team_b}
                    </span>
                    {game.is_locked && (
                      <span style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: muted, border: `1px solid ${border}`, padding: '2px 6px' }}>Locked</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                    {game.spread != null && (
                      <div>
                        <div style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '6px' }}>Spread</div>
                        <div style={{ fontSize: '13px', color: text }}>
                          {game.team_a} {game.spread > 0 ? `+${game.spread}` : game.spread}
                          <span style={{ color: muted, fontSize: '11px' }}> (-110)</span>
                        </div>
                        <div style={{ fontSize: '13px', color: text }}>
                          {game.team_b} {game.spread < 0 ? `+${Math.abs(game.spread)}` : `-${game.spread}`}
                          <span style={{ color: muted, fontSize: '11px' }}> (-110)</span>
                        </div>
                      </div>
                    )}
                    {game.over_under != null && (
                      <div>
                        <div style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '6px' }}>Over / Under</div>
                        <div style={{ fontSize: '13px', color: text }}>O {game.over_under}<span style={{ color: muted, fontSize: '11px' }}> (-110)</span></div>
                        <div style={{ fontSize: '13px', color: text }}>U {game.over_under}<span style={{ color: muted, fontSize: '11px' }}> (-110)</span></div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '6px' }}>Moneyline</div>
                      <div style={{ fontSize: '13px', color: text }}>
                        {game.team_a} <span style={{ color: game.ml_a > 0 ? green : red, fontWeight: '500' }}>{game.ml_a > 0 ? `+${game.ml_a}` : game.ml_a}</span>
                      </div>
                      <div style={{ fontSize: '13px', color: text }}>
                        {game.team_b} <span style={{ color: game.ml_b > 0 ? green : red, fontWeight: '500' }}>{game.ml_b > 0 ? `+${game.ml_b}` : game.ml_b}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {matchups.length === 0 && teams.length === 0 && (
          <p style={{ color: muted, fontSize: '14px', marginTop: '40px' }}>No 2026-27 season data yet — check back once the season starts.</p>
        )}
      </div>
    </div>
  )
}
