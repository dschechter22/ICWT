'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const INTERPERSONAL = {}

const NARRATIVES = {}

const getNarrative = (slugA, slugB) => {
  const key1 = `${slugA}-${slugB}`
  const key2 = `${slugB}-${slugA}`
  return NARRATIVES[key1] || NARRATIVES[key2] || null
}

const isInterpersonalRival = (slugA, slugB) =>
  (INTERPERSONAL[slugA] || []).includes(slugB) || (INTERPERSONAL[slugB] || []).includes(slugA)

export default function RivalriesPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, rowAlt, green, red, gold, blue } = useLayout()

  const [managers, setManagers] = useState([])
  const [matchups, setMatchups] = useState([])
  const [view, setView] = useState('league')
  const [selectedManager, setSelectedManager] = useState(null)

  useEffect(() => {
    supabase.from('managers').select('*').then(({ data }) => setManagers(data || []))
    supabase.from('matchups')
      .select('*, home_team:home_team_id(id, manager_id), away_team:away_team_id(id, manager_id), season:season_id(year)')
      .then(({ data }) => setMatchups(data || []))
  }, [])

  const activeManagers = managers.filter(m => m.active)

  const getRivalryStats = (managerA, managerB) => {
    const allGames = matchups.filter(m => {
      const hId = m.home_team?.manager_id
      const aId = m.away_team?.manager_id
      return (hId === managerA.id && aId === managerB.id) || (hId === managerB.id && aId === managerA.id)
    })
    if (allGames.length === 0) return null

    let winsA = 0, winsB = 0, totalMargin = 0, playoffMeetings = 0
    const recentYears = [...new Set(allGames.map(m => m.season?.year))].sort((a, b) => b - a).slice(0, 3)
    let recentWinsA = 0, recentWinsB = 0

    allGames.forEach(m => {
      const homeIsA = m.home_team?.manager_id === managerA.id
      const scoreA = homeIsA ? m.home_score : m.away_score
      const scoreB = homeIsA ? m.away_score : m.home_score
      totalMargin += Math.abs(scoreA - scoreB)
      if (scoreA > scoreB) winsA++
      else if (scoreB > scoreA) winsB++
      if (m.is_playoff) playoffMeetings++
      if (recentYears.includes(m.season?.year)) {
        if (scoreA > scoreB) recentWinsA++
        else if (scoreB > scoreA) recentWinsB++
      }
    })

    const games = allGames.length
    const avgMargin = parseFloat((totalMargin / games).toFixed(2))
    const closeness = 1 - Math.abs(winsA - winsB) / games
    const recentMomentum = recentWinsA > recentWinsB ? managerA : recentWinsA < recentWinsB ? managerB : null

    let biggestGame = null
    allGames.forEach(m => {
      const homeIsA = m.home_team?.manager_id === managerA.id
      const scoreA = homeIsA ? m.home_score : m.away_score
      const scoreB = homeIsA ? m.away_score : m.home_score
      const margin = Math.abs(scoreA - scoreB)
      if (!biggestGame || margin > biggestGame.margin) {
        biggestGame = { margin: parseFloat(margin.toFixed(2)), winner: scoreA > scoreB ? managerA : managerB, winnerScore: Math.max(scoreA, scoreB), loserScore: Math.min(scoreA, scoreB), year: m.season?.year, week: m.week, isPlayoff: m.is_playoff }
      }
    })

    const mostRecent = [...allGames].sort((a, b) => {
      if (b.season?.year !== a.season?.year) return b.season?.year - a.season?.year
      return b.week - a.week
    })[0]

    let mostRecentWinner = null
    if (mostRecent) {
      const homeIsA = mostRecent.home_team?.manager_id === managerA.id
      const scoreA = homeIsA ? mostRecent.home_score : mostRecent.away_score
      const scoreB = homeIsA ? mostRecent.away_score : mostRecent.home_score
      mostRecentWinner = scoreA > scoreB ? managerA : managerB
    }

    return { games, winsA, winsB, avgMargin, closeness, playoffMeetings, recentMomentum, biggestGame, mostRecent, mostRecentWinner }
  }

  const getRivalryScore = (managerA, managerB, stats) => {
    if (!stats) return 0
    const closenessScore = stats.closeness
    const volumeScore = Math.min(stats.games / 20, 1)
    const marginScore = Math.max(0, 1 - (stats.avgMargin / 50))
    const playoffScore = Math.min(stats.playoffMeetings / 3, 1)
    const statsScore = closenessScore * 0.35 + volumeScore * 0.25 + marginScore * 0.25 + playoffScore * 0.15
    const interpersonal = isInterpersonalRival(managerA.slug, managerB.slug) ? 1 : 0
    return parseFloat(((statsScore * 0.6) + (interpersonal * 0.4)).toFixed(4))
  }

  const allRivalries = useMemo(() => {
    if (activeManagers.length === 0 || matchups.length === 0) return []
    const pairs = []
    for (let i = 0; i < activeManagers.length; i++) {
      for (let j = i + 1; j < activeManagers.length; j++) {
        const mA = activeManagers[i]
        const mB = activeManagers[j]
        const stats = getRivalryStats(mA, mB)
        if (!stats || stats.games < 3) continue
        const score = getRivalryScore(mA, mB, stats)
        pairs.push({ managerA: mA, managerB: mB, stats, score })
      }
    }
    return pairs.sort((a, b) => b.score - a.score)
  }, [activeManagers, matchups])

  const getTop3Rivals = (manager) => {
    return allRivalries
      .filter(r => r.managerA.id === manager.id || r.managerB.id === manager.id)
      .slice(0, 3)
      .map(r => ({
        ...r,
        opponent: r.managerA.id === manager.id ? r.managerB : r.managerA,
        winsForManager: r.managerA.id === manager.id ? r.stats.winsA : r.stats.winsB,
        winsForOpponent: r.managerA.id === manager.id ? r.stats.winsB : r.stats.winsA,
      }))
  }

  const RivalryCard = ({ rivalry, showNarrative = false, compact = false }) => {
    const { managerA, managerB, stats, score } = rivalry
    const narrative = showNarrative ? getNarrative(managerA.slug, managerB.slug) : null
    const isInterpersonal = isInterpersonalRival(managerA.slug, managerB.slug)
    const leadingManager = stats.winsA > stats.winsB ? managerA : stats.winsB > stats.winsA ? managerB : null

    return (
      <div style={{ background: cardBg, border: `1px solid ${border}`, padding: compact ? '16px' : effectiveMobile ? '16px' : '24px', marginBottom: '1px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: compact ? '16px' : effectiveMobile ? '18px' : '22px', color: text, fontWeight: '400', marginBottom: '6px' }}>
              {managerA.name} vs {managerB.name}
            </h3>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Rivalry score -- big and prominent */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: compact ? '28px' : effectiveMobile ? '32px' : '40px', color: text, lineHeight: 1, fontWeight: '400' }}>
                  {(score * 100).toFixed(0)}
                </span>
                <span style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted }}>/ 100</span>
              </div>
              {isInterpersonal && (
                <span style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: red, border: `1px solid ${red}`, padding: '2px 6px' }}>Named Rival</span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '16px' }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: compact ? '22px' : effectiveMobile ? '24px' : '28px', color: text, marginBottom: '2px' }}>
              {stats.winsA}–{stats.winsB}
            </div>
            <div style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: muted }}>
              {leadingManager ? `${leadingManager.name.split(' ')[0]} leads` : 'Even'}
            </div>
          </div>
        </div>

        {narrative && (
          <p style={{ fontSize: '13px', color: muted, lineHeight: 1.6, marginBottom: '14px', fontStyle: 'italic' }}>
            "{narrative}"
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: compact ? 'repeat(3, 1fr)' : `repeat(${effectiveMobile ? 3 : 4}, 1fr)`, gap: '12px', marginBottom: '12px' }}>
          {[
            ['Games', stats.games],
            ['Avg Margin', `${stats.avgMargin} pts`],
            ['Playoffs', stats.playoffMeetings],
            ...(!compact && !effectiveMobile ? [['Momentum', stats.recentMomentum ? `${stats.recentMomentum.name.split(' ')[0]} (L3Y)` : 'Even']] : []),
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '3px' }}>{label}</div>
              <div style={{ fontSize: '13px', color: text, fontWeight: '500' }}>{val}</div>
            </div>
          ))}
        </div>

        {!compact && stats.biggestGame && (
          <div style={{ borderTop: `1px solid ${border}`, paddingTop: '12px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '3px' }}>Biggest Game</div>
              <div style={{ fontSize: '12px', color: text }}>
                {stats.biggestGame.winner.name.split(' ')[0]} won {stats.biggestGame.winnerScore}–{stats.biggestGame.loserScore} · {stats.biggestGame.year} Wk{stats.biggestGame.week}
                {stats.biggestGame.isPlayoff && <span style={{ color: gold, marginLeft: '6px', fontSize: '10px' }}>Playoff</span>}
              </div>
            </div>
            {stats.mostRecent && (
              <div>
                <div style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '3px' }}>Most Recent</div>
                <div style={{ fontSize: '12px', color: text }}>
                  {stats.mostRecentWinner?.name.split(' ')[0]} won · {stats.mostRecent.season?.year} Wk{stats.mostRecent.week}
                  {stats.mostRecent.is_playoff && <span style={{ color: gold, marginLeft: '6px', fontSize: '10px' }}>Playoff</span>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const filterBtn = (active, label, onClick) => (
    <button onClick={onClick} style={{
      background: active ? text : 'none', border: `1px solid ${border}`,
      color: active ? bg : muted, padding: effectiveMobile ? '6px 10px' : '7px 16px',
      cursor: 'pointer', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase',
      fontFamily: "'Inter', sans-serif", fontWeight: '500', transition: 'all 0.15s', whiteSpace: 'nowrap',
    }}>{label}</button>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>

        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px, 6vw, 72px)', fontWeight: '400', marginBottom: '8px', letterSpacing: '-0.02em' }}>
          Rivalries
        </h1>
        <p style={{ color: muted, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '32px' }}>
          Rivalry score · 60% stats · 40% interpersonal
        </p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', flexWrap: 'wrap' }}>
          {filterBtn(view === 'league', 'League-Wide', () => { setView('league'); setSelectedManager(null) })}
          {filterBtn(view === 'manager', 'By Manager', () => setView('manager'))}
        </div>

        {view === 'league' && (
          <div>
            {allRivalries.slice(0, 20).map((r, i) => (
              <RivalryCard
                key={`${r.managerA.id}-${r.managerB.id}`}
                rivalry={r}
                showNarrative={true}
              />
            ))}
            {allRivalries.length === 0 && (
              <p style={{ color: muted, fontSize: '14px' }}>Loading rivalries...</p>
            )}
          </div>
        )}

        {view === 'manager' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1px', background: border, marginBottom: '40px' }}>
              {activeManagers.map(m => (
                <div
                  key={m.id}
                  onClick={() => setSelectedManager(selectedManager?.id === m.id ? null : m)}
                  style={{
                    background: selectedManager?.id === m.id ? (d ? '#1a1a2e' : '#dde4f0') : cardBg,
                    padding: '16px', cursor: 'pointer',
                    outline: selectedManager?.id === m.id ? `2px solid ${d ? '#4455aa' : '#0d2152'}` : 'none',
                  }}
                >
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '15px', color: text }}>{m.name}</div>
                </div>
              ))}
            </div>

            {selectedManager ? (
              <>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '24px' : '32px', fontWeight: '400', marginBottom: '24px', color: text }}>
                  {selectedManager.name}'s Top 3 Rivals
                </h2>
                {getTop3Rivals(selectedManager).map((r, i) => {
                  const rivalry = {
                    managerA: selectedManager,
                    managerB: r.opponent,
                    stats: { ...r.stats, winsA: r.winsForManager, winsB: r.winsForOpponent },
                    score: r.score,
                  }
                  return (
                    <div key={r.opponent.id} style={{ position: 'relative', marginBottom: '2px' }}>
                      {!effectiveMobile && (
                        <div style={{ position: 'absolute', top: '24px', left: '-32px', fontFamily: "'Playfair Display', serif", fontSize: '18px', color: i === 0 ? gold : muted }}>
                          #{i + 1}
                        </div>
                      )}
                      {effectiveMobile && (
                        <div style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: i === 0 ? gold : muted, marginBottom: '6px' }}>
                          Rival #{i + 1}
                        </div>
                      )}
                      <RivalryCard rivalry={rivalry} showNarrative={true} />
                    </div>
                  )
                })}
                {getTop3Rivals(selectedManager).length === 0 && (
                  <p style={{ color: muted, fontSize: '14px' }}>No rivalry data found.</p>
                )}
              </>
            ) : (
              <p style={{ color: muted, fontSize: '13px' }}>Select a manager to see their top 3 rivals.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
