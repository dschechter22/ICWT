'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useLayout } from '../hooks/LayoutContext'

const NAV_LINKS = [
  ['2026-27', '/draft'],
  ['Sportsbook', '/sportsbook'],
  ['Champions', '/champions'],
  ['Standings', '/standings'],
  ['Graphs', '/graphs'],
  ['H2H', '/h2h'],
  ['Season', '/season'],
  ['Rivalries', '/rivalries'],
  ['Managers', '/managers'],
  ['Writeups', '/writeups'],
  ['Power Rankings', '/power-rankings'],
  ['LJ Index', '/lj-index'],
  ['All-Time Teams', '/all-time-teams'],
  ['Players', '/players'],
  ['Stats', '/stats'],
]

export default function Nav() {
  const pathname = usePathname()
  const { d, effectiveMobile, text, muted, border, toggleTheme, toggleLayout } = useLayout()
  const [menuOpen, setMenuOpen] = useState(false)

  const navBg = d ? 'rgba(0,0,0,0.95)' : 'rgba(244,241,236,0.97)'
  const activeBorder = d ? '#fff' : '#0d2152'

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Inter:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .fc-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; background: ${navBg}; border-bottom: 1px solid ${border}; backdrop-filter: blur(12px); font-family: 'Inter', sans-serif; }

        .fc-nav-top { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; gap: 8px; }

        .fc-logo { font-family: 'Playfair Display', serif; font-size: 16px; font-weight: 400; color: ${text}; text-decoration: none; flex-shrink: 0; }

        .fc-controls { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }

        .fc-btn { background: none; border: 1px solid ${border}; color: ${muted}; padding: 5px 10px; cursor: pointer; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; font-family: 'Inter', sans-serif; font-weight: 500; white-space: nowrap; }

        /* Scrollable link row -- shown on desktop, hidden on mobile */
        .fc-link-row { display: flex; align-items: center; overflow-x: auto; border-top: 1px solid ${border}; padding: 0 16px; -ms-overflow-style: none; scrollbar-width: none; }
        .fc-link-row::-webkit-scrollbar { display: none; }

        .fc-link { color: ${muted}; text-decoration: none; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 400; padding: 10px 12px; white-space: nowrap; flex-shrink: 0; border-bottom: 2px solid transparent; display: block; }
        .fc-link.active { color: ${text}; font-weight: 600; border-bottom: 2px solid ${activeBorder}; }

        /* Hamburger -- hidden on desktop */
        .fc-hamburger { display: none; }

        /* Mobile dropdown */
        .fc-dropdown { border-top: 1px solid ${border}; display: none; }
        .fc-dropdown.open { display: block; }
        .fc-dropdown a { display: block; padding: 13px 16px; border-bottom: 1px solid ${border}; color: ${muted}; text-decoration: none; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 400; }
        .fc-dropdown a.active { color: ${text}; font-weight: 600; background: ${d ? 'rgba(255,255,255,0.04)' : 'rgba(13,33,82,0.04)'}; }

        /* At 768px and below: hide link row, show hamburger */
        @media (max-width: 768px) {
          .fc-link-row { display: none; }
          .fc-hamburger { display: flex; }
        }

        /* Force mobile layout override */
        ${effectiveMobile ? `
          .fc-link-row { display: none !important; }
          .fc-hamburger { display: flex !important; }
        ` : ''}

        /* Force desktop layout override */
        ${!effectiveMobile ? `
          .fc-link-row { display: flex !important; }
          .fc-hamburger { display: none !important; }
        ` : ''}
      `}</style>

      <nav className="fc-nav">
        <div className="fc-nav-top">
          <a href="/" className="fc-logo">Fantasy Chatroom</a>
          <div className="fc-controls">
            <button onClick={toggleTheme} className="fc-btn">{d ? 'Light' : 'Dark'}</button>
            <button onClick={toggleLayout} className="fc-btn">{effectiveMobile ? 'Desktop' : 'Mobile'}</button>
            <button
              className="fc-btn fc-hamburger"
              onClick={() => setMenuOpen(o => !o)}
              style={{ fontSize: '15px', lineHeight: 1 }}
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Scrollable link row */}
        <div className="fc-link-row">
          {NAV_LINKS.map(([label, href]) => (
            <a key={href} href={href} className={`fc-link${pathname === href ? ' active' : ''}`}>
              {label}
            </a>
          ))}
        </div>

        {/* Mobile dropdown */}
        <div className={`fc-dropdown${menuOpen ? ' open' : ''}`}>
          {NAV_LINKS.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className={pathname === href ? 'active' : ''}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </a>
          ))}
        </div>
      </nav>
    </>
  )
}
