/** The ring with a number in it: NutriScan's score, and now the week's. */
export function scoreColor(score: number): string {
  return score >= 7 ? 'var(--positive)' : score >= 4.5 ? 'var(--warning)' : 'var(--danger)'
}

export function ScoreDial({
  value,
  color,
  size,
  stroke,
  fontSize,
}: {
  value: number
  color: string
  size: number
  stroke: number
  fontSize: number
}) {
  const r = 38 - stroke / 2
  const c = 2 * Math.PI * r
  const filled = Math.min(1, Math.max(0, value / 10))
  return (
    <svg width={size} height={size} viewBox="0 0 76 76" role="img" aria-label={`${value} out of 10`}>
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--border-strong)" strokeWidth={stroke} opacity={0.6} />
      {filled > 0 && (
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled * c} ${c}`}
          transform="rotate(-90 38 38)"
        />
      )}
      <text
        x="38"
        y="39"
        textAnchor="middle"
        dominantBaseline="central"
        className="num"
        style={{ fontSize: (fontSize * 76) / size, fontWeight: 800, fill: color, letterSpacing: '-0.03em' }}
      >
        {value.toFixed(1)}
      </text>
    </svg>
  )
}
