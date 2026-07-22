'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Each manager's personal top-3 rivals, in rank order (index 0 = #1).
// Curated by the league, not derived from stats -- some pairs are
// one-directional (e.g. Drew lists Frank, Frank doesn't list Drew back).
const MANAGER_RIVALS = {
  dan:     ['frank', 'frankel', 'bt'],
  frank:   ['aj', 'dan', 'freed'],
  aj:      ['frank', 'drew', 'justin'],
  aiden:   ['beast', 'bt', 'frankel'],
  bt:      ['freed', 'dan', 'aiden'],
  justin:  ['aj', 'drew', 'beast'],
  drew:    ['beast', 'justin', 'frank'],
  frankel: ['dan', 'aiden', 'bt'],
  beast:   ['drew', 'aiden', 'justin'],
  freed:   ['bt', 'frank', 'beast'],
}

// Leaguewide ranked list -- independent of any manager's personal top 3.
const TOP_RIVALRIES = [
  ['frank', 'aj'],
  ['bt', 'freed'],
  ['dan', 'frank'],
  ['drew', 'beast'],
  ['justin', 'drew'],
  ['aj', 'justin'],
  ['dan', 'frankel'],
  ['aj', 'drew'],
  ['drew', 'frank'],
  ['frankel', 'bt'],
  ['aiden', 'beast'],
  ['dan', 'bt'],
  ['aiden', 'frankel'],
  ['aiden', 'bt'],
  ['freed', 'beast'],
]

const pairKey = (a, b) => [a, b].sort().join('_')

const RIVALRY_SYNOPSES = {
  [pairKey('dan', 'frank')]: `The "Parenti Curse" -- a botched trade haunted Frank until he finally beat Dan in the playoffs this year en route to his title.`,
  [pairKey('dan', 'frankel')]: `A running political feud in the group chat, with Dan needling Frankel's fantasy skills.`,
  [pairKey('dan', 'bt')]: `MLB The Show teammates outside the league, but lopsided trades soured BT on ever trading with Dan again.`,
  [pairKey('frank', 'aj')]: `Cubs vs. White Sox brought to fantasy football -- Frank's Lumpy Churo vs. AJ's The Pericles, the league's defining rivalry since its founding.`,
  [pairKey('frank', 'freed')]: `Two lefties who bicker over everything in the group chat.`,
  [pairKey('aj', 'drew')]: `Another Cubs/Sox rivalry between two historically strong, competitive teams.`,
  [pairKey('aj', 'justin')]: `Best friends whose head-to-head has been a lopsided windshield-vs-bug dynamic in Justin's favor.`,
  [pairKey('aiden', 'beast')]: `The league's best teams to never win a title, racing each other to the ring.`,
  [pairKey('aiden', 'bt')]: `The two managers least likely to be seen hanging out outside the league.`,
  [pairKey('aiden', 'frankel')]: `Frequent group chat sparring partners, both still chasing a first ring.`,
  [pairKey('bt', 'freed')]: `"Burger Boy" vs. "Squidward" -- the group chat's most heated ongoing feud.`,
  [pairKey('justin', 'drew')]: `Two of the league's early greats who kept meeting in the playoffs.`,
  [pairKey('justin', 'beast')]: `Regular group chat sparring partners.`,
  [pairKey('drew', 'beast')]: `Drew coined "#hatebeast," making him Beast's defining rival.`,
  [pairKey('drew', 'frank')]: `Best friends who bicker constantly -- rumored to secretly be a couple.`,
  [pairKey('frankel', 'bt')]: `Friends since Twin Groves middle school, bonded by a shared baseball rivalry.`,
  [pairKey('freed', 'beast')]: `Frequent back-and-forth -- the two just enjoy sparring in the group chat.`,
}

// Fixed heat scores, set by the league -- not computed from stats.
const RIVALRY_HEAT = {
  [pairKey('frank', 'aj')]: 100,
  [pairKey('bt', 'freed')]: 98,
  [pairKey('dan', 'frank')]: 97,
  [pairKey('drew', 'beast')]: 95,
  [pairKey('justin', 'drew')]: 94,
  [pairKey('aj', 'justin')]: 93,
  [pairKey('dan', 'frankel')]: 91,
  [pairKey('aj', 'drew')]: 90,
  [pairKey('drew', 'frank')]: 89,
  [pairKey('frankel', 'bt')]: 87,
  [pairKey('aiden', 'beast')]: 85,
  [pairKey('dan', 'bt')]: 84,
  [pairKey('aiden', 'frankel')]: 83,
  [pairKey('aiden', 'bt')]: 81,
  [pairKey('freed', 'beast')]: 80,
  [pairKey('justin', 'beast')]: 78,
}

// Flavor storyline, not tied to any single rivalry.
const CHAT_ROOMITES = ['dan', 'freed']

export default function RivalriesPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, gold, red, blue } = useLayout()

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

  const bySlug = useMemo(() => Object.fromEntries(managers.map(m => [m.slug, m])), [managers])

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

    return { games, winsA, winsB, avgMargin, playoffMeetings, recentMomentum, biggestGame, mostRecent, mostRecentWinner }
  }

  const leagueRivalries = useMemo(() => {
    if (managers.length === 0) return []
    return TOP_RIVALRIES.map(([slugA, slugB], i) => {
      const managerA = bySlug[slugA], managerB = bySlug[slugB]
      if (!managerA || !managerB) return null
      return {
        rank: i + 1,
        managerA, managerB,
        stats: getRivalryStats(managerA, managerB),
        synopsis: RIVALRY_SYNOPSES[pairKey(slugA, slugB)],
        heat: RIVALRY_HEAT[pairKey(slugA, slugB)] ?? null,
      }
    }).filter(Boolean)
  }, [managers, matchups, bySlug])

  const managerRivalries = (manager) => {
    if (!manager) return []
    const rivalSlugs = MANAGER_RIVALS[manager.slug] || []
    return rivalSlugs.map((slug, i) => {
      const opponent = bySlug[slug]
      if (!opponent) return null
      return {
        rank: i + 1,
        managerA: manager, managerB: opponent,
        stats: getRivalryStats(manager, opponent),
        synopsis: RIVALRY_SYNOPSES[pairKey(manager.slug, slug)],
        heat: RIVALRY_HEAT[pairKey(manager.slug, slug)] ?? null,
      }
    }).filter(Boolean)
  }

  const ChatRoomiteTag = ({ slug }) => CHAT_ROOMITES.includes(slug) ? (
    <span style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: gold, border: `1px solid ${gold}`, padding: '1px 6px', marginLeft: '8px' }}>
      Chatroomite
    </span>
  ) : null

  const RivalryCard = ({ rivalry }) => {
    const { managerA, managerB, stats, synopsis, heat } = rivalry
    const leadingManager = stats && stats.winsA > stats.winsB ? managerA : stats && stats.winsB > stats.winsA ? managerB : null

    return (
      <div style={{ background: cardBg, border: `1px solid ${border}`, padding: effectiveMobile ? '16px' : '24px', marginBottom: '1px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '18px' : '22px', color: text, fontWeight: '400' }}>
            {managerA.name}<ChatRoomiteTag slug={managerA.slug} /> vs {managerB.name}<ChatRoomiteTag slug={managerB.slug} />
          </h3>
          {stats && (
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '16px' }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '24px' : '28px', color: text, marginBottom: '2px' }}>
                {stats.winsA}–{stats.winsB}
              </div>
              <div style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: blue, fontWeight: '600' }}>
                {leadingManager ? `${leadingManager.name.split(' ')[0]} leads` : 'Even'}
              </div>
            </div>
          )}
        </div>

        {heat !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '28px' : '32px', color: text, lineHeight: 1, fontWeight: '400' }}>
                {heat}
              </span>
              <span style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: muted }}>/ 100</span>
            </div>
            <span style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: red, border: `1px solid ${red}`, padding: '2px 6px', fontWeight: '600' }}>
              Named Rival
            </span>
          </div>
        )}

        {synopsis && (
          <p style={{ fontSize: '13px', color: muted, lineHeight: 1.6, marginBottom: '14px', fontStyle: 'italic' }}>
            "{synopsis}"
          </p>
        )}

        {stats ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${effectiveMobile ? 3 : 4}, 1fr)`, gap: '12px', marginBottom: '12px' }}>
              {[
                ['Games', stats.games, text],
                ['Avg Margin', `${stats.avgMargin} pts`, text],
                ['Playoffs', stats.playoffMeetings, text],
                ...(!effectiveMobile ? [['Momentum', stats.recentMomentum ? `${stats.recentMomentum.name.split(' ')[0]} (L3Y)` : 'Even', stats.recentMomentum ? blue : text]] : []),
              ].map(([label, val, color]) => (
                <div key={label}>
                  <div style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '3px' }}>{label}</div>
                  <div style={{ fontSize: '13px', color, fontWeight: '500' }}>{val}</div>
                </div>
              ))}
            </div>

            {stats.biggestGame && (
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
          </>
        ) : (
          <p style={{ fontSize: '12px', color: muted }}>No head-to-head history yet.</p>
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
          The Rivalry Index · curated ranks · heat score from head-to-head stats
        </p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', flexWrap: 'wrap' }}>
          {filterBtn(view === 'league', 'Top 15', () => { setView('league'); setSelectedManager(null) })}
          {filterBtn(view === 'manager', 'By Manager', () => setView('manager'))}
        </div>

        {view === 'league' && (
          <div>
            {leagueRivalries.map(r => (
              <RivalryCard key={`${r.managerA.id}-${r.managerB.id}`} rivalry={r} />
            ))}
            {leagueRivalries.length === 0 && (
              <p style={{ color: muted, fontSize: '14px' }}>Loading rivalries...</p>
            )}
          </div>
        )}

        {view === 'manager' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1px', background: border, marginBottom: '40px' }}>
              {managers.map(m => (
                <div
                  key={m.id}
                  onClick={() => setSelectedManager(selectedManager?.id === m.id ? null : m)}
                  style={{
                    background: selectedManager?.id === m.id ? (d ? '#1a1a2e' : '#dde4f0') : cardBg,
                    padding: '16px', cursor: 'pointer',
                    outline: selectedManager?.id === m.id ? `2px solid ${d ? '#4455aa' : '#0d2152'}` : 'none',
                  }}
                >
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '15px', color: text }}>
                    {m.name}<ChatRoomiteTag slug={m.slug} />
                  </div>
                </div>
              ))}
            </div>

            {selectedManager ? (
              <>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '24px' : '32px', fontWeight: '400', marginBottom: '24px', color: text }}>
                  {selectedManager.name}'s Top 3 Rivals
                </h2>
                {managerRivalries(selectedManager).map(r => (
                  <RivalryCard key={r.managerB.id} rivalry={r} />
                ))}
                {managerRivalries(selectedManager).length === 0 && (
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
