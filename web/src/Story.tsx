import { useCallback, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import type { Topic } from "./types";
import { depthName, label, plural } from "./lib";
import { ScrollSequence } from "./ScrollSequence";
import type { Draw } from "./ScrollSequence";
import { Stage3D, canWebGL } from "./Stage3D";
import type { Cube } from "./Stage3D";

const TONES = ["#f1f4f2", "#d2e3e2", "#8fbbc3", "#0f3d52"];
const INK = "#0a2230";
const FOAM = "#eaf3f2";
const PINK = "#ff5fa8";
const GOLDEN = 2.39996;

type Dot = { layer: number; out: boolean; disc: boolean; sx: number; sy: number; cx: number; cy: number; bx: number; delay: number; shade: number };

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const span = (t: number, a: number, b: number) => ease((t - a) / (b - a));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Deterministic pseudo-random, so the picture is the same on every visit. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/**
 * The method as one scroll-driven picture, drawn from the measured counts:
 * every answer is a dot. They gather where the models agree, settle into a band,
 * and each new round loses the dots that broke the rules.
 */
export function Story({ topic }: { topic: Topic }) {
  const layers = topic.layers;
  const n = layers.length;
  const stage = useRef<HTMLDivElement>(null);
  const prog = useRef(0);
  const [gl] = useState(canWebGL);
  const cubes = useMemo<Cube[]>(() => {
    const top = layers[0].stats.primary.slice(0, 3).map(([t]) => t);
    const out: Cube[] = layers[0].ideas.map((idea, k) => ({ layer: 0, out: false, rank: top.indexOf(idea.k[0]) < 0 ? 3 : top.indexOf(idea.k[0]), delay: ((k * 37) % 100) / 285 }));
    layers.slice(1).forEach((l) => {
      const total = l.kept + l.dropped + l.untagged;
      for (let j = 0; j < total; j++) out.push({ layer: l.depth, out: j >= l.kept, rank: 0, delay: ((j * 53) % 100) / 330 });
    });
    return out;
  }, [layers]);

  const { dots, clumps } = useMemo(() => {
    const rand = rng(11);
    const dots: Dot[] = [];
    const surface = layers[0];
    const top = surface.stats.primary.slice(0, 3);
    const centres = [0.27, 0.5, 0.73];
    const clumps = top.map(([tag, count], i) => ({ tag, count, x: centres[i] }));
    const rank = new Map(top.map(([tag], i) => [tag, i]));
    const seen = [0, 0, 0];
    surface.ideas.forEach((idea, k) => {
      const r = rank.get(idea.k[0]);
      let cx: number;
      let cy: number;
      if (r !== undefined) {
        const j = seen[r]++;
        const rad = 0.0125 * Math.sqrt(j + 0.5);
        cx = centres[r] + Math.cos(j * GOLDEN) * rad;
        cy = 0.66 + Math.sin(j * GOLDEN) * rad * 1.7;
      } else {
        cx = 0.06 + rand() * 0.88;
        cy = rand() < 0.5 ? 0.45 + rand() * 0.04 : 0.91 + rand() * 0.05;
      }
      dots.push({ layer: 0, out: false, disc: r !== undefined, sx: 0.04 + rand() * 0.92, sy: 0.4 + rand() * 0.54, cx, cy, bx: (r ?? 3) * 1000 + k, delay: rand() * 0.35, shade: r ?? 3 });
    });
    layers.slice(1).forEach((l) => {
      const total = l.kept + l.dropped + l.untagged;
      for (let j = 0; j < total; j++) {
        const rad = 0.03 * Math.sqrt(j + 0.5);
        dots.push({ layer: l.depth, out: j >= l.kept, disc: true, sx: 0.3 + rand() * 0.4, sy: 1.15 + rand() * 0.2, cx: 0.5 + Math.cos(j * GOLDEN) * rad, cy: 0.67 + Math.sin(j * GOLDEN) * rad * 1.7, bx: j, delay: rand() * 0.3, shade: 0 });
      }
    });
    // order along each band
    for (let L = 0; L < n; L++) {
      const mine = dots.filter((d) => d.layer === L && !d.out).sort((a, b) => a.bx - b.bx);
      mine.forEach((d, i) => (d.bx = 0.06 + (i / Math.max(mine.length - 1, 1)) * 0.88));
    }
    return { dots, clumps };
  }, [layers, n]);

  const draw = useCallback<Draw>(
    (p, ctx, w, h, time) => {
      const seg = Math.min(n - 1, Math.floor(p * n));
      const t = p * n - seg;
      const narrow = w < 700;
      const unit = Math.min(w, h * 1.3);
      const dark = seg >= 3 ? span(t, 0, 0.3) : 0;
      const fg = gsap.utils.interpolate(INK, FOAM, dark);
      const shades = [fg, gsap.utils.interpolate("#2f6d80", "#8fbbc3", dark), "#8fbbc3", gsap.utils.interpolate("#b9c8c6", "#3d6a7b", dark)];

      for (const d of dots) {
        if (d.layer > seg) continue;
        const wob = Math.sin(time * 0.9 + d.sx * 40) * 0.004;
        const bandY = 0.075 + d.layer * 0.03;
        let x: number;
        let y: number;
        let r = (d.layer === 0 ? 0.0052 : 0.0105) * unit * (narrow ? 1.25 : 1);
        let alpha = 1;
        let colour = d.layer === 0 ? shades[d.shade] : fg;
        const cx = narrow ? 0.5 + (d.cx - 0.5) * 1.18 : d.cx;
        const cy = d.disc ? 0.66 + ((d.cy - 0.66) * Math.min(w / h, 1.7)) / 1.7 : d.cy;
        if (d.layer < seg) {
          x = d.bx;
          y = bandY;
          r *= 0.5;
          alpha = d.out ? 0 : 0.85;
        } else {
          const lt = d.layer === 0 ? span(t, 0.08 + d.delay * 0.5, 0.42 + d.delay * 0.5) : span(t, d.delay * 0.4, 0.3 + d.delay * 0.4);
          x = mix(d.sx, cx, lt) + wob * (1 - lt * 0.6);
          y = mix(d.sy, cy, lt) + wob;
          const last = seg === n - 1;
          if (d.out) {
            const flag = span(t, 0.36, 0.48);
            const fall = span(t, 0.5 + d.delay * 0.3, 0.72 + d.delay * 0.3);
            colour = gsap.utils.interpolate(fg, PINK, flag);
            y += fall * fall * 0.7;
            x += (cx - 0.5) * fall * 0.8;
            alpha = 1 - span(t, 0.62, 0.74);
          } else if (!last) {
            const settle = span(t, 0.74 + d.delay * 0.2, 0.97);
            x = mix(x, d.bx, settle);
            y = mix(y, bandY, settle);
            r *= mix(1, 0.5, settle);
          } else {
            const glow = span(t, 0.72, 0.92);
            colour = gsap.utils.interpolate(fg, "#ff9ccd", glow);
            r *= 1 + glow * 0.5 + Math.sin(time * 2 + d.bx * 9) * 0.06 * glow;
          }
        }
        if (alpha <= 0.01) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = colour;
        ctx.fillRect(x * w - r, y * h - r, r * 2, r * 2);
        if (d.out && d.layer === seg) {
          const flag = span(t, 0.36, 0.48);
          if (flag > 0) {
            ctx.strokeStyle = INK;
            ctx.lineWidth = Math.max(1.5, r * 0.28);
            ctx.beginPath();
            ctx.moveTo(x * w - r * 1.3 * flag, y * h + r * 1.3 * flag);
            ctx.lineTo(x * w + r * 1.3 * flag, y * h - r * 1.3 * flag);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      // name the three places the surface answers gather
      if (seg === 0) {
        const a = span(t, 0.38, 0.5) * (1 - span(t, 0.7, 0.8));
        if (a > 0) {
          ctx.globalAlpha = a;
          ctx.fillStyle = INK;
          ctx.textAlign = "center";
          clumps.forEach((c) => {
            const x = (narrow ? 0.5 + (c.x - 0.5) * 1.18 : c.x) * w;
            ctx.font = `650 ${narrow ? 22 : 34}px "Schibsted Grotesk Variable", sans-serif`;
            ctx.fillText(String(c.count), x, h * 0.845);
            ctx.font = `500 ${narrow ? 10.5 : 15}px "Schibsted Grotesk Variable", sans-serif`;
            const words = label(c.tag);
            if (narrow && words.length > 14) {
              const cut = words.lastIndexOf(" ", 14);
              ctx.fillText(words.slice(0, cut), x, h * 0.845 + 16);
              ctx.fillText(words.slice(cut + 1), x, h * 0.845 + 29);
            } else ctx.fillText(words, x, h * 0.845 + (narrow ? 16 : 26));
          });
          ctx.globalAlpha = 1;
        }
      }
      // band labels
      ctx.textAlign = "left";
      ctx.font = `600 ${narrow ? 10 : 12}px "Schibsted Grotesk Variable", sans-serif`;
      for (let L = 0; L < seg; L++) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = fg;
        ctx.fillText(String(L), w * 0.035 - 4, h * (0.075 + L * 0.03) + 4);
      }
      ctx.globalAlpha = 1;
    },
    [dots, clumps, n],
  );

  const onProgress = useCallback(
    (p: number) => {
      prog.current = p;
      const el = stage.current;
      if (!el) return;
      const seg = Math.min(n - 1, Math.floor(p * n));
      const t = p * n - seg;
      const bg = seg === 0 ? TONES[0] : gsap.utils.interpolate(TONES[Math.min(seg - 1, 3)], TONES[Math.min(seg, 3)], span(t, 0, 0.3));
      const holder = el.parentElement!;
      holder.style.backgroundColor = bg;
      holder.style.color = seg >= 3 ? gsap.utils.interpolate(INK, FOAM, span(t, 0, 0.3)) : INK;
      el.querySelectorAll<HTMLElement>(".story-cap").forEach((cap, i) => {
        let a = 0;
        if (i < n) {
          if (i === seg) a = (i === 0 ? 1 : span(t, 0.12, 0.26)) * (1 - span(t, i === n - 1 ? 0.62 : 0.86, i === n - 1 ? 0.72 : 0.97));
        } else if (seg === n - 1) a = span(t, 0.76, 0.9);
        cap.style.opacity = String(a);
        cap.style.transform = `translateY(${(1 - a) * 22}px)`;
        cap.style.visibility = a > 0.01 ? "visible" : "hidden";
      });
      const num = el.querySelector<HTMLElement>(".story-num");
      if (num && num.textContent !== String(seg)) num.textContent = String(seg);
    },
    [n],
  );

  const deepest = layers[n - 1];
  return (
    <ScrollSequence length={n * 1.5 + 0.5} draw={gl ? undefined : draw} onProgress={onProgress} className="story" label="How Offmap works, step by step">
      {gl && <Stage3D cubes={cubes} layers={n} progress={prog} />}
      <div className="wrap story-over" ref={stage}>
        <p className="story-num" aria-hidden="true">
          0
        </p>
        <div className="story-caps">
          <div className="story-cap">
            <h2>Ask the plain question and the answers pile up.</h2>
            <p>
              {layers[0].stats.n} answers, one cube each. {layers[0].stats.top3} of them stack into the same three piles. Keep scrolling.
            </p>
          </div>
          {layers.slice(1).map((l) => (
            <div className="story-cap" key={l.depth}>
              <h2>{l.depth === 1 ? "Rule that ground out and ask again." : l.depth === 2 ? "The models regroup. Rule that out too." : "And once more."}</h2>
              <p>
                {depthName(l.depth)}: {l.asked} new answers with {plural(l.ruledOut.length, "approach", "approaches")} off limits. {l.kept} pass the check.{" "}
                {l.dropped} broke the rules and fall out.
              </p>
            </div>
          ))}
          <div className="story-cap">
            <h2>
              {deepest.kept} ideas, {deepest.ruledOut.length} approaches away from what everyone else gets.
            </h2>
            <p>That is Offmap. Every layer, and every idea in it, is below.</p>
          </div>
        </div>
      </div>
    </ScrollSequence>
  );
}
