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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FlowTrackNode } from './FlowTrackNode';
import { FlowTrackEdge } from './FlowTrackEdge';
import { NodeDetailDrawer } from './NodeDetailDrawer';
import { NodeViewDetailsModal } from './NodeViewDetailsModal';
import { ProjectReportModal } from './ProjectReportModal';
import { ProjectTeamModal } from './ProjectTeamModal';
import { ApiClient } from '../../services/api';
import { getLayoutedElements } from '../../utils/layout';
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

function CanvasStudioInner({ project, onBack }: CanvasStudioProps) {
  const { t } = useTranslation();
  const reactFlowInstance = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesStateChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [savedStatus, setSavedStatus] = useState<'saved' | 'saving'>('saved');
  const [nodeTypesList, setNodeTypesList] = useState<any[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  // Node deletion handler
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
        await ApiClient.createNode({
          projectId: project.id,
          parentNodeId: currentParent.id,
          nodeTypeId: typeObj.id,
          title: `${(node.data as any)?.title || 'Task'} (Copy)`,
          description: (node.data as any)?.description || '',
          positionX: Math.round(node.position.x + 50),
          positionY: Math.round(node.position.y + 50),
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
        const newNode = await ApiClient.createNode({
          projectId: project.id,
          parentNodeId: currentParent.id,
          nodeTypeId: typeObj.id,
          title: 'New Next Task',
          description: 'Connected task step',
          positionX: Math.round(sourceNode.position.x + 360),
          positionY: Math.round(sourceNode.position.y),
          progressPct: 0,
        });

        await ApiClient.createEdge({
          projectId: project.id,
          sourceNodeId: sourceNode.id,
          targetNodeId: newNode.id,
          kind: 'sequence',
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
        const newNode = await ApiClient.createNode({
          projectId: project.id,
          parentNodeId: parentNode.id,
          nodeTypeId: typeObj.id,
          title: `Child: ${parentTitle.slice(0, 16)}`,
          description: `Interconnected sub-task of ${parentTitle}`,
          positionX: Math.round(parentNode.position.x),
          positionY: Math.round(parentNode.position.y + 240),
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

      // Position in center of current mobile viewport
      const { x, y, zoom } = reactFlowInstance.getViewport();
      const centerX = Math.round(-x / zoom + window.innerWidth / (2 * zoom) - 140);
      const centerY = Math.round(-y / zoom + window.innerHeight / (2 * zoom) - 80);

      await ApiClient.createNode({
        projectId: project.id,
        parentNodeId: currentParent.id,
        nodeTypeId: typeObj.id,
        title: mobileTitle.trim(),
        positionX: centerX,
        positionY: centerY,
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
      const parentId = currentParent.id;
      const [fetchedNodes, fetchedEdges, types] = await Promise.all([
        ApiClient.getNodes(project.id, parentId),
        ApiClient.getEdges(project.id),
        ApiClient.getNodeTypes(),
      ]);

      setNodeTypesList(types);

      // Convert backend nodes to React Flow nodes with callbacks
      const rfNodes: Node[] = fetchedNodes.map((n: any) => ({
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
          isGroup: n.nodeType?.isGroup || false,
          childCount: n._count?.children || 0,
          docCount: n._count?.documents || 0,
          msgCount: n._count?.remarks || 0,
          dueDate: n.dueDate,
          owner: n.owner,
          ownerName: n.owner?.fullName || n.owner?.email || n.customData?.assigneeName,
          ownerAvatar: n.owner?.avatarUrl || n.customData?.assigneeAvatar,
          isLive: n.customData?.isLive !== undefined ? n.customData.isLive : (n.owner?.fullName ? true : false),
          lastRemark: n.remarks?.[0]?.body,
          likes: n.customData?.likes || { count: 0, users: [] },
          collaborators: n.customData?.collaboratorIds || [],
          parentTitle: n.parentNode?.title,
          isChild: !!n.parentNodeId,
          customData: n.customData || {},
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
            setViewDetailsNodeId(nodeId);
          },
          onAssignNode: (nodeId: string) => {
            setSelectedNodeId(nodeId);
          },
          onExtendDeadline: (nodeId: string) => {
            setViewDetailsNodeId(nodeId);
          },
          onDelete: (nodeId: string) => {
            handleDeleteNode(nodeId);
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
      }));

      // Filter edges that connect nodes within this active canvas level
      const currentLevelNodeIds = new Set(rfNodes.map((n) => n.id));
      const rfEdges: Edge[] = fetchedEdges
        .filter((e: any) => currentLevelNodeIds.has(e.sourceNodeId) && currentLevelNodeIds.has(e.targetNodeId))
        .map((e: any) => ({
          id: e.id,
          source: e.sourceNodeId,
          target: e.targetNodeId,
          sourceHandle: (e.metadata as any)?.sourceHandle || undefined,
          targetHandle: (e.metadata as any)?.targetHandle || undefined,
          type: 'customEdge',
          animated: true,
          data: {
            onDelete: (edgeId: string) => handleDeleteEdge(edgeId),
            onInsert: (edgeId: string) => handleInsertNodeBetween(edgeId),
          },
        }));

      setNodes(rfNodes);
      setEdges(rfEdges);
    } catch (e) {
      console.error('Failed to load canvas data:', e);
    } finally {
      setLoading(false);
    }
  }, [project.id, currentParent.id, setNodes, setEdges, handleDeleteNode, handleDeleteEdge, handleDuplicateNode, handleAddNext]);

  useEffect(() => {
    loadGraph();
  }, [project.id, currentParent.id]);

  // Connect any node to any other node!
  const onConnect = useCallback(
    async (params: Connection) => {
      if (!params.source || !params.target) return;
      try {
        setSavedStatus('saving');
        const newEdge = await ApiClient.createEdge({
          projectId: project.id,
          sourceNodeId: params.source,
          targetNodeId: params.target,
          kind: 'sequence',
        });

        const edgeObj: Edge = {
          ...params,
          id: newEdge.id,
          type: 'customEdge',
          animated: true,
          data: {
            onDelete: (edgeId: string) => handleDeleteEdge(edgeId),
            onInsert: (edgeId: string) => handleInsertNodeBetween(edgeId),
          },
        };

        setEdges((eds) => addEdge(edgeObj, eds));
        setSavedStatus('saved');
        showToast('Nodes connected');
      } catch (err) {
        console.error('Failed to create edge:', err);
      }
    },
    [project.id, setEdges, handleDeleteEdge]
  );

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
    const typeObj = nodeTypesList.find((t) => t.key === typeKey) || nodeTypesList[0];
    if (!typeObj) return;

    try {
      setSavedStatus('saving');
      const posX = positionOverride?.x ?? (100 + nodes.length * 280);
      const posY = positionOverride?.y ?? (200 + (nodes.length % 4) * 60);

      const created = await ApiClient.createNode({
        projectId: project.id,
        parentNodeId: currentParent.id,
        nodeTypeId: typeObj.id,
        title: `New ${typeObj.name} Item`,
        description: currentParent.id ? `Child item of ${currentParent.title}` : 'Configure details in side panel',
        positionX: posX,
        positionY: posY,
        progressPct: 0,
      });

      // If source node was provided (dragged from handle onto empty space), auto-connect!
      if (sourceNodeToConnect) {
        await ApiClient.createEdge({
          projectId: project.id,
          sourceNodeId: sourceNodeToConnect,
          targetNodeId: created.id,
          kind: 'sequence',
        });
      }

      await loadGraph();
      setSavedStatus('saved');
      setQuickAddMenu(null);
      showToast('Task added');
    } catch (err) {
      console.error('Failed to add node:', err);
    }
  };

  // Keyboard shortcut deletion (n8n / Automa style)
  const onNodesDelete = useCallback(
    async (deletedNodes: Node[]) => {
      for (const n of deletedNodes) {
        await handleDeleteNode(n.id);
      }
    },
    [handleDeleteNode]
  );

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
      const targetIsPane = (event.target as Element)?.classList?.contains('react-flow__pane');
      if (targetIsPane && connectingNodeId.current) {
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
    <div className="h-[calc(100vh-64px)] flex flex-col bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      {/* Top Studio Action Bar */}
      <div className="h-12 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <button
            id="canvas-back-btn"
            onClick={onBack}
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

          {/* Auto-save badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            {savedStatus === 'saving' ? (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            {savedStatus === 'saving' ? 'Saving...' : 'Saved'}
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 w-full h-full relative">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mr-3"></div>
            <span className="text-xs font-semibold">Loading node canvas...</span>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesStateChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
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
            fitView
            defaultViewport={{ x: 0, y: 0, zoom: 0.85 }}
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
            <Controls className="!bg-white dark:!bg-slate-900 !border !border-slate-200 dark:!border-slate-800 !rounded-xl !shadow-lg" />
            <MiniMap
              nodeColor={() => '#3b82f6'}
              className="!bg-white dark:!bg-slate-900 !border !border-slate-200 dark:!border-slate-800 !rounded-xl !shadow-lg"
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
              top: Math.min(window.innerHeight - 250, nodeContextMenu.y),
              left: Math.min(window.innerWidth - 220, nodeContextMenu.x),
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

              {/* Red Delete option */}
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete task "${(nodeContextMenu.node.data as any)?.title || 'Task'}"? This cannot be undone.`
                    )
                  ) {
                    handleDeleteNode(nodeContextMenu.node.id);
                  }
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
              top: Math.min(window.innerHeight - 260, quickAddMenu.y),
              left: Math.min(window.innerWidth - 240, quickAddMenu.x),
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
        <div className="sm:hidden absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl">
          <button
            onClick={() => setMobileCreateOpen(true)}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/25 active:scale-95 transition-all"
            title="Create Task on Mobile"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Task</span>
          </button>

          <button
            onClick={() => reactFlowInstance.fitView({ padding: 0.2, duration: 400 })}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold"
            title="Fit view on mobile"
          >
            <Sparkles className="w-4 h-4 text-blue-500" />
          </button>

          <button
            onClick={() => setIsTeamModalOpen(true)}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold"
            title="Team & Collaborators"
          >
            <Users className="w-4 h-4 text-indigo-500" />
          </button>

          <button
            onClick={() => setIsReportModalOpen(true)}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold"
            title="Project Report"
          >
            <BarChart3 className="w-4 h-4 text-emerald-500" />
          </button>
        </div>

        {/* Floating Action / Feedback Toast */}
        {toastMessage && (
          <div className="absolute bottom-16 sm:bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-2xl backdrop-blur-md border border-slate-700/80 flex items-center gap-2 z-40 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            <span>{toastMessage}</span>
          </div>
        )}
      </div>

      {/* Mobile Easy Node Creation Modal / Bottom Sheet */}
      {mobileCreateOpen && (
        <div
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setMobileCreateOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 animate-in slide-in-from-bottom duration-200"
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
                className="p-1 text-slate-400 hover:text-slate-600"
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
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
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
                      className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all ${
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
                      className={`py-1.5 text-[10px] font-extrabold rounded-lg border transition-all ${
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

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setMobileCreateOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingMobileNode || !mobileTitle.trim()}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20"
                >
                  {creatingMobileNode ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
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
