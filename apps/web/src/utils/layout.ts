import dagre from 'dagre';
import { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 300;
const NODE_HEIGHT = 180;

/**
 * Enhanced Dagre & Grid Auto-Layout (n8n / Automa style)
 * 1. Arranges connected nodes along execution paths (Left-to-Right 'LR' or Top-to-Bottom 'TB')
 * 2. Arranges unconnected child/task nodes into a clean, organized multi-column card grid
 *    so they never get bunched into a single endless row.
 */
export const getLayoutedElements = (
  nodes: Node[],
  edges: Edge[],
  direction: 'LR' | 'TB' = 'LR'
) => {
  if (nodes.length === 0) return { nodes, edges };

  // Identify which nodes participate in edges
  const connectedNodeIds = new Set<string>();
  const validEdges = edges.filter((e) => {
    const hasSource = nodes.some((n) => n.id === e.source);
    const hasTarget = nodes.some((n) => n.id === e.target);
    if (hasSource && hasTarget) {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
      return true;
    }
    return false;
  });

  const connectedNodes = nodes.filter((n) => connectedNodeIds.has(n.id));
  const unconnectedNodes = nodes.filter((n) => !connectedNodeIds.has(n.id));

  let layoutedConnectedNodes: Node[] = [];
  let maxY = 80;
  let maxX = 80;

  if (connectedNodes.length > 0) {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    dagreGraph.setGraph({
      rankdir: direction,
      nodesep: 90,
      ranksep: 140,
      align: 'UL',
    });

    connectedNodes.forEach((node) => {
      dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    });

    validEdges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    layoutedConnectedNodes = connectedNodes.map((node) => {
      const pos = dagreGraph.node(node.id);
      if (!pos) return node;

      const x = Math.round(pos.x - NODE_WIDTH / 2);
      const y = Math.round(pos.y - NODE_HEIGHT / 2);
      if (y + NODE_HEIGHT > maxY) maxY = y + NODE_HEIGHT;
      if (x + NODE_WIDTH > maxX) maxX = x + NODE_WIDTH;

      return {
        ...node,
        position: { x, y },
      };
    });
  }

  // Layout unconnected tasks / children into a clean multi-column grid
  const columns = direction === 'TB' ? 2 : 3;
  const startX =
    connectedNodes.length > 0
      ? direction === 'TB'
        ? maxX + 120
        : 80
      : 80;
  const startY =
    connectedNodes.length > 0
      ? direction === 'TB'
        ? 80
        : maxY + 90
      : 80;

  const layoutedUnconnectedNodes = unconnectedNodes.map((node, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);

    return {
      ...node,
      position: {
        x: startX + col * (NODE_WIDTH + 60),
        y: startY + row * (NODE_HEIGHT + 60),
      },
    };
  });

  return {
    nodes: [...layoutedConnectedNodes, ...layoutedUnconnectedNodes],
    edges,
  };
};
