'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'
import RosterDrawer from '../../components/RosterDrawer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const RESULT_OPTIONS = [
  'All', 'Champion', 'Runner Up', 'Third Place', '4th Place',
  '5th Place', '6th Place', '7th Place', '8th Place', '9th Place', '10th Place',
  'Sacko', 'Made Playoffs', 'Missed Playoffs'
]

export default function AllTimeTeamsPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, rowAlt, green, red, gold } = useLayout()

  const [teams, setTeams] = useState([])
  const [matchups, setMatchups] = useState([])
  const [sortKey, setSortKey] = useState('points_for')
  const [sortDir, setSortDir] = useState('desc')
  const [searchText, setSearchText] = useState('')
  const [yearFrom, setYearFrom] = useState('all')
  const [yearTo, setYearTo] = useState('all')
  const [filterManager, setFilterManager] = useState('all')
  const [filterResult, setFilterResult] = useState('All')
  const [rosterTeam, setRosterTeam] = useState(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    supabase.from('teams')
      .select('*, manager:manager_id(name, slug), season:season_id(year)')
      .then(({ data }) => setTeams(data || []))
    supabase.from('matchups')
      .select('*, home_team:home_team_id(id, manager_id), away_team:away_team_id(id, manager_id), season:season_id(year)')
      .eq('is_playoff', false)
      .then(({ data }) => setMatchups(data || []))
  }, [])

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const allYears = [...new Set(teams.map(t => t.season?.year))].filter(Boolean).sort((a, b) => b - a)
  const allManagers = [...new Map(teams.map(t => [t.manager?.slug, t.manager?.name])).entries()]
    .filter(([slug]) => slug).sort((a, b) => a[1].localeCompare(b[1]))

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
      if (myScores.length === 0) { result[t.id] = { powerScore: 0, luck: 0 }; return }
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
      const sorted = [...scores].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      const medianScore = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
      const winPct = (t.wins + t.losses) > 0 ? t.wins / (t.wins + t.losses) : 0
      const allPlayWinPct = weeks.length > 0 ? allPlayTotal / weeks.length : 0
      result[t.id] = { luck, winPct, avgScore, medianScore, allPlayWinPct, _needsNorm: true }
    })
    const yearGroups = {}
    teams.forEach(t => {
      const yr = t.season?.year
      if (!yearGroups[yr]) yearGroups[yr] = []
      yearGroups[yr].push(t)
    })
    Object.entries(yearGroups).forEach(([yr, seasonTeams]) => {
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

  const resultColor = (result) => {
    if (!result) return muted
    if (result === 'Champion') return gold
    if (result === 'Runner Up') return d ? 'rgba(192,192,192,0.9)' : '#555'
    if (result === 'Third Place') return d ? '#cd7f32' : '#7c4a00'
    if (result?.includes('Sacko')) return red
    return muted
  }

  const matchesResultFilter = (t) => {
    if (filterResult === 'All') return true
    if (filterResult === 'Champion') return t.playoff_result === 'Champion'
    if (filterResult === 'Runner Up') return t.playoff_result === 'Runner Up'
    if (filterResult === 'Third Place') return t.playoff_result === 'Third Place'
    if (filterResult === 'Sacko') return t.playoff_result === 'Sacko'
    if (filterResult === 'Made Playoffs') return t.made_playoffs
    if (filterResult === 'Missed Playoffs') return !t.made_playoffs
    const placeMap = { '4th Place': 4, '5th Place': 5, '6th Place': 6, '7th Place': 7, '8th Place': 8, '9th Place': 9, '10th Place': 10 }
    if (placeMap[filterResult]) return !t.made_playoffs && t.final_standing === placeMap[filterResult]
    return true
  }

  const enrichedTeams = useMemo(() => teams.map(t => {
    const diff = parseFloat((t.points_for - t.points_against).toFixed(2))
    const games = t.wins + t.losses
    const ppgDiff = games > 0 ? parseFloat(((t.points_for - t.points_against) / games).toFixed(2)) : 0
    const winPct = games > 0 ? parseFloat(((t.wins / games) * 100).toFixed(1)) : 0
    const stats = teamStats[t.id] || {}
    return { ...t, diff, ppgDiff, winPct, powerScore: stats.powerScore ?? null, luck: stats.luck ?? null }
  }), [teams, teamStats])

  const filteredTeams = useMemo(() => enrichedTeams
    .filter(t => {
      const yr = t.season?.year
      if (yearFrom !== 'all' && yr < parseInt(yearFrom)) return false
      if (yearTo !== 'all' && yr > parseInt(yearTo)) return false
      if (filterManager !== 'all' && t.manager?.slug !== filterManager) return false
      if (!matchesResultFilter(t)) return false
      if (searchText) {
        const q = searchText.toLowerCase()
        if (!t.manager?.name?.toLowerCase().includes(q) && !t.team_name?.toLowerCase().includes(q)) return false
      }
      return true
    })
    .sort((a, b) => {
      const mult = sortDir === 'desc' ? -1 : 1
      const val = (x) => {
        if (sortKey === 'year') return x.season?.year ?? 0
        if (sortKey === 'manager') return x.manager?.name ?? ''
        if (sortKey === 'team_name') return x.team_name ?? ''
        if (sortKey === 'winPct') return x.winPct ?? 0
        if (sortKey === 'powerScore') return x.powerScore ?? 0
        if (sortKey === 'luck') return x.luck ?? 0
        return x[sortKey] ?? 0
      }
      const av = val(a), bv = val(b)
      if (typeof av === 'string') return mult * av.localeCompare(bv)
      return mult * (av - bv)
    }), [enrichedTeams, yearFrom, yearTo, filterManager, filterResult, searchText, sortKey, sortDir])

  const avgRow = useMemo(() => {
    if (filteredTeams.length === 0) return null
    const n = filteredTeams.length
    const sum = (fn) => filteredTeams.reduce((s, t) => s + (fn(t) || 0), 0)
    const powTeams = filteredTeams.filter(t => t.powerScore !== null)
    const luckTeams = filteredTeams.filter(t => t.luck !== null)
    return {
      wins: (sum(t => t.wins) / n).toFixed(1),
      losses: (sum(t => t.losses) / n).toFixed(1),
      winPct: (sum(t => t.winPct) / n).toFixed(1),
      pf: (sum(t => t.points_for) / n).toFixed(1),
      pa: (sum(t => t.points_against) / n).toFixed(1),
      diff: (sum(t => t.diff) / n).toFixed(1),
      ppgDiff: (sum(t => t.ppgDiff) / n).toFixed(2),
      power: powTeams.length ? (powTeams.reduce((s, t) => s + t.powerScore, 0) / powTeams.length).toFixed(1) : '—',
      luck: luckTeams.length ? (luckTeams.reduce((s, t) => s + t.luck, 0) / luckTeams.length).toFixed(2) : '—',
    }
  }, [filteredTeams])

  if (!mounted) return null

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <span style={{ opacity: 0.3, marginLeft: '3px' }}>↕</span>
    return <span style={{ marginLeft: '3px' }}>{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  const inputStyle = {
    background: cardBg, border: `1px solid ${border}`, color: text,
    padding: '7px 12px', fontSize: '12px', fontFamily: "'Inter', sans-serif",
    outline: 'none', width: effectiveMobile ? '100%' : '200px',
  }
  const selectStyle = { ...inputStyle, cursor: 'pointer', width: effectiveMobile ? '100%' : '180px' }

  const hStyle = (align = 'right') => ({
    padding: '10px 12px', fontSize: '10px', letterSpacing: '0.13em',
    textTransform: 'uppercase', color: muted, textAlign: align,
    borderBottom: `1px solid ${border}`, fontWeight: '500',
    whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
    background: cardBg,
  })
  const cStyle = (align = 'right') => ({
    padding: '14px 12px', fontSize: '13px', textAlign: align,
    borderBottom: `1px solid ${border}`, color: text, whiteSpace: 'nowrap',
  })
  const aStyle = (align = 'right') => ({
    padding: '10px 12px', fontSize: '12px', textAlign: align,
    borderBottom: `1px solid ${border}`, color: muted, whiteSpace: 'nowrap',
    fontWeight: '600', background: d ? 'rgba(255,255,255,0.03)' : 'rgba(13,33,82,0.04)',
  })

  const MobileCard = ({ t, i }) => {
    const ps = t.powerScore
    const lk = t.luck
    return (
      <div style={{ background: i % 2 === 0 ? 'transparent' : cardBg, padding: '14px', borderBottom: `1px solid ${border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '16px', color: text }}>{t.manager?.name}</div>
            <div style={{ fontSize: '11px', color: muted, marginTop: '2px' }}>{t.team_name} · {t.season?.year}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ fontSize: '12px', color: resultColor(t.playoff_result), fontWeight: '500' }}>
              {t.playoff_result || (t.made_playoffs ? 'Playoffs' : '—')}
            </div>
            <button onClick={() => setRosterTeam(t)} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '3px 7px', cursor: 'pointer', fontSize: '11px' }}>📋</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {[
            ['Record', `${t.wins}-${t.losses}`],
            ['Win %', `${t.winPct}%`],
            ['PF', t.points_for.toFixed(0)],
            ['PA', t.points_against.toFixed(0)],
            ['Diff', `${t.diff >= 0 ? '+' : ''}${t.diff.toFixed(0)}`],
            ['PPG Diff', `${t.ppgDiff >= 0 ? '+' : ''}${t.ppgDiff}`],
            ['Power', ps !== null ? ps.toFixed(1) : '—'],
            ['Luck', lk !== null ? (lk >= 0 ? `+${lk}` : `${lk}`) : '—'],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '2px' }}>{label}</div>
              <div style={{ fontSize: '13px', color: label === 'Diff' || label === 'PPG Diff' ? (parseFloat(val) >= 0 ? green : red) : label === 'Luck' ? (lk >= 0 ? green : red) : text }}>{val}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />
      <div style={{ maxWidth: '1300px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>

        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px, 6vw, 72px)', fontWeight: '400', marginBottom: '8px', letterSpacing: '-0.02em' }}>
          All-Time Teams
        </h1>
        <p style={{ color: muted, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '32px' }}>
          {filteredTeams.length} team seasons · click column to sort · click row to view roster
        </p>

        <div style={{ display: 'flex', flexDirection: effectiveMobile ? 'column' : 'row', gap: '10px', marginBottom: '32px', flexWrap: 'wrap' }}>
          <input placeholder="Search manager or team..." value={searchText} onChange={e => setSearchText(e.target.value)} style={{ ...inputStyle, width: effectiveMobile ? '100%' : '220px' }} />
          <select value={yearFrom} onChange={e => setYearFrom(e.target.value)} style={selectStyle}>
            <option value="all">From Year</option>
            {allYears.slice().reverse().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={yearTo} onChange={e => setYearTo(e.target.value)} style={selectStyle}>
            <option value="all">To Year</option>
            {allYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={filterManager} onChange={e => setFilterManager(e.target.value)} style={selectStyle}>
            <option value="all">All Managers</option>
            {allManagers.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
          </select>
          <select value={filterResult} onChange={e => setFilterResult(e.target.value)} style={selectStyle}>
            {RESULT_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {effectiveMobile ? (
          <div style={{ borderTop: `1px solid ${border}` }}>
            {filteredTeams.map((t, i) => <MobileCard key={t.id} t={t} i={i} />)}
            {filteredTeams.length === 0 && <p style={{ color: muted, padding: '24px 0', fontSize: '13px' }}>No teams match your filters.</p>}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
              <thead>
                <tr>
                  <th style={hStyle('center')}>Rk</th>
                  <th style={hStyle('left')} onClick={() => handleSort('manager')}>Manager <SortIcon col="manager" /></th>
                  <th style={hStyle('left')} onClick={() => handleSort('team_name')}>Team <SortIcon col="team_name" /></th>
                  <th style={hStyle('center')} onClick={() => handleSort('year')}>Year <SortIcon col="year" /></th>
                  <th style={hStyle()} onClick={() => handleSort('wins')}>W <SortIcon col="wins" /></th>
                  <th style={hStyle()} onClick={() => handleSort('losses')}>L <SortIcon col="losses" /></th>
                  <th style={hStyle()} onClick={() => handleSort('winPct')}>Win % <SortIcon col="winPct" /></th>
                  <th style={hStyle()} onClick={() => handleSort('points_for')}>PF <SortIcon col="points_for" /></th>
                  <th style={hStyle()} onClick={() => handleSort('points_against')}>PA <SortIcon col="points_against" /></th>
                  <th style={hStyle()} onClick={() => handleSort('diff')}>Diff <SortIcon col="diff" /></th>
                  <th style={hStyle()} onClick={() => handleSort('ppgDiff')}>PPG Diff <SortIcon col="ppgDiff" /></th>
                  <th style={hStyle()} onClick={() => handleSort('powerScore')}>Power <SortIcon col="powerScore" /></th>
                  <th style={hStyle()} onClick={() => handleSort('luck')}>Luck <SortIcon col="luck" /></th>
                  <th style={{ ...hStyle('center'), minWidth: '110px' }} onClick={() => handleSort('playoff_result')}>Result <SortIcon col="playoff_result" /></th>
                </tr>
              </thead>
              <tbody>
                {filteredTeams.map((t, i) => (
                  <tr key={t.id} onClick={() => setRosterTeam(t)} style={{ background: i % 2 === 0 ? 'transparent' : rowAlt, cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = d ? '#0d0d1a' : '#e8edf5'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : rowAlt}
                  >
                    <td style={{ ...cStyle('center'), color: muted }}>{i + 1}</td>
                    <td style={{ ...cStyle('left'), fontFamily: "'Playfair Display', serif", fontSize: '15px' }}>{t.manager?.name}</td>
                    <td style={{ ...cStyle('left'), color: muted, fontSize: '12px' }}>{t.team_name}</td>
                    <td style={{ ...cStyle('center'), color: muted }}>{t.season?.year}</td>
                    <td style={cStyle()}>{t.wins}</td>
                    <td style={cStyle()}>{t.losses}</td>
                    <td style={cStyle()}>{t.winPct}%</td>
                    <td style={cStyle()}>{t.points_for.toFixed(2)}</td>
                    <td style={cStyle()}>{t.points_against.toFixed(2)}</td>
                    <td style={{ ...cStyle(), color: t.diff >= 0 ? green : red, fontWeight: '500' }}>{t.diff >= 0 ? '+' : ''}{t.diff}</td>
                    <td style={{ ...cStyle(), color: t.ppgDiff >= 0 ? green : red, fontWeight: '500' }}>{t.ppgDiff >= 0 ? '+' : ''}{t.ppgDiff}</td>
                    <td style={{ ...cStyle(), color: t.powerScore !== null ? text : muted }}>{t.powerScore !== null ? t.powerScore.toFixed(1) : '—'}</td>
                    <td style={{ ...cStyle(), color: t.luck !== null ? (t.luck >= 0 ? green : red) : muted, fontWeight: '500' }}>{t.luck !== null ? (t.luck >= 0 ? `+${t.luck}` : `${t.luck}`) : '—'}</td>
                    <td style={{ ...cStyle('center'), color: resultColor(t.playoff_result), fontSize: '12px', fontWeight: '500', minWidth: '110px' }}>{t.playoff_result || (t.made_playoffs ? 'Playoffs' : '—')}</td>
                  </tr>
                ))}
                {avgRow && (
                  <tr>
                    <td style={{ ...aStyle('center') }}>AVG</td>
                    <td style={{ ...aStyle('left'), fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Selection Avg ({filteredTeams.length})</td>
                    <td style={aStyle('left')} />
                    <td style={aStyle('center')} />
                    <td style={aStyle()}>{avgRow.wins}</td>
                    <td style={aStyle()}>{avgRow.losses}</td>
                    <td style={aStyle()}>{avgRow.winPct}%</td>
                    <td style={aStyle()}>{avgRow.pf}</td>
                    <td style={aStyle()}>{avgRow.pa}</td>
                    <td style={{ ...aStyle(), color: parseFloat(avgRow.diff) >= 0 ? green : red }}>{parseFloat(avgRow.diff) >= 0 ? '+' : ''}{avgRow.diff}</td>
                    <td style={{ ...aStyle(), color: parseFloat(avgRow.ppgDiff) >= 0 ? green : red }}>{parseFloat(avgRow.ppgDiff) >= 0 ? '+' : ''}{avgRow.ppgDiff}</td>
                    <td style={aStyle()}>{avgRow.power}</td>
                    <td style={{ ...aStyle(), color: avgRow.luck !== '—' ? (parseFloat(avgRow.luck) >= 0 ? green : red) : muted }}>{avgRow.luck !== '—' && parseFloat(avgRow.luck) >= 0 ? '+' : ''}{avgRow.luck}</td>
                    <td style={aStyle('center')} />
                    <td style={aStyle('center')} />
                  </tr>
                )}
                {filteredTeams.length === 0 && (
                  <tr><td colSpan={14} style={{ padding: '24px', color: muted, textAlign: 'center', fontSize: '13px' }}>No teams match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rosterTeam && <RosterDrawer team={rosterTeam} onClose={() => setRosterTeam(null)} />}
    </div>
  )
}
