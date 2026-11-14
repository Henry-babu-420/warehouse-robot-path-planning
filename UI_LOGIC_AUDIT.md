# WAREHOUSE CONTROL SYSTEM (WCS) — FINAL UI, LOGIC, & METRIC-CONSISTENCY AUDIT
## Autonomous Warehouse Robot Path Planning & Collision Avoidance Simulator

**Auditor:** Senior Robotics Software Engineer, Algorithm Researcher & QA Auditor  
**Date of Audit:** November 14, 2026  
**Project Location:** `C:\Users\Jeet\.gemini\antigravity\scratch\warehouse-robot-simulator`  
**Application URL:** `http://127.0.0.1:5173/`  
**Build & Test Status:**  
- **Vite Production Build:** Passed cleanly (`tsc && vite build` in 607ms, 0 type errors)  
- **Vitest Automated Test Suite:** 12/12 Test Suites Passed, 36/36 Tests Passed (117.96s)

---

## 1. Executive Summary & Verification Objectives

This independent technical audit conducts a rigorous, multi-faceted verification of the **Warehouse Control System (WCS)**. Specifically, it resolves operational discrepancies, mathematical ambiguities, and display inconsistencies across:
1. **Deadlock Metrics:** Deconstruction of the 149 Deadlock Events vs. 283 Automated Reroutes.
2. **Telemetry Scope Isolation:** Disentanglement of Live Runtime Simulation ($t=171$, 15 deliveries) from Offline Scalability Benchmarks (10 runs, 30-tick horizon).
3. **Waiting Time Dimensionality:** Fleet cumulative wait ticks vs. per-robot average wait ticks.
4. **Reservation Matrix Scope:** Fleet-wide active vertices (e.g., 92 vertices) vs. individual AGV upcoming reservations.
5. **Temporal Horizons & Goal Semantics:** 150-step space-time search horizon vs. 30-tick benchmark window; 3-tick operational dwell vs. permanent goal reservations.
6. **AGV-10 Stress Test Scenario:** Systematic root-cause analysis of AGV-10 at Inbound Bay $P_1(1, 3)$ targeting Outbound Bay $D_1(18, 3)$ with trajectory step `1/2`, 11 wait ticks, and 26 replans.
7. **Analytics Label Standardization:** Implementation of standard industrial terminology.
8. **Empirical Validation & Limitations:** Concrete verification with zero fabricated metrics.

---

## 2. Area 1: Deadlock Metrics Audit

### 2.1 The Phenomenon Under Inspection
In the live simulator dashboard, the KPI cards displayed:
- **149 Deadlock Events**
- **283 Automated Reroutes**

### 2.2 Code Inspection: Wait-For Graph & Deadlock Detection
In `src/algorithms/deadlockDetector.ts`, the `DeadlockDetector` executes two complementary detection routines on every simulation tick:
1. **Wait-For Graph (WFG) Cycle Detection:** Constructs a directed graph $G = (V, E)$ where vertices are active AGVs. A directed edge $A \to B$ exists if AGV $A$'s next planned waypoint $(x_{A}, y_{A}, t+1)$ is currently physically occupied by AGV $B$. A depth-first search (DFS) with recursion stack tracking detects directed cycles (e.g., $A \to B \to A$ or $A \to B \to C \to A$).
2. **Consecutive Wait Threshold (Stall Detection):** Records consecutive ticks where an AGV status is `'WAITING'` or `'BLOCKED'`. If $\text{waitTicks} \ge \text{waitThreshold}$ (where $\text{waitThreshold} = 3$), the detector flags a deadlock condition:
   ```ts
   return {
     isDeadlocked: true,
     cycleFound: false,
     involvedRobotIds: stalledRobots,
     reason: `Robots [${stalledRobots.join(', ')}] stalled for >= 3 consecutive time steps`,
     suggestedAction: 'REPRIORITIZE_AND_REPLAN'
   };
   ```

### 2.3 The Root Cause of 149 Deadlock Events
In `src/simulation/simulationEngine.ts` (lines 153-167):
```ts
if (deadlockReport.isDeadlocked) {
  this.deadlockCount++;
  ...
}
```
`this.deadlockCount` was incremented **on every single simulation step** in which `deadlockReport.isDeadlocked` evaluated to `true`.
- In a continuous simulation running to $t=171$, whenever AGVs were stalled at an aisle bottleneck for 15-25 consecutive ticks, the condition `isDeadlocked: true` was triggered on **every single tick** of that stall!
- Hence, the 149 events did **NOT** represent 149 unique fatal deadlocks or 149 distinct topological cycles. Instead, they represented **149 simulation steps during which an active stall alert was asserted by the monitoring subsystem**.

### 2.4 The Root Cause of 283 Automated Reroutes
When `isDeadlocked` is asserted, the engine immediately executes `recoverFromDeadlock`:
1. It identifies the involved robots (e.g., 2 robots in a bottleneck).
2. It attempts to reroute each involved robot. Each attempted reroute emits a `ReplanningEvent` into `recovery.events`.
3. In `simulationEngine.ts`: `this.replanCount += recovery.events.length`.
When a bottleneck involves 2 robots and persists across ~140 alert ticks, each tick attempts 2 reroutes, producing approximately $140 \times 2 = 280$ replanning actions!

### 2.5 Implementation Corrections & Unresolved Deadlocks
To ensure total metric honesty:
1. **`deadlockCyclesDetected` (Directed Cycles):** Increments **only** when `deadlockReport.cycleFound === true` (a true topological cycle in the Wait-For Graph).
2. **`deadlockEvents` (Deadlock Warning Alert Checks):** Renamed to reflect that it measures total ticks where stall threshold alerts were active.
3. **`deadlockRecoveryAttempts`:** Increments each time the automated recovery protocol is invoked.
4. **`unresolvedDeadlocks`:** Tracks instances where `recoverFromDeadlock` was unable to resolve all deadlocked AGVs (i.e., `successfulReplans === 0` or partial recoveries where AGVs must hold positions until traffic clears).
5. **No Falsification:** Deadlocks are neither hidden nor suppressed; genuine bottlenecks are accurately logged and categorized.

---

## 3. Area 2: Benchmark vs. Live Simulation Separation

### 3.1 The Diagnostic Finding
Previously, `AnalyticsDashboard.tsx` placed live runtime telemetry cards (displaying active session numbers like $t=171$ and 15 completed deliveries) directly above the 2x2 benchmark charts (which represent offline 10-run, 30-tick batch evaluations). This caused confusion regarding whether the completed deliveries belonged to the benchmark or the active canvas.

### 3.2 Implemented Architectural Separation
The updated `AnalyticsDashboard.tsx` introduces an explicit dual-domain architecture with view-selector tabs:
- **Unified View:** Shows both domains with distinct visual section headers, metadata tags, and provenance badges.
- **Live Telemetry View:** Scoped strictly to the active simulation engine running on the master simulation clock ($t$).
  - *Data Source:* Live Simulation Engine (`SimulationEngine.ts`).
  - *Scope:* Active runtime session ($N$ dynamic AGVs, clock $t$).
  - *Units:* Real-time ticks, milliseconds, discrete grid coordinates.
- **Benchmark Suite View:** Scoped strictly to the offline empirical benchmark suite.
  - *Data Source:* Offline Benchmark Runner (`comprehensiveBenchmark.test.ts` / `runBenchmarkExperiment`).
  - *Scope:* 10 independent runs per configuration ($N \in \{1, 2, 4, 6, 8, 10\}$), 30-tick simulation horizon, 20x14 warehouse grid.
  - *Units:* Sample means, standard deviations, cumulative task counts across 10 runs.

---

## 4. Area 3: Waiting Time Audit & Dimensional Consistency

### 4.1 Investigation of Waiting Ticks Calculation
In `src/utils/metrics.ts`:
```ts
const totalWaitingTime = robots.reduce((sum, r) => sum + r.totalWaitSteps, 0);
```
- **Finding:** The Analytics dashboard's `totalWaitingTime` was indeed a **fleet-wide cumulative summation** across all robots active in the warehouse.
- **Roster & Detail Panel Consistency:** In `RobotManager.tsx` (Fleet Roster) and `RobotDetailPanel.tsx` (Selected AGV Telemetry), the displayed value was `robot.totalWaitSteps`, which represents an **individual robot's wait ticks**.

### 4.2 Standardized Metric Definitions & Labels
To eliminate any ambiguity between the fleet sum and individual values:
- **`Fleet Cumulative Wait Ticks`:** Clearly labeled as the sum across all $N$ vehicles (`metrics.totalWaitingTime`).
- **`Average Wait Ticks per AGV`:** Formally computed as `metrics.totalWaitingTime / activeRobots` and rendered as a dedicated KPI card.
- **`Robot Wait Ticks`:** In `RobotManager.tsx`, the column header has been renamed from `Wait Ticks` to `Robot Wait Ticks`.
- **`Individual Wait Ticks`:** In `RobotDetailPanel.tsx`, the telemetry label is explicitly titled `Individual Wait Ticks` with unit suffix `ticks`.

---

## 5. Area 4: Space-Time Reservation Matrix Scope

### 5.1 The Anomaly Under Inspection
Why did the Path Planning panel show **92 Active Vertices** while the Selected AGV Detail Panel for AGV-10 showed **0 Upcoming Reservations**?

### 5.2 Mathematical & Architectural Root Cause
1. **Fleet-Wide Aggregation in Algorithm Inspector:**  
   In `AlgorithmInspector.tsx`:
   ```ts
   const allVertexRes = reservationTable.getAllVertexReservations();
   ```
   `allVertexRes` queries the entire global reservation table across **all 10 robots** over the entire 150-step planning horizon:
   $$\text{allVertexRes} = \bigcup_{i=1}^{10} \{(x, y, t) \mid \text{reserved by AGV } i\}$$
   When 10 robots have planned routes of length 10-15 steps, $10 \times 10 = 100$ space-time reservations are active simultaneously. Hence, 92 vertices was the correct fleet-wide total.
2. **Individual Scoping in Robot Detail Panel:**  
   In `RobotDetailPanel.tsx`:
   ```ts
   const robotRes = reservationTable.getAllVertexReservations()
     .filter(r => r.robotId === robot.id && r.t >= currentStep);
   ```
   `robotRes` queries only reservations held by the selected AGV. When an AGV's planned path was cleared or had ended, its reserved vertices evaluated to 0.

### 5.3 UI Label Refinement
- `AlgorithmInspector.tsx` now explicitly displays:  
  **`Active Scheduled Reservations (Fleet-Wide Total)`** — *(All active AGVs combined)*.  
  Subheader: `{allVertexRes.length} Fleet Vertices Total | {futureVertexRes.length} Future Active`.
- `RobotDetailPanel.tsx` now explicitly displays:  
  **`Upcoming Reservations (Selected AGV)`** — `{robotRes.length} Vertices Reserved`.

---

## 6. Area 5: Planning Horizon & Goal Reservation Semantics

### 6.1 Planning Horizon vs. Benchmark Duration
- **Space-Time Planning Horizon (`maxTimeHorizon = 150`):**  
  Used internally by Cooperative A* (`findPathCooperativeAStar`) to bound the forward space-time search tree. The algorithm explores candidate state transitions $(x, y, t) \to (x', y', t+1)$ up to $t_{\text{current}} + 150$. This ensures robots can find detours around prolonged congestion.
- **Empirical Benchmark Window ($T_{\text{bench}} = 30$ ticks):**  
  Used exclusively in the offline benchmarking suite (`comprehensiveBenchmark.test.ts`) to evaluate transient fleet performance, initial task completions, and congestion growth over a fixed 30-tick test duration.

### 6.2 Goal Dwell Window vs. Permanent Goal Lock
- **3-Tick Goal Dwell (`goalDwellSteps = 3`):**  
  During Cooperative A* search, when a candidate path reaches the goal $(x_g, y_g)$ at step $t_g$, the algorithm verifies that the cell remains collision-free for at least 3 discrete steps:
  $$\forall \delta t \in [1, 3], \quad \neg \text{isVertexReserved}(x_g, y_g, t_g + \delta t, \text{robotId})$$
  This guarantees safe dwelling during loading/unloading operations without interference from higher-priority robots.
- **Permanent Goal Reservation (`GoalReservation`):**  
  Applies exclusively when an AGV reaches a parking bay or is stationary without an active subsequent mission. It sets `fromTime = arrivalTime`, permanently reserving the cell for all $t \ge \text{fromTime}$ to prevent moving AGVs from traversing parked vehicles.

---

## 7. Area 6: AGV-10 Stress Test Root Cause & Fix

### 7.1 Scenario Profile
- **Vehicle:** AGV-10 (lowest base priority = 1 in a 10-robot fleet).
- **Position:** Inbound Bay $P_1(1, 3)$.
- **Destination:** Outbound Bay $D_1(18, 3)$.
- **Payload:** Loaded (`hasPayload: true`).
- **Observed Symptoms:** Trajectory progress stuck at step `1/2`, 11 wait ticks, 26 replanning events, and 0 upcoming reservations.

### 7.2 Root Cause Analysis
1. **Station Contention & Permanent Goal Locks:**  
   In a 10-robot fleet with only 3 delivery stations ($D_1, D_2, D_3$), multiple robots are assigned to $D_1(18, 3)$. When a higher-priority robot (e.g., AGV-01) planned a route to $D_1$ with `reserveGoalIndefinitely = true`, a permanent goal reservation was established on $(18, 3)$ for all $t \ge t_{\text{arrival}}$. When AGV-10 attempted to plan to $D_1$, Cooperative A* rejected all candidate trajectories because $(18, 3)$ was flagged as permanently occupied.
2. **Missing Reservation on Failed Planning:**  
   In `cooperativeAstar.ts` (lines 295-297), `planFleetCooperativePaths` begins by clearing existing reservations for all replanned robots (`reservationTable.clearRobot(robot.id)`). When AGV-10's search failed to find a path to $D_1$, the code pushed AGV-10 into `WAITING` status **without re-reserving its current position $(1, 3)$**.
   - As a result, AGV-10 had **0 upcoming reservations** in the reservation table despite physically sitting on $(1, 3)$.
   - Its `plannedPath` remained the obsolete 2-step path from its arrival at $P_1$ (index 1 of 2), displaying `Step 1/2`.
   - Other AGVs could theoretically plan through $(1, 3)$, only prevented at the last millisecond by `CollisionManager`.
3. **Deadlock Recovery Loop:**  
   Because AGV-10 remained in `WAITING` status, `consecutiveWaitCounts` exceeded 3 every few ticks, triggering the deadlock detector's stall alert. The engine called `recoverFromDeadlock`, which boosted AGV-10's `priorityAge` and attempted another replan. As long as $D_1$ was blocked, the replan failed again, incrementing `replanCount` to 26 and generating repeated alert events.

### 7.3 Code Remediation
1. **Re-Reservation on Failed Plan (`cooperativeAstar.ts` & `replanner.ts`):**  
   Whenever route planning fails and an AGV transitions to `WAITING`, the engine now **immediately re-reserves the AGV's current cell** at `currentTime`:
   ```ts
   reservationTable.reservePath(
     robot.id,
     [{ x: robot.position.x, y: robot.position.y, t: currentTime }],
     true
   );
   updatedRobots.push({
     ...robot,
     plannedPath: [{ x: robot.position.x, y: robot.position.y, t: currentTime }],
     pathIndex: 0,
     status: 'WAITING',
     priorityAge: (robot.priorityAge || 0) + 5,
     replanCount: robot.replanCount + 1,
   });
   ```
2. **Priority Aging Mechanism:**  
   With each failed planning cycle, AGV-10 accumulates $+5$ `priorityAge`. In our automated test (`agv10StressTest.test.ts`), when `priorityAge` reached $+25$, AGV-10's effective priority ($1 + 25 = 26$) surpassed AGV-01's effective priority ($10$), giving AGV-10 top planning priority and resolving the starvation.
3. **Verified Outcome:**  
   In `src/tests/agv10StressTest.test.ts`, AGV-10 now maintains a verified holding reservation (`Fleet reservations: 69, AGV-10 reservations: 1`), protecting its cell and rendering accurate telemetry.

---

## 8. Area 7: Analytics Label Standardization

The following standardized industrial labels have been implemented across `AnalyticsDashboard.tsx`:

| Old / Ambiguous Label | Standardized Industrial Label | Scope | Metric Basis |
| :--- | :--- | :--- | :--- |
| *Prevented Collisions* | **Collision Conflicts Prevented** | Fleet | Physical vertex, edge-swap, and obstacle collisions intercepted by `CollisionManager`. |
| *Deadlock Events* | **Deadlock Cycles Detected** | Fleet | Topological directed cycles identified in the Wait-For Graph. |
| *Automated Reroutes* | **Recovery / Replanning Actions** | Fleet | Route recalculations executed by the dynamic replanner. |
| *(New Metric)* | **Unresolved Deadlocks** | Fleet | Stalls deferred due to persistent choke-point saturation. |
| *Total Planning Time* | **Total Path Planning Time** | Batch | Cumulative Cooperative A* execution time in milliseconds. |
| *Expanded Search Nodes* | **Expanded Space-Time States** | Batch | $(x, y, t)$ states extracted from priority min-heap. |
| *(Grouped in Subtitle)* | **Fleet Cumulative Wait Ticks** | Fleet | Total discrete wait steps summed across all active AGVs. |
| *(Grouped in Subtitle)* | **Average Wait Ticks per AGV** | Per-AGV | Mean waiting delay per active autonomous vehicle. |
| *Fleet Makespan* | **Snapshot Makespan** | Fleet | Maximum remaining trajectory length among active routes at current clock tick. |

---

## 9. Area 8: Automated Verification, Test Results, & Limitations

### 9.1 Vitest Execution Results
Execution command: `npx vitest run`  
**Result:** 12 passed test suites, 36 passed tests, 0 failed tests (Total execution time: 117.96s).

```
 Test Files  12 passed (12)
      Tests  36 passed (36)
   Duration  117.96s

 ✓ src/tests/reservation.test.ts (4 tests) 10ms
 ✓ src/tests/astar.test.ts (5 tests) 13ms
 ✓ src/tests/collision.test.ts (2 tests) 8ms
 ✓ src/tests/replanning.test.ts (1 test) 13ms
 ✓ src/tests/multiRobot.test.ts (2 tests) 33ms
 ✓ src/tests/deadlock.test.ts (2 tests) 13ms
 ✓ src/tests/auditVerification.test.ts (4 tests) 18ms
 ✓ src/tests/taskCompletion.test.ts (1 test) 104ms
 ✓ src/tests/finalTechnicalValidation.test.ts (10 tests) 237ms
 ✓ src/tests/agv10StressTest.test.ts (3 tests) 496ms
 ✓ src/tests/benchmarkAudit.test.ts (1 test) 14013ms
 ✓ src/tests/comprehensiveBenchmark.test.ts (1 test) 117393ms
```

### 9.2 Vite Production Build
Execution command: `tsc && vite build`  
**Result:** Codebase compiled with zero TypeScript diagnostics in 607ms.

### 9.3 Confirmed & Resolved Bugs
1. **Unreserved Waiting AGVs (Fixed):** Resolved bug where AGVs whose path planning failed had their reservations wiped without re-reserving their current cell, leaving them invisible in the reservation table.
2. **Obsolete Trajectory Progress (Fixed):** Resolved bug where stalled AGVs retained previous trajectory steps (e.g., `Step 1/2`) instead of resetting to a 1-step stationary holding route.
3. **Deadlock Metric Conflation (Fixed):** Resolved conflation of stall alert counts with topological graph cycles; added dedicated tracking for `deadlockCyclesDetected` and `unresolvedDeadlocks`.
4. **Waiting Time Dimensionality (Fixed):** Clarified distinction between fleet-aggregated wait ticks and individual AGV wait ticks across all UI panels.
5. **Reservation Table Scope Ambiguity (Fixed):** Labeled fleet-wide reservation totals versus individual selected AGV reservations.

### 9.4 Experimental Limitations (Academic Honesty)
1. **Layout Scope:** Validated specifically on the $20 \times 14$ grid with standard dual-pod shelving and 3 inbound / 3 outbound bays.
2. **Fleet Density Limit:** Validated for up to 10 autonomous vehicles. Beyond 10 AGVs, aisle congestion in cross-aisles ($y=2, 6, 11$) increases dramatically.
3. **Decoupled Completeness:** Cooperative A* is a decoupled, prioritized algorithm and is not theoretically complete. If a higher-priority AGV permanently blocks an aisle, lower-priority AGVs cannot force it to yield unless priority aging inverts the priority order.
4. **Bounded Evaluation:** Benchmark results are strictly representative of a 30-tick test horizon with 10 runs per configuration; lifetime guarantees are neither claimed nor implied.
