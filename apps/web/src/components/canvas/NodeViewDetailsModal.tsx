import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../../services/api';
import { calculateTimeCountdown } from '../../utils/timeTracker';
import { DeadlineExtensionModal } from './DeadlineExtensionModal';
import {
  X,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Paperclip,
  MessageSquare,
  FileText,
  Sliders,
  Check,
  Download,
  Eye,
  History,
  UploadCloud,
  ThumbsUp,
  ThumbsDown,
  ShieldCheck,
  User,
  Users,
  Printer,
  Calendar,
  ExternalLink,
  Trash2,
  Share2,
  Lock,
  Unlock,
  Shield,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { getRolePermissions } from '../../utils/permissions';

interface NodeViewDetailsModalProps {
  nodeId: string | null;
  workspaceId?: string;
  onClose: () => void;
  onNodeUpdated: () => void;
  onOpenRemarksDrawer?: (nodeId: string) => void;
}

export const NodeViewDetailsModal: React.FC<NodeViewDetailsModalProps> = ({
  nodeId,
  workspaceId,
  onClose,
  onNodeUpdated,
  onOpenRemarksDrawer,
}) => {
  const [node, setNode] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'approval' | 'documents' | 'team' | 'history'>('overview');

  // Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [statusId, setStatusId] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [weight, setWeight] = useState(1.0);
  const [progressPct, setProgressPct] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>([]);
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const [likes, setLikes] = useState<{ count: number; users: string[] }>({ count: 0, users: [] });

  // Workspace team members
  const [members, setMembers] = useState<any[]>([]);

  // Documents
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Manager Approval State
  const [approvalNote, setApprovalNote] = useState('');
  const [approving, setApproving] = useState(false);

  // Auth & Permissions
  const { user, workspaces, activeWorkspaceId, getActiveRole } = useAuthStore();
  const currentRole = getActiveRole();
  const permissions = getRolePermissions(currentRole);
  const isManager = permissions.canApproveTasks;
  const isNodeLocked = Boolean(customData?.isLocked || node?.customData?.isLocked);
  const isConfidentialHidden = isNodeLocked && !permissions.canViewConfidential;

  // Deadline Extension Modal state
  const [isDeadlineModalOpen, setIsDeadlineModalOpen] = useState(false);
  const [pendingDueDate, setPendingDueDate] = useState('');

  // Save debounce/status
  const [saving, setSaving] = useState(false);

  const loadNode = async (id: string) => {
    try {
      setLoading(true);
      const data = await ApiClient.getNode(id);
      setNode(data);
      setTitle(data.title || '');
      setDescription(data.description || '');
      setStatusId(data.statusId || '');
      setPriority(data.priority || 'MEDIUM');
      setWeight(data.weight || 1.0);
      setProgressPct(data.progressPct || 0);

      // format ISO string to datetime-local input "YYYY-MM-DDTHH:mm"
      const formatToLocalInput = (iso?: string | null) => {
        if (!iso) return '';
        const d = new Date(iso);
        const pad = (n: number) => (n < 10 ? '0' + n : n);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };

      setStartDate(formatToLocalInput(data.startDate));
      setDueDate(formatToLocalInput(data.dueDate));
      setOwnerId(data.ownerId || '');
      setCustomData(data.customData || {});
      setCollaboratorIds(data.customData?.collaboratorIds || []);
      setLikes(data.customData?.likes || { count: 0, users: [] });
      setDocuments(data.documents || []);
    } catch (err) {
      console.error('Failed to load node', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async () => {
    try {
      const wsId = workspaceId || ApiClient.getActiveWorkspaceId();
      if (wsId) {
        const data = await ApiClient.getWorkspaceMembers(wsId);
        setMembers(data || []);
      }
    } catch (e) {
      console.warn('Failed to load members', e);
    }
  };

  const loadHistory = async (id: string) => {
    try {
      setLoadingHistory(true);
      const data = await ApiClient.getNodeHistory(id);
      setHistoryList(data || []);
    } catch (err) {
      console.error('Failed to load history', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (nodeId) {
      loadNode(nodeId);
      loadMembers();
    }
  }, [nodeId]);

  useEffect(() => {
    if (nodeId && activeTab === 'history') {
      loadHistory(nodeId);
    }
  }, [nodeId, activeTab]);

  if (!nodeId || !node) return null;

  const countdown = calculateTimeCountdown(node.dueDate, node.status?.category);

  // Save changes handler
  const handleSaveFields = async (customPatch: Record<string, any> = {}) => {
    try {
      setSaving(true);
      const payload = {
        title,
        description,
        statusId: statusId || undefined,
        priority: priority as any,
        weight: Number(weight),
        progressPct: Number(progressPct),
        startDate: startDate ? new Date(startDate).toISOString() : null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        ownerId: ownerId || null,
        customData: {
          ...customData,
          collaboratorIds,
          likes,
          ...customPatch,
        },
        version: node.version,
      };

      await ApiClient.updateNode(node.id, payload);
      onNodeUpdated();
      await loadNode(node.id);
    } catch (e) {
      console.error('Failed to update node', e);
    } finally {
      setSaving(false);
    }
  };

  // Due Date change interceptor (requires justification reason if changing an existing date)
  const handleDueDateChange = (newVal: string) => {
    if (node.dueDate && newVal !== dueDate) {
      setPendingDueDate(newVal);
      setIsDeadlineModalOpen(true);
    } else {
      setDueDate(newVal);
      handleSaveFields({ pendingDueDate: newVal });
    }
  };

  const handleConfirmDeadlineExtension = async (
    reason: string,
    revisedDueDate?: string,
    attachedDoc?: string
  ) => {
    const finalDueDate = revisedDueDate || pendingDueDate || dueDate;
    setDueDate(finalDueDate);
    const docName = attachedDoc ? `Timeline-Revision-${Date.now().toString().slice(-4)}.pdf` : null;

    if (attachedDoc && docName) {
      await ApiClient.addDocument(node.id, {
        name: docName,
        mimeType: 'application/pdf',
        fileSize: 1024 * 50,
        storageKey: attachedDoc,
      });
    }

    const extData = {
      reason,
      revisedDueDate: finalDueDate,
      docName,
      status: 'PENDING',
      requestedBy: user?.fullName || 'Member',
      requestedAt: new Date().toISOString(),
    };

    const updatedCustom = {
      ...customData,
      deadlineReason: reason,
      deadlineExtension: extData,
    };
    setCustomData(updatedCustom);

    await ApiClient.updateNode(node.id, {
      dueDate: finalDueDate ? new Date(finalDueDate).toISOString() : null,
      deadlineReason: reason,
      customData: updatedCustom,
      version: node.version,
    });

    onNodeUpdated();
    await loadNode(node.id);
  };

  const handleToggleNodeLock = async () => {
    if (!permissions.canToggleLock) return;
    try {
      const nextLocked = !isNodeLocked;
      const updatedCustom = {
        ...customData,
        isLocked: nextLocked,
        lockedBy: user?.fullName || 'Manager',
        lockedAt: new Date().toISOString(),
      };
      setCustomData(updatedCustom);
      await ApiClient.updateNode(node.id, {
        customData: updatedCustom,
        version: node.version,
      });
      onNodeUpdated();
      await loadNode(node.id);
    } catch (e) {
      console.error('Failed to toggle lock', e);
    }
  };

  const handleToggleDocLock = async (docId: string, currentLocked: boolean) => {
    if (!permissions.canToggleLock) return;
    try {
      const lockedDocs = customData?.lockedDocIds || [];
      const updatedLockedDocs = currentLocked
        ? lockedDocs.filter((id: string) => id !== docId)
        : [...lockedDocs, docId];
      const updatedCustom = {
        ...customData,
        lockedDocIds: updatedLockedDocs,
      };
      setCustomData(updatedCustom);
      await ApiClient.updateNode(node.id, {
        customData: updatedCustom,
        version: node.version,
      });
      onNodeUpdated();
      await loadNode(node.id);
    } catch (e) {
      console.error('Failed to toggle doc lock', e);
    }
  };

  const handleApproveDeadlineExtension = async () => {
    if (!permissions.canApproveDeadlineExtension) return;
    try {
      const ext = customData?.deadlineExtension;
      if (!ext) return;
      const updatedCustom = {
        ...customData,
        deadlineExtension: {
          ...ext,
          status: 'APPROVED',
          reviewedBy: user?.fullName || 'Manager',
          reviewedAt: new Date().toISOString(),
        },
      };
      setCustomData(updatedCustom);
      await ApiClient.updateNode(node.id, {
        dueDate: ext.revisedDueDate ? new Date(ext.revisedDueDate).toISOString() : node.dueDate,
        customData: updatedCustom,
        version: node.version,
      });
      onNodeUpdated();
      await loadNode(node.id);
    } catch (e) {
      console.error('Failed to approve extension', e);
    }
  };

  const handleRejectDeadlineExtension = async () => {
    if (!permissions.canApproveDeadlineExtension) return;
    try {
      const ext = customData?.deadlineExtension;
      if (!ext) return;
      const updatedCustom = {
        ...customData,
        deadlineExtension: {
          ...ext,
          status: 'REJECTED',
          reviewedBy: user?.fullName || 'Manager',
          reviewedAt: new Date().toISOString(),
        },
      };
      setCustomData(updatedCustom);
      await ApiClient.updateNode(node.id, {
        customData: updatedCustom,
        version: node.version,
      });
      onNodeUpdated();
      await loadNode(node.id);
    } catch (e) {
      console.error('Failed to reject extension', e);
    }
  };

  // Manager Approval Handler (Turns task Green, sets status Done)
  const handleManagerApprove = async () => {
    if (!isManager) return;
    try {
      setApproving(true);
      // Find the 'done' status id from nodeType's statusSet if available
      const doneStatus = node.nodeType?.statusSet?.statuses?.find(
        (s: any) => s.category === 'done' || s.key === 'done'
      );

      const reviewData = {
        status: 'APPROVED',
        reaction: 'thumbs_up',
        note: approvalNote || 'Plan & Deliverables verified and approved by Manager.',
        reviewer: user?.fullName || 'Manager',
        reviewedAt: new Date().toISOString(),
      };

      await ApiClient.updateNode(node.id, {
        statusId: doneStatus ? doneStatus.id : undefined,
        progressPct: 100,
        isManagerApproval: true,
        approvalNote: approvalNote || 'Plan & Deliverables verified and approved by Manager.',
        customData: {
          ...customData,
          collaboratorIds,
          likes,
          managerReview: reviewData,
        },
        version: node.version,
      });

      onNodeUpdated();
      await loadNode(node.id);
      setActiveTab('approval');
    } catch (e) {
      console.error('Failed to approve node', e);
    } finally {
      setApproving(false);
    }
  };

  // Manager Rework Handler (Turns task Amber/Red, sets status Waiting/Blocked)
  const handleManagerRework = async () => {
    if (!isManager) return;
    try {
      setApproving(true);
      const waitingStatus =
        node.nodeType?.statusSet?.statuses?.find(
          (s: any) => s.category === 'blocked' || s.key === 'waiting'
        ) || node.nodeType?.statusSet?.statuses?.find((s: any) => s.key === 'waiting');

      const reviewData = {
        status: 'REWORK_REQUESTED',
        reaction: 'thumbs_down',
        note: approvalNote || 'Manager review requested rework on deliverables.',
        reviewer: user?.fullName || 'Manager',
        reviewedAt: new Date().toISOString(),
      };

      await ApiClient.updateNode(node.id, {
        statusId: waitingStatus ? waitingStatus.id : undefined,
        customData: {
          ...customData,
          collaboratorIds,
          likes,
          managerReview: reviewData,
        },
        version: node.version,
      });

      await ApiClient.addRemark(node.id, {
        body: `👎 Manager Review: Rework Requested by ${user?.fullName || 'Manager'}.\nFeedback: ${
          approvalNote || 'Deliverables require adjustments.'
        }`,
      });

      onNodeUpdated();
      await loadNode(node.id);
      setActiveTab('approval');
    } catch (e) {
      console.error('Failed to request rework', e);
    } finally {
      setApproving(false);
    }
  };

  // Like / Kudos Handler (Exclusive to Managers)
  const handleToggleLike = async () => {
    if (!isManager) return;
    const currentCount = likes.count || 0;
    const newLikes = {
      count: currentCount + 1,
      users: [...(likes.users || []), user?.fullName || 'Manager'],
    };
    setLikes(newLikes);
    await ApiClient.updateNode(node.id, {
      customData: {
        ...customData,
        collaboratorIds,
        likes: newLikes,
      },
      version: node.version,
    });
    onNodeUpdated();
  };

  // Document Upload
  const handleDocUpload = async (file: File) => {
    try {
      setUploadingDoc(true);
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        await ApiClient.addDocument(node.id, {
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
          storageKey: dataUrl,
        });
        await loadNode(node.id);
        onNodeUpdated();
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed to upload doc', err);
    } finally {
      setUploadingDoc(false);
    }
  };

  // Single Node Dossier Export / Print
  const handlePrintDossier = () => {
    window.print();
  };

  const isApproved = node.status?.category === 'done' || progressPct === 100;

  if (isConfidentialHidden) {
    return (
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[80] flex items-center justify-center p-4 animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 text-center shadow-2xl border border-slate-200 dark:border-slate-800"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7" />
          </div>
          <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">
            Confidential Task & Dossier
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
            This task has been locked as confidential by{' '}
            <strong className="text-slate-900 dark:text-white">
              {node?.customData?.lockedBy || 'Manager'}
            </strong>
            {node?.customData?.lockedAt && ` on ${new Date(node.customData.lockedAt).toLocaleDateString()}`}.
          </p>
          <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300">
            Full details, attached files, and editing permissions are restricted to Managers and Super Admins.
          </div>
          <button
            onClick={onClose}
            className="w-full mt-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[80] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Banner */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0"
              style={{ backgroundColor: node.status?.colour || '#3b82f6' }}
            >
              {isApproved ? (
                <ShieldCheck className="w-6 h-6 text-white" />
              ) : (
                <FileText className="w-6 h-6 text-white" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1.5"
                  style={{
                    backgroundColor: `${node.status?.colour || '#3b82f6'}20`,
                    color: node.status?.colour || '#3b82f6',
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: node.status?.colour || '#3b82f6' }}
                  />
                  {node.status?.labelI18n?.en || node.status?.name || 'In Progress'}
                </span>

                {/* Live Countdown & Overdue Badge */}
                <span
                  className={`text-[11px] px-2.5 py-0.5 rounded-full flex items-center gap-1 border ${countdown.badgeClass}`}
                >
                  <Clock className="w-3 h-3" />
                  <span>{countdown.formattedText}</span>
                </span>

                {isApproved && (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Manager Verified & Approved
                  </span>
                )}
              </div>

              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white truncate">
                {title || 'Untitled Task'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {/* Lock / Unlock Node Toggle (Manager & Super Admin) */}
            {permissions.canToggleLock ? (
              <button
                onClick={handleToggleNodeLock}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                  isNodeLocked
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950/50'
                }`}
                title={isNodeLocked ? 'Node is confidential and locked. Click to unlock.' : 'Lock node as confidential.'}
              >
                {isNodeLocked ? <Lock className="w-3.5 h-3.5 text-amber-600" /> : <Unlock className="w-3.5 h-3.5" />}
                <span>{isNodeLocked ? 'Locked (Confidential)' : 'Lock Confidential'}</span>
              </button>
            ) : isNodeLocked ? (
              <div className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                <span>Confidential</span>
              </div>
            ) : null}

            {/* Like / Kudos Button */}
            <button
              onClick={handleToggleLike}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-all active:scale-95"
              title="Give Like / Kudos for good or on-time work"
            >
              <ThumbsUp className={`w-3.5 h-3.5 ${likes.count > 0 ? 'text-blue-500 fill-blue-500' : 'text-slate-400'}`} />
              <span>{likes.count > 0 ? `${likes.count} Likes` : 'Like'}</span>
            </button>

            {/* Print / Export Dossier Button */}
            <button
              onClick={handlePrintDossier}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-all"
              title="Print or Save Task Dossier Report"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Export Dossier</span>
            </button>

            {/* Quick Remarks Drawer Link */}
            {onOpenRemarksDrawer && (
              <button
                onClick={() => {
                  onClose();
                  onOpenRemarksDrawer(node.id);
                }}
                className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-xs font-bold hover:bg-blue-100 flex items-center gap-1.5 transition-all"
                title="Open Quick Collaborator Chat & Voice Remarks"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Remarks ({node.remarks?.length || 0})</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 bg-white dark:bg-slate-900 shrink-0">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3.5 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Task Overview & Scope</span>
          </button>

          <button
            onClick={() => setActiveTab('approval')}
            className={`py-3.5 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'approval'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Manager Approval</span>
            {isApproved && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
          </button>

          <button
            onClick={() => setActiveTab('documents')}
            className={`py-3.5 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'documents'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Paperclip className="w-4 h-4" />
            <span>Documents & Blueprints</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
              {documents.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('team')}
            className={`py-3.5 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'team'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Team & Multi-Assignees</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
              {(ownerId ? 1 : 0) + collaboratorIds.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`py-3.5 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Timeline & Audit Logs</span>
          </button>
        </div>

        {/* Tab Body Contents */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: OVERVIEW & SCOPE */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left 2 Cols: Form Fields */}
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Task Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => handleSaveFields()}
                    className="w-full p-2.5 text-sm font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Full Scope & Description
                  </label>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={() => handleSaveFields()}
                    placeholder="Enter thorough execution specifications, requirements, standards, and deliverables..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                  />
                </div>



                {/* Dynamic Custom Fields from Schema */}
                {node.nodeType?.fields?.length > 0 && (
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Custom Properties ({node.nodeType.name})
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      {node.nodeType.fields.map((f: any) => (
                        <div key={f.id}>
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                            {f.label} {f.required && <span className="text-rose-500">*</span>}
                          </label>
                          <input
                            type={f.type === 'number' || f.type === 'currency' ? 'number' : 'text'}
                            value={customData[f.fieldKey] || ''}
                            onChange={(e) =>
                              setCustomData((prev) => ({
                                ...prev,
                                [f.fieldKey]: e.target.value,
                              }))
                            }
                            onBlur={() => handleSaveFields()}
                            placeholder={`Enter ${f.label}...`}
                            className="w-full p-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Col: Timeline & Attributes Meta */}
              <div className="space-y-4">
                {/* Precise Date & Time Settings */}
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-blue-500" />
                      <span>Date & Time Timeline</span>
                    </span>
                    {countdown.isOverdue && (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500 text-white uppercase">
                        Overdue!
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Start Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        handleSaveFields({ pendingStartDate: e.target.value });
                      }}
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Due Date & Time (Deadline)
                    </label>
                    <input
                      type="datetime-local"
                      value={dueDate}
                      onChange={(e) => handleDueDateChange(e.target.value)}
                      className={`w-full p-2 text-xs rounded-xl border ${
                        countdown.isOverdue
                          ? 'border-rose-400 ring-2 ring-rose-500/20'
                          : 'border-slate-300 dark:border-slate-700'
                      } bg-white dark:bg-slate-800 text-slate-900 dark:text-white`}
                    />
                  </div>

                  {/* Countdown indicator card */}
                  <div className={`p-3 rounded-xl border text-xs ${countdown.badgeClass}`}>
                    <div className="font-bold flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{countdown.formattedText}</span>
                    </div>
                    {countdown.isOverdue && (
                      <p className="text-[10px] mt-1 text-white/90">
                        This task has passed its completion deadline. Any timeline extension must be accompanied by an audited delay justification.
                      </p>
                    )}
                  </div>
                </div>

                {/* Priority & Weight */}
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Priority Level
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => {
                        setPriority(e.target.value);
                        handleSaveFields({ priority: e.target.value });
                      }}
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent (Critical)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Task Weight / Contribution (Rollup)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={weight}
                      onChange={(e) => setWeight(Number(e.target.value))}
                      onBlur={() => handleSaveFields()}
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MANAGER APPROVAL & REVIEW WORKFLOW (EXCLUSIVE TO MANAGERS) */}
          {activeTab === 'approval' && (
            <div className="max-w-2xl mx-auto space-y-5">
              <div className="p-6 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                    Manager Review & Sign-Off Gate
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                    Managers review assigned work, drawings, and execution evidence. Approving turns this node <span className="font-bold text-emerald-600">BRIGHT GREEN (#10b981)</span>. Rework turns it <span className="font-bold text-rose-600">AMBER/RED</span>.
                  </p>
                </div>

                {/* 1. Assignment Verification */}
                {(() => {
                  const assignedUser = members.find((m) => m.user?.id === (ownerId || node.ownerId));
                  const isAssigned = !!assignedUser || !!ownerId || !!node.ownerId;

                  if (!isAssigned) {
                    return (
                      <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900/60 text-left space-y-2">
                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-bold text-xs">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>Task Must Be Assigned Before Approval</span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">
                          Please designate a task lead / owner so accountability is tracked before sign-off.
                        </p>
                        <select
                          value={ownerId}
                          onChange={(e) => {
                            setOwnerId(e.target.value);
                            handleSaveFields({ ownerId: e.target.value });
                          }}
                          className="w-full p-2 text-xs rounded-lg border border-amber-300 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                        >
                          <option value="">Select Assignee / Lead...</option>
                          {members.map((m: any) => (
                            <option key={m.user?.id} value={m.user?.id}>
                              {m.user?.fullName} ({m.user?.email}) - {m.role}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  return (
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-left flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                          {assignedUser?.user?.fullName?.[0] || 'U'}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 dark:text-white">
                            Lead Assignee: {assignedUser?.user?.fullName || 'Assigned'}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {assignedUser?.role || 'Member'} • {documents.length} attached documents • {node.remarks?.length || 0} remarks
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        ✓ Assigned
                      </span>
                    </div>
                  );
                })()}

                {/* 2. Manager vs Non-Manager Workflow */}
                {!isManager ? (
                  <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-900 text-left space-y-2.5">
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-700 dark:text-slate-300">
                      <ShieldCheck className="w-4 h-4 text-blue-500" />
                      <span>Manager Review Decision (Read-Only)</span>
                    </div>
                    {node.customData?.managerReview ? (
                      <div
                        className={`p-3.5 rounded-xl border space-y-1.5 ${
                          node.customData.managerReview.reaction === 'thumbs_up'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                            : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 text-rose-800 dark:text-rose-300'
                        }`}
                      >
                        <div className="font-bold text-xs flex items-center gap-2">
                          {node.customData.managerReview.reaction === 'thumbs_up' ? (
                            <>
                              <ThumbsUp className="w-4 h-4 text-emerald-600 fill-emerald-600" />
                              <span>Approved by Manager: {node.customData.managerReview.reviewer}</span>
                            </>
                          ) : (
                            <>
                              <ThumbsDown className="w-4 h-4 text-rose-600 fill-rose-600" />
                              <span>Rework Requested by Manager: {node.customData.managerReview.reviewer}</span>
                            </>
                          )}
                        </div>
                        {node.customData.managerReview.note && (
                          <p className="text-xs italic bg-white/60 dark:bg-slate-800/60 p-2 rounded-lg">
                            "{node.customData.managerReview.note}"
                          </p>
                        )}
                        <div className="text-[10px] text-slate-400">
                          Timestamp: {new Date(node.customData.managerReview.reviewedAt).toLocaleString()}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                        ⏳ Pending Manager Review. Only workspace managers (e.g. Suresh Sharma) have permission to approve or request rework.
                      </p>
                    )}
                  </div>
                ) : (
                  /* Manager Review Controls (Exclusive to Manager) */
                  <div className="text-left space-y-3.5 pt-2">
                    {node.customData?.managerReview && (
                      <div
                        className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                          node.customData.managerReview.reaction === 'thumbs_up'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                            : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 text-rose-800 dark:text-rose-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold">
                          {node.customData.managerReview.reaction === 'thumbs_up' ? (
                            <>
                              <ThumbsUp className="w-4 h-4 text-emerald-600" />
                              <span>Current Status: Approved by {node.customData.managerReview.reviewer}</span>
                            </>
                          ) : (
                            <>
                              <ThumbsDown className="w-4 h-4 text-rose-600" />
                              <span>Current Status: Rework Requested by {node.customData.managerReview.reviewer}</span>
                            </>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {new Date(node.customData.managerReview.reviewedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
                        Manager Review Assessment & Feedback Notes
                      </label>
                      <textarea
                        rows={3}
                        value={approvalNote}
                        onChange={(e) => setApprovalNote(e.target.value)}
                        placeholder="e.g. Inspected deliverables, verified specs compliance, site photos confirmed..."
                        className="w-full p-3 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    {/* Dual Action Buttons: Thumbs Up (Approve) & Thumbs Down (Rework) */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <button
                        type="button"
                        disabled={approving || (!ownerId && !node.ownerId)}
                        onClick={handleManagerApprove}
                        className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
                        title="Approve node and turn Bright Green"
                      >
                        <ThumbsUp className="w-4 h-4" />
                        <span>{approving ? 'Processing...' : '👍 Thumbs Up (Approve & Green)'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={approving || (!ownerId && !node.ownerId)}
                        onClick={handleManagerRework}
                        className="py-3 px-4 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
                        title="Request rework and turn Amber/Red"
                      >
                        <ThumbsDown className="w-4 h-4" />
                        <span>{approving ? 'Processing...' : '👎 Thumbs Down (Rework)'}</span>
                      </button>
                    </div>

                    {/* Manager Kudos Like Button */}
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Manager Reaction / Kudos:</span>
                      <button
                        type="button"
                        onClick={handleToggleLike}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ThumbsUp className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                        <span>Give Kudos ({likes.count || 0})</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Deadline Extension Request Section */}
                {customData?.deadlineExtension && (
                  <div className="p-4 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 text-left space-y-2.5 mt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <span>Timeline Extension Request</span>
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                          customData.deadlineExtension.status === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : customData.deadlineExtension.status === 'REJECTED'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 animate-pulse'
                        }`}
                      >
                        {customData.deadlineExtension.status || 'PENDING'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      <span className="font-semibold text-slate-500 dark:text-slate-400">Reason:</span>{' '}
                      {customData.deadlineExtension.reason}
                    </p>

                    {customData.deadlineExtension.revisedDueDate && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        <span className="font-semibold">Requested Deadline:</span>{' '}
                        {new Date(customData.deadlineExtension.revisedDueDate).toLocaleString()}
                      </p>
                    )}

                    {customData.deadlineExtension.docName && (
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/40 text-xs flex items-center gap-2">
                        <Paperclip className="w-3.5 h-3.5 text-blue-500" />
                        <span className="font-semibold truncate">{customData.deadlineExtension.docName}</span>
                      </div>
                    )}

                    {/* Manager Approval / Rejection buttons for extension */}
                    {permissions.canApproveDeadlineExtension &&
                      customData.deadlineExtension.status === 'PENDING' && (
                        <div className="flex items-center gap-2 pt-2 border-t border-amber-200 dark:border-amber-900/60">
                          <button
                            type="button"
                            onClick={handleApproveDeadlineExtension}
                            className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve Extension</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleRejectDeadlineExtension}
                            className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      )}
                  </div>
                )}

                {/* Member Action: Request Extension if timeline exceeded or approaching */}
                {permissions.canSubmitDeadlineExtension && !isManager && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setIsDeadlineModalOpen(true)}
                      className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
                    >
                      <Clock className="w-4 h-4" />
                      <span>Request Timeline Extension with Reason & Document</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DOCUMENTS (Upload, Preview, Download) */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              {/* Drag & Drop Upload Banner */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleDocUpload(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className="p-8 border-2 border-dashed border-blue-300 dark:border-blue-900/60 hover:border-blue-500 rounded-3xl bg-blue-50/40 dark:bg-blue-950/20 text-center cursor-pointer transition-all"
              >
                <UploadCloud className="w-10 h-10 text-blue-500 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {uploadingDoc ? 'Uploading document...' : 'Click or drop documents to upload'}
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Supports Blueprints, PDFs, DWG, Contracts, Site Photos, Spreadsheets
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleDocUpload(file);
                  }}
                  className="hidden"
                />
              </div>

              {/* Document List */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Attached Deliverables & Proofs ({documents.length})
                </h4>

                {documents.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-xs">
                    No documents attached yet. Upload requirements, test certificates, or drawings above!
                  </div>
                ) : (
                  documents.map((doc: any) => {
                    const isDocLocked =
                      (customData?.lockedDocIds || []).includes(doc.id) || isNodeLocked;
                    const isRestrictedForMember = isDocLocked && !permissions.canViewConfidential;

                    return (
                      <div
                        key={doc.id}
                        className={`p-4 rounded-2xl border flex items-center justify-between transition-colors shadow-sm ${
                          isDocLocked
                            ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/20'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 hover:border-blue-300'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              isDocLocked
                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                                : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                            }`}
                          >
                            {isDocLocked ? <Lock className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                {doc.name}
                              </span>
                              {isDocLocked && (
                                <span className="text-[9px] font-extrabold px-2 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 rounded-md border border-amber-300 dark:border-amber-800">
                                  Confidential
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                              <span className="font-bold text-blue-500">v{doc.version}</span>
                              <span>•</span>
                              <span>{Math.round(Number(doc.fileSize) / 1024) || 150} KB</span>
                              <span>•</span>
                              <span>{doc.uploader?.fullName || 'Manager'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isRestrictedForMember ? (
                            <span
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1.5"
                              title="Confidential document: Download and preview are restricted for Member role."
                            >
                              <Lock className="w-3.5 h-3.5 text-amber-600" />
                              <span>Restricted (Confidential)</span>
                            </span>
                          ) : (
                            <>
                              {/* Toggle Document Confidentiality */}
                              {permissions.canToggleLock && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleDocLock(doc.id, isDocLocked)}
                                  className={`p-2 rounded-xl transition-colors ${
                                    isDocLocked
                                      ? 'text-amber-600 bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200'
                                      : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                                  }`}
                                  title={isDocLocked ? 'Document is locked. Click to make public.' : 'Lock document as confidential.'}
                                >
                                  {isDocLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                                </button>
                              )}

                              {/* Preview */}
                              <button
                                onClick={() => setPreviewDoc(doc)}
                                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                                title="Open & Preview Document"
                              >
                                <Eye className="w-3.5 h-3.5 text-blue-500" />
                                <span>View</span>
                              </button>

                              {/* Download */}
                              <a
                                href={doc.storageKey}
                                download={doc.name}
                                className="p-2 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                title="Download file"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Document Preview Lightbox Modal */}
              {previewDoc && (
                <div
                  className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-in fade-in duration-150"
                  onClick={() => setPreviewDoc(null)}
                >
                  <div
                    className="bg-white dark:bg-slate-900 rounded-3xl max-w-4xl w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-5 h-5 text-blue-500" />
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                          {previewDoc.name}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={previewDoc.storageKey}
                          download={previewDoc.name}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </a>
                        <button
                          onClick={() => setPreviewDoc(null)}
                          className="p-1.5 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="max-h-[68vh] overflow-auto flex items-center justify-center bg-slate-100 dark:bg-slate-950 rounded-2xl p-2">
                      {previewDoc.storageKey?.startsWith('data:image') ? (
                        <img
                          src={previewDoc.storageKey}
                          alt="Document Preview"
                          className="max-h-[64vh] mx-auto rounded-lg object-contain shadow-lg"
                        />
                      ) : previewDoc.mimeType === 'application/pdf' ||
                        previewDoc.name?.toLowerCase().endsWith('.pdf') ? (
                        <iframe
                          src={previewDoc.storageKey}
                          title={previewDoc.name}
                          className="w-full h-[62vh] rounded-lg border-0"
                        />
                      ) : (
                        <div className="text-center py-16 space-y-3">
                          <FileText className="w-16 h-16 text-blue-500 mx-auto" />
                          <h5 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                            {previewDoc.name}
                          </h5>
                          <p className="text-xs text-slate-400">
                            Direct preview is available for images and PDFs. Download to open in native desktop CAD/Office viewer.
                          </p>
                          <a
                            href={previewDoc.storageKey}
                            download={previewDoc.name}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md"
                          >
                            <Download className="w-4 h-4" />
                            <span>Download {previewDoc.name}</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: TEAM & MULTI-USER ASSIGNEES */}
          {activeTab === 'team' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Primary Task Lead / Owner
                  </label>
                  {permissions.canAssignTasks ? (
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md">
                      Assigning Enabled ({permissions.roleLabel})
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 italic">Read-only (Member)</span>
                  )}
                </div>
                <select
                  value={ownerId}
                  disabled={!permissions.canAssignTasks}
                  onChange={(e) => {
                    const newOwnerId = e.target.value;
                    setOwnerId(newOwnerId);
                    const chosen = members.find((m: any) => m.user?.id === newOwnerId);
                    const assigneeName = chosen?.user?.fullName || chosen?.user?.email;
                    const assigneeAvatar = chosen?.user?.avatarUrl;
                    handleSaveFields({
                      ownerId: newOwnerId || null,
                      customData: {
                        ...customData,
                        assigneeName: assigneeName || undefined,
                        assigneeAvatar: assigneeAvatar || undefined,
                      },
                    });
                  }}
                  className="w-full p-2.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="">Unassigned</option>
                  {members.map((m: any) => (
                    <option key={m.user?.id} value={m.user?.id}>
                      {m.user?.fullName} ({m.user?.email}) - {m.role}
                    </option>
                  ))}
                </select>

                {/* Presence Status Toggle (Live vs Offline) */}
                <div className="flex items-center justify-between pt-2.5">
                  <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        customData?.isLive !== false ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                      }`}
                    />
                    <span>Assignee Presence:</span>
                  </span>
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      disabled={!permissions.canAssignTasks}
                      onClick={() => handleSaveFields({ customData: { ...customData, isLive: true } })}
                      className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                        customData?.isLive !== false
                          ? 'bg-emerald-500 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      🟢 Live
                    </button>
                    <button
                      type="button"
                      disabled={!permissions.canAssignTasks}
                      onClick={() => handleSaveFields({ customData: { ...customData, isLive: false } })}
                      className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                        customData?.isLive === false
                          ? 'bg-slate-600 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      Offline
                    </button>
                  </div>
                </div>
              </div>

              {/* Multi-Collaborator Multi-Select */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Additional Team Collaborators (Multi-User)
                </label>
                <p className="text-[11px] text-slate-400">
                  Multiple people collaborating on this single task can post remarks and review documents simultaneously.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {members.map((m: any) => {
                    const isChecked = collaboratorIds.includes(m.user?.id);
                    return (
                      <label
                        key={m.user?.id}
                        className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                          isChecked
                            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 font-semibold'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const newCols = e.target.checked
                              ? [...collaboratorIds, m.user.id]
                              : collaboratorIds.filter((id) => id !== m.user.id);
                            setCollaboratorIds(newCols);
                            handleSaveFields({ collaboratorIds: newCols });
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                          {m.user?.fullName?.[0] || 'U'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs truncate">{m.user?.fullName}</div>
                          <div className="text-[10px] text-slate-400 truncate">{m.role}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: AUDIT LOGS & TIMELINE */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Audited Change History & Timeline Log
              </h4>

              {loadingHistory ? (
                <div className="text-center py-8 text-xs text-slate-400">Loading audit history...</div>
              ) : historyList.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No recorded audit events yet.</div>
              ) : (
                <div className="space-y-2.5">
                  {historyList.map((log: any) => (
                    <div
                      key={log.id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-slate-500 text-[11px]">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          <span>{log.actor?.fullName || 'User'}</span>
                          <span className="text-slate-400">•</span>
                          <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400">
                            {log.action}
                          </span>
                        </div>
                        <span>
                          {new Date(log.createdAt).toLocaleString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </span>
                      </div>

                      {/* Detail change explanation */}
                      {log.action === 'DEADLINE_CHANGE' && (
                        <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 space-y-1">
                          <div className="flex items-center gap-1.5 font-bold">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>Deadline Adjusted</span>
                          </div>
                          <div className="text-[11px]">
                            <span className="font-semibold">Reason: </span>
                            <span>{log.newValues?.reason || 'Schedule updated'}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {log.oldValues?.dueDate ? new Date(log.oldValues.dueDate).toLocaleString() : 'None'} &rarr;{' '}
                            {log.newValues?.dueDate ? new Date(log.newValues.dueDate).toLocaleString() : 'None'}
                          </div>
                        </div>
                      )}

                      {(log.action === 'MANAGER_APPROVAL' || log.action === 'MANAGER_REVIEW') && (
                        <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200 space-y-1">
                          <div className="flex items-center gap-1.5 font-bold">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Manager Review Sign-Off</span>
                          </div>
                          <div className="text-[11px]">
                            <span className="font-semibold">Note: </span>
                            <span>{log.newValues?.note || 'Verified & Signed Off'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            {saving ? 'Saving changes...' : 'All changes auto-saved'}
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-bold shadow-md hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>

      {/* Deadline Extension Modal dialog */}
      <DeadlineExtensionModal
        isOpen={isDeadlineModalOpen}
        onClose={() => setIsDeadlineModalOpen(false)}
        currentDueDate={node.dueDate}
        newDueDate={pendingDueDate}
        taskTitle={node.title}
        onConfirm={handleConfirmDeadlineExtension}
      />
    </div>
  );
};
