export type RegStatus = "pending" | "open" | "drawing" | "closed" | "finished";
/** 前端展示状态：比数据管道多一个"今天比赛"，比赛日当天不算已结束 */
export type DisplayStatus = RegStatus | "today";
export type RaceCategory = "A" | "B" | "platinum" | "gold" | "major" | "unknown";

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
  sources?: RaceSource[];
  registrationChannels?: RegistrationChannel[];
  updatedAt: string;       // ISO 时间戳
}

export interface RaceSource {
  url: string;
  observedAt: string;
  scope: "general" | "raceDate" | "registration" | "category";
  verifiedAt?: string; // 仅人工核验后填写；缺失时只是模型提供的线索
}

/** 报名通道入口形式：中国大量赛事只在公众号/小程序/第三方平台报名，没有独立官网网址 */
export type EntranceType = "website" | "wechat_official" | "wechat_miniprogram" | "app" | "platform";

export interface RegistrationChannel {
  name: string;
  kind: "general" | "charity" | "tour";
  url?: string;            // 直接报名入口网址；与 entranceHint 二选一，公众号/小程序报名可无网址
  entranceType?: EntranceType; // 入口形式，无 url 时用于告知跑者去哪儿报名
  entranceHint?: string;   // 报名指引，如"微信搜索'肇庆马拉松'公众号→菜单栏报名"；无 url 时必填
  sourceUrl: string;
  verifiedAt: string; // 通道必须人工核验后入库，不由 AI 直接写入
  status: RegStatus;
  regStart?: string;
  regEnd?: string;
  requirements?: string;
}
