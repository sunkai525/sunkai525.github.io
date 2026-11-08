#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { loadJson, saveJson, getMirrors, createRelease, upsertRelease } from "./release-lib.mjs";

const root = path.resolve(import.meta.dirname, "..");
const configPath = path.join(root, "release.config.json");
const releasesPath = path.join(root, "releases.json");

function usage() {
  console.log(`用法:
  node scripts/add-release.mjs <GitHub资源链接...> [选项]

支持链接:
  https://github.com/<owner>/<repo>/releases/download/<tag>/<file>
  https://github.com/<owner>/<repo>/blob/<ref>/<file>  (直接拼接加速前缀)

选项:
  --tag <tag>         版本标签；省略时从第一个链接解析
  --name <name>       发布标题；默认同 tag
  --date <YYYY-MM-DD> 发布日期；默认自动推断或今天
  --notes <html|text> 更新说明（含 HTML 标签则按 HTML 处理，否则按文本转列表）
  --commit <sha>      关联提交短哈希
  --prerelease        标记为预发布
  --no-latest         不设为 Latest
  -h, --help          显示帮助
`);
}

function parseArgs(argv) {
  const args = { urls: [], latest: true, prerelease: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "--tag") args.tag = argv[++i];
    else if (a === "--name") args.name = argv[++i];
    else if (a === "--date") args.date = argv[++i];
    else if (a === "--notes") args.notes = argv[++i];
    else if (a === "--commit") args.commit = argv[++i];
    else if (a === "--prerelease") args.prerelease = true;
    else if (a === "--no-latest") args.latest = false;
    else if (a.startsWith("-")) throw new Error(`未知参数: ${a}`);
    else args.urls.push(a);
  }
  return args;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.urls.length === 0) { usage(); process.exit(args.help ? 0 : 1); }
  const config = loadJson(configPath, {});
  const mirrors = getMirrors(config);
  const release = createRelease({ ...args, mirrors });
  const current = loadJson(releasesPath, []);
  const { releases, action } = upsertRelease(current, release);
  saveJson(releasesPath, releases);
  console.log(`${action === "created" ? "已新增" : "已更新"}版本: ${release.tag}`);
  console.log(`日期: ${release.date}`);
  console.log(`加速镜像: ${mirrors.length ? mirrors.map((m) => m.label).join(", ") : "(无)"}`);
  for (const a of release.assets) {
    console.log(`- ${a.name}`);
    for (const d of a.downloads) console.log(`  [${d.label}] ${d.url}`);
  }
  console.log(`已写入: ${path.relative(root, releasesPath)}`);
} catch (err) {
  console.error(`错误: ${err.message}`);
  process.exit(1);
}
