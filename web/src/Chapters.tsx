import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { Idea, Layer, Topic } from "./types";
import { depthName, label, list, lower, plural } from "./lib";
import { calm } from "./motion";

gsap.registerPlugin(ScrollTrigger);

const HEADINGS = ["What everyone gets", "Rule out the surface, ask again", "Rule out that ground too", "And once more"];

function promptFor(topic: Topic, layer: Layer) {
  return `Give me one startup idea for ${topic.topic}. Describe it in two or three sentences. Do not use any of these overused approaches: ${[...layer.ruledOut, ...layer.common].map((t) => t.replace(/_/g, " ")).join("; ")}.`;
}

function Rows({ ideas, models, dropped }: { ideas: Idea[]; models: string[]; dropped?: boolean }) {
  return (
    <ul className={`ch-ideas${dropped ? " is-dropped" : ""}`}>
      {ideas.map((idea, i) => (
        <li key={i}>
          {idea.n && <h4>{idea.n}</h4>}
          <p>{idea.t}</p>
          <span>
            {dropped && idea.hit ? `Dropped: used ${list(idea.hit.map(lower))}` : idea.k.map(label).join(" with ")}, {models[idea.m]}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Slide-over with every answer of one layer, kept and dropped. */
function Drawer({ topic, layer, onClose }: { topic: Topic; layer: Layer; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label={`All answers, ${depthName(layer.depth)}`}>
      <button className="drawer-shade" aria-label="Close" onClick={onClose} />
      <div className={`drawer-panel ch-${Math.min(layer.depth, 3)}`} data-lenis-prevent>
        <header>
          <h3>
            {depthName(layer.depth)}: {plural(layer.kept, "answer")} kept
          </h3>
          <button className="drawer-close" onClick={onClose}>
            Close
          </button>
        </header>
        <Rows ideas={layer.ideas} models={topic.models} />
        {layer.droppedIdeas.length > 0 && (
          <>
            <h3 className="drawer-sub">{plural(layer.droppedIdeas.length, "answer")} dropped for breaking the rules</h3>
            <Rows ideas={layer.droppedIdeas} models={topic.models} dropped />
          </>
        )}
      </div>
    </div>
  );
}

function Chapter({ topic, layer, index, onOpen }: { topic: Topic; layer: Layer; index: number; onOpen: () => void }) {
  const [copied, setCopied] = useState(false);
  const max = layer.stats.used[0]?.[1] ?? 1;
  const groups = topic.layers.filter((l) => l.depth < layer.depth);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(promptFor(topic, layer));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <article className={`chapter ch-${Math.min(index, 3)}`} style={{ ["--i" as string]: index }}>
      <span className="ch-tab">
        {index} {depthName(layer.depth)}
      </span>
      <div className="ch-left">
        <p className="ch-num" aria-hidden="true">
          {index}
        </p>
        <h2>{HEADINGS[index] ?? "Deeper again"}</h2>
        <p className="ch-lede">
          {index === 0
            ? `${layer.stats.n} plain answers. Only ${layer.stats.distinct} of ${topic.vocabulary} possible approaches show up at all.`
            : `${layer.asked} new answers with ${plural(layer.ruledOut.length, "approach", "approaches")} ruled out. ${layer.kept} kept, ${layer.dropped} dropped for breaking the rules.`}
        </p>
        {index > 0 && (
          <>
            <div className="ch-marks" aria-hidden="true">
              {Array.from({ length: layer.kept }, (_, i) => (
                <i key={i} />
              ))}
              {Array.from({ length: layer.dropped + layer.untagged }, (_, i) => (
                <i key={`d${i}`} className="is-out" />
              ))}
            </div>
            <p className="ch-ruled">
              {groups.flatMap((g) => g.common).map((t) => (
                <s key={t}>{label(t)}</s>
              ))}
            </p>
          </>
        )}
      </div>
      <div className="ch-right">
        <div className="ch-bars">
          {layer.stats.used.slice(0, 5).map(([tag, count]) => (
            <div key={tag} className={layer.common.includes(tag) ? "is-common" : undefined}>
              <span>{label(tag)}</span>
              <b>
                <i style={{ width: `${(count / max) * 100}%` }} />
              </b>
              <em>{count}</em>
            </div>
          ))}
        </div>
        <Rows ideas={layer.ideas.slice(0, index === 0 ? 1 : 2)} models={topic.models} />
        <div className="ch-actions">
          <button className="ch-btn" data-magnetic onClick={onOpen}>
            Read all {layer.kept + layer.droppedIdeas.length} answers
          </button>
          <button className="ch-btn is-ghost" data-magnetic onClick={copy}>
            {copied ? "Copied" : "Copy the prompt for this depth"}
          </button>
        </div>
      </div>
    </article>
  );
}

/** The layers as chapters on a horizontal track: scrolling down moves the track sideways. */
export function Chapters({ topic }: { topic: Topic }) {
  const root = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const n = topic.layers.length;
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const track = el.querySelector<HTMLElement>(".ch-track")!;
      gsap.to(track, {
        x: () => -(track.scrollWidth - window.innerWidth),
        ease: "none",
        scrollTrigger: { trigger: el, start: "top top", end: "bottom bottom", scrub: 0.8, invalidateOnRefresh: true, onUpdate: (s) => track.style.setProperty("--p", String(s.progress * (n - 1))) },
      });
    }, el);
    return () => ctx.revert();
  }, [n, topic]);
  return (
    <section className="chapters" ref={root} style={{ height: `calc(100vh + ${(n - 1) * 92}vw)` }}>
      {topic.layers.map((l, i) => (
        <span key={l.depth} id={`depth-${l.depth}`} className="ch-anchor" style={{ top: `${i * 92}vw` }} />
      ))}
      <div className="ch-stage">
        <div className="ch-track">
          {topic.layers.map((l, i) => (
            <Chapter key={l.depth} topic={topic} layer={l} index={i} onOpen={() => setOpen(i)} />
          ))}
        </div>
      </div>
      {open !== null && <Drawer topic={topic} layer={topic.layers[open]} onClose={() => setOpen(null)} />}
    </section>
  );
}

/* ── two cages of balls you can throw: every checked answer, kept or dropped ── */
type Ball = { x: number; y: number; vx: number; vy: number; cage: number };

export function Tumblers({ topic }: { topic: Topic }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const totals = useMemo(() => {
    const deep = topic.layers.slice(1);
    return [deep.reduce((s, l) => s + l.kept, 0), deep.reduce((s, l) => s + l.dropped, 0)];
  }, [topic]);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    let w = 0;
    let h = 0;
    let R = 0;
    let r = 0;
    let seen = false;
    let cages: { x: number; y: number }[] = [];
    let balls: Ball[] = [];
    let grab: Ball | null = null;
    const ptr = { x: 0, y: 0, px: 0, py: 0 };
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const stack = w < 720;
      R = stack ? Math.min(w * 0.4, h * 0.23) : Math.min(w * 0.2, h * 0.44);
      r = R * 0.105;
      cages = stack ? [{ x: w / 2, y: h * 0.26 }, { x: w / 2, y: h * 0.75 }] : [{ x: w * 0.28, y: h / 2 }, { x: w * 0.72, y: h / 2 }];
      balls = totals.flatMap((count, c) =>
        Array.from({ length: count }, (_, i) => ({ x: cages[c].x + Math.cos(i * 2.4) * R * 0.6 * Math.sqrt((i + 1) / count), y: cages[c].y - R * 0.3 + Math.sin(i * 2.4) * R * 0.5 * Math.sqrt((i + 1) / count), vx: 0, vy: 0, cage: c })),
      );
    };
    const step = () => {
      if (!seen || !w) return;
      for (let k = 0; k < 2; k++) {
        for (const b of balls) {
          if (b === grab) {
            b.vx = (ptr.x - b.x) * 0.5;
            b.vy = (ptr.y - b.y) * 0.5;
          } else b.vy += 0.22;
          b.vx *= 0.992;
          b.vy *= 0.992;
          b.x += b.vx;
          b.y += b.vy;
          const c = cages[b.cage];
          const dx = b.x - c.x;
          const dy = b.y - c.y;
          const d = Math.hypot(dx, dy);
          if (d > R - r) {
            const nx = dx / d;
            const ny = dy / d;
            b.x = c.x + nx * (R - r);
            b.y = c.y + ny * (R - r);
            const vn = b.vx * nx + b.vy * ny;
            if (vn > 0) {
              b.vx -= 1.7 * vn * nx;
              b.vy -= 1.7 * vn * ny;
            }
          }
        }
        for (let i = 0; i < balls.length; i++) {
          for (let j = i + 1; j < balls.length; j++) {
            const a = balls[i];
            const b = balls[j];
            if (a.cage !== b.cage) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.hypot(dx, dy) || 0.01;
            if (d < r * 2) {
              const nx = dx / d;
              const ny = dy / d;
              const push = (r * 2 - d) / 2;
              a.x -= nx * push;
              a.y -= ny * push;
              b.x += nx * push;
              b.y += ny * push;
              const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
              if (rel < 0) {
                a.vx += rel * nx * 0.86;
                a.vy += rel * ny * 0.86;
                b.vx -= rel * nx * 0.86;
                b.vy -= rel * ny * 0.86;
              }
            }
          }
        }
      }
      for (const b of balls) {
        const c = cages[b.cage];
        const d = Math.hypot(b.x - c.x, b.y - c.y);
        if (d > R - r) {
          b.x = c.x + ((b.x - c.x) / d) * (R - r);
          b.y = c.y + ((b.y - c.y) / d) * (R - r);
        }
      }
      ctx.clearRect(0, 0, w, h);
      cages.forEach((c) => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, R, 0, 6.3);
        ctx.strokeStyle = "rgba(244,248,253,0.55)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });
      for (const b of balls) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, r - 0.6, 0, 6.3);
        if (b.cage === 0) {
          ctx.fillStyle = "#ffd08c";
          ctx.fill();
        } else {
          ctx.strokeStyle = "#7fb4ff";
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(b.x - r * 0.6, b.y + r * 0.6);
          ctx.lineTo(b.x + r * 0.6, b.y - r * 0.6);
          ctx.stroke();
        }
      }
    };
    const at = (e: PointerEvent) => {
      const box = cv.getBoundingClientRect();
      ptr.x = e.clientX - box.left;
      ptr.y = e.clientY - box.top;
    };
    const down = (e: PointerEvent) => {
      at(e);
      grab = balls.find((b) => Math.hypot(b.x - ptr.x, b.y - ptr.y) < r * 1.6) ?? null;
      if (grab) cv.setPointerCapture(e.pointerId);
    };
    const up = () => (grab = null);
    size();
    const io = new IntersectionObserver(([e]) => (seen = e.isIntersecting));
    io.observe(cv);
    if (calm()) {
      seen = true;
      for (let i = 0; i < 400; i++) step();
      seen = false;
    } else gsap.ticker.add(step);
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", at);
    window.addEventListener("pointerup", up);
    window.addEventListener("resize", size);
    return () => {
      gsap.ticker.remove(step);
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", at);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("resize", size);
      io.disconnect();
    };
  }, [totals]);
  return (
    <section className="tumblers">
      <div className="wrap">
        <h2>Every answer below the surface was checked.</h2>
        <p className="tumblers-sub">One ball for each. Pick one up and throw it.</p>
      </div>
      <canvas ref={ref} className="tumblers-canvas" aria-label={`${totals[0]} answers kept, ${totals[1]} dropped`} />
      <div className="tumblers-labels" aria-hidden="true">
        <p>
          <b>{totals[0]}</b> kept: passed the check
        </p>
        <p>
          <b>{totals[1]}</b> dropped: used something ruled out
        </p>
      </div>
    </section>
  );
}

/** Counter that resolves into a hairline, which opens like a shutter. */
export function Loader({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const n = { v: 0 };
    const num = el.querySelector<HTMLElement>(".ld-num")!;
    const tl = gsap.timeline({ onComplete: onDone });
    tl.to(n, { v: 100, duration: 1.15, ease: "power2.inOut", onUpdate: () => (num.textContent = String(Math.round(n.v)).padStart(2, "0")) })
      .to(".ld-dot", { scaleX: 0, scaleY: 0, duration: 0.25, ease: "power2.in" }, "-=0.2")
      .fromTo(".ld-line", { scaleX: 0.06 }, { scaleX: 1, duration: 0.45, ease: "power3.inOut" }, "-=0.25")
      .to(num, { autoAlpha: 0, duration: 0.2 }, "<")
      .to(".ld-top", { yPercent: -100, duration: 0.75, ease: "power4.inOut" })
      .to(".ld-bottom", { yPercent: 100, duration: 0.75, ease: "power4.inOut" }, "<")
      .to(".ld-line", { autoAlpha: 0, duration: 0.3 }, "<");
    return () => void tl.kill();
  }, [onDone]);
  return (
    <div className="ld" ref={root} aria-hidden="true">
      <div className="ld-half ld-top" />
      <div className="ld-half ld-bottom" />
      <span className="ld-dot" />
      <span className="ld-line" />
      <span className="ld-num">00</span>
    </div>
  );
}
