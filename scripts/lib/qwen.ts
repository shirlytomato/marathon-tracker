// scripts/lib/qwen.ts —— 阿里云百炼（DashScope）千问 API 客户端（OpenAI 兼容端点 + 联网搜索）
// 端点与密钥必须成对匹配：2026-10 起改用百炼通用端点 + 通用密钥，
// 原先的 Token Plan 专属端点只认套餐发的密钥，拿通用密钥去调会全量 401 invalid_api_key
// （2026-09-10~09-15 与 2026-09-30~10-04 两次停摆都源于端点/密钥/套餐授权不匹配）。
const ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

// 模型选型以“够快 + 联网搜索准确”为准，不是越强越好：
//   qwen3.8-flash 实测 41 秒/场，regStart/regEnd/raceDate 三项全对 ← 当前选用
//   qwen3.8-max   实测 201 秒/场（推理模型），全量跑会超 GitHub Actions 的 6 小时上限，禁用
//   qwen3.7-plus  通用端点上可用（实测 23 秒/场），但单场更贵，暂无必要
// 免费额度按模型各自独立：某个模型报 403 AllocationQuota.FreeTierOnly 只说明“那一个”用完了，
// 换一个模型即可（实测同一次探测里 qwen-plus 已耗尽，qwen3.8-flash 仍可用），不必改整体配置。
const MODEL = "qwen3.8-flash";

// 联网搜索单次实测 4~60 秒（取决于检索深度），超时给到 120 秒留足余量
const TIMEOUT_MS = 120000;

// 配置类错误（密钥失效、模型名不存在）：重试没有意义，立刻抛出让任务变红
class FatalApiError extends Error {}

// token 用量累计：联网搜索会把检索结果塞进上下文，输入 token 是成本大头（实测占 75% 以上），
// 不计量就看不见——2026-09 之前跑了两个月都不知道每场花多少
export const usage = { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };

/** cause 里的真实原因必须带出来：只打 e.message 的话日志里只有"fetch failed"，无法定位 */
function causeSuffix(e: Error & { cause?: { code?: string; errno?: number; message?: string } }): string {
  const c = e.cause;
  if (!c) return "";
  const parts = [c.code, c.message].filter(Boolean);
  if (c.errno !== undefined) parts.push(`errno=${c.errno}`);
  return parts.length ? `（cause: ${parts.join(" / ")}）` : "";
}

export async function qwenSearch(prompt: string): Promise<string> {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error("缺少 DASHSCOPE_API_KEY 环境变量");
  const body = JSON.stringify({
    model: MODEL,
    enable_search: true,
    // forced_search 必须显式打开：实测通用端点上只给 enable_search 时，模型会自行判定
    // “这一题不用搜”，输入停在 90 token（真搜了是 3200 上下），然后拿旧知识把赛期
    // 答成“按往年推算”——不报错不告警，是最坏的一种静默失败。
    search_options: { forced_search: true, enable_source: true },
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  let lastError = "";
  // 网络层瞬时故障重试一次：实测 2026-09-16 出现过 fetch failed，紧接着同样两次调用就正常了，
  // 不重试的话一次抖动就会让整场赛事漏更新（巡检里更会让整个任务变红）
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const text = (await res.text()).slice(0, 200);
        if (res.status !== 429 && res.status < 500) throw new FatalApiError(`千问 API ${res.status}: ${text}`);
        lastError = `千问 API ${res.status}: ${text}`; // 429/5xx 属临时故障，可重试
      } else {
        const data = await res.json();
        const u = (data.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        // 拿输入 token 量做兜底判定“搜索到底有没有发生”：强制搜索生效时检索内容会灌进上下文
        // （实测 3200±），没搜索时只剩提示词本身（实测 90）。低于阈值当失败，
        // 走重试→报错→不写库，绝不让“没联网的模型猜测”混进 races.json。
        if ((u.prompt_tokens ?? 0) < 800)
          throw new Error(`千问 API 疑似未执行联网搜索（输入仅 ${u.prompt_tokens} token），拒绝采信`);
        usage.calls++;
        usage.promptTokens += u.prompt_tokens ?? 0;
        usage.completionTokens += u.completion_tokens ?? 0;
        usage.totalTokens += u.total_tokens ?? 0;
        return data.choices[0].message.content as string;
      }
    } catch (e) {
      if (e instanceof FatalApiError) throw e;
      const err = e as Error & { cause?: { code?: string; errno?: number; message?: string } };
      lastError = `千问 API 网络失败: ${err.message}${causeSuffix(err)}`;
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 1) console.log(`  ⚠ ${lastError}，重试一次`);
  }
  throw new Error(lastError || "千问 API 未知错误");
}

/** 打印本次运行的 token 账单：每次跑完都打，成本可见才谈得上控制 */
export function logUsage(label: string): void {
  const avg = usage.calls ? Math.round(usage.totalTokens / usage.calls) : 0;
  const avgIn = usage.calls ? Math.round(usage.promptTokens / usage.calls) : 0;
  console.log(
    `【token 账单】${label}：${usage.calls} 次调用｜输入 ${usage.promptTokens}（均值 ${avgIn}）｜` +
    `输出 ${usage.completionTokens}｜合计 ${usage.totalTokens}（单次均值 ${avg}）｜模型 ${MODEL}`,
  );
}
