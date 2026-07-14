'use client'
import { useState, useEffect } from 'react'
import { supabase, LEAGUE_ID } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useLayout } from '../hooks/useLayout'

function slotRoster(entries) {
  const byPos = { QB: [], RB: [], WR: [], TE: [], K: [], 'D/ST': [] }
  for (const e of entries) {
    const pos = e.player?.position
    if (byPos[pos]) byPos[pos].push(e)
  }
  Object.values(byPos).forEach(arr => arr.sort((a, b) => (b.avg_pts || 0) - (a.avg_pts || 0)))

  const starters = []
  const usedIds = new Set()

  const take = (pos, slot) => {
    const p = byPos[pos]?.find(e => !usedIds.has(e.id))
    if (p) { usedIds.add(p.id); starters.push({ ...p, slot }) }
  }

  take('QB', 'QB')
  take('RB', 'RB1')
  take('RB', 'RB2')
  take('WR', 'WR1')
  take('WR', 'WR2')
  take('TE', 'TE')

  const flexPool = [...byPos['RB'], ...byPos['WR'], ...byPos['TE']]
    .filter(e => !usedIds.has(e.id))
    .sort((a, b) => (b.avg_pts || 0) - (a.avg_pts || 0))
  if (flexPool[0]) { usedIds.add(flexPool[0].id); starters.push({ ...flexPool[0], slot: 'FLEX' }) }
  if (flexPool[1]) { usedIds.add(flexPool[1].id); starters.push({ ...flexPool[1], slot: 'FLEX' }) }

  take('D/ST', 'D/ST')
  take('K', 'K')

  const bench = entries.filter(e => !usedIds.has(e.id)).sort((a, b) => (b.avg_pts || 0) - (a.avg_pts || 0))
  return { starters, bench }
}

const posColor = pos => {
  const map = { QB: '#4285F4', RB: '#34A853', WR: '#FBBC04', TE: '#EA4335', K: '#46BDC6', 'D/ST': '#7BAAF7' }
  return map[pos] || '#888'
}

export default function RosterDrawer({ team, onClose }) {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, rowAlt, gold } = useLayout()
  const router = useRouter()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!team) return
    setLoading(true)
    supabase
      .from('roster_entries')
      .select('*, player:player_id(id, name, position)')
      .eq('team_id', team.id)
      .then(({ data }) => { setEntries(data || []); setLoading(false) })
  }, [team?.id])

  if (!team) return null

  const { starters, bench } = loading ? { starters: [], bench: [] } : slotRoster(entries)

  const startersPPG = starters.reduce((sum, e) => sum + (e.avg_pts || 0), 0)
  const teamPPG = [...starters, ...bench].reduce((sum, e) => sum + (e.avg_pts || 0), 0)

  const PlayerRow = ({ entry, slot, i, isBench }) => {
    const pos = entry.player?.position
    const displaySlot = slot || pos
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '52px 1fr 48px 48px 40px',
          alignItems: 'center',
          padding: '10px 16px',
          borderBottom: `1px solid ${border}`,
          background: isBench ? (i % 2 === 0 ? 'transparent' : (d ? '#080808' : '#e8e4dc')) : 'transparent',
          cursor: 'pointer',
        }}
        onClick={() => { router.push(`/players/${entry.player?.id}`); onClose() }}
        onMouseEnter={e => e.currentTarget.style.background = d ? '#0d0d1a' : '#e8edf5'}
        onMouseLeave={e => e.currentTarget.style.background = isBench ? (i % 2 === 0 ? 'transparent' : (d ? '#080808' : '#e8e4dc')) : 'transparent'}
      >
        <span style={{
          fontSize: '9px', fontWeight: '700', letterSpacing: '0.08em',
          color: posColor(displaySlot === 'FLEX' ? pos : displaySlot),
          background: posColor(displaySlot === 'FLEX' ? pos : displaySlot) + '18',
          padding: '2px 5px', textAlign: 'center',
        }}>
          {displaySlot}
        </span>
        <span style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: '13px', color: text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          paddingLeft: '8px',
        }}>
          {entry.player?.name || '—'}
        </span>
        <span style={{ fontSize: '11px', color: muted, textAlign: 'right' }}>
          {entry.prk ? `#${entry.prk}` : '—'}
        </span>
        <span style={{ fontSize: '12px', fontWeight: '500', color: text, textAlign: 'right' }}>
          {entry.avg_pts?.toFixed(1) ?? '—'}
        </span>
        <span style={{ fontSize: '10px', color: muted, textAlign: 'right' }}>→</span>
      </div>
    )
  }

  const TotalRow = ({ label, value }) => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '52px 1fr 48px 48px 40px',
      alignItems: 'center',
      padding: '10px 16px',
      borderBottom: `1px solid ${border}`,
      background: d ? 'rgba(255,255,255,0.03)' : 'rgba(13,33,82,0.04)',
    }}>
      <span />
      <span style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, paddingLeft: '8px' }}>{label}</span>
      <span />
      <span style={{ fontSize: '13px', fontWeight: '700', color: gold, textAlign: 'right' }}>{value.toFixed(1)}</span>
      <span />
    </div>
  )

  const SectionLabel = ({ label }) => (
    <div style={{
      padding: '8px 16px',
      fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase',
      color: muted, background: cardBg, borderBottom: `1px solid ${border}`,
    }}>
      {label}
    </div>
  )

  const ColHeaders = () => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '52px 1fr 48px 48px 40px',
      padding: '6px 16px',
      borderBottom: `1px solid ${border}`,
      background: cardBg,
    }}>
      <span style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: muted }}>Slot</span>
      <span style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: muted, paddingLeft: '8px' }}>Player</span>
      <span style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: muted, textAlign: 'right' }}>PRK</span>
      <span style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: muted, textAlign: 'right' }}>Avg</span>
      <span />
    </div>
  )

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: effectiveMobile ? '95vw' : '480px',
        maxHeight: '85vh',
        background: bg, border: `1px solid ${border}`,
        zIndex: 301, overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 16px', borderBottom: `1px solid ${border}`, background: cardBg, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', color: text, marginBottom: '4px' }}>
                {team.manager?.name}
              </div>
              <div style={{ fontSize: '12px', color: muted }}>{team.team_name} · {team.season?.year}</div>
              <div style={{ fontSize: '11px', color: muted, marginTop: '2px' }}>
                {team.wins}–{team.losses} · {team.points_for?.toFixed(1)} PF
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}
            >
              ✕
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '32px 16px', color: muted, fontSize: '13px' }}>Loading roster...</div>
        ) : (
          <>
            <SectionLabel label="Starters" />
            <ColHeaders />
            {starters.map((e, i) => <PlayerRow key={e.id} entry={e} slot={e.slot} i={i} isBench={false} />)}
            <TotalRow label="Starters PPG" value={startersPPG} />

            <SectionLabel label="Bench" />
            {bench.length === 0 ? (
              <div style={{ padding: '16px', fontSize: '12px', color: muted }}>No bench players.</div>
            ) : (
              bench.map((e, i) => <PlayerRow key={e.id} entry={e} slot={null} i={i} isBench={true} />)
            )}
            <TotalRow label="Full Roster PPG" value={teamPPG} />
          </>
        )}
      </div>
    </>
  )
}
