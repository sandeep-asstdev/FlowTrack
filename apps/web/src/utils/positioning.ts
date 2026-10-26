export interface FlowPosition {
  x: number;
  y: number;
}

export interface NodeBoundingBox {
  id?: string;
  position: FlowPosition;
  width?: number;
  height?: number;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface ContainerDimensions {
  width: number;
  height: number;
}

export const DEFAULT_NODE_DIMENSIONS = {
  width: 288, // w-72 = 18rem = 288px
  height: 180,
  gapX: 52, // horizontal spacing between nodes
  gapY: 48, // vertical spacing between nodes
};

/**
 * Checks if two rectangular node bounding boxes intersect or are too close
 */
export function isPositionColliding(
  pos: FlowPosition,
  existingNodes: NodeBoundingBox[],
  dimensions: { width: number; height: number; gapX?: number; gapY?: number } = DEFAULT_NODE_DIMENSIONS
): boolean {
  const width = dimensions.width;
  const height = dimensions.height;
  const minSpacingX = width * 0.85;
  const minSpacingY = height * 0.75;

  return existingNodes.some((node) => {
    const dx = Math.abs(node.position.x - pos.x);
    const dy = Math.abs(node.position.y - pos.y);
    return dx < minSpacingX && dy < minSpacingY;
  });
}

/**
 * Finds a nearby non-overlapping position using a spiral/grid search pattern
 * starting from an initial base position.
 */
export function getNonOverlappingPosition(
  basePos: FlowPosition,
  existingNodes: NodeBoundingBox[],
  preferredDirection: 'right' | 'down' | 'grid' = 'right',
  dimensions: { width: number; height: number; gapX?: number; gapY?: number } = DEFAULT_NODE_DIMENSIONS
): FlowPosition {
  const stepX = dimensions.width + (dimensions.gapX ?? 52);
  const stepY = dimensions.height + (dimensions.gapY ?? 48);

  // If initial spot is free, use it directly
  if (!isPositionColliding(basePos, existingNodes, dimensions)) {
    return { x: Math.round(basePos.x), y: Math.round(basePos.y) };
  }

  if (preferredDirection === 'right') {
    // Search up to 10 slots horizontally, then wrap down
    for (let row = 0; row < 5; row++) {
      for (let col = 1; col < 8; col++) {
        const candidate: FlowPosition = {
          x: Math.round(basePos.x + col * stepX),
          y: Math.round(basePos.y + row * stepY),
        };
        if (!isPositionColliding(candidate, existingNodes, dimensions)) {
          return candidate;
        }
      }
    }
  } else if (preferredDirection === 'down') {
    // Search vertically downwards, then offset right
    for (let col = 0; col < 5; col++) {
      for (let row = 1; row < 8; row++) {
        const candidate: FlowPosition = {
          x: Math.round(basePos.x + col * stepX),
          y: Math.round(basePos.y + row * stepY),
        };
        if (!isPositionColliding(candidate, existingNodes, dimensions)) {
          return candidate;
        }
      }
    }
  } else {
    // Grid search around basePos
    for (let dist = 1; dist < 8; dist++) {
      const candidates: FlowPosition[] = [
        { x: basePos.x + dist * stepX, y: basePos.y },
        { x: basePos.x, y: basePos.y + dist * stepY },
        { x: basePos.x + dist * stepX, y: basePos.y + dist * stepY },
        { x: basePos.x - dist * stepX, y: basePos.y },
        { x: basePos.x, y: basePos.y - dist * stepY },
      ];
      for (const candidate of candidates) {
        if (!isPositionColliding(candidate, existingNodes, dimensions)) {
          return { x: Math.round(candidate.x), y: Math.round(candidate.y) };
        }
      }
    }
  }

  // Fallback offset
  return {
    x: Math.round(basePos.x + stepX),
    y: Math.round(basePos.y + stepY),
  };
}

/**
 * Calculates a sensible canvas position in the center of the user's current visible viewport,
 * properly converted from screen pixels to flow coordinates, with collision avoidance.
 */
export function getSmartViewportPosition(
  viewport: ViewportState,
  container: ContainerDimensions,
  existingNodes: NodeBoundingBox[] = [],
  dimensions: { width: number; height: number; gapX?: number; gapY?: number } = DEFAULT_NODE_DIMENSIONS
): FlowPosition {
  const zoom = viewport.zoom || 1;
  // Center of the canvas container in screen pixels
  const centerScreenX = container.width / 2;
  const centerScreenY = container.height / 2;

  // Convert screen center to flow coordinates
  // FlowX = (ScreenX - ViewportX) / Zoom
  const flowCenterX = (centerScreenX - viewport.x) / zoom;
  const flowCenterY = (centerScreenY - viewport.y) / zoom;

  // Center the node itself around flowCenter
  const idealBasePos: FlowPosition = {
    x: Math.round(flowCenterX - dimensions.width / 2),
    y: Math.round(flowCenterY - dimensions.height / 2),
  };

  // Ensure no overlap with existing nodes
  return getNonOverlappingPosition(idealBasePos, existingNodes, 'right', dimensions);
}

/**
 * Checks whether a given node position is currently visible within the canvas viewport
 */
export function isNodeInViewport(
  pos: FlowPosition,
  viewport: ViewportState,
  container: ContainerDimensions,
  nodeDimensions = DEFAULT_NODE_DIMENSIONS,
  padding = 40
): boolean {
  const zoom = viewport.zoom || 1;
  const visibleLeft = -viewport.x / zoom;
  const visibleTop = -viewport.y / zoom;
  const visibleRight = visibleLeft + container.width / zoom;
  const visibleBottom = visibleTop + container.height / zoom;

  return (
    pos.x + nodeDimensions.width >= visibleLeft + padding &&
    pos.x <= visibleRight - padding &&
    pos.y + nodeDimensions.height >= visibleTop + padding &&
    pos.y <= visibleBottom - padding
  );
}
