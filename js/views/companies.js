/**
 * Searchable 470-Company Directory View
 */
(function () {
  'use strict';

  window.App = window.App || {};
  window.App.Views = window.App.Views || {};

  const localState = {
    query: '',
    filter: 'active', // 'active' | 'hot30' | 'MAANG' | 'Quant' | 'Tech' | 'all'
    sortBy: 'total', // 'total' | 'hot30' | 'readiness' | 'alpha'
    showLimit: 60
  };

  let mountedRoot = null;

  function getFilteredCompanies() {
    const Data = window.App.Data;
    const Store = window.App.Store;
    const allComps = Data.getCompanyMetaList();
    const q = localState.query.trim().toLowerCase();

    let list = allComps.filter(c => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (localState.filter === 'active') return c.total > 0;
      if (localState.filter === 'hot30') return (c.counts['30d'] || 0) > 0;
      if (localState.filter === 'MAANG' || localState.filter === 'Quant' || localState.filter === 'Tech') {
        return c.tier === localState.filter && c.total > 0;
      }
      return true;
    });

    // Compute readiness only if sorting by readiness or rendering visible slice
    if (localState.sortBy === 'readiness') {
      list = list.map(c => ({
        meta: c,
        readiness: Data.getCompanyReadiness(c.name, Store.state.solvedSet, 'all')
      }));
      list.sort((a, b) => b.readiness.pct - a.readiness.pct || b.meta.total - a.meta.total);
      return list.map(x => x.meta);
    }

    list = list.slice();
    list.sort((a, b) => {
      if (localState.sortBy === 'hot30') {
        return (b.counts['30d'] || 0) - (a.counts['30d'] || 0) || b.total - a.total;
      }
      if (localState.sortBy === 'alpha') {
        return a.name.localeCompare(b.name);
      }
      return b.total - a.total || a.name.localeCompare(b.name);
    });

    return list;
  }

  function renderGrid() {
    if (!mountedRoot) return;
    const Data = window.App.Data;
    const Store = window.App.Store;
    const UI = window.App.UI;
    const topics = Data.getTopics();

    const filtered = getFilteredCompanies();
    const visible = filtered.slice(0, localState.showLimit);

    const countLabel = mountedRoot.querySelector('#companyDirCount');
    if (countLabel) {
      countLabel.textContent = `Showing ${visible.length} of ${filtered.length} companies`;
    }

    const gridEl = mountedRoot.querySelector('#companiesGrid');
    if (!gridEl) return;

    if (visible.length === 0) {
      gridEl.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <h3>No companies matched "${UI.escapeHTML(localState.query)}"</h3>
          <p>Try clearing the search query or switching the category pill to All (470).</p>
        </div>`;
    } else {
      gridEl.innerHTML = visible.map(c => {
        const readiness = Data.getCompanyReadiness(c.name, Store.state.solvedSet, 'all');
        const total = c.total || 1;
        const eW = c.total > 0 ? (c.diff[0] / total) * 100 : 0;
        const mW = c.total > 0 ? (c.diff[1] / total) * 100 : 0;
        const hW = c.total > 0 ? (c.diff[2] / total) * 100 : 0;
        const topTopicsHtml = (c.topTopics || []).slice(0, 3).map(tid =>
          `<span class="tag-badge static">${UI.escapeHTML(topics[tid] || '')}</span>`
        ).join('');

        return `
          <a href="#/company/${encodeURIComponent(c.name)}" class="company-dir-card ${c.total === 0 ? 'empty-company' : ''}">
            <div class="cdc-top">
              <div class="cdc-title-wrap">
                <h3 class="cdc-name">${UI.escapeHTML(c.name)}</h3>
                ${c.tier !== 'Standard' ? `<span class="tier-pill ${c.tier.toLowerCase()}">${UI.escapeHTML(c.tier)}</span>` : ''}
              </div>
              ${(c.counts['30d'] || 0) > 0
                ? `<span class="hot-pill tabular-nums">🔥 ${c.counts['30d']} (30d)</span>`
                : `<span class="muted-pill tabular-nums">${c.total} total</span>`}
            </div>

            <div class="cdc-metrics tabular-nums">
              <span><b>${c.total.toLocaleString()}</b> All</span>
              <span><b>${c.counts['6m'] || 0}</b> 6m</span>
              <span><b>${c.counts['3m'] || 0}</b> 3m</span>
              <span>E:${c.diff[0]} M:${c.diff[1]} H:${c.diff[2]}</span>
            </div>

            <div class="diff-split-bar">
              <span style="width:${eW}%;background:var(--diff-easy)"></span>
              <span style="width:${mW}%;background:var(--diff-med)"></span>
              <span style="width:${hW}%;background:var(--diff-hard)"></span>
            </div>

            ${topTopicsHtml ? `<div class="cdc-topics">${topTopicsHtml}</div>` : '<div class="cdc-topics"><span class="muted-pill">No recorded questions in CSV</span></div>'}

            <div class="cdc-footer">
              <div class="mini-bar-bg" style="flex:1;"><div class="mini-bar-fill" style="width:${readiness.pct}%"></div></div>
              <span class="tabular-nums cdc-ready">${readiness.solved}/${c.total} (${readiness.pct}%)</span>
            </div>
          </a>`;
      }).join('');
    }

    const loadMoreWrap = mountedRoot.querySelector('#companiesLoadMoreWrap');
    if (loadMoreWrap) {
      if (filtered.length > visible.length) {
        loadMoreWrap.innerHTML = `<button type="button" id="btnLoadMoreCompanies" class="btn-secondary">Show More Companies (${filtered.length - visible.length} remaining)</button>`;
      } else {
        loadMoreWrap.innerHTML = '';
      }
    }
  }

  function render(root) {
    mountedRoot = root;
    const Data = window.App.Data;
    const UI = window.App.UI;
    const stats = Data.getStats();
    const allComps = Data.getCompanyMetaList();
    const hot30Count = allComps.filter(c => (c.counts['30d'] || 0) > 0).length;

    root.innerHTML = `
      <div class="page-container">
        <section class="page-hero-compact">
          <div>
            <h1 class="page-heading">Companies Directory</h1>
            <p class="page-subheading">Browse <b>${stats.activeCompanies}</b> active companies (out of ${stats.totalCompanies} directories) with difficulty breakdowns, 30-day recency counts, and your live interview readiness.</p>
          </div>
          <div class="page-hero-stats tabular-nums">
            <span class="badge-chip">${stats.activeCompanies} Active</span>
            <span class="badge-chip hot">🔥 ${hot30Count} with 30d data</span>
          </div>
        </section>

        <section class="filter-toolbar">
          <div class="search-box">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" id="companyDirSearch" class="search-input" value="${UI.escapeHTML(localState.query)}" placeholder="Search 470 companies (e.g. Google, Citadel, Stripe, PhonePe)..." autocomplete="off">
          </div>

          <div class="filter-pills-row">
            <div class="pill-group" id="companyFilterGroup">
              <button type="button" class="filter-pill ${localState.filter === 'active' ? 'active' : ''}" data-cfilter="active">Active (${stats.activeCompanies})</button>
              <button type="button" class="filter-pill ${localState.filter === 'hot30' ? 'active' : ''}" data-cfilter="hot30">🔥 30d Hot (${hot30Count})</button>
              <button type="button" class="filter-pill ${localState.filter === 'MAANG' ? 'active' : ''}" data-cfilter="MAANG">Big Tech</button>
              <button type="button" class="filter-pill ${localState.filter === 'Quant' ? 'active' : ''}" data-cfilter="Quant">Quant &amp; Finance</button>
              <button type="button" class="filter-pill ${localState.filter === 'Tech' ? 'active' : ''}" data-cfilter="Tech">Notable Tech</button>
              <button type="button" class="filter-pill ${localState.filter === 'all' ? 'active' : ''}" data-cfilter="all">All (${stats.totalCompanies})</button>
            </div>

            <div class="select-filter-box">
              <select id="companyDirSort" class="clean-select compact" aria-label="Sort companies">
                <option value="total" ${localState.sortBy === 'total' ? 'selected' : ''}>Sort: Most Problems</option>
                <option value="hot30" ${localState.sortBy === 'hot30' ? 'selected' : ''}>Sort: Most 30-Day Hot</option>
                <option value="readiness" ${localState.sortBy === 'readiness' ? 'selected' : ''}>Sort: Highest Readiness %</option>
                <option value="alpha" ${localState.sortBy === 'alpha' ? 'selected' : ''}>Sort: Alphabetical (A–Z)</option>
              </select>
            </div>

            <span id="companyDirCount" class="filtered-badge tabular-nums" style="margin-left:auto;"></span>
          </div>
        </section>

        <section id="companiesGrid" class="companies-dir-grid"></section>
        <div id="companiesLoadMoreWrap" class="load-more-wrap"></div>
      </div>`;

    const searchInput = root.querySelector('#companyDirSearch');
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        localState.query = e.target.value;
        localState.showLimit = 60;
        renderGrid();
      });
    }

    root.querySelectorAll('#companyFilterGroup .filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        localState.filter = btn.getAttribute('data-cfilter');
        localState.showLimit = 60;
        root.querySelectorAll('#companyFilterGroup .filter-pill').forEach(b => b.classList.toggle('active', b === btn));
        renderGrid();
      });
    });

    const sortSel = root.querySelector('#companyDirSort');
    if (sortSel) {
      sortSel.addEventListener('change', e => {
        localState.sortBy = e.target.value;
        renderGrid();
      });
    }

    root.addEventListener('click', e => {
      if (e.target.id === 'btnLoadMoreCompanies') {
        localState.showLimit += 120;
        renderGrid();
      }
    });

    renderGrid();
  }

  window.App.Views.Companies = { render };
})();

