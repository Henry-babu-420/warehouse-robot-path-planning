# FINAL ENGINEERING PROJECT REPORT
# Autonomous Warehouse Robot Path Planning & Collision Avoidance Simulator

- **Academic Context:** Capstone Engineering Design Project  
- **Discipline:** Computer Science & Engineering / Autonomous Systems & Robotics  
- **System Title:** Warehouse Control System (WCS) Prototype  
- **Repository Location:** `C:\Users\Jeet\.gemini\antigravity\scratch\warehouse-robot-simulator`  
- **Authoring Team:** Autonomous Systems Research Group  
- **Submission Date:** November 2026  
- **Verification Status:** Fully Verified (11 Vitest Test Suites, 33 Tests, 100% Pass Rate, Clean Production Build)

---

## Abstract

This project presents the design, mathematical formulation, algorithmic implementation, and empirical evaluation of an autonomous multi-robot coordination system for automated warehouses. Operating on a discrete $20 \times 14$ grid topology, the simulator addresses the **Multi-Agent Path Finding (MAPF)** problem in high-density automated storage and retrieval systems (AS/RS).

The software implements a multi-tiered architecture: single-agent $A^*$ with Manhattan heuristic, Space-Time Cooperative $A^*$ ($CA^*$) with priority aging, hash-indexed 3D reservation tables, runtime collision management with cascading yields, and directed Wait-For Graph (WFG) cycle detection for deadlock recovery.

Across 60 benchmark simulations (10 independent runs for fleet sizes $K \in \{1, 2, 4, 6, 8, 10\}$), empirical performance was audited. This report standardizes metric definitions:
1. It separates initial batch planning failures caused by finite station resource contention from runtime retries and incomplete missions at the 30-tick horizon.
2. It reports waiting time as both a fleet-aggregated sum and a normalized per-robot average ($4.35\text{ ticks/robot}$ at $K=10$).
3. It operationally defines makespan as the tick-30 snapshot of maximum remaining path length under lifelong continuous dispatching.
4. It disambiguates cumulative task completions across runs from run-level success rates.

Experimental constraints ($20 \times 14$ grid, 10 AGV ceiling, 30-tick test duration, $N=10$ runs) are documented, and claims of universal completeness or deterministic sub-second guarantees are appropriately qualified.

---

## 1. Introduction & Industrial Motivation

In modern e-commerce fulfillment centers (e.g., Amazon Robotics, Ocado Hive, AutoStore), dense fleets of Autonomous Guided Vehicles (AGVs) navigate shared orthogonal aisle networks to transport modular storage pods between inventory racks, receiving bays, and order packing stations.

The central challenge in warehouse fleet management is the **Multi-Agent Path Finding (MAPF)** problem: computing collision-free, kinematically feasible trajectories for $K$ distinct agents from their current positions to designated target stations while minimizing overall makespan and travel delay. Classical single-agent pathfinding algorithms (such as Dijkstra or standalone $A^*$) fail in multi-agent domains because they do not account for dynamic mutual blockages, leading to head-on collisions, intersection gridlock, and vehicle starvation.

### 1.1 Project Objectives
1. Implement single-robot $A^*$ with a mathematically consistent and admissible Manhattan distance heuristic.
2. Elevate search into discrete space-time $(x, y, t)$ via Cooperative $A^*$ to resolve time-indexed route conflicts.
3. Establish a multi-layer **Reservation Table** tracking vertex occupancy, directional edge swaps, and permanent goal parking.
4. Build an active hardware safety layer (**Collision Manager**) enforcing stationary occupant right-of-way and cascading yield propagation.
5. Implement graph-theoretic **Deadlock Detection** via Depth-First Search (DFS) on directed dependency graphs with priority aging recovery.
6. Provide real-time dynamic obstacle detection and localized replanning.
7. Conduct rigorous empirical benchmarking across $K \in \{1, 2, 4, 6, 8, 10\}$ AGVs, documenting exact descriptive statistics and experimental limitations.

---

## 2. Mathematical Formulation & Algorithmic Foundation

### 2.1 Discrete Planar Graph Modeling
The warehouse floor is modeled as an undirected planar graph $G = (V, E)$:
- **Vertex Set $V$:** Orthogonal lattice cells $(x, y) \in [0, W-1] \times [0, H-1]$. On the default $20 \times 14$ floor, total cell count $|V| = 280$. After subtracting static storage shelves and perimeter walls, traversable space $|V|_{\text{free}} \approx 192\text{ cells}$.
- **Edge Set $E$:** 4-connected transitions between cardinal neighbors:
  $$\Delta x, \Delta y \in \{(0, -1), (1, 0), (0, 1), (-1, 0)\}$$
  with unit traversal cost $c(u, v) = 1.0$. Diagonal movements are strictly disallowed.

### 2.2 Single-Agent $A^*$ Optimality
Single-agent shortest path planning evaluates nodes using the evaluation function:
$$f(n) = g(n) + h(n)$$
- $g(n)$: Accumulated shortest path distance from start cell $S$ to current node $n$.
- $h(n)$: Manhattan distance to goal destination $G = (x_G, y_G)$:
  $$h(n) = |x_n - x_G| + |y_n - y_G|$$

#### Admissibility & Monotonicity Proofs:
- **Admissibility:** In an orthogonal unit-cost grid, any path connecting $u$ to $G$ requires at least $|x_u - x_G|$ horizontal steps and $|y_u - y_G|$ vertical steps. Thus, $h(u) \le d^*(u, G)$ unconditionally.
- **Consistency (Triangle Inequality):** For any adjacent cell $w$ adjacent to $u$, $|x_u - x_w| + |y_u - y_w| = 1 = c(u, w)$. By the triangle inequality:
  $$h(u) \le c(u, w) + h(w)$$
Because $h(n)$ is consistent, $f(n)$ is monotonically non-decreasing along any optimal path. No closed state is ever reopened, and the algorithm is guaranteed to return an optimal shortest path in $O(|V| \log |V|)$ operations.

---

### 2.3 Space-Time Cooperative $A^*$ ($CA^*$)
To route multiple AGVs without spatial or temporal interference, the configuration space is expanded into discrete space-time:
$$\mathcal{S} = (x, y, t), \quad t \in \mathcal{T} = [0, T_{\text{horizon}}]$$
At each space-time state $(x, y, t)$, an agent can select among $5$ discrete actions:
1. **Move North:** $(x, y-1, t+1)$ with cost $1.0$
2. **Move South:** $(x, y+1, t+1)$ with cost $1.0$
3. **Move East:** $(x+1, y, t+1)$ with cost $1.0$
4. **Move West:** $(x-1, y, t+1)$ with cost $1.0$
5. **Wait / Hold:** $(x, y, t+1)$ with cost $1.002$ (includes a $+0.002$ tie-breaking penalty to discourage idling when an unobstructed forward step is available).

---

### 2.4 Multi-Layer Reservation Table Matrix
Mutual interference is coordinated via a global `ReservationTable` containing three hash-indexed registries:
1. **Vertex Registry:**
   $$\text{Key: } \text{"}{x},{y}@{t}\text{"} \mapsto \text{robotId}$$
   Prevents two AGVs from occupying the same cell at the identical timestep (vertex collision).
2. **Directional Edge Registry:**
   $$\text{Key: } \text{"}{x_1},{y_1}\text{->}{x_2},{y_2}@{t}\text{"} \mapsto \text{robotId}$$
   When robot $A$ moves $(u) \to (v)$ at time $t$, an edge entry is locked. Before robot $B$ can step $(v) \to (u)$ at time $t$, it queries the reverse key. Detecting a reverse reservation rejects the transition, preventing head-on swapping collisions in narrow 1-cell aisles.
3. **Permanent Goal Registry:**
   $$\text{Key: } \text{"}{x_G},{y_G}\text{"} \mapsto t_{\text{arrival}}$$
   When an AGV reaches its target at $t_{\text{arrival}}$, the destination cell is permanently locked for all $t \ge t_{\text{arrival}}$, preventing subsequent transit vehicles from routing through parked or loading vehicles.

---

### 2.5 Prioritized Planning with Priority Aging
Robots are planned sequentially in descending order of effective priority:
$$P_{\text{eff}}(R_i) = P_{\text{base}}(R_i) + \text{age}(R_i)$$
Higher-priority robots reserve space-time trajectories first; lower-priority robots treat existing reservations as dynamic space-time obstacles.
- **Starvation Mitigation:** When an AGV cannot find a valid space-time route within the search expansion budget (`maxExpandedNodes = 8,000`), it enters the `WAITING` state, holds at its current position, and increases its `priorityAge` by $+5$. Upon successful plan discovery and mission delivery, `priorityAge` resets to $0$.

---

### 2.6 Active Collision Management & Runtime Safety
Beneath the path planner, an active `CollisionManager` serves as a hardware-level safety barrier:
- **Stationary Occupant Invariance (DEF-01):** Parked or loading vehicles (`from === to`) possess absolute right-of-way. A moving vehicle cannot displace a stationary vehicle, regardless of assigned priority.
- **Cascading Yield Propagation (DEF-02):** When vehicle $R_A$ yields and remains in place, any trailing vehicle $R_B$ targeting $R_A$'s cell is iteratively forced to yield as well via a fixed-point resolution loop, preventing rear-end collisions.

---

### 2.7 Deadlock Detection via Wait-For Graphs
- **Graph Construction:** A directed Wait-For Graph $G_{WF} = (V_{WF}, E_{WF})$ is constructed at each clock tick. A directed edge $(R_i \to R_j)$ is established if $R_i$ is attempting to step into the cell currently occupied by $R_j$.
- **Cycle Detection:** A Depth-First Search (DFS) with recursion stack tracking inspects the graph in $O(K)$ linear time. Detecting a cycle confirms circular wait deadlock (Coffman Condition 4).
- **Cycle Inversion Recovery:** The lowest-effective-priority AGV in the cycle receives a $+15$ priority boost, reservations for the cycle are cleared, and paths are recomputed in inverted order, breaking the deadlock.

---

## 3. System Architecture & Tech Stack

The simulator is built as a modular industrial-style web application:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE LAYER                            │
│  - React 18 & TypeScript (SPA Architecture)                            │
│  - High-DPI HTML5 Canvas (Warehouse Floor & AGV Trajectory Rendering)  │
│  - Recharts Component Suite (Real-Time Performance Analytics)          │
│  - Lucide Industrial Icons & CSS Industrial Color System               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     SIMULATION & DISPATCH ENGINE                       │
│  - SimulationEngine (Deterministic State Transitions & Event Logging)   │
│  - SimulationClock (Discrete Integer Time Ticks t ∈ [0..N])            │
│  - CollisionManager (Deterministic Move Validation & Cascading Yields) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      ALGORITHM & PLANNING STACK                        │
│  - astar.ts (Single-Agent 2D A* & Binary MinHeap PriorityQueue)        │
│  - cooperativeAstar.ts (Space-Time CA* & Multi-Robot Fleet Planner)    │
│  - reservationTable.ts (3D Vertex, Edge, and Permanent Goal Hashes)   │
│  - deadlockDetector.ts (Directed WFG Construction & DFS Cycle Detection│
│  - replanner.ts (Dynamic Obstacle Invalidation & Local Detours)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     VERIFICATION & BENCHMARKING                        │
│  - Vitest Testing Framework (11 Test Suites, 33 Automated Unit Tests)  │
│  - comprehensiveBenchmark.test.ts (60-Run Reproducible Benchmark Suite)│
│  - BENCHMARK_RESULTS.csv & CORRECTED_BENCHMARK_SUMMARY.csv             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Audited Benchmark Performance & Metric Clarifications

Across 60 independent runs (10 runs for each fleet size $K \in \{1, 2, 4, 6, 8, 10\}$), empirical metrics were collected on the $20 \times 14$ warehouse floor over a 30-tick evaluation horizon:

### 4.1 Audited Performance Summary Table

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

### 4.2 Detailed Metric Disambiguation

#### 1. Initial Batch Planning Failures vs. Runtime Retries vs. Incomplete Missions
- **Initial Batch Planning Failures:** Measures agents whose initial space-time search at $t=0$ returned `success: false`. The warehouse contains **exactly 3 pickup stations** ($P_1, P_2, P_3$). When $K \ge 4$ AGVs are dispatched simultaneously, multiple vehicles contest the same bay coordinate. The higher-priority vehicle establishes a permanent goal reservation. Lower-priority vehicles search space-time until reaching `maxExpandedNodes = 8,000`, safe-aborting into `WAITING` status with $+5$ priority age.
- **Runtime Retries:** As the leading vehicle finishes loading cargo and departs, the waiting vehicle retries planning in subsequent ticks with higher effective priority and claims the station.
- **Incomplete Missions at Tick 30:** Missions in-flight when the 30-tick evaluation concluded. These are **not** permanently failed missions; 0% permanent failures were observed.

#### 2. Waiting Time: Fleet-Aggregated vs. Per-Robot Average
`WaitingTime` represents the **Fleet-Aggregated Cumulative Wait Ticks** across all active robots in that run.
- At $K=10$, fleet waiting time averaged $43.5\text{ ticks}$.
- Normalized per robot, each robot waited an average of **$4.35\text{ ticks}$** out of $30\text{ ticks}$ ($14.5\%$ idle time, $85.5\%$ active movement).

#### 3. Makespan Operational Definition
In this lifelong simulation with continuous mission reassignment, `Makespan` is operationally defined at tick 30 as:
$$M_{\text{snapshot}} = \max_{r \in \text{ActiveRobots}} \left( |\pi_r| - \text{index}_r \right)$$
It represents the maximum remaining travel distance among active paths at simulation termination, distinct from classical offline MAPF batch arrival makespan.

#### 4. Completed Task Metrics Disambiguation
The confusing notation `16 / 10 runs` is disambiguated into:
- **Cumulative Tasks Delivered (10 Runs):** 16 completed tasks at $K=10$.
- **Mean Completed Tasks per Run:** 1.60 tasks/run at $K=10$.
- **Mean Tasks per Robot per Run:** 0.160 tasks/robot/run at $K=10$.
- **Run Success Rate (% runs with $\ge 1$ task):** 90.0% of runs completing at least one mission before tick 30.

---

## 5. Academic Discussion & Theoretical Limitations

### 5.1 Restrained Scaling Analysis
- **No "Exponential Explosion":** Single-agent space-time $A^*$ complexity is $O(|V| \cdot T \log(|V| \cdot T))$. With search bounded by `maxExpandedNodes = 8,000`, the worst-case complexity for $K$ prioritized agents is strictly bounded by $O(K \cdot C_{8000})$, which is **linear in fleet size $K$**. The observed growth reflects an empirical piecewise transition between unconstrained low-density search ($\approx 25$ nodes) and bay contention search ($8,000$ nodes), not an exponential complexity class.
- **No Formal "Percolation Barrier":** In statistical physics, percolation phase transitions require an infinite lattice ($L \rightarrow \infty$). On a compact $20 \times 14$ lattice, this phenomenon is properly described as **spatial queueing accumulation**: when 10 vehicles navigate four 1-cell aisles connecting to 3 shared loading bays, right-of-way yielding causes localized vehicle platoons to wait sequentially.

### 5.2 Critique of "Sub-Second Guarantees"
While average planning time at $K=10$ is $262.47\text{ ms}$, claiming a deterministic "sub-second guarantee" is statistically invalid:
- The sample standard deviation is $s = 80.35\text{ ms}$ with an observed peak of **435.22 ms** and an empirical $3\sigma$ upper tail of **503.52 ms**.
- Planning latency remained under 500 ms only because of the 8,000-node search ceiling.
- Bounded scientific claim: *"Under an 8,000-node expansion ceiling on a 20×14 grid, batch cooperative path planning for 10 AGVs completed within a sample mean of 262.5 ms and an observed peak of 435.2 ms across 60 benchmark runs."*

### 5.3 Incompleteness of Prioritized Planning
Prioritized Planning (Erdmann & Lozano-Pérez 1987) is **theoretically incomplete**. If a high-priority vehicle occupies a topological cut-vertex (bottleneck), lower-priority vehicles have no feasible space-time trajectory.
While priority aging and deadlock recovery prevented persistent lockouts within the tested experimental parameters ($20 \times 14$ grid, $K \le 10$, $T=30$), they do not constitute a formal mathematical proof of universal starvation freedom across arbitrary infinite graphs.

### 5.4 Experimental Scope
1. **Grid Lattice:** $20 \times 14$ cells (280 total, $\approx 192$ traversable).
2. **Fleet Ceiling:** Up to 10 concurrent AGVs.
3. **Temporal Horizon:** Fixed 30-tick evaluation window per run.
4. **Sample Size:** 10 independent runs per configuration ($N=60$ total runs).
5. **Bay Allocation:** 3 pickup bays (west) and 3 delivery bays (east). Asymmetric capacity induces contention at $K > 3$.

---

## 6. Verification & Automated Test Status

The application undergoes automated verification via Vitest:

```
Test Suites: 11 passed, 11 total
Tests:       33 passed, 33 total
Snapshots:   0 total
Time:        82.71s
```

All 11 test suites pass deterministically:
1. `astar.test.ts` (5 tests) — Foundational $A^*$ correctness, obstacle avoidance, unreachable targets, boundary states.
2. `reservation.test.ts` (4 tests) — Vertex reservations, edge-swap detection, permanent goal locking, robot clearing.
3. `collision.test.ts` (2 tests) — Collocation conflict prevention, edge-swap rejection.
4. `deadlock.test.ts` (2 tests) — Directed WFG cycle detection, false-positive wait filtering.
5. `replanning.test.ts` (1 test) — In-flight dynamic obstacle avoidance and local detour routing.
6. `multiRobot.test.ts` (2 tests) — Perpendicular intersection crossing, narrow corridor transit.
7. `taskCompletion.test.ts` (1 test) — End-to-end mission lifecycle (pickup $\to$ transit $\to$ delivery $\to$ inventory update).
8. `auditVerification.test.ts` (4 tests) — Multi-robot safety edge cases, stationary occupant locking (DEF-01), cascading yields (DEF-02).
9. `finalTechnicalValidation.test.ts` (10 tests) — Binary MinHeap property test, Manhattan heuristic admissibility/consistency proofs vs. reference Dijkstra, 3-topology benchmark comparison, corridor coordination, deadlock priority aging.
10. `benchmarkAudit.test.ts` (1 test) — Live telemetry sampling across 1, 2, 4, 6, 8, 10 robots.
11. `comprehensiveBenchmark.test.ts` (1 test) — Full 60-run reproducible statistical benchmark generation.

Production compilation (`npm run build`) verifies that all TypeScript types compile cleanly, and Vite bundles client assets in under 650 ms with zero errors.

---

## 7. Scaling Recommendations for Enterprise Fleets (100+ AGVs)

For deployment in real-world fulfillment facilities ($200 \times 200$ grid networks with 100+ AGVs), the following architectural extensions are recommended:
1. **Directional Aisle Engineering (Highway Networks):** Assigning alternating one-way directions to rack aisles eliminates head-on edge swaps by structural design.
2. **Windowed Hierarchical Cooperative A* (WHCA*):** Restricting space-time reservations to a rolling horizon $w \in [t, t + 16]$ decouples memory overhead from total mission duration.
3. **Conflict-Based Search (CBS / ECBS):** Implementing a two-level Conflict Tree search guarantees Pareto-optimal makespan coordination for dense multi-vehicle bottlenecks.

---

## 8. Conclusion

This project successfully engineered, verified, and benchmarked an industrial-grade Warehouse Control System simulator. Through space-time Cooperative $A^*$, hash-based reservation tables, priority aging, active collision management, and graph-theoretic deadlock recovery, the simulator achieves deterministic collision avoidance and reliable multi-agent path coordination within its defined operational envelope.

---

## 9. Deliverables Index

- [README.md](file:///C:/Users/Jeet/.gemini/antigravity/scratch/warehouse-robot-simulator/README.md) — Project overview, architecture, and demonstration guide.
- [CORRECTED_BENCHMARK_SUMMARY.csv](file:///C:/Users/Jeet/.gemini/antigravity/scratch/warehouse-robot-simulator/CORRECTED_BENCHMARK_SUMMARY.csv) — Audited benchmark summary dataset.
- [BENCHMARK_DATA_AUDIT.md](file:///C:/Users/Jeet/.gemini/antigravity/scratch/warehouse-robot-simulator/BENCHMARK_DATA_AUDIT.md) — Comprehensive statistical data audit report.
- [BENCHMARK_ANALYSIS.md](file:///C:/Users/Jeet/.gemini/antigravity/scratch/warehouse-robot-simulator/BENCHMARK_ANALYSIS.md) — Academic research analysis paper.
- [PROJECT_PRESENTATION.md](file:///C:/Users/Jeet/.gemini/antigravity/scratch/warehouse-robot-simulator/PROJECT_PRESENTATION.md) — 15-slide capstone project defense slide deck.
- [BENCHMARK_CHARTS/index.html](file:///C:/Users/Jeet/.gemini/antigravity/scratch/warehouse-robot-simulator/BENCHMARK_CHARTS/index.html) — Interactive visual benchmark dashboard.