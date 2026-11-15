import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { calm } from "./motion";

gsap.registerPlugin(ScrollTrigger);

function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(calm);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setSeen(true), io.disconnect()), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

/** A number that counts up to its value the first time it is on screen. */
export function Count({ n }: { n: number }) {
  const [ref, seen] = useSeen<HTMLSpanElement>();
  const [v, setV] = useState(calm() ? n : 0);
  useEffect(() => {
    if (!seen || calm()) return;
    const o = { v: 0 };
    const t = gsap.to(o, { v: n, duration: 1.3, ease: "power2.out", onUpdate: () => setV(Math.round(o.v)) });
    return () => void t.kill();
  }, [seen, n]);
  return (
    <span ref={ref} className="count" aria-label={String(n)}>
      {v}
    </span>
  );
}

/** A heading whose words rise out of a mask when it scrolls into view. */
export function Words({ text, as: Tag = "h2" }: { text: string; as?: "h2" | "h3" | "p" }) {
  return (
    <Tag className="rw" data-reveal aria-label={text}>
      {text.split(" ").map((w, i) => (
        <span className="rw-w" key={i} aria-hidden="true">
          <span style={{ ["--i" as string]: i }}>{w}</span>
        </span>
      ))}
    </Tag>
  );
}

/** Text typed out character by character, the way you would paste it into a chat box. */
export function Typed({ text, className }: { text: string; className?: string }) {
  const [ref, seen] = useSeen<HTMLParagraphElement>();
  const [n, setN] = useState(calm() ? text.length : 0);
  useEffect(() => {
    if (!seen || calm()) return;
    const o = { n: 0 };
    const t = gsap.to(o, { n: text.length, duration: Math.min(3.2, text.length / 70), ease: "none", onUpdate: () => setN(Math.round(o.n)) });
    return () => void t.kill();
  }, [seen, text]);
  return (
    <p ref={ref} className={className} aria-label={text}>
      <span aria-hidden="true">{text.slice(0, n)}</span>
      {n < text.length && <i className="caret" aria-hidden="true" />}
      <span className="typed-rest" aria-hidden="true">{text.slice(n)}</span>
    </p>
  );
}

/** The edge of the layer above, drawn as a waterline that drains away as you scroll in. */
export function Wave({ fill }: { fill: string }) {
  return (
    <svg className="wave" viewBox="0 0 1440 160" preserveAspectRatio="none" aria-hidden="true">
      <path fill={fill} d="M0 0h1440v70c-120 60-240 78-380 44S800 40 660 84 400 150 250 112 80 60 0 96z" />
    </svg>
  );
}

/** Scroll-scrubbed effects shared by the lower sections. */
export function startScrollFx() {
  if (calm()) return () => {};
  const ctx = gsap.context(() => {
    gsap.utils.toArray<SVGElement>(".wave").forEach((w) => {
      gsap.fromTo(w, { scaleY: 1 }, { scaleY: 0, transformOrigin: "50% 0%", ease: "none", scrollTrigger: { trigger: w, start: "top 95%", end: "top 15%", scrub: 0.6 } });
    });
    // depth numerals rise out of a mask
    gsap.utils.toArray<HTMLElement>(".gauge-num span").forEach((n) => {
      gsap.from(n, { yPercent: 108, duration: 1.2, ease: "power3.out", scrollTrigger: { trigger: n.closest(".layer"), start: "top 68%" } });
    });
    // bars grow with the scroll, one after another
    gsap.utils.toArray<HTMLElement>(".bars").forEach((bars) => {
      gsap.fromTo(bars.querySelectorAll(".bar-fill"), { scaleX: 0 }, { scaleX: 1, transformOrigin: "0 50%", ease: "none", stagger: 0.12, scrollTrigger: { trigger: bars, start: "top 88%", end: "top 38%", scrub: 1 } });
    });
    // ruled-out approaches are crossed out by a line drawn as you scroll
    gsap.utils.toArray<HTMLElement>(".ruled").forEach((r) => {
      gsap.fromTo(r.querySelectorAll(".strike line"), { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: "none", stagger: 0.25, scrollTrigger: { trigger: r, start: "top 82%", end: "top 40%", scrub: 0.8 } });
    });
    // the prompt box lands like a sticker
    gsap.utils.toArray<HTMLElement>(".take").forEach((t) => {
      gsap.from(t, { scale: 0.8, rotation: -5, autoAlpha: 0, duration: 0.8, ease: "back.out(2)", scrollTrigger: { trigger: t, start: "top 88%" } });
    });
    gsap.to(".progress", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });
    gsap.utils.toArray<HTMLElement>(".next").forEach((p) => {
      gsap.fromTo(p, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", ease: "none", scrollTrigger: { trigger: p, start: "top 92%", end: "top 55%", scrub: 0.5 } });
    });
    gsap.utils.toArray<HTMLElement>(".steps-line").forEach((l) => {
      gsap.fromTo(l, { scaleX: 0 }, { scaleX: 1, transformOrigin: "0 50%", ease: "none", scrollTrigger: { trigger: l, start: "top 85%", end: "top 45%", scrub: 0.6 } });
    });
    gsap.utils.toArray<HTMLElement>(".foot-word span").forEach((s, i) => {
      gsap.fromTo(s, { yPercent: 110 }, { yPercent: 0, ease: "power3.out", scrollTrigger: { trigger: ".foot-word", start: "top 98%", end: "top 60%", scrub: 0.6 + i * 0.12 } });
    });
  });
  return () => ctx.revert();
}
