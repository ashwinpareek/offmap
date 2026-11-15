import { useEffect, useMemo, useState } from "react";
import indexJson from "./data/index.json";
import compareJson from "./data/compare.json";
import type { Layer, Topic, TopicIndex } from "./types";
import { Field } from "./Field";
import { LayerSection } from "./LayerSection";
import { Place } from "./Place";
import { list } from "./lib";
import { Descent } from "./Descent";
import { calm, scrollToId, startSmoothScroll, watchReveals } from "./motion";

const topics = indexJson as TopicIndex;
const loaders = import.meta.glob<{ default: Topic }>("./data/topics/*.json");

const REPO = "https://github.com/ashwinpareek/offmap";

function initialSlug(): string {
  try {
    const wanted = new URLSearchParams(window.location.search).get("topic");
    if (wanted && topics.some((t) => t.slug === wanted)) return wanted;
  } catch {
    /* some embeds hide the address; the first topic is fine */
  }
  return topics[0].slug;
}

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="3" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect className="mark-dot" x="22" y="22" width="8.5" height="8.5" />
    </svg>
  );
}

export default function App() {
  const [slug, setSlug] = useState(initialSlug);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    const load = loaders[`./data/topics/${slug}.json`];
    if (!load) {
      setFailed(true);
      return;
    }
    load()
      .then((m) => live && setTopic(m.default))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [slug]);

  const choose = (next: string) => {
    setSlug(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("topic", next);
      window.history.replaceState(null, "", url);
    } catch {
      /* address bar not available here */
    }
  };

  const [intro, setIntro] = useState(() => !calm());
  useEffect(() => {
    startSmoothScroll();
    if (!intro) return;
    const t = window.setTimeout(() => setIntro(false), 2300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => (topic ? watchReveals() : undefined), [topic]);

  const go = (id: string) => (e: { preventDefault: () => void }) => {
    e.preventDefault();
    scrollToId(id);
  };

  const surface: Layer | undefined = topic?.layers[0];
  const deepest = topic ? topic.layers[topic.layers.length - 1].depth : 0;
  const totalAsked = useMemo(() => topic?.layers.reduce((n, l) => n + l.asked, 0) ?? 0, [topic]);

  return (
    <>
      {intro && (
        <div className="intro" aria-hidden="true">
          <div className="intro-lockup">
            <svg viewBox="0 0 32 32">
              <rect className="intro-box" x="3" y="3" width="19" height="19" pathLength="1" />
              <rect className="intro-dot" x="22" y="22" width="8.5" height="8.5" />
            </svg>
            <span>Offmap</span>
          </div>
        </div>
      )}
      <header className="top tone-0" id="top">
        <div className="wrap top-row">
          <a className="brand" href="#top" aria-label="Offmap, back to top">
            <Mark />
            <span>Offmap</span>
          </a>
          <nav className="top-nav" aria-label="Page">
            <a href="#depth-0" onClick={go("depth-0")}>Layers</a>
            <a href="#place" onClick={go("place")}>Your idea</a>
            <a href="#method" onClick={go("method")}>Method</a>
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero tone-0">
          <div className="wrap">
            <h1 className="lines">
              {["Every AI gives everyone", "the same idea.", "Offmap digs past it."].map((line, i) => (
                <span key={line} className="line" style={{ ["--i" as string]: i }}>
                  <span>{line}</span>
                </span>
              ))}
            </h1>
            <div className="hero-sub">
              <p>
                Pick a topic. Offmap asks three AI models the same question again and again, finds the answers they
                all fall back on, rules those out and asks again. You get the ideas that sit past the obvious ones,
                each one checked.
              </p>
              <ul className="uses">
                <li>See the answer everyone else is getting</li>
                <li>Take ideas from one, two or three layers down</li>
                <li>Copy the prompt that gets you there in any AI</li>
                <li>Check how common your own idea is</li>
              </ul>
            </div>

            {topics.length > 1 && (
              <div className="topics" role="radiogroup" aria-label="Topic">
                {topics.map((t) => (
                  <button
                    key={t.slug}
                    role="radio"
                    aria-checked={t.slug === slug}
                    className="topic"
                    onClick={() => choose(t.slug)}
                  >
                    {t.topic}
                  </button>
                ))}
              </div>
            )}

            {failed && <p className="notice">This topic's results did not load. Reload the page to try again.</p>}

            {topic && surface && (
              <>
                <div className="proof">
                  <p className="asked">
                    We sent this to {topic.models.length} models, {surface.asked / topic.models.length} times each:
                  </p>
                  <p className="prompt">“Give me one startup idea for {topic.topic}.”</p>
                  <p className="proof-line">
                    {surface.stats.n} answers came back. {surface.stats.top3} of them are built on the same three
                    approaches.
                  </p>
                </div>
                <Field key={topic.slug} layer={surface} models={topic.models} wait={intro ? 3200 : 900} />
              </>
            )}
          </div>
        </section>

        {topic && (
          <>
            {!calm() && <Descent key={`descent-${topic.slug}`} topic={topic} />}

            {topic.layers.map((layer) => (
              <LayerSection key={`${topic.slug}-${layer.depth}`} topic={topic} layer={layer} deepest={deepest} />
            ))}

            <Place key={`place-${topic.slug}`} topic={topic} />

            <section className="method tone-0" id="method">
              <div className="wrap">
                <h2>How this was measured</h2>
                <ol className="steps">
                  <li>
                    <h3>Ask</h3>
                    <p>
                      The plain prompt goes to {list(topic.models)}, {surface!.asked / topic.models.length} times each,
                      at their default settings.
                    </p>
                  </li>
                  <li>
                    <h3>Tag</h3>
                    <p>
                      A separate model call labels every answer with one or two approaches from a fixed list of{" "}
                      {topic.vocabulary}. Answers are compared by what they do, not by how they are worded.
                    </p>
                  </li>
                  <li>
                    <h3>Count</h3>
                    <p>
                      Plain code, no model. An approach used by {Math.round(surface!.stats.banShare * 100)}% or more of
                      the answers is ruled out ({Math.round((topic.layers[1]?.stats.banShare ?? 0.1) * 100)}% in deeper
                      layers).
                    </p>
                  </li>
                  <li>
                    <h3>Ask again, then check</h3>
                    <p>
                      The models are told what is ruled out. Every new answer is tagged again, and any that used a
                      ruled-out approach is dropped instead of shown.
                    </p>
                  </li>
                </ol>

                <div className="method-grid">
                  <div>
                    <h3>Against the published baseline</h3>
                    <table className="compare">
                      <thead>
                        <tr>
                          <th scope="col">Prompting method</th>
                          <th scope="col">Distinct approaches</th>
                          <th scope="col">Answers on surface ground</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compareJson.rows.map((r) => (
                          <tr key={r.id} className={r.id === "avoid_list" ? "ours" : undefined}>
                            <th scope="row">
                              {r.id === "default" && "Plain prompt"}
                              {r.id === "diverse" && (
                                <a
                                  href="https://github.com/CHATS-lab/verbalized-sampling"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Verbalized Sampling
                                </a>
                              )}
                              {r.id === "avoid_list" && "Rule-out list from the count"}
                            </th>
                            <td>{r.distinct}</td>
                            <td>
                              {r.overused} of {r.n}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="fine">
                      Topic: {compareJson.topic}. One model ({compareJson.model}), ten answers per method, one run. A
                      small test, shown as measured.
                    </p>
                  </div>
                  <div>
                    <h3>What this does not show</h3>
                    <ul className="limits">
                      <li>Deeper is not better. Depth says how far an answer is from the default, not whether it is good.</li>
                      <li>Each topic was run once. The counts will move on a rerun.</li>
                      <li>The tagger is a model and can mislabel. Answers it could not tag are counted, not hidden.</li>
                      <li>The list of {topic.vocabulary} approaches is ours. Another list would draw the layers differently.</li>
                      <li>
                        “Never appeared” means never in these {totalAsked} answers. It does not mean a model cannot
                        produce it.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="foot tone-0">
        <div className="wrap foot-row">
          <p>Offmap, built by Ashwin Pareek for SLAY HACKS 2026.</p>
          <p>
            Code, prompts and every raw answer are in the{" "}
            <a href={REPO} target="_blank" rel="noreferrer">
              public repository
            </a>
            .
          </p>
        </div>
      </footer>
    </>
  );
}
