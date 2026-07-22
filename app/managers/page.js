'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const SKILL_POSITIONS = ['QB', 'RB', 'WR', 'TE']
const POS_COLORS = { QB: '#4285F4', RB: '#34A853', WR: '#FBBC04', TE: '#EA4335' }

export default function ManagersPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, rowAlt, green, red, gold, blue } = useLayout()
  const router = useRouter()

  const [managers, setManagers] = useState([])
  const [teams, setTeams] = useState([])
  const [seasons, setSeasons] = useState([])
  const [matchups, setMatchups] = useState([])
  const [rosterEntries, setRosterEntries] = useState([])
  const [selectedManager, setSelectedManager] = useState(null)
  const [activeTab, setActiveTab] = useState({}) // manager id -> tab
  const [searchText, setSearchText] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    supabase.from('managers').select('*').then(({ data }) => setManagers(data || []))
    supabase.from('teams').select('*, season:season_id(year)').then(({ data }) => setTeams(data || []))
    supabase.from('seasons').select('*, champion:champion_id(id), mol_bowl_loser:mol_bowl_loser_id(id)').then(({ data }) => setSeasons(data || []))
    supabase.from('matchups')
      .select('*, home_team:home_team_id(id, manager_id), away_team:away_team_id(id, manager_id), season:season_id(year)')
      .eq('is_playoff', false)
      .then(({ data }) => setMatchups(data || []))

    // Fetch all roster entries in batches
    const fetchEntries = async () => {
      let all = []
      let from = 0
      while (true) {
        const { data: batch } = await supabase
          .from('roster_entries')
          .select('id, player_id, team_id, avg_pts, fpts, prk, player:player_id(id, name, position)')
          .range(from, from + 999)
        if (!batch || batch.length === 0) break
        all = [...all, ...batch]
        if (batch.length < 1000) break
        from += 1000
      }
      setRosterEntries(all)
    }
    fetchEntries()
  }, [])

  // Build team id -> {manager_id, year} lookup
  const teamMap = useMemo(() => {
    const m = {}
    teams.forEach(t => { m[t.id] = t })
    return m
  }, [teams])

  // Power scores
  const powerScores = useMemo(() => {
    if (teams.length === 0 || matchups.length === 0) return {}
    const result = {}
    const matchupsByYear = {}
    matchups.forEach(m => {
      const yr = m.season?.year
      if (!yr) return
      if (!matchupsByYear[yr]) matchupsByYear[yr] = []
      matchupsByYear[yr].push(m)
    })
    const median = (arr) => {
      if (!arr.length) return 0
      const s = [...arr].sort((a, b) => a - b)
      const mid = Math.floor(s.length / 2)
      return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2
    }
    const teamsByYear = {}
    teams.forEach(t => {
      const yr = t.season?.year
      if (!yr) return
      if (!teamsByYear[yr]) teamsByYear[yr] = []
      teamsByYear[yr].push(t)
    })
    Object.entries(teamsByYear).forEach(([yr, yearTeams]) => {
      const yearMatchups = matchupsByYear[yr] || []
      const weeks = [...new Set(yearMatchups.map(m => m.week))].sort((a, b) => a - b)
      const teamMetrics = {}
      yearTeams.forEach(t => { teamMetrics[t.id] = { t, scores: [], allPlaySum: 0 } })
      yearMatchups.forEach(m => {
        if (teamMetrics[m.home_team?.id]) teamMetrics[m.home_team.id].scores.push(m.home_score)
        if (teamMetrics[m.away_team?.id]) teamMetrics[m.away_team.id].scores.push(m.away_score)
      })
      weeks.forEach(week => {
        const weekGames = yearMatchups.filter(m => m.week === week)
        const allScores = []
        weekGames.forEach(m => {
          allScores.push({ teamId: m.home_team?.id, score: m.home_score })
          allScores.push({ teamId: m.away_team?.id, score: m.away_score })
        })
        const n = allScores.length
        if (n < 2) return
        allScores.forEach(({ teamId, score }) => {
          if (!teamMetrics[teamId]) return
          teamMetrics[teamId].allPlaySum += allScores.filter(o => o.teamId !== teamId && score > o.score).length / (n - 1)
        })
      })
      const rows = Object.values(teamMetrics).map(({ t, scores, allPlaySum }) => {
        const games = t.wins + t.losses
        return {
          t,
          winPct: games > 0 ? t.wins / games : 0,
          avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
          medianScore: median(scores),
          allPlayWinPct: weeks.length > 0 ? allPlaySum / weeks.length : 0,
        }
      })
      const maxWin = Math.max(...rows.map(r => r.winPct))
      const maxAvg = Math.max(...rows.map(r => r.avgScore))
      const maxMed = Math.max(...rows.map(r => r.medianScore))
      const maxAp = Math.max(...rows.map(r => r.allPlayWinPct))
      rows.forEach(r => {
        result[r.t.id] = parseFloat(((
          (r.winPct / (maxWin || 1) * 100 * 2) +
          (r.avgScore / (maxAvg || 1) * 100 * 4) +
          (r.allPlayWinPct / (maxAp || 1) * 100 * 2) +
          (r.medianScore / (maxMed || 1) * 100 * 2)
        ) / 10).toFixed(2))
      })
    })
    return result
  }, [teams, matchups])

  // Player stats per manager
  const managerPlayerStats = useMemo(() => {
    if (rosterEntries.length === 0 || teams.length === 0) return {}
    const result = {}

    rosterEntries.forEach(e => {
      const team = teamMap[e.team_id]
      if (!team) return
      const managerId = team.manager_id
      const pos = e.player?.position
      if (!pos || !SKILL_POSITIONS.includes(pos)) return

      if (!result[managerId]) result[managerId] = { byPos: {}, ownership: {} }

      // Best season by position (top 5 by avg_pts)
      if (!result[managerId].byPos[pos]) result[managerId].byPos[pos] = []
      result[managerId].byPos[pos].push({
        playerId: e.player?.id,
        name: e.player?.name,
        avg_pts: e.avg_pts || 0,
        year: team.season?.year,
      })

      // Ownership count
      const pid = e.player?.id
      if (pid) {
        if (!result[managerId].ownership[pid]) {
          result[managerId].ownership[pid] = { name: e.player?.name, pos, count: 0 }
        }
        result[managerId].ownership[pid].count++
      }
    })

    // Sort and trim to top 5
    Object.keys(result).forEach(mid => {
      SKILL_POSITIONS.forEach(pos => {
        if (result[mid].byPos[pos]) {
          result[mid].byPos[pos] = result[mid].byPos[pos]
            .sort((a, b) => b.avg_pts - a.avg_pts)
            .slice(0, 5)
        }
      })
      result[mid].topOwned = Object.values(result[mid].ownership)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
    })

    return result
  }, [rosterEntries, teamMap])

  const managerStats = useMemo(() => {
    return managers.map(m => {
      const mTeams = teams.filter(t => t.manager_id === m.id)
      if (mTeams.length === 0) return null
      const wins = mTeams.reduce((s, t) => s + t.wins, 0)
      const losses = mTeams.reduce((s, t) => s + t.losses, 0)
      const pf = parseFloat(mTeams.reduce((s, t) => s + t.points_for, 0).toFixed(2))
      const pa = parseFloat(mTeams.reduce((s, t) => s + t.points_against, 0).toFixed(2))
      const diff = parseFloat((pf - pa).toFixed(2))
      const games = wins + losses
      const winPct = games > 0 ? parseFloat(((wins / games) * 100).toFixed(1)) : 0
      const avgPpg = games > 0 ? parseFloat((pf / games).toFixed(2)) : 0
      const championships = seasons.filter(s => s.champion?.id === m.id).length
      const molBowls = seasons.filter(s => s.mol_bowl_loser?.id === m.id).length
      const playoffAppearances = mTeams.filter(t => t.made_playoffs).length
      const seasonsPlayed = mTeams.length
      const teamWithScores = mTeams.map(t => ({ ...t, ps: powerScores[t.id] ?? 0 })).filter(t => t.ps > 0)
      const bestSeason = teamWithScores.length > 0 ? [...teamWithScores].sort((a, b) => b.ps - a.ps)[0] : null
      const worstSeason = teamWithScores.length > 0 ? [...teamWithScores].sort((a, b) => a.ps - b.ps)[0] : null
      const avgPowerScore = teamWithScores.length > 0
        ? parseFloat((teamWithScores.reduce((s, t) => s + t.ps, 0) / teamWithScores.length).toFixed(2))
        : 0
      const seasonBreakdown = mTeams
        .sort((a, b) => b.season.year - a.season.year)
        .map(t => ({
          year: t.season.year, team_name: t.team_name,
          wins: t.wins, losses: t.losses,
          pf: parseFloat(t.points_for.toFixed(2)),
          pa: parseFloat(t.points_against.toFixed(2)),
          diff: parseFloat((t.points_for - t.points_against).toFixed(2)),
          made_playoffs: t.made_playoffs, playoff_result: t.playoff_result,
          ps: powerScores[t.id] ?? null, final_standing: t.final_standing,
        }))
      return {
        ...m, wins, losses, pf, pa, diff, winPct, avgPpg,
        championships, molBowls, playoffAppearances, seasonsPlayed,
        bestSeason, worstSeason, avgPowerScore, seasonBreakdown,
      }
    }).filter(Boolean)
  }, [managers, teams, seasons, powerScores])

  const rankedStats = useMemo(() => {
    if (managerStats.length === 0) return []
    const maxPs = Math.max(...managerStats.map(m => m.avgPowerScore))
    const minPs = Math.min(...managerStats.map(m => m.avgPowerScore))
    const maxChamps = Math.max(...managerStats.map(m => m.championships))
    const withScore = managerStats.map(m => {
      const normPs = maxPs === minPs ? 0.5 : (m.avgPowerScore - minPs) / (maxPs - minPs)
      const normChamps = maxChamps === 0 ? 0 : m.championships / maxChamps
      return { ...m, careerScore: normPs * 0.5 + normChamps * 0.5 }
    })
    const sorted = [...withScore].sort((a, b) => b.careerScore - a.careerScore)
    return withScore.map(m => ({ ...m, careerPowerRank: sorted.findIndex(s => s.id === m.id) + 1 }))
  }, [managerStats])

  if (!mounted) return null

  const displayManagers = rankedStats
    .filter(m => !searchText || m.name.toLowerCase().includes(searchText.toLowerCase()))
    .sort((a, b) => a.careerPowerRank - b.careerPowerRank)

  const resultColor = (result) => {
    if (!result) return muted
    if (result === 'Champion') return gold
    if (result === 'Runner Up') return d ? 'rgba(192,192,192,0.9)' : '#555'
    if (result === 'Third Place') return d ? '#cd7f32' : '#7c4a00'
    if (result?.includes('Sacko')) return red
    if (result?.includes('Playoff')) return blue
    return muted
  }

  const getTab = (id) => activeTab[id] || 'stats'
  const setTab = (id, tab) => setActiveTab(prev => ({ ...prev, [id]: tab }))

  const TabBtn = ({ id, tab, label }) => (
    <button
      onClick={() => setTab(id, tab)}
      style={{
        background: 'none', border: 'none', borderBottom: `2px solid ${getTab(id) === tab ? text : 'transparent'}`,
        color: getTab(id) === tab ? text : muted, padding: '8px 16px', cursor: 'pointer',
        fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase',
        fontFamily: "'Inter', sans-serif", fontWeight: getTab(id) === tab ? '600' : '400',
      }}
    >
      {label}
    </button>
  )

  const ManagerCard = ({ m }) => {
    const isSelected = selectedManager === m.id
    const tab = getTab(m.id)
    const playerStats = managerPlayerStats[m.id]

    return (
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderTop: `3px solid ${m.championships > 0 ? gold : (d ? 'rgba(255,255,255,0.2)' : 'rgba(13,33,82,0.2)')}` }}>
        {/* Card header */}
        <div onClick={() => setSelectedManager(isSelected ? null : m.id)} style={{ padding: effectiveMobile ? '16px' : '20px 24px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '20px' : '24px', color: text, marginBottom: '4px' }}>{m.name}</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: muted }}>{m.seasonsPlayed} seasons</span>
                <span style={{ fontSize: '10px', color: muted }}>·</span>
                <span style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: muted }}>#{m.careerPowerRank} all-time power</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
              {m.championships > 0 && (
                <div style={{ fontSize: effectiveMobile ? '20px' : '24px', marginBottom: '2px' }}>
                  {'🏆'.repeat(Math.min(m.championships, 3))}{m.championships > 3 ? ` ×${m.championships}` : ''}
                </div>
              )}
              <div style={{ fontSize: '11px', color: muted }}>{isSelected ? '▲' : '▼'}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {[['Record', `${m.wins}-${m.losses}`], ['Win %', `${m.winPct}%`], ['Playoffs', m.playoffAppearances], ['Avg PPG', m.avgPpg]].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '3px' }}>{label}</div>
                <div style={{ fontSize: effectiveMobile ? '14px' : '16px', color: text, fontWeight: '500' }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Expanded detail */}
        {isSelected && (
          <div style={{ borderTop: `1px solid ${border}` }}>
            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${border}`, background: d ? '#080808' : '#e8e4dc', paddingLeft: '8px' }}>
              <TabBtn id={m.id} tab="stats" label="Stats" />
              <TabBtn id={m.id} tab="players" label="Players" />
              <TabBtn id={m.id} tab="seasons" label="Seasons" />
            </div>

            <div style={{ padding: effectiveMobile ? '16px' : '20px 24px' }}>

              {/* STATS TAB */}
              {tab === 'stats' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '1px', background: border, marginBottom: '0' }}>
                    {[
                      ['Record', `${m.wins}-${m.losses}`, null],
                      ['Win %', `${m.winPct}%`, null],
                      ['Avg PPG', m.avgPpg, null],
                      ['Points For', m.pf.toFixed(0), null],
                      ['Points Against', m.pa.toFixed(0), null],
                      ['Point Diff', `${m.diff >= 0 ? '+' : ''}${m.diff.toFixed(0)}`, m.diff >= 0 ? green : red],
                      ['Championships', m.championships || '—', m.championships > 0 ? gold : null],
                      ['Playoff Apps', m.playoffAppearances, null],
                      ['Sackos', m.molBowls || '—', m.molBowls > 0 ? red : null],
                      ['Avg Power Score', m.avgPowerScore, null],
                      ['Career Power Rank', `#${m.careerPowerRank}`, m.careerPowerRank <= 3 ? gold : null],
                      ['Best Season', m.bestSeason ? `${m.bestSeason.season?.year || m.bestSeason.year} — ${(powerScores[m.bestSeason.id] ?? m.bestSeason.ps)?.toFixed(1)} PS` : '—', green],
                    ].map(([label, val, color]) => (
                      <div key={label} style={{ background: cardBg, padding: '14px 16px' }}>
                        <div style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '4px' }}>{label}</div>
                        <div style={{ fontSize: '15px', color: color || text, fontWeight: '500' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PLAYERS TAB */}
              {tab === 'players' && (
                <div>
                  {/* Most Owned */}
                  <p style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: muted, marginBottom: '12px' }}>Most Owned Players</p>
                  {playerStats?.topOwned?.length > 0 ? (
                    <div style={{ marginBottom: '28px' }}>
                      {playerStats.topOwned.map((p, i) => (
                        <div
                          key={p.name}
                          onClick={() => {
                            const entry = rosterEntries.find(e => e.player?.id && e.player.name === p.name)
                            if (entry?.player?.id) router.push(`/players/${entry.player.id}`)
                          }}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '10px 0', borderBottom: `1px solid ${border}`,
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '11px', color: muted, minWidth: '16px' }}>{i + 1}</span>
                            <span style={{
                              fontSize: '9px', fontWeight: '700', letterSpacing: '0.08em',
                              color: POS_COLORS[p.pos] || muted,
                              background: (POS_COLORS[p.pos] || muted) + '18',
                              padding: '2px 5px',
                            }}>{p.pos}</span>
                            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '14px', color: text }}>{p.name}</span>
                          </div>
                          <span style={{ fontSize: '12px', color: muted }}>{p.count} season{p.count !== 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p style={{ color: muted, fontSize: '12px', marginBottom: '28px' }}>No data yet.</p>}

                  {/* Best season by position */}
                  <p style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: muted, marginBottom: '16px' }}>Best Seasons by Position (PPG)</p>
                  <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '16px' }}>
                    {SKILL_POSITIONS.map(pos => (
                      <div key={pos}>
                        <div style={{
                          fontSize: '10px', fontWeight: '700', letterSpacing: '0.1em',
                          color: POS_COLORS[pos], marginBottom: '8px',
                          borderBottom: `2px solid ${POS_COLORS[pos]}`, paddingBottom: '4px',
                        }}>{pos}</div>
                        {(playerStats?.byPos[pos] || []).length === 0
                          ? <p style={{ fontSize: '11px', color: muted }}>—</p>
                          : (playerStats?.byPos[pos] || []).map((p, i) => (
                            <div
                              key={`${p.name}-${p.year}`}
                              onClick={() => {
                                const entry = rosterEntries.find(e => e.player?.name === p.name)
                                if (entry?.player?.id) router.push(`/players/${entry.player.id}`)
                              }}
                              style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '6px 0', borderBottom: `1px solid ${border}`,
                                cursor: 'pointer',
                              }}
                            >
                              <div>
                                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '12px', color: text }}>{p.name}</div>
                                <div style={{ fontSize: '10px', color: muted }}>{p.year}</div>
                              </div>
                              <span style={{ fontSize: '12px', fontWeight: '600', color: p.avg_pts >= 15 ? gold : text }}>
                                {p.avg_pts.toFixed(1)}
                              </span>
                            </div>
                          ))
                        }
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SEASONS TAB */}
              {tab === 'seasons' && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
                    <thead>
                      <tr style={{ background: d ? '#111' : '#e4e0d8' }}>
                        {['Year', 'Team', 'W', 'L', 'PF', 'Diff', 'PS', 'Result'].map((h, i) => (
                          <th key={h} style={{ padding: '8px 10px', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: muted, textAlign: i <= 1 ? 'left' : 'right', borderBottom: `1px solid ${border}`, fontWeight: '500', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {m.seasonBreakdown.map((s, i) => (
                        <tr key={s.year} style={{ background: i % 2 === 0 ? 'transparent' : (d ? '#080808' : '#e8e4dc') }}>
                          <td style={{ padding: '10px', fontSize: '12px', color: muted, borderBottom: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{s.year}</td>
                          <td style={{ padding: '10px', fontSize: '12px', color: text, borderBottom: `1px solid ${border}`, fontFamily: "'Playfair Display', serif", whiteSpace: 'nowrap' }}>{s.team_name}</td>
                          <td style={{ padding: '10px', fontSize: '12px', color: text, borderBottom: `1px solid ${border}`, textAlign: 'right', whiteSpace: 'nowrap' }}>{s.wins}</td>
                          <td style={{ padding: '10px', fontSize: '12px', color: text, borderBottom: `1px solid ${border}`, textAlign: 'right', whiteSpace: 'nowrap' }}>{s.losses}</td>
                          <td style={{ padding: '10px', fontSize: '12px', color: text, borderBottom: `1px solid ${border}`, textAlign: 'right', whiteSpace: 'nowrap' }}>{s.pf.toFixed(0)}</td>
                          <td style={{ padding: '10px', fontSize: '12px', color: s.diff >= 0 ? green : red, borderBottom: `1px solid ${border}`, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: '500' }}>
                            {s.diff >= 0 ? '+' : ''}{s.diff.toFixed(0)}
                          </td>
                          <td style={{ padding: '10px', fontSize: '12px', color: text, borderBottom: `1px solid ${border}`, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {s.ps !== null ? s.ps.toFixed(1) : '—'}
                          </td>
                          <td style={{ padding: '10px', fontSize: '11px', color: resultColor(s.playoff_result), borderBottom: `1px solid ${border}`, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: '500' }}>
                            {s.playoff_result || (s.made_playoffs ? 'Playoffs' : '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>

        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px, 6vw, 72px)', fontWeight: '400', marginBottom: '8px', letterSpacing: '-0.02em' }}>
          Managers
        </h1>
        <p style={{ color: muted, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '32px' }}>
          {displayManagers.length} managers · sorted by career power score
        </p>

        <div style={{ display: 'flex', flexDirection: effectiveMobile ? 'column' : 'row', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input
            placeholder="Search manager..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ background: cardBg, border: `1px solid ${border}`, color: text, padding: '7px 12px', fontSize: '12px', fontFamily: "'Inter', sans-serif", outline: 'none', width: effectiveMobile ? '100%' : '200px' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {displayManagers.map(m => <ManagerCard key={m.id} m={m} />)}
        </div>
      </div>
    </div>
  )
}
