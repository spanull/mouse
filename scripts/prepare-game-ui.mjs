import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const target = "public/assets/ui";
await mkdir(target, { recursive: true });
const records = [];

/** 加载接口生成的原图并去掉品红底；保留透明 Alpha 与不属于色键的角色、木纹和面板像素。 */
async function source(name) {
  const record = JSON.parse(await readFile(`art-source/generated/${name}.json`, "utf8"));
  const { data, info } = await sharp(record.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 110 && data[i + 2] > 110 && data[i] - data[i + 1] > 40 && data[i + 2] - data[i + 1] > 40) data[i + 3] = 0;
    if (!data[i + 3]) data[i] = data[i + 1] = data[i + 2] = 0;
  }
  return { data, info, record };
}

/** 按图集网格提取单项，裁去透明留白；贴边或空白会报错，要求检查原图而不是静默交付。 */
async function cut(sheet, index, columns, rows) {
  const width = Math.floor(sheet.info.width / columns), height = Math.floor(sheet.info.height / rows);
  const { data, info } = await sharp(sheet.data, { raw: sheet.info }).extract({ left: index % columns * width, top: Math.floor(index / columns) * height, width, height }).raw().toBuffer({ resolveWithObject: true });
  let l = width, t = height, r = -1, b = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 80) { l = Math.min(l, x); t = Math.min(t, y); r = Math.max(r, x); b = Math.max(b, y); }
  if (r < l || l < 2 || t < 2 || r > width - 3 || b > height - 3) throw new Error(`${sheet.record.asset} 第 ${index + 1} 格空白或贴边`);
  const w = r - l + 1, h = b - t + 1;
  return { image: await sharp(data, { raw: info }).extract({ left: l, top: t, width: w, height: h }).png().toBuffer(), width: w, height: h };
}

/** 压缩并登记实际运行文件，记录原图和提示词以便全部图像控件追溯到生图接口。 */
async function save(file, buffer, record) {
  await sharp(buffer).png({ palette: true, colours: 192, dither: 0, compressionLevel: 9 }).toFile(file);
  const metadata = await sharp(file).metadata();
  records.push({ file: file.replace("public", ""), source: record.file, promptFile: `art-source/generated/${record.asset}.json`, width: metadata.width, height: metadata.height, bytes: (await readFile(file)).length });
}

for (const [name, columns, rows, names, maximum] of [
  ["ui-icons", 4, 4, ["back", "settings", "close", "next", "heart", "book", "chef", "drink", "speech", "sparkle", "coin", "ticket", "check", "flag", "retry", "home"], 128],
  ["ui-panels", 2, 2, ["panel", "card", "bubble", "button"], 512],
  ["ui-entrances", 2, 2, ["entrance-restaurant", "entrance-bar", "entrance-menu", "entrance-wall"], 320],
  ["ui-ratings", 3, 2, ["rating-0", "rating-1", "rating-2", "rating-3", "rating-4", "chef-hat"], 128],
]) {
  const sheet = await source(name);
  for (const [index, label] of names.entries()) {
    const part = await cut(sheet, index, columns, rows);
    await save(`${target}/${label}.png`, await sharp(part.image).resize({ width: maximum, height: maximum, fit: "inside", kernel: "nearest" }).png().toBuffer(), sheet.record);
  }
}

for (const name of ["home-tall", "restaurant-tall", "bar-tall", "home-wide", "restaurant-wide", "bar-wide"]) {
  const record = JSON.parse(await readFile(`art-source/generated/${name}.json`, "utf8"));
  await save(`public/assets/world/${name}.png`, await sharp(record.file).resize(name.endsWith("wide") ? 1152 : 768, name.endsWith("wide") ? 768 : 1152, { fit: "cover", kernel: "nearest" }).png().toBuffer(), record);
}

if (!process.argv.includes("--ui-only")) {
  const service = await source("mole-service"), delivery = await source("mole-delivery");
  const parts = await Promise.all(Array.from({ length: 6 }, (_, i) => cut(service, i, 3, 2)));
  const extra = await Promise.all(Array.from({ length: 4 }, (_, i) => cut(delivery, i, 2, 2)));
  const scale = Math.min(162 / Math.max(...parts.concat(extra).map(p => p.width)), 152 / Math.max(...parts.concat(extra).map(p => p.height)));
  /** 将服务动作放进与原角色相同的画布和脚底线；保留完整杯子、托盘和手臂，不让动作切换改变容器。 */
  async function frame(part, bob = 0) {
    const width = Math.round(part.width * scale), height = Math.round(part.height * scale);
    return sharp({ create: { width: 192, height: 192, channels: 4, background: "#00000000" } }).composite([{ input: await sharp(part.image).resize(width, height, { kernel: "nearest" }).png().toBuffer(), left: Math.round((192 - width) / 2), top: 172 - height + bob }]).png().toBuffer();
  }
  const poses = await Promise.all(parts.map(p => frame(p))), extras = await Promise.all(extra.map(p => frame(p)));
  for (const [name, frames] of [
    ["welcome", [poses[0], await frame(parts[0], -2), poses[0], poses[1]]],
    ["listen", [poses[1], poses[1], await frame(parts[1], -1), poses[1]]],
    ["polish", [poses[2], await frame(parts[2], -2), poses[2], await frame(parts[2], 1)]],
    ["shake", [poses[3], poses[4], poses[3], poses[4]]],
    ["pour", [poses[5], await frame(parts[5], -1), poses[5], poses[5]]],
    ["serve", [extras[0], extras[1], extras[1], extras[3]]],
    ["comfort", [extras[2], extras[2], extras[3], extras[2]]],
  ]) {
    const buffer = await sharp({ create: { width: 768, height: 192, channels: 4, background: "#00000000" } }).composite(frames.map((input, i) => ({ input, left: i * 192, top: 0 }))).png().toBuffer();
    await save(`public/assets/world/mole-${name}.png`, buffer, ["serve", "comfort"].includes(name) ? delivery.record : service.record);
  }
}

const manifest = JSON.parse(await readFile("assets-manifest.json", "utf8"));
manifest.gameUI = { provider: "AI Coding Gateway", model: "gpt-image-2.5", reference: "art-source/reference/user-prototype.png", approvalStatus: "pending-visual-review", sourceFile: "scripts/prepare-game-ui.mjs", assets: records };
await writeFile("assets-manifest.json", JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`已导出 ${records.length} 张界面／背景／动作图，总计 ${records.reduce((sum, a) => sum + a.bytes, 0)} 字节。`);
