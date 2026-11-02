import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const existingManifest = JSON.parse(await readFile(path.join(root, "assets-manifest.json"), "utf8"));
if (existingManifest.worldV2?.generation) throw new Error("已接入 AI 素材，禁止占位生成器覆盖；请使用 prepare-gateway-assets.mjs 导出。");
const folder = path.join(root, "public/assets/world");
await mkdir(folder, { recursive: true });
let parts = [];
/** 添加整数像素矩形；所有原创场景共享深棕描边和柔和色板。 */
function box(x, y, w, h, fill, stroke = "none", line = 1) { parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${line}"/>`); }
/** 绘制低分辨率椭圆，栅格化时形成阶梯轮廓，避免将参考图直接裁切作素材。 */
function oval(x, y, rx, ry, fill, stroke = "none", line = 1) { parts.push(`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${line}"/>`); }
/** 添加封闭或开放的路径，统一用整数坐标控制树根、屋顶与道具轮廓。 */
function line(d, fill, stroke = "none", width = 1) { parts.push(`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`); }
/** 将当前场景输出成透明 PNG，保留确定性来源，不调用任何外部图片服务。 */
async function save(name, width, height) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" shape-rendering="crispEdges">${parts.join("")}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(folder, `${name}.png`)); parts = [];
}
/** 生成可重复的装饰坐标，让素材每次导出的纹理一致且无需保存随机种子。 */
function noise(i, range, salt = 0) { return Math.abs(Math.sin(i * 71.17 + salt * 8.3) * 43758.54) % 1 * range; }
/** 绘制带花蕊的像素小花，按固定序列散布于草地与树冠。 */
function flower(x, y, color = "#f5d8b4") { box(x, y, 2, 7, "#6d8953"); box(x - 3, y - 2, 8, 3, color); box(x - 1, y - 4, 4, 7, color); box(x, y - 1, 2, 2, "#d5aa63"); }
/** 层叠圆簇形成树冠；亮面、叶片和树干都采用原创程序图形。 */
function tree(x, y, scale = 1, pink = false) {
  parts.push(`<g transform="translate(${x} ${y}) scale(${scale})">`);
  line("M-6 20 L6 20 L10 82 L-14 84 Z", "#977352", "#6b5942", 2);
  const colors = pink ? ["#b8808c", "#dca4a8", "#efc3bb"] : ["#526b43", "#7c9856", "#a2b773"];
  for (let i = 0; i < 12; i++) oval(Math.round(noise(i, 56) - 28), Math.round(noise(i, 45, 2) - 10), 23, 18, colors[i % 3]);
  for (let i = 0; i < 17; i++) box(Math.round(noise(i, 62) - 31), Math.round(noise(i, 46, 3) - 8), 4, 2, colors[2]);
  parts.push("</g>");
}
/** 为三个主场景铺设草地、土路和边缘植被，保留中间区域给可点击文字。 */
function garden(night = false) {
  box(0, 0, 480, 480, night ? "#414b49" : "#e6e7c9");
  box(0, 180, 480, 300, night ? "#6c8058" : "#bac98b");
  line("M199 185 L286 185 L305 280 L378 480 L91 480 L188 280 Z", night ? "#b1ac7d" : "#e4d8ad");
  for (let i = 0; i < 230; i++) {
    const x = Math.round(noise(i, 480)), y = Math.round(190 + noise(i, 290, 5));
    if (Math.abs(x - 240) < 65 + (y - 190) * .28) { if (i % 9 === 0) box(x, y, 8, 3, night ? "#97956c" : "#c8bd91"); }
    else { box(x, y, 3, 2, night ? "#82935f" : "#a2b97c"); if (i % 5 === 0) flower(x, y, i % 2 ? "#f4dbc1" : "#d5abbc"); }
  }
  tree(35, 70, 1.5, !night); tree(440, 76, 1.6); tree(-20, 330, 1.4); tree(494, 325, 1.4);
}
/** 绘制鼠鼠的圆顶小屋，使用苔藓屋顶、圆门、窗格及花盆建立温暖的家。 */
function house() {
  oval(240, 220, 125, 17, "#8e9b70");
  line("M125 220 L125 139 Q125 63 240 59 Q355 63 355 139 L355 220 Z", "#84704d", "#655d43", 4);
  line("M135 214 L135 141 Q135 82 240 78 Q345 82 345 141 L345 214 Z", "#d1bc88");
  for (let i = 0; i < 70; i++) { const x = Math.round(136 + noise(i, 208)), y = Math.round(125 + noise(i, 85, 4)); if (Math.abs(x - 240) > 44) box(x, y, 11, 4, "#baa477"); }
  line("M113 156 Q103 50 240 46 Q377 50 367 156 L348 164 Q349 77 240 78 Q131 77 132 164 Z", "#62814e", "#576745", 3);
  for (let i = 0; i < 60; i++) { const t = i / 59 * Math.PI; const x = Math.round(240 + Math.cos(t) * 118), y = Math.round(151 - Math.sin(t) * 88); oval(x, y, 9, 7, ["#819c58", "#a5b773", "#728c4d"][i % 3]); if (i % 8 === 0) flower(x, y, "#efc8af"); }
  line("M207 222 L207 160 Q207 120 240 120 Q273 120 273 160 L273 222 Z", "#775c43", "#584c3b", 3);
  line("M215 221 L215 160 Q215 132 240 132 Q265 132 265 160 L265 221 Z", "#ad8757");
  for (let x = 222; x < 261; x += 10) box(x, 153, 2, 68, "#8f704c");
  oval(252, 187, 3, 3, "#ead082", "#6a563d");
  for (const x of [163, 317]) { oval(x, 163, 19, 23, "#795f43", "#605440", 2); oval(x, 163, 14, 18, "#a7c6b2"); box(x - 2, 145, 3, 36, "#e3cf9c"); box(x - 14, 161, 28, 3, "#e3cf9c"); box(x - 23, 185, 46, 5, "#8e6b48"); }
  for (const x of [136, 345]) { box(x - 9, 204, 18, 17, "#b77f60", "#795c42", 2); tree(x, 183, .3); }
  box(200, 222, 80, 8, "#c5b58d"); box(193, 230, 94, 7, "#d6c8a0");
}
garden();
for (let i = 0; i < 9; i++) oval(60 + i * 55, 22 + i % 3 * 9, 35, 13, "#faf2dc");
house();
await save("home", 480, 480);

// 餐厅背景：奶油粉条纹、木柜、锅具和菜碟，角色由独立精灵叠加。
box(0, 0, 480, 480, "#f1dfc3");
for (let x = 0; x < 480; x += 25) box(x, 0, 12, 260, "#e9cbb2");
box(0, 270, 480, 210, "#c4a27a");
for (let y = 285; y < 480; y += 28) { box(0, y, 480, 2, "#ad895f"); for (let x = y % 2 * 36; x < 480; x += 92) box(x, y - 26, 2, 26, "#b4946e"); }
box(80, 35, 320, 157, "#8b6d4f", "#6e5841", 3); box(86, 41, 308, 145, "#b39c73");
for (let x = 96; x < 380; x += 39) { box(x, 108, 27, 29, "#d5c5a1", "#7f6c4d", 2); box(x - 2, 104, 31, 6, "#829576"); box(x + 6, 117, 15, 10, "#f1dfb8"); }
box(80, 142, 320, 8, "#796044");
for (const [x, r] of [[111, 15], [163, 20], [319, 18], [370, 13]]) { box(x - 2, 47, 4, 23, "#635741"); oval(x, 82, r, r, "#b4a384", "#645b47", 3); oval(x, 81, r - 5, r - 5, "#cbbb95"); }
box(19, 55, 45, 86, "#b49469", "#806541", 3); box(24, 60, 35, 76, "#f4e9c9"); for (let i = 0; i < 5; i++) box(30, 72 + i * 11, 23 - i % 2 * 7, 2, "#b5a17b");
box(416, 105, 47, 80, "#96a07a", "#746b4e", 3); box(421, 111, 37, 62, "#bcc49a");
box(0, 239, 480, 58, "#b48860", "#76573c", 3); box(0, 231, 480, 13, "#e1bd8b", "#8c6848", 3); for (let x = 15; x < 480; x += 48) box(x, 254, 31, 29, "#c99e70", "#98724e");
for (let i = 0; i < 5; i++) { oval(67 + i * 85, 226, 28, 8, "#f2e5c3", "#957650", 2); oval(67 + i * 85, 225, 19, 5, ["#b7764a", "#88a569", "#dfb25f"][i % 3]); }
tree(25, 333, .65); tree(454, 337, .65);
await save("restaurant", 480, 480);

garden(true);
// 酒吧为树洞内的木架、灯串与吧台，鼹鼠形象由原创角色素材承担。
line("M40 270 L51 75 Q81 7 238 4 Q397 8 431 75 L442 270 Z", "#6e563f", "#4e4837", 5);
line("M67 249 L73 85 Q93 32 238 29 Q376 32 407 85 L413 249 Z", "#4f463a");
for (let i = 0; i < 8; i++) line(`M${85 + i * 45} 55 Q${70 + i * 45} 143 ${86 + i * 45} 252`, "none", "#5c4d3b", 5);
for (let row = 0; row < 2; row++) { box(88, 112 + row * 58, 304, 7, "#a38152", "#3c382d", 2); for (let i = 0; i < 9; i++) { const x = 96 + i * 33, y = 85 + row * 58; box(x + 4, y - 11, 7, 12, "#b2b47a"); box(x, y, 15, 25, ["#b78ba1", "#9aaa79", "#c6a66c", "#8fa7ab"][i % 4], "#6c6144"); box(x + 3, y + 8, 9, 9, "#e8d3a0"); } }
line("M62 40 Q240 99 417 40", "none", "#9d8c5b", 2);
for (let i = 0; i < 10; i++) { const x = 67 + i * 38, y = 43 + Math.round(Math.sin(i / 9 * Math.PI) * 27); oval(x, y, 5, 7, i % 2 ? "#e8b4b4" : "#ead495"); box(x - 2, y - 9, 4, 4, "#9b8056"); }
box(44, 238, 392, 57, "#96734c", "#514832", 3); for (let i = 0; i < 14; i++) box(51 + i * 28, 247, 24, 43, i % 2 ? "#a78353" : "#b08b59", "#80633f");
box(35, 229, 410, 13, "#d0ad79", "#6f553b", 3);
for (const x of [130, 240, 350]) { box(x - 13, 334, 5, 39, "#725b3f"); box(x + 8, 334, 5, 39, "#725b3f"); oval(x, 330, 27, 9, "#70533c", "#4e4532", 2); oval(x, 325, 26, 8, "#bf9262", "#77583b", 2); }
for (let i = 0; i < 15; i++) tree(i * 36 - 12, -25 + i % 3 * 8, .7);
await save("bar", 480, 480);

const skins = [
  { key: "rat", name: "花枝鼠", fur: "#b0a38e", light: "#d5c5aa", shirt: "#83966c", ears: 11 },
  { key: "hamster", name: "仓鼠", fur: "#c49a6a", light: "#f1d9ae", shirt: "#b98b91", ears: 8 },
  { key: "field", name: "田鼠", fur: "#a38765", light: "#d5b894", shirt: "#bd9c69", ears: 10 },
  { key: "chinchilla", name: "龙猫", fur: "#9f9fa6", light: "#d5d1cf", shirt: "#9d90af", ears: 13 },
  { key: "dormouse", name: "睡鼠", fur: "#b39b84", light: "#e5ceb1", shirt: "#91afb0", ears: 9 },
  { key: "mole", name: "调酒鼹鼠", fur: "#817369", light: "#bfa58b", shirt: "#aaa48a", ears: 5 },
];
/** 绘制原创圆润鼠鼠，不复制参考作品角色；通过耳型、毛色与围裙区分五种访客和鼹鼠。 */
function mouse(skin, offset = 0, pose = "idle", frame = 0) {
  const jump = pose === "pressed" ? [0, 2, -6, -3][frame] : pose === "success" ? -(frame % 2) * 2 : frame === 1 ? -1 : 0;
  parts.push(`<g transform="translate(${offset} ${jump})">`);
  oval(48, 86 - jump, 29, 5, "#6c654e40");
  line("M69 71 Q90 82 85 61", "none", "#b99b83", 4);
  oval(30, 82, 12, 5, "#85715b", "#645442"); oval(64, 82, 12, 5, "#85715b", "#645442");
  oval(48, 63, 25, 23, skin.fur, "#655948", 2);
  oval(27, 26, skin.ears, skin.ears, skin.fur, "#655948", 2); oval(69, 26, skin.ears, skin.ears, skin.fur, "#655948", 2);
  oval(27, 26, skin.ears - 4, skin.ears - 3, "#d2a69c"); oval(69, 26, skin.ears - 4, skin.ears - 3, "#d2a69c");
  oval(48, 42, 29, 24, skin.fur, "#655948", 2); oval(48, 53, 22, 13, skin.light);
  oval(34, 38, 9, 10, skin.light); oval(62, 38, 9, 10, skin.light);
  const blink = pose === "idle" && frame === 3;
  oval(35, 43, 2, blink ? 1 : 3, "#443d34"); oval(61, 43, 2, blink ? 1 : 3, "#443d34");
  if (!blink) { box(35, 41, 1, 1, "#fff1ce"); box(61, 41, 1, 1, "#fff1ce"); }
  oval(29, 51, 5, 3, "#cd9d91"); oval(67, 51, 5, 3, "#cd9d91"); oval(48, 51, 4, 3, "#88665a");
  line("M48 54 L48 57 L44 59 M48 57 L52 59", "none", "#856a58");
  line("M29 63 L36 68 L60 68 L67 63 L69 81 L27 81 Z", skin.shirt, "#655948", 2);
  box(34, 64, 4, 13, "#e0cba1"); box(58, 64, 4, 13, "#e0cba1"); box(40, 72, 16, 9, "#d1bd90", "#837b5c");
  const y = pose === "success" ? 51 : 68;
  oval(23, y, 7, 9, skin.fur, "#655948"); oval(73, y, 7, 9, skin.fur, "#655948");
  if (skin.key === "mole") { line("M36 65 L48 70 L60 65 L57 75 L48 71 L39 75 Z", "#dad1b6"); oval(48, 52, 7, 4, "#b08a7c"); }
  if (pose === "success") { flower(12, 21, "#f0d284"); flower(83, 18, "#e6a9bc"); }
  parts.push("</g>");
}
for (const skin of skins) {
  mouse(skin); await save(`${skin.key}-static`, 96, 96);
  for (const [pose, count] of [["idle", 4], ["pressed", 4], ["success", 6]]) { for (let i = 0; i < count; i++) mouse(skin, i * 96, pose, i); await save(`${skin.key}-${pose}`, count * 96, 96); }
}
for (let n = 0; n < 6; n++) {
  oval(64, 55, 53, 24, "#c0a17e"); oval(64, 49, 54, 24, "#f5e8c4", "#a48158", 2); oval(64, 48, 45, 18, "#b59b6e");
  for (let i = 0; i < 30; i++) { const x = Math.round(35 + noise(i + n * 50, 59)), y = Math.round(34 + noise(i, 25, n)); oval(x, y, 6, 4, ["#b87545", "#dfb56d", "#88a167", "#d58d64"][((i + n) % 4)]); }
  flower(78, 31, "#b7c37a"); await save(`dish-${n}`, 128, 88);
}
const manifestPath = path.join(root, "assets-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.worldV2 = { source: "原创程序绘制像素占位素材，非 GPT Image 成品；参考仅用于布局与氛围", sourceFile: "scripts/create-world-assets.mjs", scenes: ["home", "restaurant", "bar"], characters: skins.map(({ key, name }) => ({ key, name })), frameWidth: 96, frameHeight: 96, anchorX: 48, anchorY: 86, base: "/assets/world/" };
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log("已导出 3 个场景、5 种鼠鼠、原创调酒鼹鼠及菜碟素材。");
