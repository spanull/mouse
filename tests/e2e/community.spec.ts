import { expect, test } from "@playwright/test";

test("之家与双店场景、角色互动、三种屏幕和无评论入口", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    for (const [path, name] of [["/", "home"], ["/restaurant", "restaurant"], ["/bar", "bar"]]) {
      await page.goto(path); await expect(page.locator("canvas[data-scene=mouse]").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByRole("navigation")).toHaveCount(0); await expect(page.getByRole("textbox")).toHaveCount(0);
      await page.screenshot({ path: `test-results/v2-${name}-${width}.png`, fullPage: true });
    }
  }
  await page.goto("/"); await page.getByRole("button", { name: "和鼠鼠打招呼" }).click();
  await expect(page.getByRole("status")).toContainText("饿了去吃瓜");
  await page.getByRole("link", { name: "进入餐厅" }).click(); await expect(page).toHaveURL(/restaurant$/);
  expect(errors).toEqual([]);
});

test("品尝、免费重看、五档评价、三次封顶与直达防绕过", async ({ page }) => {
  await page.goto("/restaurant/menu"); await expect(page.getByTestId("coins")).toHaveText("9");
  await page.getByRole("button", { name: "开吃 · 1 金币" }).click();
  await expect(page.locator(".story-body")).toContainText("香薰机");
  await expect(page.getByTestId("coins")).toHaveText("8");
  await page.getByRole("button", { name: "震撼美味", exact: true }).click();
  await page.getByRole("button", { name: "普通", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已评价：普通"); await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.reload(); await expect(page.getByTestId("coins")).toHaveText("8");
  for (const id of ["dish-2", "dish-3"]) { await page.goto(`/restaurant/dish/${id}`); await expect(page.locator(".story-body")).toHaveCount(0); await page.getByRole("button", { name: "品尝这道菜 · 1 金币" }).click(); await expect(page.locator(".story-body")).toBeVisible(); }
  await page.goto("/restaurant/dish/dish-4"); await page.getByRole("button", { name: "品尝这道菜 · 1 金币" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "本场已品尝 3 道菜" })).toBeVisible(); await expect(page.locator(".story-body")).toHaveCount(0); await expect(page.getByTestId("coins")).toHaveText("6");
});

test("烹饪待审核、通过只奖一次、自己作品免费和隐藏", async ({ page }) => {
  await page.goto("/restaurant/kitchen"); await page.getByRole("button", { name: "完成烹饪" }).click();
  await expect(page.getByText("菜名需要 4～40 个字符。")).toBeVisible();
  await page.getByLabel("菜品标题").fill("鼠鼠测试厨房的故事");
  await page.getByLabel("菜单简介").fill("一盘神秘奶酪引发的新鲜故事");
  await page.getByLabel("故事正文").fill("小田鼠今天走进餐厅，发现所有的奶酪都被厨师鼠做成了爱心形状。");
  await page.getByRole("button", { name: "完成烹饪" }).click(); await expect(page.getByRole("status")).toContainText("已提交");
  await page.goto("/restaurant/menu"); await expect(page.getByTestId("coins")).toHaveText("9");
  await page.goto("/home/records"); await expect(page.getByText("待审核", { exact: true })).toBeVisible();
  await page.goto("/admin"); await page.getByRole("button", { name: "通过", exact: true }).click();
  await expect(page.getByRole("button", { name: "通过", exact: true })).toHaveCount(0);
  await page.goto("/restaurant/menu"); await expect(page.getByTestId("coins")).toHaveText("10"); await expect(page.getByTestId("bonus")).toHaveText("1");
  await page.getByRole("button", { name: "再尝一口 · 免费重看" }).click(); await expect(page.getByTestId("coins")).toHaveText("10");
  await expect(page).toHaveURL(/restaurant\/dish\//); const url = page.url(); await page.goto("/admin"); await page.getByRole("button", { name: "已公开", exact: true }).click();
  page.once("dialog", dialog => dialog.accept("演示隐藏")); await page.locator(".moderation-row").filter({ hasText: "鼠鼠测试厨房的故事" }).getByRole("button", { name: "隐藏" }).click();
  await page.goto(url); await expect(page.getByText("这道菜暂时下架了")).toBeVisible(); await expect(page.locator(".story-body")).toHaveCount(0);
});

test("酒吧取消不扣次、失败保留、成功送酒及三杯上限", async ({ page }) => {
  await page.goto("/settings"); await page.getByText("试玩工具与素材说明", { exact: true }).click(); await page.getByLabel("模拟下一次提交失败").check();
  await page.getByRole("link", { name: "回到 MY HOME" }).click(); await page.getByRole("link", { name: "进入树洞酒吧" }).click(); await page.getByRole("link", { name: /来一杯/ }).click(); await page.getByRole("button", { name: /晚安莓莓/ }).click(); await page.getByLabel("写下你的心事").fill("这是一句暂时还没有写完的心事");
  page.once("dialog", dialog => dialog.dismiss()); await page.keyboard.press("Escape"); await expect(page.getByLabel("写下你的心事")).toHaveValue("这是一句暂时还没有写完的心事");
  await page.getByRole("button", { name: "把心事交给这杯酒" }).click(); await expect(page.getByRole("alert").filter({ hasText: "模拟网络中断" })).toBeVisible();
  await expect(page.getByLabel("写下你的心事")).toHaveValue("这是一句暂时还没有写完的心事");
  await page.getByRole("button", { name: "把心事交给这杯酒" }).click(); await expect(page.locator(".served-glass")).toBeVisible(); await expect(page.getByRole("status")).toContainText("你已经很努力了");
  await page.screenshot({ path: "test-results/v2-served.png", fullPage: true });
  await page.goto("/bar/wall"); await expect(page.getByText("这是一句暂时还没有写完的心事", { exact: true })).toHaveCount(0);
  for (let n = 2; n <= 3; n++) { await page.goto("/bar/drinks"); await page.getByRole("button", { name: /薄荷月光/ }).click(); await page.getByLabel("写下你的心事").fill(`第${n}杯心事，明天继续好好生活`); await page.getByRole("button", { name: "把心事交给这杯酒" }).click(); await expect(page.locator(".served-glass")).toBeVisible(); }
  await page.goto("/bar/drinks"); await expect(page.getByRole("button", { name: /晚安莓莓/ })).toBeDisabled(); await expect(page.getByText(/今日还可点 0/)).toBeVisible();
  await page.goto("/home/records"); await expect(page.locator(".record")).toHaveCount(3);
});

test("心声墙放大、关闭焦点、公开审核与举报", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/bar/wall");
  await page.locator(".sticky-note").first().click(); await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0); await page.getByRole("button", { name: "这份内容不妥？举报" }).click();
  await page.getByRole("button", { name: "记录举报", exact: true }).click(); await expect(page.getByRole("button", { name: "已记录演示举报" })).toBeDisabled();
  await page.screenshot({ path: "test-results/v2-wall-dialog.png", fullPage: true }); await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/bar\/wall$/);
});

test("角色选择持久化、旧入口重定向、空状态恢复", async ({ page }) => {
  await page.goto("/home/characters"); await page.getByRole("button", { name: /龙猫/ }).click(); await page.getByLabel("鼠鼠身份描述").selectOption("不公开");
  await page.getByRole("link", { name: "回到我的家" }).click(); await expect(page.locator(".game-top .portrait")).toHaveAttribute("src", /chinchilla/); await page.reload(); await expect(page.locator(".game-top .portrait")).toHaveAttribute("src", /chinchilla/);
  await page.goto("/topics"); await expect(page).toHaveURL(/restaurant$/);
  await page.goto("/settings"); await page.getByText("试玩工具与素材说明", { exact: true }).click(); page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "清空内容", exact: true }).click();
  await page.goto("/restaurant/menu"); await expect(page.getByText("菜单还空着")).toBeVisible();
  await page.goto("/settings"); await page.getByText("试玩工具与素材说明", { exact: true }).click(); page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "恢复试玩数据" }).click();
  await page.goto("/restaurant/menu"); await expect(page.getByRole("heading", { name: "鼠老板的奶酪，竟然是假的" })).toBeVisible();
});

test("静态模式与动画资源失败仍能进入双店，切换不积累画布", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/");
  const canvas = page.locator("canvas[data-scene=mouse]"); await expect(canvas).toBeVisible();
  const before = await canvas.screenshot(); await page.getByRole("button", { name: "和鼠鼠打招呼" }).click(); await page.getByRole("button", { name: "关闭问候" }).click(); expect(await canvas.screenshot()).toEqual(before);
  await page.route("**/rat-idle.png", route => route.abort()); await page.reload(); await expect(page.getByRole("button", { name: "重试角色动画" })).toBeVisible();
  await page.getByRole("link", { name: "进入餐厅" }).click(); await expect(page.locator(".restaurant-stage")).toBeVisible(); await page.unroute("**/rat-idle.png");
  for (let i = 0; i < 3; i++) { await page.goto("/"); await expect(canvas).toHaveCount(1); await page.getByRole("link", { name: "进入树洞酒吧" }).click(); await expect(page.locator(".bartender canvas")).toHaveCount(1); await expect(canvas).toHaveCount(3); }
});
