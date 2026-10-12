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
  const fav = page.getByTestId("detail-fav");
  await expect(fav).toHaveText("Ajouter aux favoris");
  await fav.click();
  await expect(fav).toHaveText("Retirer des favoris");
  await expect(fav).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await db.from("favorites").select("listing_id").eq("user_id", user.id)).data)
    .toEqual([{ listing_id: listing.id }]);

  await open(page, "favorites");
  const card = page.locator(".listing-card", { hasText: listing.titre });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Retirer des favoris" }).click(); // the ♥ on the card's photo removes it
  await expect(page.getByText("Aucun favori pour le moment.")).toBeVisible();
  await expect.poll(async () => (await db.from("favorites").select("id").eq("user_id", user.id)).data).toEqual([]);
});

test("avis : laisser une note et un commentaire", async ({ page }) => {
  const user = await createUser();
  const listing = await seededListing("Appartement meublé centre-ville");
  await login(page, user);
  await open(page, `listing/${listing.id}`);

  const form = page.locator("form", { hasText: "Votre note" });
  await form.getByRole("button", { name: "4 étoiles" }).click();
  await expect(form.getByRole("button", { name: "4 étoiles" })).toHaveAttribute("aria-pressed", "true");
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

test("avis et message envoyés juste après l'ouverture de la page : signés avec le vrai nom", async ({ page }) => {
  const owner = await createUser();
  const user = await createUser();
  const listing = await createListing(owner);
  await login(page, user);

  // Hold back the profile, like on a slow connection: the site doesn't know the user's name yet.
  let releaseProfiles;
  const held = new Promise(resolve => { releaseProfiles = resolve; });
  await page.route(/\/rest\/v1\/profiles/, async route => {
    await held;
    await route.continue().catch(() => {}); // the page may already be closed
  });
  const sent = [];
  page.on("request", req => {
    if (req.method() === "POST" && /\/rest\/v1\/(reviews|conversations)/.test(req.url())) {
      const body = req.postDataJSON();
      sent.push(Array.isArray(body) ? body[0] : body);
    }
  });

  try {
    await open(page, `listing/${listing.id}`);
    const form = page.locator("form", { hasText: "Votre note" });
    await form.getByPlaceholder("Votre commentaire (optionnel)").fill(`Avis envoyé tout de suite (${user.nom})`);
    await form.getByRole("button", { name: "Publier mon avis" }).click();
    await expect(page.getByText("Merci pour votre avis !")).toBeVisible();
    await expect(page.getByText(user.nom, { exact: true }), "the review shows the real name").toBeVisible();
    await page.getByRole("button", { name: "Message au propriétaire" }).click();
    await expect(page).toHaveURL(/#\/chat\/\d+$/);
  } finally {
    releaseProfiles();
  }

  // The site really sent "Utilisateur" (its profile was not loaded yet)...
  expect(sent.map(b => b.reviewer_name || b.buyer_name)).toEqual(["Utilisateur", "Utilisateur"]);
  // ...and the database signed both with the real name.
  const { data: reviews } = await db.from("reviews").select("reviewer_name").eq("user_id", user.id);
  expect(reviews).toEqual([{ reviewer_name: user.nom }]);
  const { data: convs } = await db.from("conversations").select("buyer_name, owner_name, owner_id").eq("buyer_id", user.id);
  expect(convs).toEqual([{ buyer_name: user.nom, owner_name: owner.nom, owner_id: owner.id }]);
});

test("messages : un locataire écrit au propriétaire, qui répond (en direct)", async ({ page, browser }) => {
  const owner = await createUser({ nom: `Propriétaire ${Date.now().toString(36)}` });
  const buyer = await createUser({ nom: `Locataire ${Date.now().toString(36)}` });
  const listing = await createListing(owner);

  // Buyer (the test's own page) opens the listing and starts a conversation.
  await login(page, buyer);
  await open(page, `listing/${listing.id}`);
  const buyerLive = waitForLiveChat(page);
  await page.getByRole("button", { name: "Message au propriétaire" }).click();
  await expect(page).toHaveURL(/#\/chat\/\d+$/);
  await expect(page.getByText("Aucun message. Dites bonjour 👋")).toBeVisible();
  await buyerLive;
  const question = "Bonjour, la maison est-elle encore libre ?";
  await page.getByPlaceholder("Écrire un message...").fill(question);
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByText(question)).toBeVisible();
  // The chat shows who the conversation is with, and the listing.
  await expect(page.getByText(owner.nom, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: listing.titre })).toBeVisible();

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
