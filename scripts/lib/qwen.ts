// scripts/lib/qwen.ts —— 阿里云百炼（DashScope）千问 API 客户端（OpenAI 兼容端点 + 联网搜索）
// 端点与密钥必须成对匹配：Token Plan 端点只能用 Token Plan 资源包的密钥，
// 混用会全量返回 401 invalid_api_key，导致每日更新任务静默失败（见 2026-09-10~09-15 事故）。
const ENDPOINT = "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions";

export async function qwenSearch(prompt: string): Promise<string> {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error("缺少 DASHSCOPE_API_KEY 环境变量");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen3.8-max",
      enable_search: true,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`千问 API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}
