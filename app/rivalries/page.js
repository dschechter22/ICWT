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
  [pairKey('dan', 'frank')]: `The "Parente Curse": in the league's first year, Frank agreed to a trade with Dan but couldn't follow through after already receiving the players, cursing him to never win the league again until beating Dan in the playoffs. Dan upset Frank in the playoffs in Dan's 2023 championship year, but Frank finally beat the curse this year by beating Dan in the playoffs en route to his own title. Also fueled by a running political rivalry (Frank conservative, Dan liberal) argued in the group chat.`,
  [pairKey('dan', 'frankel')]: `Same political dynamic (conservative vs. liberal) as with Frank, argued frequently in the group chat. Dan regularly needles Frankel, calling him bad at fantasy football.`,
  [pairKey('dan', 'bt')]: `The two play MLB The Show together outside the league. Dan talks trash about BT's teams and has made lopsided trades that BT lost, to the point BT now refuses to trade with him.`,
  [pairKey('frank', 'aj')]: `The league's biggest rivalry, self-rated 100/100. Rooted in a Cubs (Frank) vs. White Sox (AJ) baseball rivalry, argued constantly in the group chat. Team names: Frank's "Lumpy Churo" vs. AJ's "The Paraclete's."`,
  [pairKey('frank', 'freed')]: `Both lefties politically, frequently bicker over dumb stuff in the group chat.`,
  [pairKey('aj', 'drew')]: `Another Cubs/Sox-flavored rivalry; both teams have historically been strong and competitive with each other.`,
  [pairKey('aj', 'justin')]: `Best friends off the field, but Justin has historically dominated their head-to-head matchups (roughly 2/3 win rate) -- a "windshield vs. bug" dynamic.`,
  [pairKey('aiden', 'beast')]: `Close matchups over the years; both are the league's most successful teams to never have won a championship, giving them a shared "race to the ring" storyline.`,
  [pairKey('aiden', 'bt')]: `The two managers most disconnected from the group socially -- least likely to be seen in person or hanging out.`,
  [pairKey('aiden', 'frankel')]: `Frequent group chat sparring; also part of the "no ring" storyline shared with Aiden's other rivals.`,
  [pairKey('bt', 'freed')]: `One of the most active rivalries in the group chat. Freed coined the nickname "Burger Boy" for BT (which BT dislikes); BT coined "Squidward" for Freed (which Freed dislikes). Ranks among the most heated in the league.`,
  [pairKey('justin', 'drew')]: `Two of the best managers in the league's early years; frequently met in the playoffs, cultivating a long-standing rivalry.`,
  [pairKey('justin', 'beast')]: `Frequent group chat sparring partners.`,
  [pairKey('drew', 'beast')]: `Drew coined the term "#hatebeast" targeted at Beast, making Drew effectively Beast's defining rival.`,
  [pairKey('drew', 'frank')]: `Best friends who go at it constantly; running joke/rumor in the league that they're secretly in a relationship.`,
  [pairKey('frankel', 'bt')]: `History dates back to Twin Groves middle school; also share a baseball-based rivalry.`,
}

// Flavor storyline, not tied to any single rivalry.
const CHAT_ROOMITES = ['dan', 'freed']

export default function RivalriesPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, gold } = useLayout()

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
      }
    }).filter(Boolean)
  }

  const ChatRoomiteTag = ({ slug }) => CHAT_ROOMITES.includes(slug) ? (
    <span style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: gold, border: `1px solid ${gold}`, padding: '1px 6px', marginLeft: '8px' }}>
      Chatroomite
    </span>
  ) : null

  const RivalryCard = ({ rivalry }) => {
    const { managerA, managerB, stats, synopsis, rank } = rivalry
    const leadingManager = stats && stats.winsA > stats.winsB ? managerA : stats && stats.winsB > stats.winsA ? managerB : null

    return (
      <div style={{ background: cardBg, border: `1px solid ${border}`, padding: effectiveMobile ? '16px' : '24px', marginBottom: '1px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: rank === 1 ? gold : muted, marginBottom: '6px' }}>
              Rivalry #{rank}
            </div>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '18px' : '22px', color: text, fontWeight: '400' }}>
              {managerA.name}<ChatRoomiteTag slug={managerA.slug} /> vs {managerB.name}<ChatRoomiteTag slug={managerB.slug} />
            </h3>
          </div>
          {stats && (
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '16px' }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '24px' : '28px', color: text, marginBottom: '2px' }}>
                {stats.winsA}–{stats.winsB}
              </div>
              <div style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: muted }}>
                {leadingManager ? `${leadingManager.name.split(' ')[0]} leads` : 'Even'}
              </div>
            </div>
          )}
        </div>

        {synopsis && (
          <p style={{ fontSize: '13px', color: muted, lineHeight: 1.6, marginBottom: '14px', fontStyle: 'italic' }}>
            "{synopsis}"
          </p>
        )}

        {stats ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${effectiveMobile ? 3 : 4}, 1fr)`, gap: '12px', marginBottom: '12px' }}>
              {[
                ['Games', stats.games],
                ['Avg Margin', `${stats.avgMargin} pts`],
                ['Playoffs', stats.playoffMeetings],
                ...(!effectiveMobile ? [['Momentum', stats.recentMomentum ? `${stats.recentMomentum.name.split(' ')[0]} (L3Y)` : 'Even']] : []),
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '3px' }}>{label}</div>
                  <div style={{ fontSize: '13px', color: text, fontWeight: '500' }}>{val}</div>
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
        <p style={{ color: muted, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
          The Rivalry Index · curated by the league
        </p>
        <p style={{ color: muted, fontSize: '13px', marginBottom: '32px', maxWidth: '560px', lineHeight: 1.6 }}>
          Dan and Freed also share a table in a related league, Chat Room — the two are known collectively as the "Chatroomites."
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
