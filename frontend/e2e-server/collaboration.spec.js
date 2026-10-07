const { test, expect } = require("@playwright/test");
const { signUp, inviteColleague } = require("./helpers");
test.use({ reducedMotion: "reduce" });

// The requirements review found that a comment by lawyer A never reached lawyer B
// on another device. This journey re-runs that experiment against the live API.
test("a comment and @mention reach a colleague on another browser; a walled colleague sees neither", async ({ page, browser }) => {
  await signUp(page, { name: "Pat Partner" });
  const associate = await inviteColleague(page, browser, { name: "Ash Associate", role: "associate" });
  const paralegal = await inviteColleague(page, browser, { name: "Pip Paralegal", role: "paralegal" });

  await page.goto("/#/firm/workspace");
  await page.getByLabel("Matter name").fill("Synthetic supply dispute");
  await page.getByLabel("Client", { exact: true }).fill("Synthetic Buyer Inc");
  await page.getByRole("button", { name: "Open matter" }).click();
  for (const label of ["Ash Associate (associate)", "Pip Paralegal (paralegal)"]) {
    await page.getByLabel("Add member").selectOption({ label });
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("list", { name: "Matter members" })).toContainText(label.split(" (")[0]);
  }

  // The paralegal is walled off before the discussion starts.
  await page.getByLabel("Wall off colleague").selectOption({ label: "Pip Paralegal (paralegal)" });
  await page.getByLabel("Reason for wall").fill("Prior work for the seller");
  await page.getByRole("button", { name: "Record wall" }).click();
  await expect(page.getByRole("list", { name: "Walled colleagues" })).toContainText("Pip Paralegal");

  await page.getByLabel("Comment").fill("Please check the delivery terms.");
  await page.getByLabel("Mention colleague").selectOption({ label: "Ash Associate" });
  await expect(page.getByLabel("Comment")).toHaveValue("Please check the delivery terms. @Ash Associate ");
  await page.getByRole("button", { name: "Post comment" }).click();
  const thread = page.getByRole("list", { name: "Matter discussion" });
  await expect(thread).toContainText("Pat Partner (admin)");
  await expect(thread).toContainText("Please check the delivery terms. @Ash Associate");
  await expect(page.getByRole("list", { name: "Matter activity" })).toContainText("Pat Partner commented:");

  // Lawyer B, on a separate browser, sees the signed comment and a notification.
  await associate.reload();
  const bell = associate.getByRole("button", { name: "View notifications, 1 unread" });
  await expect(bell).toBeVisible();
  await bell.click();
  const inbox = associate.getByRole("region", { name: "Your notifications" });
  await expect(inbox).toContainText("Pat Partner mentioned you on Synthetic supply dispute");
  await inbox.getByRole("button", { name: /Pat Partner mentioned you/ }).click();
  await expect(associate).toHaveURL(/#\/firm\/workspace\?matter=/);
  await expect(associate.getByRole("list", { name: "Matter discussion" })).toContainText("Pat Partner (admin)");
  await expect(associate.getByRole("button", { name: "View notifications, 0 unread" })).toBeVisible();

  // B replies; A sees the reply attributed to B, not to a fixed demo name.
  await associate.getByLabel("Comment").fill("Delivery terms checked; clause 7 governs.");
  await associate.getByRole("button", { name: "Post comment" }).click();
  await page.reload();
  await expect(page.getByRole("list", { name: "Matter discussion" })).toContainText("Ash Associate (associate)");
  await expect(page.getByText("Maya Chen")).toHaveCount(0);

  // The walled paralegal sees neither the matter, the comments nor a notification.
  await paralegal.reload();
  await expect(paralegal.getByRole("list", { name: "Firm matters" })).toContainText("No shared matters yet.");
  await expect(paralegal.getByText("delivery terms")).toHaveCount(0);
  await expect(paralegal.getByRole("button", { name: "View notifications, 0 unread" })).toBeVisible();
});

test("assigning a task notifies the assignee", async ({ page, browser }) => {
  await signUp(page, { name: "Pat Partner" });
  const associate = await inviteColleague(page, browser, { name: "Ash Associate", role: "associate" });
  await page.goto("/#/firm/workspace");
  await page.getByLabel("Matter name").fill("Synthetic licence review");
  await page.getByLabel("Client", { exact: true }).fill("Synthetic Licensee");
  await page.getByRole("button", { name: "Open matter" }).click();
  await page.getByLabel("Add member").selectOption({ label: "Ash Associate (associate)" });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Task title").fill("Summarise termination rights");
  await page.getByLabel("Assign to").selectOption({ label: "Ash Associate" });
  await page.getByRole("button", { name: "Add task" }).click();
  await associate.reload();
  await associate.getByRole("button", { name: "View notifications, 1 unread" }).click();
  await expect(associate.getByRole("region", { name: "Your notifications" })).toContainText("Pat Partner assigned you “Summarise termination rights”");
});
