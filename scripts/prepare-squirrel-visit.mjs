import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const review = "art-source/review/squirrel-entry";
await mkdir(review, { recursive: true });
const record = JSON.parse(await readFile("art-source/generated/squirrel-cycle-v1.json", "utf8"));
const { data, info } = await sharp(record.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
  if (data[i] > 110 && data[i + 2] > 110 && data[i] - data[i + 1] > 40 && data[i + 2] - data[i + 1] > 40) data[i + 3] = 0;
  if (data[i + 3] < 20) data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
}
const size = 256, cells = [];
for (let i = 0; i < 24; i++) {
  const col = i % 6, row = Math.floor(i / 6);
  const left = Math.round(col * info.width / 6), top = Math.round(row * info.height / 4);
  const width = Math.round((col + 1) * info.width / 6) - left, height = Math.round((row + 1) * info.height / 4) - top;
  cells.push(await sharp(data, { raw: info }).extract({ left, top, width, height }).resize(size, size, { kernel: "nearest" }).png().toBuffer());
}
/** 测量固定枝条和叶片的绿色像素，校准各格排版位置，不依据移动中的松鼠重新居中。 */
async function branchBounds(buffer) {
  const pixels = await sharp(buffer).ensureAlpha().raw().toBuffer();
  let left = size, right = -1, bottom = -1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    if (pixels[i + 3] > 160 && pixels[i + 1] > pixels[i + 2] * 1.3 && pixels[i + 1] >= pixels[i] * .86) {
      left = Math.min(left, x); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) throw new Error("未找到固定枝叶锚点");
  return { left, right, bottom };
}
const target = await branchBounds(cells[0]), source = target;
const scale = (target.right - target.left + 1) / (source.right - source.left + 1);
const normalized = [];
for (const cell of cells) {
  // 整组只用一个比例；只校准原图排版的枝条锚点，保留真实向外攀爬位移。
  const resized = await sharp(cell).resize(Math.round(size * scale), Math.round(size * scale), { kernel: "nearest" }).png().toBuffer();
  const bounds = await branchBounds(cell);
  const left = Math.round(target.left - bounds.left * scale), top = Math.round(target.bottom - bounds.bottom * scale);
  const canvas = await sharp({ create: { width: 768, height: 768, channels: 4, background: "#00000000" } }).composite([{ input: resized, left: 256 + left, top: 256 + top }]).png().toBuffer();
  normalized.push(await sharp(canvas).extract({ left: 256, top: 256, width: size, height: size }).png().toBuffer());
}
// 首尾都隐藏，采用同一隐藏首帧作为循环接缝；省略模型重复的第24帧，不复制姿势增加帧数。
const frames = normalized.slice(0, 23);
const durations = frames.map((_, i) => i === 0 ? 16000 : i === 11 ? 3000 : i === 13 ? 900 : i < 4 ? 320 : 200);
const file = "public/assets/natural/squirrel-visit-v5.png";
await writeFile(file, await sharp({ create: { width: size * frames.length, height: size, channels: 4, background: "#00000000" } }).composite(frames.map((input, i) => ({ input, left: i * size, top: 0 }))).png().toBuffer());
await sharp({ create: { width: size * 6, height: size * 4, channels: 4, background: "#fff3db" } }).composite(frames.map((input, i) => ({ input, left: i % 6 * size, top: Math.floor(i / 6) * size }))).png().toFile(`${review}/cycle.png`);
const manifest = JSON.parse(await readFile("public/assets/natural/manifest.json", "utf8"));
const oldFile = manifest.actors.squirrel.poses.idle.file;
manifest.actors.squirrel.poses.idle = { file: file.replace("public", ""), frameCount: frames.length, durations, loop: true };
manifest.actors.squirrel.visit = { phases: { hidden: [0, 0], enter: [1, 10], settled: [11, 13], exit: [14, 22] }, initialTime: 13000, reviewStatus: "pending-visual-review" };
manifest.assets = manifest.assets.filter(item => item.file !== oldFile && item.file !== file.replace("public", ""));
manifest.assets.push({ file: file.replace("public", ""), source: record.file, promptFile: "art-source/generated/squirrel-cycle-v1.json", width: size * frames.length, height: size, bytes: (await readFile(file)).length });
await writeFile("public/assets/natural/manifest.json", JSON.stringify(manifest, null, 2) + "\n", "utf8");
const root = JSON.parse(await readFile("assets-manifest.json", "utf8"));
root.naturalLife = { ...root.naturalLife, ...manifest };
await writeFile("assets-manifest.json", JSON.stringify(root, null, 2) + "\n", "utf8");
await writeFile(`${review}/cycle-record.json`, JSON.stringify({ source: record.file, scale, target, sourceAnchor: source, frameCount: frames.length, durations, uniquePoses: frames.length, method: "同图23个唯一姿势组成隐藏、入场、停留与离场；省略重复隐藏末帧，无倒放、淡入或位移补帧。", status: "pending-visual-review" }, null, 2) + "\n", "utf8");
console.log(`松鼠完整来访循环：${frames.length}帧，等待逐帧及循环接缝复查。`);
