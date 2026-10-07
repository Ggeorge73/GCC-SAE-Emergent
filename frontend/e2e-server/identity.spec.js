const { test, expect } = require("@playwright/test");
test.use({ reducedMotion: "reduce" });

const password = "synthetic passphrase";
const uniqueEmail = (label) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@firm.test`;

async function signUp(page, { firm, name, email }) {
  await page.goto("/#/authentication/sign-up/basic");
  await page.getByLabel("Firm name").fill(firm);
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "CREATE WORKSPACE" }).click();
  await expect(page.getByLabel("Signed-in account")).toContainText(name);
}

test("signed-out visitors are sent to sign-in before any workspace page", async ({ page }) => {
  await page.goto("/#/matters");
  await expect(page).toHaveURL(/#\/authentication\/sign-in\/basic$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.goto("/#/applications/practice-desk");
  await expect(page).toHaveURL(/#\/authentication\/sign-in\/basic$/);
});

test("a firm signs up, stays signed in across reload, signs out and back in", async ({ page }) => {
  const email = uniqueEmail("admin");
  await signUp(page, { firm: "Synthetic Partners LLP", name: "Ada Admin", email });
  const account = page.getByLabel("Signed-in account");
  await expect(account).toContainText("Synthetic Partners LLP");
  await expect(account).toContainText("admin");

  await page.reload();
  await expect(account).toContainText("Ada Admin");
  await page.goto("/#/matters");
  await expect(page).toHaveURL(/#\/matters$/);

  await account.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/#\/authentication\/sign-in\/basic$/);
  await page.goto("/#/matters");
  await expect(page).toHaveURL(/#\/authentication\/sign-in\/basic$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("not the passphrase");
  await page.getByRole("button", { name: "SIGN IN" }).click();
  await expect(page.getByRole("status")).toContainText("Email or password is incorrect.");

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "SIGN IN" }).click();
  await expect(account).toContainText("Ada Admin");
});

test("an email can only register one account", async ({ page }) => {
  const email = uniqueEmail("dup");
  await signUp(page, { firm: "First Firm", name: "First Person", email });
  await page.getByLabel("Signed-in account").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/#\/authentication\/sign-in\/basic$/);
  await page.goto("/#/authentication/sign-up/basic");
  await page.getByLabel("Firm name").fill("Second Firm");
  await page.getByLabel("Full name").fill("Second Person");
  await page.getByLabel("Email").fill(email.toUpperCase());
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "CREATE WORKSPACE" }).click();
  await expect(page.getByRole("status")).toContainText("already exists");
});
