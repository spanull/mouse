"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useDemo, useWallet } from "@/components/demo-provider";
import { createClientId } from "@/lib/client-id";
import { BLANK_DRAFT, CATEGORIES, countText, DRINKS, TRUTHS, validateDraft, type Draft, type Kind } from "@/lib/demo";

type Props = { kind: Kind; drink?: number; onSuccess?: () => void };
/** 菜品烹饪与点酒共用提交保护；输入只在当前表单内存中保留，成功反馈不等同于公开。 */
export function ComposeForm({ kind, drink = 0, onSuccess }: Props) {
  const { submit } = useDemo();
  const wallet = useWallet();
  const [draft, setDraft] = useState<Draft>({ ...BLANK_DRAFT, kind, drink });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [failure, setFailure] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const requestRef = useRef("");
  const locked = useRef(false);
  const mounted = useRef(true);
  const dirty = !!(draft.title || draft.body || draft.teaser);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!dirty) return;
    /** 刷新或关闭页面使用浏览器原生提示，避免尚未提交的心事被意外丢弃。 */
    function beforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    /** 捕获路由链接与模态关闭按钮；取消离开时阻断事件，不清除表单。 */
    function guardLeave(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const target = event.target.closest("a[href], [data-leave-form]");
      if (!target || (target instanceof HTMLAnchorElement && target.href === location.href)) return;
      if (!window.confirm("还有未提交的内容，确定放弃并离开吗？")) { event.preventDefault(); event.stopPropagation(); }
    }
    window.addEventListener("beforeunload", beforeUnload); document.addEventListener("click", guardLeave, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", guardLeave, true); };
  }, [dirty]);
  /** 字段改动清除过期结果与请求编号；下次提交视为一份新的菜品或心声。 */
  function edit<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft(previous => ({ ...previous, [field]: value })); setErrors({}); setSuccess(false); setFailure(""); requestRef.current = "";
  }
  /** 校验后加即时锁提交；失败保留全部字段和幂等标识，成功清空文字并通知场景送酒。 */
  async function send(event: FormEvent) {
    event.preventDefault(); if (locked.current) return;
    const issues = validateDraft(draft); setErrors(issues); setFailure("");
    if (Object.keys(issues).length) { formRef.current?.querySelector<HTMLElement>(`[name="${issues.title ? "title" : issues.teaser ? "teaser" : "body"}"]`)?.focus(); return; }
    locked.current = true; setSending(true); requestRef.current ||= createClientId();
    try { await submit(draft, requestRef.current); if (mounted.current) { setDraft({ ...BLANK_DRAFT, kind, drink }); setSuccess(true); requestRef.current = ""; onSuccess?.(); } }
    catch (error) { if (mounted.current) setFailure(error instanceof Error ? error.message : "提交失败，请重试。"); }
    finally { locked.current = false; if (mounted.current) setSending(false); }
  }
  if (success && kind === "dish") return <div className="cooking-success" role="status"><img src="/assets/world/rat-static.png" alt="开心的厨师鼠" /><h2>这道故事，已经出锅！</h2><p>已提交，审核通过后上菜单。届时获得 1 枚金币和 1 次额外品尝机会。</p><div className="actions"><Link className="button" href="/restaurant">回到餐厅</Link><button className="button lavender" onClick={() => setSuccess(false)}>继续烹饪</button><Link className="text-link" href="/home/records">查看我的作品</Link></div></div>;
  return <form ref={formRef} onSubmit={send} className="compose-form" noValidate>
    {kind === "dish" && <><div className="field"><label htmlFor="dish-title">菜品标题 <small>{countText(draft.title)} / 40</small></label><input id="dish-title" name="title" value={draft.title} onChange={event => edit("title", event.target.value)} placeholder="给这道瓜取一个诱人的名字" disabled={sending} aria-invalid={!!errors.title} /><p className="field-error">{errors.title}</p></div><div className="field"><label htmlFor="dish-teaser">菜单简介 <small>{countText(draft.teaser)} / 100</small></label><textarea id="dish-teaser" name="teaser" rows={2} value={draft.teaser} onChange={event => edit("teaser", event.target.value)} placeholder="留点悬念，不要直接剧透结局" disabled={sending} aria-invalid={!!errors.teaser} /><p className="field-error">{errors.teaser}</p></div><div className="flavor-fields"><div className="field"><label htmlFor="category">菜品分类</label><select id="category" value={draft.category} onChange={event => edit("category", event.target.value as Draft["category"])} disabled={sending}>{CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></div><div className="field"><label htmlFor="truth">盐味 · 故事类型</label><select id="truth" value={draft.truth} onChange={event => edit("truth", event.target.value as Draft["truth"])} disabled={sending}>{TRUTHS.map(value => <option key={value}>{value}</option>)}</select></div></div><div className="field"><label htmlFor="spice">辣度 · 劲爆度 {draft.spice} / 5</label><input id="spice" type="range" min="1" max="5" value={draft.spice} onChange={event => edit("spice", Number(event.target.value))} disabled={sending} /><p className="fineprint">盐味为作者自述，不代表平台核实。</p></div></>}
    <div className="field"><label htmlFor="story-body">{kind === "dish" ? "故事正文" : "写下你的心事"}<small>{countText(draft.body)} / {kind === "dish" ? 2000 : 300}</small></label><textarea id="story-body" name="body" rows={kind === "dish" ? 7 : 5} value={draft.body} onChange={event => edit("body", event.target.value)} placeholder={kind === "dish" ? "故事里只有鼠鼠。请用鼠鼠称呼和虚构地点，藏好现实身份。" : "今晚有什么想放下的？鼹鼠会安静地听。"} disabled={sending} aria-invalid={!!errors.body} /><p className="field-error">{errors.body}</p></div>
    <p className="fineprint">请勿写真实姓名、学校公司、地址、联系方式或针对现实对象的传闻。不收政治、网暴内容；不支持人脸和聊天截图。</p>
    {kind === "whisper" && <p className="fineprint">{DRINKS[drink].name} · 免费 · 今日还可 {Math.max(0, 3 - wallet.drinks)} 杯。提交后审核公开，自己的心事可在作品中收起。</p>}
    {Object.entries(errors).filter(([key]) => !["title", "teaser", "body"].includes(key)).map(([key, message]) => <p className="feedback error" role="alert" key={key}>{message}</p>)}
    {failure && <p className="feedback error" role="alert">{failure}</p>}
    <div className="form-footer"><span>匿名表达 · 审核后公开</span><button className="button pink" type="submit" disabled={sending || (kind === "whisper" && wallet.drinks >= 3)}>{sending ? "正在递给鼠鼠…" : kind === "dish" ? "完成烹饪" : "把心事交给这杯酒"}</button></div>
  </form>;
}
