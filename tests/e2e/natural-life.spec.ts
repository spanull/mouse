import { expect, test } from "@playwright/test";

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
