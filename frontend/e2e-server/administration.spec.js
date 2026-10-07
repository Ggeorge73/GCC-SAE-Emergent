const { test, expect } = require("@playwright/test");
const { password, uniqueEmail, signUp, inviteColleague } = require("./helpers");
test.use({ reducedMotion: "reduce" });

test("a solo firm hits its seat limit, upgrades, promotes and deactivates members", async ({ page, browser }) => {
  await signUp(page, { name: "Ada Admin", plan: "solo" });
  const associate = await inviteColleague(page, browser, { name: "Ash Associate", role: "associate" });
  const paralegal = await inviteColleague(page, browser, { name: "Pip Paralegal", role: "paralegal" });

  await page.goto("/#/firm/workspace");
  const plan = page.getByLabel("Firm plan");
  await expect(plan).toContainText("Solo plan · 3 of 3 staff seats in use");
  await page.getByLabel("Colleague name").fill("Fourth Person");
  await page.getByLabel("Colleague email").fill(uniqueEmail("fourth"));
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.getByRole("status").first()).toContainText("All 3 staff seats on the solo plan are in use");

  await page.getByLabel("Change plan").selectOption("practice");
  await expect(plan).toContainText("Practice plan · 3 of 50 staff seats in use");
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.getByTestId("invite-code")).toBeVisible();
  await expect(plan).toContainText("4 of 50");

  // Promotion takes effect for the colleague on their next page load.
  await page.getByLabel("Role for Pip Paralegal").selectOption("partner");
  await paralegal.reload();
  await expect(paralegal.getByLabel("Signed-in account")).toContainText("partner");

  // Deactivation signs the colleague out everywhere at once.
  await page.getByRole("button", { name: "Deactivate Ash Associate" }).click();
  await expect(page.getByRole("button", { name: "Reactivate Ash Associate" })).toBeVisible();
  await associate.reload();
  await expect(associate).toHaveURL(/#\/authentication\/sign-in\/basic$/);
});

test("repeated wrong passwords lock the account for a while", async ({ page }) => {
  const { email } = await signUp(page);
  await page.getByLabel("Signed-in account").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/#\/authentication\/sign-in\/basic$/);
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("not the right one");
    await page.getByRole("button", { name: "SIGN IN" }).click();
    await expect(page.getByRole("status")).toContainText("Email or password is incorrect.");
  }
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "SIGN IN" }).click();
  await expect(page.getByRole("status")).toContainText("Too many failed sign-in attempts");
});
