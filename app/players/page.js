'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'D/ST']

export default function PlayersPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, rowAlt, highlight, gold } = useLayout()
  const router = useRouter()
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('All')
  const [sortCol, setSortCol] = useState('totalFpts')
  const [sortDir, setSortDir] = useState('desc')
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const fetchPlayers = async () => {
      // Fetch all players
      const { data: playerData } = await supabase
        .from('players')
        .select('id, name, position, sleeper_id')
        .limit(1000)

      if (!playerData) { setLoading(false); return }

      // Fetch ALL roster entries in batches of 1000
      let allEntries = []
      let from = 0
      while (true) {
        const { data: batch } = await supabase
          .from('roster_entries')
          .select('player_id, fpts, avg_pts, team_id')
          .range(from, from + 999)
        if (!batch || batch.length === 0) break
        allEntries = [...allEntries, ...batch]
        if (batch.length < 1000) break
        from += 1000
      }
      const entries = allEntries

      // Fetch all teams with their season years
      const { data: teams } = await supabase
        .from('teams')
        .select('id, season:season_id(year)')
        .limit(1000)

      if (!entries.length || !teams) { setLoading(false); return }

      // Build team -> year lookup
      const teamYearMap = {}
      for (const t of teams) {
        teamYearMap[t.id] = t.season?.year
      }

      // Aggregate per player
      const agg = {}
      for (const e of entries) {
        const pid = e.player_id
        if (!pid) continue
        const year = teamYearMap[e.team_id]
        if (!agg[pid]) {
          agg[pid] = { totalFpts: 0, years: new Set(), totalAvg: 0, entryCount: 0 }
        }
        agg[pid].totalFpts += e.fpts || 0
        agg[pid].totalAvg += e.avg_pts || 0
        agg[pid].entryCount++
        if (year) agg[pid].years.add(year)
      }

      const result = playerData
        .filter(p => agg[p.id])
        .map(p => {
          const a = agg[p.id]
          return {
            id: p.id,
            name: p.name,
            position: p.position,
            sleeper_id: p.sleeper_id,
            totalFpts: parseFloat(a.totalFpts.toFixed(1)),
            seasons: a.years.size,
            careerAvg: a.entryCount > 0
              ? parseFloat((a.totalAvg / a.entryCount).toFixed(1))
              : 0,
          }
        })

      setPlayers(result)
      setLoading(false)
    }
    fetchPlayers()
  }, [])

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  if (!mounted) return null

  const filtered = players.filter(p => {
    const matchPos = posFilter === 'All' || p.position === posFilter
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    return matchPos && matchSearch
  })

  const displayData = [...filtered].sort((a, b) => {
    let av = a[sortCol], bv = b[sortCol]
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const posColor = pos => {
    const map = { QB: '#4285F4', RB: '#34A853', WR: '#FBBC04', TE: '#EA4335', K: '#46BDC6', 'D/ST': '#7BAAF7' }
    return map[pos] || muted
  }

  const cStyle = (align = 'left') => ({
    padding: effectiveMobile ? '10px' : '13px 14px',
    fontSize: effectiveMobile ? '12px' : '13px',
    textAlign: align,
    borderBottom: `1px solid ${border}`,
    color: text,
    whiteSpace: 'nowrap',
  })

  const SortHeader = ({ col, label, align = 'right' }) => {
    const active = sortCol === col
    const arrow = active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''
    return (
      <th
        onClick={() => handleSort(col)}
        style={{
          padding: effectiveMobile ? '8px 10px' : '10px 14px',
          fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase',
          color: active ? text : muted, textAlign: align,
          borderBottom: `1px solid ${border}`, fontWeight: active ? '700' : '500',
          whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
          background: active ? (d ? 'rgba(255,255,255,0.04)' : 'rgba(13,33,82,0.04)') : 'transparent',
        }}
      >
        {label}{arrow}
      </th>
    )
  }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>

        <div style={{ marginBottom: '40px' }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px, 6vw, 72px)', fontWeight: '400', letterSpacing: '-0.02em', marginBottom: '8px' }}>
            Players
          </h1>
          <p style={{ color: muted, fontSize: '13px' }}>
            {players.length} players across all seasons · click column headers to sort
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search players..."
            style={{
              background: cardBg, border: `1px solid ${border}`, color: text,
              padding: '9px 14px', fontSize: '13px', fontFamily: "'Inter', sans-serif",
              outline: 'none', width: effectiveMobile ? '100%' : '220px',
            }}
          />
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {POSITIONS.map(pos => (
              <button
                key={pos}
                onClick={() => setPosFilter(pos)}
                style={{
                  background: posFilter === pos ? text : 'none',
                  border: `1px solid ${posFilter === pos ? text : border}`,
                  color: posFilter === pos ? bg : muted,
                  padding: '6px 12px', cursor: 'pointer', fontSize: '10px',
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  fontFamily: "'Inter', sans-serif", fontWeight: '500',
                }}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p style={{ color: muted }}>Loading players...</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
              <thead>
                <tr style={{ background: cardBg }}>
                  <th style={{ padding: effectiveMobile ? '8px 10px' : '10px 14px', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, textAlign: 'center', borderBottom: `1px solid ${border}`, fontWeight: '500', whiteSpace: 'nowrap' }}>#</th>
                  <SortHeader col="name" label="Player" align="left" />
                  <SortHeader col="position" label="Pos" align="center" />
                  {!effectiveMobile && <SortHeader col="seasons" label="Seasons" />}
                  <SortHeader col="totalFpts" label="Career FPTS" />
                  <SortHeader col="careerAvg" label="Avg PPG" />
                </tr>
              </thead>
              <tbody>
                {displayData.map((p, i) => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/players/${p.id}`)}
                    style={{ background: i % 2 === 0 ? 'transparent' : rowAlt, cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = highlight}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : rowAlt}
                  >
                    <td style={{ ...cStyle('center'), color: muted, fontSize: '11px' }}>{i + 1}</td>
                    <td style={{ ...cStyle(), fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '13px' : '15px' }}>{p.name}</td>
                    <td style={cStyle('center')}>
                      <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', color: posColor(p.position), background: posColor(p.position) + '18', padding: '2px 7px' }}>
                        {p.position}
                      </span>
                    </td>
                    {!effectiveMobile && <td style={{ ...cStyle('right'), color: muted }}>{p.seasons}</td>}
                    <td style={cStyle('right')}>{p.totalFpts.toLocaleString()}</td>
                    <td style={{ ...cStyle('right'), fontWeight: '600', color: p.careerAvg >= 15 ? gold : p.careerAvg >= 10 ? text : muted }}>
                      {p.careerAvg}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {displayData.length === 0 && (
              <p style={{ color: muted, padding: '24px 0', textAlign: 'center' }}>No players found.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
