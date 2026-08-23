'use client'
import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useLayout } from '../hooks/LayoutContext'
import { SECTIONS, sectionHasPath } from '../lib/nav'

export default function Nav() {
  const pathname = usePathname()
  const { d, effectiveMobile, text, muted, border, toggleTheme, toggleLayout } = useLayout()
  const [menuOpen, setMenuOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState(null)     // desktop dropdown
  const [openGroup, setOpenGroup] = useState(null)   // mobile accordion
  const rowRef = useRef(null)

  const navBg = d ? 'rgba(0,0,0,0.95)' : 'rgba(244,241,236,0.97)'
  const dropBg = d ? '#0a0a0a' : '#faf8f5'
  const activeBorder = d ? '#fff' : '#0d2152'

  // Open whichever accordion section holds the current page, so the mobile
  // menu lands on something recognisable rather than fully collapsed.
  useEffect(() => {
    const s = SECTIONS.find(x => x.items && sectionHasPath(x, pathname))
    setOpenGroup(s ? s.label : null)
  }, [pathname])

  // A desktop dropdown closes on an outside click or Escape.
  useEffect(() => {
    if (!openMenu) return
    const onDown = e => { if (!rowRef.current?.contains(e.target)) setOpenMenu(null) }
    const onKey = e => { if (e.key === 'Escape') setOpenMenu(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenu])

  const closeAll = () => { setMenuOpen(false); setOpenMenu(null) }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Inter:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* Anchor links from the 2026-27 menu land under the fixed nav without
           this, since the bar floats above the document. */
        [id] { scroll-margin-top: 104px; }

        .fc-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; background: ${navBg}; border-bottom: 1px solid ${border}; backdrop-filter: blur(12px); font-family: 'Inter', sans-serif; }

        .fc-nav-top { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; gap: 8px; }

        .fc-logo { font-family: 'Playfair Display', serif; font-size: 16px; font-weight: 400; color: ${text}; text-decoration: none; flex-shrink: 0; }

        .fc-controls { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }

        .fc-btn { background: none; border: 1px solid ${border}; color: ${muted}; padding: 5px 10px; cursor: pointer; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; font-family: 'Inter', sans-serif; font-weight: 500; white-space: nowrap; }

        /* Desktop row. Overflow stays visible so dropdowns can escape it, and
           the labels tighten a little to keep seven items on one line. */
        .fc-link-row { display: flex; align-items: stretch; border-top: 1px solid ${border}; padding: 0 12px; }

        .fc-item { position: relative; flex-shrink: 0; }

        .fc-link, .fc-trigger { color: ${muted}; text-decoration: none; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 400; padding: 10px 11px; white-space: nowrap; border-bottom: 2px solid transparent; display: flex; align-items: center; gap: 5px; background: none; border-top: 0; border-left: 0; border-right: 0; font-family: 'Inter', sans-serif; cursor: pointer; }
        .fc-link.active, .fc-trigger.active { color: ${text}; font-weight: 600; border-bottom: 2px solid ${activeBorder}; }
        .fc-link:hover, .fc-trigger:hover { color: ${text}; }

        .fc-caret { font-size: 7px; opacity: 0.55; }
        .fc-trigger[aria-expanded="true"] .fc-caret { opacity: 1; }

        /* Dropdown panel. Single column — no menu runs past seven items, and a
           second column would force left-right scanning for no gain. */
        .fc-drop { position: absolute; top: 100%; left: 0; min-width: 200px; background: ${dropBg}; border: 1px solid ${border}; box-shadow: 0 10px 30px rgba(0,0,0,${d ? '0.5' : '0.12'}); padding: 5px 0; z-index: 110; }
        .fc-drop a { display: block; padding: 9px 18px; color: ${muted}; text-decoration: none; font-size: 11px; letter-spacing: 0.09em; text-transform: uppercase; white-space: nowrap; }
        .fc-drop a:hover { color: ${text}; background: ${d ? 'rgba(255,255,255,0.05)' : 'rgba(13,33,82,0.05)'}; }
        .fc-drop a.active { color: ${text}; font-weight: 600; }

        .fc-hamburger { display: none; }

        /* Mobile */
        .fc-mobile { border-top: 1px solid ${border}; display: none; max-height: calc(100vh - 110px); overflow-y: auto; }
        .fc-mobile.open { display: block; }
        .fc-mobile a { display: block; padding: 13px 16px; border-bottom: 1px solid ${border}; color: ${muted}; text-decoration: none; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 400; }
        .fc-mobile a.active { color: ${text}; font-weight: 600; background: ${d ? 'rgba(255,255,255,0.04)' : 'rgba(13,33,82,0.04)'}; }
        .fc-mobile-group { width: 100%; text-align: left; display: flex; justify-content: space-between; align-items: center; padding: 13px 16px; border: 0; border-bottom: 1px solid ${border}; background: none; color: ${muted}; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; font-family: 'Inter', sans-serif; cursor: pointer; }
        .fc-mobile-group.has-active { color: ${text}; font-weight: 600; }
        .fc-mobile-sub a { padding-left: 34px; font-size: 12px; background: ${d ? 'rgba(255,255,255,0.02)' : 'rgba(13,33,82,0.02)'}; }

        @media (max-width: 900px) {
          .fc-link-row { display: none; }
          .fc-hamburger { display: flex; }
        }

        ${effectiveMobile ? `
          .fc-link-row { display: none !important; }
          .fc-hamburger { display: flex !important; }
        ` : ''}

        ${!effectiveMobile ? `
          .fc-link-row { display: flex !important; }
          .fc-hamburger { display: none !important; }
        ` : ''}
      `}</style>

      <nav className="fc-nav">
        <div className="fc-nav-top">
          <a href="/" className="fc-logo">In Caleb We Trust</a>
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

        {/* Desktop */}
        <div className="fc-link-row" ref={rowRef}>
          {SECTIONS.map(section => {
            const active = sectionHasPath(section, pathname)
            if (!section.items) {
              return (
                <div className="fc-item" key={section.href}>
                  <a href={section.href} className={`fc-link${active ? ' active' : ''}`}>{section.label}</a>
                </div>
              )
            }
            const open = openMenu === section.label
            return (
              <div className="fc-item" key={section.label}>
                <button
                  className={`fc-trigger${active ? ' active' : ''}`}
                  aria-expanded={open}
                  aria-haspopup="true"
                  onClick={() => setOpenMenu(o => (o === section.label ? null : section.label))}
                >
                  {section.label}<span className="fc-caret">▼</span>
                </button>
                {open && (
                  <div className="fc-drop">
                    {section.items.map(([label, href]) => (
                      <a
                        key={`${section.label}-${href}`}
                        href={href}
                        className={href === pathname ? 'active' : ''}
                        onClick={closeAll}
                      >
                        {label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Mobile */}
        <div className={`fc-mobile${menuOpen ? ' open' : ''}`}>
          {SECTIONS.map(section => {
            if (!section.items) {
              return (
                <a
                  key={section.href}
                  href={section.href}
                  className={pathname === section.href ? 'active' : ''}
                  onClick={closeAll}
                >
                  {section.label}
                </a>
              )
            }
            const open = openGroup === section.label
            return (
              <div key={section.label}>
                <button
                  className={`fc-mobile-group${sectionHasPath(section, pathname) ? ' has-active' : ''}`}
                  aria-expanded={open}
                  onClick={() => setOpenGroup(g => (g === section.label ? null : section.label))}
                >
                  {section.label}<span className="fc-caret">{open ? '▲' : '▼'}</span>
                </button>
                {open && (
                  <div className="fc-mobile-sub">
                    {section.items.map(([label, href]) => (
                      <a
                        key={`${section.label}-${href}`}
                        href={href}
                        className={href === pathname ? 'active' : ''}
                        onClick={closeAll}
                      >
                        {label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </nav>
    </>
  )
}
