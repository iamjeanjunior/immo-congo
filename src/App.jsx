import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { createClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET, MAX_PHOTOS, listingPhotos, storagePathFromUrl, checkPhotoFile, compressPhoto } from "./photos.js";
import Icon from "./Icon.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Uploads one shrunk photo into the user's own Storage folder. Returns its public URL.
async function uploadPhoto(userId, blob) {
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, {
    contentType: blob.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Best effort: deletes our Storage files behind these photo URLs. Never throws;
// old base64 photos and other links are simply skipped.
async function removeStoredPhotos(urls) {
  const paths = urls.map(storagePathFromUrl).filter(Boolean);
  if (!paths.length) return;
  try {
    await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  } catch {
    // ignore: a leftover file must never block saving or deleting a listing
  }
}

// A new listing needs a row in "profiles" for its owner (database rule listings_owner_id_fkey).
const PROFILE_MISSING_MSG = "Votre profil est introuvable, l'annonce n'a pas été publiée. Vérifiez votre connexion puis réessayez. Si cela continue, contactez ImmoCongo sur WhatsApp (numéro en bas de la page d'accueil).";

function isMissingProfileError(err) {
  return err?.code === "23503" && String(err?.message || "").includes("listings_owner_id_fkey");
}

const VILLES = ["Fungurume", "Kolwezi", "Lubumbashi", "Likasi", "Kipushi", "Autre"];
// Rooms filter (home search and listings page): "at least N rooms".
const CHAMBRES_OPTIONS = [["", "Peu importe"], ["1", "1 ou plus"], ["2", "2 ou plus"], ["3", "3 ou plus"], ["4", "4 ou plus"]];
const CONTACT_WHATSAPP = "264816032560";
const PAGE_SIZE = 9;
const HOME_LATEST = 6;

// Colours: navy for text and headers, green for the main actions, lots of white and light grey.
const C = {
  navy: "#0d2f6e", navyDark: "#0a1f47", ink: "#14213d", muted: "#5b6478", line: "#e4e7ee", field: "#cfd5e1",
  soft: "#f5f7fa", green: "#15803d", greenBright: "#16a34a", greenSoft: "#ecfdf3", red: "#dc2626", amber: "#f59e0b",
};

function formatPrice(prix) {
  return Number(prix || 0).toLocaleString("fr-FR");
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function initial(name) {
  return (String(name || "").trim().charAt(0) || "?").toUpperCase();
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

// Supabase answers in English: show the common signup problems in French.
function signupErrorMessage(error) {
  const msg = String(error?.message || "");
  if (/already (registered|exists)/i.test(msg)) return "Un compte existe déjà avec cet email. Connectez-vous.";
  if (/password/i.test(msg) && /(at least|characters|weak)/i.test(msg)) return "Le mot de passe doit contenir au moins 6 caractères.";
  if (/email/i.test(msg) && /invalid/i.test(msg)) return "Adresse email invalide.";
  if (/rate limit|too many/i.test(msg)) return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (/fetch|network/i.test(msg)) return "Problème de connexion internet. Vérifiez votre connexion puis réessayez.";
  return msg || "Impossible de créer le compte. Réessayez.";
}
const DEFAULT_POST_FORM = {
  titre: "", prix: "", devise: "USD", localisation: "", ville: "Fungurume",
  chambres: "", description: "", whatsapp: "", disponible: "true",
};

function parseRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (!hash) return { page: "home", id: null };
  const [seg, idRaw] = hash.split("/");
  if (seg === "listing" && idRaw) return { page: "detail", id: /^\d+$/.test(idRaw) ? Number(idRaw) : idRaw };
  if (seg === "chat" && idRaw) return { page: "chat", id: /^\d+$/.test(idRaw) ? Number(idRaw) : idRaw };
  const known = ["listings", "auth", "post", "my-listings", "favorites", "messages", "admin"];
  if (known.includes(seg)) return { page: seg, id: null };
  return { page: "home", id: null };
}

function routeHash(page, id) {
  if (page === "detail") return `#/listing/${id}`;
  if (page === "chat") return `#/chat/${id}`;
  if (page === "home") return "#/";
  return `#/${page}`;
}

// True while the CSS media query matches (re-renders when the screen size changes).
function useMediaQuery(query) {
  const subscribe = useCallback(onChange => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

export default function App() {
  const initialRoute = parseRoute();
  const [page, setPage] = useState(initialRoute.page);
  const [selectedId, setSelectedId] = useState(initialRoute.id);
  const [listings, setListings] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ownerProfile, setOwnerProfile] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [form, setForm] = useState({});
  const [toast, setToast] = useState(null);
  const [filterVille, setFilterVille] = useState("Toutes");
  const [filterDispo, setFilterDispo] = useState("Toutes");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [filterChambres, setFilterChambres] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState(null);
  // Photos in the publish form: { src, blob }. blob is set for new photos (not uploaded yet);
  // existing photos only have src (Storage URL or old base64).
  const [images, setImages] = useState([]);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [activePhoto, setActivePhoto] = useState(0);
  const [postForm, setPostForm] = useState(DEFAULT_POST_FORM);
  const [favorites, setFavorites] = useState(new Set());
  const [reviews, setReviews] = useState([]);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminReviews, setAdminReviews] = useState([]);
  const [adminTab, setAdminTab] = useState("listings");
  // Owners with the verified badge (ids), for the badge on listing cards and the home page.
  const [verifiedOwners, setVerifiedOwners] = useState(new Set());
  // The site's confirmation window: { title, message, confirmLabel, danger, resolve } or null.
  const [confirmState, setConfirmState] = useState(null);
  const [authError, setAuthError] = useState("");
  const viewedRef = useRef(new Set());
  const toastTimerRef = useRef(null);
  const chatScrollRef = useRef(null);

  const isAdmin = profile?.role === "admin";
  const isMobile = useMediaQuery("(max-width: 640px)");
  // Tablets: one column on the listing page, search and filters on several rows.
  const isNarrow = useMediaQuery("(max-width: 900px)");
  // Logged-in users have up to 7 menu links (~860px), so they get the ☰ menu on tablets too.
  const compactNav = useMediaQuery(currentUser ? "(max-width: 960px)" : "(max-width: 640px)");

  // ---------- auth + listings bootstrap ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
    });
    fetchListings();
    fetchVerifiedOwners();
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- URL routing (back/forward + shareable links) ----------
  useEffect(() => {
    function onPop() {
      const r = parseRoute();
      setPage(r.page);
      setSelectedId(r.id);
      setActivePhoto(0);
      window.scrollTo(0, 0);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // ---------- favorites follow the logged-in user ----------
  useEffect(() => {
    fetchFavorites(currentUser?.id || null);
  }, [currentUser]);

  // ---------- reset pagination when filters change ----------
  useEffect(() => {
    resetPagination();
  }, [filterVille, filterDispo, search, priceMin, priceMax, filterChambres, sortBy]);

  // ---------- ☰ menu: Esc closes it ----------
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e) { if (e.key === "Escape") setMenuOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // ---------- detail page: reviews + view counter ----------
  useEffect(() => {
    if (page === "detail" && selectedId) {
      fetchReviews(selectedId);
      if (!viewedRef.current.has(selectedId)) {
        viewedRef.current.add(selectedId);
        supabase.rpc("increment_views", { p_id: selectedId }).then(({ error }) => {
          if (!error) {
            setListings(prev => prev.map(l => l.id === selectedId ? { ...l, views: (l.views || 0) + 1 } : l));
          }
        });
      }
    } else {
      resetReviews();
    }
  }, [page, selectedId]);

  // ---------- detail page: owner profile (for verified badge) ----------
  useEffect(() => {
    let active = true;
    const ownerId = listings.find(l => l.id === selectedId)?.owner_id;
    if (page === "detail" && ownerId) {
      supabase.from("profiles").select("nom, verified").eq("id", ownerId).single().then(({ data }) => {
        if (active) setOwnerProfile(data || null);
      });
    } else {
      resetOwnerProfile();
    }
    return () => { active = false; };
  }, [page, selectedId, listings]);

  // ---------- messages page (and the chat page header: who the conversation is with) ----------
  useEffect(() => {
    if ((page === "messages" || page === "chat") && currentUser) fetchConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, currentUser]);

  // ---------- chat page: show the newest message ----------
  useEffect(() => {
    const box = chatScrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages, page]);

  // ---------- chat page: live messages ----------
  useEffect(() => {
    if (page !== "chat" || !selectedId) return;
    fetchMessages(selectedId);
    const channel = supabase
      .channel(`messages-${selectedId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedId}` }, payload => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [page, selectedId]);

  // ---------- admin page ----------
  useEffect(() => {
    if (page === "admin" && isAdmin) {
      fetchAdminUsers();
      fetchAdminReviews();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, isAdmin]);

  // ---------- SEO: title + meta description ----------
  useEffect(() => {
    const base = "ImmoCongo – Maisons à louer au Katanga";
    const detailNow = listings.find(l => l.id === selectedId);
    let title = base;
    let desc = "Trouvez ou publiez des maisons à louer à Fungurume, Kolwezi, Lubumbashi et environs, au Katanga (RDC).";
    if (page === "detail" && detailNow) {
      title = `${detailNow.titre} – ${detailNow.ville} | ImmoCongo`;
      desc = (detailNow.description || desc).slice(0, 155);
    } else if (page === "listings") {
      title = `Annonces – ${base}`;
    }
    document.title = title;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = desc;
  }, [page, selectedId, listings]);

  async function fetchListings() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("listings").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setListings(data || []);
    } catch {
      showToast("Erreur de chargement des annonces.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (error) throw error;
      setProfile(data);
    } catch {
      setProfile(null);
    }
  }

  async function fetchFavorites(userId) {
    if (!userId) { setFavorites(new Set()); return; }
    try {
      const { data, error } = await supabase.from("favorites").select("listing_id").eq("user_id", userId);
      if (error) throw error;
      setFavorites(new Set((data || []).map(f => f.listing_id)));
    } catch {
      setFavorites(new Set());
    }
  }

  // Public data (profiles are readable by everyone): only the ids of verified owners.
  async function fetchVerifiedOwners() {
    try {
      const { data, error } = await supabase.from("profiles").select("id").eq("verified", true);
      if (error) throw error;
      setVerifiedOwners(new Set((data || []).map(p => p.id)));
    } catch {
      setVerifiedOwners(new Set());
    }
  }

  function resetPagination() { setVisibleCount(PAGE_SIZE); }
  function resetReviews() { setReviews([]); }
  function resetOwnerProfile() { setOwnerProfile(null); }

  async function toggleFavorite(listingId) {
    if (!currentUser) { nav("auth"); return; }
    const isFav = favorites.has(listingId);
    setFavorites(prev => {
      const next = new Set(prev);
      if (isFav) next.delete(listingId); else next.add(listingId);
      return next;
    });
    try {
      if (isFav) {
        const { error } = await supabase.from("favorites").delete().eq("user_id", currentUser.id).eq("listing_id", listingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("favorites").insert({ user_id: currentUser.id, listing_id: listingId });
        if (error) throw error;
      }
    } catch {
      showToast("Favoris indisponibles (migration SQL requise ?).", "error");
      fetchFavorites(currentUser.id);
    }
  }

  async function fetchReviews(listingId) {
    try {
      const { data, error } = await supabase.from("reviews").select("*").eq("listing_id", listingId).order("created_at", { ascending: false });
      if (error) throw error;
      setReviews(data || []);
    } catch {
      setReviews([]);
    }
  }

  async function submitReview(e) {
    e.preventDefault();
    const detailNow = listings.find(l => l.id === selectedId);
    if (!currentUser) { nav("auth"); return; }
    if (!detailNow) return;
    setReviewSubmitting(true);
    try {
      const { error } = await supabase.from("reviews").insert({
        listing_id: detailNow.id,
        user_id: currentUser.id,
        reviewer_name: profile?.nom || "Utilisateur",
        rating: reviewForm.rating,
        comment: reviewForm.comment || null,
      });
      if (error) throw error;
      setReviewForm({ rating: 5, comment: "" });
      showToast("Merci pour votre avis !");
      fetchReviews(detailNow.id);
    } catch {
      showToast("Impossible d'envoyer votre avis (migration SQL requise ?).", "error");
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function fetchConversations() {
    if (!currentUser) return;
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .or(`buyer_id.eq.${currentUser.id},owner_id.eq.${currentUser.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setConversations(data || []);
    } catch {
      showToast("Messagerie indisponible pour le moment.", "error");
    }
  }

  async function startConversation(listing) {
    if (!currentUser) { nav("auth"); return; }
    if (currentUser.id === listing.owner_id) { showToast("Vous êtes le propriétaire de cette annonce.", "error"); return; }
    try {
      const { data: existing } = await supabase.from("conversations").select("*").eq("listing_id", listing.id).eq("buyer_id", currentUser.id).maybeSingle();
      let conv = existing;
      if (!conv) {
        const { data, error } = await supabase.from("conversations").insert({
          listing_id: listing.id,
          listing_title: listing.titre,
          buyer_id: currentUser.id,
          buyer_name: profile?.nom || "Utilisateur",
          owner_id: listing.owner_id,
          owner_name: listing.owner_name || "Propriétaire",
        }).select().single();
        if (error) throw error;
        conv = data;
      }
      nav("chat", conv.id);
    } catch {
      showToast("Messagerie indisponible (migration SQL requise ?).", "error");
    }
  }

  async function fetchMessages(conversationId) {
    try {
      const { data, error } = await supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
      if (error) throw error;
      setMessages(data || []);
    } catch {
      setMessages([]);
    }
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!messageInput.trim() || !currentUser || !selectedId) return;
    const content = messageInput.trim();
    setMessageInput("");
    try {
      const { error } = await supabase.from("messages").insert({ conversation_id: selectedId, sender_id: currentUser.id, content });
      if (error) throw error;
    } catch {
      showToast("Message non envoyé.", "error");
    }
  }

  async function fetchAdminUsers() {
    try {
      const { data, error } = await supabase.from("profiles").select("*").order("nom");
      if (error) throw error;
      setAdminUsers(data || []);
    } catch {
      showToast("Impossible de charger les utilisateurs.", "error");
    }
  }

  async function fetchAdminReviews() {
    try {
      const { data, error } = await supabase.from("reviews").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setAdminReviews(data || []);
    } catch {
      setAdminReviews([]);
    }
  }

  async function toggleVerified(userId, current) {
    try {
      const { error } = await supabase.from("profiles").update({ verified: !current }).eq("id", userId);
      if (error) throw error;
      setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, verified: !current } : u));
      setVerifiedOwners(prev => {
        const next = new Set(prev);
        if (current) next.delete(userId); else next.add(userId);
        return next;
      });
      showToast("Statut mis à jour.");
    } catch {
      showToast("Action refusée (migration SQL / droits admin ?).", "error");
    }
  }

  // Opens the site's confirmation window. Resolves to true ("Supprimer"...) or false ("Annuler", Esc, tap outside).
  function askConfirm({ title, message, confirmLabel, danger = false }) {
    return new Promise(resolve => setConfirmState({ title, message, confirmLabel, danger, resolve }));
  }

  function closeConfirm(answer) {
    if (confirmState) confirmState.resolve(answer);
    setConfirmState(null);
  }

  async function adminDeleteReview(id) {
    const review = adminReviews.find(r => r.id === id);
    const ok = await askConfirm({
      title: "Supprimer cet avis ?",
      message: `L'avis de ${review?.reviewer_name || "cet utilisateur"} sera supprimé définitivement.`,
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    try {
      const { error } = await supabase.from("reviews").delete().eq("id", id);
      if (error) throw error;
      setAdminReviews(prev => prev.filter(r => r.id !== id));
      showToast("Avis supprimé.");
    } catch {
      showToast("Suppression impossible.", "error");
    }
  }

  function shareListing(listing) {
    const url = `${window.location.origin}${window.location.pathname}#/listing/${listing.id}`;
    if (navigator.share) {
      navigator.share({ title: listing.titre, text: `${listing.titre} — ${listing.prix} ${listing.devise}/mois à ${listing.ville}`, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast("Lien copié !"));
    } else {
      showToast(url);
    }
  }

  function showToast(msg, type = "success", duration = 3500) {
    setToast({ msg, type });
    clearTimeout(toastTimerRef.current); // an older toast's timer must not hide this one early
    toastTimerRef.current = setTimeout(() => setToast(null), duration);
  }

  function nav(p, id = null) {
    setPage(p);
    setSelectedId(id);
    setActivePhoto(0);
    setMenuOpen(false);
    setAuthError("");
    window.history.pushState({ page: p, id }, "", routeHash(p, id));
    window.scrollTo(0, 0);
  }

  async function handleAuth(e) {
    e.preventDefault();
    setSubmitting(true);
    setAuthError("");
    if (authMode === "register") {
      // nom + whatsapp also travel with the signup: the database uses them to create the profile by itself.
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { emailRedirectTo: window.location.origin, data: { nom: form.nom, whatsapp: form.whatsapp } }
      });
      if (error) { setAuthError(signupErrorMessage(error)); setSubmitting(false); return; }
      if (data.user) {
        // Upsert, not insert: the database may already have created the profile (signup trigger),
        // and a plain insert would then fail. No "role" here: new accounts are always "user".
        const { data: saved, error: profileError } = await supabase
          .from("profiles")
          .upsert({ id: data.user.id, nom: form.nom, whatsapp: form.whatsapp }, { onConflict: "id" })
          .select()
          .single();
        // If this failed, the profile is created again before the first publish (see ensureProfile).
        if (!profileError) setProfile(saved);
        showToast(`Bienvenue, ${form.nom} !`);
        nav("home");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (error) { setAuthError("Email ou mot de passe incorrect."); setSubmitting(false); return; }
      showToast("Connexion réussie !");
      nav("home");
    }
    setForm({});
    setSubmitting(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    showToast("Déconnexion réussie.");
    nav("home");
  }

  // New photos are checked and shrunk on the phone right away; they are uploaded when the listing is saved.
  async function handleImagesChange(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // lets the user pick the same photo again after removing it
    if (!files.length) return;
    const room = MAX_PHOTOS - images.length;
    if (room <= 0) { showToast(`Maximum ${MAX_PHOTOS} photos.`, "error"); return; }
    if (files.length > room) showToast(`Maximum ${MAX_PHOTOS} photos : les photos en trop n'ont pas été ajoutées.`, "error");
    setPreparingPhotos(true);
    const added = [];
    for (const file of files.slice(0, room)) {
      const problem = checkPhotoFile(file);
      if (problem) { showToast(problem, "error"); continue; }
      try {
        const blob = await compressPhoto(file);
        added.push({ src: URL.createObjectURL(blob), blob });
      } catch (err) {
        showToast(err.message || `Impossible de lire « ${file.name} ».`, "error");
      }
    }
    if (added.length) setImages(prev => [...prev, ...added].slice(0, MAX_PHOTOS));
    setPreparingPhotos(false);
  }

  function removeImage(index) {
    const photo = images[index];
    if (photo?.blob) URL.revokeObjectURL(photo.src);
    setImages(prev => prev.filter((_, i) => i !== index));
  }

  function clearFormPhotos() {
    images.forEach(p => { if (p.blob) URL.revokeObjectURL(p.src); });
    setImages([]);
  }

  // Makes sure the signed-in user has their row in "profiles" (a new listing needs it) and returns it.
  // Older accounts can miss it. The database only lets a user create their own row.
  async function ensureProfile() {
    if (profile?.id === currentUser.id) return profile;
    const { data: found, error: findError } = await supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
    if (findError) throw findError;
    if (found) { setProfile(found); return found; }
    const meta = currentUser.user_metadata || {};
    const { error: createError } = await supabase.from("profiles").upsert({
      id: currentUser.id,
      nom: String(meta.nom || "").trim() || "Utilisateur",
      whatsapp: String(meta.whatsapp || postForm.whatsapp || "").trim() || null,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (createError) throw createError;
    const { data: created, error: readError } = await supabase.from("profiles").select("*").eq("id", currentUser.id).single();
    if (readError) throw readError;
    setProfile(created);
    return created;
  }

  async function handlePost(e) {
    e.preventDefault();
    if (!currentUser) { nav("auth"); return; }
    if (preparingPhotos) return;
    setSubmitting(true);

    // 0. A new listing needs the owner's profile: create it now if this account has none.
    let myProfile = profile;
    if (!editId) {
      try {
        myProfile = await ensureProfile();
      } catch {
        setSubmitting(false);
        showToast(PROFILE_MISSING_MSG, "error", 10000);
        return;
      }
    }

    // 1. Upload the new photos first. If one fails, nothing is saved and the form stays as it is.
    const newPhotos = images.filter(p => p.blob);
    const uploadedUrls = new Map();
    try {
      for (let i = 0; i < newPhotos.length; i++) {
        setUploadStatus(`Envoi des photos… ${i + 1}/${newPhotos.length}`);
        uploadedUrls.set(newPhotos[i], await uploadPhoto(currentUser.id, newPhotos[i].blob));
      }
    } catch {
      removeStoredPhotos([...uploadedUrls.values()]);
      setUploadStatus("");
      setSubmitting(false);
      showToast("Échec de l'envoi des photos. Vérifiez votre connexion puis réessayez.", "error");
      return;
    }

    // 2. Save the listing with photo URLs (existing photos keep their URL or old base64).
    setUploadStatus("Enregistrement…");
    const photoUrls = images.map(p => uploadedUrls.get(p) || p.src);
    const original = editId ? listings.find(l => l.id === editId) : null;
    const previousPhotos = original ? listingPhotos(original) : [];
    // An admin editing someone else's listing with an empty WhatsApp field keeps the listing's number, not the admin's.
    const fallbackWhatsapp = original && original.owner_id !== currentUser.id ? original.whatsapp : myProfile?.whatsapp;
    const listing = {
      titre: postForm.titre,
      prix: parseFloat(postForm.prix),
      devise: postForm.devise,
      localisation: postForm.localisation,
      ville: postForm.ville,
      chambres: parseInt(postForm.chambres) || 0,
      description: postForm.description,
      whatsapp: postForm.whatsapp || fallbackWhatsapp || "",
      disponible: postForm.disponible === "true",
      image_url: photoUrls[0] || null,
      images: JSON.stringify(photoUrls),
    };
    try {
      if (editId) {
        // No owner_id / owner_name: editing never changes who owns the listing (admins can edit others' listings).
        const { error } = await supabase.from("listings").update(listing).eq("id", editId);
        if (error) throw error;
        // Photos removed while editing: delete their files (best effort, never blocks).
        removeStoredPhotos(previousPhotos.filter(src => !photoUrls.includes(src)));
        showToast("Annonce modifiée !");
        setEditId(null);
      } else {
        const { error } = await supabase.from("listings").insert({
          ...listing,
          owner_id: currentUser.id,
          owner_name: myProfile?.nom || "Propriétaire",
        });
        if (error) throw error;
        showToast("Annonce publiée avec succès !");
      }
      await fetchListings();
      setPostForm(DEFAULT_POST_FORM);
      clearFormPhotos();
      nav("listings");
    } catch (err) {
      // The listing was not saved: remove the photos we just uploaded so nothing is left half-done.
      removeStoredPhotos([...uploadedUrls.values()]);
      if (isMissingProfileError(err)) showToast(PROFILE_MISSING_MSG, "error", 10000);
      else showToast(editId ? "Erreur lors de la modification." : "Erreur lors de la publication.", "error");
    } finally {
      setUploadStatus("");
      setSubmitting(false);
    }
  }

  async function deleteListing(id) {
    const target = listings.find(l => l.id === id);
    const ok = await askConfirm({
      title: "Supprimer cette annonce ?",
      message: `L'annonce « ${target?.titre || ""} » et ses photos seront supprimées définitivement.`,
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    const photos = listingPhotos(target);
    try {
      const { error } = await supabase.from("listings").delete().eq("id", id);
      if (error) throw error;
      removeStoredPhotos(photos);
      await fetchListings();
      showToast("Annonce supprimée.");
      if (page === "detail") nav("listings");
    } catch {
      showToast("Suppression impossible.", "error");
    }
  }

  function startEdit(listing) {
    setEditId(listing.id);
    setPostForm({
      titre: listing.titre, prix: listing.prix, devise: listing.devise || "USD",
      localisation: listing.localisation, ville: listing.ville || "Fungurume",
      chambres: listing.chambres || "", description: listing.description,
      whatsapp: listing.whatsapp || "", disponible: listing.disponible ? "true" : "false",
    });
    clearFormPhotos();
    setImages(listingPhotos(listing).map(src => ({ src, blob: null })));
    nav("post");
  }

  function startNewListing() {
    setEditId(null);
    setPostForm(DEFAULT_POST_FORM);
    clearFormPhotos();
    nav("post");
  }

  // Home page search: town, max price and rooms, then straight to the filtered listings.
  function searchFromHome(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setFilterVille(String(f.get("ville") || "Toutes"));
    setPriceMax(String(f.get("prixMax") || "").trim());
    setFilterChambres(String(f.get("chambres") || ""));
    setSearch("");
    setPriceMin("");
    setFilterDispo("Toutes");
    nav("listings");
  }

  function clearFilters() {
    setFilterVille("Toutes");
    setFilterDispo("Toutes");
    setFilterChambres("");
    setSearch("");
    setPriceMin("");
    setPriceMax("");
  }

  // Click on a link to a page of the site: open it in the app (a new tab still works with Ctrl/⌘).
  function linkTo(p, id) {
    return e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      nav(p, id);
    };
  }

  const filtered = listings.filter(l => {
    if (filterVille !== "Toutes" && l.ville !== filterVille) return false;
    if (filterDispo === "Disponible" && !l.disponible) return false;
    if (filterDispo === "Occupée" && l.disponible) return false;
    if (priceMin && Number(l.prix) < Number(priceMin)) return false;
    if (priceMax && Number(l.prix) > Number(priceMax)) return false;
    if (filterChambres && (Number(l.chambres) || 0) < Number(filterChambres)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = `${l.titre} ${l.localisation} ${l.description}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "price_asc") return (a.prix || 0) - (b.prix || 0);
    if (sortBy === "price_desc") return (b.prix || 0) - (a.prix || 0);
    return new Date(b.created_at) - new Date(a.created_at);
  });
  const visible = sorted.slice(0, visibleCount);

  const myListings = listings.filter(l => currentUser && l.owner_id === currentUser.id);
  const favoriteListings = listings.filter(l => favorites.has(l.id));
  const detail = listings.find(l => l.id === selectedId);
  const canEdit = detail && currentUser && (detail.owner_id === currentUser.id || profile?.role === "admin");
  const editingOthersListing = Boolean(editId && currentUser && listings.find(l => l.id === editId)?.owner_id !== currentUser.id);
  const detailPhotos = listingPhotos(detail);
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const relatedListings = detail ? listings.filter(l => l.id !== detail.id && l.ville === detail.ville).slice(0, 3) : [];

  const filtersActiveCount = [filterVille !== "Toutes", filterDispo !== "Toutes", Boolean(filterChambres), Boolean(priceMin), Boolean(priceMax)].filter(Boolean).length;
  const filtersActive = filtersActiveCount > 0 || Boolean(search.trim());
  const townCount = new Set(listings.map(l => l.ville).filter(Boolean)).size;
  const verifiedOwnerCount = new Set(listings.filter(l => verifiedOwners.has(l.owner_id)).map(l => l.owner_id)).size;
  const showMessageBtn = Boolean(detail && currentUser && !canEdit);
  const whatsappHref = detail ? `https://wa.me/${(detail.whatsapp || CONTACT_WHATSAPP).replace(/[^0-9]/g, "")}` : "";
  const showContactBar = page === "detail" && Boolean(detail) && isMobile;
  const activeConversation = page === "chat" ? conversations.find(c => c.id === selectedId) : null;
  const gutter = isMobile ? 16 : 24;
  const maxW = 1120 + gutter * 2;

  const btn = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 44, padding: "0 18px",
    borderRadius: 12, fontSize: 15, fontWeight: 700, border: "1px solid transparent", textDecoration: "none",
    whiteSpace: "nowrap", lineHeight: 1.2, cursor: "pointer", fontFamily: "inherit",
  };
  const field = {
    width: "100%", minHeight: 48, padding: "11px 14px", borderRadius: 12, border: `1px solid ${C.field}`, backgroundColor: "#fff",
    fontSize: 16, color: C.ink, fontFamily: "inherit", lineHeight: 1.4,
  };
  const wrapPadding = isMobile ? "20px 16px 48px" : "36px 24px 72px";

  const S = {
    root: { minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fff", color: C.ink, overflowWrap: "break-word", paddingBottom: showContactBar ? 84 : 0 },
    main: { flex: 1, display: "flex", flexDirection: "column" },
    pageWhite: { flex: 1 },
    pageGrey: { flex: 1, background: C.soft },
    wrap: { width: "100%", maxWidth: maxW, margin: "0 auto", padding: wrapPadding },
    wrapNarrow: { width: "100%", maxWidth: 760 + gutter * 2, margin: "0 auto", padding: wrapPadding },
    wrapDetail: { width: "100%", maxWidth: maxW, margin: "0 auto", padding: isMobile ? "8px 16px 48px" : "24px 24px 72px" },
    wrapChat: { width: "100%", maxWidth: 760 + gutter * 2, margin: "0 auto", padding: isMobile ? "8px 16px 32px" : "24px 24px 64px" },
    wrapForm: { width: "100%", maxWidth: 720 + gutter * 2, margin: "0 auto", padding: wrapPadding },
    pageHead: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: isMobile ? 16 : 24 },
    h1: { margin: 0, fontSize: isMobile ? 26 : 32, fontWeight: 800, color: C.navy, letterSpacing: "-0.02em", lineHeight: 1.2 },
    h2: { margin: 0, fontSize: isMobile ? 21 : 26, fontWeight: 800, color: C.navy, letterSpacing: "-0.015em", lineHeight: 1.25 },
    h3: { margin: "0 0 12px", fontSize: isMobile ? 18 : 20, fontWeight: 800, color: C.navy, letterSpacing: "-0.01em" },
    sub: { margin: "6px 0 0", fontSize: 15, color: C.muted },

    btnPrimary: { ...btn, background: C.green, color: "#fff" },
    btnNavy: { ...btn, background: C.navy, color: "#fff" },
    btnSecondary: { ...btn, background: "#fff", color: C.navy, border: `1px solid ${C.field}` },
    btnDanger: { ...btn, background: "#fff", color: "#b91c1c", border: "1px solid #fecaca" },
    btnLg: { minHeight: 52, fontSize: 16, padding: "0 24px", borderRadius: 14 },
    btnSm: { minHeight: 40, fontSize: 14, padding: "0 14px", borderRadius: 10 },
    block: { width: "100%" },
    linkBtn: { background: "none", border: "none", padding: 0, color: C.navy, fontWeight: 700, fontSize: "inherit", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3, fontFamily: "inherit" },
    backBtn: { ...btn, minHeight: 40, padding: "0 10px 0 4px", background: "transparent", color: C.navy, fontWeight: 600, marginBottom: 12, marginLeft: -4 },

    field,
    textarea: { ...field, minHeight: 120, resize: "vertical" },
    label: { display: "block", fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 6 },
    formGroup: { marginBottom: 18 },
    formRow2: { display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 12, marginBottom: 18 },
    formRowEven: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginBottom: 18 },
    hint: { margin: "8px 0 0", fontSize: 13, color: C.muted, lineHeight: 1.45 },
    panel: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, padding: isMobile ? 18 : 28 },
    formError: { display: "flex", alignItems: "flex-start", gap: 10, background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 14px", fontSize: 15, fontWeight: 600, marginBottom: 18, lineHeight: 1.4 },

    // Header
    nav: { position: "sticky", top: 0, zIndex: 100, background: "#fff", borderBottom: `1px solid ${C.line}` },
    navInner: { maxWidth: maxW, margin: "0 auto", height: 64, padding: `0 ${gutter}px`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
    logo: { fontSize: 22, fontWeight: 800, color: C.navy, letterSpacing: "-0.02em", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 },
    logoSpan: { color: C.greenBright },
    navLinks: { display: "flex", alignItems: "center", gap: 2 },
    navBtn: { ...btn, minHeight: 40, padding: "0 12px", borderRadius: 10, background: "transparent", color: C.ink, fontWeight: 600 },
    navBtnActive: { background: C.soft, color: C.navy },
    navCta: { ...btn, minHeight: 40, padding: "0 16px", borderRadius: 999, background: C.green, color: "#fff", marginLeft: 6 },
    burger: { width: 44, height: 44, borderRadius: 12, border: `1px solid ${C.line}`, background: "#fff", color: C.navy, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
    menuBackdrop: { position: "fixed", top: 64, left: 0, right: 0, bottom: 0, background: "rgba(10, 31, 71, 0.35)", zIndex: 105 },
    menuPanel: { position: "fixed", top: 64, left: 0, right: 0, zIndex: 110, background: "#fff", borderBottom: `1px solid ${C.line}`, boxShadow: "0 16px 32px rgba(10, 31, 71, 0.12)", padding: "6px 16px 16px", display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 64px)", overflowY: "auto" },
    menuItem: { display: "flex", alignItems: "center", gap: 14, width: "100%", minHeight: 52, padding: "0 8px", background: "transparent", border: "none", borderBottom: `1px solid ${C.soft}`, borderRadius: 0, fontSize: 16, fontWeight: 600, color: C.ink, textAlign: "left", fontFamily: "inherit" },
    menuCta: { ...btn, minHeight: 50, borderRadius: 14, background: C.green, color: "#fff", marginTop: 12, width: "100%", fontSize: 16 },

    toast: { position: "fixed", top: 76, left: 16, right: 16, margin: "0 auto", width: "fit-content", maxWidth: 520, display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", borderRadius: 14, fontSize: 15, fontWeight: 600, lineHeight: 1.4, zIndex: 1000, boxShadow: "0 12px 32px rgba(10, 31, 71, 0.25)", color: "#fff", cursor: "pointer" },
    toastSuccess: { background: C.navyDark },
    toastError: { background: "#b42318" },

    // Home
    hero: { color: "#fff", padding: isMobile ? "36px 16px 76px" : "92px 24px 136px" },
    heroInner: { maxWidth: 920, margin: "0 auto", textAlign: "center" },
    heroEyebrow: { margin: "0 0 12px", fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#86efac" },
    heroTitle: { margin: "0 auto 12px", maxWidth: 760, fontSize: isMobile ? 30 : 52, fontWeight: 800, lineHeight: 1.12, letterSpacing: "-0.025em", textWrap: "balance" },
    heroSub: { margin: isMobile ? "0 0 24px" : "0 0 36px", fontSize: isMobile ? 16 : 19, color: "rgba(255, 255, 255, 0.86)" },
    searchBox: isNarrow
      ? { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10, background: "#fff", borderRadius: 20, padding: 14, boxShadow: "0 20px 48px rgba(5, 18, 45, 0.35)", textAlign: "left", maxWidth: 720, margin: "0 auto" }
      : { display: "flex", alignItems: "center", background: "#fff", borderRadius: 999, padding: 8, boxShadow: "0 20px 48px rgba(5, 18, 45, 0.35)", textAlign: "left", maxWidth: 880, margin: "0 auto" },
    searchCell: isNarrow
      ? { border: `1px solid ${C.field}`, borderRadius: 14, padding: "8px 14px", minWidth: 0 }
      : { flex: "1 1 0", minWidth: 0, padding: "6px 24px", borderRadius: 999 },
    searchDivider: { width: 1, height: 36, background: C.line, flexShrink: 0 },
    searchLabel: { display: "block", fontSize: 12, fontWeight: 700, color: C.navy, letterSpacing: "0.02em", cursor: "pointer" },
    searchControl: { width: "100%", border: "none", backgroundColor: "transparent", padding: "2px 0", fontSize: 16, color: C.ink, minHeight: 30, fontFamily: "inherit" },
    searchBtn: { ...btn, background: C.green, color: "#fff", minHeight: isNarrow ? 52 : 56, borderRadius: isNarrow ? 14 : 999, padding: "0 28px", fontSize: 16, flexShrink: 0, gridColumn: isNarrow ? "1 / -1" : "auto" },
    trust: { position: "relative", marginTop: isMobile ? -40 : -52, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", background: "#fff", borderRadius: 20, boxShadow: "0 10px 30px rgba(10, 31, 71, 0.12)", border: `1px solid ${C.line}`, padding: isMobile ? "14px 0" : "22px 0" },
    trustItem: { display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "center", justifyContent: "center", gap: isMobile ? 6 : 14, textAlign: isMobile ? "center" : "left", padding: "0 8px", minWidth: 0 },
    trustIcon: { width: isMobile ? 36 : 48, height: isMobile ? 36 : 48, borderRadius: "50%", background: C.greenSoft, color: C.green, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
    trustNum: { fontSize: isMobile ? 20 : 26, fontWeight: 800, color: C.navy, lineHeight: 1.1 },
    trustLabel: { fontSize: isMobile ? 12 : 14, color: C.muted, lineHeight: 1.3 },
    trustWrap: { width: "100%", maxWidth: maxW, margin: "0 auto", padding: `0 ${gutter}px` },
    section: { width: "100%", maxWidth: maxW, margin: "0 auto", padding: isMobile ? `40px ${gutter}px` : `64px ${gutter}px` },
    sectionHead: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: isMobile ? 18 : 28 },
    softBand: { background: C.soft },
    steps: { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: isMobile ? 12 : 24 },
    step: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, padding: isMobile ? 18 : 28, display: "flex", flexDirection: isMobile ? "row" : "column", gap: isMobile ? 14 : 18, alignItems: "flex-start" },
    stepIcon: { width: 48, height: 48, borderRadius: 14, background: C.greenSoft, color: C.green, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
    stepTitle: { margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: C.navy },
    stepText: { margin: 0, fontSize: 15, color: C.muted, lineHeight: 1.5 },
    landlord: { background: `linear-gradient(135deg, ${C.navy} 0%, #164394 100%)`, color: "#fff", borderRadius: 24, padding: isMobile ? "28px 20px" : "48px 56px", display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: isMobile ? 20 : 32 },

    // Footer
    footer: { background: C.soft, borderTop: `1px solid ${C.line}`, color: C.muted, fontSize: 15 },
    footerInner: { maxWidth: maxW, margin: "0 auto", padding: isMobile ? "36px 16px 24px" : "48px 24px 32px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)", gap: isMobile ? 28 : 40 },
    footerTitle: { margin: "0 0 10px", fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.navy },
    footerLink: { background: "none", border: "none", padding: "6px 0", color: C.ink, fontSize: 15, cursor: "pointer", display: "block", textAlign: "left", fontFamily: "inherit" },
    footerBottom: { maxWidth: maxW, margin: "0 auto", padding: `0 ${gutter}px 28px`, fontSize: 13 },

    // Listings page
    filterPanel: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, padding: isMobile ? 12 : 16, boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04)" },
    filterTop: { display: "flex", gap: 10 },
    searchWrap: { position: "relative", flex: 1, minWidth: 0 },
    searchIcon: { position: "absolute", left: 14, top: 14, color: C.muted, pointerEvents: "none" },
    filterToggle: { ...btn, minHeight: 48, flexShrink: 0, padding: "0 14px", background: "#fff", color: C.navy, border: `1px solid ${C.field}` },
    filterGrid: { display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : isNarrow ? "repeat(3, minmax(0, 1fr))" : "repeat(6, minmax(0, 1fr))", gap: isMobile ? 10 : 12, marginTop: 12 },
    filterLabel: { display: "block", fontSize: 13, fontWeight: 600, color: C.muted, marginBottom: 4 },
    resultsBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: isMobile ? "16px 0 18px" : "20px 0 24px", minHeight: 28 },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: isMobile ? 28 : "36px 24px" },

    // Listing card
    card: { position: "relative", minWidth: 0 },
    cardLink: { display: "block", color: "inherit", textDecoration: "none", borderRadius: 16 },
    cardPhoto: { position: "relative", aspectRatio: "4 / 3", borderRadius: 16, overflow: "hidden", background: "#e9edf3" },
    cardImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
    cardPlaceholder: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9aa6bd", background: "linear-gradient(135deg, #e6ecf7, #f3f6fb)" },
    cardBody: { padding: "12px 2px 0" },
    cardPrice: { margin: 0, fontSize: 20, fontWeight: 800, color: C.navy, letterSpacing: "-0.01em", lineHeight: 1.25 },
    priceUnit: { fontSize: 14, fontWeight: 500, color: C.muted, letterSpacing: 0 },
    cardTitle: { margin: "2px 0 0", fontSize: 15, fontWeight: 600, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    cardMeta: { display: "flex", alignItems: "center", gap: 6, margin: "4px 0 0", fontSize: 14, color: C.muted, minWidth: 0 },
    ellipsis: { minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    cardFacts: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 14px", marginTop: 6, fontSize: 14, color: C.muted },
    fact: { display: "inline-flex", alignItems: "center", gap: 6 },
    verifiedSmall: { display: "inline-flex", alignItems: "center", gap: 4, color: C.green, fontWeight: 600 },
    statusPill: { position: "absolute", top: 12, left: 12, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255, 255, 255, 0.95)", color: C.ink, fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 999, boxShadow: "0 1px 4px rgba(10, 31, 71, 0.15)" },
    dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
    photoCount: { position: "absolute", bottom: 12, left: 12, display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(10, 31, 71, 0.72)", color: "#fff", fontSize: 12, fontWeight: 700, padding: "4px 9px", borderRadius: 999 },
    heartBtn: { position: "absolute", top: 4, right: 4, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", padding: 0, color: "#fff", borderRadius: "50%" },
    cardActions: { display: "flex", gap: 8, marginTop: 12 },
    skeletonPhoto: { aspectRatio: "4 / 3", borderRadius: 16 },
    skeletonLine: { height: 12, borderRadius: 6, margin: "10px 0 0" },

    // Listing page
    galleryWrap: { position: "relative", margin: isMobile ? "0 -16px" : 0, borderRadius: isMobile ? 0 : 20, overflow: "hidden", background: "#e9edf3" },
    gallerySlide: isMobile ? { aspectRatio: "4 / 3" } : { height: 480 },
    galleryImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
    galleryCounter: { position: "absolute", right: 12, bottom: 12, background: "rgba(10, 31, 71, 0.72)", color: "#fff", fontSize: 13, fontWeight: 700, padding: "4px 10px", borderRadius: 999 },
    galleryArrow: { position: "absolute", top: "calc(50% - 22px)", width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(255, 255, 255, 0.95)", color: C.navy, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, boxShadow: "0 2px 8px rgba(10, 31, 71, 0.2)" },
    dots: { position: "absolute", left: 0, right: 0, bottom: 16, display: "flex", justifyContent: "center", gap: 6, pointerEvents: "none" },
    thumbs: { display: "flex", gap: 10, marginTop: 12, overflowX: "auto", paddingBottom: 4 },
    thumb: { flex: "0 0 auto", width: 96, height: 72, padding: 0, borderRadius: 12, overflow: "hidden", background: "none" },
    detailLayout: isNarrow ? { marginTop: isMobile ? 20 : 28 } : { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 56, alignItems: "start", marginTop: 32 },
    detailTitle: { margin: 0, fontSize: isMobile ? 25 : 32, fontWeight: 800, color: C.navy, letterSpacing: "-0.02em", lineHeight: 1.2 },
    detailLoc: { display: "flex", alignItems: "flex-start", gap: 6, margin: "8px 0 0", fontSize: 16, color: C.muted },
    detailRating: { display: "flex", alignItems: "center", gap: 6, margin: "6px 0 0", fontSize: 15, color: C.ink },
    bigPrice: { margin: 0, fontSize: 28, fontWeight: 800, color: C.navy, letterSpacing: "-0.02em", lineHeight: 1.15 },
    priceRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 16 },
    actionRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 },
    divider: { border: "none", borderTop: `1px solid ${C.line}`, margin: isMobile ? "22px 0" : "28px 0" },
    infoGrid: { display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))", gap: 10 },
    infoItem: { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: C.soft, borderRadius: 14, minWidth: 0 },
    infoIcon: { width: 36, height: 36, borderRadius: 10, background: "#fff", color: C.navy, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
    detailSection: { marginTop: isMobile ? 30 : 40 },
    description: { margin: 0, fontSize: 16, lineHeight: 1.7, color: C.ink, whiteSpace: "pre-line" },
    aside: { position: "sticky", top: 88 },
    asideCard: { border: `1px solid ${C.line}`, borderRadius: 20, padding: 24, boxShadow: "0 12px 32px rgba(10, 31, 71, 0.08)", background: "#fff", display: "grid", gap: 16 },
    ownerCard: { display: "flex", alignItems: "center", gap: 12, padding: 14, border: `1px solid ${C.line}`, borderRadius: 16, minWidth: 0, background: "#fff" },
    avatar: { width: 44, height: 44, borderRadius: "50%", background: "#e6ecf7", color: C.navy, fontWeight: 800, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
    ownerName: { margin: 0, fontSize: 16, fontWeight: 700, color: C.ink },
    verifiedLine: { display: "flex", alignItems: "center", gap: 5, margin: "2px 0 0", fontSize: 14, fontWeight: 600, color: C.green },
    statusBadge: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, padding: "5px 11px", borderRadius: 999, whiteSpace: "nowrap" },
    statusOn: { background: C.greenSoft, color: "#166534" },
    statusOff: { background: "#fef2f2", color: "#991b1b" },
    ownerTools: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, background: C.soft, border: `1px solid ${C.line}`, borderRadius: 16, padding: "14px 16px", marginTop: 24 },
    contactBar: { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 90, background: "#fff", borderTop: `1px solid ${C.line}`, boxShadow: "0 -8px 24px rgba(10, 31, 71, 0.08)", padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", display: "flex", alignItems: "center", gap: 10 },
    mapFrame: { width: "100%", height: isMobile ? 220 : 300, border: 0, borderRadius: 16, display: "block", background: C.soft },
    reviewItem: { display: "flex", gap: 12, padding: "16px 0", borderTop: `1px solid ${C.line}` },
    starBtn: { width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", padding: 0, borderRadius: 10 },

    // Forms
    authCard: { width: "100%", maxWidth: 440, margin: "0 auto", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 22, padding: isMobile ? "28px 20px" : "40px 36px", boxShadow: "0 12px 32px rgba(10, 31, 71, 0.06)" },
    formSection: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, padding: isMobile ? 18 : 28, marginBottom: 16 },
    formSectionTitle: { margin: "0 0 16px", fontSize: 18, fontWeight: 700, color: C.navy },
    dropzone: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 132, padding: 20, border: `2px dashed ${C.field}`, borderRadius: 16, background: C.soft, color: C.navy, textAlign: "center", cursor: "pointer" },
    photoGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 14 },
    photoThumb: { position: "relative", aspectRatio: "4 / 3", borderRadius: 12, overflow: "hidden", background: C.soft },
    photoMainBadge: { position: "absolute", left: 6, bottom: 6, background: C.navy, color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999 },
    photoRemove: { position: "absolute", top: 4, right: 4, width: 40, height: 40, borderRadius: "50%", border: "2px solid #fff", background: "rgba(10, 31, 71, 0.8)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
    progress: { display: "flex", alignItems: "center", gap: 8, margin: "10px 0 0", fontSize: 14, color: C.navy, fontWeight: 600 },

    // Messages, chat, admin
    listCard: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, overflow: "hidden" },
    convRow: { display: "flex", alignItems: "center", gap: 14, width: "100%", padding: isMobile ? "14px 16px" : "16px 20px", background: "#fff", border: "none", textAlign: "left", color: C.ink, cursor: "pointer", fontFamily: "inherit", fontSize: 16 },
    chatCard: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column" },
    chatHead: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${C.line}`, minWidth: 0 },
    chatMessages: { display: "flex", flexDirection: "column", gap: 8, height: isMobile ? "calc(100vh - 330px)" : 460, minHeight: 280, overflowY: "auto", padding: 16, background: "#fbfcfe" },
    bubble: { maxWidth: "80%", padding: "9px 14px 7px", borderRadius: 18, fontSize: 15, lineHeight: 1.45, overflowWrap: "anywhere" },
    bubbleMine: { alignSelf: "flex-end", background: C.navy, color: "#fff", borderBottomRightRadius: 6 },
    bubbleTheirs: { alignSelf: "flex-start", background: "#eef1f6", color: C.ink, borderBottomLeftRadius: 6 },
    bubbleTime: { display: "block", fontSize: 11, marginTop: 2, opacity: 0.7, textAlign: "right" },
    chatForm: { display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${C.line}`, background: "#fff" },
    segmented: { display: "flex", gap: 4, padding: 4, background: "#e9edf3", borderRadius: 14, marginBottom: 20, overflowX: "auto", width: isMobile ? "100%" : "fit-content", maxWidth: "100%" },
    segBtn: { ...btn, minHeight: 40, padding: "0 14px", borderRadius: 10, background: "transparent", color: C.muted, fontSize: 14, flex: isMobile ? "1 0 auto" : "0 0 auto" },
    segBtnActive: { background: "#fff", color: C.navy, boxShadow: "0 1px 3px rgba(10, 31, 71, 0.12)" },
    adminRow: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, padding: isMobile ? "14px 16px" : "16px 20px" },
    adminRowText: { flex: "1 1 180px", minWidth: 0 },
    adminRowActions: { display: "flex", gap: 8, flexShrink: 0 },
    adminThumb: { width: 56, height: 42, borderRadius: 8, objectFit: "cover", background: C.soft, flexShrink: 0, display: "block" },
    meta: { margin: "2px 0 0", fontSize: 14, color: C.muted },
    verifiedPill: { display: "inline-flex", alignItems: "center", gap: 4, background: C.greenSoft, color: "#166534", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 999, verticalAlign: "middle", marginLeft: 6 },
  };

  const cardProps = l => ({
    listing: l,
    S,
    href: routeHash("detail", l.id),
    onOpen: linkTo("detail", l.id),
    isFav: favorites.has(l.id),
    onToggleFav: () => toggleFavorite(l.id),
    verified: verifiedOwners.has(l.owner_id),
  });

  const loginPrompt = text => (
    <EmptyState icon="user" text={text}>
      <button className="hov-dim" style={S.btnPrimary} onClick={() => nav("auth")}>Se connecter</button>
    </EmptyState>
  );

  const navItems = currentUser
    ? [
        ["listings", "Annonces", "home"],
        ["favorites", "Favoris", "heart"],
        ["messages", "Messages", "message"],
        ...(isAdmin ? [["admin", "Admin", "shield"]] : []),
        ["my-listings", "Mes annonces", "list"],
      ]
    : [["listings", "Annonces", "home"]];
  const isCurrent = p => page === p || (p === "messages" && page === "chat") || (p === "listings" && page === "detail");

  const ownerCard = detail && (
    <div style={S.ownerCard} data-testid="owner-card">
      <div style={S.avatar} aria-hidden="true">{initial(detail.owner_name)}</div>
      <div style={{ minWidth: 0 }}>
        <p style={S.ownerName}>{detail.owner_name || "Privé"}</p>
        {ownerProfile?.verified ? (
          <p style={S.verifiedLine} data-testid="verified-badge"><Icon name="verified" size={17} /> Propriétaire vérifié</p>
        ) : (
          <p style={{ ...S.meta, marginTop: 0 }}>Propriétaire</p>
        )}
      </div>
    </div>
  );

  // Price, owner and contact buttons: a column on the right on computers, under the title on tablets.
  const contactCard = detail && (
    <div style={S.asideCard}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <p style={S.bigPrice}>{formatPrice(detail.prix)} <span style={S.priceUnit}>{detail.devise}/mois</span></p>
        {statusBadge(detail.disponible)}
      </div>
      {ownerCard}
      <a href={whatsappHref} target="_blank" rel="noreferrer" className="hov-dim" style={{ ...S.btnPrimary, ...S.btnLg }}>
        <Icon name="whatsapp" size={22} />Contacter sur WhatsApp
      </a>
      {showMessageBtn && (
        <button className="hov-soft" style={{ ...S.btnSecondary, ...S.btnLg }} onClick={() => startConversation(detail)}>
          <Icon name="message" size={20} />Message au propriétaire
        </button>
      )}
    </div>
  );

  function statusBadge(disponible) {
    return (
    <span style={{ ...S.statusBadge, ...(disponible ? S.statusOn : S.statusOff) }}>
      <span style={{ ...S.dot, background: disponible ? C.greenBright : "#ef4444" }} />
      {disponible ? "Disponible" : "Occupée"}
    </span>
    );
  }

  return (
    <div style={S.root}>
      {/* HEADER — on small screens the links only show when the ☰ menu is open */}
      <nav style={S.nav} aria-label="Menu principal">
        <div style={S.navInner}>
          <a href="#/" onClick={linkTo("home")} style={S.logo} aria-label="ImmoCongo – accueil">Immo<span style={S.logoSpan}>Congo</span></a>
          {compactNav ? (
            <button
              aria-label="Ouvrir le menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(o => !o)}
              className="hov-soft"
              style={S.burger}
            >
              <Icon name={menuOpen ? "close" : "menu"} size={22} />
            </button>
          ) : (
            <div style={S.navLinks}>
              {navItems.map(([p, label]) => (
                <button key={p} className="hov-soft" style={{ ...S.navBtn, ...(isCurrent(p) ? S.navBtnActive : {}) }} aria-current={isCurrent(p) ? "page" : undefined} onClick={() => nav(p)}>{label}</button>
              ))}
              {currentUser ? (
                <>
                  <button className="hov-dim" style={S.navCta} onClick={startNewListing}><Icon name="plus" size={18} />Publier</button>
                  <button className="hov-soft" style={S.navBtn} onClick={logout}>Déconnexion</button>
                </>
              ) : (
                <>
                  <button className="hov-soft" style={{ ...S.navBtn, ...(page === "auth" && authMode === "login" ? S.navBtnActive : {}) }} onClick={() => { setAuthMode("login"); nav("auth"); }}>Connexion</button>
                  <button className="hov-dim" style={S.navCta} onClick={() => { setAuthMode("register"); nav("auth"); }}>Créer un compte</button>
                </>
              )}
            </div>
          )}
        </div>
        {compactNav && menuOpen && (
          <>
            <div style={S.menuBackdrop} onClick={() => setMenuOpen(false)} />
            <div style={S.menuPanel} className="nav-menu-mobile">
              {navItems.map(([p, label, icon]) => (
                <button key={p} className="hov-soft" style={{ ...S.menuItem, ...(isCurrent(p) ? { color: C.navy } : {}) }} aria-current={isCurrent(p) ? "page" : undefined} onClick={() => nav(p)}>
                  <Icon name={icon} size={20} style={{ color: C.navy }} />{label}
                </button>
              ))}
              {currentUser ? (
                <>
                  <button className="hov-soft" style={S.menuItem} onClick={logout}><Icon name="logout" size={20} style={{ color: C.navy }} />Déconnexion</button>
                  <button className="hov-dim" style={S.menuCta} onClick={startNewListing}><Icon name="plus" size={20} />Publier</button>
                </>
              ) : (
                <>
                  <button className="hov-soft" style={S.menuItem} onClick={() => { setAuthMode("login"); nav("auth"); }}><Icon name="login" size={20} style={{ color: C.navy }} />Connexion</button>
                  <button className="hov-dim" style={S.menuCta} onClick={() => { setAuthMode("register"); nav("auth"); }}>Créer un compte</button>
                </>
              )}
            </div>
          </>
        )}
      </nav>

      {toast && (
        <div
          className="toast"
          role={toast.type === "error" ? "alert" : "status"}
          onClick={() => setToast(null)}
          style={{ ...S.toast, ...(toast.type === "error" ? S.toastError : S.toastSuccess) }}
        >
          <Icon name={toast.type === "error" ? "alert" : "checkCircle"} size={20} style={{ color: toast.type === "error" ? "#fecaca" : "#4ade80", marginTop: 1 }} />
          <span>{toast.msg}</span>
        </div>
      )}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          danger={confirmState.danger}
          onConfirm={() => closeConfirm(true)}
          onCancel={() => closeConfirm(false)}
        />
      )}

      <main style={S.main}>
        {/* HOME */}
        {page === "home" && (
          <div style={S.pageWhite}>
            <section className="hero" style={S.hero}>
              <div style={S.heroInner}>
                <p style={S.heroEyebrow}>Katanga · RD Congo</p>
                <h1 style={S.heroTitle}>Trouvez votre maison à Fungurume & environs</h1>
                <p style={S.heroSub}>La plateforme de location immobilière du Katanga</p>
                <form onSubmit={searchFromHome} style={S.searchBox} role="search" aria-label="Rechercher une maison" data-testid="home-search">
                  <div className="search-cell" style={S.searchCell}>
                    <label htmlFor="home-ville" style={S.searchLabel}>Ville</label>
                    <select id="home-ville" name="ville" defaultValue={filterVille} className="search-control" style={S.searchControl}>
                      <option value="Toutes">Toutes les villes</option>
                      {VILLES.map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  {!isNarrow && <span style={S.searchDivider} />}
                  <div className="search-cell" style={S.searchCell}>
                    <label htmlFor="home-prix" style={S.searchLabel}>Prix max par mois</label>
                    <input id="home-prix" name="prixMax" type="number" inputMode="numeric" min="0" placeholder="Ex : 500" defaultValue={priceMax} className="search-control" style={S.searchControl} />
                  </div>
                  {!isNarrow && <span style={S.searchDivider} />}
                  <div className="search-cell" style={S.searchCell}>
                    <label htmlFor="home-chambres" style={S.searchLabel}>Chambres</label>
                    <select id="home-chambres" name="chambres" defaultValue={filterChambres} className="search-control" style={S.searchControl}>
                      {CHAMBRES_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                    </select>
                  </div>
                  <button type="submit" className="hov-dim" style={S.searchBtn}><Icon name="search" size={20} />Rechercher</button>
                </form>
              </div>
            </section>

            <div style={S.trustWrap}>
              <div style={S.trust} data-testid="trust-strip">
                {[
                  ["home", listings.length, plural(listings.length, "Annonce publiée", "Annonces publiées")],
                  ["city", townCount, plural(townCount, "Ville couverte", "Villes couvertes")],
                  ["verified", verifiedOwnerCount, plural(verifiedOwnerCount, "Propriétaire vérifié", "Propriétaires vérifiés")],
                ].map(([icon, n, label], i) => (
                  <div key={label} style={{ ...S.trustItem, ...(i > 0 ? { borderLeft: `1px solid ${C.line}` } : {}) }}>
                    <span style={S.trustIcon}><Icon name={icon} size={isMobile ? 18 : 22} /></span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ ...S.trustNum, display: "block" }}>{loading ? "–" : n}</span>
                      <span style={{ ...S.trustLabel, display: "block" }}>{label}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <section style={S.section} aria-labelledby="home-latest">
              <div style={S.sectionHead}>
                <h2 id="home-latest" style={S.h2}>Annonces récentes</h2>
                {!isMobile && <button className="hov-soft" style={{ ...S.btnSecondary, ...S.btnSm }} onClick={() => nav("listings")}>Voir toutes les annonces<Icon name="arrowRight" size={18} /></button>}
              </div>
              {loading ? (
                <div style={S.grid}>{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} S={S} />)}</div>
              ) : listings.length === 0 ? (
                <EmptyState icon="home" text="Aucune annonce pour le moment." />
              ) : (
                <div style={S.grid}>{listings.slice(0, HOME_LATEST).map(l => <ListingCard key={l.id} {...cardProps(l)} />)}</div>
              )}
              {isMobile && (
                <button className="hov-soft" style={{ ...S.btnSecondary, ...S.btnLg, ...S.block, marginTop: 28 }} onClick={() => nav("listings")}>Voir toutes les annonces<Icon name="arrowRight" size={18} /></button>
              )}
            </section>

            <div style={S.softBand}>
              <section style={S.section} aria-labelledby="home-how">
                <div style={S.sectionHead}><h2 id="home-how" style={S.h2}>Comment ça marche ?</h2></div>
                <div style={S.steps}>
                  {[
                    ["search", "1. Cherchez", "Choisissez la ville, votre budget et le nombre de chambres."],
                    ["message", "2. Contactez", "Écrivez directement au propriétaire, sur WhatsApp ou par message."],
                    ["home", "3. Visitez", "Visitez la maison et mettez-vous d'accord avec le propriétaire."],
                  ].map(([icon, title, text]) => (
                    <div key={title} style={S.step}>
                      <span style={S.stepIcon}><Icon name={icon} size={24} /></span>
                      <div>
                        <h3 style={S.stepTitle}>{title}</h3>
                        <p style={S.stepText}>{text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section style={S.section} aria-labelledby="home-landlord">
              <div style={S.landlord}>
                <div style={{ maxWidth: 560 }}>
                  <h2 id="home-landlord" style={{ ...S.h2, color: "#fff" }}>Vous avez une maison à louer ?</h2>
                  <p style={{ margin: "10px 0 0", fontSize: 16, lineHeight: 1.6, color: "rgba(255, 255, 255, 0.86)" }}>
                    Publiez votre annonce gratuitement en quelques minutes : photos, prix et numéro WhatsApp. Les locataires vous contactent directement.
                  </p>
                </div>
                <button className="hov-dim" style={{ ...S.btnPrimary, ...S.btnLg }} onClick={() => currentUser ? nav("post") : (setAuthMode("register"), nav("auth"))}>
                  <Icon name="plus" size={20} />Publier ma maison
                </button>
              </div>
            </section>
          </div>
        )}

        {/* LISTINGS */}
        {page === "listings" && (
          <div style={S.pageWhite}>
            <div style={S.wrap}>
              <div style={S.pageHead}>
                <div>
                  <h1 style={S.h1}>Annonces</h1>
                  <p style={S.sub}>Maisons et appartements à louer au Katanga</p>
                </div>
              </div>
              <div style={S.filterPanel} data-testid="filters">
                <div style={S.filterTop}>
                  <div style={S.searchWrap}>
                    <span style={S.searchIcon}><Icon name="search" size={20} /></span>
                    <input
                      className="field"
                      style={{ ...S.field, paddingLeft: 44 }}
                      type="search"
                      aria-label="Rechercher"
                      placeholder="Rechercher (titre, lieu...)"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                  {isMobile && (
                    <button className="hov-soft" style={S.filterToggle} aria-expanded={filtersOpen} aria-controls="filters-panel" onClick={() => setFiltersOpen(o => !o)}>
                      Filtres{filtersActiveCount ? ` (${filtersActiveCount})` : ""}
                    </button>
                  )}
                </div>
                {(!isMobile || filtersOpen) && (
                  <div id="filters-panel" style={S.filterGrid}>
                    <div>
                      <label htmlFor="f-ville" style={S.filterLabel}>Ville</label>
                      <select id="f-ville" className="field" style={S.field} value={filterVille} onChange={e => setFilterVille(e.target.value)}>
                        <option value="Toutes">Toutes</option>
                        {VILLES.map(v => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="f-chambres" style={S.filterLabel}>Chambres</label>
                      <select id="f-chambres" className="field" style={S.field} value={filterChambres} onChange={e => setFilterChambres(e.target.value)}>
                        {CHAMBRES_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="f-statut" style={S.filterLabel}>Statut</label>
                      <select id="f-statut" className="field" style={S.field} value={filterDispo} onChange={e => setFilterDispo(e.target.value)}>
                        <option value="Toutes">Tout statut</option>
                        <option value="Disponible">Disponible</option>
                        <option value="Occupée">Occupée</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="f-tri" style={S.filterLabel}>Trier par</label>
                      <select id="f-tri" className="field" style={S.field} value={sortBy} onChange={e => setSortBy(e.target.value)}>
                        <option value="recent">Plus récentes</option>
                        <option value="price_asc">Prix croissant</option>
                        <option value="price_desc">Prix décroissant</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="f-prix-min" style={S.filterLabel}>Prix min</label>
                      <input id="f-prix-min" className="field" style={S.field} type="number" inputMode="numeric" min="0" placeholder="Prix min" value={priceMin} onChange={e => setPriceMin(e.target.value)} />
                    </div>
                    <div>
                      <label htmlFor="f-prix-max" style={S.filterLabel}>Prix max</label>
                      <input id="f-prix-max" className="field" style={S.field} type="number" inputMode="numeric" min="0" placeholder="Prix max" value={priceMax} onChange={e => setPriceMax(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
              <div style={S.resultsBar}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.ink }} data-testid="results-count">{sorted.length} annonce{sorted.length !== 1 ? "s" : ""}</p>
                {filtersActive && sorted.length > 0 && <button style={S.linkBtn} onClick={clearFilters}>Effacer les filtres</button>}
              </div>
              {loading ? (
                <div style={S.grid}>{Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} S={S} />)}</div>
              ) : sorted.length === 0 ? (
                <EmptyState icon="search" text="Aucune annonce ne correspond à vos critères.">
                  {filtersActive && <button className="hov-soft" style={S.btnSecondary} onClick={clearFilters}>Effacer les filtres</button>}
                </EmptyState>
              ) : (
                <>
                  <div style={S.grid}>{visible.map(l => <ListingCard key={l.id} {...cardProps(l)} />)}</div>
                  {visibleCount < sorted.length && (
                    <div style={{ textAlign: "center", marginTop: 36 }}>
                      <button className="hov-soft" style={{ ...S.btnSecondary, ...S.btnLg }} onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>Charger plus ({sorted.length - visibleCount} restantes)</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* DETAIL */}
        {page === "detail" && detail && (
          <div style={S.pageWhite}>
            <div style={S.wrapDetail}>
              <button className="hov-soft" style={S.backBtn} onClick={() => nav("listings")}><Icon name="arrowLeft" size={18} />Retour aux annonces</button>

              <Gallery key={detail.id} photos={detailPhotos} title={detail.titre} active={activePhoto} onChange={setActivePhoto} isMobile={isMobile} S={S} />

              <div style={S.detailLayout}>
                <div style={{ minWidth: 0 }}>
                  <h1 style={S.detailTitle}>{detail.titre}</h1>
                  <p style={S.detailLoc} data-testid="detail-location">
                    <Icon name="pin" size={19} style={{ marginTop: 2 }} />
                    <span>{detail.localisation}{detail.ville ? ` · ${detail.ville}` : ""}</span>
                  </p>
                  {avgRating > 0 && (
                    <p style={S.detailRating}>
                      <Icon name="star" size={17} fill={C.amber} style={{ color: C.amber }} />
                      <strong>{avgRating.toFixed(1).replace(".", ",")}</strong>
                      <span style={{ color: C.muted }}>· {reviews.length} avis</span>
                    </p>
                  )}
                  {isMobile && (
                    <div style={S.priceRow}>
                      <p style={S.bigPrice}>{formatPrice(detail.prix)} <span style={S.priceUnit}>{detail.devise}/mois</span></p>
                      {statusBadge(detail.disponible)}
                    </div>
                  )}
                  <div style={S.actionRow}>
                    <button
                      className="hov-soft"
                      data-testid="detail-fav"
                      aria-pressed={favorites.has(detail.id)}
                      onClick={() => toggleFavorite(detail.id)}
                      style={{ ...S.btnSecondary, ...S.btnSm, ...(favorites.has(detail.id) ? { color: "#be123c", border: "1px solid #fecdd3" } : {}) }}
                    >
                      <Icon name="heart" size={18} fill={favorites.has(detail.id) ? "#e11d48" : "none"} />
                      {favorites.has(detail.id) ? "Retirer des favoris" : "Ajouter aux favoris"}
                    </button>
                    <button className="hov-soft" style={{ ...S.btnSecondary, ...S.btnSm }} onClick={() => shareListing(detail)}><Icon name="share" size={18} />Partager</button>
                  </div>

                  {isNarrow && !isMobile && <div style={{ marginTop: 24 }} aria-label="Contacter le propriétaire" role="region">{contactCard}</div>}

                  {canEdit && (
                    <div style={S.ownerTools} data-testid="owner-tools">
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.ink }}>Vous gérez cette annonce</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="hov-soft" style={{ ...S.btnSecondary, ...S.btnSm }} onClick={() => startEdit(detail)}><Icon name="edit" size={17} />Modifier</button>
                        <button className="hov-soft" style={{ ...S.btnDanger, ...S.btnSm }} onClick={() => deleteListing(detail.id)}><Icon name="trash" size={17} />Supprimer</button>
                      </div>
                    </div>
                  )}

                  <hr style={S.divider} />

                  <div style={S.infoGrid}>
                    <InfoItem S={S} icon="city" label="Ville" value={detail.ville} />
                    {detail.chambres > 0 && <InfoItem S={S} icon="bed" label="Chambres" value={detail.chambres} />}
                    <InfoItem S={S} icon="calendar" label="Publié le" value={formatDate(detail.created_at)} />
                    {detailPhotos.length > 0 && <InfoItem S={S} icon="camera" label="Photos" value={detailPhotos.length} />}
                    <InfoItem S={S} icon="eye" label="Vues" value={detail.views || 0} />
                  </div>

                  <section style={S.detailSection}>
                    <h2 style={S.h3}>Description</h2>
                    <p style={S.description}>{detail.description}</p>
                  </section>

                  {isMobile && (
                    <section style={S.detailSection}>
                      <h2 style={S.h3}>Propriétaire</h2>
                      {ownerCard}
                    </section>
                  )}

                  <section style={S.detailSection}>
                    <h2 style={S.h3}>Localisation</h2>
                    <iframe
                      title="Carte"
                      src={`https://www.google.com/maps?q=${encodeURIComponent(`${detail.localisation}, ${detail.ville}, RDC`)}&output=embed`}
                      style={S.mapFrame}
                      loading="lazy"
                    />
                  </section>

                  {/* AVIS */}
                  <section style={S.detailSection} data-testid="reviews">
                    <h2 style={{ ...S.h3, display: "flex", alignItems: "center", gap: 8 }}>
                      Avis
                      {reviews.length > 0 && <span style={{ fontSize: 16, fontWeight: 600, color: C.muted }}>({reviews.length})</span>}
                    </h2>
                    {reviews.length === 0 && <p style={{ margin: "0 0 8px", color: C.muted, fontSize: 15 }}>Aucun avis pour le moment.</p>}
                    {reviews.map(r => (
                      <div key={r.id} style={S.reviewItem}>
                        <div style={{ ...S.avatar, width: 40, height: 40, fontSize: 16 }} aria-hidden="true">{initial(r.reviewer_name)}</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                            <strong style={{ fontSize: 15, color: C.ink }}>{r.reviewer_name}</strong>
                            <Stars value={r.rating} />
                          </div>
                          {r.comment && <p style={{ margin: "4px 0 0", fontSize: 15, color: C.ink, lineHeight: 1.55 }}>{r.comment}</p>}
                        </div>
                      </div>
                    ))}
                    {currentUser ? (
                      <form onSubmit={submitReview} style={{ ...S.panel, padding: isMobile ? 16 : 20, marginTop: 12, background: C.soft }}>
                        <p style={{ ...S.label, marginBottom: 2 }}>Votre note</p>
                        <div role="group" aria-label="Votre note" style={{ display: "flex", gap: 2, marginBottom: 10, marginLeft: -8 }}>
                          {[1, 2, 3, 4, 5].map(n => (
                            <button
                              key={n}
                              type="button"
                              aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                              aria-pressed={reviewForm.rating === n}
                              onClick={() => setReviewForm(f => ({ ...f, rating: n }))}
                              style={{ ...S.starBtn, color: n <= reviewForm.rating ? C.amber : "#c5cbd6" }}
                            >
                              <Icon name="star" size={28} fill={n <= reviewForm.rating ? C.amber : "none"} strokeWidth={1.6} />
                            </button>
                          ))}
                        </div>
                        <label htmlFor="review-comment" className="sr-only">Votre commentaire</label>
                        <textarea id="review-comment" className="field" style={{ ...S.textarea, minHeight: 96 }} placeholder="Votre commentaire (optionnel)" value={reviewForm.comment} onChange={e => setReviewForm(f => ({ ...f, comment: e.target.value }))} />
                        <button type="submit" className="hov-dim" disabled={reviewSubmitting} style={{ ...S.btnNavy, marginTop: 12, opacity: reviewSubmitting ? 0.7 : 1 }}>{reviewSubmitting ? "Envoi..." : "Publier mon avis"}</button>
                      </form>
                    ) : (
                      <p style={{ fontSize: 15, color: C.muted, margin: "12px 0 0" }}>
                        <button style={S.linkBtn} onClick={() => nav("auth")}>Connectez-vous</button> pour laisser un avis.
                      </p>
                    )}
                  </section>
                </div>

                {!isNarrow && (
                  <aside style={S.aside} aria-label="Contacter le propriétaire">
                    {contactCard}
                  </aside>
                )}
              </div>

              {relatedListings.length > 0 && (
                <section style={{ marginTop: isMobile ? 40 : 64 }}>
                  <h2 style={{ ...S.h2, marginBottom: isMobile ? 18 : 24 }}>Annonces similaires à {detail.ville}</h2>
                  <div style={S.grid}>{relatedListings.map(l => <ListingCard key={l.id} {...cardProps(l)} />)}</div>
                </section>
              )}
            </div>

            {showContactBar && (
              <div style={S.contactBar} data-testid="contact-bar">
                {!showMessageBtn && (
                  <div style={{ flex: "1 1 0", minWidth: 0 }}>
                    <p style={{ ...S.bigPrice, fontSize: 20 }}>{formatPrice(detail.prix)} <span style={{ ...S.priceUnit, fontSize: 13 }}>{detail.devise}/mois</span></p>
                    <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: detail.disponible ? "#166534" : "#991b1b" }}>{detail.disponible ? "Disponible" : "Occupée"}</p>
                  </div>
                )}
                <a href={whatsappHref} target="_blank" rel="noreferrer" aria-label="Contacter sur WhatsApp" className="hov-dim" style={{ ...S.btnPrimary, minHeight: 48, flex: "1 1 0", minWidth: 0, borderRadius: 14 }}>
                  <Icon name="whatsapp" size={22} />WhatsApp
                </a>
                {showMessageBtn && (
                  <button aria-label="Message au propriétaire" className="hov-soft" style={{ ...S.btnSecondary, minHeight: 48, flex: "1 1 0", minWidth: 0, borderRadius: 14 }} onClick={() => startConversation(detail)}>
                    <Icon name="message" size={20} />Message
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {page === "detail" && !detail && !loading && (
          <div style={S.pageWhite}>
            <div style={S.wrap}>
              <EmptyState icon="search" text="Annonce introuvable ou supprimée.">
                <button className="hov-dim" style={S.btnPrimary} onClick={() => nav("listings")}>Voir les annonces</button>
              </EmptyState>
            </div>
          </div>
        )}

        {/* AUTH */}
        {page === "auth" && (
          <div style={S.pageGrey}>
            <div style={S.wrap}>
              <div style={S.authCard}>
                <h1 style={{ ...S.h1, textAlign: "center" }}>{authMode === "login" ? "Connexion" : "Créer un compte"}</h1>
                <p style={{ ...S.sub, textAlign: "center", margin: "8px 0 28px" }}>{authMode === "login" ? "Accédez à votre espace" : "Publiez vos annonces gratuitement"}</p>
                {authError && (
                  <div role="alert" style={S.formError}>
                    <Icon name="alert" size={20} style={{ marginTop: 1 }} />
                    <span>{authError}</span>
                  </div>
                )}
                <form onSubmit={handleAuth}>
                  {authMode === "register" && (
                    <div style={S.formGroup}>
                      <label htmlFor="auth-nom" style={S.label}>Nom complet *</label>
                      <input id="auth-nom" className="field" style={S.field} autoComplete="name" placeholder="Jean Dupont" value={form.nom || ""} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} required />
                    </div>
                  )}
                  <div style={S.formGroup}>
                    <label htmlFor="auth-email" style={S.label}>Email *</label>
                    <input id="auth-email" className="field" style={S.field} type="email" autoComplete="email" inputMode="email" placeholder="votre@email.com" value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                  </div>
                  <div style={S.formGroup}>
                    <label htmlFor="auth-password" style={S.label}>Mot de passe *</label>
                    <input id="auth-password" className="field" style={S.field} type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} placeholder="••••••••" value={form.password || ""} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
                  </div>
                  {authMode === "register" && (
                    <div style={S.formGroup}>
                      <label htmlFor="auth-whatsapp" style={S.label}>Numéro WhatsApp *</label>
                      <input id="auth-whatsapp" className="field" style={S.field} type="tel" autoComplete="tel" placeholder="+243 XXX XXX XXX" value={form.whatsapp || ""} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} required />
                    </div>
                  )}
                  <button type="submit" className="hov-dim" style={{ ...S.btnPrimary, ...S.btnLg, ...S.block, marginTop: 6, opacity: submitting ? 0.7 : 1 }} disabled={submitting}>
                    {submitting ? "En cours..." : authMode === "login" ? "Se connecter" : "Créer mon compte"}
                  </button>
                </form>
                <p style={{ textAlign: "center", fontSize: 15, margin: "22px 0 0", color: C.muted }}>
                  {authMode === "login" ? "Pas encore de compte ? " : "Déjà un compte ? "}
                  <button style={S.linkBtn} onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }}>
                    {authMode === "login" ? "S'inscrire" : "Se connecter"}
                  </button>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* POST */}
        {page === "post" && (
          <div style={S.pageGrey}>
            {!currentUser ? (
              <div style={S.wrap}>
                <EmptyState icon="user" text="Vous devez être connecté pour publier.">
                  <button className="hov-dim" style={S.btnPrimary} onClick={() => nav("auth")}>Se connecter</button>
                </EmptyState>
              </div>
            ) : (
              <div style={S.wrapForm}>
                <div style={S.pageHead}>
                  <div>
                    <h1 style={S.h1}>{editId ? "Modifier l'annonce" : "Publier une annonce"}</h1>
                    <p style={S.sub}>{editId ? "Modifiez ce qui doit changer, puis enregistrez." : "C'est gratuit. Les champs avec * sont obligatoires."}</p>
                  </div>
                </div>
                <form onSubmit={handlePost}>
                  <section style={S.formSection}>
                    <h2 style={S.formSectionTitle}>Le logement</h2>
                    <div style={S.formGroup}>
                      <label htmlFor="post-titre" style={S.label}>Titre *</label>
                      <input id="post-titre" className="field" style={S.field} placeholder="Ex: Maison 3 chambres – Gécamines" value={postForm.titre} onChange={e => setPostForm(f => ({ ...f, titre: e.target.value }))} required />
                    </div>
                    <div style={S.formRow2}>
                      <div>
                        <label htmlFor="post-prix" style={S.label}>Prix par mois *</label>
                        <input id="post-prix" className="field" style={S.field} type="number" inputMode="decimal" min="0" placeholder="800" value={postForm.prix} onChange={e => setPostForm(f => ({ ...f, prix: e.target.value }))} required />
                      </div>
                      <div>
                        <label htmlFor="post-devise" style={S.label}>Devise</label>
                        <select id="post-devise" className="field" style={S.field} value={postForm.devise} onChange={e => setPostForm(f => ({ ...f, devise: e.target.value }))}>
                          <option>USD</option><option>CDF</option><option>ZAR</option>
                        </select>
                      </div>
                    </div>
                    <div style={S.formRowEven}>
                      <div>
                        <label htmlFor="post-ville" style={S.label}>Ville *</label>
                        <select id="post-ville" className="field" style={S.field} value={postForm.ville} onChange={e => setPostForm(f => ({ ...f, ville: e.target.value }))}>
                          {VILLES.map(v => <option key={v}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="post-chambres" style={S.label}>Chambres</label>
                        <input id="post-chambres" className="field" style={S.field} type="number" inputMode="numeric" placeholder="3" min="0" value={postForm.chambres} onChange={e => setPostForm(f => ({ ...f, chambres: e.target.value }))} />
                      </div>
                    </div>
                    <div style={S.formGroup}>
                      <label htmlFor="post-localisation" style={S.label}>Localisation précise *</label>
                      <input id="post-localisation" className="field" style={S.field} placeholder="Ex: Quartier Gécamines, rue 12" value={postForm.localisation} onChange={e => setPostForm(f => ({ ...f, localisation: e.target.value }))} required />
                    </div>
                    <div>
                      <label htmlFor="post-description" style={S.label}>Description *</label>
                      <textarea id="post-description" className="field" style={S.textarea} placeholder="Décrivez la maison..." value={postForm.description} onChange={e => setPostForm(f => ({ ...f, description: e.target.value }))} required />
                    </div>
                  </section>

                  <section style={S.formSection}>
                    <h2 style={S.formSectionTitle}>Photos de la maison (max {MAX_PHOTOS})</h2>
                    <label
                      className="dropzone hov-soft"
                      style={{ ...S.dropzone, ...(preparingPhotos || submitting || images.length >= MAX_PHOTOS ? { opacity: 0.55, cursor: "not-allowed" } : {}) }}
                    >
                      <Icon name="upload" size={26} />
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{images.length >= MAX_PHOTOS ? `${MAX_PHOTOS} photos ajoutées` : "Ajouter des photos"}</span>
                      <span style={{ fontSize: 13, color: C.muted }}>Galerie ou appareil photo · {images.length}/{MAX_PHOTOS}</span>
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImagesChange}
                        disabled={preparingPhotos || submitting || images.length >= MAX_PHOTOS}
                      />
                    </label>
                    {preparingPhotos && <p style={S.progress} role="status"><Icon name="camera" size={18} />Préparation des photos…</p>}
                    {images.length > 0 && (
                      <div style={S.photoGrid}>
                        {images.map((img, i) => (
                          <div key={i} style={S.photoThumb}>
                            <img src={img.src} alt={`Photo ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            {i === 0 && <span style={S.photoMainBadge}>Photo principale</span>}
                            <button type="button" className="hov-dim" onClick={() => removeImage(i)} disabled={submitting} aria-label="Retirer cette photo" style={S.photoRemove}>
                              <Icon name="close" size={18} strokeWidth={2.5} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p style={S.hint}>La première photo sera la photo principale. Les photos sont réduites automatiquement pour charger vite (JPG, PNG ou WebP).</p>
                  </section>

                  <section style={S.formSection}>
                    <h2 style={S.formSectionTitle}>Contact et disponibilité</h2>
                    <div style={S.formGroup}>
                      <label htmlFor="post-whatsapp" style={S.label}>WhatsApp de contact</label>
                      <input id="post-whatsapp" className="field" style={S.field} type="tel" placeholder={(!editingOthersListing && profile?.whatsapp) || "+243 XXX XXX XXX"} value={postForm.whatsapp} onChange={e => setPostForm(f => ({ ...f, whatsapp: e.target.value }))} />
                    </div>
                    <div>
                      <label htmlFor="post-statut" style={S.label}>Statut</label>
                      <select id="post-statut" className="field" style={S.field} value={postForm.disponible} onChange={e => setPostForm(f => ({ ...f, disponible: e.target.value }))}>
                        <option value="true">Disponible</option>
                        <option value="false">Occupée</option>
                      </select>
                    </div>
                  </section>

                  <button type="submit" className="hov-dim" style={{ ...S.btnPrimary, ...S.btnLg, ...S.block, opacity: submitting || preparingPhotos ? 0.7 : 1 }} disabled={submitting || preparingPhotos}>
                    {submitting ? (uploadStatus || "En cours...") : preparingPhotos ? "Préparation des photos…" : editId ? "Enregistrer" : "Publier l'annonce"}
                  </button>
                  {editId && <button type="button" className="hov-soft" style={{ ...S.btnSecondary, ...S.btnLg, ...S.block, marginTop: 10 }} onClick={() => { setEditId(null); nav("my-listings"); }}>Annuler</button>}
                </form>
              </div>
            )}
          </div>
        )}

        {/* MY LISTINGS */}
        {page === "my-listings" && (
          <div style={S.pageWhite}>
            <div style={S.wrap}>
              <div style={S.pageHead}>
                <div>
                  <h1 style={S.h1}>Mes annonces</h1>
                  {currentUser && myListings.length > 0 && <p style={S.sub}>{myListings.length} annonce{myListings.length !== 1 ? "s" : ""}</p>}
                </div>
                {currentUser && myListings.length > 0 && (
                  <button className="hov-dim" style={S.btnPrimary} onClick={startNewListing}><Icon name="plus" size={18} />Nouvelle annonce</button>
                )}
              </div>
              {!currentUser
                ? loginPrompt("Connectez-vous pour voir vos annonces.")
                : myListings.length === 0
                ? (
                  <EmptyState icon="list" text="Vous n'avez pas encore d'annonces.">
                    <button className="hov-dim" style={S.btnPrimary} onClick={() => nav("post")}>Publier ma première annonce</button>
                  </EmptyState>
                )
                : (
                  <div style={S.grid}>
                    {myListings.map(l => (
                      <ListingCard
                        key={l.id}
                        {...cardProps(l)}
                        footer={
                          <div style={S.cardActions}>
                            <button className="hov-soft" style={{ ...S.btnSecondary, flex: 1 }} onClick={() => startEdit(l)}><Icon name="edit" size={18} />Modifier</button>
                            <button className="hov-soft" style={{ ...S.btnDanger, flex: 1 }} onClick={() => deleteListing(l.id)}><Icon name="trash" size={18} />Supprimer</button>
                          </div>
                        }
                      />
                    ))}
                  </div>
                )}
            </div>
          </div>
        )}

        {/* FAVORITES */}
        {page === "favorites" && (
          <div style={S.pageWhite}>
            <div style={S.wrap}>
              <div style={S.pageHead}><h1 style={S.h1}>Mes favoris</h1></div>
              {!currentUser ? (
                loginPrompt("Connectez-vous pour voir vos favoris.")
              ) : favoriteListings.length === 0 ? (
                <EmptyState icon="heart" text="Aucun favori pour le moment.">
                  <button className="hov-dim" style={S.btnPrimary} onClick={() => nav("listings")}>Parcourir les annonces</button>
                </EmptyState>
              ) : (
                <div style={S.grid}>{favoriteListings.map(l => <ListingCard key={l.id} {...cardProps(l)} />)}</div>
              )}
            </div>
          </div>
        )}

        {/* MESSAGES */}
        {page === "messages" && (
          <div style={S.pageGrey}>
            <div style={S.wrapNarrow}>
              <div style={S.pageHead}><h1 style={S.h1}>Messages</h1></div>
              {!currentUser ? (
                loginPrompt("Connectez-vous pour voir vos messages.")
              ) : conversations.length === 0 ? (
                <EmptyState icon="message" text="Aucune conversation pour le moment." />
              ) : (
                <div style={S.listCard}>
                  {conversations.map((c, i) => {
                    const otherName = c.buyer_id === currentUser.id ? c.owner_name : c.buyer_name;
                    return (
                      <button key={c.id} className="row-link" onClick={() => nav("chat", c.id)} style={{ ...S.convRow, borderTop: i > 0 ? `1px solid ${C.line}` : "none" }}>
                        <span style={S.avatar} aria-hidden="true">{initial(otherName)}</span>
                        <span style={{ flex: 1, minWidth: 0, display: "block" }}>
                          <strong style={{ display: "block", color: C.ink, fontSize: 16 }}>{otherName}</strong>
                          <span style={{ display: "block", margin: "2px 0 0", fontSize: 14, color: C.muted }}>À propos de : {c.listing_title}</span>
                        </span>
                        <Icon name="chevronRight" size={20} style={{ color: C.muted }} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* CHAT */}
        {page === "chat" && (
          <div style={S.pageGrey}>
            <div style={S.wrapChat}>
              <button className="hov-soft" style={S.backBtn} onClick={() => nav("messages")}><Icon name="arrowLeft" size={18} />Retour aux messages</button>
              {!currentUser ? (
                <EmptyState icon="message" text="Connectez-vous pour accéder à vos messages." />
              ) : (
                <div style={S.chatCard}>
                  {activeConversation && (
                    <div style={S.chatHead}>
                      <span style={S.avatar} aria-hidden="true">{initial(activeConversation.buyer_id === currentUser.id ? activeConversation.owner_name : activeConversation.buyer_name)}</span>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ ...S.ownerName, ...S.ellipsis }}>{activeConversation.buyer_id === currentUser.id ? activeConversation.owner_name : activeConversation.buyer_name}</p>
                        <a href={routeHash("detail", activeConversation.listing_id)} onClick={linkTo("detail", activeConversation.listing_id)} className="hov-link" style={{ display: "block", fontSize: 14, color: C.muted, textDecoration: "none", ...S.ellipsis }}>
                          {activeConversation.listing_title}
                        </a>
                      </div>
                    </div>
                  )}
                  <div ref={chatScrollRef} style={S.chatMessages}>
                    {messages.length === 0 && <p style={{ margin: "auto", textAlign: "center", color: C.muted, fontSize: 15 }}>Aucun message. Dites bonjour 👋</p>}
                    {messages.map(m => (
                      <div key={m.id} style={{ ...S.bubble, ...(m.sender_id === currentUser.id ? S.bubbleMine : S.bubbleTheirs) }}>
                        <span>{m.content}</span>
                        {m.created_at && <span style={S.bubbleTime} aria-hidden="true">{formatTime(m.created_at)}</span>}
                      </div>
                    ))}
                  </div>
                  <form onSubmit={sendMessage} style={S.chatForm}>
                    <label htmlFor="chat-input" className="sr-only">Votre message</label>
                    <input id="chat-input" className="field" style={{ ...S.field, flex: 1, minWidth: 0, borderRadius: 999, paddingLeft: 18 }} autoComplete="off" placeholder="Écrire un message..." value={messageInput} onChange={e => setMessageInput(e.target.value)} />
                    <button type="submit" className="hov-dim" style={{ ...S.btnPrimary, minHeight: 48, borderRadius: 999, padding: "0 18px", flexShrink: 0 }}><Icon name="send" size={18} />Envoyer</button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ADMIN */}
        {page === "admin" && (
          <div style={S.pageGrey}>
            <div style={S.wrap}>
              {!isAdmin ? (
                <EmptyState icon="shield" text="Accès réservé aux administrateurs." />
              ) : (
                <>
                  <div style={S.pageHead}><h1 style={S.h1}>Panneau d'administration</h1></div>
                  <div style={S.segmented}>
                    {[["listings", `Annonces (${listings.length})`], ["users", `Utilisateurs (${adminUsers.length})`], ["reviews", `Avis (${adminReviews.length})`]].map(([tab, label]) => (
                      <button key={tab} aria-pressed={adminTab === tab} style={{ ...S.segBtn, ...(adminTab === tab ? S.segBtnActive : {}) }} onClick={() => setAdminTab(tab)}>{label}</button>
                    ))}
                  </div>

                  <div style={S.listCard}>
                    {adminTab === "listings" && listings.map((l, i) => (
                      <div key={l.id} style={{ ...S.adminRow, borderTop: i > 0 ? `1px solid ${C.line}` : "none" }} data-testid="admin-row">
                        {listingPhotos(l)[0] ? <img src={listingPhotos(l)[0]} alt="" loading="lazy" style={S.adminThumb} /> : <span style={{ ...S.adminThumb, display: "flex", alignItems: "center", justifyContent: "center", color: "#9aa6bd" }}><Icon name="home" size={20} /></span>}
                        <div style={S.adminRowText}>
                          <strong style={{ color: C.navy }}>{l.titre}</strong>
                          <p style={S.meta}>{l.ville} · {l.owner_name} · {l.views || 0} vues</p>
                        </div>
                        <div style={S.adminRowActions}>
                          <button className="hov-soft" style={{ ...S.btnSecondary, ...S.btnSm }} onClick={() => nav("detail", l.id)}>Voir</button>
                          <button className="hov-soft" style={{ ...S.btnDanger, ...S.btnSm }} onClick={() => deleteListing(l.id)}>Supprimer</button>
                        </div>
                      </div>
                    ))}

                    {adminTab === "users" && adminUsers.map((u, i) => (
                      <div key={u.id} style={{ ...S.adminRow, borderTop: i > 0 ? `1px solid ${C.line}` : "none" }} data-testid="admin-row">
                        <span style={S.avatar} aria-hidden="true">{initial(u.nom)}</span>
                        <div style={S.adminRowText}>
                          <strong style={{ color: C.navy }}>{u.nom}</strong>
                          {u.verified && <span style={S.verifiedPill} data-testid="verified-badge"><Icon name="verified" size={14} />Vérifié</span>}
                          <p style={S.meta}>{u.whatsapp} · rôle : {u.role || "user"}</p>
                        </div>
                        <button className="hov-soft" style={{ ...(u.verified ? S.btnSecondary : S.btnNavy), ...S.btnSm, flexShrink: 0 }} onClick={() => toggleVerified(u.id, u.verified)}>{u.verified ? "Retirer vérification" : "Vérifier"}</button>
                      </div>
                    ))}

                    {adminTab === "reviews" && adminReviews.map((r, i) => (
                      <div key={r.id} style={{ ...S.adminRow, borderTop: i > 0 ? `1px solid ${C.line}` : "none" }} data-testid="admin-row">
                        <div style={S.adminRowText}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <strong style={{ color: C.navy }}>{r.reviewer_name}</strong> <Stars value={r.rating} />
                          </div>
                          {r.comment && <p style={S.meta}>{r.comment}</p>}
                        </div>
                        <button className="hov-soft" style={{ ...S.btnDanger, ...S.btnSm, flexShrink: 0 }} onClick={() => adminDeleteReview(r.id)}>Supprimer</button>
                      </div>
                    ))}

                    {((adminTab === "listings" && listings.length === 0) || (adminTab === "users" && adminUsers.length === 0) || (adminTab === "reviews" && adminReviews.length === 0)) && (
                      <p style={{ margin: 0, padding: 20, color: C.muted, textAlign: "center" }}>Rien à afficher.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* FOOTER (every page) */}
      <footer style={S.footer}>
        <div style={S.footerInner}>
          <div>
            <a href="#/" onClick={linkTo("home")} style={{ ...S.logo, fontSize: 20 }}>Immo<span style={S.logoSpan}>Congo</span></a>
            <p style={{ margin: "10px 0 0", maxWidth: 340, lineHeight: 1.55 }}>Maisons et appartements à louer à Fungurume, Kolwezi, Lubumbashi et environs.</p>
          </div>
          <div>
            <p style={S.footerTitle}>Contact WhatsApp</p>
            <a href={`https://wa.me/${CONTACT_WHATSAPP}`} target="_blank" rel="noreferrer" className="hov-soft" style={{ ...S.btnSecondary, color: C.green, border: "1px solid #bbf7d0" }}>
              <Icon name="whatsapp" size={20} />+264 816 032 560
            </a>
          </div>
          <div>
            <p style={S.footerTitle}>Liens</p>
            <button className="hov-link" style={S.footerLink} onClick={() => nav("listings")}>Toutes les annonces</button>
            <button className="hov-link" style={S.footerLink} onClick={() => currentUser ? startNewListing() : (setAuthMode("register"), nav("auth"))}>Publier une annonce</button>
          </div>
        </div>
        <div style={S.footerBottom}>
          <p style={{ margin: 0, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>© 2026 ImmoCongo – Fungurume, Katanga, RDC</p>
        </div>
      </footer>
    </div>
  );
}

function ListingCard({ listing, S, href, onOpen, isFav, onToggleFav, verified, footer }) {
  const photos = listingPhotos(listing);
  const mainPhoto = photos[0];
  const rooms = Number(listing.chambres) || 0;
  return (
    <article style={S.card} className="listing-card" data-testid="listing-card">
      <a href={href} onClick={onOpen} style={S.cardLink}>
        <div className="card-photo" style={S.cardPhoto}>
          {mainPhoto
            ? <img src={mainPhoto} alt={listing.titre} style={S.cardImg} loading="lazy" decoding="async" />
            : <div style={S.cardPlaceholder}><Icon name="home" size={44} strokeWidth={1.5} /></div>}
          <span style={S.statusPill}>
            <span style={{ ...S.dot, background: listing.disponible ? C.greenBright : "#ef4444" }} />
            {listing.disponible ? "Disponible" : "Occupée"}
          </span>
          {photos.length > 1 && (
            <span style={S.photoCount} data-testid="photo-count" aria-label={`${photos.length} photos`}>
              <Icon name="camera" size={14} />{photos.length}
            </span>
          )}
        </div>
        <div style={S.cardBody}>
          <p style={S.cardPrice}>{formatPrice(listing.prix)} <span style={S.priceUnit}>{listing.devise}/mois</span></p>
          <h3 style={S.cardTitle}>{listing.titre}</h3>
          <p style={S.cardMeta}>
            <Icon name="pin" size={16} />
            <span style={S.ellipsis}>{listing.ville}{listing.localisation ? ` · ${listing.localisation}` : ""}</span>
          </p>
          {(rooms > 0 || verified) && (
            <div style={S.cardFacts}>
              {rooms > 0 && <span style={S.fact}><Icon name="bed" size={17} />{rooms} chambre{rooms > 1 ? "s" : ""}</span>}
              {verified && <span style={S.verifiedSmall} data-testid="verified-badge"><Icon name="verified" size={16} />Vérifié</span>}
            </div>
          )}
        </div>
      </a>
      {onToggleFav && (
        <button
          onClick={onToggleFav}
          style={S.heartBtn}
          aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
          aria-pressed={isFav}
          data-testid="card-fav"
        >
          <Icon
            name="heart"
            size={28}
            strokeWidth={2}
            fill={isFav ? "#e11d48" : "rgba(10, 31, 71, 0.35)"}
            style={{ filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))" }}
          />
        </button>
      )}
      {footer}
    </article>
  );
}

function SkeletonCard({ S }) {
  return (
    <div style={S.card} aria-hidden="true">
      <div className="skeleton" style={S.skeletonPhoto} />
      <div className="skeleton" style={{ ...S.skeletonLine, width: "40%", height: 16, marginTop: 14 }} />
      <div className="skeleton" style={{ ...S.skeletonLine, width: "75%" }} />
      <div className="skeleton" style={{ ...S.skeletonLine, width: "55%" }} />
    </div>
  );
}

// Swipe from photo to photo on phones; arrows and thumbnails on computers.
function Gallery({ photos, title, active, onChange, isMobile, S }) {
  const trackRef = useRef(null);
  const count = photos.length;

  function goTo(i) {
    const track = trackRef.current;
    if (!track) return;
    const index = Math.max(0, Math.min(count - 1, i));
    track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });
    onChange(index);
  }

  function onScroll(e) {
    const track = e.currentTarget;
    const index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (index !== active && index >= 0 && index < count) onChange(index);
  }

  if (count === 0) {
    return (
      <div style={{ ...S.galleryWrap, ...S.gallerySlide }}>
        <div style={S.cardPlaceholder}><Icon name="home" size={72} strokeWidth={1.3} /></div>
      </div>
    );
  }

  return (
    <div data-testid="gallery">
      <div style={S.galleryWrap}>
        <div
          ref={trackRef}
          className="gallery-track"
          onScroll={onScroll}
          tabIndex={count > 1 ? 0 : undefined}
          role={count > 1 ? "region" : undefined}
          aria-label={count > 1 ? "Photos de l'annonce (glissez pour voir la suite)" : undefined}
          data-testid="gallery-track"
        >
          {photos.map((src, i) => (
            <div key={i} style={S.gallerySlide}>
              <img
                src={src}
                alt={count > 1 ? `${title} – photo ${i + 1} sur ${count}` : title}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={i === 0 ? "high" : undefined}
                style={S.galleryImg}
                data-testid="gallery-photo"
              />
            </div>
          ))}
        </div>
        {count > 1 && (
          <>
            <span style={S.galleryCounter} data-testid="gallery-counter">{active + 1} / {count}</span>
            {isMobile ? (
              <div style={S.dots} aria-hidden="true">
                {photos.map((_, i) => <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i === active ? "#fff" : "rgba(255, 255, 255, 0.55)" }} />)}
              </div>
            ) : (
              <>
                {active > 0 && <button type="button" className="hov-dim" aria-label="Photo précédente" onClick={() => goTo(active - 1)} style={{ ...S.galleryArrow, left: 16 }}><Icon name="chevronLeft" size={22} /></button>}
                {active < count - 1 && <button type="button" className="hov-dim" aria-label="Photo suivante" onClick={() => goTo(active + 1)} style={{ ...S.galleryArrow, right: 16 }}><Icon name="chevronRight" size={22} /></button>}
              </>
            )}
          </>
        )}
      </div>
      {count > 1 && !isMobile && (
        <div style={S.thumbs}>
          {photos.map((src, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Voir la photo ${i + 1}`}
              aria-current={i === active ? "true" : undefined}
              onClick={() => goTo(i)}
              data-testid="gallery-thumb"
              style={{ ...S.thumb, border: i === active ? `3px solid ${C.navy}` : "3px solid transparent", opacity: i === active ? 1 : 0.75 }}
            >
              <img src={src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, text, children }) {
  return (
    <div style={{ textAlign: "center", padding: "56px 16px", color: C.muted }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#e9edf3", color: C.navy, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <Icon name={icon} size={28} />
      </div>
      <p style={{ margin: children ? "0 0 20px" : 0, fontSize: 16, color: C.ink }}>{text}</p>
      {children}
    </div>
  );
}

function Stars({ value, size = 16 }) {
  const rounded = Math.round(value);
  return (
    <span style={{ display: "inline-flex", gap: 1, color: C.amber, verticalAlign: "middle" }} aria-label={`${rounded} sur 5`} role="img">
      {[1, 2, 3, 4, 5].map(n => <Icon key={n} name="star" size={size} strokeWidth={1.6} fill={n <= rounded ? C.amber : "none"} style={{ color: n <= rounded ? C.amber : "#c5cbd6" }} />)}
    </span>
  );
}

function InfoItem({ S, icon, label, value }) {
  return (
    <div style={S.infoItem}>
      <span style={S.infoIcon}><Icon name={icon} size={18} /></span>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, color: C.muted }}>{label}</p>
        <p style={{ margin: "1px 0 0", fontSize: 15, fontWeight: 700, color: C.ink }}>{value}</p>
      </div>
    </div>
  );
}
