import { expect, test } from "@playwright/test";

test("全图像入口在缩放、横竖屏和触摸下都能进入两家店", async ({ browser }) => {
  test.setTimeout(90000);
  const context = await browser.newContext({ hasTouch: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const [width, height] of [[320, 568], [390, 844], [430, 932], [844, 390], [768, 1024], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator("canvas").first()).toBeVisible();
    await expect(page.locator(".scene-art")).toHaveText("");
    await expect(page.locator(".mouse-world .world-footnote, .mouse-world svg")).toHaveCount(0);
    const size = await page.locator(".scene-art").boundingBox();
    expect(size?.width).toBe(width);
    expect(size?.height).toBeGreaterThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    for (const label of ["进入餐厅", "进入树洞酒吧"]) {
      const box = await page.getByRole("link", { name: label, exact: true }).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(Math.max(height, 400));
    }
    await page.screenshot({ path: `test-results/game-home-${width}.png` });
    await page.getByRole("link", { name: "进入餐厅", exact: true }).tap();
    await expect(page).toHaveURL(/\/restaurant$/);
    await page.getByRole("link", { name: "打开吃瓜菜单" }).tap();
    await expect(page.getByTestId("coins")).toHaveText("9");
    await page.screenshot({ path: `test-results/game-menu-${width}.png`, fullPage: true });
    await page.goto("/");
    await page.getByRole("link", { name: "进入树洞酒吧", exact: true }).tap();
    await expect(page).toHaveURL(/\/bar$/);
    await expect(page.locator("canvas").first()).toBeVisible();
    await page.screenshot({ path: `test-results/game-bar-${width}.png` });
    await page.getByRole("link", { name: "打开酒单，来一杯" }).tap();
    await expect(page.getByRole("button", { name: /晚安莓莓/ })).toBeVisible();
  }
  expect(errors).toEqual([]);
  await context.close();
});

test("鼹鼠互动切换独立动作和对白，点酒播放完整流程且只计一次", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/bar");
  await expect(page.locator("canvas").first()).toBeVisible();
  for (const [label, pose] of [["打个招呼", "welcome"], ["听我说说", "listen"], ["看看擦杯", "polish"], ["给我一点鼓励", "comfort"]]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.locator(".bartender .mouse-actor")).toHaveAttribute("data-pose", pose);
    await expect(page.getByRole("status")).not.toBeEmpty();
  }
  const first = await page.getByRole("status").textContent();
  await page.getByRole("button", { name: "给我一点鼓励", exact: true }).click();
  await expect(page.getByRole("status")).not.toHaveText(first!);
  await page.getByRole("link", { name: "打开酒单，来一杯" }).click();
  await page.getByRole("button", { name: /晚安莓莓/ }).click();
  await page.getByLabel("写下你的心事").fill("想把今天的疲惫暂时放在树洞里，明天继续慢慢走。");
  await page.getByRole("button", { name: "把心事交给这杯酒" }).click();
  await expect(page.locator(".bartender .mouse-actor")).toHaveAttribute("data-pose", "shake");
  await expect(page.locator(".bartender .mouse-actor")).toHaveAttribute("data-pose", "pour");
  await expect(page.locator(".bartender .mouse-actor")).toHaveAttribute("data-pose", "serve");
  await expect(page.locator(".served-glass")).toBeVisible();
  await expect(page.locator(".bartender .mouse-actor")).toHaveAttribute("data-pose", "comfort");
  await page.getByRole("link", { name: "收好饮品，回到吧台" }).click();
  await expect(page).toHaveURL(/\/bar$/);
  await expect(page.getByRole("button", { name: "打个招呼", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "打开酒单，来一杯" }).click();
  await expect(page.getByText(/今日还可点 2/)).toBeVisible();
});

test("减少动画时互动立即渲染，屏幕变化后背景与热区仍同步", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/bar");
  const canvas = page.locator(".bartender canvas");
  await expect(canvas).toBeVisible();
  const before = await canvas.screenshot();
  await page.getByRole("button", { name: "看看擦杯" }).click();
  await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator(".backdrop-art")).toHaveJSProperty("complete", true);
  await page.getByRole("link", { name: "打开心声墙" }).click();
  await expect(page).toHaveURL(/\/bar\/wall$/);
  await page.locator(".sticky-note").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
