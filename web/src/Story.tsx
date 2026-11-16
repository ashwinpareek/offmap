import { useCallback, useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import type { Topic } from "./types";
import { depthName, label, plural } from "./lib";
import { ScrollSequence } from "./ScrollSequence";
import type { Draw } from "./ScrollSequence";
import { calm } from "./motion";

const TONES = ["#050a14", "#07101f", "#0a172d", "#0d1f3d"];
const INK = "#dfe9f7";
const FOAM = "#f4f8fd";
const PINK = "#ffd08c";
const PINK_LIGHT = "#ffd9a0";
const COLS = 88;
const ROWS = 56;

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const span = (t: number, a: number, b: number) => ease((t - a) / (b - a));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

type Peak = { x: number; y: number; h: number; s: number; name: string; count: number; of: number };
type Sheet = { peaks: Peak[] };

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** One survey sheet per layer: a peak for every approach the models piled onto, as tall as its share of the answers. */
function survey(topic: Topic): Sheet[] {
  return topic.layers.map((l, li) => {
    const rand = rng(31 + li * 17);
    const spots = [
      [0.3, 0.36], [0.68, 0.6], [0.56, 0.24], [0.26, 0.72], [0.82, 0.3], [0.46, 0.78], [0.14, 0.46], [0.86, 0.78],
    ];
    const common = l.stats.used.filter(([t]) => l.common.includes(t)).slice(0, 6);
    const rest = l.stats.used.filter(([t]) => !l.common.includes(t)).slice(0, Math.max(0, 8 - common.length));
    const peaks = [...common, ...rest].map(([tag, count], i) => {
      const share = count / l.stats.n;
      return { x: spots[i][0] + (rand() - 0.5) * 0.06, y: spots[i][1] + (rand() - 0.5) * 0.06, h: share, s: 0.07 + Math.sqrt(share) * 0.13, name: label(tag), count, of: l.stats.n };
    });
    return { peaks };
  });
}

function heightAt(sheet: Sheet, x: number, y: number, aspect: number) {
  let h = 0;
  for (const p of sheet.peaks) {
    const dx = (x - p.x) * aspect;
    const dy = y - p.y;
    h += p.h * Math.exp(-(dx * dx + dy * dy) / (2 * p.s * p.s));
  }
  return h;
}

/** Draw the contour lines of a height grid with marching squares. */
function contours(ctx: CanvasRenderingContext2D, grid: Float32Array, x0: number, y0: number, cw: number, ch: number, levels: number[], colour: string, reveal: number, gold = colour) {
  const lerp = (a: number, b: number, lv: number) => (lv - a) / (b - a);
  levels.forEach((lv, li) => {
    const index = li % 4 === 3;
    ctx.beginPath();
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        if (c / COLS > reveal) continue; // the sheet is drawn in from the left
        const a = grid[r * COLS + c];
        const b = grid[r * COLS + c + 1];
        const d = grid[(r + 1) * COLS + c];
        const e = grid[(r + 1) * COLS + c + 1];
        const k = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (e > lv ? 2 : 0) | (d > lv ? 1 : 0);
        if (k === 0 || k === 15) continue;
        const px = x0 + c * cw;
        const py = y0 + r * ch;
        const T: [number, number] = [px + lerp(a, b, lv) * cw, py];
        const R: [number, number] = [px + cw, py + lerp(b, e, lv) * ch];
        const B: [number, number] = [px + lerp(d, e, lv) * cw, py + ch];
        const L: [number, number] = [px, py + lerp(a, d, lv) * ch];
        const seg = (p: [number, number], q: [number, number]) => {
          ctx.moveTo(p[0], p[1]);
          ctx.lineTo(q[0], q[1]);
        };
        if (k === 1 || k === 14) seg(L, B);
        else if (k === 2 || k === 13) seg(B, R);
        else if (k === 3 || k === 12) seg(L, R);
        else if (k === 4 || k === 11) seg(T, R);
        else if (k === 6 || k === 9) seg(T, B);
        else if (k === 7 || k === 8) seg(L, T);
        else if (k === 5) (seg(L, T), seg(B, R));
        else if (k === 10) (seg(L, B), seg(T, R));
      }
    }
    ctx.strokeStyle = index ? gold : colour;
    ctx.globalAlpha = index ? 0.9 : 0.42;
    ctx.lineWidth = index ? 1.5 : 1;
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function makeDraw(topic: Topic, sheets: Sheet[], ambient: boolean): Draw {
  const n = sheets.length;
  const grid = new Float32Array(COLS * ROWS);
  const levels = Array.from({ length: 22 }, (_, i) => 0.022 + i * 0.026);
  const deepest = topic.layers[n - 1];
  const finds = deepest.ideas.map((i) => i.n ?? label(i.k[0])).slice(0, 9);
  const rand = rng(5);
  const findSpots = finds.map((_, i) => [0.1 + ((i * 0.37) % 0.8) + (rand() - 0.5) * 0.05, 0.12 + (i % 3) * 0.3 + rand() * 0.12]);

  return (p, ctx, w, h, time) => {
    const seg = ambient ? 0 : Math.min(n - 1, Math.floor(p * n));
    const t = ambient ? 0.3 : p * n - seg;
    const last = seg === n - 1;
    const narrow = w < 760;
    const dark = seg >= 3 ? span(t, 0, 0.3) : 0;
    const fg = gsap.utils.interpolate(INK, FOAM, dark);
    const accent = gsap.utils.interpolate(PINK, PINK_LIGHT, dark);

    // the sheet: right side on wide screens, lower half on narrow ones; it shrinks at the end to show what lies outside it
    const out = !ambient && last ? span(t, 0.66, 0.92) : 0;
    let mx = ambient ? w * 0.42 : narrow ? w * 0.06 : w * 0.47;
    let my = ambient ? h * 0.06 : narrow ? h * 0.44 : h * 0.3;
    let mw = ambient ? w * 0.62 : narrow ? w * 0.88 : w * 0.48;
    let mh = ambient ? h * 0.88 : narrow ? h * 0.42 : h * 0.56;
    const full = { x: mx, y: my, w: mw };
    const shrink = mix(1, narrow ? 0.62 : 0.62, out);
    mx += mw * (1 - shrink) * 0.5;
    my += mh * (1 - shrink) * (narrow ? 0.5 : 1);
    mw *= shrink;
    mh *= shrink;

    // height field: this layer's ground, melting into the next one's
    const blend = !ambient && !last ? span(t, 0.58, 0.96) : 0;
    const A = sheets[seg];
    const B = sheets[Math.min(seg + 1, n - 1)];
    const aspect = mw / mh;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c / (COLS - 1);
        const y = r / (ROWS - 1);
        const swell = 0.012 * Math.sin(x * 9 + time * 0.35) * Math.cos(y * 7 - time * 0.27) + 0.008 * Math.sin((x + y) * 15 + time * 0.2);
        grid[r * COLS + c] = mix(heightAt(A, x, y, aspect), heightAt(B, x, y, aspect), blend) + swell + 0.012;
      }
    }
    const reveal = ambient ? 1 : seg === 0 ? span(t, 0.0, 0.22) * 1.05 + 0.0 : 1.05;
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();
    ctx.globalAlpha = ambient ? 0.6 : 1;
    contours(ctx, grid, mx, my, mw / (COLS - 1), mh / (ROWS - 1), levels, "#7fb4ff", Math.max(reveal, seg === 0 && !ambient ? 0.02 : 1.05), accent);
    ctx.restore();
    if (ambient) return;

    // neat line, ticks and sheet title, like a survey map
    ctx.strokeStyle = fg;
    ctx.fillStyle = fg;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(mx, my, mw, mh);
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const x = mx + (mw * i) / 12;
      ctx.moveTo(x, my - (i % 3 === 0 ? 9 : 5));
      ctx.lineTo(x, my);
      ctx.moveTo(x, my + mh);
      ctx.lineTo(x, my + mh + (i % 3 === 0 ? 9 : 5));
    }
    for (let i = 0; i <= 8; i++) {
      const y = my + (mh * i) / 8;
      ctx.moveTo(mx - (i % 2 === 0 ? 9 : 5), y);
      ctx.lineTo(mx, y);
      ctx.moveTo(mx + mw, y);
      ctx.lineTo(mx + mw + (i % 2 === 0 ? 9 : 5), y);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.75;
    ctx.font = `600 ${narrow ? 10 : 12}px "Sora Variable", sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(`Sheet ${seg}. ${depthName(seg)}`, mx, my - 16);
    ctx.textAlign = "right";
    ctx.fillText(`Height is the share of ${topic.layers[seg].stats.n} answers`, mx + mw, my + mh + 24);
    ctx.globalAlpha = 1;

    // spot heights: name and count on every peak; struck through once ruled out
    const labels = (sheet: Sheet, alpha: number, struck: number, tall: boolean) => {
      if (alpha <= 0.01) return;
      sheet.peaks.forEach((pk, i) => {
        if (narrow && i > 3) return;
        const x = mx + pk.x * mw;
        const y = my + pk.y * mh;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x + 5, y + 4);
        ctx.lineTo(x - 5, y + 4);
        ctx.closePath();
        ctx.fill();
        const size = (narrow ? 11 : 15) * (tall && i < 3 ? 1.15 : 1) * shrink;
        ctx.font = `italic 400 ${size}px "Libre Caslon Text", Georgia, serif`;
        const flip = pk.x > 0.6;
        const tw = ctx.measureText(pk.name).width;
        const lx = flip ? x - 10 - tw : x + 10;
        ctx.textAlign = "left";
        ctx.fillText(pk.name, lx, y + 2);
        ctx.font = `650 ${(narrow ? 10 : 12) * shrink}px "Sora Variable", sans-serif`;
        ctx.fillText(`${pk.count} of ${pk.of}`, lx, y + 2 + size);
        if (struck > 0) {
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(lx - 3, y - size * 0.25);
          ctx.lineTo(lx - 3 + (tw + 6) * struck, y - size * 0.25);
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 1;
    };
    const shown = seg === 0 ? span(t, 0.2, 0.32) : 1;
    labels(A, shown * (1 - blend), last ? 0 : span(t, 0.38, 0.56), true);
    if (!last) labels(B, blend, 0, true);

    // off the map: what the last sheet found, marked outside the neat line
    if (out > 0) {
      finds.forEach((name, i) => {
        const a = span(out, 0.15 + i * 0.07, 0.4 + i * 0.07);
        if (a <= 0) return;
        const fx = narrow ? w * (0.06 + (i % 3) * 0.31) : full.x + (i % 3) * (full.w / 3);
        const yy = narrow ? my + mh + 34 + Math.floor(i / 3) * 34 : full.y + 14 + Math.floor(i / 3) * 40 + findSpots[i][1] * 8;
        ctx.globalAlpha = a;
        ctx.fillStyle = accent;
        const sq = narrow ? 9 : 12;
        ctx.fillRect(fx, yy - sq, sq, sq);
        ctx.fillStyle = fg;
        ctx.font = `italic 400 ${narrow ? 11 : 14}px "Libre Caslon Text", Georgia, serif`;
        ctx.textAlign = "left";
        ctx.fillText(name.length > 20 ? `${name.slice(0, 19)}…` : name, fx + sq + 7, yy - 1);
      });
      ctx.globalAlpha = 1;
    }
  };
}

/** Faint, slowly moving contours behind the opening headline. */
export function ContourBg({ topic }: { topic: Topic }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const draw = useMemo(() => makeDraw(topic, survey(topic), true), [topic]);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    let w = 0;
    let h = 0;
    let seen = true;
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const paint = (time: number) => {
      if (!seen || !w) return;
      ctx.clearRect(0, 0, w, h);
      draw(0, ctx, w, h, calm() ? 0 : time);
    };
    size();
    const io = new IntersectionObserver(([e]) => (seen = e.isIntersecting));
    io.observe(cv);
    if (calm()) paint(0);
    else gsap.ticker.add(paint);
    window.addEventListener("resize", size);
    return () => {
      gsap.ticker.remove(paint);
      window.removeEventListener("resize", size);
      io.disconnect();
    };
  }, [draw]);
  return <canvas ref={ref} className="contour-bg" aria-hidden="true" />;
}

/** The method as a survey map that redraws itself: peaks are the approaches every model piles onto. */
export function Story({ topic }: { topic: Topic }) {
  const layers = topic.layers;
  const n = layers.length;
  const stage = useRef<HTMLDivElement>(null);
  const draw = useMemo(() => makeDraw(topic, survey(topic), false), [topic]);

  const onProgress = useCallback(
    (p: number) => {
      const el = stage.current;
      if (!el) return;
      const seg = Math.min(n - 1, Math.floor(p * n));
      const t = p * n - seg;
      const holder = el.parentElement!;
      holder.style.backgroundColor = seg === 0 ? TONES[0] : gsap.utils.interpolate(TONES[Math.min(seg - 1, 3)], TONES[Math.min(seg, 3)], span(t, 0, 0.3));
      holder.style.color = seg >= 3 ? gsap.utils.interpolate(INK, FOAM, span(t, 0, 0.3)) : INK;
      el.querySelectorAll<HTMLElement>(".story-cap").forEach((cap, i) => {
        let a = 0;
        if (i < n) {
          if (i === seg) a = (i === 0 ? 1 : span(t, 0.1, 0.24)) * (1 - span(t, i === n - 1 ? 0.56 : 0.86, i === n - 1 ? 0.66 : 0.97));
        } else if (seg === n - 1) a = span(t, 0.7, 0.84);
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
    <ScrollSequence length={n * 1.5 + 0.5} draw={draw} onProgress={onProgress} className="story" label="How Offmap works, step by step">
      <div className="wrap story-over" ref={stage}>
        <p className="story-num" aria-hidden="true">
          0
        </p>
        <div className="story-caps">
          <div className="story-cap">
            <h2>Ask the plain question and the answers pile up.</h2>
            <p>
              This is a map of {layers[0].stats.n} answers. Every peak is an approach the models keep reaching for, and the taller the peak, the more
              of them landed there.
            </p>
          </div>
          {layers.slice(1).map((l) => (
            <div className="story-cap" key={l.depth}>
              <h2>{l.depth === 1 ? "Rule those peaks out and survey again." : l.depth === 2 ? "New peaks form. Rule them out too." : "And once more."}</h2>
              <p>
                {depthName(l.depth)}: {l.asked} new answers with {plural(l.ruledOut.length, "approach", "approaches")} off limits. {l.kept} pass the check.
                The ground is lower and flatter: less agreement.
              </p>
            </div>
          ))}
          <div className="story-cap">
            <h2>{deepest.kept} ideas that are off the map.</h2>
            <p>
              They sit {deepest.ruledOut.length} approaches away from what everyone else gets. Every layer, and every idea in it, is below.
            </p>
          </div>
        </div>
      </div>
    </ScrollSequence>
  );
}
