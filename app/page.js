'use client'
import { useEffect } from 'react'
import Nav from '../components/Nav'
import { useLayout } from '../hooks/useLayout'

export default function HomePage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg } = useLayout()

  const cards = [
    { label: 'Champions', href: '/champions', desc: 'Hall of fame, year by year' },
    { label: 'Standings', href: '/standings', desc: 'All-time career records' },
    { label: 'H2H', href: '/h2h', desc: 'Head-to-head matchup history' },
    { label: 'Season', href: '/season', desc: 'Browse any season' },
    { label: 'All-Time Teams', href: '/all-time-teams', desc: 'Every team season ranked' },
    { label: 'LJ Index', href: '/lj-index', desc: 'Luck vs skill scatter plot' },
    { label: 'Rivalries', href: '/rivalries', desc: 'The great feuds' },
    { label: 'Managers', href: '/managers', desc: 'Career profiles' },
    { label: 'Power Rankings', href: '/power-rankings', desc: 'Weekly power rankings' },
  ]

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>

        {/* Hero */}
        <div style={{ marginBottom: effectiveMobile ? '48px' : '72px' }}>
          <p style={{ fontSize: '11px', letterSpacing: '0.25em', textTransform: 'uppercase', color: muted, marginBottom: '16px' }}>
            Est. 2016 · Year 10
          </p>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '42px' : 'clamp(56px, 8vw, 96px)', fontWeight: '400', lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: '24px' }}>
            In Caleb<br />We Trust
          </h1>
          <p style={{ color: muted, fontSize: effectiveMobile ? '14px' : '16px', maxWidth: '480px', lineHeight: 1.7 }}>
            10 years · 10 managers · one throne
          </p>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'flex', gap: effectiveMobile ? '24px' : '48px', marginBottom: effectiveMobile ? '48px' : '72px', flexWrap: 'wrap' }}>
          {[['10', 'Seasons'], ['10', 'Managers']].map(([num, label]) => (
            <div key={label}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : '48px', color: text, lineHeight: 1 }}>{num}</div>
              <div style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginTop: '6px' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '1px', background: border }}>
          {cards.map(({ label, href, desc }) => (
            <a key={href} href={href} style={{ background: cardBg, padding: effectiveMobile ? '20px 16px' : '32px 28px', textDecoration: 'none', display: 'block', transition: 'background 0.15s' }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '16px' : '20px', color: text, marginBottom: '8px' }}>{label}</div>
              <div style={{ fontSize: '12px', color: muted, lineHeight: 1.5 }}>{desc}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
