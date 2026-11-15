import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { Topic } from "./types";
import { depthName, plural } from "./lib";

gsap.registerPlugin(ScrollTrigger);

const TONES = ["#f1f4f2", "#d2e3e2", "#8fbbc3", "#0f3d52"];
const INK = "#0a2230";
const FOAM = "#eaf3f2";

/**
 * The whole method as one pinned scene, driven by scroll: every answer is a square,
 * each layer settles into a band at the top, and the answers that broke the rules fall out.
 */
export function Descent({ topic }: { topic: Topic }) {
  const root = useRef<HTMLElement>(null);
  const layers = topic.layers;

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const stage = el.querySelector<HTMLElement>(".descent-stage")!;
      const groups = gsap.utils.toArray<HTMLElement>(".dg", el);
      const caps = gsap.utils.toArray<HTMLElement>(".descent-cap", el);
      const nums = gsap.utils.toArray<HTMLElement>(".descent-num span", el);
      const bands = gsap.utils.toArray<HTMLElement>(".descent-band", el);

      gsap.set(groups.slice(1), { autoAlpha: 0 });
      gsap.set(caps.slice(1), { autoAlpha: 0, y: 24 });
      gsap.set(nums.slice(1), { yPercent: 125 });
      gsap.set(bands, { autoAlpha: 0, x: -12 });

      const tl = gsap.timeline({
        defaults: { ease: "power2.inOut" },
        scrollTrigger: { trigger: el, start: "top top", end: "bottom bottom", scrub: 0.6 },
      });

      tl.to({}, { duration: 1.4 }); // hold on the surface before anything moves

      layers.forEach((_layer, i) => {
        if (i === 0) return;
        const prev = groups[i - 1];
        const cur = groups[i];
        const at = `l${i}`;
        tl.addLabel(at);
        // the layer above settles into its band
        tl.to(prev.querySelectorAll(".dq:not(.is-out)"), { scale: 0, duration: 0.7, stagger: { amount: 0.5, from: "random" } }, at);
        tl.to(prev, { autoAlpha: 0, duration: 0.3 }, `${at}+=0.9`);
        tl.to(bands[i - 1], { autoAlpha: 1, x: 0, duration: 0.5 }, `${at}+=0.5`);
        tl.to(stage, { backgroundColor: TONES[Math.min(i, 3)], color: i >= 3 ? FOAM : INK, duration: 1 }, at);
        tl.to(caps[i - 1], { autoAlpha: 0, y: -24, duration: 0.4 }, at);
        tl.to(nums[i - 1], { yPercent: -125, duration: 0.6 }, at);
        tl.to(nums[i], { yPercent: 0, duration: 0.6 }, at);
        // the new answers arrive
        tl.set(cur, { autoAlpha: 1 }, `${at}+=0.9`);
        tl.from(cur.querySelectorAll(".dq"), { y: 60, autoAlpha: 0, duration: 0.6, stagger: { amount: 0.6 } }, `${at}+=0.9`);
        tl.to(caps[i], { autoAlpha: 1, y: 0, duration: 0.5 }, `${at}+=1`);
        // the check: rule-breakers are struck and fall out
        const out = cur.querySelectorAll(".dq.is-out");
        if (out.length) {
          tl.to(out, { "--strike": 1, duration: 0.3, stagger: 0.02 }, `${at}+=1.9`);
          tl.to(out, { y: () => window.innerHeight * 0.5, rotation: () => gsap.utils.random(-50, 50), autoAlpha: 0, duration: 0.9, ease: "power2.in", stagger: { amount: 0.4 } }, `${at}+=2.3`);
        }
        tl.to({}, { duration: 0.7 });
      });

      // the survivors
      const last = groups[groups.length - 1];
      tl.addLabel("end");
      tl.to(last.querySelectorAll(".dq:not(.is-out)"), { backgroundColor: "#ff9ccd", duration: 0.6, stagger: 0.05 }, "end");
      tl.to(caps[layers.length - 1], { autoAlpha: 0, y: -24, duration: 0.4 }, "end");
      tl.to(caps[layers.length], { autoAlpha: 1, y: 0, duration: 0.5 }, "end+=0.3");
      tl.to({}, { duration: 0.6 });
    }, el);
    return () => ctx.revert();
  }, [layers]);

  const deepest = layers[layers.length - 1];
  const ruledTotal = deepest.ruledOut.length;

  return (
    <section className="descent" ref={root} style={{ height: `${(layers.length + 1) * 130}vh` }} aria-label="How Offmap works, step by step">
      <div className="descent-stage">
        <div className="wrap descent-grid">
          <div className="descent-side">
            <p className="descent-num" aria-hidden="true">
              {layers.map((l) => (
                <span key={l.depth}>{l.depth}</span>
              ))}
            </p>
            <ol className="descent-bands">
              {layers.slice(0, -1).map((l) => (
                <li key={l.depth} className="descent-band">
                  <i />
                  {depthName(l.depth)}: {plural(l.common.length, "approach", "approaches")} ruled out
                </li>
              ))}
            </ol>
          </div>

          <div className="descent-main">
            <div className="descent-caps">
              <div className="descent-cap">
                <h2>Ask the plain question and this is what everyone gets.</h2>
                <p>{layers[0].stats.n} answers. {layers[0].stats.top3} of them lean on the same three approaches. Keep scrolling.</p>
              </div>
              {layers.slice(1).map((l) => (
                <div className="descent-cap" key={l.depth}>
                  <h2>
                    {l.depth === 1 ? "Rule that ground out and ask again." : l.depth === 2 ? "The models regroup. Rule that out too." : "And once more."}
                  </h2>
                  <p>
                    {l.asked} new answers with {plural(l.ruledOut.length, "approach", "approaches")} off limits. Each one is checked:{" "}
                    {l.kept} kept, {l.dropped} broke the rules and fall out.
                  </p>
                </div>
              ))}
              <div className="descent-cap">
                <h2>
                  {deepest.kept} ideas that sit {ruledTotal} approaches away from what everyone else gets.
                </h2>
                <p>That is Offmap: a way to get past the answer AI hands to everybody. The layers are below, with every idea.</p>
              </div>
            </div>

            <div className="descent-field">
              {layers.map((l) => (
                <div key={l.depth} className={`dg dg-${l.depth === 0 ? "wide" : "tight"}`}>
                  {Array.from({ length: l.kept }, (_, i) => (
                    <span key={`k${i}`} className="dq" />
                  ))}
                  {Array.from({ length: l.dropped + l.untagged }, (_, i) => (
                    <span key={`d${i}`} className="dq is-out" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
