'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase, LEAGUE_ID } from '../../lib/supabase'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'
import {
  isPlayed, buildRatings, simulateFutures,
  projectedStarterPoints, fmtSpread, leagueBaseline,
} from '../../lib/predictions'
import { REG_SEASON_WEEKS, buildFixtures } from '../../lib/schedule'
import { gradeWeek, modelRecord, superlatives } from '../../lib/postweek'
export const dynamic = 'force-dynamic'

const SIMS = 5000
const pct = p => `${(p * 100).toFixed(1)}%`
const seasonLabel = year => `${year}-${String(year + 1).slice(2)}`
const signed = n => `${n > 0 ? '+' : ''}${n.toFixed(1)}`

export default function PostweekPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, rowAlt, green, red, gold } = useLayout()

  const [mounted, setMounted] = useState(false)
  const [seasons, setSeasons] = useState([])
  const [selectedYear, setSelectedYear] = useState(null)
  const [teams, setTeams] = useState([])
  const [matchups, setMatchups] = useState([])
  const [rosterProj, setRosterProj] = useState({})
  const [baseline, setBaseline] = useState(null)
  const [loading, setLoading] = useState(true)

  const [week, setWeek] = useState(null)
  const [swing, setSwing] = useState(null)
  const [simming, setSimming] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    supabase.from('seasons').select('year, season_number').eq('league_id', LEAGUE_ID).order('year', { ascending: false })
      .then(({ data }) => {
        setSeasons(data || [])
        if (data?.length) setSelectedYear(data[0].year)
        else setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!selectedYear) return
    setLoading(true)
    setWeek(null)
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
          .select('team_id, avg_pts, player:player_id(position)')
          .in('team_id', t.map(x => x.id))
        const byTeam = {}
        ;(data || []).forEach(e => { (byTeam[e.team_id] ||= []).push(e) })
        setRosterProj(Object.fromEntries(Object.entries(byTeam).map(([k, v]) => [k, projectedStarterPoints(v)])))
      } else {
        setRosterProj({})
      }
      setLoading(false)
    })
  }, [selectedYear])

  const isCurrentSeason = seasons.length > 0 && selectedYear === seasons[0].year
  const playedWeeks = useMemo(
    () => [...new Set(matchups.filter(isPlayed).map(m => m.week))].sort((a, b) => a - b),
    [matchups],
  )

  // Default to the most recent completed week.
  useEffect(() => {
    if (loading) return
    setWeek(playedWeeks.length ? playedWeeks[playedWeeks.length - 1] : null)
  }, [playedWeeks, loading])

  const fixtures = useMemo(
    () => buildFixtures({ matchups, teams, useFixed: isCurrentSeason }),
    [matchups, teams, isCurrentSeason],
  )

  const regWeeks = Math.max(
    matchups.length ? Math.max(...matchups.map(m => m.week)) : 0,
    isCurrentSeason ? REG_SEASON_WEEKS : 0,
  ) || REG_SEASON_WEEKS

  const games = useMemo(
    () => (week ? gradeWeek({ teams, matchups, rosterProj, baseline, week }) : []),
    [teams, matchups, rosterProj, baseline, week],
  )

  const awards = useMemo(() => superlatives(games), [games])

  const record = useMemo(
    () => (week ? modelRecord({ teams, matchups, rosterProj, baseline, throughWeek: week }) : null),
    [teams, matchups, rosterProj, baseline, week],
  )

  // Standings picture entering and leaving the week.
  const after = useMemo(
    () => (week ? buildRatings({ teams, matchups, throughWeek: week, rosterProj, baseline }) : null),
    [teams, matchups, rosterProj, baseline, week],
  )

  // Two simulations — the season as it looked before the week, and after it.
  useEffect(() => {
    if (!week || !teams.length || !after) { setSwing(null); return }
    const before = buildRatings({ teams, matchups, throughWeek: week - 1, rosterProj, baseline })
    if (!after.rows.some(r => r.rating > 0)) { setSwing(null); return }
    setSimming(true)
    const id = setTimeout(() => {
      const run = (rows, fromWeek) => {
        const rest = fixtures.filter(f => f.week >= fromWeek && f.week <= regWeeks)
        const covered = new Set(rest.map(f => f.week))
        let randomWeeks = 0
        for (let w = fromWeek; w <= regWeeks; w++) if (!covered.has(w)) randomWeeks++
        const sched = rest.map(f => ({ homeId: f.homeId, awayId: f.awayId }))
        return Object.fromEntries(
          simulateFutures({ rows, schedule: sched, randomWeeks, sims: SIMS }).map(r => [r.id, r]),
        )
      }
      const b = run(before.rows, week)
      const a = run(after.rows, week + 1)
      setSwing({ before: b, after: a })
      setSimming(false)
    }, 0)
    return () => clearTimeout(id)
  }, [week, teams, matchups, rosterProj, baseline, fixtures, regWeeks, after])

  const swingRows = useMemo(() => {
    if (!swing || !after) return []
    return after.rows
      .map(r => {
        const b = swing.before[r.id], a = swing.after[r.id]
        if (!b || !a) return null
        return {
          r,
          playoffs: [b.markets.playoffs.p, a.markets.playoffs.p],
          bye: [b.markets.bye.p, a.markets.bye.p],
          title: [b.markets.title.p, a.markets.title.p],
          seed: [b.avgSeed, a.avgSeed],
        }
      })
      .filter(Boolean)
      .sort((x, y) => Math.abs(y.playoffs[1] - y.playoffs[0]) - Math.abs(x.playoffs[1] - x.playoffs[0]))
  }, [swing, after])

  const luckRows = useMemo(() => {
    if (!after) return []
    const n = after.rows.length
    const wk = after.weeksPlayed
    return after.rows
      .map(r => {
        const apGames = wk * (n - 1)
        const apW = Math.round(r.allPlayWinPct * apGames)
        return { ...r, apW, apL: apGames - apW, expWins: r.allPlayWinPct * (r.wins + r.losses) }
      })
      .sort((a, b) => b.allPlayWinPct - a.allPlayWinPct)
  }, [after])

  if (!mounted) return null

  const inp = { background: d ? '#111' : '#e8e4dc', border: `1px solid ${border}`, color: text, padding: '8px 14px', fontSize: '13px', fontFamily: "'Inter', sans-serif", outline: 'none', cursor: 'pointer' }
  const hStyle = (align = 'right') => ({ padding: '10px 12px', fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: muted, textAlign: align, borderBottom: `1px solid ${border}`, fontWeight: '500', whiteSpace: 'nowrap' })
  const cStyle = (align = 'right') => ({ padding: '12px', fontSize: '13px', textAlign: align, borderBottom: `1px solid ${border}`, color: text, whiteSpace: 'nowrap' })
  const SectionLabel = ({ children }) => (
    <p style={{ fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', color: muted, marginBottom: '18px' }}>{children}</p>
  )
  const Delta = ({ from, to, fmt = pct, invert = false }) => {
    const diff = to - from
    const good = invert ? diff < 0 : diff > 0
    const flat = Math.abs(diff) < 0.0005
    return (
      <div>
        <div style={{ fontSize: '13px', fontWeight: '600', color: text }}>{fmt(to)}</div>
        <div style={{ fontSize: '10px', color: flat ? muted : good ? green : red }}>
          {flat ? '—' : `${diff > 0 ? '▲' : '▼'} ${fmt(Math.abs(diff))}`}
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px, 6vw, 72px)', fontWeight: '400', letterSpacing: '-0.02em', marginBottom: '8px' }}>
          Postweek
        </h1>
        <p style={{ color: muted, fontSize: '13px', marginBottom: '32px', maxWidth: '680px', lineHeight: 1.7 }}>
          What the week actually did — how the results moved the playoff picture, who got the schedule they deserved,
          and whether the lines held up.
        </p>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap' }}>
          <select value={selectedYear ?? ''} onChange={e => setSelectedYear(parseInt(e.target.value))} style={inp}>
            {seasons.map(s => <option key={s.year} value={s.year}>{seasonLabel(s.year)} — Year {s.season_number}</option>)}
          </select>
          <select value={week ?? ''} onChange={e => setWeek(parseInt(e.target.value))} style={inp} disabled={!playedWeeks.length}>
            {playedWeeks.map(w => <option key={w} value={w}>Week {w}</option>)}
          </select>
          {simming && <span style={{ fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', color: muted }}>Simulating…</span>}
        </div>

        {loading && <p style={{ color: muted, fontSize: '14px' }}>Loading…</p>}

        {!loading && !playedWeeks.length && (
          <p style={{ color: muted, fontSize: '13px' }}>
            No completed weeks yet for {seasonLabel(selectedYear)} — this fills in once results are in.
          </p>
        )}

        {!loading && week && (
          <>
            {/* ── SUPERLATIVES ── */}
            {awards.length > 0 && (
              <div style={{ marginBottom: '48px' }}>
                <SectionLabel>Week {week} Awards</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? '1fr 1fr' : `repeat(${awards.length}, 1fr)`, gap: '1px', background: border }}>
                  {awards.map(a => (
                    <div key={a.label} style={{ background: cardBg, padding: '16px' }}>
                      <div style={{ fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: muted, marginBottom: '8px' }}>{a.label}</div>
                      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '22px', color: text, marginBottom: '2px' }}>{a.value}</div>
                      <div style={{ fontSize: '12px', color: text, marginBottom: '2px' }}>{a.who}</div>
                      <div style={{ fontSize: '11px', color: muted }}>{a.note}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── RESULTS VS THE LINE ── */}
            <div style={{ marginBottom: '48px' }}>
              <SectionLabel>Week {week} Results vs the Line</SectionLabel>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
                  <thead>
                    <tr style={{ background: cardBg }}>
                      <th style={hStyle('left')}>Matchup</th>
                      <th style={hStyle()}>Result</th>
                      <th style={hStyle()}>Spread</th>
                      <th style={hStyle()}>ATS</th>
                      <th style={hStyle()}>Total</th>
                      <th style={hStyle()}>O/U</th>
                      <th style={hStyle()}>Model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((g, i) => (
                      <tr key={g.id} style={{ background: i % 2 === 0 ? 'transparent' : rowAlt }}>
                        <td style={{ ...cStyle('left'), fontFamily: "'Playfair Display', serif", fontSize: '15px' }}>
                          {g.a.name} <span style={{ fontSize: '11px', color: muted, fontFamily: "'Inter', sans-serif" }}>vs</span> {g.b.name}
                        </td>
                        <td style={cStyle()}>
                          <span style={{ fontWeight: '600' }}>{g.sA.toFixed(2)}</span>
                          <span style={{ color: muted }}> – </span>
                          <span style={{ fontWeight: '600' }}>{g.sB.toFixed(2)}</span>
                        </td>
                        <td style={{ ...cStyle(), color: muted }}>{g.a.name} {fmtSpread(g.line.spread)}</td>
                        <td style={{ ...cStyle(), color: g.ats === 'push' ? muted : text }}>
                          {g.ats === 'push' ? 'Push' : `${g.ats === 'a' ? g.a.name : g.b.name} by ${Math.abs(g.atsMargin).toFixed(1)}`}
                        </td>
                        <td style={{ ...cStyle(), color: muted }}>{g.line.total.toFixed(1)}</td>
                        <td style={cStyle()}>
                          <span style={{ color: g.ou === 'push' ? muted : text }}>{g.ou === 'push' ? 'Push' : g.ou === 'over' ? 'Over' : 'Under'}</span>
                          <span style={{ color: muted, fontSize: '11px' }}> {signed(g.ouMargin)}</span>
                        </td>
                        <td style={{ ...cStyle(), color: g.favHit === false ? red : g.favHit ? green : muted }}>
                          {g.favHit === null ? 'Pick' : g.favHit ? 'Hit' : 'Miss'}
                          <span style={{ color: muted, fontSize: '11px' }}> · {pct(g.pWinner)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: '11px', color: muted, marginTop: '10px', lineHeight: 1.7 }}>
                Lines are rebuilt from what was known entering Week {week} — no result informs the number that priced it.
                &ldquo;Model&rdquo; is whether the favored side won, with the win probability it was given.
              </p>
            </div>

            {/* ── PLAYOFF ODDS SWING ── */}
            <div style={{ marginBottom: '48px' }}>
              <SectionLabel>What Week {week} Changed</SectionLabel>
              {!swing && !simming && <p style={{ fontSize: '13px', color: muted }}>Not enough results yet to simulate the rest of the season.</p>}
              {swing && (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
                      <thead>
                        <tr style={{ background: cardBg }}>
                          <th style={hStyle('left')}>Team</th>
                          <th style={hStyle('center')}>W-L</th>
                          <th style={hStyle()}>Playoffs</th>
                          <th style={hStyle()}>Bye</th>
                          <th style={hStyle()}>Title</th>
                          <th style={hStyle()}>Proj Seed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {swingRows.map((s, i) => (
                          <tr key={s.r.id} style={{ background: i % 2 === 0 ? 'transparent' : rowAlt }}>
                            <td style={{ ...cStyle('left'), fontFamily: "'Playfair Display', serif", fontSize: '15px' }}>
                              {s.r.name}
                              <div style={{ fontSize: '11px', color: muted, fontFamily: "'Inter', sans-serif" }}>{s.r.teamName}</div>
                            </td>
                            <td style={cStyle('center')}>{s.r.wins}-{s.r.losses}</td>
                            <td style={cStyle()}><Delta from={s.playoffs[0]} to={s.playoffs[1]} /></td>
                            <td style={cStyle()}><Delta from={s.bye[0]} to={s.bye[1]} /></td>
                            <td style={cStyle()}><Delta from={s.title[0]} to={s.title[1]} /></td>
                            <td style={cStyle()}><Delta from={s.seed[0]} to={s.seed[1]} fmt={n => n.toFixed(1)} invert /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize: '11px', color: muted, marginTop: '10px', lineHeight: 1.7 }}>
                    Each row is the season simulated {SIMS.toLocaleString()} times before Week {week} and again after it, sorted by
                    who moved most. Seed is average finish, so a lower number is better.
                  </p>
                </>
              )}
            </div>

            {/* ── LUCK ── */}
            {after && after.weeksPlayed > 0 && (
              <div style={{ marginBottom: '48px' }}>
                <SectionLabel>Record vs Deserved — through Week {week}</SectionLabel>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
                    <thead>
                      <tr style={{ background: cardBg }}>
                        <th style={hStyle('left')}>Team</th>
                        <th style={hStyle('center')}>Record</th>
                        <th style={hStyle('center')}>All-Play</th>
                        <th style={hStyle()}>All-Play %</th>
                        <th style={hStyle()}>Deserved W</th>
                        <th style={hStyle()}>Luck</th>
                      </tr>
                    </thead>
                    <tbody>
                      {luckRows.map((r, i) => (
                        <tr key={r.id} style={{ background: i % 2 === 0 ? 'transparent' : rowAlt }}>
                          <td style={{ ...cStyle('left'), fontFamily: "'Playfair Display', serif", fontSize: '15px' }}>{r.name}</td>
                          <td style={cStyle('center')}>{r.wins}-{r.losses}</td>
                          <td style={{ ...cStyle('center'), color: muted }}>{r.apW}-{r.apL}</td>
                          <td style={cStyle()}>{pct(r.allPlayWinPct)}</td>
                          <td style={cStyle()}>{r.expWins.toFixed(1)}</td>
                          <td style={{ ...cStyle(), color: r.luck > 0.5 ? green : r.luck < -0.5 ? red : muted, fontWeight: '600' }}>
                            {signed(r.luck)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: '11px', color: muted, marginTop: '10px', lineHeight: 1.7 }}>
                  All-play is the record you&rsquo;d hold if you played every other team every week. Deserved wins is that rate over
                  your games played; luck is real wins minus deserved. A big positive number means the schedule has been kind.
                </p>
              </div>
            )}

            {/* ── MODEL SCORECARD ── */}
            {record && record.games > 0 && (
              <div>
                <SectionLabel>Line Accuracy — through Week {week}</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '1px', background: border, marginBottom: '14px' }}>
                  <div style={{ background: cardBg, padding: '18px' }}>
                    <div style={{ fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: muted, marginBottom: '8px' }}>Favorites</div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '26px', color: text }}>{record.fav.w}-{record.fav.l}</div>
                    <div style={{ fontSize: '11px', color: record.favPct > 0.5 ? green : muted }}>{pct(record.favPct)} straight up</div>
                  </div>
                  <div style={{ background: cardBg, padding: '18px' }}>
                    <div style={{ fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: muted, marginBottom: '8px' }}>Over / Under</div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '26px', color: text }}>{record.ou.over}-{record.ou.under}</div>
                    <div style={{ fontSize: '11px', color: muted }}>
                      {record.ou.over === record.ou.under ? 'dead even' : record.ou.over > record.ou.under ? 'totals set low' : 'totals set high'}
                    </div>
                  </div>
                  <div style={{ background: cardBg, padding: '18px' }}>
                    <div style={{ fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: muted, marginBottom: '8px' }}>Brier Score</div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '26px', color: text }}>{record.brier?.toFixed(3)}</div>
                    <div style={{ fontSize: '11px', color: record.brier < 0.25 ? green : red }}>
                      {record.brier < 0.25 ? 'beats a coin flip' : 'worse than a coin flip'}
                    </div>
                  </div>
                  <div style={{ background: cardBg, padding: '18px' }}>
                    <div style={{ fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: muted, marginBottom: '8px' }}>Games Priced</div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '26px', color: text }}>{record.games}</div>
                    <div style={{ fontSize: '11px', color: muted }}>over {record.weeks} week{record.weeks === 1 ? '' : 's'}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  {record.byWeek.map(w => {
                    const good = w.favW > w.favL
                    const even = w.favW === w.favL
                    return (
                      <div key={w.week} title={`Week ${w.week}: ${w.favW}-${w.favL}`} style={{ border: `1px solid ${even ? border : good ? green : red}`, color: even ? muted : good ? green : red, padding: '6px 10px', fontSize: '11px', minWidth: '54px', textAlign: 'center' }}>
                        <div style={{ fontSize: '9px', color: muted, letterSpacing: '0.1em' }}>W{w.week}</div>
                        {w.favW}-{w.favL}
                      </div>
                    )
                  })}
                </div>
                <p style={{ fontSize: '11px', color: muted, lineHeight: 1.7, maxWidth: '760px' }}>
                  Brier scores a probability forecast against what happened — 0 is perfect, 0.25 is what you&rsquo;d get by calling
                  every game a coin flip, and lower is better. Week 1 is included and is the hardest week to price, since nothing but
                  roster projection exists to go on.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
