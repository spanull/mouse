import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const output = "public/assets/restaurant";
const review = "art-source/review/chef-color/final";
await mkdir(output, { recursive: true });
await mkdir(review, { recursive: true });
const records = [];

/** 读取指定接口原图，保留已有透明通道，仅去除明确的品红色键；不重绘任何素材像素。 */
async function source(name) {
  const record = JSON.parse(await readFile(`art-source/generated/${name}.json`, "utf8"));
  const { data, info } = await sharp(record.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 100 && data[i + 2] > 100 && data[i] - data[i + 1] > 35 && data[i + 2] - data[i + 1] > 35) data[i + 3] = 0;
    if (data[i + 3] === 0) data[i] = data[i + 1] = data[i + 2] = 0;
  }
  return { data, info, record };
}

/** 记录运行图片对应的原图及实际尺寸，导出后保持待视觉复查状态，避免把生成成功当作验收。 */
async function save(name, buffer, sourceRecord) {
  const file = `${output}/${name}.png`;
  await sharp(buffer).png().toFile(file);
  const metadata = await sharp(file).metadata();
  records.push({ file: file.replace("public", ""), source: sourceRecord.file, promptFile: `art-source/generated/${sourceRecord.asset}.json`, width: metadata.width, height: metadata.height });
  return file.replace("public", "");
}

/** 单件道具只裁掉整体色键留白并统一等比缩小；角色动画不能使用此裁切路径逐帧居中。 */
async function prop(name, target, width) {
  const raw = await source(name);
  const buffer = await sharp(raw.data, { raw: raw.info }).trim({ threshold: 1 }).resize({ width, kernel: "nearest" }).png().toBuffer();
  return save(target, buffer, raw.record);
}

for (const orientation of ["wide", "tall"]) {
  const name = `restaurant-room-${orientation}-v1`;
  const record = JSON.parse(await readFile(`art-source/generated/${name}.json`, "utf8"));
  await save(`room-${orientation}`, await readFile(record.file), record);
}
await prop("restaurant-board-v2", "recommendations", 480);
await prop("restaurant-table-v1", "table", 1000);
await prop("restaurant-kitchen-entry-v1", "kitchen", 360);

// 可先检查静态道具，再在动作全部成功落盘后传入 --actors；两次都保留完整的来源清单。
if (process.argv.includes("--actors")) {
  const groups = [];
  // 待机与迎客来自同一张生成母版；前十二格眨眼，后十二格指菜单，防止独立重绘造成色板与边线跳变。
  for (const pose of ["idle", "welcome"]) {
    const name = "restaurant-chef-unified-v3";
    const raw = await source(name);
    const cellWidth = raw.info.width / 4, cellHeight = raw.info.height / 6;
    if (!Number.isInteger(cellWidth) || !Number.isInteger(cellHeight)) throw new Error(`${name} 网格不能等分，需检查原图`);
    const frames = [];
    for (let i = 0; i < 12; i++) {
      const cell = i + (pose === "welcome" ? 12 : 0);
      const { data, info } = await sharp(raw.data, { raw: raw.info }).extract({ left: cell % 4 * cellWidth, top: Math.floor(cell / 4) * cellHeight, width: cellWidth, height: cellHeight }).raw().toBuffer({ resolveWithObject: true });
      let top = cellHeight, bottom = -1, left = cellWidth, right = -1;
      for (let y = 0; y < cellHeight; y++) for (let x = 0; x < cellWidth; x++) if (data[(y * cellWidth + x) * 4 + 3] > 128) { top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x); }
      if (left < 3 || right >= cellWidth - 3 || top < 3 || bottom >= cellHeight - 3) throw new Error(`${name} 第${i + 1}帧贴边，拒绝裁断角色`);
      // 只用最低脚掌区域确定横向中点，不把挥手、尾巴和道具扩张当作身体位置变化。
      let footLeft = cellWidth, footRight = -1;
      for (let y = bottom - 5; y <= bottom; y++) for (let x = 0; x < cellWidth; x++) if (data[(y * cellWidth + x) * 4 + 3] > 128) { footLeft = Math.min(footLeft, x); footRight = Math.max(footRight, x); }
      frames.push({ data, info, top, bottom, left, right, footX: (footLeft + footRight) / 2, index: i });
    }
    groups.push({ pose, frames, record: raw.record });
  }
  const frameSize = 320, baseline = 300, center = 160;
  const all = groups.flatMap(group => group.frames);
  const scale = Math.min(270 / Math.max(...all.map(frame => frame.bottom - frame.top + 1)), 140 / Math.max(...all.map(frame => Math.max(frame.footX - frame.left, frame.right - frame.footX))));
  const poses = {}, geometry = [];
  for (const group of groups) {
    const frames = [];
    for (const frame of group.frames) {
      const width = Math.round(frame.info.width * scale), height = Math.round(frame.info.height * scale);
      const resizedPixels = await sharp(frame.data, { raw: frame.info }).resize(width, height, { kernel: "nearest" }).raw().toBuffer();
      // 最近邻缩放会取整，必须从缩放后的真实像素测量脚底，不能用原坐标乘比例代替实际落脚位置。
      let scaledTop = height, scaledBottom = -1, footLeft = width, footRight = -1;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (resizedPixels[(y * width + x) * 4 + 3] > 128) { scaledTop = Math.min(scaledTop, y); scaledBottom = Math.max(scaledBottom, y); }
      for (let y = scaledBottom - 4; y <= scaledBottom; y++) for (let x = 0; x < width; x++) if (resizedPixels[(y * width + x) * 4 + 3] > 128) { footLeft = Math.min(footLeft, x); footRight = Math.max(footRight, x); }
      const resized = await sharp(resizedPixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
      const left = Math.round(center - (footLeft + footRight) / 2), top = baseline - scaledBottom;
      // 透明原画布可能越界，但可见身体已按全组共同尺度留出安全区；仅去除画布外透明留白。
      const cutLeft = Math.max(0, -left), cutTop = Math.max(0, -top);
      const clipped = await sharp(resized).extract({ left: cutLeft, top: cutTop, width: Math.min(width - cutLeft, frameSize - Math.max(0, left)), height: Math.min(height - cutTop, frameSize - Math.max(0, top)) }).png().toBuffer();
      const buffer = await sharp({ create: { width: frameSize, height: frameSize, channels: 4, background: "#00000000" } }).composite([{ input: clipped, left: Math.max(0, left), top: Math.max(0, top) }]).png().toBuffer();
      frames.push(buffer);
      geometry.push({ pose: group.pose, frame: frame.index, sourceBodyHeight: frame.bottom - frame.top + 1, sourceFootX: frame.footX, sourceBaseline: frame.bottom, scale, normalizedBodyHeight: scaledBottom - scaledTop + 1, baseline, footMidpoint: (footLeft + footRight) / 2 + left });
    }
    const sheet = await sharp({ create: { width: frameSize * 12, height: frameSize, channels: 4, background: "#00000000" } }).composite(frames.map((input, i) => ({ input, left: frameSize * i, top: 0 }))).png().toBuffer();
    const file = await save(`chef-${group.pose}-color-v2`, sheet, group.record);
    // 从最终图集直接取首帧，避免透明合成的取整差异导致备用图与实际播放首帧颜色不完全一致。
    if (group.pose === "idle") await save("chef-static-color-v2", await sharp(sheet).extract({ left: 0, top: 0, width: frameSize, height: frameSize }).png().toBuffer(), group.record);
    await sharp({ create: { width: frameSize * 4, height: frameSize * 3, channels: 4, background: "#fff3d9" } }).composite(frames.map((input, i) => ({ input, left: i % 4 * frameSize, top: Math.floor(i / 4) * frameSize }))).png().toFile(`${review}/chef-${group.pose}-contact.png`);
    poses[group.pose] = { file, frameCount: 12, durations: group.pose === "idle" ? [3100, 180, 100, 85, 85, 100, 100, 85, 85, 100, 150, 800] : [300, 150, 150, 150, 150, 160, 180, 1000, 300, 180, 180, 300], loop: group.pose === "idle" };
  }
  await writeFile(`${review}/chef-geometry.json`, JSON.stringify(geometry, null, 2) + "\n", "utf8");
  await writeFile(`${output}/manifest.json`, JSON.stringify({ actors: { "restaurant-chef": { frameSize, fallback: "/assets/restaurant/chef-static-color-v2.png", poses } } }, null, 2) + "\n", "utf8");
}
await writeFile(`${output}/sources.json`, JSON.stringify({ approvalStatus: "pending-visual-review", records }, null, 2) + "\n", "utf8");
console.log(`已导出 ${records.length} 项餐厅素材，等待场景与动作复查。`);
