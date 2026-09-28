// scripts/lib/schema.test.ts —— 字段契约校验的单元测试 + 真实数据冒烟检查
import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { loadSchema, schemaIssues, type RaceSchema } from "./schema";

const SCHEMA: RaceSchema = {
  schemaVersion: 1,
  required: ["id", "name", "country", "raceDate", "regStatus", "events", "category", "updatedAt"],
  optional: ["shortName", "province", "city", "location", "regStart", "regEnd", "lotteryDate", "needLottery", "scale", "fee", "officialSite"],
  types: { regStatus: "enum:pending,open,drawing,closed,finished", events: "string[]", category: "enum:A,B,platinum,gold,major", needLottery: "boolean" },
};

const validRace = {
  id: "demo", name: "-demo", country: "中国", raceDate: "2026-12-06",
  regStatus: "open", events: ["全程马拉松"], category: "B", updatedAt: "2026-09-28T00:00:00.000Z",
};

describe("schemaIssues", () => {
  it("合法记录通过", () => {
    expect(schemaIssues([validRace], SCHEMA)).toEqual([]);
  });

  it("契约外字段被拦截（代码写入无人消费的脏字段）", () => {
    const bad = { ...validRace, sponsor: "某品牌" };
    expect(schemaIssues([bad], SCHEMA).join()).toContain("契约外字段 sponsor");
  });

  it("必填字段缺失被拦截（版本不兼容不能静默放行）", () => {
    const { category, ...missing } = validRace;
    expect(schemaIssues([missing], SCHEMA).join()).toContain("缺少必填字段 category");
  });

  it("类型与枚举不符被拦截", () => {
    expect(schemaIssues([{ ...validRace, regStatus: "opened" }], SCHEMA).join()).toContain("regStatus 类型不符");
    expect(schemaIssues([{ ...validRace, events: "全程马拉松" }], SCHEMA).join()).toContain("events 类型不符");
    expect(schemaIssues([{ ...validRace, needLottery: "true" }], SCHEMA).join()).toContain("needLottery 类型不符");
  });
});

describe("真实数据与契约一致性（冒烟检查）", () => {
  it("data/schema.json 可加载且 races.json 全量通过校验", () => {
    const schema = loadSchema("data/schema.json");
    const races = JSON.parse(readFileSync("data/races.json", "utf8")) as Record<string, unknown>[];
    expect(races.length).toBeGreaterThan(0);
    expect(schemaIssues(races, schema)).toEqual([]);
  });
});
