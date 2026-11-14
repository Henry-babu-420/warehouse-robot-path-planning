import { WarehouseLayout, CellType, Position, ToolMode } from '../types/grid';
import { Robot, RobotStatus } from '../types/robot';
import { PlanningResult } from '../types/path';
import { EventLogItem, SimulationMetrics, BenchmarkDataPoint, SimulationStatus } from '../types/simulation';
import { ReservationTable } from '../algorithms/reservationTable';
import { DeadlockDetector } from '../algorithms/deadlockDetector';
import { CollisionManager } from './collisionManager';
import { SimulationClock } from './simulationClock';
import { planFleetCooperativePaths } from '../algorithms/cooperativeAstar';
import { handleDynamicObstaclePlacement, recoverFromDeadlock } from '../algorithms/replanner';
import { createDefaultWarehouse, createRandomWarehouse, createImprovedWarehouse, createDualLaneWarehouse, isTraversable } from '../utils/warehousePresets';
import { calculateMetrics } from '../utils/metrics';
import { posEquals, posKey } from '../utils/heuristics';
import { TrafficDirectionMode, isMoveAllowedByTrafficRules } from '../utils/trafficRules';

export const ROBOT_PALETTE = [
  '#3A6B88', // Muted Industrial Blue
  '#C25E40', // Muted Terracotta
  '#38765A', // Muted Sage Green
  '#B47D28', // Muted Ochre
  '#5B6B7C', // Muted Slate
  '#7C5295', // Muted Plum
  '#2C7A7B', // Muted Deep Teal
  '#8D5B4C', // Muted Umber
  '#4A607A', // Muted Navy
  '#6B7280', // Muted Graphite
];

export class SimulationEngine {
  public warehouse: WarehouseLayout;
  public robots: Robot[] = [];
  public reservationTable: ReservationTable = new ReservationTable();
  public collisionManager: CollisionManager = new CollisionManager();
  public deadlockDetector: DeadlockDetector = new DeadlockDetector();
  public simulationClock: SimulationClock = new SimulationClock();

  public eventLogs: EventLogItem[] = [];
  public recentPlanningResults: PlanningResult[] = [];
  public deadlockCount: number = 0;
  public deadlockCyclesDetected: number = 0;
  public deadlockRecoveryAttempts: number = 0;
  public unresolvedDeadlocks: number = 0;
  public unresolvedDeadlockCycles: number = 0;
  public replanCount: number = 0;
  public selectedRobotId: string | null = null;
  public toolMode: ToolMode = 'SELECT';
  private inCycleEpisode: boolean = false;

  // Controlled Traffic Management Configurations
  public trafficMode: TrafficDirectionMode = 'BIDIRECTIONAL';
  public backoffEnabled: boolean = false;
  public initialBackoffTicks: number = 2;
  public maxBackoffTicks: number = 16;
  private randomFn: () => number = Math.random;

  public setRandomSeed(seed: number) {
    let s = seed >>> 0;
    this.randomFn = () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private onStateChangeCallback: (() => void) | null = null;

  constructor() {
    this.warehouse = createDefaultWarehouse();
    this.simulationClock.onTick((step) => {
      this.step();
    });
    this.initDefaultFleet();
  }

  public subscribe(cb: () => void) {
    this.onStateChangeCallback = cb;
  }

  private notify() {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback();
    }
  }

  public initDefaultFleet() {
    this.robots = [];
    this.reservationTable.clear();
    this.collisionManager.reset();
    this.deadlockDetector.reset();

    // Default 5 robots with starting positions and missions
    const defaultRobotsConfig = [
      { id: 'R1', name: 'AGV-01', x: 2, y: 1, pIdx: 0, dIdx: 0, color: ROBOT_PALETTE[0] },
      { id: 'R2', name: 'AGV-02', x: 5, y: 1, pIdx: 1, dIdx: 1, color: ROBOT_PALETTE[1] },
      { id: 'R3', name: 'AGV-03', x: 9, y: 1, pIdx: 2, dIdx: 2, color: ROBOT_PALETTE[2] },
      { id: 'R4', name: 'AGV-04', x: 14, y: 1, pIdx: 0, dIdx: 2, color: ROBOT_PALETTE[3] },
      { id: 'R5', name: 'AGV-05', x: 17, y: 1, pIdx: 1, dIdx: 0, color: ROBOT_PALETTE[4] },
    ];

    defaultRobotsConfig.forEach((cfg, idx) => {
      const pStation = this.warehouse.stations.filter(s => s.type === 'PICKUP')[cfg.pIdx] || this.warehouse.stations[0];
      const dStation = this.warehouse.stations.filter(s => s.type === 'DELIVERY')[cfg.dIdx] || this.warehouse.stations[1];

      const robot: Robot = {
        id: cfg.id,
        name: cfg.name,
        color: cfg.color,
        position: { x: cfg.x, y: cfg.y },
        startPosition: { x: cfg.x, y: cfg.y },
        targetPosition: pStation ? { ...pStation.position } : null,
        assignedPickup: pStation ? { ...pStation.position } : null,
        assignedDelivery: dStation ? { ...dStation.position } : null,
        status: 'IDLE',
        plannedPath: [],
        pathIndex: 0,
        priority: 10 - idx,
        priorityAge: 0,
        speed: 1,
        isActive: true,
        hasPayload: false,
        totalWaitSteps: 0,
        totalStepsMoved: 0,
        tasksCompleted: 0,
        replanCount: 0,
        consecutiveWaitSteps: 0,
        maxConsecutiveWaitSteps: 0,
        consecutiveStepsWithoutMovement: 0,
        longestDurationWithoutMovement: 0,
        consecutiveMotionlessWhileActive: 0,
        longestMotionlessWhileActive: 0,
        idleAwaitingTaskTicks: 0,
        stationDwellTicks: 0,
        activeWaitingTicks: 0,
        successfulReplans: 0,
        failedReplans: 0,
        stallAlertCount: 0,
      };
      this.robots.push(robot);
    });

    this.selectedRobotId = this.robots[0]?.id || null;
    this.logEvent('INFO', 'Warehouse environment initialized with 5 autonomous mobile robots');
    this.planFleetPaths();
  }

  public isCellTraversable(pos: Position): boolean {
    if (pos.x < 0 || pos.x >= this.warehouse.width || pos.y < 0 || pos.y >= this.warehouse.height) {
      return false;
    }
    const type = this.warehouse.cells[pos.y][pos.x];
    return isTraversable(type);
  }

  public getTrafficOptions() {
    return {
      width: this.warehouse.width,
      height: this.warehouse.height,
      isCellTraversable: (pos: Position) => this.isCellTraversable(pos),
      reservationTable: this.reservationTable,
      maxTimeHorizon: 150,
      isMoveAllowed: (from: Position, to: Position) =>
        isMoveAllowedByTrafficRules(
          from,
          to,
          this.trafficMode,
          (p) => (this.warehouse.cells[p.y]?.[p.x] ?? 'WALL')
        ),
    };
  }

  public setTrafficManagementConfig(config: {
    trafficMode?: TrafficDirectionMode;
    backoffEnabled?: boolean;
    initialBackoffTicks?: number;
    maxBackoffTicks?: number;
    useImprovedLayout?: boolean;
    useDualLaneLayout?: boolean;
  }) {
    if (config.trafficMode !== undefined) this.trafficMode = config.trafficMode;
    if (config.backoffEnabled !== undefined) this.backoffEnabled = config.backoffEnabled;
    if (config.initialBackoffTicks !== undefined) this.initialBackoffTicks = config.initialBackoffTicks;
    if (config.maxBackoffTicks !== undefined) this.maxBackoffTicks = config.maxBackoffTicks;
    if (config.useDualLaneLayout) {
      this.warehouse = createDualLaneWarehouse(this.warehouse.width, this.warehouse.height);
      this.resetRobotPositions();
    } else if (config.useImprovedLayout) {
      this.warehouse = createImprovedWarehouse(this.warehouse.width, this.warehouse.height);
      this.resetRobotPositions();
    }
  }

  public planFleetPaths() {
    const activeRobots = this.robots.filter(r => r.isActive && r.targetPosition);
    if (activeRobots.length === 0) {
      this.notify();
      return;
    }

    const { plannedRobots, planningResults, totalPlanningTimeMs } = planFleetCooperativePaths(
      this.robots,
      this.getTrafficOptions(),
      this.simulationClock.getStep()
    );

    this.robots = plannedRobots;
    this.recentPlanningResults = planningResults;

    const successfulPlans = planningResults.filter(p => p.success).length;
    this.logEvent(
      'PATH_PLANNED',
      `Cooperative A* planned ${successfulPlans}/${planningResults.length} routes in ${totalPlanningTimeMs.toFixed(2)}ms`
    );

    this.notify();
  }

  public step() {
    const currentStep = this.simulationClock.getStep();

    // 1. Deadlock Detection
    this.deadlockDetector.recordStep(this.robots);
    const deadlockReport = this.deadlockDetector.detectDeadlock(
      this.robots,
      this.reservationTable,
      currentStep
    );

    if (deadlockReport.isDeadlocked) {
      this.deadlockCount++;
      if (deadlockReport.cycleFound) {
        if (!this.inCycleEpisode) {
          this.deadlockCyclesDetected++;
          this.inCycleEpisode = true;
        }
        this.logEvent(
          'DEADLOCK_DETECTED',
          `Deadlock cycle: ${deadlockReport.reason}. Initiating automated cycle recovery.`
        );
      } else {
        this.inCycleEpisode = false;
        this.logEvent(
          'WARNING',
          `Aisle stall alert: ${deadlockReport.reason}. Initiating automated replanning protocol.`
        );
        for (const rId of deadlockReport.involvedRobotIds) {
          const r = this.robots.find(rob => rob.id === rId);
          if (r) {
            r.stallAlertCount = (r.stallAlertCount || 0) + 1;
          }
        }
      }
      this.deadlockRecoveryAttempts++;
      deadlockReport.recoveryAttempted = true;

      // Filter robots to replan: if backoffEnabled, only robots eligible by backoff interval
      const eligibleRobotIds = this.backoffEnabled
        ? deadlockReport.involvedRobotIds.filter(id => {
            const r = this.robots.find(rob => rob.id === id);
            return !r || !r.nextAllowedReplanTick || currentStep >= r.nextAllowedReplanTick;
          })
        : deadlockReport.involvedRobotIds;

      if (eligibleRobotIds.length > 0) {
        // Automated recovery
        const recovery = recoverFromDeadlock(
          eligibleRobotIds,
          this.robots,
          this.getTrafficOptions(),
          currentStep
        );

        this.robots = recovery.updatedRobots;
        this.replanCount += recovery.events.length;

        // Track successful and failed replans per AGV & update exponential backoff
        for (const ev of recovery.events) {
          const r = this.robots.find(rob => rob.id === ev.robotId);
          if (r) {
            if (ev.success) {
              r.successfulReplans = (r.successfulReplans || 0) + 1;
              r.replanBackoffInterval = this.initialBackoffTicks;
              r.nextAllowedReplanTick = currentStep;
              r.lastReplanOutcome = 'SUCCESS';
            } else {
              r.failedReplans = (r.failedReplans || 0) + 1;
              if (this.backoffEnabled) {
                const prevInterval = r.replanBackoffInterval || this.initialBackoffTicks;
                const nextInterval = Math.min(this.maxBackoffTicks, prevInterval * 2);
                r.replanBackoffInterval = nextInterval;
                r.nextAllowedReplanTick = currentStep + nextInterval;
              }
              r.lastReplanOutcome = 'FAILED';
            }
          }
        }

        const recoverySuccess = recovery.recovered && recovery.events.some(e => e.success);
        deadlockReport.recoverySucceeded = recoverySuccess;
        deadlockReport.unresolvedStall = !recoverySuccess;

        if (recoverySuccess) {
          this.logEvent('DEADLOCK_RECOVERED', recovery.message);
        } else {
          this.unresolvedDeadlocks++;
          if (deadlockReport.cycleFound) {
            this.unresolvedDeadlockCycles++;
          }
          this.logEvent('WARNING', `Recovery deferred: robots holding safe positions until choke point clears.`);
        }
      } else {
        // All involved robots are currently backing off to prevent replanning thrashing
        deadlockReport.recoveryAttempted = false;
        deadlockReport.recoverySucceeded = false;
        deadlockReport.unresolvedStall = true;
      }
    } else {
      this.inCycleEpisode = false;
    }

    // 2. Validate movements through CollisionManager
    const prevPositions = new Map<string, Position>();
    for (const r of this.robots) {
      prevPositions.set(r.id, { x: r.position.x, y: r.position.y });
    }

    const { filteredRobots, preventedCollisionsThisStep } = this.collisionManager.validateAndFilterMoves(
      this.robots,
      (pos) => this.isCellTraversable(pos),
      currentStep,
      this.reservationTable
    );

    this.robots = filteredRobots;

    // Update physical movement and consecutive wait tracking
    for (const robot of this.robots) {
      if (!robot.isActive) continue;
      const prevPos = prevPositions.get(robot.id);
      const hasMoved = prevPos ? !posEquals(prevPos, robot.position) : false;

      if (hasMoved) {
        robot.consecutiveStepsWithoutMovement = 0;
      } else {
        robot.consecutiveStepsWithoutMovement = (robot.consecutiveStepsWithoutMovement || 0) + 1;
        robot.longestDurationWithoutMovement = Math.max(
          robot.longestDurationWithoutMovement || 0,
          robot.consecutiveStepsWithoutMovement
        );
      }

      if (robot.status === 'WAITING') {
        robot.consecutiveWaitSteps = (robot.consecutiveWaitSteps || 0) + 1;
        robot.maxConsecutiveWaitSteps = Math.max(
          robot.maxConsecutiveWaitSteps || 0,
          robot.consecutiveWaitSteps
        );
      } else {
        robot.consecutiveWaitSteps = 0;
      }

      // Operational state classification:
      // Track idle awaiting task, station dwell, and active-mission motionless durations separately
      const isIdleAwaitingTask = !robot.targetPosition || robot.status === 'IDLE' || robot.status === 'COMPLETED';
      const isStationDwell = robot.status === 'AT_PICKUP';
      const hasActiveMission = robot.targetPosition !== null && !isIdleAwaitingTask && !isStationDwell;

      if (isIdleAwaitingTask) {
        robot.idleAwaitingTaskTicks = (robot.idleAwaitingTaskTicks || 0) + 1;
        robot.consecutiveMotionlessWhileActive = 0;
      } else if (isStationDwell) {
        robot.stationDwellTicks = (robot.stationDwellTicks || 0) + 1;
        robot.consecutiveMotionlessWhileActive = 0;
      } else if (hasActiveMission) {
        if (hasMoved) {
          robot.consecutiveMotionlessWhileActive = 0;
        } else {
          robot.consecutiveMotionlessWhileActive = (robot.consecutiveMotionlessWhileActive || 0) + 1;
          robot.longestMotionlessWhileActive = Math.max(
            robot.longestMotionlessWhileActive || 0,
            robot.consecutiveMotionlessWhileActive
          );
          robot.activeWaitingTicks = (robot.activeWaitingTicks || 0) + 1;
        }
      }
    }

    // Meaningful State Change: Backoff Reset
    if (this.backoffEnabled) {
      const movedRobotFormerPositions: Position[] = [];
      for (const robot of this.robots) {
        const prevPos = prevPositions.get(robot.id);
        if (prevPos && !posEquals(prevPos, robot.position)) {
          movedRobotFormerPositions.push(prevPos);
          // Robot moved: reset its own backoff interval
          robot.replanBackoffInterval = this.initialBackoffTicks;
          robot.nextAllowedReplanTick = currentStep;
        }
      }

      // If any robot moved, reset backoff for waiting robots in the vicinity (Chebyshev distance <= 3)
      if (movedRobotFormerPositions.length > 0) {
        for (const robot of this.robots) {
          if (robot.status === 'WAITING' && (robot.nextAllowedReplanTick || 0) > currentStep) {
            const isNearMove = movedRobotFormerPositions.some(
              pos => Math.max(Math.abs(robot.position.x - pos.x), Math.abs(robot.position.y - pos.y)) <= 3
            );
            if (isNearMove) {
              robot.replanBackoffInterval = this.initialBackoffTicks;
              robot.nextAllowedReplanTick = currentStep;
            }
          }
        }
      }
    }

    for (const warn of preventedCollisionsThisStep) {
      this.logEvent('COLLISION_PREVENTED', warn.message, warn.robot1Id);
    }

    // 3. Check Mission & Station State Transitions (Pickup & Delivery lifecycle)
    for (let i = 0; i < this.robots.length; i++) {
      const robot = this.robots[i];
      if (!robot.isActive) continue;

      // Check arrival at pickup
      if (
        !robot.hasPayload &&
        robot.assignedPickup &&
        posEquals(robot.position, robot.assignedPickup) &&
        robot.status !== 'AT_PICKUP'
      ) {
        // Loaded package at pickup bay!
        robot.hasPayload = true;
        robot.status = 'AT_PICKUP';
        robot.targetPosition = robot.assignedDelivery ? { ...robot.assignedDelivery } : null;
        this.logEvent('TASK_PICKUP', `${robot.name} loaded inventory at pickup station (${robot.position.x}, ${robot.position.y})`, robot.id);

        // Plan next leg to delivery station
        if (robot.targetPosition) {
          const plan = planFleetCooperativePaths(
            [robot],
            this.getTrafficOptions(),
            currentStep
          );
          if (plan.plannedRobots[0]) {
            this.robots[i] = plan.plannedRobots[0];
          }
        }
      }
      // Check arrival at delivery
      else if (
        robot.hasPayload &&
        robot.assignedDelivery &&
        posEquals(robot.position, robot.assignedDelivery)
      ) {
        // Discharged package at outbound delivery bay!
        robot.hasPayload = false;
        robot.tasksCompleted++;
        robot.status = 'COMPLETED';
        robot.plannedPath = [];
        robot.pathIndex = 0;
        this.logEvent('TASK_COMPLETE', `${robot.name} successfully delivered package to outbound bay! (Completed ${robot.tasksCompleted} tasks)`, robot.id);

        // Station cleared / delivery completed: Reset backoff across the fleet!
        if (this.backoffEnabled) {
          for (const r of this.robots) {
            r.replanBackoffInterval = this.initialBackoffTicks;
            r.nextAllowedReplanTick = currentStep;
          }
        }

        // Auto-assign next cyclical order: pickup -> delivery
        const pickups = this.warehouse.stations.filter(s => s.type === 'PICKUP');
        const deliveries = this.warehouse.stations.filter(s => s.type === 'DELIVERY');
        if (pickups.length > 0 && deliveries.length > 0) {
          const nextP = pickups[Math.floor(this.randomFn() * pickups.length)];
          const nextD = deliveries[Math.floor(this.randomFn() * deliveries.length)];
          robot.assignedPickup = { ...nextP.position };
          robot.assignedDelivery = { ...nextD.position };
          robot.targetPosition = { ...nextP.position };
          robot.status = 'IDLE';

          const plan = planFleetCooperativePaths(
            [robot],
            this.getTrafficOptions(),
            currentStep
          );
          if (plan.plannedRobots[0]) {
            this.robots[i] = plan.plannedRobots[0];
          }
        }
      }
    }

    this.notify();
  }

  public placeDynamicObstacle(pos: Position) {
    const prevMode = this.toolMode;
    this.toolMode = 'DYNAMIC_OBSTACLE';
    this.handleCellClick(pos.x, pos.y);
    this.toolMode = prevMode;
  }

  public handleCellClick(x: number, y: number) {
    if (x < 0 || x >= this.warehouse.width || y < 0 || y >= this.warehouse.height) return;

    const currentCell = this.warehouse.cells[y][x];

    switch (this.toolMode) {
      case 'SELECT': {
        // Check if there is a robot on this cell
        const robotOnCell = this.robots.find(r => r.position.x === x && r.position.y === y);
        if (robotOnCell) {
          this.selectedRobotId = robotOnCell.id;
        }
        break;
      }
      case 'OBSTACLE': {
        if (currentCell === 'STATIC_OBSTACLE') {
          this.warehouse.cells[y][x] = 'EMPTY';
        } else if (currentCell === 'EMPTY') {
          this.warehouse.cells[y][x] = 'STATIC_OBSTACLE';
        }
        break;
      }
      case 'DYNAMIC_OBSTACLE': {
        if (currentCell === 'DYNAMIC_OBSTACLE') {
          this.warehouse.cells[y][x] = 'EMPTY';
          this.logEvent('DYNAMIC_OBSTACLE', `Dynamic obstacle removed at (${x}, ${y})`);
        } else {
          this.warehouse.cells[y][x] = 'DYNAMIC_OBSTACLE';
          this.logEvent('DYNAMIC_OBSTACLE', `Dynamic obstacle placed at (${x}, ${y})`);
          
          // Trigger dynamic obstacle re-planning!
          const { updatedRobots, replanEvents } = handleDynamicObstaclePlacement(
            { x, y },
            this.robots,
            this.getTrafficOptions(),
            this.simulationClock.getStep()
          );

          this.robots = updatedRobots;
          this.replanCount += replanEvents.length;

          for (const ev of replanEvents) {
            if (ev.success) {
              this.logEvent('REPLAN', `Dynamic obstacle detected! Robot ${ev.robotId} successfully re-routed (${ev.previousLength} -> ${ev.newLength} steps)`, ev.robotId);
            } else {
              this.logEvent('WARNING', `Dynamic obstacle detected! Robot ${ev.robotId} path blocked; holding position.`, ev.robotId);
            }
          }
        }
        break;
      }
      case 'SHELF': {
        if (currentCell === 'SHELF') {
          this.warehouse.cells[y][x] = 'EMPTY';
        } else if (currentCell === 'EMPTY') {
          this.warehouse.cells[y][x] = 'SHELF';
        }
        break;
      }
      case 'PICKUP': {
        if (currentCell === 'EMPTY') {
          this.warehouse.cells[y][x] = 'PICKUP';
          const newStation = {
            id: `P${this.warehouse.stations.length + 1}`,
            name: `Pickup P${this.warehouse.stations.length + 1}`,
            type: 'PICKUP' as const,
            position: { x, y },
            color: '#10b981',
          };
          this.warehouse.stations.push(newStation);
        }
        break;
      }
      case 'DELIVERY': {
        if (currentCell === 'EMPTY') {
          this.warehouse.cells[y][x] = 'DELIVERY';
          const newStation = {
            id: `D${this.warehouse.stations.length + 1}`,
            name: `Delivery D${this.warehouse.stations.length + 1}`,
            type: 'DELIVERY' as const,
            position: { x, y },
            color: '#06b6d4',
          };
          this.warehouse.stations.push(newStation);
        }
        break;
      }
      case 'ERASE': {
        this.warehouse.cells[y][x] = 'EMPTY';
        this.warehouse.stations = this.warehouse.stations.filter(s => !(s.position.x === x && s.position.y === y));
        break;
      }
      case 'PLACE_ROBOT': {
        if (this.isCellTraversable({ x, y })) {
          this.addRobot({ x, y });
        }
        break;
      }
    }

    this.notify();
  }

  public addRobot(customPos?: Position): Robot | null {
    if (this.robots.length >= 10) {
      this.logEvent('WARNING', 'Maximum fleet capacity (10 robots) reached for warehouse safety limit.');
      return null;
    }

    // Find free starting position
    let startPos = customPos;
    if (!startPos) {
      for (let y = 1; y < this.warehouse.height - 1; y++) {
        for (let x = 1; x < this.warehouse.width - 1; x++) {
          if (
            this.isCellTraversable({ x, y }) &&
            !this.robots.some(r => r.position.x === x && r.position.y === y)
          ) {
            startPos = { x, y };
            break;
          }
        }
        if (startPos) break;
      }
    }

    if (!startPos) {
      this.logEvent('ERROR', 'No free traversable space to deploy new robot');
      return null;
    }

    const nextIdx = this.robots.length;
    const id = `R${nextIdx + 1}`;
    const color = ROBOT_PALETTE[nextIdx % ROBOT_PALETTE.length];
    const pickups = this.warehouse.stations.filter(s => s.type === 'PICKUP');
    const deliveries = this.warehouse.stations.filter(s => s.type === 'DELIVERY');
    const pStation = pickups[nextIdx % Math.max(1, pickups.length)] || null;
    const dStation = deliveries[nextIdx % Math.max(1, deliveries.length)] || null;

    const newRobot: Robot = {
      id,
      name: `AGV-${nextIdx + 1 < 10 ? '0' : ''}${nextIdx + 1}`,
      color,
      position: { ...startPos },
      startPosition: { ...startPos },
      targetPosition: pStation ? { ...pStation.position } : null,
      assignedPickup: pStation ? { ...pStation.position } : null,
      assignedDelivery: dStation ? { ...dStation.position } : null,
      status: 'IDLE',
      plannedPath: [],
      pathIndex: 0,
      priority: 10 - nextIdx,
      priorityAge: 0,
      speed: 1,
      isActive: true,
      hasPayload: false,
      totalWaitSteps: 0,
      totalStepsMoved: 0,
      tasksCompleted: 0,
      replanCount: 0,
      consecutiveWaitSteps: 0,
      maxConsecutiveWaitSteps: 0,
      consecutiveStepsWithoutMovement: 0,
      longestDurationWithoutMovement: 0,
      consecutiveMotionlessWhileActive: 0,
      longestMotionlessWhileActive: 0,
      idleAwaitingTaskTicks: 0,
      stationDwellTicks: 0,
      activeWaitingTicks: 0,
      successfulReplans: 0,
      failedReplans: 0,
      stallAlertCount: 0,
    };

    this.robots.push(newRobot);
    this.selectedRobotId = id;
    this.logEvent('INFO', `Commissioned new autonomous robot ${newRobot.name} at (${startPos.x}, ${startPos.y})`);

    this.planFleetPaths();
    return newRobot;
  }

  public removeRobot(robotId: string) {
    const idx = this.robots.findIndex(r => r.id === robotId);
    if (idx !== -1) {
      const removed = this.robots[idx];
      this.reservationTable.clearRobot(robotId);
      this.robots.splice(idx, 1);
      if (this.selectedRobotId === robotId) {
        this.selectedRobotId = this.robots[0]?.id || null;
      }
      this.logEvent('INFO', `Decommissioned robot ${removed.name} from active fleet`);
      this.planFleetPaths();
    }
  }

  public resetRobotPositions() {
    this.simulationClock.reset();
    this.reservationTable.clear();
    this.collisionManager.reset();
    this.deadlockDetector.reset();
    this.deadlockCount = 0;
    this.deadlockCyclesDetected = 0;
    this.deadlockRecoveryAttempts = 0;
    this.unresolvedDeadlocks = 0;
    this.unresolvedDeadlockCycles = 0;
    this.inCycleEpisode = false;
    this.replanCount = 0;

    for (const r of this.robots) {
      r.position = { ...r.startPosition };
      r.status = 'IDLE';
      r.plannedPath = [];
      r.pathIndex = 0;
      r.hasPayload = false;
      r.tasksCompleted = 0;
      r.priorityAge = 0;
      r.totalWaitSteps = 0;
      r.totalStepsMoved = 0;
      r.consecutiveWaitSteps = 0;
      r.maxConsecutiveWaitSteps = 0;
      r.consecutiveStepsWithoutMovement = 0;
      r.longestDurationWithoutMovement = 0;
      r.consecutiveMotionlessWhileActive = 0;
      r.longestMotionlessWhileActive = 0;
      r.idleAwaitingTaskTicks = 0;
      r.stationDwellTicks = 0;
      r.activeWaitingTicks = 0;
      r.successfulReplans = 0;
      r.failedReplans = 0;
      r.stallAlertCount = 0;
      r.replanBackoffInterval = this.initialBackoffTicks;
      r.nextAllowedReplanTick = 0;
      r.lastReplanOutcome = undefined;
      r.targetPosition = r.assignedPickup ? { ...r.assignedPickup } : null;
    }

    this.logEvent('INFO', 'All robots reset to starting charging bays');
    this.planFleetPaths();
  }

  public toggleRobotActive(robotId: string) {
    const robot = this.robots.find(r => r.id === robotId);
    if (robot) {
      robot.isActive = !robot.isActive;
      if (!robot.isActive) {
        this.reservationTable.clearRobot(robotId);
        robot.plannedPath = [];
        robot.status = 'IDLE';
        this.logEvent('INFO', `Halted robot ${robot.name}`);
      } else {
        this.logEvent('INFO', `Activated robot ${robot.name}`);
        this.planFleetPaths();
      }
      this.notify();
    }
  }

  public assignTask(robotId: string, pickup: Position, delivery: Position) {
    const robot = this.robots.find(r => r.id === robotId);
    if (robot) {
      robot.assignedPickup = { ...pickup };
      robot.assignedDelivery = { ...delivery };
      robot.targetPosition = { ...pickup };
      robot.hasPayload = false;
      robot.status = 'IDLE';
      this.logEvent('TASK_ASSIGNED', `Assigned task to ${robot.name}: Pickup (${pickup.x}, ${pickup.y}) -> Delivery (${delivery.x}, ${delivery.y})`, robot.id);
      this.planFleetPaths();
    }
  }

  public changeDimensions(width: number, height: number) {
    this.warehouse = createDefaultWarehouse(width, height);
    this.resetRobotPositions();
  }

  public generateRandomLayout() {
    this.warehouse = createRandomWarehouse(this.warehouse.width, this.warehouse.height);
    this.resetRobotPositions();
    this.logEvent('INFO', 'Generated procedural warehouse layout with randomized shelf pods');
  }

  public resetWarehouse() {
    this.warehouse = createDefaultWarehouse(this.warehouse.width, this.warehouse.height);
    this.resetRobotPositions();
    this.logEvent('INFO', 'Warehouse layout restored to standard specification');
  }

  public getMetrics(): SimulationMetrics {
    return calculateMetrics(
      this.robots,
      this.recentPlanningResults,
      this.collisionManager,
      this.deadlockCount,
      this.replanCount,
      this.deadlockCyclesDetected,
      this.deadlockRecoveryAttempts,
      this.unresolvedDeadlocks,
      this.unresolvedDeadlockCycles
    );
  }

  public logEvent(type: EventLogItem['type'], message: string, robotId?: string) {
    const item: EventLogItem = {
      id: `ev-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timeStep: this.simulationClock.getStep(),
      realTimestamp: Date.now(),
      type,
      message,
      robotId,
    };
    this.eventLogs.unshift(item);
    if (this.eventLogs.length > 200) {
      this.eventLogs = this.eventLogs.slice(0, 200);
    }
  }

  /**
   * Run benchmark experiments across 1, 2, 4, 6, 8, 10 robots with real measured execution
   */
  public runBenchmarkExperiment(): BenchmarkDataPoint[] {
    const counts = [1, 2, 4, 6, 8, 10];
    const results: BenchmarkDataPoint[] = [];

    // Temporarily save current state
    const originalRobots = JSON.parse(JSON.stringify(this.robots));

    for (const count of counts) {
      const testRobots: Robot[] = [];
      const testReservation = new ReservationTable();

      for (let i = 0; i < count; i++) {
        const x = 1 + (i % (this.warehouse.width - 2));
        const y = 1;
        const pickups = this.warehouse.stations.filter(s => s.type === 'PICKUP');
        const deliveries = this.warehouse.stations.filter(s => s.type === 'DELIVERY');
        const p = pickups[i % Math.max(1, pickups.length)]?.position || { x: 1, y: 3 };
        const d = deliveries[i % Math.max(1, deliveries.length)]?.position || { x: this.warehouse.width - 2, y: 3 };

        testRobots.push({
          id: `BENCH_R${i + 1}`,
          name: `Bench-${i + 1}`,
          color: ROBOT_PALETTE[i % ROBOT_PALETTE.length],
          position: { x, y },
          startPosition: { x, y },
          targetPosition: { ...p },
          assignedPickup: { ...p },
          assignedDelivery: { ...d },
          status: 'IDLE',
          plannedPath: [],
          pathIndex: 0,
          priority: 20 - i,
          priorityAge: 0,
          speed: 1,
          isActive: true,
          hasPayload: false,
          totalWaitSteps: 0,
          totalStepsMoved: 0,
          tasksCompleted: 0,
          replanCount: 0,
        });
      }

      // Measure actual planning execution
      const planRes = planFleetCooperativePaths(
        testRobots,
        {
          width: this.warehouse.width,
          height: this.warehouse.height,
          isCellTraversable: (pos) => this.isCellTraversable(pos),
          reservationTable: testReservation,
          maxTimeHorizon: 150,
        },
        0
      );

      const totalTime = planRes.totalPlanningTimeMs;
      const totalExpanded = planRes.planningResults.reduce((sum, r) => sum + r.exploredNodesCount, 0);
      const successfulPlans = planRes.planningResults.filter(r => r.success);
      const totalPathLen = successfulPlans.reduce((sum, r) => sum + r.path.length, 0);
      const avgLen = successfulPlans.length > 0 ? parseFloat((totalPathLen / successfulPlans.length).toFixed(1)) : 0;
      const maxCompletionSteps = successfulPlans.reduce((max, r) => Math.max(max, r.path.length), 0);

      results.push({
        robotCount: count,
        planningTimeMs: parseFloat(totalTime.toFixed(2)),
        expandedNodes: totalExpanded,
        averagePathLength: avgLen,
        taskCompletionSteps: maxCompletionSteps,
        collisionsPrevented: 0,
        successRate: parseFloat(((successfulPlans.length / count) * 100).toFixed(1)),
      });
    }

    return results;
  }
}
