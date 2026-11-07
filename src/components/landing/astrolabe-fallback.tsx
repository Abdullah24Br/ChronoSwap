// Still astrolabe for reduced motion, no WebGL, and the first paint before the 3D scene loads.
// Same composition as the 3D scene so the swap is not jarring.
// Coordinates are rounded so server and browser render identical attributes (no hydration mismatch).
const r2 = (n: number) => Math.round(n * 100) / 100;

const NODES = [90, 210, 330].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: r2(100 + Math.cos(a) * 52), y: r2(94 - Math.sin(a) * 52) };
});

export function AstrolabeFallback({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden>
      <circle cx="100" cy="100" r="96" fill="none" stroke="var(--cs-amber)" strokeWidth="4" />
      <circle cx="100" cy="100" r="80" fill="var(--cs-surface)" stroke="var(--cs-amber)" strokeOpacity="0.45" strokeWidth="1" />
      {Array.from({ length: 72 }, (_, i) => {
        const a = (i / 72) * Math.PI * 2;
        const long = i % 6 === 0;
        const r1 = 94;
        const rIn = long ? 86 : 90;
        return (
          <line
            key={i}
            x1={r2(100 + Math.cos(a) * r1)}
            y1={r2(100 + Math.sin(a) * r1)}
            x2={r2(100 + Math.cos(a) * rIn)}
            y2={r2(100 + Math.sin(a) * rIn)}
            stroke="var(--cs-amber)"
            strokeWidth={long ? 1.2 : 0.6}
          />
        );
      })}
      {[77, 51, 33].map((r) => (
        <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="var(--cs-fg)" strokeOpacity="0.18" />
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <circle key={i} cx="100" cy={84 - i * 3.6} r={58 - i * 6} fill="none" stroke="var(--cs-fg)" strokeOpacity="0.09" />
      ))}
      <circle cx="100" cy="94" r="52" fill="none" stroke="var(--cs-amber)" strokeWidth="1.4" />
      <polygon
        points={NODES.map((n) => `${n.x},${n.y}`).join(" ")}
        fill="none"
        stroke="var(--cs-fg)"
        strokeOpacity="0.35"
      />
      {NODES.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r="6.5" fill="none" stroke="var(--cs-cyan)" strokeWidth="0.8" />
          <circle cx={n.x} cy={n.y} r="4" fill="var(--cs-amber)" />
        </g>
      ))}
      <rect x="10" y="98.6" width="180" height="2.8" rx="1.4" fill="var(--cs-amber)" transform="rotate(-24 100 100)" />
      <circle cx="100" cy="100" r="4" fill="var(--cs-amber)" />
    </svg>
  );
}
