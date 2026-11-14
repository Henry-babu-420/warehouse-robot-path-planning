# WAREHOUSE CONTROL SYSTEM (WCS) METRIC FORMULAS & FORMAL DEFINITIONS
## Mathematical Specifications, Boundary Conditions, Units & Aggregation Standards
**Project Workspace:** `C:\Users\Jeet\.gemini\antigravity\scratch\warehouse-robot-simulator`  
**Standard Version:** 2.4.0-AUDITED  
**Auditor:** Statistical Data Auditor & Senior Robotics Performance Researcher  

---

## 1. System Parameters & Notation

Let the simulation environment be defined as a discrete-time space-time grid:
- **Grid Dimensions:** Width $W = 20$, Height $H = 14$. Space coordinate $p = (x, y) \in [0, W-1] \times [0, H-1]$.
- **Fleet Population:** $\mathcal{R} = \{r_1, r_2, \dots, r_N\}$ where $N = |\mathcal{R}| = 10$.
- **Time Horizon:** Discrete time steps $t \in \mathcal{T} = \{0, 1, 2, \dots, T-1\}$ where $T = 500$.
- **Robot State Vector at time $t$:**
  $$S_i(t) = \left\langle p_i(t), \tau_i(t), \sigma_i(t), \mathcal{P}_i(t), k_i(t) \right\rangle$$
  where $p_i(t) \in \mathbb{Z}^2$ is current position, $\tau_i(t) \in \mathbb{Z}^2 \cup \{\emptyset\}$ is assigned target coordinate, $\sigma_i(t) \in \{\text{IDLE}, \text{PLANNING}, \text{MOVING\_TO\_PICKUP}, \text{AT\_PICKUP}, \text{MOVING\_TO\_DELIVERY}, \text{WAITING}, \text{BLOCKED}, \text{DEADLOCKED}, \text{COMPLETED}\}$ is operational status, $\mathcal{P}_i(t) = [p_i^{(0)}, p_i^{(1)}, \dots, p_i^{(L-1)}]$ is the active planned path buffer, and $k_i(t) \in [0, L-1]$ is the current path index.

---

## 2. Formal Metric Definitions & Mathematical Formulas

### 2.1 Fleet In-Transit Collision-Yielding Steps (`totalWaitSteps`)
- **Variable Name:** `robot.totalWaitSteps`
- **Reported Label:** `Fleet In-Transit Yield Steps (totalWaitSteps)` (formerly labeled `Fleet Cumulative Waiting Ticks`)
- **Measurement Unit:** `robot-ticks` (cumulative sum across the fleet over time horizon $T$)
- **Formal Definition:**
  Accumulates the number of simulation steps where an active robot possessed an ongoing multi-step planned path ($k_i(t) < |\mathcal{P}_i(t)| - 1$), attempted to execute a proposed move from $p_i(t)$ to $p_i^{(k_i+1)}$, but was commanded to remain at $p_i(t)$ by `CollisionManager.validateAndFilterMoves()` or by a planned vertex wait step in its space-time reservation.
- **Mathematical Formula:**
  $$\text{YieldSteps}_i = \sum_{t=0}^{T-1} \mathbb{I}\left( |\mathcal{P}_i(t)| > 1 \;\land\; k_i(t) < |\mathcal{P}_i(t)| - 1 \;\land\; p_i(t+1) = p_i(t) \right)$$
  $$\text{Fleet In-Transit Yield Steps} = \sum_{i=1}^{N} \text{YieldSteps}_i$$
- **Domain & Boundary:** $[0, N \cdot T] = [0, 5000]$ robot-ticks.
- **Operational Meaning:** Quantifies active path-following delay caused strictly by inter-robot collision avoidance and dynamic yielding in travel aisles.

---

### 2.2 Active-Mission Physical Motionless Ticks (`activeWaitingTicks`)
- **Variable Name:** `robot.activeWaitingTicks`
- **Reported Label:** `Active-Mission Physical Motionless Ticks`
- **Measurement Unit:** `robot-ticks`
- **Formal Definition:**
  Accumulates every simulation step in which an AGV held an active, incomplete delivery mission ($\tau_i(t) \neq \emptyset \land \sigma_i(t) \notin \{\text{IDLE}, \text{COMPLETED}, \text{AT\_PICKUP}\}$) and made zero physical displacement ($p_i(t+1) = p_i(t)$).
- **Mathematical Formula:**
  $$\text{MotionlessActive}_i = \sum_{t=0}^{T-1} \mathbb{I}\left( \tau_i(t) \neq \emptyset \;\land\; \sigma_i(t) \notin \{\text{IDLE}, \text{COMPLETED}, \text{AT\_PICKUP}\} \;\land\; p_i(t+1) = p_i(t) \right)$$
  $$\text{Fleet Active-Mission Motionless Ticks} = \sum_{i=1}^{N} \text{MotionlessActive}_i$$
- **Mathematical Hierarchy Relation:**
  $$\text{In-Transit Collision-Yielding Steps} \subseteq \text{Active-Mission Physical Motionless Ticks}$$
  $$\forall i \in \mathcal{R}: \quad \text{YieldSteps}_i \le \text{MotionlessActive}_i$$
  *Proof:* Every collision-yield step requires $p_i(t+1) = p_i(t)$ while active. However, $\text{MotionlessActive}_i$ also includes ticks where the path buffer was empty ($|\mathcal{P}_i(t)| = 0$), ticks spent in exponential replanning backoff, and ticks waiting for an occupied terminal delivery bay. Hence, Active-Mission Physical Motionless Ticks is strictly an upper bound on In-Transit Collision-Yielding Steps.

---

### 2.3 Idle Awaiting Task Assignment Ticks (`idleAwaitingTaskTicks`)
- **Variable Name:** `robot.idleAwaitingTaskTicks`
- **Reported Label:** `Idle Awaiting Task Assignment Ticks`
- **Measurement Unit:** `robot-ticks`
- **Formal Definition:**
  Accumulates simulation steps where an AGV was physically motionless because it had completed its prior mission and was awaiting task dispatch ($\tau_i(t) = \emptyset \lor \sigma_i(t) \in \{\text{IDLE}, \text{COMPLETED}\}$).
- **Mathematical Formula:**
  $$\text{IdleTicks}_i = \sum_{t=0}^{T-1} \mathbb{I}\left( (\tau_i(t) = \emptyset \;\lor\; \sigma_i(t) \in \{\text{IDLE}, \text{COMPLETED}\}) \;\land\; p_i(t+1) = p_i(t) \right)$$
  $$\text{Fleet Idle Awaiting Task Ticks} = \sum_{i=1}^{N} \text{IdleTicks}_i$$
- **Starvation Classification Boundary:** Strictly excluded from starvation calculations.

---

### 2.4 Station Dwell Ticks (`stationDwellTicks`)
- **Variable Name:** `robot.stationDwellTicks`
- **Reported Label:** `Station Dwell Ticks (Loading/Unloading)`
- **Measurement Unit:** `robot-ticks`
- **Formal Definition:**
  Accumulates simulation steps where an AGV was stationary at an assigned pickup or delivery station actively performing payload loading or unloading operations ($\sigma_i(t) = \text{AT\_PICKUP}$).
- **Mathematical Formula:**
  $$\text{DwellTicks}_i = \sum_{t=0}^{T-1} \mathbb{I}\left( \sigma_i(t) = \text{AT\_PICKUP} \;\land\; p_i(t+1) = p_i(t) \right)$$
- **Starvation Classification Boundary:** Strictly excluded from starvation calculations.

---

### 2.5 Maximum Consecutive Motionless Ticks
- **Variable Name:** `robot.longestMotionlessWhileActive`
- **Reported Label:** `Max Motionless Duration (Active Mission)`
- **Measurement Unit:** `simulation ticks`
- **Formal Definition:**
  The maximum duration of contiguous time steps during which an AGV remained motionless while assigned to an active feasible delivery mission:
  $$M_i = \max_{0 \le t_1 \le t_2 < T} \left\{ t_2 - t_1 + 1 \;\middle|\; \forall t \in [t_1, t_2]: p_i(t+1) = p_i(t) \land \tau_i(t) \neq \emptyset \land \sigma_i(t) \notin \{\text{IDLE}, \text{COMPLETED}, \text{AT\_PICKUP}\} \right\}$$
  $$\text{Fleet Max Motionless Duration} = \max_{i=1}^{N} M_i$$

---

### 2.6 Audited Starvation Classification Model
An AGV $r_i$ is classified into one of six mutually exclusive categories based on its maximum active motionless duration $M_i$, mission feasibility $\mathcal{F}_i$, and cycle dependency:

$$\text{Class}(r_i) = \begin{cases}
\text{UNRESOLVED\_DEADLOCK\_CYCLE} & \text{if } r_i \in \text{UnresolvedCycle} \\
\text{IDLE\_AWAITING\_TASK} & \text{if } \tau_i = \emptyset \lor \sigma_i \in \{\text{IDLE}, \text{COMPLETED}\} \\
\text{STATION\_DWELL} & \text{if } \sigma_i = \text{AT\_PICKUP} \\
\text{CONFIRMED\_STARVATION} & \text{if } M_i \ge 60 \;\land\; \mathcal{F}_i = \text{TRUE} \\
\text{PROLONGED\_WAITING} & \text{if } 30 \le M_i < 60 \;\land\; \mathcal{F}_i = \text{TRUE} \\
\text{TEMPORARY\_YIELDING} & \text{if } 1 \le M_i < 30 \;\land\; \mathcal{F}_i = \text{TRUE} \\
\text{PROGRESSING} & \text{otherwise (active forward movement)}
\end{cases}$$

- **Starvation Threshold:** $\theta_{\text{starve}} = 60$ ticks.
- **Prolonged Waiting Window:** $[30, 59]$ ticks.
- **Temporary Yielding Window:** $[1, 29]$ ticks.

---

### 2.7 Snapshot Remaining Path Length
- **Variable Name:** `SimulationMetrics.averagePathLength` / `snapshotRemainingPathLength`
- **Reported Label:** `Snapshot Remaining Path Length`
- **Measurement Unit:** `steps` (discrete grid transitions)
- **Formal Definition:**
  The arithmetic mean of remaining steps in the active path buffer $\mathcal{P}_i(T)$ across all robots possessing an active path at the termination step $t = T$:
  $$\mathcal{R}_{\text{active}}(T) = \left\{ r_i \in \mathcal{R} \;\middle|\; |\mathcal{P}_i(T)| > 0 \right\}$$
  $$\text{Snapshot Remaining Path Length} = \begin{cases}
  \frac{1}{|\mathcal{R}_{\text{active}}(T)|} \sum_{r_i \in \mathcal{R}_{\text{active}}(T)} |\mathcal{P}_i(T)| & \text{if } |\mathcal{R}_{\text{active}}(T)| > 0 \\
  0 & \text{otherwise}
  \end{cases}$$
- **Disambiguation:** It is an instantaneous snapshot of path buffer size at simulation end, **not** cumulative mission travel distance, **not** planned distance at mission dispatch, and **not** classical MAPF makespan.

---

### 2.8 Completed Deliveries
- **Variable Name:** `robot.tasksCompleted`
- **Reported Label:** `Completed Deliveries`
- **Measurement Unit:** `deliveries` (completed packages)
- **Formal Definition:**
  The total number of full pickup-to-delivery cycles executed by the fleet during the simulation horizon:
  $$\text{Completed Deliveries} = \sum_{i=1}^{N} \text{tasksCompleted}_i$$

---

### 2.9 Replanning Attempts (Failed vs. Successful vs. Total)
- **Failed Replanning Attempts:** Cooperative A\* search calls that returned `success = false` because no space-time trajectory existed below `maxTimeHorizon = 150` without violating reservation table constraints.
- **Successful Replanning Attempts:** Cooperative A\* search calls that returned `success = true` and committed a collision-free space-time trajectory to the reservation table.
- **Total Replanning Actions:**
  $$\text{Total Replans} = \text{Failed Replans} + \text{Successful Replans}$$

---

### 2.10 Physical Safety Invariant Metrics
- **Physical Vertex Collisions:**
  $$\text{VertexCollisions}(t) = \sum_{p \in \mathbb{Z}^2} \max\left(0, \left| \{r_i \in \mathcal{R} \mid p_i(t) = p\} \right| - 1 \right)$$
  $$\text{Total Vertex Collisions} = \sum_{t=0}^{T-1} \text{VertexCollisions}(t) \quad (\equiv 0)$$
- **Edge-Swap Collisions:**
  $$\text{EdgeSwaps}(t) = \sum_{1 \le i < j \le N} \mathbb{I}\left( p_i(t) = p_j(t+1) \;\land\; p_j(t) = p_i(t+1) \;\land\; p_i(t) \neq p_i(t+1) \right)$$
  $$\text{Total Edge Swaps} = \sum_{t=0}^{T-1} \text{EdgeSwaps}(t) \quad (\equiv 0)$$
- **Boundary Constraint Violations:**
  $$\text{BoundaryViolations} = \sum_{t=0}^{T-1} \sum_{i=1}^{N} \mathbb{I}\left( x_i(t) < 0 \lor x_i(t) \ge W \lor y_i(t) < 0 \lor y_i(t) \ge H \right) \quad (\equiv 0)$$
- **Obstacle Constraint Violations:**
  $$\text{ObstacleViolations} = \sum_{t=0}^{T-1} \sum_{i=1}^{N} \mathbb{I}\left( \text{isTraversable}(p_i(t)) = \text{FALSE} \right) \quad (\equiv 0)$$

---

## 3. Aggregation & Multi-Trial Standard

For each configuration $C \in \{\text{BASELINE}, \text{IMPROVED}, \text{DUAL\_LANE}\}$, metrics are measured across $K = 3$ independent trials using fixed pseudo-random seeds $\mathcal{S} = \{42, 101, 2026\}$:

$$\text{Metric}_{\text{mean}}(C) = \frac{1}{K} \sum_{k \in \mathcal{S}} \text{Metric}(C, k)$$
$$\Delta_{C \text{ vs } A} = \text{Metric}_{\text{mean}}(C) - \text{Metric}_{\text{mean}}(\text{BASELINE})$$
$$\Delta_{C \text{ vs } B} = \text{Metric}_{\text{mean}}(C) - \text{Metric}_{\text{mean}}(\text{IMPROVED})$$
