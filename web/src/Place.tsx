import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { calm } from "./motion";
import type { FormEvent } from "react";
import type { Topic } from "./types";
import { depthName, label, lower, plural } from "./lib";
import { Wave, Words } from "./Fx";

gsap.registerPlugin(ScrollTrigger);

/** Pinned scene: a knob travels down the depth scale and the name of each depth swaps in. */
function DepthSlider({ topic }: { topic: Topic }) {
  const root = useRef<HTMLDivElement>(null);
  const stops = [
    ...topic.layers.map((l) => ({
      tick: String(l.depth),
      name: depthName(l.depth),
      line: `${l.depth === 0 ? "Where every model lands first" : "Common only once everything above is ruled out"}: ${l.common.slice(0, 3).map(lower).join(", ")}.`,
    })),
    { tick: "off", name: "Off the map", line: `Approaches that never became common in ${topic.layers.reduce((n, l) => n + l.asked, 0)} answers.` },
  ];
  const last = stops.length - 1;

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const names = gsap.utils.toArray<HTMLElement>(".slider-stop", el);
      const ticks = gsap.utils.toArray<HTMLElement>(".slider-ticks span", el);
      gsap.set(names.slice(1), { autoAlpha: 0, y: 20 });
      gsap.set(ticks[0], { opacity: 1 });
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top top", end: "bottom bottom", scrub: 0.6 } });
      tl.to({}, { duration: 0.5 });
      for (let i = 1; i <= last; i++) {
        const at = `s${i}`;
        tl.addLabel(at)
          .to(".slider-knob", { left: `${(i / last) * 100}%`, rotation: i * 90, duration: 1, ease: "power1.inOut" }, at)
          .to(".slider-fill", { scaleX: i / last, duration: 1, ease: "power1.inOut" }, at)
          .to(names[i - 1], { y: -20, autoAlpha: 0, duration: 0.3 }, `${at}+=0.3`)
          .fromTo(names[i], { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.3 }, `${at}+=0.6`)
          .to(ticks[i - 1], { opacity: 0.45, duration: 0.2 }, `${at}+=0.5`)
          .to(ticks[i], { opacity: 1, duration: 0.2 }, `${at}+=0.5`)
          .to({}, { duration: 0.5 });
      }
    }, el);
    return () => ctx.revert();
  }, [topic, last]);

  return (
    <div className="slider" ref={root} style={{ height: `${stops.length * 75 + 100}vh` }}>
      <div className="slider-stage">
        <div className="wrap">
          <p className="slider-lead">Every idea sits at a depth.</p>
          <div className="slider-names">
            {stops.map((st) => (
              <div className="slider-stop" key={st.tick}>
                <p className="slider-name">{st.name}</p>
                <p className="slider-line">{st.line}</p>
              </div>
            ))}
          </div>
          <div className="slider-track" aria-hidden="true">
            <span className="slider-fill" />
            <span className="slider-knob" />
          </div>
          <div className="slider-ticks" aria-hidden="true">
            {stops.map((st) => (
              <span key={st.tick}>{st.tick}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type Result = { tags: string[]; depth: number | null; note: string };

/** Depth of an approach: the first layer where it was common enough to be ruled out. */
function depthOfTag(topic: Topic, tag: string): number | null {
  const layer = topic.layers.find((l) => l.common.includes(tag));
  return layer ? layer.depth : null;
}

function seen(topic: Topic, tag: string) {
  let uses = 0;
  let answers = 0;
  for (const l of topic.layers) {
    answers += l.stats.n;
    uses += l.stats.used.find(([t]) => t === tag)?.[1] ?? 0;
  }
  return { uses, answers };
}

function place(topic: Topic, tags: string[]): Result {
  const depths = tags.map((t) => depthOfTag(topic, t));
  const known = depths.filter((d): d is number => d !== null);
  const lead = tags[0];
  if (known.length) {
    const depth = Math.min(...known);
    const tag = tags[depths.indexOf(depth)];
    const layer = topic.layers[depth];
    const uses = layer.stats.used.find(([t]) => t === tag)?.[1] ?? 0;
    const note =
      depth === 0
        ? `${label(tag)} is ground the models reach first: ${uses} of ${layer.stats.n} plain answers use it.`
        : `${label(tag)} only became common after ${plural(layer.ruledOut.length, "more obvious approach", "more obvious approaches")} had been ruled out. ${uses} of ${layer.stats.n} kept answers at that depth use it.`;
    return { tags, depth, note };
  }
  const { uses, answers } = seen(topic, lead);
  const note =
    uses > 0
      ? `${label(lead)} turned up in ${uses} of ${answers} kept answers across every depth, never often enough to be common.`
      : `No model produced ${lower(lead)} in any of the ${answers} kept answers for this topic.`;
  return { tags, depth: null, note };
}

export function Place({ topic }: { topic: Topic }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [problem, setProblem] = useState("");
  const ready = text.trim().length >= 20;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setProblem("");
    setResult(null);
    try {
      const res = await fetch("./api/place", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea: text.trim() }),
      });
      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("json")) {
        setProblem("Tagging needs the live server, and this copy of the page is running without one.");
      } else {
        const data = await res.json();
        if (res.ok && Array.isArray(data.mechanism) && data.mechanism.length) {
          setResult(place(topic, data.mechanism));
        } else {
          setProblem(data.error ?? "The tagging model did not return a usable answer. Try again.");
        }
      }
    } catch {
      setProblem("Tagging needs the live server, and this copy of the page could not reach one.");
    } finally {
      setBusy(false);
    }
  };

  const deepest = topic.layers[topic.layers.length - 1].depth;

  return (
    <section className="place tone-4" id="place">
      <Wave fill="#0d1f3d" />
      {!calm() && <DepthSlider topic={topic} />}
      <div className="wrap place-grid">
        <div>
          <Words text="Where does your idea sit?" />
          <p className="lede">
            Describe a startup idea for {topic.topic}. One model call tags its approach, using the same list of{" "}
            {topic.vocabulary}, and the layers above say how far from the default it is.
          </p>
        </div>

        <form onSubmit={submit}>
          <label htmlFor="idea">Your idea, in a sentence or three</label>
          <textarea
            id="idea"
            rows={5}
            maxLength={1200}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`An idea for ${topic.topic}`}
          />
          <div className="place-actions">
            <button className={`go${busy ? " is-busy" : ""}`} data-magnetic type="submit" disabled={!ready || busy}>
              {busy ? "Tagging" : "Find its depth"}
            </button>
            {!ready && text.length > 0 && <span className="fine">A full sentence gives the tagger enough to go on.</span>}
          </div>

          <div className="verdict" aria-live="polite">
            {problem && <p className="notice">{problem}</p>}
            {result && (
              <>
                <p className="verdict-depth">
                  {(result.depth === null ? "Off the map" : depthName(result.depth)).split(" ").map((w, i) => (
                    <span className="vw" key={i} style={{ ["--i" as string]: i }}>
                      {w}{" "}
                    </span>
                  ))}
                </p>
                <div className="verdict-scale" aria-hidden="true" style={{ ["--at" as string]: (result.depth ?? deepest + 1) / (deepest + 2) }}>
                  <b className="diver" />
                  {Array.from({ length: deepest + 2 }, (_, d) => (
                    <span key={d} className={(result.depth ?? deepest + 1) === d ? "is-here" : undefined}>
                      {d > deepest ? "off" : d}
                    </span>
                  ))}
                </div>
                <p>
                  Tagged as {result.tags.map(lower).join(" with ")}. {result.note}
                </p>
                <p className="fine">Depth is distance from the default, not a score. One model made this call and can be wrong.</p>
              </>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
