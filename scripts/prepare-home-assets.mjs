import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const output = "public/assets/natural";
const review = "art-source/review/home-v3";
await mkdir(review, { recursive: true });
const manifest = JSON.parse(await readFile(`${output}/manifest.json`, "utf8"));
const root = JSON.parse(await readFile("assets-manifest.json", "utf8"));
const report = { version: 3, status: "pending-visual-review", method: "每组固定缩放、脚底中点对齐，不按外轮廓居中或逐帧缩放", actors: {} };
const heights = { rat: 157, hamster: 166, field: 158, chinchilla: 163, dormouse: 150 };

/** 测量不透明主体及底部脚掌中点；尾巴、抬起的手或道具不会参与水平居中。 */
function geometry(data, width, height) {
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 128) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (bottom < top) throw new Error("动作帧为空，需要检查原图");
  let footLeft = width, footRight = -1;
  for (let y = bottom - Math.ceil((bottom - top + 1) * .035); y <= bottom; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 128) {
    footLeft = Math.min(footLeft, x); footRight = Math.max(footRight, x);
  }
  return { left, right, top, bottom, footX: (footLeft + footRight) / 2, bodyHeight: bottom - top + 1 };
}

/** 只去除接口原图的洋红色键，按透明间隔切分真实姿势；保留原图、网格位置及来源元数据。 */
async function readSheet(name, rows) {
  const record = JSON.parse(await readFile(`art-source/generated/${name}.json`, "utf8"));
  const { data, info } = await sharp(record.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 110 && data[i + 2] > 110 && data[i] - data[i + 1] > 40 && data[i + 2] - data[i + 1] > 40) data[i + 3] = 0;
    if (data[i + 3] < 20) data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
  }
  /** 在等分网格附近寻找透明分隔，不把角色边缘裁断；坐标仍相对于原始等分格。 */
  function boundaries(count, vertical) {
    const length = vertical ? info.height : info.width;
    const sums = Array(length).fill(0);
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 128) sums[vertical ? y : x]++;
    const result = [0];
    for (let i = 1; i < count; i++) {
      const expected = length * i / count, radius = length / count * .16;
      let best = Math.round(expected), score = Infinity;
      for (let j = Math.ceil(expected - radius); j <= Math.floor(expected + radius); j++) {
        const candidate = sums.slice(Math.max(0, j - 2), j + 3).reduce((a, b) => a + b, 0) * length + Math.abs(j - expected);
        if (candidate < score) { best = j; score = candidate; }
      }
      result.push(best);
    }
    return [...result, length];
  }
  const xs = boundaries(4, false), ys = boundaries(rows, true), cells = [];
  for (let i = 0; i < rows * 4; i++) {
    const col = i % 4, row = Math.floor(i / 4);
    const left = xs[col], top = ys[row], width = xs[col + 1] - left, height = ys[row + 1] - top;
    const cell = await sharp(data, { raw: info }).extract({ left, top, width, height }).raw().toBuffer();
    const bounds = geometry(cell, width, height);
    if (bounds.left < 1 || bounds.top < 1 || bounds.right >= width - 1 || bounds.bottom >= height - 1) throw new Error(`${name} 第${i + 1}帧贴边`);
    cells.push({ data: cell, width, height, bounds, origin: { x: left - col * info.width / 4, y: top - row * info.height / rows } });
  }
  return { record, cells, cellSize: info.width / 4 };
}

/** 写入运行图、接触表及来源；只替换本轮首页资源对应记录，不改餐厅酒吧素材。 */
async function save(name, frames, size, record) {
  const file = `${output}/${name}-home-v3.png`;
  await writeFile(file, await sharp({ create: { width: size * frames.length, height: size, channels: 4, background: "#00000000" } }).composite(frames.map((input, i) => ({ input, left: i * size, top: 0 }))).png().toBuffer());
  const asset = { file: file.replace("public", ""), source: record.file, promptFile: `art-source/generated/${record.asset}.json`, width: size * frames.length, height: size, bytes: (await readFile(file)).length };
  manifest.assets = manifest.assets.filter(item => item.file !== asset.file && item.file !== `/assets/natural/${name}.png`);
  manifest.assets.push(asset);
  if (frames.length > 1) await sharp({ create: { width: size * 4, height: size * Math.ceil(frames.length / 4), channels: 4, background: "#fff3db" } }).composite(frames.map((input, i) => ({ input, left: i % 4 * size, top: Math.floor(i / 4) * size }))).png().toFile(`${review}/${name}.png`);
  return asset.file;
}

for (const [key, targetHeight] of Object.entries(heights)) {
  const canonical = await readSheet(`${key}-natural`, 4);
  const leisure = await readSheet(`${key}-leisure-v3`, 3);
  report.actors[key] = { targetHeight, baseline: 179, footCenter: 96, groups: {} };
  const comparisons = [];
  for (const [pose, source, cells] of [["idle", canonical, canonical.cells.slice(0, 8)], ["pressed", canonical, canonical.cells.slice(8, 16)], ["leisure", leisure, leisure.cells]]) {
    // 同一原图的待机和挥手共用基准；闲暇整组只做一次等比例归一，禁止每帧缩放。
    const scale = targetHeight / source.cells[0].bounds.bodyHeight;
    const frames = [], measurements = [];
    for (const [i, cell] of cells.entries()) {
      const b = cell.bounds;
      const width = Math.round((b.right - b.left + 1) * scale), height = Math.round(b.bodyHeight * scale);
      if (Math.abs(height - targetHeight) > 3) throw new Error(`${key}/${pose}/${i + 1} 身高漂移${height - targetHeight}px，需重做`);
      const resized = await sharp(cell.data, { raw: { width: cell.width, height: cell.height, channels: 4 } }).extract({ left: b.left, top: b.top, width: b.right - b.left + 1, height: b.bodyHeight }).resize(width, height, { kernel: "nearest" }).raw().toBuffer();
      // 最近邻缩小可能丢失最末行的单像素脚尖，按缩小后的实际脚底校准，避免一像素落脚闪动。
      const actual = geometry(resized, width, height);
      const left = Math.round(96 - (b.footX - b.left) * scale), top = 179 - actual.bottom;
      if (left < 0 || left + width > 192 || top < 0 || top + height > 192) throw new Error(`${key}/${pose}/${i + 1} 超出共同画布，需重新生成而非压缩此帧`);
      const input = await sharp(resized, { raw: { width, height, channels: 4 } }).png().toBuffer();
      frames.push(await sharp({ create: { width: 192, height: 192, channels: 4, background: "#00000000" } }).composite([{ input, left, top }]).png().toBuffer());
      measurements.push({ frame: i, height, left, top, footCenter: 96, baseline: 179 });
    }
    report.actors[key].groups[pose] = { source: source.record.file, fixedScale: scale, measurements };
    manifest.actors[key].poses[pose].file = await save(`${key}-${pose}`, frames, 192, source.record);
    if (pose === "idle") manifest.actors[key].fallback = await save(`${key}-static`, [frames[0]], 192, source.record);
    comparisons.push(frames[0], frames.at(-1));
  }
  await sharp({ create: { width: 192 * 6, height: 192, channels: 4, background: "#fff3db" } }).composite(comparisons.map((input, i) => ({ input, left: i * 192, top: 0 }))).png().toFile(`${review}/${key}-transitions.png`);
}

await writeFile(`${review}/geometry.json`, JSON.stringify(report, null, 2) + "\n", "utf8");
const squirrel = await readSheet("squirrel-home-v4", 4);
const frames = [];
for (const cell of squirrel.cells) {
  // 环境角色沿原图坐标运动；不把逐渐离开的松鼠重新居中，不把枝条紧裁成不同尺寸。
  const b = cell.bounds, scale = 256 / squirrel.cellSize;
  const input = await sharp(cell.data, { raw: { width: cell.width, height: cell.height, channels: 4 } }).extract({ left: b.left, top: b.top, width: b.right - b.left + 1, height: b.bodyHeight }).resize(Math.round((b.right - b.left + 1) * scale), Math.round(b.bodyHeight * scale), { kernel: "nearest" }).png().toBuffer();
  const left = Math.round((cell.origin.x + b.left) * scale), top = Math.round((cell.origin.y + b.top) * scale);
  frames.push(await sharp({ create: { width: 256, height: 256, channels: 4, background: "#00000000" } }).composite([{ input, left, top }]).png().toBuffer());
}
manifest.actors.squirrel.poses.idle.file = await save("squirrel-idle", frames, 256, squirrel.record);
manifest.actors.squirrel.fallback = await save("squirrel-static", [frames[0]], 256, squirrel.record);
manifest.homeRevision = { version: 3, approvalStatus: "pending-visual-review", exportScript: "scripts/prepare-home-assets.mjs", report: `${review}/geometry.json` };
await writeFile(`${review}/geometry.json`, JSON.stringify(report, null, 2) + "\n", "utf8");
await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n", "utf8");
root.naturalLife = { ...root.naturalLife, ...manifest };
await writeFile("assets-manifest.json", JSON.stringify(root, null, 2) + "\n", "utf8");
console.log("首页五鼠种与松鼠导出完成，等待跨动作及实际场景验收。");
