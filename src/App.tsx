/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Github,
  Globe,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  Zap,
  MessageSquare,
  Radio,
  FileCode2,
  BookOpen,
  Sliders,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ArrowRightLeft,
  RefreshCw,
  Eye,
  Key,
  Layers,
  ChevronRight,
  Send,
  Workflow
} from 'lucide-react';

const GITHUB_REPO_URL = "https://github.com/bhossein0099-hue/bridge-tel-bale1";
const GITHUB_CLONE_CMD = "git clone https://github.com/bhossein0099-hue/bridge-tel-bale1.git";

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'tel-bale' | 'v-connect' | 'generator' | 'guide' | 'security'>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Config generator state
  const [adminPassword, setAdminPassword] = useState('MyStrongAdminPass123!');
  const [tgToken, setTgToken] = useState('');
  const [baleToken, setBaleToken] = useState('');
  const [baleAdminId, setBaleAdminId] = useState('');
  const [workerUrl, setWorkerUrl] = useState('https://my-bridge.workers.dev');

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#07090f] text-[#cdd5e0] font-sans antialiased selection:bg-blue-600 selection:text-white" dir="rtl">
      {/* Top Banner / GitHub Live Status */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 border-b border-blue-900/40 text-xs py-2.5 px-4 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-emerald-400">مخزن گیت‌هاب عمومی (Public)</span>
            <span className="text-slate-400 hidden sm:inline">|</span>
            <span className="text-slate-300 font-mono text-[11px] ltr">bhossein0099-hue/bridge-tel-bale1</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => copyToClipboard(GITHUB_CLONE_CMD, 'clone-cmd')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60 transition text-[11px]"
              title="کپی دستور کلون"
            >
              {copiedKey === 'clone-cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>دستور Clone</span>
            </button>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition shadow-sm hover:shadow-blue-500/20 text-[11px]"
            >
              <Github className="w-3.5 h-3.5" />
              <span>مشاهده در GitHub</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <header className="border-b border-slate-800/70 bg-[#0c0f1a]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                <ArrowRightLeft className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">پل تلگرام ↔ بله (Telegram Bale Bridge)</h1>
                  <span className="px-2 py-0.5 text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-full">v2.0 Patched</span>
                </div>
                <p className="text-sm text-slate-400 mt-0.5">
                  پلتفرم سرورلس Cloudflare Workers جهت چت دوطرفه و فوروارد اتوماتیک کانال با امنیت تقویت‌شده
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <a
                href="#quick-start"
                onClick={() => setActiveTab('guide')}
                className="w-full md:w-auto text-center px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium border border-slate-700 transition"
              >
                شروع سریع و استقرار
              </a>
              <button
                onClick={() => setActiveTab('generator')}
                className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition shadow-md shadow-blue-600/20"
              >
                <Sliders className="w-4 h-4" />
                <span>سازنده دستورات</span>
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex space-x-reverse space-x-1 sm:space-x-2 mt-6 overflow-x-auto pb-1 scrollbar-none border-t border-slate-800/60 pt-4">
            {[
              { id: 'overview', label: 'نمای کلی و ویژگی‌ها', icon: Globe },
              { id: 'tel-bale', label: 'ربات پشتیبانی دوطرفه (Chat)', icon: MessageSquare },
              { id: 'v-connect', label: 'فوروارد کانال (V-Connect)', icon: Radio },
              { id: 'generator', label: 'ژنراتور کانفیگ و Secrets', icon: Sliders },
              { id: 'guide', label: 'راهنمای مرحله‌به‌مرحله', icon: BookOpen },
              { id: 'security', label: 'پچ‌های امنیتی v2', icon: ShieldCheck },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                    isActive
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-fadeIn">
            {/* Quick Hero Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-[#0e1322] to-blue-950 border border-slate-800 p-6 sm:p-8">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-4">
                  <Zap className="w-3.5 h-3.5" />
                  <span>آماده استفاده برای همه به‌صورت متن‌باز (Open Source)</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
                  پلی پایدار و امن میان پیام‌رسان تلگرام و بله
                </h2>
                <p className="mt-3 text-slate-300 text-sm sm:text-base leading-relaxed">
                  با این مخزن، بدون نیاز به اجاره سرور ماهانه، اسکریپت‌های پچ‌شده را روی پلن رایگان Cloudflare Workers اجرا کنید.
                  داده‌ها در KV Namespace ابری ذخیره می‌شوند و داشبورد مدیریتی تحت وب امکان کنترل توکن‌ها، اجرای تست دستی Polling و ثبت وب‌هوک را فراهم می‌کند.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <a
                    href={GITHUB_REPO_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white text-slate-900 font-bold text-sm hover:bg-slate-100 transition shadow-md"
                  >
                    <Github className="w-4 h-4" />
                    <span>مخزن گیت‌هاب (Public Repo)</span>
                  </a>
                  <button
                    onClick={() => setActiveTab('tel-bale')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 font-medium text-sm border border-blue-500/40 transition"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>بررسی Tel-Bale-Chat</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('v-connect')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm border border-slate-700 transition"
                  >
                    <Radio className="w-4 h-4" />
                    <span>بررسی V-Connect</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Architecture Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Bot 1: Tel-Bale-Chat */}
              <div className="rounded-xl bg-[#0c0f1a] border border-slate-800/80 p-6 hover:border-blue-500/40 transition group">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-105 transition">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">Tel-Bale-Chat.js</span>
                </div>
                <h3 className="text-lg font-bold text-white">ربات پشتیبانی دوطرفه (User ↔ Admin)</h3>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                  کاربر در تلگرام به ربات پیام می‌دهد؛ ربات مشخصات کاربر را استخراج کرده و پیام را همراه متن، رسانه، فایل یا لوکیشن به ادمین در بله می‌فرستد. ادمین با ریپلای زدن در بله، پاسخش مستقیم به چت کاربر در تلگرام می‌رسد.
                </p>
                <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap gap-2 text-xs text-slate-300">
                  <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800">چت بلادرنگ با Webhook</span>
                  <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800">پشتیبانی از ریپلای ادمین</span>
                  <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800">سشن امن ۳۰ روزه</span>
                </div>
              </div>

              {/* Bot 2: V-Connect */}
              <div className="rounded-xl bg-[#0c0f1a] border border-slate-800/80 p-6 hover:border-indigo-500/40 transition group">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition">
                    <Radio className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">V-Connect.user.js</span>
                </div>
                <h3 className="text-lg font-bold text-white">فوروارد کانال تلگرام به بله (Channel Sync)</h3>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                  کانال‌های تلگرامی را رصد کرده و تمام پست‌ها (عکس، ویدیو، صدا، نظرسنجی و فایل) را به کانال مقصد در بله با امضای دلخواه فوروارد می‌کند. دارای کلید اختصاصی Offset برای جلوگیری از ارسال پیام‌های تکراری.
                </p>
                <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap gap-2 text-xs text-slate-300">
                  <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800">کرون جاب خودکار ۱ دقیقه‌ای</span>
                  <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800">پشتیبانی چند کاناله</span>
                  <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800">بدون نیاز به سرور لایسنس</span>
                </div>
              </div>
            </div>

            {/* GitHub Info & Clone Box */}
            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-6">
              <h3 className="text-base font-bold text-white flex items-center gap-2 mb-3">
                <Terminal className="w-4 h-4 text-blue-400" />
                <span>اطلاعات مخزن گیت‌هاب و دریافت کد منبع</span>
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                این پروژه روی اکانت شما به صورت عمومی (Public) ثبت و پیکربندی شده است. هر کاربری در دنیا می‌تواند پروژه را ببیند، فورک کند یا دانلود نماید:
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-[#07090f] p-3 rounded-lg border border-slate-800">
                <code className="text-xs text-blue-300 font-mono flex-1 overflow-x-auto py-1 ltr">
                  {GITHUB_CLONE_CMD}
                </code>
                <button
                  onClick={() => copyToClipboard(GITHUB_CLONE_CMD, 'clone-box')}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition"
                >
                  {copiedKey === 'clone-box' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>کپی دستور</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-800/80 text-xs">
                <div>
                  <span className="text-slate-500 block">وضعیت دسترسی:</span>
                  <span className="font-semibold text-emerald-400">عمومی (Public)</span>
                </div>
                <div>
                  <span className="text-slate-500 block">شاخه پیش‌فرض:</span>
                  <span className="font-mono text-slate-300">main</span>
                </div>
                <div>
                  <span className="text-slate-500 block">لایسنس:</span>
                  <span className="font-semibold text-slate-300">MIT (Open Source)</span>
                </div>
                <div>
                  <span className="text-slate-500 block">پلتفرم پیشنهادی:</span>
                  <span className="font-semibold text-orange-400">Cloudflare Workers</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TEL-BALE-CHAT */}
        {activeTab === 'tel-bale' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                  <span>اسکریپت Tel-Bale-Chat.js (پشتیبانی ۲ طرفه)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  پچ‌شده با CSRF Protection، Rate Limit، اعتبارسنجی Secret Token وب‌هوک و مدیریت نشست‌های همزمان
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`${GITHUB_REPO_URL}/blob/main/Tel-Bale-Chat.js`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
                >
                  <Github className="w-3.5 h-3.5" />
                  <span>مشاهده در گیت‌هاب</span>
                </a>
              </div>
            </div>

            {/* Feature Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#0c0f1a] border border-slate-800">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm mb-1">
                  <Send className="w-4 h-4" />
                  <span>پشتیبانی از انواع رسانه</span>
                </div>
                <p className="text-xs text-slate-400">
                  متن، عکس، ویدیو، وویس، صدا، سند، استیکر، لوکیشن و مخاطب به‌صورت خودکار بین تلگرام و بله جابجا می‌شوند.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#0c0f1a] border border-slate-800">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-1">
                  <Zap className="w-4 h-4" />
                  <span>ثبت وب‌هوک آنی (Real-Time)</span>
                </div>
                <p className="text-xs text-slate-400">
                  با فشردن یک دکمه در داشبورد، وب‌هوک‌های هر دو پیام‌رسان ست شده و بدون تاخیر پیام‌ها ردوبدل می‌شوند.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#0c0f1a] border border-slate-800">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm mb-1">
                  <Lock className="w-4 h-4" />
                  <span>ورود امن و حفاظت از توکن</span>
                </div>
                <p className="text-xs text-slate-400">
                  رمز ادمین از متغیرهای Worker خوانده می‌شود، تلاش‌های ناموفق محدود هستند و توکن‌ها در ظاهر ماسک شده‌اند.
                </p>
              </div>
            </div>

            {/* Endpoints & Usage */}
            <div className="rounded-xl bg-[#0c0f1a] border border-slate-800 p-6 space-y-4">
              <h3 className="text-base font-bold text-white">مسیرها (Endpoints) ورکر Tel-Bale</h3>
              <div className="space-y-2 text-xs">
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-blue-400 font-bold">/admin</span>
                    <span className="text-slate-400 mr-2">— پنل تحت وب جهت تنظیم توکن‌ها، ثبت وب‌هوک و تست دستی</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] w-fit">نیاز به رمز عبور</span>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-emerald-400 font-bold">/webhook/telegram</span>
                    <span className="text-slate-400 mr-2">— دریافت وب‌هوک رویدادهای کاربران تلگرام</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] w-fit">امن با Secret Token</span>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-purple-400 font-bold">/webhook/bale</span>
                    <span className="text-slate-400 mr-2">— دریافت پاسخ‌ها (Reply) ادمین در بله جهت فوروارد به تلگرام</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px] w-fit">چک Chat ID ادمین</span>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-amber-400 font-bold">/poll یا /run</span>
                    <span className="text-slate-400 mr-2">— پولینگ دستی جهت دریافت پیام‌ها در صورت عدم استفاده از وب‌هوک</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] w-fit">بررسی خودکار Conflict</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: V-CONNECT */}
        {activeTab === 'v-connect' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Radio className="w-5 h-5 text-indigo-400" />
                  <span>اسکریپت V-Connect.user.js (فوروارد کانال)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  پچ‌شده با آفست مجزا، لاگ خطاهای زنده، لغو الزام به سرور لایسنس خارجی و اصلاح فرمت Markdown
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`${GITHUB_REPO_URL}/blob/main/V-Connect.user.js`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
                >
                  <Github className="w-3.5 h-3.5" />
                  <span>مشاهده در گیت‌هاب</span>
                </a>
              </div>
            </div>

            {/* Architecture Explanations */}
            <div className="rounded-xl bg-[#0c0f1a] border border-slate-800 p-6 space-y-4">
              <h3 className="text-base font-bold text-white">سازوکار فوروارد خودکار کانال تلگرام به بله</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                ورکر V-Connect با تنظیم یک <strong>Cron Trigger</strong> (مثلاً هر ۱ دقیقه) در کلاودفلر فعال می‌شود.
                پیام‌های جدید کانال‌های مبدا در تلگرام را استخراج کرده و به کانال مقصد در بله ارسال می‌کند.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="p-4 rounded-lg bg-slate-900/70 border border-slate-800">
                  <h4 className="text-xs font-bold text-blue-400 mb-2">۱. تنظیم در تلگرام</h4>
                  <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
                    <li>یک ربات در <span className="text-slate-200">@BotFather</span> بسازید و توکن آن را بگیرید.</li>
                    <li>ربات را به کانال‌های منبع تلگرام اضافه کرده و دسترسی خواندن پیام دهید.</li>
                    <li>آیدی عددی کانال‌ها (مثل <code className="text-blue-300">-100123456789</code>) را در پنل ذخیره کنید.</li>
                  </ul>
                </div>

                <div className="p-4 rounded-lg bg-slate-900/70 border border-slate-800">
                  <h4 className="text-xs font-bold text-emerald-400 mb-2">۲. تنظیم در بله</h4>
                  <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
                    <li>یک ربات در بازوی بله بسازید و توکن آن را بگیرید.</li>
                    <li>ربات بله را در کانال مقصد ادمین با دسترسی ارسال پیام کنید.</li>
                    <li>آیدی کانال بله را در بخش کانال مقصد داشبورد ذخیره نمایید.</li>
                  </ul>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-blue-950/20 border border-blue-900/40 text-xs text-blue-300">
                <strong>نکته مهم برای استقلال ربات:</strong> متغیر <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-300 font-mono">REQUIRE_LICENSE=0</code> را در بخش متغیرهای ورکر قرار دهید تا ربات شما برای همیشه مستقل باشد و به هیچ سرور خارجی وابستگی نداشته باشد.
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CONFIG GENERATOR */}
        {activeTab === 'generator' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-blue-400" />
                <span>ژنراتور متغیرها و دستورات استقرار Cloudflare Wrangler</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                اطلاعات پروژه‌تان را وارد کنید تا دستورات آماده و اسکریپت‌های مربوط به استقرار برای شما تولید شوند:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Form Input */}
              <div className="rounded-xl bg-[#0c0f1a] border border-slate-800 p-6 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Key className="w-4 h-4 text-blue-400" />
                  <span>ورود مقادیر تنظیمی</span>
                </h3>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">رمز عبور ادمین داشبورد (ADMIN_PASSWORD):</label>
                  <input
                    type="text"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="رمز ورود قوی"
                    className="w-full bg-[#07090f] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">آدرس ورکر کلودفلر شما (Worker URL):</label>
                  <input
                    type="text"
                    value={workerUrl}
                    onChange={(e) => setWorkerUrl(e.target.value)}
                    placeholder="https://your-worker.workers.dev"
                    className="w-full bg-[#07090f] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500 ltr text-right"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">توکن ربات تلگرام (اختیاری جهت دستور ست وب‌هوک):</label>
                  <input
                    type="text"
                    value={tgToken}
                    onChange={(e) => setTgToken(e.target.value)}
                    placeholder="123456789:AA..."
                    className="w-full bg-[#07090f] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500 ltr text-right"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">توکن ربات بله (اختیاری):</label>
                  <input
                    type="text"
                    value={baleToken}
                    onChange={(e) => setBaleToken(e.target.value)}
                    placeholder="123456789:..."
                    className="w-full bg-[#07090f] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500 ltr text-right"
                  />
                </div>
              </div>

              {/* Generated Commands */}
              <div className="rounded-xl bg-[#0c0f1a] border border-slate-800 p-6 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span>دستورات خط فرمان (CLI Commands)</span>
                </h3>

                {/* Secret put command */}
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>۱. ست کردن Secret در ورکر:</span>
                    <button
                      onClick={() => copyToClipboard(`echo "${adminPassword}" | wrangler secret put ADMIN_PASSWORD`, 'secret-cmd')}
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-[11px]"
                    >
                      {copiedKey === 'secret-cmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      کپی
                    </button>
                  </div>
                  <pre className="p-2.5 rounded-lg bg-[#07090f] border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto ltr text-left">
                    {`echo "${adminPassword}" | wrangler secret put ADMIN_PASSWORD\necho "0" | wrangler secret put REQUIRE_LICENSE\necho "1" | wrangler secret put WEBHOOK_VERIFY`}
                  </pre>
                </div>

                {/* Webhook curl command */}
                {tgToken && (
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span>۲. ثبت دستی وب‌هوک تلگرام با cURL:</span>
                      <button
                        onClick={() => copyToClipboard(`curl -X POST "https://api.telegram.org/bot${tgToken}/setWebhook" -H "Content-Type: application/json" -d '{"url":"${workerUrl}/webhook/telegram","drop_pending_updates":true,"secret_token":"tg_bridge_secret_v1"}'`, 'webhook-cmd')}
                        className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-[11px]"
                      >
                        {copiedKey === 'webhook-cmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        کپی
                      </button>
                    </div>
                    <pre className="p-2.5 rounded-lg bg-[#07090f] border border-slate-800 text-[11px] font-mono text-blue-300 overflow-x-auto ltr text-left">
                      {`curl -X POST "https://api.telegram.org/bot${tgToken}/setWebhook" \\\n  -H "Content-Type: application/json" \\\n  -d '{"url":"${workerUrl}/webhook/telegram","drop_pending_updates":true,"secret_token":"tg_bridge_secret_v1"}'`}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: GUIDE */}
        {activeTab === 'guide' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-400" />
                <span>راهنمای ۸ مرحله‌ای راه‌اندازی سریع پل ارتباطی</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                از صفر تا صد ساخت اکانت، راه‌اندازی ورکر، اتصال دیتابیس KV و اتصال ربات‌ها:
              </p>
            </div>

            <div className="space-y-4">
              {[
                {
                  step: 1,
                  title: 'ساخت Worker و KV Namespace در کلودفلر',
                  content: 'وارد dash.cloudflare.com شوید. از منوی Workers & Pages یک Worker جدید بسازید. سپس در بخش KV، یک Namespace با نام BRIDGE_KV ایجاد کنید و در تنظیمات ورکر متغیر با نام دقیق KV را به این namespace متصل کنید.'
                },
                {
                  step: 2,
                  title: 'کپی اسکریپت پچ‌شده',
                  content: 'کد اسکریپت موردنظر را (Tel-Bale-Chat.js یا V-Connect.user.js) از مخزن کپی کرده و در ادیتور Worker قرار دهید و دکمه Save and Deploy را بزنید.'
                },
                {
                  step: 3,
                  title: 'تنظیم متغیرهای محرمانه (Secrets)',
                  content: 'در تنظیمات ورکر متغیر ADMIN_PASSWORD را با یک رمز قوی ست کنید. برای V-Connect حتما متغیر REQUIRE_LICENSE=0 و برای چت WEBHOOK_VERIFY=1 را اضافه کنید.'
                },
                {
                  step: 4,
                  title: 'تنظیم زمان‌بندی (Cron Trigger)',
                  content: 'اگر از V-Connect استفاده می‌کنید، در تب Triggers یک Cron به صورت * * * * * (هر ۱ دقیقه) تنظیم کنید تا فوروارد پست‌ها مداوم انجام شود.'
                },
                {
                  step: 5,
                  title: 'ورود به پنل داشبورد',
                  content: 'آدرس ورکر را همراه پسوند /admin باز کنید (مثلاً https://your-worker.workers.dev/admin). با رمزی که ست کردید لاگین شوید.'
                },
                {
                  step: 6,
                  title: 'وارد کردن توکن‌ها و شناسه‌ها',
                  content: 'توکن‌های دریافتی از BotFather تلگرام و بازوی بله و همچنین آیدی عددی چت ادمین یا کانال را وارد کرده و دکمه ذخیره را بزنید.'
                },
                {
                  step: 7,
                  title: 'ثبت Webhook (مخصوص Tel-Bale-Chat)',
                  content: 'در داشبورد روی دکمه «ثبت Webhook‌ها» کلیک کنید تا ارتباط دوطرفه آنی فعال شود.'
                },
                {
                  step: 8,
                  title: 'تست نهایی چت و فوروارد',
                  content: 'با یک اکانت تست به ربات تلگرام پیام دهید یا در کانال پستی ارسال کنید؛ باید بدون تاخیر پیام به بله برسد و ریپلای ادمین به تلگرام برگردد.'
                }
              ].map((item) => (
                <div key={item.step} className="p-4 rounded-xl bg-[#0c0f1a] border border-slate-800 flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 font-mono font-bold flex items-center justify-center shrink-0">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white mb-1">{item.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: SECURITY */}
        {activeTab === 'security' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span>بررسی عمیق پچ‌های امنیتی نسخه ۲</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                تغییرات اعمال‌شده جهت ایمن‌سازی کامل و رفع آسیب‌پذیری‌های نسخه خام اولیه:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[#0c0f1a] border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Lock className="w-4 h-4" />
                  <span>محافظت در برابر حملات جعل درخواست (CSRF)</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  در نسخه خام، هر وب‌سایتی با یک اسکریپت ساده می‌توانست به آدرس <code className="text-slate-300">/admin</code> درخواست ارسال و توکن‌ها را تغییر دهد. در این نسخه پچ‌شده، یک توکن تصادفی در کوکی رمزنگاری‌شده ذخیره و با فیلد مخفی تطابق داده می‌شود.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#0c0f1a] border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                  <ShieldCheck className="w-4 h-4" />
                  <span>ضد Brute-Force و Rate Limit ورود</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  سیستم شمارنده در KV Namespace پیاده شده است: پس از ۵ بار تلاش با رمز عبور اشتباه، ورودی کاربر به مدت ۱۵ دقیقه مسدود می‌شود تا از حدس زدن مکرر پسورد توسط مهاجمان جلوگیری شود.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#0c0f1a] border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                  <Eye className="w-4 h-4" />
                  <span>ماسک شدن توکن‌ها در فرم تنظیمات</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  توکن‌های حساس ربات‌ها به‌صورت <code className="text-slate-300">1234••••••••ABCD</code> نمایش داده می‌شوند تا در اثر Screen Share یا دسترسی‌های محلی افشا نشوند.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#0c0f1a] border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>اعتبارسنجی Secret Token وب‌هوک</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  هنگام ثبت وب‌هوک تلگرام، پارامتر secret_token تنظیم می‌شود و ورکر وجود هدر اختصاصی تلگرام را قبل از پردازش پیام‌ها تایید می‌کند تا امکان تزریق پیام‌های جعلی توسط اشخاص ثالث مسدود گردد.
                </p>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#07090f] py-8 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">Telegram ↔ Bale Bridge Hub</span>
            <span>•</span>
            <span>توسعه و انتشار متن‌باز روی GitHub</span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-white transition flex items-center gap-1"
            >
              <Github className="w-4 h-4" />
              <span>مخزن گیت‌هاب</span>
            </a>
            <a
              href={`${GITHUB_REPO_URL}/blob/main/LICENSE`}
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-white transition"
            >
              مجوز MIT
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
