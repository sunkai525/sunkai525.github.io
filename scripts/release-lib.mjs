import fs from "node:fs";

export function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function parseReleaseAssetUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }

  if (u.hostname === "github.com") {
    let m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/(.+)$/);
    if (m) {
      return {
        owner: m[1],
        repo: m[2],
        tag: decodeURIComponent(m[3]),
        file: decodeURIComponent(m[4].split("/").pop() || m[4]),
        originalUrl: raw,
        kind: "release",
      };
    }
    m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+)$/);
    if (m) {
      const filePath = decodeURIComponent(m[4]);
      return {
        owner: m[1],
        repo: m[2],
        tag: decodeURIComponent(m[3]),
        file: filePath.split("/").pop() || filePath,
        originalUrl: raw,
        kind: "file",
      };
    }
  }

  if (u.hostname === "raw.githubusercontent.com") {
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
    if (m) {
      const filePath = decodeURIComponent(m[4]);
      return {
        owner: m[1],
        repo: m[2],
        tag: decodeURIComponent(m[3]),
        file: filePath.split("/").pop() || filePath,
        originalUrl: raw,
        kind: "raw",
      };
    }
  }

  return null;
}

export const parseGitHubAssetUrl = parseReleaseAssetUrl;

export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function inferDate(tag) {
  const m = String(tag || "").match(/(20\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function getMirrors(config) {
  if (Array.isArray(config?.mirrors) && config.mirrors.length) {
    return config.mirrors
      .filter((m) => m && m.prefix)
      .map((m, i) => ({ label: m.label || `mirror${i + 1}`, prefix: m.prefix }));
  }
  if (config?.acceleratePrefix) return [{ label: "加速", prefix: config.acceleratePrefix }];
  return [];
}

export function buildDownloads(originalUrl, mirrors) {
  const downloads = [{ label: "原始", url: originalUrl, original: true }];
  for (const m of mirrors) downloads.push({ label: m.label, url: m.prefix + originalUrl });
  return downloads;
}

export function notesToHtml(notes) {
  const s = String(notes || "").trim();
  if (!s) return "";
  if (s.includes("<")) return s;
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return "";
  if (lines.length === 1) return `<p>${escapeHtml(lines[0])}</p>`;
  return `<ul>${lines.map((l) => `<li>${escapeHtml(l.replace(/^[-*]\s*/, ""))}</li>`).join("")}</ul>`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function createRelease({ urls, tag, name, date, notes, notesHtml, commit, prerelease = false, latest = true, mirrors = [] }) {
  const list = (Array.isArray(urls) ? urls : String(urls || "").split(/\r?\n/))
    .map((u) => String(u).trim()).filter(Boolean);
  if (!list.length) throw new Error("请提供至少一个 GitHub 资源链接");
  const parsed = list.map((url) => {
    const p = parseReleaseAssetUrl(url);
    if (!p) throw new Error(`不是支持的 GitHub 资源链接（支持 releases/download、blob、raw）: ${url}`);
    return p;
  });
  const finalTag = String(tag || parsed[0].tag).trim();
  if (!finalTag) throw new Error("无法确定版本 tag");
  const mismatched = parsed.find((p) => p.tag !== finalTag);
  if (mismatched) throw new Error(`链接中的 tag (${mismatched.tag}) 与目标 tag (${finalTag}) 不一致`);
  return {
    tag: finalTag,
    name: String(name || finalTag).trim() || finalTag,
    latest: !!latest,
    prerelease: !!prerelease,
    date: String(date || inferDate(finalTag) || inferDate(parsed[0].file) || today()).trim(),
    ...(commit ? { commit: String(commit).trim() } : {}),
    notesHtml: notesHtml != null ? String(notesHtml) : notesToHtml(notes),
    source: {
      owner: parsed[0].owner,
      repo: parsed[0].repo,
      url: `https://github.com/${parsed[0].owner}/${parsed[0].repo}/releases/tag/${encodeURIComponent(finalTag)}`,
    },
    assets: parsed.map((p) => {
      const downloads = buildDownloads(p.originalUrl, mirrors);
      const firstMirror = downloads.find((d) => !d.original);
      return {
        name: p.file,
        size: "—",
        url: (firstMirror || downloads[0]).url,
        originalUrl: p.originalUrl,
        downloads,
      };
    }),
  };
}

function mergeAssets(existing, incoming) {
  const out = Array.isArray(existing) ? [...existing] : [];
  for (const a of Array.isArray(incoming) ? incoming : []) {
    const i = out.findIndex((x) => x.name === a.name || (x.originalUrl && x.originalUrl === a.originalUrl));
    if (i >= 0) out[i] = a;
    else out.push(a);
  }
  return out;
}

export function upsertRelease(releases, release, { mergeAssets: doMergeAssets = true } = {}) {
  const list = Array.isArray(releases) ? [...releases] : [];
  if (release.latest) for (const r of list) r.latest = false;
  const idx = list.findIndex((r) => r.tag === release.tag);
  if (idx >= 0) {
    const prev = list[idx];
    list[idx] = doMergeAssets ? { ...prev, ...release, assets: mergeAssets(prev.assets, release.assets) } : release;
    return { releases: list, action: "updated" };
  }
  list.unshift(release);
  return { releases: list, action: "created" };
}
