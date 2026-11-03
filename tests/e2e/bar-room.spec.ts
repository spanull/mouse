import { expect, test } from "@playwright/test";
import sharp from "sharp";

test("酒吧新动作使用完整透明帧，脚底与静态备用一致", async ({ request }) => {
  const manifest = await (await request.get("/assets/bar/manifest.json")).json();
  for (const key of ["mole", "patron-dormouse", "patron-hamster"]) {
    const actor = manifest.actors[key];
    for (const [name, value] of Object.entries(actor.poses)) {
      const pose = value as { file: string; frameCount: number; durations: number[] };
      const response = await request.get(pose.file);
      expect(response.ok()).toBe(true);
      const bytes = await response.body();
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(info.width).toBe(actor.frameSize * pose.frameCount);
      expect(info.height).toBe(actor.frameSize);
      expect(pose.durations).toHaveLength(pose.frameCount);
      for (let i = 0; i < pose.frameCount; i++) {
        let bottom = -1, edge = 0, keyPixels = 0;
        for (let y = 0; y < info.height; y++) for (let x = 0; x < actor.frameSize; x++) {
          const offset = (y * info.width + i * actor.frameSize + x) * 4;
          if (data[offset + 3] <= 128) continue;
          bottom = Math.max(bottom, y);
          if (x < 4 || x >= actor.frameSize - 4 || y < 4 || y >= actor.frameSize - 4) edge++;
          // 只检查人物外缘色键，杯中被轮廓包围的紫酒属于真实内容。
          const neighborOffsets = [offset - 4, offset + 4, offset - info.width * 4, offset + info.width * 4];
          const exterior = neighborOffsets.some(neighbor => neighbor >= 0 && neighbor + 3 < data.length && data[neighbor + 3] === 0);
          if (exterior && data[offset] > 150 && data[offset + 2] > 150 && data[offset + 1] < 70) keyPixels++;
        }
        expect(bottom, `${key}/${name}/${i}脚底`).toBe(300);
        expect(edge, `${key}/${name}/${i}安全边缘`).toBe(0);
        expect(keyPixels, `${key}/${name}/${i}色键残留`).toBe(0);
      }
      if (name === "idle") {
        const fallback = await (await request.get(actor.fallback)).body();
        expect(await sharp(fallback).ensureAlpha().raw().toBuffer()).toEqual(await sharp(bytes).extract({ left: 0, top: 0, width: actor.frameSize, height: actor.frameSize }).ensureAlpha().raw().toBuffer());
      }
    }
  }
});

test("酒吧七视口室内组合、入口触摸和键盘可达", async ({ browser }) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ hasTouch: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const [width, height] of [[320, 568], [390, 844], [430, 932], [844, 390], [768, 1024], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/bar");
    await expect(page.locator(".bartender canvas")).toBeVisible();
    await expect(page.locator(".seated-mouse canvas")).toHaveCount(2);
    await expect(page.locator(".ambient-life, .ambient-light, .ambient-foliage")).toHaveCount(0);
    const broken = await page.locator(".bar-stage img").evaluateAll(async images => {
      await Promise.all(images.map(image => (image as HTMLImageElement).decode().catch(() => {})));
      return images.filter(image => !(image as HTMLImageElement).naturalWidth).length;
    });
    expect(broken).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    for (const label of ["打开心声墙", "打开酒单，来一杯", "打个招呼", "听我说说", "看看擦杯", "给我一点鼓励"]) {
      const box = await page.getByRole(label.includes("打开") ? "link" : "button", { name: label, exact: true }).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(Math.max(height, 400) + 1);
    }
    await page.screenshot({ path: `art-source/review/bar-flare/scene-${width}.png` });
    await page.getByRole("button", { name: "看看擦杯", exact: true }).tap();
    await expect(page.locator(".bartender canvas")).toHaveAttribute("data-pose", "polish");
    await page.getByRole("link", { name: "打开心声墙", exact: true }).tap();
    await expect(page).toHaveURL(/\/bar\/wall$/);
    await page.goto("/bar");
    await page.getByRole("link", { name: "打开酒单，来一杯", exact: true }).tap();
    await expect(page).toHaveURL(/\/bar\/drinks$/);
  }
  await page.goto("/bar");
  await page.getByRole("link", { name: "打开酒单，来一杯", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/bar\/drinks$/);
  expect(errors).toEqual([]);
  await context.close();
});

test("酒吧动作失败可重试，恢复后清除反馈并继续互动", async ({ page }) => {
  await page.route("**/assets/bar/mole-polish.png", route => route.abort());
  await page.goto("/bar");
  await expect(page.getByRole("status")).toContainText("鼹鼠动作暂时不可用");
  await expect(page.getByRole("link", { name: "打开酒单，来一杯" })).toBeVisible();
  await page.unroute("**/assets/bar/mole-polish.png");
  await page.getByRole("button", { name: "重试角色动画" }).click();
  await expect(page.locator(".bartender canvas")).toBeVisible();
  await expect(page.getByRole("status")).not.toContainText("鼹鼠动作暂时不可用");
  await page.getByRole("button", { name: "听我说说", exact: true }).click();
  await expect(page.locator(".bartender canvas")).toHaveAttribute("data-pose", "listen");
});
