// Every page on the site, in the order and grouping the nav and the home page
// both use. Kept in one place so the two can't drift apart.
//
// A section with `items` rolls up into a dropdown; one without is a single
// top-level link. `featured` is the large tile the home page gives a section,
// and points at the page you land on when you mean "just take me there".
//
// The weekly trio appears under both 2026-27 and Betting & Predictions on
// purpose, so either mental route finds them. Both menus light up as active
// when you are on one of those pages — that is accurate, not a bug.

export const SECTIONS = [
  {
    label: '2026-27',
    featured: { label: '2026-27', href: '/current-season', desc: 'Live dashboard — updates as scores come in' },
    items: [
      ['Dashboard', '/current-season', 'Live scores as they land'],
      ['Scoreboard', '/scoreboard', 'Live scores, computed from real-time NFL stats'],
      ['Rosters', '/current-season#rosters', 'Every team’s current roster'],
      ['Standings', '/current-season#standings', 'Where the league sits right now'],
      ['Power Rankings', '/current-season#power-rankings', 'This season’s rankings'],
      ['LJ Index', '/current-season#lj-index', 'All-play win % this season'],
      ['Preweek', '/preweek', 'Stakes, rooting guide and the week’s lines'],
      ['Predictions', '/predictions', 'Weekly lines and season futures'],
      ['Postweek', '/postweek', 'Awards, results and what the week moved'],
    ],
  },
  {
    label: 'Betting & Predictions',
    featured: { label: 'Sportsbook', href: '/sportsbook', desc: 'Parenti Bucks, moneylines, parlays and settled bets' },
    items: [
      ['Sportsbook', '/sportsbook', 'Parenti Bucks, moneylines, parlays and settled bets'],
      ['Preweek', '/preweek', 'Stakes, rooting guide and the week’s lines'],
      ['Predictions', '/predictions', 'Weekly lines and season futures'],
      ['Postweek', '/postweek', 'Awards, results and what the week moved'],
    ],
  },
  {
    label: 'Managers & Teams',
    items: [
      ['All-Time Standings', '/standings', 'Career records across all seasons'],
      ['All-Time Teams', '/all-time-teams', 'Every team season ranked'],
      ['Champions', '/champions', 'Hall of fame, year by year'],
      ['Managers', '/managers', 'Career profiles'],
      ['H2H', '/h2h', 'Head-to-head matchup history'],
      ['Rivalries', '/rivalries', 'The great feuds'],
    ],
  },
  {
    label: 'Seasons & Data',
    items: [
      ['Seasons', '/season', 'Browse any season'],
      ['Power Rankings', '/power-rankings', 'Weekly power rankings'],
      ['Players', '/players', 'Player scoring across seasons'],
      ['LJ Index', '/lj-index', 'Luck vs skill scatter plot'],
      ['Graphs', '/graphs', 'Scoring trends across seasons'],
    ],
  },
  { label: 'Writeups', href: '/writeups', desc: 'Recaps and running commentary' },
  { label: 'Glossary', href: '/stats', desc: 'How every metric on this site is calculated' },
  { label: 'Export', href: '/export', desc: 'Download the raw data' },
]

/** Rolled-up sections, which the home page renders as labelled card rows. */
export const GROUPS = SECTIONS.filter(s => s.items)

/** Single top-level links, shown as a plain row at the foot of the home page. */
export const SINGLES = SECTIONS.filter(s => !s.items)

/** Large home page tiles, in section order. */
export const FEATURED = SECTIONS.filter(s => s.featured).map(s => s.featured)

/** Strips an anchor so /current-season#standings still matches /current-season. */
const basePath = href => href.split('#')[0]

/** True when `pathname` is the section itself or any page inside it. */
export const sectionHasPath = (section, pathname) =>
  basePath(section.href || '') === pathname ||
  !!section.items?.some(([, href]) => basePath(href) === pathname)
