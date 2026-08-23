'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase, LEAGUE_ID } from '../../lib/supabase'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'
import {
  PLAYOFF_SPOTS, BYE_SPOTS,
  isPlayed, buildRatings, makeLine, simulateFutures,
  projectedStarterPoints, projectedWeekScore, fmtOdds, fmtSpread, leagueBaseline,
} from '../../lib/predictions'
import { REG_SEASON_WEEKS, resolveSchedule } from '../../lib/schedule'
export const dynamic = 'force-dynamic'

const ADMIN_PIN = '2910'
const SIMS = 10000

const pct = p => `${(p * 100).toFixed(1)}%`
const seasonLabel = year => `${year}-${String(year + 1).slice(2)}`

export default function PredictionsPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, rowAlt, green, red, gold, blue } = useLayout()

  const [mounted, setMounted] = useState(false)
  const [seasons, setSeasons] = useState([])
  const [selectedYear, setSelectedYear] = useState(null)
  const [teams, setTeams] = useState([])
  const [matchups, setMatchups] = useState([])
  const [rosterProj, setRosterProj] = useState({})
  const [rosterEntriesByTeam, setRosterEntriesByTeam] = useState({})
  const [baseline, setBaseline] = useState(null)
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState('week')
  const [week, setWeek] = useState(1)
  const [weekTouched, setWeekTouched] = useState(false)

  const [futures, setFutures] = useState(null)
  const [simming, setSimming] = useState(false)

  const [copied, setCopied] = useState(false)
  const [adminUnlocked, setAdminUnlocked] = useState(false)
  const [showPinModal, setShowPinModal] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [flash, setFlash] = useState({ msg: '', ok: true })

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    supabase.from('seasons').select('year, season_number').order('year', { ascending: false })
      .then(({ data }) => {
        setSeasons(data || [])
        if (data?.length) setSelectedYear(data[0].year)
        else setLoading(false)
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

  const fixedSchedule = useMemo(
    () => (isCurrentSeason && teams.length ? resolveSchedule(teams) : { games: [], unresolved: [] }),
    [teams, isCurrentSeason],
  )

  // Played games come from the database; the league's fixed fixture list fills
  // in any week that hasn't synced yet, so future weeks still get a board.
  const fixtures = useMemo(() => {
    const weeksWithRows = new Set(matchups.map(m => m.week))
    const out = matchups.map(m => ({
      key: m.id,
      week: m.week,
      homeId: m.home_team?.id,
      awayId: m.away_team?.id,
      m,
    }))
    fixedSchedule.games.forEach(g => {
      if (weeksWithRows.has(g.week)) return
      out.push({ key: `s-${g.week}-${g.homeId}-${g.awayId}`, ...g, m: null })
    })
    return out.filter(f => f.homeId && f.awayId)
  }, [matchups, fixedSchedule])

  // Default to the first week that hasn't been played.
  useEffect(() => {
    if (weekTouched || loading) return
    const unplayed = matchups.filter(m => !isPlayed(m)).map(m => m.week)
    const lastPlayed = matchups.filter(isPlayed).map(m => m.week)
    if (unplayed.length) setWeek(Math.min(...unplayed))
    else if (lastPlayed.length) setWeek(Math.min(Math.max(...lastPlayed) + 1, regWeeks))
    else setWeek(1)
  }, [matchups, loading, weekTouched, regWeeks])

  // A genuine forward projection for the week being priced, built from
  // uploaded per-player weekly projections (falls back to nothing for a week
  // that has none, so buildRatings quietly leans on the model instead).
  const weeklyProj = useMemo(
    () => Object.fromEntries(Object.entries(rosterEntriesByTeam).map(([k, v]) => [k, projectedWeekScore(v, week)])),
    [rosterEntriesByTeam, week],
  )

  // Everything on the page is "entering week N" — ratings use games before it.
  const ratings = useMemo(() => {
    if (!teams.length) return null
    return buildRatings({ teams, matchups, throughWeek: week - 1, rosterProj, baseline, weeklyProj })
  }, [teams, matchups, week, rosterProj, baseline, weeklyProj])

  const hasSignal = !!ratings && ratings.rows.some(r => r.rating > 0)

  const weekGames = useMemo(() => {
    if (!ratings) return []
    return fixtures
      .filter(f => f.week === week)
      .map(f => {
        const a = ratings.byId[f.homeId]
        const b = ratings.byId[f.awayId]
        if (!a || !b) return null
        const line = makeLine(a, b)
        const played = !!f.m && isPlayed(f.m)
        const sA = f.m?.home_score, sB = f.m?.away_score
        let grade = null
        if (played) {
          const atsMargin = sA + line.spread - sB
          const totalPts = sA + sB
          grade = {
            scoreA: sA, scoreB: sB, totalPts,
            ats: atsMargin > 0 ? 'a' : atsMargin < 0 ? 'b' : 'push',
            ou: totalPts > line.total ? 'over' : totalPts < line.total ? 'under' : 'push',
            ml: sA > sB ? 'a' : sB > sA ? 'b' : 'push',
            favHit: (line.spread < 0 && sA > sB) || (line.spread > 0 && sB > sA),
          }
        }
        return { key: f.key, a, b, line, played, grade }
      })
      .filter(Boolean)
      .sort((x, y) => (y.line.projA + y.line.projB) - (x.line.projA + x.line.projB))
  }, [fixtures, week, ratings])

  // Run the season simulation off the render path — it's ~10k full seasons.
  useEffect(() => {
    if (!ratings || !hasSignal || !teams.length) { setFutures(null); return }
    setSimming(true)
    const remaining = fixtures.filter(f => f.week >= week && f.week <= regWeeks)
    const covered = new Set(remaining.map(f => f.week))
    let randomWeeks = 0
    for (let w = week; w <= regWeeks; w++) if (!covered.has(w)) randomWeeks++
    const schedule = remaining.map(f => ({ homeId: f.homeId, awayId: f.awayId }))

    const n = ratings.rows.length
    const id = setTimeout(() => {
      setFutures({
        rows: simulateFutures({ rows: ratings.rows, schedule, randomWeeks, sims: SIMS }),
        gamesLeft: schedule.length + randomWeeks * Math.floor(n / 2),
        gamesPerTeamLeft: (schedule.length * 2) / n + randomWeeks,
        assumedSchedule: randomWeeks > 0,
      })
      setSimming(false)
    }, 0)
    return () => clearTimeout(id)
  }, [ratings, hasSignal, fixtures, week, regWeeks, teams.length])

  const futuresRows = useMemo(() => {
    if (!futures || !ratings) return []
    return futures.rows
      .map(f => ({ ...f, r: ratings.byId[f.id] }))
      .filter(x => x.r)
      .sort((a, b) => b.markets.title.p - a.markets.title.p)
  }, [futures, ratings])

  const storylines = useMemo(() => {
    if (weekGames.length < 2) return []
    const byCloseness = [...weekGames].sort((x, y) => Math.abs(x.line.spread) - Math.abs(y.line.spread))
    const byTotal = [...weekGames].sort((x, y) => y.line.total - x.line.total)
    const ranked = weekGames.every(x => x.a.powerRank && x.b.powerRank)
    const byPower = [...weekGames].sort((x, y) => (x.a.powerRank + x.b.powerRank) - (y.a.powerRank + y.b.powerRank))
    const g = byPower[0], close = byCloseness[0], blowout = byCloseness[byCloseness.length - 1], high = byTotal[0]
    const dogPick = blowout.line.spread < 0 ? blowout.b : blowout.a
    const dogOdds = blowout.line.spread < 0 ? blowout.line.mlB : blowout.line.mlA
    // Openers are all pick'ems off a level field, so the angles that rank one
    // game over another have nothing to work with yet.
    if (!ranked) {
      return [
        ['Even Field', 'Every game a coin flip', 'No results on the board yet — nothing separates these teams', gold],
        ['Shootout Watch', `${high.a.name} vs ${high.b.name}`, `Highest total on the board at ${high.line.total}`, green],
      ]
    }
    return [
      ['Game of the Week', `${g.a.name} vs ${g.b.name}`, `Power #${g.a.powerRank} meets #${g.b.powerRank} · total ${g.line.total}`, gold],
      ['Coin Flip', `${close.a.name} vs ${close.b.name}`, `Just ${Math.abs(close.line.spread)} points apart — tightest line of the week`, blue],
      ['Biggest Mismatch', `${blowout.line.spread < 0 ? blowout.a.name : blowout.b.name} by ${Math.abs(blowout.line.spread)}`, `over ${blowout.line.spread < 0 ? blowout.b.name : blowout.a.name}`, red],
      ['Shootout Watch', `${high.a.name} vs ${high.b.name}`, `Highest total on the board at ${high.line.total}`, green],
      ['Live Dog', dogPick.name, `${fmtOdds(dogOdds)} on the moneyline — worth a sprinkle`, green],
    ]
  }, [weekGames, gold, blue, red, green])

  const summaryText = useMemo(() => {
    if (!weekGames.length) return ''
    const lines = []
    lines.push(`📋 WEEK ${week} LINES — ${seasonLabel(selectedYear)}`)
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    lines.push('')
    weekGames.forEach(({ a, b, line, played, grade }) => {
      const favName = line.spread < 0 ? a.name : b.name
      const dogName = line.spread < 0 ? b.name : a.name
      lines.push(`${a.name} vs ${b.name}`)
      lines.push(`  Spread:  ${favName} -${Math.abs(line.spread)} (-110)  |  ${dogName} +${Math.abs(line.spread)} (-110)`)
      lines.push(`  Total:   O/U ${line.total} (-110)`)
      lines.push(`  ML:      ${a.name} ${fmtOdds(line.mlA)}  |  ${b.name} ${fmtOdds(line.mlB)}`)
      lines.push(`  Proj:    ${line.projA.toFixed(1)} – ${line.projB.toFixed(1)}  (${a.name} ${pct(line.pA)} to win)`)
      if (played && grade) {
        lines.push(`  Final:   ${grade.scoreA.toFixed(2)} – ${grade.scoreB.toFixed(2)} · ATS: ${grade.ats === 'push' ? 'Push' : (grade.ats === 'a' ? a.name : b.name)} · ${grade.ou === 'push' ? 'Push' : grade.ou === 'over' ? 'Over' : 'Under'}`)
      }
      lines.push('')
    })
    if (futuresRows.length) {
      lines.push('🏆 TITLE ODDS')
      futuresRows.slice(0, 5).forEach(f => {
        lines.push(`  ${f.r.name.padEnd(12)} ${fmtOdds(f.markets.title.odds).padStart(6)}   (${pct(f.markets.title.p)})`)
      })
      lines.push('')
      lines.push('📊 WIN TOTALS')
      futuresRows.forEach(f => {
        lines.push(`  ${f.r.name.padEnd(12)} ${f.winTotal}  O ${fmtOdds(f.oddsOver)} / U ${fmtOdds(f.oddsUnder)}`)
      })
    }
    return lines.join('\n')
  }, [weekGames, futuresRows, week, selectedYear])

  const showFlash = (msg, ok = true) => {
    setFlash({ msg, ok })
    setTimeout(() => setFlash({ msg: '', ok: true }), 4000)
  }

  const publishToSportsbook = async () => {
    if (!weekGames.length) return
    setPublishing(true)
    const season = seasonLabel(selectedYear)
    const { data: existing } = await supabase.from('sb_games').select('id').eq('season', season).eq('week', week)
    if (existing?.length) {
      showFlash(`Week ${week} already has ${existing.length} game(s) in the sportsbook — clear them there first.`, false)
      setPublishing(false)
      return
    }
    const { error } = await supabase.from('sb_games').insert(weekGames.map(({ a, b, line }) => ({
      season, week,
      team_a: a.name, team_b: b.name,
      spread: line.spread, over_under: line.total,
      ml_a: line.mlA, ml_b: line.mlB,
    })))
    showFlash(error ? 'Failed to publish lines.' : `Published ${weekGames.length} games to the sportsbook.`, !error)
    setPublishing(false)
  }

  if (!mounted) return null

  const inp = { background: d ? '#111' : '#e8e4dc', border: `1px solid ${border}`, color: text, padding: '8px 14px', fontSize: '13px', fontFamily: "'Inter', sans-serif", outline: 'none', cursor: 'pointer' }
  const tabBtn = active => ({ background: active ? text : 'none', color: active ? bg : muted, border: `1px solid ${border}`, padding: '8px 18px', cursor: 'pointer', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", fontWeight: active ? '600' : '400' })
  const hStyle = (align = 'right') => ({ padding: '10px 12px', fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: muted, textAlign: align, borderBottom: `1px solid ${border}`, fontWeight: '500', whiteSpace: 'nowrap' })
  const cStyle = (align = 'right') => ({ padding: '12px', fontSize: '13px', textAlign: align, borderBottom: `1px solid ${border}`, color: text, whiteSpace: 'nowrap' })
  const micro = { fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: muted }

  const SectionLabel = ({ children }) => (
    <p style={{ fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', color: muted, marginBottom: '18px' }}>{children}</p>
  )

  const OddsCell = ({ market }) => (
    <div>
      <div style={{ fontSize: '13px', fontWeight: '600', color: text }}>{fmtOdds(market.odds)}</div>
      <div style={{ fontSize: '10px', color: muted }}>{pct(market.p)}</div>
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />

      {showPinModal && (
        <>
          <div onClick={() => setShowPinModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 201, background: d ? '#0a0a0a' : '#f4f1ec', border: `1px solid ${border}`, padding: '28px', width: effectiveMobile ? '90vw' : '320px' }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: '18px', marginBottom: '16px', color: text }}>Admin Access</h3>
            <input type="password" placeholder="PIN" value={pinInput}
              onChange={e => { setPinInput(e.target.value); setPinError('') }}
              onKeyDown={e => { if (e.key === 'Enter') { if (pinInput === ADMIN_PIN) { setAdminUnlocked(true); setShowPinModal(false); setPinInput('') } else setPinError('Wrong PIN') } }}
              style={{ ...inp, width: '100%', marginBottom: '8px', cursor: 'text' }} />
            {pinError && <p style={{ fontSize: '12px', color: red, marginBottom: '8px' }}>{pinError}</p>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button onClick={() => { if (pinInput === ADMIN_PIN) { setAdminUnlocked(true); setShowPinModal(false); setPinInput('') } else setPinError('Wrong PIN') }}
                style={{ background: text, color: bg, border: 'none', padding: '10px 20px', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif", flex: 1 }}>Unlock</button>
              <button onClick={() => setShowPinModal(false)} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '10px 20px', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
            </div>
          </div>
        </>
      )}

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 80px' : '120px 24px 80px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px', marginBottom: '8px' }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px,6vw,72px)', fontWeight: '400', letterSpacing: '-0.02em' }}>Predictions</h1>
          {!adminUnlocked
            ? <button onClick={() => setShowPinModal(true)} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '8px 14px', cursor: 'pointer', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif" }}>Admin</button>
            : <button onClick={() => setAdminUnlocked(false)} style={{ background: 'none', border: `1px solid ${gold}`, color: gold, padding: '8px 14px', cursor: 'pointer', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif" }}>Admin ✓</button>}
        </div>
        <p style={{ color: muted, fontSize: '13px', marginBottom: '32px' }}>
          Auto-generated weekly lines and season futures — priced off power score, scoring form and roster makeup.
        </p>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '20px' }}>
          <select value={selectedYear || ''} onChange={e => setSelectedYear(parseInt(e.target.value))} style={inp}>
            {seasons.map(s => <option key={s.year} value={s.year}>{seasonLabel(s.year)}{s.season_number ? ` — Year ${s.season_number}` : ''}</option>)}
          </select>
          <select value={week} onChange={e => { setWeek(parseInt(e.target.value)); setWeekTouched(true) }} style={inp}>
            {Array.from({ length: regWeeks }, (_, i) => i + 1).map(w => <option key={w} value={w}>Week {w}</option>)}
          </select>
          <span style={{ ...micro, letterSpacing: '0.12em' }}>
            Model state: entering Week {week} · {ratings?.weeksPlayed || 0} week{ratings?.weeksPlayed === 1 ? '' : 's'} of results
          </span>
        </div>

        <div style={{ display: 'flex', gap: '4px', marginBottom: '32px', flexWrap: 'wrap' }}>
          {[['week', `Week ${week}`], ['futures', 'Futures'], ['model', 'Model']].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={tabBtn(tab === t)}>{label}</button>
          ))}
        </div>

        {loading && <p style={{ color: muted, fontSize: '13px' }}>Loading league data…</p>}
        {!loading && !teams.length && <p style={{ color: muted, fontSize: '13px' }}>No teams found for {seasonLabel(selectedYear)}.</p>}
        {!loading && teams.length > 0 && !hasSignal && (
          <p style={{ color: muted, fontSize: '13px' }}>
            No results or roster data yet for {seasonLabel(selectedYear)} — lines open once there's something to price off.
          </p>
        )}

        {/* ── WEEKLY LINES ── */}
        {!loading && hasSignal && tab === 'week' && (
          <>
            {weekGames.length === 0 && (
              <p style={{ color: muted, fontSize: '13px' }}>
                No Week {week} matchups for {seasonLabel(selectedYear)}.
              </p>
            )}

            {fixedSchedule.unresolved.length > 0 && (
              <p style={{ color: red, fontSize: '12px', marginBottom: '20px', lineHeight: 1.6 }}>
                The fixed schedule couldn't match {fixedSchedule.unresolved.join(', ')} to a manager on this
                season's roster, so those games fall back to the database. Check the names in lib/schedule.js.
              </p>
            )}

            {weekGames.length > 0 && (
              <>
                <div style={{ marginBottom: '48px' }}>
                  <SectionLabel>Week {week} Storylines</SectionLabel>
                  <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? '1fr' : `repeat(${storylines.length}, 1fr)`, gap: '1px', background: border }}>
                    {storylines.map(([label, value, sub, color]) => (
                      <div key={label} style={{ background: cardBg, padding: '18px 20px', borderTop: `2px solid ${color}` }}>
                        <div style={{ ...micro, letterSpacing: '0.2em', marginBottom: '8px' }}>{label}</div>
                        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '16px', color: text, marginBottom: '4px', lineHeight: 1.3 }}>{value}</div>
                        <div style={{ fontSize: '11px', color: muted, lineHeight: 1.5 }}>{sub}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
                  <SectionLabel>Week {week} Board</SectionLabel>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={() => { navigator.clipboard.writeText(summaryText); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                      style={{ background: copied ? green : 'none', border: `1px solid ${copied ? green : border}`, color: copied ? bg : muted, padding: '8px 16px', cursor: 'pointer', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif" }}>
                      {copied ? '✓ Copied' : 'Copy Lines'}
                    </button>
                    {adminUnlocked && (
                      <button onClick={publishToSportsbook} disabled={publishing}
                        style={{ background: 'none', border: `1px solid ${gold}`, color: gold, padding: '8px 16px', cursor: publishing ? 'not-allowed' : 'pointer', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", opacity: publishing ? 0.6 : 1 }}>
                        {publishing ? 'Publishing…' : 'Publish to Sportsbook'}
                      </button>
                    )}
                  </div>
                </div>
                {flash.msg && <p style={{ fontSize: '12px', color: flash.ok ? green : red, marginBottom: '12px' }}>{flash.msg}</p>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '48px' }}>
                  {weekGames.map(({ key, a, b, line, played, grade }) => {
                    const favA = line.spread < 0
                    return (
                      <div key={key} style={{ background: cardBg, border: `1px solid ${border}` }}>
                        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '18px', color: text }}>
                                {a.name} <span style={{ color: muted, fontSize: '13px' }}>vs</span> {b.name}
                              </div>
                              <div style={{ fontSize: '11px', color: muted, marginTop: '3px' }}>
                                {a.wins}-{a.losses}{a.powerRank ? ` · PWR #${a.powerRank}` : ''} &nbsp;|&nbsp; {b.wins}-{b.losses}{b.powerRank ? ` · PWR #${b.powerRank}` : ''}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '13px', color: text }}>
                                Proj {line.projA.toFixed(1)} – {line.projB.toFixed(1)}
                              </div>
                              {played && grade && (
                                <div style={{ fontSize: '13px', color: gold, marginTop: '2px' }}>
                                  Final {grade.scoreA.toFixed(2)} – {grade.scoreB.toFixed(2)}
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px' }}>
                            <span style={{ fontSize: '11px', color: muted, minWidth: '38px' }}>{pct(line.pA)}</span>
                            <div style={{ flex: 1, height: '4px', background: d ? '#1a1a1a' : '#d9d4cb', position: 'relative' }}>
                              <div style={{ position: 'absolute', inset: 0, width: `${line.pA * 100}%`, background: blue }} />
                            </div>
                            <span style={{ fontSize: '11px', color: muted, minWidth: '38px', textAlign: 'right' }}>{pct(line.pB)}</span>
                          </div>
                        </div>

                        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: effectiveMobile ? '1fr' : 'repeat(3, 1fr)', gap: '20px' }}>
                          <div>
                            <div style={{ ...micro, marginBottom: '8px' }}>Spread</div>
                            <div style={{ fontSize: '13px', color: text, marginBottom: '3px' }}>
                              {a.name} {fmtSpread(line.spread)} <span style={{ color: muted, fontSize: '11px' }}>-110</span>
                              {played && grade?.ats === 'a' && <span style={{ color: green, marginLeft: '6px' }}>✓</span>}
                            </div>
                            <div style={{ fontSize: '13px', color: text }}>
                              {b.name} {fmtSpread(-line.spread)} <span style={{ color: muted, fontSize: '11px' }}>-110</span>
                              {played && grade?.ats === 'b' && <span style={{ color: green, marginLeft: '6px' }}>✓</span>}
                            </div>
                          </div>
                          <div>
                            <div style={{ ...micro, marginBottom: '8px' }}>Total</div>
                            <div style={{ fontSize: '13px', color: text, marginBottom: '3px' }}>
                              Over {line.total} <span style={{ color: muted, fontSize: '11px' }}>-110</span>
                              {played && grade?.ou === 'over' && <span style={{ color: green, marginLeft: '6px' }}>✓</span>}
                            </div>
                            <div style={{ fontSize: '13px', color: text }}>
                              Under {line.total} <span style={{ color: muted, fontSize: '11px' }}>-110</span>
                              {played && grade?.ou === 'under' && <span style={{ color: green, marginLeft: '6px' }}>✓</span>}
                            </div>
                          </div>
                          <div>
                            <div style={{ ...micro, marginBottom: '8px' }}>Moneyline</div>
                            <div style={{ fontSize: '13px', color: text, marginBottom: '3px' }}>
                              {a.name} <span style={{ color: line.mlA > 0 ? green : red, fontWeight: '500' }}>{fmtOdds(line.mlA)}</span>
                              {played && grade?.ml === 'a' && <span style={{ color: green, marginLeft: '6px' }}>✓</span>}
                            </div>
                            <div style={{ fontSize: '13px', color: text }}>
                              {b.name} <span style={{ color: line.mlB > 0 ? green : red, fontWeight: '500' }}>{fmtOdds(line.mlB)}</span>
                              {played && grade?.ml === 'b' && <span style={{ color: green, marginLeft: '6px' }}>✓</span>}
                            </div>
                          </div>
                        </div>

                        <div style={{ padding: '12px 20px', borderTop: `1px solid ${border}`, fontSize: '12px', color: muted, lineHeight: 1.6 }}>
                          {played && grade ? (
                            <>
                              {(grade.ml === 'a' ? a.name : b.name)} took it {Math.max(grade.scoreA, grade.scoreB).toFixed(1)}–{Math.min(grade.scoreA, grade.scoreB).toFixed(1)}.
                              {' '}The {favA ? a.name : b.name} side was laying {Math.abs(line.spread)} and {grade.favHit ? 'held serve' : 'got burned'}; total closed {grade.ou === 'push' ? 'on the number' : `${grade.ou} at ${line.total}`} with {grade.totalPts.toFixed(1)} combined.
                            </>
                          ) : (
                            <>
                              {favA ? a.name : b.name} lays {Math.abs(line.spread)} on the back of {(favA ? a : b).avgScore > 0 ? `${(favA ? a : b).avgScore.toFixed(1)} PPG` : 'roster projection'}
                              {(favA ? a : b).gamesPlayed >= 3 ? ` and a ${((favA ? a : b).allPlayWinPct * 100).toFixed(0)}% all-play mark` : ''}.
                              {' '}{(favA ? b : a).name} needs {(Math.abs(line.spread) + 0.5).toFixed(1)} more than projection to cover — {pct(favA ? line.pB : line.pA)} to win outright.
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div>
                  <SectionLabel>Copy / Paste</SectionLabel>
                  <pre style={{ background: cardBg, border: `1px solid ${border}`, padding: '20px', fontSize: '12px', fontFamily: "'Courier New', monospace", lineHeight: 1.7, color: text, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                    {summaryText}
                  </pre>
                </div>
              </>
            )}
          </>
        )}

        {/* ── FUTURES ── */}
        {!loading && hasSignal && tab === 'futures' && (
          <>
            <SectionLabel>Futures — entering Week {week}</SectionLabel>
            {simming && <p style={{ color: muted, fontSize: '13px' }}>Simulating {SIMS.toLocaleString()} seasons…</p>}

            {!simming && futuresRows.length > 0 && (
              <>
                <p style={{ fontSize: '12px', color: muted, marginBottom: '24px', lineHeight: 1.7 }}>
                  {SIMS.toLocaleString()} simulated seasons — {futures.gamesLeft} games left, top {PLAYOFF_SPOTS} make the playoffs, top {BYE_SPOTS} get a bye.
                  {futures.assumedSchedule && ' Remaining pairings aren\'t posted yet, so unscheduled weeks are simulated as neutral random matchups.'}
                </p>

                {effectiveMobile ? (
                  <div style={{ borderTop: `1px solid ${border}` }}>
                    {futuresRows.map((f, i) => (
                      <div key={f.id} style={{ padding: '16px 0', borderBottom: `1px solid ${border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div>
                            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '17px', color: text }}>{f.r.name}</div>
                            <div style={{ fontSize: '11px', color: muted }}>{f.r.wins}-{f.r.losses} · PWR {f.r.powerScore.toFixed(1)} · proj {f.r.rating.toFixed(1)} PPG</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '16px', fontWeight: '700', color: i === 0 ? gold : text }}>{fmtOdds(f.markets.title.odds)}</div>
                            <div style={{ ...micro }}>to win it</div>
                          </div>
                        </div>
                        <div style={{ background: cardBg, padding: '10px 12px', marginBottom: '10px' }}>
                          <div style={{ ...micro, marginBottom: '4px' }}>Win Total {f.winTotal}</div>
                          <div style={{ fontSize: '13px', color: text }}>
                            O {fmtOdds(f.oddsOver)} <span style={{ color: muted }}>/</span> U {fmtOdds(f.oddsUnder)}
                            <span style={{ color: muted, fontSize: '11px' }}> · proj {f.winsMean.toFixed(1)} W</span>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                          {[['Playoffs', 'playoffs'], ['Bye', 'bye'], ['Semis', 'semis'], ['Finals', 'finals']].map(([label, key]) => (
                            <div key={key}>
                              <div style={{ ...micro, marginBottom: '2px' }}>{label}</div>
                              <div style={{ fontSize: '12px', color: text }}>{fmtOdds(f.markets[key].odds)}</div>
                              <div style={{ fontSize: '10px', color: muted }}>{pct(f.markets[key].p)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
                      <thead>
                        <tr style={{ background: cardBg }}>
                          <th style={hStyle('left')}>Team</th>
                          <th style={hStyle()}>Power</th>
                          <th style={hStyle()}>Proj PPG</th>
                          <th style={hStyle('center')}>Proj Record</th>
                          <th style={hStyle('center')}>Win Total</th>
                          <th style={hStyle('center')}>Playoffs</th>
                          <th style={hStyle('center')}>Bye</th>
                          <th style={hStyle('center')}>Semis</th>
                          <th style={hStyle('center')}>Finals</th>
                          <th style={hStyle('center')}>Title</th>
                        </tr>
                      </thead>
                      <tbody>
                        {futuresRows.map((f, i) => {
                          const projLosses = f.r.wins + f.r.losses + futures.gamesPerTeamLeft - f.winsMean
                          return (
                            <tr key={f.id} style={{ background: i % 2 === 0 ? 'transparent' : rowAlt }}>
                              <td style={{ ...cStyle('left'), fontFamily: "'Playfair Display', serif", fontSize: '15px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                  {f.r.name}
                                  {i === 0 && <span style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: gold, border: `1px solid ${gold}`, padding: '2px 6px' }}>Favorite</span>}
                                </span>
                                <div style={{ fontSize: '11px', color: muted, fontFamily: "'Inter', sans-serif" }}>{f.r.wins}-{f.r.losses}</div>
                              </td>
                              <td style={cStyle()}>{f.r.powerScore.toFixed(1)}</td>
                              <td style={cStyle()}>{f.r.rating.toFixed(1)}</td>
                              <td style={cStyle('center')}>{f.winsMean.toFixed(1)}-{projLosses.toFixed(1)}</td>
                              <td style={cStyle('center')}>
                                <div style={{ fontSize: '13px', fontWeight: '600' }}>{f.winTotal}</div>
                                <div style={{ fontSize: '10px', color: muted }}>O {fmtOdds(f.oddsOver)} / U {fmtOdds(f.oddsUnder)}</div>
                              </td>
                              <td style={cStyle('center')}><OddsCell market={f.markets.playoffs} /></td>
                              <td style={cStyle('center')}><OddsCell market={f.markets.bye} /></td>
                              <td style={cStyle('center')}><OddsCell market={f.markets.semis} /></td>
                              <td style={cStyle('center')}><OddsCell market={f.markets.finals} /></td>
                              <td style={{ ...cStyle('center'), color: i === 0 ? gold : text }}><OddsCell market={f.markets.title} /></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <p style={{ fontSize: '11px', color: muted, marginTop: '20px', lineHeight: 1.7 }}>
                  Odds carry a 5% hold, so the two sides of each market add to more than 100% — same as a real book.
                  Semifinal odds include the top {BYE_SPOTS} seeds, who skip the first round.
                </p>
              </>
            )}
          </>
        )}

        {/* ── MODEL ── */}
        {!loading && hasSignal && tab === 'model' && ratings && (
          <>
            <SectionLabel>Team Ratings — entering Week {week}</SectionLabel>
            <div style={{ overflowX: 'auto', marginBottom: '32px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
                <thead>
                  <tr style={{ background: cardBg }}>
                    <th style={hStyle('center')}>Rk</th>
                    <th style={hStyle('left')}>Team</th>
                    <th style={hStyle('center')}>W-L</th>
                    <th style={hStyle()}>Power</th>
                    <th style={hStyle()}>Avg PPG</th>
                    <th style={hStyle()}>Roster PPG</th>
                    <th style={hStyle()}>Rating</th>
                    <th style={hStyle()}>Volatility</th>
                    <th style={hStyle()}>All-Play</th>
                    <th style={hStyle()}>Luck</th>
                  </tr>
                </thead>
                <tbody>
                  {ratings.rows.map((r, i) => (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? 'transparent' : rowAlt }}>
                      <td style={{ ...cStyle('center'), fontWeight: '700', color: i === 0 ? gold : muted }}>{r.powerRank ?? '—'}</td>
                      <td style={{ ...cStyle('left'), fontFamily: "'Playfair Display', serif", fontSize: '15px' }}>
                        {r.name}
                        <div style={{ fontSize: '11px', color: muted, fontFamily: "'Inter', sans-serif" }}>{r.teamName}</div>
                      </td>
                      <td style={cStyle('center')}>{r.wins}-{r.losses}</td>
                      <td style={cStyle()}>{r.powerScore.toFixed(1)}</td>
                      <td style={cStyle()}>{r.gamesPlayed ? r.avgScore.toFixed(1) : '—'}</td>
                      <td style={cStyle()}>{r.rosterProj ? r.rosterProj.toFixed(1) : '—'}</td>
                      <td style={{ ...cStyle(), fontWeight: '600' }}>{r.rating.toFixed(1)}</td>
                      <td style={cStyle()}>±{r.sigma.toFixed(1)}</td>
                      <td style={cStyle()}>{r.gamesPlayed ? pct(r.allPlayWinPct) : '—'}</td>
                      <td style={{ ...cStyle(), color: r.luck > 0 ? green : r.luck < 0 ? red : muted }}>{r.luck > 0 ? '+' : ''}{r.luck.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <SectionLabel>How the numbers are made</SectionLabel>
            <div style={{ fontSize: '13px', color: muted, lineHeight: 1.9, maxWidth: '760px' }}>
              <p style={{ marginBottom: '14px' }}>
                <strong style={{ color: text }}>Rating</strong> is a projected weekly score: half of it is the team's scoring average
                shrunk toward the league mean (so a hot Week 1 doesn't run the board), a quarter is recent form over the last three
                games, and a quarter is roster makeup — the sum of the best startable lineup's per-game averages, rescaled onto the
                league's scoring level. Before any games are played the roster projection carries the whole rating.
              </p>
              <p style={{ marginBottom: '14px' }}>
                <strong style={{ color: text }}>Volatility</strong> is the team's own scoring standard deviation, blended with the
                league's. The spread is the projected margin rounded to the half point, the total is the sum of both projections, and
                the moneyline comes from a normal distribution over the margin — so a boom-or-bust team gets shorter dog prices than a
                metronome with the same rating.
              </p>
              <p style={{ marginBottom: '14px' }}>
                <strong style={{ color: text }}>Futures</strong> run {SIMS.toLocaleString()} full seasons game by game from the current
                standings, seed by wins then points for, and play out the {PLAYOFF_SPOTS}-team bracket with byes for the top {BYE_SPOTS}.
                Win totals, playoff, bye, semifinal, final and title prices are all read off the same simulation, so they stay consistent
                with each other.
              </p>
              <p>
                Spreads and totals are priced at -110 a side; everything else carries a 5% hold.
                Lines shown for completed weeks were built only from games played before that week, so the ✓ marks are honest grades.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
