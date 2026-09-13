/* =============================================================
   BrowserOS — a fake operating system in the browser
   Vanilla HTML/CSS/JS. Everything persists via localStorage.

   core.js — OS shell: state, window manager, taskbar, start menu,
   action center, notifications, sound, theming, dialogs, the fake
   file system, global events, keyboard shortcuts and boot.
   Loaded before apps.js (which defines the individual app UIs).
   ============================================================= */

"use strict";

/* ---------------------------------------------------------
   0. STORAGE KEYS + DEFAULT STATE
   --------------------------------------------------------- */
const LS_KEY = "browseros_state_v2";

const DEFAULT_FS = {
  type: "folder",
  children: {
    "Desktop": { type: "folder", children: {} },
    "Documents": { type: "folder", children: {} },
    "Pictures": { type: "folder", children: {} },
    "Downloads": { type: "folder", children: {} }
  }
};

const DEFAULT_NOTES = [
  { id: "note-welcome", title: "Welcome", body: "This is the Notes app. Anything you write here is saved automatically.", updated: Date.now() }
];

const DEFAULT_STATE = {
  theme: "light",
  accent: "#0078d7",
  wallpaper: "wp1",
  volume: 70,
  muted: false,
  soundEnabled: true,
  notifications: [],
  notes: DEFAULT_NOTES,
  fs: DEFAULT_FS,
  recycleBin: [],
  pinnedApps: [],
  iconSize: "large",
  desktopIconsVisible: true,
  firstBoot: true
};

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
    const parsed = JSON.parse(raw);
    // shallow-merge with defaults so new fields don't break old saves
    return Object.assign({}, DEFAULT_STATE, parsed);
  }catch(e){
    console.warn("BrowserOS: failed to load state, resetting.", e);
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

let STATE = loadState();

function saveState(){
  try{
    localStorage.setItem(LS_KEY, JSON.stringify(STATE));
  }catch(e){
    console.warn("BrowserOS: failed to save state", e);
  }
}

/* ---------------------------------------------------------
   1. APP REGISTRY
   --------------------------------------------------------- */
const APPS = {
  filemanager: { name: "File Explorer", icon: "📁", width: 720, height: 460 },
  notes:       { name: "Notes",         icon: "📝", width: 640, height: 440 },
  calculator:  { name: "Calculator",    icon: "🧮", width: 320, height: 480, fixedSize: true },
  terminal:    { name: "Terminal",      icon: "💻", width: 640, height: 400 },
  settings:    { name: "Settings",      icon: "⚙️", width: 680, height: 480 },
  credits:     { name: "Credits",       icon: "ℹ️", width: 420, height: 420 },
  recyclebin:  { name: "Recycle Bin",   icon: "🗑️", width: 640, height: 440 }
};

/* ---------------------------------------------------------
   2. UTILITIES
   --------------------------------------------------------- */
function $(sel, root){ return (root||document).querySelector(sel); }
function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }
function el(tag, opts){
  const e = document.createElement(tag);
  if(opts){
    if(opts.class) e.className = opts.class;
    if(opts.text) e.textContent = opts.text;
    if(opts.html) e.innerHTML = opts.html;
    if(opts.attrs) Object.entries(opts.attrs).forEach(([k,v]) => e.setAttribute(k,v));
  }
  return e;
}
function uid(prefix){ return (prefix||"id") + "-" + Math.random().toString(36).slice(2,9); }
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function formatTime(d){
  let h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if(h===0) h = 12;
  return `${h}:${String(m).padStart(2,"0")} ${ampm}`;
}
function formatDate(d){
  return d.toLocaleDateString(undefined, { day:"numeric", month:"long", year:"numeric" });
}
function formatShortDate(d){
  return d.toLocaleDateString(undefined, { day:"numeric", month:"short" });
}

/* ---------------------------------------------------------
   3. CLOCK
   --------------------------------------------------------- */
function tickClock(){
  const now = new Date();
  const t = formatTime(now);
  const d = formatShortDate(now);
  const clockTime = $("#clock-time"), clockDate = $("#clock-date");
  if(clockTime) clockTime.textContent = t;
  if(clockDate) clockDate.textContent = d;
  const lockTime = $("#lock-time"), lockDate = $("#lock-date");
  if(lockTime) lockTime.textContent = t;
  if(lockDate) lockDate.textContent = formatDate(now);
}
setInterval(tickClock, 1000);

/* ---------------------------------------------------------
   4. THEME / ACCENT / WALLPAPER
   --------------------------------------------------------- */
const WALLPAPERS = {
  wp1: "linear-gradient(135deg,#1e5799 0%,#2989d8 50%,#207cca 51%,#7db9e8 100%)",
  wp2: "linear-gradient(135deg,#0f2027,#203a43,#2c5364)",
  wp3: "linear-gradient(135deg,#ee9ca7,#ffdde1)",
  wp4: "linear-gradient(135deg,#360033,#0b8793)"
};

function applyTheme(){
  document.documentElement.setAttribute("data-theme", STATE.theme);
  document.documentElement.style.setProperty("--accent", STATE.accent);
  document.documentElement.style.setProperty("--accent-dark", shadeColor(STATE.accent, -18));
  document.documentElement.style.setProperty("--wallpaper", WALLPAPERS[STATE.wallpaper] || WALLPAPERS.wp1);
  $all(".theme-swatch").forEach(b => b.classList.toggle("active", b.dataset.theme === STATE.theme));
  $all(".accent-swatch").forEach(b => b.classList.toggle("active", b.dataset.accent.toLowerCase() === STATE.accent.toLowerCase()));
  $all(".wallpaper-swatch").forEach(b => b.classList.toggle("active", b.dataset.wallpaper === STATE.wallpaper));
  const qtTheme = $("#qt-theme");
  if(qtTheme) qtTheme.classList.toggle("active", STATE.theme === "dark");
}
function shadeColor(hex, percent){
  const num = parseInt(hex.replace("#",""),16);
  let r = (num >> 16) + Math.round(255 * (percent/100));
  let g = ((num >> 8) & 0x00FF) + Math.round(255 * (percent/100));
  let b = (num & 0x0000FF) + Math.round(255 * (percent/100));
  r = clamp(r,0,255); g = clamp(g,0,255); b = clamp(b,0,255);
  return "#" + (0x1000000 + r*0x10000 + g*0x100 + b).toString(16).slice(1);
}

/* ---------------------------------------------------------
   5. NOTIFICATIONS (toasts + action center)
   --------------------------------------------------------- */
function pushNotification(title, body, opts){
  opts = opts || {};
  const notif = { id: uid("notif"), title, body, time: Date.now(), icon: opts.icon || "🔔" };
  STATE.notifications.unshift(notif);
  if(STATE.notifications.length > 30) STATE.notifications.length = 30;
  saveState();
  renderActionCenterList();
  showToast(notif);
  updateNotifDot();
  playSound("notify");
}

function updateNotifDot(){
  const dot = $("#notif-dot");
  if(dot) dot.classList.toggle("hidden", STATE.notifications.length === 0);
}

function showToast(notif){
  const stack = $("#toast-stack");
  if(!stack) return;
  const t = el("div", { class: "toast" });
  t.innerHTML = `
    <div class="toast-head"><span class="toast-title">${escapeHtml(notif.icon)} ${escapeHtml(notif.title)}</span></div>
    <div class="toast-body">${escapeHtml(notif.body)}</div>
  `;
  stack.appendChild(t);
  setTimeout(() => {
    t.classList.add("toast-out");
    setTimeout(() => t.remove(), 220);
  }, 4500);
}

function renderActionCenterList(){
  const list = $("#ac-list");
  if(!list) return;
  if(STATE.notifications.length === 0){
    list.innerHTML = `<div class="ac-empty">No new notifications</div>`;
    return;
  }
  list.innerHTML = "";
  STATE.notifications.forEach(n => {
    const item = el("div", { class: "ac-item" });
    const ago = timeAgo(n.time);
    item.innerHTML = `
      <div class="ac-item-head">
        <span class="ac-item-title">${escapeHtml(n.icon)} ${escapeHtml(n.title)}</span>
        <span class="ac-item-close" data-close-notif="${n.id}">✕</span>
      </div>
      <div class="ac-item-body">${escapeHtml(n.body)}</div>
      <div class="ac-item-time">${ago}</div>
    `;
    list.appendChild(item);
  });
  $all("[data-close-notif]", list).forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.closeNotif;
      STATE.notifications = STATE.notifications.filter(n => n.id !== id);
      saveState();
      renderActionCenterList();
      updateNotifDot();
    });
  });
}
function timeAgo(ts){
  const s = Math.floor((Date.now()-ts)/1000);
  if(s < 60) return "Just now";
  const m = Math.floor(s/60);
  if(m < 60) return m + " min ago";
  const h = Math.floor(m/60);
  if(h < 24) return h + " hr ago";
  return Math.floor(h/24) + " day ago";
}

/* ---------------------------------------------------------
   6. SOUND (simple WebAudio beeps, respects volume + mute)
   --------------------------------------------------------- */
let audioCtx = null;
function getAudioCtx(){
  if(!audioCtx){
    try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch(e){ audioCtx = null; }
  }
  return audioCtx;
}
function playSound(kind){
  if(!STATE.soundEnabled || STATE.muted || STATE.volume === 0) return;
  const ctx = getAudioCtx();
  if(!ctx) return;
  const freq = { click: 440, open: 660, close: 330, notify: 880, error: 200 }[kind] || 500;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  osc.type = "sine";
  const vol = (STATE.volume/100) * 0.06;
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.16);
}

function setVolume(v){
  STATE.volume = clamp(Math.round(v), 0, 100);
  STATE.muted = STATE.volume === 0 ? STATE.muted : false;
  saveState();
  syncVolumeUI();
}
function toggleMute(){
  STATE.muted = !STATE.muted;
  saveState();
  syncVolumeUI();
}
function syncVolumeUI(){
  const icon = STATE.muted || STATE.volume === 0 ? "🔇" : STATE.volume < 50 ? "🔉" : "🔊";
  const tray = $("#tray-volume"); if(tray) tray.textContent = icon;
  const vs = $("#volume-slider"); if(vs) vs.value = STATE.volume;
  const vv = $("#volume-value"); if(vv) vv.textContent = STATE.muted ? "Muted" : STATE.volume;
  const acs = $("#ac-volume-slider"); if(acs) acs.value = STATE.volume;
  const acv = $("#ac-volume-value"); if(acv) acv.textContent = STATE.muted ? "Muted" : STATE.volume;
  const ss = $("#settings-volume-slider"); if(ss) ss.value = STATE.volume;
}

/* ---------------------------------------------------------
   6b. DIALOG SYSTEM (custom confirm/prompt/alert)
   Native window.confirm/prompt/alert render inconsistently
   (or not at all) inside embedded/sandboxed browser hosts, so
   every "are you sure?" / "name this" interaction in the OS
   uses this styled, in-page dialog instead.
   --------------------------------------------------------- */
function dialogKeyHandler(e){
  const overlay = $("#dialog-overlay");
  if(!overlay || overlay.classList.contains("hidden")) return;
  if(e.key === "Escape"){
    e.preventDefault(); e.stopPropagation();
    const cancelBtn = $("#dialog-cancel-btn");
    cancelBtn ? cancelBtn.click() : closeDialog();
  } else if(e.key === "Enter"){
    const input = $("#dialog-input");
    if(input && document.activeElement === input){ e.preventDefault(); }
    const confirmBtn = $("#dialog-confirm-btn");
    if(confirmBtn){ e.preventDefault(); e.stopPropagation(); confirmBtn.click(); }
  }
}
function closeDialog(){
  const overlay = $("#dialog-overlay");
  if(!overlay || overlay.classList.contains("hidden")) return;
  overlay.classList.add("dialog-closing");
  setTimeout(() => {
    overlay.classList.add("hidden");
    overlay.classList.remove("dialog-closing");
  }, 150);
  document.removeEventListener("keydown", dialogKeyHandler, true);
}
function openDialog(opts){
  opts = opts || {};
  const overlay = $("#dialog-overlay");
  if(!overlay) return;
  const titleEl = $("#dialog-title");
  const msgEl = $("#dialog-message");
  const inputEl = $("#dialog-input");
  const iconEl = $("#dialog-icon");
  const actions = $("#dialog-actions");

  titleEl.textContent = opts.title || "BrowserOS";
  msgEl.textContent = opts.message || "";
  iconEl.textContent = opts.icon || (opts.mode === "prompt" ? "✏️" : opts.danger ? "⚠️" : "❓");
  overlay.classList.toggle("dialog-danger", !!opts.danger);

  if(opts.mode === "prompt"){
    inputEl.classList.remove("hidden");
    inputEl.value = opts.defaultValue || "";
  } else {
    inputEl.classList.add("hidden");
    inputEl.value = "";
  }

  actions.innerHTML = "";
  if(opts.mode !== "alert"){
    const cancelBtn = el("button", { class: "dialog-btn dialog-btn-cancel", text: opts.cancelText || "Cancel", attrs: { id: "dialog-cancel-btn", type: "button" } });
    cancelBtn.addEventListener("click", () => { closeDialog(); opts.onCancel && opts.onCancel(); });
    actions.appendChild(cancelBtn);
  }
  const confirmBtn = el("button", { class: "dialog-btn dialog-btn-confirm" + (opts.danger ? " danger" : ""), text: opts.confirmText || "OK", attrs: { id: "dialog-confirm-btn", type: "button" } });
  confirmBtn.addEventListener("click", () => {
    const value = opts.mode === "prompt" ? inputEl.value : true;
    closeDialog();
    opts.onConfirm && opts.onConfirm(value);
  });
  actions.appendChild(confirmBtn);

  overlay.classList.remove("hidden");
  document.addEventListener("keydown", dialogKeyHandler, true);
  playSound("open");
  setTimeout(() => {
    if(opts.mode === "prompt"){ inputEl.focus(); inputEl.select(); }
    else confirmBtn.focus();
  }, 60);
}
function showConfirm(message, onConfirm, opts){
  openDialog(Object.assign({ mode: "confirm", message, onConfirm }, opts));
}
function showPrompt(message, defaultValue, onSubmit, opts){
  openDialog(Object.assign({ mode: "prompt", message, defaultValue, onConfirm: onSubmit }, opts));
}
function showAlert(message, opts){
  openDialog(Object.assign({ mode: "alert", message }, opts));
}

/* ---------------------------------------------------------
   7. WINDOW MANAGER
   --------------------------------------------------------- */
const winState = {
  windows: new Map(), // id -> { el, appId, minimized, maximized, prevRect }
  zTop: 10,
  focusedId: null
};
let cascadeOffset = 0;

function openApp(appId, opts){
  opts = opts || {};
  // If singleton app already open (default: reuse existing window), focus it.
  if(!opts.forceNew){
    for(const [id, w] of winState.windows){
      if(w.appId === appId){
        restoreWindow(id);
        focusWindow(id);
        if(opts.onFocus) opts.onFocus(w);
        return id;
      }
    }
  }
  const def = APPS[appId];
  if(!def) return null;
  const id = uid("win");
  const winEl = el("div", { class: "window opening" });
  winEl.dataset.winId = id;
  winEl.dataset.appId = appId;

  const w = Math.min(def.width, window.innerWidth - 40);
  const h = Math.min(def.height, window.innerHeight - 48 - 40);
  cascadeOffset = (cascadeOffset + 1) % 6;
  const left = clamp(80 + cascadeOffset * 26, 0, Math.max(0, window.innerWidth - w));
  const top = clamp(50 + cascadeOffset * 22, 0, Math.max(0, window.innerHeight - 48 - h));

  winEl.style.width = w + "px";
  winEl.style.height = h + "px";
  winEl.style.left = left + "px";
  winEl.style.top = top + "px";

  winEl.innerHTML = `
    <div class="win-titlebar">
      <span class="win-icon">${def.icon}</span>
      <span class="win-title">${escapeHtml(def.name)}</span>
      <div class="win-controls">
        <button class="win-min" title="Minimize">─</button>
        <button class="win-max" title="Maximize">☐</button>
        <button class="win-close" title="Close">✕</button>
      </div>
    </div>
    <div class="win-body"></div>
    ${def.fixedSize ? "" : `
      <div class="resize-handle rh-e"></div><div class="resize-handle rh-w"></div>
      <div class="resize-handle rh-s"></div><div class="resize-handle rh-n"></div>
      <div class="resize-handle rh-se"></div><div class="resize-handle rh-sw"></div>
      <div class="resize-handle rh-ne"></div><div class="resize-handle rh-nw"></div>
    `}
  `;

  $("#windows-layer").appendChild(winEl);
  winState.windows.set(id, { el: winEl, appId, minimized:false, maximized:false, prevRect:null, title: def.name, icon: def.icon });

  // Render app content
  const body = $(".win-body", winEl);
  const windowApi = {
    id, el: winEl, body,
    setTitle: (t) => { $(".win-title", winEl).textContent = t; },
    close: () => closeWindow(id)
  };
  renderAppContent(appId, body, windowApi);

  makeDraggable(winEl);
  if(!def.fixedSize) makeResizable(winEl);

  $(".win-min", winEl).addEventListener("click", (e)=>{ e.stopPropagation(); minimizeWindow(id); });
  $(".win-max", winEl).addEventListener("click", (e)=>{ e.stopPropagation(); toggleMaximize(id); });
  $(".win-close", winEl).addEventListener("click", (e)=>{ e.stopPropagation(); closeWindow(id); });
  $(".win-titlebar", winEl).addEventListener("dblclick", ()=> toggleMaximize(id));
  winEl.addEventListener("mousedown", () => focusWindow(id));

  focusWindow(id);
  syncTaskbarApps();
  playSound("open");
  return id;
}

function renderAppContent(appId, body, api){
  switch(appId){
    case "filemanager": renderFileManager(body, api); break;
    case "notes": renderNotes(body, api); break;
    case "calculator": renderCalculator(body, api); break;
    case "terminal": renderTerminal(body, api); break;
    case "settings": renderSettings(body, api); break;
    case "credits": renderCredits(body, api); break;
    case "recyclebin": renderRecycleBin(body, api); break;
    default: body.textContent = "Unknown app.";
  }
}

function focusWindow(id){
  const w = winState.windows.get(id);
  if(!w) return;
  winState.zTop += 1;
  w.el.style.zIndex = winState.zTop;
  $all(".window").forEach(win => win.classList.remove("focused"));
  w.el.classList.remove("minimized");
  w.el.classList.add("focused");
  winState.focusedId = id;
  syncTaskbarFocus();
}

function closeWindow(id){
  const w = winState.windows.get(id);
  if(!w) return;
  w.el.classList.add("closing");
  playSound("close");
  setTimeout(() => {
    w.el.remove();
    winState.windows.delete(id);
    syncTaskbarApps();
    if(winState.focusedId === id) winState.focusedId = null;
  }, 150);
}

function minimizeWindow(id){
  const w = winState.windows.get(id);
  if(!w) return;
  w.el.classList.add("minimized");
  w.minimized = true;
  syncTaskbarFocus();
}
function restoreWindow(id){
  const w = winState.windows.get(id);
  if(!w) return;
  w.el.classList.remove("minimized");
  w.minimized = false;
  syncTaskbarFocus();
}
function toggleMaximize(id){
  const w = winState.windows.get(id);
  if(!w) return;
  if(w.maximized){
    w.el.classList.remove("maximized");
    if(w.prevRect){
      w.el.style.left = w.prevRect.left; w.el.style.top = w.prevRect.top;
      w.el.style.width = w.prevRect.width; w.el.style.height = w.prevRect.height;
    }
    w.maximized = false;
  } else {
    w.prevRect = { left: w.el.style.left, top: w.el.style.top, width: w.el.style.width, height: w.el.style.height };
    w.el.classList.add("maximized");
    w.maximized = true;
  }
  focusWindow(id);
}
function closeFocusedWindow(){
  if(winState.focusedId) closeWindow(winState.focusedId);
}

/* Dragging */
function makeDraggable(winEl){
  const titlebar = $(".win-titlebar", winEl);
  let sx=0, sy=0, ox=0, oy=0, dragging=false;
  titlebar.addEventListener("mousedown", (e) => {
    if(e.target.closest(".win-controls")) return;
    if(winEl.classList.contains("maximized")) return;
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    const rect = winEl.getBoundingClientRect();
    ox = rect.left; oy = rect.top;
    document.body.style.userSelect = "none";
  });
  window.addEventListener("mousemove", (e) => {
    if(!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    const newLeft = clamp(ox + dx, -winEl.offsetWidth + 120, window.innerWidth - 80);
    const newTop = clamp(oy + dy, 0, window.innerHeight - 48 - 30);
    winEl.style.left = newLeft + "px";
    winEl.style.top = newTop + "px";
  });
  window.addEventListener("mouseup", () => { dragging = false; document.body.style.userSelect = ""; });

  // touch support
  titlebar.addEventListener("touchstart", (e) => {
    if(e.target.closest(".win-controls")) return;
    if(winEl.classList.contains("maximized")) return;
    const t = e.touches[0];
    dragging = true; sx = t.clientX; sy = t.clientY;
    const rect = winEl.getBoundingClientRect();
    ox = rect.left; oy = rect.top;
  }, {passive:true});
  window.addEventListener("touchmove", (e) => {
    if(!dragging) return;
    const t = e.touches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    winEl.style.left = clamp(ox+dx, -winEl.offsetWidth+120, window.innerWidth-80) + "px";
    winEl.style.top = clamp(oy+dy, 0, window.innerHeight-48-30) + "px";
  }, {passive:true});
  window.addEventListener("touchend", () => { dragging = false; });
}

/* Resizing */
function makeResizable(winEl){
  const dirs = ["e","w","s","n","se","sw","ne","nw"];
  dirs.forEach(dir => {
    const handle = $(".rh-"+dir, winEl);
    if(!handle) return;
    let sx=0, sy=0, sw=0, sh=0, sl=0, st=0, active=false;
    handle.addEventListener("mousedown", (e) => {
      e.stopPropagation(); e.preventDefault();
      active = true;
      sx = e.clientX; sy = e.clientY;
      const rect = winEl.getBoundingClientRect();
      sw = rect.width; sh = rect.height; sl = rect.left; st = rect.top;
      focusWindow(winEl.dataset.winId);
      const onMove = (e2) => {
        if(!active) return;
        const dx = e2.clientX - sx, dy = e2.clientY - sy;
        let newW = sw, newH = sh, newL = sl, newT = st;
        if(dir.includes("e")) newW = clamp(sw + dx, 320, window.innerWidth - sl);
        if(dir.includes("s")) newH = clamp(sh + dy, 220, window.innerHeight - 48 - st);
        if(dir.includes("w")){ newW = clamp(sw - dx, 320, sl + sw); newL = sl + (sw - newW); }
        if(dir.includes("n")){ newH = clamp(sh - dy, 220, st + sh); newT = st + (sh - newH); }
        winEl.style.width = newW + "px";
        winEl.style.height = newH + "px";
        winEl.style.left = newL + "px";
        winEl.style.top = newT + "px";
      };
      const onUp = () => {
        active = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  });
}

/* ---------------------------------------------------------
   8. TASKBAR
   --------------------------------------------------------- */
function isAppPinned(appId){ return STATE.pinnedApps.includes(appId); }
function pinApp(appId){
  if(!APPS[appId] || STATE.pinnedApps.includes(appId)) return;
  STATE.pinnedApps.push(appId);
  saveState();
  syncTaskbarApps();
}
function unpinApp(appId){
  if(!STATE.pinnedApps.includes(appId)) return;
  STATE.pinnedApps = STATE.pinnedApps.filter(a => a !== appId);
  saveState();
  syncTaskbarApps();
}
function firstWindowIdForApp(appId){
  for(const [winId, w] of winState.windows){
    if(w.appId === appId) return winId;
  }
  return null;
}
function syncTaskbarApps(){
  const bar = $("#taskbar-apps");
  if(!bar) return;
  const openAppIds = [];   // registry apps currently open, in the order they were opened
  const adhocWinIds = [];  // windows not backed by a registry app (e.g. text viewer), in open order
  for(const [winId, w] of winState.windows){
    if(APPS[w.appId]){
      if(!openAppIds.includes(w.appId)) openAppIds.push(w.appId);
    } else {
      adhocWinIds.push(winId);
    }
  }
  const order = [...STATE.pinnedApps.filter(id => APPS[id]), ...openAppIds.filter(id => !STATE.pinnedApps.includes(id))];

  bar.innerHTML = "";
  order.forEach(appId => {
    const def = APPS[appId];
    const winId = firstWindowIdForApp(appId);
    const btn = el("div", { class: "taskbar-app" + (winId ? " running" : ""), attrs: { title: def.name, "data-app-id": appId } });
    btn.textContent = def.icon;
    btn.addEventListener("click", () => {
      const wid = firstWindowIdForApp(appId);
      if(wid){
        const win = winState.windows.get(wid);
        if(win.minimized || winState.focusedId !== wid){ restoreWindow(wid); focusWindow(wid); }
        else minimizeWindow(wid);
      } else {
        openApp(appId);
      }
    });
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault(); e.stopPropagation();
      showContextMenu(...eventPoint(e), taskbarIconContextMenuItems(appId));
    });
    bar.appendChild(btn);
  });
  adhocWinIds.forEach(winId => {
    const w = winState.windows.get(winId);
    const btn = el("div", { class: "taskbar-app running", attrs: { title: w.title || "", "data-win-id": winId } });
    btn.textContent = w.icon || "📄";
    btn.addEventListener("click", () => {
      const win = winState.windows.get(winId);
      if(!win) return;
      if(win.minimized || winState.focusedId !== winId){ restoreWindow(winId); focusWindow(winId); }
      else minimizeWindow(winId);
    });
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault(); e.stopPropagation();
      showContextMenu(...eventPoint(e), [
        { label: "Restore", icon:"▢", action: () => { restoreWindow(winId); focusWindow(winId); } },
        { label: "Minimize", icon:"─", action: () => minimizeWindow(winId) },
        { type:"sep" },
        { label: "Close window", icon:"✕", action: () => closeWindow(winId) }
      ]);
    });
    bar.appendChild(btn);
  });

  syncTaskbarFocus();
}
function taskbarIconContextMenuItems(appId){
  const pinned = isAppPinned(appId);
  const winId = firstWindowIdForApp(appId);
  const items = [];
  if(!winId) items.push({ label: "Open", icon:"🗔", action: () => openApp(appId) });
  items.push({ label: pinned ? "Unpin from taskbar" : "Pin to taskbar", icon: pinned ? "📌" : "📍", action: () => pinned ? unpinApp(appId) : pinApp(appId) });
  if(winId){ items.push({ type:"sep" }); items.push({ label: "Close window", icon:"✕", action: () => closeWindow(winId) }); }
  return items;
}
function syncTaskbarFocus(){
  $all(".taskbar-app[data-app-id]").forEach(btn => {
    const winId = firstWindowIdForApp(btn.dataset.appId);
    btn.classList.toggle("running", !!winId);
    btn.classList.toggle("focused-app", !!winId && winId === winState.focusedId && !isMinimized(winId));
  });
  $all(".taskbar-app[data-win-id]").forEach(btn => {
    btn.classList.toggle("focused-app", btn.dataset.winId === winState.focusedId && !isMinimized(btn.dataset.winId));
  });
}
function isMinimized(id){
  const w = winState.windows.get(id);
  return w ? w.minimized : false;
}

/* Shared "pin to taskbar" context menu for desktop icons + Start menu items */
function pinnableAppContextMenuItems(appId, extraItems){
  const pinned = isAppPinned(appId);
  const items = [
    { label: "Open", icon:"🗔", action: () => openApp(appId) },
    { label: pinned ? "Unpin from taskbar" : "Pin to taskbar", icon: pinned ? "📌" : "📍", action: () => pinned ? unpinApp(appId) : pinApp(appId) }
  ];
  if(extraItems) items.push(...extraItems);
  return items;
}

/* ---------------------------------------------------------
   9. START MENU
   --------------------------------------------------------- */
function buildStartMenuApps(){
  const grid = $("#start-apps-grid");
  grid.innerHTML = "";
  Object.entries(APPS).forEach(([id, def]) => {
    if(id === "recyclebin") return; // desktop-only, matches Windows convention
    const item = el("div", { class: "start-app-item", attrs: { "data-app-id": id } });
    item.innerHTML = `<span class="sa-icon">${def.icon}</span><span>${escapeHtml(def.name)}</span>`;
    item.addEventListener("click", () => {
      openApp(id);
      closeStartMenu();
    });
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault(); e.stopPropagation();
      showContextMenu(...eventPoint(e), pinnableAppContextMenuItems(id));
    });
    grid.appendChild(item);
  });
}
function openStartMenu(){
  closeActionCenter(); closeVolumePopup(); hideContextMenu();
  $("#start-menu").classList.remove("hidden");
  $("#start-btn").classList.add("active");
  setTimeout(() => $("#start-search-input").focus(), 30);
}
function closeStartMenu(){
  $("#start-menu").classList.add("hidden");
  $("#start-btn").classList.remove("active");
  $("#start-search-input").value = "";
  filterStartApps("");
}
function toggleStartMenu(){
  $("#start-menu").classList.contains("hidden") ? openStartMenu() : closeStartMenu();
}
function filterStartApps(query){
  const q = query.trim().toLowerCase();
  $all(".start-app-item").forEach(item => {
    const name = item.textContent.toLowerCase();
    item.classList.toggle("no-match", q && !name.includes(q));
  });
}

/* App search shared by taskbar search + start search */
function runAppSearch(query){
  const q = query.trim().toLowerCase();
  if(!q) return;
  const match = Object.entries(APPS).find(([id, def]) => def.name.toLowerCase().includes(q) || id.includes(q));
  if(match){
    openApp(match[0]);
  } else {
    pushNotification("Search", `No apps, files, or settings matched "${query}".`, { icon: "🔍" });
  }
}

/* ---------------------------------------------------------
   10. ACTION CENTER + VOLUME POPUP
   --------------------------------------------------------- */
function openActionCenter(){
  closeStartMenu(); closeVolumePopup(); hideContextMenu();
  renderActionCenterList();
  $("#action-center").classList.remove("hidden");
}
function closeActionCenter(){ $("#action-center").classList.add("hidden"); }
function toggleActionCenter(){
  $("#action-center").classList.contains("hidden") ? openActionCenter() : closeActionCenter();
}
function openVolumePopup(){
  closeStartMenu(); closeActionCenter(); hideContextMenu();
  syncVolumeUI();
  const popup = $("#volume-popup");
  const anchor = $("#tray-volume");
  if(anchor){
    const rect = anchor.getBoundingClientRect();
    const popupWidth = popup.offsetWidth || 56;
    let left = rect.left + rect.width / 2 - popupWidth / 2;
    left = clamp(left, 8, window.innerWidth - popupWidth - 8);
    popup.style.left = left + "px";
    popup.style.right = "auto";
    popup.style.bottom = (window.innerHeight - rect.top + 16) + "px";
  }
  popup.classList.remove("hidden");
}
function closeVolumePopup(){ $("#volume-popup").classList.add("hidden"); }
function toggleVolumePopup(){
  $("#volume-popup").classList.contains("hidden") ? openVolumePopup() : closeVolumePopup();
}

/* ---------------------------------------------------------
   11. DESKTOP ICONS
   --------------------------------------------------------- */
const DESKTOP_ICON_APPS = ["recyclebin","filemanager","notes","calculator","terminal","settings","credits"];
function buildDesktopIcons(){
  const layer = $("#desktop-icons");
  layer.innerHTML = "";
  DESKTOP_ICON_APPS.forEach(id => {
    const def = APPS[id];
    const icon = el("div", { class: "desktop-icon", attrs: { "data-app-id": id, tabindex: "0" } });
    icon.innerHTML = `<span class="icon-glyph">${def.icon}</span><span class="icon-label">${escapeHtml(def.name)}</span>` +
      (id === "recyclebin" ? `<span class="icon-badge hidden" data-recyclebin-badge></span>` : "");
    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      $all(".desktop-icon").forEach(i => i.classList.remove("selected"));
      icon.classList.add("selected");
      openApp(id);
    });
    icon.addEventListener("contextmenu", (e) => {
      e.preventDefault(); e.stopPropagation();
      $all(".desktop-icon").forEach(i => i.classList.remove("selected"));
      icon.classList.add("selected");
      let extra = null;
      if(id === "recyclebin"){
        const empty = STATE.recycleBin.length === 0;
        extra = [
          { type: "sep" },
          { label: "Empty Recycle Bin", icon: "🧹", disabled: empty, action: () => {
            showConfirm(`Permanently delete ${STATE.recycleBin.length} item(s)? This can't be undone.`, () => {
              fsEmptyRecycleBin();
              pushNotification("Recycle Bin", "Recycle Bin was emptied.", { icon: "🗑️" });
            }, { title: "Empty Recycle Bin", confirmText: "Empty", danger: true });
          }}
        ];
      }
      showContextMenu(...eventPoint(e), pinnableAppContextMenuItems(id, extra));
    });
    layer.appendChild(icon);
  });
  applyDesktopIconPrefs();
  updateRecycleBinBadge();
}
function applyDesktopIconPrefs(){
  const layer = $("#desktop-icons");
  if(!layer) return;
  layer.className = "icon-size-" + (STATE.iconSize || "large");
  layer.classList.toggle("icons-hidden", STATE.desktopIconsVisible === false);
}
function setIconSize(size){
  STATE.iconSize = size;
  saveState();
  applyDesktopIconPrefs();
}
function setDesktopIconsVisible(visible){
  STATE.desktopIconsVisible = visible;
  saveState();
  applyDesktopIconPrefs();
}
function updateRecycleBinBadge(){
  const count = STATE.recycleBin.length;
  $all("[data-recyclebin-badge]").forEach(b => {
    b.textContent = count > 99 ? "99+" : String(count);
    b.classList.toggle("hidden", count === 0);
  });
}

/* ---------------------------------------------------------
   12. CUSTOM CONTEXT MENU
   --------------------------------------------------------- */
let cmStack = [];
// On touch devices, the long-press-triggered "contextmenu" event can report
// clientX/clientY as 0, which made the menu always open in the top-left
// corner. Track the last real touch position and fall back to it when the
// contextmenu event itself has no usable coordinates.
let lastTouchX = null, lastTouchY = null, lastTouchTime = 0;
document.addEventListener("touchstart", (e) => {
  const t = e.touches[0];
  if(!t) return;
  lastTouchX = t.clientX; lastTouchY = t.clientY; lastTouchTime = Date.now();
}, { passive: true, capture: true });
function eventPoint(e){
  if(e.clientX || e.clientY) return [e.clientX, e.clientY];
  if(lastTouchX !== null && Date.now() - lastTouchTime < 1500) return [lastTouchX, lastTouchY];
  return [e.clientX, e.clientY];
}
function showContextMenu(x, y, items, opts){
  opts = opts || {};
  if(!opts.isSubmenu) cmStack = [];
  const menu = $("#context-menu");
  menu.innerHTML = "";
  if(opts.isSubmenu){
    const back = el("div", { class: "cm-item cm-back" });
    back.innerHTML = `<span class="cm-sub-icon">←</span><span>Back</span>`;
    back.addEventListener("click", (e) => {
      e.stopPropagation();
      const prev = cmStack.pop();
      if(prev) showContextMenu(prev.x, prev.y, prev.items, { isSubmenu: cmStack.length > 0 });
      else hideContextMenu();
    });
    menu.appendChild(back);
    menu.appendChild(el("div", { class: "cm-sep" }));
  }
  items.forEach(item => {
    if(item.type === "sep"){
      menu.appendChild(el("div", { class: "cm-sep" }));
      return;
    }
    const row = el("div", { class: "cm-item" + (item.disabled ? " disabled" : "") });
    const glyph = item.checked ? "✓" : (item.icon || "");
    row.innerHTML = `<span class="cm-sub-icon">${glyph}</span><span>${escapeHtml(item.label)}</span>${item.submenu ? '<span class="cm-arrow">›</span>' : ""}`;
    if(!item.disabled){
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        if(item.submenu){
          cmStack.push({ x, y, items });
          showContextMenu(x, y, item.submenu, { isSubmenu: true });
        } else {
          hideContextMenu();
          item.action && item.action();
        }
      });
    }
    menu.appendChild(row);
  });
  menu.classList.remove("hidden");
  // position, keeping menu on-screen
  const rowCount = items.length + (opts.isSubmenu ? 2 : 0);
  const menuW = 230, menuH = rowCount * 34 + 12;
  const left = clamp(x, 4, window.innerWidth - menuW - 4);
  const top = clamp(y, 4, window.innerHeight - menuH - 4);
  menu.style.left = left + "px";
  menu.style.top = top + "px";
}
function hideContextMenu(){
  $("#context-menu").classList.add("hidden");
  cmStack = [];
}

function desktopContextMenuItems(){
  return [
    { label: "View", icon:"🖼️", submenu: viewSubmenuItems() },
    { label: "Refresh", icon:"🔄", action: () => pushNotification("Desktop", "Refreshed.", {icon:"🔄"}) },
    { type: "sep" },
    { label: "New Note", icon:"📝", action: () => openApp("notes") },
    { type: "sep" },
    { label: "Personalize", icon:"🎨", action: () => openApp("settings") },
    { label: "Open Terminal here", icon:"💻", action: () => openApp("terminal") },
    { type: "sep" },
    { label: STATE.theme === "dark" ? "Switch to Light theme" : "Switch to Dark theme", icon:"🌗", action: () => { setTheme(STATE.theme === "dark" ? "light" : "dark"); } },
  ];
}
function viewSubmenuItems(){
  const size = STATE.iconSize || "large";
  const visible = STATE.desktopIconsVisible !== false;
  return [
    { label: "Large icons",  checked: size === "large",  action: () => setIconSize("large") },
    { label: "Medium icons", checked: size === "medium", action: () => setIconSize("medium") },
    { label: "Small icons",  checked: size === "small",  action: () => setIconSize("small") },
    { type: "sep" },
    { label: visible ? "Hide Desktop Icons" : "Show Desktop Icons", action: () => setDesktopIconsVisible(!visible) }
  ];
}
function fileItemContextMenuItems(node, callbacks){
  const items = [];
  items.push({ label: "Open", icon: node.type === "folder" ? "📂" : "📄", action: callbacks.onOpen });
  items.push({ type:"sep" });
  items.push({ label: "Rename", icon:"✏️", action: callbacks.onRename });
  items.push({ label: "Delete", icon:"🗑️", action: callbacks.onDelete });
  return items;
}

/* ---------------------------------------------------------
   13. FAKE FILE SYSTEM HELPERS
   --------------------------------------------------------- */
function fsGetNode(path){
  // path: array of names from root. [] = root.
  let node = STATE.fs;
  for(const part of path){
    if(!node.children || !node.children[part]) return null;
    node = node.children[part];
  }
  return node;
}
function fsGetParent(path){
  return fsGetNode(path.slice(0, -1));
}
function fsCreateFolder(path, name){
  const parent = fsGetNode(path);
  if(!parent || !parent.children) return false;
  if(parent.children[name]) return false;
  parent.children[name] = { type: "folder", children: {} };
  saveState();
  return true;
}
function fsCreateFile(path, name, content){
  const parent = fsGetNode(path);
  if(!parent || !parent.children) return false;
  if(parent.children[name]) return false;
  parent.children[name] = { type: "file", content: content || "" };
  saveState();
  return true;
}
function fsDelete(path){
  const parent = fsGetNode(path.slice(0,-1));
  const name = path[path.length-1];
  if(!parent || !parent.children || !parent.children[name]) return false;
  delete parent.children[name];
  saveState();
  return true;
}
function fsRename(path, newName){
  const parent = fsGetNode(path.slice(0,-1));
  const oldName = path[path.length-1];
  if(!parent || !parent.children || !parent.children[oldName]) return false;
  if(parent.children[newName]) return false;
  parent.children[newName] = parent.children[oldName];
  delete parent.children[oldName];
  saveState();
  return true;
}
function fsPathString(path){
  return "This PC" + (path.length ? " > " + path.join(" > ") : "");
}
function iconForNode(name, node){
  if(node.type === "folder") return "📁";
  const ext = (name.split(".").pop() || "").toLowerCase();
  if(["txt","md","note"].includes(ext)) return "📄";
  if(["png","jpg","jpeg","gif","svg"].includes(ext)) return "🖼️";
  return "📄";
}

/* ---- Recycle Bin (soft-delete) ---- */
function fsDeleteToTrash(path){
  const parent = fsGetNode(path.slice(0,-1));
  const name = path[path.length-1];
  if(!parent || !parent.children || !parent.children[name]) return false;
  const node = parent.children[name];
  STATE.recycleBin.unshift({
    id: uid("trash"),
    name,
    originalPath: path.slice(0,-1),
    node: JSON.parse(JSON.stringify(node)),
    deletedAt: Date.now()
  });
  delete parent.children[name];
  saveState();
  updateRecycleBinBadge();
  return true;
}
function fsRestoreFromTrash(trashId){
  const idx = STATE.recycleBin.findIndex(t => t.id === trashId);
  if(idx === -1) return false;
  const item = STATE.recycleBin[idx];
  const parent = fsGetNode(item.originalPath) || STATE.fs;
  let name = item.name;
  if(parent.children[name]){
    let i = 2;
    while(parent.children[`${name} (${i})`]) i++;
    name = `${name} (${i})`;
  }
  parent.children[name] = item.node;
  STATE.recycleBin.splice(idx, 1);
  saveState();
  updateRecycleBinBadge();
  return true;
}
function fsPermanentlyDelete(trashId){
  const before = STATE.recycleBin.length;
  STATE.recycleBin = STATE.recycleBin.filter(t => t.id !== trashId);
  const changed = STATE.recycleBin.length !== before;
  if(changed){ saveState(); updateRecycleBinBadge(); }
  return changed;
}
function fsEmptyRecycleBin(){
  STATE.recycleBin = [];
  saveState();
  updateRecycleBinBadge();
}


/* ---------------------------------------------------------
   21. GLOBAL EVENT WIRING
   --------------------------------------------------------- */
function wireGlobalEvents(){
  $("#start-btn").addEventListener("click", (e) => { e.stopPropagation(); toggleStartMenu(); });
  $("#start-search-input").addEventListener("input", (e) => filterStartApps(e.target.value));
  $("#start-search-input").addEventListener("keydown", (e) => {
    if(e.key === "Enter") { runAppSearch(e.target.value); closeStartMenu(); }
  });
  $("#taskbar-search-input").addEventListener("keydown", (e) => {
    if(e.key === "Enter"){ runAppSearch(e.target.value); e.target.value = ""; }
  });
  $("#taskbar-search").addEventListener("click", () => $("#taskbar-search-input").focus());

  $("#tray-notif").addEventListener("click", (e) => { e.stopPropagation(); toggleActionCenter(); });
  $("#clear-notifications").addEventListener("click", () => {
    STATE.notifications = []; saveState(); renderActionCenterList(); updateNotifDot();
  });
  $("#tray-volume").addEventListener("click", (e) => { e.stopPropagation(); toggleVolumePopup(); });
  $("#tray-volume").addEventListener("dblclick", (e) => { e.stopPropagation(); toggleMute(); });
  $("#volume-slider").addEventListener("input", (e) => setVolume(e.target.value));
  $("#ac-volume-slider").addEventListener("input", (e) => setVolume(e.target.value));

  $("#qt-theme").addEventListener("click", () => setTheme(STATE.theme === "dark" ? "light" : "dark"));
  $("#qt-search-focus").addEventListener("click", () => { closeActionCenter(); openStartMenu(); });
  $("#qt-settings").addEventListener("click", () => { closeActionCenter(); openApp("settings"); });
  $("#qt-terminal").addEventListener("click", () => { closeActionCenter(); openApp("terminal"); });

  $("#power-btn").addEventListener("click", () => {
    closeStartMenu();
    showConfirm(
      "All unsaved app state will reset. Your files, notes and settings stay saved.",
      () => location.reload(),
      { title: "Restart BrowserOS?", confirmText: "Restart", icon: "⏻" }
    );
  });

  $("#dialog-overlay").addEventListener("click", (e) => {
    if(e.target.id === "dialog-overlay"){
      const cancelBtn = $("#dialog-cancel-btn");
      cancelBtn ? cancelBtn.click() : closeDialog();
    }
  });

  // Close popups when clicking elsewhere
  document.addEventListener("click", (e) => {
    if(!e.target.closest("#start-menu") && !e.target.closest("#start-btn")) closeStartMenu();
    if(!e.target.closest("#action-center") && !e.target.closest("#tray-notif")) closeActionCenter();
    if(!e.target.closest("#volume-popup") && !e.target.closest("#tray-volume")) closeVolumePopup();
    if(!e.target.closest("#context-menu")) hideContextMenu();
  });

  // Desktop context menu + deselect icons
  $("#desktop").addEventListener("contextmenu", (e) => {
    if(e.target.closest(".window")) return;
    e.preventDefault();
    showContextMenu(...eventPoint(e), desktopContextMenuItems());
  });
  $("#desktop").addEventListener("click", (e) => {
    if(!e.target.closest(".desktop-icon")) $all(".desktop-icon").forEach(i => i.classList.remove("selected"));
  });

  // Titlebar context menu (right-click a window's titlebar)
  document.addEventListener("contextmenu", (e) => {
    const titlebar = e.target.closest(".win-titlebar");
    if(!titlebar) return;
    e.preventDefault();
    const winEl = titlebar.closest(".window");
    const id = winEl.dataset.winId;
    showContextMenu(...eventPoint(e), [
      { label: "Minimize", icon:"─", action: () => minimizeWindow(id) },
      { label: "Maximize / Restore", icon:"☐", action: () => toggleMaximize(id) },
      { type:"sep" },
      { label: "Close", icon:"✕", action: () => closeWindow(id) }
    ]);
  });

  // Taskbar app icon context menu
  $("#taskbar-apps").addEventListener("contextmenu", (e) => {
    const btn = e.target.closest(".taskbar-app");
    if(!btn) return;
    e.preventDefault();
    const id = btn.dataset.winId;
    showContextMenu(...eventPoint(e), [
      { label: "Restore", icon:"▢", action: () => { restoreWindow(id); focusWindow(id); } },
      { label: "Minimize", icon:"─", action: () => minimizeWindow(id) },
      { type:"sep" },
      { label: "Close window", icon:"✕", action: () => closeWindow(id) }
    ]);
  });

  // Fallback: block the native browser context menu everywhere else in the OS chrome
  // (but allow it inside text inputs/textareas so cut/copy/paste still works).
  document.addEventListener("contextmenu", (e) => {
    if(e.defaultPrevented) return;
    if(e.target.closest("input, textarea")) return;
    e.preventDefault();
  });

  // Lock screen dismiss
  $("#lock-screen").addEventListener("click", dismissLockScreen);
  window.addEventListener("keydown", (e) => {
    if(!$("#lock-screen").classList.contains("hidden")){ dismissLockScreen(); return; }
    handleKeyboardShortcuts(e);
  }, true);
}

function dismissLockScreen(){
  const lock = $("#lock-screen");
  if(lock.classList.contains("hidden")) return;
  lock.style.transition = "opacity 0.35s ease, transform 0.35s ease";
  lock.style.opacity = "0";
  lock.style.transform = "translateY(-30px)";
  setTimeout(() => lock.classList.add("hidden"), 350);
}

/* ---------------------------------------------------------
   22. KEYBOARD SHORTCUTS
   --------------------------------------------------------- */
function handleKeyboardShortcuts(e){
  const ctrlAlt = e.ctrlKey && e.altKey;
  if(ctrlAlt && e.code === "KeyT"){ e.preventDefault(); openApp("terminal"); return; }
  if(ctrlAlt && e.code === "KeyE"){ e.preventDefault(); openApp("filemanager"); return; }
  if(ctrlAlt && e.code === "KeyN"){ e.preventDefault(); openApp("notes"); return; }
  if(ctrlAlt && e.code === "KeyC"){ e.preventDefault(); openApp("calculator"); return; }
  if(ctrlAlt && e.code === "KeyS"){ e.preventDefault(); openApp("settings"); return; }
  if(ctrlAlt && e.code === "KeyF"){ e.preventDefault(); openStartMenu(); return; }
  if(e.key === "Escape"){
    closeStartMenu(); closeActionCenter(); closeVolumePopup(); hideContextMenu();
    return;
  }
  if(e.altKey && e.code === "F4"){ e.preventDefault(); closeFocusedWindow(); return; }
  if(e.key === "Meta" && !e.ctrlKey && !e.altKey && !e.shiftKey){
    // "Windows key" alone -> toggle start menu (best-effort; browsers may intercept this)
    e.preventDefault(); toggleStartMenu(); return;
  }
}

/* ---------------------------------------------------------
   23. BOOT SEQUENCE
   --------------------------------------------------------- */
function boot(){
  applyTheme();
  buildDesktopIcons();
  buildStartMenuApps();
  syncTaskbarApps();
  syncVolumeUI();
  renderActionCenterList();
  updateNotifDot();
  wireGlobalEvents();
  tickClock();

  setTimeout(() => {
    if(STATE.firstBoot){
      STATE.firstBoot = false;
      saveState();
      setTimeout(() => {
        pushNotification("Welcome to BrowserOS", "Right-click the desktop to get started, or open Settings to personalize your OS.", { icon: "🪟" });
      }, 900);
    }
  }, 1700);
}

document.addEventListener("DOMContentLoaded", boot);