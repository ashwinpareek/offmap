export type Idea = {
  /** index into Topic.models */
  m: number;
  /** the answer as the model wrote it */
  t: string;
  /** approach tags, most central first */
  k: string[];
  /** product name, when the model gave one */
  n?: string;
  /** ruled-out approaches this answer used anyway */
  hit?: string[];
};

export type LayerStats = {
  n: number;
  distinct: number;
  effective: number;
  top3: number;
  primary: [string, number][];
  used: [string, number][];
  banShare: number;
  topName?: { name: string; count: number; variants: boolean };
};

export type Layer = {
  depth: number;
  ruledOut: string[];
  common: string[];
  asked: number;
  kept: number;
  dropped: number;
  untagged: number;
  stats: LayerStats;
  ideas: Idea[];
  droppedIdeas: Idea[];
};

export type Topic = {
  slug: string;
  topic: string;
  prompt: string;
  models: string[];
  vocabulary: number;
  neverUsedAtSurface: number;
  topRevenue: { tag: string; count: number };
  topForm: { tag: string; count: number };
  layers: Layer[];
};

export type TopicIndex = { slug: string; topic: string; n: number; top3: number }[];
