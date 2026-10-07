const { test, expect } = require("@playwright/test");
const { password, signUp, inviteColleague } = require("./helpers");
test.use({ reducedMotion: "reduce" });

async function openMatter(page, name, client) {
  await page.goto("/#/firm/workspace");
  await page.getByLabel("Matter name").fill(name);
  await page.getByLabel("Client", { exact: true }).fill(client);
  await page.getByRole("button", { name: "Open matter" }).click();
  await expect(page.getByRole("button", { name: new RegExp(name) })).toHaveAttribute("aria-pressed", "true");
}

test("a client joins their matter's portal, receives an approved update, uploads a requested document and messages the team", async ({ page, browser }) => {
  await signUp(page, { name: "Pat Partner" });
  const associate = await inviteColleague(page, browser, { name: "Ash Associate", role: "associate" });
  await openMatter(page, "Synthetic tenancy claim", "Synthetic Tenant Ltd");
  await page.getByLabel("Add member").selectOption({ label: "Ash Associate (associate)" });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("list", { name: "Matter members" })).toContainText("Ash Associate");
  await page.getByLabel("Comment").fill("INTERNAL: settlement floor is confidential.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByRole("list", { name: "Matter discussion" })).toContainText("INTERNAL");

  // A second matter the client must never see.
  await openMatter(page, "Unrelated synthetic matter", "Someone Else");
  await page.getByRole("button", { name: /Synthetic tenancy claim/ }).click();

  // Invite the client and let them join from their own browser.
  await page.getByLabel("Client contact name").fill("Cara Client");
  await page.getByLabel("Client contact email").fill(`cara-${Date.now()}@client.test`);
  await page.getByRole("button", { name: "Invite client" }).click();
  const code = await page.getByTestId("client-invite-code").textContent();
  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  await client.goto("/#/authentication/join");
  await client.getByLabel("Invitation code").fill(code);
  await client.getByLabel("Password").fill(password);
  await client.getByRole("button", { name: "JOIN FIRM" }).click();
  await expect(client.getByRole("heading", { name: "Client portal" })).toBeVisible();
  await expect(client.getByText("Synthetic tenancy claim")).toBeVisible();
  // No firm navigation, no other matter, no internal discussion.
  await expect(client.getByRole("navigation", { name: "Law Suite sections" })).toHaveCount(0);
  await expect(client.getByText("Unrelated synthetic matter")).toHaveCount(0);
  await expect(client.getByText("INTERNAL")).toHaveCount(0);
  // Typing a firm address still shows only the portal.
  await client.goto("/#/firm/workspace");
  await expect(client.getByRole("heading", { name: "Client portal" })).toBeVisible();
  await expect(client.getByText("INTERNAL")).toHaveCount(0);

  // The associate drafts an update; it reaches the client only after partner approval and sharing.
  await associate.reload();
  await associate.getByLabel("Update title").fill("Notice served");
  await associate.getByLabel("Update for the client").fill("We served the notice on the landlord today.");
  await associate.getByRole("button", { name: "Save draft update" }).click();
  await expect(associate.getByRole("list", { name: "Client updates" })).toContainText("draft");
  await expect(associate.getByRole("button", { name: "Approve Notice served" })).toHaveCount(0);
  await associate.getByLabel("Document to request").fill("Signed tenancy agreement");
  await associate.getByRole("button", { name: "Request", exact: true }).click();
  await expect(associate.getByRole("list", { name: "Requested documents" })).toContainText("Signed tenancy agreement");

  await client.reload();
  await expect(client.getByRole("list", { name: "Shared updates" })).toContainText("No updates shared yet.");

  await page.reload();
  await page.getByRole("button", { name: /Synthetic tenancy claim/ }).click();
  await page.getByRole("button", { name: "Approve Notice served" }).click();
  await page.getByRole("button", { name: "Share Notice served" }).click();
  await expect(page.getByRole("list", { name: "Client updates" })).toContainText("shared");

  await client.reload();
  await expect(client.getByRole("list", { name: "Shared updates" })).toContainText("We served the notice on the landlord today.");

  // The client uploads the requested document and writes to the team.
  await client.getByLabel("Upload for Signed tenancy agreement").setInputFiles({ name: "tenancy.pdf", mimeType: "application/pdf", buffer: Buffer.from("synthetic signed tenancy") });
  await expect(client.getByRole("list", { name: "Document requests" })).toContainText("Uploaded tenancy.pdf");
  await expect(client.getByRole("list", { name: "Document requests" })).toContainText("fulfilled");
  await client.getByLabel("Message to your legal team").fill("Uploaded. Is anything else needed?");
  await client.getByRole("button", { name: "Send message" }).click();
  await expect(client.getByRole("list", { name: "Client messages" })).toContainText("Cara Client");

  // The associate is notified, downloads the exact file and replies.
  await associate.reload();
  await associate.getByRole("button", { name: /View notifications, [1-9]/ }).click();
  await expect(associate.getByRole("region", { name: "Your notifications" })).toContainText("Cara Client (client) uploaded tenancy.pdf");
  await associate.keyboard.press("Escape");
  await associate.goto("/#/firm/workspace");
  await expect(associate.getByRole("list", { name: "Client message thread" })).toContainText("Is anything else needed?");
  const downloading = associate.waitForEvent("download");
  await associate.getByRole("button", { name: "Download tenancy.pdf" }).click();
  const file = await downloading;
  expect(require("fs").readFileSync(await file.path(), "utf8")).toBe("synthetic signed tenancy");
  await associate.getByLabel("Message to the client").fill("Thanks, nothing else for now.");
  await associate.getByRole("button", { name: "Send to client" }).click();

  await client.reload();
  await expect(client.getByRole("list", { name: "Client messages" })).toContainText("Thanks, nothing else for now.");
  await expect(client.getByText("INTERNAL")).toHaveCount(0);
  await clientContext.close();
});
