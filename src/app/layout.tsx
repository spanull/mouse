import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DemoProvider } from "@/components/demo-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "鼠鼠之家 · 餐厅与树洞酒吧",
  description: "做一只快乐的鼠。去餐厅品尝故事，到树洞酒吧放下心事。匿名情绪互动 H5 演示。",
  robots: { index: false, follow: false },
};

/** 提供全站中文语义和演示状态；数据仅在客户端初始化，不创建真实匿名身份。 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body><DemoProvider>{children}</DemoProvider></body></html>;
}
