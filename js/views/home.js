/**
 * Home / Landing Overview View
 */
(function () {
  'use strict';

  window.App = window.App || {};
  window.App.Views = window.App.Views || {};

  function render(root) {
    const Data = window.App.Data;
    const Store = window.App.Store;
    const UI = window.App.UI;

    const stats = Data.getStats();
    const solvedCount = Store.state.solvedSet.size;
    const pct = stats.totalProblems > 0 ? ((solvedCount / stats.totalProblems) * 100).toFixed(1) : '0.0';
    const streak = Store.getStreakStats();

    const plans = Data.getStudyPlans();
    const featuredNames = [
      'Google', 'Amazon', 'Meta', 'Microsoft', 'Bloomberg', 'Uber',
      'Apple', 'TikTok', 'Citadel', 'Goldman Sachs', 'Adobe', 'Snowflake'
    ];

    const planCardsHtml = plans.map(pl => {
      let plSolved = 0;
      pl.pids.forEach(pid => { if (Store.state.solvedSet.has(pid)) plSolved++; });
      const plPct = pl.pids.length > 0 ? Math.round((plSolved / pl.pids.length) * 100) : 0;

      return `
        <a href="#/sheet?view=plan&plan=${encodeURIComponent(pl.id)}" class="home-plan-card">
          <div class="plan-card-top">
            <span class="plan-badge">${UI.escapeHTML(pl.badge)}</span>
            <span class="plan-count tabular-nums">${pl.pids.length} problems</span>
          </div>
          <h3 class="plan-title">${UI.escapeHTML(pl.name)}</h3>
          <p class="plan-desc">${UI.escapeHTML(pl.desc)}</p>
          <div class="plan-progress-row">
            <div class="mini-bar-bg"><div class="mini-bar-fill" style="width:${plPct}%"></div></div>
            <span class="tabular-nums plan-prog-label">${plSolved}/${pl.pids.length}</span>
          </div>
        </a>`;
    }).join('');

    const featuredCardsHtml = featuredNames.map(name => {
      const meta = Data.getCompanyMeta(name);
      if (!meta) return '';
      const readiness = Data.getCompanyReadiness(name, Store.state.solvedSet, 'all');
      const total = meta.total || 1;
      const eW = (meta.diff[0] / total) * 100;
      const mW = (meta.diff[1] / total) * 100;
      const hW = (meta.diff[2] / total) * 100;

      return `
        <a href="#/company/${encodeURIComponent(name)}" class="company-mini-card">
          <div class="cmc-header">
            <span class="cmc-name">${UI.escapeHTML(name)}</span>
            <span class="tier-pill ${meta.tier.toLowerCase()}">${UI.escapeHTML(meta.tier)}</span>
          </div>
          <div class="cmc-counts">
            <span class="tabular-nums"><b>${meta.total.toLocaleString()}</b> total</span>
            ${meta.counts['30d'] > 0 ? `<span class="hot-pill tabular-nums">🔥 ${meta.counts['30d']} in 30d</span>` : `<span class="muted-pill tabular-nums">3m: ${meta.counts['3m']}</span>`}
          </div>
          <div class="diff-split-bar" title="Easy ${meta.diff[0]} • Medium ${meta.diff[1]} • Hard ${meta.diff[2]}">
            <span style="width:${eW}%;background:var(--diff-easy)"></span>
            <span style="width:${mW}%;background:var(--diff-med)"></span>
            <span style="width:${hW}%;background:var(--diff-hard)"></span>
          </div>
          <div class="cmc-footer">
            <span class="tabular-nums">${readiness.solved} / ${readiness.total} solved</span>
            <span class="tabular-nums cmc-pct">${readiness.pct}%</span>
          </div>
        </a>`;
    }).join('');

    const topics = Data.getTopics();
    const topTopicChips = Data.getTopicMeta().slice(0, 14).map(t => `
      <a href="#/sheet?view=all&topic=${t.id}" class="topic-pill-link">
        <span>${UI.escapeHTML(t.name)}</span>
        <span class="topic-pill-count tabular-nums">${t.count}</span>
      </a>`).join('');

    root.innerHTML = `
      <div class="page-container home-page">
        <!-- Hero Section -->
        <section class="hero-card">
          <div class="hero-content">
            <div class="hero-eyebrow">
              <span class="hero-dot"></span>
              <span>Standalone Static DSA Platform • Zero Runtime Dependencies</span>
            </div>
            <h1 class="hero-title">Company-Wise LeetCode Mastery, Built for Speed.</h1>
            <p class="hero-subtitle">
              Practice from <b>${stats.totalProblems.toLocaleString()}</b> curated LeetCode problems indexed across
              <b>${stats.totalCompanies}</b> tech companies &amp; quant firms, segmented by 5 interview recency windows and 18+ pattern roadmaps.
            </p>
            <div class="hero-actions">
              <a href="#/sheet" class="btn-primary btn-lg">Open DSA Sheet &rarr;</a>
              <a href="#/companies" class="btn-secondary btn-lg">Explore ${stats.totalCompanies} Companies</a>
              <a href="#/roadmap" class="btn-secondary btn-lg">Visual Roadmap</a>
            </div>
          </div>

          <div class="hero-aside">
            <div class="hero-status-box">
              <div class="hsb-header">
                <span>Your Progress</span>
                <a href="#/analytics" class="hsb-link">Analytics &rarr;</a>
              </div>
              <div class="hsb-main">
                <span class="hsb-big tabular-nums">${solvedCount.toLocaleString()}</span>
                <span class="hsb-total tabular-nums">/ ${stats.totalProblems.toLocaleString()}</span>
              </div>
              <div class="progress-meter-bar" style="margin:0.65rem 0;">
                <div class="meter-segment easy" style="width:${pct}%"></div>
              </div>
              <div class="hsb-meta">
                <span class="tabular-nums">${pct}% Mastered</span>
                <span class="tabular-nums">${streak.currentStreak}d Streak • ${Store.state.starredSet.size} Starred</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Dataset Metrics Strip -->
        <section class="metrics-strip">
          <div class="metric-card">
            <span class="metric-value tabular-nums">${stats.activeCompanies} <small class="metric-sub">/ ${stats.totalCompanies}</small></span>
            <span class="metric-label">Active Companies Tracked</span>
          </div>
          <div class="metric-card">
            <span class="metric-value tabular-nums">${stats.totalProblems.toLocaleString()}</span>
            <span class="metric-label">Unique LeetCode Problems</span>
          </div>
          <div class="metric-card">
            <span class="metric-value tabular-nums">${stats.hot30Problems}</span>
            <span class="metric-label">30-Day Hot Interview Questions</span>
          </div>
          <div class="metric-card">
            <span class="metric-value tabular-nums">${stats.totalTopics}</span>
            <span class="metric-label">Algorithmic Topic Tags</span>
          </div>
        </section>

        <!-- Curated Study Plans -->
        <section class="home-section">
          <div class="section-header-row">
            <div>
              <h2 class="section-title">Curated Study Plans</h2>
              <p class="section-subtitle">Data-ranked tracks computed directly from cross-company frequency and 30-day recency.</p>
            </div>
            <a href="#/sheet?view=plan" class="section-link">Browse all plans &rarr;</a>
          </div>
          <div class="home-plans-grid">
            ${planCardsHtml}
          </div>
        </section>

        <!-- Featured Companies -->
        <section class="home-section">
          <div class="section-header-row">
            <div>
              <h2 class="section-title">Top Companies &amp; Interview Readiness</h2>
              <p class="section-subtitle">Click any company to open its recency tabs (30d, 3m, 6m, All Time), frequency bars, and topic trays.</p>
            </div>
            <a href="#/companies" class="section-link">View all ${stats.totalCompanies} companies &rarr;</a>
          </div>
          <div class="featured-companies-grid">
            ${featuredCardsHtml}
          </div>
        </section>

        <!-- Top Topics Quick Jump -->
        <section class="home-section">
          <div class="section-header-row">
            <div>
              <h2 class="section-title">Most Frequent Algorithmic Topics</h2>
              <p class="section-subtitle">Jump straight into high-yield problem tags or explore the full interactive pattern graph.</p>
            </div>
            <a href="#/roadmap" class="section-link">Open Visual Roadmap &rarr;</a>
          </div>
          <div class="topic-pills-cloud">
            ${topTopicChips}
          </div>
        </section>

        <!-- 3-Step Workflow -->
        <section class="home-section">
          <div class="workflow-grid">
            <div class="workflow-card">
              <div class="wf-step tabular-nums">01</div>
              <h3>Target by Company or Pattern</h3>
              <p>Switch seamlessly between the 18-pattern DSA roadmap, 470 company sheets, or curated study sprints.</p>
            </div>
            <div class="workflow-card">
              <div class="wf-step tabular-nums">02</div>
              <h3>Prioritize by 30-Day Recency</h3>
              <p>Filter questions asked in the last 30 days, 3 months, or 6 months and sort directly by reported interview frequency.</p>
            </div>
            <div class="workflow-card">
              <div class="wf-step tabular-nums">03</div>
              <h3>Track &amp; Export Offline</h3>
              <p>Check off solved problems, star tough ones, write Big-O complexity notes, and export portable JSON backups anytime.</p>
            </div>
          </div>
        </section>
      </div>`;
  }

  window.App.Views.Home = { render };
})();

