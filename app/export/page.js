'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase, LEAGUE_ID } from '../../lib/supabase'
import { downloadCSV, downloadJSON } from '../../lib/exportUtils'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'

const todayStr = () => new Date().toISOString().slice(0, 10)

const median = (arr) => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export default function ExportPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, rowAlt, green, gold, blue } = useLayout()

  const [managers, setManagers] = useState([])
  const [seasons, setSeasons] = useState([])
  const [teams, setTeams] = useState([])
  const [matchups, setMatchups] = useState([])
  const [allMatchups, setAllMatchups] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState({
    allTimeTeams: true,
    managerCareer: true,
    managerH2H: true,
    seasonStandings: true,
    yearlySchedule: true,
    champions: true,
  })
  const [format, setFormat] = useState('csv')
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const load = async () => {
      const [{ data: mgrs }, { data: szns }, { data: tms }, { data: mups }, { data: allMups }] = await Promise.all([
        supabase.from('managers').select('*').eq('league_id', LEAGUE_ID),
        supabase.from('seasons').select('*, champion:champion_id(id, name), mol_bowl_winner:mol_bowl_winner_id(id, name), mol_bowl_loser:mol_bowl_loser_id(id, name)').eq('league_id', LEAGUE_ID),
        supabase.from('teams').select('*, manager:manager_id(id, name, slug), season:season_id(id, year)').eq('league_id', LEAGUE_ID),
        supabase.from('matchups')
          .select('*, home_team:home_team_id(id, manager_id), away_team:away_team_id(id, manager_id), season:season_id(year)')
          .eq('league_id', LEAGUE_ID)
          .eq('is_playoff', false),
        supabase.from('matchups')
          .select('*, home_team:home_team_id(id, manager_id, team_name), away_team:away_team_id(id, manager_id, team_name), season:season_id(year)')
          .eq('league_id', LEAGUE_ID),
      ])
      setManagers(mgrs || [])
      setSeasons(szns || [])
      setTeams(tms || [])
      setMatchups(mups || [])
      setAllMatchups(allMups || [])
      setLoading(false)
    }
    load()
  }, [])

  // Power score + luck per team-season (same formula used on All-Time Teams / Managers pages)
  const teamStats = useMemo(() => {
    if (teams.length === 0 || matchups.length === 0) return {}
    const result = {}
    const matchupsByYear = {}
    matchups.forEach(m => {
      const yr = m.season?.year
      if (!yr) return
      if (!matchupsByYear[yr]) matchupsByYear[yr] = []
      matchupsByYear[yr].push(m)
    })
    teams.forEach(t => {
      const yr = t.season?.year
      const seasonMatchups = matchupsByYear[yr] || []
      const weeks = [...new Set(seasonMatchups.map(m => m.week))].sort((a, b) => a - b)
      const myScores = []
      seasonMatchups.forEach(m => {
        if (m.home_team?.manager_id === t.manager_id) myScores.push({ week: m.week, score: m.home_score })
        else if (m.away_team?.manager_id === t.manager_id) myScores.push({ week: m.week, score: m.away_score })
      })
      if (myScores.length === 0) { result[t.id] = { powerScore: null, luck: null }; return }
      let allPlayTotal = 0
      weeks.forEach(week => {
        const weekGames = seasonMatchups.filter(m => m.week === week)
        const allScores = []
        weekGames.forEach(m => {
          allScores.push({ managerId: m.home_team?.manager_id, score: m.home_score })
          allScores.push({ managerId: m.away_team?.manager_id, score: m.away_score })
        })
        const myWeekScore = myScores.find(s => s.week === week)?.score
        if (myWeekScore === undefined || allScores.length < 2) return
        const wins = allScores.filter(o => o.managerId !== t.manager_id && myWeekScore > o.score).length
        allPlayTotal += wins / (allScores.length - 1)
      })
      const luck = parseFloat((t.wins - allPlayTotal).toFixed(2))
      const scores = myScores.map(s => s.score)
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
      const winPct = (t.wins + t.losses) > 0 ? t.wins / (t.wins + t.losses) : 0
      const allPlayWinPct = weeks.length > 0 ? allPlayTotal / weeks.length : 0
      result[t.id] = { luck, winPct, avgScore, medianScore: median(scores), allPlayWinPct, _needsNorm: true }
    })
    const yearGroups = {}
    teams.forEach(t => {
      const yr = t.season?.year
      if (!yearGroups[yr]) yearGroups[yr] = []
      yearGroups[yr].push(t)
    })
    Object.values(yearGroups).forEach(seasonTeams => {
      const stats = seasonTeams.map(t => result[t.id]).filter(s => s?._needsNorm)
      if (stats.length === 0) return
      const maxWin = Math.max(...stats.map(s => s.winPct))
      const maxAvg = Math.max(...stats.map(s => s.avgScore))
      const maxMed = Math.max(...stats.map(s => s.medianScore))
      const maxAp = Math.max(...stats.map(s => s.allPlayWinPct))
      seasonTeams.forEach(t => {
        const s = result[t.id]
        if (!s?._needsNorm) return
        const powerScore = ((s.winPct / (maxWin || 1) * 100 * 2) + (s.avgScore / (maxAvg || 1) * 100 * 4) + (s.allPlayWinPct / (maxAp || 1) * 100 * 2) + (s.medianScore / (maxMed || 1) * 100 * 2)) / 10
        result[t.id] = { luck: s.luck, powerScore: parseFloat(powerScore.toFixed(2)) }
      })
    })
    return result
  }, [teams, matchups])

  const datasets = useMemo(() => {
    // 1. All-time teams
    const allTimeTeamsRows = teams.map(t => {
      const diff = parseFloat((t.points_for - t.points_against).toFixed(2))
      const games = t.wins + t.losses
      const ppgDiff = games > 0 ? parseFloat((diff / games).toFixed(2)) : 0
      const winPct = games > 0 ? parseFloat(((t.wins / games) * 100).toFixed(1)) : 0
      const stats = teamStats[t.id] || {}
      return {
        year: t.season?.year, manager: t.manager?.name, team_name: t.team_name,
        wins: t.wins, losses: t.losses, points_for: t.points_for, points_against: t.points_against,
        diff, ppg_diff: ppgDiff, win_pct: winPct,
        power_score: stats.powerScore ?? '', luck: stats.luck ?? '',
        final_standing: t.final_standing, playoff_result: t.playoff_result || '', made_playoffs: t.made_playoffs,
      }
    }).sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || (a.final_standing ?? 0) - (b.final_standing ?? 0))

    // 2. Manager career stats
    const managerCareerRows = managers.map(m => {
      const mTeams = teams.filter(t => t.manager_id === m.id)
      if (mTeams.length === 0) return null
      const wins = mTeams.reduce((s, t) => s + t.wins, 0)
      const losses = mTeams.reduce((s, t) => s + t.losses, 0)
      const pf = parseFloat(mTeams.reduce((s, t) => s + t.points_for, 0).toFixed(2))
      const pa = parseFloat(mTeams.reduce((s, t) => s + t.points_against, 0).toFixed(2))
      const games = wins + losses
      const championships = seasons.filter(s => s.champion?.id === m.id).length
      const sackos = seasons.filter(s => s.mol_bowl_loser?.id === m.id).length
      const playoffAppearances = mTeams.filter(t => t.made_playoffs).length
      const psValues = mTeams.map(t => teamStats[t.id]?.powerScore).filter(v => v != null)
      return {
        manager: m.name, seasons_played: mTeams.length,
        wins, losses, win_pct: games > 0 ? parseFloat(((wins / games) * 100).toFixed(1)) : 0,
        points_for: pf, points_against: pa, diff: parseFloat((pf - pa).toFixed(2)),
        avg_ppg: games > 0 ? parseFloat((pf / games).toFixed(2)) : 0,
        championships, sackos, playoff_appearances: playoffAppearances,
        avg_power_score: psValues.length ? parseFloat((psValues.reduce((a, b) => a + b, 0) / psValues.length).toFixed(2)) : '',
      }
    }).filter(Boolean).sort((a, b) => b.championships - a.championships || b.win_pct - a.win_pct)

    // 3. Yearly season standings (team-by-team, every season)
    const seasonStandingsRows = teams.map(t => ({
      year: t.season?.year, final_standing: t.final_standing, manager: t.manager?.name, team_name: t.team_name,
      wins: t.wins, losses: t.losses, points_for: t.points_for, points_against: t.points_against,
      diff: parseFloat((t.points_for - t.points_against).toFixed(2)),
      playoff_result: t.playoff_result || '', made_playoffs: t.made_playoffs,
    })).sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || (a.final_standing ?? 0) - (b.final_standing ?? 0))

    // 4. Champions history (one row per season)
    const championsRows = seasons.map(s => {
      const champTeam = teams.find(t => t.season?.id === s.id && t.playoff_result === 'Champion')
      const runnerUpTeam = teams.find(t => t.season?.id === s.id && t.playoff_result === 'Runner Up')
      return {
        year: s.year, champion: s.champion?.name || champTeam?.manager?.name || '',
        runner_up: runnerUpTeam?.manager?.name || '',
        sacko_winner: s.mol_bowl_winner?.name || '',
        sacko: s.mol_bowl_loser?.name || '',
      }
    }).sort((a, b) => (b.year ?? 0) - (a.year ?? 0))

    // 5. Manager head-to-head records (one row per unique manager pair, all games including playoffs)
    const managerNameById = Object.fromEntries(managers.map(m => [m.id, m.name]))
    const sortedManagers = [...managers].sort((a, b) => a.name.localeCompare(b.name))
    const managerH2HRows = []
    for (let i = 0; i < sortedManagers.length; i++) {
      for (let j = i + 1; j < sortedManagers.length; j++) {
        const a = sortedManagers[i], b = sortedManagers[j]
        const games = allMatchups.filter(m => {
          const h = m.home_team?.manager_id, aw = m.away_team?.manager_id
          return (h === a.id && aw === b.id) || (h === b.id && aw === a.id)
        })
        if (!games.length) continue
        let aWins = 0, bWins = 0, ties = 0, aPf = 0, bPf = 0
        games.forEach(m => {
          const aIsHome = m.home_team?.manager_id === a.id
          const aScore = aIsHome ? m.home_score : m.away_score
          const bScore = aIsHome ? m.away_score : m.home_score
          aPf += aScore; bPf += bScore
          if (aScore > bScore) aWins++
          else if (bScore > aScore) bWins++
          else ties++
        })
        managerH2HRows.push({
          manager_a: a.name, manager_b: b.name,
          a_wins: aWins, b_wins: bWins, ties, games: games.length,
          a_pf: parseFloat(aPf.toFixed(2)), b_pf: parseFloat(bPf.toFixed(2)),
          a_avg_pf: parseFloat((aPf / games.length).toFixed(2)), b_avg_pf: parseFloat((bPf / games.length).toFixed(2)),
        })
      }
    }

    // 6. Yearly schedule (every matchup, every season, including playoffs)
    const yearlyScheduleRows = allMatchups.map(m => {
      const homeScore = m.home_score, awayScore = m.away_score
      const homeMgr = managerNameById[m.home_team?.manager_id] || ''
      const awayMgr = managerNameById[m.away_team?.manager_id] || ''
      return {
        year: m.season?.year, week: m.week,
        game_type: m.is_mol_bowl ? 'Sacko Bowl' : m.is_consolation ? 'Consolation' : m.is_playoff ? 'Playoff' : 'Regular Season',
        home_manager: homeMgr, home_team: m.home_team?.team_name || '', home_score: homeScore,
        away_manager: awayMgr, away_team: m.away_team?.team_name || '', away_score: awayScore,
        winner: homeScore > awayScore ? homeMgr : awayScore > homeScore ? awayMgr : 'Tie',
      }
    }).sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || (a.week ?? 0) - (b.week ?? 0))

    return {
      allTimeTeams: { label: 'All-Time Teams (every team season)', rows: allTimeTeamsRows },
      managerCareer: { label: 'Manager Career Stats', rows: managerCareerRows },
      managerH2H: { label: 'Manager Head-to-Head Records', rows: managerH2HRows },
      seasonStandings: { label: 'Yearly Season Standings', rows: seasonStandingsRows },
      yearlySchedule: { label: 'Yearly Schedule (every matchup, every season)', rows: yearlyScheduleRows },
      champions: { label: 'Champions History', rows: championsRows },
    }
  }, [teams, managers, seasons, teamStats, allMatchups])

  const selectedKeys = Object.keys(selected).filter(k => selected[k])
  const allSelected = selectedKeys.length === Object.keys(selected).length
  const anySelected = selectedKeys.length > 0

  const toggleAll = () => {
    const next = !allSelected
    setSelected(Object.fromEntries(Object.keys(selected).map(k => [k, next])))
  }

  const handleExport = () => {
    const date = todayStr()
    if (format === 'json') {
      const bundle = {}
      selectedKeys.forEach(key => { bundle[key] = datasets[key].rows })
      downloadJSON(`icwt-export-${date}.json`, bundle)
    } else {
      selectedKeys.forEach((key, i) => {
        setTimeout(() => downloadCSV(`${key}-${date}.csv`, datasets[key].rows), i * 200)
      })
    }
  }

  if (!mounted) return null

  const cardStyle = { background: cardBg, border: `1px solid ${border}`, padding: '16px 18px' }
  const labelStyle = { fontSize: '10px', letterSpacing: '0.13em', textTransform: 'uppercase', color: muted, fontWeight: '500' }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>

        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px, 6vw, 72px)', fontWeight: '400', marginBottom: '8px', letterSpacing: '-0.02em' }}>
          Export Data
        </h1>
        <p style={{ color: muted, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '32px' }}>
          Select what to export, choose a format, and download
        </p>

        {loading ? (
          <p style={{ color: muted, fontSize: '13px' }}>Loading league data…</p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={labelStyle}>Datasets</span>
              <button onClick={toggleAll} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '5px 12px', cursor: 'pointer', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginBottom: '28px', border: `1px solid ${border}` }}>
              {Object.entries(datasets).map(([key, ds], i) => (
                <label key={key} style={{
                  display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', cursor: 'pointer',
                  background: i % 2 === 0 ? 'transparent' : rowAlt,
                }}>
                  <input
                    type="checkbox"
                    checked={!!selected[key]}
                    onChange={() => setSelected(s => ({ ...s, [key]: !s[key] }))}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: gold, flexShrink: 0 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', color: text }}>{ds.label}</div>
                  </div>
                  <div style={{ fontSize: '11px', color: muted, fontFamily: 'monospace', flexShrink: 0 }}>
                    {ds.rows.length.toLocaleString()} rows
                  </div>
                </label>
              ))}
            </div>

            <div style={{ ...cardStyle, marginBottom: '28px' }}>
              <div style={{ ...labelStyle, marginBottom: '12px' }}>Format</div>
              <div style={{ display: 'flex', gap: '20px' }}>
                {[
                  ['csv', 'CSV', 'One file per selected dataset'],
                  ['json', 'JSON', 'Single bundled file'],
                ].map(([val, name, desc]) => (
                  <label key={val} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="format"
                      checked={format === val}
                      onChange={() => setFormat(val)}
                      style={{ marginTop: '3px', cursor: 'pointer', accentColor: blue }}
                    />
                    <div>
                      <div style={{ fontSize: '13px', color: text }}>{name}</div>
                      <div style={{ fontSize: '11px', color: muted }}>{desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleExport}
              disabled={!anySelected}
              style={{
                background: anySelected ? text : border, color: anySelected ? bg : muted,
                border: 'none', padding: '14px 28px', fontSize: '12px', letterSpacing: '0.12em',
                textTransform: 'uppercase', fontWeight: '600', cursor: anySelected ? 'pointer' : 'not-allowed',
                width: effectiveMobile ? '100%' : 'auto',
              }}
            >
              Export {selectedKeys.length ? `${selectedKeys.length} Dataset${selectedKeys.length > 1 ? 's' : ''}` : ''}
            </button>

            <p style={{ color: muted, fontSize: '11px', marginTop: '16px', lineHeight: 1.6 }}>
              Power Score and Luck are computed using the same formulas as the All-Time Teams and Managers pages (see the <a href="/stats" style={{ color: green }}>Stats</a> page for details). All data is scoped to this league.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
