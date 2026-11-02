import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const existingManifest = JSON.parse(await readFile(path.join(root, "assets-manifest.json"), "utf8"));
if (existingManifest.worldV2?.generation) throw new Error("已接入 AI 素材，禁止重置清单与占位图；请使用 prepare-gateway-assets.mjs 导出。");
const output = path.join(root, "public/assets/placeholder");
await mkdir(output, { recursive: true });
let shapes = [];

/** 添加像素矩形；所有坐标取整，保证导出的占位图不含亚像素边缘。 */
function rect(x, y, width, height, color) { shapes.push(`<rect x="${Math.round(x)}" y="${Math.round(y)}" width="${width}" height="${height}" fill="${color}"/>`); }
/** 以阶梯矩形绘制树冠，统一深浅方向；仅生成自制演示素材。 */
function tree(x, y, size = 1) {
  rect(x + 15 * size, y + 29 * size, 8 * size, 24 * size, "#927753");
  rect(x + 19 * size, y + 34 * size, 4 * size, 19 * size, "#715f48");
  rect(x + 5 * size, y + 7 * size, 30 * size, 31 * size, "#638553");
  rect(x, y + 16 * size, 40 * size, 15 * size, "#638553");
  rect(x + 11 * size, y, 18 * size, 42 * size, "#638553");
  rect(x + 7 * size, y + 9 * size, 22 * size, 18 * size, "#87a766");
  rect(x + 12 * size, y + 4 * size, 13 * size, 28 * size, "#87a766");
  rect(x + 9 * size, y + 12 * size, 5 * size, 4 * size, "#abc783");
}
/** 绘制固定色板的小花，作为场景里的稀疏装饰，不提供交互。 */
function flower(x, y, color) {
  rect(x + 2, y + 4, 1, 5, "#6b9055"); rect(x, y + 2, 5, 2, color); rect(x + 1, y + 1, 3, 4, color); rect(x + 2, y + 2, 1, 1, "#f8df8e");
}
/** 将当前矩形集合导出为 PNG；SVG 仅作确定性绘图中间表示，不作为正式 AI 素材。 */
async function save(name, width, height) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" shape-rendering="crispEdges">${shapes.join("")}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(output, name));
  shapes = [];
}

rect(0, 0, 480, 260, "#d5e5b7");
rect(0, 0, 480, 56, "#e7eed3");
for (let i = 0; i < 32; i++) {
  const x = (i * 73 + 9) % 480, y = 72 + (i * 37) % 184;
  rect(x, y, 3, 2, "#bed39c"); rect(x + 5, y + 3, 2, 2, "#bed39c");
}
// 远处围栏、树木和灌木形成固定场景的边界。
rect(10, 62, 460, 4, "#c3b78c"); rect(10, 76, 460, 3, "#c3b78c");
for (let x = 12; x < 470; x += 18) rect(x, 56, 4, 30, "#d7cba2");
for (const [x, y, s] of [[-8, 9, 1.8], [57, 0, 1.5], [348, 5, 1.4], [420, 9, 1.8]]) tree(x, y, s);
// 小屋和条纹屋顶。
rect(191, 45, 103, 73, "#b59a72"); rect(195, 47, 95, 67, "#f0e3bc");
rect(187, 37, 110, 13, "#618875"); rect(197, 27, 90, 10, "#618875"); rect(207, 18, 70, 9, "#618875");
for (let x = 206; x < 290; x += 14) rect(x, 37, 7, 4, "#82a18a");
rect(233, 77, 22, 41, "#947b59"); rect(237, 81, 14, 37, "#ae956b"); rect(246, 99, 2, 2, "#f3d791");
for (const x of [204, 267]) { rect(x, 65, 16, 20, "#9b805b"); rect(x + 2, 67, 12, 16, "#accac0"); rect(x + 7, 67, 2, 16, "#e8dfb8"); rect(x + 2, 74, 12, 2, "#e8dfb8"); }
// 弯曲小路与零散踏脚石。
rect(228, 118, 32, 41, "#eee3be"); rect(204, 148, 80, 38, "#eee3be"); rect(188, 174, 101, 37, "#eee3be"); rect(215, 202, 38, 58, "#eee3be");
for (const [x, y] of [[236, 130], [228, 151], [253, 170], [210, 190], [235, 213], [226, 241]]) { rect(x, y, 14, 6, "#d7c99f"); rect(x + 2, y, 9, 2, "#e3d5ae"); }
// 左侧吃瓜摊：红白棚顶、瓜果和木质柜台。
rect(62, 112, 87, 6, "#826d4e"); rect(68, 117, 4, 56, "#a08358"); rect(140, 117, 4, 56, "#a08358");
for (let i = 0; i < 6; i++) { rect(60 + i * 15, 101, 15, 17, i % 2 ? "#f6eccb" : "#c97a65"); rect(60 + i * 15, 116, 15, 5, i % 2 ? "#e5d7af" : "#ac6252"); }
rect(65, 96, 80, 5, "#d89378"); rect(67, 150, 78, 27, "#ab885a"); rect(67, 150, 78, 4, "#c4a06d");
for (let x = 75; x < 140; x += 20) { rect(x, 140, 14, 10, "#5d8251"); rect(x + 3, 137, 8, 14, "#7a9d60"); rect(x + 6, 138, 2, 12, "#4d7347"); }
rect(87, 160, 40, 7, "#ddc294");
// 留言牌及便签。
rect(333, 113, 5, 65, "#957a52"); rect(384, 113, 5, 65, "#957a52"); rect(325, 108, 72, 48, "#947a54"); rect(330, 113, 62, 37, "#bd9f6b");
for (const [x, y, color] of [[335, 118, "#f6edce"], [356, 122, "#f0c9ad"], [375, 117, "#e0e7bd"]]) { rect(x, y, 13, 17, color); rect(x + 2, y + 5, 8, 1, "#b7a486"); rect(x + 2, y + 9, 6, 1, "#b7a486"); }
// 信箱与小池塘。
rect(351, 202, 6, 31, "#9b805b"); rect(338, 183, 31, 23, "#658e80"); rect(342, 179, 23, 7, "#7ca394"); rect(344, 191, 17, 3, "#3f665d"); rect(368, 180, 3, 16, "#a27156"); rect(371, 180, 8, 5, "#d49772");
rect(25, 209, 94, 30, "#a7cbae"); rect(34, 200, 72, 46, "#a7cbae"); rect(35, 210, 70, 27, "#bcded0"); rect(44, 205, 50, 37, "#bcded0"); rect(47, 218, 22, 2, "#e3efdb"); rect(78, 230, 17, 2, "#e3efdb"); rect(84, 209, 14, 6, "#81aa74");
tree(-18, 150, 1.5); tree(418, 150, 1.5);
for (const [x, y] of [[168, 133], [158, 195], [299, 210], [408, 113], [122, 217], [277, 233], [47, 180]]) { flower(x, y, "#f7f1d9"); flower(x + 8, y + 5, "#d59b87"); }
await save("courtyard.png", 480, 260);

// 独立地块和树木供整屏小院按屏幕比例重新排布，避免竖屏裁切功能物件。
rect(0, 0, 128, 128, "#cfdfaf");
for (let i = 0; i < 18; i++) {
  const x = (i * 37 + 9) % 122, y = (i * 53 + 8) % 122;
  rect(x, y, 2, 2, "#b9cf97"); rect(x + 3, y - 2, 2, 3, "#b9cf97");
}
flower(85, 56, "#f7f1d9"); flower(90, 61, "#f7f1d9");
await save("grass.png", 128, 128);
tree(0, 0);
await save("tree.png", 40, 56);
rect(8, 8, 96, 48, "#a3bc8b"); rect(0, 18, 112, 28, "#a3bc8b");
rect(12, 12, 88, 40, "#9bc7b1"); rect(4, 22, 104, 20, "#9bc7b1");
rect(19, 16, 73, 32, "#bddbcc"); rect(32, 27, 20, 2, "#e5edcf"); rect(67, 39, 16, 2, "#e5edcf");
rect(72, 18, 18, 8, "#81a875"); flower(78, 16, "#efc6bc");
await save("pond.png", 112, 64);

/** 绘制单帧小老鼠占位角色；通过固定偏移与眼睛变化生成可重复导出的演示动作。 */
function mouse(offset, pose, frame) {
  const jump = pose === "pressed" ? [0, 2, -7, -3][frame] : 0;
  const bob = pose === "idle" && frame === 1 ? -1 : 0;
  const x = offset, y = jump + bob;
  rect(x + 16, 54, 34, 3, "#9eaf86");
  rect(x + 47, y + 40, 9, 3, "#be9c86"); rect(x + 54, y + 34, 3, 9, "#be9c86");
  rect(x + 15, y + 8, 14, 17, "#8d8777"); rect(x + 39, y + 8, 14, 17, "#8d8777");
  rect(x + 17, y + 10, 10, 12, "#e9b7a2"); rect(x + 41, y + 10, 10, 12, "#e9b7a2");
  rect(x + 22, y + 17, 24, 24, "#b1aa96"); rect(x + 17, y + 23, 34, 15, "#b1aa96");
  rect(x + 23, y + 18, 17, 4, "#ccc4ad");
  rect(x + 23, y + 38, 22, 16, "#658d72"); rect(x + 28, y + 39, 12, 15, "#e2d7ad");
  rect(x + 19, y + 52, 11, 4, "#817968"); rect(x + 37, y + 52, 11, 4, "#817968");
  const armY = pose === "success" && frame % 2 ? 31 : 42;
  rect(x + 16, y + armY, 7, 9, "#aaa38e"); rect(x + 45, y + armY, 7, 9, "#aaa38e");
  const eyeH = pose === "idle" && frame === 3 ? 1 : 4;
  rect(x + 25, y + 27, 3, eyeH, "#464b3d"); rect(x + 40, y + 27, 3, eyeH, "#464b3d");
  rect(x + 31, y + 32, 6, 3, "#886f60"); rect(x + 33, y + 35, 2, 2, "#886f60");
  rect(x + 20, y + 32, 5, 3, "#d8ac94"); rect(x + 44, y + 32, 5, 3, "#d8ac94");
  if (pose === "success") { rect(x + 9, 7 + frame % 2, 3, 7, "#d09274"); rect(x + 7, 9 + frame % 2, 7, 3, "#d09274"); }
}
mouse(0, "idle", 0); await save("hero-static.png", 64, 64);
for (const [pose, frames] of [["idle", 4], ["pressed", 4], ["success", 6]]) {
  for (let frame = 0; frame < frames; frame++) mouse(frame * 64, pose, frame);
  await save(`hero-${pose}.png`, frames * 64, 64);
}
const manifest = {
  version: 1, source: "项目自制程序绘制占位素材，非 GPT Image 正式素材", sourceFile: "scripts/create-placeholder-assets.mjs",
  approvalStatus: "prototype-only", scene: "/assets/placeholder/courtyard.png", fallback: "/assets/placeholder/hero-static.png",
  world: { ground: "/assets/placeholder/grass.png", tree: "/assets/placeholder/tree.png", pond: "/assets/placeholder/pond.png" },
  animations: Object.fromEntries([["idle", 4, 4, true], ["pressed", 4, 10, false], ["success", 6, 8, false]].map(([name, frameCount, fps, loop]) => [name, { file: `/assets/placeholder/hero-${name}.png`, frameWidth: 64, frameHeight: 64, frameCount, fps, loop, anchorX: 32, anchorY: 56 }]))
};
await writeFile(path.join(root, "assets-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log("已生成小院、静态角色、三个动作精灵图及占位素材清单。");
await import("./create-world-assets.mjs");
