# marathon-tracker（pbrun.run）—— Agent 操作指南

马拉松赛事追踪网站：单页展示国内/海外马拉松的报名窗口与状态。
数据源是**纯 JSON 文件（无数据库）**，由**本机 Mac 的定时任务** + 阿里云百炼千问 API 自动维护，前端部署在 Vercel。
（GitHub Actions 那两个**调 AI** 的 workflow 已停用：套餐专属端点只有境内网络可达，境外 runner 连它一律超时；
只保留一个不调 AI 的数据新鲜度心跳。）

## 数据流（改任何一环前先读这段）

```
data/races.json（唯一事实源，约 150 场）
  ├─ 每日 07:30（北京时间）本机 LaunchAgent → bash scripts/daily-update-mac.sh
  │    （跑的是运行副本 ~/pbrun/marathon-tracker，原因见下方"定时任务装法"）
  │    → scripts/update-status.ts 按 src/lib/schedule.ts 分级调度（每天盯/周检/月检/不再查）联网复查赛事进展
  │    写出：races.json、todaySites.json（本次 AI 新写入的官网）、dateChanges.json（赛期变更，运行时产物不入库）
  │    → scripts/verify-data.ts 发布前检测（不过则不提交）→ 提交并 push 到 main
  │    → 简报默认不跑，加 --with-digest 才接 scripts/draft-digest-mac.sh（当日简报→Mail 草稿→人工按发送）
  │    日志：~/Library/Logs/pbrun-daily-update.log；plist 备份在 scripts/run.pbrun.daily-update.plist
  ├─ 每日 08:30（北京时间）watch-freshness.yml → scripts/check-freshness.py（仍在启用，不调 AI、不要密钥）
  │    只看 main 上最近一次数据提交是否超 36 小时，超了就红 + 开/追加告警 Issue（本机没开机/没网也能报）
  ├─ 每周一/三/六 06:30 discover-races.yml → scripts/discover-races.ts（同样已停用，需要时在本机跑）
  └─ 前端 src/（Next.js）直接读 races.json 渲染
停用中的 workflow：update-races.yml、discover-races.yml（GitHub Settings → Actions → Workflows 可重新启用，
但重新启用前必须把 qwen.ts 的 ENDPOINT 换成通用端点 + 通用密钥，否则必红）。
它们失败时的告警走 scripts/alert-failure.py（GITHUB_TOKEN 开/追加 Issue）。
```

## 运行脚本（本地）

```bash
cp .env.example .env   # 填入 DASHSCOPE_API_KEY（必需）；RESEND_API_KEY/EMAIL_TO 仅简报需要
set -a && source .env && set +a
npm ci
npx tsx scripts/update-status.ts --dry-run   # 每日复查（dry-run 不写文件）
bash scripts/daily-update-mac.sh             # 本机每日更新全流程：拉 main→复查→检测→提交并 push
                                             # 加 --with-digest 顺带生成 Mail 草稿简报
                                             # 定时由 LaunchAgent 负责（见下方安装命令），不要再手动挂 cron
npx tsx scripts/discover-races.ts --dry-run  # 新赛事巡检
npx tsx scripts/verify-data.ts               # 发布前检测（字段契约+日期+官网 HTTP 实测）
npx tsx scripts/email-digest.ts --dry-run    # 简报预览写入 digest-preview.html，不发送
bash scripts/draft-digest-mac.sh             # 本机推送：当日简报→Mail 草稿→系统通知（零密钥，发送由人按）
npx tsx scripts/dedupe-races.ts              # 存量清洗+重复合并（默认预览，加 --apply 才写回）
npm run dev                                   # 本地预览前端
```

定时任务装法（换机器或误删时用，plist 备份在 `scripts/` 里）：

**为什么副本在 `~/pbrun/marathon-tracker`：** macOS 隐私保护不让 launchd 起的 `/bin/bash` 读
"文稿"目录（实测静默拒绝、连授权弹窗都没有：`ls`/`head`/`git` 全部 Operation not permitted）。
所以定时任务用一份位于 `~/pbrun/` 的运行副本，你编辑的那份仍在 `~/Documents/marathon-tracker`。
两份都指向同一个远端 main：副本每天 `git pull` 取最新代码与数据，你这边推送后次日自动跟上。
**手改 `data/races.json` 只在你编辑的那份做并推送，别在副本里改**（副本会被次日的 pull 覆盖）。

```bash
cp scripts/run.pbrun.daily-update.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/run.pbrun.daily-update.plist
launchctl print gui/$(id -u)/run.pbrun.daily-update | head    # 确认已挂上 07:30
launchctl kickstart -k gui/$(id -u)/run.pbrun.daily-update    # 立刻试跑一次（会真推送）
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
5. **端点必须与"任务跑在哪台机器"匹配**（这是两次停摆的真正病根，别只记"密钥要配对"）：
   - 本机 Mac（境内网络）→ Token Plan 专属端点 `token-plan.cn-beijing.maas.aliyuncs.com` + `sk-sp-` 套餐密钥。**当前就是这一档。**
   - GitHub Actions（境外 runner）→ 通用端点 `dashscope.aliyuncs.com` + `sk-` 通用密钥（百炼后付费/免费额度）。
   交叉使用一定失败，且两种失败长得不一样：密钥配错是 `401 invalid_api_key`（换密钥能治），
   端点不可达是 `fetch failed / ETIMEDOUT`（35 场全灭、成功 0，换密钥治不了）。
   套餐密钥拿去调通用端点、或调 `token-plan.us-east-1/ap-southeast-1` 这些海外同名主机，都是 401
   ——它们属阿里云国际站账号体系，与国内站这把 key 不通。
6. AI 只给 category "B"，标牌等级需人工核实后升级；赛期以官方公告为准，禁止按往年经验推测。
7. **入库前必须过 `findDuplicate` 同场判定**（`scripts/lib/validation.ts`）。种子数据用干净短名
   （"济南马拉松"），巡检用官方冠名全称（"2026恒丰银行济南(泉城)马拉松"），
   原先按 `norm(name)` 精确比对拦不住改名变体，2026-09-28 页面上已出现 9 组重复卡片。
   三条规则（同名/同赛期互为包含/同赛期同城且一方是城市主赛事）均**要求同年**，
   否则伦敦马拉松这类每年一届的同名赛事会被误拦、真赛事永久漏收。

## GitHub Secrets（仓库 Settings → Secrets and variables → Actions）

| Secret | 用途 | 缺失后果 |
| --- | --- | --- |
| `DASHSCOPE_API_KEY` | 只剩那两个停用 workflow 用（本机从 `.env` 读，不走 Actions） | 重新启用它们时脚本变红 + 告警 Issue |
| `RESEND_API_KEY` + `EMAIL_TO` | 每日简报邮件 | 简报打印跳过，数据链路不受影响 |
| `GITHUB_TOKEN`（内置） | 失败告警 Issue | 无需配置 |

仓库需要 `Issues: Write` 权限（三个 workflow 已在 `permissions:` 声明）。
心跳 watch-freshness.yml 不调 AI、不需要任何自定义密钥。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
