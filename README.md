# 🏃 Marathon Tracker — 全国+国际马拉松赛事追踪

覆盖**中国田协认证赛事（A 类 + B 类）**与**世界马拉松大满贯、世界田联白金标赛事**的赛事追踪网站。集中查看比赛时间、报名窗口、竞赛项目和官方报名入口。数据由本机 Mac 每 3 天自动更新（也可随时手动触发）+ 阿里云百炼千问 API 复查维护；AI 产出只作线索，赛期变更与报名通道经人工核验审批后入库。

## 架构

```
data/races.json（唯一事实源，331 场，无数据库）
  ├─ LaunchAgent run.pbrun.update-3day：每天 10:00 + 每次登录补跑
  │    bash scripts/daily-update-mac.sh --scheduled
  │    距上次成功不满 68 小时 → 秒退不花 token；满了才跑下面这条链路
  │    →（可选 --with-discover）discover-races.ts 巡检新官宣赛事
  │    → update-status.ts 分级复查：只查还可能发生变化的赛事
  │    → verify-data.ts 发布前检测（不过则不提交）→ 提交并 push 到 main
  ├─ 手动触发（随时）：bash scripts/daily-update-mac.sh（不受 3 天判断限制）
  ├─ 每日 08:30（北京时间）watch-freshness.yml → check-freshness.py
  │    数据超 96 小时未成功更新 → 流水线变红 + 告警 Issue（不调 AI、无需密钥）
  └─ 前端 src/（Next.js）直接读 races.json 渲染 → Vercel 自动部署
```

- **前端**：Next.js 16 + Tailwind CSS，无后端、无数据库
- **数据**：`data/races.json`（309 场国内 + 22 场国际）
- **新赛事**：`scripts/discover-races.ts` 两段式巡检——先联网粗筛未来半年内即将举办的赛事（只要名称/地区/日期，去重在本地做），再对通过去重与日期校验的候选逐场核实组委会官方公告，核实不过直接丢弃。AI 新赛事认证级别只给 `unknown`，待人工核验
- **复查**：`scripts/update-status.ts` 调用千问 API（联网搜索），复查范围由 `src/lib/schedule.ts` 分级调度：当前 19 场每天盯、11 场周检、18 场月检、283 场不再查（赛期已过或报名尘埃落定）；每次跑完打印 token 账单，可用 `--limit=N` 小量试跑
- **人工审批**：AI 发现的赛期变更先进 `data/pending-reviews.json`，人工读取官方公告后用 `scripts/review-date.ts` 审批；报名通道只接受人工核验记录
- **成本**：代码托管/部署使用免费额度；千问 API 只花在"还可能变化"的赛事上。实测一轮复查 25 场合计约 16.5 万 token（单场均值约 6600，qwen3.8-flash）；巡检一轮约 10 次调用、6~10 万 token。当前平均 3 天一轮，约每月 10 轮

## 端点纪律（两次停摆的病根，改配置前必读）

| 任务跑在哪 | 端点 | 密钥 |
| --- | --- | --- |
| 本机 Mac（境内网络，**当前方式**） | Token Plan 专属端点 `token-plan.cn-beijing.maas.aliyuncs.com` | `sk-sp-` 套餐密钥 |
| GitHub Actions（境外 runner） | 通用端点 `dashscope.aliyuncs.com` | `sk-` 通用密钥 |

交叉使用一定失败：密钥配错是 `401 invalid_api_key`，端点不可达是 `fetch failed / ETIMEDOUT`（换密钥治不了）。因此两个调 AI 的 Actions workflow（`update-races.yml`、`discover-races.yml`）**当前停用**；重新启用前必须先把 `scripts/lib/qwen.ts` 切到通用端点并配通用密钥。

## 本地运行

```bash
cp .env.example .env   # 填入 DASHSCOPE_API_KEY（必需）
npm ci
npm run dev            # 打开 http://localhost:3000
npm test               # 单元测试（schedule / status / validation / schema 契约）
npm run update:dry     # 复查试运行（不写文件）
npx tsx scripts/verify-data.ts   # 发布前检测（字段契约 + 日期一致性 + 官网 HTTP 实测）
```

日常数据更新固定在运行副本 `~/pbrun/marathon-tracker` 里执行（macOS 隐私限制与完整运维纪律见 `AGENTS.md`）。默认由 LaunchAgent 每 3 天自动跑一轮，也可以随时手动触发：

```bash
bash scripts/daily-update-mac.sh                     # 手动立即更新（不做 3 天判断）
bash scripts/daily-update-mac.sh --with-discover     # 顺带巡检新赛事
bash scripts/daily-update-mac.sh --with-digest       # 顺带生成当日简报 Mail 草稿（发送由人按）
# 日志：~/Library/Logs/pbrun-daily-update.log
# 自动更新：scripts/run.pbrun.update-3day.plist（每天 10:00 + 登录补跑，满 68 小时才真正复查）
```

## 部署指南（从零开始）

### 第 1 步：注册 GitHub 并创建仓库

1. 访问 https://github.com 注册账号
2. 点右上角 `+` → `New repository`，仓库名如 `marathon-tracker`，选 **Private** 或 Public 均可
3. 在本地项目目录执行：

```bash
git remote add origin git@github.com:<你的用户名>/marathon-tracker.git
git push -u origin main
```

（需先配置 SSH Key：GitHub → Settings → SSH and GPG keys；或改用 HTTPS 地址）

### 第 2 步：开通阿里云百炼，获取千问 API Key

1. 访问 https://bailian.console.aliyun.com 用支付宝/淘宝账号登录开通（新用户有免费额度）
2. 控制台右上角头像 → `API-KEY 管理` → 创建 API Key
3. 在本机项目目录 `cp .env.example .env`，把 Key 填进 `DASHSCOPE_API_KEY`（本机用套餐密钥 `sk-sp-`，见上方端点纪律）

只有打算重新启用 Actions 里两条停用的 AI workflow 时，才需要把**通用** `sk-` 密钥配进仓库 `Settings` → `Secrets and variables` → `Actions`，并先把 `scripts/lib/qwen.ts` 切到通用端点。

### 第 3 步：部署到 Vercel

1. 访问 https://vercel.com ，用 **GitHub 账号登录**
2. `Add New...` → `Project` → 选择 `marathon-tracker` 仓库 → `Import`
3. 框架自动识别为 Next.js，直接点 `Deploy`，约 1 分钟完成
4. 部署成功后会得到一个 `https://xxx.vercel.app` 地址

之后每次代码或数据更新（包括本机脚本自动提交的赛事数据），Vercel 都会自动重新部署。

### 第 4 步：绑定自己的域名（可选）

1. 在阿里云（https://wanwang.aliyun.com）购买域名（约 38 元/年）
2. Vercel 项目 → `Settings` → `Domains` → 输入你的域名，按提示在阿里云域名解析中添加：
   - 记录类型 `CNAME`，主机记录 `www`，记录值 `cname.vercel-dns.com`
   - 记录类型 `A`，主机记录 `@`，记录值 `76.76.21.21`
3. 等待 DNS 生效（几分钟到几小时），HTTPS 证书自动签发

### 第 5 步：验证更新链路

1. 本机执行 `bash scripts/daily-update-mac.sh`，日志在 `~/Library/Logs/pbrun-daily-update.log`
2. 成功后 main 出现 `chore: 本机更新赛事数据` 提交，网站几分钟内自动展示最新数据
3. 自动更新（可选但推荐）：把 `scripts/run.pbrun.update-3day.plist` 复制到 `~/Library/LaunchAgents/` 后执行
   `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/run.pbrun.update-3day.plist`。
   它每天 10:00 触发、每次登录补跑，距上次成功满 68 小时才真正复查；停用用 `launchctl bootout`。
4. GitHub Actions 里唯一活跃的定时任务是 `watch-freshness`（每日 08:30 心跳）：数据超 96 小时未成功更新会自动变红并开/追加告警 Issue，本机没开机也能报

## 目录结构

```
data/
  races.json               # 赛事数据（唯一事实源）
  schema.json              # 字段契约（增删字段必须同步修改并 bump schemaVersion）
  pending-reviews.json     # 赛期变更人工审批队列
  review-history.json      # 审批留档
  update-health.json       # 最近成功更新时间（新鲜度心跳的判据）
  knownIds.json            # 巡检去重基准（删赛事必须同步清理）
  todaySites.json          # AI 新写入官网的留档
  dateChanges.json         # 运行时产物，不入库
src/
  types/race.ts            # 数据类型
  lib/status.ts            # 状态推导/排序/统计（含单元测试）
  lib/schedule.ts          # 分级复查调度（含单元测试）
  lib/races.ts             # 数据加载
  components/              # StatsBar / FilterBar / RaceCard / Tracker
scripts/
  daily-update-mac.sh      # 本机更新全流程（手动随时可跑；--scheduled 给 LaunchAgent 用）
  run.pbrun.update-3day.plist  # 3 天节奏的 LaunchAgent 配置（每天 10:00 + 登录补跑）
  update-status.ts         # 分级复查脚本
  discover-races.ts        # 新赛事巡检脚本
  verify-data.ts           # 发布前检测关卡
  review-date.ts           # 赛期变更人工审批
  dedupe-races.ts          # 存量清洗与重复合并
  draft-digest-mac.sh      # 当日简报 → Mail 草稿（零密钥，发送由人按）
  email-digest.ts          # 简报邮件（Resend，邮件通道当前停用）
  check-freshness.py       # 数据新鲜度心跳
  alert-failure.py         # 流水线失败告警（开/追加 Issue）
  lib/                     # qwen.ts / site-reach.ts / validation.ts / schema.ts / date-review.ts
.github/workflows/
  ci.yml                   # PR 门禁：lint / typecheck / test / build
  watch-freshness.yml      # 每日 08:30 新鲜度心跳（唯一活跃的定时任务）
  update-races.yml         # 每日复查（停用，见端点纪律）
  discover-races.yml       # 新赛事巡检（停用，见端点纪律）
```

## 免责声明

数据来源于中国田径协会赛事名录及各赛事组委会公开信息，由 AI 辅助采集与更新，可能存在误差。**报名请务必以各赛事官方渠道为准。**
