import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { calm, scrollToId } from "./motion";

gsap.registerPlugin(ScrollTrigger);

/* ── floating pill navigation with a sliding marker ── */
const STOPS = [
  ["top", "Start"],
  ["how", "How it works"],
  ["depth-0", "Layers"],
  ["place", "Your idea"],
  ["method", "Method"],
] as const;

export function PillNav({ ready }: { ready: boolean }) {
  const [active, setActive] = useState(0);
  const bar = useRef<HTMLElement>(null);
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ready) return;
    const triggers = STOPS.map(([id], i) => {
      const el = document.getElementById(id);
      return el && ScrollTrigger.create({ trigger: el, start: "top 55%", end: "bottom 55%", onToggle: (s) => s.isActive && setActive(i) });
    });
    // later stops run to the next stop, not just their own box
    return () => triggers.forEach((t) => t && t.kill());
  }, [ready]);

  useLayoutEffect(() => {
    const link = bar.current?.querySelectorAll<HTMLElement>("a")[active];
    if (!link || !marker.current) return;
    gsap.to(marker.current, { x: link.offsetLeft, width: link.offsetWidth, duration: calm() ? 0 : 0.5, ease: "power3.out" });
  }, [active, ready]);

  return (
    <nav className="pill" ref={bar} aria-label="Page">
      <span className="pill-marker" ref={marker} />
      {STOPS.map(([id, name], i) => (
        <a
          key={id}
          href={`#${id}`}
          className={i === active ? "is-on" : undefined}
          aria-current={i === active ? "true" : undefined}
          onClick={(e) => {
            e.preventDefault();
            scrollToId(id);
          }}
        >
          {name}
        </a>
      ))}
    </nav>
  );
}

/* ── our own stickers: pieces of the map ── */
export function Sticker({ kind, speed, className }: { kind: "struck" | "dot" | "grid" | "ring"; speed: number; className: string }) {
  return (
    <svg className={`sticker ${className}`} data-speed={speed} viewBox="0 0 100 100" aria-hidden="true">
      {kind === "struck" && (
        <>
          <rect x="10" y="10" width="80" height="80" fill="#0a2230" />
          <line x1="2" y1="98" x2="98" y2="2" stroke="#ff5fa8" strokeWidth="11" />
        </>
      )}
      {kind === "dot" && <rect x="18" y="18" width="64" height="64" fill="#c2247a" transform="rotate(12 50 50)" />}
      {kind === "grid" &&
        [0, 1, 2, 3].map((i) => <rect key={i} x={8 + (i % 2) * 46} y={8 + Math.floor(i / 2) * 46} width="38" height="38" fill={i === 3 ? "#ff9ccd" : "#2f6d80"} />)}
      {kind === "ring" && <rect x="12" y="12" width="76" height="76" fill="none" stroke="#0a2230" strokeWidth="9" strokeDasharray="14 10" />}
    </svg>
  );
}

/** Moves every [data-speed] element inside `root` at its own rate while scrolling past. */
export function useParallax(root: React.RefObject<HTMLElement | null>, dep: unknown) {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || calm()) return;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-speed]", el).forEach((s) => {
        const k = Number(s.dataset.speed);
        gsap.fromTo(s, { yPercent: 60 * k, rotation: -10 * k }, { yPercent: -60 * k, rotation: 14 * k, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 1.2 } });
      });
    }, el);
    return () => ctx.revert();
  }, [root, dep]);
}

/* ── a paragraph that lights up word by word as it crosses the screen ── */
export function ScrubText({ text }: { text: string }) {
  const root = useRef<HTMLElement>(null);
  const words = useMemo(() => text.split(" "), [text]);
  useParallax(root, text);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || calm()) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".scrub-w", { opacity: 0.16 }, { opacity: 1, stagger: 0.08, ease: "none", scrollTrigger: { trigger: ".scrub-p", start: "top 78%", end: "bottom 42%", scrub: 0.5 } });
    }, el);
    return () => ctx.revert();
  }, [text]);
  return (
    <section className="scrub tone-0" ref={root} id="how">
      <Sticker kind="struck" speed={1.3} className="st-a" />
      <Sticker kind="grid" speed={0.7} className="st-b" />
      <Sticker kind="dot" speed={1.8} className="st-c" />
      <Sticker kind="ring" speed={1} className="st-d" />
      <div className="wrap">
        <p className="scrub-p">
          {words.map((w, i) => (
            <span className="scrub-w" key={i}>
              {w}{" "}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

/* ── the names the models gave, running past; faster when you scroll faster ── */
export function Marquee({ names }: { names: string[] }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || calm()) return;
    const ctx = gsap.context(() => {
      const rows = gsap.utils.toArray<HTMLElement>(".marquee-track", el);
      const loops = rows.map((row, i) => gsap.fromTo(row, { xPercent: i ? -50 : 0 }, { xPercent: i ? 0 : -50, repeat: -1, duration: 46, ease: "none" }));
      ScrollTrigger.create({
        trigger: el,
        start: "top bottom",
        end: "bottom top",
        onUpdate: (s) => {
          const boost = 1 + Math.min(Math.abs(s.getVelocity()) / 260, 9);
          loops.forEach((l) => gsap.to(l, { timeScale: boost, duration: 0.2, overwrite: true, onComplete: () => void gsap.to(l, { timeScale: 1, duration: 1.2 }) }));
        },
      });
    }, el);
    return () => ctx.revert();
  }, [names]);
  const half = Math.ceil(names.length / 2);
  const rows = [names.slice(0, half), names.slice(half)];
  return (
    <div className="marquee" ref={root} aria-label={`Product names the models gave, in the order they came back: ${names.length} answers had a name`}>
      {rows.map((row, r) => (
        <div className="marquee-track" key={r} aria-hidden="true">
          {[...row, ...row].map((n, i) => (
            <span key={i} className={n === names[0] ? undefined : undefined}>
              {n}
              <i />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── pinned paint-over: diagonal strokes cover the screen, the line underneath changes, they wipe away ── */
const ORDER = [0, 12, 2, 10, 4, 8, 6, 1, 11, 3, 9, 5, 7];
const INKS = ["#c2247a", "#0f3d52", "#ff9ccd", "#2f6d80"];

export function Paint({ before, after, sub }: { before: string; after: string; sub: string }) {
  const root = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const strokes = gsap.utils.toArray<SVGLineElement>(".paint-s", el);
      const inOrder = ORDER.map((i) => strokes[i]);
      const pops = gsap.utils.toArray<SVGElement>(".paint-pop", el);
      gsap.set(strokes, { strokeDasharray: 1, strokeDashoffset: 1 });
      gsap.set(".paint-b", { autoAlpha: 0 });
      gsap.set(pops, { scale: 0, rotation: -60, transformOrigin: "50% 50%" });
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top top", end: "bottom bottom", scrub: 0.5 } });
      tl.to({}, { duration: 0.5 })
        .to(inOrder, { strokeDashoffset: 0, duration: 0.6, ease: "power2.out", stagger: 0.045 })
        .set(".paint-a", { autoAlpha: 0 })
        .set(".paint-b", { autoAlpha: 1 })
        .to({}, { duration: 0.15 })
        .to([...inOrder].reverse(), { strokeDashoffset: -1, duration: 0.6, ease: "power2.in", stagger: 0.045 })
        .to(pops, { scale: 1, rotation: 60, duration: 0.35, ease: "back.out(2)", stagger: 0.08 }, "-=0.35")
        .to(pops, { scale: 0, rotation: 140, duration: 0.3, ease: "back.in(2)", stagger: 0.06 }, "+=0.35")
        .to({}, { duration: 0.3 });
    }, el);
    return () => ctx.revert();
  }, [before, after]);

  return (
    <section className="paint" ref={root} aria-label={`${before} ${after}`}>
      <div className="paint-stage">
        <p className="paint-line paint-a">{before}</p>
        <div className="paint-line paint-b">
          <p>{after}</p>
          <span>{sub}</span>
        </div>
        <svg className="paint-pops" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <rect className="paint-pop" x="220" y="150" width="90" height="90" fill="#c2247a" />
          <rect className="paint-pop" x="1290" y="210" width="64" height="64" fill="#0a2230" />
          <rect className="paint-pop" x="1160" y="640" width="110" height="110" fill="#ff9ccd" />
        </svg>
        <svg className="paint-strokes" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true">
          {Array.from({ length: 13 }, (_, i) => (
            <line key={i} className="paint-s" pathLength={1} x1={-900 + i * 200} y1={1010} x2={-200 + i * 200} y2={-110} stroke={INKS[i % INKS.length]} strokeWidth={212} />
          ))}
        </svg>
      </div>
    </section>
  );
}

/* ── what you can do with it: cards dealt onto a stack ── */
export function Uses({ items }: { items: { title: string; body: string; go: string; label: string }[] }) {
  return (
    <section className="uses-stack tone-0">
      <div className="wrap">
        <h2 data-reveal className="rise">Four things to do with it</h2>
        <div className="deal">
          {items.map((it, i) => (
            <article key={it.title} className={`deal-card deal-${i}`} style={{ ["--i" as string]: i }}>
              <span className="deal-n">{i + 1}</span>
              <h3>{it.title}</h3>
              <p>{it.body}</p>
              <button className="deal-go" data-magnetic onClick={() => scrollToId(it.go)}>
                {it.label}
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Buttons marked data-magnetic lean toward the cursor. */
export function magnetize() {
  if (calm() || !window.matchMedia("(hover: hover)").matches) return () => {};
  const move = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-magnetic]");
    if (!el) return;
    const r = el.getBoundingClientRect();
    gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.3, y: (e.clientY - r.top - r.height / 2) * 0.4, scale: 1.05, duration: 0.3, overwrite: true });
  };
  const out = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-magnetic]");
    if (el && !el.contains(e.relatedTarget as Node)) gsap.to(el, { x: 0, y: 0, scale: 1, duration: 0.6, ease: "elastic.out(1, 0.4)", overwrite: true });
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseout", out);
  return () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseout", out);
  };
}
