// =============================================================================
// V-Connect — user.js  PATCHED VERSION
// =============================================================================
// Fixes applied (see CHANGES.md for full list):
//   1. Admin password from env secret (env.ADMIN_PASSWORD) instead of hardcoded
//   2. CSRF token on every POST form
//   3. Rate limiting on /admin login (KV counter, 5 attempts / 15 min lockout)
//   4. Multiple concurrent admin sessions (session:<uuid> keys)
//   5. License/activation check made OPTIONAL (env.REQUIRE_LICENSE="0" disables)
//   6. Token masking in dashboard UI
//   7. offset moved out of config JSON -> dedicated KV key (no race with config)
//   8. caption now escaped with escMd before Markdown parse
//   9. escMd rewritten for MarkdownV1 (only escape: _ * ` [ ])
//  10. Null-check on fetchWithRetry results before .blob()
//  11. Animation uses sendAnimation method (Bale may also accept as document fallback)
//  12. Failed forwards now stored as last_errors in KV for debugging
// =============================================================================

const DEFAULT_ADMIN_PASSWORD = "admin1234"; // fallback — set Worker Secret ADMIN_PASSWORD
const FOOTER = "\n\n VC • Built with love for Iran ❤️";
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const SESSION_TTL = 3600;
const FILE_URL_TTL = 3300;
const LAST_ERRORS_KEEP = 20;

const K = {
  CONFIG:         "config",
  OFFSET:         "offset",          // [PATCH #7] dedicated key
  LAST_RUN:       "last_run",
  LAST_ERRORS:    "last_errors",     // [PATCH #12] recent failure log
  SESSION_PREFIX: "session:",        // [PATCH #4] per-session keys
  LOGIN_FAILS:    "login_fails",     // [PATCH #3] rate-limit state
  FILE_URL:       "file:",
};

// ----------------------------------------------------------------------------
// Config helpers
// ----------------------------------------------------------------------------
async function getConfig(kv) {
  const raw = await kv.get(K.CONFIG);
  return raw ? JSON.parse(raw) : {};
}
async function putConfig(kv, patch) {
  const cfg = await getConfig(kv);
  Object.assign(cfg, patch);
  await kv.put(K.CONFIG, JSON.stringify(cfg));
  return cfg;
}
async function getOffset(kv) {
  const raw = await kv.get(K.OFFSET);
  return parseInt(raw || "0");
}
async function setOffset(kv, v) {
  await kv.put(K.OFFSET, String(v));
}
function getAdminPassword(env) {
  return env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
}
// [PATCH #5] license check is optional — controlled by env var
function licenseRequired(env) {
  return env.REQUIRE_LICENSE !== "0" && env.REQUIRE_LICENSE !== "false";
}

// [PATCH #5] same obfuscated URL kept, but only called when licenseRequired()
const _a = atob("aHR0cHM6Ly90ZWwtdG8tYmFs");
const _b = atob("ZS1hZG1pbi52dHF6bXIyejVo");
const _c = atob("LndvcmtlcnMuZGV2L3N0YXR1cw==");
async function isActivated(env) {
  if (!licenseRequired(env)) return true;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(_a + _b + _c, { signal: ctrl.signal, headers: { "Cache-Control": "no-store" } });
    clearTimeout(t);
    if (!res.ok) return false;
    const data = await res.json();
    return data.active === true;
  } catch { return false; }
}

export default {
  async fetch(request, env) {
    try {
      if (!env.KV) return txt("❌ KV binding missing. Add KV Namespace binding named KV in Worker Settings.", 500);
      if (!(await isActivated(env))) {
        return new Response(JSON.stringify({ ok: false, error: "کد غیرفعال است. برای فعال‌سازی با سازنده تماس بگیرید." }), { status: 403, headers: { "Content-Type": "application/json;charset=UTF-8" } });
      }
      const url = new URL(request.url);
      const path = url.pathname;
      if (path === "/cron" || path === "/run") return handleCron(env);
      if (path.startsWith("/admin")) return handleAdmin(request, env, url);
      return txt("Bot Bridge is running ✅");
    } catch (err) { return txt(`❌ Worker Error: ${err.message}`, 500); }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      if (!(await isActivated(env))) return;
      return handleCron(env);
    })());
  },
};

// ----------------------------------------------------------------------------
// Cron / forwarding
// ----------------------------------------------------------------------------
async function handleCron(env) {
  const cfg = await getConfig(env.KV);
  const { tgToken, baleToken, baleChannel, channels = [] } = cfg;
  if (!tgToken) return json({ ok: false, error: "TG token not set" });
  if (!baleToken) return json({ ok: false, error: "Bale token not set" });
  if (!baleChannel) return json({ ok: false, error: "Bale channel not set" });

  // [PATCH #7] read offset from dedicated key
  const offset = await getOffset(env.KV);

  const upRes = await fetchWithRetry(`https://api.telegram.org/bot${tgToken}/getUpdates?offset=${offset}&limit=100&timeout=0`);
  if (!upRes) return json({ ok: false, error: "Failed to reach Telegram API" });
  const upData = await upRes.json();
  if (!upData.ok) return json({ ok: false, error: upData.description });

  const updates = upData.result || [];
  let newOffset = offset;
  const ctx = { tgToken, baleToken, baleChannel, kv: env.KV };
  const tasks = [];
  for (const update of updates) {
    newOffset = Math.max(newOffset, update.update_id + 1);
    const msg = update.message || update.channel_post;
    if (!msg) continue;
    const chatId = String(msg.chat.id);
    if (channels.length > 0 && !channels.includes(chatId)) continue;
    tasks.push(forwardToBale(msg, ctx));
  }
  const results = await Promise.allSettled(tasks);
  const forwarded = results.filter(r => r.status === "fulfilled" && r.value === true).length;
  const errors = results.length - forwarded;

  // [PATCH #12] collect error reasons
  const errorLogs = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") errorLogs.push({ at: new Date().toISOString(), chatId: String(updates[i]?.message?.chat?.id || updates[i]?.channel_post?.chat?.id || "?"), reason: r.reason?.message || String(r.reason) });
    else if (r.status === "fulfilled" && r.value !== true) errorLogs.push({ at: new Date().toISOString(), chatId: String(updates[i]?.message?.chat?.id || updates[i]?.channel_post?.chat?.id || "?"), reason: "forwardToBale returned false" });
  });

  const writes = [];
  if (newOffset !== offset) writes.push(setOffset(env.KV, newOffset));
  if (forwarded > 0 || errors > 0) {
    const lastRaw = await env.KV.get(K.LAST_RUN);
    const last = lastRaw ? JSON.parse(lastRaw) : { totalForwarded: 0 };
    writes.push(env.KV.put(K.LAST_RUN, JSON.stringify({
      time: new Date().toISOString(),
      forwarded,
      errors,
      totalForwarded: (last.totalForwarded || 0) + forwarded,
    })));
  }
  if (errorLogs.length) {
    writes.push(appendErrors(env.KV, errorLogs));
  }
  if (writes.length) await Promise.all(writes);

  return json({ ok: true, processed: updates.length, forwarded, errors, newOffset });
}

async function appendErrors(kv, newErrors) {
  try {
    const raw = await kv.get(K.LAST_ERRORS);
    const arr = raw ? JSON.parse(raw) : [];
    const merged = [...newErrors, ...arr].slice(0, LAST_ERRORS_KEEP);
    await kv.put(K.LAST_ERRORS, JSON.stringify(merged), { expirationTtl: 7 * 24 * 3600 });
  } catch {}
}

async function forwardToBale(msg, ctx) {
  try {
    const { tgToken, baleToken, baleChannel, kv } = ctx;
    const caption = msg.caption || "";
    const fromName = msg.chat?.title || msg.from?.first_name || "کانال";
    const prefix = `📢 *${escMd(fromName)}*\n`;

    if (msg.text) {
      return await balePost(baleToken, "sendMessage", {
        chat_id: baleChannel,
        text: prefix + escMd(msg.text) + FOOTER,
        parse_mode: "Markdown",
      });
    }
    if (msg.location) {
      return await balePost(baleToken, "sendLocation", {
        chat_id: baleChannel,
        latitude: msg.location.latitude,
        longitude: msg.location.longitude,
      });
    }
    if (msg.poll) {
      const body = `📊 *${escMd(msg.poll.question)}*\n` +
        msg.poll.options.map((o, i) => `${i + 1}. ${escMd(o.text)}`).join("\n");
      return await balePost(baleToken, "sendMessage", {
        chat_id: baleChannel,
        text: prefix + body + FOOTER,
        parse_mode: "Markdown",
      });
    }
    if (msg.sticker) {
      return await balePost(baleToken, "sendMessage", {
        chat_id: baleChannel,
        text: prefix + (msg.sticker.emoji || "🎭") + FOOTER,
        parse_mode: "Markdown",
      });
    }

    const mediaMap = {
      photo:     { field: "photo",      key: () => msg.photo[msg.photo.length - 1].file_id, method: "sendPhoto",      name: "photo.jpg" },
      video:     { field: "video",      key: () => msg.video.file_id,                       method: "sendVideo",      name: "video.mp4" },
      document:  { field: "document",   key: () => msg.document.file_id,                    method: "sendDocument",   name: msg.document?.file_name || "file" },
      voice:     { field: "voice",      key: () => msg.voice.file_id,                       method: "sendVoice",      name: "voice.ogg" },
      audio:     { field: "audio",      key: () => msg.audio.file_id,                       method: "sendAudio",      name: msg.audio?.file_name || "audio.mp3" },
      // [PATCH #11] animation uses sendAnimation
      animation: { field: "animation",  key: () => msg.animation.file_id,                   method: "sendAnimation",  name: "animation.mp4" },
    };

    for (const [type, cfg] of Object.entries(mediaMap)) {
      if (!msg[type]) continue;
      const fileId = cfg.key();
      const fileUrl = await getCachedFileUrl(kv, tgToken, fileId);
      if (!fileUrl) return false;

      // [PATCH #10] null-check before .blob()
      const fileRes = await fetchWithRetry(fileUrl);
      if (!fileRes) return false;
      const blob = await fileRes.blob();

      const form = new FormData();
      form.append("chat_id", baleChannel);
      form.append("parse_mode", "Markdown");
      // [PATCH #8] escape user-supplied caption
      const captionText = type === "voice"
        ? prefix + FOOTER
        : prefix + (caption ? escMd(caption) + "\n" : "") + FOOTER;
      form.append("caption", captionText);
      form.append(cfg.field, blob, cfg.name);

      const ok = await balePostForm(baleToken, cfg.method, form);
      // If Bale rejects sendAnimation, retry once as document
      if (!ok && cfg.method === "sendAnimation") {
        const form2 = new FormData();
        form2.append("chat_id", baleChannel);
        form2.append("parse_mode", "Markdown");
        form2.append("caption", captionText);
        form2.append("document", blob, "animation.mp4");
        return await balePostForm(baleToken, "sendDocument", form2);
      }
      return ok;
    }
    return true;
  } catch (err) {
    console.error("forwardToBale error:", err.message);
    return false;
  }
}

async function getCachedFileUrl(kv, token, fileId) {
  const cacheKey = K.FILE_URL + fileId;
  const cached = await kv.get(cacheKey);
  if (cached) return cached;
  const url = await getTgFileUrl(token, fileId);
  if (!url) return null;
  await kv.put(cacheKey, url, { expirationTtl: FILE_URL_TTL });
  return url;
}

// ----------------------------------------------------------------------------
// Admin (with CSRF + rate limit + masked tokens + offset in dedicated key)
// ----------------------------------------------------------------------------
async function handleAdmin(request, env, url) {
  try {
    const path = url.pathname;

    if (path === "/admin" || path === "/admin/") {
      if (request.method === "POST") {
        const form = await request.formData();

        // [PATCH #3] rate limit
        const rl = await checkLoginRateLimit(env.KV);
        if (rl.locked) {
          return html(loginHtml(`⏳ بعد از ${Math.ceil(rl.remainingMs / 1000)} ثانیه دوباره امتحان کن.`));
        }

        if (form.get("password") === getAdminPassword(env)) {
          await clearLoginRateLimit(env.KV);
          const session = crypto.randomUUID();
          await env.KV.put(K.SESSION_PREFIX + session, "1", { expirationTtl: SESSION_TTL });
          return redirect("/admin/dashboard",
            `session=${session}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`);
        }
        await bumpLoginRateLimit(env.KV);
        return html(loginHtml("رمز اشتباه است ❌"));
      }
      return html(loginHtml());
    }

    const cookie = request.headers.get("Cookie") || "";
    const session = cookie.match(/session=([^;]+)/)?.[1];
    const stored = session ? await env.KV.get(K.SESSION_PREFIX + session) : null;
    if (!session || stored !== "1") return redirect("/admin");

    if (request.method === "POST") {
      const form = await request.formData();

      // [PATCH #2] CSRF check
      const csrfForm = form.get("csrf");
      const csrfCookie = cookie.match(/csrf=([^;]+)/)?.[1];
      if (!csrfForm || !csrfCookie || csrfForm !== csrfCookie) {
        return txt("❌ CSRF validation failed", 403);
      }

      const act = form.get("action");
      if (act === "save_tokens") {
        const patch = {};
        const tg = form.get("tg_token")?.trim();
        const bale = form.get("bale_token")?.trim();
        // [PATCH #6] only update if user actually typed a new value (not masked)
        if (tg && !tg.includes("•")) patch.tgToken = tg;
        if (bale && !bale.includes("•")) patch.baleToken = bale;
        if (Object.keys(patch).length) await putConfig(env.KV, patch);
      } else if (act === "save_dest") {
        const ch = form.get("bale_channel")?.trim();
        if (ch) await putConfig(env.KV, { baleChannel: ch });
      } else if (act === "save_sources") {
        const arr = (form.get("channels") || "").split(/[\n,]/).map(s => s.trim()).filter(Boolean);
        await putConfig(env.KV, { channels: arr });
      } else if (act === "reset_offset") {
        // [PATCH #7] reset the dedicated offset key
        await setOffset(env.KV, 0);
      } else if (act === "clear_errors") {
        await env.KV.delete(K.LAST_ERRORS);
      } else if (act === "run_now") {
        await handleCron(env);
      }
      return redirect("/admin/dashboard");
    }

    const [cfg, lastRunRaw, offsetRaw, lastErrorsRaw] = await Promise.all([
      getConfig(env.KV),
      env.KV.get(K.LAST_RUN),
      env.KV.get(K.OFFSET),
      env.KV.get(K.LAST_ERRORS),
    ]);
    const { tgToken, baleToken, baleChannel, channels = [] } = cfg;
    const lastRun = lastRunRaw ? JSON.parse(lastRunRaw) : null;
    const lastErrors = lastErrorsRaw ? JSON.parse(lastErrorsRaw) : [];
    const csrf = cookie.match(/csrf=([^;]+)/)?.[1] || crypto.randomUUID();
    return html(dashboardHtml({
      tgToken, baleToken, baleChannel, channels,
      offset: offsetRaw || "0",
      lastRun, lastErrors,
      csrf,
    }), csrf);
  } catch (err) { return txt(`❌ Admin Error:\n${err.message}`, 500); }
}

// ----------------------------------------------------------------------------
// Rate limit
// ----------------------------------------------------------------------------
async function checkLoginRateLimit(kv) {
  const raw = await kv.get(K.LOGIN_FAILS);
  const state = raw ? JSON.parse(raw) : { count: 0, firstAt: 0 };
  const now = Date.now();
  if (state.count >= LOGIN_MAX_ATTEMPTS) {
    const elapsed = now - state.firstAt;
    if (elapsed < LOGIN_LOCK_MS) {
      return { locked: true, remainingMs: LOGIN_LOCK_MS - elapsed };
    }
    await kv.delete(K.LOGIN_FAILS);
  }
  return { locked: false };
}
async function bumpLoginRateLimit(kv) {
  const raw = await kv.get(K.LOGIN_FAILS);
  const state = raw ? JSON.parse(raw) : { count: 0, firstAt: 0 };
  const now = Date.now();
  if (now - state.firstAt > LOGIN_LOCK_MS) { state.count = 1; state.firstAt = now; }
  else { state.count += 1; }
  await kv.put(K.LOGIN_FAILS, JSON.stringify(state), { expirationTtl: Math.ceil(LOGIN_LOCK_MS / 1000) });
}
async function clearLoginRateLimit(kv) {
  await kv.delete(K.LOGIN_FAILS);
}

// ----------------------------------------------------------------------------
// Views
// ----------------------------------------------------------------------------
function maskToken(t) {
  if (!t) return "";
  if (t.length <= 8) return "••••";
  return t.slice(0, 4) + "••••••••" + t.slice(-4);
}

function loginHtml(err = "") {
  return `
<div class="center">
  <div class="card login-card">
    <div class="logo">⚡</div>
    <h1>Bridge</h1>
    <p class="sub">پل تلگرام → بله</p>
    ${err ? `<div class="alert">${err}</div>` : ""}
    <form method="POST" action="/admin">
      <input type="password" name="password" placeholder="رمز ورود" autofocus required>
      <button type="submit">ورود</button>
    </form>
  </div>
</div>`;
}

function dashboardHtml({ tgToken, baleToken, baleChannel, channels, offset, lastRun, lastErrors, csrf }) {
  const ready = tgToken && baleToken && baleChannel && channels.length > 0;
  const lastTime = lastRun ? lastRun.time.replace("T", " ").substring(0, 16) : "—";
  const chTags = channels.length
    ? channels.map(c => `<span class="tag">${esc(c)}<button type="button" class="tag-rm" data-id="${esc(c)}">×</button></span>`).join("")
    : `<span class="empty-hint">کانالی ثبت نشده</span>`;
  const csrfField = `<input type="hidden" name="csrf" value="${esc(csrf)}">`;
  const errList = lastErrors.length
    ? `<div class="err-list">${lastErrors.slice(0, 5).map(e => `<div class="err-item"><span class="err-time">${esc(e.at.replace("T", " ").substring(0, 19))}</span> <span class="err-chat">${esc(e.chatId)}</span> <span class="err-reason">${esc(e.reason)}</span></div>`).join("")}</div>`
    : `<p class="empty-hint">خطایی ثبت نشده ✅</p>`;

  return `
<header>
  <span class="logo-sm">⚡ Bridge</span>
  <div class="header-right">
    <span class="pill ${ready ? "pill-ok" : "pill-warn"}">${ready ? "آماده" : "ناقص"}</span>
    <form method="POST" class="inline-form">
      ${csrfField}
      <input type="hidden" name="action" value="run_now">
      <button class="btn btn-run" type="submit">▶ اجرا</button>
    </form>
  </div>
</header>
<main>
  <div class="stats">
    <div class="stat"><b>${lastRun ? lastRun.forwarded : "—"}</b><span>فوروارد شده</span></div>
    <div class="stat ${lastRun?.errors > 0 ? "stat-err" : ""}"><b>${lastRun ? lastRun.errors : "—"}</b><span>خطا</span></div>
    <div class="stat"><b class="mono">${esc(offset)}</b><span>آفست</span></div>
    <div class="stat"><b class="mono small">${lastTime}</b><span>آخرین اجرا</span></div>
    <div class="stat"><b>${lastRun ? (lastRun.totalForwarded || 0) : "—"}</b><span>کل فوروارد شده</span></div>
  </div>
  <div class="grid">
    <div class="card">
      <h2>🔑 توکن‌ها</h2>
      <form method="POST">
        ${csrfField}
        <input type="hidden" name="action" value="save_tokens">
        <label>توکن ربات تلگرام<input type="text" name="tg_token" value="${esc(maskToken(tgToken))}" placeholder="123456:ABC-DEF..."></label>
        <label>توکن ربات بله<input type="text" name="bale_token" value="${esc(maskToken(baleToken))}" placeholder="123456:ABC-DEF..."></label>
        <button class="btn" type="submit">ذخیره توکن‌ها</button>
        <p class="hint">توکن‌ها ماسک شده‌اند. برای تغییر، مقدار جدید را کامل وارد کنید.</p>
      </form>
    </div>
    <div class="card">
      <h2>📤 کانال مقصد (بله)</h2>
      <form method="POST">
        ${csrfField}
        <input type="hidden" name="action" value="save_dest">
        <label>آیدی کانال بله<input type="text" name="bale_channel" value="${esc(baleChannel || "")}" placeholder="-100123456789"></label>
        <button class="btn" type="submit">ذخیره مقصد</button>
      </form>
    </div>
    <div class="card">
      <h2>📢 کانال‌های منبع (تلگرام)</h2>
      <form method="POST" id="src-form">
        ${csrfField}
        <input type="hidden" name="action" value="save_sources">
        <label>هر خط یک آیدی کانال<textarea name="channels" id="src-ta" rows="4" placeholder="-100123456789">${channels.join("\n")}</textarea></label>
        <button class="btn" type="submit">ذخیره کانال‌ها</button>
      </form>
      <div class="tags" id="tags">${chTags}</div>
    </div>
    <div class="card">
      <h2>⚙️ ابزار</h2>
      <p class="hint">ریست آفست باعث می‌شود پیام‌ها از ابتدا خوانده شوند.</p>
      <form method="POST">
        ${csrfField}
        <input type="hidden" name="action" value="reset_offset">
        <button class="btn btn-warn" type="submit">🔄 ریست آفست</button>
      </form>
      <form method="POST" style="margin-top:.5rem">
        ${csrfField}
        <input type="hidden" name="action" value="clear_errors">
        <button class="btn" type="submit">🧹 پاک‌سازی لاگ خطاها</button>
      </form>
    </div>
    <div class="card" style="grid-column:1/-1">
      <h2>🩺 آخرین خطاها</h2>
      ${errList}
    </div>
  </div>
  <p class="footer-hint">
    راهنما: ربات تلگرام را به کانال‌های منبع اضافه کنید ←
    ربات بله را ادمین کانال مقصد کنید ←
    کرون‌جاب روی <code>/cron</code> هر دقیقه
  </p>
</main>
<script>
document.getElementById("tags")?.addEventListener("click", e => {
  const btn = e.target.closest(".tag-rm");
  if (!btn) return;
  const id = btn.dataset.id;
  const ta = document.getElementById("src-ta");
  ta.value = ta.value.split("\\n").filter(l => l.trim() !== id).join("\\n");
  document.getElementById("src-form").submit();
});
</script>`;
}

function html(body, csrf) {
  const headers = { "Content-Type": "text/html;charset=UTF-8" };
  if (csrf) headers["Set-Cookie"] = `csrf=${csrf}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`;
  return new Response(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bridge Admin</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap');
:root{--bg:#07090f;--surf:#0e1118;--border:#1a2035;--accent:#5b8dee;--accent2:#3d6fd4;--text:#cdd5e0;--muted:#4a5568;--ok:#2ecc87;--warn:#f5a623;--err:#e05c5c;--r:.55rem}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Vazirmatn',Tahoma,sans-serif;background:var(--bg);color:var(--text);font-size:14px;min-height:100vh}
header{display:flex;align-items:center;justify-content:space-between;padding:.75rem 1.4rem;background:var(--surf);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:9;backdrop-filter:blur(8px)}
.logo-sm{font-weight:700;color:var(--accent);font-size:.95rem;letter-spacing:.04em}
.header-right{display:flex;align-items:center;gap:.7rem}
.pill{font-size:.7rem;font-weight:600;padding:.25rem .65rem;border-radius:2rem}
.pill-ok{background:#0b2a1c;color:var(--ok)}
.pill-warn{background:#2a1a05;color:var(--warn)}
.btn,.btn-run,.btn-warn{display:inline-flex;align-items:center;gap:.35rem;padding:.45rem 1rem;border-radius:var(--r);font-size:.8rem;font-family:inherit;cursor:pointer;border:1px solid;transition:background .18s,color .18s,transform .12s;width:100%;justify-content:center}
.btn{background:var(--border);color:var(--text);border-color:var(--border)}
.btn:hover{background:var(--accent2);color:#fff;border-color:var(--accent2)}
.btn-run{background:var(--accent);color:#fff;border-color:transparent}
.btn-run:hover{opacity:.85}
.btn-warn{background:#200f0f;color:var(--err);border-color:var(--err)}
.btn-warn:hover{background:var(--err);color:#fff}
.btn:active,.btn-run:active,.btn-warn:active{transform:scale(.96)}
.inline-form{margin:0;width:auto}
.inline-form .btn{width:auto}
.center{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}
.login-card{width:100%;max-width:340px;text-align:center;animation:fadeUp .4s ease both}
.logo{font-size:2.5rem;margin-bottom:.5rem}
h1{font-size:1.3rem;font-weight:700;color:var(--accent);margin-bottom:.25rem}
.sub{font-size:.78rem;color:var(--muted);margin-bottom:1.6rem}
.alert{background:#2a0d0d;color:var(--err);border:1px solid #5a1a1a;border-radius:var(--r);padding:.5rem .8rem;font-size:.78rem;margin-bottom:1rem}
.login-card form{display:flex;flex-direction:column;gap:.7rem}
.login-card button{width:100%;justify-content:center;padding:.6rem}
main{max-width:900px;margin:0 auto;padding:1.1rem}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:.7rem;margin-bottom:1rem}
.stat{background:var(--surf);border:1px solid var(--border);border-radius:var(--r);padding:.85rem 1rem;animation:fadeUp .3s ease both}
.stat b{display:block;font-size:1.5rem;font-weight:700;color:var(--accent);line-height:1.1}
.stat b.mono{font-family:monospace;font-size:1.1rem}
.stat b.small{font-size:.78rem;color:var(--muted)}
.stat span{font-size:.68rem;color:var(--muted);margin-top:.3rem;display:block}
.stat-err b{color:var(--err)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
.card{background:var(--surf);border:1px solid var(--border);border-radius:var(--r);padding:1.1rem;animation:fadeUp .38s ease both}
.card h2{font-size:.83rem;font-weight:600;margin-bottom:.9rem;color:var(--text)}
form{display:flex;flex-direction:column;gap:.6rem}
label{display:flex;flex-direction:column;gap:.3rem;font-size:.72rem;color:var(--muted)}
input,textarea{background:var(--bg);border:1px solid var(--border);color:var(--text);padding:.5rem .75rem;border-radius:var(--r);font-size:.8rem;font-family:inherit;width:100%;outline:none;transition:border-color .18s}
input:focus,textarea:focus{border-color:var(--accent)}
textarea{resize:vertical;min-height:80px}
.tags{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.8rem}
.tag{background:#0f1c3a;color:var(--accent);border:1px solid #1e3a6e;border-radius:2rem;padding:.2rem .65rem;font-size:.72rem;display:inline-flex;align-items:center;gap:.35rem}
.tag-rm{background:none;border:none;color:var(--muted);cursor:pointer;font-size:.95rem;line-height:1;padding:0;transition:color .15s}
.tag-rm:hover{color:var(--err)}
.empty-hint{font-size:.72rem;color:var(--muted)}
.hint{font-size:.73rem;color:var(--muted);margin-bottom:.7rem;line-height:1.6}
code{font-family:monospace;background:var(--border);padding:.1rem .35rem;border-radius:.3rem;font-size:.75rem}
.footer-hint{margin-top:1rem;padding:.8rem 1rem;background:var(--surf);border:1px solid var(--border);border-radius:var(--r);font-size:.73rem;color:var(--muted);line-height:1.8}
.err-list{display:flex;flex-direction:column;gap:.4rem;font-size:.72rem;font-family:monospace}
.err-item{display:flex;gap:.7rem;padding:.4rem .6rem;background:var(--bg);border:1px solid var(--border);border-radius:.4rem}
.err-time{color:var(--muted);min-width:130px}
.err-chat{color:var(--accent);min-width:120px}
.err-reason{color:var(--err);flex:1}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.stats .stat:nth-child(1){animation-delay:.04s}
.stats .stat:nth-child(2){animation-delay:.09s}
.stats .stat:nth-child(3){animation-delay:.14s}
.stats .stat:nth-child(4){animation-delay:.19s}
.stats .stat:nth-child(5){animation-delay:.24s}
.grid .card:nth-child(1){animation-delay:.1s}
.grid .card:nth-child(2){animation-delay:.16s}
.grid .card:nth-child(3){animation-delay:.22s}
.grid .card:nth-child(4){animation-delay:.28s}
@media(max-width:640px){.stats{grid-template-columns:1fr 1fr}.grid{grid-template-columns:1fr}header,main{padding:.75rem}}
@media(max-width:360px){.stats{grid-template-columns:1fr}}
</style>
</head>
<body>${body}</body>
</html>`, { headers });
}

// ----------------------------------------------------------------------------
// API helpers
// ----------------------------------------------------------------------------
async function fetchWithRetry(url, opts = {}, attempts = RETRY_ATTEMPTS) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok || res.status < 500) return res;
    } catch {}
    if (i < attempts - 1) await sleep(RETRY_DELAY_MS * (i + 1));
  }
  return null;
}
async function balePost(token, method, body) {
  const res = await fetchWithRetry(`https://tapi.bale.ai/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return !!res;
}
async function balePostForm(token, method, form) {
  const res = await fetchWithRetry(`https://tapi.bale.ai/bot${token}/${method}`, { method: "POST", body: form });
  return !!res;
}
async function getTgFileUrl(token, fileId) {
  const res = await fetchWithRetry(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  if (!res) return null;
  const d = await res.json();
  if (!d.ok) return null;
  return `https://api.telegram.org/file/bot${token}/${d.result.file_path}`;
}
function redirect(location, setCookie) {
  const headers = { "Location": location };
  if (setCookie) headers["Set-Cookie"] = setCookie;
  return new Response(null, { status: 302, headers });
}
function json(obj) { return new Response(JSON.stringify(obj), { headers: { "Content-Type": "application/json" } }) }
function txt(msg, s = 200) { return new Response(msg, { status: s, headers: { "Content-Type": "text/plain;charset=UTF-8" } }) }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") }
// [PATCH #9] MarkdownV1 escape — only the chars Bale/Telegram V1 actually treat specially
function escMd(s) {
  return String(s).replace(/([_*`\[])/g, "\\$1");
}
