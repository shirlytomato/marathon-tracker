import type { Race, RaceCategory } from "@/types/race";

const KEPT_CATEGORIES: ReadonlySet<RaceCategory> = new Set(["major", "platinum", "gold"]);

/**
 * 收录范围（2026-11-14 定）：国际赛事只留大满贯、白金标、金标，以及日本赛事。
 * 国内赛事不受限。巡检拿不到认证级别（一律 unknown），实际效果是不再自动收录
 * 非中国、非日本的赛事；大满贯/金标/白金标需人工核验后手动入库。
 */
export function inIntlScope({ country, category }: Pick<Race, "country" | "category">): boolean {
  if (country === "中国" || country === "日本") return true;
  return KEPT_CATEGORIES.has(category);
}