"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ChefHat, Coins, Heart, Home, Settings, Wine, X } from "@/components/game-icon";
import { MouseActor, type MousePose } from "@/components/scene/courtyard";
import { AmbientLife } from "@/components/scene/ambient-life";
import { ComposeForm } from "@/components/content/compose-form";
import { useDemo, useWallet } from "@/components/demo-provider";
import { AVATARS, DRINKS, entryUrl, IDENTITIES, isPublic, RATINGS, SLOT_NAMES, STATUS, type Avatar, type Entry } from "@/lib/demo";

const CHARACTER_KEYS = ["rat", "hamster", "field", "chinchilla", "dormouse"];
/** 将访客选择映射为独立鼠种资源；形象变化不会改变匿名身份或消费记录。 */
function characterKey(avatar: Avatar) { return CHARACTER_KEYS[AVATARS.indexOf(avatar)] ?? "rat"; }
/** 为纯静态头像和可交互主角使用同一资源命名，确保角色选择在所有场景生效。 */
function Portrait({ avatar, className = "" }: { avatar: Avatar; className?: string }) { return <img className={`portrait ${className}`} src={`/assets/natural/${characterKey(avatar)}-static.png`} alt={avatar} />; }
/** 给不同菜品确定一张原创菜碟图，不把内容类型等同于真实食物。 */
function dishImage(id: string) { return `/assets/world/dish-${[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6}.png`; }
/** 根据视口方向选择独立生成的构图，浏览器只做等比例 cover；主体和热区独立于背景裁切。 */
function SceneBackdrop({ scene, alt }: { scene: "home" | "restaurant" | "bar"; alt: string }) {
  const ref = useRef<HTMLPictureElement>(null);
  useEffect(() => {
    const stage = ref.current?.closest<HTMLElement>(".scene-art");
    if (!stage) return;
    const media = matchMedia("(min-aspect-ratio: 1/1)");
    /** 采用标准 cover 公式，以同一比例计算背景和场景物件坐标；边缘裁切不会改变角色与柜台的相对位置。 */
    function resize() {
      if (!stage) return;
      const ratio = media.matches ? 1.5 : 2 / 3;
      const width = Math.max(stage.clientWidth, stage.clientHeight * ratio), height = width / ratio;
      stage.style.setProperty("--image-width", `${width}px`);
      stage.style.setProperty("--image-height", `${height}px`);
      stage.style.setProperty("--image-x", `${(stage.clientWidth - width) / 2}px`);
      stage.style.setProperty("--image-y", `${(stage.clientHeight - height) / 2}px`);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(stage); media.addEventListener("change", resize); resize();
    return () => { observer.disconnect(); media.removeEventListener("change", resize); };
  }, []);
  return <picture ref={ref}><source media="(min-aspect-ratio: 1/1)" srcSet={`/assets/${scene === "home" ? "world" : "natural"}/${scene}-wide.png`} /><img className="backdrop-art" src={`/assets/${scene === "home" ? "world" : "natural"}/${scene}-tall.png`} alt={alt} /></picture>;
}
/** 容器只提供场景化工具和返回键；主功能入口均在之家、餐厅或酒吧场景中。 */
export function CommunityApp({ path }: { path: string }) {
  const { ready, state, storageWarning, reducedMotion } = useDemo();
  const restaurant = path.startsWith("/restaurant");
  const bar = path.startsWith("/bar");
  const title = path === "/" ? "鼠鼠之家" : path === "/home/characters" ? "今天当哪只鼠？" : path === "/home/records" ? "我的小食记" : path === "/settings" ? "小院设置" : path === "/admin" ? "演示审核" : restaurant ? "鼠鼠餐厅" : "树洞酒吧";
  const back = restaurant ? (path === "/restaurant" ? "/" : "/restaurant") : bar ? (path === "/bar" ? "/" : "/bar") : "/";
  return <main className={`mouse-world ${["/", "/restaurant", "/bar"].includes(path) ? "is-scene" : "is-panel"} ${bar ? "bar-world" : restaurant ? "restaurant-world" : "home-world"} ${reducedMotion ? "reduce-motion" : ""}`}>
    <div className="game-shell">
      <header className="game-top"><Link prefetch={false} className="round-control" href={path === "/" ? "/home/characters" : back} aria-label={path === "/" ? "选择鼠鼠形象" : "返回上一场景"}>{path === "/" ? <Portrait avatar={state.profile.avatar} /> : <ArrowLeft size={48} />}</Link><h1 className="sr-only">{title}</h1><Link prefetch={false} href="/settings" className="round-control" aria-label="小院设置"><Settings size={48} /></Link></header>
      {!ready ? <div className="loading" role="status"><img src="/assets/world/rat-static.png" alt="" /><p>鼠鼠正在开门…</p></div> : path === "/" ? <HomeScene /> : path === "/restaurant" || path === "/restaurant/menu" ? <Restaurant menuOnly={path.endsWith("menu")} /> : path === "/restaurant/kitchen" ? <Kitchen /> : path.startsWith("/restaurant/dish/") ? <DishDetail id={path.split("/")[3]} /> : path === "/bar" ? <BarScene /> : path === "/bar/wall" || path.startsWith("/bar/wall/") ? <HeartWall selected={path.split("/")[3]} /> : path === "/bar/drinks" ? <DrinkMenu /> : path === "/home/characters" ? <Characters /> : path === "/home/records" ? <Records /> : path === "/settings" ? <SettingsPage /> : <DemoAdmin />}
      {storageWarning && <p className="feedback error" role="status">{storageWarning}</p>}

    </div>
  </main>;
}
/** 鼠鼠之家使用场景中的双路牌进入两家店，鼠种与设置作为轻量角落工具。 */
function HomeScene() {
  const { state } = useDemo();
  const [hello, setHello] = useState(false);
  return <section className="home-scene" aria-label="鼠鼠之家的互动场景"><div className="home-art scene-art"><SceneBackdrop scene="home" alt="苔藓小屋与花园" /><AmbientLife scene="home" /><div className="home-mouse"><MouseActor character={characterKey(state.profile.avatar)} onGreet={() => setHello(value => !value)} /></div>{hello && <div className="hello-bubble" role="status">吱！饿了去吃瓜，累了来一杯。<button className="bubble-close" aria-label="关闭问候" onClick={() => setHello(false)}><X size={26} /></button></div>}<Link prefetch={false} href="/restaurant" className="destination-sign restaurant-sign" aria-label="进入餐厅"><img src="/assets/ui/entrance-restaurant.png" alt="" /></Link><Link prefetch={false} href="/bar" className="destination-sign bar-sign" aria-label="进入树洞酒吧"><img src="/assets/ui/entrance-bar.png" alt="" /></Link></div></section>;
}
/** 显示与当前北京时间同步的钱包；已用餐次和奖励机会分开，避免误解奖励规则。 */
function WalletStrip() {
  const wallet = useWallet();
  return <div className="wallet-strip" aria-label="餐厅额度"><span><Coins size={16} /><strong data-testid="coins">{wallet.coins}</strong> 金币</span><span>{SLOT_NAMES[wallet.slot]}剩余 <b data-testid="meals">{wallet.remaining}</b>/3</span><span>加餐券 <b data-testid="bonus">{wallet.bonus}</b></span></div>;
}
/** 餐厅场景与单页菜单组合；翻页只预览标题简介，点击明确按钮后才扣费打开正文。 */
function Restaurant({ menuOnly }: { menuOnly: boolean }) {
  const { state } = useDemo();
  const [greeting, setGreeting] = useState(false);
  if (menuOnly) return <section className="restaurant-content menu-page"><WalletStrip /><Menu /></section>;
  return <section className="restaurant-content"><div className="restaurant-stage scene-art"><SceneBackdrop scene="restaurant" alt="鼠鼠餐厅的木柜与厨房" /><AmbientLife scene="restaurant" /><div className="chef-mouse"><MouseActor character="chef" onGreet={() => setGreeting(value => !value)} /></div>{greeting && <div className="restaurant-caption" role="status">故事刚出锅。翻开菜谱，挑一道喜欢的吧。</div>}<Link prefetch={false} href="/restaurant/menu" className="scene-object menu-object" aria-label="打开吃瓜菜单"><img src="/assets/ui/entrance-menu.png" alt="" /></Link><Link prefetch={false} className="scene-object kitchen-object" href="/restaurant/kitchen" aria-label="进入厨房烹饪"><img src="/assets/ui/chef.png" alt="" /></Link></div></section>;
}
/** 一页一道菜，支持滑动、左右按钮与方向键；菜单只展示预告，不能绕过首次品尝校验。 */
function Menu() {
  const demo = useDemo(); const router = useRouter();
  const dishes = demo.state.entries.filter(entry => entry.kind === "dish" && isPublic(entry));
  const [index, setIndex] = useState(0), [error, setError] = useState("");
  const start = useRef<{ x: number; y: number } | null>(null);
  const current = Math.min(index, Math.max(0, dishes.length - 1));
  const dish = dishes[current];
  /** 每次翻页清除上一道菜的错误；边界停在第一页或最后一页，不产生无效索引。 */
  function flip(delta: number) { setIndex(Math.max(0, Math.min(dishes.length - 1, current + delta))); setError(""); }
  /** 在导航前同步尝试扣费；失败留在菜单显示下一场时间或厨房入口。 */
  function eat() { if (!dish) return; try { demo.taste(dish.id); router.push(entryUrl(dish)); } catch (error) { setError(error instanceof Error ? error.message : "暂时无法上菜。"); } }
  if (!dish) return <Empty title="菜单还空着" description="第一位大厨，也许就是你。" href="/restaurant/kitchen" label="去厨房烹饪" />;
  const unlocked = demo.state.tasted.includes(dish.id) || dish.authorId === demo.state.profile.id;
  return <div className="menu-book" tabIndex={0} aria-label="左右翻页的吃瓜菜单" onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === "ArrowLeft") { event.preventDefault(); flip(-1); } if (event.key === "ArrowRight") { event.preventDefault(); flip(1); } }} onTouchStart={event => { start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }} onTouchEnd={event => { if (!start.current) return; const dx = event.changedTouches[0].clientX - start.current.x, dy = event.changedTouches[0].clientY - start.current.y; if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) flip(dx < 0 ? 1 : -1); start.current = null; }}>
    <div className="menu-topline"><span><BookOpen size={16} />今日吃瓜菜单</span><span>{current + 1} / {dishes.length}</span></div>
    <div className="dish-preview"><img className="dish-illustration" src={dishImage(dish.id)} alt="像素菜碟" /><span className="dish-category">{dish.category}</span><h2>{dish.title}</h2><p className="dish-teaser">{dish.teaser}</p><div className="flavor-tags"><span>辣度 {dish.spice}/5</span><span>盐味：{dish.truth}</span></div><p className="fineprint">故事类型为鼠鼠自述，未经事实核实。</p></div>
    {error && <p className="feedback error" role="alert">{error}</p>}
    <div className="menu-actions"><button className="round-control" disabled={current === 0} aria-label="上一道菜" onClick={() => flip(-1)}><ArrowLeft size={18} /></button><button className="button pink" onClick={eat}>{unlocked ? "再尝一口 · 免费重看" : "开吃 · 1 金币"}</button><button className="round-control" disabled={current >= dishes.length - 1} aria-label="下一道菜" onClick={() => flip(1)}><ArrowRight size={18} /></button></div><p className="swipe-hint">左右滑动翻页 · 每页一道故事</p>
  </div>;
}
/** 新路由直接打开时仅呈现预告；成功解锁或本人作品才显示正文，隐藏内容不回显。 */
function DishDetail({ id }: { id: string }) {
  const demo = useDemo(); const [error, setError] = useState("");
  const dish = demo.state.entries.find(entry => entry.id === id && entry.kind === "dish");
  const own = dish?.authorId === demo.state.profile.id;
  if (!dish || (!isPublic(dish) && !own) || ["hidden", "deleted"].includes(dish.status)) return <Empty title="这道菜暂时下架了" description="去菜单看看别的故事吧。" href="/restaurant" label="返回餐厅" />;
  const unlocked = own || demo.state.tasted.includes(id);
  /** 直接访问详情也需统一扣费；操作失败保留预告并给出可恢复提示。 */
  function unlock() { try { demo.taste(id); setError(""); } catch (error) { setError(error instanceof Error ? error.message : "暂时无法上菜。"); } }
  return <div className="content-page"><WalletStrip /><article className="story-paper"><img className="detail-dish" src={dishImage(id)} alt="像素菜碟" /><span className="eyebrow">{dish.category} · {STATUS[dish.status]}</span><h2>{dish.title}</h2><div className="flavor-tags"><span>辣度 {dish.spice}/5</span><span>盐味：{dish.truth}</span></div><p className="fineprint">{dish.authorName} · 故事类型为作者自述</p>{unlocked ? <p className="story-body">{dish.body}</p> : <div className="locked-story"><p>{dish.teaser}</p><p className="fineprint">首次品尝消耗 1 金币与 1 次机会，之后免费重看。</p><button className="button pink" onClick={unlock}>品尝这道菜 · 1 金币</button></div>}{error && <p className="feedback error" role="alert">{error}</p>}{isPublic(dish) && unlocked && !own && <fieldset className="rating-group"><legend>这道故事，合你胃口吗？</legend><p>只选感受，不开评论区。</p><div>{RATINGS.map((rating, index) => <button type="button" key={rating} aria-pressed={demo.state.ratings[id] === rating} onClick={() => { try { demo.rate(id, rating); setError(""); } catch (error) { setError(error instanceof Error ? error.message : "评价失败。"); } }}><img className="rating-art" src={`/assets/ui/rating-${index}.png`} alt="" />{rating}</button>)}</div>{demo.state.ratings[id] && <p role="status">已评价：{demo.state.ratings[id]}，可以改选。</p>}</fieldset>}{own && <p className="feedback">自己的菜可免费查看；审核通过后获得一次烹饪奖励。</p>}{isPublic(dish) && <Report entry={dish} />}</article><Link className="button" href="/restaurant/menu">回菜单，再看看</Link></div>;
}
/** 厨房复用严格校验的菜品表单；原创鼠鼠和菜谱仅作场景提示，不影响提交结果。 */
function Kitchen() { const { state } = useDemo(); return <div className="content-page"><div className="kitchen-welcome"><Portrait avatar={state.profile.avatar} /><div><span className="eyebrow">厨房今天由你掌勺</span><h2>把故事，做成一道菜。</h2><p>审核通过，奖励 1 金币 + 1 张加餐券。</p></div></div><div className="story-paper"><ComposeForm kind="dish" /></div></div>; }
/** 酒吧包含鼹鼠、两个已就座访客与一张空凳，气泡只抽取已公开且尚未隐藏的树洞内容。 */
const MOLE_CHAT = [
  { pose: "welcome", lines: ["欢迎回来。还是那个靠窗的位子？", "今晚的灯，为晚归的鼠亮着。", "把外面的忙碌留在门口吧。"] },
  { pose: "listen", lines: ["嗯，我听着。慢慢说，不用组织好语言。", "不想说话也可以，我陪你安静坐一会儿。", "今天最想放下的，是哪一件小事？"] },
  { pose: "polish", lines: ["擦亮杯子，也给心情留一点光。", "这只杯子留给你，边缘不会碰疼小爪子。", "我慢慢擦，你慢慢想。今晚不赶时间。"] },
  { pose: "comfort", lines: ["今天做到这里，就已经很好了。", "不用每次都坚强。累了也可以靠一会儿。", "你的心事在这里有一个小小的位置。"] },
] as const;
/** 酒吧的手动互动与送酒步骤分别驱动独立动作；切换或离开时清理计时器，不改变消费次数。 */
function BarScene({ served, onFinish }: { served?: number; onFinish?: () => void }) {
  const { state, reducedMotion } = useDemo();
  const [offset, setOffset] = useState(0);
  const [chat, setChat] = useState<{ text: string; pose: MousePose; token: number } | null>(null);
  const [step, setStep] = useState(0);
  const counts = useRef([0, 0, 0, 0]);
  const whispers = state.entries.filter(entry => entry.kind === "whisper" && isPublic(entry));
  useEffect(() => {
    if (reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches || whispers.length < 2) return;
    const timer = setInterval(() => { if (!document.hidden) setOffset(value => value + 1); }, 7000);
    return () => clearInterval(timer);
  }, [reducedMotion, whispers.length]);
  useEffect(() => {
    if (served === undefined) return;
    if (reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches) { setStep(3); return; }
    const timers = [2200, 4400, 6600].map((delay, index) => setTimeout(() => setStep(index + 1), delay));
    return () => timers.forEach(clearTimeout);
  }, [served, reducedMotion]);
  useEffect(() => {
    if (!chat) return;
    const timer = setTimeout(() => setChat(null), 9000);
    return () => clearTimeout(timer);
  }, [chat]);
  /** 按所选互动轮换不同文案和动作；连续点击同一项也会更新令牌重新播放。 */
  function interact(index: number) {
    const item = MOLE_CHAT[index];
    const count = counts.current[index]++;
    setChat({ text: item.lines[count % item.lines.length], pose: item.pose, token: Date.now() + count });
  }
  const servicePoses: MousePose[] = ["shake", "pour", "serve", "comfort"];
  const serviceLines = ["加一点月光，再摇掉今天的烦恼。", "慢慢倒，给心事留一点呼吸的地方。", "你的这杯好了，小心接住。", served === undefined ? "" : DRINKS[served].comfort];
  const action = served !== undefined ? { pose: servicePoses[step], token: step + 1 } : chat ? { pose: chat.pose, token: chat.token } : undefined;
  return <section className={`bar-content ${served !== undefined ? "has-served" : ""}`} aria-label="树洞酒吧场景"><div className="bar-stage scene-art"><SceneBackdrop scene="bar" alt="灯火温暖的树洞吧台" /><AmbientLife scene="bar" /><img className="empty-bar-stool" src="/assets/natural/empty-stool.png" alt="留给你的空座位" /><div className="bartender"><MouseActor character="mole" action={action} label="和调酒鼹鼠打招呼" onGreet={() => { if (served === undefined) interact(counts.current.reduce((sum, value) => sum + value, 0) % 4); }} /></div>{(chat || served !== undefined) && <div className="bartender-bubble" role="status">{served !== undefined ? serviceLines[step] : chat?.text}</div>}<Link prefetch={false} href="/bar/wall" className="scene-object wall-object" aria-label="打开心声墙"><img src="/assets/ui/entrance-wall.png" alt="" /></Link><Link prefetch={false} href="/bar/drinks" onClick={onFinish} className="scene-object drinks-object" aria-label="打开酒单，来一杯"><img src="/assets/world/cocktail-purple.png" alt="" /></Link>{[0, 1].map(n => { const entry = whispers[(offset + n) % Math.max(whispers.length, 1)]; return <div className={`seated-mouse seated-${n}`} key={n}><MouseActor character={n ? "patron-hamster" : "patron-dormouse"} decorative />{entry && <Link className="seat-bubble" href={entryUrl(entry)} aria-label="阅读这只鼠的心声">{entry.body}</Link>}</div>; })}{served === undefined && <div className="mole-tools" aria-label="与鼹鼠互动">{["打个招呼", "听我说说", "看看擦杯", "给我一点鼓励"].map((label, index) => <button key={label} aria-label={label} aria-pressed={chat?.pose === MOLE_CHAT[index].pose} onClick={() => interact(index)}><img src={`/assets/ui/${["sparkle", "speech", "drink", "heart"][index]}.png`} alt="" /></button>)}</div>}{served !== undefined && step >= 2 && <div className={`served-glass ${DRINKS[served].color}`} aria-label="鼹鼠送来的饮品"><Cocktail color={DRINKS[served].color} /></div>}{served !== undefined && step === 3 && <Link className="serve-back round-control" href="/bar" onClick={onFinish} aria-label="收好饮品，回到吧台"><img src="/assets/ui/check.png" alt="" /></Link>}</div></section>;
}
/** 使用经去背景与验收的 AI 饮品素材；颜色标识只映射已有酒单，不表达审核状态，未知值回退到莓莓。 */
function Cocktail({ color }: { color: string }) { const asset = ["pink", "mint", "orange", "purple"].includes(color) ? color : "pink"; return <img className={`cocktail ${asset}`} src={`/assets/world/cocktail-${asset}.png`} alt="" aria-hidden="true" />; }
/** 点酒只打开心事表单，不提前消耗额度；成功提交后展示鼹鼠调酒与送酒反馈。 */
function DrinkMenu() {
  const wallet = useWallet(); const [selected, setSelected] = useState<number | null>(null), [served, setServed] = useState<number | null>(null);
  if (served !== null) return <BarScene served={served} onFinish={() => setServed(null)} />;
  return <div className="content-page drinks-page"><div className="page-intro"><span className="eyebrow">鼹鼠的心情酒单</span><h2>这杯，敬今晚的自己。</h2><p>挑一杯，把想说的话轻轻放进去。</p><span className="quota-pill">今日还可点 {Math.max(0, 3 - wallet.drinks)} / 3 杯 · 免费</span></div><div className="drink-grid">{DRINKS.map((drink, index) => <button className={`drink-choice ${drink.color}`} key={drink.name} onClick={() => setSelected(index)} disabled={wallet.drinks >= 3}><Cocktail color={drink.color} /><strong>{drink.name}</strong><span>{drink.description}</span></button>)}</div>{wallet.drinks >= 3 && <p role="status" className="feedback">今晚先喝到这里。明日 00:00 再来，心声墙一直为你亮着。</p>}<Link className="text-link" href="/bar/wall">去心声墙坐一会儿 <ArrowRight size={14} /></Link>{selected !== null && <GameDialog title={DRINKS[selected].name} close={() => setSelected(null)}><ComposeForm kind="whisper" drink={selected} onSuccess={() => { setServed(selected); setSelected(null); }} /></GameDialog>}</div>;
}
/** 全屏心声墙仅展示公开便利贴，点击放大阅读；不显示回复输入或社交关系入口。 */
function HeartWall({ selected }: { selected?: string }) {
  const { state } = useDemo(); const router = useRouter();
  const entries = state.entries.filter(entry => entry.kind === "whisper" && isPublic(entry));
  const current = selected ? state.entries.find(entry => entry.id === selected && entry.kind === "whisper" && (isPublic(entry) || entry.authorId === state.profile.id) && !["hidden", "deleted"].includes(entry.status)) : undefined;
  return <div className="heart-wall"><div className="page-intro"><span className="eyebrow">那些没说出口的话</span><h2>心声有处安放。</h2><p>不限次数，慢慢读。这里不需要回应。</p></div><div className="sticky-grid">{entries.map((entry, index) => <Link className={`sticky-note sticky-${index % 3}`} key={entry.id} href={entryUrl(entry)}><p>{entry.body}</p><span>{entry.authorName}</span><Heart size={14} /></Link>)}</div>{!entries.length && <Empty title="今晚的墙还很安静" description="点一杯，留下一点心声。" href="/bar/drinks" label="去点酒" />}<Link className="button lavender" href="/bar/drinks"><Wine size={17} />我也想写一句</Link>{selected && <GameDialog title="一张鼠鼠心声" close={() => router.push("/bar/wall")}>{current ? <><p className="whisper-body">{current.body}</p><p className="fineprint">{current.authorName} · {STATUS[current.status]}</p>{isPublic(current) && <Report entry={current} />}</> : <Empty title="这张纸条已被收起" description="它可能还在审核，或已不再公开。" />}</GameDialog>}</div>;
}
/** 原生模态管理焦点；关闭按钮与 Escape 共用点击路径，保持表单离开保护一致。 */
function GameDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null), closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { const previous = document.activeElement; const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, []);
  return <dialog ref={ref} className="game-dialog" aria-label={title} onCancel={event => { event.preventDefault(); closeRef.current?.click(); }}><div className="dialog-top"><h2>{title}</h2><button className="round-control" ref={closeRef} data-leave-form aria-label="关闭弹窗" onClick={close}><X size={20} /></button></div>{children}</dialog>;
}
/** 五种角色独立预览并即时保存；身份描述完全自愿，选择不影响任何权限或内容推荐。 */
function Characters() {
  const { state, dress } = useDemo(); const [saved, setSaved] = useState(false);
  return <div className="character-page"><div className="page-intro"><h2>不用成为谁，做自己就好。</h2><p>换个鼠鼠模样，故事还是你的。</p></div><div className="character-grid">{AVATARS.map(avatar => <button className={`character-card ${state.profile.avatar === avatar ? "selected" : ""}`} key={avatar} aria-pressed={state.profile.avatar === avatar} onClick={() => { dress(avatar, state.profile.identity); setSaved(true); }}><Portrait avatar={avatar} /><strong>{avatar}</strong><span>{state.profile.avatar === avatar ? "已选择" : "选这只鼠"}</span></button>)}</div><div className="identity-paper"><label htmlFor="mouse-identity">鼠鼠身份描述 <small>可选，仅自己设置</small></label><select id="mouse-identity" value={state.profile.identity} onChange={event => { dress(state.profile.avatar, event.target.value as typeof state.profile.identity); setSaved(true); }}>{IDENTITIES.map(identity => <option key={identity}>{identity}</option>)}</select><p>不用填真实信息。{state.profile.name}</p></div>{saved && <p role="status" className="feedback">已换好，回家就能见到新的自己。</p>}<Link className="button" href="/"><Home size={17} />回到我的家</Link><Link className="text-link" href="/home/records">我的作品与审核状态 <ArrowRight size={14} /></Link></div>;
}
/** 自己的菜品和心声集中在食记，取消原来的回复通知；隐藏和删除文本不回显。 */
function Records() {
  const demo = useDemo(); const mine = demo.state.entries.filter(entry => entry.authorId === demo.state.profile.id);
  return <div className="content-page"><div className="page-intro"><h2>我留下的小小痕迹</h2><p>菜品与心声，只记录自己。</p></div>{mine.length ? <div className="record-list">{mine.map(entry => <article className="record" key={entry.id}><span className={`status ${entry.status}`}>{STATUS[entry.status]}</span><h3>{["hidden", "deleted"].includes(entry.status) ? "这份内容已收起" : entry.title || entry.body}</h3><p>{entry.kind === "dish" ? "菜品" : "心声"}{entry.rewarded ? " · 烹饪奖励已发放" : ""}{entry.reason ? ` · ${entry.reason}` : ""}</p><div className="actions">{!["hidden", "deleted"].includes(entry.status) && <Link className="text-link" href={entryUrl(entry)}>查看内容</Link>}{entry.status !== "deleted" && <button className="text-button" onClick={() => { if (confirm("收起这份内容？已使用的次数和已发奖励不会重置。")) demo.remove(entry.id); }}>收起内容</button>}</div></article>)}</div> : <Empty title="还没有留下故事" description="去厨房做道菜，或到酒吧写下心事。" href="/restaurant/kitchen" label="去当大厨" />}</div>;
}
/** 设置集中展示规则、演示工具和个人记录，主场景无需承担后台说明或传统导航栏。 */
function SettingsPage() {
  const demo = useDemo();
  return <div className="content-page settings-page"><div className="settings-emblem"><Settings size={36} /><h2>按自己的节奏来。</h2></div><div className="settings-paper"><Link href="/home/characters" className="settings-link"><Heart size={18} />鼠鼠形象与身份<ArrowRight size={16} /></Link><Link href="/home/records" className="settings-link"><BookOpen size={18} />我的作品<ArrowRight size={16} /></Link><label className="setting-row"><span>减少动态效果<small>静态角色也能完成所有操作</small></span><input type="checkbox" checked={demo.reducedMotion} onChange={event => demo.setReducedMotion(event.target.checked)} /></label><details><summary>用餐与点酒规则</summary><p>北京时间每日 00:00 重置为 9 金币；00:00–11:59、12:00–17:59、18:00–23:59 各 3 次基础品尝。首次吃一道菜扣 1 金币，重看免费。</p><p>菜品审核通过奖励 1 金币和 1 张加餐券。基础次数用完后使用加餐券；加餐券可保留到次日，金币次日重置。每份菜品只奖励一次。</p><p>每天免费点酒 3 杯，成功提交心事才计次；失败或取消不计次，删除不退次数。心声墙随时可读。</p></details><details><summary>匿名与内容约定</summary><p>只出现鼠鼠与虚构地点；不能因改称鼠鼠就指向现实个人。禁止真实姓名、学校公司、地址、联系方式、政治和网暴内容。</p><p>故事类型由作者自述，不是事实核实；不设普通评论、私聊、好友或社交链。</p><p>当前匿名 ID 与数据只在本标签页，关闭标签页、清除数据或换设备后不保证恢复。</p></details><details><summary>试玩工具与素材说明</summary><p>当前仅演示本地规则，没有真实后端或 AI 审核。场景、角色、菜碟与饮品由 GPT Image 参考原型生成，经过透明处理、切帧与动画接入。</p><label className="setting-row"><span>模拟下一次提交失败</span><input type="checkbox" checked={demo.failNext} onChange={event => demo.setFailNext(event.target.checked)} /></label><div className="actions"><button className="button" onClick={() => { if (confirm("恢复初始内容与试玩额度？")) demo.reset(); }}>恢复试玩数据</button><button className="button subtle" onClick={() => { if (confirm("清空内容以体验空状态？")) demo.empty(); }}>清空内容</button></div><Link className="text-link" href="/admin">进入演示审核台 <ArrowRight size={14} /></Link></details></div><Link className="button" href="/">回到 MY HOME</Link></div>;
}
/** 举报保存为本地演示记录并展示已记录状态，不自动下架或虚构真实管理员接收。 */
function Report({ entry }: { entry: Entry }) {
  const demo = useDemo(); const [open, setOpen] = useState(false), [reason, setReason] = useState("现实身份或隐私"), [error, setError] = useState("");
  const done = demo.state.reports.some(report => report.entryId === entry.id);
  return <div className="report-area"><button className="text-button" disabled={done} onClick={() => setOpen(value => !value)}>{done ? "已记录演示举报" : "这份内容不妥？举报"}</button>{open && !done && <form onSubmit={event => { event.preventDefault(); try { demo.report(entry.id, reason); setOpen(false); } catch (error) { setError(error instanceof Error ? error.message : "举报失败。"); } }}><label>举报原因<select value={reason} onChange={event => setReason(event.target.value)}>{["现实身份或隐私", "造谣或网暴", "政治或违法内容", "其他不当内容"].map(value => <option key={value}>{value}</option>)}</select></label><button className="button subtle">记录举报</button><p className="fineprint">仅存本标签页，未发送真实审核服务。</p></form>}{error && <p role="alert">{error}</p>}</div>;
}
/** 演示审核展示完整待审内容，批准菜品触发一次奖励；其访问权限不代表正式管理员授权。 */
function DemoAdmin() {
  const demo = useDemo(); const [filter, setFilter] = useState<"pending" | "published">("pending"), [error, setError] = useState("");
  const entries = demo.state.entries.filter(entry => entry.status === filter);
  /** 非通过操作收集原因，取消时保持原状态；奖励只由数据层随首次通过发放。 */
  function act(id: string, status: "published" | "rejected" | "hidden") { const reason = status === "published" ? "" : prompt("请填写处理原因"); if (reason === null) return; try { demo.moderate(id, status, reason); setError(""); } catch (error) { setError(error instanceof Error ? error.message : "操作失败。"); } }
  return <div className="content-page"><p className="feedback">本地演示审核台，无管理员认证、无 AI 审核服务。仅修改当前标签页。</p><div className="tabs"><button aria-pressed={filter === "pending"} onClick={() => setFilter("pending")}>待审核</button><button aria-pressed={filter === "published"} onClick={() => setFilter("published")}>已公开</button></div>{error && <p className="feedback error" role="alert">{error}</p>}{entries.map(entry => <article className="moderation-row story-paper" key={entry.id}><span className="eyebrow">{entry.kind === "dish" ? "菜品" : "心声"} · {entry.authorName}</span><h2>{entry.title || "一份心事"}</h2>{entry.teaser && <p>{entry.teaser}</p>}<p className="story-body">{entry.body}</p><div className="actions">{filter === "pending" ? <><button className="button" onClick={() => act(entry.id, "published")}>通过</button><button className="button subtle" onClick={() => act(entry.id, "rejected")}>拒绝</button></> : <button className="button subtle" onClick={() => act(entry.id, "hidden")}>隐藏</button>}</div></article>)}{!entries.length && <Empty title="暂时没有待处理内容" description="新故事和心声提交后会在这里等候审核。" />}<details className="report-log"><summary>演示举报记录（{demo.state.reports.length}）</summary>{demo.state.reports.map(report => <p key={report.entryId}>{report.entryId}：{report.reason}</p>)}</details></div>;
}
/** 空状态保留明确恢复入口，同时用于没有内容及不可访问的条目。 */
function Empty({ title, description, href, label }: { title: string; description: string; href?: string; label?: string }) { return <div className="empty-state"><img src="/assets/world/rat-static.png" alt="" /><h2>{title}</h2><p>{description}</p>{href && <Link className="button" href={href}>{label}</Link>}</div>; }
