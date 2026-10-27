import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
  ConnectionLineType,
  ConnectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FlowTrackNode } from './FlowTrackNode';
import { FlowTrackEdge } from './FlowTrackEdge';
import { NodeDetailDrawer } from './NodeDetailDrawer';
import { NodeViewDetailsModal } from './NodeViewDetailsModal';
import { ProjectReportModal } from './ProjectReportModal';
import { ProjectTeamModal } from './ProjectTeamModal';
import { ProjectActivityModal } from './ProjectActivityModal';
import { FieldConfigurationModal } from '../custom-fields/FieldConfigurationModal';
import { ApiClient } from '../../services/api';
import { socketService } from '../../services/socket';
import { getLayoutedElements } from '../../utils/layout';
import { validateDependencyEdge } from '@flowtrack/shared';
import {
  getSmartViewportPosition,
  getNonOverlappingPosition,
  isNodeInViewport,
} from '../../utils/positioning';
import { parseValidViewport } from '../../utils/router';
import {
  ArrowLeft,
  Plus,
  Wand2,
  Check,
  ChevronRight,
  Layers,
  Sparkles,
  Search,
  X,
  CheckSquare,
  FileText,
  Trash2,
  Copy,
  Sliders,
  GitFork,
  ArrowDown,
  ArrowRight as ArrowRightIcon,
  Users,
  BarChart3,
  CornerDownRight,
  ThumbsUp,
  ShieldCheck,
  Lock,
  FolderKanban,
  Flag,
  AlertCircle,
  RefreshCw,
  AlertTriangle,
  History,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { getRolePermissions } from '../../utils/permissions';

interface CanvasStudioProps {
  project: any;
  onBack: () => void;
}

interface BreadcrumbItem {
  id: string | null;
  title: string;
}

export function getLogicalState(data: {
  statusCategory?: string;
  approvalStatus?: string;
  isBlocked?: boolean;
  progressPct?: number;
}): 'Open' | 'In Progress' | 'Pending Approval' | 'Changes Requested' | 'Approved/Done' | 'Blocked' {
  if (data.isBlocked || data.statusCategory === 'blocked') {
    return 'Blocked';
  }
  if (data.approvalStatus === 'pending') {
    return 'Pending Approval';
  }
  if (data.approvalStatus === 'rejected') {
    return 'Changes Requested';
  }
  if (data.statusCategory === 'done' || data.approvalStatus === 'approved') {
    return 'Approved/Done';
  }
  if (data.statusCategory === 'todo' || (data.progressPct ?? 0) === 0) {
    return 'Open';
  }
  return 'In Progress';
}

function CanvasStudioInner({ project, onBack }: CanvasStudioProps) {
  const { t } = useTranslation();
  const reactFlowInstance = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesStateChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [savedStatus, setSavedStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [nodeTypesList, setNodeTypesList] = useState<any[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Viewport persistence: read from localStorage cache or backend project settings
  const savedViewport = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const cached = localStorage.getItem(`flowtrack_viewport_${project?.id}`);
      if (cached) {
        const validated = parseValidViewport(JSON.parse(cached));
        if (validated) return validated;
      }
    } catch (e) {}

    const fromSettings = (project?.settings as any)?.viewport;
    return parseValidViewport(fromSettings);
  }, [project?.id, project?.settings]);

  const initialViewportRestoredRef = useRef(false);
  const viewportDebounceTimerRef = useRef<any>(null);
  const pendingPositionUpdatesRef = useRef<Map<string, { x: number; y: number; seq: number }>>(new Map());
  const positionSaveTimerRef = useRef<any>(null);
  const positionSequenceRef = useRef<number>(0);

  // Search & Filter State (Chunk 6)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked' | 'done'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'stage' | 'task' | 'milestone' | 'approval'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'assigned_to_me' | 'assigned_by_me' | 'unassigned'>('all');
  const [logicalStatusFilter, setLogicalStatusFilter] = useState<'all' | 'Open' | 'In Progress' | 'Pending Approval' | 'Changes Requested' | 'Approved/Done' | 'Blocked'>('all');
  const [dueDateFilter, setDueDateFilter] = useState<'all' | 'overdue' | 'due_today' | 'due_this_week'>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [teamsList, setTeamsList] = useState<any[]>([]);
  const [layoutDirection, setLayoutDirection] = useState<'LR' | 'TB'>('LR');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (assignmentFilter !== 'all') count++;
    if (logicalStatusFilter !== 'all') count++;
    if (dueDateFilter !== 'all') count++;
    if (teamFilter !== 'all') count++;
    if (typeFilter !== 'all') count++;
    if (priorityFilter !== 'all') count++;
    return count;
  }, [assignmentFilter, logicalStatusFilter, dueDateFilter, teamFilter, typeFilter, priorityFilter]);

  // Safe Delete Confirmation Modal State
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    nodeId: string;
    title: string;
    childCount: number;
    edgeCount: number;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Hierarchical Sub-Canvas Drill-Down State
  const [breadcrumbTrail, setBreadcrumbTrail] = useState<BreadcrumbItem[]>([
    { id: null, title: project?.name || 'Root Canvas' },
  ]);
  const currentParent = breadcrumbTrail[breadcrumbTrail.length - 1];

  // Selected Node for Right Drawer Details & Remarks
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Full View Details Modal (Comprehensive Task Dossier)
  const [viewDetailsNodeId, setViewDetailsNodeId] = useState<string | null>(null);

  // Project Report & Team Modals
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isFieldConfigModalOpen, setIsFieldConfigModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);

  // Quick-Add Popup Menu State (n8n signature UX)
  const [quickAddMenu, setQuickAddMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    sourceNodeId?: string | null;
  } | null>(null);

  // Right-Click Context Menu State (n8n signature UX)
  const [nodeContextMenu, setNodeContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    node: Node;
  } | null>(null);

  // Mobile Easy Node Creation State
  const [mobileCreateOpen, setMobileCreateOpen] = useState(false);
  const [mobileTitle, setMobileTitle] = useState('');
  const [mobileTypeKey, setMobileTypeKey] = useState('task');
  const [mobilePriority, setMobilePriority] = useState('MEDIUM');
  const [creatingMobileNode, setCreatingMobileNode] = useState(false);

  // Role & Permissions
  const { user, getActiveRole } = useAuthStore();
  const currentRole = getActiveRole();
  const permissions = getRolePermissions(currentRole);

  const connectingNodeId = useRef<string | null>(null);

  const nodesRef = useRef<Node[]>([]);
  nodesRef.current = nodes;
  const nodeTypesListRef = useRef<any[]>([]);
  nodeTypesListRef.current = nodeTypesList;

  // Register custom node and edge components
  const nodeTypes = useMemo(() => ({ flowNode: FlowTrackNode }), []);
  const edgeTypes = useMemo(() => ({ customEdge: FlowTrackEdge }), []);

  // Safe node deletion confirmation handler
  const promptDeleteConfirmation = useCallback(
    (nodeId: string) => {
      if (!permissions.canEditProject) {
        showToast('You do not have permission to delete tasks');
        return;
      }
      const target = nodesRef.current.find((n) => n.id === nodeId);
      if (!target) return;
      const childCount = (target.data as any)?.childCount || 0;
      const edgeCount = edges.filter((e) => e.source === nodeId || e.target === nodeId).length;
      setDeleteConfirmation({
        nodeId,
        title: (target.data as any)?.title || 'Task',
        childCount,
        edgeCount,
      });
    },
    [permissions.canEditProject, edges]
  );

  // Node deletion execution handler
  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      try {
        setSavedStatus('saving');
        await ApiClient.deleteNode(nodeId);
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
        if (selectedNodeId === nodeId) setSelectedNodeId(null);
        setNodeContextMenu(null);
        setSavedStatus('saved');
        showToast('Task deleted successfully');
      } catch (err) {
        console.error('Failed to delete node:', err);
      }
    },
    [selectedNodeId, setNodes, setEdges]
  );

  // Node duplication handler (n8n / Automa)
  const handleDuplicateNode = useCallback(
    async (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      try {
        setSavedStatus('saving');
        const typeObj =
          nodeTypesListRef.current.find((t) => t.isGroup === (node.data as any)?.isGroup) ||
          nodeTypesListRef.current[0];

        // Clean non-overlapping position offset
        const targetPos = getNonOverlappingPosition(
          { x: node.position.x + 40, y: node.position.y + 190 },
          nodesRef.current,
          'down'
        );

        await ApiClient.createNode({
          projectId: project.id,
          parentNodeId: currentParent.id,
          nodeTypeId: typeObj.id,
          title: `${(node.data as any)?.title || 'Task'} (Copy)`,
          description: (node.data as any)?.description || '',
          positionX: targetPos.x,
          positionY: targetPos.y,
          progressPct: 0,
        });
        await loadGraph();
        setNodeContextMenu(null);
        setSavedStatus('saved');
        showToast('Task duplicated');
      } catch (err) {
        console.error('Failed to duplicate node:', err);
      }
    },
    [project.id, currentParent.id]
  );

  // Add next connected task (n8n quick branch)
  const handleAddNext = useCallback(
    async (sourceNodeId: string) => {
      const sourceNode = nodesRef.current.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return;
      try {
        setSavedStatus('saving');
        const typeObj =
          nodeTypesListRef.current.find((t) => t.key === 'task') || nodeTypesListRef.current[0];

        // Place to the right without overlapping existing nodes
        const targetPos = getNonOverlappingPosition(
          { x: sourceNode.position.x + 350, y: sourceNode.position.y },
          nodesRef.current,
          'right'
        );

        const newNode = await ApiClient.createNode({
          projectId: project.id,
          parentNodeId: currentParent.id,
          nodeTypeId: typeObj.id,
          title: 'New Next Task',
          description: 'Connected task step',
          positionX: targetPos.x,
          positionY: targetPos.y,
          progressPct: 0,
        });

        await ApiClient.createEdge({
          projectId: project.id,
          sourceNodeId: sourceNode.id,
          targetNodeId: newNode.id,
          kind: 'sequence',
          metadata: {
            sourceHandle: 'right',
            targetHandle: 'left',
          },
        });

        await loadGraph();
        setNodeContextMenu(null);
        setSavedStatus('saved');
        showToast('Connected task added');
      } catch (err) {
        console.error('Failed to add next node:', err);
      }
    },
    [project.id, currentParent.id]
  );

  // Add interconnected child task directly below parent node (User Request 7)
  const handleAddChildNode = useCallback(
    async (parentNodeId: string) => {
      try {
        const parentNode = nodesRef.current.find((n) => n.id === parentNodeId);
        if (!parentNode) return;
        const typeObj =
          nodeTypesListRef.current.find((t: any) => t.key === 'task') || nodeTypesListRef.current[0];
        if (!typeObj) return;

        setSavedStatus('saving');
        const parentTitle = (parentNode.data as any)?.title || 'Task';

        // Place below parent with collision avoidance
        const targetPos = getNonOverlappingPosition(
          { x: parentNode.position.x, y: parentNode.position.y + 230 },
          nodesRef.current,
          'down'
        );

        const newNode = await ApiClient.createNode({
          projectId: project.id,
          parentNodeId: parentNode.id,
          nodeTypeId: typeObj.id,
          title: `Child: ${parentTitle.slice(0, 16)}`,
          description: `Interconnected sub-task of ${parentTitle}`,
          positionX: targetPos.x,
          positionY: targetPos.y,
          progressPct: 0,
        });

        // Interconnect parent to child with a sequence edge!
        await ApiClient.createEdge({
          projectId: project.id,
          sourceNodeId: parentNode.id,
          targetNodeId: newNode.id,
          kind: 'sequence',
          metadata: {
            sourceHandle: 'bottom',
            targetHandle: 'top',
          },
        });

        await loadGraph();
        setNodeContextMenu(null);
        setSavedStatus('saved');
        showToast('Interconnected child task added below');
      } catch (err) {
        console.error('Failed to add child node:', err);
      }
    },
    [project.id, currentParent.id]
  );

  // Like / Kudos toggle handler (User Request 8)
  const handleToggleLike = useCallback(
    async (nodeId: string) => {
      try {
        const target = nodesRef.current.find((n) => n.id === nodeId);
        if (!target) return;
        const currentLikes = (target.data as any).likes || { count: 0, users: [] };
        const newLikes = {
          count: (currentLikes.count || 0) + 1,
          users: [...(currentLikes.users || []), 'User'],
        };
        await ApiClient.updateNode(nodeId, {
          customData: {
            ...((target.data as any).customData || {}),
            likes: newLikes,
          },
        });
        await loadGraph();
        showToast('Task recognized with like 👍');
      } catch (err) {
        console.error('Failed to toggle like', err);
      }
    },
    []
  );

  // Toggle Node Confidential Lock
  const handleToggleNodeLock = useCallback(
    async (nodeId: string, locked: boolean) => {
      try {
        const target = nodesRef.current.find((n) => n.id === nodeId);
        if (!target) return;
        const currentCustom = (target.data as any).customData || {};
        const updatedCustom = {
          ...currentCustom,
          isLocked: locked,
          lockedBy: user?.fullName || 'Manager',
          lockedAt: new Date().toISOString(),
        };
        await ApiClient.updateNode(nodeId, {
          customData: updatedCustom,
          version: 1,
        });
        await loadGraph();
        showToast(locked ? '🔒 Task marked Confidential & Locked' : '🔓 Task Unlocked');
      } catch (err) {
        console.error('Failed to toggle lock', err);
      }
    },
    [user]
  );

  // Easy Mobile Node Creation Handler
  const handleMobileCreateNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mobileTitle.trim()) return;
    try {
      setCreatingMobileNode(true);
      const typeObj =
        nodeTypesListRef.current.find((t: any) => t.key === mobileTypeKey) ||
        nodeTypesListRef.current[0];
      if (!typeObj) return;

      // Position in center of current mobile viewport with collision avoidance
      const viewport = reactFlowInstance.getViewport();
      const container = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      const smartPos = getSmartViewportPosition(viewport, container, nodesRef.current);

      await ApiClient.createNode({
        projectId: project.id,
        parentNodeId: currentParent.id,
        nodeTypeId: typeObj.id,
        title: mobileTitle.trim(),
        positionX: smartPos.x,
        positionY: smartPos.y,
        priority: mobilePriority as any,
        progressPct: 0,
      });

      setMobileTitle('');
      setMobileCreateOpen(false);
      await loadGraph();
      showToast(`Task "${mobileTitle.trim()}" created on canvas`);
    } catch (err) {
      console.error('Failed to create mobile node', err);
    } finally {
      setCreatingMobileNode(false);
    }
  };

  // Edge deletion handler
  const handleDeleteEdge = useCallback(
    async (edgeId: string) => {
      try {
        setSavedStatus('saving');
        await ApiClient.deleteEdge(edgeId);
        setEdges((eds) => eds.filter((e) => e.id !== edgeId));
        setSavedStatus('saved');
        showToast('Connection removed');
      } catch (err) {
        console.error('Failed to delete edge:', err);
      }
    },
    [setEdges]
  );

  // Fetch nodes and edges for the active canvas level
  const loadGraph = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const parentId = currentParent.id;
      const [fetchedNodes, fetchedEdges, types, fetchedTeams] = await Promise.all([
        ApiClient.getNodes(project.id, parentId),
        ApiClient.getEdges(project.id),
        ApiClient.getNodeTypes(),
        ApiClient.getTeams().catch(() => []),
      ]);

      setNodeTypesList(types);
      setTeamsList(fetchedTeams || []);

      // Pre-calculate incoming blocking dependencies for each node
      const blockedNodeMap = new Map<string, number>();
      const nodeStatusMap = new Map<string, string>();
      for (const n of fetchedNodes) {
        nodeStatusMap.set(n.id, n.status?.category || 'active');
      }
      for (const e of fetchedEdges) {
        if (e.kind === 'dependency') {
          const sourceStatus = nodeStatusMap.get(e.sourceNodeId);
          if (sourceStatus !== 'done') {
            blockedNodeMap.set(e.targetNodeId, (blockedNodeMap.get(e.targetNodeId) || 0) + 1);
          }
        }
      }

      // Convert backend nodes to React Flow nodes with callbacks
      const rfNodes: Node[] = fetchedNodes.map((n: any) => {
        const isGroup = Boolean(n.nodeType?.isGroup);
        const isMilestone = Boolean(n.isMilestone || n.nodeType?.key === 'milestone');
        const isApprovalGate = Boolean(n.nodeType?.key === 'approval' || n.approvalStatus || n.customData?.approverId);
        const nodeTypeKey = n.nodeType?.key || (isMilestone ? 'milestone' : isApprovalGate ? 'approval' : isGroup ? 'stage' : 'task');

        return {
          id: n.id,
          type: 'flowNode',
          position: { x: n.positionX, y: n.positionY },
          data: {
            title: n.title,
            description: n.description,
            statusName: n.status?.labelI18n?.en || 'In Progress',
            statusCategory: n.status?.category || 'active',
            statusColour: n.status?.colour || '#3b82f6',
            progressPct: n.progressPct,
            priority: n.priority,
            nodeTypeKey,
            isGroup,
            isMilestone,
            isApprovalGate,
            approvalStatus: n.approvalStatus || n.customData?.approvalStatus || 'not_required',
            allocatedHours: n.allocatedHours,
            actualHours: n.actualHours,
            waitingCount: blockedNodeMap.get(n.id) || 0,
            isBlocked: Boolean(n.isBlocked || (blockedNodeMap.get(n.id) || 0) > 0 || n.status?.category === 'blocked'),
            blockingTaskNames: n.blockingTaskNames || [],
            childCount: n._count?.children || 0,
            docCount: n._count?.documents || 0,
            msgCount: n._count?.remarks || 0,
            dueDate: n.dueDate,
            owner: n.owner,
            ownerId: n.ownerId,
            assignedById: n.assignedById,
            assignedBy: n.assignedBy,
            assignedAt: n.assignedAt,
            reviewer: n.reviewer,
            reviewerId: n.reviewerId,
            teamId: n.teamId,
            team: n.team,
            ownerName: n.owner?.fullName || n.owner?.email || n.customData?.assigneeName,
            ownerAvatar: n.owner?.avatarUrl || n.customData?.assigneeAvatar,
            isLive: n.customData?.isLive !== undefined ? n.customData.isLive : (n.owner?.fullName ? true : false),
            lastRemark: n.remarks?.[0]?.body,
            likes: n.customData?.likes || { count: 0, users: [] },
            collaborators: n.customData?.collaboratorIds || [],
            parentTitle: n.parentNode?.title,
            isChild: !!n.parentNodeId,
            customData: n.customData || {},
            terminology: project.settings?.terminology,
            currency: project.settings?.currency || 'USD',
            canEdit: permissions.canEditProject,
            onDrillDown: (groupNode: { id: string; title: string }) => {
              setBreadcrumbTrail((prev) => [...prev, { id: groupNode.id, title: groupNode.title }]);
            },
            onSelectNode: (nodeId: string) => {
              const target = nodesRef.current.find((nd) => nd.id === nodeId);
              const isTargetLocked = Boolean((target?.data as any)?.customData?.isLocked);
              if (isTargetLocked && !permissions.canViewConfidential) {
                const lockedBy = (target?.data as any)?.customData?.lockedBy || 'Manager';
                showToast(`🔒 Task is confidential and locked by ${lockedBy}. Access restricted.`);
                return;
              }
              setSelectedNodeId(nodeId);
            },
            onViewDetails: (nodeId: string) => {
              const target = nodesRef.current.find((nd) => nd.id === nodeId);
              const isTargetLocked = Boolean((target?.data as any)?.customData?.isLocked);
              if (isTargetLocked && !permissions.canViewConfidential) {
                const lockedBy = (target?.data as any)?.customData?.lockedBy || 'Manager';
                showToast(`🔒 Task is confidential and locked by ${lockedBy}. Access restricted.`);
                return;
              }
              setSelectedNodeId(nodeId);
            },
            onAssignNode: (nodeId: string) => {
              setSelectedNodeId(nodeId);
            },
            onExtendDeadline: (nodeId: string) => {
              setSelectedNodeId(nodeId);
            },
            onDelete: (nodeId: string) => {
              promptDeleteConfirmation(nodeId);
            },
            onDuplicate: (nodeId: string) => {
              handleDuplicateNode(nodeId);
            },
            onAddNext: (nodeId: string) => {
              handleAddNext(nodeId);
            },
            onAddChild: (nodeId: string) => {
              handleAddChildNode(nodeId);
            },
            onLike: (nodeId: string) => {
              handleToggleLike(nodeId);
            },
            onToggleLock: (nodeId: string, locked: boolean) => {
              handleToggleNodeLock(nodeId, locked);
            },
          },
        };
      });

      // Filter edges that connect nodes within this active canvas level
      const currentLevelNodeIds = new Set(rfNodes.map((n) => n.id));
      const rfEdges: Edge[] = fetchedEdges
        .filter((e: any) => currentLevelNodeIds.has(e.sourceNodeId) && currentLevelNodeIds.has(e.targetNodeId))
        .map((e: any) => {
          const kind = e.kind || 'sequence';
          const isDependency = kind === 'dependency';
          const isRelated = kind === 'related';
          const strokeColor = isDependency ? '#f59e0b' : isRelated ? '#94a3b8' : '#3b82f6';
          return {
            id: e.id,
            source: e.sourceNodeId,
            target: e.targetNodeId,
            sourceHandle: (e.metadata as any)?.sourceHandle || undefined,
            targetHandle: (e.metadata as any)?.targetHandle || undefined,
            type: 'customEdge',
            animated: kind !== 'related',
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: strokeColor,
              width: 16,
              height: 16,
            },
            data: {
              kind,
              label: e.label || (kind === 'dependency' ? 'Blocking' : undefined),
              canEdit: permissions.canEditProject,
              onDelete: (edgeId: string) => handleDeleteEdge(edgeId),
              onInsert: (edgeId: string) => handleInsertNodeBetween(edgeId),
            },
          };
        });

      setNodes(rfNodes);
      setEdges(rfEdges);
    } catch (e: any) {
      console.error('Failed to load canvas data:', e);
      setLoadError(e.message || 'Failed to load canvas data');
    } finally {
      setLoading(false);
    }
  }, [
    project.id,
    project.settings,
    currentParent.id,
    permissions.canEditProject,
    permissions.canViewConfidential,
    setNodes,
    setEdges,
    promptDeleteConfirmation,
    handleDeleteEdge,
    handleDuplicateNode,
    handleAddNext,
    handleAddChildNode,
    handleToggleLike,
    handleToggleNodeLock,
  ]);

  useEffect(() => {
    loadGraph();
  }, [project.id, currentParent.id]);

  // Real-time collaborative canvas updates via Socket.io
  useEffect(() => {
    if (!project?.id) return;

    socketService.connect();
    socketService.joinProject(project.id);

    const unsubUpdated = socketService.on('node:updated', (updatedNode: any) => {
      setNodes((currentNodes) =>
        currentNodes.map((n) => {
          if (n.id === updatedNode.id) {
            return {
              ...n,
              data: {
                ...n.data,
                ...updatedNode,
                statusCategory: updatedNode.status?.category || (n.data as any).statusCategory,
                statusLabel: updatedNode.status?.labelI18n?.en || updatedNode.status?.name || (n.data as any).statusLabel,
                progressPct: updatedNode.progressPct !== undefined ? updatedNode.progressPct : (n.data as any).progressPct,
                ownerName: updatedNode.owner?.fullName || (n.data as any).ownerName,
                version: updatedNode.version || (n.data as any).version,
              },
            };
          }
          return n;
        })
      );
    });

    const unsubPositions = socketService.on('nodes:positions_updated', (positions: { id: string; positionX: number; positionY: number }[]) => {
      setNodes((currentNodes) =>
        currentNodes.map((n) => {
          const match = positions.find((p) => p.id === n.id);
          if (match) {
            return {
              ...n,
              position: { x: match.positionX, y: match.positionY },
            };
          }
          return n;
        })
      );
    });

    const unsubCreated = socketService.on('node:created', () => {
      loadGraph();
    });

    const unsubDeleted = socketService.on('node:deleted', ({ id }: { id: string }) => {
      setNodes((current) => current.filter((n) => n.id !== id));
      setEdges((current) => current.filter((e) => e.source !== id && e.target !== id));
    });

    return () => {
      unsubUpdated();
      unsubPositions();
      unsubCreated();
      unsubDeleted();
      socketService.leaveProject(project.id);
    };
  }, [project?.id, loadGraph]);

  // Validates connections in real-time, preventing self-loops, duplicate edges, and circular cycles
  const isValidConnection = useCallback(
    (connection: Connection) => {
      if (!permissions.canEditProject) return false;
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;

      // Duplicate edge check
      const duplicate = edges.some(
        (e) => e.source === connection.source && e.target === connection.target
      );
      if (duplicate) return false;

      // Cycle prevention check via @flowtrack/shared domain logic
      const currentEdges = edges.map((e) => ({
        sourceNodeId: e.source,
        targetNodeId: e.target,
        kind: (e.data as any)?.kind || 'sequence',
      }));

      const check = validateDependencyEdge(currentEdges, {
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
        kind: 'sequence',
      });

      return check.isValid;
    },
    [edges, permissions.canEditProject]
  );

  // Connect any node to any other node with cycle validation
  const onConnect = useCallback(
    async (params: Connection) => {
      if (!permissions.canEditProject) {
        showToast('You do not have permission to modify workflow connections');
        return;
      }
      if (!params.source || !params.target) return;
      if (params.source === params.target) {
        showToast('Cannot connect a task to itself');
        return;
      }

      // Check for cycles before making API call
      const currentEdges = edges.map((e) => ({
        sourceNodeId: e.source,
        targetNodeId: e.target,
        kind: (e.data as any)?.kind || 'sequence',
      }));

      const check = validateDependencyEdge(currentEdges, {
        sourceNodeId: params.source,
        targetNodeId: params.target,
        kind: 'sequence',
      });

      if (!check.isValid) {
        showToast(check.error || 'Cannot connect: circular dependency cycle detected');
        return;
      }

      try {
        setSavedStatus('saving');
        const sourceHandle = params.sourceHandle || 'right';
        const targetHandle = params.targetHandle || 'left';

        const newEdge = await ApiClient.createEdge({
          projectId: project.id,
          sourceNodeId: params.source,
          targetNodeId: params.target,
          kind: 'sequence',
          metadata: {
            sourceHandle,
            targetHandle,
          },
        });

        const edgeObj: Edge = {
          ...params,
          id: newEdge.id,
          source: params.source,
          target: params.target,
          sourceHandle,
          targetHandle,
          type: 'customEdge',
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#3b82f6',
            width: 16,
            height: 16,
          },
          data: {
            kind: newEdge.kind || 'sequence',
            canEdit: permissions.canEditProject,
            onDelete: (edgeId: string) => handleDeleteEdge(edgeId),
            onInsert: (edgeId: string) => handleInsertNodeBetween(edgeId),
          },
        };

        setEdges((eds) => addEdge(edgeObj, eds));
        setSavedStatus('saved');
        showToast('Steps connected');
      } catch (err: any) {
        console.error('Failed to create edge:', err);
        showToast(err.message || 'Failed to connect steps');
        setSavedStatus('error');
      }
    },
    [project.id, permissions.canEditProject, edges, setEdges, handleDeleteEdge]
  );

  // Debounced, race-condition-safe position persistence
  const flushPendingPositionUpdates = useCallback(async () => {
    if (pendingPositionUpdatesRef.current.size === 0) {
      setSavedStatus('saved');
      return;
    }

    const entriesToSave = Array.from(pendingPositionUpdatesRef.current.entries());
    pendingPositionUpdatesRef.current.clear();

    try {
      setSavedStatus('saving');
      await Promise.all(
        entriesToSave.map(async ([nodeId, { x, y }]) => {
          // Omit hardcoded version so backend optimistic check succeeds cleanly
          await ApiClient.updateNode(nodeId, {
            positionX: x,
            positionY: y,
          });
        })
      );
      if (pendingPositionUpdatesRef.current.size === 0) {
        setSavedStatus('saved');
        setSaveErrorMessage(null);
      }
    } catch (err: any) {
      console.error('Failed to persist node position(s):', err);
      // Re-queue failed positions so user can retry without losing their work
      for (const [nodeId, data] of entriesToSave) {
        if (!pendingPositionUpdatesRef.current.has(nodeId)) {
          pendingPositionUpdatesRef.current.set(nodeId, data);
        }
      }
      setSavedStatus('error');
      setSaveErrorMessage(err.message || 'Failed to save node positions');
      showToast('Position autosave failed. Click Retry in the header.');
    }
  }, []);

  const retryPendingSaves = useCallback(async () => {
    await flushPendingPositionUpdates();
  }, [flushPendingPositionUpdates]);

  // Persist node position on drag stop with debouncing and conflict safety
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!permissions.canEditProject) return;

      const seq = ++positionSequenceRef.current;
      pendingPositionUpdatesRef.current.set(node.id, {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
        seq,
      });

      setSavedStatus('saving');
      setSaveErrorMessage(null);

      if (positionSaveTimerRef.current) {
        clearTimeout(positionSaveTimerRef.current);
      }

      positionSaveTimerRef.current = setTimeout(async () => {
        await flushPendingPositionUpdates();
      }, 300);
    },
    [permissions.canEditProject, flushPendingPositionUpdates]
  );

  // Persist canvas viewport on pan / zoom stop
  const onViewportMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, newViewport: { x: number; y: number; zoom: number }) => {
      if (
        !newViewport ||
        !Number.isFinite(newViewport.x) ||
        !Number.isFinite(newViewport.y) ||
        !Number.isFinite(newViewport.zoom)
      ) {
        return;
      }

      // 1. Instant local persistence for page refresh restoration
      try {
        localStorage.setItem(`flowtrack_viewport_${project.id}`, JSON.stringify(newViewport));
      } catch (e) {}

      // 2. Debounced backend persistence to project settings (if authorized)
      if (permissions.canEditProject) {
        if (viewportDebounceTimerRef.current) {
          clearTimeout(viewportDebounceTimerRef.current);
        }
        viewportDebounceTimerRef.current = setTimeout(async () => {
          try {
            await ApiClient.updateProject(project.id, {
              settings: {
                ...(project.settings || {}),
                viewport: newViewport,
              },
            });
          } catch (e) {
            console.warn('Failed to persist canvas viewport to project settings:', e);
          }
        }, 1000);
      }
    },
    [project.id, project.settings, permissions.canEditProject]
  );

  // Restore viewport once nodes are loaded
  useEffect(() => {
    if (!loading && savedViewport && !initialViewportRestoredRef.current && currentParent.id === null) {
      initialViewportRestoredRef.current = true;
      try {
        reactFlowInstance.setViewport(savedViewport, { duration: 0 });
      } catch (e) {}
    }
  }, [loading, savedViewport, currentParent.id, reactFlowInstance]);

  // Unsaved changes guard: alert before leaving tab if pending edits exist
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingPositionUpdatesRef.current.size > 0 || savedStatus === 'saving') {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (positionSaveTimerRef.current) {
        clearTimeout(positionSaveTimerRef.current);
      }
      if (viewportDebounceTimerRef.current) {
        clearTimeout(viewportDebounceTimerRef.current);
      }
    };
  }, [savedStatus]);

  // Clean back navigation with pending edits flush
  const handleBackToProjects = useCallback(async () => {
    if (pendingPositionUpdatesRef.current.size > 0) {
      await flushPendingPositionUpdates();
    }
    onBack();
  }, [flushPendingPositionUpdates, onBack]);

  // Search and Filter logic with visual dimming (Chunk 6)
  const displayedNodes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000;
    const weekEnd = todayStart + 7 * 24 * 60 * 60 * 1000;

    const hasFilter =
      q !== '' ||
      statusFilter !== 'all' ||
      typeFilter !== 'all' ||
      priorityFilter !== 'all' ||
      assignmentFilter !== 'all' ||
      logicalStatusFilter !== 'all' ||
      dueDateFilter !== 'all' ||
      teamFilter !== 'all';

    if (!hasFilter) return nodes;

    return nodes.map((node) => {
      const data = node.data as any;
      let matches = true;

      if (q) {
        const titleMatch = (data.title || '').toLowerCase().includes(q);
        const descMatch = (data.description || '').toLowerCase().includes(q);
        const ownerMatch = (data.ownerName || '').toLowerCase().includes(q);
        matches = matches && (titleMatch || descMatch || ownerMatch);
      }

      if (statusFilter !== 'all') {
        matches = matches && data.statusCategory === statusFilter;
      }

      if (typeFilter !== 'all') {
        if (typeFilter === 'stage') matches = matches && Boolean(data.isGroup);
        else if (typeFilter === 'milestone') matches = matches && Boolean(data.isMilestone);
        else if (typeFilter === 'approval') matches = matches && Boolean(data.isApprovalGate);
        else if (typeFilter === 'task') {
          matches = matches && !data.isGroup && !data.isMilestone && !data.isApprovalGate;
        }
      }

      if (priorityFilter !== 'all') {
        matches = matches && data.priority === priorityFilter;
      }

      // Assignment filters (Chunk 6)
      if (assignmentFilter === 'assigned_to_me') {
        matches = matches && (data.ownerId === user?.id || data.owner?.id === user?.id);
      } else if (assignmentFilter === 'assigned_by_me') {
        matches = matches && (data.assignedById === user?.id || data.assignedBy?.id === user?.id);
      } else if (assignmentFilter === 'unassigned') {
        matches = matches && !data.ownerId && !data.owner?.id;
      }

      // Logical status filter mapping (Chunk 6)
      if (logicalStatusFilter !== 'all') {
        const logicalState = getLogicalState(data);
        matches = matches && logicalState === logicalStatusFilter;
      }

      // Team filter (Chunk 6)
      if (teamFilter !== 'all') {
        matches = matches && data.teamId === teamFilter;
      }

      // Due date filter (Chunk 6)
      if (dueDateFilter !== 'all') {
        if (!data.dueDate) {
          matches = false;
        } else {
          const dueTime = new Date(data.dueDate).getTime();
          if (dueDateFilter === 'overdue') {
            matches = matches && dueTime < now.getTime() && data.statusCategory !== 'done';
          } else if (dueDateFilter === 'due_today') {
            matches = matches && dueTime >= todayStart && dueTime <= todayEnd;
          } else if (dueDateFilter === 'due_this_week') {
            matches = matches && dueTime >= todayStart && dueTime <= weekEnd;
          }
        }
      }

      return {
        ...node,
        style: {
          ...node.style,
          opacity: matches ? 1 : 0.22,
          filter: matches ? 'none' : 'grayscale(80%)',
          pointerEvents: matches ? 'all' : 'none',
          transition: 'opacity 0.2s ease, filter 0.2s ease',
        },
      };
    });
  }, [
    nodes,
    searchQuery,
    statusFilter,
    typeFilter,
    priorityFilter,
    assignmentFilter,
    logicalStatusFilter,
    dueDateFilter,
    teamFilter,
    user?.id,
  ]);

  // Insert a node between two connected nodes (n8n signature feature)
  const handleInsertNodeBetween = async (edgeId: string) => {
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;

    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    if (!sourceNode || !targetNode) return;

    try {
      setSavedStatus('saving');
      const midX = Math.round((sourceNode.position.x + targetNode.position.x) / 2);
      const midY = Math.round((sourceNode.position.y + targetNode.position.y) / 2);

      const typeObj = nodeTypesList.find((t) => t.key === 'task') || nodeTypesList[0];
      const newNodeRes = await ApiClient.createNode({
        projectId: project.id,
        parentNodeId: currentParent.id,
        nodeTypeId: typeObj.id,
        title: 'Inserted Task',
        description: 'Inserted between steps',
        positionX: midX,
        positionY: midY,
        progressPct: 0,
      });

      // Delete old edge
      await ApiClient.deleteEdge(edgeId);

      // Create two new edges: source -> new and new -> target
      await Promise.all([
        ApiClient.createEdge({ projectId: project.id, sourceNodeId: sourceNode.id, targetNodeId: newNodeRes.id }),
        ApiClient.createEdge({ projectId: project.id, sourceNodeId: newNodeRes.id, targetNodeId: targetNode.id }),
      ]);

      await loadGraph();
      setSavedStatus('saved');
      showToast('Task inserted on edge');
    } catch (err) {
      console.error('Failed to insert node on edge:', err);
    }
  };

  // Quick Add Node (with optional auto-connection from a source node)
  const handleAddNode = async (
    typeKey: string = 'task',
    positionOverride?: { x: number; y: number },
    sourceNodeToConnect?: string | null
  ) => {
    if (!permissions.canEditProject) {
      showToast('You do not have permission to add workflow items');
      return;
    }

    const isStage = typeKey === 'stage';
    const isMilestone = typeKey === 'milestone';
    const isApproval = typeKey === 'approval';

    const typeObj =
      nodeTypesList.find((t) => t.key === typeKey) ||
      nodeTypesList.find((t) => (isStage ? t.isGroup : !t.isGroup)) ||
      nodeTypesList[0];

    if (!typeObj) return;

    try {
      setSavedStatus('saving');
      let posX: number;
      let posY: number;

      if (positionOverride) {
        posX = Math.round(positionOverride.x);
        posY = Math.round(positionOverride.y);
      } else {
        const viewport = reactFlowInstance.getViewport();
        const container = {
          width: window.innerWidth,
          height: Math.max(400, window.innerHeight - 112),
        };
        const smartPos = getSmartViewportPosition(viewport, container, nodesRef.current);
        posX = smartPos.x;
        posY = smartPos.y;
      }

      const titlePrefix = isMilestone
        ? 'Project Milestone Sign-Off'
        : isApproval
        ? 'Approval Gate Review'
        : isStage
        ? 'Stage Phase Group'
        : `New ${typeObj.name || 'Task'} Item`;

      const created = await ApiClient.createNode({
        projectId: project.id,
        parentNodeId: currentParent.id,
        nodeTypeId: typeObj.id,
        title: titlePrefix,
        description: currentParent.id ? `Child item of ${currentParent.title}` : 'Configure details in side panel',
        positionX: posX,
        positionY: posY,
        progressPct: 0,
        isMilestone: isMilestone ? true : false,
      });

      // If source node was provided (dragged from handle onto empty space), auto-connect!
      if (sourceNodeToConnect) {
        await ApiClient.createEdge({
          projectId: project.id,
          sourceNodeId: sourceNodeToConnect,
          targetNodeId: created.id,
          kind: isMilestone || isApproval ? 'dependency' : 'sequence',
          metadata: {
            sourceHandle: 'right',
            targetHandle: 'left',
          },
        });
      }

      await loadGraph();

      // Ensure newly created node is framed in view if partially off-screen
      const currentViewport = reactFlowInstance.getViewport();
      const containerDims = {
        width: window.innerWidth,
        height: Math.max(400, window.innerHeight - 112),
      };
      if (!isNodeInViewport({ x: posX, y: posY }, currentViewport, containerDims)) {
        reactFlowInstance.setCenter(posX + 144, posY + 90, {
          duration: 350,
          zoom: currentViewport.zoom,
        });
      }

      setSavedStatus('saved');
      setQuickAddMenu(null);
      showToast(isMilestone ? 'Milestone added' : isApproval ? 'Approval Gate added' : 'Task added');
    } catch (err: any) {
      console.error('Failed to add node:', err);
      showToast(err.message || 'Failed to add node');
      setSavedStatus('saved');
    }
  };

  // Safe Keyboard shortcut deletion with confirmation check
  const onNodesDelete = useCallback(
    async (deletedNodes: Node[]) => {
      if (deletedNodes.length === 1) {
        promptDeleteConfirmation(deletedNodes[0].id);
      } else {
        for (const n of deletedNodes) {
          await handleDeleteNode(n.id);
        }
      }
    },
    [promptDeleteConfirmation, handleDeleteNode]
  );

  // Global Keyboard Shortcuts (Ctrl+F search, Delete safe delete, Esc dismiss, Ctrl+D duplicate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') {
        return;
      }

      // Ctrl+F / Cmd+F: Focus canvas search input
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const searchInput = document.getElementById('canvas-search-input');
        if (searchInput) searchInput.focus();
      }

      // Escape: Dismiss active menus and selection
      if (e.key === 'Escape') {
        setQuickAddMenu(null);
        setNodeContextMenu(null);
        setDeleteConfirmation(null);
        setSelectedNodeId(null);
      }

      // Ctrl+D: Duplicate active selected task
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedNodeId) {
        e.preventDefault();
        handleDuplicateNode(selectedNodeId);
      }

      // Delete / Backspace: Safe confirmation prompt
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        e.preventDefault();
        promptDeleteConfirmation(selectedNodeId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, handleDuplicateNode, promptDeleteConfirmation]);

  const onEdgesDelete = useCallback(
    async (deletedEdges: Edge[]) => {
      for (const e of deletedEdges) {
        await handleDeleteEdge(e.id);
      }
    },
    [handleDeleteEdge]
  );

  // Drag from handle onto empty space (n8n signature UX)
  const onConnectStart = useCallback((_: any, { nodeId }: any) => {
    connectingNodeId.current = nodeId;
  }, []);

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      // Check if dropped on empty canvas space (not directly on another node or handle)
      const targetEl = event.target as Element | null;
      const hitNodeOrHandle = targetEl?.closest('.react-flow__node, .react-flow__handle');

      if (!hitNodeOrHandle && connectingNodeId.current) {
        const clientX = 'clientX' in event ? event.clientX : event.touches[0].clientX;
        const clientY = 'clientY' in event ? event.clientY : event.touches[0].clientY;

        setQuickAddMenu({
          visible: true,
          x: clientX,
          y: clientY,
          sourceNodeId: connectingNodeId.current,
        });
      }
      connectingNodeId.current = null;
    },
    []
  );

  // Double click canvas to open Quick-Add (n8n style)
  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      setQuickAddMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        sourceNodeId: null,
      });
      setNodeContextMenu(null);
    },
    []
  );

  // Right-click context menu on node (n8n signature UX)
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setNodeContextMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        node,
      });
      setQuickAddMenu(null);
    },
    []
  );

  // True Hierarchical Dagre Auto-Layout ("Tidy Up")
  // Supports both Left-to-Right ('LR') workflow and Top-to-Bottom ('TB') tree hierarchy
  const handleTidyUp = (direction: 'LR' | 'TB' = 'LR') => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, direction);
    setNodes([...layoutedNodes]);
    setEdges([...layoutedEdges]);

    // Persist new layouted positions to backend
    ApiClient.batchUpdatePositions(
      layoutedNodes.map((n) => ({
        id: n.id,
        positionX: n.position.x,
        positionY: n.position.y,
        version: 1,
      }))
    ).catch(console.error);

    showToast(
      direction === 'LR'
        ? 'Canvas organized (Horizontal Flow)'
        : 'Canvas organized (Tree Hierarchy)'
    );
  };

  // Navigate breadcrumb
  const handleBreadcrumbClick = (index: number) => {
    setBreadcrumbTrail((prev) => prev.slice(0, index + 1));
  };

  return (
    <div className="h-[calc(100dvh-64px)] flex flex-col bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      {/* Top Studio Action Bar */}
      <div className="h-12 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <button
            id="canvas-back-btn"
            onClick={handleBackToProjects}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            Projects
          </button>
          <span className="text-slate-300 dark:text-slate-700">|</span>

          {/* Active Project Identification Badge */}
          <div
            id="canvas-active-project-badge"
            className="flex items-center gap-2 px-2.5 py-1 bg-blue-50/90 dark:bg-blue-950/70 border border-blue-200/90 dark:border-blue-900 rounded-xl shrink-0 shadow-xs"
            title={`Active Project: ${project?.name || 'FlowTrack Project'}`}
          >
            <FolderKanban className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 hidden sm:inline">
                Project:
              </span>
              <span className="text-xs font-black text-slate-900 dark:text-white truncate max-w-[130px] sm:max-w-[200px] md:max-w-[300px]">
                {project?.name || 'Untitled Project'}
              </span>
            </div>
          </div>
          <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">|</span>

          {/* Hierarchical Breadcrumb Navigation */}
          <div className="flex items-center gap-1 text-xs font-semibold">
            {breadcrumbTrail.map((crumb, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                <button
                  onClick={() => handleBreadcrumbClick(idx)}
                  className={`px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
                    idx === breadcrumbTrail.length - 1
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {crumb.title}
                </button>
              </React.Fragment>
            ))}
          </div>

          <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap hidden md:inline">
            ({nodes.length} nodes, {edges.length} edges)
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Quick Node Type Buttons */}
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => handleAddNode('task')}
              className="px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 rounded-lg shadow-sm transition-all flex items-center gap-1"
            >
              <Plus className="w-3 h-3 text-blue-500" />
              + Task
            </button>
            <button
              onClick={() => handleAddNode('stage')}
              className="px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 rounded-lg shadow-sm transition-all flex items-center gap-1"
            >
              <Layers className="w-3 h-3 text-purple-500" />
              + Stage Group
            </button>
            <button
              onClick={() => setIsTeamModalOpen(true)}
              className="px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 rounded-lg shadow-sm transition-all flex items-center gap-1"
              title="Manage Team & Multi-User Collaboration"
            >
              <Users className="w-3.5 h-3.5 text-blue-500" />
              Team
            </button>
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 rounded-lg shadow-sm transition-all flex items-center gap-1"
              title="Full Project Dossier & Status Extraction Report"
            >
              <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
              Report
            </button>
            {['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(currentRole) && (
              <button
                id="canvas-custom-fields-btn"
                onClick={() => setIsFieldConfigModalOpen(true)}
                className="px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 rounded-lg shadow-sm transition-all flex items-center gap-1"
                title="Configure Custom Fields & Dynamic Form Schemas"
              >
                <Sliders className="w-3.5 h-3.5 text-emerald-500" />
                Fields
              </button>
            )}
            <button
              id="canvas-activity-history-btn"
              onClick={() => setIsActivityModalOpen(true)}
              className="px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 rounded-lg shadow-sm transition-all flex items-center gap-1"
              title="Project Activity Stream & Audit Trail"
            >
              <History className="w-3.5 h-3.5 text-purple-500" />
              Activity
            </button>
          </div>

          {/* Tidy Up Auto Layout Buttons (Super Admin Exclusive Layout Editor) */}
          {permissions.canEditLayout ? (
            <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800/60 p-0.5">
              <button
                id="canvas-tidy-up-btn"
                onClick={() => handleTidyUp('LR')}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="Auto-organize: Horizontal Workflow (Super Admin)"
              >
                <Wand2 className="w-3.5 h-3.5 text-blue-500" />
                <span>Tidy Flow</span>
                <ArrowRightIcon className="w-3 h-3 text-slate-400" />
              </button>

              <button
                id="canvas-tidy-up-tree-btn"
                onClick={() => handleTidyUp('TB')}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors border-l border-slate-200 dark:border-slate-700"
                title="Auto-organize: Tree Hierarchy (Super Admin)"
              >
                <GitFork className="w-3.5 h-3.5 text-purple-500" />
                <span>Tree</span>
                <ArrowDown className="w-3 h-3 text-slate-400" />
              </button>
            </div>
          ) : (
            <div
              className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-xl border border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-400"
              title="Layout design alteration is restricted to Super Admin"
            >
              <Lock className="w-3 h-3 text-slate-400" />
              <span>Layout Locked</span>
            </div>
          )}

          {/* Auto-save & persistence badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
              savedStatus === 'saving'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-600 dark:text-amber-400'
                : savedStatus === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {savedStatus === 'saving' ? (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            ) : savedStatus === 'error' ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            ) : (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            )}
            <span>
              {savedStatus === 'saving'
                ? 'Saving...'
                : savedStatus === 'error'
                ? 'Save failed'
                : 'Saved'}
            </span>
            {savedStatus === 'error' && (
              <button
                onClick={retryPendingSaves}
                className="ml-1 px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-200 hover:bg-rose-200 text-[10px] font-bold uppercase tracking-wider"
                title={saveErrorMessage || 'Click to retry saving'}
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 z-10 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[150px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="canvas-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter tasks, owners, keywords..."
              className="w-full pl-8 pr-7 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Mobile Filter Toggle Button (< sm screens) */}
          <button
            id="canvas-mobile-filters-toggle-btn"
            type="button"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className={`sm:hidden px-2.5 py-1 min-h-[36px] rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors shrink-0 ${
              activeFilterCount > 0
                ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-400 text-blue-600 dark:text-blue-300 font-bold'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
            title="Toggle Filter Options"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-extrabold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Dropdown Filters Container (Inline on >=sm, Collapsible Drawer on <sm) */}
          <div className={`${showMobileFilters ? 'flex' : 'hidden'} sm:flex flex-wrap items-center gap-2 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800`}>
            {/* Assignment Filter */}
            <select
              value={assignmentFilter}
              onChange={(e: any) => setAssignmentFilter(e.target.value)}
              className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-medium text-slate-700 dark:text-slate-200 focus:outline-none"
              title="Filter by task assignment"
            >
              <option value="all">All Assignments</option>
              <option value="assigned_to_me">👤 Assigned to Me</option>
              <option value="assigned_by_me">📋 Assigned by Me</option>
              <option value="unassigned">⚪ Unassigned</option>
            </select>

            {/* Logical Workflow Status Filter */}
            <select
              value={logicalStatusFilter}
              onChange={(e: any) => setLogicalStatusFilter(e.target.value)}
              className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-medium text-slate-700 dark:text-slate-200 focus:outline-none"
              title="Filter by logical workflow state"
            >
              <option value="all">All Workflow States</option>
              <option value="Open">🔵 Open</option>
              <option value="In Progress">🟡 In Progress</option>
              <option value="Pending Approval">⏳ Pending Approval</option>
              <option value="Changes Requested">⚠️ Changes Requested</option>
              <option value="Approved/Done">✅ Approved / Done</option>
              <option value="Blocked">🚫 Blocked</option>
            </select>

            {/* Due Date Filter */}
            <select
              value={dueDateFilter}
              onChange={(e: any) => setDueDateFilter(e.target.value)}
              className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-medium text-slate-700 dark:text-slate-200 focus:outline-none"
              title="Filter by deadline status"
            >
              <option value="all">All Due Dates</option>
              <option value="overdue">🔴 Overdue</option>
              <option value="due_today">🟠 Due Today</option>
              <option value="due_this_week">📅 Due This Week</option>
            </select>

            {/* Team Scope Filter */}
            {teamsList.length > 0 && (
              <select
                value={teamFilter}
                onChange={(e: any) => setTeamFilter(e.target.value)}
                className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-medium text-slate-700 dark:text-slate-200 focus:outline-none"
                title="Filter by assigned team"
              >
                <option value="all">All Teams</option>
                {teamsList.map((tm: any) => (
                  <option key={tm.id} value={tm.id}>
                    👥 {tm.name}
                  </option>
                ))}
              </select>
            )}

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e: any) => setTypeFilter(e.target.value)}
              className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-medium text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">All Types</option>
              <option value="task">Tasks</option>
              <option value="stage">Stage Groups</option>
              <option value="milestone">Milestones</option>
              <option value="approval">Approval Gates</option>
            </select>

            {/* Priority Filter */}
            <select
              value={priorityFilter}
              onChange={(e: any) => setPriorityFilter(e.target.value)}
              className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-medium text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">All Priorities</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            {/* Reset Filters */}
            {(searchQuery || statusFilter !== 'all' || typeFilter !== 'all' || priorityFilter !== 'all' || assignmentFilter !== 'all' || logicalStatusFilter !== 'all' || dueDateFilter !== 'all' || teamFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setTypeFilter('all');
                  setPriorityFilter('all');
                  setAssignmentFilter('all');
                  setLogicalStatusFilter('all');
                  setDueDateFilter('all');
                  setTeamFilter('all');
                }}
                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline px-1 py-1"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* View helpers & Fit */}
        <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
          <span className="hidden lg:inline text-slate-400">
            {nodes.length > 0 && `${displayedNodes.filter((n) => n.style?.opacity !== 0.22).length} of ${nodes.length} visible`}
          </span>
          <button
            onClick={() => reactFlowInstance.fitView({ padding: 0.2, duration: 400 })}
            className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-semibold border border-slate-200 dark:border-slate-700 flex items-center gap-1 transition-all"
            title="Fit canvas to view"
          >
            <Sparkles className="w-3 h-3 text-blue-500" />
            <span>Fit View</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 w-full h-full relative">
        {/* Load Error State */}
        {loadError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-rose-50 dark:bg-rose-950/90 border border-rose-300 dark:border-rose-800 rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-lg max-w-md">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <div className="text-xs text-rose-800 dark:text-rose-200 font-medium">
              <span>{loadError}</span>
            </div>
            <button
              onClick={loadGraph}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 shadow-xs"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        )}

        {/* Empty Canvas Welcome Overlay */}
        {!loading && !loadError && nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 px-4">
            <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl max-w-md text-center pointer-events-auto space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 mx-auto shadow-inner">
                <FolderKanban className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Workflow Canvas is Empty
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Start designing your universal project workflow. Add stage phases, tasks, milestones, or approval gates to begin organizing.
                </p>
              </div>

              {permissions.canEditProject ? (
                <div className="grid grid-cols-2 gap-2 pt-1 text-left">
                  <button
                    onClick={() => handleAddNode('stage')}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:border-blue-300 transition-all group"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 dark:text-slate-200 group-hover:text-blue-600">
                      <Layers className="w-4 h-4 text-purple-500" />
                      + Stage Group
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">High-level project phases</p>
                  </button>

                  <button
                    onClick={() => handleAddNode('task')}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:border-blue-300 transition-all group"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 dark:text-slate-200 group-hover:text-blue-600">
                      <Plus className="w-4 h-4 text-blue-500" />
                      + Task Step
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">Actionable work package</p>
                  </button>

                  <button
                    onClick={() => handleAddNode('milestone')}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300 transition-all group"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 dark:text-slate-200 group-hover:text-amber-600">
                      <Flag className="w-4 h-4 text-amber-500" />
                      + Milestone
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">Key completion target</p>
                  </button>

                  <button
                    onClick={() => handleAddNode('approval')}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:border-emerald-300 transition-all group"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 dark:text-slate-200 group-hover:text-emerald-600">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      + Approval Gate
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">Formal sign-off step</p>
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs text-slate-500 flex items-center justify-center gap-2">
                  <Lock className="w-4 h-4 text-slate-400" />
                  <span>View-only mode. Contact project manager to edit.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mr-3"></div>
            <span className="text-xs font-semibold">Loading node canvas...</span>
          </div>
        ) : (
          <ReactFlow
            nodes={displayedNodes as any}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesStateChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            isValidConnection={isValidConnection as any}
            onNodeDragStop={onNodeDragStop as any}
            nodesDraggable={permissions.canEditProject}
            nodesConnectable={permissions.canEditProject}
            elementsSelectable={true}
            edgesFocusable={true}
            edgesReconnectable={true}
            preventScrolling={true}
            zoomOnPinch={true}
            panOnDrag={true}
            panOnScroll={false}
            autoPanOnNodeDrag={true}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={35}
            connectionLineType={ConnectionLineType.Bezier}
            connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 3 }}
            onDoubleClick={onPaneDoubleClick}
            onNodeContextMenu={onNodeContextMenu}
            onPaneClick={() => {
              setQuickAddMenu(null);
              setNodeContextMenu(null);
            }}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            deleteKeyCode={['Backspace', 'Delete']}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView={!savedViewport}
            defaultViewport={savedViewport || { x: 0, y: 0, zoom: 0.85 }}
            onMoveEnd={onViewportMoveEnd}
            minZoom={0.2}
            maxZoom={2}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.5}
              color="#94a3b8"
              className="opacity-40"
            />
            <Controls className="hidden sm:flex !bg-white dark:!bg-slate-900 !border !border-slate-200 dark:!border-slate-800 !rounded-xl !shadow-lg" />
            <MiniMap
              nodeColor={() => '#3b82f6'}
              className="hidden sm:block !bg-white dark:!bg-slate-900 !border !border-slate-200 dark:!border-slate-800 !rounded-xl !shadow-lg"
              zoomable
              pannable
            />
          </ReactFlow>
        )}

        {/* Right-Click Node Context Menu (n8n / Automa Signature UX) */}
        {nodeContextMenu && nodeContextMenu.visible && (
          <div
            style={{
              position: 'fixed',
              top: Math.max(12, Math.min(window.innerHeight - 260, nodeContextMenu.y)),
              left: Math.max(12, Math.min(window.innerWidth - 240, nodeContextMenu.x)),
            }}
            className="w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2.5 py-1 mb-1 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span className="truncate max-w-[140px]">
                {nodeContextMenu.node.data.title as string}
              </span>
              <button
                onClick={() => setNodeContextMenu(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-0.5 text-xs font-semibold">
              <button
                onClick={() => {
                  setSelectedNodeId(nodeContextMenu.node.id);
                  setNodeContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 flex items-center gap-2"
              >
                <Sliders className="w-3.5 h-3.5 text-blue-500" />
                <span>Open Details & Remarks</span>
              </button>

              <button
                onClick={() => {
                  handleAddNext(nodeContextMenu.node.id);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-500" />
                <span>Add Connected Task</span>
              </button>

              <button
                onClick={() => {
                  handleDuplicateNode(nodeContextMenu.node.id);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
              >
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Duplicate Task</span>
              </button>

              {Boolean((nodeContextMenu.node.data as any)?.isGroup) && (
                <button
                  onClick={() => {
                    setBreadcrumbTrail((prev) => [
                      ...prev,
                      {
                        id: nodeContextMenu.node.id,
                        title: (nodeContextMenu.node.data as any)?.title || 'Sub-Canvas',
                      },
                    ]);
                    setNodeContextMenu(null);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/40 flex items-center gap-2"
                >
                  <Layers className="w-3.5 h-3.5 text-purple-500" />
                  <span>Drill Down to Sub-Canvas</span>
                </button>
              )}

              <div className="h-[1px] bg-slate-100 dark:bg-slate-800 my-1" />

              {/* Red Delete option with safe confirmation */}
              <button
                onClick={() => {
                  const nodeId = nodeContextMenu.node.id;
                  setNodeContextMenu(null);
                  promptDeleteConfirmation(nodeId);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 flex items-center justify-between font-bold"
              >
                <div className="flex items-center gap-2">
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  <span>Delete Task</span>
                </div>
                <span className="text-[10px] text-rose-400 font-mono">Del</span>
              </button>
            </div>
          </div>
        )}

        {/* Quick-Add Context Menu (n8n / Automa Signature UX) */}
        {quickAddMenu && quickAddMenu.visible && (
          <div
            style={{
              position: 'fixed',
              top: Math.max(12, Math.min(window.innerHeight - 280, quickAddMenu.y)),
              left: Math.max(12, Math.min(window.innerWidth - 240, quickAddMenu.x)),
            }}
            className="w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <span>Add Node</span>
              <button
                onClick={() => setQuickAddMenu(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1">
              <button
                onClick={() => {
                  const pos = reactFlowInstance.screenToFlowPosition({ x: quickAddMenu.x, y: quickAddMenu.y });
                  handleAddNode('task', pos, quickAddMenu.sourceNodeId);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 flex items-center gap-2"
              >
                <CheckSquare className="w-4 h-4 text-blue-500" />
                Regular Task
              </button>

              <button
                onClick={() => {
                  const pos = reactFlowInstance.screenToFlowPosition({ x: quickAddMenu.x, y: quickAddMenu.y });
                  handleAddNode('stage', pos, quickAddMenu.sourceNodeId);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-600 flex items-center gap-2"
              >
                <Layers className="w-4 h-4 text-purple-500" />
                Stage / Group
              </button>

              <button
                onClick={() => {
                  const pos = reactFlowInstance.screenToFlowPosition({ x: quickAddMenu.x, y: quickAddMenu.y });
                  handleAddNode('milestone', pos, quickAddMenu.sourceNodeId);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-600 flex items-center gap-2"
              >
                <Flag className="w-4 h-4 text-amber-500" />
                Milestone Target
              </button>

              <button
                onClick={() => {
                  const pos = reactFlowInstance.screenToFlowPosition({ x: quickAddMenu.x, y: quickAddMenu.y });
                  handleAddNode('approval', pos, quickAddMenu.sourceNodeId);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-emerald-500" />
                Approval Sign-Off
              </button>

              <button
                onClick={() => {
                  const pos = reactFlowInstance.screenToFlowPosition({ x: quickAddMenu.x, y: quickAddMenu.y });
                  handleAddNode('doc_request', pos, quickAddMenu.sourceNodeId);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-600 flex items-center gap-2"
              >
                <FileText className="w-4 h-4 text-amber-500" />
                Document Checkpoint
              </button>
            </div>
          </div>
        )}

        {/* Mobile Floating Action Controls (Easy touch access on mobile screens) */}
        <div className="sm:hidden absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl mb-safe">
          <button
            id="mobile-add-task-btn"
            onClick={() => setMobileCreateOpen(true)}
            className="px-3.5 py-2 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/25 active:scale-95 transition-all"
            title="Create Task on Mobile"
            aria-label="Add Task on Mobile"
          >
            <Plus className="w-4 h-4" />
            <span>Add</span>
          </button>

          <button
            id="mobile-zoom-in-btn"
            onClick={() => reactFlowInstance.zoomIn({ duration: 250 })}
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors"
            title="Zoom In"
            aria-label="Zoom In"
          >
            <Plus className="w-4 h-4" />
          </button>

          <button
            id="mobile-zoom-out-btn"
            onClick={() => reactFlowInstance.zoomOut({ duration: 250 })}
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors"
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <span className="text-base leading-none">−</span>
          </button>

          <button
            id="mobile-fit-view-btn"
            onClick={() => reactFlowInstance.fitView({ padding: 0.2, duration: 400 })}
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors"
            title="Fit view on mobile"
            aria-label="Fit view on mobile"
          >
            <Sparkles className="w-4 h-4 text-blue-500" />
          </button>

          <button
            id="mobile-team-modal-btn"
            onClick={() => setIsTeamModalOpen(true)}
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors"
            title="Team & Collaborators"
            aria-label="Team & Collaborators"
          >
            <Users className="w-4 h-4 text-indigo-500" />
          </button>

          <button
            id="mobile-report-modal-btn"
            onClick={() => setIsReportModalOpen(true)}
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors"
            title="Project Report"
            aria-label="Project Report"
          >
            <BarChart3 className="w-4 h-4 text-emerald-500" />
          </button>
        </div>

        {/* Floating Action / Feedback Toast */}
        {toastMessage && (
          <div className="absolute bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-2xl backdrop-blur-md border border-slate-700/80 flex items-center gap-2 z-40 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            <span>{toastMessage}</span>
          </div>
        )}
      </div>

      {/* Mobile Easy Node Creation Modal / Bottom Sheet */}
      {mobileCreateOpen && (
        <div
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150 overflow-y-auto"
          onClick={() => setMobileCreateOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain pb-safe my-auto sm:my-auto animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center text-blue-600">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                    Create New Task Node
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Instantly add task to your mobile canvas view
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMobileCreateOpen(false)}
                aria-label="Close"
                className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleMobileCreateNode} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={mobileTitle}
                  onChange={(e) => setMobileTitle(e.target.value)}
                  placeholder="e.g. Foundation excavation survey"
                  className="w-full p-2.5 min-h-[44px] text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Node Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'task', label: 'Task Step' },
                    { key: 'stage', label: 'Stage Group' },
                    { key: 'approval', label: 'Approval Sign-off' },
                    { key: 'doc_request', label: 'Document Check' },
                  ].map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setMobileTypeKey(t.key)}
                      className={`p-2.5 min-h-[44px] rounded-xl border text-left text-xs font-bold transition-all flex items-center ${
                        mobileTypeKey === t.key
                          ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Priority
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setMobilePriority(p)}
                      className={`py-2 min-h-[38px] text-[10px] font-extrabold rounded-lg border transition-all flex items-center justify-center ${
                        mobilePriority === p
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex flex-col-reverse sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => setMobileCreateOpen(false)}
                  className="flex-1 min-h-[44px] py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingMobileNode || !mobileTitle.trim()}
                  className="flex-1 min-h-[44px] py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-colors"
                >
                  {creatingMobileNode ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Safe Node Deletion Confirmation Modal */}
      {deleteConfirmation && (
        <div
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setDeleteConfirmation(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Confirm Task Deletion
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Are you sure you want to delete <span className="font-bold text-slate-800 dark:text-slate-200">"{deleteConfirmation.title}"</span>?
                </p>
              </div>
            </div>

            {deleteConfirmation.childCount > 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <span className="font-bold block">⚠️ Nested Items Alert</span>
                <p className="text-[11px] leading-relaxed">
                  This stage contains <strong>{deleteConfirmation.childCount} nested subtask(s)</strong> that will be permanently removed with this operation.
                </p>
              </div>
            )}

            {deleteConfirmation.edgeCount > 0 && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                ℹ️ <strong>{deleteConfirmation.edgeCount} connection(s)</strong> attached to this task will also be severed.
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmation(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = deleteConfirmation.nodeId;
                  setDeleteConfirmation(null);
                  await handleDeleteNode(id);
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition-all flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Right Side Panel for Remarks, Comments, Details & Child Items */}
      <NodeDetailDrawer
        nodeId={selectedNodeId}
        onClose={() => setSelectedNodeId(null)}
        onNodeUpdated={loadGraph}
        onDeleteNode={(nodeIdToDelete) => {
          handleDeleteNode(nodeIdToDelete);
        }}
        onDrillDown={(nodeToDrill) => {
          setSelectedNodeId(null);
          setBreadcrumbTrail((prev) => [...prev, { id: nodeToDrill.id, title: nodeToDrill.title }]);
        }}
        onOpenViewDetails={(id) => setViewDetailsNodeId(id)}
      />

      {/* Comprehensive View Details Modal (Task Dossier, Approvals, Docs, Timelines) */}
      <NodeViewDetailsModal
        nodeId={viewDetailsNodeId}
        workspaceId={project.workspaceId}
        onClose={() => setViewDetailsNodeId(null)}
        onNodeUpdated={loadGraph}
        onOpenRemarksDrawer={(id) => setSelectedNodeId(id)}
      />

      {/* Full Project Report Extraction Modal */}
      <ProjectReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        project={project}
        nodes={nodes}
      />

      {/* Project Team & Collaborators Modal */}
      <ProjectTeamModal
        isOpen={isTeamModalOpen}
        onClose={() => setIsTeamModalOpen(false)}
        workspaceId={project.workspaceId}
        projectName={project.name}
      />

      {/* Field Configuration & Dynamic Form Schema Builder Modal */}
      <FieldConfigurationModal
        isOpen={isFieldConfigModalOpen}
        onClose={() => setIsFieldConfigModalOpen(false)}
        onFieldsChanged={loadGraph}
        userRole={currentRole}
      />

      {/* Project Activity Stream & Audit Trail Modal */}
      <ProjectActivityModal
        isOpen={isActivityModalOpen}
        onClose={() => setIsActivityModalOpen(false)}
        projectId={project.id}
        projectName={project.name}
      />
    </div>
  );
}

export const CanvasStudio: React.FC<CanvasStudioProps> = (props) => {
  return (
    <ReactFlowProvider>
      <CanvasStudioInner {...props} />
    </ReactFlowProvider>
  );
};
