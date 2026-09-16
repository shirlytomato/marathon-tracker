# 🏃 Marathon Tracker — 全国+国际马拉松赛事追踪

覆盖**中国田协认证赛事（A 类 + B 类）**与**世界马拉松大满贯、世界田联白金标赛事**的赛事追踪网站。集中查看比赛时间、报名窗口、竞赛项目和官方报名入口，每日自动更新。

## 架构

```
中国田协赛事名录 ──采集清洗──> data/races.json（仓库内数据源，无数据库）
                                   ▲
  Actions 每周一/三/六 06:30 ─────┤  新赛事巡检：增量粗筛 → 逐场官方公告核实
  Actions 每天 07:30 ────────────┘  分级复查：只查还可能发生变化的赛事
                                   │
                                   └──> Vercel 自动部署
```

- **前端**：Next.js 16 + Tailwind CSS，无后端、无数据库
- **数据**：`data/races.json`（318 场国内 + 21 场国际，由两条管道持续增补）
- **新赛事**：`scripts/discover-races.ts` 两段式巡检——先只搜最近 10 天新官宣的赛事（库内已收录的作为排除名单注入提示词），再对通过本地去重的候选逐场核实官方公告，核实不过直接丢弃
- **复查**：`scripts/update-status.ts` 调用阿里云百炼千问 API（联网搜索），复查范围由 `src/lib/schedule.ts` 的分级调度决定
- **成本**：代码托管/部署/调度均使用免费额度；千问 API 只花在“还可能变化”的赛事上，赛期已过（当前 162 场）与报名已尘埃落定的一律不查（实测日均查询 156 场 → 47 场，7 天累计 1092 → 332 次，降幅 70%）

## 本地运行

```bash
npm install
npm run dev        # 打开 http://localhost:3000
npm test           # 运行单元测试
npm run update:dry # 本地试运行数据更新（需 DASHSCOPE_API_KEY，不写文件）
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
3. 在 GitHub 仓库页：`Settings` → `Secrets and variables` → `Actions` → `New repository secret`
   - Name 填 `DASHSCOPE_API_KEY`，Value 粘贴你的 Key

### 第 3 步：部署到 Vercel

1. 访问 https://vercel.com ，用 **GitHub 账号登录**
2. `Add New...` → `Project` → 选择 `marathon-tracker` 仓库 → `Import`
3. 框架自动识别为 Next.js，直接点 `Deploy`，约 1 分钟完成
4. 部署成功后会得到一个 `https://xxx.vercel.app` 地址

之后每次代码或数据更新（包括 Actions 自动提交的赛事数据），Vercel 都会自动重新部署。

### 第 4 步：绑定自己的域名（可选）

1. 在阿里云（https://wanwang.aliyun.com）购买域名（约 38 元/年）
2. Vercel 项目 → `Settings` → `Domains` → 输入你的域名，按提示在阿里云域名解析中添加：
   - 记录类型 `CNAME`，主机记录 `www`，记录值 `cname.vercel-dns.com`
   - 记录类型 `A`，主机记录 `@`，记录值 `76.76.21.21`
3. 等待 DNS 生效（几分钟到几小时），HTTPS 证书自动签发

### 第 5 步：验证自动更新

1. GitHub 仓库 → `Actions` 标签 → 左侧选择「每日更新赛事数据」→ `Run workflow` 手动触发一次
2. 运行成功后查看 `data/races.json` 是否出现 `chore: 更新赛事数据` 提交
3. 网站几分钟内自动展示最新数据

## 目录结构

```
data/races.json              # 赛事数据（唯一数据源）
src/
  types/race.ts              # 数据类型
  lib/status.ts              # 状态推导/排序/统计（含单元测试）
  lib/schedule.ts            # 分级复查调度：决定每场赛事多久查一次（含单元测试）
  lib/races.ts               # 数据加载
  components/                # StatsBar / FilterBar / RaceCard / Tracker
scripts/
  seed-domestic.py           # 国内赛事种子脚本（一次性）
  seed-international.ts      # 国际赛事种子脚本（一次性）
  discover-races.ts          # 新赛事巡检脚本（Actions 每周一/三/六调用）
  update-status.ts           # 每日复查脚本（Actions 调用）
  verify-data.ts             # 发布前检测关卡（日期一致性 + 官网实测）
  email-digest.ts            # 每日简报邮件
  alert-failure.py           # 任务失败告警（开/评论 Issue）
  lib/qwen.ts                # 千问 API 客户端
.github/workflows/update-races.yml    # 每日 07:30 定时任务
.github/workflows/discover-races.yml  # 每周一/三/六 06:30 新赛事巡检
```

## 免责声明

数据来源于中国田径协会赛事名录及各赛事组委会公开信息，由 AI 辅助采集与更新，可能存在误差。**报名请务必以各赛事官方渠道为准。**
