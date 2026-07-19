import { useState, useEffect } from "react";
import {
  Home, PenSquare, Calendar, BarChart2, Settings,
  Send, Copy, Check, RefreshCw, Loader2, AlertCircle,
  ThumbsUp, MessageCircle, Share2, Trash2, Eye, ChevronRight,
  Newspaper, Zap, HelpCircle, Gift, Star, Users
} from "lucide-react";

// ─── Design tokens ────────────────────────────────────────────────
// Navy + warm amber: newspaper-meets-digital identity
const C = {
  navy:    "#1A1A2E",
  amber:   "#F5A623",
  paper:   "#F7F4EF",
  border:  "#E2DDD5",
  muted:   "#8A857C",
  body:    "#3A3530",
  white:   "#FFFFFF",
  green:   "#2D9966",
  red:     "#C0392B",
};

// ─── Post types ───────────────────────────────────────────────────
const POST_TYPES = [
  { id: "promo",     icon: Zap,       label: "Promotion",        sinhala: "ප්‍රවර්ධනය",      desc: "Highlight AdSpot benefits" },
  { id: "tip",       icon: Star,      label: "Ad Tip",           sinhala: "ඇඩ් ටිප්",        desc: "Helpful tip for advertisers" },
  { id: "howto",     icon: HelpCircle,label: "How It Works",     sinhala: "ක්‍රමය",           desc: "Explain the booking process" },
  { id: "newspaper", icon: Newspaper, label: "Newspaper Feature", sinhala: "පත්තර",           desc: "Feature a specific newspaper" },
  { id: "seasonal",  icon: Gift,      label: "Seasonal/Festival", sinhala: "උත්සව",          desc: "Festival or seasonal content" },
  { id: "question",  icon: Users,     label: "Engagement Post",  sinhala: "ප්‍රශ්නය",         desc: "Question to boost comments" },
];

// ─── Calendar plan generator ──────────────────────────────────────
function buildCalendar() {
  const cycle = ["promo","tip","howto","newspaper","seasonal","question","promo"];
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i * 2);
    return {
      date: d,
      label: d.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" }),
      type: POST_TYPES.find(t => t.id === cycle[i]),
      isToday: i === 0,
    };
  });
}

// ─── Tiny components ──────────────────────────────────────────────
function Pill({ children, color = C.amber }) {
  return (
    <span style={{ background: color + "22", color, fontSize:11, padding:"2px 8px",
      borderRadius:99, fontWeight:600, letterSpacing:.3 }}>
      {children}
    </span>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:14,
      padding:16, ...style }}>
      {children}
    </div>
  );
}

function StatBox({ label, value, accent }) {
  return (
    <div style={{ background:accent+"15", border:`1px solid ${accent}30`,
      borderRadius:12, padding:"12px 16px", flex:1 }}>
      <div style={{ fontSize:22, fontWeight:800, color:accent }}>{value ?? "—"}</div>
      <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{label}</div>
    </div>
  );
}

// ─── Main app ─────────────────────────────────────────────────────
export default function AdSpotManager() {
  const [tab, setTab] = useState("home");
  const [config, setConfig] = useState({ pageId:"", token:"" });
  const [connected, setConnected] = useState(false);

  // Generate
  const [postType, setPostType] = useState("promo");
  const [extra, setExtra] = useState("");
  const [generated, setGenerated] = useState(null);
  const [generating, setGenerating] = useState(false);

  // Drafts + posts
  const [drafts, setDrafts] = useState([]);
  const [fbPosts, setFbPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [posting, setPosting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Analytics
  const [pageInfo, setPageInfo] = useState(null);
  const [analytics, setAnalytics] = useState([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const [toast, setToast] = useState(null); // { type:"ok"|"err", msg }

  const notify = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Generate post with Claude ────────────────────────────────
  async function generatePost() {
    setGenerating(true);
    setGenerated(null);
    const pt = POST_TYPES.find(t => t.id === postType);
    const prompt = `You are the Facebook content manager for "AdSpot" — a Sri Lankan newspaper advertising platform. 
AdSpot lets businesses and individuals book newspaper ads in ANY Sri Lankan paper (Dinamina, Lankadeepa, Daily Mirror, Sunday Times, Divaina, Daily News, etc.) quickly through a website — no phone calls, no office visits needed.

Write a Facebook post of type: ${pt.label} — ${pt.desc}
${extra ? `Context: ${extra}` : ""}

Rules:
- Write in BOTH Sinhala (first) AND English (second)
- Separate the two with this exact line: ═══════════════════
- Max 120 words total
- Use 3–5 natural emojis
- End with: "Book now 👉 www.adspot.lk"
- Add 5–7 hashtags mixing Sinhala-transliteration and English (e.g. #AdSpotLK #gazettes #sinhala_ads)
- Feel organic and human — not like a corporate ad
- Include a question or relatable hook to get comments

Return ONLY the post text. No explanation.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"claude-sonnet-4-6",
          max_tokens:1000,
          messages:[{ role:"user", content:prompt }]
        })
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      setGenerated({ text, typeLabel:pt.label, typeIcon:pt.icon, id:Date.now() });
    } catch {
      notify("err", "Generation failed. Check your connection.");
    } finally {
      setGenerating(false);
    }
  }

  // ── Post to Facebook ─────────────────────────────────────────
  async function postToFacebook(text) {
    if (!connected) { notify("err", "Connect your page in Settings first."); return; }
    setPosting(true);
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${config.pageId}/feed`,
        {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ message:text, access_token:config.token })
        }
      );
      const data = await res.json();
      if (data.error) { notify("err", data.error.message); }
      else { notify("ok","Post published to Facebook! ✅"); fetchPosts(); }
    } catch { notify("err", "Failed to post. Try again."); }
    finally { setPosting(false); }
  }

  // ── Fetch FB posts ───────────────────────────────────────────
  async function fetchPosts() {
    if (!connected) return;
    setLoadingPosts(true);
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${config.pageId}/posts?fields=id,message,created_time,likes.summary(true),comments.summary(true),shares&access_token=${config.token}&limit=10`
      );
      const data = await res.json();
      if (data.error) notify("err", data.error.message);
      else setFbPosts(data.data || []);
    } catch { notify("err","Could not load posts."); }
    finally { setLoadingPosts(false); }
  }

  // ── Fetch analytics ──────────────────────────────────────────
  async function fetchAnalytics() {
    if (!connected) return;
    setLoadingAnalytics(true);
    try {
      const [pgRes, postRes] = await Promise.all([
        fetch(`https://graph.facebook.com/v19.0/${config.pageId}?fields=name,fan_count,followers_count&access_token=${config.token}`),
        fetch(`https://graph.facebook.com/v19.0/${config.pageId}/posts?fields=id,message,created_time,likes.summary(true),comments.summary(true),shares&access_token=${config.token}&limit=8`)
      ]);
      const pg = await pgRes.json();
      const posts = await postRes.json();
      if (!pg.error) setPageInfo(pg);
      if (!posts.error) setAnalytics(posts.data || []);
    } catch { notify("err","Could not load analytics."); }
    finally { setLoadingAnalytics(false); }
  }

  function saveDraft(post) {
    setDrafts(p => [post, ...p]);
    notify("ok","Draft saved!");
  }

  function copy(text) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ─── TAB: HOME ───────────────────────────────────────────────
  const TabHome = () => (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* Connection status */}
      <div style={{
        background: connected ? C.green+"15" : C.amber+"15",
        border:`1px solid ${connected ? C.green : C.amber}40`,
        borderRadius:12, padding:"10px 14px",
        display:"flex", alignItems:"center", gap:8
      }}>
        <div style={{ width:8,height:8,borderRadius:"50%",
          background: connected ? C.green : C.amber }} />
        <span style={{ fontSize:13, color: connected ? C.green : C.amber, fontWeight:600 }}>
          {connected ? `Connected · Page ${config.pageId}` : "Not connected — go to Settings"}
        </span>
      </div>

      {/* Page stats if available */}
      {pageInfo && (
        <div style={{ display:"flex", gap:10 }}>
          <StatBox label="Page Likes" value={pageInfo.fan_count?.toLocaleString()} accent={C.navy} />
          <StatBox label="Followers" value={pageInfo.followers_count?.toLocaleString()} accent={C.amber} />
        </div>
      )}

      {/* Upcoming calendar */}
      <Card>
        <div style={{ fontSize:12, fontWeight:700, color:C.muted, letterSpacing:.6,
          textTransform:"uppercase", marginBottom:10 }}>Upcoming Posts</div>
        {buildCalendar().slice(0,4).map((item,i) => (
          <div key={i} style={{
            display:"flex", alignItems:"center", gap:10, padding:"8px 0",
            borderBottom: i < 3 ? `1px solid ${C.border}` : "none"
          }}>
            <div style={{ width:44, textAlign:"center" }}>
              <div style={{ fontSize:10, color:C.muted }}>{item.label.split(", ")[0]}</div>
              <div style={{ fontSize:15, fontWeight:700, color:C.navy }}>
                {item.label.split(", ")[1]?.split(" ")[1]}
              </div>
            </div>
            <item.type.icon size={15} color={C.amber} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, color:C.body }}>{item.type.label}</div>
              <div style={{ fontSize:11, color:C.muted }}>{item.type.sinhala}</div>
            </div>
            {item.isToday && <Pill color={C.green}>Today</Pill>}
            <button onClick={() => { setPostType(item.type.id); setTab("generate"); }}
              style={{ background:"none", border:"none", cursor:"pointer", color:C.amber }}>
              <ChevronRight size={16} />
            </button>
          </div>
        ))}
      </Card>

      {/* Drafts */}
      {drafts.length > 0 && (
        <Card>
          <div style={{ fontSize:12, fontWeight:700, color:C.muted, letterSpacing:.6,
            textTransform:"uppercase", marginBottom:10 }}>
            Saved Drafts ({drafts.length})
          </div>
          {drafts.map((d,i) => (
            <div key={d.id} style={{ padding:"10px 0", borderBottom: i<drafts.length-1 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ fontSize:11, color:C.amber, fontWeight:600, marginBottom:4 }}>{d.typeLabel}</div>
              <div style={{ fontSize:13, color:C.body, overflow:"hidden",
                display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
                {d.text}
              </div>
              <div style={{ display:"flex", gap:8, marginTop:8 }}>
                <button onClick={() => postToFacebook(d.text)} disabled={!connected||posting}
                  style={{ fontSize:12, background:C.navy, color:"white", border:"none",
                    borderRadius:8, padding:"5px 12px", cursor:"pointer", opacity:!connected?0.5:1 }}>
                  {posting ? "Posting…" : "Post Now"}
                </button>
                <button onClick={() => setDrafts(p=>p.filter((_,idx)=>idx!==i))}
                  style={{ fontSize:12, background:"none", border:`1px solid ${C.border}`,
                    borderRadius:8, padding:"5px 10px", cursor:"pointer", color:C.red }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Recent FB posts */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:13, fontWeight:700, color:C.body }}>Published Posts</span>
        <button onClick={fetchPosts} disabled={!connected||loadingPosts}
          style={{ fontSize:12, color:C.amber, background:"none", border:"none", cursor:"pointer",
            display:"flex", alignItems:"center", gap:4 }}>
          <RefreshCw size={12} className={loadingPosts?"animate-spin":""} />
          Refresh
        </button>
      </div>
      {fbPosts.length === 0 && connected && !loadingPosts && (
        <button onClick={fetchPosts} style={{ background:C.navy+"15", border:`1px solid ${C.navy}30`,
          borderRadius:12, padding:"12px", fontSize:13, color:C.navy, cursor:"pointer", width:"100%" }}>
          Load Facebook Posts
        </button>
      )}
      {fbPosts.map(p => (
        <Card key={p.id} style={{ padding:12 }}>
          <div style={{ fontSize:13, color:C.body, marginBottom:8,
            overflow:"hidden", display:"-webkit-box", WebkitLineClamp:3, WebkitBoxOrient:"vertical" }}>
            {p.message || "(No text)"}
          </div>
          <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>
            {new Date(p.created_time).toLocaleString("en-US",{
              weekday:"short", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"})}
          </div>
          <div style={{ display:"flex", gap:16 }}>
            <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:"#4267B2" }}>
              <ThumbsUp size={12}/>{p.likes?.summary?.total_count||0}
            </span>
            <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:C.green }}>
              <MessageCircle size={12}/>{p.comments?.summary?.total_count||0}
            </span>
            <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:C.amber }}>
              <Share2 size={12}/>{p.shares?.count||0}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );

  // ─── TAB: GENERATE ───────────────────────────────────────────
  const TabGenerate = () => (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div>
        <div style={{ fontSize:12, fontWeight:700, color:C.muted, letterSpacing:.6,
          textTransform:"uppercase", marginBottom:10 }}>Post Type</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {POST_TYPES.map(pt => (
            <button key={pt.id} onClick={() => setPostType(pt.id)}
              style={{
                textAlign:"left", padding:"10px 12px", borderRadius:12, cursor:"pointer",
                border:`2px solid ${postType===pt.id ? C.amber : C.border}`,
                background: postType===pt.id ? C.amber+"12" : C.white,
                transition:"all .15s"
              }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                <pt.icon size={14} color={postType===pt.id ? C.amber : C.muted} />
                <span style={{ fontSize:12, fontWeight:700,
                  color:postType===pt.id ? C.amber : C.body }}>{pt.label}</span>
              </div>
              <div style={{ fontSize:11, color:C.muted }}>{pt.sinhala}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ fontSize:13, fontWeight:600, color:C.body }}>
          Extra context <span style={{ color:C.muted, fontWeight:400 }}>(optional)</span>
        </label>
        <textarea value={extra} onChange={e=>setExtra(e.target.value)}
          placeholder="e.g. Focus on wedding announcements, or mention Lankadeepa specifically…"
          style={{ width:"100%", marginTop:6, padding:"10px 12px", border:`1px solid ${C.border}`,
            borderRadius:12, fontSize:13, resize:"none", height:72, fontFamily:"inherit",
            color:C.body, outline:"none", boxSizing:"border-box" }} />
      </div>

      <button onClick={generatePost} disabled={generating}
        style={{
          background:`linear-gradient(135deg, ${C.navy}, #2D2D4E)`,
          color:"white", border:"none", borderRadius:12, padding:"14px",
          fontSize:14, fontWeight:700, cursor:"pointer", display:"flex",
          alignItems:"center", justifyContent:"center", gap:8,
          opacity:generating?0.7:1, letterSpacing:.3
        }}>
        {generating
          ? <><Loader2 size={16} className="animate-spin" />Generating…</>
          : <><PenSquare size={16} />Generate Bilingual Post</>
        }
      </button>

      {generated && (
        <Card style={{ overflow:"hidden", padding:0 }}>
          {/* Newspaper-style header */}
          <div style={{ background:C.navy, padding:"10px 16px",
            display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <generated.type.icon size={14} color={C.amber} />
              <span style={{ fontSize:12, fontWeight:700, color:C.amber, letterSpacing:.4 }}>
                {generated.typeLabel.toUpperCase()}
              </span>
            </div>
            <button onClick={() => copy(generated.text)}
              style={{ background:"none", border:"none", cursor:"pointer",
                color:copied?"#66BB6A":C.muted, display:"flex", alignItems:"center", gap:4, fontSize:12 }}>
              {copied ? <><Check size={12}/>Copied</> : <><Copy size={12}/>Copy</>}
            </button>
          </div>

          {/* Post content - looks like a newspaper column */}
          <div style={{ padding:16, background:C.paper }}>
            <pre style={{ fontSize:13, color:C.body, whiteSpace:"pre-wrap",
              fontFamily:"inherit", lineHeight:1.65, margin:0 }}>
              {generated.text}
            </pre>
          </div>

          {/* Actions */}
          <div style={{ padding:"12px 16px", display:"flex", gap:8, borderTop:`1px solid ${C.border}` }}>
            <button onClick={() => postToFacebook(generated.text)}
              disabled={!connected||posting}
              style={{ flex:1, background:C.amber, color:C.navy, border:"none", borderRadius:10,
                padding:"10px", fontSize:13, fontWeight:700, cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                opacity:(!connected||posting)?0.6:1 }}>
              {posting
                ? <><Loader2 size={14} className="animate-spin"/>Posting…</>
                : <><Send size={14}/>Post to Facebook</>
              }
            </button>
            <button onClick={() => saveDraft(generated)}
              style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:10,
                padding:"10px 14px", fontSize:13, color:C.body, cursor:"pointer" }}>
              Save Draft
            </button>
          </div>
        </Card>
      )}
    </div>
  );

  // ─── TAB: CALENDAR ───────────────────────────────────────────
  const TabCalendar = () => (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <p style={{ fontSize:13, color:C.muted, margin:0 }}>
        Automated 14-day plan — 1 post every 2 days for consistent organic reach.
      </p>
      {buildCalendar().map((item,i) => (
        <div key={i} style={{
          background: item.isToday ? C.amber+"10" : C.white,
          border:`1px solid ${item.isToday ? C.amber : C.border}`,
          borderRadius:12, padding:"12px 14px",
          display:"flex", alignItems:"center", gap:12
        }}>
          <div style={{ textAlign:"center", minWidth:44 }}>
            <div style={{ fontSize:10, color:C.muted }}>{item.label.split(", ")[0]}</div>
            <div style={{ fontSize:18, fontWeight:800, color:item.isToday?C.amber:C.navy, lineHeight:1.2 }}>
              {item.label.split(", ")[1]?.split(" ")[1]}
            </div>
            <div style={{ fontSize:10, color:C.muted }}>
              {item.label.split(", ")[1]?.split(" ")[0]}
            </div>
          </div>
          <div style={{ width:1, height:36, background:C.border }} />
          <item.type.icon size={16} color={C.amber} style={{ flexShrink:0 }} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.body }}>{item.type.label}</div>
            <div style={{ fontSize:11, color:C.muted }}>{item.type.desc}</div>
          </div>
          {item.isToday && <Pill>Today</Pill>}
          <button onClick={() => { setPostType(item.type.id); setTab("generate"); }}
            style={{ fontSize:11, background:C.navy, color:"white", border:"none",
              borderRadius:8, padding:"5px 10px", cursor:"pointer", whiteSpace:"nowrap" }}>
            Generate →
          </button>
        </div>
      ))}
    </div>
  );

  // ─── TAB: ANALYTICS ──────────────────────────────────────────
  const TabAnalytics = () => (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:13, fontWeight:700, color:C.body }}>Page Performance</span>
        <button onClick={fetchAnalytics} disabled={!connected||loadingAnalytics}
          style={{ fontSize:12, color:C.amber, background:"none", border:"none",
            cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
          <RefreshCw size={12} style={{ animation:loadingAnalytics?"spin 1s linear infinite":"none" }} />
          {loadingAnalytics ? "Loading…" : "Refresh"}
        </button>
      </div>

      {!connected ? (
        <div style={{ textAlign:"center", padding:"40px 20px", color:C.muted }}>
          <BarChart2 size={32} style={{ margin:"0 auto 8px", opacity:.3 }} />
          <div style={{ fontSize:13 }}>Connect your page in Settings to see analytics.</div>
        </div>
      ) : analytics.length === 0 ? (
        <button onClick={fetchAnalytics}
          style={{ background:C.navy, color:"white", border:"none", borderRadius:12,
            padding:"12px", fontSize:13, cursor:"pointer" }}>
          Load Analytics
        </button>
      ) : (
        <>
          {pageInfo && (
            <div style={{ display:"flex", gap:10 }}>
              <StatBox label="Page Likes" value={pageInfo.fan_count?.toLocaleString()} accent={C.navy} />
              <StatBox label="Followers" value={pageInfo.followers_count?.toLocaleString()} accent={C.amber} />
            </div>
          )}

          <div style={{ fontSize:12, fontWeight:700, color:C.muted, letterSpacing:.6, textTransform:"uppercase" }}>
            Recent Posts
          </div>

          {analytics.map((post,i) => {
            const likes = post.likes?.summary?.total_count || 0;
            const comments = post.comments?.summary?.total_count || 0;
            const shares = post.shares?.count || 0;
            const engagement = likes + comments + shares;
            return (
              <Card key={post.id} style={{ padding:14 }}>
                <div style={{ fontSize:13, color:C.body, marginBottom:8,
                  overflow:"hidden", display:"-webkit-box",
                  WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
                  {post.message || "(No text)"}
                </div>
                <div style={{ fontSize:11, color:C.muted, marginBottom:10 }}>
                  {new Date(post.created_time).toLocaleDateString("en-US",{
                    weekday:"short", month:"short", day:"numeric", year:"numeric" })}
                </div>
                <div style={{ display:"flex", gap:0 }}>
                  {[
                    { icon:ThumbsUp, val:likes, color:"#4267B2", label:"Likes" },
                    { icon:MessageCircle, val:comments, color:C.green, label:"Comments" },
                    { icon:Share2, val:shares, color:C.amber, label:"Shares" },
                    { icon:Zap, val:engagement, color:C.navy, label:"Total" },
                  ].map((m,j) => (
                    <div key={j} style={{ flex:1, textAlign:"center",
                      borderRight: j<3?`1px solid ${C.border}`:"none" }}>
                      <m.icon size={13} color={m.color} style={{ margin:"0 auto 2px" }} />
                      <div style={{ fontSize:14, fontWeight:700, color:m.color }}>{m.val}</div>
                      <div style={{ fontSize:10, color:C.muted }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );

  // ─── TAB: SETTINGS ───────────────────────────────────────────
  const TabSettings = () => (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* Token guide */}
      <Card style={{ background:C.navy, border:"none" }}>
        <div style={{ fontSize:13, fontWeight:700, color:C.amber, marginBottom:8 }}>
          🔑 How to get your free Facebook token
        </div>
        {[
          "Go to developers.facebook.com → Log in with your Facebook account",
          "Click My Apps → Create App → choose Business type",
          "Inside the app, open Tools → Graph API Explorer",
          "Select your AdSpot page from the User or Page dropdown",
          "Click Add a Permission → add pages_manage_posts + pages_read_engagement",
          "Click Generate Access Token → Copy it and paste below",
        ].map((step,i) => (
          <div key={i} style={{ display:"flex", gap:10, marginBottom:6 }}>
            <div style={{ width:20, height:20, borderRadius:"50%", background:C.amber,
              flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:10, fontWeight:700, color:C.navy }}>{i+1}</div>
            <div style={{ fontSize:12, color:"#A0B0C0", lineHeight:1.5 }}>{step}</div>
          </div>
        ))}
        <div style={{ marginTop:10, fontSize:11, color:C.amber+"99" }}>
          ✅ The Facebook API is completely free to use.
        </div>
      </Card>

      {/* Page ID */}
      <div>
        <label style={{ fontSize:13, fontWeight:600, color:C.body }}>Facebook Page ID</label>
        <input type="text" value={config.pageId}
          onChange={e=>setConfig(p=>({...p,pageId:e.target.value}))}
          placeholder="e.g. 123456789012345"
          style={{ display:"block", width:"100%", marginTop:6, padding:"11px 12px",
            border:`1px solid ${C.border}`, borderRadius:12, fontSize:13,
            fontFamily:"inherit", color:C.body, outline:"none", boxSizing:"border-box" }} />
        <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>
          Find it in your page's About section or the URL: facebook.com/adspot/about
        </div>
      </div>

      {/* Token */}
      <div>
        <label style={{ fontSize:13, fontWeight:600, color:C.body }}>Page Access Token</label>
        <input type="password" value={config.token}
          onChange={e=>setConfig(p=>({...p,token:e.target.value}))}
          placeholder="Paste your token here"
          style={{ display:"block", width:"100%", marginTop:6, padding:"11px 12px",
            border:`1px solid ${C.border}`, borderRadius:12, fontSize:13,
            fontFamily:"inherit", color:C.body, outline:"none", boxSizing:"border-box" }} />
      </div>

      <button
        onClick={() => {
          if (config.pageId && config.token) {
            setConnected(true);
            fetchAnalytics();
            notify("ok","Page connected! ✅");
          } else {
            notify("err","Please fill in both Page ID and Token.");
          }
        }}
        style={{ background:C.green, color:"white", border:"none", borderRadius:12,
          padding:"14px", fontSize:14, fontWeight:700, cursor:"pointer", letterSpacing:.3 }}>
        Save & Connect Page
      </button>

      {connected && (
        <button onClick={() => { setConnected(false); setConfig({pageId:"",token:""}); setPageInfo(null); setAnalytics([]); }}
          style={{ background:"none", border:`1px solid ${C.red}40`, borderRadius:12,
            padding:"12px", fontSize:13, color:C.red, cursor:"pointer" }}>
          Disconnect
        </button>
      )}

      {/* Brand info */}
      <Card style={{ background:C.paper }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.muted, letterSpacing:.6,
          textTransform:"uppercase", marginBottom:8 }}>AdSpot Profile</div>
        {[
          ["🌐 Website","adspot.lk"],
          ["📅 Frequency","Every 2 days minimum"],
          ["🌍 Languages","Sinhala + English"],
          ["🎯 Goal","Organic reach → website bookings"],
          ["📰 Papers","All major Sri Lankan newspapers"],
        ].map(([k,v]) => (
          <div key={k} style={{ display:"flex", justifyContent:"space-between",
            fontSize:12, paddingBottom:6, marginBottom:6, borderBottom:`1px solid ${C.border}` }}>
            <span style={{ color:C.muted }}>{k}</span>
            <span style={{ color:C.body, fontWeight:600 }}>{v}</span>
          </div>
        ))}
      </Card>
    </div>
  );

  // ─── Nav tabs ─────────────────────────────────────────────────
  const NAV = [
    { id:"home",     icon:Home,      label:"Home" },
    { id:"generate", icon:PenSquare, label:"Create" },
    { id:"calendar", icon:Calendar,  label:"Plan" },
    { id:"analytics",icon:BarChart2, label:"Stats" },
    { id:"settings", icon:Settings,  label:"Settings" },
  ];

  const TAB_TITLES = {
    home:"AdSpot Manager", generate:"Create Post",
    calendar:"Content Plan", analytics:"Analytics", settings:"Settings"
  };

  return (
    <div style={{ maxWidth:420, margin:"0 auto", background:C.paper,
      minHeight:"100vh", paddingBottom:72, fontFamily:"system-ui,-apple-system,sans-serif" }}>

      {/* Header */}
      <div style={{ background:C.navy, padding:"18px 16px 14px",
        display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:10 }}>
        <div style={{ width:38, height:38, background:C.amber, borderRadius:10,
          display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Newspaper size={18} color={C.navy} />
        </div>
        <div>
          <div style={{ fontSize:15, fontWeight:800, color:"white", letterSpacing:.2 }}>
            {TAB_TITLES[tab]}
          </div>
          <div style={{ fontSize:11, color:"#6080A0" }}>AdSpot · facebook.com/adspot</div>
        </div>
        {connected && (
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:4 }}>
            <div style={{ width:6,height:6,borderRadius:"50%",background:C.green }} />
            <span style={{ fontSize:10, color:C.green }}>Live</span>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          margin:"10px 14px 0",
          background: toast.type==="ok" ? C.green+"15" : C.red+"15",
          border:`1px solid ${toast.type==="ok" ? C.green : C.red}40`,
          borderRadius:10, padding:"10px 14px",
          display:"flex", alignItems:"center", gap:8, fontSize:13,
          color: toast.type==="ok" ? C.green : C.red
        }}>
          <AlertCircle size={14} />
          {toast.msg}
        </div>
      )}

      {/* Tab content */}
      <div style={{ padding:"14px 14px 0" }}>
        {tab==="home"     && <TabHome />}
        {tab==="generate" && <TabGenerate />}
        {tab==="calendar" && <TabCalendar />}
        {tab==="analytics"&& <TabAnalytics />}
        {tab==="settings" && <TabSettings />}
      </div>

      {/* Bottom nav */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0,
        background:C.white, borderTop:`1px solid ${C.border}`, zIndex:20 }}>
        <div style={{ maxWidth:420, margin:"0 auto", display:"flex" }}>
          {NAV.map(n => (
            <button key={n.id} onClick={()=>setTab(n.id)}
              style={{ flex:1, padding:"8px 0 10px", border:"none", background:"none",
                cursor:"pointer", display:"flex", flexDirection:"column",
                alignItems:"center", gap:3 }}>
              <n.icon size={20} color={tab===n.id ? C.amber : C.muted} />
              <span style={{ fontSize:10, color:tab===n.id?C.amber:C.muted,
                fontWeight:tab===n.id?700:400, letterSpacing:.2 }}>
                {n.label}
              </span>
              {tab===n.id && (
                <div style={{ width:16, height:2, background:C.amber, borderRadius:1, marginTop:1 }} />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
