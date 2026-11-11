/**
 * Dataset Indexing & Query Engine over window.DSA_DATA
 */
(function () {
  'use strict';

  window.App = window.App || {};

  let initialized = false;
  let problems = [];
  let slugToProblem = new Map();
  let topics = [];
  let topicMeta = [];
  let topicNameToId = new Map();
  let companyMeta = [];
  let companyMetaMap = new Map();
  let roadmaps = [];
  let roadmapById = new Map();
  let studyPlans = [];
  let studyPlanById = new Map();
  let stats = {};

  function init() {
    if (initialized || !window.DSA_DATA) return;
    const raw = window.DSA_DATA;

    topics = raw.topics || [];
    topicMeta = raw.topicMeta || [];
    topics.forEach((name, idx) => topicNameToId.set(name, idx));

    companyMeta = raw.companyMeta || [];
    companyMeta.forEach((c, idx) => {
      companyMetaMap.set(c.name, Object.assign({ rank: idx }, c));
    });

    problems = (raw.problems || []).map((p, idx) => {
      const obj = {
        id: idx,
        title: p[0],
        titleLower: p[0].toLowerCase(),
        diff: p[1],
        slug: p[2],
        topics: p[3] || [],
        topicSet: new Set(p[3] || []),
        ac: p[4] || 0,
        compCount: p[5] || 0,
        topComps: p[6] || []
      };
      if (obj.slug && !slugToProblem.has(obj.slug)) {
        slugToProblem.set(obj.slug, obj);
      }
      return obj;
    });

    // Index roadmap nodes using exact topic IDs + optional title keywords
    const coveredPids = new Set();
    roadmaps = (raw.roadmaps || []).map((r, idx) => {
      const tidSet = new Set();
      (r.exact || []).forEach(tName => {
        if (topicNameToId.has(tName)) tidSet.add(topicNameToId.get(tName));
      });
      const kws = (r.title_keywords || []).map(k => k.toLowerCase());

      const pids = [];
      let easy = 0, med = 0, hard = 0;
      problems.forEach(p => {
        let hit = false;
        for (const tid of p.topics) {
          if (tidSet.has(tid)) {
            hit = true;
            break;
          }
        }
        if (!hit && kws.length > 0) {
          for (const kw of kws) {
            if (p.titleLower.includes(kw)) {
              hit = true;
              break;
            }
          }
        }
        if (hit) {
          pids.push(p.id);
          coveredPids.add(p.id);
          if (p.diff === 1) easy++;
          else if (p.diff === 2) med++;
          else hard++;
        }
      });

      const node = Object.assign({}, r, {
        index: idx,
        tidSet,
        pids,
        pidSet: new Set(pids),
        diffCounts: [easy, med, hard]
      });
      roadmapById.set(r.id, node);
      return node;
    });

    // Ensure untagged problems still have a cluster if someone browses all topics
    const untaggedPids = [];
    let uE = 0, uM = 0, uH = 0;
    problems.forEach(p => {
      if (!coveredPids.has(p.id)) {
        untaggedPids.push(p.id);
        if (p.diff === 1) uE++;
        else if (p.diff === 2) uM++;
        else uH++;
      }
    });
    if (untaggedPids.length > 0) {
      const miscNode = {
        id: 'misc',
        name: 'General & Uncategorized',
        tier: 8,
        deps: [],
        desc: 'Additional company interview problems without explicit LeetCode topic tags.',
        exact: [],
        index: roadmaps.length,
        tidSet: new Set(),
        pids: untaggedPids,
        pidSet: new Set(untaggedPids),
        diffCounts: [uE, uM, uH]
      };
      roadmaps.push(miscNode);
      roadmapById.set('misc', miscNode);
    }

    studyPlans = (raw.studyPlans || []).map(plan => {
      const enriched = Object.assign({}, plan, {
        pidSet: new Set(plan.pids || [])
      });
      studyPlanById.set(plan.id, enriched);
      return enriched;
    });

    stats = raw.stats || {
      totalCompanies: companyMeta.length,
      activeCompanies: companyMeta.filter(c => c.total > 0).length,
      totalProblems: problems.length,
      totalTopics: topics.length,
      diffCounts: [0, 0, 0],
      hot30Problems: 0
    };

    initialized = true;
  }

  function getProblem(pid) {
    init();
    return problems[pid] || null;
  }

  function getProblemBySlug(slug) {
    init();
    return slugToProblem.get(slug) || null;
  }

  function getProblems() {
    init();
    return problems;
  }

  function getTopics() {
    init();
    return topics;
  }

  function getTopicMeta() {
    init();
    return topicMeta;
  }

  function getCompanyMetaList() {
    init();
    return companyMeta;
  }

  function getCompanyMeta(name) {
    init();
    return companyMetaMap.get(name) || null;
  }

  function getFeaturedCompanies() {
    init();
    return (window.DSA_DATA && window.DSA_DATA.featured) || [];
  }

  function getCompanyProblems(companyName, tf) {
    init();
    const rawComps = (window.DSA_DATA && window.DSA_DATA.companies) || {};
    const compRec = rawComps[companyName];
    if (!compRec) return [];
    const list = compRec[tf || 'all'] || [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const pid = list[i][0];
      const freq = list[i][1];
      const p = problems[pid];
      if (p) {
        out.push({
          id: p.id,
          title: p.title,
          titleLower: p.titleLower,
          diff: p.diff,
          slug: p.slug,
          topics: p.topics,
          topicSet: p.topicSet,
          ac: p.ac,
          compCount: p.compCount,
          topComps: p.topComps,
          freq: freq
        });
      }
    }
    return out;
  }

  function getCompanyReadiness(companyName, solvedSet, tf) {
    init();
    const rawComps = (window.DSA_DATA && window.DSA_DATA.companies) || {};
    const compRec = rawComps[companyName];
    if (!compRec) {
      return { total: 0, solved: 0, pct: 0, easySolved: 0, easyTotal: 0, medSolved: 0, medTotal: 0, hardSolved: 0, hardTotal: 0 };
    }
    const list = compRec[tf || 'all'] || [];
    let solved = 0, easySolved = 0, easyTotal = 0, medSolved = 0, medTotal = 0, hardSolved = 0, hardTotal = 0;
    for (let i = 0; i < list.length; i++) {
      const pid = list[i][0];
      const p = problems[pid];
      if (!p) continue;
      const isS = solvedSet.has(pid);
      if (isS) solved++;
      if (p.diff === 1) { easyTotal++; if (isS) easySolved++; }
      else if (p.diff === 2) { medTotal++; if (isS) medSolved++; }
      else { hardTotal++; if (isS) hardSolved++; }
    }
    const total = list.length;
    const pct = total > 0 ? Math.round((solved / total) * 1000) / 10 : 0;
    return { total, solved, pct, easySolved, easyTotal, medSolved, medTotal, hardSolved, hardTotal };
  }

  function getRoadmaps() {
    init();
    return roadmaps;
  }

  function getRoadmapById(id) {
    init();
    return roadmapById.get(id) || null;
  }

  function getRoadmapProgress(node, solvedSet) {
    let solved = 0;
    let easySolved = 0, medSolved = 0, hardSolved = 0;
    for (let i = 0; i < node.pids.length; i++) {
      const pid = node.pids[i];
      if (solvedSet.has(pid)) {
        solved++;
        const d = problems[pid].diff;
        if (d === 1) easySolved++;
        else if (d === 2) medSolved++;
        else hardSolved++;
      }
    }
    const total = node.pids.length;
    const pct = total > 0 ? Math.round((solved / total) * 100) : 0;
    return { solved, total, pct, easySolved, medSolved, hardSolved };
  }

  function getStudyPlans() {
    init();
    return studyPlans;
  }

  function getStudyPlanById(id) {
    init();
    return studyPlanById.get(id) || null;
  }

  function getStats() {
    init();
    return stats;
  }

  function getTopCompanyNamesForProblem(p, maxCount) {
    init();
    const limit = maxCount || 3;
    const names = [];
    for (let i = 0; i < Math.min(limit, p.topComps.length); i++) {
      const meta = companyMeta[p.topComps[i]];
      if (meta) names.push(meta.name);
    }
    return names;
  }

  function searchGlobal(query) {
    init();
    const q = (query || '').trim().toLowerCase();
    if (!q) {
      return {
        companies: companyMeta.slice(0, 6),
        roadmaps: roadmaps.slice(0, 4),
        plans: studyPlans.slice(0, 3),
        problems: []
      };
    }

    const matchedCompanies = [];
    for (let i = 0; i < companyMeta.length; i++) {
      if (companyMeta[i].name.toLowerCase().includes(q)) {
        matchedCompanies.push(companyMeta[i]);
        if (matchedCompanies.length >= 6) break;
      }
    }

    const matchedRoadmaps = roadmaps
      .filter(r => r.name.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q))
      .slice(0, 4);

    const matchedPlans = studyPlans
      .filter(p => p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q))
      .slice(0, 3);

    const matchedProblems = [];
    for (let i = 0; i < problems.length; i++) {
      const p = problems[i];
      if (p.titleLower.includes(q) || p.slug.includes(q)) {
        matchedProblems.push(p);
        if (matchedProblems.length >= 10) break;
      }
    }

    return {
      companies: matchedCompanies,
      roadmaps: matchedRoadmaps,
      plans: matchedPlans,
      problems: matchedProblems
    };
  }

  window.App.Data = {
    init,
    getProblem,
    getProblemBySlug,
    getProblems,
    getTopics,
    getTopicMeta,
    getCompanyMetaList,
    getCompanyMeta,
    getFeaturedCompanies,
    getCompanyProblems,
    getCompanyReadiness,
    getRoadmaps,
    getRoadmapById,
    getRoadmapProgress,
    getStudyPlans,
    getStudyPlanById,
    getStats,
    getTopCompanyNamesForProblem,
    searchGlobal
  };
})();

