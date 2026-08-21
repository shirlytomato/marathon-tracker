// scripts/seed-international.ts
// 国际赛事种子数据：世界马拉松大满贯（2026 为七站，含悉尼）+ 世界田联白金标
// 日期经 WebSearch 核实（2026-08-21），报名细节由每日更新管道（千问联网）持续修正
import { readFileSync, writeFileSync } from "fs";
import type { Race } from "../src/types/race";

const UPDATED = "2026-08-21T16:00:00+08:00";

const INTERNATIONAL: Race[] = [
  // ===== 世界马拉松大满贯（2026 赛季）=====
  {
    id: "tokyo-marathon", name: "东京马拉松", country: "日本", city: "东京",
    raceDate: "2026-03-01", location: "东京都厅（起点）", regStatus: "finished",
    needLottery: true, events: ["全程马拉松"], category: "major",
    officialSite: "https://www.marathon.tokyo", updatedAt: UPDATED,
  },
  {
    id: "boston-marathon", name: "波士顿马拉松", country: "美国", city: "波士顿",
    raceDate: "2026-04-20", location: "霍普金顿（起点）", regStatus: "finished",
    needLottery: false, fee: "需达到 BQ 资格成绩", events: ["全程马拉松"], category: "major",
    officialSite: "https://www.baa.org", updatedAt: UPDATED,
  },
  {
    id: "london-marathon", name: "伦敦马拉松", country: "英国", city: "伦敦",
    raceDate: "2026-04-26", location: "格林威治公园（起点）", regStatus: "finished",
    needLottery: true, events: ["全程马拉松"], category: "major",
    officialSite: "https://www.tcslondonmarathon.com", updatedAt: UPDATED,
  },
  {
    id: "sydney-marathon", name: "悉尼马拉松", country: "澳大利亚", city: "悉尼",
    raceDate: "2026-08-30", location: "悉尼歌剧院（终点）", regStatus: "closed",
    events: ["全程马拉松"], category: "major",
    officialSite: "https://www.syneymarathon.com", updatedAt: UPDATED,
  },
  {
    id: "berlin-marathon", name: "柏林马拉松", country: "德国", city: "柏林",
    raceDate: "2026-09-27", location: "勃兰登堡门", regStatus: "closed",
    regStart: "2025-10-16", regEnd: "2025-11-13", needLottery: true,
    events: ["全程马拉松"], category: "major",
    officialSite: "https://www.bmw-berlin-marathon.com", updatedAt: UPDATED,
  },
  {
    id: "chicago-marathon", name: "芝加哥马拉松", country: "美国", city: "芝加哥",
    raceDate: "2026-10-11", location: "格兰特公园", regStatus: "closed",
    needLottery: true, events: ["全程马拉松"], category: "major",
    officialSite: "https://www.chicagomarathon.com", updatedAt: UPDATED,
  },
  {
    id: "nyc-marathon", name: "纽约马拉松", country: "美国", city: "纽约",
    raceDate: "2026-11-01", location: "中央公园（终点）", regStatus: "closed",
    needLottery: true, events: ["全程马拉松"], category: "major",
    officialSite: "https://www.nyrr.org/tcsnycmarathon", updatedAt: UPDATED,
  },
  // 2027 赛季已开放报名的大满贯
  {
    id: "tokyo-marathon-2027", name: "东京马拉松（2027·20周年）", country: "日本", city: "东京",
    raceDate: "2027-03-07", location: "东京都厅（起点）",
    regStart: "2026-08-05", regEnd: "2026-09-30", regStatus: "open",
    needLottery: true, events: ["全程马拉松"], category: "major",
    officialSite: "https://www.marathon.tokyo", updatedAt: UPDATED,
  },
  {
    id: "london-marathon-2027", name: "伦敦马拉松（2027）", country: "英国", city: "伦敦",
    raceDate: "2027-04-25", regStart: "2026-04-27", regEnd: "2026-12-31", regStatus: "open",
    needLottery: true, events: ["全程马拉松"], category: "major",
    officialSite: "https://www.tcslondonmarathon.com", updatedAt: UPDATED,
  },
  // ===== 世界田联白金标（国际代表赛事）=====
  {
    id: "valencia-marathon", name: "瓦伦西亚马拉松", country: "西班牙", city: "瓦伦西亚",
    raceDate: "2026-12-06", location: "艺术科学城（终点）", regStatus: "pending",
    events: ["全程马拉松"], category: "platinum",
    officialSite: "https://valenciaciudaddelrunning.com", updatedAt: UPDATED,
  },
  {
    id: "dubai-marathon", name: "迪拜马拉松", country: "阿联酋", city: "迪拜",
    raceDate: "2027-01-24", regStatus: "pending",
    events: ["全程马拉松", "半程马拉松"], category: "platinum",
    officialSite: "https://www.dubaimarathon.org", updatedAt: UPDATED,
  },
  {
    id: "rotterdam-marathon", name: "鹿特丹马拉松", country: "荷兰", city: "鹿特丹",
    raceDate: "2027-04-11", regStatus: "pending",
    events: ["全程马拉松", "半程马拉松"], category: "platinum",
    officialSite: "https://www.nnmarathonrotterdam.org", updatedAt: UPDATED,
  },
  {
    id: "sevilla-marathon", name: "塞维利亚马拉松", country: "西班牙", city: "塞维利亚",
    raceDate: "2027-02-14", regStatus: "pending",
    events: ["全程马拉松"], category: "platinum",
    officialSite: "https://www.zurichmaratonsevilla.es", updatedAt: UPDATED,
  },
  {
    id: "osaka-womens-marathon", name: "大阪女子马拉松", country: "日本", city: "大阪",
    raceDate: "2027-01-31", regStatus: "pending",
    events: ["全程马拉松"], category: "platinum",
    officialSite: "https://www.osaka-marathon.com", updatedAt: UPDATED,
  },
];

const path = "data/races.json";
const races = JSON.parse(readFileSync(path, "utf8")) as Race[];
const ids = new Set(races.map(r => r.id));
let added = 0;
for (const r of INTERNATIONAL) {
  if (!ids.has(r.id)) { races.push(r); added++; }
}
writeFileSync(path, JSON.stringify(races, null, 2));
console.log(`国际赛事种子完成：新增 ${added} 场，共 ${races.length} 场`);
