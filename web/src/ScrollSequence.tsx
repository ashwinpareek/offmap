import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export type Draw = (progress: number, ctx: CanvasRenderingContext2D, w: number, h: number, time: number) => void;

type Props = {
  /** Height of the scroll track, in viewport heights. */
  length: number;
  /** Either a drawing function... */
  draw?: Draw;
  /** ...or a rendered frame sequence (frame_0001.webp ...), played by scroll. Swap in later without touching the page. */
  frames?: string[];
  onProgress?: (p: number) => void;
  className?: string;
  label: string;
  children?: ReactNode;
};

/** A pinned full-screen canvas whose picture is driven by scroll position. */
export function ScrollSequence({ length, draw, frames, onProgress, className, label, children }: Props) {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const el = root.current;
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!el || !cv || !ctx) return;
    let w = 0;
    let h = 0;
    let progress = 0;
    let visible = false;

    const images: HTMLImageElement[] = [];
    (frames ?? []).forEach((src, i) => {
      const load = () => {
        const im = new Image();
        im.decoding = "async";
        im.src = src;
        images[i] = im;
      };
      if (i < 10) load();
      else window.setTimeout(load, 300 + i * 12); // first frames now, the rest in the background
    });

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const paint = (time: number) => {
      if (!visible || !w) return;
      ctx.clearRect(0, 0, w, h);
      if (draw) draw(progress, ctx, w, h, time);
      else if (images.length) {
        let i = Math.round(progress * (images.length - 1));
        while (i > 0 && !(images[i] && images[i].complete && images[i].naturalWidth)) i--; // nearest loaded frame
        const im = images[i];
        if (im && im.naturalWidth) {
          const s = Math.max(w / im.naturalWidth, h / im.naturalHeight); // cover
          ctx.drawImage(im, (w - im.naturalWidth * s) / 2, (h - im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s);
        }
      }
    };

    size();
    const st = ScrollTrigger.create({
      trigger: el,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.6,
      onUpdate: (s) => {
        progress = s.progress;
        onProgress?.(progress);
      },
    });
    const near = ScrollTrigger.create({ trigger: el, start: "top bottom", end: "bottom top", onToggle: (s) => (visible = s.isActive) });
    visible = near.isActive;
    onProgress?.(0);
    gsap.ticker.add(paint);
    window.addEventListener("resize", size);
    return () => {
      st.kill();
      near.kill();
      gsap.ticker.remove(paint);
      window.removeEventListener("resize", size);
    };
  }, [draw, frames, onProgress]);

  return (
    <section ref={root} className={`seq ${className ?? ""}`} style={{ height: `${length * 100}vh` }} aria-label={label}>
      <div className="seq-stage">
        <canvas ref={canvas} className="seq-canvas" aria-hidden="true" />
        {children}
      </div>
    </section>
  );
}
