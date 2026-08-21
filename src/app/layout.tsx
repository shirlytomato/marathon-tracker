import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "马拉松赛事追踪 - 全国+国际马拉松报名信息",
  description:
    "覆盖中国田协认证赛事（A类+B类）与世界马拉松大满贯、白金标赛事，集中查看比赛时间、报名窗口、竞赛项目和官方报名入口，每日自动更新。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
