# CAPSTONE PROJECT DEFENSE PRESENTATION
# Autonomous Warehouse Robot Path Planning & Collision Avoidance Simulator

- **Course / Degree:** Bachelor / Master of Technology in Computer Science & Engineering / Robotics
- **Focus Area:** Multi-Agent Path Finding (MAPF), Discrete Space-Time Optimization, Industrial Intralogistics
- **System Title:** Warehouse Control System (WCS) Prototype
- **Repository Location:** `C:\Users\Jeet\.gemini\antigravity\scratch\warehouse-robot-simulator`
- **Presentation Format:** 15 Comprehensive Engineering Defense Slides

---

## Slide 1: Title & Project Overview

```
══════════════════════════════════════════════════════════════════════════════
    AUTONOMOUS WAREHOUSE ROBOT PATH PLANNING & COLLISION AVOIDANCE SIMULATOR
              A Space-Time Cooperative Multi-Agent Coordination Platform
══════════════════════════════════════════════════════════════════════════════
```

- **Project Core:** Deterministic algorithmic simulation platform for fleets of Autonomous Guided Vehicles (AGVs) operating in automated warehouse grid environments.
- **Key Algorithmic Pillars:**
  - Optimal single-agent $A^*$ path planning with admissible Manhattan distance heuristic.
  - Multi-agent Space-Time Cooperative $A^*$ ($CA^*$) in discrete 3D configuration space $(x, y, t)$.
  - Hash-indexed 3D Reservation Tables (Vertex, Directional Edge-Swap, Permanent Goal).
  - Runtime hardware-level Collision Management with stationary right-of-way and cascading yields.
  - Wait-For Graph (WFG) cycle detection via Depth-First Search with priority aging recovery.
  - Real-time dynamic obstacle detection and localized route repair.
- **Technology Stack:** React 18, TypeScript, HTML5 Canvas (High-DPI rendering), Recharts analytics, Vitest automated testing suite.

---

## Slide 2: Problem Statement & Industrial Motivation

- **Industrial Context:**
  Modern automated distribution centers (e.g., Amazon Robotics, Ocado Hive) deploy dozens of AGVs on dense, orthogonal grid networks.
- **The Core Problem (MAPF):**
  Given $K$ agents with initial positions $\{s_1, \dots, s_K\}$ and destination stations $\{g_1, \dots, g_K\}$, find a set of collision-free paths $\{\pi_1, \dots, \pi_K\}$ that minimizes travel time without spatial or temporal interference.
- **Why Classical Single-Agent Pathfinding Fails:**
  - Single-agent $A^*$ and Dijkstra ignore other vehicles.
  - Results in head-on collisions in single-lane aisles, gridlock at 4-way intersections, and mutual blocking at shared loading bays.
- **Project Solution:**
  A tiered coordination framework combining predictive space-time reservations with runtime collision management and graph-theoretic deadlock recovery.

---

## Slide 3: Warehouse Operational Environment & Topology

- **Lattice Dimensions:** Discrete $20 \times 14$ grid ($280$ total cells).
- **Physical Layout Breakdown:**
  - **Traversable Aisles:** $\approx 192$ traversable transit cells.
  - **Storage Shelves:** Modular rack blocks separated by 1-cell aisles.
  - **Inbound Receiving Bays (Pickup):** 3 dedicated stations ($P_1, P_2, P_3$) along the west perimeter ($x=1$).
  - **Outbound Packing Bays (Delivery):** 3 dedicated stations ($D_1, D_2, D_3$) along the east perimeter ($x=18$).
  - **Perimeter Boundaries:** Surrounding safety walls preventing out-of-bounds traversal.
- **Robot Kinematics:**
  - 4-connected discrete movement (North, South, East, West).
  - Unit step cost $c = 1.0$. Diagonal movements strictly forbidden.
  - Discrete wait action allowing an AGV to decelerate and hold position in place.

---

## Slide 4: Multi-Tiered System Architecture

```
┌────────────────────────────────────────────────────────┐
│            1. HIGH-LEVEL ORDER DISPATCHER              │
│       Cyclic State Machine: Pickup ──> Delivery        │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│       2. SPACE-TIME COOPERATIVE A* PLANNER             │
│   Prioritized Planning with Accumulated Priority Aging │
│   Hash Reservation Tables (Vertex, Edge, Goal)         │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│         3. ACTIVE HARDWARE COLLISION MANAGER           │
│   Stationary Occupant Right-of-Way (DEF-01)            │
│   Iterative Cascading Yield Propagation (DEF-02)       │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│       4. DEADLOCK DETECTOR & RECOVERY ENGINE           │
│   Wait-For Dependency Graph + DFS Cycle Detection      │
│   Dynamic Obstacle Interception & Local Replanning     │
└────────────────────────────────────────────────────────┘
```

---

## Slide 5: Single-Agent A* Search & Heuristic Optimality

- **Evaluation Function:**
  $$f(n) = g(n) + h(n)$$
- **Manhattan Distance Heuristic:**
  $$h(n) = |x_n - x_G| + |y_n - y_G|$$
- **Admissibility Proof:**
  On a 4-connected unit grid, any physical traversal requires at least $|x_n - x_G| + |y_n - y_G|$ steps. Thus, $h(n) \le d^*(n, G)$ unconditionally.
- **Consistency Proof (Triangle Inequality):**
  For any adjacent cell $w$ adjacent to $u$: $|h(u) - h(w)| \le 1 = c(u, w) \implies h(u) \le c(u, w) + h(w)$.
  Guarantees optimal shortest path without reopening closed nodes.
- **Empirical Validation vs. Dijkstra Baseline:**
  Tested across 3 complex topologies (Obstacle Barrier, Choke-Point Maze, Random Clusters):
  - Path Cost: $Cost(A^*) \equiv Cost(\text{Dijkstra})$ (0.0% error).
  - Search Space Reduction: $A^*$ reduced expanded nodes by **50.6% to 55.2%**.

---

## Slide 6: Space-Time Cooperative A* ($CA^*$) & 3D Expansion

- **State Representation:**
  Elevates 2D planar coordinates into discrete 3D space-time:
  $$s = (x, y, t), \quad t \in [0, T_{\text{horizon}}]$$
- **Discrete Action Set (Branching Factor $b \le 5$):**
  1. North: $(x, y-1, t+1)$, Cost = $1.0$
  2. South: $(x, y+1, t+1)$, Cost = $1.0$
  3. East: $(x+1, y, t+1)$, Cost = $1.0$
  4. West: $(x-1, y, t+1)$, Cost = $1.0$
  5. Wait: $(x, y, t+1)$, Cost = $1.002$ ($+0.002$ tie-break penalty).
- **Search Budget Ceiling:**
  `maxExpandedNodes = 8,000` per robot planning invocation to protect interactive frame rates.

---

## Slide 7: 3D Reservation Table Architecture

Mutual spatial-temporal interference is prevented via three hash-indexed registries:

1. **Vertex Reservation Table:**
   - Hash Key: `"${x},${y}@${t}"` $\to$ `robotId`
   - Prevents two AGVs from occupying the same cell at the identical timestep.
2. **Directional Edge-Swap Reservation Table:**
   - Hash Key: `"${x1},${y1}->${x2},${y2}@${t}"` $\to$ `robotId`
   - When robot $A$ moves $u \to v$ at time $t$, counter-move $v \to u$ at time $t$ is strictly rejected, preventing catastrophic head-on aisle collisions.
3. **Permanent Goal Reservation Table:**
   - Hash Key: `"${xG},${yG}"` $\to t_{\text{arrival}}$
   - When robot $A$ parks at its destination at $t_{\text{arrival}}$, the cell is permanently locked for all $t \ge t_{\text{arrival}}$, preventing transit robots from colliding with stationary AGVs.

---

## Slide 8: Active Collision Management & Yield Cascades

The `CollisionManager` serves as a deterministic runtime safety layer:

- **Stationary Occupant Invariance (DEF-01):**
  Parked or loading vehicles (`from === to`) receive unconditional right-of-way. Moving vehicles cannot displace stationary AGVs, regardless of assigned priority.
- **Cascading Yield Resolution (DEF-02):**
  When lead robot $R_A$ yields and remains at its current cell, any trailing robot $R_B$ targeting $R_A$'s cell is iteratively forced to yield as well via a fixed-point resolution loop:
  ```
  [Robot A Yields] ──> [Cell A Locked] ──> [Robot B Yields] ──> [Cell B Locked]
  ```
  Prevents rear-end multi-vehicle chain collisions in single-lane aisles.

---

## Slide 9: Deadlock Detection & Cycle Inversion

- **Wait-For Graph (WFG) Construction:**
  Directed graph $G_{WF} = (V_{WF}, E_{WF})$ where $|V_{WF}| \le K$.
  Directed edge $(R_i \to R_j)$ indicates robot $R_i$ is waiting for the cell occupied by $R_j$.
- **DFS Cycle Detection:**
  Recursive depth-first search with call-stack tracking identifies cycles in $O(K)$ linear time.
- **Priority Aging & Starvation Mitigation:**
  - Controlled 4-robot circular cycle ($R_1 \to R_2 \to R_3 \to R_4 \to R_1$) verified.
  - Recovery protocol elevates the priority age of the lowest-effective robot by $+15$, invalidates reservations for the cycle, and replans in inverted sequence, successfully dissolving the circular lock.
- **False-Positive Immunity:**
  Transitory single-step waiting behind a moving robot is filtered; deadlock warnings require $\ge 3$ consecutive stalled ticks.

---

## Slide 10: Dynamic Obstacle Detection & Real-Time Replanning

- **In-Flight Sensing:**
  When an obstacle appears on the warehouse floor during active movement:
  1. The system checks future trajectory vectors $[(x_t, y_t), \dots, (x_G, y_G)]$ across all active AGVs.
  2. Robots whose paths intersect the obstacle are immediately halted at their current coordinate.
  3. Future space-time reservations for affected robots are invalidated from the `ReservationTable`.
  4. Cooperative $A^*$ recomputes a conflict-free local detour to the destination.
- **Fleet Invariance:**
  Unaffected robots operating in independent aisles experience zero latency or trajectory disruption (`replanCount = 0`).

---

## Slide 11: Audited Benchmark Methodology

- **Sample Size ($N = 60\text{ runs}$):**
  10 independent reproducible runs for each fleet size $K \in \{1, 2, 4, 6, 8, 10\}$.
- **Experimental Parameters:**
  - Layout: Discrete $20 \times 14$ grid floor.
  - Stations: 3 Inbound Pickup Bays ($P_1, P_2, P_3$), 3 Outbound Delivery Bays ($D_1, D_2, D_3$).
  - Horizon: Fixed 30 simulation clock ticks per run.
  - Search Expansion Budget: `maxExpandedNodes = 8,000`.
- **Reproducibility Guarantee:**
  All run starting positions and initial station targets are deterministically seeded across run indices 1 to 10. Raw telemetry is preserved in `BENCHMARK_RESULTS.csv`.

---

## Slide 12: Empirical Performance Results

*Summary statistics recalculated from all 60 raw benchmark records (verified in `CORRECTED_BENCHMARK_SUMMARY.csv`):*

| Fleet Size | Mean Planning Time (ms) | Median Planning Time (ms) | Max Planning Time (ms) | Mean Expanded Nodes | Mean Path Length (cells) | Mean Snapshot Makespan (t=30) | Mean Fleet Waiting Time | Mean Per-Robot Waiting Time | Total Tasks Completed (10 runs) | Mean Tasks per Run | Run Success Rate (≥1 task) | Initial Batch Planning Failures |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1 AGV** | **0.13 ms** (±0.07) | 0.12 ms | 0.28 ms | **25** | 11.0 | 10.7 ticks | **0.0 ticks** | **0.00 ticks/robot** | **4 tasks** | 0.40 | 40.0% | 0 / 10 (100.0%) |
| **2 AGVs** | **0.28 ms** (±0.11) | 0.26 ms | 0.52 ms | **58** | 12.2 | 16.8 ticks | **0.0 ticks** | **0.00 ticks/robot** | **7 tasks** | 0.70 | 60.0% | 0 / 20 (100.0%) |
| **4 AGVs** | **29.68 ms** (±11.98) | 24.19 ms | 53.53 ms | **8,097** | 13.0 | 17.6 ticks | **0.7 ticks** | **0.17 ticks/robot** | **8 tasks** | 0.80 | 60.0% | 10 / 40 (75.0%) |
| **6 AGVs** | **144.73 ms** (±63.96) | 140.67 ms | 303.22 ms | **20,903** | 12.1 | 17.6 ticks | **1.9 ticks** | **0.32 ticks/robot** | **10 tasks** | 1.00 | 80.0% | 26 / 60 (56.7%) |
| **8 AGVs** | **179.01 ms** (±64.66) | 187.70 ms | 253.54 ms | **28,117** | 10.8 | 18.0 ticks | **10.8 ticks** | **1.35 ticks/robot** | **13 tasks** | 1.30 | 90.0% | 35 / 80 (56.3%) |
| **10 AGVs** | **258.06 ms** (±53.63) | 256.24 ms | 348.41 ms | **39,326** | 10.5 | 17.5 ticks | **43.5 ticks** | **4.35 ticks/robot** | **16 tasks** | 1.60 | 90.0% | 49 / 100 (51.0%) |

---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1 AGV** | **0.23 ms** (±0.33) | 0.13 ms | 1.16 ms | **25** | 11.0 | 10.5 ticks | **0.0 ticks** | **0.00 ticks/robot** | **4 tasks** | 0.40 | 40.0% (4/10) | 0 / 10 (0%) |
| **2 AGVs** | **0.28 ms** (±0.10) | 0.23 ms | 0.48 ms | **58** | 12.2 | 16.7 ticks | **0.0 ticks** | **0.00 ticks/robot** | **7 tasks** | 0.70 | 60.0% (6/10) | 0 / 20 (0%) |
| **4 AGVs** | **29.42 ms** (±12.37) | 23.65 ms | 55.18 ms | **8,097** | 13.0 | 17.7 ticks | **0.7 ticks** | **0.18 ticks/robot** | **8 tasks** | 0.80 | 60.0% (6/10) | 10 / 40 (25%) |
| **6 AGVs** | **124.86 ms** (±33.92) | 141.29 ms | 150.04 ms | **20,903** | 12.1 | 19.1 ticks | **1.9 ticks** | **0.32 ticks/robot** | **10 tasks** | 1.00 | 80.0% (8/10) | 26 / 60 (43%) |
| **8 AGVs** | **169.26 ms** (±61.04) | 170.29 ms | 262.26 ms | **28,117** | 10.8 | 19.4 ticks | **10.9 ticks** | **1.36 ticks/robot** | **13 tasks** | 1.30 | 90.0% (9/10) | 35 / 80 (44%) |
| **10 AGVs** | **262.47 ms** (±80.35) | 243.51 ms | 435.22 ms | **39,326** | 10.5 | 17.4 ticks | **43.5 ticks** | **4.35 ticks/robot** | **16 tasks** | 1.60 | 90.0% (9/10) | 49 / 100 (49%) |

---

## Slide 13: Metric Clarifications & Disambiguation

1. **Initial Batch Planning Failures:**
   Measures robots whose initial space-time search at $t=0$ returned `success: false` due to bay contention. These are **not** permanently failed missions; 0% permanent failures were observed.
2. **Waiting Time: Fleet-Aggregated vs. Per-Robot:**
   Reported as both **Fleet-Aggregated Cumulative Wait Ticks** (sum across all robots) and **Mean Per-Robot Waiting Time** (normalized by fleet size). At $K=10$, each robot waited an average of $4.35\text{ ticks}$ out of $30\text{ ticks}$ ($14.5\%$ idle time).
3. **Snapshot Makespan:**
   Evaluated at tick 30 as $\max_{r \in \text{ActiveRobots}} (|\pi_r| - \text{index}_r)$, representing maximum remaining travel distance among active paths at simulation termination. It is an operational snapshot metric under continuous dispatching, distinct from classical offline MAPF makespan.
4. **Task Completion Metrics:**
   Distinguishes **Cumulative Completed Tasks** across 10 runs (16 tasks at $K=10$), **Mean Tasks per Run** (1.60 tasks/run at $K=10$), and **Run Success Rate** (90.0% of runs completing $\ge 1$ task).

---

## Slide 14: Station Resource Contention & Experimental Limitations

- **Physical Bottleneck (Pigeonhole Saturation):**
  - Warehouse contains only 3 pickup bays ($P_1, P_2, P_3$).
  - Dispatching $K \ge 4$ AGVs forces multiple vehicles to contest identical coordinates.
  - Lower-priority vehicles exhaust the 8,000-node search cutoff, safely transition to `WAITING`, and replan once the leading vehicle departs.
- **Spatial Queueing vs. "Percolation Barriers":**
  - Confined aisles and aisle mouths cause temporary localized queueing.
  - Waiting time rises to $4.35\text{ ticks/robot}$ at $K=10$.
- **Academic Experimental Boundaries:**
  - Evaluated on a $20 \times 14$ grid with up to 10 AGVs over a 30-tick window.
  - Prioritized Planning is theoretically incomplete; priority aging provides empirical robustness, but does not guarantee universal starvation freedom across arbitrary infinite graphs.
  - No deterministic "sub-second guarantee" (observed maximum was $435.22\text{ ms}$; empirical $3\sigma$ tail extends to $503.52\text{ ms}$).

---

## 15. Conclusion & Enterprise Scalability Extensions

- **Summary of Achievements:**
  - Working, verified, deterministic multi-agent warehouse simulator.
  - 100% pass rate across 11 test suites and 33 automated tests.
  - Rigorous statistical audit resolving prior unit ambiguities.
- **Enterprise Scaling Extensions (100+ AGVs):**
  1. *Directional Aisle Engineering (Highways):* One-way rack aisles eliminate head-on edge swaps by design.
  2. *Windowed Hierarchical Cooperative A* (WHCA*):* Rolling time window $w \in [t, t+16]$ bounds memory consumption.
  3. *Conflict-Based Search (CBS / ECBS):* Two-level conflict tree search guarantees Pareto-optimal makespan coordination for dense hubs.
- **Defense Q&A:**
  *Thank you. We welcome questions from the defense committee.*

---

## Deliverables Link Reference

- Project Report: [PROJECT_REPORT.md](file:///C:/Users/Jeet/.gemini/antigravity/scratch/warehouse-robot-simulator/PROJECT_REPORT.md)
- Presentation Deck: [PROJECT_PRESENTATION.md](file:///C:/Users/Jeet/.gemini/antigravity/scratch/warehouse-robot-simulator/PROJECT_PRESENTATION.md)
- Audited Benchmark Summary: [CORRECTED_BENCHMARK_SUMMARY.csv](file:///C:/Users/Jeet/.gemini/antigravity/scratch/warehouse-robot-simulator/CORRECTED_BENCHMARK_SUMMARY.csv)
- Data Audit: [BENCHMARK_DATA_AUDIT.md](file:///C:/Users/Jeet/.gemini/antigravity/scratch/warehouse-robot-simulator/BENCHMARK_DATA_AUDIT.md)
- Academic Analysis: [BENCHMARK_ANALYSIS.md](file:///C:/Users/Jeet/.gemini/antigravity/scratch/warehouse-robot-simulator/BENCHMARK_ANALYSIS.md)
- Vector Charts & Dashboard: [BENCHMARK_CHARTS/index.html](file:///C:/Users/Jeet/.gemini/antigravity/scratch/warehouse-robot-simulator/BENCHMARK_CHARTS/index.html)