'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useLayout } from '../hooks/useLayout'
import { projectedWeekLineup } from '../lib/predictions'

const posColor = pos => {
  const map = { QB: '#4285F4', RB: '#34A853', WR: '#FBBC04', TE: '#EA4335', K: '#46BDC6', 'D/ST': '#7BAAF7' }
  return map[pos] || '#888'
}

/**
 * Click-through from a matchup to both teams' projected lineups for a given
 * week, with a week picker so you can flip through the schedule without
 * closing the drawer. Only weeks with an uploaded per-player projection
 * (roster_entries.stats.proj[week]) show real numbers — others read "—"
 * rather than pretending to know something they don't.
 */
export default function MatchupDrawer({ homeTeam, awayTeam, week, regWeeks, onClose }) {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, rowAlt, gold } = useLayout()
  const router = useRouter()
  const [selectedWeek, setSelectedWeek] = useState(week)
  const [entriesByTeam, setEntriesByTeam] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { setSelectedWeek(week) }, [week, homeTeam?.id, awayTeam?.id])

  useEffect(() => {
    if (!homeTeam || !awayTeam) return
    setLoading(true)
    supabase
      .from('roster_entries')
      .select('*, player:player_id(id, name, position)')
      .in('team_id', [homeTeam.id, awayTeam.id])
      .then(({ data }) => {
        const byTeam = { [homeTeam.id]: [], [awayTeam.id]: [] }
        ;(data || []).forEach(e => { (byTeam[e.team_id] ||= []).push(e) })
        setEntriesByTeam(byTeam)
        setLoading(false)
      })
  }, [homeTeam?.id, awayTeam?.id])

  const homeLineup = useMemo(
    () => projectedWeekLineup(entriesByTeam[homeTeam?.id] || [], selectedWeek),
    [entriesByTeam, homeTeam?.id, selectedWeek],
  )
  const awayLineup = useMemo(
    () => projectedWeekLineup(entriesByTeam[awayTeam?.id] || [], selectedWeek),
    [entriesByTeam, awayTeam?.id, selectedWeek],
  )

  if (!homeTeam || !awayTeam) return null

  const hasAnyProj = homeLineup.total > 0 || awayLineup.total > 0
  const weeks = Array.from({ length: regWeeks || 17 }, (_, i) => i + 1)

  const gridCols = '48px 1fr 44px'

  const TeamColumn = ({ teamLabel, lineup }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        padding: '10px 14px', background: cardBg, borderBottom: `1px solid ${border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      }}>
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '15px', color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {teamLabel}
        </span>
        <span style={{ fontSize: '15px', fontWeight: '700', color: gold, flexShrink: 0, marginLeft: '8px' }}>
          {lineup.total > 0 ? lineup.total.toFixed(1) : '—'}
        </span>
      </div>
      {lineup.starters.map((e, i) => (
        <div
          key={e.id}
          onClick={() => { router.push(`/players/${e.player?.id}`); onClose() }}
          style={{
            display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center',
            padding: '8px 14px', borderBottom: `1px solid ${border}`,
            background: i % 2 === 0 ? 'transparent' : rowAlt, cursor: 'pointer',
          }}
        >
          <span style={{
            fontSize: '9px', fontWeight: '700', letterSpacing: '0.06em',
            color: posColor(e.slot === 'FLEX' ? e.player?.position : e.slot),
            background: posColor(e.slot === 'FLEX' ? e.player?.position : e.slot) + '18',
            padding: '2px 4px', textAlign: 'center',
          }}>
            {e.slot}
          </span>
          <span style={{
            fontFamily: "'Playfair Display', serif", fontSize: '12px', color: text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: '8px',
          }}>
            {e.player?.name || '—'}
          </span>
          <span style={{ fontSize: '12px', fontWeight: '500', color: text, textAlign: 'right' }}>
            {e.proj != null ? e.proj.toFixed(1) : '—'}
          </span>
        </div>
      ))}
    </div>
  )

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: effectiveMobile ? '95vw' : '620px',
        maxHeight: '85vh',
        background: bg, border: `1px solid ${border}`,
        zIndex: 301, overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '16px', borderBottom: `1px solid ${border}`, background: cardBg, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted }}>
              Projected Lineups
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                value={selectedWeek}
                onChange={e => setSelectedWeek(parseInt(e.target.value))}
                style={{ background: d ? '#111' : '#e8e4dc', border: `1px solid ${border}`, color: text, padding: '5px 8px', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}
              >
                {weeks.map(w => <option key={w} value={w}>Week {w}</option>)}
              </select>
              <button
                onClick={onClose}
                style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '32px 16px', color: muted, fontSize: '13px' }}>Loading rosters…</div>
        ) : (
          <>
            {!hasAnyProj && (
              <div style={{ padding: '14px 16px', fontSize: '12px', color: muted, borderBottom: `1px solid ${border}` }}>
                No projection uploaded for Week {selectedWeek} yet.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: effectiveMobile ? 'column' : 'row', gap: '1px', background: border }}>
              <TeamColumn teamLabel={homeTeam.manager?.name || homeTeam.team_name} lineup={homeLineup} />
              <TeamColumn teamLabel={awayTeam.manager?.name || awayTeam.team_name} lineup={awayLineup} />
            </div>
          </>
        )}
      </div>
    </>
  )
}
