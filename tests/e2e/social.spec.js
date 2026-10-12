// Favourites, reviews and messages between two users.
import { test, expect, open, login, createUser, createListing, onlyLocalRequests, waitForLiveChat, db } from "./helpers.js";

async function seededListing(titre) {
  const { data, error } = await db.from("listings").select("*").eq("titre", titre).single();
  if (error) throw error;
  return data;
}

test("favoris : ajouter, voir dans Mes favoris, retirer", async ({ page }) => {
  const user = await createUser();
  const listing = await seededListing("Villa avec jardin");
  await login(page, user);

  await open(page, `listing/${listing.id}`);
  await page.getByRole("button", { name: "♡ Ajouter aux favoris" }).click();
  await expect(page.getByRole("button", { name: "♥ Retirer des favoris" })).toBeVisible();
  await expect.poll(async () => (await db.from("favorites").select("listing_id").eq("user_id", user.id)).data)
    .toEqual([{ listing_id: listing.id }]);

  await open(page, "favorites");
  const card = page.locator(".listing-card", { hasText: listing.titre });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Ajouter aux favoris" }).click(); // the ♥ on the card removes it
  await expect(page.getByText("Aucun favori pour le moment.")).toBeVisible();
  await expect.poll(async () => (await db.from("favorites").select("id").eq("user_id", user.id)).data).toEqual([]);
});

test("avis : laisser une note et un commentaire", async ({ page }) => {
  const user = await createUser();
  const listing = await seededListing("Appartement meublé centre-ville");
  await login(page, user);
  await open(page, `listing/${listing.id}`);
  await page.waitForLoadState("networkidle"); // profile loaded (the review is signed with its name)

  const form = page.locator("form", { hasText: "Votre note" });
  await form.getByText("★", { exact: true }).nth(3).click(); // 4 stars
  const comment = `Très bon accueil, quartier calme. (${user.nom})`;
  await form.getByPlaceholder("Votre commentaire (optionnel)").fill(comment);
  await form.getByRole("button", { name: "Publier mon avis" }).click();
  await expect(page.getByText("Merci pour votre avis !")).toBeVisible();
  await expect(page.getByText(comment)).toBeVisible();
  await expect(page.getByText(user.nom, { exact: true })).toBeVisible();

  const { data } = await db.from("reviews").select("*").eq("user_id", user.id);
  expect(data).toHaveLength(1);
  expect(data[0]).toMatchObject({ listing_id: listing.id, rating: 4, comment, reviewer_name: user.nom });
});

test("messages : un locataire écrit au propriétaire, qui répond (en direct)", async ({ page, browser }) => {
  const owner = await createUser({ nom: `Propriétaire ${Date.now().toString(36)}` });
  const buyer = await createUser({ nom: `Locataire ${Date.now().toString(36)}` });
  const listing = await createListing(owner);

  // Buyer (the test's own page) opens the listing and starts a conversation.
  await login(page, buyer);
  await open(page, `listing/${listing.id}`);
  await page.waitForLoadState("networkidle"); // profile loaded (the conversation is signed with its name)
  const buyerLive = waitForLiveChat(page);
  await page.getByRole("button", { name: "💬 Message au propriétaire" }).click();
  await expect(page).toHaveURL(/#\/chat\/\d+$/);
  await expect(page.getByText("Aucun message. Dites bonjour 👋")).toBeVisible();
  await buyerLive;
  const question = "Bonjour, la maison est-elle encore libre ?";
  await page.getByPlaceholder("Écrire un message...").fill(question);
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByText(question)).toBeVisible();

  // Owner, in a second browser, sees the conversation and answers.
  const ownerContext = await browser.newContext();
  await onlyLocalRequests(ownerContext);
  const ownerPage = await ownerContext.newPage();
  try {
    await login(ownerPage, owner);
    await open(ownerPage, "messages");
    const row = ownerPage.getByText(buyer.nom, { exact: true });
    await expect(row).toBeVisible();
    await expect(ownerPage.getByText(`À propos de : ${listing.titre}`)).toBeVisible();
    const ownerLive = waitForLiveChat(ownerPage);
    await row.click();
    await expect(ownerPage.getByText(question)).toBeVisible();
    await ownerLive;
    const answer = "Oui, vous pouvez visiter demain à 10h.";
    await ownerPage.getByPlaceholder("Écrire un message...").fill(answer);
    await ownerPage.getByRole("button", { name: "Envoyer" }).click();
    await expect(ownerPage.getByText(answer)).toBeVisible();

    // The buyer sees the answer arrive without reloading the page.
    await expect(page.getByText(answer)).toBeVisible();
  } finally {
    await ownerContext.close();
  }

  const { data: convs } = await db.from("conversations").select("*").eq("listing_id", listing.id);
  expect(convs).toHaveLength(1);
  expect(convs[0]).toMatchObject({ buyer_id: buyer.id, owner_id: owner.id, buyer_name: buyer.nom, owner_name: owner.nom, listing_title: listing.titre });
  const { data: msgs } = await db.from("messages").select("sender_id, content").eq("conversation_id", convs[0].id).order("id");
  expect(msgs).toEqual([
    { sender_id: buyer.id, content: question },
    { sender_id: owner.id, content: "Oui, vous pouvez visiter demain à 10h." },
  ]);
});
