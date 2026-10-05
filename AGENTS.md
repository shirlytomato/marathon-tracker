# marathon-tracker（pbrun.run）—— Agent 操作指南

马拉松赛事追踪网站：单页展示国内/海外马拉松的报名窗口与状态。
数据源是**纯 JSON 文件（无数据库）**，由 GitHub Actions 定时任务 + 阿里云百炼千问 API 自动维护，前端部署在 Vercel。

## 数据流（改任何一环前先读这段）

```
data/races.json（唯一事实源，约 150 场）
  ├─ 每日 07:30（北京时间）update-races.yml → scripts/update-status.ts
  │    按 src/lib/schedule.ts 分级调度（每天盯/周检/月检/不再查）联网复查赛事进展
  │    写出：races.json、todaySites.json（本次 AI 新写入的官网）、dateChanges.json（赛期变更，运行时产物不入库）
  │    → scripts/verify-data.ts 发布前检测（不过则不提交）
  │    → 提交数据 → scripts/email-digest.ts 发当日简报 → 提交 data/knownIds.json 快照
  ├─ 每周一/三/六 06:30 discover-races.yml → scripts/discover-races.ts
  │    两段式：粗筛候选 → 本地去重/日期校验 → 逐场核实（只认官方公告）→ 入库
  └─ 前端 src/（Next.js）直接读 races.json 渲染
两个 workflow 任一环节失败都会跑 scripts/alert-failure.py 开/追加告警 Issue（GITHUB_TOKEN，无需额外密钥）。
```

## 运行脚本（本地）

```bash
cp .env.example .env   # 填入 DASHSCOPE_API_KEY（必需）；RESEND_API_KEY/EMAIL_TO 仅简报需要
set -a && source .env && set +a
npm ci
npx tsx scripts/update-status.ts --dry-run   # 每日复查（dry-run 不写文件）
npx tsx scripts/discover-races.ts --dry-run  # 新赛事巡检
npx tsx scripts/verify-data.ts               # 发布前检测（字段契约+日期+官网 HTTP 实测）
npx tsx scripts/email-digest.ts --dry-run    # 简报预览写入 digest-preview.html，不发送
bash scripts/draft-digest-mac.sh             # 本机推送：当日简报→Mail 草稿→系统通知（零密钥，发送由人按）
npx tsx scripts/dedupe-races.ts              # 存量清洗+重复合并（默认预览，加 --apply 才写回）
npm run dev                                   # 本地预览前端
```

## 校验与门禁

- `npm run lint` / `npx tsc --noEmit` / `npm test`（vitest：schedule、status、validation、schema 契约）。
  PR 合入由 `.github/workflows/ci.yml` 强制跑这三项。
- 数据字段契约在 `data/schema.json`：**给 Race 增删字段必须同步改 schema.json 并 bump schemaVersion**，
  否则 verify-data.ts 会拦截发布（脏字段/缺必填/类型不符均硬错误）。
- 共享实现收敛在 `scripts/lib/`：`site-reach.ts`（官网可达判定，三脚本共用，勿再各写一份）、
  `validation.ts`（screenRace/validYear/norm）、`schema.ts`（契约校验）、`qwen.ts`（千问客户端）。

## 硬性纪律（都有事故背景，不要"优化"掉）

1. **假绿灯防治**：API 全部调用失败必须 `process.exit(1)` 让任务变红，禁止 catch 后照常退出 0
   （2026-09-10~15 连续失败 6 天无人知晓就是这么来的）。
   另一面是「静默陈旧」：email-digest.ts 会统计分级调度里**每天必查（间隔=1 天）却超 36 小时未复查**的场次，
   超阈值就在邮件顶部挂停更横幅 —— 否则收件人会把数据停摆导致的「暂无」当成今天真的没有赛事截止。
   判据只用间隔=1 那一级：周检/月检按 id 相位每 7/30 天才轮一次，`updatedAt` 天然几十天不动，计进去会天天误报。
2. **AI 返回的官网域名必须 HTTP 实测可达才入库**；可达口径以 `scripts/lib/site-reach.ts` 为唯一实现。
3. discover-races.ts 第一段粗筛提示词里的三条实测结论（注释中标 ✗/✓）不要改动。
4. `data/dateChanges.json`、`digest-preview.html` 是运行时产物，故意不入库；
   `data/knownIds.json`（简报"新入库"对比）与 `data/digestBaseline.json`（简报"今日新动态"对比，存上一日的
   regStart/regEnd/lotteryDate 快照）**必须随 workflow 提交**，否则次日比不出变化。
   简报不能用 `updatedAt` 判新动态：update-status.ts 只要单场复查成功就无条件刷 updatedAt。
   基线只能由"真正送达的那一次"推进：`--dry-run`、`--html-file`、`--out-html` 三种未送达情形一律不得写基线
   （2026-10-04 加 `--out-html` 时漏了这一条，本地试跑把 knownIds 改写、凭空生成 digestBaseline，靠 `git show HEAD:` 复原）。
5. 端点与密钥成对匹配：千问 Token Plan 端点只能用 Token Plan 的密钥（见 alert 脚本注释）。
6. AI 只给 category "B"，标牌等级需人工核实后升级；赛期以官方公告为准，禁止按往年经验推测。
7. **入库前必须过 `findDuplicate` 同场判定**（`scripts/lib/validation.ts`）。种子数据用干净短名
   （"济南马拉松"），巡检用官方冠名全称（"2026恒丰银行济南(泉城)马拉松"），
   原先按 `norm(name)` 精确比对拦不住改名变体，2026-09-28 页面上已出现 9 组重复卡片。
   三条规则（同名/同赛期互为包含/同赛期同城且一方是城市主赛事）均**要求同年**，
   否则伦敦马拉松这类每年一届的同名赛事会被误拦、真赛事永久漏收。

## GitHub Secrets（仓库 Settings → Secrets and variables → Actions）

| Secret | 用途 | 缺失后果 |
| --- | --- | --- |
| `DASHSCOPE_API_KEY` | 千问联网搜索（复查/巡检） | 脚本变红 + 告警 Issue |
| `RESEND_API_KEY` + `EMAIL_TO` | 每日简报邮件 | 简报打印跳过，数据链路不受影响 |
| `GITHUB_TOKEN`（内置） | 失败告警 Issue | 无需配置 |

仓库需要 `Issues: Write` 权限（两个 workflow 已在 `permissions:` 声明）。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
