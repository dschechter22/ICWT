'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase, LEAGUE_ID } from '../../lib/supabase'
import Nav from '../../components/Nav'
import MatchupDrawer from '../../components/MatchupDrawer'
import { useLayout } from '../../hooks/useLayout'
import {
  isPlayed, buildRatings, makeLine, leagueBaseline,
  projectedStarterPoints, projectedWeekScore, fmtOdds, fmtSpread,
} from '../../lib/predictions'
import { REG_SEASON_WEEKS, buildFixtures } from '../../lib/schedule'
import {
  simulateLeverage, rawLeverage, importanceScore,
  rootingGuide, clinchStatus, headToHead,
} from '../../lib/preweek'
export const dynamic = 'force-dynamic'

const SIMS = 8000
const pct = p => `${(p * 100).toFixed(1)}%`
const pp = n => `${n > 0 ? '+' : ''}${(n * 100).toFixed(1)}`
const seasonLabel = year => `${year}-${String(year + 1).slice(2)}`

export default function PreweekPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, rowAlt, green, red, gold, blue } = useLayout()

  const [mounted, setMounted] = useState(false)
  const [seasons, setSeasons] = useState([])
  const [selectedYear, setSelectedYear] = useState(null)
  const [teams, setTeams] = useState([])
  const [allTeams, setAllTeams] = useState([])
  const [matchups, setMatchups] = useState([])
  const [allMatchups, setAllMatchups] = useState([])
  const [rosterProj, setRosterProj] = useState({})
  const [rosterEntriesByTeam, setRosterEntriesByTeam] = useState({})
  const [baseline, setBaseline] = useState(null)
  const [loading, setLoading] = useState(true)

  const [week, setWeek] = useState(1)
  const [weekTouched, setWeekTouched] = useState(false)
  const [sim, setSim] = useState(null)
  const [simming, setSimming] = useState(false)
  const [rootFor, setRootFor] = useState('')
  const [openH2H, setOpenH2H] = useState(null)
  const [drawerMatchup, setDrawerMatchup] = useState(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    supabase.from('seasons').select('year, season_number').order('year', { ascending: false })
      .then(({ data }) => {
        setSeasons(data || [])
        if (data?.length) setSelectedYear(data[0].year)
        else setLoading(false)
      })
  }, [])

  // All-time teams and matchups, for head-to-head history.
  useEffect(() => {
    Promise.all([
      supabase.from('teams').select('id, team_name, manager_id, season:season_id(year)').eq('league_id', LEAGUE_ID),
      supabase.from('matchups')
        .select('id, week, is_playoff, home_score, away_score, home_team:home_team_id(id), away_team:away_team_id(id), season:season_id(year)')
        .eq('league_id', LEAGUE_ID),
    ]).then(([t, m]) => {
      setAllTeams(t.data || [])
      setAllMatchups(m.data || [])
    })
  }, [])

  useEffect(() => {
    if (!selectedYear) return
    setLoading(true)
    setWeekTouched(false)
    Promise.all([
      supabase.from('matchups')
        .select('*, home_team:home_team_id(id, team_name), away_team:away_team_id(id, team_name), season:season_id(year)')
        .eq('league_id', LEAGUE_ID).eq('is_playoff', false),
      supabase.from('teams')
        .select('*, manager:manager_id(name, slug, id), season:season_id(year)')
        .eq('league_id', LEAGUE_ID),
    ]).then(async ([mRes, tRes]) => {
      const t = (tRes.data || []).filter(x => x.season?.year === selectedYear)
      setTeams(t)
      setMatchups((mRes.data || []).filter(x => x.season?.year === selectedYear))
      // Earlier seasons set the scoring scale for this one without saying
      // anything about any individual team.
      setBaseline(leagueBaseline((mRes.data || []).filter(x => x.season?.year < selectedYear)))
      if (t.length) {
        const { data } = await supabase.from('roster_entries')
          .select('team_id, avg_pts, stats, player:player_id(position)')
          .in('team_id', t.map(x => x.id))
        const byTeam = {}
        ;(data || []).forEach(e => { (byTeam[e.team_id] ||= []).push(e) })
        setRosterProj(Object.fromEntries(Object.entries(byTeam).map(([k, v]) => [k, projectedStarterPoints(v)])))
        setRosterEntriesByTeam(byTeam)
      } else {
        setRosterProj({})
        setRosterEntriesByTeam({})
      }
      setLoading(false)
    })
  }, [selectedYear])

  const isCurrentSeason = seasons.length > 0 && selectedYear === seasons[0].year
  const maxWeekWithRows = matchups.length ? Math.max(...matchups.map(m => m.week)) : 0
  const regWeeks = isCurrentSeason
    ? Math.max(maxWeekWithRows, REG_SEASON_WEEKS)
    : (maxWeekWithRows || REG_SEASON_WEEKS)

  // Default to the next unplayed week.
  useEffect(() => {
    if (weekTouched || loading) return
    const played = matchups.filter(isPlayed).map(m => m.week)
    setWeek(played.length ? Math.min(Math.max(...played) + 1, regWeeks) : 1)
  }, [matchups, loading, weekTouched, regWeeks])

  const fixtures = useMemo(
    () => buildFixtures({ matchups, teams, useFixed: isCurrentSeason }),
    [matchups, teams, isCurrentSeason],
  )

  // A genuine forward projection for the week being priced, built from
  // uploaded per-player weekly projections (falls back to nothing for a week
  // that has none, so buildRatings quietly leans on the model instead).
  const weeklyProj = useMemo(
    () => Object.fromEntries(Object.entries(rosterEntriesByTeam).map(([k, v]) => [k, projectedWeekScore(v, week)])),
    [rosterEntriesByTeam, week],
  )

  const ratings = useMemo(
    () => (teams.length ? buildRatings({ teams, matchups, throughWeek: week - 1, rosterProj, baseline, weeklyProj }) : null),
    [teams, matchups, week, rosterProj, baseline, weeklyProj],
  )

  const hasSignal = !!ratings && ratings.rows.some(r => r.rating > 0)

  useEffect(() => {
    if (!ratings || !hasSignal) { setSim(null); return }
    setSimming(true)
    const id = setTimeout(() => {
      const rest = fixtures.filter(f => f.week >= week && f.week <= regWeeks)
      const covered = new Set(rest.map(f => f.week))
      let randomWeeks = 0
      for (let w = week; w <= regWeeks; w++) if (!covered.has(w)) randomWeeks++
      setSim(simulateLeverage({
        rows: ratings.rows,
        schedule: rest.map(f => ({ week: f.week, homeId: f.homeId, awayId: f.awayId })),
        randomWeeks,
        trackWeek: week,
        sims: SIMS,
      }))
      setSimming(false)
    }, 0)
    return () => clearTimeout(id)
  }, [ratings, hasSignal, fixtures, week, regWeeks])

  const teamsByManager = useMemo(() => {
    const map = {}
    allTeams.forEach(t => { if (t.manager_id) (map[t.manager_id] ||= []).push(t.id) })
    return map
  }, [allTeams])

  const cards = useMemo(() => {
    if (!ratings || !sim) return []
    return sim.games
      .map(g => {
        const a = ratings.byId[g.homeId]
        const b = ratings.byId[g.awayId]
        if (!a || !b) return null
        const raw = rawLeverage(g)
        return {
          key: `${g.homeId}-${g.awayId}`,
          g, a, b, raw,
          score: importanceScore(raw),
          line: makeLine(a, b),
          aStatus: clinchStatus({ sim, teamId: g.homeId, game: g }),
          bStatus: clinchStatus({ sim, teamId: g.awayId, game: g }),
          h2h: headToHead({
            allMatchups,
            teamsByManager,
            aManagerId: a.team.manager?.id,
            bManagerId: b.team.manager?.id,
          }),
        }
      })
      .filter(Boolean)
      .sort((x, y) => y.score - x.score)
  }, [ratings, sim, allMatchups, teamsByManager])

  const rooting = useMemo(() => {
    if (!sim || !rootFor || !ratings) return []
    return rootingGuide({ sim, teamId: rootFor, teams: ratings.rows })
  }, [sim, rootFor, ratings])

  useEffect(() => {
    if (!ratings?.rows.length) return
    setRootFor(prev => (prev && ratings.byId[prev] ? prev : ratings.rows[0].id))
  }, [ratings])

  if (!mounted) return null

  const inp = { background: d ? '#111' : '#e8e4dc', border: `1px solid ${border}`, color: text, padding: '8px 14px', fontSize: '13px', fontFamily: "'Inter', sans-serif", outline: 'none', cursor: 'pointer' }
  const micro = { fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: muted }
  const SectionLabel = ({ children }) => (
    <p style={{ fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', color: muted, marginBottom: '18px' }}>{children}</p>
  )

  const scoreColor = s => (s >= 85 ? red : s >= 70 ? gold : s >= 45 ? text : muted)
  const statusColor = k => (k === 'winAndIn' ? red : k === 'mustWin' ? red : k === 'eliminated' ? muted : green)

  const Badge = ({ status, who }) => status ? (
    <span style={{ ...micro, color: statusColor(status.kind), border: `1px solid ${statusColor(status.kind)}`, padding: '3px 7px', whiteSpace: 'nowrap' }}>
      {who} · {status.label}
    </span>
  ) : null

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px, 6vw, 72px)', fontWeight: '400', letterSpacing: '-0.02em', marginBottom: '8px' }}>
          Preweek
        </h1>
        <p style={{ color: muted, fontSize: '13px', marginBottom: '32px', maxWidth: '700px', lineHeight: 1.7 }}>
          What&rsquo;s actually at stake this week — every game scored out of 100 on how much it moves the standings,
          who needs what, and which other results you should be rooting for.
        </p>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap' }}>
          <select value={selectedYear ?? ''} onChange={e => setSelectedYear(parseInt(e.target.value))} style={inp}>
            {seasons.map(s => <option key={s.year} value={s.year}>{seasonLabel(s.year)} — Year {s.season_number}</option>)}
          </select>
          <select value={week} onChange={e => { setWeek(parseInt(e.target.value)); setWeekTouched(true) }} style={inp}>
            {Array.from({ length: regWeeks }, (_, i) => i + 1).map(w => <option key={w} value={w}>Week {w}</option>)}
          </select>
          {simming && <span style={micro}>Simulating {SIMS.toLocaleString()} seasons…</span>}
        </div>

        {loading && <p style={{ color: muted, fontSize: '14px' }}>Loading…</p>}

        {!loading && !hasSignal && (
          <p style={{ color: muted, fontSize: '13px' }}>
            No teams on file for {seasonLabel(selectedYear)} yet.
          </p>
        )}

        {!loading && hasSignal && cards.length === 0 && !simming && (
          <p style={{ color: muted, fontSize: '13px' }}>No Week {week} matchups for {seasonLabel(selectedYear)}.</p>
        )}

        {/* ── MATCHUP CARDS ── */}
        {cards.length > 0 && (
          <div style={{ marginBottom: '48px' }}>
            <SectionLabel>Week {week} Stakes</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: border }}>
              {cards.map(c => {
                const aWin = c.g.home?.[c.g.homeId], aLose = c.g.away?.[c.g.homeId]
                const bWin = c.g.away?.[c.g.awayId], bLose = c.g.home?.[c.g.awayId]
                const open = openH2H === c.key
                return (
                  <div key={c.key} style={{ background: cardBg, padding: effectiveMobile ? '16px' : '20px 24px' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '18px', flexWrap: 'wrap', marginBottom: '16px' }}>
                      <div style={{ textAlign: 'center', minWidth: '62px' }}>
                        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '34px', lineHeight: 1, color: scoreColor(c.score) }}>{c.score}</div>
                        <div style={{ ...micro, marginTop: '4px' }}>Stakes</div>
                      </div>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <div
                          onClick={() => setDrawerMatchup({ home: c.a.team, away: c.b.team })}
                          style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '18px' : '22px', marginBottom: '4px', cursor: 'pointer' }}
                          title="View projected lineups"
                        >
                          {c.a.name} <span style={{ fontSize: '13px', color: muted, fontFamily: "'Inter', sans-serif" }}>vs</span> {c.b.name}
                        </div>
                        <div style={{ fontSize: '11px', color: muted }}>
                          {c.a.wins}-{c.a.losses}{c.a.powerRank ? ` · PWR #${c.a.powerRank}` : ''}
                          <span style={{ margin: '0 8px' }}>|</span>
                          {c.b.wins}-{c.b.losses}{c.b.powerRank ? ` · PWR #${c.b.powerRank}` : ''}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                          <Badge status={c.aStatus} who={c.a.name} />
                          <Badge status={c.bStatus} who={c.b.name} />
                        </div>
                      </div>
                    </div>

                    {/* Conditional odds */}
                    {aWin && aLose && bWin && bLose && (
                      <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? '1fr' : '1fr 1fr', gap: '1px', background: border, marginBottom: '14px' }}>
                        {[
                          { who: c.a, win: aWin, lose: aLose, opp: c.b },
                          { who: c.b, win: bWin, lose: bLose, opp: c.a },
                        ].map(s => (
                          <div key={s.who.id} style={{ background: d ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', padding: '12px 14px' }}>
                            <div style={{ ...micro, marginBottom: '8px' }}>{s.who.name} · playoff odds</div>
                            <div style={{ display: 'flex', gap: '20px' }}>
                              <div>
                                <div style={{ fontSize: '15px', fontWeight: '600', color: green }}>{pct(s.win.playoffs)}</div>
                                <div style={{ fontSize: '10px', color: muted }}>with a win</div>
                              </div>
                              <div>
                                <div style={{ fontSize: '15px', fontWeight: '600', color: red }}>{pct(s.lose.playoffs)}</div>
                                <div style={{ fontSize: '10px', color: muted }}>with a loss</div>
                              </div>
                              <div>
                                <div style={{ fontSize: '15px', fontWeight: '600', color: text }}>{pp(s.win.playoffs - s.lose.playoffs)}</div>
                                <div style={{ fontSize: '10px', color: muted }}>swing</div>
                              </div>
                            </div>
                            {/* Once a spot is locked the bye is what's left riding on the game. */}
                            {Math.abs(s.win.bye - s.lose.bye) > 0.01 && (
                              <div style={{ fontSize: '11px', color: muted, marginTop: '8px' }}>
                                Bye <span style={{ color: green }}>{pct(s.win.bye)}</span>
                                <span> / </span>
                                <span style={{ color: red }}>{pct(s.lose.bye)}</span>
                                <span style={{ color: text }}> ({pp(s.win.bye - s.lose.bye)})</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Head to head */}
                    {c.h2h && c.h2h.meetings.length > 0 && (
                      <div style={{ marginBottom: '14px' }}>
                        <button
                          onClick={() => setOpenH2H(open ? null : c.key)}
                          style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '12px', padding: 0, textAlign: 'left', fontFamily: "'Inter', sans-serif" }}
                        >
                          <span style={{ color: text }}>
                            {c.h2h.aWins === c.h2h.bWins
                              ? `All-time series even ${c.h2h.aWins}-${c.h2h.bWins}`
                              : `${c.h2h.aWins > c.h2h.bWins ? c.a.name : c.b.name} leads all-time ${Math.max(c.h2h.aWins, c.h2h.bWins)}-${Math.min(c.h2h.aWins, c.h2h.bWins)}`}
                          </span>
                          {c.h2h.streak && c.h2h.streak.n > 1 && (
                            <span> · {c.h2h.streak.who === 'a' ? c.a.name : c.b.name} has won {c.h2h.streak.n} straight</span>
                          )}
                          <span style={{ marginLeft: '8px' }}>{open ? '▲' : '▼'}</span>
                        </button>
                        {open && (
                          <div style={{ marginTop: '10px', borderLeft: `2px solid ${border}`, paddingLeft: '12px' }}>
                            {c.h2h.meetings.slice(0, 8).map(m => (
                              <div key={m.id} style={{ display: 'flex', gap: '10px', fontSize: '12px', color: muted, marginBottom: '4px' }}>
                                <span style={{ minWidth: '96px' }}>{m.year} · {m.isPlayoff ? 'Playoffs' : `Wk ${m.week}`}</span>
                                <span style={{ color: text }}>
                                  {m.aWon ? c.a.name : c.b.name} {Math.max(m.aScore, m.bScore).toFixed(1)}
                                  <span style={{ color: muted }}> – </span>
                                  {Math.min(m.aScore, m.bScore).toFixed(1)} {m.aWon ? c.b.name : c.a.name}
                                </span>
                              </div>
                            ))}
                            {c.h2h.meetings.length > 8 && (
                              <div style={{ fontSize: '11px', color: muted, marginTop: '6px' }}>
                                +{c.h2h.meetings.length - 8} earlier meetings
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Line */}
                    <div style={{ display: 'flex', gap: effectiveMobile ? '18px' : '32px', flexWrap: 'wrap', borderTop: `1px solid ${border}`, paddingTop: '12px' }}>
                      <div>
                        <div style={{ ...micro, marginBottom: '4px' }}>Spread</div>
                        <div style={{ fontSize: '13px' }}>
                          {c.line.spread === 0
                            ? 'PK'
                            : `${c.line.spread < 0 ? c.a.name : c.b.name} ${fmtSpread(-Math.abs(c.line.spread))}`}
                          <span style={{ color: muted, fontSize: '11px' }}> -110</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ ...micro, marginBottom: '4px' }}>Total</div>
                        <div style={{ fontSize: '13px' }}>{c.line.total.toFixed(1)}<span style={{ color: muted, fontSize: '11px' }}> -110</span></div>
                      </div>
                      <div>
                        <div style={{ ...micro, marginBottom: '4px' }}>Moneyline</div>
                        <div style={{ fontSize: '13px' }}>
                          {c.a.name} <span style={{ color: c.line.mlA < 0 ? text : green }}>{fmtOdds(c.line.mlA)}</span>
                          <span style={{ color: muted }}> / </span>
                          {c.b.name} <span style={{ color: c.line.mlB < 0 ? text : green }}>{fmtOdds(c.line.mlB)}</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ ...micro, marginBottom: '4px' }}>Projection</div>
                        <div style={{ fontSize: '13px', color: muted }}>{c.line.projA.toFixed(1)} – {c.line.projB.toFixed(1)}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <p style={{ fontSize: '11px', color: muted, marginTop: '12px', lineHeight: 1.7, maxWidth: '820px' }}>
              Stakes runs the rest of the season {SIMS.toLocaleString()} times and measures how far apart the two outcomes
              leave the teams playing — playoff odds in full, bye odds at half weight. Only games already on the board
              feed it, so in Week 1 every team is the same team and all five openers sit at 50; the field separates from
              there. The scale is calibrated so a final-week game both teams must win to survive reaches 99.
            </p>
          </div>
        )}

        {/* ── ROOTING GUIDE ── */}
        {sim && rooting.length > 0 && (
          <div>
            <SectionLabel>Rooting Guide</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', color: muted }}>Scoreboard watching as</span>
              <select value={rootFor} onChange={e => setRootFor(e.target.value)} style={inp}>
                {ratings.rows.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? '1fr' : '1fr 1fr', gap: '1px', background: border }}>
              {rooting.map(r => (
                <div key={`${r.homeId}-${r.awayId}`} style={{ background: cardBg, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '14px', marginBottom: '2px' }}>
                      Pull for <span style={{ color: blue, fontWeight: '600' }}>{r.wantName}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: muted }}>over {r.overName}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: r.playoffSwing >= 0.01 ? green : muted }}>
                      {r.playoffSwing < 0.001 ? '—' : `+${(r.playoffSwing * 100).toFixed(1)}`}
                    </div>
                    <div style={{ ...micro }}>playoff odds</div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '11px', color: muted, marginTop: '12px', lineHeight: 1.7, maxWidth: '820px' }}>
              How much each of the other games moves your own playoff odds, from the same simulation — the number is the
              gap between the two outcomes, so a dash means the result genuinely doesn&rsquo;t matter to you.
            </p>
          </div>
        )}
      </div>

      {drawerMatchup && (
        <MatchupDrawer
          homeTeam={drawerMatchup.home}
          awayTeam={drawerMatchup.away}
          week={week}
          regWeeks={regWeeks}
          onClose={() => setDrawerMatchup(null)}
        />
      )}
    </div>
  )
}
