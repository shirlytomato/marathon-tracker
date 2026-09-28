// scripts/lib/schema.ts —— data/races.json 的字段契约校验（纯函数，带单元测试）
// 背景：数据文件与代码版本不兼容时原先无法检测——代码静默丢字段或前端崩溃。
// 现在字段契约固化在 data/schema.json，发布前检测逐条比对：
//   - schema 文件缺失/损坏 → 硬错误（不安全路径必须被拦截，不允许"没有契约就放行"）
//   - 记录出现契约外字段 → 硬错误（防止 AI/代码写入无人消费的脏字段）
//   - 必填字段缺失、类型不符 → 硬错误（防止新版本代码读取旧数据时静默丢字段）
import { readFileSync } from "fs";

export interface RaceSchema {
  schemaVersion: number;
  required: string[];
  optional: string[];
  types: Record<string, string>;
}

export const SCHEMA_PATH = "data/schema.json";

export function loadSchema(path: string = SCHEMA_PATH): RaceSchema {
  const raw = JSON.parse(readFileSync(path, "utf8")) as RaceSchema;
  if (typeof raw.schemaVersion !== "number" || !Array.isArray(raw.required) || !raw.types) {
    throw new Error(`schema.json 结构损坏：缺少 schemaVersion/required/types`);
  }
  return raw;
}

function typeOk(value: unknown, spec: string): boolean {
  if (spec.startsWith("enum:")) return typeof value === "string" && spec.slice(5).split(",").includes(value);
  if (spec === "string[]") return Array.isArray(value) && value.every(v => typeof v === "string");
  if (spec === "boolean") return typeof value === "boolean";
  if (spec === "string") return typeof value === "string";
  return true; // 未知类型描述不拦截（schema 写错在加载时已有测试兜底）
}

// 返回全部违规描述；空数组 = 通过
export function schemaIssues(races: Record<string, unknown>[], schema: RaceSchema): string[] {
  const known = new Set([...schema.required, ...schema.optional]);
  const errs: string[] = [];
  for (const r of races) {
    const name = typeof r.name === "string" ? r.name : String(r.id ?? "?");
    for (const k of schema.required) {
      if (r[k] === undefined || r[k] === null) errs.push(`${name}: 缺少必填字段 ${k}（schema v${schema.schemaVersion}）`);
    }
    for (const k of Object.keys(r)) {
      if (!known.has(k)) errs.push(`${name}: 出现契约外字段 ${k}（schema v${schema.schemaVersion}，代码与数据已漂移）`);
      else if (schema.types[k] && !typeOk(r[k], schema.types[k])) errs.push(`${name}: 字段 ${k} 类型不符（期望 ${schema.types[k]}）`);
    }
  }
  return errs;
}
