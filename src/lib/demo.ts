export const AVATARS = ["花枝鼠", "仓鼠", "田鼠", "龙猫", "睡鼠"] as const;
export const IDENTITIES = ["不公开", "公直鼠", "母直鼠", "拉拉鼠", "gay鼠", "转性鼠", "无性鼠"] as const;
export const CATEGORIES = ["大厨制造", "重口爆炒", "清爽小菜"] as const;
export const TRUTHS = ["真实经历", "半真半假", "纯属虚构", "都市传说"] as const;
export const RATINGS = ["震撼美味", "超级美味", "美味", "普通", "难吃"] as const;
export const DRINKS = [
  { name: "晚安莓莓", color: "pink", description: "把今天的委屈，轻轻放下。", comfort: "今晚先不做勇敢的鼠。你已经很努力了。" },
  { name: "薄荷月光", color: "mint", description: "给乱糟糟的心，透一点气。", comfort: "不用现在就想明白。慢慢呼吸，我在这里。" },
  { name: "落日橘子", color: "orange", description: "给疲惫的自己，一点暖意。", comfort: "不是每天都要闪闪发光。休息也算好好生活。" },
  { name: "紫色星河", color: "purple", description: "收好那些，还说不出口的话。", comfort: "你的感受值得被听见。这杯星河，陪你坐一会儿。" },
] as const;
export type Kind = "dish" | "whisper";
export type Status = "pending" | "published" | "rejected" | "hidden" | "deleted";
export type Avatar = typeof AVATARS[number];
export type Identity = typeof IDENTITIES[number];
export type Rating = typeof RATINGS[number];
export type Draft = { kind: Kind; title: string; body: string; teaser: string; category: typeof CATEGORIES[number]; truth: typeof TRUTHS[number]; spice: number; drink: number };
export type Entry = Draft & { id: string; authorId: string; authorName: string; avatar: Avatar; status: Status; createdAt: string; reason: string; rewarded: boolean };
export type Profile = { id: string; name: string; avatar: Avatar; identity: Identity };
export type Wallet = { day: string; coins: number; meals: [number, number, number]; bonus: number; drinks: number };
export type DemoState = { version: 2; profile: Profile; entries: Entry[]; wallet: Wallet; tasted: string[]; ratings: Record<string, Rating>; reports: { entryId: string; reason: string }[] };
export const STATUS: Record<Status, string> = { pending: "待审核", published: "已公开", rejected: "未通过", hidden: "已隐藏", deleted: "已删除" };
export const SLOT_NAMES = ["早场", "午场", "晚场"];
export const BLANK_DRAFT: Draft = { kind: "dish", title: "", body: "", teaser: "", category: "清爽小菜", truth: "纯属虚构", spice: 2, drink: 0 };

/** 将任意时间转换成北京时间的日期与餐次；纯函数方便验证午夜、正午和十八点边界。 */
export function period(now = Date.now()) {
  const local = new Date(now + 8 * 3600000);
  const hour = local.getUTCHours();
  return { day: local.toISOString().slice(0, 10), slot: hour < 12 ? 0 : hour < 18 ? 1 : 2, next: hour < 12 ? "12:00" : hour < 18 ? "18:00" : "明日 00:00" };
}
/** 每日重置金币、基础餐次和点酒次数；已解锁菜品与未用的烹饪额外机会保留。 */
export function refreshDay(state: DemoState, now = Date.now()): DemoState {
  const { day } = period(now);
  return day === state.wallet.day ? state : { ...state, wallet: { day, coins: 9, meals: [0, 0, 0], bonus: state.wallet.bonus, drinks: 0 } };
}
/** 计算当前餐次剩余次数；只返回展示值，最终扣减仍通过 tasteDish 统一校验。 */
export function allowance(state: DemoState, now = Date.now()) {
  const current = refreshDay(state, now);
  return { ...period(now), ...current.wallet, remaining: 3 - current.wallet.meals[period(now).slot] };
}
/** 按 Unicode 码点统计去除首尾空白后的内容长度，使中文和表情采用一致规则。 */
export function countText(value: string) { return [...value.trim()].length; }
/** 校验菜品或树洞字段及明显联系方式；这里只做基础规则校验，不冒充 AI 内容审核。 */
export function validateDraft(draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!["dish", "whisper"].includes(draft.kind)) errors.kind = "不支持评论或回复。";
  if (draft.kind === "dish") {
    if (countText(draft.title) < 4 || countText(draft.title) > 40) errors.title = "菜名需要 4～40 个字符。";
    if (countText(draft.teaser) < 4 || countText(draft.teaser) > 100) errors.teaser = "菜单简介需要 4～100 个字符。";
    if (!CATEGORIES.includes(draft.category) || !TRUTHS.includes(draft.truth) || !Number.isInteger(draft.spice) || draft.spice < 1 || draft.spice > 5) errors.tags = "请选择有效的菜品标签。";
  }
  const min = draft.kind === "dish" ? 10 : 1, max = draft.kind === "dish" ? 2000 : 300;
  if (countText(draft.body) < min || countText(draft.body) > max) errors.body = `正文需要 ${min}～${max} 个字符，不能只输入空格。`;
  if (draft.kind === "whisper" && (!Number.isInteger(draft.drink) || !DRINKS[draft.drink])) errors.drink = "请选择一杯饮品。";
  if (/1[3-9]\d{9}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|微信号|身份证号/i.test(`${draft.title} ${draft.teaser} ${draft.body}`)) errors.privacy = "请移除电话、邮箱、链接等身份线索，再把故事留给鼠鼠世界。";
  return errors;
}
/** 创建确定性的全鼠世界虚构种子；正式匿名标识由提供者在浏览器初始化时生成。 */
export function initialState(now = Date.now(), id = "demo-mouse"): DemoState {
  const stories = [
    ["鼠老板的奶酪，竟然是假的", "整间餐厅都闻到了奶酪香，只有新来的鼠鼠发现了不对劲。", "奶酪餐厅的鼠老板每天都抱着一大块金黄奶酪，谁也不许碰。\n\n新来的田鼠打扫时发现，奶酪底下居然有开关。原来那是一台奶酪香薰机！\n\n最离谱的是，整条下水道的鼠都排队来买同款。鼠老板：饭可以不吃，氛围必须到位。", "重口爆炒", "纯属虚构", "花枝鼠"],
    ["室友鼠偷偷养了一个室友", "多出来的那份外卖，到底是给谁的？", "一号仓鼠发现，二号仓鼠每晚都点两份栗子饭。\n\n有天它提前回家，发现房间里多了一只圆滚滚的机械鼠。二号仓鼠很认真地说：它会扫地，我给它饭吃是礼貌。\n\n结果机械鼠肚子里已经攒了三斤栗子。", "清爽小菜", "半真半假", "仓鼠"],
    ["鼠鼠公司的神秘加班冠军", "每天最后走的同事，为什么从不领加班餐？", "蘑菇公司有只田鼠，每天都留到深夜。大家以为它在准备晋升。\n\n直到停电那天，鼠经理在储物间看见了它——正在用公司的大烤箱烤红薯。\n\n现在全公司都主动排班陪它加班，条件是一鼠分一个。", "大厨制造", "纯属虚构", "田鼠"],
    ["相亲对象是我家的送米鼠", "这碗尴尬拌饭，建议趁热围观。", "一号母鼠在相亲餐桌上，看到了天天送米的二号公鼠。\n\n它们对视了十秒，同时说了一句：你本人比头像圆。\n\n最后没聊成恋爱，倒是谈妥了包年送米。两只鼠都觉得这一趟来得很值。", "重口爆炒", "纯属虚构", "龙猫"],
    ["树洞里传来第三只鼠的声音", "只有两只鼠的合租屋，半夜总有谁在唱歌。", "睡鼠和田鼠合租在一棵老树里。每到半夜，墙里就传来走调的歌声。\n\n它们鼓起勇气挖开木板，发现是去年丢失的音乐盒。\n\n但音乐盒里还有一张新纸条：唱得不好，多多包涵。", "大厨制造", "都市传说", "睡鼠"],
    ["偷偷休假的鼠，竟成了销冠", "当大家忙着开会，它已经去河边钓米了。", "田鼠不想再参加第十八次效率会议，便请假去河边发呆。\n\n碰巧遇见隔壁餐厅的厨师鼠，两只鼠聊了一下午食谱。\n\n第二天，餐厅送来了全年订货单。田鼠把工作总结写成四个字：适当发呆。", "清爽小菜", "半真半假", "田鼠"],
  ];
  const entries: Entry[] = stories.map(([title, teaser, body, category, truth, avatar], i) => ({ ...BLANK_DRAFT, id: `dish-${i + 1}`, title, teaser, body, category: category as Draft["category"], truth: truth as Draft["truth"], avatar: avatar as Avatar, spice: i % 5 + 1, authorId: `guest-${i}`, authorName: `匿名${avatar}${i + 1}号`, status: "published", createdAt: "2026-10-30T08:00:00Z", reason: "", rewarded: false }));
  ["今天没有完成所有事，但我记得给自己煮了一碗热饭。", "搬到新的下水道，有一点孤单。希望慢慢也能把这里叫作家。", "不想当最厉害的鼠了，想当一只睡得很好的鼠。", "终于说出了那句不愿意。手还在抖，但心里轻了一点。", "偷偷期待明天会发生一点点好事。", "今晚就把难过寄存在这里，明天轻一点出门。"].forEach((body, i) => entries.push({ ...BLANK_DRAFT, id: `whisper-${i + 1}`, kind: "whisper", body, drink: i % 4, avatar: AVATARS[i % 5], authorId: `bar-${i}`, authorName: `匿名小鼠${i + 1}号`, status: "published", createdAt: "2026-10-30T09:00:00Z", reason: "", rewarded: false }));
  return { version: 2, profile: { id, name: `匿名鼠${id === "demo-mouse" ? "初来" : id.slice(0, 6)}号`, avatar: "花枝鼠", identity: "不公开" }, entries, wallet: { day: period(now).day, coins: 9, meals: [0, 0, 0], bonus: 0, drinks: 0 }, tasted: [], ratings: {}, reports: [] };
}
/** 公开查询只接受已审核条目；树洞随机气泡、墙面和菜单共享这一规则。 */
export function isPublic(entry: Entry) { return entry.status === "published"; }
/** 映射直接访问地址，菜品正文仍需在详情页通过配额解锁。 */
export function entryUrl(entry: Entry) { return entry.kind === "dish" ? `/restaurant/dish/${entry.id}` : `/bar/wall/${entry.id}`; }
/** 首次品尝原子扣除金币与一个机会；重看不扣费，基础机会用尽后才使用烹饪奖励。 */
export function tasteDish(input: DemoState, id: string, now = Date.now()): DemoState {
  const state = refreshDay(input, now);
  const entry = state.entries.find(item => item.id === id && item.kind === "dish" && isPublic(item));
  if (!entry) throw new Error("这道菜暂时下架了。");
  if (state.tasted.includes(id) || entry.authorId === state.profile.id) return state;
  const { slot } = period(now), wallet = state.wallet;
  if (wallet.coins < 1) throw new Error("金币不足，去厨房做一道菜，或等明天再来。");
  if (wallet.meals[slot] >= 3 && wallet.bonus < 1) throw new Error(`本场已品尝 3 道菜。${period(now).next} 开新场，或烹饪获奖后继续。`);
  const meals = [...wallet.meals] as Wallet["meals"];
  const useBonus = meals[slot] >= 3;
  if (!useBonus) meals[slot]++;
  return { ...state, tasted: [...state.tasted, id], wallet: { ...wallet, coins: wallet.coins - 1, meals, bonus: wallet.bonus - Number(useBonus) } };
}
/** 创建待审核菜品或树洞；幂等先于额度校验，失败不会扣点酒次数，同标识不同内容明确拒绝。 */
export function addEntry(input: DemoState, draft: Draft, id: string, now = Date.now()): DemoState {
  const state = refreshDay(input, now);
  const clean = { ...draft, title: draft.title.trim(), teaser: draft.teaser.trim(), body: draft.body.trim() };
  const previous = state.entries.find(item => item.id === id);
  if (previous) {
    if (previous.authorId !== state.profile.id || Object.keys(clean).some(key => previous[key as keyof Draft] !== clean[key as keyof Draft])) throw new Error("请求标识已用于其他内容，请重新提交。");
    return state;
  }
  if (!id || Object.keys(validateDraft(clean)).length) throw new Error("请检查输入和标签后再提交。");
  if (draft.kind === "whisper" && state.wallet.drinks >= 3) throw new Error("今天的 3 杯已喝完，明天再来坐坐。心声墙仍可随时看。");
  const entry: Entry = { ...clean, id, authorId: state.profile.id, authorName: state.profile.name, avatar: state.profile.avatar, status: "pending", createdAt: new Date(now).toISOString(), reason: "", rewarded: false };
  return { ...state, entries: [entry, ...state.entries], wallet: { ...state.wallet, drinks: state.wallet.drinks + Number(draft.kind === "whisper") } };
}
/** 作者可删除自己的条目；清空文本但保留奖励标记及配额记录，防止删除后重复获取权益。 */
export function deleteEntry(state: DemoState, id: string): DemoState {
  const entry = state.entries.find(item => item.id === id);
  if (!entry || entry.authorId !== state.profile.id) throw new Error("只能收起自己的内容。");
  return { ...state, entries: state.entries.map(item => item.id === id ? { ...item, status: "deleted", title: "", teaser: "", body: "" } : item) };
}
/** 模拟审核及首次烹饪奖励；奖励与状态同一次更新，重复审核、隐藏或树洞不会重复发奖。 */
export function moderateEntry(input: DemoState, id: string, status: "published" | "rejected" | "hidden", reason: string, now = Date.now()): DemoState {
  const state = refreshDay(input, now), target = state.entries.find(entry => entry.id === id);
  if (!target || (status === "hidden" ? target.status !== "published" : target.status !== "pending")) throw new Error("状态已变化，请刷新后重试。");
  if (status !== "published" && !reason.trim()) throw new Error("请填写处理原因。");
  const reward = status === "published" && target.kind === "dish" && target.authorId === state.profile.id && !target.rewarded;
  return { ...state, entries: state.entries.map(entry => entry.id === id ? { ...entry, status, reason: reason.trim(), rewarded: entry.rewarded || reward } : entry), wallet: { ...state.wallet, coins: state.wallet.coins + Number(reward), bonus: state.wallet.bonus + Number(reward) } };
}
/** 五档评价每只鼠每道菜一票，可改选；必须已经品尝公开菜品，不能评价自己的菜。 */
export function rateDish(state: DemoState, id: string, rating: Rating): DemoState {
  const entry = state.entries.find(item => item.id === id && item.kind === "dish" && isPublic(item));
  if (!entry || !state.tasted.includes(id) || entry.authorId === state.profile.id || !RATINGS.includes(rating)) throw new Error("品尝公开菜品后才能评价，不能评价自己的菜。");
  return { ...state, ratings: { ...state.ratings, [id]: rating } };
}
/** 保存本地演示举报并按条目去重；不自动隐藏内容，也不声称已发送至真实管理员。 */
export function reportEntry(state: DemoState, id: string, reason: string): DemoState {
  if (!state.entries.some(entry => entry.id === id && isPublic(entry)) || !reason.trim()) throw new Error("内容不可访问或缺少举报原因。");
  return state.reports.some(report => report.entryId === id) ? state : { ...state, reports: [...state.reports, { entryId: id, reason: reason.trim() }] };
}
/** 检查 V2 快照的必需字段、额度与枚举；旧 V1 数据保留在原键中，不能混入新产品模型。 */
export function isDemoState(value: unknown): value is DemoState {
  if (!value || typeof value !== "object") return false;
  const s = value as DemoState;
  /** 快照中的权益只能是非负安全整数，防止损坏字段参与消费计算。 */
  const integer = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  return s.version === 2 && !!s.profile && typeof s.profile.id === "string" && typeof s.profile.name === "string" && AVATARS.includes(s.profile.avatar) && IDENTITIES.includes(s.profile.identity) &&
    !!s.wallet && /^\d{4}-\d{2}-\d{2}$/.test(s.wallet.day) && integer(s.wallet.coins) && integer(s.wallet.bonus) && integer(s.wallet.drinks) && s.wallet.drinks <= 3 && Array.isArray(s.wallet.meals) && s.wallet.meals.length === 3 && s.wallet.meals.every(n => integer(n) && n <= 3) &&
    Array.isArray(s.entries) && s.entries.every(e => e && typeof e.id === "string" && ["dish", "whisper"].includes(e.kind) && Object.hasOwn(STATUS, e.status) && [e.title, e.teaser, e.body, e.reason, e.authorId, e.authorName].every(v => typeof v === "string") && AVATARS.includes(e.avatar) && CATEGORIES.includes(e.category) && TRUTHS.includes(e.truth) && integer(e.spice) && e.spice >= 1 && e.spice <= 5 && integer(e.drink) && e.drink < DRINKS.length && typeof e.rewarded === "boolean" && Number.isFinite(Date.parse(e.createdAt))) &&
    Array.isArray(s.tasted) && s.tasted.every(id => typeof id === "string") && !!s.ratings && typeof s.ratings === "object" && !Array.isArray(s.ratings) && Object.values(s.ratings).every(r => RATINGS.includes(r)) && Array.isArray(s.reports) && s.reports.every(r => r && typeof r.entryId === "string" && typeof r.reason === "string");
}
