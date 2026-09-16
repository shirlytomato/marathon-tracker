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

export async function qwenSearch(prompt: string): Promise<string> {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error("缺少 DASHSCOPE_API_KEY 环境变量");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      enable_search: true,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`千问 API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}
