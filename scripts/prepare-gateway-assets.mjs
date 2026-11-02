import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "art-source/generated");
const destination = path.join(root, "public/assets/world");
const characters = ["rat", "hamster", "field", "chinchilla", "dormouse", "mole"];
const frameSize = 192;
const baseline = 172;
const outputs = [];
await mkdir(destination, { recursive: true });

/** 读取已生成原图及其提示词记录；没有成功原图时直接报错，避免把占位或旧资源混入本轮输出。 */
async function original(name) {
  const record = JSON.parse(await readFile(path.join(source, `${name}.json`), "utf8"));
  return { record, file: path.join(root, record.file) };
}

/** 移除模型返回的品红色键背景，保留原有透明度；仅处理品红色域，避免误删粉色耳朵和淡紫围裙。 */
async function removeKey(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 110 && b > 110 && r - g > 40 && b - g > 40) data[i + 3] = 0;
    if (!data[i + 3]) data[i] = data[i + 1] = data[i + 2] = 0;
  }
  return { data, width: info.width, height: info.height };
}

/** 从规则网格切出一格并计算非透明边界；透明边界检查可发现生成器裁断肢体或把物件贴到格线的问题。 */
async function cell(sheet, index, columns, rows) {
  const width = Math.floor(sheet.width / columns), height = Math.floor(sheet.height / rows);
  const left = index % columns * width, top = Math.floor(index / columns) * height;
  const { data, info } = await sharp(sheet.data, { raw: { width: sheet.width, height: sheet.height, channels: 4 } }).extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 80) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  if (x1 < x0) throw new Error(`第 ${index + 1} 格没有可见图像`);
  if (x0 < 2 || y0 < 2 || x1 > width - 3 || y1 > height - 3) throw new Error(`第 ${index + 1} 格贴边，需要重新检查构图`);
  const bounds = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  return { image: await sharp(data, { raw: info }).extract(bounds).png().toBuffer(), width: bounds.width, height: bounds.height };
}

/** 将已去背景的动作放入统一透明画布；同角色共享缩放比例与脚底线，跳跃帧仅增加明确的离地偏移。 */
async function place(part, scale, width, height, bottom, offset = 0) {
  const w = Math.round(part.width * scale), h = Math.round(part.height * scale);
  const image = await sharp(part.image).resize(w, h, { kernel: "nearest" }).png().toBuffer();
  return sharp({ create: { width, height, channels: 4, background: "#00000000" } }).composite([{ input: image, left: Math.round((width - w) / 2), top: bottom - h + offset }]).png().toBuffer();
}

/** 写入运行 PNG 并登记实际尺寸、体积和原图来源；精灵图不做抖动调色板压缩，防止透明边缘出现杂点。 */
async function save(name, buffer, record) {
  const file = path.join(destination, `${name}.png`);
  await sharp(buffer).png({ compressionLevel: 9, palette: true, colours: 192, dither: 0 }).toFile(file);
  const metadata = await sharp(file).metadata();
  const bytes = (await readFile(file)).length;
  outputs.push({ assetId: name, file: `/assets/world/${name}.png`, width: metadata.width, height: metadata.height, bytes, sourceFile: record.file, promptFile: `art-source/generated/${record.asset}.json` });
}

/** 将已经对齐的帧横排输出，保持现有 PixiJS 的 4／4／6 帧协议，不修改业务动画触发时机。 */
async function strip(name, frames, record) {
  const buffer = await sharp({ create: { width: frameSize * frames.length, height: frameSize, channels: 4, background: "#00000000" } }).composite(frames.map((input, index) => ({ input, left: index * frameSize, top: 0 }))).png().toBuffer();
  await save(name, buffer, record);
}

for (const name of ["home", "restaurant", "bar"]) {
  const { file, record } = await original(name);
  await save(name, await sharp(file).resize(768, 768, { fit: "cover", kernel: "nearest" }).png().toBuffer(), record);
}

for (const name of characters) {
  const { file, record } = await original(name);
  const sheet = await removeKey(file);
  const parts = await Promise.all(Array.from({ length: 6 }, (_, index) => cell(sheet, index, 3, 2)));
  const scale = Math.min(160 / Math.max(...parts.map(part => part.width)), 152 / Math.max(...parts.map(part => part.height)));
  const poses = await Promise.all(parts.map((part, index) => place(part, scale, frameSize, frameSize, baseline, index === 3 ? -10 : 0)));
  const breathe = await place(parts[0], scale, frameSize, frameSize, baseline, -2);
  await save(`${name}-static`, poses[0], record);
  await strip(`${name}-idle`, [poses[0], breathe, poses[0], poses[1]], record);
  await strip(`${name}-pressed`, [poses[0], poses[2], poses[3], poses[0]], record);
  await strip(`${name}-success`, [poses[0], poses[4], poses[5], poses[4], poses[5], poses[0]], record);
}

for (const [name, columns, rows, width, height, names] of [
  ["dishes", 3, 2, 128, 88, Array.from({ length: 6 }, (_, index) => `dish-${index}`)],
  ["drinks", 2, 2, 128, 160, ["cocktail-pink", "cocktail-mint", "cocktail-orange", "cocktail-purple"]],
]) {
  const { file, record } = await original(name);
  const sheet = await removeKey(file);
  for (let index = 0; index < names.length; index++) {
    const part = await cell(sheet, index, columns, rows);
    const scale = Math.min((width - 12) / part.width, (height - 12) / part.height);
    await save(names[index], await place(part, scale, width, height, height - 6), record);
  }
}

const manifestFile = path.join(root, "assets-manifest.json");
const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
manifest.source = "旧版 placeholder 保留为历史；现行运行素材及来源见 worldV2";
Object.assign(manifest.worldV2, {
  source: "AI Coding Gateway / gpt-image-2.5 参考用户原型生成，色键去背景、裁切、统一锚点并导出动作图",
  sourceFile: "scripts/prepare-gateway-assets.mjs",
  frameWidth: frameSize, frameHeight: frameSize, anchorX: 96, anchorY: baseline,
  generation: { provider: "AI Coding Gateway", model: "gpt-image-2.5", channel: "https://aicoding.aideb.me/v1/images/generations", referenceFiles: ["art-source/reference/user-prototype.png"], promptDirectory: "art-source/generated/", postProcessing: ["品红色键背景去除或保留原有 Alpha", "网格切分及透明边界检查", "同角色统一缩放与脚底线", "4/4/6 帧横排输出", "192 色 PNG 无抖动压缩"], license: "服务商适用条款及参考图使用范围待上线前核对" },
  approvalStatus: "pending-visual-review",
  assets: outputs,
});
await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ files: outputs.length, totalBytes: outputs.reduce((sum, asset) => sum + asset.bytes, 0), assets: outputs }, null, 2));
