import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { DeadlineExtensionModal } from './DeadlineExtensionModal';
import { DynamicCustomFieldsForm } from '../custom-fields/DynamicCustomFieldsForm';
import { calculateTimeCountdown } from '../../utils/timeTracker';
import { canApproveTask } from '@flowtrack/shared';
import {
  X,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Paperclip,
  MessageSquare,
  Layers,
  Send,
  Mic,
  Square,
  Calendar,
  User,
  Users,
  Plus,
  ArrowRight,
  Sliders,
  Check,
  FileText,
  Trash2,
  Download,
  History,
  UploadCloud,
  ThumbsUp,
  ThumbsDown,
  ShieldCheck,
  Lock,
  Unlock,
  ShieldAlert,
  Loader2,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  FileCheck,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { getRolePermissions } from '../../utils/permissions';

interface NodeDetailDrawerProps {
  nodeId: string | null;
  onClose: () => void;
  onNodeUpdated: () => void;
  onDrillDown: (node: { id: string; title: string }) => void;
  onDeleteNode?: (nodeId: string) => void;
  onOpenViewDetails?: (nodeId: string) => void;
}

type TabKey = 'overview' | 'work' | 'activity';

export const NodeDetailDrawer: React.FC<NodeDetailDrawerProps> = ({
  nodeId,
  onClose,
  onNodeUpdated,
  onDrillDown,
  onDeleteNode,
}) => {
  const [node, setNode] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [drawerSaveStatus, setDrawerSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');

  // Role & Auth State
  const { user, activeWorkspaceId, getActiveRole } = useAuthStore();
  const currentRole = getActiveRole();
  const permissions = getRolePermissions(currentRole);
  const isNodeLocked = Boolean(node?.customData?.isLocked);
  const isConfidentialHidden = isNodeLocked && !permissions.canViewConfidential;

  // Form Fields (Persistent across tab switches)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [statusId, setStatusId] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [weight, setWeight] = useState(1.0);
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const [documents, setDocuments] = useState<any[]>([]);

  // Subtasks / Checklist
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [creatingSubtask, setCreatingSubtask] = useState(false);

  // Work Submission
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [submittingWork, setSubmittingWork] = useState(false);

  // Blocker Reporting
  const [isReportingBlocker, setIsReportingBlocker] = useState(false);
  const [blockerReason, setBlockerReason] = useState('');
  const [submittingBlocker, setSubmittingBlocker] = useState(false);

  // Approval / Review
  const [approvalNote, setApprovalNote] = useState('');
  const [approving, setApproving] = useState(false);

  // Deadline Extension Modal
  const [isDeadlineModalOpen, setIsDeadlineModalOpen] = useState(false);
  const [pendingDueDate, setPendingDueDate] = useState('');

  // Remarks / Comments & Voice
  const [newRemarkText, setNewRemarkText] = useState('');
  const [submittingRemark, setSubmittingRemark] = useState(false);
  const [attachedPhoto, setAttachedPhoto] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Documents
  const [docCategory, setDocCategory] = useState<'evidence' | 'deliverable' | 'specification' | 'general'>('evidence');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Synthesize audible WAV chime fallback if microphone permission is denied
  const generateChimeDataUrl = (): string => {
    const sampleRate = 8000;
    const duration = 0.8;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = new Uint8Array(44 + numSamples);
    const writeStr = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++) buffer[offset + i] = s.charCodeAt(i);
    };
    const writeUint32 = (offset: number, val: number) => {
      buffer[offset] = val & 0xff;
      buffer[offset + 1] = (val >> 8) & 0xff;
      buffer[offset + 2] = (val >> 16) & 0xff;
      buffer[offset + 3] = (val >> 24) & 0xff;
    };
    const writeUint16 = (offset: number, val: number) => {
      buffer[offset] = val & 0xff;
      buffer[offset + 1] = (val >> 8) & 0xff;
    };
    writeStr(0, 'RIFF');
    writeUint32(4, 36 + numSamples);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    writeUint32(16, 16);
    writeUint16(20, 1);
    writeUint16(22, 1);
    writeUint32(24, sampleRate);
    writeUint32(28, sampleRate);
    writeUint16(32, 1);
    writeUint16(34, 8);
    writeStr(36, 'data');
    writeUint32(40, numSamples);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const freq = t < 0.4 ? 587.33 : 880;
      const sample = Math.sin(2 * Math.PI * freq * t) * Math.exp(-3 * t);
      buffer[44 + i] = Math.floor(128 + sample * 120);
    }
    let binary = '';
    for (let i = 0; i < buffer.byteLength; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return `data:audio/wav;base64,${btoa(binary)}`;
  };

  const toDateTimeLocal = (dateVal?: string | Date | null) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const loadNode = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const data = await ApiClient.getNode(id);
      setNode(data);
      setTitle(data.title || '');
      setDescription(data.description || '');
      setProgressPct(data.progressPct || 0);
      setStatusId(data.statusId || '');
      setPriority(data.priority || 'MEDIUM');
      setWeight(data.weight || 1.0);
      setStartDate(toDateTimeLocal(data.startDate));
      setDueDate(toDateTimeLocal(data.dueDate));
      setOwnerId(data.ownerId || '');
      setReviewerId(data.reviewerId || '');
      setCollaboratorIds(data.customData?.collaboratorIds || []);
      setCustomData(data.customData || {});
      setDocuments(data.documents || []);
    } catch (e) {
      console.error('Failed to load node details', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWorkspaceMembers = useCallback(async () => {
    try {
      const wsId = activeWorkspaceId || ApiClient.getActiveWorkspaceId();
      if (wsId) {
        const data = await ApiClient.getWorkspaceMembers(wsId);
        const activeOnly = (data || []).filter(
          (m: any) => m.user?.isActive !== false && !m.user?.deletedAt
        );
        setWorkspaceMembers(activeOnly);
      }
    } catch (e) {
      console.error('Failed to load workspace members in drawer', e);
    }
  }, [activeWorkspaceId]);

  const loadHistory = useCallback(async (id: string) => {
    try {
      setLoadingHistory(true);
      const data = await ApiClient.getNodeHistory(id);
      setHistoryList(data || []);
    } catch (e) {
      console.error('Failed to load history', e);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaceMembers();
  }, [loadWorkspaceMembers]);

  useEffect(() => {
    if (nodeId) {
      loadNode(nodeId);
    } else {
      setNode(null);
    }
  }, [nodeId, loadNode]);

  useEffect(() => {
    if (nodeId && activeTab === 'activity') {
      loadHistory(nodeId);
    }
  }, [nodeId, activeTab, loadHistory]);

  // Keyboard accessibility: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!nodeId || !node) return null;

  // Confidential Security Guard
  if (isConfidentialHidden) {
    return (
      <div className="fixed inset-y-0 right-0 w-full sm:w-[500px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-50 p-6 flex flex-col justify-between animate-in slide-in-from-right duration-200">
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-amber-500" />
              Confidential Task
            </span>
            <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-center space-y-3">
            <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Access Restricted</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              This task has been locked as confidential by a Manager or Administrator. Only authorized leadership may inspect or edit its deliverables.
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors"
        >
          Close Panel
        </button>
      </div>
    );
  }

  // Save changes to backend with status indication
  const saveNodeUpdates = async (fieldUpdates: Record<string, any>) => {
    try {
      setDrawerSaveStatus('saving');
      await ApiClient.updateNode(node.id, {
        ...fieldUpdates,
      });
      setDrawerSaveStatus('saved');
      onNodeUpdated();
      await loadNode(node.id);
    } catch (e: any) {
      console.error('Failed to save task update:', e);
      setDrawerSaveStatus('error');
    }
  };

  // Plain English Status & Countdown
  const countdown = calculateTimeCountdown(dueDate, node.status?.category);
  const statusOptions = node.nodeType?.statusSet?.statuses || [];

  // Approval authorization verification (Platform Admin cannot approve, self-approval forbidden)
  const approvalAuth = canApproveTask({
    userRole: currentRole,
    userId: user?.id || '',
    taskOwnerId: node.ownerId,
    taskSubmitterId: node.submitterId,
    taskReviewerId: node.reviewerId,
  });

  const isAssignedToCurrentUser = Boolean(user?.id && node.ownerId === user.id);
  const canSubmitWork = Boolean(
    user?.id &&
    (node.ownerId === user.id || !node.ownerId || currentRole === 'TEAM_LEAD' || currentRole === 'MANAGER' || currentRole === 'ADMIN')
  );
  const isPendingApproval = node.approvalStatus === 'pending' || node.status?.category === 'pending';
  const isApproved = node.approvalStatus === 'approved' || node.status?.category === 'done';
  const isRejected = node.approvalStatus === 'rejected';

  // Handlers
  const handleApproveWork = async () => {
    if (!approvalAuth.allowed) return;
    try {
      setApproving(true);
      await ApiClient.approveTask(node.id, {
        decision: 'approved',
        feedback: approvalNote.trim() || 'Work reviewed and approved.',
      });
      setApprovalNote('');
      onNodeUpdated();
      await loadNode(node.id);
      setActiveTab('activity');
    } catch (err: any) {
      alert(err.message || 'Failed to approve task');
    } finally {
      setApproving(false);
    }
  };

  const handleRejectWork = async () => {
    if (!approvalAuth.allowed) return;
    if (!approvalNote.trim()) {
      alert('Please enter required rework notes or explanation for the changes requested.');
      return;
    }
    try {
      setApproving(true);
      await ApiClient.approveTask(node.id, {
        decision: 'rejected',
        feedback: approvalNote.trim(),
      });
      setApprovalNote('');
      onNodeUpdated();
      await loadNode(node.id);
      setActiveTab('activity');
    } catch (err: any) {
      alert(err.message || 'Failed to request rework');
    } finally {
      setApproving(false);
    }
  };

  const handleSubmitWork = async () => {
    try {
      setSubmittingWork(true);
      await ApiClient.submitTask(node.id, {
        notes: submissionNotes.trim() || undefined,
      });
      setSubmissionNotes('');
      onNodeUpdated();
      await loadNode(node.id);
      setActiveTab('activity');
    } catch (err: any) {
      alert(err.message || 'Failed to submit work for approval');
    } finally {
      setSubmittingWork(false);
    }
  };

  const handleReportBlocker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockerReason.trim()) return;
    try {
      setSubmittingBlocker(true);
      await ApiClient.reportBlocker(node.id, {
        reason: blockerReason.trim(),
      });
      setBlockerReason('');
      setIsReportingBlocker(false);
      onNodeUpdated();
      await loadNode(node.id);
    } catch (err: any) {
      alert(err.message || 'Failed to report blocker');
    } finally {
      setSubmittingBlocker(false);
    }
  };

  const handleCreateSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    try {
      setCreatingSubtask(true);
      const childCount = node.children?.length || 0;
      const childX = node.positionX !== undefined ? Math.round(node.positionX) : 100;
      const childY = node.positionY !== undefined ? Math.round(node.positionY + 230 + childCount * 170) : 350;

      const created = await ApiClient.createNode({
        projectId: node.projectId,
        parentNodeId: node.id,
        nodeTypeId: node.nodeTypeId,
        title: newSubtaskTitle.trim(),
        description: `Subtask of ${node.title}`,
        positionX: childX,
        positionY: childY,
        progressPct: 0,
      });

      // Connect parent to child
      await ApiClient.createEdge({
        projectId: node.projectId,
        sourceNodeId: node.id,
        targetNodeId: created.id,
        kind: 'sequence',
        metadata: { sourceHandle: 'bottom', targetHandle: 'top' },
      });

      setNewSubtaskTitle('');
      await loadNode(node.id);
      onNodeUpdated();
    } catch (err) {
      console.error('Failed to create subtask', err);
    } finally {
      setCreatingSubtask(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    try {
      setUploadingDoc(true);
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        await ApiClient.addDocument(node.id, {
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
          category: docCategory,
          storageKey: dataUrl,
        });
        await loadNode(node.id);
        onNodeUpdated();
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      alert(err.message || 'Failed to upload document');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleAddRemark = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const text = customText || newRemarkText;
    if (!text.trim() && !recordedAudioUrl && !attachedPhoto) return;

    try {
      setSubmittingRemark(true);
      await ApiClient.addRemark(node.id, {
        body: text || (recordedAudioUrl ? 'Voice Note' : 'Photo Attached'),
        voiceUrl: recordedAudioUrl || undefined,
        photoUrl: attachedPhoto || undefined,
      });
      setNewRemarkText('');
      setRecordedAudioUrl(null);
      setAttachedPhoto(null);
      await loadNode(node.id);
      onNodeUpdated();
    } catch (err) {
      console.error('Failed to add remark', err);
    } finally {
      setSubmittingRemark(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          setRecordedAudioUrl(reader.result as string);
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      const chimeDataUrl = generateChimeDataUrl();
      setRecordedAudioUrl(chimeDataUrl);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  return (
    <div
      id="node-detail-drawer"
      className={`fixed inset-y-0 right-0 ${
        isExpanded ? 'w-full sm:w-[760px]' : 'w-full sm:w-[520px]'
      } bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-50 flex flex-col pt-safe pb-safe transition-all duration-200 animate-in slide-in-from-right`}
    >
      {/* 1. TOP HEADER (Always Visible) */}
      <div className="h-16 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-5 flex items-center justify-between bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 mr-2 sm:mr-3">
          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => saveNodeUpdates({ title })}
              disabled={!permissions.canEditProject}
              className="w-full text-sm font-bold text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-blue-500 focus:outline-none truncate"
              placeholder="Task Name"
            />
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
              <span>{node.nodeType?.name || 'Task'}</span>
              <span>•</span>
              <span className="font-mono">{node.id.slice(0, 8)}</span>
              {drawerSaveStatus === 'saving' ? (
                <span className="flex items-center gap-1 text-amber-500 font-semibold">
                  <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                </span>
              ) : drawerSaveStatus === 'saved' ? (
                <span className="text-emerald-500 font-semibold flex items-center gap-1">
                  <Check className="w-3 h-3" /> Saved
                </span>
              ) : (
                <span className="text-rose-500 font-semibold">Save failed</span>
              )}
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Expand / Minimize Width Toggle (desktop / tablet) */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors hidden sm:inline-flex"
            title={isExpanded ? 'Collapse width' : 'Expand width'}
            aria-label={isExpanded ? 'Collapse width' : 'Expand width'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Close (Esc)"
            aria-label="Close Task Details"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 2. THE THREE CLEAN TABS NAVIGATION */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 px-2 sm:px-4 shrink-0 overflow-x-auto touch-pan-x">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-3 px-2 sm:px-3 text-[11px] sm:text-xs font-bold border-b-2 flex items-center justify-center gap-1.5 sm:gap-2 transition-all min-h-[44px] shrink-0 ${
            activeTab === 'overview'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5 shrink-0" />
          <span>Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('work')}
          className={`flex-1 py-3 px-2 sm:px-3 text-[11px] sm:text-xs font-bold border-b-2 flex items-center justify-center gap-1.5 sm:gap-2 transition-all min-h-[44px] shrink-0 ${
            activeTab === 'work'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Paperclip className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Work &amp; Evidence</span>
          {(documents.length > 0 || (node.children?.length || 0) > 0) && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
              {documents.length + (node.children?.length || 0)}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('activity')}
          className={`flex-1 py-3 px-2 sm:px-3 text-[11px] sm:text-xs font-bold border-b-2 flex items-center justify-center gap-1.5 sm:gap-2 transition-all min-h-[44px] shrink-0 ${
            activeTab === 'activity'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Activity &amp; Approvals</span>
          {isPendingApproval ? (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
          ) : isApproved ? (
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          ) : isRejected ? (
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
          ) : null}
        </button>
      </div>

      {/* 3. TAB CONTENT BODY */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4 sm:space-y-5">
        {/* ============================================================== */}
        {/* TAB 1: OVERVIEW                                                */}
        {/* ============================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Contextual Primary Action Callout */}
            {isPendingApproval ? (
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      Waiting for approval
                    </h4>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                      Submitted by {node.submitter?.fullName || 'Assignee'}. Review decision required.
                    </p>
                  </div>
                </div>
                {approvalAuth.allowed ? (
                  <button
                    onClick={() => setActiveTab('activity')}
                    className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition-colors whitespace-nowrap"
                  >
                    Review &amp; Decide
                  </button>
                ) : (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold italic">
                    {approvalAuth.reason}
                  </span>
                )}
              </div>
            ) : isRejected ? (
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-rose-900 dark:text-rose-200">
                      Changes requested
                    </h4>
                    <p className="text-[11px] text-rose-700 dark:text-rose-400 mt-0.5">
                      Reviewer requested rework before this task can be approved.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('activity')}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-colors whitespace-nowrap"
                >
                  View Feedback
                </button>
              </div>
            ) : isApproved ? (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  Task Approved &amp; Completed
                </span>
              </div>
            ) : !node.ownerId && permissions.canAssignTasks ? (
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs text-blue-800 dark:text-blue-300 flex items-center justify-between">
                <span>Task is currently unassigned. Select a team member below to start.</span>
              </div>
            ) : null}

            {canSubmitWork && !isPendingApproval && !isApproved && (
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-blue-800 dark:text-blue-300">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    {currentRole === 'MEMBER'
                      ? 'Work completed? Ask for approval from your team leader, manager, or head of org.'
                      : 'Ready for sign-off? Request approval from the Head of the Organization.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('work')}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shrink-0 transition-colors shadow-xs"
                >
                  Ask for Approval
                </button>
              </div>
            )}

            {/* Essential Task Controls: Status & Priority */}
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Status
                </label>
                <select
                  value={statusId || node.statusId || ''}
                  onChange={(e) => {
                    const nextStatusId = e.target.value;
                    setStatusId(nextStatusId);
                    saveNodeUpdates({ statusId: nextStatusId });
                  }}
                  disabled={!permissions.canEditProject}
                  className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {statusOptions.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.labelI18n?.en || s.name || s.key}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => {
                    const nextPriority = e.target.value;
                    setPriority(nextPriority);
                    saveNodeUpdates({ priority: nextPriority });
                  }}
                  disabled={!permissions.canEditProject}
                  className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
            </div>

            {/* People: Assigned To & Designated Reviewer */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between mb-1">
                  <span>Assigned to</span>
                  {node.owner && (
                    <span className="text-[10px] text-slate-400 font-normal">
                      Assigned by {node.assignedBy?.fullName || 'Manager'}
                    </span>
                  )}
                </label>
                {permissions.canAssignTasks ? (
                  <select
                    value={ownerId}
                    onChange={(e) => {
                      const nextOwner = e.target.value;
                      setOwnerId(nextOwner);
                      const chosen = workspaceMembers.find(
                        (m) => (m.user?.id || m.userId) === nextOwner
                      );
                      const assigneeName = chosen?.user?.fullName || chosen?.user?.email;
                      const assigneeAvatar = chosen?.user?.avatarUrl;
                      const updatedCustom = {
                        ...customData,
                        assigneeName: assigneeName || undefined,
                        assigneeAvatar: assigneeAvatar || undefined,
                      };
                      setCustomData(updatedCustom);
                      saveNodeUpdates({
                        ownerId: nextOwner || null,
                        customData: updatedCustom,
                      });
                    }}
                    className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Unassigned --</option>
                    {workspaceMembers.map((m: any) => {
                      const u = m.user || {};
                      const uid = u.id || m.userId;
                      return (
                        <option key={m.id || uid} value={uid}>
                          {u.fullName || u.email || 'Member'} ({m.role || 'MEMBER'})
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                      {node.owner?.fullName ? node.owner.fullName[0] : 'U'}
                    </div>
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      {node.owner?.fullName || 'Unassigned'}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Designated Reviewer
                </label>
                {permissions.canAssignTasks ? (
                  <select
                    value={reviewerId}
                    onChange={(e) => {
                      const nextRev = e.target.value;
                      setReviewerId(nextRev);
                      saveNodeUpdates({ reviewerId: nextRev || null });
                    }}
                    className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Any Authorized Manager / Lead --</option>
                    {workspaceMembers
                      .filter((m: any) => m.role === 'MANAGER' || m.role === 'TEAM_LEAD' || m.role === 'ADMIN')
                      .map((m: any) => {
                        const u = m.user || {};
                        const uid = u.id || m.userId;
                        return (
                          <option key={m.id || uid} value={uid}>
                            {u.fullName || u.email} ({m.role})
                          </option>
                        );
                      })}
                  </select>
                ) : (
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300">
                    {node.reviewer?.fullName || 'Any Authorized Manager'}
                  </div>
                )}
              </div>

              {/* Additional Collaborators / Multi-Assignees */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between mb-1">
                  <span>Additional Collaborators ({collaboratorIds.length})</span>
                </label>
                {permissions.canAssignTasks ? (
                  <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 max-h-28 overflow-y-auto">
                    {workspaceMembers.map((m: any) => {
                      const u = m.user || {};
                      const uid = u.id || m.userId;
                      const isSelected = collaboratorIds.includes(uid);
                      return (
                        <button
                          key={uid}
                          type="button"
                          onClick={() => {
                            const newCols = isSelected
                              ? collaboratorIds.filter((id) => id !== uid)
                              : [...collaboratorIds, uid];
                            setCollaboratorIds(newCols);
                            const updatedCustom = {
                              ...customData,
                              collaboratorIds: newCols,
                            };
                            setCustomData(updatedCustom);
                            saveNodeUpdates({ customData: updatedCustom });
                          }}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-colors ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                          }`}
                        >
                          <span>{u.fullName || u.email || 'Member'}</span>
                          {isSelected && <Check className="w-2.5 h-2.5" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {collaboratorIds.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">No additional collaborators</span>
                    ) : (
                      collaboratorIds.map((cid) => {
                        const m = workspaceMembers.find((wm) => (wm.user?.id || wm.userId) === cid);
                        return (
                          <span
                            key={cid}
                            className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                          >
                            {m?.user?.fullName || m?.user?.email || 'Collaborator'}
                          </span>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Dates & Deadline Status */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Start Date
                  </label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    onBlur={() => {
                      const parsed = startDate ? new Date(startDate).toISOString() : null;
                      saveNodeUpdates({ startDate: parsed });
                    }}
                    disabled={!permissions.canEditProject}
                    className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Due Date
                  </label>
                  <input
                    type="datetime-local"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    onBlur={() => {
                      const parsed = dueDate ? new Date(dueDate).toISOString() : null;
                      saveNodeUpdates({ dueDate: parsed });
                    }}
                    disabled={!permissions.canEditProject}
                    className={`w-full p-2 text-xs rounded-xl border ${
                      countdown.isOverdue ? 'border-rose-400 text-rose-600' : 'border-slate-200 dark:border-slate-700'
                    } bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                </div>
              </div>

              {/* Deadline Status Banner */}
              {countdown.isOverdue ? (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-center justify-between text-xs text-rose-800 dark:text-rose-300">
                  <span className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    <span>🚨 {countdown.formattedText}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingDueDate(dueDate);
                      setIsDeadlineModalOpen(true);
                    }}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors"
                  >
                    Extend Deadline
                  </button>
                </div>
              ) : countdown.isTwoDaysAlert ? (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-xs text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>{countdown.formattedText} (Approaching)</span>
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Check className="w-3 h-3 text-emerald-500" />
                  <span>On schedule</span>
                </div>
              )}
            </div>

            {/* Parent Stage / Hierarchy (if applicable) */}
            {node.parentNode && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500">Parent Step / Stage:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {node.parentNode.title}
                </span>
              </div>
            )}

            {/* Work Progress Slider */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-700 dark:text-slate-300">Work Progress</span>
                <span className="text-blue-600 dark:text-blue-400 font-mono">{progressPct}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={progressPct}
                onChange={(e) => setProgressPct(Number(e.target.value))}
                onMouseUp={() => saveNodeUpdates({ progressPct })}
                onTouchEnd={() => saveNodeUpdates({ progressPct })}
                disabled={!permissions.canEditProject}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>

            {/* Progressive Disclosure: Advanced Settings */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center justify-between w-full p-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <span>Advanced details (Scope, Custom Properties, Weight)</span>
                {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-4 animate-in fade-in duration-150">
                  {/* Task Instructions / Scope */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Instructions &amp; Scope
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      onBlur={() => saveNodeUpdates({ description })}
                      disabled={!permissions.canEditProject}
                      rows={3}
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      placeholder="Detailed instructions or specifications for the assignee..."
                    />
                  </div>

                  {/* Task Weight */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Task Weight (Progress Impact)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={weight}
                      onChange={(e) => setWeight(Number(e.target.value))}
                      onBlur={() => saveNodeUpdates({ weight: Number(weight) })}
                      disabled={!permissions.canEditProject}
                      className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  {/* Dynamic Custom Fields */}
                  {((node.applicableFields && node.applicableFields.length > 0) ||
                    (node.nodeType?.fields && node.nodeType.fields.length > 0)) && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                        Custom Properties
                      </span>
                      <DynamicCustomFieldsForm
                        fields={node.applicableFields || node.nodeType?.fields || []}
                        values={customData}
                        onChange={(newCustom) => {
                          setCustomData(newCustom);
                          saveNodeUpdates({ customData: newCustom });
                        }}
                        currentUserRole={currentRole}
                        isReadOnly={!permissions.canEditProject}
                        members={workspaceMembers.map((m: any) => ({
                          id: m.userId || m.user?.id || m.id,
                          name: m.user?.fullName || m.user?.email || 'Member',
                          email: m.user?.email,
                          role: m.role,
                        }))}
                      />
                    </div>
                  )}

                  {/* Danger Zone: Delete Task */}
                  {onDeleteNode && permissions.canEditProject && (
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                      <div>
                        <span className="text-xs font-bold text-rose-600 block">Delete Task</span>
                        <span className="text-[11px] text-slate-400">Remove this node and its dependencies</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete task "${node.title}"? This cannot be undone.`)) {
                            onDeleteNode(node.id);
                            onClose();
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 text-xs font-bold transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: WORK & EVIDENCE                                         */}
        {/* ============================================================== */}
        {activeTab === 'work' && (
          <div className="space-y-5">
            {/* 1. Checklist & Subtasks */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-500" />
                  <span>Checklist &amp; Subtasks ({node.children?.length || 0})</span>
                </h4>
                <button
                  type="button"
                  onClick={() => onDrillDown({ id: node.id, title: node.title })}
                  className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                >
                  <span>Open Sub-Canvas</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* Add Subtask Input */}
              {permissions.canCreateChildNodes && (
                <form onSubmit={handleCreateSubtask} className="flex gap-2">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Add step or subtask..."
                    className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={creatingSubtask || !newSubtaskTitle.trim()}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm"
                  >
                    + Add
                  </button>
                </form>
              )}

              {/* Subtasks List */}
              <div className="space-y-1.5">
                {(node.children || []).length === 0 ? (
                  <p className="text-xs text-slate-400 py-2 text-center">
                    No subtasks yet. Add step-by-step checklist items above.
                  </p>
                ) : (
                  node.children.map((sub: any) => {
                    const isDone = sub.status?.category === 'done';
                    return (
                      <div
                        key={sub.id}
                        className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={async (e) => {
                              const doneStatus = sub.nodeType?.statusSet?.statuses?.find(
                                (s: any) => s.category === 'done' || s.key === 'done'
                              );
                              const activeStatus = sub.nodeType?.statusSet?.statuses?.find(
                                (s: any) => s.category === 'active' || s.key === 'in_progress'
                              );
                              const targetStatus = e.target.checked ? doneStatus : activeStatus;
                              if (targetStatus) {
                                await ApiClient.updateNode(sub.id, {
                                  statusId: targetStatus.id,
                                  progressPct: e.target.checked ? 100 : 0,
                                });
                                await loadNode(node.id);
                                onNodeUpdated();
                              }
                            }}
                            className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                          />
                          <span
                            className={`text-xs font-medium truncate ${
                              isDone ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {sub.title}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            if (window.confirm(`Delete subtask "${sub.title}"?`)) {
                              await ApiClient.deleteNode(sub.id);
                              await loadNode(node.id);
                              onNodeUpdated();
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-500 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 2. Dependencies & Blockers */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  <span>Dependencies &amp; Blockers</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setIsReportingBlocker(!isReportingBlocker)}
                  className="text-[11px] font-bold text-amber-600 hover:underline"
                >
                  {isReportingBlocker ? 'Cancel' : 'Report Blocker'}
                </button>
              </div>

              {isReportingBlocker && (
                <form onSubmit={handleReportBlocker} className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl space-y-2">
                  <input
                    type="text"
                    value={blockerReason}
                    onChange={(e) => setBlockerReason(e.target.value)}
                    placeholder="Why is this task blocked? (e.g. Waiting for client spec, missing part)"
                    className="w-full p-2 text-xs rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="submit"
                      disabled={submittingBlocker || !blockerReason.trim()}
                      className="px-3 py-1 bg-amber-600 text-white rounded-lg text-xs font-bold"
                    >
                      {submittingBlocker ? 'Flagging...' : 'Flag Blocker'}
                    </button>
                  </div>
                </form>
              )}

              {node.isBlocked || node.status?.category === 'blocked' ? (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-xs text-amber-800 dark:text-amber-300 font-medium">
                  ⚠️ This task is blocked: {node.customData?.blockerReason || 'Waiting on previous steps'}
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  No active blockers. Work can proceed normally.
                </p>
              )}
            </div>

            {/* 3. Attachments & Evidence Deliverables */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-blue-500" />
                  <span>Deliverables &amp; Evidence ({documents.length})</span>
                </h4>
                <div className="flex items-center gap-1">
                  {(['evidence', 'specification', 'general'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setDocCategory(cat)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold capitalize transition-colors ${
                        docCategory === cat
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Upload Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFileUpload(f);
                }}
                className="p-4 border-2 border-dashed border-blue-200 dark:border-blue-900/60 rounded-xl bg-blue-50/30 dark:bg-blue-950/20 text-center cursor-pointer hover:border-blue-400 transition-colors"
              >
                <UploadCloud className="w-6 h-6 text-blue-500 mx-auto mb-1" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  {uploadingDoc ? 'Uploading...' : `Add ${docCategory} file`}
                </span>
                <span className="text-[10px] text-slate-400">Click or drag file to attach</span>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f);
                  }}
                  className="hidden"
                />
              </div>

              {/* Document List */}
              <div className="space-y-1.5">
                {documents.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2 text-center">
                    No files attached yet. Add reports, photos, or evidence above.
                  </p>
                ) : (
                  documents.map((doc: any) => (
                    <div
                      key={doc.id}
                      className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileCheck className="w-4 h-4 text-indigo-500 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                            {doc.name}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            v{doc.version || 1} • {Math.round((doc.fileSize || 1024) / 1024)} KB • {doc.category || 'general'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a
                          href={ApiClient.getDocumentDownloadUrl(node.id, doc.id)}
                          download={doc.name}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 text-blue-600 hover:text-blue-700 rounded"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={async () => {
                            if (window.confirm(`Delete document "${doc.name}"?`)) {
                              await ApiClient.deleteDocument(doc.id);
                              await loadNode(node.id);
                              onNodeUpdated();
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-500 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 4. Comments & Collaboration Feed */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                <span>Comments &amp; Field Updates</span>
              </h4>

              {/* Quick Status Presets */}
              <div className="flex flex-wrap gap-1.5">
                {['Started work', 'Waiting for inspection', 'Draft ready for review', 'Task completed'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleAddRemark(undefined, preset)}
                    disabled={submittingRemark}
                    className="px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-semibold text-slate-700 dark:text-slate-300 hover:border-blue-500"
                  >
                    + {preset}
                  </button>
                ))}
              </div>

              {/* Comment Input */}
              <form onSubmit={handleAddRemark} className="space-y-2">
                <textarea
                  value={newRemarkText}
                  onChange={(e) => setNewRemarkText(e.target.value)}
                  placeholder="Post an update or comment..."
                  rows={2}
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />

                {/* Voice / Photo preview */}
                {recordedAudioUrl && (
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-xs">
                    <Mic className="w-3.5 h-3.5 text-blue-600" />
                    <audio src={recordedAudioUrl} controls className="h-6 w-full max-w-[200px]" />
                    <button type="button" onClick={() => setRecordedAudioUrl(null)}>
                      <X className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {!isRecording ? (
                      <button
                        type="button"
                        onClick={startRecording}
                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800"
                        title="Voice note"
                      >
                        <Mic className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="p-1.5 text-rose-600 bg-rose-100 rounded-lg font-bold text-xs flex items-center gap-1"
                      >
                        <Square className="w-3.5 h-3.5" /> Stop
                      </button>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={submittingRemark || (!newRemarkText.trim() && !recordedAudioUrl)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm"
                  >
                    {submittingRemark ? 'Posting...' : 'Post Comment'}
                  </button>
                </div>
              </form>

              {/* Comments Timeline */}
              <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-slate-800 max-h-56 overflow-y-auto">
                {(node.remarks || []).length === 0 ? (
                  <p className="text-xs text-slate-400 py-1 text-center">No comments yet.</p>
                ) : (
                  node.remarks.map((r: any) => (
                    <div key={r.id} className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {r.author?.fullName || 'Collaborator'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300">{r.body}</p>
                      {r.voiceUrl && <audio src={r.voiceUrl} controls className="h-6 w-full mt-1" />}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 5. Submit Work for Approval Action */}
            {canSubmitWork && !isPendingApproval && !isApproved && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white space-y-2 shadow-md">
                <h4 className="text-xs font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {currentRole === 'MEMBER'
                      ? 'Ask for Approval (from Team Lead / Manager / Head of Org)'
                      : 'Request Approval from Head of Organization'}
                  </span>
                </h4>
                <p className="text-[11px] text-blue-100">
                  {currentRole === 'MEMBER'
                    ? 'Work ready? Submit your deliverables to request approval from your Team Leader, Manager, or Head of Organization.'
                    : 'Submit this task to request official sign-off and approval from the Head of the Organization.'}
                </p>
                <textarea
                  value={submissionNotes}
                  onChange={(e) => setSubmissionNotes(e.target.value)}
                  placeholder="Notes for the reviewer (e.g. Completed per guidelines, see attached document)..."
                  rows={2}
                  className="w-full p-2 text-xs rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-blue-200 focus:outline-none focus:bg-white/20 resize-none"
                />
                <button
                  type="button"
                  onClick={handleSubmitWork}
                  disabled={submittingWork}
                  className="w-full py-2.5 min-h-[44px] bg-white text-blue-600 hover:bg-blue-50 font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>
                    {submittingWork
                      ? 'Submitting...'
                      : currentRole === 'MEMBER'
                      ? 'Ask for Approval'
                      : 'Request Approval from Head of Org'}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: ACTIVITY & APPROVALS                                    */}
        {/* ============================================================== */}
        {activeTab === 'activity' && (
          <div className="space-y-5">
            {/* Approval Decision Card (For Authorized Reviewers) */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-600" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    Approval &amp; Quality Review
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Sign off on deliverables or request changes
                  </span>
                </div>
              </div>

              {/* Status Banner */}
              <div
                className={`p-3 rounded-xl border text-xs font-semibold ${
                  isApproved
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                    : isRejected
                    ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 text-rose-800 dark:text-rose-300'
                    : isPendingApproval
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-800 dark:text-amber-300'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 text-slate-700 dark:text-slate-300'
                }`}
              >
                {isApproved
                  ? `✓ Approved by ${node.reviewer?.fullName || 'Manager'}`
                  : isRejected
                  ? `⚠️ Changes Requested: ${node.approvalFeedback || 'Rework required'}`
                  : isPendingApproval
                  ? '⏳ Pending Manager Review'
                  : 'No approval requested yet'}
              </div>

              {/* Reviewer Actions */}
              {approvalAuth.allowed ? (
                <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Review Assessment / Feedback Note
                  </label>
                  <textarea
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                    placeholder="Enter approval note or specific rework requirements..."
                    rows={2}
                    className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={approving}
                      onClick={handleApproveWork}
                      className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{approving ? 'Saving...' : 'Approve Work'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={approving}
                      onClick={handleRejectWork}
                      className="py-2.5 px-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      <span>{approving ? 'Saving...' : 'Request Changes'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 italic bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  ℹ️ {approvalAuth.reason}
                </div>
              )}
            </div>

            {/* Timeline Extension Requests */}
            {customData?.deadlineExtension && (
              <div className="p-3.5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Timeline Extension Request</span>
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-amber-100 text-amber-800 dark:bg-amber-900">
                    {customData.deadlineExtension.status || 'PENDING'}
                  </span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {customData.deadlineExtension.reason}
                </p>
                {customData.deadlineExtension.revisedDueDate && (
                  <p className="text-[11px] text-slate-500">
                    Requested due date: {new Date(customData.deadlineExtension.revisedDueDate).toLocaleDateString()}
                  </p>
                )}
                {permissions.canApproveDeadlineExtension && customData.deadlineExtension.status === 'PENDING' && (
                  <div className="flex gap-2 pt-2 border-t border-amber-200">
                    <button
                      type="button"
                      onClick={async () => {
                        const updated = {
                          ...customData,
                          deadlineExtension: { ...customData.deadlineExtension, status: 'APPROVED' },
                        };
                        setCustomData(updated);
                        await ApiClient.updateNode(node.id, {
                          dueDate: customData.deadlineExtension.revisedDueDate,
                          customData: updated,
                        });
                        await loadNode(node.id);
                        onNodeUpdated();
                      }}
                      className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                    >
                      Approve Extension
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const updated = {
                          ...customData,
                          deadlineExtension: { ...customData.deadlineExtension, status: 'REJECTED' },
                        };
                        setCustomData(updated);
                        await ApiClient.updateNode(node.id, { customData: updated });
                        await loadNode(node.id);
                        onNodeUpdated();
                      }}
                      className="px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-bold"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Audit Trail & Activity Log */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-blue-500" />
                <span>Audit Trail &amp; Revision Log</span>
              </h4>

              {loadingHistory ? (
                <p className="text-xs text-slate-400 py-3 text-center">Loading audit log...</p>
              ) : historyList.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">No history recorded yet.</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {historyList.map((log: any) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {log.actor?.fullName || 'Collaborator'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(log.createdAt).toLocaleDateString()} {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-950 text-blue-600">
                        {log.action}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Deadline Extension Request Modal */}
      <DeadlineExtensionModal
        isOpen={isDeadlineModalOpen}
        onClose={() => setIsDeadlineModalOpen(false)}
        currentDueDate={dueDate}
        newDueDate={pendingDueDate}
        taskTitle={title}
        onConfirm={async (reason, revisedDueDate, attachedDoc) => {
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

          setIsDeadlineModalOpen(false);
          await loadNode(node.id);
          onNodeUpdated();
        }}
      />
    </div>
  );
};
