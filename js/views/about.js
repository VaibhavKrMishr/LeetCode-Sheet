/**
 * About, Dataset Methodology & Deployment Guide View
 */
(function () {
  'use strict';

  window.App = window.App || {};
  window.App.Views = window.App.Views || {};

  function render(root) {
    const Data = window.App.Data;
    const stats = Data.getStats();

    root.innerHTML = `
      <div class="page-container about-container">
        <section class="page-hero-compact">
          <div>
            <h1 class="page-heading">About &amp; Architecture</h1>
            <p class="page-subheading">A 100% static, zero-dependency company-wise LeetCode prep platform built directly around the CSV archive.</p>
          </div>
          <div class="page-hero-stats">
            <a href="#/sheet" class="btn-primary">Open DSA Sheet &rarr;</a>
          </div>
        </section>

        <div class="about-grid">
          <article class="about-card">
            <h2>Dataset Breakdown</h2>
            <p>Compiled directly from the 2,350 company CSV files across 5 recency windows via <code>scripts/build_data.py</code>.</p>
            <ul class="about-list tabular-nums">
              <li><b>Total Company Directories:</b> ${stats.totalCompanies} (${stats.activeCompanies} active with questions)</li>
              <li><b>Unique LeetCode Problems:</b> ${stats.totalProblems.toLocaleString()} (Easy: ${stats.diffCounts[0]}, Medium: ${stats.diffCounts[1]}, Hard: ${stats.diffCounts[2]})</li>
              <li><b>Algorithmic Topics:</b> ${stats.totalTopics} distinct tags mapped into 19 roadmap clusters</li>
              <li><b>30-Day Active Questions:</b> ${stats.hot30Problems} problems reported in recent 30-day rounds</li>
            </ul>
          </article>

          <article class="about-card">
            <h2>Recency Timeframes</h2>
            <p>Each company tracks up to five chronological snapshots so you can balance fresh interview trends with evergreen classics:</p>
            <ul class="about-list">
              <li><b>🔥 30 Days:</b> Highest-confidence problems reported in active interview loops this month.</li>
              <li><b>Last 3 Months:</b> Rolling quarterly patterns and emerging problem variations.</li>
              <li><b>Last 6 Months:</b> Medium-term interview bank for current hiring cycles.</li>
              <li><b>&gt; 6 Months:</b> Historic questions still useful for pattern depth.</li>
              <li><b>All Time:</b> Complete deduplicated company question bank ranked by frequency.</li>
            </ul>
          </article>

          <article class="about-card">
            <h2>SQLite + Offline Persistence</h2>
            <p>When run locally via <code>./launch.sh</code> or <code>python3 scripts/serve.py</code>, progress is saved transactionally to a local SQLite database (<code>progress.db</code>, gitignored) — surviving cache clears, Incognito, multiple tabs, and switching Chrome/Firefox:</p>
            <ul class="about-list">
              <li>Slug-keyed solved checkmarks &amp; full solve history</li>
              <li>Starred bookmarks &amp; personal Big-O complexity notes</li>
              <li>Daily streak counters &amp; pinned target companies</li>
            </ul>
            <p style="margin-top:0.75rem;">When hosted on a static CDN (GitHub Pages / Vercel / Cloudflare), it automatically falls back to browser <code>localStorage</code> with JSON Export/Import in <b>⚙️ Settings</b>.</p>
          </article>

          <article class="about-card">
            <h2>Local Launch &amp; Static Hosting</h2>
            <p>Zero build step or Node.js bundler is required. Run locally with SQLite persistence or deploy statically:</p>
            <pre class="code-block"><code># Local server with SQLite (progress.db) persistence
./launch.sh
# or directly with Python
python3 scripts/serve.py --port 3008

# Recompile dataset after editing CSV files
python3 scripts/build_data.py</code></pre>
            <p style="margin-top:0.65rem;">Deploy cleanly to <b>GitHub Pages</b> (root branch), <b>Cloudflare Pages</b>, <b>Netlify</b>, or <b>Vercel</b> with publish directory <code>.</code></p>
          </article>
        </div>
      </div>`;
  }

  window.App.Views.About = { render };
})();

