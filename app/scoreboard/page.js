'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase, LEAGUE_ID } from '../../lib/supabase'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'
import { liveTeamScore } from '../../lib/scoring'
import { resolveSchedule, REG_SEASON_WEEKS } from '../../lib/schedule'
export const dynamic = 'force-dynamic'

const SEASON_YEAR = 2026
const REFRESH_MS = 30000

const posColor = pos => ({ QB: '#4285F4', RB: '#34A853', WR: '#FBBC04', TE: '#EA4335', K: '#46BDC6', 'D/ST': '#7BAAF7' }[pos] || '#888')

export default function ScoreboardPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, rowAlt, gold, green } = useLayout()

  const [mounted, setMounted] = useState(false)
  const [teams, setTeams] = useState([])
  const [matchups, setMatchups] = useState([])
  const [rosterEntries, setRosterEntries] = useState([])
  const [week, setWeek] = useState(1)
  const [weekStats, setWeekStats] = useState({})
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    supabase.from('teams')
      .select('*, manager:manager_id(name, slug, id), season:season_id(year)')
      .eq('league_id', LEAGUE_ID)
      .then(({ data }) => setTeams((data || []).filter(t => t.season?.year === SEASON_YEAR)))
    supabase.from('matchups')
      .select('*, home_team:home_team_id(id, manager_id, team_name), away_team:away_team_id(id, manager_id, team_name), season:season_id(year)')
      .eq('league_id', LEAGUE_ID)
      .eq('is_playoff', false)
      .then(({ data }) => {
        const rows = (data || []).filter(m => m.season?.year === SEASON_YEAR)
        setMatchups(rows)
        if (rows.length) setWeek(Math.max(...rows.map(m => m.week)))
      })
  }, [])

  useEffect(() => {
    if (!teams.length) { setRosterEntries([]); return }
    supabase.from('roster_entries')
      .select('*, player:player_id(id, name, position, sleeper_id)')
      .in('team_id', teams.map(t => t.id))
      .then(({ data }) => setRosterEntries(data || []))
  }, [teams])

  const loadWeekStats = useCallback(async () => {
    setStatsLoading(true)
    setStatsError('')
    try {
      const res = await fetch(`https://api.sleeper.com/stats/nfl/regular/${SEASON_YEAR}/${week}`)
      if (!res.ok) throw new Error(`Sleeper returned ${res.status}`)
      const data = await res.json()
      setWeekStats(data || {})
      setLastUpdated(new Date())
    } catch (e) {
      setStatsError('Could not reach Sleeper for live stats.')
    }
    setStatsLoading(false)
  }, [week])

  useEffect(() => {
    loadWeekStats()
    const id = setInterval(loadWeekStats, REFRESH_MS)
    return () => clearInterval(id)
  }, [loadWeekStats])

  // Real matchup rows come from the DB once ESPN syncs them; until then, the
  // league's known fixed schedule fills in so an unplayed week still shows a
  // scoreboard instead of "no matchups."
  const fixedGames = useMemo(() => (teams.length ? resolveSchedule(teams).games : []), [teams])

  const weekMatchups = useMemo(() => {
    const real = matchups.filter(m => m.week === week)
    const realPairs = new Set(real.map(m => `${m.home_team_id}-${m.away_team_id}`))
    const teamsById = Object.fromEntries(teams.map(t => [t.id, t]))
    const fixed = fixedGames
      .filter(g => g.week === week && !realPairs.has(`${g.homeId}-${g.awayId}`))
      .map(g => ({
        id: `fixed-${g.homeId}-${g.awayId}`,
        home_team_id: g.homeId, away_team_id: g.awayId,
        home_team: teamsById[g.homeId], away_team: teamsById[g.awayId],
        home_score: null, away_score: null,
      }))
      .filter(g => g.home_team && g.away_team)
    return [...real, ...fixed]
  }, [matchups, week, fixedGames, teams])

  const regWeeks = Math.max(matchups.length ? Math.max(...matchups.map(m => m.week)) : 0, REG_SEASON_WEEKS)

  const teamLive = useMemo(() => {
    const byTeam = {}
    teams.forEach(t => {
      const entries = rosterEntries.filter(e => e.team_id === t.id)
      byTeam[t.id] = liveTeamScore(entries, weekStats)
    })
    return byTeam
  }, [teams, rosterEntries, weekStats])

  if (!mounted) return null

  const micro = { fontSize: '11px', color: muted, letterSpacing: '0.05em' }
  const inp = { background: d ? '#111' : '#e8e4dc', border: `1px solid ${border}`, color: text, padding: '8px 12px', fontSize: '13px', fontFamily: "'Inter', sans-serif", outline: 'none' }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px, 6vw, 72px)', fontWeight: '400', letterSpacing: '-0.02em', marginBottom: '8px' }}>
          Scoreboard
        </h1>
        <p style={{ color: muted, fontSize: '13px', marginBottom: '8px', maxWidth: '640px', lineHeight: 1.6 }}>
          Live scores computed from Sleeper's real-time NFL stats and this league's scoring rules, refreshing every
          {` ${REFRESH_MS / 1000}s`}. Since ESPN doesn't expose who a manager actually started, this always scores the
          strongest nine available (QB, RB, RB, WR, WR, TE, FLEX, FLEX, K) — a bench-vs-bench swap won't show here.
        </p>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '32px' }}>
          <select value={week} onChange={e => setWeek(parseInt(e.target.value))} style={inp}>
            {Array.from({ length: regWeeks }, (_, i) => i + 1).map(w => <option key={w} value={w}>Week {w}</option>)}
          </select>
          <button onClick={loadWeekStats} disabled={statsLoading} style={{ ...inp, cursor: statsLoading ? 'not-allowed' : 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '11px' }}>
            {statsLoading ? 'Refreshing…' : 'Refresh Now'}
          </button>
          {lastUpdated && <span style={micro}>Updated {lastUpdated.toLocaleTimeString()}</span>}
          {statsError && <span style={{ ...micro, color: '#c0392b' }}>{statsError}</span>}
        </div>

        {weekMatchups.length === 0 ? (
          <p style={{ color: muted, fontSize: '13px' }}>No Week {week} matchups on file yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: border }}>
            {weekMatchups.map(m => {
              const homeLive = teamLive[m.home_team_id]
              const awayLive = teamLive[m.away_team_id]
              const isOpen = expanded === m.id
              const played = (m.home_score ?? 0) > 0 || (m.away_score ?? 0) > 0
              return (
                <div key={m.id} style={{ background: cardBg }}>
                  <div
                    onClick={() => setExpanded(isOpen ? null : m.id)}
                    style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', cursor: 'pointer', flexWrap: 'wrap' }}
                  >
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '17px', color: text }}>
                      {m.home_team?.team_name || '—'} <span style={{ color: muted, fontSize: '12px' }}>vs</span> {m.away_team?.team_name || '—'}
                    </div>
                    <div style={{ display: 'flex', gap: '18px', alignItems: 'baseline' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: gold }}>{(homeLive?.total ?? 0).toFixed(1)}</div>
                        {played && <div style={{ fontSize: '10px', color: muted }}>ESPN {m.home_score?.toFixed(1)}</div>}
                      </div>
                      <span style={{ color: muted, fontSize: '12px' }}>–</span>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: gold }}>{(awayLive?.total ?? 0).toFixed(1)}</div>
                        {played && <div style={{ fontSize: '10px', color: muted }}>ESPN {m.away_score?.toFixed(1)}</div>}
                      </div>
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ display: 'flex', flexDirection: effectiveMobile ? 'column' : 'row', gap: '1px', background: border, borderTop: `1px solid ${border}` }}>
                      {[
                        { label: m.home_team?.team_name, live: homeLive },
                        { label: m.away_team?.team_name, live: awayLive },
                      ].map((side, si) => (
                        <div key={si} style={{ flex: 1, background: cardBg }}>
                          {(side.live?.starters || []).map((e, i) => (
                            <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center', padding: '7px 16px', background: i % 2 === 0 ? 'transparent' : rowAlt }}>
                              <span style={{ fontSize: '9px', fontWeight: '700', color: posColor(e.slot === 'FLEX' ? e.player?.position : e.slot), background: posColor(e.slot === 'FLEX' ? e.player?.position : e.slot) + '18', padding: '2px 4px', textAlign: 'center' }}>
                                {e.slot}
                              </span>
                              <span style={{ fontSize: '12px', color: text, paddingLeft: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {e.player?.name || '—'}
                              </span>
                              <span style={{ fontSize: '12px', fontWeight: '500', color: text, textAlign: 'right' }}>
                                {e.liveScore.toFixed(1)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
