#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadJson, saveJson, getMirrors, createRelease, upsertRelease } from "./release-lib.mjs";

const root = path.resolve(import.meta.dirname, "..");
const configPath = path.join(root, "release.config.json");
const releasesPath = path.join(root, "releases.json");
const port = Number(process.env.PORT || 3030);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": typeof body === "object" && !Buffer.isBuffer(body) ? "application/json; charset=utf-8" : "text/plain; charset=utf-8", ...headers });
  res.end(data);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(new Error("请求体过大")); req.destroy(); return; } chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const rel = decoded === "/" ? "/publish.html" : decoded;
  const abs = path.resolve(root, "." + rel);
  if (!abs.startsWith(root + path.sep) && abs !== root) return null;
  return abs;
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/config") {
    const config = loadJson(configPath, {});
    return send(res, 200, { mirrors: getMirrors(config) });
  }
  if (req.method === "GET" && pathname === "/api/releases") {
    return send(res, 200, loadJson(releasesPath, []));
  }
  if (req.method === "POST" && pathname === "/api/releases") {
    const body = JSON.parse(await readBody(req) || "{}");
    const config = loadJson(configPath, {});
    const mirrors = getMirrors(config);
    const release = createRelease({ ...body, mirrors, latest: body.latest !== false });
    const current = loadJson(releasesPath, []);
    const result = upsertRelease(current, release);
    saveJson(releasesPath, result.releases);
    return send(res, 200, { ok: true, action: result.action, release, mirrorCount: mirrors.length });
  }
  if (req.method === "DELETE" && pathname.startsWith("/api/releases/")) {
    const tag = decodeURIComponent(pathname.slice("/api/releases/".length)).trim();
    if (!tag) return send(res, 400, { ok: false, error: "缺少 tag" });
    const current = loadJson(releasesPath, []);
    const idx = current.findIndex((r) => r.tag === tag);
    if (idx < 0) return send(res, 404, { ok: false, error: `未找到版本: ${tag}` });
    const [removed] = current.splice(idx, 1);
    if (removed?.latest && current.length) current[0].latest = true;
    saveJson(releasesPath, current);
    return send(res, 200, { ok: true, deleted: tag });
  }
  send(res, 404, { ok: false, error: "Not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (u.pathname.startsWith("/api/")) return await handleApi(req, res, u.pathname);

    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method Not Allowed");
    const file = safeStaticPath(u.pathname);
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, "Not Found");
    const ext = path.extname(file).toLowerCase();
    const data = fs.readFileSync(file);
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch (err) {
    const status = err.message === "请求体过大" ? 413 : 400;
    if (String(req.url || "").startsWith("/api/")) send(res, status, { ok: false, error: err.message });
    else send(res, status, err.message);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`发布页面: http://127.0.0.1:${port}/publish.html`);
  console.log(`预览页面: http://127.0.0.1:${port}/index.html`);
  console.log(`数据文件: ${path.relative(root, releasesPath)}`);
  console.log(`按 Ctrl+C 停止`);
});
