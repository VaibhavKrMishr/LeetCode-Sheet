## LeetCode Company-Wise Problems & DSA Website

Curated lists of LeetCode questions grouped by companies and topics, wrapped in a **100% standalone static website** (pure HTML5, CSS3, and Vanilla JavaScript — zero framework/bundler/binary dependencies).

- **470 Company Directories (422 active)**: Includes FAANG/MAANG, Quant/HFT firms, and high-growth tech companies.
- **3,396 Unique Problems**: Categorized across 174 topics, difficulty splits, acceptance rates, and company frequencies.
- **5 Recency Timeframes**: Last 30 Days (Hot), Last 3 Months, Last 6 Months, > 6 Months, All Time.

---

### Features

- **Home Overview (`#/`)**: Dataset metrics strip, live personal progress status, curated study plans, and featured company readiness cards.
- **Interactive DSA Sheet (`#/sheet`)**:
  - **Topic-Wise (19 Pattern Clusters)** with lazy-hydrated accordions and progress meters.
  - **Company-Wise (`#/company/<Name>`)** with company hero readiness banner, recency tabs (`30d`, `3m`, `6m`, `6m+`, `all`), difficulty counters, and Topic Trays vs. Flat Frequency Table views.
  - **Study Plans**: Pre-ranked *30-Day Hot Sprint*, *Top 50 Universal*, *Big Tech Core 100*, *Quant & Finance 50*, and *Pattern Foundations*.
  - **Paginated All Problems** explorer (`3,396` problems) and **Starred & Notes** revision queue.
- **Companies Directory (`#/companies`)**: Searchable directory across all 470 companies with tier filters (`Big Tech`, `Quant & Finance`, `Notable Tech`, `30d Hot`), difficulty distribution bars, and readiness percentages.
- **Visual DSA Roadmap (`#/roadmap`)**: Interactive SVG dependency graph connecting pattern tiers with live progress rings, prerequisite links, and curated starter progressions.
- **Progress Analytics (`#/analytics`)**: Difficulty breakdown, Target Company Readiness matrix, 19-pattern Topic Mastery bars with recommended next focus, 12-week study activity heatmap, and recent solves.
- **Quick Jump (`Ctrl/Cmd + K`)**: Instant search across companies, roadmap patterns, study plans, and problems from any page.
- **100% Offline & Portable**: Solved checkmarks, bookmarks, Big-O notes, and daily streaks stay in `localStorage` with JSON Export/Import.

---

### Running Locally (With SQLite Persistence)

When you clone this repo locally and launch with `./launch.sh` (or `python3 scripts/serve.py`), your solved problems, bookmarks, notes, and streaks are **automatically stored in a local SQLite database (`progress.db`, gitignored)** — so clearing browser cache, using Incognito, using multiple open tabs, or switching between Chrome and Firefox won't lose your progress.

```bash
# 1. Start the local server (saves progress to progress.db) and open browser
./launch.sh

# Or start the Python server manually
python3 scripts/serve.py --port 3008

# 2. Open http://localhost:3008/
```

If you deploy statically on **GitHub Pages**, **Cloudflare Pages**, **Netlify**, or **Vercel** (publish directory `.`), or open `index.html` directly via `file://`, it automatically falls back to browser `localStorage` with JSON Export/Import in Settings.

### Regenerating Dataset & Deploying

```bash
# Recompile assets/dsa-data.js after updating any company CSV files
python3 scripts/build_data.py
```

Deploy the repository root (`.`) directly to **GitHub Pages**, **Cloudflare Pages**, **Netlify**, or **Vercel** with no build step required.

---

- System Design Notes: https://github.com/liquidslr/system-design-notes
