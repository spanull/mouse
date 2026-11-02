import type { ImgHTMLAttributes } from "react";

type IconProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> & { size?: number };

/** 为接口生成的独立图标创建语义一致的 React 包装；默认装饰图不重复读出，父按钮负责可访问名称。 */
function icon(name: string) {
  /** 仅加载已登记的本地图像，不绘制矢量或 CSS 图标；size 决定布局尺寸，不改变原图。 */
  return function ImageIcon({ size = 24, alt = "", className = "", ...props }: IconProps) {
    return <img {...props} className={`game-icon ${className}`} src={`/assets/ui/${name}.png`} width={size} height={size} alt={alt} aria-hidden={alt ? undefined : true} />;
  };
}

export const ArrowLeft = icon("back");
export const ArrowRight = icon("next");
export const Settings = icon("settings");
export const X = icon("close");
export const Heart = icon("heart");
export const BookOpen = icon("book");
export const ChefHat = icon("chef");
export const Wine = icon("drink");
export const Coins = icon("coin");
export const Home = icon("home");
export const RefreshCw = icon("retry");
