const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

// Read route paths from the source so new pages are covered automatically.
const routeSource = fs.readFileSync(
  path.join(__dirname, "../src/components/vision/routes.js"),
  "utf8",
);
const visionRoutes = [...routeSource.matchAll(/\["(\/[^"]+)"/g)].map(
  ([, p]) => ({ path: p }),
);

test.use({ reducedMotion: "reduce" });

// Every navigable page should render its heading without uncaught errors or the recovery screen.
for (const route of visionRoutes) {
  test(`route renders cleanly: ${route.path}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/#${route.path}`);
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByText("This view could not open")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
