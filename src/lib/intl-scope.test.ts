import { describe, expect, it } from "vitest";
import { inIntlScope } from "./intl-scope";

describe("inIntlScope", () => {
  it("国内赛事一律保留", () => {
    expect(inIntlScope({ country: "中国", category: "unknown" })).toBe(true);
    expect(inIntlScope({ country: "中国", category: "B" })).toBe(true);
  });

  it("日本赛事一律保留，不看认证级别", () => {
    expect(inIntlScope({ country: "日本", category: "B" })).toBe(true);
    expect(inIntlScope({ country: "日本", category: "unknown" })).toBe(true);
  });

  it("大满贯、白金标、金标赛事保留", () => {
    for (const category of ["major", "platinum", "gold"] as const) {
      expect(inIntlScope({ country: "美国", category })).toBe(true);
    }
  });

  it("其他国际赛事不收录", () => {
    for (const category of ["A", "B", "unknown"] as const) {
      expect(inIntlScope({ country: "泰国", category })).toBe(false);
    }
  });
});