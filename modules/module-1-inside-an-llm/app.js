'use strict';
/* global SCREENS, GROUPS, ACTIONS, DEFINITIONS, SOURCES, ORIGINAL_BRIEF, esc */

(function main() {
  const KEY = 'inside-llm-module-1-v1';
  const $ = (sel) => document.querySelector(sel);

  const defaults = () => ({
    screen: 'challenge',
    visited: {},
    initialJudgment: null,
    reflection: '',
    layersOpen: 0,
    layerSel: 0,
    s1Class: {},
    s1Checked: false,
    s2Sort: {},
    s2Checked: false,
    s2Decision: '',
    s2Revealed: false,
    s3View: 'human',
    s3Seen: false,
    s3Why: false,
    s4Path: [],
    s4Final: false,
    s4Runs: 0,
    s4Malf: null,
    s4Temp: 1,
    s4Decision: null,
    s5Sel: [],
    s5Out: null,
    s5Tried: false,
    s5Success: false,
    s5Expanded: false,
    s5Fit: null,
    s5Rewrite: '',
    s5Revealed: false,
    s6Req: 0,
    s6Seen: [0],
    s6Decision: null,
    s7Ratings: { A: {}, B: {}, C: {} },
    s7Revealed: false,
    s7Boards: [],
    s7Metrics: [],
    s7Checked: false,
    s8Brief: ORIGINAL_BRIEF,
    s8Submitted: false,
    s8Clause: null,
    s8Check: {},
    explain: '',
    explainSubmitted: false,
    explainFeedback: false,
    rubric: {},
    quiz: {},
    review: {},
    art: {},
    notes: [],
    freeNotes: '',
  });

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(defaults(), JSON.parse(raw));
    } catch (e) { /* storage unavailable: start fresh */ }
    return defaults();
  }
  let S = load();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  }
  let saveTimer = null;
  const queueSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); };

  const screenMap = Object.fromEntries(SCREENS.map((x) => [x.id, x]));
  const index = (id) => SCREENS.findIndex((x) => x.id === id);

  function setPath(obj, path, value) {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = value;
  }

  // ---------- Toast / announce ----------
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2600);
  }

  // ---------- Rendering ----------
  function groupDone(gid) {
    return SCREENS.filter((x) => x.group === gid).every((x) => x.done(S));
  }

  function renderProgress() {
    const cur = screenMap[S.screen];
    $('#progress').innerHTML = GROUPS.map((g) => {
      const first = SCREENS.find((x) => x.group === g.id);
      const isCur = cur.group === g.id;
      const done = groupDone(g.id);
      return `<li><a href="#/${first.id}" class="${isCur ? 'is-current' : ''}${done ? ' is-done' : ''}"${isCur ? ' aria-current="step"' : ''}>
        <span class="p-state" aria-hidden="true">${done ? '✓' : g.num || '•'}</span>
        <span class="p-label">${g.num ? `<span class="p-num">Scene ${g.num}</span>` : ''}${g.label}</span>
        ${done ? '<span class="sr-only">(completed)</span>' : ''}
      </a></li>`;
    }).join('');
  }

  function renderPager() {
    const i = index(S.screen);
    const prev = SCREENS[i - 1];
    const next = SCREENS[i + 1];
    const cur = SCREENS[i];
    const label = (x) => {
      const g = GROUPS.find((gg) => gg.id === x.group);
      if (x.group === 'challenge' && x.id !== 'challenge') return 'Orientation';
      if (x.id === 'check') return 'Applied check';
      if (x.id === 'artifact') return 'My mental model';
      return g.num ? `Scene ${g.num}: ${g.label}` : g.label;
    };
    $('#pager').innerHTML = `
      <div class="pager-inner">
        ${prev ? `<a class="btn ghost" href="#/${prev.id}"><span aria-hidden="true">←</span> ${label(prev)}</a>` : '<span></span>'}
        <span class="pager-step muted small">${cur.step}${cur.done(S) ? ' · <span class="done-chip">done</span>' : ''}</span>
        ${next ? `<a class="btn" href="#/${next.id}">${label(next)} <span aria-hidden="true">→</span></a>` : '<span></span>'}
      </div>`;
  }

  function renderScreen() {
    $('#screen').innerHTML = screenMap[S.screen].render(S);
  }

  function renderCount() {
    const n = S.notes.length;
    $('#notesCount').textContent = n ? String(n) : '';
  }

  const focusSig = (el) => (el && el.dataset ? `${el.tagName}|${el.id}|${JSON.stringify({ ...el.dataset })}` : '');

  function rerender() {
    const sig = focusSig(document.activeElement);
    renderScreen();
    renderProgress();
    renderPager();
    renderCount();
    if (drawer === 'notes') renderDrawer();
    if (sig) {
      const match = [...document.querySelectorAll('[data-action],[data-bind],[data-change],[id]')].find((el) => focusSig(el) === sig);
      if (match) match.focus({ preventScroll: true });
    }
  }

  function show(id, moveFocus) {
    const target = screenMap[id] ? id : 'challenge';
    S.screen = target;
    S.visited[target] = true;
    save();
    rerender();
    closeNav();
    if (moveFocus) {
      window.scrollTo(0, 0);
      const h = $('#screen h1');
      if (h) h.focus({ preventScroll: true });
    }
  }

  // ---------- Drawers ----------
  let drawer = null;
  let opener = null;

  function renderDrawer() {
    const body = $('#drawerBody');
    if (drawer === 'defs') {
      $('#drawerTitle').textContent = 'Definitions';
      const labelFor = (id) => {
        const scr = screenMap[id];
        const g = GROUPS.find((x) => x.id === scr.group);
        return g.num ? `Scene ${g.num}` : 'Orientation';
      };
      body.innerHTML = `
        <label class="sr-only" for="defFilter">Filter definitions</label>
        <input type="search" id="defFilter" class="filter" placeholder="Filter terms…" data-filter autocomplete="off">
        <dl class="def-list">${DEFINITIONS.map(([t, d, where]) => `<div class="def-item" data-term="${esc(t.toLowerCase())} ${esc(d.toLowerCase())}">
          <dt>${t}</dt><dd>${d} <a href="#/${where}" class="small">Taught in ${labelFor(where)}</a></dd></div>`).join('')}</dl>`;
    } else if (drawer === 'sources') {
      $('#drawerTitle').textContent = 'Article sources';
      const groups = {};
      Object.values(SOURCES).forEach((x) => { (groups[x.group] = groups[x.group] || []).push(x); });
      body.innerHTML = `<p class="muted small">This module is an original synthesis of these sources and teaches everything essential itself. Links open in a new tab.</p>
        ${Object.entries(groups).map(([g, list]) => `<h3>${g}</h3>${g === 'Optional deeper reading' ? '<p class="muted small">Transformer internals and historical GPT-3 specifications are not required for the module outcome.</p>' : ''}
        <ul class="source-list">${list.map((x) => `<li><a href="${x.url}" target="_blank" rel="noopener">${x.title}</a><span class="muted small"> — ${x.by}</span><p class="small">${x.use}</p></li>`).join('')}</ul>`).join('')}`;
    } else if (drawer === 'notes') {
      $('#drawerTitle').textContent = 'PM notes';
      body.innerHTML = `
        <p class="muted small">Decisions you save appear here and in your final takeaway. Stored in this browser only.</p>
        ${S.notes.length ? `<ul class="notes-list">${S.notes.map((n) => `<li><span class="note-where">${esc(n.where)}</span><p>${esc(n.text)}</p>
          <button type="button" class="btn ghost sm" data-action="note-remove" data-id="${n.id}">Remove</button></li>`).join('')}</ul>`
          : '<p class="empty">No saved decisions yet. Use “Save to PM notes” on any PM implication or decision.</p>'}
        <label for="freeNotes" class="field-label">Your own notes</label>
        <textarea id="freeNotes" rows="6" data-bind="freeNotes" placeholder="Anything you want to remember…">${esc(S.freeNotes)}</textarea>`;
    }
  }

  function openDrawer(type, from) {
    drawer = type;
    opener = from || document.activeElement;
    renderDrawer();
    $('#drawer').hidden = false;
    $('#scrim').hidden = false;
    document.body.classList.add('has-overlay');
    $('#drawerClose').focus();
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer = null;
    $('#drawer').hidden = true;
    if (!document.body.classList.contains('nav-open')) {
      $('#scrim').hidden = true;
      document.body.classList.remove('has-overlay');
    }
    if (opener && opener.focus) opener.focus();
  }

  function openNav() {
    document.body.classList.add('nav-open', 'has-overlay');
    $('#navToggle').setAttribute('aria-expanded', 'true');
    $('#scrim').hidden = false;
    const cur = $('#progress .is-current');
    if (cur) cur.focus();
  }
  function closeNav() {
    if (!document.body.classList.contains('nav-open')) return;
    document.body.classList.remove('nav-open');
    $('#navToggle').setAttribute('aria-expanded', 'false');
    if (!drawer) {
      $('#scrim').hidden = true;
      document.body.classList.remove('has-overlay');
    }
  }

  // ---------- Utilities exposed to scenes ----------
  function copy(text) {
    const done = () => toast('Copied to clipboard.');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed. Use Download instead.'); }
    ta.remove();
  }
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const api = { rerender, save, toast, announce: toast, copy, download };

  function currentWhere() {
    const scr = screenMap[S.screen];
    const g = GROUPS.find((x) => x.id === scr.group);
    return g.num ? `Scene ${g.num} · ${g.label}` : g.label;
  }
  function addNote(text) {
    const clean = String(text || '').trim();
    if (!clean) { toast('Write something first.'); return; }
    if (S.notes.some((n) => n.text === clean)) { toast('Already in your PM notes.'); return; }
    S.notes.push({ id: String(Date.now()), where: currentWhere(), text: clean });
    toast('Saved to PM notes.');
  }

  Object.assign(ACTIONS, {
    'save-note': (s, el) => { addNote(el.dataset.note); },
    'save-bound': (s, el) => {
      const v = s[el.dataset.key];
      if (!String(v || '').trim()) { toast('Write something first.'); return false; }
      addNote(`${el.dataset.prefix}: ${v}`);
    },
    'note-remove': (s, el) => { s.notes = s.notes.filter((n) => n.id !== el.dataset.id); },
    'reset-all': () => {
      // eslint-disable-next-line no-alert
      if (!window.confirm('Reset all your answers, notes, and progress in this module?')) return false;
      S = defaults();
      save();
      window.location.hash = '#/challenge';
      show('challenge', true);
      return false;
    },
  });

  // ---------- Events ----------
  document.addEventListener('click', (e) => {
    const drawerBtn = e.target.closest('[data-drawer]');
    if (drawerBtn) {
      const type = drawerBtn.dataset.drawer;
      if (drawer === type) closeDrawer(); else openDrawer(type, drawerBtn);
      return;
    }
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    const r = fn(S, el, api);
    save();
    if (r !== false) rerender();
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.bind) {
      setPath(S, el.dataset.bind, el.type === 'checkbox' ? el.checked : el.value);
      queueSave();
    }
    if (el.hasAttribute && el.hasAttribute('data-filter')) {
      const q = el.value.trim().toLowerCase();
      document.querySelectorAll('.def-item').forEach((item) => {
        item.hidden = q && !item.dataset.term.includes(q);
      });
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.bind && el.type === 'checkbox') {
      setPath(S, el.dataset.bind, el.checked);
      save();
    }
    if (el.dataset && el.dataset.change) {
      if (el.dataset.bind) setPath(S, el.dataset.bind, el.value);
      const fn = ACTIONS[el.dataset.change];
      if (!fn) return;
      const r = fn(S, el, api);
      save();
      if (r !== false) rerender();
    }
  });

  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#scrim').addEventListener('click', () => { closeDrawer(); closeNav(); });
  $('#navToggle').addEventListener('click', () => {
    if (document.body.classList.contains('nav-open')) closeNav(); else openNav();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (drawer) closeDrawer();
    else closeNav();
  });
  // Clicking a definitions-drawer link navigates; close the drawer so the scene is visible.
  $('#drawerBody').addEventListener('click', (e) => {
    if (e.target.closest('a[href^="#/"]')) closeDrawer();
  });

  window.addEventListener('hashchange', () => {
    show(window.location.hash.replace(/^#\/?/, ''), true);
  });

  // ---------- Start ----------
  const fromHash = window.location.hash.replace(/^#\/?/, '');
  show(screenMap[fromHash] ? fromHash : S.screen, false);
}());
