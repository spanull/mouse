import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const output = "public/assets/natural";
await mkdir(output, { recursive: true });
await mkdir("art-source/review/natural", { recursive: true });
const actors = {}, objects = {}, records = [];

/** 读取接口原图，只去除色键并保留原有透明；不合成姿势、不平移补帧、不绘制替代美术。 */
async function source(name) {
  const record = JSON.parse(await readFile(`art-source/generated/${name}.json`, "utf8"));
  const { data, info } = await sharp(record.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 110 && data[i + 2] > 110 && data[i] - data[i + 1] > 40 && data[i + 2] - data[i + 1] > 40) data[i + 3] = 0;
    if (name === "ambient-steam-v2" && data[i + 1] > 100 && data[i + 1] - data[i] > 35 && data[i + 1] - data[i + 2] > 35) data[i + 3] = 0;
    if (data[i + 3] < 20) data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
  }
  return { data, info, record };
}

/** 按规则网格切出真实生成帧；检测可见边界，完整保留家具与角色，不按每帧单独缩放。 */
async function cells(name, columns, rows) {
  const sheet = await source(name), parts = [];
  /** 在预期网格附近寻找实际透明间隔，兼容生成图行距轻微偏差；不跨过人物像素硬切。 */
  function boundaries(count, vertical) {
    const length = vertical ? sheet.info.height : sheet.info.width;
    const cross = vertical ? sheet.info.width : sheet.info.height;
    const sums = Array(length).fill(0);
    for (let y = 0; y < sheet.info.height; y++) for (let x = 0; x < sheet.info.width; x++) if (sheet.data[(y * sheet.info.width + x) * 4 + 3] > 80) sums[vertical ? y : x]++;
    const result = [0];
    for (let i = 1; i < count; i++) {
      const expected = length * i / count, radius = length / count * .16;
      let best = Math.round(expected), score = Infinity;
      for (let j = Math.ceil(expected - radius); j <= Math.floor(expected + radius); j++) {
        const density = sums.slice(Math.max(0, j - 2), j + 3).reduce((a, b) => a + b, 0);
        const candidate = density * cross + Math.abs(j - expected);
        if (candidate < score) { score = candidate; best = j; }
      }
      result.push(best);
    }
    return [...result, length];
  }
  const xs = boundaries(columns, false), ys = boundaries(rows, true);
  for (let index = 0; index < columns * rows; index++) {
    const col = index % columns, row = Math.floor(index / columns);
    const cw = xs[col + 1] - xs[col], ch = ys[row + 1] - ys[row];
    const { data, info } = await sharp(sheet.data, { raw: sheet.info }).extract({ left: xs[col], top: ys[row], width: cw, height: ch }).raw().toBuffer({ resolveWithObject: true });
    // 蒸汽保留每格的原始空间位置和自然消散留白，不能按可见边界重置到脚底而抵消上升过程。
    if (name.startsWith("ambient-steam")) {
      parts.push({ buffer: await sharp(data, { raw: info }).resize(384, 384, { fit: "contain", background: "#00000000", kernel: "nearest" }).png().toBuffer(), width: 384, height: 384, record: sheet.record });
      continue;
    }
    let l = cw, r = -1, t = ch, b = -1;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (data[(y * cw + x) * 4 + 3] > 80) { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); }
    if (r < l) throw new Error(`${name} 第 ${index + 1} 帧为空`);
    if (l < 1 || t < 1 || r >= cw - 1 || b >= ch - 1) throw new Error(`${name} 第 ${index + 1} 帧贴边，需复查原图`);
    const unit = 384 / (sheet.info.width / columns);
    const width = Math.round((r - l + 1) * unit), height = Math.round((b - t + 1) * unit);
    parts.push({ buffer: await sharp(data, { raw: info }).extract({ left: l, top: t, width: r - l + 1, height: b - t + 1 }).resize(width, height, { kernel: "nearest" }).png().toBuffer(), width, height, record: sheet.record });
  }
  return parts;
}

/** 保存运行图与来源记录；所有输出都是已生成像素的整理，不将接口成功自动标记为视觉通过。 */
async function save(name, buffer, sourceRecord) {
  const file = `${output}/${name}.png`;
  await sharp(buffer).png({ palette: true, colours: 192, dither: 0 }).toFile(file);
  const m = await sharp(file).metadata();
  records.push({ file: file.replace("public", ""), source: sourceRecord.file, promptFile: `art-source/generated/${sourceRecord.asset}.json`, width: m.width, height: m.height, bytes: (await readFile(file)).length });
  return file.replace("public", "");
}

/** 同一角色全部动作使用同一缩放与脚底基准；仅对齐原图网格留白，不人为制造运动。 */
async function actor(key, definitions, frameSize = 192) {
  const groups = [];
  for (const definition of definitions) {
    const all = await cells(definition.source, definition.columns ?? 4, definition.rows ?? 3);
    groups.push({ ...definition, parts: all.slice(definition.from ?? 0, definition.to ?? all.length) });
  }
  const parts = groups.flatMap(g => g.parts);
  const scale = Math.min((frameSize - 24) / Math.max(...parts.map(p => p.width)), (frameSize - 24) / Math.max(...parts.map(p => p.height)));
  const poses = {};
  let furnitureBase;
  for (const group of groups) {
    const frames = [];
    for (const part of group.parts) {
      const width = Math.round(part.width * scale), height = Math.round(part.height * scale);
      frames.push(await sharp({ create: { width: frameSize, height: frameSize, channels: 4, background: "#00000000" } }).composite([{ input: await sharp(part.buffer).resize(width, height, { kernel: "nearest" }).png().toBuffer(), left: Math.round((frameSize - width) / 2), top: frameSize - 12 - height }]).png().toBuffer());
    }
    // 固定桌腿、座面及落脚区域复用首帧生成像素，避免模型逐帧重画家具导致漂移；上部动作仍为真实生成姿势。
    if (key === "chef" || key.startsWith("patron-")) {
      const split = Math.round(frameSize * (key === "chef" ? .68 : .62));
      furnitureBase ??= await sharp(frames[0]).extract({ left: 0, top: split, width: frameSize, height: frameSize - split }).png().toBuffer();
      for (let i = 0; i < frames.length; i++) frames[i] = await sharp({ create: { width: frameSize, height: frameSize, channels: 4, background: "#00000000" } }).composite([
        { input: await sharp(frames[i]).extract({ left: 0, top: 0, width: frameSize, height: split }).png().toBuffer(), left: 0, top: 0 },
        { input: furnitureBase, left: 0, top: split },
      ]).png().toBuffer();
    }
    const sheet = await sharp({ create: { width: frameSize * frames.length, height: frameSize, channels: 4, background: "#00000000" } }).composite(frames.map((input, i) => ({ input, left: i * frameSize, top: 0 }))).png().toBuffer();
    const file = await save(`${key}-${group.pose}`, sheet, group.parts[0].record);
    poses[group.pose] = { file, frameCount: frames.length, durations: frames.map((_, i) => key === "squirrel" ? (i === 0 ? 3500 : i === frames.length - 1 ? 22000 : 130) : group.pose === "idle" && !group.duration ? (i === 0 ? 3400 : 85) : group.duration ?? 125), loop: group.loop ?? group.pose === "idle" };
    if (group.pose === "idle") await save(`${key}-static`, frames[0], group.parts[0].record);
    const columns = 4, rows = Math.ceil(frames.length / columns);
    await sharp({ create: { width: columns * frameSize, height: rows * frameSize, channels: 4, background: "#fff3db" } }).composite(frames.map((input, i) => ({ input, left: i % columns * frameSize, top: Math.floor(i / columns) * frameSize }))).png().toFile(`art-source/review/natural/${key}-${group.pose}.png`);
  }
  actors[key] = { frameSize, fallback: `/assets/natural/${key}-static.png`, poses };
}

for (const direction of ["tall", "wide"]) for (const scene of ["bar", "restaurant"]) {
  const record = JSON.parse(await readFile(`art-source/generated/${scene}-clear-${direction}.json`, "utf8"));
  objects[`${scene}-${direction}`] = await save(`${scene}-${direction}`, await sharp(record.file).resize(direction === "tall" ? 768 : 1152, direction === "tall" ? 1152 : 768, { fit: "cover", kernel: "nearest" }).png().toBuffer(), record);
}
const stool = (await cells("bar-empty-stool", 1, 1))[0];
objects.stool = await save("empty-stool", await sharp(stool.buffer).resize(180, 180, { fit: "inside", kernel: "nearest" }).png().toBuffer(), stool.record);
for (const key of ["rat", "hamster", "field", "chinchilla", "dormouse"]) await actor(key, [
  { pose: "idle", source: `${key}-natural`, rows: 4, from: 0, to: 8 },
  { pose: "pressed", source: `${key}-natural`, rows: 4, from: 8, to: 16 },
  { pose: "leisure", source: `${key}-leisure` },
]);
await actor("mole", ["idle", "welcome", "listen", "polish", "shake", "pour", "serve", "comfort"].map(pose => ({ pose, source: `mole-natural-${pose}`, loop: ["idle", "shake"].includes(pose), duration: pose === "idle" ? undefined : pose === "shake" ? 110 : 150 })));
await actor("chef", [
  { pose: "idle", source: "chef-workstation", duration: 160, loop: true },
  { pose: "leisure", source: "chef-taste", duration: 150 },
  { pose: "pressed", source: "chef-greet", duration: 150 },
], 256);
for (const key of ["patron-dormouse", "patron-hamster"]) await actor(key, [
  { pose: "idle", source: `${key}-actions`, rows: 4, from: 0, to: 8 },
  { pose: "leisure", source: `${key}-actions`, rows: 4, from: 8, to: 16, duration: 180 },
], 256);
for (const key of ["leaves", "lantern", "steam"]) await actor(key, [{ pose: "idle", source: key === "steam" ? "ambient-steam-v2" : `ambient-${key}`, duration: 160, loop: true }]);
await actor("squirrel", [{ pose: "idle", source: "squirrel-visit", rows: 4 }], 256);
const manifest = { version: 1, approvalStatus: "pending-visual-review", actors, objects, assets: records };
await writeFile("public/assets/natural/manifest.json", JSON.stringify(manifest, null, 2) + "\n", "utf8");
// 重新导出时同步撤销根清单的旧验收状态，避免运行文件变更后仍错误显示为已通过。
const rootManifest = JSON.parse(await readFile("assets-manifest.json", "utf8"));
rootManifest.naturalLife = { ...manifest, provider: "AI Coding Gateway", model: "gpt-image-2.5", runtimeManifest: "public/assets/natural/manifest.json", exportScript: "scripts/prepare-natural-assets.mjs" };
await writeFile("assets-manifest.json", JSON.stringify(rootManifest, null, 2) + "\n", "utf8");
console.log(`已导出 ${records.length} 张自然动作与场景图，需逐帧及场景复验。`);
