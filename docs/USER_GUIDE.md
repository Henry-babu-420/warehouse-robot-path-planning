# Autonomous Warehouse Simulator User Guide & Operational Manual

**Autonomous Warehouse Robot Path Planning & Collision Avoidance Simulator**  
*College Project Interactive Demonstration & Operator Manual*

---

## 1. System Navigation & Interface Layout

The simulator interface is divided into functional control zones:
1. **Top Header HUD:** Displays live simulation indicators:
   - **Simulation Clock ($t$):** Current discrete tick count.
   - **Fleet Size:** Number of active AGVs on the floor (5 default, up to 10).
   - **Collisions Prevented:** Genuine physical conflict rejections.
   - **Completed Deliveries:** Total outbound transport missions fulfilled.
   - **System Status:** `IDLE`, `RUNNING`, or `PAUSED`.
2. **Left Sidebar Navigation:** Instant switching between the 8 core operational modules:
   - `Overview`: Real-time warehouse map, top-level KPI cards, and quick dispatch controls.
   - `Warehouse Layout`: Grid design studio with preset loader and obstacle editor.
   - `Robot Fleet`: Full AGV roster, battery SOC, coordinates, and manual priorities.
   - `Task Dispatcher`: Inbound/outbound mission queue and pickup/delivery assignment.
   - `Path Planning`: Real-time $A^*$ and $CA^*$ trajectory visualizer and search inspector.
   - `Collision Avoidance`: Live reservation table matrix and collision counter audits.
   - `Performance Analysis`: Empirical benchmarking suite and Recharts comparative analytics.
   - `Settings`: Search depth cutoffs, heuristic weights, and global reset controls.
3. **Interactive Grid Canvas:** High-DPI HTML5 canvas visualizing robots, stations, shelves, path trails, and reservation ghosts.
4. **Bottom Playback Dock:** Master simulation controls (Run/Pause, Step Forward, Reset, Speed Slider).
5. **Right Telemetry Panel:** Deep-dive diagnostics for the currently selected AGV.

---

## 2. Warehouse Layout Configuration & Editing

The simulator models a standard automated fulfillment center on an orthogonal grid (default: $20 \times 14$ cells, 280 total cells).

### 2.1 Cell Types & Functional Zones
- **Empty Corridor (`EMPTY`):** Traversable aisle allowing bi-directional AGV travel.
- **Storage Shelf (`SHELF`):** Fixed storage racks containing goods. Untraversable obstacle for robots.
- **Boundary Wall (`WALL`):** Exterior perimeter or structural columns. Untraversable obstacle.
- **Pickup Station (`PICKUP`):** West perimeter bays ($x=1, y \in \{3, 6, 9\}$) where inbound cargo is loaded onto AGVs.
- **Delivery Station (`DELIVERY`):** East perimeter bays ($x=18, y \in \{3, 6, 9\}$) where finished parcels are unloaded for outbound shipping.
- **Charging Station (`CHARGER`):** Dedicated pad for AGV battery replenishment.
- **Passing Bay (`PASSING_BAY`):** Siding cells where lower-priority AGVs can temporarily pull over to let higher-priority traffic pass.

### 2.2 Using the Warehouse Editor
1. In the left navigation, click **Warehouse Layout**.
2. Select a tool from the editing palette: `Shelf`, `Wall`, `Passing Bay`, `Clear/Empty`, or `Dynamic Obstacle`.
3. Click or drag across the grid to place or remove elements.
4. **Layout Presets:** Use the Preset selector dropdown to instantly switch between:
   - `Standard 20x14 Warehouse` (Baseline layout with 3 pickup and 3 delivery bays).
   - `Dual-Lane Experimental Warehouse` (Expanded corridors with passing bays and station bypass tracks).
   - `Dense Storage Grid` (Narrow high-density aisles for stress-testing deadlock recovery).

---

## 3. Robot Fleet Management & Commissioning

The simulator initializes with a standard operational fleet of **5 AGVs** and supports dynamic scaling up to **10 AGVs**.

### 3.1 Fleet Commissioning (5 to 10 AGVs)
1. Navigate to the **Robot Fleet** module.
2. Observe the AGV roster table. Active robots are named with uniform identifiers: `AGV-01` through `AGV-10`.
3. To commission additional AGVs:
   - Click **`Add Robot`** or use the commissioning toggle to scale the fleet from 5 to 6, 8, or 10 vehicles.
   - Newly commissioned AGVs appear at available staging coordinates with clean status (`IDLE`), full battery ($100\%$), and baseline priority.
4. To decommission or deactivate an AGV:
   - Click the **Active** toggle switch in the robot's row. Decommissioned robots immediately release their space-time reservations and are excluded from simulation updates.

### 3.2 Robot Telemetry & Attributes
Click any robot on the grid or fleet table to inspect its properties in the Right Sidebar:
- **Identifier:** e.g., `AGV-01 (R1)`.
- **Status State:**
  - `IDLE`: Stationed and ready for task assignment.
  - `MOVING`: Traversal along an active space-time trajectory.
  - `WAITING`: Temporarily yielding at a cell or holding for traffic clearance.
  - `REPLANNING`: In-flight recalculation due to dynamic obstacle or deadlock.
  - `CHARGING`: Restoring battery capacity at a charging pad.
- **Battery SOC:** Depletes proportionally with distance traveled.
- **Priority & Priority Age:** Base priority plus accrued aging increments.
- **Assigned Mission:** Current transport task ID, origin, and destination coordinates.

---

## 4. Task Dispatching & Mission Lifecycle

AGVs fulfill transport missions following a multi-stage logistics lifecycle.

### 4.1 Creating & Dispatching Tasks
1. Navigate to the **Task Dispatcher** module.
2. In the **New Task** panel:
   - Select **Pickup Bay:** e.g., $P_1 (1, 3)$, $P_2 (1, 6)$, or $P_3 (1, 9)$.
   - Select **Delivery Bay:** e.g., $D_1 (18, 3)$, $D_2 (18, 6)$, or $D_3 (18, 9)$.
   - Set **Task Priority:** `Normal`, `High`, or `Urgent`.
   - Click **`Dispatch Mission`**.
3. The Task Dispatcher pairs the task with the most suitable `IDLE` AGV using proximity heuristics and dispatches the mission.

### 4.2 Mission Execution Phases
1. **Phase 1 (Transit to Pickup):** The AGV plans a space-time trajectory to the assigned pickup bay. Payload status: `EMPTY`.
2. **Phase 2 (Station Dwell & Loading):** Upon arrival at the pickup bay, the robot dwells for loading. Payload status transitions to `LOADED`.
3. **Phase 3 (Transit to Delivery):** Cooperative $A^*$ plans the second leg of the trajectory across the warehouse to the destination bay.
4. **Phase 4 (Unloading & Completion):** At the delivery bay, the parcel is unloaded, the mission status updates to `COMPLETED`, the top-level **Completed Deliveries** counter increments, and the AGV returns to `IDLE` or begins a new mission.

---

## 5. Simulation Playback & Real-Time Controls

The Bottom Playback Dock provides complete control over simulation execution:

- **`RUN` / `PAUSE`:** Toggles continuous execution. While running, the discrete clock advances automatically.
- **`STEP` (Step Forward):** Advances the simulation by exactly one tick ($t \to t+1$). Crucial for verifying step-by-step collision checks, reservation releases, and wait actions.
- **`RESET`:** Reinitializes the simulation clock to $t=0$, resets all AGVs to starting staging positions, clears reservation tables, and resets metric counters.
- **Simulation Speed Slider:** Adjusts playback speed from $1\times$ (1 tick/sec, ideal for visual inspection) up to $10\times$ (10 ticks/sec, for rapid multi-task completion).
- **Visualization Toggles:**
  - `Show Reservations`: Overlays future space-time reservation ghosts on the grid.
  - `Show Paths`: Displays colored polyline trails of planned routes.
  - `Show Search Tree`: Renders a translucent heatmap of cells explored during $A^*$ search.

---

## 6. Performance Analytics & Empirical Benchmarking

The simulator includes a built-in empirical evaluation suite designed for academic research.

### 6.1 Running the Live Benchmark Suite
1. Navigate to **Performance Analysis** in the left sidebar.
2. Click **`RUN BENCHMARK SUITE (1, 2, 4, 6, 8, 10)`**.
3. The engine executes controlled multi-agent runs across fleet configurations of 1, 2, 4, 6, 8, and 10 AGVs.
4. Observe the real-time Recharts visualizations:
   - **Planning Time vs Fleet Size:** Mean and maximum computation latency in milliseconds.
   - **Node Expansion Scalability:** Computational search effort.
   - **Waiting Ticks & Congestion:** Total waiting time induced by space-time reservation contention.
   - **Delivery Throughput:** Completed missions across the evaluation horizon.
5. Export results to CSV for offline academic reporting via the **`Export Benchmark CSV`** button.
