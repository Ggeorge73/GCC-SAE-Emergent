const { expect } = require("@playwright/test");

const password = "synthetic passphrase";
const uniqueEmail = (label) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@firm.test`;

async function signUp(page, { firm = "Synthetic Partners LLP", name = "Ada Admin", email = uniqueEmail("admin"), plan } = {}) {
  await page.goto("/#/authentication/sign-up/basic");
  await page.getByLabel("Firm name").fill(firm);
  if (plan) await page.getByLabel("Firm size").selectOption(plan);
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "CREATE WORKSPACE" }).click();
  await expect(page.getByLabel("Signed-in account")).toContainText(name);
  return { email };
}

// Invites a colleague from `page` and signs them in from a fresh browser context.
async function inviteColleague(page, browser, { name, role }) {
  await page.goto("/#/firm/workspace");
  const previous = await page.getByTestId("invite-code").textContent({ timeout: 1000 }).catch(() => null);
  await page.getByLabel("Colleague name").fill(name);
  await page.getByLabel("Colleague email").fill(uniqueEmail(role));
  await page.getByLabel("Colleague role").selectOption(role);
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.getByTestId("invite-code")).not.toHaveText(previous || "");
  const code = await page.getByTestId("invite-code").textContent();
  const context = await browser.newContext();
  const colleague = await context.newPage();
  await colleague.goto("/#/authentication/join");
  await colleague.getByLabel("Invitation code").fill(code);
  await colleague.getByLabel("Password").fill(password);
  await colleague.getByRole("button", { name: "JOIN FIRM" }).click();
  await expect(colleague.getByLabel("Signed-in account")).toContainText(name);
  return colleague;
}

module.exports = { password, uniqueEmail, signUp, inviteColleague };
