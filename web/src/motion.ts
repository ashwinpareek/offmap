import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let lenis: Lenis | null = null;

/** Smooth, weighted scrolling, kept in step with the scroll-driven scenes. */
export function startSmoothScroll() {
  if (calm() || lenis) return;
  lenis = new Lenis({ duration: 1.15, smoothWheel: true });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis?.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { duration: 1.4 });
  else el.scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "start" });
}

/** Adds .in to [data-reveal] blocks the first time they come into view. CSS does the rest. */
export function watchReveals(root: ParentNode = document) {
  const items = root.querySelectorAll<HTMLElement>("[data-reveal]:not(.in)");
  if (calm() || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("in"));
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }),
    { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
  );
  items.forEach((el) => io.observe(el));
  return () => io.disconnect();
}
