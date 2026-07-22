'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function ChampionsPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, rowAlt, gold, red } = useLayout()

  const [seasons, setSeasons] = useState([])
  const [managers, setManagers] = useState([])
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    supabase.from('seasons')
      .select('*, champion:champion_id(id, name, slug), mol_bowl_winner:mol_bowl_winner_id(id, name), mol_bowl_loser:mol_bowl_loser_id(id, name)')
      .order('year', { ascending: false })
      .then(({ data }) => setSeasons(data || []))
    supabase.from('managers').select('*').then(({ data }) => setManagers(data || []))
  }, [])

  const filteredSeasons = seasons.filter(s =>
    !searchText ||
    s.champion?.name?.toLowerCase().includes(searchText.toLowerCase()) ||
    s.mol_bowl_loser?.name?.toLowerCase().includes(searchText.toLowerCase())
  )

  // Championship counts per manager
  const champCounts = managers.map(m => ({
    ...m,
    count: seasons.filter(s => s.champion?.id === m.id).length,
    molBowls: seasons.filter(s => s.mol_bowl_loser?.id === m.id).length,
  })).filter(m => m.count > 0).sort((a, b) => b.count - a.count)

  const hStyle = (align = 'left') => ({
    padding: effectiveMobile ? '8px 10px' : '10px 14px',
    fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase',
    color: muted, textAlign: align, borderBottom: `1px solid ${border}`,
    fontWeight: '500', whiteSpace: 'nowrap',
  })

  const cStyle = (align = 'left') => ({
    padding: effectiveMobile ? '12px 10px' : '16px 14px',
    fontSize: effectiveMobile ? '12px' : '13px', textAlign: align,
    borderBottom: `1px solid ${border}`, color: text, whiteSpace: 'nowrap',
  })

  const inputStyle = {
    background: cardBg, border: `1px solid ${border}`, color: text,
    padding: '7px 12px', fontSize: '12px', fontFamily: "'Inter', sans-serif",
    outline: 'none', width: effectiveMobile ? '100%' : '220px',
  }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>

        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px, 6vw, 72px)', fontWeight: '400', marginBottom: '8px', letterSpacing: '-0.02em' }}>
          Hall of Champions
        </h1>
        <p style={{ color: muted, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '40px' }}>
          {seasons.length} seasons · {seasons.filter(s => s.champion).length} crowned
        </p>

        {/* Championship counts */}
        <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1px', background: border, marginBottom: '60px' }}>
          {champCounts.map(m => (
            <div key={m.id} style={{ background: cardBg, padding: effectiveMobile ? '16px' : '24px 20px' }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '16px' : '20px', color: text, marginBottom: '6px' }}>{m.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: effectiveMobile ? '28px' : '36px', fontFamily: "'Playfair Display', serif", color: gold, lineHeight: 1 }}>{m.count}</span>
                <span style={{ fontSize: '11px', color: muted }}>title{m.count !== 1 ? 's' : ''}</span>
              </div>
              {m.molBowls > 0 && (
                <div style={{ fontSize: '11px', color: red, marginTop: '4px' }}>{m.molBowls} Sacko{m.molBowls !== 1 ? 's' : ''}</div>
              )}
            </div>
          ))}
        </div>

        {/* Filter */}
        <div style={{ marginBottom: '24px' }}>
          <input
            placeholder="Search manager..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Year by year table */}
        {effectiveMobile ? (
          <div>
            {filteredSeasons.map((s, i) => (
              <div key={s.year} style={{ background: i % 2 === 0 ? 'transparent' : cardBg, padding: '14px 4px', borderBottom: `1px solid ${border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: muted, letterSpacing: '0.1em', marginRight: '8px' }}>Year {s.season_number}</span>
                    <span style={{ fontSize: '13px', color: muted }}>{s.year}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '15px', color: s.champion ? text : muted }}>
                      {s.champion?.name || '—'}
                      {s.champion && <span style={{ marginLeft: '6px' }}>🏆</span>}
                    </div>
                    {s.mol_bowl_loser && (
                      <div style={{ fontSize: '11px', color: red, marginTop: '2px' }}>
                        Sacko: {s.mol_bowl_loser.name}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
              <thead>
                <tr style={{ background: cardBg }}>
                  <th style={hStyle('center')}>Year</th>
                  <th style={hStyle('center')}>Season</th>
                  <th style={hStyle()}>Champion</th>
                  <th style={hStyle()}>Sacko</th>
                </tr>
              </thead>
              <tbody>
                {filteredSeasons.map((s, i) => (
                  <tr key={s.year} style={{ background: i % 2 === 0 ? 'transparent' : rowAlt }}>
                    <td style={{ ...cStyle('center'), color: muted }}>{s.year}</td>
                    <td style={{ ...cStyle('center'), color: muted }}>Year {s.season_number}</td>
                    <td style={{ ...cStyle(), fontFamily: "'Playfair Display', serif", fontSize: '16px' }}>
                      {s.champion?.name
                        ? <><span style={{ color: gold, marginRight: '8px' }}>🏆</span>{s.champion.name}</>
                        : <span style={{ color: muted }}>—</span>
                      }
                    </td>
                    <td style={{ ...cStyle(), color: s.mol_bowl_loser ? red : muted, fontSize: '13px' }}>
                      {s.mol_bowl_loser?.name || '—'}
                    </td>
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
