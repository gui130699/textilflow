import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, relative, extname } from "node:path";

const root = resolve("out");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const raw = resolve(root, "." + pathname);
    if (relative(root, raw).startsWith("..")) throw new Error("Invalid path");
    for (const file of [raw, raw + ".html", resolve(raw, "index.html")]) {
      if (!(await stat(file).catch(() => null))?.isFile()) continue;
      res.setHeader("Content-Type", types[extname(file)] ?? "text/plain");
      createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404).end();
  } catch {
    res.writeHead(400).end();
  }
}).listen(3000, "127.0.0.1");
