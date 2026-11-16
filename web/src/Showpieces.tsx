import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { Topic } from "./types";
import { depthName, label, plural } from "./lib";
import { calm } from "./motion";

gsap.registerPlugin(ScrollTrigger);

/* ── five tiles that fly out of a tray and land inside the sentence that explains the product ── */
const MOVES = ["Ask", "Map", "Rule out", "Dig", "Keep"];

export function Flight({ topic }: { topic: Topic }) {
  const root = useRef<HTMLElement>(null);
  const n = topic.layers[0].stats.n;
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const blocks = gsap.utils.toArray<HTMLElement>(".fl-block", el);
    const from = gsap.utils.toArray<HTMLElement>(".fl-slot", el);
    const to = gsap.utils.toArray<HTMLElement>(".fl-hole", el);
    let landed = false;
    const target = (i: number) => {
      const a = from[i].getBoundingClientRect();
      const b = to[i].getBoundingClientRect();
      return { scale: b.width / a.width, x: b.left - a.left + (b.width - a.width) / 2, y: b.top - a.top + (b.height - a.height) / 2 };
    };
    const fly = (down: boolean) => {
      if (down === landed) return;
      landed = down;
      blocks.forEach((bl, i) => {
        const t = down ? target(i) : { scale: 1, x: 0, y: 0 };
        if (calm()) return void gsap.set(bl, t);
        const at = i * (down ? 0.1 : 0.05);
        gsap.to(bl, { ...t, duration: 1.4, ease: "power2.inOut", delay: at, overwrite: "auto" });
        gsap.to(bl, { keyframes: [{ rotation: gsap.utils.random(-15, 15), duration: 0.7, ease: "power2.in" }, { rotation: 0, duration: 0.7, ease: "power2.out" }], delay: at });
      });
    };
    const st = ScrollTrigger.create({
      trigger: el.querySelector(".fl-say"),
      start: "top 52%",
      end: "bottom top",
      onEnter: () => fly(true),
      onLeaveBack: () => fly(false),
    });
    const fix = () => landed && blocks.forEach((bl, i) => gsap.set(bl, target(i)));
    window.addEventListener("resize", fix);
    return () => {
      st.kill();
      window.removeEventListener("resize", fix);
    };
  }, [topic]);

  const tile = (i: number) => (
    <span className={`fl-tile fl-t${i}`}>
      {i === 0 && Array.from({ length: 9 }, (_, k) => <i key={k} />)}
      {i === 3 && Array.from({ length: 4 }, (_, k) => <i key={k} />)}
      {(i === 2 || i === 4) && <i />}
    </span>
  );
  const hole = (i: number) => <span className="fl-hole" key={i} />;

  return (
    <section className="flight tone-0" ref={root} id="how">
      <div className="wrap">
        <div className="fl-panel" aria-hidden="true">
          <span className="fl-head" />
          <div className="fl-ruler">
            {MOVES.map((m, i) => (
              <span key={m}>
                {i + 1}. {m}
              </span>
            ))}
          </div>
          <div className="fl-lane">
            {MOVES.map((m, i) => (
              <span className="fl-slot" key={m}>
                <span className="fl-block">{tile(i)}</span>
              </span>
            ))}
          </div>
        </div>
        <h2 className="fl-say">
          Offmap {hole(0)} asks three AI models the same question {n} times, {hole(1)} maps where they all agree, {hole(2)} rules that
          ground out, {hole(3)} digs a layer deeper and {hole(4)} keeps what no one else gets.
        </h2>
      </div>
    </section>
  );
}

/* ── the surviving ideas as thick cards turning on a cylinder; the front card leans toward the pointer ── */
export function IdeaCarousel({ topic }: { topic: Topic }) {
  const deepest = topic.layers[topic.layers.length - 1];
  const ideas = deepest.ideas.slice(0, 9);
  const count = ideas.length;
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 420, h: 264 });

  useEffect(() => {
    const fit = () => {
      const w = Math.min(460, Math.max(250, Math.round(window.innerWidth * 0.2 + 190)));
      setSize({ w, h: Math.round(w / 1.5) });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    if (count < 3) return;
    let progress = 0;
    let seen = false;
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const move = (e: MouseEvent) => {
      mouse.tx = Math.max(-1, Math.min(1, (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2)));
      mouse.ty = Math.max(-1, Math.min(1, (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2)));
    };
    const io = new IntersectionObserver(([e]) => (seen = e.isIntersecting));
    if (stage.current) io.observe(stage.current);
    const D = 1350;
    const gap = 30;
    const loop = () => {
      if (!seen) return;
      if (!calm()) progress += 0.0022;
      mouse.x += (mouse.tx - mouse.x) * 0.08;
      mouse.y += (mouse.ty - mouse.y) * 0.08;
      const h = stage.current?.clientHeight ?? window.innerHeight;
      const round = Math.round(progress);
      const diff = progress - round;
      const active = round + (Math.sign(diff) * Math.pow(Math.abs(diff) * 2, 4.2)) / 2; // dwell on each card, then move on
      for (let i = 0; i < count; i++) {
        const card = cards.current[i];
        if (!card) continue;
        let off = i - active;
        while (off > count / 2) off -= count;
        while (off < -count / 2) off += count;
        const a = Math.abs(off);
        const sign = Math.sign(off);
        if (a > 3) {
          card.style.visibility = "hidden";
          continue;
        }
        card.style.visibility = "visible";
        const ss = (t: number) => t * t * (3 - 2 * t);
        let y: number;
        let z: number;
        let rot: number;
        if (a <= 1) {
          const e = ss(a);
          y = e * (size.h + gap);
          z = 400 + e * (220 - 400);
          rot = e * 132;
        } else if (a <= 2) {
          const e = ss(a - 1);
          const yEnd = (h / 2 + 55) / (D / (D + 60)) - size.h / 2;
          y = size.h + gap + e * (yEnd - (size.h + gap));
          z = 220 + e * (-60 - 220);
          rot = 132 + e * (175 - 132);
        } else {
          const e = ss(Math.min(a - 2, 1));
          const y2 = (h / 2 + 55) / (D / (D + 60)) - size.h / 2;
          const y3 = (h / 2 + 100) / (D / (D + 250)) + size.h / 2;
          y = y2 + e * (y3 - y2);
          z = -60 + e * (-250 + 60);
          rot = 175 + e * 20;
        }
        const centre = Math.max(0, 1 - a);
        card.style.zIndex = String(Math.round(z) + 1000);
        card.style.transform = `translateY(${(-sign * y).toFixed(2)}px) translateZ(${z.toFixed(2)}px) rotateX(${(-sign * rot - mouse.y * 12 * centre).toFixed(2)}deg) rotateY(${(mouse.x * 15 * centre).toFixed(2)}deg) rotateZ(-3deg)`;
      }
    };
    gsap.ticker.add(loop);
    window.addEventListener("mousemove", move);
    return () => {
      gsap.ticker.remove(loop);
      window.removeEventListener("mousemove", move);
      io.disconnect();
    };
  }, [count, size]);

  if (count < 3) return null;
  return (
    <section className="carousel tone-4">
      <div className="carousel-copy">
        <h2>
          The {plural(deepest.kept, "idea")} left at the bottom.
        </h2>
        <p>
          Each one passed the check {depthName(deepest.depth).toLowerCase()}, with {deepest.ruledOut.length} approaches ruled out above it. Every card is a real
          answer, word for word.
        </p>
      </div>
      <div className="carousel-stage" ref={stage} aria-hidden="true">
        <div className="carousel-hub" style={{ width: size.w, height: size.h }}>
          {ideas.map((idea, i) => (
            <div key={i} className="icard" ref={(el) => void (cards.current[i] = el)}>
              {[-1.5, -0.75, 0, 0.75, 1.5].map((zo, k) =>
                k > 0 && k < 4 ? (
                  <div key={k} className="icard-mid" style={{ transform: `translateZ(${zo}px)` }} />
                ) : k === 4 ? (
                  <div key={k} className="icard-face icard-front" style={{ transform: `translateZ(${zo}px)` }}>
                    <span className="icard-no">{String(i + 1).padStart(2, "0")}</span>
                    {idea.n && <h3>{idea.n}</h3>}
                    <p className={idea.n ? undefined : "is-long"}>{idea.t}</p>
                    <span className="icard-foot">
                      <b>{label(idea.k[0])}</b>
                      {topic.models[idea.m]}
                    </span>
                  </div>
                ) : (
                  <div key={k} className="icard-face icard-back" style={{ transform: `translateZ(${zo}px) rotateX(180deg)` }}>
                    <span className="icard-stripe" />
                    <span className="icard-code">
                      OFFMAP / {depthName(deepest.depth).toUpperCase()} / {String(i + 1).padStart(2, "0")} OF {String(count).padStart(2, "0")}
                    </span>
                  </div>
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <ol className="carousel-list">
        {ideas.map((idea, i) => (
          <li key={i}>{idea.n ?? label(idea.k[0])}</li>
        ))}
      </ol>
    </section>
  );
}
