// POST /api/place  { idea: string }  ->  { mechanism: string[] }
// Tags one idea with the pipeline's own prompt and vocabulary. Keys stay on the server.
import { MECHANISMS, PROMPT } from "./_tagging.js";

const MAX_CHARS = 1200;

function readJson(reply) {
  let text = String(reply).trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a !== -1 && b > a) {
      try {
        return JSON.parse(text.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function mechanisms(reply) {
  const obj = readJson(reply);
  if (!obj || typeof obj !== "object") return null;
  let m = obj.mechanism;
  if (typeof m === "string") m = [m];
  if (!Array.isArray(m)) return null;
  m = [...new Set(m)].filter((t) => MECHANISMS.includes(t)).slice(0, 2);
  return m.length ? m : null;
}

async function viaGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent",
    {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    },
  );
  if (!res.ok) return null;
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
}

async function viaGroq(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? null;
}

async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 16_000) throw new Error("too large");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Send the idea as a POST request." });
  let idea;
  try {
    idea = String((await body(req)).idea ?? "").trim();
  } catch {
    return send(res, 400, { error: "That request could not be read." });
  }
  if (idea.length < 20) return send(res, 400, { error: "Write at least a full sentence." });
  if (idea.length > MAX_CHARS) return send(res, 400, { error: `Keep the idea under ${MAX_CHARS} characters.` });

  const prompt = PROMPT.replace("{{IDEA}}", idea);
  // The pipeline's tagger first; a second provider if that one is over its quota.
  for (const call of [viaGemini, viaGroq]) {
    try {
      const reply = await call(prompt);
      const found = reply && mechanisms(reply);
      if (found) return send(res, 200, { mechanism: found });
    } catch {
      /* try the next provider */
    }
  }
  return send(res, 503, { error: "The tagging models are busy or over their free quota. Try again in a minute." });
}
