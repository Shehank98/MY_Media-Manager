import { useState, useEffect, useCallback } from "react";
import {
  Home, PenSquare, Calendar, BarChart2, Settings,
  Send, Copy, Check, RefreshCw, Loader2, AlertCircle,
  ThumbsUp, MessageCircle, Share2, Eye, ChevronRight, Clock,
  Newspaper, Zap, HelpCircle, Gift, Star, Users, Plus, Trash2, Sparkles,
  Image as ImageIcon, X
} from "lucide-react";
import { api } from "./api.js";

// ─── Design tokens (newspaper-meets-digital) ──────────────────────
const C = {
  navy: "#1A1A2E", amber: "#F5A623", paper: "#F7F4EF", border: "#E2DDD5",
  muted: "#8A857C", body: "#3A3530", white: "#FFFFFF", green: "#2D9966", red: "#C0392B",
};

// Icon per post type id (types themselves come from the backend).
const TYPE_ICON = {
  promo: Zap, tip: Star, howto: HelpCircle,
  newspaper: Newspaper, seasonal: Gift, question: Users,
};

// ─── Small components ─────────────────────────────────────────────
const Pill = ({ children, color = C.amber }) => (
  <span style={{ background: color + "22", color, fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600, letterSpacing: .3 }}>{children}</span>
);
const Card = ({ children, style = {} }) => (
  <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, ...style }}>{children}</div>
);
const StatBox = ({ label, value, accent }) => (
  <div style={{ background: accent + "15", border: `1px solid ${accent}30`, borderRadius: 12, padding: "12px 16px", flex: 1 }}>
    <div style={{ fontSize: 22, fontWeight: 800, color: accent }}>{value ?? "—"}</div>
    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{label}</div>
  </div>
);
const Label = ({ children }) => (
  <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: .6, textTransform: "uppercase", marginBottom: 10 }}>{children}</div>
);

// Engagement row for a post card.
const Engagement = ({ likes, comments, shares, reach }) => (
  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#4267B2" }}><ThumbsUp size={12} />{likes || 0}</span>
    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.green }}><MessageCircle size={12} />{comments || 0}</span>
    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.amber }}><Share2 size={12} />{shares || 0}</span>
    {reach != null && <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.navy }}><Eye size={12} />{reach} reach</span>}
  </div>
);

export default function App() {
  const [tab, setTab] = useState("home");
  const [health, setHealth] = useState({ geminiConfigured: true, dbConfigured: true });
  const [pages, setPages] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [types, setTypes] = useState([]);
  const [toast, setToast] = useState(null);

  const active = pages.find((p) => p.id === activeId) || null;

  const notify = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4000); };

  const loadPages = useCallback(async () => {
    try {
      const list = await api.listPages();
      setPages(list);
      setActiveId((cur) => cur || list[0]?.id || null);
    } catch (e) { notify("err", e.message); }
  }, []);

  useEffect(() => {
    api.health().then(setHealth).catch(() => {});
    api.postTypes().then(setTypes).catch(() => {});
    loadPages();
  }, [loadPages]);

  // ── Generate state ──
  const [postType, setPostType] = useState("promo");
  const [extra, setExtra] = useState("");
  const [generated, setGenerated] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [headline, setHeadline] = useState("");
  const [image, setImage] = useState(null); // base64 data URL of creative
  const [makingImage, setMakingImage] = useState(false);

  // ── Posts + analytics state ──
  const [posts, setPosts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [advice, setAdvice] = useState("");
  const [loadingPosts, setLoadingPosts] = useState(false);

  const loadPosts = useCallback(async () => {
    if (!activeId) return;
    setLoadingPosts(true);
    try { setPosts(await api.listPosts(activeId)); }
    catch (e) { notify("err", e.message); }
    finally { setLoadingPosts(false); }
  }, [activeId]);

  const loadSummary = useCallback(async () => {
    if (!activeId) return;
    try { setSummary(await api.summary(activeId)); } catch (e) { notify("err", e.message); }
  }, [activeId]);

  useEffect(() => { setPosts([]); setSummary(null); setAdvice(""); setGenerated(null); if (activeId) { loadPosts(); loadSummary(); } }, [activeId, loadPosts, loadSummary]);

  // ── Actions ──
  function resetCreate() { setGenerated(null); setHeadline(""); setImage(null); }

  async function generate() {
    if (!activeId) return notify("err", "Add a page first (Settings).");
    setGenerating(true); resetCreate();
    try {
      const { content, headline } = await api.generate({ page_id: activeId, type: postType, extra });
      setGenerated({ content, type: postType });
      setHeadline(headline || "");
    } catch (e) { notify("err", e.message); }
    finally { setGenerating(false); }
  }

  async function makeImage() {
    if (!headline.trim()) return notify("err", "Add a short headline for the image first.");
    setMakingImage(true);
    try {
      const { image } = await api.creativePreview({ page_id: activeId, headline, type: generated?.type || postType });
      setImage(image);
    } catch (e) { notify("err", e.message); }
    finally { setMakingImage(false); }
  }

  async function publishNow(content, type, existingId) {
    setBusy(true);
    try {
      let id = existingId;
      if (!id) { const saved = await api.savePost({ page_id: activeId, content, type, image }); id = saved.id; }
      await api.publishPost(id);
      notify("ok", "Published to Facebook! ✅");
      resetCreate(); loadPosts(); loadSummary();
    } catch (e) { notify("err", e.message); }
    finally { setBusy(false); }
  }

  async function saveDraft(content, type) {
    try { await api.savePost({ page_id: activeId, content, type, status: "draft", image }); notify("ok", "Draft saved."); resetCreate(); loadPosts(); }
    catch (e) { notify("err", e.message); }
  }

  async function schedule(content, type, whenISO) {
    try { await api.savePost({ page_id: activeId, content, type, status: "scheduled", scheduled_for: whenISO, image }); notify("ok", "Post scheduled ⏰"); resetCreate(); loadPosts(); }
    catch (e) { notify("err", e.message); }
  }

  async function refreshStats() {
    if (!activeId) return;
    notify("ok", "Refreshing from Facebook…");
    try { await api.refreshAnalytics(activeId); await loadSummary(); await loadPosts(); notify("ok", "Stats updated ✅"); }
    catch (e) { notify("err", e.message); }
  }

  async function getAdvice() {
    setAdvice("…thinking");
    try { const { advice } = await api.advice(activeId); setAdvice(advice); }
    catch (e) { setAdvice(""); notify("err", e.message); }
  }

  function copy(text) { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }

  const copy2day = () => { const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(10, 0, 0, 0); return d.toISOString(); };

  // ─── HOME ───────────────────────────────────────────────────────
  const TabHome = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!active ? <EmptyState onGo={() => setTab("settings")} /> : <>
        {summary?.page && (
          <div style={{ display: "flex", gap: 10 }}>
            <StatBox label="Page Likes" value={summary.page.fan_count?.toLocaleString()} accent={C.navy} />
            <StatBox label="Followers" value={summary.page.followers_count?.toLocaleString()} accent={C.amber} />
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <StatBox label="Published" value={summary?.counts?.published ?? 0} accent={C.green} />
          <StatBox label="Scheduled" value={summary?.counts?.scheduled ?? 0} accent={C.amber} />
          <StatBox label="Drafts" value={summary?.counts?.drafts ?? 0} accent={C.muted} />
        </div>

        <button onClick={() => setTab("generate")} style={btnPrimary}>
          <PenSquare size={16} /> Create a new post
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.body }}>Recent Posts</span>
          <button onClick={loadPosts} disabled={loadingPosts} style={linkBtn}>
            <RefreshCw size={12} className={loadingPosts ? "spin" : ""} /> Refresh
          </button>
        </div>
        {posts.length === 0 && !loadingPosts && (
          <div style={{ fontSize: 13, color: C.muted, textAlign: "center", padding: "20px 0" }}>No posts yet. Create your first one 👆</div>
        )}
        <div className="card-grid">
          {posts.map((p) => <PostCard key={p.id} p={p} onPublish={() => publishNow(p.content, p.type, p.id)} onDelete={async () => { await api.deletePost(p.id); loadPosts(); }} busy={busy} />)}
        </div>
      </>}
    </div>
  );

  // ─── GENERATE ───────────────────────────────────────────────────
  const TabGenerate = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!health.geminiConfigured && (
        <div style={warnBox}>⚠️ Gemini key not set. Add <b>GEMINI_API_KEY</b> in your Railway variables (free key: aistudio.google.com/app/apikey).</div>
      )}
      <div>
        <Label>Post Type</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {types.map((pt) => {
            const Icon = TYPE_ICON[pt.id] || Zap;
            const on = postType === pt.id;
            return (
              <button key={pt.id} onClick={() => setPostType(pt.id)} style={{
                textAlign: "left", padding: "10px 12px", borderRadius: 12, cursor: "pointer",
                border: `2px solid ${on ? C.amber : C.border}`, background: on ? C.amber + "12" : C.white,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <Icon size={14} color={on ? C.amber : C.muted} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: on ? C.amber : C.body }}>{pt.label}</span>
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>{pt.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 600, color: C.body }}>Extra context <span style={{ color: C.muted, fontWeight: 400 }}>(optional)</span></label>
        <textarea value={extra} onChange={(e) => setExtra(e.target.value)}
          placeholder="e.g. Focus on wedding announcements, or mention Lankadeepa specifically…"
          style={{ ...inputStyle, height: 72, resize: "none", marginTop: 6 }} />
      </div>

      <button onClick={generate} disabled={generating || !active} style={btnPrimary}>
        {generating ? <><Loader2 size={16} className="spin" />Generating…</> : <><Sparkles size={16} />Generate Bilingual Post</>}
      </button>

      {generated && (
        <Card style={{ overflow: "hidden", padding: 0 }}>
          <div style={{ background: C.navy, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.amber, letterSpacing: .4 }}>{(types.find(t => t.id === generated.type)?.label || "POST").toUpperCase()}</span>
            <button onClick={() => copy(generated.content)} style={{ background: "none", border: "none", cursor: "pointer", color: copied ? "#66BB6A" : C.muted, display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
              {copied ? <><Check size={12} />Copied</> : <><Copy size={12} />Copy</>}
            </button>
          </div>
          <div style={{ padding: 16, background: C.paper }}>
            <pre style={{ fontSize: 13, color: C.body, whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.65, margin: 0 }}>{generated.content}</pre>
          </div>

          {/* Creative image section */}
          <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: .4, textTransform: "uppercase" }}>Image headline</label>
            <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Short English headline for the poster"
              style={{ ...inputStyle, marginTop: 6, marginBottom: 8 }} />
            <button onClick={makeImage} disabled={makingImage} style={{ ...btnGhost, width: "100%", justifyContent: "center" }}>
              {makingImage ? <><Loader2 size={14} className="spin" />Designing…</> : <><ImageIcon size={14} />{image ? "Regenerate image" : "Create branded image"}</>}
            </button>
            {image && (
              <div style={{ marginTop: 10, position: "relative" }}>
                <img src={image} alt="creative" style={{ width: "100%", borderRadius: 10, display: "block" }} />
                <button onClick={() => setImage(null)} title="Remove image"
                  style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.6)", color: "white", border: "none", borderRadius: 8, width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <X size={16} />
                </button>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>This image will be posted with the text above as the caption.</div>
              </div>
            )}
          </div>

          <div style={{ padding: "12px 16px", display: "flex", gap: 8, borderTop: `1px solid ${C.border}`, flexWrap: "wrap" }}>
            <button onClick={() => publishNow(generated.content, generated.type)} disabled={busy} style={{ ...btnAmber, flex: 1 }}>
              {busy ? <><Loader2 size={14} className="spin" />Posting…</> : <><Send size={14} />Post Now</>}
            </button>
            <button onClick={() => schedule(generated.content, generated.type, copy2day())} style={btnGhost}><Clock size={14} />In 2 days</button>
            <button onClick={() => saveDraft(generated.content, generated.type)} style={btnGhost}>Save Draft</button>
          </div>
        </Card>
      )}
    </div>
  );

  // ─── PLAN ───────────────────────────────────────────────────────
  const TabPlan = () => {
    const cycle = ["promo", "tip", "howto", "newspaper", "seasonal", "question", "promo"];
    const items = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() + i * 2);
      const t = types.find((x) => x.id === cycle[i]) || { id: cycle[i], label: cycle[i], desc: "" };
      return { date: d, type: t, isToday: i === 0 };
    });
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Suggested plan — 1 post every 2 days for steady organic reach. Tap “Generate” to write that day’s post.</p>
        {items.map((it, i) => {
          const Icon = TYPE_ICON[it.type.id] || Zap;
          return (
            <div key={i} style={{ background: it.isToday ? C.amber + "10" : C.white, border: `1px solid ${it.isToday ? C.amber : C.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ textAlign: "center", minWidth: 44 }}>
                <div style={{ fontSize: 10, color: C.muted }}>{it.date.toLocaleDateString("en-US", { weekday: "short" })}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: it.isToday ? C.amber : C.navy, lineHeight: 1.2 }}>{it.date.getDate()}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{it.date.toLocaleDateString("en-US", { month: "short" })}</div>
              </div>
              <div style={{ width: 1, height: 36, background: C.border }} />
              <Icon size={16} color={C.amber} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.body }}>{it.type.label}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{it.type.desc}</div>
              </div>
              {it.isToday && <Pill>Today</Pill>}
              <button onClick={() => { setPostType(it.type.id); setTab("generate"); }} style={{ fontSize: 11, background: C.navy, color: "white", border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>Generate →</button>
            </div>
          );
        })}
      </div>
    );
  };

  // ─── STATS ──────────────────────────────────────────────────────
  const TabStats = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.body }}>Page Performance</span>
        <button onClick={refreshStats} style={linkBtn}><RefreshCw size={12} /> Pull from Facebook</button>
      </div>
      {!active ? <EmptyState onGo={() => setTab("settings")} /> : <>
        {summary?.page ? (
          <div style={{ display: "flex", gap: 10 }}>
            <StatBox label="Page Likes" value={summary.page.fan_count?.toLocaleString()} accent={C.navy} />
            <StatBox label="Followers" value={summary.page.followers_count?.toLocaleString()} accent={C.amber} />
          </div>
        ) : <div style={{ fontSize: 13, color: C.muted }}>Tap “Pull from Facebook” to load your latest numbers.</div>}

        {summary?.engagement && (
          <div style={{ display: "flex", gap: 10 }}>
            <StatBox label="Total Likes" value={summary.engagement.likes} accent="#4267B2" />
            <StatBox label="Comments" value={summary.engagement.comments} accent={C.green} />
            <StatBox label="Shares" value={summary.engagement.shares} accent={C.amber} />
          </div>
        )}

        {summary?.history?.length > 1 && <FollowerTrend history={summary.history} />}

        <Card style={{ background: C.navy, border: "none" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.amber, display: "flex", alignItems: "center", gap: 6 }}><Sparkles size={14} /> Media Manager Advice</span>
            <button onClick={getAdvice} style={{ fontSize: 12, background: C.amber, color: C.navy, border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontWeight: 700 }}>Analyze</button>
          </div>
          <div style={{ fontSize: 13, color: "#C8D2DC", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{advice || "Tap Analyze — I’ll review what performed best and tell you what to post next."}</div>
        </Card>

        <Label>Recent Posts</Label>
        <div className="card-grid">
          {posts.filter(p => p.status === "published").map((p) => <PostCard key={p.id} p={p} showStatsOnly />)}
        </div>
      </>}
    </div>
  );

  // ─── SETTINGS ───────────────────────────────────────────────────
  const TabSettings = () => {
    const [form, setForm] = useState({ fb_page_id: "", access_token: "", website: "", languages: "Sinhala + English" });
    const [adding, setAdding] = useState(false);
    async function add() {
      if (!form.fb_page_id || !form.access_token) return notify("err", "Page ID and token are required.");
      setAdding(true);
      try { const pg = await api.addPage(form); notify("ok", `Added ${pg.name} ✅`); setForm({ fb_page_id: "", access_token: "", website: "", languages: "Sinhala + English" }); await loadPages(); setActiveId(pg.id); }
      catch (e) { notify("err", e.message); }
      finally { setAdding(false); }
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card style={{ background: C.navy, border: "none" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.amber, marginBottom: 8 }}>🔑 Get a free Facebook Page token</div>
          {[
            "Go to developers.facebook.com → log in",
            "My Apps → Create App → Business type",
            "Tools → Graph API Explorer → select your page",
            "Add permissions: pages_manage_posts + pages_read_engagement",
            "Generate Access Token → copy it",
            "Find your Page ID at facebook.com/YOURPAGE/about",
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: C.amber, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: C.navy }}>{i + 1}</div>
              <div style={{ fontSize: 12, color: "#A0B0C0", lineHeight: 1.5 }}>{s}</div>
            </div>
          ))}
          <div style={{ marginTop: 8, fontSize: 11, color: C.amber + "99" }}>Tip: use a long-lived Page token so it doesn’t expire in a few hours.</div>
        </Card>

        <Card>
          <Label>Add a Page</Label>
          <input placeholder="Facebook Page ID" value={form.fb_page_id} onChange={(e) => setForm({ ...form, fb_page_id: e.target.value })} style={inputStyle} />
          <input type="password" placeholder="Page Access Token" value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} style={{ ...inputStyle, marginTop: 8 }} />
          <input placeholder="Website (optional) e.g. adspot.lk" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} style={{ ...inputStyle, marginTop: 8 }} />
          <input placeholder="Audience languages" value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} style={{ ...inputStyle, marginTop: 8 }} />
          <button onClick={add} disabled={adding} style={{ ...btnGreen, marginTop: 12 }}>{adding ? "Connecting…" : "Save & Connect Page"}</button>
        </Card>

        {active && <BusinessProfile page={active} onSaved={loadPages} notify={notify} />}

        <Card>
          <Label>Your Pages ({pages.length})</Label>
          {pages.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>No pages yet.</div>}
          {pages.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.body }}>{p.name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>ID {p.fb_page_id}{p.website ? ` · ${p.website}` : ""}</div>
              </div>
              {activeId === p.id && <Pill color={C.green}>Active</Pill>}
              <button onClick={async () => { if (confirm(`Remove ${p.name}? This deletes its stored posts/stats (not from Facebook).`)) { await api.deletePage(p.id); if (activeId === p.id) setActiveId(null); loadPages(); } }} style={{ background: "none", border: "none", cursor: "pointer", color: C.red }}><Trash2 size={16} /></button>
            </div>
          ))}
        </Card>
      </div>
    );
  };

  const NAV = [
    { id: "home", icon: Home, label: "Home" },
    { id: "generate", icon: PenSquare, label: "Create" },
    { id: "plan", icon: Calendar, label: "Plan" },
    { id: "stats", icon: BarChart2, label: "Stats" },
    { id: "settings", icon: Settings, label: "Settings" },
  ];
  const TITLES = { home: "Dashboard", generate: "Create Post", plan: "Content Plan", stats: "Analytics", settings: "Settings" };

  const PageSwitcher = ({ style }) =>
    pages.length > 0 ? (
      <select value={activeId || ""} onChange={(e) => setActiveId(Number(e.target.value))}
        style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "none", background: "#2A2A44", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", ...style }}>
        {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    ) : null;

  const TabContent = () => (
    <>
      {tab === "home" && <TabHome />}
      {tab === "generate" && <TabGenerate />}
      {tab === "plan" && <TabPlan />}
      {tab === "stats" && <TabStats />}
      {tab === "settings" && <TabSettings />}
    </>
  );

  return (
    <div className="shell" style={{ fontFamily: "system-ui,-apple-system,sans-serif" }}>
      {/* ── Desktop sidebar ── */}
      <aside className="sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ width: 38, height: 38, background: C.amber, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Newspaper size={18} color={C.navy} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>Media Manager</div>
            <div style={{ fontSize: 11, color: "#6080A0" }}>{active ? active.name : "No page yet"}</div>
          </div>
        </div>
        <PageSwitcher style={{ marginBottom: 14 }} />
        {NAV.map((n) => {
          const on = tab === n.id;
          return (
            <button key={n.id} onClick={() => setTab(n.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", border: "none", borderRadius: 10, cursor: "pointer", textAlign: "left",
                background: on ? C.amber : "transparent", color: on ? C.navy : "#A0B0C0", fontWeight: on ? 700 : 500, fontSize: 14 }}>
              <n.icon size={18} /> {n.label}
            </button>
          );
        })}
        {active && (
          <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 6, paddingTop: 16 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
            <span style={{ fontSize: 11, color: C.green }}>Live</span>
          </div>
        )}
      </aside>

      <div className="main">
        {/* ── Mobile header ── */}
        <div className="mobile-header" style={{ background: C.navy, padding: "16px 16px 12px", position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, background: C.amber, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Newspaper size={18} color={C.navy} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>{TITLES[tab]}</div>
              <div style={{ fontSize: 11, color: "#6080A0" }}>My Media Manager</div>
            </div>
            {active && <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} /><span style={{ fontSize: 10, color: C.green }}>Live</span></div>}
          </div>
          <PageSwitcher style={{ marginTop: 12 }} />
        </div>

        {/* ── Desktop top bar ── */}
        <div className="desktop-topbar" style={{ alignItems: "center", justifyContent: "space-between", padding: "20px 32px 0" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>{TITLES[tab]}</div>
        </div>

        {toast && (
          <div className="content" style={{ paddingBottom: 0, paddingTop: 10 }}>
            <div style={{ background: (toast.type === "ok" ? C.green : C.red) + "15", border: `1px solid ${(toast.type === "ok" ? C.green : C.red)}40`, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: toast.type === "ok" ? C.green : C.red }}>
              <AlertCircle size={14} />{toast.msg}
            </div>
          </div>
        )}

        <div className="content">
          <TabContent />
        </div>
      </div>

      {/* ── Mobile bottom nav ── */}
      <div className="bottom-nav" style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.white, borderTop: `1px solid ${C.border}`, zIndex: 20 }}>
        {NAV.map((n) => (
          <button key={n.id} onClick={() => setTab(n.id)} style={{ flex: 1, padding: "8px 0 10px", border: "none", background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <n.icon size={20} color={tab === n.id ? C.amber : C.muted} />
            <span style={{ fontSize: 10, color: tab === n.id ? C.amber : C.muted, fontWeight: tab === n.id ? 700 : 400 }}>{n.label}</span>
            {tab === n.id && <div style={{ width: 16, height: 2, background: C.amber, borderRadius: 1 }} />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────
// Business profile: website + contact + AI summary that grounds every post.
function BusinessProfile({ page, onSaved, notify }) {
  const [website, setWebsite] = useState(page.website || "");
  const [contact, setContact] = useState(page.contact || "");
  const [about, setAbout] = useState(page.about || "");
  const [learning, setLearning] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset fields when the active page changes.
  useEffect(() => {
    setWebsite(page.website || ""); setContact(page.contact || ""); setAbout(page.about || "");
  }, [page.id]); // eslint-disable-line

  async function learn() {
    if (!website.trim()) return notify("err", "Enter your website first.");
    setLearning(true);
    try {
      const updated = await api.learnFromWebsite(page.id, website.trim());
      setAbout(updated.about || "");
      notify("ok", "Learned your business from the website ✅");
      onSaved && onSaved();
    } catch (e) { notify("err", e.message); }
    finally { setLearning(false); }
  }

  async function save() {
    setSaving(true);
    try {
      await api.updatePage(page.id, { website: website.trim(), contact, about });
      notify("ok", "Business profile saved.");
      onSaved && onSaved();
    } catch (e) { notify("err", e.message); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <Label>Business Profile — {page.name}</Label>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>
        This tells the AI what your business is, so every post is accurate and ends with your website, contact, and hashtags.
      </div>

      <label style={{ fontSize: 12, fontWeight: 600, color: C.body }}>Website</label>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="www.adspotmedia.lk" style={{ ...inputStyle, flex: 1 }} />
        <button onClick={learn} disabled={learning} style={{ ...btnGhost, whiteSpace: "nowrap" }}>
          {learning ? <><Loader2 size={14} className="spin" />Reading…</> : <><Sparkles size={14} />Learn</>}
        </button>
      </div>

      <label style={{ fontSize: 12, fontWeight: 600, color: C.body, display: "block", marginTop: 12 }}>Contact details (added to every post)</label>
      <textarea value={contact} onChange={(e) => setContact(e.target.value)}
        placeholder={"📞 077 123 4567\n💬 WhatsApp: 077 123 4567\n✉️ hello@adspotmedia.lk"}
        style={{ ...inputStyle, height: 76, resize: "none", marginTop: 6, whiteSpace: "pre-wrap" }} />

      <label style={{ fontSize: 12, fontWeight: 600, color: C.body, display: "block", marginTop: 12 }}>
        Business summary <span style={{ color: C.muted, fontWeight: 400 }}>(auto-filled by “Learn”, or edit yourself)</span>
      </label>
      <textarea value={about} onChange={(e) => setAbout(e.target.value)}
        placeholder="What your business does — the AI uses this for every post."
        style={{ ...inputStyle, height: 120, resize: "vertical", marginTop: 6 }} />

      <button onClick={save} disabled={saving} style={{ ...btnGreen, marginTop: 12 }}>{saving ? "Saving…" : "Save Business Profile"}</button>
    </Card>
  );
}

function PostCard({ p, onPublish, onDelete, busy, showStatsOnly }) {
  const statusColor = { published: C.green, scheduled: C.amber, draft: C.muted, failed: C.red }[p.status] || C.muted;
  return (
    <Card style={{ padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <Pill color={statusColor}>{p.status}</Pill>
        <span style={{ fontSize: 11, color: C.muted }}>
          {p.published_at ? new Date(p.published_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
            : p.scheduled_for ? "for " + new Date(p.scheduled_for).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
            : new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      </div>
      {p.has_image && (
        <img src={`/api/posts/${p.id}/image`} alt="creative" loading="lazy"
          style={{ width: "100%", borderRadius: 8, marginBottom: 8, display: "block" }} />
      )}
      <div style={{ fontSize: 13, color: C.body, marginBottom: 8, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{p.content || "(No text)"}</div>
      {p.status === "failed" && <div style={{ fontSize: 11, color: C.red, marginBottom: 6 }}>⚠️ {p.error}</div>}
      {p.status === "published" && <Engagement likes={p.likes} comments={p.comments} shares={p.shares} reach={p.reach} />}
      {!showStatsOnly && p.status !== "published" && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={onPublish} disabled={busy} style={{ fontSize: 12, background: C.navy, color: "white", border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>{busy ? "Posting…" : "Post Now"}</button>
          <button onClick={onDelete} style={{ fontSize: 12, background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", color: C.red }}>Delete</button>
        </div>
      )}
    </Card>
  );
}

function FollowerTrend({ history }) {
  const vals = history.map((h) => h.followers_count ?? h.fan_count ?? 0);
  const max = Math.max(...vals, 1), min = Math.min(...vals);
  const range = max - min || 1;
  const w = 300, h = 60;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1 || 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <Card>
      <Label>Follower Trend</Label>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 60 }}>
        <polyline points={pts} fill="none" stroke={C.amber} strokeWidth="2" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted }}>
        <span>{new Date(history[0].fetched_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        <span>{max.toLocaleString()} peak</span>
      </div>
    </Card>
  );
}

function EmptyState({ onGo }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: C.muted }}>
      <Plus size={32} style={{ margin: "0 auto 8px", opacity: .3 }} />
      <div style={{ fontSize: 14, marginBottom: 12 }}>No page connected yet.</div>
      <button onClick={onGo} style={{ ...btnGreen, display: "inline-flex", width: "auto", padding: "10px 20px" }}>Add your first page</button>
    </div>
  );
}

// ─── Shared inline styles ─────────────────────────────────────────
const inputStyle = { display: "block", width: "100%", padding: "11px 12px", border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 13, fontFamily: "inherit", color: C.body, outline: "none" };
const btnBase = { border: "none", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%" };
const btnPrimary = { ...btnBase, background: `linear-gradient(135deg, ${C.navy}, #2D2D4E)`, color: "white" };
const btnAmber = { ...btnBase, background: C.amber, color: C.navy };
const btnGreen = { ...btnBase, background: C.green, color: "white" };
const btnGhost = { border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.body, cursor: "pointer", background: C.white, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" };
const linkBtn = { fontSize: 12, color: C.amber, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 };
const warnBox = { background: C.amber + "15", border: `1px solid ${C.amber}40`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: C.body, lineHeight: 1.5 };
