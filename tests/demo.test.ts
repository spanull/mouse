import assert from "node:assert/strict";
import { test } from "node:test";
import { addEntry, allowance, BLANK_DRAFT, countText, deleteEntry, initialState, isDemoState, isPublic, moderateEntry, period, rateDish, refreshDay, reportEntry, tasteDish, validateDraft } from "../src/lib/demo";
const morning = Date.parse("2026-10-30T03:59:59Z");
const noon = Date.parse("2026-10-30T04:00:00Z");
const evening = Date.parse("2026-10-30T10:00:00Z");
const midnight = Date.parse("2026-10-30T16:00:00Z");
const dish = { ...BLANK_DRAFT, title: "鼠鼠厨房的新故事", teaser: "今天下水道发生了一点新鲜事", body: "一只仓鼠去餐厅吃饭，发现厨师鼠偷偷把奶酪切成了爱心。" };
const whisper = { ...BLANK_DRAFT, kind: "whisper" as const, body: "今天也想休息一下" };

test("北京时间三个时段与午夜边界", () => {
  assert.equal(period(morning).slot, 0); assert.equal(period(noon).slot, 1); assert.equal(period(evening).slot, 2);
  assert.equal(period(evening - 1).slot, 1); assert.equal(period(midnight - 1).day, "2026-10-30");
  assert.equal(period(midnight).day, "2026-10-31"); assert.equal(period(midnight).slot, 0);
});
test("首次品尝扣费、三次封顶、重看免费、跨时段恢复", () => {
  let s = initialState(morning);
  for (let n = 1; n <= 3; n++) s = tasteDish(s, `dish-${n}`, morning);
  assert.equal(s.wallet.coins, 6); assert.equal(allowance(s, morning).remaining, 0);
  assert.throws(() => tasteDish(s, "dish-4", morning), /本场/);
  assert.equal(tasteDish(s, "dish-1", morning), s);
  s = tasteDish(s, "dish-4", noon); assert.equal(s.wallet.coins, 5); assert.deepEqual(s.wallet.meals, [3, 1, 0]);
});
test("烹饪仅首次审核通过奖励，可在基础额度用完后加餐", () => {
  let s = initialState(morning);
  for (let n = 1; n <= 3; n++) s = tasteDish(s, `dish-${n}`, morning);
  s = addEntry(s, dish, "my-dish", morning); assert.equal(s.wallet.bonus, 0); assert.equal(s.wallet.coins, 6);
  s = moderateEntry(s, "my-dish", "published", "", morning);
  assert.equal(s.wallet.coins, 7); assert.equal(s.wallet.bonus, 1);
  assert.throws(() => moderateEntry(s, "my-dish", "published", "", morning));
  s = tasteDish(s, "dish-4", morning); assert.equal(s.wallet.bonus, 0); assert.equal(s.wallet.coins, 6); assert.equal(s.wallet.meals[0], 3);
  s = moderateEntry(s, "my-dish", "hidden", "演示", morning); assert.equal(s.wallet.coins, 6);
});
test("午夜重置金币、基础餐次及饮品，保留加餐券和已读解锁", () => {
  let s = tasteDish(initialState(morning), "dish-1", morning);
  s = addEntry(s, whisper, "drink-1", morning); s = addEntry(s, dish, "cook-1", morning);
  s = moderateEntry(s, "cook-1", "published", "", morning);
  s = refreshDay(s, midnight);
  assert.equal(s.wallet.coins, 9); assert.equal(s.wallet.drinks, 0); assert.equal(s.wallet.bonus, 1); assert.deepEqual(s.wallet.meals, [0, 0, 0]);
  assert.equal(tasteDish(s, "dish-1", midnight), s);
});
test("饮品限三杯、幂等不重复计次、同标识不同正文拒绝、删除不退款", () => {
  let s = initialState(morning);
  for (let i = 0; i < 3; i++) s = addEntry(s, whisper, `w${i}`, morning);
  assert.equal(s.wallet.drinks, 3); assert.equal(s.wallet.coins, 9);
  assert.equal(addEntry(s, whisper, "w0", morning), s);
  assert.throws(() => addEntry(s, { ...whisper, body: "不同的心事" }, "w0", morning));
  assert.throws(() => addEntry(s, whisper, "w3", morning), /3 杯/);
  s = deleteEntry(s, "w0"); assert.equal(s.wallet.drinks, 3); assert.equal(s.entries.find(e => e.id === "w0")?.body, "");
});
test("评价必须先品尝，一票可改选，不能评价自己或已隐藏内容", () => {
  let s = initialState(morning);
  assert.throws(() => rateDish(s, "dish-1", "美味"));
  s = tasteDish(s, "dish-1", morning); s = rateDish(s, "dish-1", "美味"); s = rateDish(s, "dish-1", "震撼美味");
  assert.equal(Object.keys(s.ratings).length, 1); assert.equal(s.ratings["dish-1"], "震撼美味");
  s = moderateEntry(s, "dish-1", "hidden", "隐私", morning);
  assert.throws(() => rateDish(s, "dish-1", "难吃")); assert.throws(() => tasteDish(s, "dish-1", morning));
  s = addEntry(s, dish, "own", morning); s = moderateEntry(s, "own", "published", "", morning);
  assert.throws(() => rateDish(s, "own", "美味"));
});
test("输入边界、联系方式和旧评论类型均被校验", () => {
  assert.equal(countText(" 🍉鼠 "), 2);
  assert.ok(validateDraft({ ...dish, title: "短" }).title);
  assert.ok(validateDraft({ ...whisper, body: "  " }).body);
  assert.deepEqual(validateDraft({ ...whisper, body: "🍉".repeat(300) }), {});
  assert.ok(validateDraft({ ...whisper, body: "🍉".repeat(301) }).body);
  assert.ok(validateDraft({ ...dish, body: "联系我 13812345678 看更多故事" }).privacy);
  assert.ok(validateDraft({ ...dish, spice: 9 }).tags);
  assert.throws(() => addEntry(initialState(morning), { ...dish, kind: "comment" } as never, "x", morning));
});
test("私有内容不公开、隐藏不可品尝，举报去重，拒绝需原因", () => {
  let s = addEntry(initialState(morning), dish, "pending", morning);
  assert.equal(isPublic(s.entries[0]), false); assert.throws(() => tasteDish(s, "pending", morning));
  assert.throws(() => moderateEntry(s, "pending", "rejected", "", morning));
  assert.throws(() => deleteEntry(s, "dish-1"));
  s = reportEntry(s, "dish-1", "隐私"); assert.equal(reportEntry(s, "dish-1", "重复"), s);
  s = moderateEntry(s, "pending", "rejected", "修改身份线索", morning); assert.equal(s.wallet.bonus, 0);
});
test("无金币不许品尝，新快照结构完整且拒绝旧版或负额度", () => {
  const s = initialState(morning); assert.equal(isDemoState(s), true);
  assert.equal(isDemoState({ ...s, wallet: { ...s.wallet, coins: -1 } }), false);
  assert.equal(isDemoState({ version: 1, entries: [], notices: [] }), false);
  assert.equal(isDemoState({ ...s, entries: [{}] }), false); assert.equal(isDemoState(null), false);
  assert.throws(() => tasteDish({ ...s, wallet: { ...s.wallet, coins: 0 } }, "dish-1", morning), /金币不足/);
});
