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
