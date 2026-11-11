/**
 * Shared UI Components, Modals, Command Palette & Problem Row Builders
 */
(function () {
  'use strict';

  window.App = window.App || {};

  function escapeHTML(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(msg) {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2800);
  }

  function formatDiffLabel(diff) {
    if (diff === 1) return { cls: 'easy', label: 'Easy' };
    if (diff === 2) return { cls: 'medium', label: 'Med' };
    return { cls: 'hard', label: 'Hard' };
  }

  function renderProgressCard(opts) {
    const {
      solvedCount,
      totalCount,
      easySolved,
      easyTotal,
      medSolved,
      medTotal,
      hardSolved,
      hardTotal,
      showingCount,
      activeDiff
    } = opts;

    const pct = totalCount > 0 ? ((solvedCount / totalCount) * 100).toFixed(1) : '0.0';
    const ePct = totalCount > 0 ? (easySolved / totalCount) * 100 : 0;
    const mPct = totalCount > 0 ? (medSolved / totalCount) * 100 : 0;
    const hPct = totalCount > 0 ? (hardSolved / totalCount) * 100 : 0;

    return `
      <section class="progress-card">
        <div class="progress-card-inner">
          <div class="progress-left">
            <div class="progress-stat-main">
              <div class="stat-number-group">
                <span class="stat-big tabular-nums">${solvedCount.toLocaleString()}</span>
                <span class="stat-divider">/</span>
                <span class="stat-total tabular-nums">${totalCount.toLocaleString()}</span>
              </div>
              <span class="stat-label">Problems Solved</span>
            </div>

            <div class="progress-meter-wrapper">
              <div class="progress-meter-bar">
                <div class="meter-segment easy" style="width: ${ePct}%"></div>
                <div class="meter-segment medium" style="width: ${mPct}%"></div>
                <div class="meter-segment hard" style="width: ${hPct}%"></div>
              </div>
              <div class="progress-percentage-label">
                <span class="tabular-nums">${pct}% Complete</span>
                <span class="filtered-badge tabular-nums">Showing ${showingCount.toLocaleString()} problems</span>
              </div>
            </div>
          </div>

          <div class="progress-pills-right">
            <button class="diff-stat-pill easy ${activeDiff === '1' ? 'active' : ''}" data-diff-toggle="1" title="Click to filter by Easy">
              <span class="diff-tag">Easy</span>
              <span class="diff-val tabular-nums"><b>${easySolved}</b> / ${easyTotal}</span>
            </button>
            <button class="diff-stat-pill medium ${activeDiff === '2' ? 'active' : ''}" data-diff-toggle="2" title="Click to filter by Medium">
              <span class="diff-tag">Medium</span>
              <span class="diff-val tabular-nums"><b>${medSolved}</b> / ${medTotal}</span>
            </button>
            <button class="diff-stat-pill hard ${activeDiff === '3' ? 'active' : ''}" data-diff-toggle="3" title="Click to filter by Hard">
              <span class="diff-tag">Hard</span>
              <span class="diff-val tabular-nums"><b>${hardSolved}</b> / ${hardTotal}</span>
            </button>
          </div>
        </div>
      </section>`;
  }

  function renderTableHead(showFreq) {
    return `
      <thead>
        <tr>
          <th class="col-status">Status</th>
          <th class="col-star">Star</th>
          <th class="col-index">#</th>
          <th class="col-title">Problem</th>
          <th class="col-diff">Difficulty</th>
          <th class="col-topics">Topics</th>
          <th class="col-ac">Acceptance</th>
          <th class="col-freq">${showFreq ? 'Frequency' : 'Companies'}</th>
          <th class="col-notes">Notes</th>
        </tr>
      </thead>`;
  }

  function renderProblemRow(p, idx, opts) {
    const Store = window.App.Store;
    const Data = window.App.Data;
    const topics = Data.getTopics();
    const showFreq = Boolean(opts && opts.showFreq);

    const isSolved = Store.state.solvedSet.has(p.id);
    const isStarred = Store.state.starredSet.has(p.id);
    const noteText = Store.state.notesMap[p.id];
    const hasNote = Boolean(noteText && noteText.trim().length > 0);
    const diffInfo = formatDiffLabel(p.diff);

    const topicBadges = (p.topics || []).slice(0, 3).map(tid => {
      const tName = topics[tid] || '';
      return `<button type="button" class="tag-badge" data-tid="${tid}" title="Filter by ${escapeHTML(tName)}">${escapeHTML(tName)}</button>`;
    }).join('');

    const topComps = !showFreq ? Data.getTopCompanyNamesForProblem(p, 3) : [];
    const compMicroList = topComps.length > 0
      ? `<div class="problem-companies-micro">${topComps.map(c => `<a href="#/company/${encodeURIComponent(c)}" class="micro-comp-link">${escapeHTML(c)}</a>`).join('')}${p.compCount > topComps.length ? `<span class="micro-comp-more">+${p.compCount - topComps.length}</span>` : ''}</div>`
      : '';

    let freqCol = '';
    if (showFreq) {
      const freqVal = (p.freq || 0).toFixed(1);
      freqCol = `
        <div class="freq-gauge-container" title="Frequency: ${freqVal}%">
          <div class="freq-bar-bg"><div class="freq-bar-fill" style="width: ${Math.min(100, p.freq || 0)}%"></div></div>
          <span class="freq-val tabular-nums">${freqVal}%</span>
        </div>`;
    } else {
      freqCol = `
        <span class="comp-count-chip tabular-nums" title="Asked by ${p.compCount} companies">
          ${p.compCount} co.
        </span>`;
    }

    const leetCodeUrl = `https://leetcode.com/problems/${encodeURIComponent(p.slug)}/`;

    return `
      <tr class="${isSolved ? 'solved' : ''}" data-pid="${p.id}">
        <td class="col-status">
          <input type="checkbox" class="custom-checkbox btn-toggle-solve" data-pid="${p.id}" ${isSolved ? 'checked' : ''} aria-label="Mark ${escapeHTML(p.title)} as solved">
        </td>
        <td class="col-star">
          <button type="button" class="btn-star ${isStarred ? 'starred' : ''}" data-pid="${p.id}" title="${isStarred ? 'Remove bookmark' : 'Bookmark problem'}" aria-label="Star ${escapeHTML(p.title)}">
            ${isStarred ? '★' : '☆'}
          </button>
        </td>
        <td class="col-index tabular-nums">${idx + 1}</td>
        <td class="col-title">
          <div class="problem-title-cell">
            <a href="${leetCodeUrl}" target="_blank" rel="noopener noreferrer" class="problem-title-link">
              <span>${escapeHTML(p.title)}</span>
              <span class="external-arrow" aria-hidden="true">↗</span>
            </a>
            ${compMicroList}
          </div>
        </td>
        <td class="col-diff">
          <span class="diff-badge ${diffInfo.cls}">${diffInfo.label}</span>
        </td>
        <td class="col-topics">
          <div class="tags-list">${topicBadges}</div>
        </td>
        <td class="col-ac tabular-nums">
          ${p.ac > 0 ? p.ac.toFixed(1) + '%' : '—'}
        </td>
        <td class="col-freq">
          ${freqCol}
        </td>
        <td class="col-notes">
          <button type="button" class="btn-note ${hasNote ? 'has-note' : ''}" data-pid="${p.id}" title="${hasNote ? 'Edit Notes' : 'Add Notes'}" aria-label="Notes for ${escapeHTML(p.title)}">
            ${hasNote ? '📝' : '✏️'}
          </button>
        </td>
      </tr>`;
  }

  // --- Notes Modal Controller ---
  let activeNotePid = null;

  function openNotesModal(pid) {
    const Data = window.App.Data;
    const Store = window.App.Store;
    const p = Data.getProblem(pid);
    const modal = document.getElementById('notesModal');
    if (!p || !modal) return;

    activeNotePid = pid;
    const titleEl = document.getElementById('notesModalTitle');
    const metaEl = document.getElementById('notesModalMeta');
    const compEl = document.getElementById('notesModalCompanies');
    const ta = document.getElementById('problemNotesTextarea');
    const lcLink = document.getElementById('notesModalLcLink');

    const diffInfo = formatDiffLabel(p.diff);
    const topics = Data.getTopics();
    const topicNames = (p.topics || []).slice(0, 4).map(tid => topics[tid]).filter(Boolean);

    if (titleEl) titleEl.textContent = p.title;
    if (metaEl) {
      metaEl.innerHTML = `
        <span class="diff-badge ${diffInfo.cls}">${diffInfo.label}</span>
        <span class="modal-meta-pill tabular-nums">${p.ac > 0 ? p.ac.toFixed(1) + '% AC' : 'N/A'}</span>
        ${topicNames.map(t => `<span class="tag-badge static">${escapeHTML(t)}</span>`).join('')}
      `;
    }
    if (compEl) {
      const comps = Data.getTopCompanyNamesForProblem(p, 5);
      compEl.innerHTML = comps.length > 0
        ? `<span class="modal-comp-label">Asked by (${p.compCount}):</span> ` + comps.map(c => `<a href="#/company/${encodeURIComponent(c)}" class="micro-comp-link modal-comp-link">${escapeHTML(c)}</a>`).join('')
        : '';
    }
    if (lcLink) {
      lcLink.href = `https://leetcode.com/problems/${encodeURIComponent(p.slug)}/`;
    }
    if (ta) {
      ta.value = Store.state.notesMap[pid] || '';
    }

    modal.classList.remove('hidden');
    if (ta) setTimeout(() => ta.focus(), 40);
  }

  function closeNotesModal() {
    const modal = document.getElementById('notesModal');
    if (modal) modal.classList.add('hidden');
    activeNotePid = null;
  }

  function initNotesModal() {
    const modal = document.getElementById('notesModal');
    if (!modal) return;

    const btnClose = document.getElementById('btnCloseNotesModal');
    const btnCancel = document.getElementById('btnCancelNote');
    const btnSave = document.getElementById('btnSaveNote');
    const btnDelete = document.getElementById('btnDeleteNote');
    const ta = document.getElementById('problemNotesTextarea');

    if (btnClose) btnClose.addEventListener('click', closeNotesModal);
    if (btnCancel) btnCancel.addEventListener('click', closeNotesModal);
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.classList.contains('modal-comp-link')) {
        closeNotesModal();
      }
    });

    modal.querySelectorAll('.snippet-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (!ta) return;
        const snippet = chip.getAttribute('data-snippet') || '';
        const prefix = ta.value && !ta.value.endsWith('\n') ? '\n' : '';
        ta.value = ta.value + prefix + snippet;
        ta.focus();
      });
    });

    if (btnSave) {
      btnSave.addEventListener('click', () => {
        if (activeNotePid === null) return;
        window.App.Store.setNote(activeNotePid, ta ? ta.value : '');
        closeNotesModal();
        showToast('Notes saved');
      });
    }

    if (btnDelete) {
      btnDelete.addEventListener('click', () => {
        if (activeNotePid === null) return;
        window.App.Store.setNote(activeNotePid, '');
        closeNotesModal();
        showToast('Note deleted');
      });
    }
  }

  // --- Global Quick Jump Command Palette (Ctrl/Cmd + K) ---
  let cmdActiveIndex = 0;
  let cmdItems = [];

  function openCommandPalette() {
    const modal = document.getElementById('cmdModal');
    const input = document.getElementById('cmdSearchInput');
    if (!modal || !input) return;
    modal.classList.remove('hidden');
    input.value = '';
    renderCommandResults('');
    setTimeout(() => input.focus(), 20);
  }

  function closeCommandPalette() {
    const modal = document.getElementById('cmdModal');
    if (modal) modal.classList.add('hidden');
  }

  function renderCommandResults(query) {
    const container = document.getElementById('cmdResults');
    if (!container) return;
    const res = window.App.Data.searchGlobal(query);
    cmdItems = [];
    cmdActiveIndex = 0;

    let html = '';
    let globalIdx = 0;

    if (res.companies.length > 0) {
      html += `<div class="cmd-group-title">Companies</div>`;
      res.companies.forEach(c => {
        const href = `#/company/${encodeURIComponent(c.name)}`;
        cmdItems.push(href);
        html += `
          <a href="${href}" class="cmd-item ${globalIdx === 0 ? 'selected' : ''}" data-cmd-idx="${globalIdx}">
            <span class="cmd-item-icon">🏢</span>
            <span class="cmd-item-main">${escapeHTML(c.name)}</span>
            <span class="cmd-item-meta tabular-nums">${c.total} problems${c.counts['30d'] ? ` • 🔥 ${c.counts['30d']}` : ''}</span>
          </a>`;
        globalIdx++;
      });
    }

    if (res.roadmaps.length > 0) {
      html += `<div class="cmd-group-title">Roadmap Patterns</div>`;
      res.roadmaps.forEach(r => {
        const href = `#/roadmap?node=${encodeURIComponent(r.id)}`;
        cmdItems.push(href);
        html += `
          <a href="${href}" class="cmd-item ${globalIdx === 0 ? 'selected' : ''}" data-cmd-idx="${globalIdx}">
            <span class="cmd-item-icon">🧭</span>
            <span class="cmd-item-main">${escapeHTML(r.name)}</span>
            <span class="cmd-item-meta tabular-nums">${r.pids.length} problems</span>
          </a>`;
        globalIdx++;
      });
    }

    if (res.plans.length > 0) {
      html += `<div class="cmd-group-title">Study Plans</div>`;
      res.plans.forEach(pl => {
        const href = `#/sheet?view=plan&plan=${encodeURIComponent(pl.id)}`;
        cmdItems.push(href);
        html += `
          <a href="${href}" class="cmd-item ${globalIdx === 0 ? 'selected' : ''}" data-cmd-idx="${globalIdx}">
            <span class="cmd-item-icon">📋</span>
            <span class="cmd-item-main">${escapeHTML(pl.name)}</span>
            <span class="cmd-item-meta tabular-nums">${pl.pids.length} problems</span>
          </a>`;
        globalIdx++;
      });
    }

    if (res.problems.length > 0) {
      html += `<div class="cmd-group-title">Problems</div>`;
      res.problems.forEach(p => {
        const href = `#/sheet?view=all&q=${encodeURIComponent(p.title)}`;
        const diffInfo = formatDiffLabel(p.diff);
        cmdItems.push(href);
        html += `
          <a href="${href}" class="cmd-item ${globalIdx === 0 ? 'selected' : ''}" data-cmd-idx="${globalIdx}">
            <span class="diff-badge ${diffInfo.cls}" style="font-size:0.68rem;padding:0.1rem 0.4rem;">${diffInfo.label}</span>
            <span class="cmd-item-main">${escapeHTML(p.title)}</span>
            <span class="cmd-item-meta tabular-nums">${p.compCount} companies</span>
          </a>`;
        globalIdx++;
      });
    }

    if (!html) {
      html = `<div class="cmd-empty">No matching companies, patterns, or problems found.</div>`;
    }

    container.innerHTML = html;
  }

  function initCommandPalette() {
    const modal = document.getElementById('cmdModal');
    const input = document.getElementById('cmdSearchInput');
    const btnOpen = document.getElementById('btnCmdSearch');
    const btnClose = document.getElementById('btnCloseCmdModal');
    const results = document.getElementById('cmdResults');
    if (!modal || !input) return;

    if (btnOpen) btnOpen.addEventListener('click', openCommandPalette);
    if (btnClose) btnClose.addEventListener('click', closeCommandPalette);

    modal.addEventListener('click', e => {
      if (e.target === modal) closeCommandPalette();
    });

    if (results) {
      results.addEventListener('click', e => {
        const item = e.target.closest('.cmd-item');
        if (item) closeCommandPalette();
      });
    }

    input.addEventListener('input', () => {
      renderCommandResults(input.value);
    });

    input.addEventListener('keydown', e => {
      if (!results) return;
      const nodes = results.querySelectorAll('.cmd-item');
      if (e.key === 'ArrowDown' && nodes.length > 0) {
        e.preventDefault();
        cmdActiveIndex = (cmdActiveIndex + 1) % nodes.length;
        nodes.forEach((n, i) => n.classList.toggle('selected', i === cmdActiveIndex));
        nodes[cmdActiveIndex].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp' && nodes.length > 0) {
        e.preventDefault();
        cmdActiveIndex = (cmdActiveIndex - 1 + nodes.length) % nodes.length;
        nodes.forEach((n, i) => n.classList.toggle('selected', i === cmdActiveIndex));
        nodes[cmdActiveIndex].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && cmdItems[cmdActiveIndex]) {
        e.preventDefault();
        const target = cmdItems[cmdActiveIndex];
        closeCommandPalette();
        window.App.Store.navigate(target);
      } else if (e.key === 'Escape') {
        closeCommandPalette();
      }
    });

    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (modal.classList.contains('hidden')) openCommandPalette();
        else closeCommandPalette();
      } else if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        closeCommandPalette();
      }
    });
  }

  window.App.UI = {
    escapeHTML,
    showToast,
    formatDiffLabel,
    renderProgressCard,
    renderTableHead,
    renderProblemRow,
    openNotesModal,
    closeNotesModal,
    initNotesModal,
    openCommandPalette,
    closeCommandPalette,
    initCommandPalette
  };
})();

