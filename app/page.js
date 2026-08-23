'use client'
import Nav from '../components/Nav'
import { useLayout } from '../hooks/useLayout'
import { FEATURED, GROUPS, SINGLES } from '../lib/nav'

export default function HomePage() {
  const { effectiveMobile, bg, text, muted, border, cardBg } = useLayout()

  const cols = effectiveMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)'
  // Hairlines come from each card rather than from a container background
  // showing through the gaps, so a row that does not divide evenly leaves
  // empty space instead of a block of border colour.
  const card = {
    boxShadow: `0 0 0 1px ${border}`,
    background: cardBg,
    textDecoration: 'none',
    display: 'block',
  }

  const sectionLabel = {
    fontSize: '11px',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: muted,
    marginBottom: '14px',
  }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>

        {/* Hero */}
        <div style={{ marginBottom: effectiveMobile ? '48px' : '72px' }}>
          <p style={{ fontSize: '11px', letterSpacing: '0.25em', textTransform: 'uppercase', color: muted, marginBottom: '16px' }}>
            Est. 2017 · Year 9
          </p>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '42px' : 'clamp(56px, 8vw, 96px)', fontWeight: '400', lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: '24px' }}>
            In Caleb<br />We Trust
          </h1>
          <p style={{ color: muted, fontSize: effectiveMobile ? '14px' : '16px', maxWidth: '480px', lineHeight: 1.7 }}>
            9 years · 10 managers · one throne
          </p>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'flex', gap: effectiveMobile ? '24px' : '48px', marginBottom: effectiveMobile ? '48px' : '72px', flexWrap: 'wrap' }}>
          {[['9', 'Seasons'], ['10', 'Managers']].map(([num, label]) => (
            <div key={label}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : '48px', color: text, lineHeight: 1 }}>{num}</div>
              <div style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, marginTop: '6px' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* The pages you land on when you just want to get somewhere */}
        <div style={{ display: 'grid', gridTemplateColumns: effectiveMobile ? '1fr' : `repeat(${FEATURED.length}, 1fr)`, gap: '1px', marginBottom: effectiveMobile ? '44px' : '64px' }}>
          {FEATURED.map(({ label, href, desc }) => (
            <a key={href} href={href} style={{ ...card, padding: effectiveMobile ? '24px 20px' : '36px 32px' }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '24px' : '30px', color: text, marginBottom: '10px', lineHeight: 1.15 }}>
                {label}
              </div>
              <div style={{ fontSize: '13px', color: muted, lineHeight: 1.5 }}>{desc}</div>
            </a>
          ))}
        </div>

        {/* One card row per menu, in the same order and grouping the nav uses */}
        {GROUPS.map(({ label, featured, items }) => {
          // The featured tile above already covers this section's landing page.
          const rest = items.filter(([, href]) => href !== featured?.href)
          return (
            <div key={label} style={{ marginBottom: effectiveMobile ? '36px' : '52px' }}>
              <div style={sectionLabel}>{label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '1px' }}>
                {rest.map(([itemLabel, href, desc]) => (
                  <a key={`${label}-${href}`} href={href} style={{ ...card, padding: effectiveMobile ? '20px 16px' : '28px 24px' }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '16px' : '20px', color: text, marginBottom: '8px' }}>
                      {itemLabel}
                    </div>
                    <div style={{ fontSize: '12px', color: muted, lineHeight: 1.5 }}>{desc}</div>
                  </a>
                ))}
              </div>
            </div>
          )
        })}

        {/* Everything that never needed a menu of its own */}
        <div style={{ display: 'flex', gap: effectiveMobile ? '18px' : '28px', flexWrap: 'wrap', borderTop: `1px solid ${border}`, paddingTop: '20px' }}>
          {SINGLES.map(({ label, href }) => (
            <a key={href} href={href} style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: muted, textDecoration: 'none' }}>
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
