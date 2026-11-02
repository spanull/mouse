import { expect, test } from "@playwright/test";

test("慢素材不跳过调酒，后台保留动作帧，恢复后按顺序送达", async ({ page }) => {
  test.setTimeout(40000);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/mole-*.png", async route => { await gate; await route.continue(); });
  await page.goto("/bar/drinks");
  await page.getByRole("button", { name: /晚安莓莓/ }).click();
  await page.getByLabel("写下你的心事").fill("今天有点疲惫，想在树洞里安静坐一会儿。");
  await page.getByRole("button", { name: "把心事交给这杯酒" }).click();
  try {
    // 故意超过旧版整套服务的 6.6 秒，验证加载期间不会提前送达。
    await page.waitForTimeout(7000);
    await expect(page.locator(".bartender .mouse-actor")).toHaveAttribute("data-pose", "shake");
    await expect(page.locator(".served-glass")).toHaveCount(0);
  } finally { release(); }
  const actor = page.locator(".bartender canvas");
  await expect(actor).toHaveAttribute("data-pose", "shake");
  await expect.poll(() => actor.getAttribute("data-frame")).not.toBe("0");
  // 模拟 visibilitychange，精确验证 ticker 暂停路径，不依赖无头浏览器标签页调度策略。
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  const frame = await actor.getAttribute("data-frame");
  await page.waitForTimeout(2200);
  await expect(actor).toHaveAttribute("data-pose", "shake");
  await expect(actor).toHaveAttribute("data-frame", frame!);
  await page.evaluate(() => { delete (document as unknown as { hidden?: boolean }).hidden; document.dispatchEvent(new Event("visibilitychange")); });
  for (const pose of ["pour", "serve"]) await expect(actor).toHaveAttribute("data-pose", pose);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.locator(".served-glass")).toHaveCSS("animation-play-state", "paused");
  await page.evaluate(() => { delete (document as unknown as { hidden?: boolean }).hidden; document.dispatchEvent(new Event("visibilitychange")); });
  await expect(actor).toHaveAttribute("data-pose", "comfort");
  await expect(page.getByRole("link", { name: "收好饮品，回到吧台" })).toBeVisible();
  await page.goto("/home/records");
  await expect(page.locator(".record")).toHaveCount(1);
});

test("调酒中切换系统静态偏好不倒退，素材失败仍可收好饮品", async ({ page }) => {
  await page.goto("/bar/drinks");
  await page.getByRole("button", { name: /晚安莓莓/ }).click();
  await page.getByLabel("写下你的心事").fill("把今天的烦恼留在这里，明天再慢慢走。");
  await page.getByRole("button", { name: "把心事交给这杯酒" }).click();
  await expect(page.locator(".bartender canvas")).toHaveAttribute("data-pose", "shake");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("link", { name: "收好饮品，回到吧台" })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".bartender canvas")).toHaveAttribute("data-pose", "comfort");
  await page.getByRole("link", { name: "收好饮品，回到吧台" }).click();
  await page.route("**/mole-pour.png", route => route.abort());
  await page.goto("/bar/drinks");
  await page.getByRole("button", { name: /薄荷月光/ }).click();
  await page.getByLabel("写下你的心事").fill("第二杯是给认真度过今天的自己。");
  await page.getByRole("button", { name: "把心事交给这杯酒" }).click();
  await expect(page.getByRole("status")).toContainText("动画暂时不可用，饮品已送达");
  await expect(page.getByRole("link", { name: "收好饮品，回到吧台" })).toBeVisible();
  await page.goto("/home/records");
  await expect(page.locator(".record")).toHaveCount(2);
});

test("环境序列帧变化、松鼠离场及减少动态效果保持静态", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const squirrel = page.locator('[data-ambient="squirrel"]');
  await expect.poll(() => squirrel.evaluate(el => el.getAnimations().length)).toBe(1);
  const seated = await squirrel.screenshot();
  await squirrel.evaluate(el => { const animation = el.getAnimations()[0]; animation.pause(); animation.currentTime = 6000; });
  expect(await squirrel.screenshot()).not.toEqual(seated);
  const lamp = page.locator('[data-ambient="lantern"]');
  const frame = await lamp.evaluate(el => getComputedStyle(el).backgroundPosition);
  await expect.poll(() => lamp.evaluate(el => getComputedStyle(el).backgroundPosition)).not.toBe(frame);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.locator(".ambient-sprite").evaluateAll(elements => elements.every(el => el.getAnimations().every(a => a.playState === "paused" && a.currentTime === 0)))).toBe(true);
  for (const path of ["/restaurant", "/bar"]) {
    await page.goto(path);
    await expect.poll(() => page.locator(".ambient-sprite").first().evaluate(el => el.getAnimations().length)).toBe(1);
    expect(await page.locator(".ambient-sprite").evaluateAll(elements => elements.every(el => el.getAnimations().every(a => a.playState === "paused")))).toBe(true);
  }
});

test("角色独立动作配置与自动闲暇，厨师和座椅整件呈现", async ({ page, request }) => {
  test.setTimeout(45000);
  const response = await request.get("/assets/natural/manifest.json");
  const manifest = await response.json();
  for (const key of ["rat", "hamster", "field", "chinchilla", "dormouse"]) {
    expect(manifest.actors[key].poses.idle.frameCount).toBe(8);
    expect(manifest.actors[key].poses.pressed.frameCount).toBe(8);
    expect(manifest.actors[key].poses.leisure.frameCount).toBe(12);
  }
  expect(Object.keys(manifest.actors.mole.poses)).toHaveLength(8);
  expect(Object.values(manifest.actors.mole.poses).every((pose: unknown) => (pose as { frameCount: number }).frameCount === 12)).toBe(true);
  await page.goto("/");
  const canvas = page.locator(".home-mouse canvas");
  await expect(canvas).toHaveAttribute("data-frames", "8");
  const original = await canvas.boundingBox();
  await expect(canvas).toHaveAttribute("data-pose", "leisure", { timeout: 25000 });
  expect(await canvas.boundingBox()).toEqual(original);
  await page.getByRole("button", { name: "和鼠鼠打招呼" }).click();
  await expect(canvas).toHaveAttribute("data-pose", "pressed");
  await page.goto("/restaurant");
  await expect(page.locator(".chef-mouse canvas")).toHaveAttribute("data-frames", "12");
  expect(await page.locator(".restaurant-stage").evaluate(el => getComputedStyle(el, "::after").display)).toBe("none");
  await page.goto("/bar");
  await expect(page.locator(".seated-mouse canvas")).toHaveCount(2);
  await expect(page.locator(".empty-bar-stool")).toBeVisible();
  await expect(page.locator(".backdrop-art")).toHaveAttribute("src", "/assets/natural/bar-tall.png");
});
