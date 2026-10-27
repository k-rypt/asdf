"use client"

interface IRTCurveProps {
  irt_a: number          // discrimination
  irt_b_thresholds: number[] // difficulty thresholds (GRM boundaries)
}

// Graded Response Model ICC: P*(theta) = 1 / (1 + exp(-a*(theta - b)))
function grmBoundary(theta: number, a: number, b: number): number {
  return 1 / (1 + Math.exp(-a * (theta - b)))
}

export function IRTCurve({ irt_a, irt_b_thresholds }: IRTCurveProps) {
  const width = 560
  const height = 220
  const padX = 44
  const padY = 24
  const innerW = width - padX * 2
  const innerH = height - padY * 2

  const thetaMin = -4
  const thetaMax = 4
  const steps = 200

  const thetas: number[] = []
  for (let i = 0; i <= steps; i++) {
    thetas.push(thetaMin + (i / steps) * (thetaMax - thetaMin))
  }

  const toX = (theta: number) =>
    padX + ((theta - thetaMin) / (thetaMax - thetaMin)) * innerW
  const toY = (p: number) => padY + (1 - p) * innerH

  // Build one curve per boundary
  const curves = irt_b_thresholds.map((b, i) => {
    const pts = thetas.map((theta) => {
      const p = grmBoundary(theta, irt_a, b)
      return `${toX(theta).toFixed(1)},${toY(p).toFixed(1)}`
    })
    return { d: `M ${pts.join(" L ")}`, b, i }
  })

  // Colour palette per curve
  const colours = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"]

  // Axis tick values
  const thetaTicks = [-4, -3, -2, -1, 0, 1, 2, 3, 4]
  const pTicks = [0, 0.25, 0.5, 0.75, 1.0]

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full max-w-[560px] h-auto"
        aria-label="IRT Item Characteristic Curve"
      >
        {/* Grid lines */}
        {pTicks.map((p) => (
          <line
            key={p}
            x1={padX}
            y1={toY(p)}
            x2={width - padX}
            y2={toY(p)}
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={1}
          />
        ))}
        {thetaTicks.map((t) => (
          <line
            key={t}
            x1={toX(t)}
            y1={padY}
            x2={toX(t)}
            y2={height - padY}
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={1}
          />
        ))}

        {/* Axes */}
        <line x1={padX} y1={padY} x2={padX} y2={height - padY} stroke="currentColor" strokeOpacity={0.3} strokeWidth={1} />
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="currentColor" strokeOpacity={0.3} strokeWidth={1} />

        {/* X-axis labels (θ) */}
        {thetaTicks.map((t) => (
          <text
            key={t}
            x={toX(t)}
            y={height - padY + 14}
            textAnchor="middle"
            fontSize={10}
            fill="currentColor"
            fillOpacity={0.5}
          >
            {t}
          </text>
        ))}

        {/* Y-axis labels (P) */}
        {pTicks.map((p) => (
          <text
            key={p}
            x={padX - 6}
            y={toY(p) + 4}
            textAnchor="end"
            fontSize={10}
            fill="currentColor"
            fillOpacity={0.5}
          >
            {p.toFixed(2)}
          </text>
        ))}

        {/* Axis labels */}
        <text x={width / 2} y={height - 2} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.4}>θ (Ability)</text>
        <text x={10} y={height / 2} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.4} transform={`rotate(-90, 10, ${height / 2})`}>P(θ)</text>

        {/* ICC curves */}
        {curves.map(({ d, i }) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={colours[i % colours.length]}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Threshold markers on x-axis */}
        {irt_b_thresholds.map((b, i) => (
          <g key={i}>
            <line
              x1={toX(b)}
              y1={padY}
              x2={toX(b)}
              y2={height - padY}
              stroke={colours[i % colours.length]}
              strokeWidth={1}
              strokeDasharray="4 3"
              strokeOpacity={0.5}
            />
            <circle cx={toX(b)} cy={toY(0.5)} r={3} fill={colours[i % colours.length]} />
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2">
        {irt_b_thresholds.map((b, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: colours[i % colours.length] }} />
            <span className="text-xs text-muted-foreground">b{i + 1} = {b.toFixed(2)}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-muted-foreground/20">
          <span className="text-xs text-muted-foreground">a = {irt_a.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}
