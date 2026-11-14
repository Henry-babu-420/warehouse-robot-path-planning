import { Position, CellType } from '../types/grid';

export type TrafficDirectionMode = 'BIDIRECTIONAL' | 'ONE_WAY_AISLES' | 'DUAL_LANE_DIRECTIONS';

export interface TrafficRulesConfig {
  mode: TrafficDirectionMode;
  allowPassingBayPullIn: boolean;
}

export const DEFAULT_TRAFFIC_CONFIG: TrafficRulesConfig = {
  mode: 'ONE_WAY_AISLES',
  allowPassingBayPullIn: true,
};

/**
 * Checks if a movement from `from` to `to` conforms to warehouse traffic rules.
 *
 * Modes:
 * 1. BIDIRECTIONAL: All traversable transitions permitted (baseline).
 * 2. ONE_WAY_AISLES: Single-lane directional circulatory loop.
 * 3. DUAL_LANE_DIRECTIONS: Multi-lane flow with parallel lanes for overtaking and station bypass:
 *    - Eastbound Dual Highways: Rows 1, 2, 7 (prohibits Westbound through-travel)
 *    - Westbound Dual Highways: Rows 6, 11, 12 (prohibits Eastbound through-travel)
 *    - Southbound Vertical Lanes: Columns 2, 5, 10, 13, 16 (prohibits Northbound through-travel)
 *    - Northbound Vertical Lanes: Columns 3, 6, 9, 14, 17 (prohibits Southbound through-travel)
 *    - Sidings (Columns 1 and 18): Station access lanes with full local connectivity.
 *    - Lateral lane-swapping between adjacent parallel lanes (e.g. y=1 <-> y=2, x=2 <-> x=3)
 *      is explicitly permitted to enable dynamic overtaking around slower AGVs.
 */
export function isMoveAllowedByTrafficRules(
  from: Position,
  to: Position,
  mode: TrafficDirectionMode = 'BIDIRECTIONAL',
  getCellType?: (pos: Position) => CellType
): boolean {
  // Bidirectional mode permits all moves
  if (mode === 'BIDIRECTIONAL') {
    return true;
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;

  // Waiting in place is always permitted
  if (dx === 0 && dy === 0) {
    return true;
  }

  // Passing bay and station pull-in: entering a passing bay or station is always allowed
  if (getCellType) {
    const targetType = getCellType(to);
    if (targetType === 'PASSING_BAY' || targetType === 'PICKUP' || targetType === 'DELIVERY') {
      return true;
    }
    const fromType = getCellType(from);
    if (fromType === 'PASSING_BAY') {
      // Exiting a passing bay is allowed into any valid adjacent cell
      return true;
    }
  }

  // ONE_WAY_AISLES rules
  if (mode === 'ONE_WAY_AISLES') {
    // Horizontal movement along a row (dy === 0)
    if (dy === 0) {
      const row = from.y;
      if ((row === 1 || row === 2 || row === 7) && dx < 0) return false;
      if ((row === 6 || row === 11 || row === 12) && dx > 0) return false;
    }

    // Vertical movement along a column (dx === 0)
    if (dx === 0) {
      const col = from.x;
      if ((col === 1 || col === 5 || col === 10 || col === 17) && dy < 0) return false;
      if ((col === 2 || col === 9 || col === 14 || col === 18) && dy > 0) return false;
    }
    return true;
  }

  // DUAL_LANE_DIRECTIONS rules
  if (mode === 'DUAL_LANE_DIRECTIONS') {
    // Allow lateral lane switching across parallel dual lanes (e.g. between row 1 and 2, row 6 and 7, col 2 and 3, col 9 and 10)
    const isLateralRowSwitch = dx === 0 && ((from.y === 1 && to.y === 2) || (from.y === 2 && to.y === 1) || (from.y === 6 && to.y === 7) || (from.y === 7 && to.y === 6) || (from.y === 11 && to.y === 12) || (from.y === 12 && to.y === 11));
    const isLateralColSwitch = dy === 0 && ((from.x === 2 && to.x === 3) || (from.x === 3 && to.x === 2) || (from.x === 5 && to.x === 6) || (from.x === 6 && to.x === 5) || (from.x === 9 && to.x === 10) || (from.x === 10 && to.x === 9) || (from.x === 13 && to.x === 14) || (from.x === 14 && to.x === 13) || (from.x === 16 && to.x === 17) || (from.x === 17 && to.x === 16));

    if (isLateralRowSwitch || isLateralColSwitch) {
      return true;
    }

    // Horizontal through-travel (dy === 0)
    if (dy === 0) {
      const row = from.y;
      // Eastbound dual highways: cannot travel West (dx < 0)
      if ((row === 1 || row === 2 || row === 7) && dx < 0) return false;
      // Westbound dual highways: cannot travel East (dx > 0)
      if ((row === 6 || row === 11 || row === 12) && dx > 0) return false;
    }

    // Vertical through-travel (dx === 0)
    if (dx === 0) {
      const col = from.x;
      // Southbound dual lanes: cannot travel North (dy < 0)
      if ((col === 2 || col === 5 || col === 10 || col === 13 || col === 16) && dy < 0) return false;
      // Northbound dual lanes: cannot travel South (dy > 0)
      if ((col === 3 || col === 6 || col === 9 || col === 14 || col === 17) && dy > 0) return false;
    }
  }

  return true;
}
