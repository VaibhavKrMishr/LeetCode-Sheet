#!/usr/bin/env python3
"""Compile all company CSV files into assets/dsa-data.js for the standalone static website."""

import csv
import json
import os
import re
from collections import Counter, defaultdict


MAANG_COMPANIES = {
    "Google", "Amazon", "Meta", "Microsoft", "Apple", "Netflix", "Uber", "Nvidia"
}

QUANT_FINANCE_COMPANIES = {
    "Citadel", "Jane Street", "Two Sigma", "DE Shaw", "Jump Trading", "Optiver",
    "Hudson River Trading", "Tower Research Capital", "WorldQuant", "Akuna Capital",
    "Virtu Financial", "SIG", "DRW", "AQR Capital Management", "Bridgewater Associates",
    "Goldman Sachs", "J.P. Morgan", "Morgan Stanley", "Barclays", "Bloomberg", "Arcesium"
}

UNICORN_TECH_COMPANIES = {
    "Stripe", "Databricks", "Snowflake", "Airbnb", "DoorDash", "Coinbase",
    "Palantir Technologies", "ByteDance", "TikTok", "LinkedIn", "Salesforce",
    "Adobe", "Oracle", "Atlassian", "Roblox", "Pinterest", "Snap", "Spotify",
    "Shopify", "Flipkart", "PhonePe", "Swiggy", "Zomato", "razorpay", "Meesho",
    "PayPal", "Intuit", "ServiceNow", "Workday", "Cloudflare", "MongoDB", "Waymo",
    "Anduril", "OpenAI", "Walmart Labs", "Cisco", "IBM", "Visa", "Mastercard"
}


def classify_tier(comp_name: str) -> str:
    if comp_name in MAANG_COMPANIES:
        return "MAANG"
    if comp_name in QUANT_FINANCE_COMPANIES:
        return "Quant"
    if comp_name in UNICORN_TECH_COMPANIES:
        return "Tech"
    return "Standard"


def main():
    workspace = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    print(f"Compiling DSA dataset in {workspace}...")

    excluded = {
        "assets", "content", "dist", "scripts", "ui", "styles", "js",
        ".git", ".gemini", "node_modules", ".agents", ".vscode", ".idea"
    }

    companies = sorted([
        d for d in os.listdir(workspace)
        if os.path.isdir(os.path.join(workspace, d))
        and not d.startswith(".")
        and d not in excluded
    ])

    print(f"Found {len(companies)} company folders.")

    timeframe_map = {
        "1. Thirty Days.csv": "30d",
        "2. Three Months.csv": "3m",
        "3. Six Months.csv": "6m",
        "4. More Than Six Months.csv": "6m+",
        "5. All.csv": "all",
    }

    problem_map = {}  # title -> pid
    problem_list = []
    topics_list = []
    topic_to_id = {}

    def get_topic_id(t_name: str):
        t_clean = t_name.strip()
        if not t_clean:
            return None
        if t_clean not in topic_to_id:
            tid = len(topics_list)
            topic_to_id[t_clean] = tid
            topics_list.append(t_clean)
        return topic_to_id[t_clean]

    company_records = {}
    company_meta = []
    # Track per-problem company frequency & 30-day presence
    problem_comp_freq = defaultdict(dict)  # pid -> {comp_name: max_freq}
    problem_30d_score = Counter()

    for comp in companies:
        comp_dir = os.path.join(workspace, comp)
        comp_timeframes = {}
        tf_counts = {}

        for csv_name, tf_key in timeframe_map.items():
            csv_path = os.path.join(comp_dir, csv_name)
            rows = []
            if os.path.exists(csv_path):
                with open(csv_path, "r", encoding="utf-8", errors="ignore") as f:
                    reader = csv.DictReader(f)
                    for r in reader:
                        title = r.get("Title", "").strip()
                        if not title:
                            continue

                        diff_raw = r.get("Difficulty", "").strip().upper()
                        diff_code = 1 if "EASY" in diff_raw else (2 if "MEDIUM" in diff_raw else 3)

                        link = r.get("Link", "").strip()
                        slug = link.replace("https://leetcode.com/problems/", "").strip("/")
                        if not slug:
                            slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")

                        raw_topics = [t.strip() for t in r.get("Topics", "").split(",") if t.strip()]
                        topic_ids = []
                        for t in raw_topics:
                            tid = get_topic_id(t)
                            if tid is not None and tid not in topic_ids:
                                topic_ids.append(tid)

                        try:
                            ac = round(float(r.get("Acceptance Rate", 0)) * 10000, 1)
                        except (ValueError, TypeError):
                            ac = 0.0

                        try:
                            freq = round(float(r.get("Frequency", 0)), 1)
                        except (ValueError, TypeError):
                            freq = 0.0

                        if title not in problem_map:
                            pid = len(problem_list)
                            problem_map[title] = pid
                            problem_list.append({
                                "id": pid,
                                "title": title,
                                "diff": diff_code,
                                "slug": slug,
                                "topics": topic_ids,
                                "ac": ac,
                                "companies": set(),
                            })
                        else:
                            pid = problem_map[title]
                            if problem_list[pid]["ac"] == 0 and ac > 0:
                                problem_list[pid]["ac"] = ac
                            existing_topics = set(problem_list[pid]["topics"])
                            for tid in topic_ids:
                                if tid not in existing_topics:
                                    problem_list[pid]["topics"].append(tid)
                                    existing_topics.add(tid)

                        problem_list[pid]["companies"].add(comp)
                        prev_f = problem_comp_freq[pid].get(comp, -1.0)
                        if freq > prev_f:
                            problem_comp_freq[pid][comp] = freq
                        if tf_key == "30d":
                            problem_30d_score[pid] += 100.0 + freq

                        rows.append([pid, freq])

            comp_timeframes[tf_key] = rows
            tf_counts[tf_key] = len(rows)

        # Compute per-company difficulty split & top topics from 'all'
        all_rows = comp_timeframes.get("all", [])
        diff_split = [0, 0, 0]
        comp_topic_counter = Counter()
        for pid, _ in all_rows:
            p = problem_list[pid]
            diff_split[p["diff"] - 1] += 1
            for tid in p["topics"]:
                comp_topic_counter[tid] += 1

        top_topics = [tid for tid, _ in comp_topic_counter.most_common(4)]

        company_records[comp] = comp_timeframes
        company_meta.append({
            "name": comp,
            "total": tf_counts.get("all", 0),
            "counts": tf_counts,
            "diff": diff_split,
            "topTopics": top_topics,
            "tier": classify_tier(comp),
        })

    # Sort company_meta by total descending, then name ascending
    company_meta.sort(key=lambda x: (-x["total"], x["name"].lower()))
    company_to_meta_idx = {c["name"]: idx for idx, c in enumerate(company_meta)}

    # Build compact problem tuples:
    # [title, diff (1/2/3), slug, [topic_ids], ac, company_count, [top_company_meta_indices]]
    compact_problems = []
    global_diff_counts = [0, 0, 0]
    for p in problem_list:
        pid = p["id"]
        global_diff_counts[p["diff"] - 1] += 1
        comp_freqs = problem_comp_freq[pid]
        # Rank companies asking this problem by frequency desc, then company total desc
        ranked_comps = sorted(
            comp_freqs.items(),
            key=lambda kv: (-kv[1], company_to_meta_idx[kv[0]])
        )
        top_comp_indices = [company_to_meta_idx[c] for c, _ in ranked_comps[:6]]
        compact_problems.append([
            p["title"],
            p["diff"],
            p["slug"],
            p["topics"],
            p["ac"],
            len(p["companies"]),
            top_comp_indices,
        ])

    # Topic problem counts
    topic_counts = Counter()
    for p in problem_list:
        for tid in p["topics"]:
            topic_counts[tid] += 1

    sorted_topics = [
        {"id": i, "name": name, "count": topic_counts[i]}
        for i, name in enumerate(topics_list)
    ]
    sorted_topics.sort(key=lambda x: (-x["count"], x["name"]))

    featured_companies = [
        "Google", "Amazon", "Meta", "Microsoft", "Bloomberg",
        "Uber", "Apple", "Netflix", "TikTok", "Oracle",
        "Goldman Sachs", "Citadel", "LinkedIn", "Salesforce",
        "Adobe", "Nvidia", "Snowflake", "Flipkart", "PhonePe",
        "DE Shaw", "PayPal", "Walmart Labs", "Cisco", "IBM"
    ]

    # Exact-matched roadmap clusters with dependency DAG metadata
    roadmap_defs = [
        {
            "id": "arrays",
            "name": "Arrays & Hashing",
            "tier": 1,
            "deps": [],
            "desc": "Hash maps, prefix sums, counting arrays, and string pattern basics.",
            "exact": [
                "Hash Table", "Prefix Sum", "Counting", "String", "Array",
                "String Matching", "Rolling Hash", "Hash Function",
                "Boyer–Moore Majority Vote Algorithm", "Boyer–Moore String-Search Algorithm",
                "Knuth–Morris–Pratt Algorithm", "Z Algorithm", "Manacher"
            ],
        },
        {
            "id": "two_pointers",
            "name": "Two Pointers",
            "tier": 2,
            "deps": ["arrays"],
            "desc": "Opposite-direction convergence and slow/fast scanning on sorted or linear arrays.",
            "exact": ["Two Pointers"],
        },
        {
            "id": "stack",
            "name": "Stack & Queue",
            "tier": 2,
            "deps": ["arrays"],
            "desc": "LIFO/FIFO mechanics, monotonic stacks/deques, and expression parsing.",
            "exact": ["Stack", "Monotonic Stack", "Queue", "Monotonic Queue", "Bracket Sequences"],
        },
        {
            "id": "binary_search",
            "name": "Binary Search",
            "tier": 3,
            "deps": ["two_pointers"],
            "desc": "Logarithmic space halving, rotated arrays, and binary search on answer.",
            "exact": ["Binary Search", "Ternary Search"],
        },
        {
            "id": "sliding_window",
            "name": "Sliding Window",
            "tier": 3,
            "deps": ["two_pointers"],
            "desc": "Fixed and dynamic subarray/substring windows with O(n) state tracking.",
            "exact": ["Sliding Window"],
        },
        {
            "id": "linked_list",
            "name": "Linked List",
            "tier": 3,
            "deps": ["two_pointers"],
            "desc": "In-place pointer reversal, dummy heads, cycle detection, and LRU structures.",
            "exact": ["Linked List", "Doubly-Linked List", "Floyd's Cycle Finding Algorithm"],
        },
        {
            "id": "trees",
            "name": "Trees & BST",
            "tier": 4,
            "deps": ["binary_search", "linked_list"],
            "desc": "DFS/BFS traversals, BST invariants, LCA, segment trees, and Fenwick trees.",
            "exact": [
                "Tree", "Binary Tree", "Binary Search Tree", "Lowest Common Ancestor",
                "Binary Lifting", "Cartesian Tree", "Segment Tree", "Binary Indexed Tree",
                "Sparse Table", "Range Minimum/Maximum Query", "Sqrt Decomposition"
            ],
        },
        {
            "id": "tries",
            "name": "Tries & Suffixes",
            "tier": 5,
            "deps": ["trees"],
            "desc": "Prefix trees, autocomplete dictionaries, suffix arrays, and Aho–Corasick.",
            "exact": ["Trie", "Suffix Tree", "Suffix Array", "Suffix Automaton", "Aho–Corasick Algorithm"],
        },
        {
            "id": "heap",
            "name": "Heap / Priority Queue",
            "tier": 5,
            "deps": ["trees"],
            "desc": "Top-K selection, k-way merge, median streams, and scheduling.",
            "exact": ["Heap (Priority Queue)", "Heap", "Data Stream", "Ordered Set"],
        },
        {
            "id": "backtracking",
            "name": "Backtracking & Recursion",
            "tier": 5,
            "deps": ["trees"],
            "desc": "Combinatorial search, pruning state trees, and divide-and-conquer.",
            "exact": ["Backtracking", "Recursion", "Divide and Conquer"],
        },
        {
            "id": "graphs",
            "name": "Graphs",
            "tier": 6,
            "deps": ["backtracking", "heap"],
            "desc": "BFS, DFS, connected components, topological sort, and bipartite checks.",
            "exact": [
                "Graph Theory", "Breadth-First Search", "Depth-First Search",
                "Topological Sort", "Directed Acyclic Graph", "Bipartite Graph",
                "Graph Coloring", "0-1 BFS"
            ],
        },
        {
            "id": "dp",
            "name": "Dynamic Programming",
            "tier": 6,
            "deps": ["backtracking"],
            "desc": "State transitions, memoization, knapsack variants, LIS/LCS, and tree DP.",
            "exact": [
                "Dynamic Programming", "Memoization", "Longest Increasing Subsequence",
                "Longest Common Subsequence", "Knapsack Problem", "0-1 Knapsack",
                "Complete Knapsack", "Mixed Knapsack", "Multiple Knapsack", "DP on Trees"
            ],
        },
        {
            "id": "greedy",
            "name": "Greedy",
            "tier": 6,
            "deps": ["heap"],
            "desc": "Locally optimal choices, exchange arguments, and interval scheduling.",
            "exact": ["Greedy"],
        },
        {
            "id": "adv_graphs",
            "name": "Advanced Graphs",
            "tier": 7,
            "deps": ["graphs"],
            "desc": "Union-Find, Dijkstra, Bellman-Ford, MST, SCC, and network flows.",
            "exact": [
                "Union-Find", "Shortest Path", "Dijkstra's Algorithm",
                "Bellman–Ford Algorithm", "Floyd–Warshall Algorithm",
                "Minimum Spanning Tree", "Prim's Algorithm", "Kruskal's Algorithm",
                "Borůvka's Algorithm", "Eulerian Circuit", "Eulerian Path",
                "Strongly Connected Component", "Tarjan's SCC Algorithm",
                "Kosaraju's Algorithm", "Bridge (Graph)", "Articulation Point",
                "Flow Network", "Maximum Flow", "Minimum-Cost Flow", "Dinic's Algorithm"
            ],
        },
        {
            "id": "matrix",
            "name": "Matrix & Grids",
            "tier": 7,
            "deps": ["dp", "graphs"],
            "desc": "2D traversals, grid dynamic programming, and in-place rotations.",
            "exact": ["Matrix"],
        },
        {
            "id": "intervals",
            "name": "Intervals & Sorting",
            "tier": 7,
            "deps": ["greedy"],
            "desc": "Interval merging, sweep line events, custom comparators, and quickselect.",
            "exact": [
                "Sweep Line", "Sorting", "Merge Sort", "Quicksort", "Quickselect",
                "Bucket Sort", "Counting Sort", "Radix Sort", "Sort"
            ],
            "title_keywords": ["interval", "meeting room", "calendar"],
        },
        {
            "id": "bit",
            "name": "Bit Manipulation",
            "tier": 7,
            "deps": ["arrays"],
            "desc": "Bitwise masks, XOR identities, subset DP, and bit-level arithmetic.",
            "exact": ["Bit Manipulation", "Bitmask"],
        },
        {
            "id": "math",
            "name": "Math & Geometry",
            "tier": 7,
            "deps": ["bit"],
            "desc": "Modular arithmetic, primes, combinatorics, geometry, and game theory.",
            "exact": [
                "Math", "Geometry", "Combinatorics", "Number Theory",
                "Probability and Statistics", "Game Theory", "Minimax", "Nim Game",
                "Linear Algebra", "Greatest Common Divisor", "Prime Factorization",
                "Sieve Theory", "Convex Hull", "Enumeration"
            ],
        },
        {
            "id": "design",
            "name": "Design, SQL & Sim",
            "tier": 7,
            "deps": ["stack", "heap"],
            "desc": "Data structure design, state machines, simulation, SQL, and concurrency.",
            "exact": [
                "Design", "Simulation", "Interactive", "Iterator",
                "Database", "Concurrency", "Shell", "Randomized", "Brainteaser"
            ],
        },
    ]

    # Precompute Curated Study Plans directly from real CSV metrics
    all_pids = list(range(len(problem_list)))

    # 1. Top 50 Most Asked Across All Companies
    top50_pids = sorted(
        all_pids,
        key=lambda pid: (-len(problem_list[pid]["companies"]), -problem_30d_score[pid], pid)
    )[:50]

    # 2. 30-Day Hot Interview Sprint (highest 30d company count + frequency)
    hot30_pids = sorted(
        [pid for pid in all_pids if problem_30d_score[pid] > 0],
        key=lambda pid: (-problem_30d_score[pid], -len(problem_list[pid]["companies"]), pid)
    )[:75]

    # 3. FAANG & Big Tech Core 100
    faang_scores = Counter()
    for comp in MAANG_COMPANIES:
        recs = company_records.get(comp, {})
        for pid, freq in recs.get("all", []):
            faang_scores[pid] += 50.0 + freq
        for pid, freq in recs.get("3m", []):
            faang_scores[pid] += 40.0 + freq
        for pid, freq in recs.get("30d", []):
            faang_scores[pid] += 60.0 + freq
    faang100_pids = sorted(
        faang_scores.keys(),
        key=lambda pid: (-faang_scores[pid], -len(problem_list[pid]["companies"]), pid)
    )[:100]

    # 4. Quant & HFT Essentials (50)
    quant_scores = Counter()
    for comp in QUANT_FINANCE_COMPANIES:
        recs = company_records.get(comp, {})
        for pid, freq in recs.get("all", []):
            quant_scores[pid] += 50.0 + freq
        for pid, freq in recs.get("3m", []):
            quant_scores[pid] += 40.0 + freq
    quant50_pids = sorted(
        quant_scores.keys(),
        key=lambda pid: (-quant_scores[pid], -len(problem_list[pid]["companies"]), pid)
    )[:50]

    # 5. Balanced Pattern Foundations (~75 problems across all core roadmap nodes)
    foundations_pids = []
    seen_found = set()
    for r in roadmap_defs[:18]:
        tids = {topic_to_id[t] for t in r["exact"] if t in topic_to_id}
        kws = r.get("title_keywords", [])
        candidates = [
            pid for pid in all_pids
            if (any(tid in problem_list[pid]["topics"] for tid in tids)
                or (kws and any(k in problem_list[pid]["title"].lower() for k in kws)))
            and pid not in seen_found
        ]
        # Prefer top-frequency Easy/Medium foundations (4 per topic)
        candidates.sort(key=lambda pid: (
            0 if problem_list[pid]["diff"] <= 2 else 1,
            -len(problem_list[pid]["companies"]),
            pid
        ))
        picked = candidates[:4]
        for pid in picked:
            seen_found.add(pid)
            foundations_pids.append(pid)

    study_plans = [
        {
            "id": "hot30",
            "name": "30-Day Hot Sprint",
            "badge": "Trending",
            "desc": "Top 75 questions actively reported in the last 30 days across all companies.",
            "pids": hot30_pids,
        },
        {
            "id": "top50",
            "name": "Top 50 Universal",
            "badge": "High ROI",
            "desc": "The 50 problems asked by the broadest set of companies overall.",
            "pids": top50_pids,
        },
        {
            "id": "faang100",
            "name": "Big Tech Core 100",
            "badge": "MAANG",
            "desc": "100 high-signal problems weighted across Google, Amazon, Meta, Microsoft, Apple, Uber & Nvidia.",
            "pids": faang100_pids,
        },
        {
            "id": "quant50",
            "name": "Quant & Finance 50",
            "badge": "HFT",
            "desc": "50 core algorithmic challenges favored by Citadel, Jane Street, Two Sigma, DE Shaw & Goldman.",
            "pids": quant50_pids,
        },
        {
            "id": "foundations",
            "name": "Pattern Foundations",
            "badge": "Roadmap",
            "desc": "Balanced starter track selecting top Easy/Medium essentials from all 18 core patterns.",
            "pids": foundations_pids,
        },
    ]

    active_companies = sum(1 for c in company_meta if c["total"] > 0)

    bundle = {
        "topics": topics_list,
        "topicMeta": sorted_topics,
        "problems": compact_problems,
        "companies": company_records,
        "companyMeta": company_meta,
        "featured": featured_companies,
        "roadmaps": roadmap_defs,
        "studyPlans": study_plans,
        "stats": {
            "totalCompanies": len(companies),
            "activeCompanies": active_companies,
            "totalProblems": len(compact_problems),
            "totalTopics": len(topics_list),
            "diffCounts": global_diff_counts,
            "hot30Problems": len(problem_30d_score),
        },
    }

    js_output_path = os.path.join(workspace, "assets", "dsa-data.js")
    with open(js_output_path, "w", encoding="utf-8") as f:
        f.write("window.DSA_DATA = ")
        json.dump(bundle, f, separators=(",", ":"))
        f.write(";\n")

    js_size = os.path.getsize(js_output_path) / (1024 * 1024)
    print(f"Successfully generated {js_output_path} ({js_size:.2f} MB)")
    print(
        f"Stats: {len(compact_problems)} problems across {active_companies}/{len(companies)} active companies and {len(topics_list)} topics."
    )


if __name__ == "__main__":
    main()
