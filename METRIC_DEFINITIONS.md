# WAREHOUSE CONTROL SYSTEM (WCS) — METRIC DEFINITIONS & SPECIFICATION
## Authoritative Telemetry & Benchmark Data Dictionary

**Document Version:** 2.4.0  
**Status:** Validated & Audited  
**System Location:** `C:\Users\Jeet\.gemini\antigravity\scratch\warehouse-robot-simulator`  
**Applicability:** Production Control System, Simulation Engine, Analytics Dashboard, and Scientific Benchmarking

---

## 1. Executive Architecture Overview

The Autonomous Warehouse Robot Path Planning & Collision Avoidance Simulator operates on a discrete two-dimensional grid ($W \times H = 20 \times 14$) with time-expanded space-time state coordinates $(x, y, t)$.

To prevent metric ambiguity and ensure strict academic consistency, the system enforces a strict boundary between two telemetry domains:
1. **Live Runtime Simulation Telemetry:** Real-time state metrics generated continuously by the active simulation engine running on the master simulation clock ($t = 0, 1, 2, \dots, \infty$).
2. **Empirical Benchmark Suite:** Controlled offline batch experiments executing 10 independent reproducible runs across 6 fleet densities ($N \in \{1, 2, 4, 6, 8, 10\}$ AGVs) over a bounded 30-tick simulation horizon.

```
+-----------------------------------------------------------------------------------------+
|                               WAREHOUSE CONTROL SYSTEM                                  |
+-------------------------------------------+---------------------------------------------+
|        LIVE RUNTIME SIMULATION            |          OFFLINE BENCHMARK SUITE            |
+-------------------------------------------+---------------------------------------------+
| Master Clock: Real-time tick (t=1,2,...)  | Bounded Horizon: Exactly 30 ticks           |
| Fleet Size: Dynamically configured (1..10)| Sample Size: 10 independent runs per config |
| Task Flow: Continuous cyclical dispatch   | Task Flow: Fixed initial dispatch + replan  |
| Goal: Live fleet safety & throughput      | Goal: Algorithmic scalability profiling     |
+-------------------------------------------+---------------------------------------------+
```

---

## 2. Live Runtime Simulation Telemetry Dictionary

| Metric Label | Internal Property | Mathematical Formula | Data Source | Operational Scope | Units | Description & Industrial Interpretation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Active AGVs** | `activeRobots / totalRobots` | $\sum_{i=1}^N \mathbb{I}(\text{isActive}_i) / N$ | `Robot[]` array in `SimulationEngine` | Fleet | AGVs / Total | Operational availability ratio of autonomous mobile robots currently commissioned on the warehouse floor. |
| **Completed Deliveries** | `completedTasks` | $\sum_{i=1}^N \text{tasksCompleted}_i$ | `SimulationEngine.robots` | Fleet (Cumulative) | Completed Orders | Cumulative number of successful delivery station drop-offs accomplished since simulation initialization. |
| **Pending Missions** | `pendingTasks` | $\sum_{i=1}^N \mathbb{I}(\text{isActive}_i \land \text{target} \neq \emptyset \land \text{status} \neq \text{'COMPLETED'})$ | `SimulationEngine.robots` | Fleet (Snapshot) | Active Tasks | Number of AGVs currently assigned to an inbound pickup bay or outbound delivery bay whose mission is incomplete. |
| **Collision Conflicts Prevented** | `collisionAttemptsPrevented` | Counter incremented in `CollisionManager` | `CollisionManager` | Fleet (Cumulative) | Conflict Events | Total physical collisions avoided by runtime validation: vertex collisions, head-on edge swaps, and moves into blocked cells. |
| **Deadlock Cycles Detected** | `deadlockCyclesDetected` | Count of DFS cycles detected in Wait-For Graph (WFG) | `DeadlockDetector.detectDeadlock` | Fleet (Cumulative) | Directed Cycles | Strict circular dependencies where AGV $A$ waits for cell occupied by AGV $B$, which waits for AGV $C$, which waits for AGV $A$. |
| **Deadlock Warning Alert Checks** | `deadlockEvents` | Steps where `deadlockReport.isDeadlocked == true` | `SimulationEngine.deadlockCount` | Fleet (Cumulative) | Alert Checks | Total simulation steps where the deadlock detector triggered recovery protocol (combining directed cycles and stall threshold triggers). |
| **Recovery / Replanning Actions** | `replanningCount` | $\sum \text{events.length}$ from dynamic replanner | `SimulationEngine.replanCount` | Fleet (Cumulative) | AGV Reroutes | Cumulative route recalculations executed for individual AGVs in response to deadlock cycles, stall timeouts, or dynamic obstacles. |
| **Unresolved Deadlocks** | `unresolvedDeadlocks` | Invocations where $\text{successfulReplans} = 0$ | `SimulationEngine.unresolvedDeadlocks` | Fleet (Cumulative) | Unresolved Incidents | Occurrences where automated priority inversion and replanning failed to find an immediate alternative trajectory, forcing AGVs to yield and wait. |
| **Total Path Planning Time** | `totalPlanningTimeMs` | $\sum_{i=1}^k \Delta t_{\text{exec}}(i)$ | `PlanningResult[]` from Cooperative A* | Batch Planning Step | Milliseconds (ms) | Total CPU execution time spent by Cooperative A* in computing collision-free time-indexed paths for the current dispatch. |
| **Average Planning Time per AGV** | `avgPlanningTimePerRobotMs` | $\frac{\text{totalPlanningTimeMs}}{\max(1, \text{plannedRobots})}$ | `PlanningResult[]` | Per-Vehicle | Milliseconds (ms) | Mean route calculation latency per autonomous vehicle. |
| **Expanded Space-Time States** | `totalExpandedNodes` | $\sum_{i=1}^k \text{exploredNodesCount}_i$ | Cooperative A* Closed Set | Batch Planning Step | Graph States | Total $(x, y, t)$ space-time coordinates extracted from the priority min-heap during search. Measures algorithmic computational work. |
| **Average Path Length** | `averagePathLength` | $\frac{1}{\|R_{\text{active}}\|} \sum_{r \in R_{\text{active}}} \text{len}(\text{path}_r)$ | `Robot.plannedPath` | Fleet (Mean) | Discrete Grid Steps | Mean trajectory distance of currently planned active paths from current position to target station. |
| **Fleet Cumulative Wait Ticks** | `totalWaitingTime` | $\sum_{i=1}^N \text{totalWaitSteps}_i$ | `SimulationEngine.robots` | Fleet (Cumulative) | Discrete Ticks | Total discrete simulation steps spent by all active AGVs in `WAITING` or yielding state across the entire simulation session. |
| **Average Wait Ticks per AGV** | `avgWaitingTimePerRobot` | $\frac{\text{totalWaitingTime}}{\max(1, \text{activeRobots})}$ | `SimulationEngine.robots` | Per-Vehicle (Mean) | Ticks / AGV | Normalized waiting time indicating mean traffic congestion delay experienced per vehicle. |
| **Snapshot Makespan** | `makespan` | $\max_{r \in R_{\text{active}}} (\text{len}(\text{path}_r) - \text{index}_r)$ | `SimulationEngine.robots` | Fleet (Snapshot) | Discrete Steps | Maximum remaining trajectory length among all currently executing active AGVs. Snapshot metric, NOT classical MAPF offline makespan. |

---

## 3. Offline Scalability Benchmark Suite Dictionary

All benchmark records are derived from 10 independent reproducible runs across 6 fleet configurations ($N \in \{1, 2, 4, 6, 8, 10\}$) over a fixed 30-tick simulation window on the 20x14 warehouse grid.

| Benchmark Metric | Formal Symbol | Calculation / Aggregation Formula | Units | Context & Academic Distinction |
| :--- | :--- | :--- | :--- | :--- |
| **Robot Count** | $N$ | Fixed parameter $N \in \{1, 2, 4, 6, 8, 10\}$ | AGVs | Experimental fleet density. |
| **Mean Planning Time** | $\mu(T_{\text{plan}})$ | $\frac{1}{10} \sum_{k=1}^{10} T_{\text{plan}}^{(k)}$ | ms | Mean CPU execution time for fleet trajectory planning. Scales with fleet density and obstacle constraints. |
| **Median Planning Time** | $\text{Med}(T_{\text{plan}})$ | $\text{Median}(\{T_{\text{plan}}^{(1)}, \dots, T_{\text{plan}}^{(10)}\})$ | ms | Robust central tendency measure minimizing influence of heap expansion outliers. |
| **Maximum Planning Time** | $\max(T_{\text{plan}})$ | $\max_{k \in [1, 10]} T_{\text{plan}}^{(k)}$ | ms | Worst-case single-batch planning latency observed in 10 experimental runs. |
| **Mean Expanded States** | $\mu(S_{\text{exp}})$ | $\frac{1}{10} \sum_{k=1}^{10} S_{\text{exp}}^{(k)}$ | Graph States $(x,y,t)$ | Empirical search state expansion volume. Scales quadratically with fleet size. |
| **Mean Trajectory Length** | $\mu(L_{\text{path}})$ | $\frac{1}{10} \sum_{k=1}^{10} \bar{L}_{\text{path}}^{(k)}$ | Steps | Mean path length across active trajectories. Averages ~11-13 steps on the 20x14 layout. |
| **Benchmark Snapshot Makespan** | $\mu(M_{30})$ | $\frac{1}{10} \sum_{k=1}^{10} \max_{i} L_{\text{rem}, i}^{(k)}(t=30)$ | Steps | Maximum remaining planned path length snapshot at tick 30. Does NOT represent total batch makespan. |
| **Mean Fleet Waiting Time** | $\mu(W_{\text{fleet}})$ | $\frac{1}{10} \sum_{k=1}^{10} \sum_{i=1}^N W_{i}^{(k)}$ | Ticks | Fleet-aggregated cumulative wait steps incurred over the 30-tick test duration. |
| **Mean Replanning Actions** | $\mu(R_{\text{replan}})$ | $\frac{1}{10} \sum_{k=1}^{10} R_{\text{replan}}^{(k)}$ | Reroutes | Mean number of individual route recalculations triggered by traffic conflicts or deadlocks. |
| **Total Completed Tasks** | $\sum C_{\text{tasks}}$ | $\sum_{k=1}^{10} C_{\text{tasks}}^{(k)}$ | Tasks | Total delivery missions completed across all 10 runs combined (e.g., 16 total tasks for 10 AGVs). |
| **Average Tasks per Run** | $\bar{C}_{\text{run}}$ | $\frac{1}{10} \sum_{k=1}^{10} C_{\text{tasks}}^{(k)}$ | Tasks / Run | Mean missions completed per single 30-tick run (e.g., 1.6 tasks/run for 10 AGVs). |
| **Initial Batch Planning Failures** | $F_{\text{init}}$ | $\sum_{k=1}^{10} \mathbb{I}(\text{CoopA* failed at } t=0)$ | Attempts | Initial dispatch planning failures at simulation step 0 due to station contention or unachievable routes. |
| **Runtime Replanning Retries** | $R_{\text{retry}}$ | Total replan attempts where $\text{plan.success} == \text{false}$ | Attempts | Failed dynamic replanning attempts at $t > 0$ when an AGV attempted to reroute around traffic. |
| **Incomplete Missions at Horizon** | $M_{\text{incomp}}$ | Active AGVs with remaining path at $t=30$ | AGVs | Missions still in progress when the fixed 30-tick benchmark experiment concluded. |

---

## 4. Space-Time Reservation Matrix Definitions

| Reservation Type | Table Scope | Internal Key Structure | Expiry / Eviction Policy | Purpose & Conflict Prevention Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **Fleet-Wide Vertex Reservation** | Reservation Table (Global) | `x,y@t -> robotId` | Cleared on replan, robot removal, or step completion | Prevents two robots from occupying cell $(x, y)$ at the same time step $t$. |
| **Edge-Swap Reservation** | Reservation Table (Global) | `x1,y1->x2,y2@t -> robotId` | Cleared on replan or robot removal | Prevents head-on collisions where Robot 1 moves $u \to v$ while Robot 2 moves $v \to u$ at time $t$. |
| **Goal Dwell Window** | Local Search Constraint | Verified for $[t_{\text{arrival}}, t_{\text{arrival}} + 3]$ | Scoped to search expansion | Ensures arriving AGV can remain stationary at destination for at least 3 ticks without collision during cargo transfer. |
| **Permanent Goal Reservation** | Reservation Table (Global) | `x,y -> GoalReservation(fromTime)` | Active for all $t \ge \text{fromTime}$; cleared when assigned new target | Holds destination cell indefinitely for parked/idle AGVs to prevent moving robots from traversing parked vehicles. |
| **Selected AGV Upcoming Reservations** | Robot Detail Panel (Local) | Filtered subset: `r.robotId == selectedId && r.t >= currentStep` | Live query against Reservation Table | Displays the time-indexed schedule reserved exclusively by the currently selected robot. |

---

## 5. Invariant Matrix & Cross-Verification Guidelines

1. **Fleet Waiting Time vs Robot Waiting Time:**  
   $$\text{totalWaitingTime} = \sum_{i=1}^N \text{robot}_i.\text{totalWaitSteps}$$
   The Fleet Roster (`RobotManager.tsx`) and Robot Detail Panel (`RobotDetailPanel.tsx`) must display individual robot wait ticks ($\text{robot}_i.\text{totalWaitSteps}$), whereas the Analytics Dashboard KPI card displays the Fleet Cumulative Wait Ticks ($\text{totalWaitingTime}$).

2. **Fleet Reservations vs Individual Reservations:**  
   $$\text{allVertexRes.length} \ge \text{robotRes.length}$$
   When 10 robots are active, the global reservation table holds the sum of all future trajectory reservations across all 10 vehicles (e.g., 65-95 vertices). An individual robot's upcoming reservation count represents only its own reserved path steps ($L_{\text{rem}}$). If an AGV is holding/standby, its upcoming reservations equal 1 (holding position) or 0 (if unassigned).

3. **Makespan Terminology:**  
   The metric displayed on the dashboard is **Snapshot Makespan** (maximum remaining steps among active trajectories at the current clock tick). It must never be confused with classical MAPF makespan (total completion time of an entire batch of offline missions).
