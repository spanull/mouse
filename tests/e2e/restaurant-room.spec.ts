import { expect, test } from "@playwright/test";
import sharp from "sharp";

test("厨师待机与迎客色板连续，静态备用与待机首帧相同", async ({ request }) => {
  const manifest = await (await request.get("/assets/restaurant/manifest.json")).json();
  const chef = manifest.actors["restaurant-chef"];
  const palette: number[][] = [];
  const heights: number[] = [];
  for (const pose of ["idle", "welcome"]) {
    const spec = chef.poses[pose];
    const bytes = await (await request.get(spec.file)).body();
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(320 * 12);
    for (let frame = 0; frame < 12; frame++) {
      const samples: number[] = [];
      // 毛色和帽子避开五官；围裙只统计绿色布料，排除运动手爪、纽扣与口袋缝线，不把遮挡误判成换色。
      for (const [material, x, y, width, height] of [["fur", 140, 110, 35, 12], ["apron", 125, 195, 70, 60], ["hat", 140, 55, 30, 14]] as const) {
        const sum = [0, 0, 0]; let count = 0;
        for (let row = y; row < y + height; row++) for (let col = x; col < x + width; col++) {
          const offset = (row * info.width + frame * 320 + col) * 4;
          if (data[offset + 3] < 220) continue;
          if (material === "apron" && (data[offset + 1] < data[offset] || data[offset + 1] - data[offset + 2] < 30)) continue;
          count++;
          for (let channel = 0; channel < 3; channel++) sum[channel] += data[offset + channel];
        }
        expect(count).toBeGreaterThan(0);
        samples.push(...sum.map(value => value / count));
      }
      palette.push(samples);
      let top = 320, bottom = -1;
      for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) {
        if (data[(y * info.width + frame * 320 + x) * 4 + 3] <= 128) continue;
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      expect(bottom).toBe(300);
      heights.push(bottom - top + 1);
    }
    if (pose === "idle") {
      const fallback = await (await request.get(chef.fallback)).body();
      expect(await sharp(fallback).ensureAlpha().raw().toBuffer()).toEqual(await sharp(bytes).extract({ left: 0, top: 0, width: 320, height: 320 }).ensureAlpha().raw().toBuffer());
    }
  }
  // 允许少量细纹理取样差异；旧版动作的毛色绿色通道偏差超过10，会被此检查拦截。
  for (const sample of palette) for (let channel = 0; channel < sample.length; channel++) expect(Math.abs(sample[channel] - palette[0][channel])).toBeLessThanOrEqual(6);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(4);
});

test("餐厅七尺寸：室内素材、推荐预览、菜单厨房触摸入口与键盘可用", async ({ browser }) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ hasTouch: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const [width, height] of [[320, 568], [390, 844], [430, 932], [844, 390], [768, 1024], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/restaurant");
    await expect(page.locator(".chef-mouse canvas")).toBeVisible();
    await expect(page.getByRole("status")).toContainText("欢迎光临！今天想吃点什么？");
    await expect(page.locator(".ambient-foliage, .ambient-light, .ambient-steam")).toHaveCount(0);
    await expect(page.locator(".restaurant-recommendations a")).toHaveCount(3);
    const broken = await page.locator(".restaurant-stage img").evaluateAll(async images => {
      await Promise.all(images.map(image => (image as HTMLImageElement).decode().catch(() => {})));
      return images.filter(image => !(image as HTMLImageElement).naturalWidth).length;
    });
    expect(broken).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    for (const selector of [".chef-mouse", ".restaurant-recommendations", ".restaurant-dining-table", ".menu-object", ".kitchen-object"]) {
      const box = await page.locator(selector).boundingBox();
      expect(box, selector).not.toBeNull();
      expect(box!.x, selector).toBeGreaterThanOrEqual(0);
      expect(box!.y, selector).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, selector).toBeLessThanOrEqual(width + 1);
      expect(box!.y + box!.height, selector).toBeLessThanOrEqual(Math.max(height, 360) + 1);
    }
    await page.screenshot({ path: `art-source/review/restaurant-v1/scene-${width}.png` });
    await page.locator(".restaurant-recommendations a").first().tap();
    await expect(page).toHaveURL(/\/restaurant\/dish\//);
    await expect(page.getByTestId("coins")).toHaveText("9");
    await expect(page.locator(".locked-story")).toBeVisible();
    await page.goto("/restaurant");
    await page.getByRole("link", { name: "打开吃瓜菜单", exact: true }).tap();
    await expect(page).toHaveURL(/\/restaurant\/menu$/);
    await expect(page.getByTestId("coins")).toHaveText("9");
    await page.goto("/restaurant");
    await page.getByRole("link", { name: "进入厨房烹饪", exact: true }).tap();
    await expect(page).toHaveURL(/\/restaurant\/kitchen$/);
  }
  await page.goto("/restaurant");
  await page.locator(".restaurant-recommendations a").first().focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/restaurant\/dish\//);
  expect(errors).toEqual([]);
  await context.close();
});

test("厨师完成迎客后回待机，后台冻结，失败保留可完成入口", async ({ page }) => {
  await page.goto("/restaurant");
  const canvas = page.locator(".chef-mouse canvas");
  await expect(canvas).toHaveAttribute("data-pose", "welcome");
  await expect.poll(() => canvas.getAttribute("data-frame")).not.toBe("0");
  const beforeClick = await canvas.getAttribute("data-frame");
  await page.getByRole("button", { name: "和厨师鼠打招呼" }).click();
  expect(Number(await canvas.getAttribute("data-frame"))).toBeGreaterThanOrEqual(Number(beforeClick));
  // 模拟后台事件检查帧冻结；这验证播放器逻辑，不替代移动真机后台回收验收。
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  const frame = await canvas.getAttribute("data-frame");
  await page.waitForTimeout(800);
  await expect(canvas).toHaveAttribute("data-frame", frame!);
  await page.evaluate(() => { delete (document as unknown as { hidden?: boolean }).hidden; document.dispatchEvent(new Event("visibilitychange")); });
  await expect(canvas).toHaveAttribute("data-pose", "idle", { timeout: 10000 });
  await page.getByRole("button", { name: "和厨师鼠打招呼" }).click();
  await expect(canvas).toHaveAttribute("data-pose", "welcome");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const stopped = await canvas.getAttribute("data-frame");
  await page.waitForTimeout(400);
  await expect(canvas).toHaveAttribute("data-frame", stopped!);
  await page.route("**/assets/restaurant/chef-welcome*.png", route => route.abort());
  await page.reload();
  await expect(page.getByRole("status")).toContainText("厨师动作暂时不可用");
  await expect(page.getByRole("button", { name: "重试角色动画" })).toBeVisible();
  await page.unroute("**/assets/restaurant/chef-welcome*.png");
  await page.getByRole("button", { name: "重试角色动画" }).click();
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("status")).not.toContainText("厨师动作暂时不可用");
  await page.getByRole("link", { name: "打开吃瓜菜单", exact: true }).click();
  await expect(page).toHaveURL(/\/restaurant\/menu$/);
});

test("推荐板过滤下架菜品，空菜单保留厨房入口且不消费", async ({ page }) => {
  await page.goto("/restaurant");
  await expect(page.locator(".restaurant-recommendations a")).toHaveCount(3);
  await page.evaluate(() => {
    const state = JSON.parse(sessionStorage.getItem("mouse-world-v2")!);
    for (const entry of state.entries) if (entry.kind === "dish") entry.status = "hidden";
    sessionStorage.setItem("mouse-world-v2", JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator(".restaurant-recommendations a")).toHaveCount(0);
  await expect(page.getByText("新菜正在准备中")).toBeVisible();
  await page.getByRole("link", { name: "打开吃瓜菜单", exact: true }).click();
  await expect(page.getByTestId("coins")).toHaveText("9");
  await expect(page.getByText("菜单还空着")).toBeVisible();
  await page.getByRole("link", { name: "去厨房烹饪", exact: true }).click();
  await expect(page).toHaveURL(/\/restaurant\/kitchen$/);
});
