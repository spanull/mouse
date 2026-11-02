import type { NextConfig } from "next";

// 隐藏开发角标，让本地预览保持完整游戏画面；编译错误仍由开发服务输出。
const config: NextConfig = { devIndicators: false, distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next" };

export default config;
