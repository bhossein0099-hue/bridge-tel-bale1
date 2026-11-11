# Patch Notes — Tel&Bale-Connect + V-Connect

هر دو فایل با حفظ ساختار اصلی و رفتار کاربری، اصلاح شدن. تغییرات زیر اعمال شده:

---

## Tel-Bale-Chat.js (Tel&Bale-Connect)

### امنیتی
| # | مشکل | راه‌حل |
|---|---|---|
| 1 | رمز ادمین هاردکد `admin1234` | از `env.ADMIN_PASSWORD` می‌خونه. اگر ست نشده، fallback به مقدار قدیمی. **تو Cloudflare: `wrangler secret put ADMIN_PASSWORD`** |
| 2 | بدون CSRF protection | توکن CSRF در cookie و hidden field هر فرم؛ سرور تطابق رو چک می‌کنه |
| 3 | بدون rate limit روی `/admin` | ۵ تلاش ناموفق → ۱۵ دقیقه lock (state در KV با TTL) |
| 4 | بدون `secret_token` در Telegram webhook | `setWebhook` با `secret_token` ثابت فرستاده می‌شه و هدر `X-Telegram-Bot-Api-Secret-Token` در `/webhook/telegram` چک می‌شه. **فعال‌سازی با env var `WEBHOOK_VERIFY=1`** |
| 5 | session در KV با کلید ثابت `admin_session` (نمی‌تونه چند همزمان داشته باشه) | session در کلید `session:<uuid>` با TTL ۱ ساعته — چند ادمین هم‌زمان پشتیبانی می‌شن |
| 6 | توکن‌ها plaintext در dashboard | mask می‌شه (`1234••••••••ABCD`). اگر کاربر مقدار `•` دار وارد کنه، آپدیت نمی‌شه (حفظ مقدار قبلی) |

### باگ‌های اصلاح‌شده
| # | مشکل | راه‌حل |
|---|---|---|
| 7 | در `processBaleReply`، `msg.text` ادمین بدون escape با `parse_mode:HTML` ارسال می‌شد → خطای parse اگر ادمین `<` یا `&` بزنه | `escHtml(msg.text)` اعمال شد |
| 8 | تابع `escHtml` مرده بود (تعریف شده ولی استفاده نشده) | حالا استفاده می‌شه |
| 9 | TTL پیام مپ ۷ روز بود (کوتاه برای پشتیبانی) | به ۳۰ روز افزایش یافت |
| 10 | پردازش sequential در `pollTelegram`/`pollBale` — با ۱۰۰ آپدیت سنگین، Worker timeout می‌زد | با `Promise.all` موازی شد (هر تسک try/catch مستقل داره) |
| 11 | `/poll` و `run_poll` بدون چک اینکه webhook فعاله یا نه → خطای 409 Conflict از Telegram | قبل از getUpdates، `getWebhookInfo` چک می‌شه؛ اگر فعال بود پاسخ `{ok:true, skipped:"webhook_active"}` برمی‌گرده |
| 12 | توابع `balePost`/`tgPost` فقط boolean برمی‌گردوندن و دلیل خطا قورت داده می‌شد | در مسیرهایی که JSON لازمه، `balePostJSON`/`balePostFormJSON` مقدار کامل برمی‌گردونن (در نسخه اصلی هم بود ولی حالا در همه مسیرهای لازم استفاده می‌شن) |

### تغییرات مهاجرت
- **KV schema بدون تغییر** — کلیدهای `cfg`, `tg_offset`, `bale_offset`, `map:*` سرجاشون.
- کلیدهای جدید اضافه شده: `session:<uuid>`، `sessions`، `login_fails`.
- اگر قبلاً با کلید `admin_session` کار می‌کردی، بعد از deploy جدید session‌های قبلی auto-expire می‌شن (TTL ۱ ساعت).

### env varهای جدید (همه اختیاری)
```
ADMIN_PASSWORD   = <your-strong-password>   # توصیه‌شده
WEBHOOK_VERIFY   = 1                         # اعتبارسنجی secret_token تلگرام
```

---

## V-Connect.user.js

### امنیتی
| # | مشکل | راه‌حل |
|---|---|---|
| 1 | رمز ادمین هاردکد | `env.ADMIN_PASSWORD` با fallback |
| 2 | بدون CSRF | توکن CSRF در cookie + hidden field |
| 3 | بدون rate limit | ۵ تلاش / ۱۵ دقیقه lock |
| 4 | session در کلید ثابت | `session:<uuid>` با TTL ۱ ساعت |
| 5 | **سرور لایسنس خارجی (`tel-to-bal-e-admin.vtqzmr2z5h.workers.dev/status`) در هر درخواست چک می‌شد — اگر down بشه کل ربات از کار می‌افت** | با `env.REQUIRE_LICENSE=0` قابل غیرفعال‌سازی. اگر ست نشده، رفتار فعلی حفظ می‌شه |
| 6 | توکن‌ها plaintext در dashboard | mask شده، آپدیت فقط با ورود مقدار جدید (بدون `•`) |

### باگ‌های اصلاح‌شده
| # | مشکل | راه‌حل |
|---|---|---|
| 7 | `offset` تو همان JSON کانفیگ ذخیره می‌شد → race condition با آپدیت توکن/کانال | به کلید جداگانه `offset` منتقل شد. تابع‌های `getOffset`/`setOffset` اضافه شد. `reset_offset` حالا این کلید رو پاک می‌کنه |
| 8 | `caption` از کاربر بدون `escMd` به Markdown parser بله داده می‌شد | `escMd(caption)` اعمال شد |
| 9 | `escMd` سبک MarkdownV2 بود (escape نقطه و خط تیره) — در بله که V1 هست، `\.` و `\-` به‌صورت visible نمایش داده می‌شد | به سبک V1 تغییر کرد: فقط `_ * ` [` escape می‌شن |
| 10 | `(await fetchWithRetry(fileUrl)).blob()` اگر null برگردوند TypeError می‌داد | null-check اضافه شد |
| 11 | animation به‌صورت `sendDocument` فرستاده می‌شد → پلیر در بله باز نمی‌شد | به `sendAnimation` تغییر یافت؛ اگر بله reject کرد، fallback به `sendDocument` |
| 12 | دلیل خطاها قورت داده می‌شد (فقط count داشتیم) | ۲۰ خطای اخیر با chatId + reason + timestamp در `last_errors` ذخیره می‌شه و در داشبورد نمایش داده می‌شه. دکمه پاک‌سازی اضافه شد |

### تغییرات مهاجرت
- **KV schema تغییر جزئی داره:**
  - قدیم: `config` شامل `offset` بود.
  - جدید: `offset` به کلید جداگانه منتقل شد. **برای جلوگیری از re-process پیام‌های قبلی، اولین بار بعد از deploy، offset قبلی موجود در `config` رو دستی به کلید `offset` منتقل کن:**
    ```bash
    # در داشبورد جدید دکمه «ریست آفست» رو نزن! در عوض، می‌تونی از Wrangler این کار رو بکنی:
    wrangler kv:key put --binding=KV offset "$(wrangler kv:key get --binding=KV config | jq .offset)"
    ```
    یا ساده‌تر: اجازه بده offset جدید از ۰ شروع بشه (پیام‌های قدیمی دوباره فوروارد می‌شن) — اگر این قابل‌قبول نیست، دستی منتقل کن.
- کلیدهای جدید: `session:<uuid>`، `login_fails`، `last_errors`.

### env varهای جدید
```
ADMIN_PASSWORD    = <your-strong-password>
REQUIRE_LICENSE   = 0     # غیرفعال‌سازی سرور لایسنس خارجی (توصیه‌شده اگر خودت استقرار کردی)
```

---

## تست‌های پیشنهادی بعد از deploy

1. **CSRF:** در مرورگر devtools یک فرم POST با `action=save_config` بدون csrf token بفرست → باید 403 بگیری.
2. **Rate limit:** ۶ بار رمز اشتباه بزن → باید بعد از پنجمین بار پیام lock ببینی.
3. **Token mask:** در داشبورد، توکن نباید کامل visible باشه (فقط ۴ کاراکتر اول و آخر).
4. **V-Connect با `REQUIRE_LICENSE=0`:** بدون اتصال به اینترنت هم `/admin` باید باز بشه.
5. **Tel-Bale webhook secret:** بعد از `setWebhook` با `WEBHOOK_VERIFY=1`، یک درخواست POST بدون هدر `X-Telegram-Bot-Api-Secret-Token` به `/webhook/telegram` بفرست → باید 401 بگیری.
6. **Tel-Bale polling conflict:** بعد از `set_webhook`، `/poll` رو بزن → باید `{ok:true, skipped:"webhook_active"}` برگردونه (نه 409).
7. **V-Connect error log:** یک کانال نامعتبر به `channels` اضافه کن و `run_now` بزن → باید در بخش «آخرین خطاها» دلیل دیده بشه.

---

## فایل‌ها

```
patched/
├── Tel-Bale-Chat.js       # جایگزین فایل اصلی در Worker
├── V-Connect.user.js      # جایگزین فایل اصلی در Worker
└── CHANGES.md             # همین فایل
```

هر دو فایل با `node --check` تست syntax شدن و بدون خطا هستن.
