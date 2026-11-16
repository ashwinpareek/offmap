import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { calm, scrollToId } from "./motion";

const VIDEO = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_104303_0c6d60b2-9353-408e-9449-585108a22fb5.mp4";
const POSTER = "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/130837c4-0244-4f37-9c61-8d801d93fd29.jpg";

/** Strands of light from every corner, all bending to the same point: drawn live, so the hero never depends on a file loading. */
function Strands() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    let w = 0;
    let h = 0;
    let seen = true;
    let s = 9;
    const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    const strands = Array.from({ length: 132 }, (_, i) => {
      const corner = i % 4; // 0 upper-left, 1 upper-right, 2 lower-left, 3 lower-right
      const along = rand();
      const edge = rand() < 0.6;
      return { corner, sx: edge ? along * 0.5 : 0, sy: edge ? 0 : along * 0.55, bend: 0.25 + rand() * 0.5, lift: (rand() - 0.5) * 0.5, speed: 0.15 + rand() * 0.35, phase: rand() * 6.3, alpha: 0.05 + rand() * 0.2, width: 0.6 + rand() * 1.5 };
    });
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
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#02060f";
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.47;
      const fog = ctx.createLinearGradient(0, h * 0.5, 0, h);
      fog.addColorStop(0, "rgba(10,26,58,0)");
      fog.addColorStop(1, "rgba(14,38,88,0.55)");
      ctx.fillStyle = fog;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const st of strands) {
        const right = st.corner % 2 === 1;
        const low = st.corner > 1;
        const x0 = right ? w - st.sx * w : st.sx * w;
        const y0 = low ? h - st.sy * h : st.sy * h;
        const wob = Math.sin(time * st.speed + st.phase);
        const mx = mix(x0, cx, st.bend) + wob * w * 0.03;
        const my = mix(y0, cy, st.bend) + (low ? 1 : -1) * st.lift * h * 0.35 + Math.cos(time * st.speed * 0.8 + st.phase) * h * 0.025;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(mx, my, cx, cy);
        const g = ctx.createLinearGradient(x0, y0, cx, cy);
        const c = low ? "110,160,255" : "255,208,140";
        g.addColorStop(0, `rgba(${c},0)`);
        g.addColorStop(0.55, `rgba(${c},${st.alpha * (0.7 + wob * 0.3)})`);
        g.addColorStop(1, `rgba(255,244,226,${st.alpha * 1.6})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = st.width;
        ctx.stroke();
      }
      const pulse = 1 + Math.sin(time * 0.6) * 0.08;
      const flare = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.34 * pulse);
      flare.addColorStop(0, "rgba(255,250,240,0.95)");
      flare.addColorStop(0.07, "rgba(255,226,178,0.5)");
      flare.addColorStop(0.3, "rgba(120,160,240,0.12)");
      flare.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = flare;
      ctx.fillRect(0, 0, w, h);
    };
    const mix = (a: number, b: number, t: number) => a + (b - a) * t;
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
  }, []);
  return <canvas ref={ref} className="cine-strands" aria-hidden="true" />;
}

const Chev = () => (
  <svg className="chev" viewBox="0 0 11 20" aria-hidden="true">
    <path d="M1.15 1.15 L9.6 10 L1.15 18.85" />
  </svg>
);

export function Cine({ answers, models, kept }: { answers: number; models: number; kept: number }) {
  const [playing, setPlaying] = useState(false);
  return (
    <section className="cine" id="top-hero">
      <Strands />
      {!calm() && (
        <video className={`cine-video${playing ? " is-on" : ""}`} autoPlay muted loop playsInline preload="auto" aria-hidden="true" poster={POSTER} src={VIDEO} onPlaying={() => setPlaying(true)} onError={() => setPlaying(false)} />
      )}
      <div className="cine-veil" />
      <div className="cine-body">
        <h1 className="cine-title">
          <span>Every AI gives everyone the same idea.</span>
          <span>Offmap finds the ones it doesn’t.</span>
        </h1>
        <p className="cine-sub">
          <span>We ask three AI models the same question again and again,</span>
          <span>rule out what they all say, and keep what is left.</span>
        </p>
        <a
          className="cta"
          href="#how"
          data-magnetic
          onClick={(e) => {
            e.preventDefault();
            scrollToId("how");
          }}
        >
          <span>Watch it happen</span>
          <svg className="arrow" viewBox="0 0 16 11" aria-hidden="true">
            <path d="M0 5.5 H14.6 M10.3 1.2 L14.9 5.5 L10.3 9.8" />
          </svg>
        </a>
        <ul className="feats">
          <li>
            <Chev />
            <span>{answers} real answers</span>
          </li>
          <li>
            <Chev />
            <span>{models} AI models</span>
          </li>
          <li>
            <Chev />
            <span>Every idea checked</span>
          </li>
          <li>
            <Chev />
            <span>{kept} ideas off the map</span>
          </li>
        </ul>
        <span className="rule" aria-hidden="true" />
      </div>
      <p className="cine-foot">Scroll. Every number on this page was measured, not written.</p>
    </section>
  );
}
