// scripts/lib/qwen.ts —— 阿里云百炼（DashScope）千问 API 客户端（OpenAI 兼容端点 + 联网搜索）
// 端点与密钥必须成对匹配：Token Plan 端点只能用 Token Plan 资源包的密钥，
// 混用会全量返回 401 invalid_api_key，导致每日更新任务静默失败（见 2026-09-10~09-15 事故）。
const ENDPOINT = "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions";

// 模型选型以“够快 + 联网搜索准确”为准，不是越强越好：
//   qwen3.7-plus 实测 23 秒/场，regStart/regEnd/raceDate 三项全对 ← 当前选用
//   qwen3.8-flash 实测 41 秒/场，同样全对
//   qwen3.8-max   实测 201 秒/场（推理模型），全量跑会超 GitHub Actions 的 6 小时上限，禁用
// 注意：qwen-plus / qwen-flash 在 Token Plan 端点上不存在（model_not_found），不要回退到这两个名字。
const MODEL = "qwen3.7-plus";

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
