import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const VILLES = ["Fungurume", "Kolwezi", "Lubumbashi", "Likasi", "Kipushi", "Autre"];

export default function App() {
  const [page, setPage] = useState("home");
  const [selectedId, setSelectedId] = useState(null);
  const [listings, setListings] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [form, setForm] = useState({});
  const [toast, setToast] = useState(null);
  const [filterVille, setFilterVille] = useState("Toutes");
  const [filterDispo, setFilterDispo] = useState("Toutes");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState(null);
  const [images, setImages] = useState([]); // array of base64
  const [activePhoto, setActivePhoto] = useState(0);
  const [postForm, setPostForm] = useState({
    titre: "", prix: "", devise: "USD", localisation: "", ville: "Fungurume",
    chambres: "", description: "", whatsapp: "", disponible: "true",
  });

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
  }, []);

  async function fetchListings() {
    setLoading(true);
    const { data } = await supabase.from("listings").select("*").order("created_at", { ascending: false });
    setListings(data || []);
    setLoading(false);
  }

  async function fetchProfile(userId) {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    setProfile(data);
  }

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function nav(p, id = null) {
    setPage(p);
    setSelectedId(id);
    setActivePhoto(0);
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
    if (editId) {
      const { error } = await supabase.from("listings").update(listing).eq("id", editId);
      if (error) { showToast("Erreur lors de la modification.", "error"); setSubmitting(false); return; }
      showToast("Annonce modifiée !");
      setEditId(null);
    } else {
      const { error } = await supabase.from("listings").insert(listing);
      if (error) { showToast("Erreur lors de la publication.", "error"); setSubmitting(false); return; }
      showToast("Annonce publiée avec succès !");
    }
    await fetchListings();
    setPostForm({ titre:"",prix:"",devise:"USD",localisation:"",ville:"Fungurume",chambres:"",description:"",whatsapp:"",disponible:"true" });
    setImages([]);
    setSubmitting(false);
    nav("listings");
  }

  async function deleteListing(id) {
    if (!confirm("Supprimer cette annonce ?")) return;
    await supabase.from("listings").delete().eq("id", id);
    await fetchListings();
    showToast("Annonce supprimée.");
    if (page === "detail") nav("listings");
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
    return true;
  });

  const myListings = listings.filter(l => currentUser && l.owner_id === currentUser.id);
  const detail = listings.find(l => l.id === selectedId);
  const canEdit = detail && currentUser && (detail.owner_id === currentUser.id || profile?.role === "admin");
  const detailPhotos = (() => { try { return JSON.parse(detail?.images || "[]"); } catch { return detail?.image_url ? [detail.image_url] : []; } })();

  const S = {
    root: { fontFamily: "'Segoe UI', system-ui, sans-serif", minHeight: "100vh", background: "#f7f6f2", color: "#1a1a1a" },
    nav: { background: "#0d2f6e", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, position: "sticky", top: 0, zIndex: 100 },
    logo: { color: "#fff", fontWeight: 700, fontSize: 18, cursor: "pointer" },
    logoSpan: { color: "#4ade80" },
    navBtn: { background: "none", border: "none", color: "#c7d9f7", fontSize: 14, cursor: "pointer", padding: "6px 10px", borderRadius: 6 },
    navBtnPrimary: { background: "#22c55e", border: "none", color: "#fff", fontSize: 14, cursor: "pointer", padding: "6px 14px", borderRadius: 6, fontWeight: 600 },
    hero: { background: "linear-gradient(135deg, #0d2f6e 0%, #1e4db7 60%, #0ea5e9 100%)", color: "#fff", padding: "80px 20px 60px", textAlign: "center" },
    heroTitle: { fontSize: 36, fontWeight: 800, margin: "0 0 12px", lineHeight: 1.15 },
    heroSub: { fontSize: 17, opacity: 0.85, margin: "0 0 32px" },
    btnGreen: { background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, padding: "13px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer" },
    btnOutline: { background: "transparent", color: "#fff", border: "2px solid rgba(255,255,255,0.6)", borderRadius: 8, padding: "13px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer" },
    section: { maxWidth: 1100, margin: "0 auto", padding: "40px 20px" },
    sectionTitle: { fontSize: 22, fontWeight: 700, margin: "0 0 24px", color: "#0d2f6e" },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 },
    card: { background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", cursor: "pointer" },
    cardImg: { width: "100%", height: 190, objectFit: "cover", background: "#e2eaf7" },
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
  };

  return (
    <div style={S.root}>
      {/* NAV */}
      <nav style={S.nav}>
        <span style={S.logo} onClick={() => nav("home")}>Immo<span style={S.logoSpan}>Congo</span></span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button style={S.navBtn} onClick={() => nav("listings")}>Annonces</button>
          {currentUser ? (
            <>
              <button style={S.navBtn} onClick={() => nav("my-listings")}>Mes annonces</button>
              <button style={S.navBtnPrimary} onClick={() => { setEditId(null); setPostForm({ titre:"",prix:"",devise:"USD",localisation:"",ville:"Fungurume",chambres:"",description:"",whatsapp:"",disponible:"true" }); setImages([]); nav("post"); }}>+ Publier</button>
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
            {loading ? <div style={S.spinner}>Chargement...</div> : (
              <div style={S.grid}>{listings.slice(0, 3).map(l => <ListingCard key={l.id} listing={l} onClick={() => nav("detail", l.id)} S={S} />)}</div>
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
            <select style={S.select} value={filterVille} onChange={e => setFilterVille(e.target.value)}>
              <option value="Toutes">Toutes les villes</option>
              {VILLES.map(v => <option key={v}>{v}</option>)}
            </select>
            <select style={S.select} value={filterDispo} onChange={e => setFilterDispo(e.target.value)}>
              <option value="Toutes">Tout statut</option>
              <option value="Disponible">Disponible</option>
              <option value="Occupée">Occupée</option>
            </select>
            <span style={{ fontSize: 13, color: "#6b7280", marginLeft: "auto" }}>{filtered.length} annonce{filtered.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={S.section}>
            {loading ? <div style={S.spinner}>Chargement...</div> : filtered.length === 0
              ? <div style={S.emptyState}><p style={{ fontSize: 40 }}>🏠</p><p>Aucune annonce pour le moment.</p></div>
              : <div style={S.grid}>{filtered.map(l => <ListingCard key={l.id} listing={l} onClick={() => nav("detail", l.id)} S={S} />)}</div>
            }
          </div>
        </>
      )}

      {/* DETAIL */}
      {page === "detail" && detail && (
        <div style={S.section}>
          <button style={S.backBtn} onClick={() => nav("listings")}>← Retour aux annonces</button>

          {/* GALERIE PHOTOS */}
          {detailPhotos.length > 0 ? (
            <div>
              <img src={detailPhotos[activePhoto]} alt={detail.titre} style={{ width: "100%", maxHeight: 420, objectFit: "cover", borderRadius: 12 }} />
              {detailPhotos.length > 1 && (
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {detailPhotos.map((img, i) => (
                    <img key={i} src={img} alt="" onClick={() => setActivePhoto(i)}
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
              <InfoPill icon="👤" label="Propriétaire" value={detail.owner_name || "Privé"} />
              <InfoPill icon="📅" label="Publié le" value={detail.created_at?.slice(0, 10)} />
              {detailPhotos.length > 0 && <InfoPill icon="📷" label="Photos" value={detailPhotos.length} />}
            </div>
            <h3 style={{ fontWeight: 700, color: "#374151", margin: "0 0 8px" }}>Description</h3>
            <p style={{ color: "#555", lineHeight: 1.7, margin: "0 0 20px" }}>{detail.description}</p>
            {canEdit && (
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <button style={S.editBtn} onClick={() => startEdit(detail)}>✏️ Modifier</button>
                <button style={S.dangerBtn} onClick={() => deleteListing(detail.id)}>🗑️ Supprimer</button>
              </div>
            )}
            <a href={`https://wa.me/${(detail.whatsapp || "264816032560").replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" style={S.whatsappBtn}>
              💬 Contacter sur WhatsApp
            </a>
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

                  {/* MULTI PHOTOS */}
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
                <div onClick={() => nav("detail", l.id)}><ListingCard listing={l} onClick={() => {}} S={S} /></div>
                <div style={{ display: "flex", gap: 8, padding: "0 16px 16px" }}>
                  <button style={S.editBtn} onClick={() => startEdit(l)}>✏️ Modifier</button>
                  <button style={S.dangerBtn} onClick={() => deleteListing(l.id)}>🗑️ Supprimer</button>
                </div>
              </div>
            ))}</div>
          }
        </div>
      )}
    </div>
  );
}

function ListingCard({ listing, onClick, S }) {
  const photos = (() => { try { return JSON.parse(listing.images || "[]"); } catch { return listing.image_url ? [listing.image_url] : []; } })();
  const mainPhoto = photos[0] || listing.image_url;
  return (
    <div style={S.card} onClick={onClick}>
      {mainPhoto ? <img src={mainPhoto} alt={listing.titre} style={S.cardImg} /> : <div style={S.cardImgPlaceholder}>🏠</div>}
      {photos.length > 1 && <div style={{ background: "#0d2f6e", color: "#fff", fontSize: 11, padding: "2px 8px", display: "inline-block", marginLeft: 12, marginTop: -8, borderRadius: 10, position: "relative", zIndex: 1 }}>📷 {photos.length} photos</div>}
      <div style={S.cardBody}>
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

function InfoPill({ icon, label, value }) {
  return (
    <div style={{ background: "#f7f6f2", borderRadius: 8, padding: "10px 14px" }}>
      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>{icon} {label}</p>
      <p style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{value}</p>
    </div>
  );
}
