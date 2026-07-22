'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function H2HPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, rowAlt, green, red } = useLayout()

  const [managers, setManagers] = useState([])
  const [matchups, setMatchups] = useState([])
  const [selected, setSelected] = useState(null)
  const [includePlayoffs, setIncludePlayoffs] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [modal, setModal] = useState(null) // { managerA, managerB }

  useEffect(() => {
    supabase.from('managers').select('*').then(({ data }) => setManagers(data || []))
    supabase.from('matchups').select('*, home_team:home_team_id(id, manager_id), away_team:away_team_id(id, manager_id), season:season_id(year)').then(({ data }) => setMatchups(data || []))
  }, [])

  const displayManagers = managers
    .filter(m => !searchText || m.name.toLowerCase().includes(searchText.toLowerCase()))

  const filteredMatchups = matchups.filter(m => includePlayoffs ? true : !m.is_playoff)

  const getH2H = (managerA, managerB) => {
    const games = filteredMatchups.filter(m => {
      const homeId = m.home_team?.manager_id
      const awayId = m.away_team?.manager_id
      return (homeId === managerA && awayId === managerB) || (homeId === managerB && awayId === managerA)
    }).sort((a, b) => {
      if (b.season?.year !== a.season?.year) return b.season?.year - a.season?.year
      return b.week - a.week
    })
    let wins = 0, losses = 0, ties = 0, pf = 0, pa = 0
    games.forEach(m => {
      const iAmHome = m.home_team?.manager_id === managerA
      const myScore = iAmHome ? m.home_score : m.away_score
      const theirScore = iAmHome ? m.away_score : m.home_score
      pf += myScore; pa += theirScore
      if (myScore > theirScore) wins++
      else if (myScore < theirScore) losses++
      else ties++
    })
    return { wins, losses, ties, games, count: games.length, pf: parseFloat(pf.toFixed(2)), pa: parseFloat(pa.toFixed(2)) }
  }

  const getRecord = (managerAId) => {
    let wins = 0, losses = 0, ties = 0
    displayManagers.filter(m => m.id !== managerAId).forEach(opponent => {
      const h = getH2H(managerAId, opponent.id)
      wins += h.wins; losses += h.losses; ties += h.ties
    })
    return { wins, losses, ties }
  }

  const selectedManager = managers.find(m => m.id === selected)

  const matchupHistory = selected ? filteredMatchups.filter(m => {
    return m.home_team?.manager_id === selected || m.away_team?.manager_id === selected
  }).sort((a, b) => {
    if (b.season?.year !== a.season?.year) return b.season?.year - a.season?.year
    return b.week - a.week
  }) : []

  // Modal data
  const modalData = modal ? (() => {
    const h2h = getH2H(modal.managerA.id, modal.managerB.id)
    const avgPf = h2h.count > 0 ? parseFloat((h2h.pf / h2h.count).toFixed(2)) : 0
    const avgPa = h2h.count > 0 ? parseFloat((h2h.pa / h2h.count).toFixed(2)) : 0
    const biggestWin = h2h.games.reduce((best, m) => {
      const iAmHome = m.home_team?.manager_id === modal.managerA.id
      const myScore = iAmHome ? m.home_score : m.away_score
      const theirScore = iAmHome ? m.away_score : m.home_score
      const margin = myScore - theirScore
      return margin > (best?.margin ?? -Infinity) ? { margin, myScore, theirScore, year: m.season?.year, week: m.week } : best
    }, null)
    const biggestLoss = h2h.games.reduce((worst, m) => {
      const iAmHome = m.home_team?.manager_id === modal.managerA.id
      const myScore = iAmHome ? m.home_score : m.away_score
      const theirScore = iAmHome ? m.away_score : m.home_score
      const margin = myScore - theirScore
      return margin < (worst?.margin ?? Infinity) ? { margin, myScore, theirScore, year: m.season?.year, week: m.week } : worst
    }, null)
    return { ...h2h, avgPf, avgPa, biggestWin, biggestLoss }
  })() : null

  const toggleBtn = (active, label, onClick) => (
    <button onClick={onClick} style={{
      background: active ? text : 'none', border: `1px solid ${border}`,
      color: active ? bg : muted, padding: effectiveMobile ? '6px 10px' : '7px 18px',
      cursor: 'pointer', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase',
      fontFamily: "'Inter', sans-serif", fontWeight: '500', transition: 'all 0.15s',
    }}>{label}</button>
  )

  const inputStyle = {
    background: cardBg, border: `1px solid ${border}`, color: text,
    padding: '7px 12px', fontSize: '12px', fontFamily: "'Inter', sans-serif",
    outline: 'none', width: effectiveMobile ? '100%' : '200px',
  }

  const hStyle = (align = 'right') => ({
    padding: effectiveMobile ? '8px 8px' : '10px 14px',
    fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase',
    color: muted, textAlign: align, borderBottom: `1px solid ${border}`,
    fontWeight: '500', whiteSpace: 'nowrap',
  })

  const cStyle = (align = 'right') => ({
    padding: effectiveMobile ? '10px 8px' : '14px',
    fontSize: effectiveMobile ? '12px' : '13px', textAlign: align,
    borderBottom: `1px solid ${border}`, color: text, whiteSpace: 'nowrap',
  })

  // Modal component
  const MatchupModal = () => {
    if (!modal || !modalData) return null
    const { managerA, managerB } = modal
    return (
      <>
        {/* Backdrop */}
        <div
          onClick={() => setModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, backdropFilter: 'blur(4px)' }}
        />
        {/* Modal */}
        <div style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          zIndex: 201, background: d ? '#0a0a0a' : '#f4f1ec',
          border: `1px solid ${border}`, width: effectiveMobile ? '95vw' : '680px',
          maxHeight: '85vh', overflowY: 'auto',
        }}>
          {/* Header */}
          <div style={{ padding: effectiveMobile ? '20px 16px 16px' : '28px 32px 20px', borderBottom: `1px solid ${border}`, position: 'sticky', top: 0, background: d ? '#0a0a0a' : '#f4f1ec', zIndex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '20px' : '28px', fontWeight: '400', color: text, marginBottom: '4px' }}>
                  {managerA.name} vs {managerB.name}
                </h2>
                <p style={{ fontSize: '11px', color: muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {modalData.count} game{modalData.count !== 1 ? 's' : ''} · {includePlayoffs ? 'inc. playoffs' : 'regular season only'}
                </p>
              </div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '6px 12px', cursor: 'pointer', fontSize: '13px', fontFamily: "'Inter', sans-serif", flexShrink: 0, marginLeft: '12px' }}>✕</button>
            </div>
          </div>

          <div style={{ padding: effectiveMobile ? '16px' : '24px 32px' }}>
            {/* Summary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1px', background: border, marginBottom: '28px' }}>
              {[
                [managerA.name, `${modalData.wins}-${modalData.losses}${modalData.ties > 0 ? `-${modalData.ties}` : ''}`, modalData.wins > modalData.losses ? green : modalData.wins < modalData.losses ? red : text],
                [managerB.name, `${modalData.losses}-${modalData.wins}${modalData.ties > 0 ? `-${modalData.ties}` : ''}`, modalData.losses > modalData.wins ? green : modalData.losses < modalData.wins ? red : text],
                ['Avg Score (' + managerA.name.split(' ')[0] + ')', modalData.avgPf, text],
                ['Avg Score (' + managerB.name.split(' ')[0] + ')', modalData.avgPa, text],
                ['Total PF (' + managerA.name.split(' ')[0] + ')', modalData.pf, text],
                ['Total PF (' + managerB.name.split(' ')[0] + ')', modalData.pa, text],
              ].map(([label, val, color]) => (
                <div key={label} style={{ background: cardBg, padding: '14px 16px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '4px' }}>{label}</div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', color }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Notable games */}
            {modalData.biggestWin && modalData.biggestWin.margin > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? '1fr' : '1fr 1fr', gap: '1px', background: border, marginBottom: '28px' }}>
                <div style={{ background: cardBg, padding: '14px 16px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: green, marginBottom: '4px' }}>Biggest Win ({managerA.name.split(' ')[0]})</div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '16px', color: text }}>{modalData.biggestWin.myScore} – {modalData.biggestWin.theirScore}</div>
                  <div style={{ fontSize: '11px', color: muted, marginTop: '2px' }}>Week {modalData.biggestWin.week} · {modalData.biggestWin.year} · +{modalData.biggestWin.margin.toFixed(2)}</div>
                </div>
                {modalData.biggestLoss && modalData.biggestLoss.margin < 0 && (
                  <div style={{ background: cardBg, padding: '14px 16px' }}>
                    <div style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: red, marginBottom: '4px' }}>Biggest Loss ({managerA.name.split(' ')[0]})</div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '16px', color: text }}>{modalData.biggestLoss.myScore} – {modalData.biggestLoss.theirScore}</div>
                    <div style={{ fontSize: '11px', color: muted, marginTop: '2px' }}>Week {modalData.biggestLoss.week} · {modalData.biggestLoss.year} · {modalData.biggestLoss.margin.toFixed(2)}</div>
                  </div>
                )}
              </div>
            )}

            {/* Game log */}
            <p style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: muted, marginBottom: '12px' }}>Game Log</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
              <thead>
                <tr style={{ background: d ? '#111' : '#e8e4dc' }}>
                  <th style={hStyle('center')}>Year</th>
                  <th style={hStyle('center')}>Wk</th>
                  <th style={hStyle('right')}>{managerA.name.split(' ')[0]}</th>
                  <th style={hStyle('right')}>{managerB.name.split(' ')[0]}</th>
                  <th style={hStyle('center')}>Result</th>
                  <th style={hStyle('center')}>Type</th>
                </tr>
              </thead>
              <tbody>
                {modalData.games.map((m, i) => {
                  const iAmHome = m.home_team?.manager_id === managerA.id
                  const myScore = iAmHome ? m.home_score : m.away_score
                  const theirScore = iAmHome ? m.away_score : m.home_score
                  const win = myScore > theirScore
                  const tie = myScore === theirScore
                  return (
                    <tr key={m.id} style={{ background: i % 2 === 0 ? 'transparent' : (d ? '#080808' : '#e8e4dc') }}>
                      <td style={{ ...cStyle('center'), color: muted }}>{m.season?.year}</td>
                      <td style={{ ...cStyle('center'), color: muted }}>{m.week}</td>
                      <td style={{ ...cStyle('right'), fontWeight: win ? '600' : '400', color: win ? text : muted }}>{myScore}</td>
                      <td style={{ ...cStyle('right'), fontWeight: !win && !tie ? '600' : '400', color: !win && !tie ? text : muted }}>{theirScore}</td>
                      <td style={{ ...cStyle('center'), color: tie ? text : win ? green : red, fontWeight: '500' }}>
                        {tie ? 'T' : win ? 'W' : 'L'}
                      </td>
                      <td style={{ ...cStyle('center'), color: muted, fontSize: '11px' }}>
                        {m.is_mol_bowl ? 'Sacko' : m.is_playoff ? 'Playoff' : 'Reg'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )
  }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />

      {/* Modal */}
      <MatchupModal />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>

        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px, 6vw, 72px)', fontWeight: '400', marginBottom: '8px', letterSpacing: '-0.02em' }}>
          Head-to-Head
        </h1>
        <p style={{ color: muted, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '32px' }}>
          All-time records · click any cell to see full matchup history
        </p>

        <div style={{ display: 'flex', flexDirection: effectiveMobile ? 'column' : 'row', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input placeholder="Search manager..." value={searchText} onChange={e => setSearchText(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '40px', flexWrap: 'wrap' }}>
          {toggleBtn(includePlayoffs, 'Include Playoffs', () => setIncludePlayoffs(true))}
          {toggleBtn(!includePlayoffs, 'Regular Season Only', () => setIncludePlayoffs(false))}
        </div>

        {!selected ? (
          <>
            <p style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '24px' }}>
              Select a manager for their full record · click any cell to see matchup details
            </p>

            {/* Manager cards */}
            <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1px', background: border, marginBottom: '60px' }}>
              {displayManagers.map(m => {
                const rec = getRecord(m.id)
                const pct = rec.wins + rec.losses > 0 ? ((rec.wins / (rec.wins + rec.losses)) * 100).toFixed(0) : 0
                return (
                  <div key={m.id} onClick={() => setSelected(m.id)} style={{ background: cardBg, padding: effectiveMobile ? '16px' : '24px 20px', cursor: 'pointer' }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '15px' : '18px', color: text, marginBottom: '8px' }}>
                      {m.name}
                    </div>
                    <div style={{ fontSize: '13px', color: muted }}>{rec.wins}-{rec.losses}</div>
                    <div style={{ fontSize: '11px', color: muted, marginTop: '4px' }}>{pct}% vs shown</div>
                  </div>
                )
              })}
            </div>

            {/* Matrix -- desktop only */}
            {!effectiveMobile && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
                  <thead>
                    <tr style={{ background: cardBg }}>
                      <th style={hStyle('left')}>Manager</th>
                      {displayManagers.map(m => (
                        <th key={m.id} style={hStyle('center')}>{m.name.split('/')[0]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayManagers.map((rowManager, i) => (
                      <tr key={rowManager.id} style={{ background: i % 2 === 0 ? 'transparent' : rowAlt }}>
                        <td
                          style={{ ...cStyle('left'), fontFamily: "'Playfair Display', serif", fontSize: '15px', cursor: 'pointer' }}
                          onClick={() => setSelected(rowManager.id)}
                        >
                          {rowManager.name}
                        </td>
                        {displayManagers.map(colManager => {
                          if (rowManager.id === colManager.id) {
                            return <td key={colManager.id} style={{ ...cStyle('center'), background: d ? '#111' : '#e0dbd3', color: muted }}>—</td>
                          }
                          const h = getH2H(rowManager.id, colManager.id)
                          const winning = h.wins > h.losses
                          const losing = h.wins < h.losses
                          return (
                            <td
                              key={colManager.id}
                              onClick={() => setModal({ managerA: rowManager, managerB: colManager })}
                              style={{
                                ...cStyle('center'),
                                color: h.count === 0 ? muted : winning ? green : losing ? red : text,
                                fontWeight: h.count > 0 ? '500' : '400',
                                cursor: h.count > 0 ? 'pointer' : 'default',
                                transition: 'background 0.1s',
                              }}
                              onMouseEnter={e => { if (h.count > 0) e.currentTarget.style.background = d ? 'rgba(255,255,255,0.05)' : 'rgba(13,33,82,0.05)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                            >
                              {h.count === 0 ? '—' : `${h.wins}-${h.losses}`}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Mobile: list of matchups per manager */}
            {effectiveMobile && (
              <div>
                <p style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '16px' }}>Tap a matchup to see full history</p>
                {displayManagers.map(rowManager => (
                  <div key={rowManager.id} style={{ marginBottom: '24px' }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '16px', color: text, marginBottom: '10px', paddingBottom: '8px', borderBottom: `1px solid ${border}` }}>
                      {rowManager.name}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1px', background: border }}>
                      {displayManagers.filter(m => m.id !== rowManager.id).map(colManager => {
                        const h = getH2H(rowManager.id, colManager.id)
                        if (h.count === 0) return null
                        const winning = h.wins > h.losses
                        const losing = h.wins < h.losses
                        return (
                          <div
                            key={colManager.id}
                            onClick={() => setModal({ managerA: rowManager, managerB: colManager })}
                            style={{ background: cardBg, padding: '12px', cursor: 'pointer' }}
                          >
                            <div style={{ fontSize: '12px', color: muted, marginBottom: '2px' }}>{colManager.name}</div>
                            <div style={{ fontSize: '14px', fontWeight: '600', color: winning ? green : losing ? red : text }}>{h.wins}-{h.losses}</div>
                          </div>
                        )
                      }).filter(Boolean)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '8px 18px', cursor: 'pointer', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", marginBottom: '32px' }}>
              ← All Managers
            </button>

            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '28px' : '36px', fontWeight: '400', marginBottom: '32px' }}>
              {selectedManager?.name}
            </h2>

            {/* H2H breakdown -- clickable rows */}
            <div style={{ overflowX: 'auto', marginBottom: '48px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
                <thead>
                  <tr style={{ background: cardBg }}>
                    <th style={hStyle('left')}>Opponent</th>
                    <th style={hStyle()}>W</th>
                    <th style={hStyle()}>L</th>
                    <th style={hStyle()}>Games</th>
                    <th style={hStyle()}>Win %</th>
                    <th style={hStyle()}>PF</th>
                    <th style={hStyle()}>PA</th>
                    <th style={hStyle()}>Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {managers.filter(m => m.id !== selected).map((opponent, i) => {
                    const h = getH2H(selected, opponent.id)
                    if (h.count === 0) return null
                    const winPct = ((h.wins / h.count) * 100).toFixed(1)
                    const diff = parseFloat((h.pf - h.pa).toFixed(2))
                    return (
                      <tr
                        key={opponent.id}
                        onClick={() => setModal({ managerA: selectedManager, managerB: opponent })}
                        style={{ background: i % 2 === 0 ? 'transparent' : rowAlt, cursor: 'pointer', transition: 'background 0.1s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = d ? 'rgba(255,255,255,0.04)' : 'rgba(13,33,82,0.04)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : rowAlt }}
                      >
                        <td style={{ ...cStyle('left'), fontFamily: "'Playfair Display', serif", fontSize: '15px' }}>
                          {opponent.name}
                        </td>
                        <td style={cStyle()}>{h.wins}</td>
                        <td style={cStyle()}>{h.losses}</td>
                        <td style={cStyle()}>{h.count}</td>
                        <td style={cStyle()}>{winPct}%</td>
                        <td style={cStyle()}>{h.pf.toFixed(2)}</td>
                        <td style={cStyle()}>{h.pa.toFixed(2)}</td>
                        <td style={{ ...cStyle(), color: diff >= 0 ? green : red, fontWeight: '500' }}>
                          {diff >= 0 ? '+' : ''}{diff}
                        </td>
                      </tr>
                    )
                  }).filter(Boolean)}
                </tbody>
              </table>
            </div>

            {/* Full game log */}
            <p style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '16px' }}>Full Game Log</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: `1px solid ${border}` }}>
                <thead>
                  <tr style={{ background: cardBg }}>
                    <th style={hStyle('center')}>Year</th>
                    <th style={hStyle('center')}>Wk</th>
                    <th style={hStyle('left')}>Opponent</th>
                    <th style={hStyle()}>Score</th>
                    <th style={hStyle()}>Opp</th>
                    <th style={hStyle('center')}>Result</th>
                    <th style={hStyle('center')}>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {matchupHistory.map((m, i) => {
                    const iAmHome = m.home_team?.manager_id === selected
                    const myScore = iAmHome ? m.home_score : m.away_score
                    const theirScore = iAmHome ? m.away_score : m.home_score
                    const oppId = iAmHome ? m.away_team?.manager_id : m.home_team?.manager_id
                    const opp = managers.find(mg => mg.id === oppId)
                    const win = myScore > theirScore
                    const tie = myScore === theirScore
                    return (
                      <tr
                        key={m.id}
                        onClick={() => opp && setModal({ managerA: selectedManager, managerB: opp })}
                        style={{ background: i % 2 === 0 ? 'transparent' : rowAlt, cursor: 'pointer', transition: 'background 0.1s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = d ? 'rgba(255,255,255,0.04)' : 'rgba(13,33,82,0.04)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : rowAlt }}
                      >
                        <td style={{ ...cStyle('center'), color: muted }}>{m.season?.year}</td>
                        <td style={{ ...cStyle('center'), color: muted }}>{m.week}</td>
                        <td style={{ ...cStyle('left'), fontFamily: "'Playfair Display', serif", fontSize: '14px' }}>{opp?.name || '—'}</td>
                        <td style={cStyle()}>{myScore}</td>
                        <td style={cStyle()}>{theirScore}</td>
                        <td style={{ ...cStyle('center'), color: tie ? text : win ? green : red, fontWeight: '500' }}>
                          {tie ? 'T' : win ? 'W' : 'L'}
                        </td>
                        <td style={{ ...cStyle('center'), color: muted, fontSize: '11px' }}>
                          {m.is_mol_bowl ? 'Sacko' : m.is_playoff ? 'Playoff' : 'Reg'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
