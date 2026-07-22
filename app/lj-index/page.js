'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)
const MANAGER_COLORS = {}
export default function LJIndexPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, rowAlt, green, red } = useLayout()
  const [seasons, setSeasons] = useState([])
  const [selectedYear, setSelectedYear] = useState(2025)
  const [matchups, setMatchups] = useState([])
  const [teams, setTeams] = useState([])
  const [managers, setManagers] = useState([])
  const [tooltip, setTooltip] = useState(null)
  const [ljView, setLjView] = useState('season')
  const [allTimeYearFrom, setAllTimeYearFrom] = useState('all')
  const [allTimeYearTo, setAllTimeYearTo] = useState('all')
  const [allMatchups, setAllMatchups] = useState([])
  const [allTeams, setAllTeams] = useState([])
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    supabase.from('seasons').select('year, season_number').order('year', { ascending: false }).then(({ data }) => setSeasons(data || []))
    supabase.from('managers').select('*').then(({ data }) => setManagers(data || []))
    supabase.from('matchups')
      .select('*, home_team:home_team_id(id, manager_id, team_name), away_team:away_team_id(id, manager_id, team_name), season:season_id(year)')
      .limit(10000)
      .then(({ data }) => setAllMatchups(data || []))
    supabase.from('teams')
      .select('*, manager:manager_id(name, slug, id), season:season_id(year)')
      .then(({ data }) => setAllTeams(data || []))
  }, [])
  useEffect(() => {
    setMatchups([]); setTeams([])
    supabase.from('matchups')
      .select('*, home_team:home_team_id(id, manager_id, team_name), away_team:away_team_id(id, manager_id, team_name), season:season_id(year)')
      .then(({ data }) => setMatchups((data || []).filter(m => m.season?.year === selectedYear && !m.is_playoff)))
    supabase.from('teams')
      .select('*, manager:manager_id(name, slug, id), season:season_id(year)')
      .then(({ data }) => setTeams((data || []).filter(t => t.season?.year === selectedYear)))
  }, [selectedYear])
  const computeData = () => {
    if (matchups.length === 0 || teams.length === 0) return []
    const weeks = [...new Set(matchups.map(m => m.week))].sort((a, b) => a - b)
    const allPlaySum = {}
    teams.forEach(t => { allPlaySum[t.id] = 0 })
    weeks.forEach(week => {
      const weekGames = matchups.filter(m => m.week === week)
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
    const teamScores = {}
    teams.forEach(t => { teamScores[t.id] = [] })
    matchups.forEach(m => {
      if (teamScores[m.home_team?.id] !== undefined) teamScores[m.home_team.id].push(m.home_score)
      if (teamScores[m.away_team?.id] !== undefined) teamScores[m.away_team.id].push(m.away_score)
    })
    const teamData = teams.map(t => {
      const scores = teamScores[t.id] || []
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
      const medianScore = median(scores)
      const winPct = (t.wins + t.losses) > 0 ? t.wins / (t.wins + t.losses) : 0
      const allPlayWinPct = weeks.length > 0 ? allPlaySum[t.id] / weeks.length : 0
      const expectedWins = allPlaySum[t.id]
      const luck = t.wins - expectedWins
      const powerRaw = winPct * 2 + avgScore * 4 + allPlayWinPct * 2 + medianScore * 2
      return { t, winPct, allPlayWinPct, avgScore, medianScore, expectedWins, luck, powerRaw }
    })
    const avgAllPlay = teamData.reduce((s, r) => s + r.allPlayWinPct, 0) / teamData.length
    const avgLuck = teamData.reduce((s, r) => s + r.luck, 0) / teamData.length
    const maxPower = Math.max(...teamData.map(r => r.powerRaw))
    const minPower = Math.min(...teamData.map(r => r.powerRaw))
    return teamData.map(r => ({
      managerId: r.t.manager?.id,
      managerName: r.t.manager?.name,
      managerSlug: r.t.manager?.slug,
      teamName: r.t.team_name,
      wins: r.t.wins, losses: r.t.losses,
      x: parseFloat(((r.allPlayWinPct - avgAllPlay) * 100).toFixed(1)),
      y: parseFloat(((r.luck - avgLuck) / Math.max(r.t.wins + r.t.losses, 1) * 100).toFixed(1)),
      luckRaw: parseFloat(r.luck.toFixed(2)),
      allPlayWinPct: parseFloat((r.allPlayWinPct * 100).toFixed(1)),
      powerNorm: maxPower === minPower ? 0.5 : (r.powerRaw - minPower) / (maxPower - minPower),
      winPct: parseFloat((r.winPct * 100).toFixed(1)),
      avgScore: parseFloat(r.avgScore.toFixed(1)),
    }))
  }
  const plotData = useMemo(() => computeData(), [matchups, teams])
  // allTimeData declared BEFORE activeData to avoid initialization error
  const allTimeData = useMemo(() => {
    if (managers.length === 0 || allMatchups.length === 0) return []
    const activeM = managers.filter(m => m.active)
    const allSeasons = [...new Set(allMatchups.map(m => m.season?.year))].filter(Boolean)
    const filteredSeasons = allSeasons.filter(yr => {
      if (allTimeYearFrom !== 'all' && yr < parseInt(allTimeYearFrom)) return false
      if (allTimeYearTo !== 'all' && yr > parseInt(allTimeYearTo)) return false
      return true
    })
    const result = {}
    activeM.forEach(m => { result[m.id] = { wins: 0, losses: 0, allPlaySum: 0, weekCount: 0, pf: 0, scores: [], managerName: m.name, managerSlug: m.slug } })
    filteredSeasons.forEach(yr => {
      const yearMatchups = allMatchups.filter(m => m.season?.year === yr && !m.is_playoff)
      const weeks = [...new Set(yearMatchups.map(m => m.week))].sort((a, b) => a - b)
      yearMatchups.forEach(m => {
        if (result[m.home_team?.manager_id]) {
          result[m.home_team.manager_id].scores.push(m.home_score)
          result[m.home_team.manager_id].pf += m.home_score
          if (m.home_score > m.away_score) result[m.home_team.manager_id].wins++
          else if (m.home_score < m.away_score) result[m.home_team.manager_id].losses++
        }
        if (result[m.away_team?.manager_id]) {
          result[m.away_team.manager_id].scores.push(m.away_score)
          result[m.away_team.manager_id].pf += m.away_score
          if (m.away_score > m.home_score) result[m.away_team.manager_id].wins++
          else if (m.away_score < m.home_score) result[m.away_team.manager_id].losses++
        }
      })
      weeks.forEach(week => {
        const weekGames = yearMatchups.filter(m => m.week === week)
        const allScores = []
        weekGames.forEach(m => {
          allScores.push({ managerId: m.home_team?.manager_id, score: m.home_score })
          allScores.push({ managerId: m.away_team?.manager_id, score: m.away_score })
        })
        const n = allScores.length
        if (n < 2) return
        allScores.forEach(({ managerId, score }) => {
          if (!result[managerId]) return
          result[managerId].allPlaySum += allScores.filter(o => o.managerId !== managerId && score > o.score).length / (n - 1)
          result[managerId].weekCount++
        })
      })
    })
    const rows = Object.entries(result).map(([id, r]) => {
      const games = r.wins + r.losses
      const allPlayWinPct = r.weekCount > 0 ? r.allPlaySum / r.weekCount : 0
      const luck = parseFloat((r.wins - r.allPlaySum).toFixed(2))
      const avgScore = games > 0 ? parseFloat((r.pf / games).toFixed(1)) : 0
      return { managerId: id, managerName: r.managerName, managerSlug: r.managerSlug, wins: r.wins, losses: r.losses, allPlayWinPct: parseFloat((allPlayWinPct * 100).toFixed(1)), luckRaw: luck, avgScore, winPct: games > 0 ? parseFloat(((r.wins / games) * 100).toFixed(1)) : 0 }
    }).filter(r => r.wins + r.losses > 0)
    const avgAp = rows.reduce((s, r) => s + r.allPlayWinPct, 0) / rows.length
    const avgLuck = rows.reduce((s, r) => s + r.luckRaw, 0) / rows.length
    const maxPf = Math.max(...rows.map(r => r.avgScore))
    const minPf = Math.min(...rows.map(r => r.avgScore))
    return rows.map(r => ({
      ...r,
      x: parseFloat((r.allPlayWinPct - avgAp).toFixed(1)),
      y: parseFloat(((r.luckRaw - avgLuck) / Math.max(r.wins + r.losses, 1) * 100).toFixed(1)),
      powerNorm: maxPf === minPf ? 0.5 : (r.avgScore - minPf) / (maxPf - minPf),
    }))
  }, [managers, allMatchups, allTimeYearFrom, allTimeYearTo])
  // activeData declared AFTER allTimeData
  const activeData = ljView === 'season' ? plotData : allTimeData
  const W = effectiveMobile ? 340 : 680
  const H = effectiveMobile ? 280 : 480
  const PAD = { top: 30, right: 20, bottom: 50, left: effectiveMobile ? 45 : 65 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom
  const xVals = activeData.map(r => r.x)
  const yVals = activeData.map(r => r.y)
  const xAbsMax = xVals.length > 0 ? Math.max(...xVals.map(Math.abs)) : 20
  const yAbsMax = yVals.length > 0 ? Math.max(...yVals.map(Math.abs)) : 20
  const xPad = Math.max(5, xAbsMax * 0.35)
  const yPad = Math.max(5, yAbsMax * 0.35)
  const xMax = xAbsMax + xPad
  const yMax = yAbsMax + yPad
  const toSvgX = (x) => PAD.left + ((x + xMax) / (2 * xMax)) * chartW
  const toSvgY = (y) => PAD.top + ((yMax - y) / (2 * yMax)) * chartH
  const minBubble = effectiveMobile ? 7 : 10
  const maxBubble = effectiveMobile ? 16 : 22
  const gridStep = xMax <= 15 ? 5 : xMax <= 30 ? 10 : 25
  const gridLines = []
  for (let v = -Math.ceil(Math.max(xMax, yMax) / gridStep) * gridStep; v <= Math.ceil(Math.max(xMax, yMax) / gridStep) * gridStep; v += gridStep) {
    gridLines.push(v)
  }
  const axisColor = d ? 'rgba(255,255,255,0.2)' : 'rgba(13,33,82,0.25)'
  const gridColor = d ? 'rgba(255,255,255,0.06)' : 'rgba(13,33,82,0.08)'
  const quadrants = [
    { x: PAD.left + chartW * 0.75, y: PAD.top + chartH * 0.12, label: 'Good & Lucky', color: d ? 'rgba(110,231,183,0.5)' : 'rgba(13,110,63,0.45)' },
    { x: PAD.left + chartW * 0.2, y: PAD.top + chartH * 0.12, label: 'Lucky, Not Good', color: d ? 'rgba(147,197,253,0.5)' : 'rgba(30,58,138,0.4)' },
    { x: PAD.left + chartW * 0.75, y: PAD.top + chartH * 0.88, label: 'Good, Unlucky', color: d ? 'rgba(252,211,77,0.5)' : 'rgba(146,64,14,0.5)' },
    { x: PAD.left + chartW * 0.2, y: PAD.top + chartH * 0.88, label: 'Bad & Unlucky', color: d ? 'rgba(248,113,113,0.5)' : 'rgba(155,28,28,0.5)' },
  ]
  const hStyle = (align = 'left') => ({ padding: '10px 12px', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, textAlign: align, borderBottom: `1px solid ${border}`, fontWeight: '500', whiteSpace: 'nowrap' })
  const cStyle = (align = 'left') => ({ padding: '12px', fontSize: '12px', textAlign: align, borderBottom: `1px solid ${border}`, color: text, whiteSpace: 'nowrap' })
  if (!mounted) return null
  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '20px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px, 6vw, 72px)', fontWeight: '400', letterSpacing: '-0.02em' }}>LJ Index</h1>
          <div style={{ paddingBottom: '8px' }}>
            <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} style={{ background: cardBg, color: text, border: `1px solid ${border}`, padding: '10px 16px', fontSize: '14px', fontFamily: "'Playfair Display', serif", cursor: 'pointer', outline: 'none' }}>
              {seasons.map(s => <option key={s.year} value={s.year}>{s.year} — Year {s.season_number}</option>)}
            </select>
          </div>
        </div>
        <p style={{ color: muted, fontSize: '12px', letterSpacing: '0.06em', marginBottom: '20px', maxWidth: '560px' }}>
          All-Play Win% vs Luck · bubble size = power score · axes centered at league average
        </p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {['season', 'alltime'].map(v => (
            <button key={v} onClick={() => setLjView(v)} style={{
              background: ljView === v ? text : 'none', border: `1px solid ${border}`,
              color: ljView === v ? bg : muted, padding: effectiveMobile ? '6px 10px' : '7px 16px',
              cursor: 'pointer', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase',
              fontFamily: "'Inter', sans-serif", fontWeight: '500',
            }}>{v === 'season' ? 'Single Season' : 'All-Time'}</button>
          ))}
        </div>
        {ljView === 'alltime' && (
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <select value={allTimeYearFrom} onChange={e => setAllTimeYearFrom(e.target.value)} style={{ background: cardBg, border: `1px solid ${border}`, color: text, padding: '8px 14px', fontSize: '13px', fontFamily: "'Playfair Display', serif", cursor: 'pointer', outline: 'none' }}>
              <option value="all">From Year</option>
              {seasons.map(s => <option key={s.year} value={s.year}>{s.year}</option>)}
            </select>
            <select value={allTimeYearTo} onChange={e => setAllTimeYearTo(e.target.value)} style={{ background: cardBg, border: `1px solid ${border}`, color: text, padding: '8px 14px', fontSize: '13px', fontFamily: "'Playfair Display', serif", cursor: 'pointer', outline: 'none' }}>
              <option value="all">To Year</option>
              {seasons.map(s => <option key={s.year} value={s.year}>{s.year}</option>)}
            </select>
          </div>
        )}
        {activeData.length > 0 ? (
          <div style={{ marginBottom: '40px', overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: `${W}px`, height: 'auto', display: 'block', overflow: 'visible' }}>
              <rect x={toSvgX(0)} y={PAD.top} width={chartW - (toSvgX(0) - PAD.left)} height={chartH / 2} fill={d ? 'rgba(110,231,183,0.04)' : 'rgba(13,110,63,0.03)'} />
              <rect x={PAD.left} y={PAD.top} width={toSvgX(0) - PAD.left} height={chartH / 2} fill={d ? 'rgba(147,197,253,0.04)' : 'rgba(30,58,138,0.03)'} />
              <rect x={toSvgX(0)} y={toSvgY(0)} width={chartW - (toSvgX(0) - PAD.left)} height={chartH / 2} fill={d ? 'rgba(252,211,77,0.04)' : 'rgba(146,64,14,0.03)'} />
              <rect x={PAD.left} y={toSvgY(0)} width={toSvgX(0) - PAD.left} height={chartH / 2} fill={d ? 'rgba(248,113,113,0.04)' : 'rgba(155,28,28,0.03)'} />
              {gridLines.map(v => (
                <g key={v}>
                  <line x1={toSvgX(v)} y1={PAD.top} x2={toSvgX(v)} y2={PAD.top + chartH} stroke={v === 0 ? axisColor : gridColor} strokeWidth={v === 0 ? 1.5 : 1} />
                  <line x1={PAD.left} y1={toSvgY(v)} x2={PAD.left + chartW} y2={toSvgY(v)} stroke={v === 0 ? axisColor : gridColor} strokeWidth={v === 0 ? 1.5 : 1} />
                  <text x={toSvgX(v)} y={PAD.top + chartH + 16} textAnchor="middle" fontSize={effectiveMobile ? '9' : '11'} fill={muted} fontFamily="Inter, sans-serif">{v}%</text>
                  <text x={PAD.left - 6} y={toSvgY(v) + 4} textAnchor="end" fontSize={effectiveMobile ? '9' : '11'} fill={muted} fontFamily="Inter, sans-serif">{v}%</text>
                </g>
              ))}
              <text x={PAD.left + chartW / 2} y={H - 4} textAnchor="middle" fontSize={effectiveMobile ? '9' : '11'} fill={muted} fontFamily="Inter, sans-serif" letterSpacing="1.5">ALL-PLAY WIN %</text>
              <text x={10} y={PAD.top + chartH / 2} textAnchor="middle" fontSize={effectiveMobile ? '9' : '11'} fill={muted} fontFamily="Inter, sans-serif" letterSpacing="1.5" transform={`rotate(-90, 10, ${PAD.top + chartH / 2})`}>LUCK</text>
              {!effectiveMobile && quadrants.map((q, i) => (
                <text key={i} x={q.x} y={q.y} textAnchor="middle" fontSize="9" fill={q.color} fontFamily="Inter, sans-serif" letterSpacing="1.2" fontWeight="500">{q.label.toUpperCase()}</text>
              ))}
              {activeData.map((r, i) => {
                const cx = toSvgX(r.x)
                const cy = toSvgY(r.y)
                const radius = minBubble + r.powerNorm * (maxBubble - minBubble)
                const color = MANAGER_COLORS[r.managerSlug] || '#888'
                return (
                  <g key={r.managerId || i} style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setTooltip({ r, cx, cy })}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <circle cx={cx} cy={cy} r={radius} fill={color} fillOpacity={0.85} stroke={d ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)'} strokeWidth={1.5} />
                    {radius > 16 && (
                      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={effectiveMobile ? '8' : '9'} fill="white" fontFamily="Inter, sans-serif" fontWeight="600" style={{ pointerEvents: 'none' }}>
                        {r.managerName?.split('/')[0]?.split(' ')[0]}
                      </text>
                    )}
                  </g>
                )
              })}
              {tooltip && (() => {
                const { r, cx, cy } = tooltip
                const tw = 175, th = 105
                let tx = cx + 12, ty = cy - th / 2
                if (tx + tw > W) tx = cx - tw - 12
                if (ty < 0) ty = 4
                if (ty + th > H) ty = H - th - 4
                return (
                  <g>
                    <rect x={tx} y={ty} width={tw} height={th} rx={3} fill={d ? '#111' : '#fff'} stroke={border} strokeWidth={1} />
                    <text x={tx + 10} y={ty + 18} fontSize="13" fontFamily="Playfair Display, serif" fill={text}>{r.managerName}</text>
                    {r.teamName && <text x={tx + 10} y={ty + 32} fontSize="10" fontFamily="Inter, sans-serif" fill={muted}>{r.teamName}</text>}
                    <text x={tx + 10} y={ty + 50} fontSize="11" fontFamily="Inter, sans-serif" fill={text}>Record: {r.wins}-{r.losses} ({r.winPct}%)</text>
                    <text x={tx + 10} y={ty + 65} fontSize="11" fontFamily="Inter, sans-serif" fill={text}>All-Play Win%: {r.allPlayWinPct}%</text>
                    <text x={tx + 10} y={ty + 80} fontSize="11" fontFamily="Inter, sans-serif" fill={text}>Luck: {r.luckRaw > 0 ? '+' : ''}{r.luckRaw} wins</text>
                    <text x={tx + 10} y={ty + 95} fontSize="11" fontFamily="Inter, sans-serif" fill={text}>Avg PPG: {r.avgScore}</text>
                  </g>
                )
              })()}
            </svg>
          </div>
        ) : (
          <p style={{ color: muted, fontSize: '14px', marginBottom: '40px' }}>Loading data...</p>
        )}
        {activeData.length > 0 && (
          <div style={{ marginBottom: '40px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {activeData.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: MANAGER_COLORS[r.managerSlug] || '#888', flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', color: muted }}>{r.managerName}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {activeData.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
              <thead>
                <tr style={{ background: cardBg }}>
                  {['Manager', 'Team', 'Record', 'Win %', 'All-Play Win %', 'Luck', 'Avg PPG'].map((h, i) => (
                    <th key={h} style={hStyle(i <= 1 ? 'left' : 'right')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...activeData].sort((a, b) => b.allPlayWinPct - a.allPlayWinPct).map((r, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : rowAlt }}>
                    <td style={{ ...cStyle('left'), fontFamily: "'Playfair Display', serif" }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: MANAGER_COLORS[r.managerSlug] || '#888', flexShrink: 0 }} />
                        {r.managerName}
                      </div>
                    </td>
                    <td style={{ ...cStyle('left'), color: muted, fontSize: '11px' }}>{r.teamName}</td>
                    <td style={cStyle('right')}>{r.wins}-{r.losses}</td>
                    <td style={cStyle('right')}>{r.winPct}%</td>
                    <td style={cStyle('right')}>{r.allPlayWinPct}%</td>
                    <td style={{ ...cStyle('right'), color: r.luckRaw > 0 ? green : r.luckRaw < 0 ? red : text, fontWeight: '500' }}>
                      {r.luckRaw > 0 ? '+' : ''}{r.luckRaw}
                    </td>
                    <td style={cStyle('right')}>{r.avgScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
