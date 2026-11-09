# sunkai525.github.io

静态的 GitHub Releases 风格发布页（GitHub Pages），支持通过本地发布页面/脚本填写 GitHub 源链接，自动生成国内加速下载地址并更新发布数据。

## 目录结构

- `index.html`：发布页，读取 `releases.json` 渲染（GitHub Releases 风格）
- `releases.json`：发布数据
- `release.config.json`：加速镜像前缀配置
- `publish.html`：本地发布表单页
- `scripts/publish-server.mjs`：本地发布服务（保存时写入 `releases.json`）
- `scripts/add-release.mjs`：命令行添加/更新 release
- `scripts/release-lib.mjs`：链接解析、加速地址生成、release 合并逻辑

## 配置加速前缀

编辑 `release.config.json`。规则为：**`加速链接 = prefix + 原始 GitHub 链接`**（不转换 raw）。

```json
{
  "mirrors": [
    { "label": "gh-proxy", "prefix": "https://gh-proxy.org/" },
    { "label": "v4", "prefix": "https://v4.gh-proxy.org/" }
  ]
}
```

兼容旧格式：`{ "acceleratePrefix": "https://..." }`。

## 方式一：本地发布页面（推荐）

启动本地 Node 服务（需要 Node.js）：

```bash
cd /path/to/sunkai525.github.io
node scripts/publish-server.mjs
```

默认地址：
- 发布表单：<http://127.0.0.1:3030/publish.html>
- 预览页面：<http://127.0.0.1:3030/index.html>

自定义端口：

```bash
PORT=8080 node scripts/publish-server.mjs
```

表单支持：
- **GitHub 源链接**（必填，每行一个）：支持 `releases/download`、`blob`、`raw` 链接
- **名称 / 更新说明**：更新说明为纯文本时自动转列表；包含 HTML 标签时按 HTML 保存
- **Tag / 发布日期 / Pre-release**：Tag 与日期可自动解析
- 同一版本不同架构可一次填写多行；后续补充同版本资源时填写相同 Tag，会自动合并到该版本
- 已发布版本列表支持删除（会更新本地 `releases.json`）

保存/删除会直接修改本地 `releases.json`。确认后提交推送：

```bash
git add releases.json
git commit -m "release: vX.Y.Z"
git push
```

## 方式二：命令行

```bash
node scripts/add-release.mjs \
  "https://github.com/owner/repo/releases/download/v1.2.0/app-linux-amd64.zip" \
  "https://github.com/owner/repo/releases/download/v1.2.0/app-windows-amd64.zip" \
  --name "v1.2.0" \
  --notes "<h3>What's Changed</h3><ul><li>修复问题</li></ul>"
```

常用选项：`--tag`、`--name`、`--date YYYY-MM-DD`、`--notes`、`--commit`、`--prerelease`、`--no-latest`。同 Tag 重复运行只会把新资源合并到该版本（保留原有更新说明、日期）。`blob`/`raw` 链接的 Tag 留空时会从文件名自动识别版本号（如 `v4.5.1`），使每个版本成为独立 Release，新版本排在旧版本上方且不改动旧版本。

## 支持的源链接

- `https://github.com/<owner>/<repo>/releases/download/<tag>/<file>`
- `https://github.com/<owner>/<repo>/blob/<ref>/<path>`（直接拼接前缀，不转 raw）
- `https://github.com/<owner>/<repo>/raw/<ref>/<path>`
- `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>`

## 部署

仓库作为 GitHub Pages 静态站点部署即可。`index.html` 通过 `fetch('./releases.json')` 加载数据，请通过 HTTP(S) 访问（GitHub Pages 正常支持）；直接 `file://` 打开可能受浏览器限制。

## 数据格式（`releases.json`）

```json
[
  {
    "tag": "v1.0.0",
    "name": "v1.0.0",
    "latest": true,
    "prerelease": false,
    "date": "2026-11-08",
    "notesHtml": "<ul><li>更新说明</li></ul>",
    "source": { "owner": "owner", "repo": "repo", "url": "https://github.com/..." },
    "assets": [
      {
        "name": "app.zip",
        "size": "—",
        "url": "https://mirror/...原始链接",
        "originalUrl": "https://github.com/...",
        "downloads": [
          { "label": "原始", "url": "...", "original": true },
          { "label": "gh-proxy", "url": "..." }
        ]
      }
    ]
  }
]
```
