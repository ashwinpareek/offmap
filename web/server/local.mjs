// Serve the built site and the /api function together, for local checks.
//   npm run build && node server/local.mjs
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import place from "../api/place.js";

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2", ".woff": "font/woff" };
const port = Number(process.env.PORT || 8787);

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/api/place") return place(req, res);
    const file = path.join(dist, path.normalize(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!file.startsWith(dist)) return res.writeHead(403).end();
    try {
      const data = await readFile(file);
      res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }).end(data);
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(port, () => console.log(`http://localhost:${port}`));
