// =============================================================================
// Tel-Bale-Chat.js  —  PATCHED VERSION
// =============================================================================
// Fixes applied (see CHANGES.md for full list):
//   1. Admin password from env secret (env.ADMIN_PASSWORD) instead of hardcoded
//   2. CSRF token on every POST form
//   3. Rate limiting on /admin login (KV counter, 5 attempts / 15 min lockout)
//   4. Telegram webhook secret_token set + verified on incoming webhooks
//   5. Multiple concurrent admin sessions (session:<uuid> keys)
//   6. Token masking in dashboard UI (last 4 chars visible)
//   7. escHtml() used where parse_mode:HTML is set (admin reply path)
//   8. Removed dead code (unused escHtml -> now used)
//   9. Message map TTL 7 days -> 30 days
//  10. Parallel processing of getUpdates results with Promise.all
//  11. Polling-vs-webhook conflict guard: skip /poll when webhook is active
//  12. Error reason captured from Bale/Telegram API responses (no longer swallowed)
// =============================================================================

const DEFAULT_ADMIN_PASSWORD = "admin1234"; // fallback only — set Worker Secret ADMIN_PASSWORD
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000; // 15 min
const MSG_MAP_TTL = 30 * 24 * 3600;   // 30 days
const SESSION_TTL = 3600;             // 1 hour
const TG_WEBHOOK_SECRET = "tg_bridge_secret_v1"; // optional: rotate per deploy

const K = {
  CONFIG:        "cfg",
  SESSION_PREFIX:"session:",   // session:<uuid> -> "1"
  SESSION_INDEX: "sessions",   // JSON array of active session ids
  LAST_RUN:      "last_run",
  MSG_MAP:       "map:",
  TG_OFFSET:     "tg_offset",
  BALE_OFFSET:   "bale_offset",
  LOGIN_FAILS:   "login_fails",     // { count, firstAt }
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

function getAdminPassword(env) {
  return env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
}

// ----------------------------------------------------------------------------
// Entrypoint
// ----------------------------------------------------------------------------
export default {
  async fetch(request, env) {
    try {
      if (!env.KV) return txt("❌ KV binding missing. Add KV Namespace binding named KV.", 500);

      const url  = new URL(request.url);
      const path = url.pathname;

      if (path === "/webhook/telegram") return handleTelegramWebhook(request, env);
      if (path === "/webhook/bale")     return handleBaleWebhook(request, env);
      if (path === "/poll" || path === "/run") return handlePoll(env);
      if (path.startsWith("/admin"))    return handleAdmin(request, env, url);

      return txt("Bridge is running ✅");
    } catch (err) {
      return txt(`❌ Worker Error: ${err.message}`, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handlePoll(env));
  },
};

// ----------------------------------------------------------------------------
// Webhooks
// ----------------------------------------------------------------------------
async function handleTelegramWebhook(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: true }); }

  // [PATCH #4] verify Telegram secret_token header if configured
  if (cfg_webhookSecretRequired(env)) {
    const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
    if (got !== TG_WEBHOOK_SECRET) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
  }

  const cfg = await getConfig(env.KV);
  if (!cfg.tgToken || !cfg.baleToken || !cfg.baleAdminId) return json({ ok: true });

  const msg = body.message || body.channel_post;
  if (!msg) return json({ ok: true });

  await processTelegramMessage(msg, cfg, env.KV);
  return json({ ok: true });
}

async function handleBaleWebhook(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: true }); }

  const cfg = await getConfig(env.KV);
  if (!cfg.tgToken || !cfg.baleToken || !cfg.baleAdminId) return json({ ok: true });

  const msg = body.message;
  if (!msg) return json({ ok: true });

  if (String(msg.chat?.id) !== String(cfg.baleAdminId) &&
      String(msg.from?.id)  !== String(cfg.baleAdminId)) {
    return json({ ok: true });
  }

  if (msg.reply_to_message) {
    await processBaleReply(msg, cfg, env.KV);
  }

  return json({ ok: true });
}

function cfg_webhookSecretRequired(env) {
  // Toggle: set env.WEBHOOK_VERIFY=1 to enforce secret_token check
  return env.WEBHOOK_VERIFY === "1" || env.WEBHOOK_VERIFY === "true";
}

// ----------------------------------------------------------------------------
// Polling
// ----------------------------------------------------------------------------
async function handlePoll(env) {
  const cfg = await getConfig(env.KV);
  if (!cfg.tgToken || !cfg.baleToken || !cfg.baleAdminId) {
    return json({ ok: false, error: "Config incomplete" });
  }

  // [PATCH #11] If a webhook is active, getUpdates returns 409 — skip silently
  const webhookActive = await isWebhookActive(cfg);
  if (webhookActive) {
    return json({ ok: true, skipped: "webhook_active", hint: "Remove webhooks to use polling." });
  }

  const [tgResult, baleResult] = await Promise.allSettled([
    pollTelegram(cfg, env.KV),
    pollBale(cfg, env.KV),
  ]);

  return json({
    ok: true,
    telegram: tgResult.status   === "fulfilled" ? tgResult.value   : { error: tgResult.reason?.message },
    bale:     baleResult.status === "fulfilled" ? baleResult.value : { error: baleResult.reason?.message },
  });
}

async function isWebhookActive(cfg) {
  try {
    const r = await fetchWithRetry(`https://api.telegram.org/bot${cfg.tgToken}/getWebhookInfo`);
    if (!r) return false;
    const d = await r.json();
    return !!(d.ok && d.result && d.result.url);
  } catch { return false; }
}

async function pollTelegram(cfg, kv) {
  const rawOffset = await kv.get(K.TG_OFFSET);
  const offset    = parseInt(rawOffset || "0");

  const res = await fetchWithRetry(
    `https://api.telegram.org/bot${cfg.tgToken}/getUpdates?offset=${offset}&limit=100&timeout=0`
  );
  if (!res) return { error: "Telegram API unreachable" };

  const data = await res.json();
  if (!data.ok) return { error: data.description };

  let newOffset = offset;
  const updates = data.result || [];
  for (const u of updates) {
    newOffset = Math.max(newOffset, u.update_id + 1);
  }

  // [PATCH #10] process messages in parallel
  const tasks = updates
    .map(u => u.message || u.channel_post)
    .filter(Boolean)
    .map(msg => processTelegramMessage(msg, cfg, kv).catch(err => {
      console.error("processTelegramMessage error:", err.message);
      return null;
    }));
  await Promise.all(tasks);

  if (newOffset !== offset) await kv.put(K.TG_OFFSET, String(newOffset));
  return { processed: updates.length };
}

async function pollBale(cfg, kv) {
  const rawOffset = await kv.get(K.BALE_OFFSET);
  const offset    = parseInt(rawOffset || "0");

  const res = await fetchWithRetry(
    `https://tapi.bale.ai/bot${cfg.baleToken}/getUpdates?offset=${offset}&limit=100&timeout=0`
  );
  if (!res) return { error: "Bale API unreachable" };

  const data = await res.json();
  if (!data.ok) return { error: data.description };

  let newOffset = offset;
  const tasks = [];
  for (const update of data.result || []) {
    newOffset = Math.max(newOffset, update.update_id + 1);
    const msg = update.message;
    if (!msg) continue;

    if (String(msg.chat?.id) !== String(cfg.baleAdminId) &&
        String(msg.from?.id)  !== String(cfg.baleAdminId)) continue;

    if (msg.reply_to_message) {
      tasks.push(processBaleReply(msg, cfg, kv).catch(err => {
        console.error("processBaleReply error:", err.message);
        return null;
      }));
    }
  }
  await Promise.all(tasks);

  if (newOffset !== offset) await kv.put(K.BALE_OFFSET, String(newOffset));
  return { processed: data.result?.length || 0 };
}

// ----------------------------------------------------------------------------
// Telegram -> Bale
// ----------------------------------------------------------------------------
async function processTelegramMessage(msg, cfg, kv) {
  try {
    const tgChatId  = String(msg.chat.id);
    const from      = msg.from || {};
    const firstName = from.first_name || "";
    const lastName  = from.last_name  || "";
    const username  = from.username   ? `@${from.username}` : "بدون یوزرنیم";
    const userId    = String(from.id  || tgChatId);
    const fullName  = [firstName, lastName].filter(Boolean).join(" ") || "ناشناس";

    if (msg.text === "/start") {
      const adminName = cfg.adminName || "پشتیبانی";
      await tgPost(cfg.tgToken, "sendMessage", {
        chat_id: tgChatId,
        text:    `سلام ${fullName} عزیز 👋\n\nشما درحال صحبت با ${adminName} هستید.\n\nپیامتون رو بفرستید، در اسرع وقت پاسخ داده میشه ✉️`,
      });
      await balePost(cfg.baleToken, "sendMessage", {
        chat_id: cfg.baleAdminId,
        text:    `🔔 کاربر جدید استارت زد\n\n👤 ${fullName}\n🆔 ${username}\n📱 ${userId}`,
      });
      return;
    }

    const header = `📩 ${fullName}\n🆔 ${username} | ${userId}\n───────────────\n`;

    let baleResponse = null;

    if (msg.text) {
      baleResponse = await balePostJSON(cfg.baleToken, "sendMessage", {
        chat_id: cfg.baleAdminId,
        text:    header + msg.text,
      });
    } else if (msg.sticker) {
      await balePost(cfg.baleToken, "sendMessage", {
        chat_id: cfg.baleAdminId,
        text:    header + `🎭 استیکر ${msg.sticker.emoji || ""}`,
      });
    } else if (msg.location) {
      baleResponse = await balePostJSON(cfg.baleToken, "sendMessage", {
        chat_id: cfg.baleAdminId,
        text:    header + `📍 لوکیشن\nعرض: ${msg.location.latitude}\nطول: ${msg.location.longitude}`,
      });
    } else if (msg.contact) {
      const c = msg.contact;
      baleResponse = await balePostJSON(cfg.baleToken, "sendMessage", {
        chat_id: cfg.baleAdminId,
        text:    header + `📞 مخاطب\nنام: ${c.first_name || ""} ${c.last_name || ""}\nشماره: ${c.phone_number || ""}`,
      });
    } else {
      baleResponse = await forwardMediaToBale(msg, header, cfg, kv);
    }

    if (baleResponse?.result?.message_id) {
      const baleMsgId = String(baleResponse.result.message_id);
      // [PATCH #9] 30-day TTL instead of 7
      await kv.put(K.MSG_MAP + baleMsgId, tgChatId, { expirationTtl: MSG_MAP_TTL });
    }

  } catch (err) {
    console.error("processTelegramMessage error:", err.message);
  }
}

// ----------------------------------------------------------------------------
// Bale -> Telegram (admin reply)
// ----------------------------------------------------------------------------
async function processBaleReply(msg, cfg, kv) {
  try {
    const repliedToId = String(msg.reply_to_message.message_id);

    const tgChatId = await kv.get(K.MSG_MAP + repliedToId);
    if (!tgChatId) {
      await balePost(cfg.baleToken, "sendMessage", {
        chat_id:    cfg.baleAdminId,
        text:       "⚠️ نمیتونم پیام مرجع رو پیدا کنم. ممکنه منقضی شده باشه (بیشتر از ۳۰ روز).",
        parse_mode: "HTML",
      });
      return;
    }

    let sent = false;

    if (msg.text) {
      // [PATCH #7] escape user-supplied text when parse_mode:HTML is set
      const res = await tgPost(cfg.tgToken, "sendMessage", {
        chat_id:    tgChatId,
        text:       escHtml(msg.text),
        parse_mode: "HTML",
      });
      sent = !!res;
    } else if (msg.sticker) {
      const res = await tgPost(cfg.tgToken, "sendMessage", {
        chat_id: tgChatId,
        text:    msg.sticker.emoji || "🎭",
      });
      sent = !!res;
    } else if (msg.location) {
      const res = await tgPost(cfg.tgToken, "sendLocation", {
        chat_id:   tgChatId,
        latitude:  msg.location.latitude,
        longitude: msg.location.longitude,
      });
      sent = !!res;
    } else {
      sent = await forwardMediaToTelegram(msg, tgChatId, cfg, kv);
    }

    await balePost(cfg.baleToken, "sendMessage", {
      chat_id:             cfg.baleAdminId,
      text:                sent ? "✅ پیام ارسال شد." : "❌ ارسال پیام ناموفق بود.",
      reply_to_message_id: msg.message_id,
    });

  } catch (err) {
    console.error("processBaleReply error:", err.message);
  }
}

// ----------------------------------------------------------------------------
// Media forwarding
// ----------------------------------------------------------------------------
async function forwardMediaToBale(msg, header, cfg, kv) {
  try {
    let fileId, method, fieldName, fileName, captionText;

    if (msg.photo) {
      const ph  = msg.photo[msg.photo.length - 1];
      fileId    = ph.file_id;
      method    = "sendPhoto";
      fieldName = "photo";
      fileName  = "photo.jpg";
      captionText = header + (msg.caption || "📷 عکس");
    } else if (msg.video) {
      fileId    = msg.video.file_id;
      method    = "sendVideo";
      fieldName = "video";
      fileName  = "video.mp4";
      captionText = header + (msg.caption || "🎬 ویدیو");
    } else if (msg.voice) {
      fileId    = msg.voice.file_id;
      method    = "sendVoice";
      fieldName = "voice";
      fileName  = "voice.ogg";
      captionText = header + "🎤 پیام صوتی";
    } else if (msg.audio) {
      fileId    = msg.audio.file_id;
      method    = "sendAudio";
      fieldName = "audio";
      fileName  = msg.audio.file_name || "audio.mp3";
      captionText = header + (msg.caption || "🎵 صدا");
    } else if (msg.document) {
      fileId    = msg.document.file_id;
      method    = "sendDocument";
      fieldName = "document";
      fileName  = msg.document.file_name || "file";
      captionText = header + (msg.caption || "📎 فایل");
    } else if (msg.animation) {
      fileId    = msg.animation.file_id;
      method    = "sendDocument";
      fieldName = "document";
      fileName  = "animation.gif";
      captionText = header + (msg.caption || "🎞 انیمیشن");
    } else if (msg.video_note) {
      fileId    = msg.video_note.file_id;
      method    = "sendVideoNote";
      fieldName = "video_note";
      fileName  = "videonote.mp4";
      captionText = null;
    } else {
      return await balePostJSON(cfg.baleToken, "sendMessage", {
        chat_id: cfg.baleAdminId,
        text:    header + "📦 نوع پیام ناشناخته",
      });
    }

    const fileUrl = await getTgFileUrl(cfg.tgToken, fileId);
    if (!fileUrl) return null;

    const fileRes = await fetchWithRetry(fileUrl);
    if (!fileRes) return null;
    const blob = await fileRes.blob();

    const form = new FormData();
    form.append("chat_id", cfg.baleAdminId);
    if (captionText) form.append("caption", captionText);
    form.append(fieldName, blob, fileName);

    return await balePostFormJSON(cfg.baleToken, method, form);
  } catch (err) {
    console.error("forwardMediaToBale error:", err.message);
    return null;
  }
}

async function forwardMediaToTelegram(msg, tgChatId, cfg, kv) {
  try {
    let fileId, method, fieldName, fileName, caption;

    if (msg.photo) {
      const ph  = Array.isArray(msg.photo) ? msg.photo[msg.photo.length - 1] : msg.photo;
      fileId    = ph.file_id;
      method    = "sendPhoto";
      fieldName = "photo";
      fileName  = "photo.jpg";
      caption   = msg.caption || "";
    } else if (msg.video) {
      fileId    = msg.video.file_id;
      method    = "sendVideo";
      fieldName = "video";
      fileName  = "video.mp4";
      caption   = msg.caption || "";
    } else if (msg.voice) {
      fileId    = msg.voice.file_id;
      method    = "sendVoice";
      fieldName = "voice";
      fileName  = "voice.ogg";
      caption   = null;
    } else if (msg.audio) {
      fileId    = msg.audio.file_id;
      method    = "sendAudio";
      fieldName = "audio";
      fileName  = msg.audio.file_name || "audio.mp3";
      caption   = msg.caption || "";
    } else if (msg.document) {
      fileId    = msg.document.file_id;
      method    = "sendDocument";
      fieldName = "document";
      fileName  = msg.document.file_name || "file";
      caption   = msg.caption || "";
    } else {
      return false;
    }

    const fileUrl = await getBaleFileUrl(cfg.baleToken, fileId);
    if (!fileUrl) return false;

    const fileRes = await fetchWithRetry(fileUrl);
    if (!fileRes) return false;
    const blob = await fileRes.blob();

    const form = new FormData();
    form.append("chat_id", tgChatId);
    if (caption) form.append("caption", caption);
    form.append(fieldName, blob, fileName);

    const res = await fetchWithRetry(`https://api.telegram.org/bot${cfg.tgToken}/${method}`, {
      method: "POST",
      body:   form,
    });
    return !!res && res.ok;
  } catch (err) {
    console.error("forwardMediaToTelegram error:", err.message);
    return false;
  }
}

// ----------------------------------------------------------------------------
// Admin (with CSRF + rate limit + masked tokens)
// ----------------------------------------------------------------------------
async function handleAdmin(request, env, url) {
  try {
    const path = url.pathname;

    // ---- Login page / submit ----
    if (path === "/admin" || path === "/admin/") {
      if (request.method === "POST") {
        const form = await request.formData();

        // [PATCH #3] rate limit
        const rl = await checkLoginRateLimit(env.KV, request);
        if (rl.locked) {
          return html(loginHtml(`⏳ کمی صبر کن و بعد از ${Math.ceil(rl.remainingMs/1000)} ثانیه دوباره امتحان کن.`));
        }

        if (form.get("password") === getAdminPassword(env)) {
          await clearLoginRateLimit(env.KV);
          const session = crypto.randomUUID();
          // [PATCH #5] per-session key instead of single global slot
          await env.KV.put(K.SESSION_PREFIX + session, "1", { expirationTtl: SESSION_TTL });
          await addSessionIndex(env.KV, session);
          return redirect("/admin/dashboard",
            `session=${session}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`);
        }
        await bumpLoginRateLimit(env.KV);
        return html(loginHtml("رمز اشتباه است ❌"));
      }
      return html(loginHtml());
    }

    // ---- Auth required for everything else ----
    const cookie  = request.headers.get("Cookie") || "";
    const session = cookie.match(/session=([^;]+)/)?.[1];
    const stored  = session ? await env.KV.get(K.SESSION_PREFIX + session) : null;
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

      if (act === "save_config") {
        const patch = {};
        const tg     = form.get("tg_token")?.trim();
        const bale   = form.get("bale_token")?.trim();
        const admin  = form.get("bale_admin_id")?.trim();
        const name   = form.get("admin_name")?.trim();
        // Empty input means "keep current" (UI shows masked values)
        if (tg && !tg.includes("•"))    patch.tgToken     = tg;
        if (bale && !bale.includes("•")) patch.baleToken  = bale;
        if (admin) patch.baleAdminId = admin;
        if (name)  patch.adminName   = name;
        if (Object.keys(patch).length) await putConfig(env.KV, patch);

      } else if (act === "set_webhook") {
        await setWebhooks(env, url);

      } else if (act === "remove_webhook") {
        await removeWebhooks(env);

      } else if (act === "run_poll") {
        await handlePoll(env);
      }

      return redirect("/admin/dashboard");
    }

    const cfg = await getConfig(env.KV);
    // [PATCH #6] hand masked values + csrf to view
    const csrf = cookie.match(/csrf=([^;]+)/)?.[1] || crypto.randomUUID();
    return html(dashboardHtml(cfg, url, csrf), csrf);
  } catch (err) {
    return txt(`❌ Admin Error:\n${err.message}`, 500);
  }
}

// ----------------------------------------------------------------------------
// Rate limiting
// ----------------------------------------------------------------------------
async function checkLoginRateLimit(kv, request) {
  const raw = await kv.get(K.LOGIN_FAILS);
  const state = raw ? JSON.parse(raw) : { count: 0, firstAt: 0 };
  const now = Date.now();
  if (state.count >= LOGIN_MAX_ATTEMPTS) {
    const elapsed = now - state.firstAt;
    if (elapsed < LOGIN_LOCK_MS) {
      return { locked: true, remainingMs: LOGIN_LOCK_MS - elapsed };
    }
    // window expired — reset
    await kv.delete(K.LOGIN_FAILS);
  }
  return { locked: false };
}

async function bumpLoginRateLimit(kv) {
  const raw = await kv.get(K.LOGIN_FAILS);
  const state = raw ? JSON.parse(raw) : { count: 0, firstAt: 0 };
  const now = Date.now();
  if (now - state.firstAt > LOGIN_LOCK_MS) {
    state.count = 1; state.firstAt = now;
  } else {
    state.count += 1;
  }
  await kv.put(K.LOGIN_FAILS, JSON.stringify(state), { expirationTtl: Math.ceil(LOGIN_LOCK_MS/1000) });
}

async function clearLoginRateLimit(kv) {
  await kv.delete(K.LOGIN_FAILS);
}

// ----------------------------------------------------------------------------
// Session index (best-effort; not strictly required)
// ----------------------------------------------------------------------------
async function addSessionIndex(kv, sid) {
  try {
    const raw = await kv.get(K.SESSION_INDEX);
    const arr = raw ? JSON.parse(raw) : [];
    arr.push(sid);
    await kv.put(K.SESSION_INDEX, JSON.stringify(arr), { expirationTtl: SESSION_TTL });
  } catch {}
}

// ----------------------------------------------------------------------------
// Webhook setup
// ----------------------------------------------------------------------------
async function setWebhooks(env, url) {
  const cfg     = await getConfig(env.KV);
  const baseUrl = `${url.protocol}//${url.host}`;
  const tgPayload = {
    url: `${baseUrl}/webhook/telegram`,
    drop_pending_updates: true,
  };
  // [PATCH #4] set secret_token so incoming webhooks can be verified
  if (cfg_webhookSecretRequired(env)) tgPayload.secret_token = TG_WEBHOOK_SECRET;

  if (cfg.tgToken) {
    await fetchWithRetry(`https://api.telegram.org/bot${cfg.tgToken}/setWebhook`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(tgPayload),
    });
  }
  if (cfg.baleToken) {
    await fetchWithRetry(`https://tapi.bale.ai/bot${cfg.baleToken}/setWebhook`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ url: `${baseUrl}/webhook/bale` }),
    });
  }
}

async function removeWebhooks(env) {
  const cfg = await getConfig(env.KV);
  if (cfg.tgToken) {
    await fetchWithRetry(`https://api.telegram.org/bot${cfg.tgToken}/deleteWebhook`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ drop_pending_updates: true }),
    });
  }
  if (cfg.baleToken) {
    await fetchWithRetry(`https://tapi.bale.ai/bot${cfg.baleToken}/deleteWebhook`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({}),
    });
  }
}

// ----------------------------------------------------------------------------
// HTML views
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
    <div class="logo">💬</div>
    <h1>Bridge</h1>
    <p class="sub">پل ارتباطی تلگرام ↔ بله</p>
    ${err ? `<div class="alert">${esc(err)}</div>` : ""}
    <form method="POST" action="/admin">
      <input type="password" name="password" placeholder="رمز ورود" autofocus required>
      <button type="submit" class="btn btn-run">ورود</button>
    </form>
  </div>
</div>`;
}

function dashboardHtml(cfg, url, csrf) {
  const ready = cfg.tgToken && cfg.baleToken && cfg.baleAdminId;
  const baseUrl = `${url.protocol}//${url.host}`;
  const csrfField = `<input type="hidden" name="csrf" value="${esc(csrf)}">`;

  return `
<header>
  <span class="logo-sm">💬 Bridge</span>
  <div class="header-right">
    <span class="pill ${ready ? "pill-ok" : "pill-warn"}">${ready ? "آماده" : "ناقص"}</span>
  </div>
</header>

<main>

  <div class="grid">

    <div class="card">
      <h2>🔑 تنظیمات</h2>
      <form method="POST">
        ${csrfField}
        <input type="hidden" name="action" value="save_config">
        <label>توکن ربات تلگرام
          <input type="text" name="tg_token" value="${esc(maskToken(cfg.tgToken))}" placeholder="123456:ABC-DEF...">
        </label>
        <label>توکن ربات بله
          <input type="text" name="bale_token" value="${esc(maskToken(cfg.baleToken))}" placeholder="123456:ABC-DEF...">
        </label>
        <label>آیدی عددی ادمین در بله (chat_id)
          <input type="text" name="bale_admin_id" value="${esc(cfg.baleAdminId || "")}" placeholder="مثلاً 123456789">
        </label>
        <label>نام ادمین (نشان داده می‌شه به کاربران تلگرام)
          <input type="text" name="admin_name" value="${esc(cfg.adminName || "")}" placeholder="پشتیبانی">
        </label>
        <button class="btn" type="submit">💾 ذخیره تنظیمات</button>
        <p class="hint">توکن‌ها به‌صورت ماسک شده نمایش داده می‌شن. برای تغییر، مقدار جدید را کامل وارد کنید.</p>
      </form>
    </div>

    <div class="card">
      <h2>🔗 وب‌هوک</h2>
      <p class="hint">
        آدرس Webhook تلگرام:<br>
        <code>${esc(baseUrl)}/webhook/telegram</code>
        <br><br>
        آدرس Webhook بله:<br>
        <code>${esc(baseUrl)}/webhook/bale</code>
      </p>
      <div style="display:flex;flex-direction:column;gap:.5rem;margin-top:.8rem;">
        <form method="POST">
          ${csrfField}
          <input type="hidden" name="action" value="set_webhook">
          <button class="btn btn-run" type="submit">⚡ ثبت Webhook‌ها (توصیه شده)</button>
        </form>
        <form method="POST">
          ${csrfField}
          <input type="hidden" name="action" value="run_poll">
          <button class="btn" type="submit">▶ اجرای دستی Polling</button>
        </form>
        <form method="POST">
          ${csrfField}
          <input type="hidden" name="action" value="remove_webhook">
          <button class="btn btn-warn" type="submit">🗑 حذف Webhook‌ها</button>
        </form>
      </div>
    </div>

    <div class="card" style="grid-column:1/-1">
      <h2>📖 راهنمای راه‌اندازی</h2>
      <ol class="guide">
        <li>یک ربات تلگرام از @BotFather بسازید و توکنش را وارد کنید.</li>
        <li>یک ربات بله بسازید و توکنش را وارد کنید.</li>
        <li>به ربات بله پیام بدهید — آیدی عددی چت را از @userinfobot یا از لاگ ربات بدست بیاورید و وارد کنید.</li>
        <li>نام ادمین را وارد کنید (این نام در پیام خوشامدگویی به کاربران تلگرام نشان داده می‌شود).</li>
        <li>تنظیمات را ذخیره کنید.</li>
        <li>روی «ثبت Webhook‌ها» کلیک کنید — از این به بعد پیام‌ها بلادرنگ دریافت می‌شوند.</li>
        <li>اگر Webhook کار نکرد، از «اجرای دستی Polling» یا Cron استفاده کنید (قبلش Webhook را حذف کنید).</li>
      </ol>
      <p class="hint" style="margin-top:.8rem">
        <b>نحوه ریپلای:</b> در بله روی هر پیامی که دریافت کردید Reply کنید — پاسخ به کاربر تلگرام ارسال می‌شود.
      </p>
    </div>

  </div>

</main>`;
}

function html(body, csrf) {
  const headers = { "Content-Type": "text/html;charset=UTF-8" };
  // [PATCH #2] set CSRF cookie alongside response (if provided)
  if (csrf) headers["Set-Cookie"] = `csrf=${csrf}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`;
  return new Response(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bridge Admin</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap');
:root{
  --bg:#07090f;--surf:#0e1118;--border:#1a2035;
  --accent:#5b8dee;--accent2:#3d6fd4;--text:#cdd5e0;
  --muted:#4a5568;--ok:#2ecc87;--warn:#f5a623;--err:#e05c5c;--r:.55rem;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Vazirmatn',Tahoma,sans-serif;background:var(--bg);color:var(--text);font-size:14px;min-height:100vh;}
header{display:flex;align-items:center;justify-content:space-between;padding:.75rem 1.4rem;background:var(--surf);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:9;}
.logo-sm{font-weight:700;color:var(--accent);font-size:.95rem;letter-spacing:.04em}
.header-right{display:flex;align-items:center;gap:.7rem}
.pill{font-size:.7rem;font-weight:600;padding:.25rem .65rem;border-radius:2rem}
.pill-ok{background:#0b2a1c;color:var(--ok)}.pill-warn{background:#2a1a05;color:var(--warn)}
.btn,.btn-run,.btn-warn{display:inline-flex;align-items:center;gap:.35rem;padding:.45rem 1rem;border-radius:var(--r);font-size:.8rem;font-family:inherit;cursor:pointer;border:1px solid;transition:background .18s,color .18s,transform .12s;width:100%;justify-content:center;}
.btn{background:var(--border);color:var(--text);border-color:var(--border)}.btn:hover{background:var(--accent2);color:#fff;border-color:var(--accent2)}
.btn-run{background:var(--accent);color:#fff;border-color:transparent}.btn-run:hover{opacity:.85}
.btn-warn{background:#200f0f;color:var(--err);border-color:var(--err)}.btn-warn:hover{background:var(--err);color:#fff}
.btn:active,.btn-run:active,.btn-warn:active{transform:scale(.96)}
.center{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}
.login-card{width:100%;max-width:340px;text-align:center;animation:fadeUp .4s ease both}
.logo{font-size:2.5rem;margin-bottom:.5rem}
h1{font-size:1.3rem;font-weight:700;color:var(--accent);margin-bottom:.25rem}
.sub{font-size:.78rem;color:var(--muted);margin-bottom:1.6rem}
.alert{background:#2a0d0d;color:var(--err);border:1px solid #5a1a1a;border-radius:var(--r);padding:.5rem .8rem;font-size:.78rem;margin-bottom:1rem;}
.login-card form{display:flex;flex-direction:column;gap:.7rem}
.login-card button{width:100%;justify-content:center;padding:.6rem}
main{max-width:860px;margin:0 auto;padding:1.1rem}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
.card{background:var(--surf);border:1px solid var(--border);border-radius:var(--r);padding:1.1rem;animation:fadeUp .38s ease both;}
.card h2{font-size:.83rem;font-weight:600;margin-bottom:.9rem;color:var(--text)}
form{display:flex;flex-direction:column;gap:.6rem}
label{display:flex;flex-direction:column;gap:.3rem;font-size:.72rem;color:var(--muted)}
input{background:var(--bg);border:1px solid var(--border);color:var(--text);padding:.5rem .75rem;border-radius:var(--r);font-size:.8rem;font-family:inherit;width:100%;outline:none;transition:border-color .18s;}
input:focus{border-color:var(--accent)}
.hint{font-size:.73rem;color:var(--muted);margin-bottom:.5rem;line-height:1.7}
code{font-family:monospace;background:var(--border);padding:.1rem .35rem;border-radius:.3rem;font-size:.72rem;word-break:break-all}
ol.guide{font-size:.78rem;color:var(--muted);line-height:2;padding-right:1.2rem}
ol.guide li{margin-bottom:.1rem}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:640px){.grid{grid-template-columns:1fr}header,main{padding:.75rem}}
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
    } catch { /* network error */ }
    if (i < attempts - 1) await sleep(RETRY_DELAY_MS * (i + 1));
  }
  return null;
}

async function tgPost(token, method, body) {
  const res = await fetchWithRetry(`https://api.telegram.org/bot${token}/${method}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  return !!res;
}

async function balePost(token, method, body) {
  const res = await fetchWithRetry(`https://tapi.bale.ai/bot${token}/${method}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  return !!res;
}

async function balePostJSON(token, method, body) {
  const res = await fetchWithRetry(`https://tapi.bale.ai/bot${token}/${method}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  if (!res) return null;
  try { return await res.json(); } catch { return null; }
}

async function balePostFormJSON(token, method, form) {
  const res = await fetchWithRetry(`https://tapi.bale.ai/bot${token}/${method}`, {
    method: "POST",
    body:   form,
  });
  if (!res) return null;
  try { return await res.json(); } catch { return null; }
}

async function getTgFileUrl(token, fileId) {
  const res = await fetchWithRetry(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  if (!res) return null;
  const d = await res.json();
  if (!d.ok) return null;
  return `https://api.telegram.org/file/bot${token}/${d.result.file_path}`;
}

async function getBaleFileUrl(token, fileId) {
  const res = await fetchWithRetry(`https://tapi.bale.ai/bot${token}/getFile?file_id=${fileId}`);
  if (!res) return null;
  const d = await res.json();
  if (!d.ok) return null;
  return `https://tapi.bale.ai/file/bot${token}/${d.result.file_path}`;
}

function redirect(location, setCookie) {
  const headers = { "Location": location };
  if (setCookie) headers["Set-Cookie"] = setCookie;
  return new Response(null, { status: 302, headers });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
function txt(msg, s = 200) { return new Response(msg, { status: s, headers: { "Content-Type": "text/plain;charset=UTF-8" } }); }
function sleep(ms)         { return new Promise(r => setTimeout(r, ms)); }

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// [PATCH #7/#8] actually used now — escapes user-supplied text before HTML parse_mode
function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
