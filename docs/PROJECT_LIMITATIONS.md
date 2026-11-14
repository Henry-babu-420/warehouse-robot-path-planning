# Project Limitations, Simulation Assumptions & Future Scope

**Autonomous Warehouse Robot Path Planning & Collision Avoidance Simulator**  
*College Project Engineering Boundary Analysis & Research Roadmap*

---

## 1. Simulation Modeling Assumptions

The simulation engine is designed to model multi-agent algorithmic coordination with high fidelity while abstracting certain low-level hardware phenomena:

1. **Discrete Orthogonal Grid Topology:**
   - Space is discretized into uniform square cells where 1 grid cell represents a fixed physical footprint (e.g., $1.0\text{ m} \times 1.0\text{ m}$).
   - Robots occupy exactly one cell at any given time step $t$. Kinematic footprints of irregular shapes or articulated chassis are not modeled.

2. **Synchronous Discrete Time Steps:**
   - Time advances in discrete integer ticks ($t \in \mathbb{N}$).
   - Every movement transition from cell $(x, y)$ to an adjacent orthogonal neighbor $(x', y')$ consumes exactly 1 time step.
   - All AGVs execute their transitions synchronously on clock ticks. Real-world asynchronous motor jitter and clock drift between distributed microcontrollers are omitted.

3. **Kinematic & Dynamic Idealizations:**
   - **Instantaneous Acceleration:** Robots accelerate and decelerate instantaneously between rest and nominal operating velocity.
   - **Zero Turning Radius:** Heading changes (yaw rotation) occur instantaneously within the step and do not consume additional time ticks.
   - **Uniform Velocity:** All AGVs share identical travel speeds across all warehouse floor surfaces.

4. **Deterministic Communication & Sensing:**
   - The central Reservation Table and Collision Manager possess instantaneous, zero-latency, and packet-loss-free communication with all AGVs.
   - Position sensing and odometry localization are modeled as perfectly accurate without sensor noise, wheel slip, or drift.

---

## 2. Known Algorithmic & System Limitations

### 2.1 Incompleteness of Prioritized Planning
The core multi-agent algorithm employs **Prioritized Planning with Cooperative $A^*$ ($CA^*$)**:
- Prioritized Planning is computationally efficient ($O(K \cdot N \log N)$), enabling real-time browser execution for up to 10 robots.
- However, Prioritized Planning is theoretically **incomplete**: there exist dense warehouse configurations where a higher-priority robot reserves a space-time trajectory that renders it mathematically impossible for a lower-priority robot to find a path within the search cutoff horizon, even if a joint solution exists.
- In single-lane bidirectional corridors without passing bays, lower-priority AGVs can be blocked indefinitely if high-priority robots continuously claim the aisle.

### 2.2 Asymmetric Physical Station Bottlenecks
In the standard $20 \times 14$ layout:
- There are only **3 pickup bays** ($P_1, P_2, P_3$) and **3 delivery bays** ($D_1, D_2, D_3$).
- When the fleet is scaled to $K = 8$ or $K = 10$ AGVs, multiple robots simultaneously target the same 3 station coordinates.
- Because a parked robot holds a permanent goal reservation ($\text{Res}_G$), trailing robots cannot enter or path through the station cell until the dwelling robot finishes loading/unloading and vacates the bay. This induces initial batch planning failures and queuing delays.

### 2.3 Heuristic Tie-Breaking Under Heavy Congestion
The Manhattan distance heuristic $h(n) = |x_n - x_G| + |y_n - y_G|$ does not account for dynamic traffic density in distant aisles. In high-traffic scenarios, robots may choose paths that pass directly through a congested central corridor because the heuristic calculates distance based purely on static obstacles, unaware that multiple AGVs are currently occupying that aisle.

---

## 3. Future Scope & Research Roadmap

The modular architecture of this simulator establishes a strong foundation for future research extensions and production hardware integration:

### 3.1 Advanced Multi-Agent Pathfinding (MAPF) Algorithms
1. **Conflict-Based Search (CBS):**
   - Implement CBS or Enhanced CBS (ECBS) to provide theoretically complete and bounded-suboptimal multi-agent path planning. CBS resolves collisions at a high-level conflict tree rather than relying strictly on fixed agent priorities.
2. **Windowed Hierarchical Cooperative $A^*$ (WHCA*):**
   - Implement WHCA* where space-time reservations are reserved only for a forward window of $W$ steps (e.g., $W = 16$), followed by abstract spatial heuristics for remaining distances. This significantly reduces reservation table memory consumption.

### 3.2 Continuous Kinematics & Physics Integration
1. **Kinodynamic Trajectory Generation:**
   - Incorporate acceleration, braking distances, centrifugal limits during turning, and payload inertia into the trajectory cost function.
2. **Continuous-Time Conflict Detection:**
   - Transition from discrete time steps $(x, y, t)$ to continuous space-time swept volumes $(x(t), y(t), \theta(t))$ to prevent edge-crossing collisions at varying velocities.

### 3.3 Dynamic Traffic Control & Layout Optimization
1. **Automated One-Way Directional Zoning:**
   - Dynamically reconfigure aisle directions (e.g., alternating clockwise/counter-clockwise loops) based on real-time traffic density heatmaps to eliminate head-on corridor conflicts.
2. **Buffer Bays & Passing Sidings:**
   - Dynamically designate temporary parking sidings where lower-priority AGVs can step aside without backtracking to distant staging areas.

### 3.4 Physical Hardware Bridge (ROS 2 & Nav2)
1. **ROS 2 Navigation Bridge:**
   - Expose the trajectory planner as a global costmap planner plugin within the ROS 2 Nav2 framework.
2. **Hardware Deployment:**
   - Transmit planned space-time waypoints via MQTT or ROS 2 actions to physical differential-drive warehouse AGVs (e.g., TurtleBot 4 or industrial AMR platforms) equipped with LiDAR SLAM and real-world safety LiDAR scanners.
