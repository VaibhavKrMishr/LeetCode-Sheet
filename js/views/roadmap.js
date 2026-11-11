/**
 * Interactive Visual DSA Dependency Roadmap & Pattern Inspector
 */
(function () {
  'use strict';

  window.App = window.App || {};
  window.App.Views = window.App.Views || {};

  let selectedNodeId = 'arrays';
  let mountedRoot = null;
  let resizeCleanup = null;

  function drawConnectorEdges(canvasEl, svgEl, nodes) {
    if (!canvasEl || !svgEl) return;
    const canvasRect = canvasEl.getBoundingClientRect();
    if (canvasRect.width === 0) return;

    svgEl.setAttribute('viewBox', `0 0 ${canvasRect.width} ${canvasRect.height}`);
    svgEl.setAttribute('width', canvasRect.width);
    svgEl.setAttribute('height', canvasRect.height);

    let pathsHtml = '';
    nodes.forEach(node => {
      if (!node.deps || node.deps.length === 0) return;
      const targetEl = canvasEl.querySelector(`[data-node-id="${node.id}"]`);
      if (!targetEl) return;
      const tRect = targetEl.getBoundingClientRect();
      const tx = tRect.left - canvasRect.left + tRect.width / 2;
      const ty = tRect.top - canvasRect.top;

      node.deps.forEach(depId => {
        const srcEl = canvasEl.querySelector(`[data-node-id="${depId}"]`);
        if (!srcEl) return;
        const sRect = srcEl.getBoundingClientRect();
        const sx = sRect.left - canvasRect.left + sRect.width / 2;
        const sy = sRect.top - canvasRect.top + sRect.height;

        const dy = Math.max(24, Math.abs(ty - sy) * 0.55);
        const d = `M ${sx} ${sy} C ${sx} ${sy + dy}, ${tx} ${ty - dy}, ${tx} ${ty}`;
        const isHighlighted = selectedNodeId === node.id || selectedNodeId === depId;
        pathsHtml += `<path d="${d}" class="roadmap-edge ${isHighlighted ? 'active' : ''}" />`;
      });
    });

    svgEl.innerHTML = pathsHtml;
  }

  function renderInspector(node) {
    const Data = window.App.Data;
    const Store = window.App.Store;
    const UI = window.App.UI;

    if (!node) return '';
    const prog = Data.getRoadmapProgress(node, Store.state.solvedSet);
    const allNodes = Data.getRoadmaps().filter(r => r.tier <= 7);

    const prereqNodes = (node.deps || []).map(id => Data.getRoadmapById(id)).filter(Boolean);
    const nextNodes = allNodes.filter(r => (r.deps || []).includes(node.id));

    // Top 8 curated starter problems for this pattern (balanced Easy -> Med -> Hard by company count)
    const starterPool = node.pids
      .map(pid => Data.getProblem(pid))
      .filter(Boolean)
      .sort((a, b) => a.diff - b.diff || b.compCount - a.compCount)
      .slice(0, 8);

    const starterHtml = starterPool.map(p => {
      const isSolved = Store.state.solvedSet.has(p.id);
      const isStarred = Store.state.starredSet.has(p.id);
      const diffInfo = UI.formatDiffLabel(p.diff);
      return `
        <div class="inspector-problem-item ${isSolved ? 'solved' : ''}">
          <input type="checkbox" class="custom-checkbox btn-roadmap-solve" data-pid="${p.id}" ${isSolved ? 'checked' : ''} aria-label="Mark ${UI.escapeHTML(p.title)} as solved">
          <a href="https://leetcode.com/problems/${encodeURIComponent(p.slug)}/" target="_blank" rel="noopener noreferrer" class="ip-title">
            ${UI.escapeHTML(p.title)} ↗
          </a>
          <span class="diff-badge ${diffInfo.cls}">${diffInfo.label}</span>
          <span class="ip-comps tabular-nums">${p.compCount} co.</span>
          <button type="button" class="btn-star ${isStarred ? 'starred' : ''}" data-roadmap-star="${p.id}" title="Bookmark">${isStarred ? '★' : '☆'}</button>
        </div>`;
    }).join('');

    return `
      <div class="roadmap-inspector-card">
        <div class="ri-header">
          <div>
            <span class="ri-tier tabular-nums">Tier ${node.tier} Pattern</span>
            <h2 class="ri-title">${UI.escapeHTML(node.name)}</h2>
          </div>
          <span class="ri-pct tabular-nums">${prog.pct}%</span>
        </div>

        <p class="ri-desc">${UI.escapeHTML(node.desc)}</p>

        <div class="progress-meter-bar" style="margin:0.75rem 0 0.5rem;">
          <div class="meter-segment easy" style="width:${prog.pct}%"></div>
        </div>
        <div class="ri-counts tabular-nums">
          <span><b>${prog.solved}</b> / ${prog.total} solved</span>
          <span>E:${node.diffCounts[0]} • M:${node.diffCounts[1]} • H:${node.diffCounts[2]}</span>
        </div>

        ${prereqNodes.length > 0 ? `
          <div class="ri-relations">
            <span class="ri-rel-label">Prerequisites:</span>
            <div class="ri-rel-chips">
              ${prereqNodes.map(pr => `<button type="button" class="rel-chip" data-select-node="${pr.id}">&larr; ${UI.escapeHTML(pr.name)}</button>`).join('')}
            </div>
          </div>` : ''}

        ${nextNodes.length > 0 ? `
          <div class="ri-relations">
            <span class="ri-rel-label">Unlocks Next:</span>
            <div class="ri-rel-chips">
              ${nextNodes.map(nx => `<button type="button" class="rel-chip" data-select-node="${nx.id}">${UI.escapeHTML(nx.name)} &rarr;</button>`).join('')}
            </div>
          </div>` : ''}

        <div class="ri-starters">
          <div class="ri-starters-head">
            <h3>Recommended Starter Progression</h3>
            <span class="muted-pill">Top Demand</span>
          </div>
          <div class="ri-starter-list">${starterHtml}</div>
        </div>

        <a href="#/sheet?view=topic&roadmap=${encodeURIComponent(node.id)}" class="btn-primary" style="width:100%;justify-content:center;margin-top:1rem;">
          Practice all ${node.pids.length} problems in Sheet &rarr;
        </a>
      </div>`;
  }

  function render(root, params) {
    mountedRoot = root;
    if (resizeCleanup) {
      resizeCleanup();
      resizeCleanup = null;
    }

    const Data = window.App.Data;
    const Store = window.App.Store;
    const UI = window.App.UI;

    const allNodes = Data.getRoadmaps().filter(r => r.tier <= 7);
    if (params && params.node && Data.getRoadmapById(params.node)) {
      selectedNodeId = params.node;
    }
    if (!Data.getRoadmapById(selectedNodeId)) {
      selectedNodeId = 'arrays';
    }

    // Group into tiers 1..7
    const tierMap = new Map();
    for (let t = 1; t <= 7; t++) tierMap.set(t, []);
    allNodes.forEach(n => {
      if (tierMap.has(n.tier)) tierMap.get(n.tier).push(n);
    });

    const tiersHtml = Array.from(tierMap.entries()).map(([tierNum, nodes]) => `
      <div class="roadmap-tier-row" data-tier="${tierNum}">
        ${nodes.map(node => {
          const prog = Data.getRoadmapProgress(node, Store.state.solvedSet);
          const isSelected = node.id === selectedNodeId;
          const isDone = prog.total > 0 && prog.solved === prog.total;
          return `
            <button type="button" class="roadmap-node ${isSelected ? 'selected' : ''} ${isDone ? 'completed' : ''}" data-node-id="${node.id}">
              <div class="rn-top">
                <span class="rn-name">${UI.escapeHTML(node.name)}</span>
                <span class="rn-pct tabular-nums">${prog.pct}%</span>
              </div>
              <div class="mini-bar-bg" style="width:100%;margin:0.35rem 0;">
                <div class="mini-bar-fill" style="width:${prog.pct}%"></div>
              </div>
              <div class="rn-meta tabular-nums">
                <span>${prog.solved}/${prog.total}</span>
                <span>E:${node.diffCounts[0]} M:${node.diffCounts[1]}</span>
              </div>
            </button>`;
        }).join('')}
      </div>`).join('');

    const selectedNode = Data.getRoadmapById(selectedNodeId);

    // Curated Study Plans Strip
    const plansHtml = Data.getStudyPlans().map(pl => {
      let solved = 0;
      pl.pids.forEach(pid => { if (Store.state.solvedSet.has(pid)) solved++; });
      const pct = pl.pids.length > 0 ? Math.round((solved / pl.pids.length) * 100) : 0;
      return `
        <a href="#/sheet?view=plan&plan=${encodeURIComponent(pl.id)}" class="home-plan-card">
          <div class="plan-card-top">
            <span class="plan-badge">${UI.escapeHTML(pl.badge)}</span>
            <span class="plan-count tabular-nums">${pl.pids.length} problems</span>
          </div>
          <h3 class="plan-title">${UI.escapeHTML(pl.name)}</h3>
          <p class="plan-desc">${UI.escapeHTML(pl.desc)}</p>
          <div class="plan-progress-row">
            <div class="mini-bar-bg"><div class="mini-bar-fill" style="width:${pct}%"></div></div>
            <span class="tabular-nums plan-prog-label">${solved}/${pl.pids.length}</span>
          </div>
        </a>`;
    }).join('');

    root.innerHTML = `
      <div class="page-container">
        <section class="page-hero-compact">
          <div>
            <h1 class="page-heading">Interactive DSA Roadmap</h1>
            <p class="page-subheading">Follow the pattern dependency tree from Arrays &amp; Two Pointers to Trees, Graphs, and Dynamic Programming. Click any node to inspect core starter problems.</p>
          </div>
          <div class="page-hero-stats">
            <a href="#/sheet?view=topic" class="btn-secondary">Open Topic Accordions &rarr;</a>
          </div>
        </section>

        <section class="roadmap-workspace">
          <div class="roadmap-canvas-card">
            <div id="roadmapCanvas" class="roadmap-canvas">
              <svg id="roadmapSvg" class="roadmap-svg" aria-hidden="true"></svg>
              <div class="roadmap-tiers">
                ${tiersHtml}
              </div>
            </div>
          </div>

          <aside id="roadmapInspectorSlot" class="roadmap-inspector-slot">
            ${renderInspector(selectedNode)}
          </aside>
        </section>

        <section class="home-section" style="margin-top:2rem;">
          <div class="section-header-row">
            <div>
              <h2 class="section-title">Structured Study Tracks</h2>
              <p class="section-subtitle">Short on time? Pick a focused sprint ranked by company frequency and 30-day demand.</p>
            </div>
          </div>
          <div class="home-plans-grid">
            ${plansHtml}
          </div>
        </section>
      </div>`;

    const canvasEl = root.querySelector('#roadmapCanvas');
    const svgEl = root.querySelector('#roadmapSvg');

    const redraw = () => {
      if (!document.body.contains(canvasEl)) {
        if (resizeCleanup) {
          resizeCleanup();
          resizeCleanup = null;
        }
        return;
      }
      drawConnectorEdges(canvasEl, svgEl, allNodes);
    };
    requestAnimationFrame(redraw);
    window.addEventListener('resize', redraw);
    resizeCleanup = () => window.removeEventListener('resize', redraw);

    function refreshNodeCardsAndInspector() {
      allNodes.forEach(node => {
        const nodeEl = root.querySelector(`.roadmap-node[data-node-id="${node.id}"]`);
        if (!nodeEl) return;
        const prog = Data.getRoadmapProgress(node, Store.state.solvedSet);
        const isDone = prog.total > 0 && prog.solved === prog.total;
        nodeEl.classList.toggle('selected', node.id === selectedNodeId);
        nodeEl.classList.toggle('completed', isDone);
        const pctEl = nodeEl.querySelector('.rn-pct');
        const fillEl = nodeEl.querySelector('.mini-bar-fill');
        const metaEl = nodeEl.querySelector('.rn-meta');
        if (pctEl) pctEl.textContent = `${prog.pct}%`;
        if (fillEl) fillEl.style.width = `${prog.pct}%`;
        if (metaEl) metaEl.innerHTML = `<span>${prog.solved}/${prog.total}</span><span>E:${node.diffCounts[0]} M:${node.diffCounts[1]}</span>`;
      });
      const insp = root.querySelector('#roadmapInspectorSlot');
      if (insp) insp.innerHTML = renderInspector(Data.getRoadmapById(selectedNodeId));
      redraw();
    }

    if (!root._roadmapBound) {
      root._roadmapBound = true;
      root.addEventListener('click', e => {
        const nodeBtn = e.target.closest('[data-node-id], [data-select-node]');
        if (nodeBtn) {
          const nextId = nodeBtn.getAttribute('data-node-id') || nodeBtn.getAttribute('data-select-node');
          if (nextId && Data.getRoadmapById(nextId)) {
            selectedNodeId = nextId;
            refreshNodeCardsAndInspector();
          }
          return;
        }

        const chk = e.target.closest('.btn-roadmap-solve');
        if (chk) {
          const pid = parseInt(chk.getAttribute('data-pid'), 10);
          Store.setSolved(pid, chk.checked);
          refreshNodeCardsAndInspector();
          return;
        }

        const starBtn = e.target.closest('[data-roadmap-star]');
        if (starBtn) {
          const pid = parseInt(starBtn.getAttribute('data-roadmap-star'), 10);
          const nextStar = !Store.state.starredSet.has(pid);
          Store.setStarred(pid, nextStar);
          starBtn.classList.toggle('starred', nextStar);
          starBtn.textContent = nextStar ? '★' : '☆';
        }
      });
    }
  }

  window.App.Views.Roadmap = { render };
})();
