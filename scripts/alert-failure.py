#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/alert-failure.py —— GitHub Actions 失败告警（零额外密钥，仅用内置 GITHUB_TOKEN）

为什么需要它：邮件简报步骤挂在"提交数据"之后，一旦前置步骤失败整个 job 立即中止，
邮件永远发不出去 —— 2026-09-10~09-15 流水线连续失败 6 天却毫无动静，就是这个原因。
本脚本以 if: failure() 触发，无论前面哪一步挂掉都会执行。

行为：仓库内维护一条固定标题的告警 Issue。
  - 首次失败 → 新建 Issue
  - 已有未关闭的告警 Issue → 追加一条评论（避免每次失败都新开一个，刷屏）
"""
import json
import os
import urllib.request

TITLE = "[流水线告警] 赛事数据自动更新失败"
API = "https://api.github.com"


def api(method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        API + path,
        data=data,
        headers={
            "Authorization": f"Bearer {os.environ['GH_TOKEN']}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "marathon-tracker-alert",
        },
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main() -> None:
    repo = os.environ["GITHUB_REPOSITORY"]
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    wf = os.environ.get("GITHUB_WORKFLOW", "未知任务")
    run_url = f"{os.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/{repo}/actions/runs/{run_id}"

    body = (
        f"自动任务 **{wf}** 执行失败，线上数据已停止更新。\n\n"
        f"失败运行：{run_url}\n\n"
        f"排查入口：打开上面链接，看第一个变红的步骤。\n"
        f"若是「联网查询赛事进展」或「联网搜索新官宣赛事」变红，按日志里的错误码分两种病因：\n"
        f"- `千问 API 401: ...invalid_api_key...` → 百炼密钥失效或与端点不配对，"
        f"去百炼控制台换一把通用端点的 sk- 密钥，更新仓库 Secret `DASHSCOPE_API_KEY` 再手动触发验证。\n"
        f"- `fetch failed（cause: ETIMEDOUT）` → 网络层打不通，换密钥没用。"
        f"最常见是有人把端点改成了境外 runner 连不通的专属端点（见 qwen.ts 顶部实测记录）。\n\n"
        f"注意：端点与密钥必须成对匹配，且 Actions 的 runner 在海外，只能用全球可达的通用端点。"
    )

    existing = [
        i for i in api("GET", f"/repos/{repo}/issues?state=open&per_page=100")
        if i.get("title") == TITLE and "pull_request" not in i
    ]
    if existing:
        api("POST", f"/repos/{repo}/issues/{existing[0]['number']}/comments",
            {"body": f"再次失败：{wf} → {run_url}"})
        print(f"已在既有告警 Issue #{existing[0]['number']} 追加评论")
    else:
        created = api("POST", f"/repos/{repo}/issues", {"title": TITLE, "body": body})
        print(f"已新建告警 Issue #{created['number']}: {created['html_url']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # 告警自身失败不应让 job 结论变得更糟
        print(f"告警发送失败（不影响主流程判定）: {type(e).__name__}: {e}")
