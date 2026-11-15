import { useMemo, useState } from "react";
import type { Idea, Layer, Topic } from "./types";
import { depthName, label, list, lower, plural } from "./lib";
import { scrollToId } from "./motion";

const HEADINGS = [
  "What everyone gets",
  "Rule out the surface, then ask again",
  "Rule out that ground too",
  "And once more",
];

/** Take answers from the models in turn, so a short list is not all one model. */
function interleave(ideas: Idea[]): Idea[] {
  const byModel = new Map<number, Idea[]>();
  ideas.forEach((i) => byModel.set(i.m, [...(byModel.get(i.m) ?? []), i]));
  const queues = [...byModel.entries()].sort((a, b) => a[0] - b[0]).map(([, q]) => q);
  const out: Idea[] = [];
  for (let k = 0; out.length < ideas.length; k++) queues.forEach((q) => q[k] && out.push(q[k]));
  return out;
}

function Gauge({ depth, deepest }: { depth: number; deepest: number }) {
  const jump = (d: number) => scrollToId(`depth-${d}`);
  return (
    <aside className="gauge">
      <div className="gauge-stick">
        <p className="gauge-num" aria-hidden="true">
          {depth}
        </p>
        <p className="gauge-name">{depthName(depth)}</p>
        <nav className="gauge-ticks" aria-label="Depth">
          {Array.from({ length: deepest + 1 }, (_, d) => (
            <button
              key={d}
              className={d === depth ? "is-here" : undefined}
              aria-current={d === depth ? "true" : undefined}
              aria-label={depthName(d)}
              title={depthName(d)}
              onClick={() => jump(d)}
            >
              <span>{d}</span>
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}

function Marks({ layer }: { layer: Layer }) {
  return (
    <div className="marks" data-reveal>
      <div className="marks-row" aria-hidden="true">
        {Array.from({ length: layer.kept }, (_, i) => (
          <span key={`k${i}`} className="mk mk-kept" style={{ ["--i" as string]: i }} />
        ))}
        {Array.from({ length: layer.dropped }, (_, i) => (
          <span key={`d${i}`} className="mk mk-dropped" style={{ ["--i" as string]: layer.kept + i }} />
        ))}
        {Array.from({ length: layer.untagged }, (_, i) => (
          <span key={`u${i}`} className="mk mk-untagged" style={{ ["--i" as string]: layer.kept + layer.dropped + i }} />
        ))}
      </div>
      <p className="marks-key">
        <span>
          <i className="mk mk-kept" /> {layer.kept} kept
        </span>
        <span>
          <i className="mk mk-dropped" /> {layer.dropped} dropped for using a ruled-out approach
        </span>
        {layer.untagged > 0 && (
          <span>
            <i className="mk mk-untagged" /> {layer.untagged} could not be tagged
          </span>
        )}
      </p>
    </div>
  );
}

function Composition({ layer, hasNext }: { layer: Layer; hasNext: boolean }) {
  const { used, n, banShare } = layer.stats;
  const shown = used.slice(0, 8);
  const hidden = used.slice(8);
  const max = shown[0]?.[1] ?? 1;
  const cut = (banShare * n) / max;
  const common = new Set(layer.common);
  return (
    <div className="comp" data-reveal>
      <h3>{layer.depth === 0 ? "What the answers use" : "What the kept answers use"}</h3>
      <div className="bars" style={{ ["--cut-n" as string]: Math.min(cut, 1) }}>
        {hasNext && cut <= 1 && <span className="bars-cut" aria-hidden="true" />}
        {shown.map(([tag, count], i) => (
          <div key={tag} style={{ ["--i" as string]: i }} className={`bar${hasNext && common.has(tag) ? " is-common" : ""}`}>
            <span className="bar-name">{label(tag)}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${(count / max) * 100}%` }} />
            </span>
            <span className="bar-count">{count}</span>
          </div>
        ))}
      </div>
      <p className="fine">
        Answers using each approach, out of {n}. An answer can use two.
        {hidden.length > 0 && ` ${plural(hidden.length, "more approach", "more approaches")} appeared ${hidden[0][1] === 1 ? "once" : `${hidden[0][1]} times or fewer`}.`}
        {hasNext && cut <= 1 && ` The line marks ${Math.round(banShare * 100)}%: anything past it is ruled out for the next layer.`}
      </p>
    </div>
  );
}

function IdeaRows({ ideas, models, dropped }: { ideas: Idea[]; models: string[]; dropped?: boolean }) {
  return (
    <ul className={`ideas${dropped ? " ideas-dropped" : ""}`}>
      {ideas.map((idea, i) => (
        <li key={i}>
          {idea.n && <h4>{idea.n}</h4>}
          <p>{idea.t}</p>
          <p className="idea-meta">
            <span>
              {dropped && idea.hit
                ? `Used ${list(idea.hit.map(lower))}, which ${idea.hit.length === 1 ? "was" : "were"} ruled out`
                : idea.k.length > 1
                  ? `${label(idea.k[0])} with ${lower(idea.k[1])}`
                  : label(idea.k[0])}
            </span>
            <span>{models[idea.m]}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

export function LayerSection({ topic, layer, deepest }: { topic: Topic; layer: Layer; deepest: number }) {
  const { depth } = layer;
  const hasNext = depth < deepest;
  const ordered = useMemo(() => interleave(layer.ideas), [layer]);
  const [count, setCount] = useState(3);
  const [showDropped, setShowDropped] = useState(false);
  const [copied, setCopied] = useState(false);
  const ruleOutPrompt = `Give me one startup idea for ${topic.topic}. Describe it in two or three sentences. Do not use any of these overused approaches: ${[...layer.ruledOut, ...layer.common].map((t) => t.replace(/_/g, " ")).join("; ")}.`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ruleOutPrompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };
  const surface = topic.layers[0];

  // which earlier layer each ruled-out approach came from
  const ruledGroups = topic.layers
    .filter((l) => l.depth < depth)
    .map((l) => ({ from: l.depth, tags: l.common }));

  return (
    <section className={`layer tone-${Math.min(depth, 3)}`} id={`depth-${depth}`}>
      <div className="wrap layer-grid">
        <Gauge depth={depth} deepest={deepest} />

        <div className="layer-body">
          <h2 data-reveal className="rise">{HEADINGS[depth] ?? "Deeper again"}</h2>

          {depth === 0 ? (
            <p className="lede">
              Only {surface.stats.distinct} of {topic.vocabulary} approaches show up at all, and {topic.neverUsedAtSurface}{" "}
              never appear once.
              {topic.topRevenue.tag &&
                ` ${topic.topRevenue.count} of ${surface.stats.n} answers make money the same way: ${topic.topRevenue.tag}.`}
            </p>
          ) : (
            <>
              <p className="lede">
                Same prompt, with {plural(layer.ruledOut.length, "approach", "approaches")} ruled out. {layer.asked} answers
                came back and each one was tagged again before being kept.
              </p>
              <div className="ruled" data-reveal>
                <h3>Ruled out before asking</h3>
                {ruledGroups.map((g) => (
                  <p key={g.from}>
                    <span className="ruled-from">{g.from === 0 ? "From the surface" : `From layer ${g.from}`}</span>
                    <span className="ruled-tags">
                      {g.tags.map((t, i) => (
                        <span className="struck" key={t} style={{ ["--i" as string]: i }}>
                          {label(t)}
                        </span>
                      ))}
                    </span>
                  </p>
                ))}
              </div>
              <Marks layer={layer} />
            </>
          )}

          <div className="layer-cols">
            <Composition layer={layer} hasNext={hasNext} />

            <div className="found">
              <h3>{depth === 0 ? "A few of the answers" : "Answers kept at this depth"}</h3>
              <IdeaRows ideas={ordered.slice(0, count)} models={topic.models} />
              <div className="found-more">
                {count < ordered.length && (
                  <button className="text-button" onClick={() => setCount((c) => Math.min(c + 9, ordered.length))}>
                    Show {Math.min(9, ordered.length - count)} more of {ordered.length}
                  </button>
                )}
                {count > 3 && (
                  <button className="text-button" onClick={() => setCount(3)}>
                    Show fewer
                  </button>
                )}
                {layer.droppedIdeas.length > 0 && (
                  <button className="text-button" aria-expanded={showDropped} onClick={() => setShowDropped((v) => !v)}>
                    {showDropped ? "Hide" : "Read"} the {plural(layer.droppedIdeas.length, "dropped answer")}
                  </button>
                )}
              </div>
              {showDropped && <IdeaRows ideas={layer.droppedIdeas} models={topic.models} dropped />}
            </div>
          </div>

          <div className="take">
            <div>
              <h3>Take this depth with you</h3>
              <p className="take-prompt">{ruleOutPrompt}</p>
            </div>
            <button className="copy" data-magnetic onClick={copy}>
              {copied ? "Copied" : "Copy this prompt"}
            </button>
          </div>

          {hasNext ? (
            <p className="next">
              {depth === 0 ? "This is the ground to leave." : "The models regrouped."} Common here, so ruled out for the
              next layer: {list(layer.common.map(lower))}.
            </p>
          ) : (
            <p className="next">
              We stop here. Only {layer.kept} of {layer.asked} answers got past the check at this depth, too few to say
              what is common. Past this point the models mostly ignore the list and drift back to ruled-out ground.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
