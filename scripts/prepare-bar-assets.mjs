import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const output = "public/assets/bar";
const flare = process.argv.includes("--flare");
const referenceStyle = process.argv.includes("--reference");
const cozy = flare || referenceStyle || process.argv.includes("--cozy");
const actionPrefix = flare ? "bar-flare-mole" : referenceStyle ? "bar-reference-mole" : "bar-cozy-mole";
const actionFile = flare ? "art-source/bar-flare-actions.json" : referenceStyle ? "art-source/bar-reference-actions.json" : "art-source/bar-cozy-actions.json";
const cozyTasks = cozy ? JSON.parse(await readFile(actionFile, "utf8")) : {};
// 仅固定已逐项复查的本轮版本，后续新增重做任务不会自动覆盖当前采用素材。
const flareVersions = { idle: 1, welcome: 1, listen: 1, comfort: 1, polish: 4, shake: 1, pour: 5, serve: 1 };
const review = flare ? "art-source/review/bar-flare" : cozy ? "art-source/review/bar-redesign" : "art-source/review/bar-room";
await mkdir(output, { recursive: true });
await mkdir(review, { recursive: true });
const records = [], geometry = [], actors = {};

/** 保存接口生成像素及来源；只写入当前酒吧目录，历史场景和原图保持可追溯。 */
async function save(name, buffer, record) {
  const path = `${output}/${name}.png`;
  await sharp(buffer).png().toFile(path);
  const metadata = await sharp(path).metadata();
  records.push({ file: path.replace("public", ""), source: record.file, promptFile: `art-source/generated/${record.asset}.json`, width: metadata.width, height: metadata.height });
  return path.replace("public", "");
}

/** 读取完整原图并按固定网格切帧；兼容接口尺寸取整，只清理色键和几乎透明的背景像素。 */
async function cells(name, columns, rows) {
  const record = JSON.parse(await readFile(`art-source/generated/${name}.json`, "utf8"));
  const { data, info } = await sharp(record.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const purpleProp = /-(pour|serve|drinks-entry)-/.test(name);
  for (let i = 0; i < data.length; i += 4) {
    // 品红只用于抠图；保留酒液和入口淡紫色，避免宽泛色相判断把真实道具挖空。
    if ((!flare || !name.startsWith("bar-flare-")) && (cozy ? data[i] > 170 && data[i + 2] > 170 && data[i + 1] < 100 && Math.abs(data[i] - data[i + 2]) < 65 : data[i] > 110 && data[i + 2] > 110 && data[i] - data[i + 1] > 40 && data[i + 2] - data[i + 1] > 40)) data[i + 3] = 0;
    if (flare && data[i] > 245 && data[i + 2] > 245 && data[i + 1] < 15) data[i + 3] = 0;
    if (flare && !purpleProp && data[i] > 110 && data[i + 2] > 110 && data[i + 1] < 100 && data[i] - data[i + 1] > 40 && data[i + 2] - data[i + 1] > 40) data[i + 3] = 0;
    if (data[i + 3] < 20) data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
  }
  if (flare) {
    // 只沿外部透明背景清理品红混色边缘，玻璃杯内部被轮廓包围的真实紫色酒液保留。
    const seen = new Uint8Array(info.width * info.height), queue = new Int32Array(seen.length);
    let head = 0, tail = 0;
    /** 将与背景相连的透明或品红像素加入队列；只处理色键，不重绘人物边缘。 */
    function visit(pixel) {
      if (seen[pixel]) return;
      seen[pixel] = 1;
      const i = pixel * 4;
      if (data[i + 3] > 0 && !(data[i] > 110 && data[i + 2] > 110 && data[i + 1] < 100 && data[i] - data[i + 1] > 40 && data[i + 2] - data[i + 1] > 40)) return;
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
      queue[tail++] = pixel;
    }
    for (let x = 0; x < info.width; x++) { visit(x); visit((info.height - 1) * info.width + x); }
    for (let y = 0; y < info.height; y++) { visit(y * info.width); visit(y * info.width + info.width - 1); }
    while (head < tail) {
      const pixel = queue[head++], x = pixel % info.width, y = Math.floor(pixel / info.width);
      if (x) visit(pixel - 1); if (x + 1 < info.width) visit(pixel + 1);
      if (y) visit(pixel - info.width); if (y + 1 < info.height) visit(pixel + info.width);
    }
  }
  /** 在预期网格附近寻找真实透明行列间隔，避免接口布局轻微偏移时切断脚掌；不改变任何主体像素。 */
  function boundaries(count, vertical) {
    const length = vertical ? info.height : info.width;
    const density = Array(length).fill(0);
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 128) density[vertical ? y : x]++;
    const cuts = [0];
    for (let i = 1; i < count; i++) {
      const target = length * i / count, radius = length / count * .15;
      let best = Math.round(target), score = Infinity;
      for (let cut = Math.ceil(target - radius); cut <= Math.floor(target + radius); cut++) {
        const candidate = density.slice(cut - 2, cut + 3).reduce((sum, value) => sum + value, 0) * length + Math.abs(cut - target);
        if (candidate < score) { score = candidate; best = cut; }
      }
      cuts.push(best);
    }
    return [...cuts, length];
  }
  const xs = boundaries(columns, false), ys = boundaries(rows, true);
  const parts = [];
  for (let i = 0; i < columns * rows; i++) {
    const col = i % columns, row = Math.floor(i / columns);
    const left = xs[col], top = ys[row];
    const width = xs[col + 1] - left, height = ys[row + 1] - top;
    const raw = await sharp(data, { raw: info }).extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
    const bounds = measure(raw.data, raw.info);
    if (bounds.top < 2 || bounds.left < 2 || bounds.right >= width - 2 || bounds.bottom >= height - 2) throw new Error(`${name} 第${i + 1}帧贴边，需重做素材`);
    parts.push({ ...raw, bounds, density: 256 / (info.width / columns), record, index: i });
  }
  return parts;
}

/** 测量可见像素与最低接触区域；手臂、尾巴和道具不会影响人物或凳脚的水平锚点。 */
function measure(data, info) {
  let left = info.width, right = -1, top = info.height, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] <= 128) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (bottom < 0) throw new Error("动作帧没有可见主体");
  let footLeft = info.width, footRight = -1;
  for (let y = Math.max(top, bottom - 4); y <= bottom; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] <= 128) continue;
    footLeft = Math.min(footLeft, x); footRight = Math.max(footRight, x);
  }
  return { left, right, top, bottom, footX: (footLeft + footRight) / 2 };
}

/** 全角色共用一次等比规格归一，逐帧只按真实脚底对齐；不缩放单帧、不拼接家具或复制姿势。 */
async function actor(key, definitions, targetHeight) {
  const groups = [];
  for (const definition of definitions) {
    const source = await cells(definition.source, definition.columns ?? 4, definition.rows);
    groups.push({ ...definition, frames: source.slice(definition.from ?? 0, definition.to ?? source.length) });
  }
  const first = groups[0].frames[0];
  // 接口会改变整张动作表的留白占比；仅以每张母版首姿的头顶至脚底做一次整组规格归一，绝不逐帧修饰变形。
  const sourceScales = new Map();
  for (const group of groups) if (!sourceScales.has(group.source)) {
    const neutral = group.frames[0];
    sourceScales.set(group.source, targetHeight / ((neutral.bounds.bottom - neutral.bounds.top + 1) * neutral.density));
  }
  const frameSize = 320, baseline = 300, poses = {};
  for (const group of groups) {
    const frames = [];
    for (const frame of group.frames) {
      const groupScale = sourceScales.get(group.source);
      const ratio = frame.density * groupScale;
      const width = Math.round(frame.info.width * ratio), height = Math.round(frame.info.height * ratio);
      const raw = await sharp(frame.data, { raw: frame.info }).resize(width, height, { kernel: "nearest" }).raw().toBuffer({ resolveWithObject: true });
      const bounds = measure(raw.data, raw.info);
      const left = Math.round(160 - bounds.footX), top = baseline - bounds.bottom;
      if (left + bounds.left < 5 || left + bounds.right > 314 || top + bounds.top < 5) throw new Error(`${key}/${group.pose}/${frame.index}超出共同画布安全区，需复查原图规格`);
      // 只裁掉画布外的透明空白；完整保留可见角色、道具和凳子。
      const cutLeft = Math.max(0, -left), cutTop = Math.max(0, -top);
      const clipped = await sharp(raw.data, { raw: raw.info }).extract({ left: cutLeft, top: cutTop, width: Math.min(width - cutLeft, frameSize - Math.max(0, left)), height: Math.min(height - cutTop, frameSize - Math.max(0, top)) }).png().toBuffer();
      frames.push(await sharp({ create: { width: frameSize, height: frameSize, channels: 4, background: "#00000000" } }).composite([{ input: clipped, left: Math.max(0, left), top: Math.max(0, top) }]).png().toBuffer());
      geometry.push({ actor: key, pose: group.pose, frame: frame.index, sourceHeight: frame.bounds.bottom - frame.bounds.top + 1, density: frame.density, commonScale: groupScale, height: bounds.bottom - bounds.top + 1, baseline, footX: bounds.footX + left });
    }
    const sheet = await sharp({ create: { width: frameSize * frames.length, height: frameSize, channels: 4, background: "#00000000" } }).composite(frames.map((input, i) => ({ input, left: i * frameSize, top: 0 }))).png().toBuffer();
    const file = await save(`${key}-${group.pose}`, sheet, first.record.asset === group.source ? first.record : group.frames[0].record);
    if (group.pose === "idle") await save(`${key}-static`, await sharp(sheet).extract({ left: 0, top: 0, width: frameSize, height: frameSize }).png().toBuffer(), group.frames[0].record);
    await sharp({ create: { width: frameSize * 4, height: frameSize * Math.ceil(frames.length / 4), channels: 4, background: "#fff3d9" } }).composite(frames.map((input, i) => ({ input, left: i % 4 * frameSize, top: Math.floor(i / 4) * frameSize }))).png().toFile(`${review}/${key}-${group.pose}.png`);
    poses[group.pose] = { file, frameCount: frames.length, durations: frames.map((_, i) => group.pose === "idle" ? (i === 0 ? 3600 : i === frames.length - 1 ? 700 : 110) : group.duration ?? 180), loop: group.pose === "idle" };
  }
  actors[key] = { frameSize, fallback: `/assets/bar/${key}-static.png`, poses };
}

for (const orientation of ["wide", "tall"]) {
  const source = flare ? `bar-flare-room-${orientation}-v1` : referenceStyle ? `bar-reference-room-${orientation}-v3` : `${cozy ? "bar-cozy-room" : "bar-room"}-${orientation}-v1`;
  const record = JSON.parse(await readFile(`art-source/generated/${source}.json`, "utf8"));
  await save(`room-${orientation}`, await readFile(record.file), record);
}
if (cozy) for (const entry of ["wall", "drinks"]) {
  const part = (await cells(`${flare ? "bar-flare" : referenceStyle ? "bar-reference" : "bar-cozy"}-${entry}-entry-v1`, 1, 1))[0];
  await save(`entrance-${entry}`, await sharp(part.data, { raw: part.info }).trim({ threshold: 1 }).resize({ width: 480, kernel: "nearest" }).png().toBuffer(), part.record);
}
const stool = (await cells("bar-empty-stool-v2", 1, 1))[0];
await save("empty-stool", await sharp(stool.data, { raw: stool.info }).trim({ threshold: 1 }).resize({ width: 320, kernel: "nearest" }).png().toBuffer(), stool.record);
for (const species of ["dormouse", "hamster"]) await actor(`patron-${species}`, [
  { pose: "idle", source: `bar-patron-${species}-v1`, rows: 5, from: 0, to: 8 },
  { pose: "leisure", source: `bar-patron-${species}-v1`, rows: 5, from: 8, to: 20, duration: 180 },
], 265);
if (!process.argv.includes("--guests-only")) await actor("mole", cozy ? [
  ...["idle", "welcome", "listen", "comfort", "polish", "shake", "pour", "serve"].map(pose => ({ pose, source: flare ? `${actionPrefix}-${pose}-v${flareVersions[pose]}` : Object.keys(cozyTasks).filter(key => key.startsWith(`${actionPrefix}-${pose}-`)).at(-1), rows: 3, from: 0, to: 12, duration: ["shake", "pour", "serve"].includes(pose) ? 200 : 180 })),
] : [
  { pose: "idle", source: "bar-mole-social-v1", rows: 6, from: 0, to: 12 },
  { pose: "welcome", source: "bar-mole-social-v1", rows: 6, from: 12, to: 24 },
  { pose: "listen", source: "bar-mole-care-v2", rows: 6, from: 0, to: 12 },
  { pose: "comfort", source: "bar-mole-care-v1", rows: 6, from: 12, to: 24 },
  { pose: "polish", source: "bar-mole-polish-sunburst-v3", rows: 3, from: 0, to: 12 },
  { pose: "shake", source: "bar-mole-shake-sunburst-v2", rows: 3, from: 0, to: 12, duration: 200 },
  { pose: "pour", source: "bar-mole-delivery-v1", rows: 6, from: 0, to: 12, duration: 200 },
  { pose: "serve", source: "bar-mole-delivery-v1", rows: 6, from: 12, to: 24, duration: 200 },
], 240);
const manifest = { version: 1, approvalStatus: "pending-visual-review", actors, assets: records };
await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n", "utf8");
await writeFile(`${review}/geometry.json`, JSON.stringify(geometry, null, 2) + "\n", "utf8");
console.log(`已导出${records.length}项酒吧素材，仍需逐帧、循环及实景复查。`);
