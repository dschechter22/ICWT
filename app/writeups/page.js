'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const ADMIN_PIN = '2910'
const TYPES = ['power_rankings', 'weekly_summary', 'mock_draft', 'rumor_mill', 'trade_block', 'group_discussion', 'other']
const TYPE_LABELS = {
  power_rankings: 'Power Rankings',
  weekly_summary: 'Weekly Summary',
  mock_draft: 'Mock Draft',
  rumor_mill: 'Rumor Mill',
  trade_block: 'Trade Block',
  group_discussion: 'Group Discussion',
  other: 'Other',
}
const WEEK_OPTIONS = [
  { value: '', label: 'Season-level' },
  { value: '0', label: 'Preseason' },
  ...Array.from({ length: 17 }, (_, i) => ({ value: String(i + 1), label: `Week ${i + 1}` })),
  { value: '18', label: 'Postseason' },
  { value: '19', label: 'Offseason' },
]
const YEARS = Array.from({ length: 12 }, (_, i) => 2015 + i) // 2015–2026

const weekLabel = (week) => {
  if (week === null || week === undefined || week === '') return ''
  const n = parseInt(week)
  if (n === 0) return ' · Preseason'
  if (n === 18) return ' · Postseason'
  if (n === 19) return ' · Offseason'
  return ` · Week ${n}`
}

export default function WriteupsPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, green, red, gold } = useLayout()
  const contentRef = useRef(null)

  const [writeups, setWriteups] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('feed')
  const [editTarget, setEditTarget] = useState(null)
  const [filterYear, setFilterYear] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterAuthor, setFilterAuthor] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [pinModal, setPinModal] = useState(null)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [form, setForm] = useState({
    season_year: 2026, week: '', type: 'power_rankings',
    title: '', content: '', author_name: '', pin: '',
  })
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // comments
  const [comments, setComments] = useState({})
  const [commentForms, setCommentForms] = useState({})
  const [commentSubmitting, setCommentSubmitting] = useState({})
  const [commentErrors, setCommentErrors] = useState({})
  const [commentPinModal, setCommentPinModal] = useState(null) // {commentId, writeupId, pin}
  const [commentPinInput, setCommentPinInput] = useState('')
  const [commentPinError, setCommentPinError] = useState('')

  const [copiedId, setCopiedId] = useState(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { fetchWriteups() }, [])
  useEffect(() => { if (expandedId) fetchComments(expandedId) }, [expandedId])

  // On load, auto-expand writeup from URL hash
  useEffect(() => {
    if (!mounted || !writeups.length) return
    const hash = window.location.hash.replace('#', '')
    if (hash && writeups.some(w => w.id === hash)) {
      setExpandedId(hash)
      setTimeout(() => {
        document.getElementById(`writeup-${hash}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [mounted, writeups])

  const fetchWriteups = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('writeups')
      .select('*')
      .order('season_year', { ascending: false })
      .order('created_at', { ascending: false })
    setWriteups(data || [])
    setLoading(false)
  }

  const fetchComments = async (writeupId) => {
    const { data } = await supabase.from('writeup_comments').select('*').eq('writeup_id', writeupId).order('created_at')
    setComments(c => ({ ...c, [writeupId]: data || [] }))
  }

  const handleSubmit = async () => {
    if (!form.title.trim()) return setFormError('Title is required.')
    if (!form.content.trim()) return setFormError('Content is required.')
    if (!form.author_name.trim()) return setFormError('Author name is required.')
    if (!form.pin.trim() || form.pin.length < 4) return setFormError('PIN must be at least 4 digits.')
    setFormError('')
    setSubmitting(true)
    const weekVal = form.week !== '' ? parseInt(form.week) : null
    if (editTarget) {
      const { error } = await supabase.from('writeups').update({
        season_year: form.season_year, week: weekVal, type: form.type,
        title: form.title, content: form.content, author_name: form.author_name,
      }).eq('id', editTarget.id)
      if (error) { setFormError('Failed to save. Try again.'); setSubmitting(false); return }
      setFormSuccess('Writeup updated.')
    } else {
      const { error } = await supabase.from('writeups').insert({
        season_year: form.season_year, week: weekVal, type: form.type,
        title: form.title, content: form.content, author_name: form.author_name, pin: form.pin,
      })
      if (error) { setFormError('Failed to save. Try again.'); setSubmitting(false); return }
      setFormSuccess('Writeup posted!')
    }
    setSubmitting(false)
    setForm({ season_year: 2026, week: '', type: 'power_rankings', title: '', content: '', author_name: '', pin: '' })
    setEditTarget(null)
    setView('feed')
    fetchWriteups()
  }

  const handlePinSubmit = async () => {
    const { writeupId, action } = pinModal
    const writeup = writeups.find(w => w.id === writeupId)
    if (!writeup) return
    if (pinInput !== writeup.pin && pinInput !== ADMIN_PIN) { setPinError('Incorrect PIN.'); return }
    setPinError(''); setPinModal(null); setPinInput('')
    if (action === 'delete') {
      await supabase.from('writeups').delete().eq('id', writeupId)
      fetchWriteups()
    } else if (action === 'edit') {
      const weekStr = writeup.week !== null && writeup.week !== undefined ? String(writeup.week) : ''
      setForm({ season_year: writeup.season_year, week: weekStr, type: writeup.type, title: writeup.title, content: writeup.content, author_name: writeup.author_name, pin: writeup.pin })
      setEditTarget(writeup)
      setView('edit')
    }
  }

  const submitComment = async (writeupId) => {
    const cf = commentForms[writeupId] || {}
    if (!cf.author_name?.trim()) return setCommentErrors(e => ({ ...e, [writeupId]: 'Name required.' }))
    if (!cf.content?.trim()) return setCommentErrors(e => ({ ...e, [writeupId]: 'Comment required.' }))
    if (!cf.pin?.trim() || cf.pin.length < 4) return setCommentErrors(e => ({ ...e, [writeupId]: 'PIN must be 4+ digits.' }))
    setCommentErrors(e => ({ ...e, [writeupId]: '' }))
    setCommentSubmitting(s => ({ ...s, [writeupId]: true }))
    const { error } = await supabase.from('writeup_comments').insert({ writeup_id: writeupId, author_name: cf.author_name.trim(), content: cf.content.trim(), pin: cf.pin })
    setCommentSubmitting(s => ({ ...s, [writeupId]: false }))
    if (error) return setCommentErrors(e => ({ ...e, [writeupId]: 'Failed to post.' }))
    setCommentForms(f => ({ ...f, [writeupId]: { author_name: cf.author_name, content: '', pin: '' } }))
    fetchComments(writeupId)
  }

  const handleCommentPinSubmit = async () => {
    const { commentId, writeupId, pin } = commentPinModal
    if (commentPinInput !== pin && commentPinInput !== ADMIN_PIN) { setCommentPinError('Incorrect PIN.'); return }
    setCommentPinError(''); setCommentPinModal(null); setCommentPinInput('')
    await supabase.from('writeup_comments').delete().eq('id', commentId)
    fetchComments(writeupId)
  }

  const handlePaste = (e) => {
    const html = e.clipboardData.getData('text/html')
    if (!html) return
    e.preventDefault()
    const temp = document.createElement('div')
    temp.innerHTML = html
    // Strip style/script/head — Word includes huge CSS blocks as text nodes
    temp.querySelectorAll('style, script, head').forEach(el => el.remove())
    // Use body content if present, otherwise the whole fragment
    const root = temp.querySelector('body') || temp
    const convert = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        // Collapse source-formatting whitespace (tabs, newlines) to spaces
        return node.textContent.replace(/[\r\n\t]+/g, ' ')
      }
      const tag = node.tagName?.toLowerCase()
      if (!tag || tag === 'style' || tag === 'script') return ''
      if (tag.includes(':')) return '' // skip Word-specific tags like <o:p>
      const style = node.style || {}
      const children = Array.from(node.childNodes).map(convert).join('')
      const trimmed = children.trim()
      if (!trimmed) return '' // skip empty elements so they don't leave orphan newlines
      const isBold = tag === 'b' || tag === 'strong' || style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 700
      const isItalic = tag === 'i' || tag === 'em' || style.fontStyle === 'italic'
      let result = trimmed
      if (isItalic) result = `*${result}*`
      if (isBold) result = `**${result}**`
      if (tag === 'p' || tag === 'div') result = result + '\n'
      if (tag === 'br') result = '\n'
      if (tag === 'li') result = result + '\n'
      return result
    }
    const converted = convert(root).replace(/\n{3,}/g, '\n\n').trim()
    const ta = contentRef.current
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const newVal = ta.value.substring(0, start) + converted + ta.value.substring(end)
    setForm(f => ({ ...f, content: newVal }))
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + converted.length, start + converted.length) }, 0)
  }

  const applyFormat = (tag) => {
    const ta = contentRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = ta.value.substring(start, end)
    const wrapper = tag === 'bold' ? '**' : '*'
    const newVal = ta.value.substring(0, start) + wrapper + selected + wrapper + ta.value.substring(end)
    setForm(f => ({ ...f, content: newVal }))
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + wrapper.length, end + wrapper.length)
    }, 0)
  }

  if (!mounted) return null

  const allAuthors = [...new Set((writeups || []).map(w => w.author_name))].filter(Boolean).sort()
  const filteredWriteups = (writeups || []).filter(w => {
    if (filterYear !== 'all' && w.season_year !== parseInt(filterYear)) return false
    if (filterType !== 'all' && w.type !== filterType) return false
    if (filterAuthor !== 'all' && w.author_name !== filterAuthor) return false
    return true
  })

  const inputStyle = {
    background: d ? '#111' : '#e8e4dc', border: `1px solid ${border}`, color: text,
    padding: '10px 14px', fontSize: '13px', fontFamily: "'Inter', sans-serif",
    outline: 'none', width: '100%',
  }
  const selectStyle = { ...inputStyle, cursor: 'pointer' }
  const labelStyle = { fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '6px', display: 'block' }

  const typeColor = (type) => {
    const map = {
      power_rankings: gold,
      weekly_summary: d ? '#93c5fd' : '#1e3a8a',
      mock_draft: d ? '#c084fc' : '#7e22ce',
      rumor_mill: d ? '#fb923c' : '#c2410c',
      trade_block: d ? '#34d399' : '#065f46',
      group_discussion: d ? '#f472b6' : '#9d174d',
    }
    return map[type] || muted
  }

  const renderContent = (content) => {
    if (!content) return ''
    return content.split('\n').map((line) => {
      const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      const italic = bold.replace(/\*(.*?)\*/g, '<em>$1</em>')
      return `<p style="margin-bottom:10px;line-height:1.7">${italic || '&nbsp;'}</p>`
    }).join('')
  }

  const fmtDate = (ts) => {
    if (!ts) return ''
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />

      {/* Writeup PIN modal */}
      {pinModal && (
        <>
          <div onClick={() => { setPinModal(null); setPinInput(''); setPinError('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 201, background: d ? '#0a0a0a' : '#f4f1ec', border: `1px solid ${border}`, padding: '32px', width: effectiveMobile ? '90vw' : '360px' }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', color: text, marginBottom: '8px' }}>
              {pinModal.action === 'delete' ? 'Delete Writeup' : 'Edit Writeup'}
            </h3>
            <p style={{ fontSize: '12px', color: muted, marginBottom: '20px' }}>Enter your PIN to continue.</p>
            <input type="password" placeholder="PIN" value={pinInput} onChange={e => { setPinInput(e.target.value); setPinError('') }} onKeyDown={e => e.key === 'Enter' && handlePinSubmit()} style={{ ...inputStyle, marginBottom: '8px' }} />
            {pinError && <p style={{ fontSize: '12px', color: red, marginBottom: '8px' }}>{pinError}</p>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button onClick={handlePinSubmit} style={{ background: pinModal.action === 'delete' ? red : text, color: pinModal.action === 'delete' ? '#fff' : bg, border: 'none', padding: '10px 20px', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif", fontWeight: '500', flex: 1 }}>
                {pinModal.action === 'delete' ? 'Delete' : 'Edit'}
              </button>
              <button onClick={() => { setPinModal(null); setPinInput(''); setPinError('') }} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '10px 20px', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
            </div>
          </div>
        </>
      )}

      {/* Comment PIN modal */}
      {commentPinModal && (
        <>
          <div onClick={() => { setCommentPinModal(null); setCommentPinInput(''); setCommentPinError('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 201, background: d ? '#0a0a0a' : '#f4f1ec', border: `1px solid ${border}`, padding: '32px', width: effectiveMobile ? '90vw' : '360px' }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', color: text, marginBottom: '8px' }}>Delete Comment</h3>
            <p style={{ fontSize: '12px', color: muted, marginBottom: '20px' }}>Enter your PIN to delete this comment.</p>
            <input type="password" placeholder="PIN" value={commentPinInput} onChange={e => { setCommentPinInput(e.target.value); setCommentPinError('') }} onKeyDown={e => e.key === 'Enter' && handleCommentPinSubmit()} style={{ ...inputStyle, marginBottom: '8px' }} />
            {commentPinError && <p style={{ fontSize: '12px', color: red, marginBottom: '8px' }}>{commentPinError}</p>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button onClick={handleCommentPinSubmit} style={{ background: red, color: '#fff', border: 'none', padding: '10px 20px', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif", fontWeight: '500', flex: 1 }}>Delete</button>
              <button onClick={() => { setCommentPinModal(null); setCommentPinInput(''); setCommentPinError('') }} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '10px 20px', cursor: 'pointer', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
            </div>
          </div>
        </>
      )}

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px', flexWrap: 'wrap', gap: '12px' }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px, 6vw, 72px)', fontWeight: '400', letterSpacing: '-0.02em' }}>Writeups</h1>
          {view === 'feed' && (
            <button onClick={() => { setView('new'); setEditTarget(null); setForm({ season_year: 2026, week: '', type: 'power_rankings', title: '', content: '', author_name: '', pin: '' }); setFormError(''); setFormSuccess('') }} style={{ background: text, color: bg, border: 'none', padding: '10px 20px', cursor: 'pointer', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", fontWeight: '500', marginBottom: '8px' }}>
              + New Writeup
            </button>
          )}
          {(view === 'new' || view === 'edit') && (
            <button onClick={() => { setView('feed'); setEditTarget(null); setFormError(''); setFormSuccess('') }} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '8px 16px', cursor: 'pointer', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", marginBottom: '8px' }}>← Back</button>
          )}
        </div>

        {/* Feed */}
        {view === 'feed' && (
          <>
            <div style={{ display: 'flex', flexDirection: effectiveMobile ? 'column' : 'row', gap: '8px', marginBottom: '32px', flexWrap: 'wrap' }}>
              <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ ...selectStyle, width: effectiveMobile ? '100%' : '140px' }}>
                <option value="all">All Years</option>
                {YEARS.slice().reverse().map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...selectStyle, width: effectiveMobile ? '100%' : '200px' }}>
                <option value="all">All Types</option>
                {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
              <select value={filterAuthor} onChange={e => setFilterAuthor(e.target.value)} style={{ ...selectStyle, width: effectiveMobile ? '100%' : '160px' }}>
                <option value="all">All Authors</option>
                {allAuthors.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {loading && <p style={{ color: muted, fontSize: '14px' }}>Loading...</p>}

            {!loading && filteredWriteups.length === 0 && (
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <p style={{ color: muted, fontSize: '14px', marginBottom: '16px' }}>No writeups yet.</p>
                <button onClick={() => setView('new')} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '8px 20px', cursor: 'pointer', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif" }}>Be the first to write one</button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {filteredWriteups.map((w) => {
                const isExpanded = expandedId === w.id
                const wComments = comments[w.id] || []
                const cf = commentForms[w.id] || { author_name: '', content: '', pin: '' }
                return (
                  <div key={w.id} id={`writeup-${w.id}`} style={{ background: cardBg, border: `1px solid ${border}` }}>
                    <div onClick={() => setExpandedId(isExpanded ? null : w.id)} style={{ padding: effectiveMobile ? '16px' : '20px 24px', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', color: typeColor(w.type), border: `1px solid ${typeColor(w.type)}`, padding: '2px 6px', whiteSpace: 'nowrap' }}>{TYPE_LABELS[w.type] || w.type}</span>
                            <span style={{ fontSize: '11px', color: muted }}>{w.season_year}{weekLabel(w.week)}</span>
                            <span style={{ fontSize: '11px', color: muted }}>· {w.author_name}</span>
                          </div>
                          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '17px' : '20px', color: text, fontWeight: '400' }}>{w.title}</h3>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          {wComments.length > 0 && <span style={{ fontSize: '11px', color: muted }}>{wComments.length} 💬</span>}
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              const url = `${window.location.origin}/writeups#${w.id}`
                              navigator.clipboard.writeText(url)
                              setCopiedId(w.id)
                              setTimeout(() => setCopiedId(null), 2000)
                            }}
                            style={{ background: 'none', border: 'none', color: copiedId === w.id ? green : muted, cursor: 'pointer', fontSize: '12px', padding: '2px 4px', lineHeight: 1 }}
                            title="Copy link"
                          >
                            {copiedId === w.id ? '✓' : '🔗'}
                          </button>
                          <span style={{ fontSize: '11px', color: muted }}>{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ borderTop: `1px solid ${border}`, padding: effectiveMobile ? '16px' : '20px 24px' }}>
                        {/* Content */}
                        <div style={{ fontSize: '14px', color: text, lineHeight: 1.7, marginBottom: '20px' }} dangerouslySetInnerHTML={{ __html: renderContent(w.content) }} />

                        {/* Edit / Delete / Share */}
                        <div style={{ display: 'flex', gap: '8px', borderTop: `1px solid ${border}`, paddingTop: '16px', marginBottom: '28px' }}>
                          <button onClick={() => { setPinModal({ writeupId: w.id, action: 'edit' }); setPinInput(''); setPinError('') }} style={{ background: 'none', border: `1px solid ${border}`, color: muted, padding: '6px 14px', cursor: 'pointer', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif" }}>Edit</button>
                          <button onClick={() => { setPinModal({ writeupId: w.id, action: 'delete' }); setPinInput(''); setPinError('') }} style={{ background: 'none', border: `1px solid ${red}`, color: red, padding: '6px 14px', cursor: 'pointer', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif" }}>Delete</button>
                          <button onClick={() => { const url = `${window.location.origin}/writeups#${w.id}`; navigator.clipboard.writeText(url); setCopiedId(w.id); setTimeout(() => setCopiedId(null), 2000) }} style={{ background: 'none', border: `1px solid ${border}`, color: copiedId === w.id ? green : muted, padding: '6px 14px', cursor: 'pointer', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif" }}>{copiedId === w.id ? '✓ Copied' : '🔗 Share'}</button>
                        </div>

                        {/* Comments */}
                        <div style={{ borderTop: `1px solid ${border}`, paddingTop: '20px' }}>
                          <p style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginBottom: '16px' }}>
                            Comments {wComments.length > 0 && `(${wComments.length})`}
                          </p>

                          {wComments.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                              {wComments.map(c => (
                                <div key={c.id} style={{ background: d ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', padding: '12px 16px', borderLeft: `2px solid ${border}` }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                      <span style={{ fontSize: '12px', fontWeight: '600', color: text }}>{c.author_name}</span>
                                      <span style={{ fontSize: '11px', color: muted }}>{fmtDate(c.created_at)}</span>
                                    </div>
                                    <button onClick={() => { setCommentPinModal({ commentId: c.id, writeupId: w.id, pin: c.pin }); setCommentPinInput(''); setCommentPinError('') }} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: '11px', padding: '0', lineHeight: 1 }}>✕</button>
                                  </div>
                                  <p style={{ fontSize: '13px', color: text, lineHeight: 1.6, margin: 0 }}>{c.content}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Comment form */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                              <input
                                value={cf.author_name || ''}
                                onChange={e => setCommentForms(f => ({ ...f, [w.id]: { ...cf, author_name: e.target.value } }))}
                                placeholder="Your name"
                                style={{ ...inputStyle, padding: '8px 12px', fontSize: '12px' }}
                              />
                              <input
                                type="password"
                                value={cf.pin || ''}
                                onChange={e => setCommentForms(f => ({ ...f, [w.id]: { ...cf, pin: e.target.value } }))}
                                placeholder="PIN (to delete later)"
                                style={{ ...inputStyle, padding: '8px 12px', fontSize: '12px' }}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <textarea
                                value={cf.content || ''}
                                onChange={e => setCommentForms(f => ({ ...f, [w.id]: { ...cf, content: e.target.value } }))}
                                placeholder="Add a comment..."
                                rows={2}
                                style={{ ...inputStyle, padding: '8px 12px', fontSize: '12px', resize: 'vertical', flex: 1 }}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(w.id) } }}
                              />
                              <button
                                onClick={() => submitComment(w.id)}
                                disabled={commentSubmitting[w.id]}
                                style={{ background: text, color: bg, border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: '11px', fontFamily: "'Inter', sans-serif", fontWeight: '500', alignSelf: 'flex-end', opacity: commentSubmitting[w.id] ? 0.6 : 1 }}
                              >
                                Post
                              </button>
                            </div>
                            {commentErrors[w.id] && <p style={{ fontSize: '12px', color: red }}>{commentErrors[w.id]}</p>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Form */}
        {(view === 'new' || view === 'edit') && (
          <div>
            <p style={{ color: muted, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '32px' }}>{view === 'edit' ? 'Editing writeup' : 'New writeup'}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Season Year</label>
                  <select value={form.season_year} onChange={e => setForm(f => ({ ...f, season_year: parseInt(e.target.value) }))} style={selectStyle}>
                    {YEARS.slice().reverse().map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Week (optional)</label>
                  <select value={form.week} onChange={e => setForm(f => ({ ...f, week: e.target.value }))} style={selectStyle}>
                    {WEEK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={effectiveMobile ? { gridColumn: '1 / -1' } : {}}>
                  <label style={labelStyle}>Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={selectStyle}>
                    {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Title</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Week 7 Power Rankings" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Content</label>
                {/* Toolbar */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                  <button type="button" onClick={() => applyFormat('bold')} style={{ background: 'none', border: `1px solid ${border}`, color: text, padding: '4px 10px', cursor: 'pointer', fontSize: '13px', fontFamily: "'Inter', sans-serif", fontWeight: '700' }}>B</button>
                  <button type="button" onClick={() => applyFormat('italic')} style={{ background: 'none', border: `1px solid ${border}`, color: text, padding: '4px 10px', cursor: 'pointer', fontSize: '13px', fontFamily: "'Playfair Display', serif", fontStyle: 'italic' }}>I</button>
                  <span style={{ fontSize: '11px', color: muted, alignSelf: 'center', marginLeft: '6px' }}>Select text then click B or I</span>
                </div>
                <textarea
                  id="writeup-content"
                  ref={contentRef}
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  onPaste={handlePaste}
                  placeholder="Write your writeup here..."
                  rows={effectiveMobile ? 12 : 18}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Your Name</label>
                  <input value={form.author_name} onChange={e => setForm(f => ({ ...f, author_name: e.target.value }))} placeholder="e.g. Dan" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>{view === 'edit' ? 'Current PIN (to verify)' : 'Set a PIN (to edit/delete later)'}</label>
                  <input type="password" value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value }))} placeholder="4+ digit PIN" style={inputStyle} />
                </div>
              </div>
              {formError && <p style={{ fontSize: '12px', color: red }}>{formError}</p>}
              {formSuccess && <p style={{ fontSize: '12px', color: green }}>{formSuccess}</p>}
              <button onClick={handleSubmit} disabled={submitting} style={{ background: text, color: bg, border: 'none', padding: '14px 28px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", fontWeight: '500', opacity: submitting ? 0.6 : 1, alignSelf: 'flex-start' }}>
                {submitting ? 'Saving...' : view === 'edit' ? 'Save Changes' : 'Post Writeup'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
