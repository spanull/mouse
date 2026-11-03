"use client";

import { useEffect, useRef } from "react";
import { useDemo } from "@/components/demo-provider";

type AmbientPose = { file: string; frameCount: number; durations: number[] };

/** 仅播放接口生成的环境序列帧；各物件独立计时，背景本身不平移、不缩放，不绘制替代美术。 */
export function AmbientLife({ scene }: { scene: "home" | "restaurant" }) {
  const ref = useRef<HTMLDivElement>(null);
  const { reducedMotion } = useDemo();
  useEffect(() => {
    let cancelled = false;
    const animations: Animation[] = [];
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    /** 隐藏页面时冻结环境，减少动态效果时回到静态首帧；恢复后继续各自节奏。 */
    function sync() {
      for (const animation of animations) {
        if (reducedMotion || media.matches) { animation.pause(); animation.currentTime = 0; }
        else if (document.hidden) animation.pause();
        else animation.play();
      }
    }
    /** 使用 Web Animations 的离散关键帧播放实际姿势，停留时间来自资源清单，避免手写逐帧定时器。 */
    async function initialize() {
      try {
        const response = await fetch("/assets/natural/manifest.json");
        if (!response.ok) return;
        const manifest = await response.json() as { actors: Record<string, { poses: { idle: AmbientPose }; visit?: { initialTime: number } }> };
        if (cancelled) return;
        for (const element of ref.current?.querySelectorAll<HTMLElement>("[data-ambient]") ?? []) {
          const key = element.dataset.ambient!;
          const spec = manifest.actors[key]?.poses.idle;
          if (!spec) continue;
          // 先解码整张序列图再显示首姿，避免图片加载途中先闪出错误姿势。
          const picture = new Image();
          picture.src = spec.file;
          await picture.decode();
          if (cancelled) return;
          element.style.backgroundImage = `url('${spec.file}')`;
          element.style.backgroundSize = `${spec.frameCount * 100}% 100%`;
          // 每轮在自然首姿停留，叶片等风、灯火与蒸汽短歇；只调整播放节奏，不复制图片凑帧。
          const rest = key === "leaves" ? 1800 : key === "lantern" ? 500 : key === "steam" ? 900 : 0;
          const durations = spec.durations.map((time, i) => time + (i === 0 ? rest : 0));
          const duration = durations.reduce((sum, value) => sum + value, 0);
          let elapsed = 0;
          const frames: Keyframe[] = durations.map((time, i) => {
            const frame = { backgroundPosition: `${i / (spec.frameCount - 1) * 100}% 0`, offset: elapsed / duration, easing: "steps(1, end)" };
            elapsed += time;
            return frame;
          });
          frames.push({ backgroundPosition: "100% 0", offset: 1 });
          const animation = element.animate(frames, { duration, iterations: Infinity });
          animation.currentTime = key === "squirrel" ? manifest.actors[key].visit?.initialTime ?? 0 : Math.random() * duration;
          animations.push(animation);
        }
        sync();
      } catch { /* 环境装饰失败不阻断场景入口，主体功能仍保持可用。 */ }
    }
    void initialize();
    document.addEventListener("visibilitychange", sync);
    media.addEventListener("change", sync);
    return () => { cancelled = true; animations.forEach(animation => animation.cancel()); document.removeEventListener("visibilitychange", sync); media.removeEventListener("change", sync); };
  }, [scene, reducedMotion]);
  return <div ref={ref} className={`ambient-life ambient-${scene}`} aria-hidden="true">
    {scene === "home" && <div className="ambient-sprite ambient-visitor" data-ambient="squirrel" />}
    {scene === "restaurant" && <div className="ambient-sprite ambient-steam" data-ambient="steam" />}
  </div>;
}
