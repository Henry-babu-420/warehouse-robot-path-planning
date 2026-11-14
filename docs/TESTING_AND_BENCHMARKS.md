# Automated Testing & Empirical Benchmark Methodology

**Autonomous Warehouse Robot Path Planning & Collision Avoidance Simulator**  
*College Project Verification Matrix & Experimental Performance Report*

---

## 1. Testing Framework & Execution Commands

The simulation suite uses **Vitest** for fast, deterministic unit, integration, and algorithmic stress testing.

### 1.1 Test Execution Commands

```bash
# 1. Run the entire automated test suite
npm test

# 2. Run focused algorithmic unit tests
npx vitest run src/tests/astar.test.ts
npx vitest run src/tests/reservation.test.ts
npx vitest run src/tests/collision.test.ts
npx vitest run src/tests/deadlock.test.ts
npx vitest run src/tests/replanning.test.ts

# 3. Run multi-agent and system integration tests
npx vitest run src/tests/multiRobot.test.ts
npx vitest run src/tests/taskCompletion.test.ts
npx vitest run src/tests/prototypeDemonstration.test.ts
npx vitest run src/tests/quickCriticalValidation.test.ts
npx vitest run src/tests/screenshotReviewVerification.test.ts

# 4. Run the 60-run statistical benchmark suite
npx vitest run src/tests/comprehensiveBenchmark.test.ts

# 5. Run 500-tick continuous multi-seed data integrity audit
npx vitest run src/tests/finalExperimentalConsistencyAudit.test.ts
```

---

## 2. Verified Test Suite Matrix

Across all modules, the system implements 20 automated test suites covering single-agent optimality, multi-agent space-time reservations, collision invariants, and full end-to-end task lifecycles:

| Test Suite File | Tested Functional Area | Test Cases | Execution Status |
| :--- | :--- | :---: | :---: |
| `astar.test.ts` | Single-robot $A^*$, Manhattan heuristic, boundary rejection | 5 | **PASS** |
| `reservation.test.ts` | Vertex, directed edge-swap, and permanent goal reservations | 4 | **PASS** |
| `collision.test.ts` | Hardware-level conflict prevention and rejection counter | 2 | **PASS** |
| `deadlock.test.ts` | Wait-for dependency graph construction and DFS cycle finding | 2 | **PASS** |
| `replanning.test.ts` | Dynamic obstacle detection, localized invalidation, detour reroute | 1 | **PASS** |
| `multiRobot.test.ts` | Cooperative $A^*$ in space-time $(x, y, t)$ with in-place wait actions | 2 | **PASS** |
| `taskCompletion.test.ts` | Multi-phase logistics mission lifecycle (Pickup $\to$ Delivery) | 1 | **PASS** |
| `auditVerification.test.ts` | Multi-robot safety edge cases, passing bay yield, priority aging | 4 | **PASS** |
| `finalTechnicalValidation.test.ts` | Dijkstra vs $A^*$, corridor coordination, heuristic admissibility | 10 | **PASS** |
| `prototypeDemonstration.test.ts` | End-to-end 8-module UI and simulation prototype verification | 7 | **PASS** |
| `quickCriticalValidation.test.ts` | 5 to 10 AGV commissioning, freight loading, dynamic replan | 3 | **PASS** |
| `screenshotReviewVerification.test.ts` | Analytics metrics reconciliation, genuine cycle vs stall alert | 6 | **PASS** |
| `agv10StressTest.test.ts` | AGV-10 stress routing under maximum aisle congestion | 3 | **PASS** |
| `finalEndToEndValidation.test.ts` | Multi-AGV delivery lifecycle, bay holding, reservation preservation | 5 | **PASS** |
| `dualLaneTrafficExperiment.test.ts` | Comparative 500-tick layout evaluation (Configs A, B, C) | 4 | **PASS** |
| `trafficManagementComparativeBenchmark.test.ts` | Exponential replanning backoff scaling and reset verification | 5 | **PASS** |
| `benchmarkAudit.test.ts` | Multi-robot empirical benchmark validation across 1..10 AGVs | 1 | **PASS** |
| `comprehensiveBenchmark.test.ts` | 60-run reproducible statistical benchmark dataset generator | 1 | **PASS** |
| `fairnessStarvationAudit.test.ts` | Per-AGV movement, waiting ticks, and starvation telemetry audit | 3 | **PASS** |
| `finalExperimentalConsistencyAudit.test.ts` | 3-seed $\times$ 3-config 500-tick telemetry audit (45,000 data points) | 2 | **PASS** |

**Total Verification Status:** Over 70 automated tests validating 100% collision-free execution, zero state corruption, and deterministic algorithmic behavior.

---

## 3. Empirical Benchmark Methodology

### 3.1 Experimental Setup
- **Simulation Environment:** $20 \times 14$ standard warehouse floor (280 total cells, $\approx 192$ traversable aisle cells).
- **Fleet Configurations:** $K \in \{1, 2, 4, 6, 8, 10\}$ AGVs.
- **Evaluation Horizons:**
  - **Short Horizon:** 30 simulation ticks per trial across 10 reproducible runs ($N = 60$ runs).
  - **Long Horizon:** 500 continuous simulation ticks per trial across 3 deterministic seeds (Seeds: 42, 101, 2026).
- **Physical Station Constraints:** 3 pickup bays on the west perimeter and 3 delivery bays on the east perimeter.

### 3.2 60-Run Statistical Benchmark Results (30-Tick Horizon)

The following dataset reflects real, audited execution metrics collected across 60 independent runs:

| Fleet ($K$) | Mean Plan Time (ms) | Median Plan Time (ms) | Mean Expanded Nodes | Mean Path Length | Mean Snapshot Makespan | Fleet Cumulative Wait | Mean Per-Robot Wait | Total Deliveries (10 runs) | Run Success Rate |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1 AGV** | **0.13 ms** (±0.07) | 0.12 ms | **25** | 11.0 | 10.7 ticks | **0.0 ticks** | **0.00 ticks** | **4 tasks** | 40.0% |
| **2 AGVs** | **0.28 ms** (±0.11) | 0.26 ms | **58** | 12.2 | 16.8 ticks | **0.0 ticks** | **0.00 ticks** | **7 tasks** | 60.0% |
| **4 AGVs** | **29.68 ms** (±11.98) | 24.19 ms | **8,097** | 13.0 | 17.6 ticks | **0.7 ticks** | **0.17 ticks** | **8 tasks** | 60.0% |
| **6 AGVs** | **144.73 ms** (±63.96) | 140.67 ms | **20,903** | 12.1 | 17.6 ticks | **1.9 ticks** | **0.32 ticks** | **10 tasks** | 80.0% |
| **8 AGVs** | **179.01 ms** (±64.66) | 187.70 ms | **28,117** | 10.8 | 18.0 ticks | **10.8 ticks** | **1.35 ticks** | **13 tasks** | 90.0% |
| **10 AGVs** | **258.06 ms** (±53.63) | 256.24 ms | **39,326** | 10.5 | 17.5 ticks | **43.5 ticks** | **4.35 ticks** | **16 tasks** | 90.0% |

---

## 4. Disambiguated Metric Definitions & Formulas

To ensure rigorous scientific integrity, all telemetry metrics are formally defined and disambiguated:

### 4.1 Fleet Cumulative Waiting Ticks vs. Active-Mission Waiting Ticks
- **Fleet Cumulative Waiting Ticks:**
  $$\text{Wait}_{\text{fleet}} = \sum_{t=1}^{T} \sum_{k=1}^{K} \mathbb{I}\big(\text{status}(R_k, t) = \text{WAITING}\big)$$
  Measures the total ticks where an AGV was explicitly placed in `WAITING` status due to a space-time reservation conflict or yield action.
- **Active-Mission Motionless Ticks:**
  $$\text{Motionless}_{\text{active}} = \sum_{t=1}^{T} \sum_{k=1}^{K} \mathbb{I}\big(\text{hasActiveMission}(R_k, t) \;\land\; p_k(t) = p_k(t-1)\big)$$
  Measures all ticks where an AGV with an active mission experienced zero coordinate translation. This includes legitimate station dwell (loading/unloading at bays), yielding for leading traffic, and waiting for reservation clearance. Because it includes multi-tick station loading, this metric is larger than `Fleet Cumulative Waiting Ticks`.

### 4.2 Genuine Deadlock Cycles vs. Transient Stall Alerts
- **Deadlock Cycles Detected:** Measures genuine topological cycles isolated in the directed Wait-For Graph ($R_1 \to R_2 \to \dots \to R_k \to R_1$). Each unique cycle episode is counted once per episode.
- **Transient Stall Alerts:** Triggers whenever an AGV is held motionless for $\ge 3$ consecutive ticks waiting for an obstruction to pass. A transient stall alert does not imply a cycle; 95% of stalls resolve autonomously as the leading vehicle clears the aisle.
- **Deferred Recovery Invocations:** The number of times the recovery protocol was scheduled and executed after an exponential backoff interval.

### 4.3 Starvation Classification Criterion
- **Audited Starvation Threshold:** An AGV is classified as experiencing starvation if and only if:
  1. It holds an active mission with a feasible destination.
  2. It makes zero physical movement for $\ge 60$ consecutive simulation ticks.
  3. The motionless duration is not legitimate station dwell or post-delivery idle waiting.

### 4.4 Makespan Snapshot vs. Classical Makespan
- **Classical MAPF Makespan:** Total time steps until all agents reach their static target and stop: $\max_{k} t_{\text{arrival}}(k)$.
- **Snapshot Makespan:** Evaluated at tick $T$ under continuous logistics dispatch:
  $$\text{Makespan}_{\text{snapshot}}(T) = \max_{k \in \text{Active}} \big(|\pi_k| - \text{index}_k\big)$$
  Represents the maximum remaining travel steps among active paths at simulation termination.

---

## 5. Summary of 500-Tick Multi-Configuration Audit

The system was audited over continuous 500-tick runs across three architectural configurations:
- **Configuration A (Baseline):** Single-lane bidirectional aisles, standard replanning.
- **Configuration B (Improved Traffic):** Exponential replanning backoff, priority aging.
- **Configuration C (Dual-Lane Corridors):** 2-cell-wide main corridors, station bypass lanes, passing bays.

| Metric | Configuration A (Baseline) | Configuration B (Improved Traffic) | Configuration C (Dual-Lane Corridors) |
| :--- | :---: | :---: | :---: |
| Completed Deliveries | 12 | 8 | **18** |
| Total Replanning Attempts | 4,188 | 1,499 | **482** |
| Failed Replanning Attempts | 3,227 | 205 (**-93.6%**) | **45 (-98.6%)** |
| Unique Deadlock Cycles | 10 | 2 (**-80.0%**) | **0 (-100.0%)** |
| Fleet Cumulative Wait Ticks | 992 | 1,306 | **584 (-41.1%)** |
| Physical Collisions | **0** | **0** | **0 (100% Safe)** |

**Conclusion:** Configuration C achieves the highest throughput (+50% deliveries over baseline) while completely eliminating deadlock cycles and reducing failed replanning by 98.6%.
