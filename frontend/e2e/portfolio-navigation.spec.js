const { test, expect } = require("@playwright/test");
const { goSection } = require("./navigation-helpers");

test("500 matters stay summarized and the directory paginates, searches and filters", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "View Active matters" }),
  ).toContainText("3");
  // The first save is asynchronous (it waits for the cross-tab revision check).
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("law-suite-workspace-v2")))
    .not.toBeNull();
  await page.evaluate(() => {
    const key = "law-suite-workspace-v2";
    const state = JSON.parse(localStorage.getItem(key));
    const originals = structuredClone(state.matters);
    for (let i = 4; i <= 500; i++) {
      const matter = structuredClone(originals[(i - 1) % 3]);
      matter.id = `LS-${String(i + 2400)}`;
      matter.name = `Portfolio test ${String(i).padStart(3, "0")}`;
      state.matters.push(matter);
    }
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "View Active matters" }),
  ).toContainText("500");
  await expect(page.locator(".v-practice-table>div>button")).toHaveCount(3);
  await expect(page.locator(".desk-workbench, .directory-table")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "View Active matters" }).click();
  await expect(page.locator(".directory-table tbody tr")).toHaveCount(12);
  await expect(page.getByText("Page 1 of 42")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("13–24 of 500");
  await page.getByLabel("Search matters").fill("LS-2900");
  await expect(page.locator(".directory-table tbody tr")).toHaveCount(1);
  await expect(page.getByText("Page 1 of 1")).toBeVisible();
  await page.getByRole("button", { name: /^Open LS-2900 / }).click();
  await expect(page.locator(".desk-matter-heading")).toContainText(
    "Portfolio test 500",
  );
  await page
    .getByLabel("Review note")
    .fill("Retained note on the last matter in a 500-record portfolio.");
  await page.reload();
  await expect(page.getByLabel("Review note")).toHaveValue(
    "Retained note on the last matter in a 500-record portfolio.",
  );
  await goSection(page, "Dashboard");
  await page.getByRole("button", { name: /^Browse Litigation:/ }).click();
  await expect(page.getByLabel("Filter matters by practice")).toHaveValue(
    "Litigation",
  );
  await expect(page.getByRole("status")).toContainText(
    "of 167 matching matters",
  );
  await expect(page.locator(".directory-table tbody tr")).toHaveCount(12);
});

test("matter sections support refresh and browser history without losing draft notes", async ({
  page,
}) => {
  await page.goto("/#/matters/LS-2402/issues");
  await page
    .getByLabel("Review note")
    .fill("A matter-specific note survives route changes.");
  await page.getByRole("tab", { name: "Draft & sources" }).click();
  await expect(page).toHaveURL(/#\/matters\/LS-2402\/drafts$/);
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Draft & sources" }),
  ).toHaveAttribute("aria-selected", "true");
  await page.goBack();
  await expect(page.getByLabel("Review note")).toHaveValue(
    "A matter-specific note survives route changes.",
  );
  await page.goForward();
  await expect(
    page.getByRole("tab", { name: "Draft & sources" }),
  ).toHaveAttribute("aria-selected", "true");
  await page.goto("/#/matters/nonexistent/issues");
  await expect(
    page.getByRole("heading", { name: "Matter not found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to matters" }).click();
  await expect(page.getByRole("table")).toBeVisible();
});

test("summary and directory use the viewport with a mobile navigation drawer", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [390, 768, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    await goSection(page, "Dashboard");
    await expect(page.locator(".desk-workbench")).toHaveCount(0);
    await goSection(page, "Matter Review");
    await expect(page.getByRole("table")).toBeVisible();
    expect(
      await page
        .locator(".matter-desk")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width < 1100)
      await expect(
        page.getByRole("button", { name: "Open navigation", exact: true }),
      ).toBeVisible();
    else {
      const box = await page.locator(".matter-directory").boundingBox();
      expect(box.width).toBeGreaterThan(1200);
    }
  }
});
