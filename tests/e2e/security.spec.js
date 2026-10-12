// Database security rules, checked directly with supabase-js (like a curious user with the public key would).
// Runs once, in the "api" project (no browser).
import { test, expect } from "@playwright/test";
import { anonClient, clientAs, createUser, createListing, getListing, getProfile, uploadPhotos, db, SEED } from "./helpers.js";

test.describe("un utilisateur normal ne peut pas se donner des droits", () => {
  test("ne peut pas se mettre admin", async () => {
    const user = await createUser();
    const client = await clientAs(user);
    const { error } = await client.from("profiles").update({ role: "admin" }).eq("id", user.id);
    expect(error?.code).toBe("42501");
    expect((await getProfile(user.id)).role).toBe("user");
  });

  test("ne peut pas se mettre vérifié", async () => {
    const user = await createUser();
    const client = await clientAs(user);
    const { error } = await client.from("profiles").update({ verified: true }).eq("id", user.id);
    expect(error?.code).toBe("42501");
    expect((await getProfile(user.id)).verified).toBe(false);
  });

  test("ne peut pas créer son profil déjà admin ou vérifié", async () => {
    const user = await createUser({ withProfile: false });
    const client = await clientAs(user);
    const asAdmin = await client.from("profiles").insert({ id: user.id, nom: user.nom, role: "admin" });
    expect(asAdmin.error?.code).toBe("42501");
    const asVerified = await client.from("profiles").upsert({ id: user.id, nom: user.nom, verified: true }, { onConflict: "id" });
    expect(asVerified.error?.code).toBe("42501");
    expect(await getProfile(user.id)).toBeNull();
    // A normal profile is fine (this is what the site does).
    const normal = await client.from("profiles").upsert({ id: user.id, nom: user.nom, whatsapp: user.whatsapp }, { onConflict: "id" });
    expect(normal.error).toBeNull();
    expect(await getProfile(user.id)).toMatchObject({ role: "user", verified: false });
  });

  test("peut changer son nom et son WhatsApp", async () => {
    const user = await createUser();
    const client = await clientAs(user);
    const { error } = await client.from("profiles").update({ nom: "Nouveau Nom", whatsapp: "+243 811 111 111" }).eq("id", user.id);
    expect(error).toBeNull();
    expect(await getProfile(user.id)).toMatchObject({ nom: "Nouveau Nom", whatsapp: "+243 811 111 111", role: "user" });
  });

  test("l'admin, lui, peut donner le badge vérifié", async () => {
    const user = await createUser();
    const admin = await clientAs(SEED.admin);
    const { error } = await admin.from("profiles").update({ verified: true }).eq("id", user.id);
    expect(error).toBeNull();
    expect((await getProfile(user.id)).verified).toBe(true);
  });
});

test.describe("on ne touche pas aux affaires des autres", () => {
  test("ni au profil d'un autre", async () => {
    const [user, other] = await Promise.all([createUser(), createUser()]);
    const client = await clientAs(user);
    await client.from("profiles").update({ nom: "Piraté" }).eq("id", other.id);
    expect((await getProfile(other.id)).nom).toBe(other.nom);
  });

  test("ni à l'annonce d'un autre (modifier, supprimer, changer le propriétaire)", async () => {
    const [user, owner] = await Promise.all([createUser(), createUser()]);
    const listing = await createListing(owner);
    const client = await clientAs(user);
    await client.from("listings").update({ titre: "Piraté", prix: 1 }).eq("id", listing.id);
    await client.from("listings").delete().eq("id", listing.id);
    expect(await getListing(listing.id)).toMatchObject({ titre: listing.titre, owner_id: owner.id });
    // Publishing in someone else's name is refused.
    const fake = await client.from("listings").insert({ titre: "Faux", prix: 1, localisation: "x", ville: "Fungurume", description: "x", owner_id: owner.id });
    expect(fake.error).not.toBeNull();
    // The owner can't hand the listing to someone else either.
    const ownerClient = await clientAs(owner);
    const moved = await ownerClient.from("listings").update({ owner_id: user.id }).eq("id", listing.id);
    expect(moved.error).not.toBeNull();
    expect((await getListing(listing.id)).owner_id).toBe(owner.id);
  });

  test("ni aux photos d'un autre (envoyer dans son dossier, supprimer ses fichiers)", async () => {
    const [user, owner] = await Promise.all([createUser(), createUser()]);
    const [url] = await uploadPhotos(owner, ["photo-2.jpg"]);
    const client = await clientAs(user);
    const intoOther = await client.storage.from("listing-photos").upload(`${owner.id}/intrus.jpg`, Buffer.from("x"), { contentType: "image/jpeg" });
    expect(intoOther.error).not.toBeNull();
    const path = url.split("/listing-photos/")[1];
    await client.storage.from("listing-photos").remove([path]);
    const { data } = await db.storage.from("listing-photos").list(owner.id);
    expect(data.map(f => f.name)).toEqual([path.split("/")[1]]);
  });

  test("le Storage refuse les fichiers qui ne sont pas des photos", async () => {
    const user = await createUser();
    const client = await clientAs(user);
    const pdf = await client.storage.from("listing-photos").upload(`${user.id}/contrat.pdf`, Buffer.from("%PDF-1.4"), { contentType: "application/pdf" });
    expect(pdf.error).not.toBeNull();
    const big = await client.storage.from("listing-photos").upload(`${user.id}/grosse.jpg`, Buffer.alloc(1024 * 1024 + 1, 1), { contentType: "image/jpeg" });
    expect(big.error, "files over 1 MB are refused").not.toBeNull();
  });

  test("ni aux favoris et messages des autres", async () => {
    const [owner, buyer, stranger] = await Promise.all([createUser(), createUser(), createUser()]);
    const listing = await createListing(owner);
    const b = await clientAs(buyer);
    await b.from("favorites").insert({ user_id: buyer.id, listing_id: listing.id });
    const { data: conv } = await b.from("conversations").insert({
      listing_id: listing.id, listing_title: listing.titre, buyer_id: buyer.id, buyer_name: buyer.nom, owner_id: owner.id, owner_name: owner.nom,
    }).select().single();
    await b.from("messages").insert({ conversation_id: conv.id, sender_id: buyer.id, content: "Bonjour" });

    const s = await clientAs(stranger);
    expect((await s.from("favorites").select("*").eq("user_id", buyer.id)).data).toEqual([]);
    expect((await s.from("conversations").select("*").eq("id", conv.id)).data).toEqual([]);
    expect((await s.from("messages").select("*").eq("conversation_id", conv.id)).data).toEqual([]);
    const intrude = await s.from("messages").insert({ conversation_id: conv.id, sender_id: stranger.id, content: "Intrus" });
    expect(intrude.error).not.toBeNull();
    // The owner, on the other hand, sees the message.
    const o = await clientAs(owner);
    expect((await o.from("messages").select("content").eq("conversation_id", conv.id)).data).toEqual([{ content: "Bonjour" }]);
  });
});

test.describe("visiteur sans compte (clé publique)", () => {
  test("peut lire les annonces, les profils publics et les avis, et compter une vue", async () => {
    const anon = anonClient();
    const listings = await anon.from("listings").select("id, titre, views");
    expect(listings.error).toBeNull();
    expect(listings.data.length).toBeGreaterThanOrEqual(4);
    expect((await anon.from("profiles").select("nom")).error).toBeNull();
    expect((await anon.from("reviews").select("rating")).error).toBeNull();
    const target = listings.data.find(l => l.titre === "Studio près du marché");
    const rpc = await anon.rpc("increment_views", { p_id: target.id });
    expect(rpc.error).toBeNull();
    expect((await getListing(target.id)).views).toBeGreaterThan(target.views);
  });

  test("ne peut rien écrire", async () => {
    const anon = anonClient();
    const ins = await anon.from("listings").insert({ titre: "Spam", prix: 1, localisation: "x", ville: "Fungurume", description: "x" });
    expect(ins.error).not.toBeNull();
    await anon.from("listings").update({ titre: "Spam" }).eq("titre", "Villa avec jardin");
    const { data } = await db.from("listings").select("id").eq("titre", "Villa avec jardin");
    expect(data).toHaveLength(1);
    const rev = await anon.from("reviews").insert({ listing_id: data[0].id, user_id: SEED.alice.id, reviewer_name: "x", rating: 5 });
    expect(rev.error).not.toBeNull();
    expect((await anon.from("listing_photos_backup").select("*")).error, "the photo backup is private").not.toBeNull();
  });

  test("le taux de change : tout le monde le lit, personne ne peut le changer", async () => {
    const before = await db.from("exchange_rates").select("quote, rate").order("quote");
    expect(before.data.length).toBeGreaterThanOrEqual(1);
    const anon = anonClient();
    expect((await anon.from("exchange_rates").select("quote, rate")).data).toEqual(expect.arrayContaining(before.data));
    const user = await createUser();
    const admin = await clientAs(SEED.admin);
    for (const client of [anon, await clientAs(user), admin]) {
      await client.from("exchange_rates").update({ rate: 1 }).eq("quote", "CDF");
      expect((await client.from("exchange_rates").insert({ base: "USD", quote: "GBP", rate: 1 })).error).not.toBeNull();
      await client.from("exchange_rates").delete().eq("quote", "CDF");
    }
    const after = await db.from("exchange_rates").select("quote, rate").order("quote");
    expect(after.data, "only the server (Edge Function) writes the rate").toEqual(before.data);
  });
});

// Trust fixes: what other people see (names, view counts, who a conversation is with) is set by
// the database. The website's requests are never refused for this: wrong values are quietly corrected.
test.describe("les noms, les vues et les conversations viennent de la base", () => {
  test("le nom sur une annonce est celui du profil du propriétaire, même si le navigateur envoie autre chose", async () => {
    const owner = await createUser();
    const client = await clientAs(owner);
    const { data: listing, error } = await client.from("listings").insert({
      titre: "Annonce au faux nom", prix: 300, localisation: "x", ville: "Fungurume", description: "x",
      owner_id: owner.id, owner_name: "Admin ImmoCongo ✔️",
    }).select().single();
    expect(error).toBeNull();
    expect(listing.owner_name).toBe(owner.nom);

    const renamed = await client.from("listings").update({ owner_name: "Quelqu'un d'autre" }).eq("id", listing.id);
    expect(renamed.error).toBeNull();
    expect((await getListing(listing.id)).owner_name).toBe(owner.nom);

    // An admin editing someone else's listing (even sending a name) keeps the owner's name.
    const admin = await clientAs(SEED.admin);
    const edit = await admin.from("listings").update({ titre: "Corrigé par l'admin", owner_name: SEED.admin.nom }).eq("id", listing.id);
    expect(edit.error).toBeNull();
    expect(await getListing(listing.id)).toMatchObject({ titre: "Corrigé par l'admin", owner_id: owner.id, owner_name: owner.nom });
  });

  test("le nom sur un avis est celui du profil de son auteur", async () => {
    const [reviewer, noProfile] = await Promise.all([createUser(), createUser({ withProfile: false })]);
    const { data: listing } = await db.from("listings").select("id").eq("titre", "Villa avec jardin").single();

    const r = await clientAs(reviewer);
    const { data: review, error } = await r.from("reviews").insert({
      listing_id: listing.id, user_id: reviewer.id, reviewer_name: SEED.admin.nom, rating: 5,
    }).select().single();
    expect(error).toBeNull();
    expect(review.reviewer_name).toBe(reviewer.nom);

    // An old account without a profile is shown as "Utilisateur", whatever it sends...
    const n = await clientAs(noProfile);
    const { data: anonymous, error: error2 } = await n.from("reviews").insert({
      listing_id: listing.id, user_id: noProfile.id, reviewer_name: "Le vrai propriétaire", rating: 1,
    }).select().single();
    expect(error2).toBeNull();
    expect(anonymous.reviewer_name).toBe("Utilisateur");
    // ...and gets its real name as soon as it has a profile.
    const created = await n.from("profiles").upsert({ id: noProfile.id, nom: noProfile.nom }, { onConflict: "id" });
    expect(created.error).toBeNull();
    const { data: after } = await db.from("reviews").select("reviewer_name").eq("id", anonymous.id).single();
    expect(after.reviewer_name).toBe(noProfile.nom);
  });

  test("quand quelqu'un change de nom, ses annonces, avis et conversations suivent", async () => {
    const [owner, buyer] = await Promise.all([createUser(), createUser()]);
    const listing = await createListing(owner);
    const b = await clientAs(buyer);
    const { data: review } = await b.from("reviews").insert({ listing_id: listing.id, user_id: buyer.id, reviewer_name: buyer.nom, rating: 4 }).select().single();
    const { data: conv } = await b.from("conversations").insert({
      listing_id: listing.id, listing_title: listing.titre, buyer_id: buyer.id, buyer_name: buyer.nom, owner_id: owner.id, owner_name: owner.nom,
    }).select().single();

    const o = await clientAs(owner);
    expect((await o.from("profiles").update({ nom: `${owner.nom} (nouveau nom)` }).eq("id", owner.id)).error).toBeNull();
    expect((await b.from("profiles").update({ nom: `${buyer.nom} (nouveau nom)` }).eq("id", buyer.id)).error).toBeNull();

    expect((await getListing(listing.id)).owner_name).toBe(`${owner.nom} (nouveau nom)`);
    const { data: r } = await db.from("reviews").select("reviewer_name").eq("id", review.id).single();
    expect(r.reviewer_name).toBe(`${buyer.nom} (nouveau nom)`);
    const { data: c } = await db.from("conversations").select("buyer_name, owner_name").eq("id", conv.id).single();
    expect(c).toEqual({ buyer_name: `${buyer.nom} (nouveau nom)`, owner_name: `${owner.nom} (nouveau nom)` });
    // The view count is not touched by a name change.
    expect((await getListing(listing.id)).views).toBe(0);
  });

  test("seul le compteur de vues (increment_views) change le nombre de vues", async () => {
    const owner = await createUser();
    const o = await clientAs(owner);
    const { data: listing, error } = await o.from("listings").insert({
      titre: "Annonce aux fausses vues", prix: 300, localisation: "x", ville: "Fungurume", description: "x",
      owner_id: owner.id, views: 5000,
    }).select().single();
    expect(error).toBeNull();
    expect(listing.views, "a new listing starts at 0 views").toBe(0);

    // The owner can't change it (no error, so an edit form sending `views` keeps working).
    const cheat = await o.from("listings").update({ titre: "Titre modifié", views: 9999 }).eq("id", listing.id);
    expect(cheat.error).toBeNull();
    expect(await getListing(listing.id)).toMatchObject({ titre: "Titre modifié", views: 0 });
    // Nor can an admin.
    const admin = await clientAs(SEED.admin);
    expect((await admin.from("listings").update({ views: 777 }).eq("id", listing.id)).error).toBeNull();
    expect((await getListing(listing.id)).views).toBe(0);

    // The view counter still works, for visitors and for signed-in users.
    expect((await anonClient().rpc("increment_views", { p_id: listing.id })).error).toBeNull();
    expect((await getListing(listing.id)).views).toBe(1);
    expect((await o.rpc("increment_views", { p_id: listing.id })).error).toBeNull();
    expect((await getListing(listing.id)).views).toBe(2);
  });

  test("une conversation se fait toujours avec le vrai propriétaire de l'annonce", async () => {
    const [owner, buyer, stranger] = await Promise.all([createUser(), createUser(), createUser()]);
    const listing = await createListing(owner);
    const b = await clientAs(buyer);

    // The browser sends a wrong owner, names and title: the database puts the real ones.
    const { data: conv, error } = await b.from("conversations").insert({
      listing_id: listing.id, listing_title: "Faux titre", buyer_id: buyer.id, buyer_name: SEED.admin.nom,
      owner_id: stranger.id, owner_name: "Faux propriétaire",
    }).select().single();
    expect(error).toBeNull();
    expect(conv).toMatchObject({ owner_id: owner.id, owner_name: owner.nom, buyer_id: buyer.id, buyer_name: buyer.nom, listing_title: listing.titre });

    // The stranger doesn't get the conversation; the real owner does.
    const s = await clientAs(stranger);
    expect((await s.from("conversations").select("id").eq("id", conv.id)).data).toEqual([]);
    const o = await clientAs(owner);
    expect((await o.from("conversations").select("id").eq("id", conv.id)).data).toEqual([{ id: conv.id }]);

    // No conversation about a listing that doesn't exist.
    const ghost = await b.from("conversations").insert({
      listing_id: 999999999, listing_title: "x", buyer_id: buyer.id, buyer_name: "x", owner_id: owner.id, owner_name: "x",
    });
    expect(ghost.error).not.toBeNull();
  });

  test("l'admin peut supprimer les fichiers photo d'un autre utilisateur", async () => {
    const owner = await createUser();
    const [url] = await uploadPhotos(owner, ["photo-2.jpg"]);
    const path = url.split("/listing-photos/")[1];
    const admin = await clientAs(SEED.admin);
    const { data, error } = await admin.storage.from("listing-photos").remove([path]);
    expect(error).toBeNull();
    expect(data.map(f => f.name)).toEqual([path]);
    const { data: left } = await db.storage.from("listing-photos").list(owner.id);
    expect(left.filter(f => f.id)).toEqual([]);
  });
});
