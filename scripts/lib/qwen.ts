// scripts/lib/qwen.ts —— 阿里云百炼（DashScope）千问 API 客户端（OpenAI 兼容端点 + 联网搜索）
const ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

export async function qwenSearch(prompt: string): Promise<string> {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error("缺少 DASHSCOPE_API_KEY 环境变量");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen-plus",
      enable_search: true,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`千问 API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}
