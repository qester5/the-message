// The Message: zero-dependency Node server.
// Real accounts (scrypt-hashed passwords + session cookies). All rules are enforced here, not in the browser.
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const PORT = process.env.PORT || 3000, DIR = process.env.DATA_DIR || __dirname;
const DBFILE = path.join(DIR, "data.json"), UP = path.join(DIR, "uploads");
const DB_URL = process.env.DATABASE_URL;
let pool = null, ready = false; const imgIds = new Set();
const COLS = ["posts", "replies", "likes", "dms", "dmreq", "profiles"];
let d = { users: {}, sessions: {}, cols: {} };
// With DATABASE_URL set, everything lives in Postgres (needed on hosts whose disk is wiped, like Render free).
// Without it, everything lives in data.json and uploads/ inside DATA_DIR.
const q = async (sql, args) => { try { return await pool.query(sql, args); } catch (e) { return await pool.query(sql, args); } };
async function initStore() {
  if (DB_URL) {
    const { Pool } = require("pg");
    pool = new Pool({ connectionString: DB_URL, max: 3 });
    pool.on("error", e => console.error("database connection error:", e.message));
    await q("CREATE TABLE IF NOT EXISTS store (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
    await q("CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, data BYTEA NOT NULL)");
    const r = await q("SELECT v FROM store WHERE k = 'data'");
    if (r.rows[0]) d = Object.assign(d, JSON.parse(r.rows[0].v));
    (await q("SELECT id FROM files")).rows.forEach(x => imgIds.add(x.id));
  } else {
    fs.mkdirSync(UP, { recursive: true });
    try { d = Object.assign(d, JSON.parse(fs.readFileSync(DBFILE, "utf8"))); } catch {}
  }
  COLS.forEach(c => d.cols[c] = d.cols[c] || {});
}
let timer = null, chain = Promise.resolve();
const writeNow = async () => {
  if (!ready) return;
  const s = JSON.stringify(d);
  if (pool) await q("INSERT INTO store (k, v) VALUES ('data', $1) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v", [s]);
  else { fs.writeFileSync(DBFILE + ".tmp", s); fs.renameSync(DBFILE + ".tmp", DBFILE); }
};
const flush = () => (chain = chain.then(writeNow).catch(e => console.error("save failed:", e.message)));
const save = () => { clearTimeout(timer); timer = setTimeout(flush, 200); };
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, async () => { clearTimeout(timer); await flush(); process.exit(0); });
const imgFile = id => path.join(UP, id + ".jpg");
const hasImg = id => pool ? imgIds.has(id) : fs.existsSync(imgFile(id));
const putImg = async (id, buf) => { if (pool) { await q("INSERT INTO files (id, data) VALUES ($1, $2)", [id, buf]); imgIds.add(id); } else fs.writeFileSync(imgFile(id), buf); };
const delImg = id => { if (pool) { imgIds.delete(id); q("DELETE FROM files WHERE id = $1", [id]).catch(() => {}); } else fs.rm(imgFile(id), () => {}); };
const getImg = async id => { if (pool) { const r = await q("SELECT data FROM files WHERE id = $1", [id]); return r.rows[0] ? r.rows[0].data : null; } try { return await fs.promises.readFile(imgFile(id)); } catch { return null; } };
const rid = () => crypto.randomBytes(8).toString("hex");
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64);
const str = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";
const fail = (code, msg) => Object.assign(new Error(msg), { code });
const send = (res, code, obj, h = {}) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store", ...h }); res.end(JSON.stringify(obj)); };
const cookies = req => Object.fromEntries((req.headers.cookie || "").split(";").map(s => s.trim().split("=")).filter(a => a[0]));
const raw = (req, max) => new Promise((ok, no) => {
  let n = 0; const c = [];
  req.on("data", b => { n += b.length; if (n > max) { no(fail(413, "too big")); req.destroy(); } else c.push(b); });
  req.on("end", () => ok(Buffer.concat(c)));
});
const json = async req => { const b = await raw(req, 100e3); try { return b.length ? JSON.parse(b) : {}; } catch { throw fail(400, "bad json"); } };
const tries = {};
setInterval(() => { for (const k of Object.keys(tries)) { tries[k] = tries[k].filter(x => Date.now() - x < 6e5); if (!tries[k].length) delete tries[k]; } }, 6e5).unref();
const throttled = ip => { const t = tries[ip] = (tries[ip] || []).filter(x => Date.now() - x < 6e5); t.push(Date.now()); return t.length > 20; };
const pair = (a, b) => Object.values(d.cols.dmreq).find(r => (r.from === a && r.to === b) || (r.from === b && r.to === a));
const visible = (c, x, u) => (c === "dms" || c === "dmreq") ? (x.from === u || x.to === u) : true;
const col = c => { if (!COLS.includes(c)) throw fail(404, "not found"); return d.cols[c]; };
const okId = id => /^[A-Za-z0-9_.-]{1,80}$/.test(id);

// What each collection allows. The server decides every field that matters (author, time), never the browser.
function create(c, uid, b) {
  const now = Date.now();
  if (c === "posts") {
    const text = str(b.text, 280); let img;
    if (b.img != null) { if (!/^[a-f0-9]{16}$/.test(b.img) || !hasImg(b.img)) throw fail(400, "bad image"); img = b.img; }
    if (!text && !img) throw fail(400, "write something or add an image");
    return img ? { by: uid, text, ts: now, img } : { by: uid, text, ts: now };
  }
  if (c === "replies") {
    const text = str(b.text, 280);
    if (!text || !d.cols.posts[b.post]) throw fail(400, "bad comment");
    return { post: b.post, by: uid, text, ts: now };
  }
  if (c === "dms") {
    const to = str(b.to, 20), text = str(b.text, 500), r = pair(uid, to);
    if (!text || !d.users[to] || to === uid) throw fail(400, "bad message");
    if (!r || r.status !== "accepted") throw fail(403, "they have not accepted your request");
    return { from: uid, to, text, ts: now };
  }
  throw fail(405, "not allowed");
}
function put(c, id, uid, b, ex) {
  const now = Date.now();
  if (c === "likes") {
    if (!d.cols.posts[b.post] || id !== b.post + "_" + uid) throw fail(400, "bad like");
    return { post: b.post, by: uid, ts: ex ? ex.ts : now };
  }
  if (c === "profiles") {
    if (id !== uid) throw fail(403, "not yours");
    return { handle: uid, bio: str(b.bio, 80) };
  }
  if (c === "dmreq") {
    if (!ex) {
      const to = str(b.to, 20), text = str(b.text, 500);
      if (!d.users[to] || to === uid || !text || id !== uid + "_" + to) throw fail(400, "bad request");
      if (pair(uid, to)) throw fail(409, "you already have a request with this person");
      return { from: uid, to, text, status: "pending", ts: now };
    }
    if (ex.to !== uid || !["accepted", "declined"].includes(b.status)) throw fail(403, "not allowed");
    return { ...ex, status: b.status, ats: now };
  }
  throw fail(405, "not allowed");
}

function startSession(req, res, handle) {
  const tok = crypto.randomBytes(24).toString("hex"); d.sessions[tok] = handle; save();
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  send(res, 200, { me: handle }, { "Set-Cookie": `sid=${tok}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}` });
}

async function api(req, res, p) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress).split(",")[0].trim(), sid = cookies(req).sid, uid = d.sessions[sid];
  const me = uid && d.users[uid] ? uid : null;
  if (p === "me") return send(res, 200, { server: true, me });
  if (p === "upload") {
    if (!me) return send(res, 401, { error: "login" });
    if (req.headers["content-type"] !== "image/jpeg") return send(res, 415, { error: "jpeg only" });
    if (throttled("up:" + me)) return send(res, 429, { error: "too many uploads. wait a few minutes" });
    const buf = await raw(req, 1.5e6);
    if (buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8) return send(res, 400, { error: "that is not a jpeg" });
    const id = rid(); await putImg(id, buf); return send(res, 200, { id });
  }
  if (req.method !== "GET" && !(req.headers["content-type"] || "").includes("application/json")) return send(res, 415, { error: "json only" });
  const b = req.method === "GET" ? {} : await json(req);
  if (p === "signup") {
    if (throttled(ip)) return send(res, 429, { error: "too many attempts. wait a few minutes" });
    const h = str(b.handle, 20).toLowerCase(), pw = typeof b.password === "string" ? b.password : "";
    if (!/^(?=.*[a-z0-9])[a-z0-9._]{2,20}$/.test(h) || h === "someone") return send(res, 400, { error: "handle: 2 to 20 letters, numbers, dots or underscores" });
    if (pw.length < 8 || pw.length > 100) return send(res, 400, { error: "password needs at least 8 characters" });
    if (d.users[h]) return send(res, 409, { error: "that name is taken" });
    const salt = rid(); d.users[h] = { salt, hash: hash(pw, salt).toString("hex"), ts: Date.now() };
    d.cols.profiles[h] = { handle: h, bio: "" };
    return startSession(req, res, h);
  }
  if (p === "login") {
    const h = str(b.handle, 20).toLowerCase(), u = d.users[h], pw = typeof b.password === "string" ? b.password : "";
    if (throttled(ip) || throttled("u:" + h)) return send(res, 429, { error: "too many attempts. wait a few minutes" });
    if (!u || !crypto.timingSafeEqual(hash(pw, u.salt), Buffer.from(u.hash, "hex"))) return send(res, 401, { error: "wrong handle or password" });
    return startSession(req, res, h);
  }
  if (p === "logout") { delete d.sessions[sid]; save(); return send(res, 200, { ok: 1 }, { "Set-Cookie": "sid=; Max-Age=0; Path=/" }); }
  if (!me) return send(res, 401, { error: "login" });

  if (p === "delete-account") {
    if (req.method !== "POST") throw fail(405, "not allowed");
    if (throttled(ip)) return send(res, 429, { error: "too many attempts. wait a few minutes" });
    const u = d.users[me], pw = typeof b.password === "string" ? b.password : "";
    if (!crypto.timingSafeEqual(hash(pw, u.salt), Buffer.from(u.hash, "hex"))) return send(res, 403, { error: "wrong password" });
    const C = d.cols, mine = new Set(Object.keys(C.posts).filter(k => C.posts[k].by === me));
    for (const k of mine) { if (C.posts[k].img) delImg(C.posts[k].img); delete C.posts[k]; }
    for (const k of Object.keys(C.replies)) if (C.replies[k].by === me || mine.has(C.replies[k].post)) delete C.replies[k];
    for (const k of Object.keys(C.likes)) if (C.likes[k].by === me || mine.has(C.likes[k].post)) delete C.likes[k];
    for (const c of ["dms", "dmreq"]) for (const k of Object.keys(C[c])) if (C[c][k].from === me || C[c][k].to === me) delete C[c][k];
    delete C.profiles[me]; delete d.users[me];
    for (const t of Object.keys(d.sessions)) if (d.sessions[t] === me) delete d.sessions[t];
    save(); return send(res, 200, { ok: 1 }, { "Set-Cookie": "sid=; Max-Age=0; Path=/" });
  }

  let m;
  if ((m = /^c\/(\w+)$/.exec(p))) {
    const c = m[1], store = col(c);
    if (req.method === "GET") {
      let docs = Object.entries(store).filter(([, x]) => visible(c, x, me)).map(([id, data]) => ({ id, data }));
      if (c === "posts") docs = docs.sort((a, z) => z.data.ts - a.data.ts).slice(0, 300);
      return send(res, 200, { docs });
    }
    if (req.method === "POST") { const id = rid(); store[id] = create(c, me, b); save(); return send(res, 200, { id }); }
  }
  if ((m = /^d\/(\w+)\/([^/]+)$/.exec(p))) {
    const c = m[1], id = decodeURIComponent(m[2]), store = col(c);
    if (!okId(id)) return send(res, 400, { error: "bad id" });
    const ex = store[id] && visible(c, store[id], me) ? store[id] : null;
    if (req.method === "GET") return send(res, 200, { exists: !!ex, data: ex || null });
    if (req.method === "PUT") {
      const before = store[id], doc = put(c, id, me, b, before && visible(c, before, me) ? before : (before ? (() => { throw fail(403, "not allowed"); })() : null));
      store[id] = doc;
      if (c === "dmreq" && before && doc.status === "accepted" && before.status !== "accepted") d.cols.dms[rid()] = { from: before.from, to: before.to, text: before.text, ts: before.ts };
      save(); return send(res, 200, { ok: 1 });
    }
    if (req.method === "DELETE") {
      if (!ex || !["posts", "replies", "likes"].includes(c) || ex.by !== me) throw fail(403, "not yours");
      delete store[id];
      if (c === "posts") {
        for (const k of Object.keys(d.cols.replies)) if (d.cols.replies[k].post === id) delete d.cols.replies[k];
        for (const k of Object.keys(d.cols.likes)) if (d.cols.likes[k].post === id) delete d.cols.likes[k];
        if (ex.img) delImg(ex.img);
      }
      save(); return send(res, 200, { ok: 1 });
    }
  }
  throw fail(404, "not found");
}

const HTML = { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'" };
const server = http.createServer(async (req, res) => {
  try {
    const p = new URL(req.url, "http://x").pathname;
    if (p.startsWith("/api/")) return await api(req, res, p.slice(5));
    let m;
    if ((m = /^\/img\/([a-f0-9]{16})$/.exec(p))) {
      const buf = await getImg(m[1]);
      if (!buf) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000, immutable" }); return res.end(buf);
    }
    if (p === "/healthz") { res.writeHead(200); return res.end("ok"); }
    if (p === "/") { res.writeHead(200, HTML); return res.end(fs.readFileSync(path.join(__dirname, "public", "index.html"))); }
    res.writeHead(404); res.end("not found");
  } catch (e) { send(res, e.code >= 400 && e.code < 600 ? e.code : 400, { error: e.code ? e.message : "bad request" }); }
});
initStore().then(() => { ready = true; server.listen(PORT, () => console.log("the message running on port " + PORT + " (" + (pool ? "storing data in the database" : "storing data in " + DIR) + ")")); })
  .catch(e => { console.error("could not start:", e.message); process.exit(1); });
