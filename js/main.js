/**
 * Application Bootstrapper, Global Header Controls & Route Dispatcher
 */
(function () {
  'use strict';

  window.App = window.App || {};

  function updateHeaderProgress() {
    const label = document.getElementById('headerSolvedLabel');
    if (!label) return;
    const stats = window.App.Data.getStats();
    const solved = window.App.Store.state.solvedSet.size;
    label.textContent = `${solved.toLocaleString()} / ${(stats.totalProblems || 0).toLocaleString()}`;
  }

  function updateFooterStats() {
    const el = document.getElementById('footerStatsText');
    if (!el) return;
    const stats = window.App.Data.getStats();
    el.textContent = `${stats.totalCompanies} Companies & ${stats.totalProblems.toLocaleString()} Problems`;
  }

  function syncActiveNav(page, params) {
    let activeKey = page;
    if (page === 'sheet' && params && params.company) {
      activeKey = 'companies';
    }
    document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('data-route') === activeKey);
    });
  }

  function renderCurrentRoute() {
    const appRoot = document.getElementById('appRoot');
    if (!appRoot) return;

    const Store = window.App.Store;
    const Views = window.App.Views;
    const route = Store.parseRoute();

    syncActiveNav(route.page, route.params);

    const titles = {
      home: 'LeetCode Sheet — Company-Wise DSA Tracker & Roadmap',
      sheet: route.params.company
        ? `${route.params.company} · LeetCode Sheet`
        : 'DSA Problem Sheet · LeetCode Sheet',
      companies: 'Companies Directory (470) · LeetCode Sheet',
      roadmap: 'Interactive DSA Roadmap · LeetCode Sheet',
      analytics: 'Progress & Readiness Analytics · LeetCode Sheet',
      about: 'About & Deployment · LeetCode Sheet'
    };
    document.title = titles[route.page] || titles.home;

    const viewMap = {
      home: Views.Home,
      sheet: Views.Sheet,
      companies: Views.Companies,
      roadmap: Views.Roadmap,
      analytics: Views.Analytics,
      about: Views.About
    };

    const view = viewMap[route.page] || Views.Home;
    // Fresh mount wrapper per route prevents listener accumulation on #appRoot
    const mountEl = document.createElement('div');
    mountEl.className = 'route-mount';
    appRoot.replaceChildren(mountEl);
    view.render(mountEl, route.params);

    const drawer = document.getElementById('mobileNavDrawer');
    if (drawer) drawer.classList.add('hidden');
  }

  function initHeaderUtilities() {
    const Store = window.App.Store;
    const UI = window.App.UI;

    // Theme toggle
    const btnTheme = document.getElementById('btnThemeToggle');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => Store.toggleTheme());
    }

    // Mobile nav toggle
    const btnMobile = document.getElementById('btnMobileMenu');
    const mobileDrawer = document.getElementById('mobileNavDrawer');
    if (btnMobile && mobileDrawer) {
      btnMobile.addEventListener('click', () => {
        mobileDrawer.classList.toggle('hidden');
      });
    }

    // Settings dropdown
    const btnSettings = document.getElementById('btnSettings');
    const settingsMenu = document.getElementById('settingsMenu');
    if (btnSettings && settingsMenu) {
      btnSettings.addEventListener('click', e => {
        e.stopPropagation();
        settingsMenu.classList.toggle('hidden');
      });
      window.addEventListener('click', e => {
        if (!settingsMenu.contains(e.target) && e.target !== btnSettings) {
          settingsMenu.classList.add('hidden');
        }
      });
    }

    // Export JSON
    const btnExport = document.getElementById('btnExportData');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        const data = Store.exportAll();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `leetcode-sheet-progress-${Store.localDateKey()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (settingsMenu) settingsMenu.classList.add('hidden');
        UI.showToast('Progress backup exported');
      });
    }

    // Import JSON
    const inputImport = document.getElementById('inputImportData');
    if (inputImport) {
      inputImport.addEventListener('change', e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          try {
            const parsed = JSON.parse(ev.target.result);
            Store.importAll(parsed);
            if (settingsMenu) settingsMenu.classList.add('hidden');
            UI.showToast('Progress imported successfully');
            renderCurrentRoute();
          } catch (err) {
            UI.showToast('Invalid JSON backup file');
          }
        };
        reader.readAsText(file);
        e.target.value = '';
      });
    }

    // Reset Progress
    const btnReset = document.getElementById('btnResetData');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (settingsMenu) settingsMenu.classList.add('hidden');
        const ok = window.confirm('Reset all solved problems, stars, notes, and streaks? This cannot be undone.');
        if (!ok) return;
        Store.resetAll();
        UI.showToast('All progress reset');
        renderCurrentRoute();
      });
    }

    // Global '/' shortcut to focus active page search input
    window.addEventListener('keydown', e => {
      const tag = document.activeElement && document.activeElement.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        const searchBox = document.querySelector('#searchInput, #companyDirSearch');
        if (searchBox) {
          e.preventDefault();
          searchBox.focus();
        }
      }
    });
  }

  function updateStorageBadge() {
    const badge = document.getElementById('storageStatusBadge');
    const txt = document.getElementById('storageStatusText');
    if (!badge || !txt) return;
    const mode = window.App.Store.state.storageMode;
    badge.classList.toggle('disk', mode === 'sqlite');
    badge.classList.toggle('browser', mode === 'browser');
    if (mode === 'sqlite') {
      txt.textContent = 'Synced to SQLite (progress.db)';
    } else if (mode === 'browser') {
      txt.textContent = 'Browser storage (localStorage)';
    } else {
      txt.textContent = 'Checking storage...';
    }
  }

  function bootstrap() {
    if (!window.DSA_DATA) {
      const appRoot = document.getElementById('appRoot');
      if (appRoot) {
        appRoot.innerHTML = `
          <div class="empty-state" style="margin:3rem auto;max-width:520px;">
            <h3>Dataset Not Found</h3>
            <p>Could not load <code>assets/dsa-data.js</code>. Run <code>python3 scripts/build_data.py</code> to compile the dataset.</p>
          </div>`;
      }
      return;
    }

    window.App.Data.init();
    window.App.UI.initNotesModal();
    window.App.UI.initCommandPalette();
    initHeaderUtilities();
    updateHeaderProgress();
    updateFooterStats();
    updateStorageBadge();

    window.App.Store.subscribe(evt => {
      if (evt === 'solved' || evt === 'import' || evt === 'reset' || evt === 'sync') {
        updateHeaderProgress();
      }
      if (evt === 'sync') {
        renderCurrentRoute();
      }
      if (evt === 'mode' || evt === 'sync') {
        updateStorageBadge();
      }
    });

    window.addEventListener('hashchange', () => {
      renderCurrentRoute();
      window.scrollTo({ top: 0 });
    });

    renderCurrentRoute();
    window.App.Store.syncFromServer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();

