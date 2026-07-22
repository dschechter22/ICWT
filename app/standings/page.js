'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function StandingsPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, rowAlt, statsBg, green, red, gold } = useLayout()

  const [managers, setManagers] = useState([])
  const [teams, setTeams] = useState([])
  const [seasons, setSeasons] = useState([])
  const [matchups, setMatchups] = useState([])
  const [expanded, setExpanded] = useState({})
  const [sortKey, setSortKey] = useState('championships')
  const [sortDir, setSortDir] = useState('desc')
  const [includePlayoffs, setIncludePlayoffs] = useState(false)

  // Filters
  const [searchText, setSearchText] = useState('')
  const [yearFrom, setYearFrom] = useState('all')
  const [yearTo, setYearTo] = useState('all')

  useEffect(() => {
    supabase.from('managers').select('*').then(({ data }) => setManagers(data || []))
    supabase.from('teams').select('*, season:season_id(year)').then(({ data }) => setTeams(data || []))
    supabase.from('seasons').select('*, champion:champion_id(id), mol_bowl_winner:mol_bowl_winner_id(id), mol_bowl_loser:mol_bowl_loser_id(id)').then(({ data }) => setSeasons(data || []))
    supabase.from('matchups').select('*, home_team:home_team_id(id, manager_id), away_team:away_team_id(id, manager_id), season:season_id(year)').eq('is_playoff', true).then(({ data }) => setMatchups(data || []))
  }, [])

  const toggleExpand = (slug) => setExpanded(prev => ({ ...prev, [slug]: !prev[slug] }))
  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d2 => d2 === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const filteredTeams = teams.filter(t => {
    const yr = t.season.year
    if (yearFrom !== 'all' && yr < parseInt(yearFrom)) return false
    if (yearTo !== 'all' && yr > parseInt(yearTo)) return false
    return true
  })

  const filteredSeasons = seasons.filter(s => {
    if (yearFrom !== 'all' && s.year < parseInt(yearFrom)) return false
    if (yearTo !== 'all' && s.year > parseInt(yearTo)) return false
    return true
  })

  const filteredMatchups = matchups.filter(m => {
    if (yearFrom !== 'all' && m.season?.year < parseInt(yearFrom)) return false
    if (yearTo !== 'all' && m.season?.year > parseInt(yearTo)) return false
    return true
  })

  const getPlayoffStats = (managerId, seasonYear) => {
    const games = filteredMatchups.filter(m =>
      m.season?.year === seasonYear &&
      !m.is_mol_bowl &&
      (m.home_team?.manager_id === managerId || m.away_team?.manager_id === managerId)
    )
    let pf = 0, pa = 0, wins = 0, losses = 0
    games.forEach(m => {
      const iAmHome = m.home_team?.manager_id === managerId
      const myScore = iAmHome ? m.home_score : m.away_score
      const theirScore = iAmHome ? m.away_score : m.home_score
      pf += myScore; pa += theirScore
      if (myScore > theirScore) wins++; else if (myScore < theirScore) losses++
    })
    return { pf, pa, wins, losses }
  }

  const allYears = [...new Set(teams.map(t => t.season?.year))].filter(Boolean).sort((a, b) => b - a)

  const buildManagerStats = () => {
    return managers.map(m => {
      const mTeams = filteredTeams.filter(t => t.manager_id === m.id)
      if (mTeams.length === 0) return null

      const regWins = mTeams.reduce((s, t) => s + t.wins, 0)
      const regLosses = mTeams.reduce((s, t) => s + t.losses, 0)
      const regPf = mTeams.reduce((s, t) => s + t.points_for, 0)
      const regPa = mTeams.reduce((s, t) => s + t.points_against, 0)

      let playoffWins = 0, playoffLosses = 0, playoffPf = 0, playoffPa = 0
      if (includePlayoffs) {
        mTeams.forEach(t => {
          const ps = getPlayoffStats(m.id, t.season.year)
          playoffWins += ps.wins; playoffLosses += ps.losses
          playoffPf += ps.pf; playoffPa += ps.pa
        })
      }

      const wins = regWins + playoffWins
      const losses = regLosses + playoffLosses
      const pf = regPf + playoffPf
      const pa = regPa + playoffPa
      const championships = filteredSeasons.filter(s => s.champion?.id === m.id).length
      const playoffAppearances = mTeams.filter(t => t.made_playoffs).length
      const molBowlLosses = filteredSeasons.filter(s => s.mol_bowl_loser?.id === m.id).length
      const winPct = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0'
      const diff = parseFloat((pf - pa).toFixed(2))
      const totalGames = wins + losses
      const ppgDiff = totalGames > 0 ? parseFloat(((pf - pa) / totalGames).toFixed(2)) : 0

      const seasonBreakdown = mTeams
        .sort((a, b) => b.season.year - a.season.year)
        .map(t => {
          const ps = includePlayoffs ? getPlayoffStats(m.id, t.season.year) : { pf: 0, pa: 0, wins: 0, losses: 0 }
          const tWins = t.wins + ps.wins
          const tLosses = t.losses + ps.losses
          const tPf = parseFloat((t.points_for + ps.pf).toFixed(2))
          const tPa = parseFloat((t.points_against + ps.pa).toFixed(2))
          const tDiff = parseFloat((tPf - tPa).toFixed(2))
          const tGames = tWins + tLosses
          const tPpgDiff = tGames > 0 ? parseFloat(((tPf - tPa) / tGames).toFixed(2)) : 0
          return {
            year: t.season.year, team_name: t.team_name,
            wins: tWins, losses: tLosses, pf: tPf, pa: tPa,
            diff: tDiff, ppg_diff: tPpgDiff,
            made_playoffs: t.made_playoffs,
            champion: filteredSeasons.find(s => s.year === t.season.year)?.champion?.id === m.id,
            mol_bowl_loss: filteredSeasons.find(s => s.year === t.season.year)?.mol_bowl_loser?.id === m.id,
          }
        })

      return { ...m, wins, losses, pf, pa, diff, ppgDiff, championships, playoffAppearances, molBowlLosses, winPct, seasonBreakdown }
    })
      .filter(Boolean)
      .filter(m => !searchText || m.name.toLowerCase().includes(searchText.toLowerCase()))
      .sort((a, b) => {
        const mult = sortDir === 'desc' ? -1 : 1
        const val = (x) => {
          if (sortKey === 'winPct') return parseFloat(x.winPct)
          if (sortKey === 'diff') return x.diff
          if (sortKey === 'ppgDiff') return x.ppgDiff
          if (sortKey === 'pf') return x.pf
          if (sortKey === 'pa') return x.pa
          return x[sortKey]
        }
        return mult * (val(a) - val(b))
      })
  }

  const managerStats = buildManagerStats()

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <span style={{ opacity: 0.3, marginLeft: '3px' }}>↕</span>
    return <span style={{ marginLeft: '3px' }}>{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  const filterBtn = (active, label, onClick) => (
    <button onClick={onClick} style={{
      background: active ? text : 'none', border: `1px solid ${border}`,
      color: active ? bg : muted, padding: effectiveMobile ? '6px 10px' : '7px 16px',
      cursor: 'pointer', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase',
      fontFamily: "'Inter', sans-serif", fontWeight: '500', transition: 'all 0.15s', whiteSpace: 'nowrap',
    }}>{label}</button>
  )

  const inputStyle = {
    background: cardBg, border: `1px solid ${border}`, color: text,
    padding: '7px 12px', fontSize: '12px', fontFamily: "'Inter', sans-serif",
    outline: 'none', width: effectiveMobile ? '100%' : '200px',
  }

  const selectStyle = {
    ...inputStyle, cursor: 'pointer', width: effectiveMobile ? '100%' : '160px',
  }

  const hStyle = (align = 'right') => ({
    padding: effectiveMobile ? '8px 10px' : '10px 14px',
    fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase',
    color: muted, textAlign: align, borderBottom: `1px solid ${border}`,
    fontWeight: '500', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
  })

  const cStyle = (align = 'right', bold = false) => ({
    padding: effectiveMobile ? '12px 10px' : '18px 14px',
    fontSize: effectiveMobile ? '12px' : '13px', textAlign: align,
    borderBottom: `1px solid ${border}`, color: text,
    fontWeight: bold ? '600' : '400', whiteSpace: 'nowrap',
  })

  const scStyle = (align = 'right') => ({
    padding: '10px 12px', fontSize: '11px', textAlign: align,
    borderBottom: `1px solid ${border}`, color: muted, whiteSpace: 'nowrap',
  })

  // Mobile card view for each manager
  const MobileManagerCard = ({ m }) => (
    <div style={{ background: cardBg, marginBottom: '1px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '18px', color: text }}>{m.name}</div>
          {!m.active && <span style={{ fontSize: '10px', color: muted, letterSpacing: '0.1em' }}>RETIRED</span>}
        </div>
        <button onClick={() => toggleExpand(m.slug)} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontFamily: "'Inter', sans-serif" }}>
          {expanded[m.slug] ? '▲' : '▼'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        {[
          ['Record', `${m.wins}-${m.losses}`],
          ['Win %', `${m.winPct}%`],
          ['Titles', m.championships || '—'],
          ['Playoffs', m.playoffAppearances],
          ['PF', m.pf.toFixed(0)],
          ['PA', m.pa.toFixed(0)],
          ['Diff', `${m.diff >= 0 ? '+' : ''}${m.diff.toFixed(0)}`],
          ['Mol Bowls', m.molBowlLosses || '—'],
        ].map(([label, val]) => (
          <div key={label}>
            <div style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '2px' }}>{label}</div>
            <div style={{ fontSize: '13px', color: text }}>{val}</div>
          </div>
        ))}
      </div>
      {expanded[m.slug] && (
        <div style={{ marginTop: '16px', borderTop: `1px solid ${border}`, paddingTop: '12px' }}>
          {m.seasonBreakdown.map(s => (
            <div key={s.year} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${border}`, fontSize: '12px' }}>
              <div>
                <span style={{ color: muted, marginRight: '8px' }}>{s.year}</span>
                <span style={{ fontFamily: "'Playfair Display', serif", color: text }}>{s.team_name}</span>
              </div>
              <div style={{ display: 'flex', gap: '12px', color: muted }}>
                <span>{s.wins}-{s.losses}</span>
                <span style={{ color: s.champion ? gold : s.mol_bowl_loss ? red : muted }}>
                  {s.champion ? '🏆' : s.mol_bowl_loss ? 'Mol' : s.made_playoffs ? '✓' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>

        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px, 6vw, 72px)', fontWeight: '400', marginBottom: '8px', letterSpacing: '-0.02em' }}>
          All-Time Standings
        </h1>
        <p style={{ color: muted, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '32px' }}>
          Career records across all seasons
        </p>

        {/* Filters */}
        <div style={{ display: 'flex', flexDirection: effectiveMobile ? 'column' : 'row', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input
            placeholder="Search manager..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={inputStyle}
          />
          <select value={yearFrom} onChange={e => setYearFrom(e.target.value)} style={selectStyle}>
            <option value="all">From Year</option>
            {allYears.slice().reverse().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={yearTo} onChange={e => setYearTo(e.target.value)} style={selectStyle}>
            <option value="all">To Year</option>
            {allYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', flexWrap: 'wrap' }}>
          {filterBtn(!includePlayoffs, 'Regular Season Only', () => setIncludePlayoffs(false))}
          {filterBtn(includePlayoffs, 'Include Playoffs', () => setIncludePlayoffs(true))}
        </div>

        {/* Mobile: card layout */}
        {effectiveMobile ? (
          <div>
            {managerStats.map(m => <MobileManagerCard key={m.slug} m={m} />)}
          </div>
        ) : (
          /* Desktop: table layout */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
              <thead>
                <tr style={{ background: cardBg }}>
                  <th style={hStyle('left')} onClick={() => handleSort('name')}>Manager <SortIcon col="name" /></th>
                  <th style={hStyle()} onClick={() => handleSort('wins')}>W <SortIcon col="wins" /></th>
                  <th style={hStyle()} onClick={() => handleSort('losses')}>L <SortIcon col="losses" /></th>
                  <th style={hStyle()} onClick={() => handleSort('winPct')}>Win % <SortIcon col="winPct" /></th>
                  <th style={hStyle()} onClick={() => handleSort('pf')}>PF <SortIcon col="pf" /></th>
                  <th style={hStyle()} onClick={() => handleSort('pa')}>PA <SortIcon col="pa" /></th>
                  <th style={hStyle()} onClick={() => handleSort('diff')}>Diff <SortIcon col="diff" /></th>
                  <th style={hStyle()} onClick={() => handleSort('ppgDiff')}>PPG Diff <SortIcon col="ppgDiff" /></th>
                  <th style={hStyle()} onClick={() => handleSort('championships')}>Titles <SortIcon col="championships" /></th>
                  <th style={hStyle()} onClick={() => handleSort('playoffAppearances')}>Playoffs <SortIcon col="playoffAppearances" /></th>
                  <th style={hStyle()} onClick={() => handleSort('molBowlLosses')}>Mol Bowls <SortIcon col="molBowlLosses" /></th>
                  <th style={hStyle('center')}></th>
                </tr>
              </thead>
              <tbody>
                {managerStats.map((m, i) => (
                  <>
                    <tr key={m.slug} onClick={() => toggleExpand(m.slug)} style={{ background: i % 2 === 0 ? 'transparent' : rowAlt, cursor: 'pointer' }}>
                      <td style={{ ...cStyle('left', true), fontFamily: "'Playfair Display', serif", fontSize: '16px' }}>
                        {m.name}
                        {!m.active && <span style={{ fontSize: '10px', color: muted, marginLeft: '8px', letterSpacing: '0.1em' }}>retired</span>}
                      </td>
                      <td style={cStyle()}>{m.wins}</td>
                      <td style={cStyle()}>{m.losses}</td>
                      <td style={cStyle()}>{m.winPct}%</td>
                      <td style={cStyle()}>{m.pf.toFixed(0)}</td>
                      <td style={cStyle()}>{m.pa.toFixed(0)}</td>
                      <td style={{ ...cStyle(), color: m.diff >= 0 ? green : red, fontWeight: '500' }}>
                        {m.diff >= 0 ? '+' : ''}{m.diff.toFixed(0)}
                      </td>
                      <td style={{ ...cStyle(), color: m.ppgDiff >= 0 ? green : red, fontWeight: '500' }}>
                        {m.ppgDiff >= 0 ? '+' : ''}{m.ppgDiff}
                      </td>
                      <td style={{ ...cStyle(), color: m.championships > 0 ? gold : text }}>
                        {m.championships > 0 ? m.championships : '—'}
                      </td>
                      <td style={cStyle()}>{m.playoffAppearances}</td>
                      <td style={{ ...cStyle(), color: m.molBowlLosses > 0 ? red : text }}>
                        {m.molBowlLosses > 0 ? m.molBowlLosses : '—'}
                      </td>
                      <td style={{ ...cStyle('center'), color: muted, fontSize: '11px' }}>
                        {expanded[m.slug] ? '▲' : '▼'}
                      </td>
                    </tr>
                    {expanded[m.slug] && (
                      <tr key={`${m.slug}-exp`}>
                        <td colSpan={12} style={{ padding: 0, borderBottom: `1px solid ${border}` }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', background: statsBg }}>
                            <thead>
                              <tr>
                                <th style={hStyle('left')}>Year</th>
                                <th style={hStyle('left')}>Team</th>
                                <th style={hStyle()}>W</th>
                                <th style={hStyle()}>L</th>
                                <th style={hStyle()}>PF</th>
                                <th style={hStyle()}>PA</th>
                                <th style={hStyle()}>Diff</th>
                                <th style={hStyle()}>PPG Diff</th>
                                <th style={hStyle()}>Playoffs</th>
                                <th style={hStyle()}>Title</th>
                                <th style={hStyle()}>Mol Bowl</th>
                                <th style={hStyle()}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.seasonBreakdown.map(s => (
                                <tr key={s.year}>
                                  <td style={scStyle('left')}>{s.year}</td>
                                  <td style={{ ...scStyle('left'), fontFamily: "'Playfair Display', serif", fontSize: '13px', color: text }}>{s.team_name}</td>
                                  <td style={scStyle()}>{s.wins}</td>
                                  <td style={scStyle()}>{s.losses}</td>
                                  <td style={scStyle()}>{s.pf.toFixed(2)}</td>
                                  <td style={scStyle()}>{s.pa.toFixed(2)}</td>
                                  <td style={{ ...scStyle(), color: s.diff >= 0 ? green : red }}>{s.diff >= 0 ? '+' : ''}{s.diff}</td>
                                  <td style={{ ...scStyle(), color: s.ppg_diff >= 0 ? green : red }}>{s.ppg_diff >= 0 ? '+' : ''}{s.ppg_diff}</td>
                                  <td style={{ ...scStyle(), color: s.made_playoffs ? green : muted }}>{s.made_playoffs ? 'Yes' : 'No'}</td>
                                  <td style={{ ...scStyle(), color: s.champion ? gold : muted }}>{s.champion ? 'Champion' : '—'}</td>
                                  <td style={{ ...scStyle(), color: s.mol_bowl_loss ? red : muted }}>{s.mol_bowl_loss ? 'Loser' : '—'}</td>
                                  <td style={scStyle()}></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
