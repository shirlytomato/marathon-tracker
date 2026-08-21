# 全国+国际马拉松赛事追踪网站 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建覆盖全国田协认证赛事（A+B 类）+ 国际大满贯/白金标赛事的马拉松追踪网站，GitHub Actions + 千问 API 每日自动更新，Vercel 部署。

**Architecture:** Next.js 15 (App Router) 静态数据渲染，赛事数据存仓库 `data/races.json`；`scripts/update-status.ts` 每日由 GitHub Actions 执行，调用阿里云百炼千问联网搜索 API 更新赛事进展并提交 JSON，Vercel 自动重新部署。

**Tech Stack:** Next.js 15、TypeScript、Tailwind CSS v4、Vitest、tsx、GitHub Actions、DashScope（千问）API

**规范说明：** 所有命令均在项目根目录 `marathon-tracker/` 下执行。

---

## 文件结构

| 路径 | 职责 |
|---|---|
| `src/types/race.ts` | Race 类型与枚举定义 |
| `src/lib/status.ts` | 状态推导、排序、统计的纯函数（可测试） |
| `src/lib/races.ts` | 读取 data/races.json 的服务端数据访问 |
| `src/components/Tracker.tsx` | 客户端总控：tab/筛选状态管理 |
| `src/components/StatsBar.tsx` | 头部统计卡片 |
| `src/components/FilterBar.tsx` | 筛选器 |
| `src/components/RaceCard.tsx` | 赛事卡片 |
| `src/app/page.tsx` / `layout.tsx` | 页面入口 |
| `data/races.json` | 全量赛事数据 |
| `scripts/lib/qwen.ts` | 千问 API 客户端 |
| `scripts/update-status.ts` | 每日更新脚本（含 dry-run） |
| `scripts/seed-international.ts` | 国际赛事种子数据生成 |
| `.github/workflows/update-races.yml` | 定时工作流 |
| `vercel.json`、`README.md` | 部署配置与部署指南 |

---

### Task 1: 项目脚手架

**Files:**
- Create: 整个 Next.js 工程（create-next-app 生成）

- [ ] **Step 1: 创建 Next.js 工程**

```bash
cd /Users/shirly/Documents/QoderCN/2026-08-21/chat-4/marathon-tracker
npx --yes create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
```

Expected: 输出 `Success!`，生成 `src/app/page.tsx`、`package.json` 等。

- [ ] **Step 2: 安装开发依赖（vitest + tsx）**

```bash
npm i -D vitest tsx
```

- [ ] **Step 3: package.json 增加脚本**

在 `package.json` 的 `scripts` 中加入：

```json
"test": "vitest run",
"update:races": "tsx scripts/update-status.ts",
"update:dry": "tsx scripts/update-status.ts --dry-run"
```

- [ ] **Step 4: 验证 dev server 可启动**

```bash
npm run dev
```

Expected: `✓ Ready in ...`，浏览器打开 http://localhost:3000 显示 Next.js 默认页。验证后 Ctrl+C 停止。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "chore: 初始化 Next.js 工程脚手架"
```

---

### Task 2: 数据模型

**Files:**
- Create: `src/types/race.ts`

- [ ] **Step 1: 编写类型定义**

```ts
// src/types/race.ts
export type RegStatus = "pending" | "open" | "drawing" | "closed" | "finished";
export type RaceCategory = "A" | "B" | "platinum" | "gold" | "major";

export interface Race {
  id: string;              // 唯一标识，如 "beijing-marathon"
  name: string;            // 全称，如 "北京马拉松"
  shortName?: string;      // 简称，如 "北马"
  country: string;         // "中国" 或国家名
  province?: string;       // 国内赛事省份
  city?: string;           // 城市
  raceDate: string;        // YYYY-MM-DD
  location?: string;       // 比赛地点
  regStart?: string;       // 报名开始 YYYY-MM-DD
  regEnd?: string;         // 报名截止 YYYY-MM-DD
  regStatus: RegStatus;    // 数据管道维护的显式状态
  lotteryDate?: string;    // 抽签日期
  needLottery?: boolean;
  scale?: string;          // 参赛规模，如 "30000人"
  events: string[];        // ["全程马拉松","半程马拉松"]
  fee?: string;            // 费用说明
  category: RaceCategory;
  officialSite?: string;
  updatedAt: string;       // ISO 时间戳
}
```

- [ ] **Step 2: 提交**

```bash
git add src/types && git commit -m "feat: 赛事数据模型定义"
```

---

### Task 3: 状态逻辑（TDD）

**Files:**
- Create: `src/lib/status.ts`
- Test: `src/lib/status.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/status.test.ts
import { describe, it, expect } from "vitest";
import { deriveStatus, sortRaces, computeStats } from "./status";
import type { Race } from "@/types/race";

const now = new Date("2026-08-21T08:00:00+08:00");
const base: Race = {
  id: "t", name: "测试马拉松", country: "中国", raceDate: "2026-11-08",
  regStatus: "pending", events: ["全程马拉松"], category: "A",
  updatedAt: "2026-08-20T00:00:00Z",
};

describe("deriveStatus", () => {
  it("比赛日已过 -> finished", () => {
    expect(deriveStatus({ ...base, raceDate: "2026-08-01" }, now)).toBe("finished");
  });
  it("报名窗口内 -> open", () => {
    expect(deriveStatus({ ...base, regStart: "2026-08-12", regEnd: "2026-09-01" }, now)).toBe("open");
  });
  it("报名未开始 -> pending", () => {
    expect(deriveStatus({ ...base, regStart: "2026-09-01", regEnd: "2026-09-30" }, now)).toBe("pending");
  });
  it("报名已截止且未抽签 -> drawing", () => {
    expect(deriveStatus({ ...base, regStart: "2026-06-01", regEnd: "2026-07-01", needLottery: true, lotteryDate: "2026-09-07" }, now)).toBe("drawing");
  });
  it("报名截止且抽签已完成 -> closed", () => {
    expect(deriveStatus({ ...base, regStart: "2026-04-01", regEnd: "2026-05-01", needLottery: true, lotteryDate: "2026-06-30" }, now)).toBe("closed");
  });
  it("报名截止无需抽签 -> closed", () => {
    expect(deriveStatus({ ...base, regStart: "2026-05-01", regEnd: "2026-06-01" }, now)).toBe("closed");
  });
  it("无报名信息且比赛未到 -> pending", () => {
    expect(deriveStatus(base, now)).toBe("pending");
  });
});

describe("sortRaces", () => {
  it("open 优先于 pending，pending 优先于 closed/finished", () => {
    const open: Race = { ...base, id: "open", regStart: "2026-08-01", regEnd: "2026-09-01", regStatus: "open" };
    const pending: Race = { ...base, id: "pending" };
    const finished: Race = { ...base, id: "finished", raceDate: "2026-01-01", regStatus: "finished" };
    const sorted = sortRaces([finished, pending, open], now).map(r => r.id);
    expect(sorted).toEqual(["open", "pending", "finished"]);
  });
});

describe("computeStats", () => {
  it("统计报名中/抽签中/备赛倒计时", () => {
    const races: Race[] = [
      { ...base, id: "1", regStatus: "open", regStart: "2026-08-01", regEnd: "2026-09-01" },
      { ...base, id: "2", regStatus: "drawing", regStart: "2026-06-01", regEnd: "2026-07-01", needLottery: true, lotteryDate: "2026-09-07" },
      { ...base, id: "3", regStatus: "closed", regStart: "2026-04-01", regEnd: "2026-05-01" },
    ];
    const s = computeStats(races, now);
    expect(s.open).toBe(1); expect(s.drawing).toBe(1); expect(s.countdown).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run
```

Expected: FAIL（`Cannot find module './status'`）

- [ ] **Step 3: 实现 status.ts**

```ts
// src/lib/status.ts
import type { Race, RegStatus } from "@/types/race";

const day = 86400000;
const toDate = (s: string) => new Date(s + "T00:00:00+08:00").getTime();

/** 根据日期字段推导展示状态（数据管道的 regStatus 仅作为无日期字段时的兜底） */
export function deriveStatus(race: Race, now: Date): RegStatus {
  const t = now.getTime();
  if (toDate(race.raceDate) < t) return "finished";
  if (!race.regStart || !race.regEnd) return "pending";
  const s = toDate(race.regStart), e = toDate(race.regEnd);
  if (t < s) return "pending";
  if (t <= e + day) return "open";
  // 报名已截止
  if (race.needLottery && race.lotteryDate && toDate(race.lotteryDate) >= t - 3 * day) return "drawing";
  return "closed";
}

const order: Record<RegStatus, number> = { open: 0, pending: 1, drawing: 2, closed: 3, finished: 4 };

/** open 按报名截止紧迫度升序，其余按比赛日期升序 */
export function sortRaces(races: Race[], now: Date): Race[] {
  return [...races].sort((a, b) => {
    const sa = deriveStatus(a, now), sb = deriveStatus(b, now);
    if (order[sa] !== order[sb]) return order[sa] - order[sb];
    const keyA = sa === "open" && a.regEnd ? toDate(a.regEnd) : toDate(a.raceDate);
    const keyB = sb === "open" && b.regEnd ? toDate(b.regEnd) : toDate(b.raceDate);
    return keyA - keyB;
  });
}

export function computeStats(races: Race[], now: Date) {
  const st = races.map(r => deriveStatus(r, now));
  return {
    open: st.filter(s => s === "open").length,
    drawing: st.filter(s => s === "drawing").length,
    countdown: st.filter(s => s === "closed" || s === "drawing").length,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run
```

Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib && git commit -m "feat: 赛事状态推导/排序/统计逻辑"
```

---

### Task 4: 数据访问层与种子数据

**Files:**
- Create: `src/lib/races.ts`、`data/races.json`

- [ ] **Step 1: 编写数据加载器**

```ts
// src/lib/races.ts
import racesJson from "../../data/races.json";
import type { Race } from "@/types/race";

export function loadRaces(): Race[] {
  return racesJson as Race[];
}
```

- [ ] **Step 2: 创建 data/races.json 初始文件**

```json
[]
```

并在 `tsconfig.json` 的 `compilerOptions` 中确保有 `"resolveJsonModule": true`（Next.js 模板默认已包含）。

- [ ] **Step 3: 采集国内 2026 赛事数据**

用 WebSearch / WebFetch 检索"2026 中国田协 A类 B类 认证赛事名录"及各重点赛事（北马、厦马、广马、深马、重马、汉马、西马、成马等）官网，整理出国内赛事条目（每场含名称/城市/省份/比赛时间/报名时间/认证等级/官网），追加到 `data/races.json`。目标 ≥ 100 场（首期可先覆盖 A 类重点赛事 + 已知 B 类，后续由更新管道与手动扩充补齐至全量）。

数据获取日期写在提交信息中。

- [ ] **Step 4: 提交**

```bash
git add src/lib/races.ts data/races.json && git commit -m "feat: 国内赛事种子数据（采集日期 2026-08-21）"
```

---

### Task 5: 国际赛事种子数据

**Files:**
- Create: `scripts/seed-international.ts`

- [ ] **Step 1: 编写国际种子脚本**

脚本内置六大满贯 + 白金标候选列表（2026 赛季），用 WebSearch 核实日期后写入常量，运行后合并进 `data/races.json`（按 id 去重）：

```ts
// scripts/seed-international.ts
import { readFileSync, writeFileSync } from "fs";
import type { Race } from "../src/types/race";

const INTERNATIONAL: Race[] = [
  // 六大满贯（日期经 WebSearch 核实后填写）
  // { id: "tokyo-marathon", name: "东京马拉松", country: "日本", city: "东京",
  //   raceDate: "2026-03-01", regStatus: "closed", needLottery: true,
  //   events: ["全程马拉松"], category: "major",
  //   officialSite: "https://www.marathon.tokyo", updatedAt: ... },
  // 柏林 / 伦敦 / 波士顿 / 芝加哥 / 纽约 同理
  // 白金标：瓦伦西亚 / 迪拜 / 鹿特丹 / 塞维利亚 / 大阪女子 等
];

const path = "data/races.json";
const races = JSON.parse(readFileSync(path, "utf8")) as Race[];
const ids = new Set(races.map(r => r.id));
for (const r of INTERNATIONAL) if (!ids.has(r.id)) races.push(r);
writeFileSync(path, JSON.stringify(races, null, 2));
console.log(`国际赛事种子完成，共 ${races.length} 场`);
```

- [ ] **Step 2: 运行并验证**

```bash
npx tsx scripts/seed-international.ts
```

Expected: 输出合并后总数；`data/races.json` 中出现国际条目。

- [ ] **Step 3: 提交**

```bash
git add scripts/seed-international.ts data/races.json && git commit -m "feat: 国际大满贯+白金标赛事种子数据"
```

---

### Task 6: 前端页面

**Files:**
- Create: `src/components/StatsBar.tsx`、`FilterBar.tsx`、`RaceCard.tsx`、`Tracker.tsx`
- Modify: `src/app/page.tsx`、`src/app/layout.tsx`

- [ ] **Step 1: StatsBar（统计卡片）**

```tsx
// src/components/StatsBar.tsx
export default function StatsBar({ open, drawing, countdown, updatedAt }: {
  open: number; drawing: number; countdown: number; updatedAt: string;
}) {
  const items = [
    { label: "报名中赛事", value: open, color: "text-emerald-600" },
    { label: "抽签中赛事", value: drawing, color: "text-amber-600" },
    { label: "备赛倒计时", value: countdown, color: "text-blue-600" },
  ];
  return (
    <div className="grid grid-cols-3 gap-4">
      {items.map(i => (
        <div key={i.label} className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <div className={`text-3xl font-bold ${i.color}`}>{i.value}</div>
          <div className="mt-1 text-sm text-slate-500">{i.label}</div>
        </div>
      ))}
      <div className="col-span-3 text-right text-xs text-slate-400">数据更新于 {updatedAt}</div>
    </div>
  );
}
```

- [ ] **Step 2: RaceCard（赛事卡片）**

参照参考站样式：状态徽章（报名中=绿/抽签中=橙/筹备中=紫/已截止=灰/已结束=暗灰）、认证徽章（A类/B类/白金标/六大满贯）、需抽签徽章、官网链接；报名中且 7 天内截止加红色高亮边框。字段：比赛时间、比赛地点、报名时间、参赛规模、竞赛项目、费用、抽签时间。

- [ ] **Step 3: FilterBar（筛选器）**

Tab 切换（🇨🇳 全国 / 🌍 国际）+ 下拉筛选（省份或国家、报名状态、项目类型）+ 关键词搜索 + 快捷筛选（未结束/已结束/全部）。

- [ ] **Step 4: Tracker 总控 + page.tsx**

`Tracker.tsx` 为 `"use client"` 组件，接收 `races: Race[]`，管理筛选状态并渲染 StatsBar/FilterBar/RaceCard 列表。`page.tsx` 为服务端组件：

```tsx
// src/app/page.tsx
import Tracker from "@/components/Tracker";
import { loadRaces } from "@/lib/races";

export default function Home() {
  return <Tracker races={loadRaces()} />;
}
```

`layout.tsx` 修改 metadata 为"马拉松赛事追踪 - 全国+国际"，页面头部标题区展示站点名与副标题。

- [ ] **Step 5: 本地验证**

```bash
npm run dev
```

Expected: 页面展示统计卡片、tab 切换正常、筛选/搜索生效、卡片信息完整。

- [ ] **Step 6: 提交**

```bash
git add src && git commit -m "feat: 前端页面（统计/筛选/赛事卡片/国内外双板块）"
```

---

### Task 7: 千问 API 客户端与每日更新脚本

**Files:**
- Create: `scripts/lib/qwen.ts`、`scripts/update-status.ts`

- [ ] **Step 1: 千问客户端**

```ts
// scripts/lib/qwen.ts
const ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

export async function qwenSearch(prompt: string): Promise<string> {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error("缺少 DASHSCOPE_API_KEY 环境变量");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen-plus",
      enable_search: true,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`千问 API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}
```

- [ ] **Step 2: 更新脚本（含频率策略与 dry-run）**

```ts
// scripts/update-status.ts
import { readFileSync, writeFileSync } from "fs";
import type { Race } from "../src/types/race";
import { qwenSearch } from "./lib/qwen";

const DRY = process.argv.includes("--dry-run");
const day = 86400000;
const now = Date.now();

function dueToUpdate(r: Race): boolean {
  if (r.regStatus === "finished") return false;
  const raceT = new Date(r.raceDate + "T00:00:00+08:00").getTime();
  if (raceT < now) return true;                       // 刚结束，收尾一次
  const within90 = raceT - now <= 90 * day;
  const weekly = (now / day) % 7 < 1;                 // 每周约一天跑远场
  return within90 || r.regStatus === "open" || weekly;
}

const PROMPT = (r: Race) =>
  `联网搜索"${r.name}"（${r.country}${r.city ?? ""}，比赛时间 ${r.raceDate}）的最新报名信息。` +
  `只返回 JSON：{"regStart":"YYYY-MM-DD 或空","regEnd":"YYYY-MM-DD 或空",` +
  `"regStatus":"pending/open/drawing/closed/finished","lotteryDate":"YYYY-MM-DD 或空",` +
  `"raceDate":"核实后的比赛时间","officialSite":"官网URL 或空","note":"摘要"}`;

async function main() {
  const path = "data/races.json";
  const races = JSON.parse(readFileSync(path, "utf8")) as Race[];
  const targets = races.filter(dueToUpdate);
  console.log(`待更新 ${targets.length}/${races.length} 场${DRY ? "（dry-run）" : ""}`);
  let ok = 0, fail = 0;
  for (const r of targets) {
    try {
      const parsed = JSON.parse(await qwenSearch(PROMPT(r)));
      for (const k of ["regStart", "regEnd", "regStatus", "lotteryDate", "raceDate", "officialSite"] as const) {
        if (typeof parsed[k] === "string" && parsed[k]) (r as any)[k] = parsed[k];
      }
      r.updatedAt = new Date().toISOString();
      ok++;
      console.log(`✓ ${r.name}`);
    } catch (e) {
      fail++;
      console.error(`✗ ${r.name}: ${(e as Error).message}`);  // 单场失败保留旧数据
    }
  }
  console.log(`完成：成功 ${ok}，失败 ${fail}`);
  if (!DRY && ok > 0) writeFileSync(path, JSON.stringify(races, null, 2));
  if (ok === 0 && fail > 0) process.exit(1);          // 全部失败则让 Actions 标记失败
}

main();
```

- [ ] **Step 3: 本地 dry-run 验证**

```bash
DASHSCOPE_API_KEY=<key> npm run update:dry
```

Expected: 输出待更新场次与每场结果，`data/races.json` 不被修改。（若暂无 Key，此步推迟到部署配置阶段。）

- [ ] **Step 4: 提交**

```bash
git add scripts && git commit -m "feat: 千问联网查询与每日数据更新脚本"
```

---

### Task 8: 部署配置与文档

**Files:**
- Create: `.github/workflows/update-races.yml`、`vercel.json`、`README.md`

- [ ] **Step 1: GitHub Actions 工作流**

```yaml
# .github/workflows/update-races.yml
name: 每日更新赛事数据
on:
  schedule:
    - cron: "30 23 * * *"   # UTC 23:30 = 北京时间 07:30
  workflow_dispatch:
permissions:
  contents: write
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx tsx scripts/update-status.ts
        env:
          DASHSCOPE_API_KEY: ${{ secrets.DASHSCOPE_API_KEY }}
      - name: 提交数据更新
        run: |
          git config user.name "marathon-bot"
          git config user.email "marathon-bot@users.noreply.github.com"
          git add data/races.json
          git diff --cached --quiet || git commit -m "chore: 更新赛事数据 $(date -u +%F)"
          git push
```

- [ ] **Step 2: vercel.json**

```json
{ "$schema": "https://openapi.vercel.sh/vercel.json", "framework": "nextjs" }
```

- [ ] **Step 3: README 部署指南**

README 包含：项目简介、本地运行（`npm i && npm run dev`）、完整部署步骤：

1. 注册 GitHub → 新建仓库 → push 本项目
2. 阿里云百炼开通服务 → 创建 API Key
3. GitHub 仓库 Settings → Secrets → 添加 `DASHSCOPE_API_KEY`
4. 注册 Vercel（用 GitHub 登录）→ Add Project → 导入仓库 → Deploy
5. 阿里云购买域名 → 解析 CNAME 到 `cname.vercel-dns.com` → Vercel Domains 绑定
6. Actions 页面手动 Run workflow 验证首次更新

- [ ] **Step 4: 构建验证**

```bash
npm run build
```

Expected: `Compiled successfully`，页面静态生成成功。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "chore: 部署配置（Actions 工作流/Vercel/README 部署指南）"
```

---

### Task 9: 部署实施（与用户协同）

- [ ] **Step 1: 本地最终验收**

`npm run dev` 全站走查：统计数字正确、国内/国际 tab、筛选搜索、卡片链接可点。

- [ ] **Step 2: 引导用户注册并推送代码**

用户注册 GitHub 后创建空仓库，执行：

```bash
git remote add origin git@github.com:<用户名>/<仓库名>.git
git push -u origin main
```

- [ ] **Step 3: 配置 Secret、导入 Vercel、绑定域名**

按 README 步骤 3-5 逐步指引用户操作，每步确认结果。

- [ ] **Step 4: 验证线上效果**

打开 Vercel 分配的 `*.vercel.app` 域名确认页面正常；手动触发一次 workflow 确认数据更新链路畅通。
