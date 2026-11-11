/**
 * Interactive DSA Sheet & Company Deep-Dive View
 */
(function () {
  'use strict';

  window.App = window.App || {};
  window.App.Views = window.App.Views || {};

  const localState = {
    view: 'topic', // 'topic' | 'company' | 'plan' | 'all' | 'starred'
    companyLayout: 'tray', // 'tray' | 'table'
    selectedCompany: 'Google',
    timeframe: 'all', // 'all' | '6m' | '3m' | '30d' | '6m+'
    selectedPlan: 'hot30',
    searchQuery: '',
    diffFilter: 'all', // 'all' | '1' | '2' | '3'
    statusFilter: 'all', // 'all' | 'solved' | 'unsolved' | 'starred'
    topicFilter: 'all',
    sortBy: 'freq',
    openAccordions: new Set([0]), // Open Arrays & Hashing by default
    page: 1,
    pageSize: 100
  };

  let mountedRoot = null;
  let activeGroupedCache = new Map(); // accordionIndex -> problem[]

  function applyRouteParams(params) {
    const Data = window.App.Data;
    const p = params || {};

    // Reset transient filters cleanly on each route transition
    localState.searchQuery = p.q !== undefined ? p.q : '';
    localState.diffFilter = (p.diff && ['all', '1', '2', '3'].includes(p.diff)) ? p.diff : 'all';
    localState.statusFilter = (p.status && ['all', 'solved', 'unsolved', 'starred'].includes(p.status)) ? p.status : 'all';
    localState.topicFilter = p.topic !== undefined ? String(p.topic) : 'all';
    localState.sortBy = 'freq';
    localState.page = 1;

    if (p.company) {
      const compName = decodeURIComponent(p.company);
      if (Data.getCompanyMeta(compName)) {
        localState.selectedCompany = compName;
      }
      localState.view = 'company';
    } else if (p.plan && Data.getStudyPlanById(p.plan)) {
      localState.selectedPlan = p.plan;
      localState.view = 'plan';
    } else if (p.roadmap) {
      const rNode = Data.getRoadmapById(p.roadmap);
      localState.view = 'topic';
      if (rNode) {
        localState.openAccordions = new Set([rNode.index]);
      }
    } else if (p.view && ['topic', 'company', 'plan', 'all', 'starred'].includes(p.view)) {
      localState.view = p.view;
    } else {
      localState.view = 'topic';
    }

    if (p.tf && ['all', '6m', '3m', '30d', '6m+'].includes(p.tf)) {
      localState.timeframe = p.tf;
    } else if (localState.view === 'company' && !p.tf) {
      localState.timeframe = 'all';
    }
  }

  function getBasePool() {
    const Data = window.App.Data;
    if (localState.view === 'company') {
      return Data.getCompanyProblems(localState.selectedCompany, localState.timeframe);
    }
    if (localState.view === 'plan') {
      const plan = Data.getStudyPlanById(localState.selectedPlan);
      if (!plan) return [];
      const out = [];
      (plan.pids || []).forEach((pid, idx) => {
        const p = Data.getProblem(pid);
        if (p) out.push(Object.assign({ freq: 0, planOrder: idx }, p));
      });
      return out;
    }
    return Data.getProblems().map(p => Object.assign({ freq: 0 }, p));
  }

  function getFilteredProblems() {
    const Data = window.App.Data;
    const Store = window.App.Store;
    const topics = Data.getTopics();
    let pool = getBasePool();

    if (localState.statusFilter === 'solved') {
      pool = pool.filter(p => Store.state.solvedSet.has(p.id));
    } else if (localState.statusFilter === 'unsolved') {
      pool = pool.filter(p => !Store.state.solvedSet.has(p.id));
    } else if (localState.statusFilter === 'starred' || localState.view === 'starred') {
      pool = pool.filter(p =>
        Store.state.starredSet.has(p.id) ||
        (Store.state.notesMap[p.id] && Store.state.notesMap[p.id].trim().length > 0)
      );
    }

    if (localState.diffFilter !== 'all') {
      const td = parseInt(localState.diffFilter, 10);
      pool = pool.filter(p => p.diff === td);
    }

    if (localState.topicFilter !== 'all') {
      const tid = parseInt(localState.topicFilter, 10);
      pool = pool.filter(p => p.topicSet ? p.topicSet.has(tid) : p.topics.includes(tid));
    }

    if (localState.searchQuery.trim()) {
      const q = localState.searchQuery.trim().toLowerCase();
      pool = pool.filter(p => {
        if (p.titleLower.includes(q) || p.slug.includes(q)) return true;
        for (let i = 0; i < p.topics.length; i++) {
          const tName = topics[p.topics[i]];
          if (tName && tName.toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }

    // Sort
    if (localState.view === 'plan' && localState.sortBy === 'freq') {
      // Preserve curated rank order in Study Plans by default
      pool.sort((a, b) => (a.planOrder || 0) - (b.planOrder || 0));
    } else {
      pool.sort((a, b) => {
        switch (localState.sortBy) {
          case 'freq':
            return (b.freq || b.compCount) - (a.freq || a.compCount) || a.id - b.id;
          case 'comp':
            return b.compCount - a.compCount || a.id - b.id;
          case 'diff_asc':
            return a.diff - b.diff || (b.freq || b.compCount) - (a.freq || a.compCount);
          case 'diff_desc':
            return b.diff - a.diff || (b.freq || b.compCount) - (a.freq || a.compCount);
          case 'ac_desc':
            return b.ac - a.ac;
          case 'title_asc':
            return a.title.localeCompare(b.title);
          default:
            return 0;
        }
      });
    }

    return pool;
  }

  function computeScopeStats(filtered) {
    const Data = window.App.Data;
    const Store = window.App.Store;
    const basePool = getBasePool();

    let solvedCount = 0;
    let easyTotal = 0, easySolved = 0;
    let medTotal = 0, medSolved = 0;
    let hardTotal = 0, hardSolved = 0;

    for (let i = 0; i < basePool.length; i++) {
      const p = basePool[i];
      const isS = Store.state.solvedSet.has(p.id);
      if (isS) solvedCount++;
      if (p.diff === 1) { easyTotal++; if (isS) easySolved++; }
      else if (p.diff === 2) { medTotal++; if (isS) medSolved++; }
      else { hardTotal++; if (isS) hardSolved++; }
    }

    return {
      solvedCount,
      totalCount: basePool.length,
      easySolved,
      easyTotal,
      medSolved,
      medTotal,
      hardSolved,
      hardTotal,
      showingCount: filtered.length,
      activeDiff: localState.diffFilter
    };
  }

  function renderCompanyBanner() {
    if (localState.view !== 'company') return '';
    const Data = window.App.Data;
    const Store = window.App.Store;
    const UI = window.App.UI;

    const meta = Data.getCompanyMeta(localState.selectedCompany);
    if (!meta) return '';

    const readiness = Data.getCompanyReadiness(meta.name, Store.state.solvedSet, localState.timeframe);
    const readinessAll = Data.getCompanyReadiness(meta.name, Store.state.solvedSet, 'all');
    const topics = Data.getTopics();
    const isPinned = Store.state.pinnedCompanies.includes(meta.name);

    const topTopicBtns = (meta.topTopics || []).map(tid => {
      const name = topics[tid];
      if (!name) return '';
      return `<button type="button" class="banner-topic-chip" data-filter-topic="${tid}">${UI.escapeHTML(name)}</button>`;
    }).join('');

    return `
      <section class="company-hero-banner">
        <div class="chb-main">
          <div class="chb-title-row">
            <h1 class="chb-name">${UI.escapeHTML(meta.name)}</h1>
            <span class="tier-pill ${meta.tier.toLowerCase()}">${UI.escapeHTML(meta.tier)}</span>
            <span class="rank-pill tabular-nums">Rank #${meta.rank + 1}</span>
            <button type="button" id="btnPinTargetCompany" class="btn-pin-company ${isPinned ? 'pinned' : ''}" title="${isPinned ? 'Unpin from Analytics Target Companies' : 'Pin to Analytics Target Companies'}">
              ${isPinned ? '★ Pinned Target' : '☆ Pin Target'}
            </button>
          </div>
          <p class="chb-sub">
            <span class="tabular-nums"><b>${meta.total.toLocaleString()}</b> total problems</span>
            <span class="footer-dot">•</span>
            <span class="tabular-nums"><b>${meta.counts['30d'] || 0}</b> asked in last 30d</span>
            <span class="footer-dot">•</span>
            <span class="tabular-nums"><b>${meta.counts['3m'] || 0}</b> in 3m</span>
            <span class="footer-dot">•</span>
            <span class="tabular-nums"><b>${meta.counts['6m'] || 0}</b> in 6m</span>
          </p>
          ${topTopicBtns ? `<div class="chb-topics"><span class="chb-topics-label">Top Topics:</span>${topTopicBtns}</div>` : ''}
        </div>

        <div class="chb-readiness-box">
          <div class="chb-readiness-row">
            <span>Scope Readiness</span>
            <span class="tabular-nums chb-pct">${readiness.pct}%</span>
          </div>
          <div class="progress-meter-bar" style="margin:0.45rem 0;">
            <div class="meter-segment easy" style="width:${readiness.pct}%"></div>
          </div>
          <div class="chb-readiness-meta tabular-nums">
            <span>${readiness.solved} / ${readiness.total} solved in view</span>
            <span>All-time: ${readinessAll.pct}%</span>
          </div>
        </div>
      </section>`;
  }

  function renderCompanyControls() {
    if (localState.view !== 'company') return '';
    const Data = window.App.Data;
    const UI = window.App.UI;

    const companies = Data.getCompanyMetaList();
    const featured = Data.getFeaturedCompanies();
    const tfData = Data.getCompanyProblems(localState.selectedCompany, localState.timeframe);

    let cEasy = 0, cMed = 0, cHard = 0;
    tfData.forEach(p => {
      if (p.diff === 1) cEasy++;
      else if (p.diff === 2) cMed++;
      else cHard++;
    });

    const optionsHtml = companies.map(c =>
      `<option value="${UI.escapeHTML(c.name)}" ${c.name === localState.selectedCompany ? 'selected' : ''}>${UI.escapeHTML(c.name)} (${c.total})</option>`
    ).join('');

    const chipsHtml = featured.map(cName =>
      `<button type="button" class="company-chip ${cName === localState.selectedCompany ? 'active' : ''}" data-select-company="${UI.escapeHTML(cName)}">${UI.escapeHTML(cName)}</button>`
    ).join('');

    const timeframes = [
      { id: 'all', label: 'All Time' },
      { id: '6m', label: 'Last 6 Months' },
      { id: '3m', label: 'Last 3 Months' },
      { id: '30d', label: '🔥 30 Days', hot: true },
      { id: '6m+', label: '> 6 Months' }
    ];

    return `
      <section class="company-controls-panel">
        <div class="company-select-row">
          <div class="company-dropdown-box">
            <label for="companySelect" class="filter-label">Company</label>
            <div class="company-picker-combo">
              <select id="companySelect" class="clean-select">${optionsHtml}</select>
              <a href="#/companies" class="btn-subtle" title="Browse all 470 companies">Directory &rarr;</a>
            </div>
          </div>

          <div class="timeframe-tabs-group">
            <span class="filter-label">Recency</span>
            <div class="timeframe-pills">
              ${timeframes.map(tf => `
                <button type="button" class="tf-pill ${tf.hot ? 'hot' : ''} ${localState.timeframe === tf.id ? 'active' : ''}" data-tf="${tf.id}">
                  ${tf.label}
                </button>`).join('')}
            </div>
          </div>

          <div class="company-diff-group">
            <span class="filter-label">Difficulty</span>
            <div class="company-diff-pills">
              <button type="button" class="comp-diff-pill ${localState.diffFilter === 'all' ? 'active' : ''}" data-diff="all">All (${tfData.length})</button>
              <button type="button" class="comp-diff-pill easy ${localState.diffFilter === '1' ? 'active' : ''}" data-diff="1">Easy (${cEasy})</button>
              <button type="button" class="comp-diff-pill medium ${localState.diffFilter === '2' ? 'active' : ''}" data-diff="2">Med (${cMed})</button>
              <button type="button" class="comp-diff-pill hard ${localState.diffFilter === '3' ? 'active' : ''}" data-diff="3">Hard (${cHard})</button>
            </div>
          </div>

          <div class="company-view-mode-group">
            <span class="filter-label">Layout</span>
            <div class="company-view-pills">
              <button type="button" class="cv-pill ${localState.companyLayout === 'tray' ? 'active' : ''}" data-layout="tray">Topic Trays</button>
              <button type="button" class="cv-pill ${localState.companyLayout === 'table' ? 'active' : ''}" data-layout="table">Flat Table</button>
            </div>
          </div>
        </div>

        <div class="company-quick-chips">
          <span class="chips-label">Popular:</span>
          <div class="chips-list">${chipsHtml}</div>
        </div>
      </section>`;
  }

  function renderPlanControls() {
    if (localState.view !== 'plan') return '';
    const Data = window.App.Data;
    const Store = window.App.Store;
    const UI = window.App.UI;

    const plans = Data.getStudyPlans();
    const activePlan = Data.getStudyPlanById(localState.selectedPlan) || plans[0];

    return `
      <section class="plan-controls-panel">
        <div class="plan-tabs-row">
          ${plans.map(pl => {
            let solved = 0;
            pl.pids.forEach(pid => { if (Store.state.solvedSet.has(pid)) solved++; });
            return `
              <button type="button" class="plan-tab-btn ${pl.id === activePlan.id ? 'active' : ''}" data-plan="${UI.escapeHTML(pl.id)}">
                <span class="plan-tab-name">${UI.escapeHTML(pl.name)}</span>
                <span class="plan-tab-count tabular-nums">${solved}/${pl.pids.length}</span>
              </button>`;
          }).join('')}
        </div>
        ${activePlan ? `<p class="plan-active-desc">${UI.escapeHTML(activePlan.desc)}</p>` : ''}
      </section>`;
  }

  function renderTopicAccordions(filteredProblems) {
    const Data = window.App.Data;
    const Store = window.App.Store;
    const UI = window.App.UI;

    const roadmaps = Data.getRoadmaps();
    const filteredMap = new Map();
    filteredProblems.forEach(p => filteredMap.set(p.id, p));

    activeGroupedCache.clear();
    const isCompany = localState.view === 'company';
    const hasActiveSearch = Boolean(localState.searchQuery.trim() || localState.topicFilter !== 'all' || localState.statusFilter !== 'all');

    let html = '';
    let anyMatch = false;

    roadmaps.forEach((node, idx) => {
      const group = [];
      for (let i = 0; i < node.pids.length; i++) {
        const pid = node.pids[i];
        if (filteredMap.has(pid)) group.push(filteredMap.get(pid));
      }
      if (group.length === 0) return;
      anyMatch = true;

      // Sort within the accordion according to selected sort
      if (localState.sortBy === 'freq') {
        group.sort((a, b) => (b.freq || b.compCount) - (a.freq || a.compCount) || a.id - b.id);
      } else if (localState.sortBy === 'comp') {
        group.sort((a, b) => b.compCount - a.compCount || a.id - b.id);
      } else if (localState.sortBy === 'diff_asc') {
        group.sort((a, b) => a.diff - b.diff || (b.freq || b.compCount) - (a.freq || a.compCount));
      } else if (localState.sortBy === 'diff_desc') {
        group.sort((a, b) => b.diff - a.diff || (b.freq || b.compCount) - (a.freq || a.compCount));
      } else if (localState.sortBy === 'ac_desc') {
        group.sort((a, b) => b.ac - a.ac);
      } else if (localState.sortBy === 'title_asc') {
        group.sort((a, b) => a.title.localeCompare(b.title));
      }

      activeGroupedCache.set(idx, group);

      let gEasy = 0, gMed = 0, gHard = 0, gSolved = 0;
      group.forEach(p => {
        if (Store.state.solvedSet.has(p.id)) gSolved++;
        if (p.diff === 1) gEasy++;
        else if (p.diff === 2) gMed++;
        else gHard++;
      });

      const isOpen = hasActiveSearch || localState.openAccordions.has(idx);
      const pct = Math.round((gSolved / group.length) * 100);

      // Lazy render rows ONLY if open (huge performance win!)
      const bodyHtml = isOpen
        ? `<div class="table-wrapper"><table class="dsa-table">${UI.renderTableHead(isCompany)}<tbody>${group.map((p, rIdx) => UI.renderProblemRow(p, rIdx, { showFreq: isCompany })).join('')}</tbody></table></div>`
        : '';

      html += `
        <div class="topic-accordion ${isOpen ? 'open' : ''}" data-accordion-index="${idx}">
          <div class="accordion-header" data-toggle-accordion="${idx}" role="button" tabindex="0" aria-expanded="${isOpen}">
            <div class="accordion-left">
              <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
              <h2 class="topic-title">${UI.escapeHTML(node.name)}</h2>
              <span class="topic-count-pill tabular-nums">${gSolved} / ${group.length}</span>
            </div>

            <div class="accordion-right">
              <div class="topic-diff-breakdown">
                <span class="diff-badge-mini easy" data-diff="1" title="Filter by Easy">E: ${gEasy}</span>
                <span class="diff-badge-mini med" data-diff="2" title="Filter by Medium">M: ${gMed}</span>
                <span class="diff-badge-mini hard" data-diff="3" title="Filter by Hard">H: ${gHard}</span>
              </div>
              <div class="topic-mini-progress">
                <div class="mini-bar-bg"><div class="mini-bar-fill" style="width:${pct}%"></div></div>
                <span class="mini-bar-label tabular-nums">${pct}%</span>
              </div>
            </div>
          </div>
          <div class="accordion-body" data-accordion-body="${idx}">${bodyHtml}</div>
        </div>`;
    });

    if (!anyMatch) return renderEmptyState();
    return html;
  }

  function renderFlatTable(problems, isCompany) {
    const UI = window.App.UI;
    const Store = window.App.Store;
    if (problems.length === 0) return renderEmptyState();

    const totalPages = Math.max(1, Math.ceil(problems.length / localState.pageSize));
    if (localState.page > totalPages) localState.page = totalPages;

    const start = (localState.page - 1) * localState.pageSize;
    const end = Math.min(problems.length, start + localState.pageSize);
    const slice = problems.slice(start, end);

    const rowsHtml = slice.map((p, idx) => {
      let row = UI.renderProblemRow(p, start + idx, { showFreq: isCompany });
      if (localState.view === 'starred' && Store.state.notesMap[p.id]) {
        row += `
          <tr class="note-preview-row">
            <td colspan="9">
              <div class="inline-note-preview">
                <span class="note-preview-label">Note:</span>
                <span>${UI.escapeHTML(Store.state.notesMap[p.id])}</span>
              </div>
            </td>
          </tr>`;
      }
      return row;
    }).join('');

    const paginationBar = totalPages > 1 ? `
      <div class="pagination-bar">
        <span class="pagination-info tabular-nums">Showing ${start + 1}–${end} of ${problems.length.toLocaleString()} problems</span>
        <div class="pagination-controls">
          <button type="button" class="btn-subtle" data-page-move="prev" ${localState.page <= 1 ? 'disabled' : ''}>&larr; Prev</button>
          <span class="page-indicator tabular-nums">Page ${localState.page} / ${totalPages}</span>
          <button type="button" class="btn-subtle" data-page-move="next" ${localState.page >= totalPages ? 'disabled' : ''}>Next &rarr;</button>
          <select id="pageSizeSelect" class="clean-select compact" aria-label="Rows per page">
            <option value="50" ${localState.pageSize === 50 ? 'selected' : ''}>50 / page</option>
            <option value="100" ${localState.pageSize === 100 ? 'selected' : ''}>100 / page</option>
            <option value="250" ${localState.pageSize === 250 ? 'selected' : ''}>250 / page</option>
          </select>
        </div>
      </div>` : '';

    return `
      <div class="topic-accordion open">
        <div class="table-wrapper">
          <table class="dsa-table">
            ${UI.renderTableHead(isCompany)}
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        ${paginationBar}
      </div>`;
  }

  function renderEmptyState() {
    return `
      <div class="empty-state">
        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--text-dim); margin-bottom: 0.75rem;">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <h3>No matching problems found</h3>
        <p>${localState.view === 'starred' ? 'Star problems or write notes to collect them in your revision queue.' : 'Try clearing your search query or relaxing difficulty, topic, or recency filters.'}</p>
        <button type="button" id="btnResetInEmpty" class="btn-secondary" style="margin-top:0.85rem;">Reset Filters</button>
      </div>`;
  }

  function renderSheetContentOnly() {
    if (!mountedRoot) return;
    const Data = window.App.Data;
    const UI = window.App.UI;

    const filtered = getFilteredProblems();
    const stats = computeScopeStats(filtered);
    const isTrayMode = localState.view === 'topic' || (localState.view === 'company' && localState.companyLayout === 'tray');

    const progressSlot = mountedRoot.querySelector('#sheetProgressSlot');
    if (progressSlot) progressSlot.innerHTML = UI.renderProgressCard(stats);

    const companySlot = mountedRoot.querySelector('#sheetCompanySlot');
    if (companySlot) companySlot.innerHTML = renderCompanyBanner() + renderCompanyControls();

    const planSlot = mountedRoot.querySelector('#sheetPlanSlot');
    if (planSlot) planSlot.innerHTML = renderPlanControls();

    const accBtn = mountedRoot.querySelector('#btnToggleAllAccordions');
    const accTxt = mountedRoot.querySelector('#accordionToggleText');
    if (accBtn) accBtn.style.display = isTrayMode ? 'inline-flex' : 'none';
    if (accTxt) accTxt.textContent = localState.openAccordions.size > 0 ? 'Collapse All' : 'Expand All';

    const listRoot = mountedRoot.querySelector('#sheetContainer');
    if (listRoot) {
      if (localState.view === 'topic' || (localState.view === 'company' && localState.companyLayout === 'tray')) {
        listRoot.innerHTML = renderTopicAccordions(filtered);
      } else {
        listRoot.innerHTML = renderFlatTable(filtered, localState.view === 'company');
      }
    }

    // Sync active toolbar pills
    mountedRoot.querySelectorAll('.view-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-view') === localState.view);
    });
    mountedRoot.querySelectorAll('#difficultyPillGroup .filter-pill').forEach(p => {
      p.classList.toggle('active', p.getAttribute('data-diff') === localState.diffFilter);
    });
    mountedRoot.querySelectorAll('#statusPillGroup .filter-pill').forEach(p => {
      p.classList.toggle('active', p.getAttribute('data-status') === localState.statusFilter);
    });
    const topicSel = mountedRoot.querySelector('#topicDropdown');
    if (topicSel) topicSel.value = localState.topicFilter;
    const sortSel = mountedRoot.querySelector('#sortDropdown');
    if (sortSel) sortSel.value = localState.sortBy;
  }

  function render(root, params) {
    mountedRoot = root;
    applyRouteParams(params);

    const Data = window.App.Data;
    const UI = window.App.UI;
    const topicMeta = Data.getTopicMeta();
    const topicOptions = [`<option value="all">All Topics (${topicMeta.length})</option>`]
      .concat(topicMeta.map(t => `<option value="${t.id}" ${String(t.id) === localState.topicFilter ? 'selected' : ''}>${UI.escapeHTML(t.name)} (${t.count})</option>`))
      .join('');

    root.innerHTML = `
      <div class="page-container sheet-container">
        <div id="sheetCompanySlot"></div>

        <div id="sheetProgressSlot"></div>

        <section class="view-switcher-bar">
          <div class="view-tabs" role="tablist">
            <button type="button" class="view-tab" data-view="topic" role="tab">Topic-Wise</button>
            <button type="button" class="view-tab" data-view="company" role="tab">Company-Wise</button>
            <button type="button" class="view-tab" data-view="plan" role="tab">Study Plans</button>
            <button type="button" class="view-tab" data-view="all" role="tab">All Problems</button>
            <button type="button" class="view-tab" data-view="starred" role="tab">Starred &amp; Notes</button>
          </div>

          <div class="view-actions-right">
            <button type="button" id="btnPickRandom" class="btn-subtle" title="Pick a random unsolved problem from active filters">
              🎲 <span>Pick One</span>
            </button>
            <button type="button" id="btnToggleAllAccordions" class="btn-subtle">
              <span id="accordionToggleText">Collapse All</span>
            </button>
          </div>
        </section>

        <div id="sheetPlanSlot"></div>

        <section class="filter-toolbar">
          <div class="search-box">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" id="searchInput" class="search-input" value="${UI.escapeHTML(localState.searchQuery)}" placeholder="Filter problems by title or topic... (Press / to focus)" autocomplete="off" spellcheck="false">
            <button type="button" id="btnClearSearch" class="btn-clear ${localState.searchQuery ? '' : 'hidden'}" aria-label="Clear search">&times;</button>
            <span class="search-kbd">/</span>
          </div>

          <div class="filter-pills-row">
            <div class="pill-group" id="difficultyPillGroup">
              <button type="button" class="filter-pill" data-diff="all">All</button>
              <button type="button" class="filter-pill easy" data-diff="1">Easy</button>
              <button type="button" class="filter-pill medium" data-diff="2">Medium</button>
              <button type="button" class="filter-pill hard" data-diff="3">Hard</button>
            </div>

            <div class="pill-group" id="statusPillGroup">
              <button type="button" class="filter-pill" data-status="all">All</button>
              <button type="button" class="filter-pill" data-status="unsolved">Unsolved</button>
              <button type="button" class="filter-pill" data-status="solved">Solved</button>
              <button type="button" class="filter-pill" data-status="starred">Starred</button>
            </div>

            <div class="select-filter-box">
              <select id="topicDropdown" class="clean-select compact" aria-label="Filter by topic">${topicOptions}</select>
            </div>

            <div class="select-filter-box">
              <select id="sortDropdown" class="clean-select compact" aria-label="Sort problems">
                <option value="freq">Sort: Frequency / Rank</option>
                <option value="comp">Sort: Most Companies</option>
                <option value="diff_asc">Sort: Difficulty (E &rarr; H)</option>
                <option value="diff_desc">Sort: Difficulty (H &rarr; E)</option>
                <option value="ac_desc">Sort: Acceptance (High &rarr; Low)</option>
                <option value="title_asc">Sort: Title (A &rarr; Z)</option>
              </select>
            </div>

            <button type="button" id="btnResetFilters" class="btn-reset">Reset</button>
          </div>
        </section>

        <section id="sheetContainer" class="sheet-main-content"></section>
      </div>`;

    bindEvents(root);
    renderSheetContentOnly();
  }

  function resetFilters() {
    localState.searchQuery = '';
    localState.diffFilter = 'all';
    localState.statusFilter = 'all';
    localState.topicFilter = 'all';
    localState.sortBy = 'freq';
    localState.page = 1;
    if (mountedRoot) {
      const si = mountedRoot.querySelector('#searchInput');
      const cs = mountedRoot.querySelector('#btnClearSearch');
      if (si) si.value = '';
      if (cs) cs.classList.add('hidden');
    }
    renderSheetContentOnly();
    window.App.UI.showToast('Filters reset');
  }

  function toggleDifficulty(diff) {
    localState.diffFilter = (localState.diffFilter === diff && diff !== 'all') ? 'all' : diff;
    localState.page = 1;
    renderSheetContentOnly();
  }

  function hydrateAccordionBody(idx) {
    if (!mountedRoot) return;
    const UI = window.App.UI;
    const bodyEl = mountedRoot.querySelector(`[data-accordion-body="${idx}"]`);
    if (!bodyEl) return;
    const group = activeGroupedCache.get(idx) || [];
    const isCompany = localState.view === 'company';
    bodyEl.innerHTML = `<div class="table-wrapper"><table class="dsa-table">${UI.renderTableHead(isCompany)}<tbody>${group.map((p, rIdx) => UI.renderProblemRow(p, rIdx, { showFreq: isCompany })).join('')}</tbody></table></div>`;
  }

  function pickRandom() {
    const Data = window.App.Data;
    const Store = window.App.Store;
    const UI = window.App.UI;

    let pool = getFilteredProblems().filter(p => !Store.state.solvedSet.has(p.id));
    if (pool.length === 0) {
      pool = Data.getProblems().filter(p => !Store.state.solvedSet.has(p.id));
    }
    if (pool.length === 0) {
      UI.showToast('Congratulations! You solved every problem in the dataset!');
      return;
    }

    const choice = pool[Math.floor(Math.random() * pool.length)];

    // If in accordion mode and problem is inside a closed accordion, open it first
    const isTray = localState.view === 'topic' || (localState.view === 'company' && localState.companyLayout === 'tray');
    if (isTray) {
      for (const [accIdx, group] of activeGroupedCache.entries()) {
        if (group.some(p => p.id === choice.id)) {
          if (!localState.openAccordions.has(accIdx)) {
            localState.openAccordions.add(accIdx);
            const accEl = mountedRoot.querySelector(`.topic-accordion[data-accordion-index="${accIdx}"]`);
            if (accEl) accEl.classList.add('open');
            hydrateAccordionBody(accIdx);
          }
          break;
        }
      }
    } else {
      // Jump to page containing choice
      const filtered = getFilteredProblems();
      const idx = filtered.findIndex(p => p.id === choice.id);
      if (idx >= 0) {
        const targetPage = Math.floor(idx / localState.pageSize) + 1;
        if (targetPage !== localState.page) {
          localState.page = targetPage;
          renderSheetContentOnly();
        }
      }
    }

    const row = mountedRoot.querySelector(`tr[data-pid="${choice.id}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('row-highlight');
      setTimeout(() => row.classList.remove('row-highlight'), 2600);
      UI.showToast(`Picked: ${choice.title}`);
    } else {
      UI.showToast(`Picked: ${choice.title}`);
    }
  }

  function bindEvents(root) {
    const Data = window.App.Data;
    const Store = window.App.Store;
    const UI = window.App.UI;

    // View tabs
    root.querySelectorAll('.view-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        localState.view = tab.getAttribute('data-view');
        localState.page = 1;
        renderSheetContentOnly();
      });
    });

    // Search with debounce
    const searchInput = root.querySelector('#searchInput');
    const clearBtn = root.querySelector('#btnClearSearch');
    let debounceTimer = null;
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        localState.searchQuery = e.target.value;
        localState.page = 1;
        if (clearBtn) clearBtn.classList.toggle('hidden', !localState.searchQuery);
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => renderSheetContentOnly(), 130);
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        localState.searchQuery = '';
        localState.page = 1;
        if (searchInput) { searchInput.value = ''; searchInput.focus(); }
        clearBtn.classList.add('hidden');
        renderSheetContentOnly();
      });
    }

    // Difficulty & Status pills
    root.querySelectorAll('#difficultyPillGroup .filter-pill').forEach(p => {
      p.addEventListener('click', () => toggleDifficulty(p.getAttribute('data-diff')));
    });
    root.querySelectorAll('#statusPillGroup .filter-pill').forEach(p => {
      p.addEventListener('click', () => {
        localState.statusFilter = p.getAttribute('data-status');
        localState.page = 1;
        renderSheetContentOnly();
      });
    });

    // Topic & Sort dropdowns
    const topicSel = root.querySelector('#topicDropdown');
    if (topicSel) {
      topicSel.addEventListener('change', e => {
        localState.topicFilter = e.target.value;
        localState.page = 1;
        renderSheetContentOnly();
      });
    }
    const sortSel = root.querySelector('#sortDropdown');
    if (sortSel) {
      sortSel.addEventListener('change', e => {
        localState.sortBy = e.target.value;
        localState.page = 1;
        renderSheetContentOnly();
      });
    }

    // Reset & Pick One & Expand/Collapse
    const resetBtn = root.querySelector('#btnResetFilters');
    if (resetBtn) resetBtn.addEventListener('click', resetFilters);

    const pickBtn = root.querySelector('#btnPickRandom');
    if (pickBtn) pickBtn.addEventListener('click', pickRandom);

    const accBtn = root.querySelector('#btnToggleAllAccordions');
    if (accBtn) {
      accBtn.addEventListener('click', () => {
        if (localState.openAccordions.size > 0) {
          localState.openAccordions.clear();
        } else {
          const total = Data.getRoadmaps().length;
          for (let i = 0; i < total; i++) localState.openAccordions.add(i);
        }
        renderSheetContentOnly();
      });
    }

    // Delegated clicks inside progress slot, company slot, plan slot, and sheetContainer
    root.addEventListener('click', e => {
      // Progress card diff pills
      const progPill = e.target.closest('[data-diff-toggle]');
      if (progPill) {
        toggleDifficulty(progPill.getAttribute('data-diff-toggle'));
        return;
      }

      // Company controls & banner
      const tfPill = e.target.closest('.tf-pill');
      if (tfPill) {
        localState.timeframe = tfPill.getAttribute('data-tf');
        localState.page = 1;
        renderSheetContentOnly();
        return;
      }
      const compDiffPill = e.target.closest('.comp-diff-pill');
      if (compDiffPill) {
        toggleDifficulty(compDiffPill.getAttribute('data-diff'));
        return;
      }
      const cvPill = e.target.closest('.cv-pill');
      if (cvPill) {
        localState.companyLayout = cvPill.getAttribute('data-layout');
        localState.page = 1;
        renderSheetContentOnly();
        return;
      }
      const compChip = e.target.closest('[data-select-company]');
      if (compChip) {
        localState.selectedCompany = compChip.getAttribute('data-select-company');
        localState.page = 1;
        renderSheetContentOnly();
        return;
      }
      const bannerTopic = e.target.closest('[data-filter-topic]');
      if (bannerTopic) {
        localState.topicFilter = bannerTopic.getAttribute('data-filter-topic');
        localState.page = 1;
        renderSheetContentOnly();
        return;
      }
      if (e.target.id === 'btnPinTargetCompany') {
        Store.togglePinnedCompany(localState.selectedCompany);
        renderSheetContentOnly();
        return;
      }

      // Study plan tab button
      const planBtn = e.target.closest('[data-plan]');
      if (planBtn) {
        localState.selectedPlan = planBtn.getAttribute('data-plan');
        localState.page = 1;
        renderSheetContentOnly();
        return;
      }

      // Accordion mini diff badge
      const miniDiff = e.target.closest('.diff-badge-mini');
      if (miniDiff) {
        e.stopPropagation();
        toggleDifficulty(miniDiff.getAttribute('data-diff'));
        return;
      }

      // Accordion toggle (lazy hydrate)
      const accHeader = e.target.closest('[data-toggle-accordion]');
      if (accHeader) {
        const idx = parseInt(accHeader.getAttribute('data-toggle-accordion'), 10);
        const accEl = accHeader.closest('.topic-accordion');
        const bodyEl = accEl && accEl.querySelector(`[data-accordion-body="${idx}"]`);
        if (localState.openAccordions.has(idx)) {
          localState.openAccordions.delete(idx);
          accEl.classList.remove('open');
          accHeader.setAttribute('aria-expanded', 'false');
          if (bodyEl) bodyEl.innerHTML = '';
        } else {
          localState.openAccordions.add(idx);
          accEl.classList.add('open');
          accHeader.setAttribute('aria-expanded', 'true');
          hydrateAccordionBody(idx);
        }
        const accTxt = root.querySelector('#accordionToggleText');
        if (accTxt) accTxt.textContent = localState.openAccordions.size > 0 ? 'Collapse All' : 'Expand All';
        return;
      }

      // Solved checkbox
      const chk = e.target.closest('.btn-toggle-solve');
      if (chk) {
        const pid = parseInt(chk.getAttribute('data-pid'), 10);
        const tr = chk.closest('tr');
        Store.setSolved(pid, chk.checked);
        if (tr) tr.classList.toggle('solved', chk.checked);
        // Update progress card & accordion counters cleanly in place
        const filtered = getFilteredProblems();
        const progSlot = root.querySelector('#sheetProgressSlot');
        if (progSlot) progSlot.innerHTML = UI.renderProgressCard(computeScopeStats(filtered));
        const companySlot = root.querySelector('#sheetCompanySlot');
        if (companySlot && localState.view === 'company') {
          const banner = companySlot.querySelector('.company-hero-banner');
          if (banner) {
            const tmp = document.createElement('div');
            tmp.innerHTML = renderCompanyBanner();
            if (tmp.firstElementChild) banner.replaceWith(tmp.firstElementChild);
          }
        }
        const accEl = chk.closest('.topic-accordion[data-accordion-index]');
        if (accEl) {
          const idx = parseInt(accEl.getAttribute('data-accordion-index'), 10);
          const group = activeGroupedCache.get(idx) || [];
          let gSolved = 0;
          group.forEach(p => { if (Store.state.solvedSet.has(p.id)) gSolved++; });
          const pct = group.length > 0 ? Math.round((gSolved / group.length) * 100) : 0;
          const pill = accEl.querySelector('.topic-count-pill');
          const fill = accEl.querySelector('.mini-bar-fill');
          const lbl = accEl.querySelector('.mini-bar-label');
          if (pill) pill.textContent = `${gSolved} / ${group.length}`;
          if (fill) fill.style.width = `${pct}%`;
          if (lbl) lbl.textContent = `${pct}%`;
        }
        return;
      }

      // Star button
      const starBtn = e.target.closest('.btn-star');
      if (starBtn) {
        const pid = parseInt(starBtn.getAttribute('data-pid'), 10);
        const nextStar = !Store.state.starredSet.has(pid);
        Store.setStarred(pid, nextStar);
        starBtn.classList.toggle('starred', nextStar);
        starBtn.textContent = nextStar ? '★' : '☆';
        return;
      }

      // Notes button
      const noteBtn = e.target.closest('.btn-note');
      if (noteBtn) {
        const pid = parseInt(noteBtn.getAttribute('data-pid'), 10);
        UI.openNotesModal(pid);
        return;
      }

      // Topic tag click inside row
      const tagBadge = e.target.closest('.tag-badge[data-tid]');
      if (tagBadge) {
        localState.topicFilter = tagBadge.getAttribute('data-tid');
        localState.page = 1;
        renderSheetContentOnly();
        return;
      }

      // Pagination buttons
      const pageMove = e.target.closest('[data-page-move]');
      if (pageMove) {
        const dir = pageMove.getAttribute('data-page-move');
        localState.page += dir === 'next' ? 1 : -1;
        renderSheetContentOnly();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (e.target.id === 'btnResetInEmpty') {
        resetFilters();
      }
    });

    root.addEventListener('change', e => {
      if (e.target.id === 'companySelect') {
        localState.selectedCompany = e.target.value;
        localState.page = 1;
        renderSheetContentOnly();
      } else if (e.target.id === 'pageSizeSelect') {
        localState.pageSize = parseInt(e.target.value, 10) || 100;
        localState.page = 1;
        renderSheetContentOnly();
      }
    });

    root.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        const accHeader = e.target.closest('[data-toggle-accordion]');
        if (accHeader) {
          e.preventDefault();
          accHeader.click();
        }
      }
    });
  }

  // Re-render sheet cleanly on notes update / import / reset if sheet is mounted
  function onStoreChange(eventType) {
    if (!mountedRoot || !document.body.contains(mountedRoot) || !mountedRoot.querySelector('#sheetContainer')) return;
    if (eventType === 'note' || eventType === 'import' || eventType === 'reset') {
      renderSheetContentOnly();
    }
  }

  window.App.Store.subscribe(onStoreChange);
  window.App.Views.Sheet = { render };
})();

