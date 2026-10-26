import React from 'react';
import { NodeDetailDrawer } from './NodeDetailDrawer';

export interface NodeViewDetailsModalProps {
  nodeId: string | null;
  workspaceId?: string;
  onClose: () => void;
  onNodeUpdated: () => void;
  onOpenRemarksDrawer?: (nodeId: string) => void;
}

/**
 * NodeViewDetailsModal delegates to NodeDetailDrawer to provide a single, unified,
 * responsive side panel interface with exactly 3 tabs:
 * TAB 1: Overview
 * TAB 2: Work & Evidence
 * TAB 3: Activity & Approvals
 */
export const NodeViewDetailsModal: React.FC<NodeViewDetailsModalProps> = ({
  nodeId,
  onClose,
  onNodeUpdated,
}) => {
  if (!nodeId) return null;
  return (
    <NodeDetailDrawer
      nodeId={nodeId}
      onClose={onClose}
      onNodeUpdated={onNodeUpdated}
      onDrillDown={() => {}}
    />
  );
};
