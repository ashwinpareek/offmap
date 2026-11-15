import labelsJson from "./data/labels.json";

const labels = labelsJson as Record<string, string>;

export const label = (tag: string) => labels[tag] ?? tag.replace(/_/g, " ");

/** Label for use mid-sentence. Acronyms keep their capitals: "AI tutor", "AR or VR". */
export const lower = (tag: string) => {
  const l = label(tag);
  return /^[A-Z]{2}/.test(l) ? l : l[0].toLowerCase() + l.slice(1);
};

export const list = (items: string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const DEPTH_NAMES = ["Surface", "One layer down", "Two layers down", "Three layers down", "Four layers down"];
export const depthName = (d: number) => DEPTH_NAMES[d] ?? `${d} layers down`;
