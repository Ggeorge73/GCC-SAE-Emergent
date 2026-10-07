const { test, expect } = require("@playwright/test");
const { signUp, inviteColleague } = require("./helpers");
test.use({ reducedMotion: "reduce" });

test("two lawyers on separate browsers share a matter and its tasks; a walled colleague sees nothing", async ({ page, browser }) => {
  await signUp(page, { name: "Pat Partner" });
  const associate = await inviteColleague(page, browser, { name: "Ash Associate", role: "associate" });
  const paralegal = await inviteColleague(page, browser, { name: "Pip Paralegal", role: "paralegal" });

  // Lawyer A opens a matter and staffs it.
  await page.goto("/#/firm/workspace");
  await page.getByLabel("Matter name").fill("Synthetic lease dispute");
  await page.getByLabel("Client", { exact: true }).fill("Synthetic Client Ltd");
  await page.getByRole("button", { name: "Open matter" }).click();
  const matters = page.getByRole("list", { name: "Firm matters" });
  await expect(matters).toContainText("Synthetic lease dispute");
  for (const name of ["Ash Associate", "Pip Paralegal"]) {
    await page.getByLabel("Add member").selectOption({ label: `${name} (${name.startsWith("Ash") ? "associate" : "paralegal"})` });
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("list", { name: "Matter members" })).toContainText(name);
  }
  await page.getByLabel("Task title").fill("Draft notice to landlord");
  await page.getByLabel("Assign to").selectOption({ label: "Ash Associate" });
  await page.getByLabel("Due date").fill("2026-11-01");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("list", { name: "Matter tasks" })).toContainText("Ash Associate · due 2026-11-01");

  // Lawyer B, on another browser, sees the same matter and completes the task.
  await associate.reload();
  await expect(associate.getByRole("list", { name: "Firm matters" })).toContainText("Synthetic lease dispute");
  await expect(associate.getByRole("list", { name: "Matter tasks" })).toContainText("Draft notice to landlord");
  await associate.getByLabel("Task status · Draft notice to landlord").selectOption("done");
  await expect(associate.getByRole("list", { name: "Matter tasks" }).locator(".v-badge", { hasText: "done" })).toBeVisible();

  // Lawyer A sees B's update after reloading.
  await page.reload();
  await expect(page.getByRole("list", { name: "Matter tasks" }).locator(".v-badge", { hasText: "done" })).toBeVisible();

  // The paralegal could see it, until the partner records an ethical wall.
  await paralegal.reload();
  await expect(paralegal.getByRole("list", { name: "Firm matters" })).toContainText("Synthetic lease dispute");
  await page.getByLabel("Wall off colleague").selectOption({ label: "Pip Paralegal (paralegal)" });
  await page.getByLabel("Reason for wall").fill("Prior work for the landlord");
  await page.getByRole("button", { name: "Record wall" }).click();
  await expect(page.getByRole("list", { name: "Walled colleagues" })).toContainText("Pip Paralegal");
  await expect(page.getByRole("list", { name: "Matter members" })).not.toContainText("Pip Paralegal");

  await paralegal.reload();
  await expect(paralegal.getByRole("list", { name: "Firm matters" })).toContainText("No shared matters yet.");
  await expect(paralegal.getByText("Synthetic lease dispute")).toHaveCount(0);
  // Walled users cannot see the wall controls either.
  await expect(associate.getByLabel("Wall off colleague")).toHaveCount(0);
});

test("invitation codes cannot be reused", async ({ page, browser }) => {
  await signUp(page);
  await page.goto("/#/firm/workspace");
  await page.getByLabel("Colleague name").fill("Once Only");
  await page.getByLabel("Colleague email").fill(`once-${Date.now()}@firm.test`);
  await page.getByRole("button", { name: "Create invitation" }).click();
  const code = await page.getByTestId("invite-code").textContent();
  for (const expected of [/Once Only/, /not valid/]) {
    const context = await browser.newContext();
    const joiner = await context.newPage();
    await joiner.goto("/#/authentication/join");
    await joiner.getByLabel("Invitation code").fill(code);
    await joiner.getByLabel("Password").fill("synthetic passphrase");
    await joiner.getByRole("button", { name: "JOIN FIRM" }).click();
    if (String(expected).includes("Once")) await expect(joiner.getByLabel("Signed-in account")).toContainText("Once Only");
    else await expect(joiner.getByRole("status")).toContainText("not valid");
    await context.close();
  }
});
