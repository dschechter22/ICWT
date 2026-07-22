'use client'
import Nav from '../../components/Nav'
import { useLayout } from '../../hooks/useLayout'

export default function StatsPage() {
  const { d, effectiveMobile, bg, text, muted, border, cardBg, gold, blue, green, red } = useLayout()

  const Section = ({ title, color, children }) => (
    <div style={{ marginBottom: '48px' }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '22px' : '28px', fontWeight: '400', color: text, marginBottom: '20px', paddingBottom: '12px', borderBottom: `2px solid ${color || border}` }}>
        {title}
      </h2>
      {children}
    </div>
  )

  const Metric = ({ name, tagline, formula, inputs, notes }) => (
    <div style={{ background: cardBg, padding: effectiveMobile ? '16px' : '24px', marginBottom: '1px', borderLeft: `3px solid ${border}` }}>
      <div style={{ marginBottom: '10px' }}>
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '16px' : '20px', color: text }}>{name}</span>
        {tagline && <span style={{ fontSize: '12px', color: muted, marginLeft: '12px' }}>{tagline}</span>}
      </div>
      {formula && (
        <div style={{ background: d ? '#111' : '#e4e0d8', padding: '12px 16px', fontFamily: 'monospace', fontSize: effectiveMobile ? '11px' : '13px', color: text, marginBottom: '12px', lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre' }}>
          {formula}
        </div>
      )}
      {inputs && (
        <div style={{ marginBottom: '10px' }}>
          {inputs.map(([label, desc]) => (
            <div key={label} style={{ display: 'flex', gap: '12px', padding: '6px 0', borderBottom: `1px solid ${border}`, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: gold, minWidth: '140px', flexShrink: 0, fontFamily: 'monospace' }}>{label}</span>
              <span style={{ fontSize: '12px', color: muted, flex: 1 }}>{desc}</span>
            </div>
          ))}
        </div>
      )}
      {notes && <p style={{ fontSize: '12px', color: muted, lineHeight: 1.6, marginTop: '8px' }}>{notes}</p>}
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: "'Inter', sans-serif" }}>
      <Nav />
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: effectiveMobile ? '90px 16px 60px' : '120px 24px 80px' }}>

        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: effectiveMobile ? '36px' : 'clamp(40px, 6vw, 72px)', fontWeight: '400', marginBottom: '8px', letterSpacing: '-0.02em' }}>
          Stats
        </h1>
        <p style={{ color: muted, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '48px' }}>
          How every metric on this site is calculated
        </p>

        <Section title="Power Score" color={gold}>
          <Metric
            name="Power Score"
            tagline="Normalized season strength metric"
            formula={`PowerScore = (
  (WinPct      / max_WinPct      × 100 × 2) +
  (AvgScore    / max_AvgScore    × 100 × 4) +
  (AllPlayWin% / max_AllPlayWin% × 100 × 2) +
  (MedianScore / max_MedianScore × 100 × 2)
) / 10`}
            inputs={[
              ['WinPct', 'Regular season wins divided by total games played'],
              ['AvgScore', 'Average points scored per regular season game'],
              ['AllPlayWin%', 'Average weekly all-play win rate (see below) over the full season'],
              ['MedianScore', 'Median of all regular season scores'],
              ['/ max_X', 'Each component is normalized against the best value in the league that season'],
            ]}
            notes="All four components are normalized within the season so the top team always scores 100. The top team in any season has a Power Score of 100. AvgScore is weighted 4x because it best captures raw team quality independent of schedule luck. The result is a number between 0 and 100."
          />
        </Section>

        <Section title="Luck" color={green}>
          <Metric
            name="Luck"
            tagline="Wins above or below expectation"
            formula={`Luck = ActualWins - ExpectedWins

ExpectedWins = Σ (AllPlayWinRate per week)`}
            inputs={[
              ['ActualWins', 'Real wins recorded in the regular season standings'],
              ['ExpectedWins', 'Sum of all-play win rate across all weeks -- how many wins a team "deserved" based on scoring'],
              ['AllPlayWinRate', 'In a given week: (number of teams you would have beaten) / (total teams - 1)'],
            ]}
            notes="A positive Luck score means the team won more games than their scoring deserved. A negative Luck score means they were good but got unlucky with scheduling. For example, a team that scores above the median every week but keeps facing the one team that scores higher will have negative luck. Luck is always relative to the league average that season."
          />
          <Metric
            name="All-Play Win %"
            tagline="How you would do against every team every week"
            formula={`AllPlayWin% = Average of weekly all-play win rates

Weekly rate = (teams beaten that week) / (total teams - 1)`}
            notes="All-play win rate is the purest measure of team strength because it removes schedule luck entirely. A team that scores above the median 12 out of 14 weeks has a high all-play rate regardless of their actual record. Used as an input to both Power Score and Luck."
          />
        </Section>

        <Section title="LJ Index" color={blue}>
          <Metric
            name="LJ Index"
            tagline="Luck vs skill scatter plot"
            formula={`X axis = All-Play Win% relative to league average
Y axis = Luck (winning % over expected) relative to league average
Bubble size = Power Score`}
            inputs={[
              ['X > 0', 'Above-average all-play performance -- team is genuinely strong'],
              ['X < 0', 'Below-average all-play performance -- team is weak relative to league'],
              ['Y > 0', 'Won more games than scoring deserved -- lucky schedule'],
              ['Y < 0', 'Won fewer games than scoring deserved -- unlucky schedule'],
            ]}
            notes="Both axes are centered at zero (league average). The four quadrants tell the story: top-right is good and lucky, bottom-right is good but unlucky, top-left is lucky but not actually strong, bottom-left is bad and unlucky. The all-time view aggregates data across multiple seasons, giving each manager a career position on the chart."
          />
        </Section>

        <Section title="Rivalry Score" color={red}>
          <Metric
            name="Rivalry Score"
            tagline="How intense is this matchup?"
            formula={`RivalryScore = (StatsScore × 0.60) + (InterpersonalScore × 0.40)

StatsScore = (
  Closeness    × 0.35 +
  Volume       × 0.25 +
  AvgMargin    × 0.25 +
  PlayoffMeets × 0.15
)`}
            inputs={[
              ['Closeness', '1 minus the ratio of win differential to total games. A 10-10 record = 1.0, a 18-2 record ≈ 0.2'],
              ['Volume', 'Total games played, normalized to a max of ~20 games'],
              ['AvgMargin', 'Inverse of average point margin -- tighter games score higher, normalized to 50 pts max'],
              ['PlayoffMeets', 'Number of playoff matchups between the two managers, normalized to 3 meetings'],
              ['InterpersonalScore', '1 if either manager named the other as a rival, 0 otherwise'],
            ]}
            notes="The rivalry score is on a 0-100 scale. A pure stats rivalry with no interpersonal history maxes out at 60. A named rivalry with no head-to-head history scores 40. Most top rivalries combine both. The score determines the ordering on the rivalry page and each manager's top 3 rivals."
          />
        </Section>

        <Section title="Career Power Rank" color={gold}>
          <Metric
            name="Career Power Rank"
            tagline="All-time manager ranking"
            formula={`CareerScore = (NormAvgPowerScore × 0.50) + (NormChampionships × 0.50)

Normalized = (value - min) / (max - min)`}
            inputs={[
              ['NormAvgPowerScore', 'Career average Power Score, normalized against the best and worst career averages in the league'],
              ['NormChampionships', 'Championship count, normalized against the manager with the most rings'],
            ]}
            notes="Career rank gives equal weight to sustained excellence (power score) and winning when it counts (championships). A manager who wins 3 rings but plays inconsistently will rank similarly to a manager who plays at an elite level every season but never wins. Both are considered equally valid paths to the top."
          />
        </Section>

        <Section title="Other Stats" color={muted}>
          <Metric
            name="Points For (PF) / Points Against (PA)"
            tagline="Raw scoring totals"
            formula="PF = Sum of all scores in regular season games\nPA = Sum of all opponent scores in regular season games\nDiff = PF - PA\nPPG Diff = Diff / Games played"
            notes="All point totals on this site are regular season only unless explicitly noted. Playoff games and Sacko games are excluded from career and season totals."
          />
          <Metric
            name="Win %"
            formula="Win% = Wins / (Wins + Losses)"
            notes="Ties are excluded from win percentage calculations. Playoff games are excluded unless the toggle is enabled."
          />
          <Metric
            name="Sacko"
            tagline="Last place, decided"
            formula="The two teams that miss the playoffs play their own series across the postseason weeks to decide last place. The loser is crowned that season's Sacko."
            notes="Sacko games are tracked separately from the playoff bracket and are excluded from power score, luck, and all-play calculations. On the H2H page, Sacko games are labeled separately from playoff games."
          />
        </Section>

      </div>
    </div>
  )
}
