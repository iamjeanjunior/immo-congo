import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const VILLES = ["Fungurume", "Kolwezi", "Lubumbashi", "Likasi", "Kipushi", "Autre"];
const PAGE_SIZE = 9;
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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState(null);
  const [images, setImages] = useState([]);
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
  const viewedRef = useRef(new Set());

  const isAdmin = profile?.role === "admin";

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
  }, [filterVille, filterDispo, search, priceMin, priceMax, sortBy]);

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

  // ---------- messages page ----------
  useEffect(() => {
    if (page === "messages" && currentUser) fetchConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, currentUser]);

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
      showToast("Statut mis à jour.");
    } catch {
      showToast("Action refusée (migration SQL / droits admin ?).", "error");
    }
  }

  async function adminDeleteReview(id) {
    if (!confirm("Supprimer cet avis ?")) return;
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

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function nav(p, id = null) {
    setPage(p);
    setSelectedId(id);
    setActivePhoto(0);
    setMenuOpen(false);
    window.history.pushState({ page: p, id }, "", routeHash(p, id));
    window.scrollTo(0, 0);
  }

  async function handleAuth(e) {
    e.preventDefault();
    setSubmitting(true);
    if (authMode === "register") {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { emailRedirectTo: window.location.origin }
      });
      if (error) { showToast(error.message, "error"); setSubmitting(false); return; }
      if (data.user) {
        await supabase.from("profiles").insert({ id: data.user.id, nom: form.nom, whatsapp: form.whatsapp, role: "user" });
        showToast(`Bienvenue, ${form.nom} !`);
        nav("home");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (error) { showToast("Email ou mot de passe incorrect.", "error"); setSubmitting(false); return; }
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

  async function handleImagesChange(e) {
    const files = Array.from(e.target.files);
    if (files.length + images.length > 6) { showToast("Maximum 6 photos.", "error"); return; }
    for (const file of files) {
      if (file.size > 3 * 1024 * 1024) { showToast(`${file.name} trop grande (max 3 Mo).`, "error"); continue; }
      const reader = new FileReader();
      reader.onload = ev => setImages(prev => [...prev, ev.target.result]);
      reader.readAsDataURL(file);
    }
  }

  function removeImage(index) {
    setImages(prev => prev.filter((_, i) => i !== index));
    if (activePhoto >= index && activePhoto > 0) setActivePhoto(activePhoto - 1);
  }

  async function handlePost(e) {
    e.preventDefault();
    if (!currentUser) { nav("auth"); return; }
    setSubmitting(true);
    const listing = {
      titre: postForm.titre,
      prix: parseFloat(postForm.prix),
      devise: postForm.devise,
      localisation: postForm.localisation,
      ville: postForm.ville,
      chambres: parseInt(postForm.chambres) || 0,
      description: postForm.description,
      whatsapp: postForm.whatsapp || profile?.whatsapp || "",
      disponible: postForm.disponible === "true",
      image_url: images[0] || null,
      images: JSON.stringify(images),
      owner_id: currentUser.id,
      owner_name: profile?.nom || "Propriétaire",
    };
    try {
      if (editId) {
        const { error } = await supabase.from("listings").update(listing).eq("id", editId);
        if (error) throw error;
        showToast("Annonce modifiée !");
        setEditId(null);
      } else {
        const { error } = await supabase.from("listings").insert(listing);
        if (error) throw error;
        showToast("Annonce publiée avec succès !");
      }
      await fetchListings();
      setPostForm(DEFAULT_POST_FORM);
      setImages([]);
      nav("listings");
    } catch {
      showToast(editId ? "Erreur lors de la modification." : "Erreur lors de la publication.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteListing(id) {
    if (!confirm("Supprimer cette annonce ?")) return;
    try {
      const { error } = await supabase.from("listings").delete().eq("id", id);
      if (error) throw error;
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
    try { setImages(JSON.parse(listing.images || "[]")); } catch { setImages(listing.image_url ? [listing.image_url] : []); }
    nav("post");
  }

  const filtered = listings.filter(l => {
    if (filterVille !== "Toutes" && l.ville !== filterVille) return false;
    if (filterDispo === "Disponible" && !l.disponible) return false;
    if (filterDispo === "Occupée" && l.disponible) return false;
    if (priceMin && Number(l.prix) < Number(priceMin)) return false;
    if (priceMax && Number(l.prix) > Number(priceMax)) return false;
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
  const detailPhotos = (() => { try { return JSON.parse(detail?.images || "[]"); } catch { return detail?.image_url ? [detail.image_url] : []; } })();
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const relatedListings = detail ? listings.filter(l => l.id !== detail.id && l.ville === detail.ville).slice(0, 3) : [];

  const S = {
    root: { fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", minHeight: "100vh", background: "#f7f6f2", color: "#1a1a1a" },
    nav: { background: "#0d2f6e", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, position: "sticky", top: 0, zIndex: 100 },
    logo: { color: "#fff", fontWeight: 700, fontSize: 18, cursor: "pointer" },
    logoSpan: { color: "#4ade80" },
    navBtn: { background: "none", border: "none", color: "#c7d9f7", fontSize: 14, cursor: "pointer", padding: "6px 10px", borderRadius: 6 },
    navBtnPrimary: { background: "#22c55e", border: "none", color: "#fff", fontSize: 14, cursor: "pointer", padding: "6px 14px", borderRadius: 6, fontWeight: 600 },
    hero: { background: "linear-gradient(135deg, #0d2f6e 0%, #1e4db7 60%, #0ea5e9 100%)", color: "#fff", padding: "clamp(48px, 10vw, 80px) 20px clamp(36px, 8vw, 60px)", textAlign: "center" },
    heroTitle: { fontSize: "clamp(26px, 6vw, 36px)", fontWeight: 800, margin: "0 0 12px", lineHeight: 1.15 },
    heroSub: { fontSize: "clamp(14px, 3vw, 17px)", opacity: 0.85, margin: "0 0 32px" },
    btnGreen: { background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, padding: "13px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer" },
    btnOutline: { background: "transparent", color: "#fff", border: "2px solid rgba(255,255,255,0.6)", borderRadius: 8, padding: "13px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer" },
    btnOutlineDark: { background: "#fff", color: "#0d2f6e", border: "2px solid #0d2f6e", borderRadius: 8, padding: "12px 26px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
    section: { maxWidth: 1100, margin: "0 auto", padding: "40px 20px" },
    sectionTitle: { fontSize: 22, fontWeight: 700, margin: "0 0 24px", color: "#0d2f6e" },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 },
    card: { background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", cursor: "pointer" },
    cardImg: { width: "100%", height: 190, objectFit: "cover", background: "#e2eaf7", display: "block" },
    cardImgPlaceholder: { width: "100%", height: 190, background: "linear-gradient(135deg, #c7d9f7, #e2eaf7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 },
    cardBody: { padding: 16 },
    cardTitle: { fontSize: 15, fontWeight: 700, margin: "0 0 6px", color: "#0d2f6e" },
    cardMeta: { fontSize: 13, color: "#555", margin: "3px 0" },
    badge: { display: "inline-block", padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600 },
    badgeGreen: { background: "#dcfce7", color: "#166534" },
    badgeRed: { background: "#fee2e2", color: "#991b1b" },
    price: { fontSize: 19, fontWeight: 800, color: "#0d2f6e", margin: "8px 0 0" },
    filterBar: { background: "#fff", padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" },
    select: { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, background: "#fff", cursor: "pointer" },
    input: { padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, width: "100%", boxSizing: "border-box", fontFamily: "inherit" },
    textarea: { padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, width: "100%", boxSizing: "border-box", minHeight: 100, fontFamily: "inherit", resize: "vertical" },
    formGroup: { marginBottom: 16 },
    label: { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 },
    formCard: { background: "#fff", borderRadius: 12, padding: 32, maxWidth: 520, margin: "0 auto", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" },
    submitBtn: { background: "#0d2f6e", color: "#fff", border: "none", borderRadius: 8, padding: "13px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%" },
    whatsappBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "#25D366", color: "#fff", border: "none", borderRadius: 10, padding: "14px 24px", fontSize: 16, fontWeight: 700, cursor: "pointer", width: "100%", marginTop: 20, textDecoration: "none" },
    toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,0.2)" },
    toastSuccess: { background: "#22c55e", color: "#fff" },
    toastError: { background: "#ef4444", color: "#fff" },
    emptyState: { textAlign: "center", padding: "60px 20px", color: "#6b7280" },
    backBtn: { background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 16px", fontSize: 14, cursor: "pointer", color: "#374151", marginBottom: 20 },
    row: { display: "flex", gap: 12 },
    dangerBtn: { background: "#fee2e2", color: "#991b1b", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
    editBtn: { background: "#e0f2fe", color: "#0369a1", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
    statsBar: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 32 },
    statCard: { background: "#fff", borderRadius: 10, padding: 16, textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
    statNum: { fontSize: 28, fontWeight: 800, color: "#0d2f6e" },
    statLabel: { fontSize: 12, color: "#6b7280", marginTop: 4 },
    spinner: { textAlign: "center", padding: "80px 20px", color: "#6b7280", fontSize: 16 },
    heartBtn: { position: "absolute", top: 10, right: 10, background: "rgba(255,255,255,0.92)", border: "none", borderRadius: "50%", width: 34, height: 34, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" },
    heartBtnActive: { color: "#ef4444" },
    photoCountBadge: { position: "absolute", bottom: 10, left: 10, background: "rgba(13,47,110,0.85)", color: "#fff", fontSize: 11, padding: "2px 8px", borderRadius: 10 },
    reviewCard: { padding: "12px 0", borderBottom: "1px solid #f0f0f0" },
    convRow: { background: "#fff", borderRadius: 10, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
    chatBox: { background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", maxWidth: 640, margin: "0 auto" },
    chatMessages: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto", padding: "4px 2px" },
    chatBubble: { maxWidth: "75%", padding: "10px 14px", borderRadius: 14, fontSize: 14, lineHeight: 1.4 },
    chatBubbleMine: { alignSelf: "flex-end", background: "#0d2f6e", color: "#fff", borderBottomRightRadius: 4 },
    chatBubbleTheirs: { alignSelf: "flex-start", background: "#f1f5f9", color: "#1a1a1a", borderBottomLeftRadius: 4 },
    adminTabBtn: { background: "#fff", border: "1px solid #d1d5db", color: "#374151", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
    adminTabActive: { background: "#0d2f6e", border: "1px solid #0d2f6e", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
    adminRow: { background: "#fff", borderRadius: 10, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", flexWrap: "wrap", gap: 10 },
    skeletonImg: { width: "100%", height: 190, background: "linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" },
    skeletonLine: { height: 12, background: "linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite", borderRadius: 4, margin: "8px 0" },
  };

  return (
    <div style={S.root}>
      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        button { transition: transform 0.12s ease, filter 0.12s ease; }
        button:active { transform: scale(0.97); }
        .listing-card { transition: transform 0.15s ease, box-shadow 0.15s ease; animation: fadeIn 0.3s ease; }
        .listing-card:hover { transform: translateY(-3px); box-shadow: 0 6px 16px rgba(13,47,110,0.12); }
        @media (max-width: 640px) {
          .burger-btn { display: block !important; }
          .nav-links {
            display: none;
            position: fixed;
            top: 60px;
            left: 0;
            right: 0;
            background: #0d2f6e;
            flex-direction: column !important;
            align-items: stretch !important;
            padding: 12px 20px 20px;
            gap: 6px !important;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
          }
          .nav-links.open { display: flex; }
          .nav-links button { text-align: left; width: 100%; }
        }
      `}</style>

      {/* NAV */}
      <nav style={S.nav}>
        <span style={S.logo} onClick={() => nav("home")}>Immo<span style={S.logoSpan}>Congo</span></span>
        <button
          className="burger-btn"
          aria-label="Ouvrir le menu"
          onClick={() => setMenuOpen(o => !o)}
          style={{ display: "none", background: "none", border: "none", color: "#fff", fontSize: 26, cursor: "pointer", lineHeight: 1, padding: "4px 6px" }}
        >
          {menuOpen ? "✕" : "☰"}
        </button>
        <div className={`nav-links${menuOpen ? " open" : ""}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button style={S.navBtn} onClick={() => nav("listings")}>Annonces</button>
          {currentUser && <button style={S.navBtn} onClick={() => nav("favorites")}>♥ Favoris</button>}
          {currentUser && <button style={S.navBtn} onClick={() => nav("messages")}>💬 Messages</button>}
          {isAdmin && <button style={S.navBtn} onClick={() => nav("admin")}>⚙️ Admin</button>}
          {currentUser ? (
            <>
              <button style={S.navBtn} onClick={() => nav("my-listings")}>Mes annonces</button>
              <button style={S.navBtnPrimary} onClick={() => { setEditId(null); setPostForm(DEFAULT_POST_FORM); setImages([]); nav("post"); }}>+ Publier</button>
              <button style={S.navBtn} onClick={logout}>Déconnexion</button>
            </>
          ) : (
            <>
              <button style={S.navBtn} onClick={() => { setAuthMode("login"); nav("auth"); }}>Connexion</button>
              <button style={S.navBtnPrimary} onClick={() => { setAuthMode("register"); nav("auth"); }}>Créer un compte</button>
            </>
          )}
        </div>
      </nav>

      {toast && <div style={{ ...S.toast, ...(toast.type === "error" ? S.toastError : S.toastSuccess) }}>{toast.msg}</div>}

      {/* HOME */}
      {page === "home" && (
        <>
          <div style={S.hero}>
            <p style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase", opacity: 0.7, margin: "0 0 12px" }}>🇨🇩 République Démocratique du Congo</p>
            <h1 style={S.heroTitle}>Trouvez votre maison<br />à Fungurume & environs</h1>
            <p style={S.heroSub}>La plateforme de location immobilière du Katanga</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button style={S.btnGreen} onClick={() => nav("listings")}>Voir les annonces</button>
              <button style={S.btnOutline} onClick={() => currentUser ? nav("post") : (setAuthMode("register"), nav("auth"))}>Publier ma maison</button>
            </div>
          </div>
          <div style={S.section}>
            <div style={S.statsBar}>
              <div style={S.statCard}><div style={S.statNum}>{listings.length}</div><div style={S.statLabel}>Annonces publiées</div></div>
              <div style={S.statCard}><div style={S.statNum}>{listings.filter(l => l.disponible).length}</div><div style={S.statLabel}>Disponibles</div></div>
              <div style={S.statCard}><div style={S.statNum}>{[...new Set(listings.map(l => l.ville))].length}</div><div style={S.statLabel}>Villes couvertes</div></div>
            </div>
            <h2 style={S.sectionTitle}>Annonces récentes</h2>
            {loading ? (
              <div style={S.grid}>{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} S={S} />)}</div>
            ) : (
              <div style={S.grid}>{listings.slice(0, 3).map(l => <ListingCard key={l.id} listing={l} onClick={() => nav("detail", l.id)} S={S} isFav={favorites.has(l.id)} onToggleFav={() => toggleFavorite(l.id)} />)}</div>
            )}
            <div style={{ textAlign: "center", marginTop: 32 }}>
              <button style={S.btnGreen} onClick={() => nav("listings")}>Voir toutes les annonces →</button>
            </div>
          </div>
          <footer style={{ background: "#0d2f6e", color: "#c7d9f7", padding: "40px 20px", textAlign: "center" }}>
            <p style={{ margin: "0 0 8px", fontSize: 14, opacity: 0.7 }}>📞 Contact WhatsApp</p>
            <a href="https://wa.me/264816032560" target="_blank" rel="noreferrer" style={{ color: "#4ade80", fontSize: 20, fontWeight: 700, textDecoration: "none" }}>+264 816 032 560</a>
            <p style={{ margin: "16px 0 0", fontSize: 12, opacity: 0.5 }}>© 2026 ImmoCongo – Fungurume, Katanga, DRC</p>
          </footer>
        </>
      )}

      {/* LISTINGS */}
      {page === "listings" && (
        <>
          <div style={S.filterBar}>
            <span style={{ fontWeight: 700, fontSize: 15, color: "#0d2f6e" }}>🔍 Filtres</span>
            <input
              style={{ ...S.select, flex: "1 1 180px", minWidth: 140, cursor: "text" }}
              type="text"
              placeholder="Rechercher (titre, lieu...)"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select style={S.select} value={filterVille} onChange={e => setFilterVille(e.target.value)}>
              <option value="Toutes">Toutes les villes</option>
              {VILLES.map(v => <option key={v}>{v}</option>)}
            </select>
            <select style={S.select} value={filterDispo} onChange={e => setFilterDispo(e.target.value)}>
              <option value="Toutes">Tout statut</option>
              <option value="Disponible">Disponible</option>
              <option value="Occupée">Occupée</option>
            </select>
            <select style={S.select} value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="recent">Plus récentes</option>
              <option value="price_asc">Prix croissant</option>
              <option value="price_desc">Prix décroissant</option>
            </select>
            <input style={{ ...S.select, width: 90, cursor: "text" }} type="number" placeholder="Prix min" value={priceMin} onChange={e => setPriceMin(e.target.value)} />
            <input style={{ ...S.select, width: 90, cursor: "text" }} type="number" placeholder="Prix max" value={priceMax} onChange={e => setPriceMax(e.target.value)} />
            <span style={{ fontSize: 13, color: "#6b7280", marginLeft: "auto" }}>{sorted.length} annonce{sorted.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={S.section}>
            {loading ? (
              <div style={S.grid}>{Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} S={S} />)}</div>
            ) : sorted.length === 0 ? (
              <div style={S.emptyState}><p style={{ fontSize: 40 }}>🏠</p><p>Aucune annonce ne correspond à vos critères.</p></div>
            ) : (
              <>
                <div style={S.grid}>{visible.map(l => <ListingCard key={l.id} listing={l} onClick={() => nav("detail", l.id)} S={S} isFav={favorites.has(l.id)} onToggleFav={() => toggleFavorite(l.id)} />)}</div>
                {visibleCount < sorted.length && (
                  <div style={{ textAlign: "center", marginTop: 28 }}>
                    <button style={S.btnOutlineDark} onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>Charger plus ({sorted.length - visibleCount} restantes)</button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* DETAIL */}
      {page === "detail" && detail && (
        <div style={S.section}>
          <button style={S.backBtn} onClick={() => nav("listings")}>← Retour aux annonces</button>

          {detailPhotos.length > 0 ? (
            <div>
              <img src={detailPhotos[activePhoto]} alt={detail.titre} style={{ width: "100%", maxHeight: 420, objectFit: "cover", borderRadius: 12 }} loading="lazy" />
              {detailPhotos.length > 1 && (
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {detailPhotos.map((img, i) => (
                    <img key={i} src={img} alt="" loading="lazy" onClick={() => setActivePhoto(i)}
                      style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 6, cursor: "pointer", border: i === activePhoto ? "3px solid #0d2f6e" : "3px solid transparent", opacity: i === activePhoto ? 1 : 0.7 }} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ width: "100%", height: 280, background: "linear-gradient(135deg, #c7d9f7, #e2eaf7)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 80 }}>🏠</div>
          )}

          <div style={{ background: "#fff", borderRadius: 12, padding: 28, marginTop: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 800, color: "#0d2f6e" }}>{detail.titre}</h1>
                <p style={{ margin: 0, color: "#555", fontSize: 15 }}>📍 {detail.localisation}</p>
                {avgRating > 0 && (
                  <p style={{ margin: "6px 0 0", fontSize: 14 }}>
                    <Stars value={avgRating} /> <span style={{ color: "#6b7280" }}>({reviews.length} avis)</span>
                  </p>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={S.price}>{Number(detail.prix).toLocaleString()} <span style={{ fontSize: 13, fontWeight: 400, color: "#6b7280" }}>{detail.devise}/mois</span></div>
                <span style={{ ...S.badge, ...(detail.disponible ? S.badgeGreen : S.badgeRed) }}>{detail.disponible ? "✅ Disponible" : "🔴 Occupée"}</span>
              </div>
            </div>
            <hr style={{ margin: "20px 0", border: "none", borderTop: "1px solid #e5e7eb" }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 20 }}>
              <InfoPill icon="🏙️" label="Ville" value={detail.ville} />
              {detail.chambres > 0 && <InfoPill icon="🛏️" label="Chambres" value={detail.chambres} />}
              <InfoPill icon="👤" label="Propriétaire" value={`${detail.owner_name || "Privé"}${ownerProfile?.verified ? " ✔️" : ""}`} />
              <InfoPill icon="📅" label="Publié le" value={detail.created_at?.slice(0, 10)} />
              {detailPhotos.length > 0 && <InfoPill icon="📷" label="Photos" value={detailPhotos.length} />}
              <InfoPill icon="👁️" label="Vues" value={detail.views || 0} />
            </div>
            <h3 style={{ fontWeight: 700, color: "#374151", margin: "0 0 8px" }}>Description</h3>
            <p style={{ color: "#555", lineHeight: 1.7, margin: "0 0 20px" }}>{detail.description}</p>

            {canEdit && (
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <button style={S.editBtn} onClick={() => startEdit(detail)}>✏️ Modifier</button>
                <button style={S.dangerBtn} onClick={() => deleteListing(detail.id)}>🗑️ Supprimer</button>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <button
                onClick={() => toggleFavorite(detail.id)}
                style={{ ...S.editBtn, background: favorites.has(detail.id) ? "#fee2e2" : "#e0f2fe", color: favorites.has(detail.id) ? "#991b1b" : "#0369a1" }}
              >
                {favorites.has(detail.id) ? "♥ Retirer des favoris" : "♡ Ajouter aux favoris"}
              </button>
              <button style={S.editBtn} onClick={() => shareListing(detail)}>🔗 Partager</button>
              {currentUser && !canEdit && (
                <button style={S.editBtn} onClick={() => startConversation(detail)}>💬 Message au propriétaire</button>
              )}
            </div>

            <a href={`https://wa.me/${(detail.whatsapp || "264816032560").replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" style={S.whatsappBtn}>
              💬 Contacter sur WhatsApp
            </a>

            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontWeight: 700, color: "#374151", margin: "0 0 8px" }}>📍 Localisation</h3>
              <iframe
                title="Carte"
                src={`https://www.google.com/maps?q=${encodeURIComponent(`${detail.localisation}, ${detail.ville}, RDC`)}&output=embed`}
                style={{ width: "100%", height: 260, border: 0, borderRadius: 12 }}
                loading="lazy"
              />
            </div>
          </div>

          {/* AVIS */}
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, marginTop: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <h3 style={{ fontWeight: 700, color: "#0d2f6e", margin: "0 0 16px", fontSize: 18 }}>⭐ Avis {reviews.length > 0 && `(${reviews.length})`}</h3>
            {reviews.length === 0 && <p style={{ color: "#6b7280", fontSize: 14 }}>Aucun avis pour le moment.</p>}
            {reviews.map(r => (
              <div key={r.id} style={S.reviewCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 14, color: "#374151" }}>{r.reviewer_name}</strong>
                  <Stars value={r.rating} />
                </div>
                {r.comment && <p style={{ margin: "6px 0 0", fontSize: 14, color: "#555" }}>{r.comment}</p>}
              </div>
            ))}
            {currentUser ? (
              <form onSubmit={submitReview} style={{ marginTop: 16, borderTop: "1px solid #e5e7eb", paddingTop: 16 }}>
                <label style={S.label}>Votre note</label>
                <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <span key={n} onClick={() => setReviewForm(f => ({ ...f, rating: n }))} style={{ cursor: "pointer", fontSize: 22, color: n <= reviewForm.rating ? "#f59e0b" : "#d1d5db" }}>★</span>
                  ))}
                </div>
                <textarea style={S.textarea} placeholder="Votre commentaire (optionnel)" value={reviewForm.comment} onChange={e => setReviewForm(f => ({ ...f, comment: e.target.value }))} />
                <button type="submit" disabled={reviewSubmitting} style={{ ...S.editBtn, marginTop: 10 }}>{reviewSubmitting ? "Envoi..." : "Publier mon avis"}</button>
              </form>
            ) : (
              <p style={{ fontSize: 14, color: "#6b7280", marginTop: 12 }}>
                <span style={{ color: "#0d2f6e", cursor: "pointer", fontWeight: 600 }} onClick={() => nav("auth")}>Connectez-vous</span> pour laisser un avis.
              </p>
            )}
          </div>

          {relatedListings.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <h3 style={{ fontWeight: 700, color: "#0d2f6e", margin: "0 0 16px", fontSize: 18 }}>Annonces similaires à {detail.ville}</h3>
              <div style={S.grid}>
                {relatedListings.map(l => <ListingCard key={l.id} listing={l} onClick={() => nav("detail", l.id)} S={S} isFav={favorites.has(l.id)} onToggleFav={() => toggleFavorite(l.id)} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {page === "detail" && !detail && !loading && (
        <div style={S.section}>
          <div style={S.emptyState}>
            <p style={{ fontSize: 40 }}>❓</p>
            <p>Annonce introuvable ou supprimée.</p>
            <button style={S.btnGreen} onClick={() => nav("listings")}>Voir les annonces</button>
          </div>
        </div>
      )}

      {/* AUTH */}
      {page === "auth" && (
        <div style={S.section}>
          <div style={S.formCard}>
            <h2 style={{ textAlign: "center", color: "#0d2f6e", margin: "0 0 4px" }}>{authMode === "login" ? "Connexion" : "Créer un compte"}</h2>
            <p style={{ textAlign: "center", color: "#6b7280", fontSize: 14, margin: "0 0 28px" }}>{authMode === "login" ? "Accédez à votre espace" : "Publiez vos annonces gratuitement"}</p>
            <form onSubmit={handleAuth}>
              {authMode === "register" && (
                <div style={S.formGroup}>
                  <label style={S.label}>Nom complet *</label>
                  <input style={S.input} placeholder="Jean Dupont" value={form.nom || ""} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} required />
                </div>
              )}
              <div style={S.formGroup}>
                <label style={S.label}>Email *</label>
                <input style={S.input} type="email" placeholder="votre@email.com" value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div style={S.formGroup}>
                <label style={S.label}>Mot de passe *</label>
                <input style={S.input} type="password" placeholder="••••••••" value={form.password || ""} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
              </div>
              {authMode === "register" && (
                <div style={S.formGroup}>
                  <label style={S.label}>Numéro WhatsApp *</label>
                  <input style={S.input} placeholder="+243 XXX XXX XXX" value={form.whatsapp || ""} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} required />
                </div>
              )}
              <button type="submit" style={{ ...S.submitBtn, opacity: submitting ? 0.7 : 1 }} disabled={submitting}>
                {submitting ? "En cours..." : authMode === "login" ? "Se connecter" : "Créer mon compte"}
              </button>
            </form>
            <p style={{ textAlign: "center", fontSize: 14, marginTop: 20, color: "#6b7280" }}>
              {authMode === "login" ? "Pas encore de compte ? " : "Déjà un compte ? "}
              <span style={{ color: "#0d2f6e", cursor: "pointer", fontWeight: 600 }} onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
                {authMode === "login" ? "S'inscrire" : "Se connecter"}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* POST */}
      {page === "post" && (
        <div style={S.section}>
          {!currentUser ? (
            <div style={S.emptyState}>
              <p style={{ fontSize: 40 }}>🔒</p>
              <p>Vous devez être connecté pour publier.</p>
              <button style={S.btnGreen} onClick={() => nav("auth")}>Se connecter</button>
            </div>
          ) : (
            <div style={{ maxWidth: 620, margin: "0 auto" }}>
              <h2 style={{ ...S.sectionTitle, marginBottom: 24 }}>{editId ? "✏️ Modifier l'annonce" : "📢 Publier une annonce"}</h2>
              <div style={{ background: "#fff", borderRadius: 12, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                <form onSubmit={handlePost}>
                  <div style={S.formGroup}>
                    <label style={S.label}>Titre *</label>
                    <input style={S.input} placeholder="Ex: Maison 3 chambres – Gécamines" value={postForm.titre} onChange={e => setPostForm(f => ({ ...f, titre: e.target.value }))} required />
                  </div>
                  <div style={{ ...S.row, marginBottom: 16 }}>
                    <div style={{ flex: 2 }}>
                      <label style={S.label}>Prix *</label>
                      <input style={S.input} type="number" placeholder="800" value={postForm.prix} onChange={e => setPostForm(f => ({ ...f, prix: e.target.value }))} required />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={S.label}>Devise</label>
                      <select style={{ ...S.select, width: "100%" }} value={postForm.devise} onChange={e => setPostForm(f => ({ ...f, devise: e.target.value }))}>
                        <option>USD</option><option>CDF</option><option>ZAR</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ ...S.row, marginBottom: 16 }}>
                    <div style={{ flex: 1 }}>
                      <label style={S.label}>Ville *</label>
                      <select style={{ ...S.select, width: "100%" }} value={postForm.ville} onChange={e => setPostForm(f => ({ ...f, ville: e.target.value }))}>
                        {VILLES.map(v => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={S.label}>Chambres</label>
                      <input style={S.input} type="number" placeholder="3" min="0" value={postForm.chambres} onChange={e => setPostForm(f => ({ ...f, chambres: e.target.value }))} />
                    </div>
                  </div>
                  <div style={S.formGroup}>
                    <label style={S.label}>Localisation précise *</label>
                    <input style={S.input} placeholder="Ex: Quartier Gécamines, rue 12" value={postForm.localisation} onChange={e => setPostForm(f => ({ ...f, localisation: e.target.value }))} required />
                  </div>
                  <div style={S.formGroup}>
                    <label style={S.label}>Description *</label>
                    <textarea style={S.textarea} placeholder="Décrivez la maison..." value={postForm.description} onChange={e => setPostForm(f => ({ ...f, description: e.target.value }))} required />
                  </div>
                  <div style={S.formGroup}>
                    <label style={S.label}>WhatsApp de contact</label>
                    <input style={S.input} placeholder={profile?.whatsapp || "+243 XXX XXX XXX"} value={postForm.whatsapp} onChange={e => setPostForm(f => ({ ...f, whatsapp: e.target.value }))} />
                  </div>

                  <div style={S.formGroup}>
                    <label style={S.label}>Photos de la maison (max 6)</label>
                    <input type="file" accept="image/*" multiple onChange={handleImagesChange} style={{ fontSize: 14 }} />
                    {images.length > 0 && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                        {images.map((img, i) => (
                          <div key={i} style={{ position: "relative" }}>
                            <img src={img} alt="" style={{ width: 90, height: 70, objectFit: "cover", borderRadius: 6 }} />
                            {i === 0 && <span style={{ position: "absolute", top: 2, left: 2, background: "#0d2f6e", color: "#fff", fontSize: 10, padding: "1px 5px", borderRadius: 4 }}>principale</span>}
                            <button type="button" onClick={() => removeImage(i)}
                              style={{ position: "absolute", top: 2, right: 2, background: "#ef4444", color: "#fff", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p style={{ fontSize: 12, color: "#6b7280", margin: "6px 0 0" }}>La première photo sera la photo principale. Max 3 Mo par photo.</p>
                  </div>

                  <div style={S.formGroup}>
                    <label style={S.label}>Statut</label>
                    <select style={{ ...S.select, width: "100%" }} value={postForm.disponible} onChange={e => setPostForm(f => ({ ...f, disponible: e.target.value }))}>
                      <option value="true">✅ Disponible</option>
                      <option value="false">🔴 Occupée</option>
                    </select>
                  </div>
                  <button type="submit" style={{ ...S.submitBtn, opacity: submitting ? 0.7 : 1 }} disabled={submitting}>
                    {submitting ? "En cours..." : editId ? "Enregistrer" : "Publier l'annonce"}
                  </button>
                  {editId && <button type="button" style={{ ...S.backBtn, width: "100%", marginTop: 10, textAlign: "center" }} onClick={() => { setEditId(null); nav("my-listings"); }}>Annuler</button>}
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MY LISTINGS */}
      {page === "my-listings" && (
        <div style={S.section}>
          <h2 style={S.sectionTitle}>Mes annonces</h2>
          {myListings.length === 0
            ? <div style={S.emptyState}><p style={{ fontSize: 40 }}>📋</p><p>Vous n'avez pas encore d'annonces.</p><button style={S.btnGreen} onClick={() => nav("post")}>Publier ma première annonce</button></div>
            : <div style={S.grid}>{myListings.map(l => (
              <div key={l.id} style={{ ...S.card, cursor: "default" }}>
                <ListingCard listing={l} onClick={() => nav("detail", l.id)} S={S} isFav={favorites.has(l.id)} onToggleFav={() => toggleFavorite(l.id)} />
                <div style={{ display: "flex", gap: 8, padding: "0 16px 16px" }}>
                  <button style={S.editBtn} onClick={() => startEdit(l)}>✏️ Modifier</button>
                  <button style={S.dangerBtn} onClick={() => deleteListing(l.id)}>🗑️ Supprimer</button>
                </div>
              </div>
            ))}</div>
          }
        </div>
      )}

      {/* FAVORITES */}
      {page === "favorites" && (
        <div style={S.section}>
          <h2 style={S.sectionTitle}>♥ Mes favoris</h2>
          {!currentUser ? (
            <div style={S.emptyState}><p style={{ fontSize: 40 }}>🔒</p><p>Connectez-vous pour voir vos favoris.</p><button style={S.btnGreen} onClick={() => nav("auth")}>Se connecter</button></div>
          ) : favoriteListings.length === 0 ? (
            <div style={S.emptyState}><p style={{ fontSize: 40 }}>♡</p><p>Aucun favori pour le moment.</p><button style={S.btnGreen} onClick={() => nav("listings")}>Parcourir les annonces</button></div>
          ) : (
            <div style={S.grid}>{favoriteListings.map(l => <ListingCard key={l.id} listing={l} onClick={() => nav("detail", l.id)} S={S} isFav={true} onToggleFav={() => toggleFavorite(l.id)} />)}</div>
          )}
        </div>
      )}

      {/* MESSAGES */}
      {page === "messages" && (
        <div style={S.section}>
          <h2 style={S.sectionTitle}>💬 Messages</h2>
          {!currentUser ? (
            <div style={S.emptyState}><p style={{ fontSize: 40 }}>🔒</p><p>Connectez-vous pour voir vos messages.</p><button style={S.btnGreen} onClick={() => nav("auth")}>Se connecter</button></div>
          ) : conversations.length === 0 ? (
            <div style={S.emptyState}><p style={{ fontSize: 40 }}>💬</p><p>Aucune conversation pour le moment.</p></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {conversations.map(c => {
                const otherName = c.buyer_id === currentUser.id ? c.owner_name : c.buyer_name;
                return (
                  <div key={c.id} onClick={() => nav("chat", c.id)} style={S.convRow}>
                    <div>
                      <strong style={{ color: "#0d2f6e" }}>{otherName}</strong>
                      <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>À propos de : {c.listing_title}</p>
                    </div>
                    <span style={{ fontSize: 20 }}>›</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CHAT */}
      {page === "chat" && (
        <div style={S.section}>
          <button style={S.backBtn} onClick={() => nav("messages")}>← Retour aux messages</button>
          {!currentUser ? (
            <div style={S.emptyState}><p>Connectez-vous pour accéder à vos messages.</p></div>
          ) : (
            <div style={S.chatBox}>
              <div style={S.chatMessages}>
                {messages.length === 0 && <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 14 }}>Aucun message. Dites bonjour 👋</p>}
                {messages.map(m => (
                  <div key={m.id} style={{ ...S.chatBubble, ...(m.sender_id === currentUser.id ? S.chatBubbleMine : S.chatBubbleTheirs) }}>
                    {m.content}
                  </div>
                ))}
              </div>
              <form onSubmit={sendMessage} style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <input style={{ ...S.input, flex: 1 }} placeholder="Écrire un message..." value={messageInput} onChange={e => setMessageInput(e.target.value)} />
                <button type="submit" style={{ ...S.btnGreen, padding: "10px 18px" }}>Envoyer</button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ADMIN */}
      {page === "admin" && (
        !isAdmin ? (
          <div style={S.section}><div style={S.emptyState}><p style={{ fontSize: 40 }}>🔒</p><p>Accès réservé aux administrateurs.</p></div></div>
        ) : (
          <div style={S.section}>
            <h2 style={S.sectionTitle}>⚙️ Panneau d'administration</h2>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              <button style={adminTab === "listings" ? S.adminTabActive : S.adminTabBtn} onClick={() => setAdminTab("listings")}>Annonces ({listings.length})</button>
              <button style={adminTab === "users" ? S.adminTabActive : S.adminTabBtn} onClick={() => setAdminTab("users")}>Utilisateurs ({adminUsers.length})</button>
              <button style={adminTab === "reviews" ? S.adminTabActive : S.adminTabBtn} onClick={() => setAdminTab("reviews")}>Avis ({adminReviews.length})</button>
            </div>

            {adminTab === "listings" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {listings.map(l => (
                  <div key={l.id} style={S.adminRow}>
                    <div>
                      <strong style={{ color: "#0d2f6e" }}>{l.titre}</strong>
                      <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6b7280" }}>{l.ville} · {l.owner_name} · {l.views || 0} vues</p>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={S.editBtn} onClick={() => nav("detail", l.id)}>Voir</button>
                      <button style={S.dangerBtn} onClick={() => deleteListing(l.id)}>Supprimer</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {adminTab === "users" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {adminUsers.map(u => (
                  <div key={u.id} style={S.adminRow}>
                    <div>
                      <strong style={{ color: "#0d2f6e" }}>{u.nom}</strong> {u.verified && <span style={{ color: "#0ea5e9" }}>✔️ Vérifié</span>}
                      <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6b7280" }}>{u.whatsapp} · rôle : {u.role || "user"}</p>
                    </div>
                    <button style={S.editBtn} onClick={() => toggleVerified(u.id, u.verified)}>{u.verified ? "Retirer vérification" : "Vérifier"}</button>
                  </div>
                ))}
              </div>
            )}

            {adminTab === "reviews" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {adminReviews.map(r => (
                  <div key={r.id} style={S.adminRow}>
                    <div>
                      <strong style={{ color: "#0d2f6e" }}>{r.reviewer_name}</strong> <Stars value={r.rating} />
                      {r.comment && <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6b7280" }}>{r.comment}</p>}
                    </div>
                    <button style={S.dangerBtn} onClick={() => adminDeleteReview(r.id)}>Supprimer</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

function ListingCard({ listing, onClick, S, isFav, onToggleFav }) {
  const photos = (() => { try { return JSON.parse(listing.images || "[]"); } catch { return listing.image_url ? [listing.image_url] : []; } })();
  const mainPhoto = photos[0] || listing.image_url;
  return (
    <div style={S.card} className="listing-card">
      <div style={{ position: "relative" }} onClick={onClick}>
        {mainPhoto ? <img src={mainPhoto} alt={listing.titre} style={S.cardImg} loading="lazy" /> : <div style={S.cardImgPlaceholder}>🏠</div>}
        {photos.length > 1 && <div style={S.photoCountBadge}>📷 {photos.length}</div>}
        {onToggleFav && (
          <button
            onClick={e => { e.stopPropagation(); onToggleFav(); }}
            style={{ ...S.heartBtn, ...(isFav ? S.heartBtnActive : {}) }}
            aria-label="Ajouter aux favoris"
          >
            {isFav ? "♥" : "♡"}
          </button>
        )}
      </div>
      <div style={S.cardBody} onClick={onClick}>
        <h3 style={S.cardTitle}>{listing.titre}</h3>
        <p style={S.cardMeta}>📍 {listing.ville}</p>
        {listing.chambres > 0 && <p style={S.cardMeta}>🛏️ {listing.chambres} chambre{listing.chambres > 1 ? "s" : ""}</p>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
          <span style={S.price}>{Number(listing.prix).toLocaleString()} <span style={{ fontSize: 12, fontWeight: 400, color: "#6b7280" }}>{listing.devise}/mois</span></span>
          <span style={{ ...S.badge, ...(listing.disponible ? S.badgeGreen : S.badgeRed) }}>{listing.disponible ? "Disponible" : "Occupée"}</span>
        </div>
      </div>
    </div>
  );
}

function SkeletonCard({ S }) {
  return (
    <div style={S.card}>
      <div style={S.skeletonImg} />
      <div style={{ padding: 16 }}>
        <div style={{ ...S.skeletonLine, width: "70%" }} />
        <div style={{ ...S.skeletonLine, width: "40%" }} />
        <div style={{ ...S.skeletonLine, width: "50%" }} />
      </div>
    </div>
  );
}

function Stars({ value }) {
  const rounded = Math.round(value);
  return (
    <span style={{ color: "#f59e0b", fontSize: 14 }}>
      {"★".repeat(rounded)}{"☆".repeat(Math.max(0, 5 - rounded))}
    </span>
  );
}

function InfoPill({ icon, label, value }) {
  return (
    <div style={{ background: "#f7f6f2", borderRadius: 8, padding: "10px 14px" }}>
      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>{icon} {label}</p>
      <p style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{value}</p>
    </div>
  );
}
