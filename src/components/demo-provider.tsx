"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClientId } from "@/lib/client-id";
import { addEntry, allowance, AVATARS, deleteEntry, IDENTITIES, initialState, isDemoState, moderateEntry, rateDish, refreshDay, reportEntry, tasteDish, type Avatar, type DemoState, type Draft, type Identity, type Rating } from "@/lib/demo";

type DemoContextValue = {
  state: DemoState; ready: boolean; now: number; storageWarning: string; reducedMotion: boolean; failNext: boolean;
  setReducedMotion: (value: boolean) => void; setFailNext: (value: boolean) => void;
  submit: (draft: Draft, id: string) => Promise<void>; remove: (id: string) => void;
  moderate: (id: string, status: "published" | "rejected" | "hidden", reason: string) => void;
  taste: (id: string) => void; rate: (id: string, value: Rating) => void; report: (id: string, reason: string) => void;
  dress: (avatar: Avatar, identity: Identity) => void; reset: () => void; empty: () => void;
};
const DemoContext = createContext<DemoContextValue | null>(null);
const STORAGE_KEY = "mouse-world-v2";

/** 管理新版演示快照、配额时钟与交互；原 V1 快照留存原键，不混用旧评论数据。 */
export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(() => initialState(0));
  const stateRef = useRef(state);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);
  const [storageWarning, setStorageWarning] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const failureRef = useRef(false);

  /** 同步引用和 React 状态；连续点击在同一事件循环内也能看到最新的扣费和奖励。 */
  function update(next: DemoState) { stateRef.current = next; setState(next); }
  useEffect(() => {
    const time = Date.now();
    let next = initialState(time, createClientId());
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) { const saved: unknown = JSON.parse(raw); if (!isDemoState(saved)) throw new Error("invalid snapshot"); next = refreshDay(saved, time); }
    } catch { setStorageWarning("演示记录无法恢复，已开启新的鼠鼠旅程。"); }
    update(next); setNow(time); setReady(true);
    /** 每秒及重新聚焦时同步北京时间；扣费函数也读取实时时钟，不依赖定时器准确触发。 */
    function tick() { const time = Date.now(); setNow(time); const next = refreshDay(stateRef.current, time); if (next !== stateRef.current) update(next); }
    const timer = setInterval(tick, 1000);
    window.addEventListener("focus", tick); document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { setStorageWarning("浏览器无法保存试玩记录，刷新后可能丢失。"); }
  }, [state, ready]);

  /** 模拟提交延迟与一次失败；通过数据层一次性写入条目及点酒额度，重试保持同一请求标识。 */
  async function submit(draft: Draft, id: string) {
    const shouldFail = failureRef.current;
    failureRef.current = false; setFailNext(false);
    await new Promise(resolve => setTimeout(resolve, 450));
    if (shouldFail) throw new Error("模拟网络中断。文字已保留，请重新提交。");
    update(addEntry(stateRef.current, draft, id));
  }
  /** 开关仅影响下一次演示提交，已保存的故事与额度不受影响。 */
  function configureFailure(value: boolean) { failureRef.current = value; setFailNext(value); }
  /** 删除自己的内容并保留额度消费历史，避免删帖刷取饮品或奖励。 */
  function remove(id: string) { update(deleteEntry(stateRef.current, id)); }
  /** 通过演示审核服务统一更新可见性和首次烹饪奖励。 */
  function moderate(id: string, status: "published" | "rejected" | "hidden", reason: string) { update(moderateEntry(stateRef.current, id, status, reason)); }
  /** 首次打开正文扣费，重复进入及自己作品均不重复扣费。 */
  function taste(id: string) { update(tasteDish(stateRef.current, id)); }
  /** 保存单票评价，改选覆盖同一只鼠此前的选择。 */
  function rate(id: string, rating: Rating) { update(rateDish(stateRef.current, id, rating)); }
  /** 保存仅当前标签页可见的演示举报，供演示管理台查看。 */
  function report(id: string, reason: string) { update(reportEntry(stateRef.current, id, reason)); }
  /** 切换鼠种与可选身份描述，不更换匿名 ID、金币或发布历史。 */
  function dress(avatar: Avatar, identity: Identity) {
    if (!AVATARS.includes(avatar) || !IDENTITIES.includes(identity)) throw new Error("请选择有效的鼠鼠形象。");
    update({ ...stateRef.current, profile: { ...stateRef.current.profile, avatar, identity } });
  }
  /** 恢复种子及额度但保留当前鼠鼠身份，便于重复试玩。 */
  function reset() { update({ ...initialState(Date.now(), stateRef.current.profile.id), profile: stateRef.current.profile }); configureFailure(false); }
  /** 仅清空内容以验证空状态，不额外发放金币或饮品额度。 */
  function empty() { update({ ...stateRef.current, entries: [], tasted: [], ratings: {}, reports: [] }); }
  return <DemoContext.Provider value={{ state, ready, now, storageWarning, reducedMotion, setReducedMotion, failNext, setFailNext: configureFailure, submit, remove, moderate, taste, rate, report, dress, reset, empty }}>{children}</DemoContext.Provider>;
}
/** 从客户端上下文读取演示服务；缺少提供者时报错，防止误用默认身份。 */
export function useDemo() { const value = useContext(DemoContext); if (!value) throw new Error("需要 DemoProvider。"); return value; }
/** 用同一个上下文时钟计算钱包展示，和服务层的北京时间规则保持一致。 */
export function useWallet() { const { state, now } = useDemo(); return allowance(state, now); }
