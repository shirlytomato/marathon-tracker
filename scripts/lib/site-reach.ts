// scripts/lib/site-reach.ts —— 官网 HTTP 实测的唯一实现
// 背景：siteReachable 曾在 discover-races / update-status / verify-data 三处各写一份，
// 可达判定口径不一致（同一 URL 可能得出不同结论），改一处漏两处。现统一收敛到这里。
//
// 统一判定口径：2xx（res.ok）、未跟随的 3xx、429、503 都算「站点在线、非死链」——
// 3xx 由 fetch redirect:"follow" 自动跟随，仍收到 3xx 说明目标站有跳转逻辑；
// 429/503 是限流/维护（如大满贯官网 waiting room），不是编造域名的特征，不应判死。
// 调用方只差重试预算（attempts/timeoutMs），不再有语义分歧。

interface ReachOptions {
  attempts?: number; // 重试次数（含首次）
  timeoutMs?: number; // 单次请求超时
}

export async function siteReachable(url: string, opts: ReachOptions = {}): Promise<boolean> {
  const attempts = opts.attempts ?? 2;
  const timeoutMs = opts.timeoutMs ?? 15000;
  for (let i = 0; i < attempts; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
      });
      clearTimeout(timer);
      if (res.ok || (res.status >= 300 && res.status < 400) || res.status === 429 || res.status === 503) return true;
    } catch { /* 重试或判为不可达 */ }
  }
  return false;
}
