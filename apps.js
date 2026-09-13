/* =============================================================
   BrowserOS — a fake operating system in the browser

   apps.js — the individual app UIs (File Explorer, Notes,
   Calculator, Terminal, Settings, Credits). Relies on the shared
   state, helpers and dialog system defined in core.js, which is
   loaded first.
   ============================================================= */

"use strict";

/* ---------------------------------------------------------
   14. APP: FILE MANAGER
   --------------------------------------------------------- */
function renderFileManager(body, api){
  const tpl = $("#tpl-filemanager").content.cloneNode(true);
  body.appendChild(tpl);
  const root = body;
  let path = []; // array of folder names from root
  let history = [];

  const pathEl = $(".fm-path", root);
  const gridEl = $(".fm-grid", root);

  function refresh(){
    pathEl.textContent = fsPathString(path);
    const node = fsGetNode(path) || STATE.fs;
    const children = node.children || {};
    gridEl.innerHTML = "";
    const names = Object.keys(children).sort((a,b) => {
      const an = children[a].type, bn = children[b].type;
      if(an !== bn) return an === "folder" ? -1 : 1;
      return a.localeCompare(b);
    });
    if(names.length === 0){
      gridEl.classList.add("fm-grid-empty");
      gridEl.innerHTML = `<div class="fm-empty">This folder is empty.</div>`;
      return;
    }
    gridEl.classList.remove("fm-grid-empty");
    names.forEach(name => {
      const node2 = children[name];
      const itemPath = [...path, name];
      const item = el("div", { class: "fm-item", attrs: { "data-name": name } });
      item.innerHTML = `<span class="fm-icon">${iconForNode(name, node2)}</span><span class="fm-name">${escapeHtml(name)}</span>`;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        $all(".fm-item", gridEl).forEach(i => i.classList.remove("selected"));
        item.classList.add("selected");
        if(node2.type === "folder") goInto(name);
        else openTextViewer(itemPath, node2);
      });
      item.addEventListener("contextmenu", (e) => {
        e.preventDefault(); e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, fileItemContextMenuItems(node2, {
          onOpen: () => node2.type === "folder" ? goInto(name) : openTextViewer(itemPath, node2),
          onRename: () => {
            showPrompt("Enter a new name:", name, (nn) => {
              if(nn && nn.trim() && nn !== name){
                if(fsRename(itemPath, nn.trim())) refresh();
                else showAlert("A file or folder with that name already exists.", { danger: true, title: "Rename" });
              }
            }, { title: "Rename", confirmText: "Rename" });
          },
          onDelete: () => {
            showConfirm(`Move "${name}" to the Recycle Bin?`, () => {
              fsDeleteToTrash(itemPath); refresh();
              pushNotification("Recycle Bin", `"${name}" was moved to the Recycle Bin.`, { icon: "🗑️" });
            }, { title: `Delete "${name}"?`, confirmText: "Delete" });
          }
        }));
      });
      gridEl.appendChild(item);
    });
  }

  function goInto(name){
    history.push(path.slice());
    path = [...path, name];
    refresh();
  }
  function goUp(){
    if(path.length === 0) return;
    history.push(path.slice());
    path = path.slice(0, -1);
    refresh();
  }
  function goBack(){
    if(history.length === 0) return;
    path = history.pop();
    refresh();
  }
  function gotoNamed(name){
    history.push(path.slice());
    path = name === "This PC" ? [] : [name];
    refresh();
  }

  $(".fm-nav-btn[data-fm-back]", root).addEventListener("click", goBack);
  $(".fm-nav-btn[data-fm-up]", root).addEventListener("click", goUp);
  $all(".fm-sidebar-item", root).forEach(sb => {
    sb.addEventListener("click", () => gotoNamed(sb.dataset.goto));
  });
  $(".fm-new-folder", root).addEventListener("click", () => {
    showPrompt("Enter a name for the new folder:", "New folder", (name) => {
      if(name && name.trim()){
        if(fsCreateFolder(path, name.trim())) refresh();
        else showAlert("A file or folder with that name already exists.", { danger: true, title: "New folder" });
      }
    }, { title: "New folder", confirmText: "Create" });
  });
  $(".fm-new-file", root).addEventListener("click", () => {
    showPrompt("Enter a name for the new file:", "New note.txt", (name) => {
      if(name && name.trim()){
        if(fsCreateFile(path, name.trim(), "")) refresh();
        else showAlert("A file or folder with that name already exists.", { danger: true, title: "New file" });
      }
    }, { title: "New file", confirmText: "Create" });
  });
  gridEl.addEventListener("contextmenu", (e) => {
    if(e.target !== gridEl) return;
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, [
      { label: "New folder", icon:"📁", action: () => $(".fm-new-folder", root).click() },
      { label: "New file", icon:"📄", action: () => $(".fm-new-file", root).click() },
      { type:"sep" },
      { label: "Refresh", icon:"🔄", action: refresh }
    ]);
  });

  refresh();
}

function openTextViewer(path, node){
  // Build a lightweight standalone viewer window (not part of the registered APPS map)
  const viewerId = uid("win");
  const def = { name: path[path.length-1] || "Untitled", icon: "📄" };
  const winEl = el("div", { class: "window opening" });
  winEl.dataset.winId = viewerId;
  winEl.dataset.appId = "textviewer";
  const w = Math.min(520, window.innerWidth - 40), h = Math.min(420, window.innerHeight - 88);
  winEl.style.width = w+"px"; winEl.style.height = h+"px";
  winEl.style.left = clamp(140,0,window.innerWidth-w)+"px";
  winEl.style.top = clamp(90,0,window.innerHeight-48-h)+"px";
  winEl.innerHTML = `
    <div class="win-titlebar">
      <span class="win-icon">📄</span><span class="win-title">${escapeHtml(def.name)}</span>
      <div class="win-controls">
        <button class="win-min" title="Minimize">─</button>
        <button class="win-max" title="Maximize">☐</button>
        <button class="win-close" title="Close">✕</button>
      </div>
    </div>
    <div class="win-body"></div>
    <div class="resize-handle rh-e"></div><div class="resize-handle rh-w"></div>
    <div class="resize-handle rh-s"></div><div class="resize-handle rh-n"></div>
    <div class="resize-handle rh-se"></div><div class="resize-handle rh-sw"></div>
    <div class="resize-handle rh-ne"></div><div class="resize-handle rh-nw"></div>
  `;
  $("#windows-layer").appendChild(winEl);
  winState.windows.set(viewerId, { el: winEl, appId: "textviewer", minimized:false, maximized:false, prevRect:null, title: def.name, icon: "📄" });
  const body = $(".win-body", winEl);
  body.style.padding = "0";
  const ta = el("textarea");
  ta.style.cssText = "width:100%;height:100%;border:none;outline:none;resize:none;padding:14px;font-family:'Cascadia Mono',Consolas,monospace;font-size:13px;background:var(--win-bg);color:var(--text-primary);";
  ta.value = node.content || "";
  ta.addEventListener("input", () => {
    node.content = ta.value;
    saveState();
  });
  body.appendChild(ta);
  makeDraggable(winEl); makeResizable(winEl);
  $(".win-min", winEl).addEventListener("click", (e)=>{e.stopPropagation(); minimizeWindow(viewerId);});
  $(".win-max", winEl).addEventListener("click", (e)=>{e.stopPropagation(); toggleMaximize(viewerId);});
  $(".win-close", winEl).addEventListener("click", (e)=>{e.stopPropagation(); closeWindow(viewerId);});
  $(".win-titlebar", winEl).addEventListener("dblclick", ()=> toggleMaximize(viewerId));
  winEl.addEventListener("mousedown", () => focusWindow(viewerId));
  focusWindow(viewerId);
  syncTaskbarApps();
  playSound("open");
}

/* ---------------------------------------------------------
   14b. APP: RECYCLE BIN
   --------------------------------------------------------- */
function renderRecycleBin(body, api){
  const tpl = $("#tpl-recyclebin").content.cloneNode(true);
  body.appendChild(tpl);
  const root = body;
  const gridEl = $(".rb-grid", root);
  const countEl = $(".rb-count", root);
  const emptyBtn = $(".rb-empty-btn", root);
  const restoreBtn = $(".rb-restore-btn", root);
  const deleteBtn = $(".rb-delete-btn", root);
  let selectedId = null;

  function updateToolbar(){
    restoreBtn.disabled = !selectedId;
    deleteBtn.disabled = !selectedId;
    emptyBtn.disabled = STATE.recycleBin.length === 0;
    countEl.textContent = STATE.recycleBin.length === 0
      ? "Recycle Bin is empty"
      : `${STATE.recycleBin.length} item${STATE.recycleBin.length === 1 ? "" : "s"}`;
  }

  function refresh(){
    gridEl.innerHTML = "";
    if(STATE.recycleBin.length === 0){
      gridEl.classList.add("fm-grid-empty");
      gridEl.innerHTML = `<div class="fm-empty">Recycle Bin is empty.</div>`;
      updateToolbar();
      return;
    }
    gridEl.classList.remove("fm-grid-empty");
    STATE.recycleBin.forEach(entry => {
      const icon = entry.node.type === "folder" ? "📁" : iconForNode(entry.name, entry.node);
      const item = el("div", { class: "fm-item" + (entry.id === selectedId ? " selected" : ""), attrs: { "data-trash-id": entry.id } });
      item.innerHTML = `<span class="fm-icon">${icon}</span><span class="fm-name">${escapeHtml(entry.name)}</span>`;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        selectedId = entry.id;
        refresh();
      });
      item.addEventListener("contextmenu", (e) => {
        e.preventDefault(); e.stopPropagation();
        selectedId = entry.id;
        refresh();
        showContextMenu(e.clientX, e.clientY, [
          { label: "Restore", icon:"↩️", action: () => doRestore(entry.id) },
          { label: "Delete permanently", icon:"🗑️", action: () => doDelete(entry.id) }
        ]);
      });
      gridEl.appendChild(item);
    });
    updateToolbar();
  }

  function doRestore(id){
    const entry = STATE.recycleBin.find(t => t.id === id);
    if(!entry) return;
    if(fsRestoreFromTrash(id)){
      pushNotification("Recycle Bin", `"${entry.name}" was restored.`, { icon: "↩️" });
      if(selectedId === id) selectedId = null;
      refresh();
    }
  }
  function doDelete(id){
    const entry = STATE.recycleBin.find(t => t.id === id);
    if(!entry) return;
    showConfirm(`Permanently delete "${entry.name}"? This can't be undone.`, () => {
      fsPermanentlyDelete(id);
      if(selectedId === id) selectedId = null;
      refresh();
    }, { title: "Delete permanently", confirmText: "Delete", danger: true });
  }

  restoreBtn.addEventListener("click", () => { if(selectedId) doRestore(selectedId); });
  deleteBtn.addEventListener("click", () => { if(selectedId) doDelete(selectedId); });
  emptyBtn.addEventListener("click", () => {
    if(STATE.recycleBin.length === 0) return;
    showConfirm(`Permanently delete ${STATE.recycleBin.length} item(s)? This can't be undone.`, () => {
      fsEmptyRecycleBin();
      selectedId = null;
      refresh();
    }, { title: "Empty Recycle Bin", confirmText: "Empty", danger: true });
  });
  gridEl.addEventListener("click", () => { selectedId = null; refresh(); });

  refresh();
}

/* ---------------------------------------------------------
   15. APP: NOTES
   --------------------------------------------------------- */
function renderNotes(body, api){
  const tpl = $("#tpl-notes").content.cloneNode(true);
  body.appendChild(tpl);
  const root = body;
  const listEl = $(".notes-list", root);
  const titleInput = $(".notes-title-input", root);
  const bodyInput = $(".notes-body-input", root);
  let activeId = STATE.notes.length ? STATE.notes[0].id : null;

  function refreshList(){
    listEl.innerHTML = "";
    const sorted = [...STATE.notes].sort((a,b) => b.updated - a.updated);
    if(sorted.length === 0){
      listEl.innerHTML = `<div class="ac-empty">No notes yet</div>`;
    }
    sorted.forEach(note => {
      const item = el("div", { class: "notes-list-item" + (note.id === activeId ? " active" : "") });
      item.innerHTML = `<div class="nli-title">${escapeHtml(note.title || "Untitled")}</div><div class="nli-preview">${escapeHtml((note.body||"").slice(0,60))}</div>`;
      item.addEventListener("click", () => { activeId = note.id; refreshList(); loadEditor(); });
      listEl.appendChild(item);
    });
  }
  function loadEditor(){
    const note = STATE.notes.find(n => n.id === activeId);
    if(!note){
      titleInput.style.display = "none"; bodyInput.style.display = "none";
      return;
    }
    titleInput.style.display = ""; bodyInput.style.display = "";
    titleInput.value = note.title;
    bodyInput.value = note.body;
  }
  function persistActive(){
    const note = STATE.notes.find(n => n.id === activeId);
    if(!note) return;
    note.title = titleInput.value;
    note.body = bodyInput.value;
    note.updated = Date.now();
    saveState();
    refreshList();
  }
  titleInput.addEventListener("input", persistActive);
  bodyInput.addEventListener("input", persistActive);

  $(".notes-new-btn", root).addEventListener("click", () => {
    const note = { id: uid("note"), title: "New note", body: "", updated: Date.now() };
    STATE.notes.push(note);
    activeId = note.id;
    saveState();
    refreshList();
    loadEditor();
    titleInput.focus();
    titleInput.select();
  });

  listEl.addEventListener("contextmenu", (e) => {
    const item = e.target.closest(".notes-list-item");
    if(!item) return;
    e.preventDefault();
    const idx = Array.from(listEl.children).indexOf(item);
    const sorted = [...STATE.notes].sort((a,b) => b.updated - a.updated);
    const note = sorted[idx];
    if(!note) return;
    showContextMenu(e.clientX, e.clientY, [
      { label: "Delete note", icon:"🗑️", action: () => {
        showConfirm(`"${note.title || 'Untitled'}" will be permanently deleted.`, () => {
          STATE.notes = STATE.notes.filter(n => n.id !== note.id);
          if(activeId === note.id) activeId = STATE.notes.length ? STATE.notes[0].id : null;
          saveState(); refreshList(); loadEditor();
        }, { title: "Delete note?", confirmText: "Delete", danger: true });
      }}
    ]);
  });

  refreshList();
  loadEditor();
}

/* ---------------------------------------------------------
   16. APP: CALCULATOR
   --------------------------------------------------------- */
function renderCalculator(body, api){
  const tpl = $("#tpl-calculator").content.cloneNode(true);
  body.appendChild(tpl);
  const root = body;
  const exprEl = $(".calc-expression", root);
  const resultEl = $(".calc-result", root);

  let current = "0";
  let previous = null;
  let operator = null;
  let justEvaluated = false;

  function updateDisplay(){
    resultEl.textContent = formatNum(current);
    exprEl.textContent = previous !== null && operator ? `${formatNum(previous)} ${operator}` : "";
  }
  function formatNum(n){
    if(n === "Error") return n;
    const num = parseFloat(n);
    if(Number.isNaN(num)) return "0";
    if(Math.abs(num) > 1e15) return num.toExponential(6);
    return num.toLocaleString(undefined, { maximumFractionDigits: 10 });
  }
  function inputDigit(d){
    if(justEvaluated){ current = "0"; justEvaluated = false; }
    if(current === "0" && d !== ".") current = d;
    else if(d === "." && current.includes(".")) return;
    else current += d;
  }
  function inputOperator(op){
    if(operator && previous !== null && !justEvaluated){
      compute();
    }
    previous = current;
    operator = op;
    current = "0";
    justEvaluated = false;
  }
  function compute(){
    if(operator === null || previous === null) return;
    const a = parseFloat(previous), b = parseFloat(current);
    let r;
    switch(operator){
      case "+": r = a + b; break;
      case "−": r = a - b; break;
      case "×": r = a * b; break;
      case "÷": r = b === 0 ? NaN : a / b; break;
      default: r = b;
    }
    current = Number.isNaN(r) ? "Error" : String(r);
    operator = null; previous = null; justEvaluated = true;
  }
  root.querySelectorAll("[data-calc]").forEach(btn => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.calc;
      if(kind === "num") inputDigit(btn.dataset.num);
      else if(kind === "decimal") inputDigit(".");
      else if(kind === "op") inputOperator(btn.dataset.op);
      else if(kind === "equals") compute();
      else if(kind === "clear"){ current = "0"; previous = null; operator = null; justEvaluated = false; }
      else if(kind === "negate") current = String(parseFloat(current) * -1);
      else if(kind === "percent") current = String(parseFloat(current) / 100);
      updateDisplay();
    });
  });

  // keyboard support while calculator window is focused
  root.tabIndex = 0;
  root.addEventListener("keydown", (e) => {
    if(/[0-9]/.test(e.key)) inputDigit(e.key);
    else if(e.key === ".") inputDigit(".");
    else if(["+","-","*","/"].includes(e.key)) inputOperator({ "+":"+", "-":"−", "*":"×", "/":"÷" }[e.key]);
    else if(e.key === "Enter" || e.key === "=") compute();
    else if(e.key === "Escape"){ current="0"; previous=null; operator=null; }
    else if(e.key === "Backspace") current = current.length > 1 ? current.slice(0,-1) : "0";
    else return;
    updateDisplay();
  });

  updateDisplay();
}

/* ---------------------------------------------------------
   17. APP: TERMINAL
   --------------------------------------------------------- */
function renderTerminal(body, api){
  const tpl = $("#tpl-terminal").content.cloneNode(true);
  body.appendChild(tpl);
  const root = body;
  const output = $(".terminal-output", root);
  const input = $(".terminal-input", root);
  let cwd = []; // path array, same shape as file manager
  let cmdHistory = [];
  let histIdx = -1;

  function printLine(text, cls){
    const line = el("div", { class: "t-line" + (cls ? " " + cls : "") });
    line.textContent = text;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }
  function printCmdEcho(cmd){
    const line = el("div", { class: "t-line t-cmd" });
    line.textContent = cmd;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }
  function promptStr(){
    return "C:\\Users\\User" + (cwd.length ? "\\" + cwd.join("\\") : "") + ">";
  }
  function refreshPromptLabel(){
    $(".terminal-prompt", root).textContent = promptStr();
  }

  const NEOFETCH = [
    "        ,.=:!!t3Z3z.,               user@browseros",
    "       :tt:::tt333EE3               -----------------",
    "       Et:::ztt33EEEL @Ee.,      ..  OS: BrowserOS (fake)",
    "      ;tt:::tt333EE7 ;EEEEEEttttt33#  Shell: fakesh 1.0",
    "     :Et:::zt333EEQ. $EEEEEttttt33QL  Renderer: your browser",
    "     it::::tt333EEF @EEEEEEttttt33F   Storage: localStorage",
    "    ;3=*^```\"*4EEV :EEEEEEttttt33@.   Uptime: since page load",
    "    ,.=::::!t=., ` @EEEEEEtttz33QF",
    "   ;::::::::zt33)   \"4EEEtttji3P*",
    "  :t::::::::tt33.:Z3z..  `` ,..g."
  ];

  const COMMANDS = {
    help(){
      printLine("Available commands:");
      printLine("  help            Show this help");
      printLine("  ls              List files in current folder");
      printLine("  cd <folder>     Change folder (cd .. to go up)");
      printLine("  cat <file>      Print file contents");
      printLine("  mkdir <name>    Create a folder");
      printLine("  touch <name>    Create an empty file");
      printLine("  rm <name>       Move a file or folder to the Recycle Bin");
      printLine("  recyclebin      List items currently in the Recycle Bin");
      printLine("  pwd             Print working directory");
      printLine("  echo <text>     Print text");
      printLine("  whoami          Print current user");
      printLine("  date            Print current date/time");
      printLine("  neofetch        System info");
      printLine("  theme <light|dark>   Change theme");
      printLine("  open <app>      Open an app (filemanager, notes, calculator, terminal, settings, credits)");
      printLine("  apps            List openable apps");
      printLine("  history         Show command history");
      printLine("  clear           Clear the screen");
    },
    ls(){
      const node = fsGetNode(cwd) || STATE.fs;
      const names = Object.keys(node.children || {});
      if(names.length === 0){ printLine("(empty)"); return; }
      names.forEach(n => printLine((node.children[n].type === "folder" ? "[DIR]  " : "       ") + n));
    },
    cd(args){
      if(!args[0] || args[0] === "~"){ cwd = []; refreshPromptLabel(); return; }
      if(args[0] === ".."){ if(cwd.length) cwd.pop(); refreshPromptLabel(); return; }
      const node = fsGetNode(cwd);
      const target = node && node.children ? node.children[args[0]] : null;
      if(!target || target.type !== "folder"){ printLine(`The system cannot find the path specified: ${args[0]}`, "t-error"); return; }
      cwd.push(args[0]);
      refreshPromptLabel();
    },
    pwd(){ printLine(fsPathString(cwd)); },
    cat(args){
      if(!args[0]){ printLine("Usage: cat <file>", "t-error"); return; }
      const node = fsGetNode(cwd);
      const target = node && node.children ? node.children[args[0]] : null;
      if(!target){ printLine(`File not found: ${args[0]}`, "t-error"); return; }
      if(target.type === "folder"){ printLine(`${args[0]} is a directory.`, "t-error"); return; }
      printLine(target.content || "(empty file)");
    },
    mkdir(args){
      if(!args[0]){ printLine("Usage: mkdir <name>", "t-error"); return; }
      if(fsCreateFolder(cwd, args[0])) printLine(`Folder created: ${args[0]}`, "t-success");
      else printLine("A file or folder with that name already exists.", "t-error");
    },
    touch(args){
      if(!args[0]){ printLine("Usage: touch <name>", "t-error"); return; }
      if(fsCreateFile(cwd, args[0], "")) printLine(`File created: ${args[0]}`, "t-success");
      else printLine("A file or folder with that name already exists.", "t-error");
    },
    rm(args){
      if(!args[0]){ printLine("Usage: rm <name>", "t-error"); return; }
      if(fsDeleteToTrash([...cwd, args[0]])) printLine(`Moved to Recycle Bin: ${args[0]}`, "t-success");
      else printLine(`Not found: ${args[0]}`, "t-error");
    },
    recyclebin(){
      if(STATE.recycleBin.length === 0){ printLine("Recycle Bin is empty."); return; }
      STATE.recycleBin.forEach(item => printLine(`  ${item.name}`));
    },
    echo(args){ printLine(args.join(" ")); },
    whoami(){ printLine("browseros\\user"); },
    date(){ printLine(new Date().toString()); },
    neofetch(){ NEOFETCH.forEach(l => printLine(l, "t-accent")); },
    theme(args){
      if(args[0] !== "light" && args[0] !== "dark"){ printLine("Usage: theme <light|dark>", "t-error"); return; }
      setTheme(args[0]);
      printLine(`Theme set to ${args[0]}.`, "t-success");
    },
    open(args){
      if(!args[0] || !APPS[args[0]]){ printLine(`Unknown app: ${args[0] || ""}. Try: apps`, "t-error"); return; }
      openApp(args[0]);
      printLine(`Opening ${APPS[args[0]].name}...`, "t-success");
    },
    apps(){ Object.entries(APPS).forEach(([id,def]) => printLine(`  ${id.padEnd(14)} ${def.name}`)); },
    history(){ cmdHistory.forEach((c,i) => printLine(`  ${i+1}  ${c}`)); },
    clear(){ output.innerHTML = ""; },
    ver(){ printLine("BrowserOS [Version 1.0.0]"); },
    exit(){ api.close(); }
  };

  function runCommand(raw){
    const trimmed = raw.trim();
    if(trimmed) { cmdHistory.push(trimmed); histIdx = cmdHistory.length; }
    printCmdEcho(trimmed);
    if(!trimmed) return;
    const parts = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).map(a => a.replace(/^"|"$/g, ""));
    if(COMMANDS[cmd]) COMMANDS[cmd](args);
    else printLine(`'${cmd}' is not recognized as an internal or external command.`, "t-error");
  }

  input.addEventListener("keydown", (e) => {
    if(e.key === "Enter"){
      runCommand(input.value);
      input.value = "";
    } else if(e.key === "ArrowUp"){
      e.preventDefault();
      if(histIdx > 0){ histIdx--; input.value = cmdHistory[histIdx] || ""; }
    } else if(e.key === "ArrowDown"){
      e.preventDefault();
      if(histIdx < cmdHistory.length){ histIdx++; input.value = cmdHistory[histIdx] || ""; }
    }
  });
  root.addEventListener("click", () => input.focus());

  printLine("BrowserOS Terminal [Version 1.0.0]");
  printLine('Type "help" to see the list of commands.');
  printLine("");
  setTimeout(() => input.focus(), 50);
}

/* ---------------------------------------------------------
   18. THEME SETTERS (used by Settings app + terminal + context menu)
   --------------------------------------------------------- */
function setTheme(t){ STATE.theme = t; saveState(); applyTheme(); }
function setAccent(c){ STATE.accent = c; saveState(); applyTheme(); }
function setWallpaper(w){ STATE.wallpaper = w; saveState(); applyTheme(); }

/* ---------------------------------------------------------
   19. APP: SETTINGS
   --------------------------------------------------------- */
function renderSettings(body, api){
  const tpl = $("#tpl-settings").content.cloneNode(true);
  body.appendChild(tpl);
  const root = body;

  $all(".settings-nav-item", root).forEach(nav => {
    nav.addEventListener("click", () => {
      $all(".settings-nav-item", root).forEach(n => n.classList.remove("active"));
      nav.classList.add("active");
      $all(".settings-panel", root).forEach(p => p.classList.toggle("hidden", p.dataset.panel !== nav.dataset.panel));
    });
  });

  $all(".theme-swatch", root).forEach(btn => btn.addEventListener("click", () => setTheme(btn.dataset.theme)));
  $all(".accent-swatch", root).forEach(btn => btn.addEventListener("click", () => setAccent(btn.dataset.accent)));
  $all(".wallpaper-swatch", root).forEach(btn => btn.addEventListener("click", () => setWallpaper(btn.dataset.wallpaper)));

  const volSlider = $("#settings-volume-slider", root);
  volSlider.value = STATE.volume;
  volSlider.addEventListener("input", () => setVolume(volSlider.value));

  const soundToggle = $("#settings-sound-toggle", root);
  soundToggle.checked = STATE.soundEnabled;
  soundToggle.addEventListener("change", () => { STATE.soundEnabled = soundToggle.checked; saveState(); });

  const appsList = $("#settings-apps-list", root);
  function refreshAppsList(){
    appsList.innerHTML = "";
    Object.entries(APPS).forEach(([id, def]) => {
      if(id === "recyclebin") return; // desktop-only
      const row = el("div", { class: "settings-app-row" });
      row.innerHTML = `<span>${def.icon} ${escapeHtml(def.name)}</span>`;
      const btnGroup = el("div", { class: "settings-app-row-btns" });
      const pinBtn = el("button", { class: "fm-nav-btn", text: isAppPinned(id) ? "Unpin" : "Pin to taskbar" });
      pinBtn.style.width = "auto"; pinBtn.style.padding = "4px 12px";
      pinBtn.addEventListener("click", () => { isAppPinned(id) ? unpinApp(id) : pinApp(id); refreshAppsList(); });
      const launchBtn = el("button", { class: "fm-nav-btn", text: "Open" });
      launchBtn.style.width = "auto"; launchBtn.style.padding = "4px 12px";
      launchBtn.addEventListener("click", () => openApp(id));
      btnGroup.appendChild(pinBtn);
      btnGroup.appendChild(launchBtn);
      row.appendChild(btnGroup);
      appsList.appendChild(row);
    });
  }
  refreshAppsList();

  $("#about-reset-btn", root).addEventListener("click", () => {
    showConfirm(
      "Notes, files, and settings will be permanently erased.",
      () => { localStorage.removeItem(LS_KEY); location.reload(); },
      { title: "Reset all data?", confirmText: "Reset", danger: true, icon: "🗑️" }
    );
  });

  applyTheme();
}

/* ---------------------------------------------------------
   20. APP: CREDITS
   --------------------------------------------------------- */
function renderCredits(body, api){
  const tpl = $("#tpl-credits").content.cloneNode(true);
  body.appendChild(tpl);
}

