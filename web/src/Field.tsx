import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Layer } from "./types";
import { label, lower } from "./lib";

function useColumns(): number {
  const pick = () => (window.matchMedia("(min-width: 1000px)").matches ? 30 : window.matchMedia("(min-width: 560px)").matches ? 15 : 10);
  const [cols, setCols] = useState(pick);
  useEffect(() => {
    const on = () => setCols(pick());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return cols;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Every default answer as one square. First in the order they were asked, then
 * grouped by approach: the same squares, so the pile-up is something you watch happen.
 */
export function Field({ layer, models, wait = 1100 }: { layer: Layer; models: string[]; wait?: number }) {
  const cols = useColumns();
  const ideas = layer.ideas;
  const rank = useMemo(() => new Map(layer.stats.primary.map(([tag], i) => [tag, i])), [layer]);

  // position of each answer once grouped: most common approach first
  const groupedSlot = useMemo(() => {
    const order = ideas
      .map((idea, i) => ({ i, r: rank.get(idea.k[0]) ?? 99, m: idea.m }))
      .sort((a, b) => a.r - b.r || a.m - b.m || a.i - b.i);
    const slot = new Array<number>(ideas.length);
    order.forEach((o, pos) => (slot[o.i] = pos));
    return slot;
  }, [ideas, rank]);

  // "as asked": the three models take turns, the way the requests went out
  const askedSlot = useMemo(() => {
    const turn = new Map<number, number>();
    const order = ideas
      .map((idea, i) => {
        const k = turn.get(idea.m) ?? 0;
        turn.set(idea.m, k + 1);
        return { i, k, m: idea.m };
      })
      .sort((a, b) => a.k - b.k || a.m - b.m);
    const slot = new Array<number>(ideas.length);
    order.forEach((o, pos) => (slot[o.i] = pos));
    return slot;
  }, [ideas]);

  const [grouped, setGrouped] = useState(reducedMotion);
  const [picked, setPicked] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (grouped) return;
    const t = window.setTimeout(() => setGrouped(true), wait);
    return () => window.clearTimeout(t);
    // only on first paint: after that the reader is in control
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slotOf = grouped ? groupedSlot : askedSlot;
  const rows = Math.ceil(ideas.length / cols);
  const shown = hovered ?? picked;
  const idea = shown === null ? null : ideas[shown];

  const top = layer.stats.primary.slice(0, 3);
  const rest = layer.stats.primary.slice(3);
  const restCount = rest.reduce((n, [, c]) => n + c, 0);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (!step) return;
    e.preventDefault();
    const bySlot = new Array<number>(ideas.length);
    slotOf.forEach((s, i) => (bySlot[s] = i));
    const from = picked === null ? -step : slotOf[picked];
    const to = Math.min(ideas.length - 1, Math.max(0, from + step));
    setPicked(bySlot[to]);
    setHovered(null);
  };

  return (
    <div className="field">
      <div
        ref={box}
        className={`cells${grouped ? " is-grouped" : ""}`}
        style={{ aspectRatio: `${cols} / ${rows}`, ["--cols" as string]: cols }}
        tabIndex={0}
        role="group"
        aria-label={`${ideas.length} answers, one square each. Use the arrow keys to read them.`}
        onKeyDown={onKey}
        onMouseLeave={() => setHovered(null)}
      >
        {ideas.map((it, i) => {
          const s = slotOf[i];
          const r = rank.get(it.k[0]) ?? 99;
          return (
            <span
              key={i}
              className={`cell r${Math.min(r, 3)}${shown === i ? " is-on" : ""}`}
              style={{
                transform: `translate(${(s % cols) * 100}%, ${Math.floor(s / cols) * 100}%)`,
                transitionDelay: grouped ? `${groupedSlot[i] * 4}ms` : "0ms",
              }}
              onMouseEnter={() => setHovered(i)}
              onClick={() => {
                setPicked(i);
                setHovered(null);
              }}
            />
          );
        })}
      </div>

      <div className="field-under">
        <div className="legend">
          <ul>
            {top.map(([tag, count], i) => (
              <li key={tag}>
                <span className={`swatch r${i}`} />
                <span className="legend-name">{label(tag)}</span>
                <span className="legend-count">{count}</span>
              </li>
            ))}
            {restCount > 0 && (
              <li>
                <span className="swatch r3" />
                <span className="legend-name">
                  {rest.length} other {rest.length === 1 ? "approach" : "approaches"}
                </span>
                <span className="legend-count">{restCount}</span>
              </li>
            )}
          </ul>
          <button className="text-button" onClick={() => setGrouped((g) => !g)}>
            {grouped ? "Show in the order asked" : "Group by approach"}
          </button>
        </div>

        <div className="readout" aria-live="polite">
          {idea ? (
            <>
              <p className="readout-from">
                {models[idea.m]}, leading with {lower(idea.k[0])}
              </p>
              <p className="readout-text">{idea.t}</p>
            </>
          ) : (
            <>
              <p className="readout-from">Each square is one answer. Pick one to read it.</p>
              {layer.stats.topName && (
                <p className="readout-text">
                  The name “{layer.stats.topName.name}” alone came back {layer.stats.topName.count} times
                  {layer.stats.topName.variants ? ", with or without a hyphen" : ""}.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
