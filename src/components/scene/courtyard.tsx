"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "@/components/game-icon";
import { useDemo } from "@/components/demo-provider";
import type { AnimatedSprite, Application, Texture } from "pixi.js";

export type MousePose = "idle" | "pressed" | "success" | "welcome" | "listen" | "polish" | "shake" | "pour" | "serve" | "comfort" | "leisure";
type Pose = MousePose;
type ActorAction = { pose: MousePose; token: number; once?: boolean };
type PoseSpec = { file: string; frameCount: number; durations: number[]; loop: boolean };
type ActorSpec = { frameSize: number; fallback: string; poses: Partial<Record<Pose, PoseSpec>> };
type NaturalManifest = { actors: Record<string, ActorSpec> };
type Controller = { play: (pose: Pose) => void; setReduced: (value: boolean) => void };

/** 渲染独立鼠鼠精灵；画布只处理动作，HTML 按钮负责可访问的问候交互。 */
export function MouseActor({ character = "rat", celebrate = 0, action, decorative = false, label = "和鼠鼠打招呼", onGreet, onActionComplete, onPlaybackError, onPlaybackReady }: { character?: string; celebrate?: number; action?: ActorAction; decorative?: boolean; label?: string; onGreet?: () => void; onActionComplete?: (action: ActorAction) => void; onPlaybackError?: () => void; onPlaybackReady?: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<Controller | null>(null);
  const celebrateRef = useRef(celebrate);
  const actionRef = useRef(action);
  const completeRef = useRef(onActionComplete);
  const errorRef = useRef(onPlaybackError);
  const readyRef = useRef(onPlaybackReady);
  const reducedRef = useRef(false);
  const { reducedMotion } = useDemo();
  const [systemReduced, setSystemReduced] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const asset = ["rat", "hamster", "field", "chinchilla", "dormouse", "mole", "chef", "restaurant-chef", "patron-dormouse", "patron-hamster"].includes(character) ? character : "rat";
  const barActor = asset === "mole" || asset.startsWith("patron-");
  const fallback = asset === "restaurant-chef" ? "/assets/restaurant/chef-static-color-v2.png" : barActor ? `/assets/bar/${asset}-static.png` : `/assets/natural/${asset}-static${["rat", "hamster", "field", "chinchilla", "dormouse"].includes(asset) ? "-home-v3" : ""}.png`;

  useEffect(() => { completeRef.current = onActionComplete; errorRef.current = onPlaybackError; readyRef.current = onPlaybackReady; }, [onActionComplete, onPlaybackError, onPlaybackReady]);

  useEffect(() => {
    actionRef.current = action;
    controllerRef.current?.play(action?.pose ?? "idle");
  }, [action?.pose, action?.token, action?.once]);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    /** 同步系统动态效果偏好；监听函数在卸载时对称移除。 */
    function syncPreference() { setSystemReduced(media.matches); }
    syncPreference(); media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    reducedRef.current = reducedMotion || systemReduced;
    controllerRef.current?.setReduced(reducedRef.current);
  }, [reducedMotion, systemReduced]);

  useEffect(() => {
    celebrateRef.current = celebrate;
    if (celebrate) controllerRef.current?.play("success");
  }, [celebrate]);

  useEffect(() => {
    let cancelled = false;
    let app: Application | undefined;
    let initialized = false;
    let disposed = false;
    let actor: AnimatedSprite | undefined;
    let activePose: Pose = "idle";
    let textures: Texture[] = [];
    let sources: Texture[] = [];
    let unsubscribe = () => {};
    setReady(false); setFailed(false);

    /** 销毁本实例拥有的画布、纹理与监听器；取消初始化时由异步流程完成剩余清理。 */
    function dispose() {
      if (disposed) return;
      disposed = true; unsubscribe(); controllerRef.current = null;
      if (app && initialized) app.destroy(true, { children: true, texture: false, textureSource: false });
      textures.forEach(texture => texture.destroy(false));
      sources.forEach(texture => texture.destroy(true));
      textures = []; sources = [];
    }

    /** 初始化客户端渲染器及实例私有纹理，防止不同页面销毁彼此的共享缓存。 */
    async function initialize() {
      try {
        const { Application, Texture, Rectangle, AnimatedSprite } = await import("pixi.js");
        if (cancelled) return;
        app = new Application();
        await app.init({ width: 480, height: 260, backgroundAlpha: 0, antialias: false, resolution: 1, preference: "webgl", autoStart: false });
        initialized = true;
        if (cancelled) { dispose(); return; }

        /** 加载独立图片纹理，取消和超时都会结束等待，不使用全局 Assets 缓存。 */
        async function loadTexture(url: string): Promise<Texture> {
          const picture = new Image();
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => { picture.onload = null; picture.onerror = null; reject(new Error("图片加载超时")); }, 10000);
            picture.onload = () => { clearTimeout(timeout); resolve(); };
            picture.onerror = () => { clearTimeout(timeout); reject(new Error("图片加载失败")); };
            picture.src = url;
          });
          if (cancelled) throw new Error("场景已卸载");
          const texture = Texture.from(picture, true);
          texture.source.scaleMode = "nearest";
          sources.push(texture);
          return texture;
        }

        const response = await fetch(asset === "restaurant-chef" ? "/assets/restaurant/manifest.json" : barActor ? "/assets/bar/manifest.json" : "/assets/natural/manifest.json");
        if (!response.ok) throw new Error("自然动作清单加载失败");
        const manifest = await response.json() as NaturalManifest;
        const spec = manifest.actors[asset];
        if (!spec?.poses.idle) throw new Error("缺少角色待机配置");
        const frames = {} as Record<Pose, Texture[]>;
        const poses = Object.keys(spec.poses) as Pose[];
        const loaded = await Promise.allSettled(poses.map(async pose => {
          const poseSpec = spec.poses[pose]!;
          const sheet = await loadTexture(poseSpec.file);
          if (cancelled) return;
          frames[pose] = Array.from({ length: poseSpec.frameCount }, (_, index) => new Texture({ source: sheet.source, frame: new Rectangle(index * spec.frameSize, 0, spec.frameSize, spec.frameSize) }));
          textures.push(...frames[pose]);
        }));
        if (loaded.some(result => result.status === "rejected")) throw new Error("角色动作加载未完成");
        if (cancelled) { dispose(); return; }
        actor = new AnimatedSprite({ textures: frames.idle, autoUpdate: false });
        actor.anchor.set(.5, (spec.frameSize - 12) / spec.frameSize);
        /** 按容器等比例缩放角色并用清单脚底锚点对齐；最近邻采样保留像素风格。 */
        function resizeScene() {
          const host = hostRef.current;
          if (!host || !app || !actor || cancelled) return;
          app.renderer.resize(host.clientWidth, host.clientHeight);
          const scale = Math.min(host.clientWidth, host.clientHeight) / spec.frameSize;
          actor.scale.set(scale);
          actor.position.set(Math.round(host.clientWidth * .5), Math.round(host.clientHeight - 12 * scale));
          app.render();
        }
        const observer = new ResizeObserver(resizeScene);
        if (hostRef.current) observer.observe(hostRef.current);
        resizeScene();
        app.stage.addChild(actor);

        /** 切换动作并配置库自带的离散帧播放；庆祝期间忽略重复点击，不积压动作队列。 */
        function play(pose: Pose) {
          if (!actor || cancelled || (activePose === "success" && pose === "pressed")) return;
          if (pose === "success") pose = frames.welcome ? "welcome" : "pressed";
          if (pose === "pressed" && !frames.pressed) pose = frames.welcome ? "welcome" : "leisure";
          if (!frames[pose]) pose = "idle";
          activePose = pose;
          actor.onComplete = undefined;
          const poseSpec = spec.poses[pose]!;
          actor.textures = frames[pose].map((texture, i) => ({ texture, time: poseSpec.durations[i] }));
          actor.animationSpeed = 1;
          const requested = actionRef.current;
          const controlled = requested?.once && requested.pose === pose ? requested : undefined;
          actor.loop = controlled ? false : poseSpec.loop;
          if (app) { app.canvas.dataset.pose = pose; app.canvas.dataset.frames = String(poseSpec.frameCount); }
          actor.onComplete = () => {
            if (cancelled || activePose !== pose) return;
            // 受控服务动作停在末帧，由父场景衔接；旧令牌不能推进新的服务步骤。
            if (controlled) {
              if (actionRef.current?.token === controlled.token && actionRef.current.pose === controlled.pose) completeRef.current?.(controlled);
            } else play("idle");
          };
          actor.gotoAndPlay(0);
          if (reducedRef.current || document.hidden) app?.render();
        }

        /** 隐藏时只冻结 ticker，保留动作帧和进度；减少动态效果展示首帧，恢复偏好后重播当前动作。 */
        let wasReduced = false;
        function syncPlayback() {
          if (!app || !actor || cancelled) return;
          if (reducedRef.current) { wasReduced = true; app.stop(); actor.gotoAndStop(0); app.render(); }
          else {
            if (wasReduced) { wasReduced = false; play(actionRef.current?.pose ?? "idle"); }
            if (document.hidden) app.stop(); else app.start();
          }
        }
        let idleElapsed = 0, nextLeisure = 9000 + Math.random() * 9000;
        app.ticker.add(ticker => {
          actor?.update(ticker);
          if (app && actor) app.canvas.dataset.frame = String(actor.currentFrame);
          if (activePose !== "idle" || actionRef.current || reducedRef.current) { idleElapsed = 0; return; }
          idleElapsed += ticker.deltaMS;
          if (idleElapsed >= nextLeisure) {
            idleElapsed = 0; nextLeisure = 12000 + Math.random() * 12000;
            if (frames.leisure) play("leisure");
            else if (frames.polish) play(Math.random() > .5 ? "polish" : "listen");
          }
        });
        app.canvas.setAttribute("aria-hidden", "true");
        app.canvas.dataset.scene = "mouse";
        app.canvas.addEventListener("webglcontextlost", onContextLost);
        document.addEventListener("visibilitychange", syncPlayback);
        unsubscribe = () => { observer.disconnect(); document.removeEventListener("visibilitychange", syncPlayback); app?.canvas.removeEventListener("webglcontextlost", onContextLost); };
        /** 图形上下文丢失时显示已有 HTML 降级入口，并允许用户重新初始化。 */
        function onContextLost(event: Event) { event.preventDefault(); app?.stop(); setFailed(true); setReady(false); errorRef.current?.(); }
        hostRef.current?.appendChild(app.canvas);
        controllerRef.current = { play, setReduced: syncPlayback };
        play("idle");
        if (celebrateRef.current) play("success");
        if (actionRef.current) play(actionRef.current.pose);
        syncPlayback();
        setReady(true);
        // 仅在纹理和播放均已准备好后通知场景，使重试成功能清除过期的失败提示。
        readyRef.current?.();
      } catch {
        dispose();
        if (!cancelled) { setFailed(true); setReady(false); errorRef.current?.(); }
      }
    }
    void initialize();
    return () => { cancelled = true; if (initialized) dispose(); };
  }, [attempt, asset, barActor]);

  /** 手动点击优先于闲暇动作；服务流程有外部动作时不允许点击打断摇酒或递酒。 */
  function greet() { if (!actionRef.current && !reducedRef.current) controllerRef.current?.play("pressed"); onGreet?.(); }

  return <div className="mouse-actor" data-pose={action?.pose ?? "idle"}>
    <div ref={hostRef} className={`pixi-host ${failed ? "is-hidden" : ""}`} />
    {!ready && <img className="actor-fallback" src={fallback} alt="" />}
    {!decorative && <button className="actor-touch" onClick={greet} aria-label={label} />}
    {failed && <button className="actor-retry" onClick={() => setAttempt(value => value + 1)} aria-label="重试角色动画"><RefreshCw size={14} /></button>}
  </div>;
}
