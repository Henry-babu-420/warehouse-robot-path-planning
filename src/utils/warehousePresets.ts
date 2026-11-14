import { CellType, WarehouseLayout, Station } from '../types/grid';

export const DEFAULT_WIDTH = 20;
export const DEFAULT_HEIGHT = 14;

export function createEmptyGrid(width: number, height: number): CellType[][] {
  const cells: CellType[][] = [];
  for (let y = 0; y < height; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < width; x++) {
      row.push('EMPTY');
    }
    cells.push(row);
  }
  return cells;
}

export function createDefaultWarehouse(width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT): WarehouseLayout {
  const cells = createEmptyGrid(width, height);
  const stations: Station[] = [];

  // Create perimeter walls except openings for loading/unloading
  for (let x = 0; x < width; x++) {
    cells[0][x] = 'WALL';
    cells[height - 1][x] = 'WALL';
  }
  for (let y = 0; y < height; y++) {
    cells[y][0] = 'WALL';
    cells[y][width - 1] = 'WALL';
  }

  // Create standard warehouse shelf blocks (aisles)
  // Typically double-rack pods with access lanes:
  // e.g., Columns x=3,4; x=7,8; x=11,12; x=15,16
  // Rows y=3..5 and y=8..10 with cross-aisles at y=2, y=6..7, y=11
  const shelfCols = [3, 4, 7, 8, 11, 12, 15, 16];
  const shelfRowRanges = [
    { start: 3, end: 5 },
    { start: 8, end: 10 }
  ];

  for (const col of shelfCols) {
    if (col < width - 2) {
      for (const range of shelfRowRanges) {
        for (let r = range.start; r <= range.end && r < height - 2; r++) {
          cells[r][col] = 'SHELF';
        }
      }
    }
  }

  // Define Pickup Stations (Receiving bays on left aisle x=1)
  const pickupPositions = [
    { x: 1, y: 3 },
    { x: 1, y: 6 },
    { x: 1, y: 9 },
  ];

  pickupPositions.forEach((pos, idx) => {
    if (pos.x < width && pos.y < height) {
      cells[pos.y][pos.x] = 'PICKUP';
      stations.push({
        id: `P${idx + 1}`,
        name: `Inbound Bay ${idx + 1}`,
        type: 'PICKUP',
        position: pos,
        color: '#2E7D32', // Muted Industrial Green
      });
    }
  });

  // Define Delivery Stations (Packing & Dispatch bays on right aisle x=width-2)
  const deliveryPositions = [
    { x: width - 2, y: 3 },
    { x: width - 2, y: 6 },
    { x: width - 2, y: 9 },
  ];

  deliveryPositions.forEach((pos, idx) => {
    if (pos.x < width && pos.y < height) {
      cells[pos.y][pos.x] = 'DELIVERY';
      stations.push({
        id: `D${idx + 1}`,
        name: `Outbound Bay ${idx + 1}`,
        type: 'DELIVERY',
        position: pos,
        color: '#426B8A', // Muted Industrial Steel Blue
      });
    }
  });

  // Static obstacles (charging station pillars / structural columns)
  const staticObstacles = [
    { x: 6, y: 6 },
    { x: 13, y: 6 }
  ];
  for (const ob of staticObstacles) {
    if (ob.x < width - 1 && ob.y < height - 1) {
      cells[ob.y][ob.x] = 'STATIC_OBSTACLE';
    }
  }

  return { width, height, cells, stations };
}

export function createRandomWarehouse(width: number, height: number, shelfDensity = 0.25): WarehouseLayout {
  const cells = createEmptyGrid(width, height);
  const stations: Station[] = [];

  // Perimeter walls
  for (let x = 0; x < width; x++) {
    cells[0][x] = 'WALL';
    cells[height - 1][x] = 'WALL';
  }
  for (let y = 0; y < height; y++) {
    cells[y][0] = 'WALL';
    cells[y][width - 1] = 'WALL';
  }

  // Generate randomized shelf clusters while keeping aisles navigable
  for (let y = 2; y < height - 2; y += 3) {
    for (let x = 3; x < width - 3; x += 2) {
      if (Math.random() < 0.75) {
        cells[y][x] = 'SHELF';
        if (y + 1 < height - 2 && Math.random() < 0.8) {
          cells[y + 1][x] = 'SHELF';
        }
      }
    }
  }

  // Scattered static obstacles
  for (let i = 0; i < Math.floor((width * height) * 0.03); i++) {
    const rx = 2 + Math.floor(Math.random() * (width - 4));
    const ry = 2 + Math.floor(Math.random() * (height - 4));
    if (cells[ry][rx] === 'EMPTY') {
      cells[ry][rx] = 'STATIC_OBSTACLE';
    }
  }

  // Stations
  const pCount = Math.min(4, Math.floor(height / 3));
  for (let i = 0; i < pCount; i++) {
    const y = 2 + Math.floor(i * ((height - 4) / pCount));
    cells[y][1] = 'PICKUP';
    stations.push({
      id: `P${i + 1}`,
      name: `Pickup P${i + 1}`,
      type: 'PICKUP',
      position: { x: 1, y },
      color: '#10b981',
    });
  }

  const dCount = Math.min(4, Math.floor(height / 3));
  for (let i = 0; i < dCount; i++) {
    const y = 2 + Math.floor(i * ((height - 4) / dCount));
    cells[y][width - 2] = 'DELIVERY';
    stations.push({
      id: `D${i + 1}`,
      name: `Delivery D${i + 1}`,
      type: 'DELIVERY',
      position: { x: width - 2, y },
      color: '#06b6d4',
    });
  }

  return { width, height, cells, stations };
}

export function isTraversable(cellType: CellType): boolean {
  return cellType === 'EMPTY' || cellType === 'PICKUP' || cellType === 'DELIVERY' || cellType === 'PASSING_BAY';
}

/**
 * Creates an improved warehouse layout with designated passing/pull-in bays at strategic junctions.
 * Passing bays allow yielding or lower-priority AGVs to pull out of the main travel lanes
 * without blocking cross-corridors or causing cascading queue deadlocks.
 */
export function createImprovedWarehouse(width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT): WarehouseLayout {
  const layout = createDefaultWarehouse(width, height);

  // Designated Passing Bay locations at strategic aisle junctions
  const passingBayPositions = [
    // Central cross-aisle pull-in bays (around column obstacles at x=6, x=13)
    { x: 5, y: 6 },
    { x: 7, y: 6 },
    { x: 12, y: 6 },
    { x: 14, y: 6 },
    // Transfer row pockets
    { x: 6, y: 7 },
    { x: 13, y: 7 },
    // Staging and return pull-in bays
    { x: 5, y: 2 },
    { x: 9, y: 2 },
    { x: 14, y: 2 },
    { x: 5, y: 11 },
    { x: 9, y: 11 },
    { x: 14, y: 11 },
  ];

  for (const pos of passingBayPositions) {
    if (pos.x < width - 1 && pos.y < height - 1) {
      if (layout.cells[pos.y][pos.x] === 'EMPTY') {
        layout.cells[pos.y][pos.x] = 'PASSING_BAY';
      }
    }
  }

  return layout;
}

/**
 * Creates an experimental warehouse layout with 2-cell-wide main corridors and dedicated station bypass lanes.
 * - Through-aisles are doubled in width (2 cells wide) to enable dynamic overtaking and multi-lane flow.
 * - Pickup stations (x=1) and Delivery stations (x=18) feature dedicated bypass lanes (x=2,3 and x=16,17)
 *   so stationary dwelling AGVs do not block through-traffic.
 * - Off-lane passing bays are positioned in pod alcoves out of all travel lanes.
 */
export function createDualLaneWarehouse(width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT): WarehouseLayout {
  const cells = createEmptyGrid(width, height);
  const stations: Station[] = [];

  // Perimeter walls
  for (let x = 0; x < width; x++) {
    cells[0][x] = 'WALL';
    cells[height - 1][x] = 'WALL';
  }
  for (let y = 0; y < height; y++) {
    cells[y][0] = 'WALL';
    cells[y][width - 1] = 'WALL';
  }

  // Shelf pods configured to leave 2-cell wide corridors throughout:
  // Dual-lane vertical corridors at x=2,3; x=5,6; x=9,10; x=13,14; x=16,17
  // Shelf pod columns at x=4 (single), x=7,8 (double), x=11,12 (double), x=15 (single)
  // Shelf row tiers at y=3..5 and y=8..10, leaving 2-cell highways at y=1,2; y=6,7; y=11,12
  const shelfCols = [4, 7, 8, 11, 12, 15];
  const shelfRowRanges = [
    { start: 3, end: 5 },
    { start: 8, end: 10 },
  ];

  for (const col of shelfCols) {
    if (col < width - 2) {
      for (const range of shelfRowRanges) {
        for (let r = range.start; r <= range.end && r < height - 2; r++) {
          cells[r][col] = 'SHELF';
        }
      }
    }
  }

  // Pickup Stations on left siding (x=1)
  const pickupPositions = [
    { x: 1, y: 3 },
    { x: 1, y: 6 },
    { x: 1, y: 9 },
  ];
  pickupPositions.forEach((pos, idx) => {
    cells[pos.y][pos.x] = 'PICKUP';
    stations.push({
      id: `P${idx + 1}`,
      name: `Inbound Bay ${idx + 1}`,
      type: 'PICKUP',
      position: pos,
      color: '#2E7D32',
    });
  });

  // Delivery Stations on right siding (x=width-2 = 18)
  const deliveryPositions = [
    { x: width - 2, y: 3 },
    { x: width - 2, y: 6 },
    { x: width - 2, y: 9 },
  ];
  deliveryPositions.forEach((pos, idx) => {
    cells[pos.y][pos.x] = 'DELIVERY';
    stations.push({
      id: `D${idx + 1}`,
      name: `Outbound Bay ${idx + 1}`,
      type: 'DELIVERY',
      position: pos,
      color: '#426B8A',
    });
  });

  // Dedicated Turnout Passing Bays in off-lane pod alcoves
  const passingBayPositions = [
    { x: 4, y: 3 },
    { x: 15, y: 3 },
    { x: 4, y: 10 },
    { x: 15, y: 10 },
    { x: 7, y: 6 },
    { x: 8, y: 7 },
    { x: 11, y: 6 },
    { x: 12, y: 7 },
  ];

  for (const pos of passingBayPositions) {
    if (pos.x < width - 1 && pos.y < height - 1) {
      cells[pos.y][pos.x] = 'PASSING_BAY';
    }
  }

  // Structural column pillars at non-interfering pod edges
  cells[6][6] = 'STATIC_OBSTACLE';
  cells[6][13] = 'STATIC_OBSTACLE';

  return { width, height, cells, stations };
}
