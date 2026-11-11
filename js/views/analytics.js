/**
 * Progress & Readiness Analytics View
 */
(function () {
  'use strict';

  window.App = window.App || {};
  window.App.Views = window.App.Views || {};

  function renderHeatmap(activityMap, localDateKeyFn) {
    const days = 84; // 12 weeks
    const cells = [];
    const today = new Date();
    // Align start to Sunday 11+ weeks ago for clean weekly columns
    const start = new Date(today);
    start.setDate(today.getDate() - (days - 1));

    let maxInDay = 1;
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const cnt = activityMap[localDateKeyFn(d)] || 0;
      if (cnt > maxInDay) maxInDay = cnt;
    }

    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = localDateKeyFn(d);
      const cnt = activityMap[key] || 0;
      let level = 0;
      if (cnt > 0) {
        if (cnt >= Math.max(4, maxInDay)) level = 4;
        else if (cnt >= 3) level = 3;
        else if (cnt >= 2) level = 2;
        else level = 1;
      }
      cells.push(`<div class="hm-cell level-${level}" title="${key}: ${cnt} solved"></div>`);
    }

    return `<div class="heatmap-grid">${cells.join('')}</div>`;
  }

  function render(root) {
    const Data = window.App.Data;
    const Store = window.App.Store;
    const UI = window.App.UI;

    const problems = Data.getProblems();
    const stats = Data.getStats();
    const solvedSet = Store.state.solvedSet;

    let easySolved = 0, medSolved = 0, hardSolved = 0;
    problems.forEach(p => {
      if (solvedSet.has(p.id)) {
        if (p.diff === 1) easySolved++;
        else if (p.diff === 2) medSolved++;
        else hardSolved++;
      }
    });

    const easyTotal = stats.diffCounts ? stats.diffCounts[0] : 0;
    const medTotal = stats.diffCounts ? stats.diffCounts[1] : 0;
    const hardTotal = stats.diffCounts ? stats.diffCounts[2] : 0;
    const totalSolved = solvedSet.size;
    const totalPct = stats.totalProblems > 0 ? ((totalSolved / stats.totalProblems) * 100).toFixed(1) : '0.0';

    const streak = Store.getStreakStats();
    const todayCount = Store.state.activityMap[Store.localDateKey()] || 0;
    const notesCount = Object.keys(Store.state.notesMap).filter(k => Store.state.notesMap[k] && Store.state.notesMap[k].trim()).length;

    // Topic Mastery across core roadmap nodes
    const roadmaps = Data.getRoadmaps().filter(r => r.tier <= 7);
    const masteryList = roadmaps.map(node => ({
      node,
      prog: Data.getRoadmapProgress(node, solvedSet)
    }));

    const masteryRowsHtml = masteryList.map(({ node, prog }) => `
      <a href="#/sheet?view=topic&roadmap=${encodeURIComponent(node.id)}" class="mastery-bar-row">
        <span class="mbr-name">${UI.escapeHTML(node.name)}</span>
        <div class="mbr-track">
          <div class="mbr-fill" style="width:${prog.pct}%"></div>
        </div>
        <span class="mbr-val tabular-nums">${prog.solved}/${prog.total} (${prog.pct}%)</span>
      </a>`).join('');

    // Recommended Next Focus (lowest % among core tiers 1..6)
    const focusCandidates = masteryList
      .filter(m => m.node.tier <= 6 && m.prog.pct < 100)
      .sort((a, b) => a.prog.pct - b.prog.pct || a.node.tier - b.node.tier)
      .slice(0, 3);

    const focusHtml = focusCandidates.map(({ node, prog }) => `
      <a href="#/roadmap?node=${encodeURIComponent(node.id)}" class="focus-card">
        <div class="fc-top">
          <span class="ri-tier tabular-nums">Tier ${node.tier}</span>
          <span class="tabular-nums fc-pct">${prog.pct}%</span>
        </div>
        <div class="fc-name">${UI.escapeHTML(node.name)}</div>
        <div class="fc-sub tabular-nums">${prog.total - prog.solved} unsolved in pattern</div>
      </a>`).join('');

    // Target Company Readiness Matrix
    const pinned = Store.state.pinnedCompanies.filter(c => Data.getCompanyMeta(c));
    const activeCompanies = Data.getCompanyMetaList().filter(c => c.total > 0);
    const addCompanyOpts = activeCompanies
      .filter(c => !pinned.includes(c.name))
      .map(c => `<option value="${UI.escapeHTML(c.name)}">${UI.escapeHTML(c.name)} (${c.total})</option>`)
      .join('');

    const companyRowsHtml = pinned.map(compName => {
      const rAll = Data.getCompanyReadiness(compName, solvedSet, 'all');
      const r30 = Data.getCompanyReadiness(compName, solvedSet, '30d');
      return `
        <div class="readiness-row">
          <div class="rr-company">
            <a href="#/company/${encodeURIComponent(compName)}" class="rr-link">${UI.escapeHTML(compName)}</a>
            <button type="button" class="rr-unpin" data-unpin-company="${UI.escapeHTML(compName)}" title="Unpin company">&times;</button>
          </div>
          <div class="rr-bar-col">
            <div class="rr-bar-meta tabular-nums">
              <span>All-Time: <b>${rAll.solved}/${rAll.total}</b></span>
              <span>${rAll.pct}%</span>
            </div>
            <div class="mini-bar-bg" style="width:100%;"><div class="mini-bar-fill" style="width:${rAll.pct}%"></div></div>
          </div>
          <div class="rr-hot-col tabular-nums">
            ${r30.total > 0
              ? `<a href="#/company/${encodeURIComponent(compName)}?tf=30d" class="hot-readiness-chip">🔥 30d: ${r30.solved}/${r30.total} (${r30.pct}%)</a>`
              : `<span class="muted-pill">No 30d data</span>`}
          </div>
        </div>`;
    }).join('');

    // Recent solves
    const recentItems = (Store.state.recentLog || [])
      .map(entry => ({ entry, p: Data.getProblem(entry.pid) }))
      .filter(x => x.p && solvedSet.has(x.p.id))
      .slice(0, 8);

    const recentHtml = recentItems.length > 0
      ? recentItems.map(({ entry, p }) => {
          const dInfo = UI.formatDiffLabel(p.diff);
          const dateStr = new Date(entry.ts).toLocaleDateString();
          return `
            <div class="recent-solve-item">
              <span class="diff-badge ${dInfo.cls}">${dInfo.label}</span>
              <a href="https://leetcode.com/problems/${encodeURIComponent(p.slug)}/" target="_blank" rel="noopener noreferrer" class="recent-title">${UI.escapeHTML(p.title)} ↗</a>
              <span class="recent-date tabular-nums">${dateStr}</span>
            </div>`;
        }).join('')
      : `<p class="muted-note">Check off problems anywhere on the site to build your activity log and streak.</p>`;

    root.innerHTML = `
      <div class="page-container">
        <section class="page-hero-compact">
          <div>
            <h1 class="page-heading">Progress &amp; Readiness Analytics</h1>
            <p class="page-subheading">Real-time breakdown of your interview readiness across difficulties, DSA patterns, and target companies — computed 100% locally.</p>
          </div>
          <div class="page-hero-stats">
            <button type="button" id="btnAnalyticsExport" class="btn-secondary">Export Backup (JSON)</button>
          </div>
        </section>

        <!-- KPI Row -->
        <section class="analytics-kpi-grid">
          <div class="kpi-card">
            <span class="kpi-label">Total Solved</span>
            <div class="kpi-value tabular-nums">${totalSolved.toLocaleString()} <small>/ ${stats.totalProblems.toLocaleString()}</small></div>
            <div class="progress-meter-bar" style="margin:0.5rem 0;">
              <div class="meter-segment easy" style="width:${easyTotal + medTotal + hardTotal > 0 ? (easySolved / stats.totalProblems) * 100 : 0}%"></div>
              <div class="meter-segment medium" style="width:${stats.totalProblems > 0 ? (medSolved / stats.totalProblems) * 100 : 0}%"></div>
              <div class="meter-segment hard" style="width:${stats.totalProblems > 0 ? (hardSolved / stats.totalProblems) * 100 : 0}%"></div>
            </div>
            <span class="kpi-sub tabular-nums">${totalPct}% of full archive</span>
          </div>

          <div class="kpi-card">
            <span class="kpi-label">Difficulty Breakdown</span>
            <div class="kpi-diff-rows tabular-nums">
              <div class="kdr"><span class="diff-badge easy">Easy</span><span><b>${easySolved}</b> / ${easyTotal}</span></div>
              <div class="kdr"><span class="diff-badge medium">Med</span><span><b>${medSolved}</b> / ${medTotal}</span></div>
              <div class="kdr"><span class="diff-badge hard">Hard</span><span><b>${hardSolved}</b> / ${hardTotal}</span></div>
            </div>
          </div>

          <div class="kpi-card">
            <span class="kpi-label">Study Streak</span>
            <div class="kpi-value tabular-nums">${streak.currentStreak} <small>days</small></div>
            <span class="kpi-sub tabular-nums">${todayCount} solved today • ${streak.totalTrackedSolves} tracked</span>
          </div>

          <div class="kpi-card">
            <span class="kpi-label">Revision Queue</span>
            <div class="kpi-value tabular-nums">${Store.state.starredSet.size} <small>starred</small></div>
            <span class="kpi-sub tabular-nums">${notesCount} written notes • <a href="#/sheet?view=starred">Review &rarr;</a></span>
          </div>
        </section>

        <!-- Target Company Readiness + Next Focus -->
        <section class="analytics-two-col">
          <div class="analytics-panel">
            <div class="ap-header">
              <div>
                <h2 class="section-title">Target Company Readiness</h2>
                <p class="section-subtitle">Track both All-Time and 30-Day Hot coverage for your target companies.</p>
              </div>
              <div class="ap-add-box">
                <select id="addTargetCompanySelect" class="clean-select compact" aria-label="Add target company">
                  <option value="">+ Pin company...</option>
                  ${addCompanyOpts}
                </select>
              </div>
            </div>
            <div class="readiness-list">
              ${companyRowsHtml || '<p class="muted-note">Pin any company from the dropdown above to monitor its readiness.</p>'}
            </div>
          </div>

          <div class="analytics-panel">
            <div class="ap-header">
              <div>
                <h2 class="section-title">Topic Mastery</h2>
                <p class="section-subtitle">Your coverage across the 19 DSA roadmap clusters.</p>
              </div>
            </div>

            ${focusHtml ? `
              <div class="focus-strip">
                <span class="focus-heading">Recommended Next Focus</span>
                <div class="focus-grid">${focusHtml}</div>
              </div>` : ''}

            <div class="mastery-bars-list">
              ${masteryRowsHtml}
            </div>
          </div>
        </section>

        <!-- Heatmap & Recent Solves -->
        <section class="analytics-two-col" style="margin-top:1.5rem;">
          <div class="analytics-panel">
            <div class="ap-header">
              <div>
                <h2 class="section-title">12-Week Activity Heatmap</h2>
                <p class="section-subtitle">Daily problems checked off in this browser.</p>
              </div>
              <div class="heatmap-legend">
                <span>Less</span>
                <span class="hm-cell level-0"></span>
                <span class="hm-cell level-1"></span>
                <span class="hm-cell level-2"></span>
                <span class="hm-cell level-3"></span>
                <span class="hm-cell level-4"></span>
                <span>More</span>
              </div>
            </div>
            ${renderHeatmap(Store.state.activityMap, Store.localDateKey)}
          </div>

          <div class="analytics-panel">
            <div class="ap-header">
              <div>
                <h2 class="section-title">Recently Solved</h2>
                <p class="section-subtitle">Your latest completed problems.</p>
              </div>
            </div>
            <div class="recent-solves-list">
              ${recentHtml}
            </div>
          </div>
        </section>
      </div>`;

    const addSel = root.querySelector('#addTargetCompanySelect');
    if (addSel) {
      addSel.addEventListener('change', e => {
        if (e.target.value) {
          Store.togglePinnedCompany(e.target.value);
          render(root);
        }
      });
    }

    if (!root._analyticsBound) {
      root._analyticsBound = true;
      root.addEventListener('click', e => {
        const unpin = e.target.closest('[data-unpin-company]');
        if (unpin) {
          Store.togglePinnedCompany(unpin.getAttribute('data-unpin-company'));
          render(root);
          return;
        }
        if (e.target.id === 'btnAnalyticsExport') {
          const btnExport = document.getElementById('btnExportData');
          if (btnExport) btnExport.click();
        }
      });
    }
  }

  window.App.Views.Analytics = { render };
})();

