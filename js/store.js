/**
 * Application State, Local Disk (progress.json) + localStorage Persistence, & Hash Router
 */
(function () {
  'use strict';

  window.App = window.App || {};

  const STORAGE_KEYS = {
    solved: 'dsa_solved',
    starred: 'dsa_starred',
    notes: 'dsa_notes',
    activity: 'dsa_activity',
    recent: 'dsa_recent',
    pinned: 'dsa_pinned_companies',
    theme: 'dsa_theme'
  };

  const DEFAULT_PINNED = [
    'Google', 'Amazon', 'Meta', 'Microsoft', 'Bloomberg', 'Uber',
    'Apple', 'Citadel', 'Goldman Sachs', 'Adobe', 'TikTok', 'LinkedIn'
  ];

  const state = {
    solvedSet: new Set(),
    starredSet: new Set(),
    notesMap: {},
    activityMap: {},
    recentLog: [],
    pinnedCompanies: DEFAULT_PINNED.slice(),
    storageMode: 'checking', // 'checking' | 'local-file' | 'browser'
    listeners: new Set()
  };

  function localDateKey(d) {
    const dt = d || new Date();
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function safeParse(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function safeSave(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function persistLocalAll() {
    safeSave(STORAGE_KEYS.solved, Array.from(state.solvedSet));
    safeSave(STORAGE_KEYS.starred, Array.from(state.starredSet));
    safeSave(STORAGE_KEYS.notes, state.notesMap);
    safeSave(STORAGE_KEYS.activity, state.activityMap);
    safeSave(STORAGE_KEYS.recent, state.recentLog);
    safeSave(STORAGE_KEYS.pinned, state.pinnedCompanies);
  }

  function load() {
    const solved = safeParse(STORAGE_KEYS.solved, []);
    if (Array.isArray(solved)) state.solvedSet = new Set(solved.map(Number));

    const starred = safeParse(STORAGE_KEYS.starred, []);
    if (Array.isArray(starred)) state.starredSet = new Set(starred.map(Number));

    const notes = safeParse(STORAGE_KEYS.notes, {});
    if (notes && typeof notes === 'object') state.notesMap = notes;

    const activity = safeParse(STORAGE_KEYS.activity, {});
    if (activity && typeof activity === 'object') state.activityMap = activity;

    const recent = safeParse(STORAGE_KEYS.recent, []);
    if (Array.isArray(recent)) state.recentLog = recent;

    const pinned = safeParse(STORAGE_KEYS.pinned, null);
    if (Array.isArray(pinned) && pinned.length > 0) state.pinnedCompanies = pinned;
  }

  function notify(eventType, payload) {
    state.listeners.forEach(fn => {
      try {
        fn(eventType, payload);
      } catch (e) {
        console.error(e);
      }
    });
  }

  function subscribe(fn) {
    state.listeners.add(fn);
    return () => state.listeners.delete(fn);
  }

  function getProblemSlug(pid) {
    const Data = window.App.Data;
    const p = Data && typeof Data.getProblem === 'function' ? Data.getProblem(pid) : null;
    return p && p.slug ? p.slug : '';
  }

  function patchServer(actionPayload) {
    if (state.storageMode !== 'sqlite' || typeof fetch !== 'function') return Promise.resolve(false);
    const body = JSON.stringify(actionPayload);
    return fetch('/api/progress/patch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: body.length < 60000
    })
      .then(res => res.ok)
      .catch(() => false);
  }

  function persistToServer(isReset) {
    if (state.storageMode !== 'sqlite' || typeof fetch !== 'function') return Promise.resolve(false);
    const payload = isReset
      ? { action: 'reset', pinnedCompanies: state.pinnedCompanies }
      : exportAll();
    const body = JSON.stringify(payload);
    return fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: body.length < 60000
    })
      .then(res => res.ok)
      .catch(() => false);
  }

  function hasAnyProgress() {
    return (
      state.solvedSet.size > 0 ||
      state.starredSet.size > 0 ||
      Object.keys(state.notesMap).length > 0 ||
      Object.keys(state.activityMap).length > 0 ||
      state.recentLog.length > 0
    );
  }

  function setSolved(pid, isSolved) {
    pid = Number(pid);
    const now = Date.now();
    const today = localDateKey();
    if (isSolved) {
      if (!state.solvedSet.has(pid)) {
        state.solvedSet.add(pid);
        state.activityMap[today] = (state.activityMap[today] || 0) + 1;
        state.recentLog = [{ pid, ts: now }, ...state.recentLog.filter(x => x.pid !== pid)].slice(0, 40);
        safeSave(STORAGE_KEYS.activity, state.activityMap);
        safeSave(STORAGE_KEYS.recent, state.recentLog);
      }
    } else {
      state.solvedSet.delete(pid);
    }
    safeSave(STORAGE_KEYS.solved, Array.from(state.solvedSet));
    const slug = getProblemSlug(pid);
    if (slug) {
      patchServer({ action: 'solve', slug, solved: Boolean(isSolved), date: today, ts: now });
    }
    notify('solved', { pid, isSolved });
  }

  function setStarred(pid, isStarred) {
    pid = Number(pid);
    if (isStarred) state.starredSet.add(pid);
    else state.starredSet.delete(pid);
    safeSave(STORAGE_KEYS.starred, Array.from(state.starredSet));
    const slug = getProblemSlug(pid);
    if (slug) {
      patchServer({ action: 'star', slug, starred: Boolean(isStarred), ts: Date.now() });
    }
    notify('starred', { pid, isStarred });
  }

  function setNote(pid, text) {
    pid = Number(pid);
    const clean = (text || '').trim();
    if (clean.length > 0) {
      state.notesMap[pid] = clean;
    } else {
      delete state.notesMap[pid];
    }
    safeSave(STORAGE_KEYS.notes, state.notesMap);
    const slug = getProblemSlug(pid);
    if (slug) {
      patchServer({ action: 'note', slug, note: clean, ts: Date.now() });
    }
    notify('note', { pid, text: clean });
  }

  function togglePinnedCompany(name) {
    const idx = state.pinnedCompanies.indexOf(name);
    if (idx >= 0) {
      state.pinnedCompanies.splice(idx, 1);
    } else {
      state.pinnedCompanies.unshift(name);
    }
    safeSave(STORAGE_KEYS.pinned, state.pinnedCompanies);
    patchServer({ action: 'pinned', pinnedCompanies: state.pinnedCompanies });
    notify('pinned', state.pinnedCompanies);
  }

  function exportAll() {
    const Data = window.App.Data;
    const solvedSlugs = [];
    const starredSlugs = [];
    const notesBySlug = {};
    const recentSlugs = [];

    if (Data && typeof Data.getProblem === 'function') {
      state.solvedSet.forEach(pid => {
        const p = Data.getProblem(pid);
        if (p && p.slug) solvedSlugs.push(p.slug);
      });
      state.starredSet.forEach(pid => {
        const p = Data.getProblem(pid);
        if (p && p.slug) starredSlugs.push(p.slug);
      });
      Object.keys(state.notesMap).forEach(k => {
        const p = Data.getProblem(Number(k));
        if (p && p.slug && state.notesMap[k]) {
          notesBySlug[p.slug] = state.notesMap[k];
        }
      });
      state.recentLog.forEach(entry => {
        const p = Data.getProblem(entry.pid);
        if (p && p.slug) recentSlugs.push({ slug: p.slug, ts: entry.ts });
      });
    }

    return {
      version: 3,
      exportedAt: new Date().toISOString(),
      solvedSlugs,
      starredSlugs,
      notesBySlug,
      recentSlugs,
      activity: state.activityMap,
      pinnedCompanies: state.pinnedCompanies
    };
  }

  function applyPayload(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Invalid JSON');
    const Data = window.App.Data;

    // Solved (prefer slug-stable format, fallback to legacy numeric IDs)
    if (Array.isArray(obj.solvedSlugs) && Data && typeof Data.getProblemBySlug === 'function') {
      const next = new Set();
      obj.solvedSlugs.forEach(slug => {
        const p = Data.getProblemBySlug(slug);
        if (p) next.add(p.id);
      });
      state.solvedSet = next;
    } else if (Array.isArray(obj.solved)) {
      state.solvedSet = new Set(obj.solved.map(Number));
    }

    // Starred
    if (Array.isArray(obj.starredSlugs) && Data && typeof Data.getProblemBySlug === 'function') {
      const next = new Set();
      obj.starredSlugs.forEach(slug => {
        const p = Data.getProblemBySlug(slug);
        if (p) next.add(p.id);
      });
      state.starredSet = next;
    } else if (Array.isArray(obj.starred)) {
      state.starredSet = new Set(obj.starred.map(Number));
    }

    // Notes
    if (obj.notesBySlug && typeof obj.notesBySlug === 'object' && Data && typeof Data.getProblemBySlug === 'function') {
      const nextNotes = {};
      Object.keys(obj.notesBySlug).forEach(slug => {
        const p = Data.getProblemBySlug(slug);
        if (p && obj.notesBySlug[slug]) nextNotes[p.id] = obj.notesBySlug[slug];
      });
      state.notesMap = nextNotes;
    } else if (obj.notes && typeof obj.notes === 'object') {
      state.notesMap = obj.notes;
    }

    // Recent solves
    if (Array.isArray(obj.recentSlugs) && Data && typeof Data.getProblemBySlug === 'function') {
      const nextRecent = [];
      obj.recentSlugs.forEach(item => {
        if (!item || !item.slug) return;
        const p = Data.getProblemBySlug(item.slug);
        if (p) nextRecent.push({ pid: p.id, ts: item.ts || Date.now() });
      });
      state.recentLog = nextRecent.slice(0, 40);
    } else if (Array.isArray(obj.recent)) {
      state.recentLog = obj.recent;
    }

    if (obj.activity && typeof obj.activity === 'object') {
      state.activityMap = obj.activity;
    }
    if (Array.isArray(obj.pinnedCompanies) && obj.pinnedCompanies.length > 0) {
      state.pinnedCompanies = obj.pinnedCompanies;
    }

    persistLocalAll();
  }

  function importAll(obj) {
    applyPayload(obj);
    persistToServer();
    notify('import', null);
  }

  function resetAll() {
    state.solvedSet.clear();
    state.starredSet.clear();
    state.notesMap = {};
    state.activityMap = {};
    state.recentLog = [];
    persistLocalAll();
    persistToServer(true);
    notify('reset', null);
  }

  function syncFromServer() {
    if (typeof fetch !== 'function' || window.location.protocol === 'file:') {
      state.storageMode = 'browser';
      notify('mode', state.storageMode);
      return Promise.resolve('browser');
    }

    return fetch('/api/progress', { cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error('Not supported');
        return res.json();
      })
      .then(payload => {
        state.storageMode = 'sqlite';
        if (payload && payload.exists && payload.data) {
          applyPayload(payload.data);
          notify('sync', null);
        } else if (hasAnyProgress()) {
          // Seed progress.db from existing localStorage on first run
          persistToServer(false);
        }
        notify('mode', state.storageMode);
        return 'sqlite';
      })
      .catch(() => {
        state.storageMode = 'browser';
        notify('mode', state.storageMode);
        return 'browser';
      });
  }

  function getStreakStats() {
    let currentStreak = 0;
    let totalTrackedSolves = 0;
    Object.values(state.activityMap).forEach(v => {
      totalTrackedSolves += Number(v) || 0;
    });

    const cursor = new Date();
    if (!state.activityMap[localDateKey(cursor)]) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (state.activityMap[localDateKey(cursor)] > 0) {
      currentStreak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    return { currentStreak, totalTrackedSolves };
  }

  function parseRoute() {
    const rawHash = window.location.hash || '';
    const searchParams = new URLSearchParams(window.location.search);

    if (!rawHash && (searchParams.has('company') || searchParams.has('view'))) {
      const legacyParams = {};
      searchParams.forEach((v, k) => { legacyParams[k] = v; });
      if (legacyParams.company) legacyParams.view = 'company';
      return { page: 'sheet', params: legacyParams };
    }

    const clean = rawHash.replace(/^#/, '');
    if (!clean || clean === '/') {
      return { page: 'home', params: {} };
    }

    if (!clean.startsWith('/')) {
      if (clean.includes('=')) {
        const lp = new URLSearchParams(clean);
        const obj = {};
        lp.forEach((v, k) => { obj[k] = v; });
        if (obj.company) obj.view = 'company';
        return { page: 'sheet', params: obj };
      }
      const decoded = decodeURIComponent(clean);
      if (window.DSA_DATA && window.DSA_DATA.companies && window.DSA_DATA.companies[decoded]) {
        return { page: 'sheet', params: { view: 'company', company: decoded } };
      }
      return { page: 'home', params: {} };
    }

    const [pathPart, queryPart] = clean.split('?');
    const segments = pathPart.split('/').filter(Boolean);
    const params = {};
    if (queryPart) {
      new URLSearchParams(queryPart).forEach((v, k) => {
        params[k] = v;
      });
    }

    const head = (segments[0] || '').toLowerCase();
    if (!head) return { page: 'home', params };
    if (head === 'sheet') return { page: 'sheet', params };
    if (head === 'companies') return { page: 'companies', params };
    if (head === 'company') {
      const compName = segments[1] ? decodeURIComponent(segments.slice(1).join('/')) : (params.company || 'Google');
      return { page: 'sheet', params: Object.assign({}, params, { view: 'company', company: compName }) };
    }
    if (head === 'roadmap') return { page: 'roadmap', params };
    if (head === 'analytics') return { page: 'analytics', params };
    if (head === 'about') return { page: 'about', params };

    return { page: 'home', params };
  }

  function navigate(hashPath) {
    const target = hashPath.startsWith('#') ? hashPath : `#${hashPath}`;
    if (window.location.hash === target) {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
      window.location.hash = target;
    }
  }

  function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function toggleTheme() {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEYS.theme, next);
    } catch (e) {}
    notify('theme', next);
    return next;
  }

  load();

  window.App.Store = {
    state,
    load,
    subscribe,
    setSolved,
    setStarred,
    setNote,
    togglePinnedCompany,
    exportAll,
    importAll,
    resetAll,
    syncFromServer,
    persistToServer,
    getStreakStats,
    localDateKey,
    parseRoute,
    navigate,
    getTheme,
    toggleTheme
  };
})();
