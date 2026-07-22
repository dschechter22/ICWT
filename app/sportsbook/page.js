'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'
export const dynamic = 'force-dynamic'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const ADMIN_PIN = '2910'
const SEASON = '2026-27'

const toDecimal = o => o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o)
const toAmerican = d => d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1))
const calcWin = (amt, odds) => odds > 0 ? Math.floor(amt * odds / 100) : Math.floor(amt * 100 / Math.abs(odds))
const fmtOdds = o => o > 0 ? `+${o}` : `${o}`

export default function SportsbookPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, green, red, gold } = useLayout()

  const [tab, setTab] = useState('lines')
  const [week, setWeek] = useState(1)
  const [games, setGames] = useState([])
  const [accounts, setAccounts] = useState([])
  const [myBets, setMyBets] = useState([])
  const [myParlays, setMyParlays] = useState([])
  const [loading, setLoading] = useState(true)

  const [playerName, setPlayerName] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [nameStep, setNameStep] = useState('name') // 'name' | 'pin'
  const [pendingName, setPendingName] = useState('')
  const [isNewAccount, setIsNewAccount] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')

  const [slip, setSlip] = useState([])
  const [slipAmounts, setSlipAmounts] = useState({})
  const [isParlay, setIsParlay] = useState(false)
  const [parlayAmt, setParlayAmt] = useState('')

  const [pickemPicks, setPickemPicks] = useState({})

  const [adminUnlocked, setAdminUnlocked] = useState(false)
  const [showPinModal, setShowPinModal] = useState(false)
  const [adminPinInput, setAdminPinInput] = useState('')
  const [adminPinError, setAdminPinError] = useState('')

  const [showGameForm, setShowGameForm] = useState(false)
  const [gameForm, setGameForm] = useState({ team_a: '', team_b: '', spread: '', over_under: '', ml_a: '-110', ml_b: '-110' })
  const [gameFormError, setGameFormError] = useState('')

  const [settleTarget, setSettleTarget] = useState(null)
  const [settleScores, setSettleScores] = useState({ a: '', b: '' })

  const [submitting, setSubmitting] = useState(false)
  const [flash, setFlash] = useState({ msg: '', ok: true })
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { if (mounted) { fetchGames(); fetchAccounts() } }, [mounted, week])

  const showFlash = (msg, ok = true) => {
    setFlash({ msg, ok })
    setTimeout(() => setFlash({ msg: '', ok: true }), 3500)
  }

  const fetchGames = async () => {
    setLoading(true)
    const { data } = await db.from('sb_games').select('*').eq('season', SEASON).eq('week', week).order('created_at')
    setGames(data || [])
    setLoading(false)
  }

  const fetchAccounts = async () => {
    const { data } = await db.from('gb_accounts').select('*').eq('season', SEASON).order('balance', { ascending: false })
    setAccounts(data || [])
  }

  const fetchMyBets = async (accountId) => {
    const { data: bets } = await db.from('sb_bets')
      .select('*, game:game_id(team_a, team_b, week, spread, over_under, score_a, score_b, is_settled)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
    const { data: parlays } = await db.from('sb_parlays')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
    const betList = bets || []
    setMyBets(betList)
    setMyParlays((parlays || []).map(p => ({ ...p, legs: betList.filter(b => b.parlay_id === p.id) })))
  }

  const myAccount = accounts.find(a => a.manager_name === playerName)

  const handleNameNext = () => {
    const name = nameInput.trim()
    if (!name) return
    const existing = accounts.find(a => a.manager_name === name)
    setPendingName(name)
    setIsNewAccount(!existing)
    setPinInput(''); setPinError('')
    setNameStep('pin')
  }

  const handlePinSubmit = async () => {
    if (!pinInput || pinInput.length < 4) return setPinError('PIN must be 4+ digits')
    if (isNewAccount) {
      const { data, error } = await db.from('gb_accounts').insert({ manager_name: pendingName, season: SEASON, balance: 1000, pin: pinInput }).select().single()
      if (error) return setPinError('Name already taken — try logging in')
      setPlayerName(pendingName)
      setNameStep('name'); setNameInput(''); setPinInput('')
      await fetchAccounts()
      fetchMyBets(data.id)
    } else {
      const { data } = await db.from('gb_accounts').select('*').eq('manager_name', pendingName).eq('season', SEASON).single()
      if (!data || data.pin !== pinInput) return setPinError('Incorrect PIN')
      setPlayerName(pendingName)
      setNameStep('name'); setNameInput(''); setPinInput('')
      fetchMyBets(data.id)
    }
  }

  // Bet slip helpers
  const inSlip = (gameId, betType, pick) => slip.some(s => s.gameId === gameId && s.betType === betType && s.pick === pick)
  const toggleBet = (game, betType, pick, odds) => {
    const key = `${game.id}-${betType}-${pick}`
    if (slip.find(s => s.key === key)) {
      const idx = slip.findIndex(s => s.key === key)
      setSlip(sl => sl.filter(s => s.key !== key))
      setSlipAmounts(a => { const n = { ...a }; delete n[idx]; return n })
    } else {
      const name = pick === 'over' ? 'Over' : pick === 'under' ? 'Under' : pick === 'team_a' ? game.team_a : game.team_b
      const typeLabel = betType === 'spread' ? 'Spread' : betType === 'ou' ? 'O/U' : 'ML'
      setSlip(sl => [...sl, { key, gameId: game.id, betType, pick, odds, label: `${typeLabel}: ${name} ${fmtOdds(odds)}`, gameName: `${game.team_a} vs ${game.team_b}` }])
    }
  }

  const placeSingles = async () => {
    if (!myAccount) return showFlash('Log in first', false)
    const amounts = slip.map((_, i) => parseInt(slipAmounts[i]) || 0)
    if (amounts.some(a => a <= 0)) return showFlash('Enter amounts for all bets', false)
    const total = amounts.reduce((a, b) => a + b, 0)
    if (total > myAccount.balance) return showFlash('Insufficient Dino Dollars', false)
    setSubmitting(true)
    await db.from('sb_bets').insert(slip.map((s, i) => ({ account_id: myAccount.id, game_id: s.gameId, bet_type: s.betType, pick: s.pick, amount: amounts[i], odds: s.odds, status: 'pending' })))
    const { data: fresh } = await db.from('gb_accounts').select('balance').eq('id', myAccount.id).single()
    await db.from('gb_accounts').update({ balance: fresh.balance - total }).eq('id', myAccount.id)
    setSlip([]); setSlipAmounts({})
    showFlash(`${slip.length} bet${slip.length > 1 ? 's' : ''} placed!`)
    fetchAccounts(); fetchMyBets(myAccount.id)
    setSubmitting(false)
  }

  const placeParlay = async () => {
    if (!myAccount) return showFlash('Log in first', false)
    if (slip.length < 2) return showFlash('Parlays need 2+ legs', false)
    const amt = parseInt(parlayAmt)
    if (!amt || amt <= 0) return showFlash('Enter parlay amount', false)
    if (amt > myAccount.balance) return showFlash('Insufficient Dino Dollars', false)
    setSubmitting(true)
    const combinedOdds = toAmerican(slip.reduce((a, s) => a * toDecimal(s.odds), 1))
    const { data: parlay } = await db.from('sb_parlays').insert({ account_id: myAccount.id, amount: amt, legs: slip.length, combined_odds: combinedOdds, status: 'pending' }).select().single()
    await db.from('sb_bets').insert(slip.map(s => ({ account_id: myAccount.id, game_id: s.gameId, bet_type: s.betType, pick: s.pick, amount: 0, odds: s.odds, status: 'pending', parlay_id: parlay.id })))
    const { data: fresh } = await db.from('gb_accounts').select('balance').eq('id', myAccount.id).single()
    await db.from('gb_accounts').update({ balance: fresh.balance - amt }).eq('id', myAccount.id)
    setSlip([]); setParlayAmt(''); setIsParlay(false)
    showFlash(`Parlay placed! ${fmtOdds(combinedOdds)}`)
    fetchAccounts(); fetchMyBets(myAccount.id)
    setSubmitting(false)
  }

  const submitPickem = async () => {
    if (!myAccount) return showFlash('Log in first', false)
    const newPicks = Object.entries(pickemPicks).filter(([gameId]) => !myBets.some(b => b.bet_type === 'pickem' && b.game_id === gameId))
    if (!newPicks.length) return showFlash('No new picks to submit', false)
    setSubmitting(true)
    await db.from('sb_bets').insert(newPicks.map(([gameId, pick]) => ({ account_id: myAccount.id, game_id: gameId, bet_type: 'pickem', pick, amount: 0, odds: 0, status: 'pending' })))
    showFlash('Picks submitted!')
    fetchMyBets(myAccount.id)
    setSubmitting(false)
  }

  const handleAddGame = async () => {
    if (!gameForm.team_a.trim() || !gameForm.team_b.trim()) return setGameFormError('Both team names required')
    setSubmitting(true)
    const { error } = await db.from('sb_games').insert({ season: SEASON, week, team_a: gameForm.team_a.trim(), team_b: gameForm.team_b.trim(), spread: gameForm.spread ? parseFloat(gameForm.spread) : null, over_under: gameForm.over_under ? parseFloat(gameForm.over_under) : null, ml_a: parseInt(gameForm.ml_a) || -110, ml_b: parseInt(gameForm.ml_b) || -110 })
    if (error) { setGameFormError('Failed to add'); setSubmitting(false); return }
    setGameForm({ team_a: '', team_b: '', spread: '', over_under: '', ml_a: '-110', ml_b: '-110' })
    setShowGameForm(false); setGameFormError('')
    fetchGames(); setSubmitting(false)
  }

  const handleSettle = async () => {
    const sA = parseFloat(settleScores.a), sB = parseFloat(settleScores.b)
    if (isNaN(sA) || isNaN(sB)) return showFlash('Enter valid scores', false)
    setSubmitting(true)
    const game = settleTarget
    const { data: gameBets } = await db.from('sb_bets').select('*').eq('game_id', game.id).eq('status', 'pending')
    const total = sA + sB

    for (const bet of (gameBets || [])) {
      let status = 'push'
      if (bet.bet_type === 'spread' && game.spread != null) {
        if (bet.pick === 'team_a') status = sA + game.spread > sB ? 'won' : sA + game.spread < sB ? 'lost' : 'push'
        else status = sB - game.spread > sA ? 'won' : sB - game.spread < sA ? 'lost' : 'push'
      }
      if (bet.bet_type === 'ou' && game.over_under != null) {
        if (bet.pick === 'over') status = total > game.over_under ? 'won' : total < game.over_under ? 'lost' : 'push'
        else status = total < game.over_under ? 'won' : total > game.over_under ? 'lost' : 'push'
      }
      if (bet.bet_type === 'ml') {
        if (bet.pick === 'team_a') status = sA > sB ? 'won' : sA < sB ? 'lost' : 'push'
        else status = sB > sA ? 'won' : sB < sA ? 'lost' : 'push'
      }
      if (bet.bet_type === 'pickem') {
        status = (bet.pick === 'team_a' ? sA > sB : sB > sA) ? 'won' : 'lost'
      }
      const winAmt = status === 'won' ? (bet.bet_type === 'pickem' ? 20 : calcWin(bet.amount, bet.odds)) : 0
      await db.from('sb_bets').update({ status, win_amount: winAmt }).eq('id', bet.id)
      const { data: a } = await db.from('gb_accounts').select('balance').eq('id', bet.account_id).single()
      if (status === 'won') await db.from('gb_accounts').update({ balance: a.balance + bet.amount + winAmt }).eq('id', bet.account_id)
      else if (status === 'push') await db.from('gb_accounts').update({ balance: a.balance + bet.amount }).eq('id', bet.account_id)
    }

    // Settle parlays
    const parlayIds = [...new Set((gameBets || []).filter(b => b.parlay_id).map(b => b.parlay_id))]
    for (const pid of parlayIds) {
      const { data: legs } = await db.from('sb_bets').select('status').eq('parlay_id', pid)
      if (!legs || legs.some(l => l.status === 'pending')) continue
      const { data: p } = await db.from('sb_parlays').select('*').eq('id', pid).single()
      if (!p) continue
      const won = legs.every(l => l.status === 'won')
      const winAmt = won ? calcWin(p.amount, p.combined_odds) : 0
      await db.from('sb_parlays').update({ status: won ? 'won' : 'lost', win_amount: winAmt }).eq('id', pid)
      if (won) {
        const { data: a } = await db.from('gb_accounts').select('balance').eq('id', p.account_id).single()
        await db.from('gb_accounts').update({ balance: a.balance + p.amount + winAmt }).eq('id', p.account_id)
      }
    }

    await db.from('sb_games').update({ is_settled: true, is_locked: true, score_a: sA, score_b: sB }).eq('id', game.id)
    setSettleTarget(null); setSettleScores({ a: '', b: '' })
    showFlash('Game settled!')
    fetchGames(); fetchAccounts()
    if (myAccount) fetchMyBets(myAccount.id)
    setSubmitting(false)
  }

  if (!mounted) return null

  const inp = { background: d ? '#111' : '#e8e4dc', border: `1px solid ${border}`, color: text, padding: '8px 12px', fontSize: '13px', fontFamily: "'Inter', sans-serif", outline: 'none' }
  const lbl = { fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: muted, display: 'block', marginBottom: '4px' }
  const tabBtn = active => ({ background: active ? text : 'none', color: active ? bg : muted, border: `1px solid ${border}`, padding: '6px 14px', cursor: 'pointer', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", fontWeight: active ? '600' : '400' })
  const betBtn = active => ({ background: active ? text : 'none', color: active ? bg : muted, border: `1px solid ${active ? text : border}`, padding: '5px 10px', cursor: 'pointer', fontSize: '11px', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' })
  const weeks = Array.from({ length: 17 }, (_, i) => i + 1)

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />

      {/* Admin PIN modal */}
      {showPinModal && (
        <>
          <div onClick={() => setShowPinModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 201, background: d ? '#0a0a0a' : '#f4f1ec', border: `1px solid ${border}`, padding: '28px', width: effectiveMobile ? '90vw' : '320px' }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: '18px', marginBottom: '16px', color: text }}>Admin Access</h3>
            <input type="password" placeholder="PIN" value={adminPinInput}
              onChange={e => { setAdminPinInput(e.target.value); setAdminPinError('') }}
              onKeyDown={e => { if (e.key === 'Enter') { if (adminPinInput === ADMIN_PIN) { setAdminUnlocked(true); setShowPinModal(false); setAdminPinInput('') } else setAdminPinError('Wrong PIN') }}}
              style={{ ...inp, width: '100%', marginBottom: '8px' }} />
            {adminPinError && <p style={{ fontSize: '12px', color: red, marginBottom: '8px' }}>{adminPinError}</p>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button onClick={() => { if (adminPinInput === ADMIN_PIN) { setAdminUnlocked(true); setShowPinModal(false); setAdminPinInput('') } else setAdminPinError('Wrong PIN') }}
                style={{ background: text, color: bg, border: 'none', padding: '10px 20px', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif", flex: 1 }}>Unlock</button>
              <button onClick={() => setShowPinModal(false)} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '10px 20px', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
            </div>
          </div>
        </>
      )}

      {/* Settle modal */}
      {settleTarget && (
        <>
          <div onClick={() => setSettleTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 201, background: d ? '#0a0a0a' : '#f4f1ec', border: `1px solid ${border}`, padding: '28px', width: effectiveMobile ? '90vw' : '380px' }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: '18px', marginBottom: '4px', color: text }}>Settle Game</h3>
            <p style={{ fontSize: '12px', color: muted, marginBottom: '20px' }}>{settleTarget.team_a} vs {settleTarget.team_b}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div><label style={lbl}>{settleTarget.team_a}</label><input value={settleScores.a} onChange={e => setSettleScores(s => ({ ...s, a: e.target.value }))} style={{ ...inp, width: '100%' }} /></div>
              <div><label style={lbl}>{settleTarget.team_b}</label><input value={settleScores.b} onChange={e => setSettleScores(s => ({ ...s, b: e.target.value }))} style={{ ...inp, width: '100%' }} /></div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleSettle} disabled={submitting} style={{ background: green, color: '#fff', border: 'none', padding: '10px 20px', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif", fontWeight: '500', flex: 1 }}>Settle</button>
              <button onClick={() => setSettleTarget(null)} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '10px 20px', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
            </div>
          </div>
        </>
      )}

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 120px' : '120px 24px 80px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px,6vw,64px)', fontWeight: '400', letterSpacing: '-0.02em' }}>Sportsbook</h1>
            {myAccount && <p style={{ fontSize: '13px', color: gold, marginTop: '4px' }}>💰 {myAccount.balance.toLocaleString()} Dino Dollars</p>}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {!playerName ? (
              nameStep === 'name' ? (
                <>
                  <input value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleNameNext()} placeholder="Your name..." style={{ ...inp, width: '140px' }} />
                  <button onClick={handleNameNext} style={{ background: text, color: bg, border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: '11px', fontFamily: "'Inter', sans-serif", fontWeight: '500' }}>Next</button>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: muted }}>{isNewAccount ? `Create account for ${pendingName}` : `Welcome back, ${pendingName}`}</span>
                    <button onClick={() => { setNameStep('name'); setPinError('') }} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '11px', fontFamily: "'Inter', sans-serif", textDecoration: 'underline', padding: 0 }}>change</button>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="password" value={pinInput} onChange={e => { setPinInput(e.target.value); setPinError('') }} onKeyDown={e => e.key === 'Enter' && handlePinSubmit()} placeholder={isNewAccount ? 'Set a PIN (4+ digits)' : 'PIN'} style={{ ...inp, width: '180px' }} />
                    <button onClick={handlePinSubmit} style={{ background: text, color: bg, border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: '11px', fontFamily: "'Inter', sans-serif", fontWeight: '500', whiteSpace: 'nowrap' }}>
                      {isNewAccount ? 'Create' : 'Login'}
                    </button>
                  </div>
                  {pinError && <p style={{ fontSize: '11px', color: red, margin: 0 }}>{pinError}</p>}
                </div>
              )
            ) : (
              <>
                <span style={{ fontSize: '12px', color: muted }}>Playing as <strong style={{ color: text }}>{playerName}</strong></span>
                <button onClick={() => { setPlayerName(''); setNameInput(''); setNameStep('name') }} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '4px 10px', cursor: 'pointer', fontSize: '10px', fontFamily: "'Inter', sans-serif" }}>Switch</button>
              </>
            )}
            {!adminUnlocked
              ? <button onClick={() => setShowPinModal(true)} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '8px 14px', cursor: 'pointer', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif" }}>Admin</button>
              : <button onClick={() => setAdminUnlocked(false)} style={{ background: 'none', border: `1px solid ${gold}`, color: gold, padding: '8px 14px', cursor: 'pointer', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif" }}>Admin ✓</button>
            }
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {[['lines', 'Lines'], ['pickem', "Pick'em"], ['mybets', 'My Bets'], ['leaderboard', 'Leaderboard']].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={tabBtn(tab === t)}>{label}</button>
          ))}
        </div>

        {/* ── LINES ── */}
        {tab === 'lines' && (
          <>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: '4px' }}>Week</span>
              {weeks.map(w => <button key={w} onClick={() => setWeek(w)} style={{ background: week === w ? text : 'none', color: week === w ? bg : muted, border: `1px solid ${border}`, padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontFamily: "'Inter', sans-serif" }}>{w}</button>)}
            </div>

            {adminUnlocked && (
              <div style={{ marginBottom: '20px' }}>
                {!showGameForm
                  ? <button onClick={() => setShowGameForm(true)} style={{ background: 'none', border: `1px solid ${gold}`, color: gold, padding: '8px 16px', cursor: 'pointer', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif" }}>+ Add Game</button>
                  : (
                    <div style={{ background: cardBg, border: `1px solid ${border}`, padding: '20px', marginBottom: '16px' }}>
                      <p style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: gold, marginBottom: '16px' }}>New Game — Week {week}</p>
                      <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div><label style={lbl}>Team A (Favorite)</label><input value={gameForm.team_a} onChange={e => setGameForm(f => ({ ...f, team_a: e.target.value }))} placeholder="e.g. Danny" style={{ ...inp, width: '100%' }} /></div>
                        <div><label style={lbl}>Team B</label><input value={gameForm.team_b} onChange={e => setGameForm(f => ({ ...f, team_b: e.target.value }))} placeholder="e.g. Mike" style={{ ...inp, width: '100%' }} /></div>
                        <div><label style={lbl}>Spread (Team A, e.g. -6.5)</label><input value={gameForm.spread} onChange={e => setGameForm(f => ({ ...f, spread: e.target.value }))} placeholder="-6.5" style={{ ...inp, width: '100%' }} /></div>
                        <div><label style={lbl}>Over/Under</label><input value={gameForm.over_under} onChange={e => setGameForm(f => ({ ...f, over_under: e.target.value }))} placeholder="220.5" style={{ ...inp, width: '100%' }} /></div>
                        <div><label style={lbl}>ML Team A</label><input value={gameForm.ml_a} onChange={e => setGameForm(f => ({ ...f, ml_a: e.target.value }))} placeholder="-150" style={{ ...inp, width: '100%' }} /></div>
                        <div><label style={lbl}>ML Team B</label><input value={gameForm.ml_b} onChange={e => setGameForm(f => ({ ...f, ml_b: e.target.value }))} placeholder="+130" style={{ ...inp, width: '100%' }} /></div>
                      </div>
                      {gameFormError && <p style={{ fontSize: '12px', color: red, marginBottom: '8px' }}>{gameFormError}</p>}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={handleAddGame} disabled={submitting} style={{ background: gold, color: '#000', border: 'none', padding: '10px 20px', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif", fontWeight: '500' }}>Add Game</button>
                        <button onClick={() => { setShowGameForm(false); setGameFormError('') }} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '10px 16px', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
                      </div>
                    </div>
                  )}
              </div>
            )}

            {loading && <p style={{ color: muted, fontSize: '13px' }}>Loading...</p>}
            {!loading && games.length === 0 && <p style={{ color: muted, fontSize: '13px', padding: '32px 0' }}>No games for Week {week} yet.</p>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {games.map(game => (
                <div key={game.id} style={{ background: cardBg, border: `1px solid ${border}` }}>
                  <div style={{ padding: '14px 16px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '17px', color: text }}>{game.team_a} <span style={{ color: muted, fontSize: '13px' }}>vs</span> {game.team_b}</div>
                      {game.is_settled && <div style={{ fontSize: '12px', color: gold, marginTop: '2px' }}>Final: {game.score_a} – {game.score_b}</div>}
                      {game.is_locked && !game.is_settled && <div style={{ fontSize: '10px', color: red, marginTop: '2px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Locked</div>}
                    </div>
                    {adminUnlocked && !game.is_settled && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={async () => { await db.from('sb_games').update({ is_locked: !game.is_locked }).eq('id', game.id); fetchGames() }} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '4px 10px', cursor: 'pointer', fontSize: '10px', fontFamily: "'Inter', sans-serif" }}>{game.is_locked ? 'Unlock' : 'Lock'}</button>
                        <button onClick={() => setSettleTarget(game)} style={{ background: 'none', border: `1px solid ${green}`, color: green, padding: '4px 10px', cursor: 'pointer', fontSize: '10px', fontFamily: "'Inter', sans-serif" }}>Settle</button>
                      </div>
                    )}
                  </div>
                  {!game.is_locked && !game.is_settled && (
                    <div style={{ padding: '12px 16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {game.spread != null && <>
                        <button onClick={() => toggleBet(game, 'spread', 'team_a', -110)} style={betBtn(inSlip(game.id, 'spread', 'team_a'))}>{game.team_a} {game.spread > 0 ? `+${game.spread}` : game.spread} <span style={{ color: muted, fontSize: '10px' }}>(-110)</span></button>
                        <button onClick={() => toggleBet(game, 'spread', 'team_b', -110)} style={betBtn(inSlip(game.id, 'spread', 'team_b'))}>{game.team_b} {game.spread < 0 ? `+${Math.abs(game.spread)}` : `-${game.spread}`} <span style={{ color: muted, fontSize: '10px' }}>(-110)</span></button>
                      </>}
                      {game.over_under != null && <>
                        <button onClick={() => toggleBet(game, 'ou', 'over', -110)} style={betBtn(inSlip(game.id, 'ou', 'over'))}>Over {game.over_under} <span style={{ color: muted, fontSize: '10px' }}>(-110)</span></button>
                        <button onClick={() => toggleBet(game, 'ou', 'under', -110)} style={betBtn(inSlip(game.id, 'ou', 'under'))}>Under {game.over_under} <span style={{ color: muted, fontSize: '10px' }}>(-110)</span></button>
                      </>}
                      <button onClick={() => toggleBet(game, 'ml', 'team_a', game.ml_a)} style={betBtn(inSlip(game.id, 'ml', 'team_a'))}>{game.team_a} ML <span style={{ color: muted, fontSize: '10px' }}>{fmtOdds(game.ml_a)}</span></button>
                      <button onClick={() => toggleBet(game, 'ml', 'team_b', game.ml_b)} style={betBtn(inSlip(game.id, 'ml', 'team_b'))}>{game.team_b} ML <span style={{ color: muted, fontSize: '10px' }}>{fmtOdds(game.ml_b)}</span></button>
                    </div>
                  )}
                  {game.is_settled && (
                    <div style={{ padding: '10px 16px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      {game.spread != null && <span style={{ fontSize: '12px', color: muted }}>Spread: {game.team_a} {game.spread > 0 ? `+${game.spread}` : game.spread}</span>}
                      {game.over_under != null && <span style={{ fontSize: '12px', color: muted }}>O/U: {game.over_under} · Total: {game.score_a + game.score_b}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Bet Slip */}
            {slip.length > 0 && (
              <div style={{ marginTop: '24px', background: cardBg, border: `1px solid ${border}` }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: text, fontWeight: '600' }}>Bet Slip ({slip.length})</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => setIsParlay(false)} style={tabBtn(!isParlay)}>Singles</button>
                    <button onClick={() => setIsParlay(true)} disabled={slip.length < 2} style={{ ...tabBtn(isParlay), opacity: slip.length < 2 ? 0.4 : 1 }}>Parlay</button>
                  </div>
                </div>
                <div style={{ padding: '12px 16px' }}>
                  {slip.map((s, i) => (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                      <button onClick={() => { setSlip(sl => sl.filter((_, j) => j !== i)); setSlipAmounts(a => { const n = { ...a }; delete n[i]; return n }) }} style={{ background: 'none', border: 'none', color: red, cursor: 'pointer', fontSize: '14px', padding: 0 }}>✕</button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', color: text }}>{s.label}</div>
                        <div style={{ fontSize: '11px', color: muted }}>{s.gameName}</div>
                      </div>
                      {!isParlay && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input type="number" min="1" value={slipAmounts[i] || ''} onChange={e => setSlipAmounts(a => ({ ...a, [i]: e.target.value }))} placeholder="DD" style={{ ...inp, width: '80px', padding: '6px 10px' }} />
                          {slipAmounts[i] && parseInt(slipAmounts[i]) > 0 && <span style={{ fontSize: '11px', color: green, whiteSpace: 'nowrap' }}>+{calcWin(parseInt(slipAmounts[i]), s.odds)}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                  {isParlay && (
                    <div style={{ borderTop: `1px solid ${border}`, paddingTop: '12px', marginTop: '4px' }}>
                      <div style={{ fontSize: '12px', color: muted, marginBottom: '8px' }}>
                        Combined: <strong style={{ color: text }}>{fmtOdds(toAmerican(slip.reduce((a, s) => a * toDecimal(s.odds), 1)))}</strong>
                        {parlayAmt && parseInt(parlayAmt) > 0 && <> · Win: <strong style={{ color: green }}>{calcWin(parseInt(parlayAmt), toAmerican(slip.reduce((a, s) => a * toDecimal(s.odds), 1)))} DD</strong></>}
                      </div>
                      <input type="number" min="1" value={parlayAmt} onChange={e => setParlayAmt(e.target.value)} placeholder="Stake (DD)" style={{ ...inp, width: '160px' }} />
                    </div>
                  )}
                  {flash.msg && <p style={{ fontSize: '12px', color: flash.ok ? green : red, marginTop: '8px' }}>{flash.msg}</p>}
                  <button onClick={isParlay ? placeParlay : placeSingles} disabled={submitting} style={{ background: text, color: bg, border: 'none', padding: '12px 24px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", fontWeight: '500', marginTop: '12px', opacity: submitting ? 0.6 : 1 }}>
                    {submitting ? 'Placing...' : isParlay ? 'Place Parlay' : 'Place Bets'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── PICK'EM ── */}
        {tab === 'pickem' && (
          <>
            <p style={{ fontSize: '13px', color: muted, marginBottom: '20px' }}>Pick the straight-up winner. Correct pick = <strong style={{ color: gold }}>+20 Dino Dollars</strong>. Free to enter.</p>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: '4px' }}>Week</span>
              {weeks.map(w => <button key={w} onClick={() => setWeek(w)} style={{ background: week === w ? text : 'none', color: week === w ? bg : muted, border: `1px solid ${border}`, padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontFamily: "'Inter', sans-serif" }}>{w}</button>)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {games.map(game => {
                const existingPick = myBets.find(b => b.bet_type === 'pickem' && b.game_id === game.id)
                return (
                  <div key={game.id} style={{ background: cardBg, border: `1px solid ${border}`, padding: '16px' }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '15px', color: text, marginBottom: '10px' }}>
                      {game.team_a} vs {game.team_b}
                      {game.is_settled && <span style={{ fontSize: '12px', color: gold, marginLeft: '12px' }}>Final: {game.score_a}–{game.score_b}</span>}
                    </div>
                    {existingPick ? (
                      <div style={{ fontSize: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <span style={{ color: muted }}>Picked: <strong style={{ color: text }}>{existingPick.pick === 'team_a' ? game.team_a : game.team_b}</strong></span>
                        {existingPick.status !== 'pending' && <span style={{ fontWeight: '600', color: existingPick.status === 'won' ? green : red }}>{existingPick.status === 'won' ? '+20 DD ✓' : 'Lost'}</span>}
                      </div>
                    ) : game.is_locked || game.is_settled ? (
                      <span style={{ fontSize: '12px', color: muted }}>Locked — no pick submitted</span>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setPickemPicks(p => ({ ...p, [game.id]: 'team_a' }))} style={betBtn(pickemPicks[game.id] === 'team_a')}>{game.team_a}</button>
                        <button onClick={() => setPickemPicks(p => ({ ...p, [game.id]: 'team_b' }))} style={betBtn(pickemPicks[game.id] === 'team_b')}>{game.team_b}</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {Object.keys(pickemPicks).some(id => !myBets.some(b => b.bet_type === 'pickem' && b.game_id === id)) && (
              <>
                {flash.msg && <p style={{ fontSize: '12px', color: flash.ok ? green : red, marginBottom: '8px' }}>{flash.msg}</p>}
                <button onClick={submitPickem} disabled={submitting} style={{ background: text, color: bg, border: 'none', padding: '12px 24px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", fontWeight: '500', opacity: submitting ? 0.6 : 1 }}>Submit Picks</button>
              </>
            )}
          </>
        )}

        {/* ── MY BETS ── */}
        {tab === 'mybets' && (
          <>
            {!playerName && <p style={{ color: muted, fontSize: '13px' }}>Enter your name above to see your bets.</p>}
            {playerName && myBets.length === 0 && myParlays.length === 0 && <p style={{ color: muted, fontSize: '13px' }}>No bets yet.</p>}

            {myBets.filter(b => !b.parlay_id && b.bet_type !== 'pickem').length > 0 && (
              <>
                <p style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '10px' }}>Singles</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
                  {myBets.filter(b => !b.parlay_id && b.bet_type !== 'pickem').map(bet => (
                    <div key={bet.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'center', padding: '12px 16px', background: cardBg, border: `1px solid ${border}` }}>
                      <div>
                        <div style={{ fontSize: '13px', color: text }}>
                          {bet.bet_type === 'spread' ? 'Spread' : bet.bet_type === 'ou' ? 'O/U' : 'ML'}: {bet.pick === 'team_a' ? bet.game?.team_a : bet.pick === 'team_b' ? bet.game?.team_b : bet.pick === 'over' ? 'Over' : 'Under'} {fmtOdds(bet.odds)}
                        </div>
                        <div style={{ fontSize: '11px', color: muted }}>{bet.game?.team_a} vs {bet.game?.team_b} · Wk {bet.game?.week}</div>
                      </div>
                      <span style={{ fontSize: '12px', color: muted }}>{bet.amount} DD</span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: bet.status === 'won' ? green : bet.status === 'lost' ? red : bet.status === 'push' ? muted : gold }}>
                        {bet.status === 'won' ? `+${bet.win_amount} DD` : bet.status === 'lost' ? 'Lost' : bet.status === 'push' ? 'Push' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {myParlays.length > 0 && (
              <>
                <p style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '10px' }}>Parlays</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                  {myParlays.map(p => (
                    <div key={p.id} style={{ background: cardBg, border: `1px solid ${border}`, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', color: text }}>{p.legs.length}-Leg Parlay · {fmtOdds(p.combined_odds)} · {p.amount} DD</span>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: p.status === 'won' ? green : p.status === 'lost' ? red : gold }}>
                          {p.status === 'won' ? `+${p.win_amount} DD` : p.status === 'lost' ? 'Lost' : 'Pending'}
                        </span>
                      </div>
                      {p.legs.map((leg, i) => (
                        <div key={i} style={{ fontSize: '11px', color: muted, paddingLeft: '8px', marginBottom: '2px' }}>
                          {leg.game?.team_a} vs {leg.game?.team_b}: {leg.pick === 'team_a' ? leg.game?.team_a : leg.pick === 'team_b' ? leg.game?.team_b : leg.pick}
                          {' '}<span style={{ color: leg.status === 'won' ? green : leg.status === 'lost' ? red : muted }}>({leg.status})</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}

            {myBets.filter(b => b.bet_type === 'pickem').length > 0 && (
              <>
                <p style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '10px' }}>Pick'em</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {myBets.filter(b => b.bet_type === 'pickem').map(bet => (
                    <div key={bet.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center', padding: '12px 16px', background: cardBg, border: `1px solid ${border}` }}>
                      <div>
                        <div style={{ fontSize: '13px', color: text }}>Picked: {bet.pick === 'team_a' ? bet.game?.team_a : bet.game?.team_b}</div>
                        <div style={{ fontSize: '11px', color: muted }}>{bet.game?.team_a} vs {bet.game?.team_b} · Wk {bet.game?.week}</div>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: bet.status === 'won' ? green : bet.status === 'lost' ? red : gold }}>
                        {bet.status === 'won' ? '+20 DD' : bet.status === 'lost' ? 'Lost' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── LEADERBOARD ── */}
        {tab === 'leaderboard' && (
          <>
            <p style={{ fontSize: '12px', color: muted, marginBottom: '20px' }}>Year-end Dino Dollars total determines next season's draft order. Highest DD = first pick.</p>
            {accounts.length === 0 && <p style={{ color: muted, fontSize: '13px' }}>No accounts yet. Place a bet or make a pick to start.</p>}
            <div style={{ border: `1px solid ${border}` }}>
              {accounts.map((acc, i) => (
                <div key={acc.id} style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', alignItems: 'center', padding: '14px 16px', borderBottom: i < accounts.length - 1 ? `1px solid ${border}` : 'none', background: acc.manager_name === playerName ? (d ? 'rgba(255,255,255,0.04)' : 'rgba(13,33,82,0.04)') : 'transparent' }}>
                  <span style={{ fontSize: i < 3 ? '18px' : '13px', fontWeight: '700', color: i === 0 ? gold : i === 1 ? '#aaa' : i === 2 ? '#cd7f32' : muted }}>
                    {i + 1}{['st','nd','rd'][i] ?? 'th'}
                  </span>
                  <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '16px', color: text }}>{acc.manager_name}</span>
                  <span style={{ fontSize: '15px', fontWeight: '700', color: gold }}>{acc.balance.toLocaleString()} DD</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
