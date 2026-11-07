"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

// FR-3.3: the closed barter cycle A → B → C → A drawn live. Beads of time leave each person in
// brass (given) and arrive turquoise (received). Colours come from the design tokens, so the
// drawing follows the light / dark theme. Static frame when the visitor prefers reduced motion.

export interface CycleCanvasProps {
  /** Exactly three names, in cycle order: names[0] teaches names[1], and so on. */
  names: [string, string, string];
  /** Which participant is the viewer (highlighted), if any. */
  meIndex?: number;
  className?: string;
}

// Node positions as fractions of the box: top, bottom-end, bottom-start (RTL reads right to left).
const NODES = [
  { x: 0.5, y: 0.17 },
  { x: 0.16, y: 0.8 },
  { x: 0.84, y: 0.8 },
];

const BEADS_PER_EDGE = 4;

function cssVar(el: Element, name: string, fallback: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

export function CycleCanvas({ names, meIndex, className }: CycleCanvasProps) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = box.current;
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!host || !cv || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let raf = 0;
    let visible = true;
    let colors = { brass: "#d4a24c", turquoise: "#35c9b8", line: "rgba(236,228,210,.17)" };

    const readColors = () => {
      colors = {
        brass: cssVar(host, "--cs-amber", colors.brass),
        turquoise: cssVar(host, "--cs-cyan", colors.turquoise),
        line: cssVar(host, "--cs-line-strong", colors.line),
      };
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      cv.width = Math.round(width * dpr);
      cv.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // Each edge bends outward a little, so the triangle reads as a cycle, not a diagram.
    const control = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const cx = width / 2;
      const cy = height * 0.6;
      return { x: mx + (mx - cx) * 0.35, y: my + (my - cy) * 0.35 };
    };
    const at = (i: number) => ({ x: NODES[i % 3].x * width, y: NODES[i % 3].y * height });
    const pointOn = (a: { x: number; y: number }, c: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({
      x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
      y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
    });

    const mix = (t: number) => {
      // brass → turquoise along the edge
      const parse = (hex: string) => {
        const h = hex.replace("#", "");
        return h.length === 6 ? [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)) : null;
      };
      const a = parse(colors.brass);
      const b = parse(colors.turquoise);
      if (!a || !b) return colors.brass;
      const c = a.map((v, k) => Math.round(v + (b[k] - v) * t));
      return `rgb(${c[0]} ${c[1]} ${c[2]})`;
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      const t = reduce ? 0.35 : time / 1000;

      for (let e = 0; e < 3; e++) {
        const a = at(e);
        const b = at(e + 1);
        const c = control(a, b);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
        ctx.strokeStyle = colors.line;
        ctx.lineWidth = 1.25;
        ctx.setLineDash([3, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        for (let k = 0; k < BEADS_PER_EDGE; k++) {
          const u = reduce ? (k + 0.5) / BEADS_PER_EDGE : (t * 0.22 + k / BEADS_PER_EDGE) % 1;
          const eased = u * u * (3 - 2 * u);
          const p = pointOn(a, c, b, eased);
          const r = 2.2 + Math.sin(eased * Math.PI) * 2.6;
          const color = mix(eased);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 12;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      for (let i = 0; i < 3; i++) {
        const p = at(i);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
        ctx.strokeStyle = i === meIndex ? colors.turquoise : colors.line;
        ctx.lineWidth = i === meIndex ? 2 : 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = colors.brass;
        ctx.fill();
      }
    };

    const loop = (time: number) => {
      draw(time);
      if (!reduce && visible) raf = requestAnimationFrame(loop);
    };

    readColors();
    resize();
    loop(performance.now());

    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(host);

    const io = new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = entry.isIntersecting;
      if (visible && !was && !reduce) raf = requestAnimationFrame(loop);
    });
    io.observe(host);

    // Theme switch (data-theme on <html>) changes the token values.
    const mo = new MutationObserver(() => {
      readColors();
      draw(performance.now());
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
    };
  }, [meIndex]);

  return (
    <div ref={box} className={cn("relative aspect-[4/3] w-full", className)}>
      <canvas ref={canvas} className="absolute inset-0 size-full" aria-hidden />
      {/* Names as HTML so Arabic shaping and screen readers work. */}
      <ol className="sr-only">
        {names.map((n, i) => (
          <li key={i}>
            {n} يعلّم {names[(i + 1) % 3]}
          </li>
        ))}
      </ol>
      {NODES.map((n, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "absolute -translate-x-1/2 whitespace-nowrap text-xs font-semibold",
            i === meIndex ? "text-cyan-ink" : "text-fg",
            i === 0 ? "-translate-y-[2.4rem]" : "translate-y-[1.1rem]",
          )}
          style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%` }}
        >
          {names[i]}
        </span>
      ))}
    </div>
  );
}
