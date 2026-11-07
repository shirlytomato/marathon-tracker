import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
const repo = resolve(".");
const source = "https://example.org/notice";
const race = { id: "demo", name: "fixture", country: "中国", raceDate: "2099-11-01", regStatus: "open", regStart: "2099-10-01", regEnd: "2099-10-10", events: ["全程马拉松"], category: "B", updatedAt: "2026-10-01T00:00:00Z" };
function fixture(run: (root: string, invoke: (script: string, args?: string[]) => ReturnType<typeof spawnSync>) => void) {
  const root = mkdtempSync(join(tmpdir(), "race-evidence-"));
  try {
    mkdirSync(join(root, "data"));
    for (const [name, data] of Object.entries({ races: [race], "pending-reviews": [], "review-history": [], "update-health": { lastSuccessfulRun: null, lastRun: null } })) writeFileSync(join(root, `data/${name}.json`), JSON.stringify(data));
    copyFileSync(join(repo, "data/schema.json"), join(root, "data/schema.json"));
    const mock = join(root, "mock.mjs");
    writeFileSync(mock, `const OriginalDate=Date; globalThis.Date=class extends OriginalDate { constructor(...args) { super(...(args.length ? args : ["2099-10-06T00:00:00Z"])); } static now() { return OriginalDate.parse("2099-10-06T00:00:00Z"); } }; globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({usage:{prompt_tokens:1000},choices:[{message:{content:JSON.stringify({raceDate:"2099-11-08",regStart:"2099-10-05",regEnd:"2099-10-20",regStatus:"closed",note:"模型称官方改期",sourceUrls:["${source}"],registrationChannels:[{kind:"general",verifiedAt:"fake"}]})}}]})});`);
    const invoke = (script: string, args: string[] = []) => spawnSync(join(repo, "node_modules/.bin/tsx"), ["--import", mock, join(repo, "scripts", script), ...args], { cwd: root, env: { ...process.env, DASHSCOPE_API_KEY: "fixture" }, encoding: "utf8", timeout: 10000 });
    run(root, invoke);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const read = (root: string, name: string) => JSON.parse(readFileSync(join(root, `data/${name}.json`), "utf8"));
it("改期只入队，日期/窗口不改，重复采集不重复候选，模型不能写核验通道", () => fixture((root, invoke) => {
  for (let n = 0; n < 2; n++) {
    const run = invoke("update-status.ts"); expect(run.status, String(run.stderr)).toBe(0); expect(String(run.stdout)).toContain("待更新 1/1 场");
  }
  const [updated] = read(root, "races");
  expect([updated.raceDate, updated.regStart, updated.regEnd]).toEqual([race.raceDate, race.regStart, race.regEnd]);
  expect(updated.registrationChannels).toBeUndefined();
  expect(updated.sources[0].verifiedAt).toBeUndefined();
  expect(read(root, "pending-reviews")).toHaveLength(1);
}));
it("采集 dry-run 不写队列；审批预览不写库，apply 才写入证据和历史", () => fixture((root, invoke) => {
  expect(invoke("update-status.ts", ["--dry-run"]).status).toBe(0);
  expect(read(root, "races")).toEqual([race]); expect(read(root, "pending-reviews")).toEqual([]);
  expect(invoke("update-status.ts").status).toBe(0);
  const [proposal] = read(root, "pending-reviews");
  const args = [`--id=${proposal.id}`, `--source=${source}`];
  expect(invoke("review-date.ts", args).status).toBe(0);
  expect(read(root, "races")[0].raceDate).toBe(race.raceDate);
  expect(read(root, "review-history")).toEqual([]);
  const applied = invoke("review-date.ts", [...args, "--apply"]);
  expect(applied.status, String(applied.stderr)).toBe(0);
  expect(read(root, "races")[0].raceDate).toBe("2099-11-08");
  expect(read(root, "races")[0].sources.some((item: {verifiedAt?:string}) => item.verifiedAt)).toBe(true);
  expect(read(root, "pending-reviews")).toEqual([]); expect(read(root, "review-history")).toHaveLength(1);
  expect(invoke("review-date.ts", [...args, "--apply"]).status).not.toBe(0);
}));
it("已驳回的候选不再重复入队，日志改口为已人工定案", () => fixture((root, invoke) => {
  writeFileSync(join(root, "data/review-history.json"), JSON.stringify([{ id: "demo:2099-11-01:2099-11-08", raceId: "demo", from: "2099-11-01", to: "2099-11-08", proposedAt: "2099-10-01T00:00:00Z", sourceUrls: [], note: "旧候选", decision: "rejected", reviewedAt: "2099-10-02T00:00:00Z", decisionNote: "驳回：原值正确" }]));
  const run = invoke("update-status.ts");
  expect(run.status, String(run.stderr)).toBe(0);
  expect(String(run.stdout)).toContain("已人工定案，不再入队");
  expect(read(root, "pending-reviews")).toEqual([]);
  expect(read(root, "races")[0].raceDate).toBe(race.raceDate);
}));
it("旧值已变化时审批拒绝写入任何文件", () => fixture((root, invoke) => {
  expect(invoke("update-status.ts").status).toBe(0);
  const [proposal] = read(root, "pending-reviews");
  const changed = [{ ...race, raceDate: "2099-11-03" }];
  writeFileSync(join(root, "data/races.json"), JSON.stringify(changed));
  expect(invoke("review-date.ts", [`--id=${proposal.id}`, `--source=${source}`, "--apply"]).status).not.toBe(0);
  expect(read(root, "races")).toEqual(changed); expect(read(root, "review-history")).toEqual([]);
}));
