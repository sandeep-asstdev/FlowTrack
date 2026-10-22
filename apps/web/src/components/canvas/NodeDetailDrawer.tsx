import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { DeadlineExtensionModal } from './DeadlineExtensionModal';
import { calculateTimeCountdown } from '../../utils/timeTracker';
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
  Play,
  Pause,
  Image as ImageIcon,
  Calendar,
  User,
  Plus,
  ArrowRight,
  Sparkles,
  Sliders,
  Check,
  FileText,
  Trash2,
  Download,
  Eye,
  History,
  UploadCloud,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  ShieldCheck,
  Lock,
  Unlock,
  Shield,
  Users,
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

export const NodeDetailDrawer: React.FC<NodeDetailDrawerProps> = ({
  nodeId,
  onClose,
  onNodeUpdated,
  onDrillDown,
  onDeleteNode,
  onOpenViewDetails,
}) => {
  const [node, setNode] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'remarks' | 'details' | 'approval' | 'children' | 'docs' | 'history'
  >('remarks');

  // Role & Auth
  const { user, workspaces, activeWorkspaceId, getActiveRole } = useAuthStore();
  const currentRole = getActiveRole();
  const permissions = getRolePermissions(currentRole);
  const isManager = permissions.canApproveTasks;
  const isNodeLocked = Boolean(node?.customData?.isLocked);
  const isConfidentialHidden = isNodeLocked && !permissions.canViewConfidential;

  // Manager Approval State
  const [approvalNote, setApprovalNote] = useState('');
  const [approving, setApproving] = useState(false);

  // Deadline Extension Modal State
  const [isDeadlineModalOpen, setIsDeadlineModalOpen] = useState(false);
  const [pendingDueDate, setPendingDueDate] = useState('');

  // Editable fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [statusId, setStatusId] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [weight, setWeight] = useState(1.0);
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);
  const [customData, setCustomData] = useState<Record<string, any>>({});

  // Remarks state
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

  // Documents state
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History state
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Children state
  const [newChildTitle, setNewChildTitle] = useState('');
  const [creatingChild, setCreatingChild] = useState(false);

  // Audio helper: generates a clean, valid PCM WAV chime encoded in base64 data URL
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

  const loadNode = async (id: string) => {
    try {
      setLoading(true);
      const data = await ApiClient.getNode(id);
      setNode(data);
      setTitle(data.title);
      setDescription(data.description || '');
      setProgressPct(data.progressPct || 0);
      setStatusId(data.statusId || '');
      setPriority(data.priority || 'MEDIUM');
      setWeight(data.weight || 1.0);
      setStartDate(toDateTimeLocal(data.startDate));
      setDueDate(toDateTimeLocal(data.dueDate));
      setOwnerId(data.ownerId || '');
      setCustomData(data.customData || {});
      setDocuments(data.documents || []);
    } catch (e) {
      console.error('Failed to load node details', e);
    } finally {
      setLoading(false);
    }
  };

  const loadWorkspaceMembers = async () => {
    try {
      const wsId = activeWorkspaceId || ApiClient.getActiveWorkspaceId();
      if (wsId) {
        const data = await ApiClient.getWorkspaceMembers(wsId);
        setWorkspaceMembers(data || []);
      }
    } catch (e) {
      console.error('Failed to load workspace members in drawer', e);
    }
  };

  useEffect(() => {
    loadWorkspaceMembers();
  }, [activeWorkspaceId]);

  const loadHistory = async (id: string) => {
    try {
      setLoadingHistory(true);
      const data = await ApiClient.getNodeHistory(id);
      setHistoryList(data || []);
    } catch (e) {
      console.error('Failed to load history', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (nodeId) {
      loadNode(nodeId);
    } else {
      setNode(null);
    }
  }, [nodeId]);

  useEffect(() => {
    if (nodeId && activeTab === 'history') {
      loadHistory(nodeId);
    }
  }, [nodeId, activeTab]);

  // Keyboard accessibility: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!nodeId || !node) return null;

  if (isConfidentialHidden) {
    return (
      <div className="fixed inset-y-0 right-0 w-full sm:w-[460px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-50 p-6 flex flex-col justify-between animate-in slide-in-from-right duration-200">
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-500" />
              <span className="font-bold text-sm text-slate-900 dark:text-white">Confidential Task</span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-8 text-center p-6 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60">
            <Lock className="w-10 h-10 text-amber-600 dark:text-amber-400 mx-auto mb-3" />
            <h3 className="font-bold text-base text-slate-900 dark:text-white">Access Restricted</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
              This node has been locked as confidential by{' '}
              <strong className="text-slate-900 dark:text-white">
                {node?.customData?.lockedBy || 'Manager'}
              </strong>
              {node?.customData?.lockedAt && ` on ${new Date(node.customData.lockedAt).toLocaleDateString()}`}.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Editing, document viewing, and remarks are restricted to Managers and Super Admins.
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          Close Drawer
        </button>
      </div>
    );
  }

  const countdown = calculateTimeCountdown(node.dueDate, node.status?.category);

  const handleSaveDetails = async () => {
    try {
      await ApiClient.updateNode(node.id, {
        title,
        description,
        progressPct,
        statusId: statusId || undefined,
        priority: priority as any,
        weight: Number(weight),
        startDate: startDate ? new Date(startDate).toISOString() : null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        ownerId: ownerId || null,
        customData,
        version: node.version,
      });
      onNodeUpdated();
      loadNode(node.id);
    } catch (e) {
      console.error('Failed to update node', e);
    }
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
      console.error('Failed to toggle document lock', e);
    }
  };

  const handleConfirmDeadlineExtension = async (
    reason: string,
    revisedDueDate?: string,
    attachedDoc?: string
  ) => {
    const finalDueDate = revisedDueDate || pendingDueDate || dueDate;
    setDueDate(finalDueDate);
    const docName = attachedDoc ? `Delay-Notice-${Date.now().toString().slice(-4)}.pdf` : null;

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
      console.error('Failed to approve deadline extension', e);
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
      console.error('Failed to reject deadline extension', e);
    }
  };

  const handleManagerApprove = async () => {
    if (!isManager) return;
    try {
      setApproving(true);
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

  // Remarks handling
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

  // Voice recording logic via Web Audio / MediaRecorder API
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
          const base64Audio = reader.result as string;
          setRecordedAudioUrl(base64Audio);
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
    } catch (err) {
      console.warn('Microphone access denied or not supported:', err);
      // Fallback voice note: generate a real audible synthesized chime audio data URL
      const chimeDataUrl = generateChimeDataUrl();
      setRecordedAudioUrl(chimeDataUrl);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      clearInterval(recordingTimerRef.current);
      setIsRecording(false);
    } else if (isRecording) {
      clearInterval(recordingTimerRef.current);
      setIsRecording(false);
    }
  };

  // Client-side image compressor to ensure fast remark uploads
  const compressImage = (dataUrl: string, maxDim = 1200): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  // Photo attachment handling with auto-compression
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const raw = event.target?.result as string;
        const compressed = await compressImage(raw);
        setAttachedPhoto(compressed);
      };
      reader.readAsDataURL(file);
    }
  };

  // Document upload handling
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
          storageKey: dataUrl,
        });
        await loadNode(node.id);
        onNodeUpdated();
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed to upload document', err);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async (docId: string, docName: string) => {
    if (window.confirm(`Delete document "${docName}"?`)) {
      await ApiClient.deleteDocument(docId);
      await loadNode(node.id);
      onNodeUpdated();
    }
  };

  // Child node creation
  const handleCreateChild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChildTitle.trim()) return;
    try {
      setCreatingChild(true);
      const childCount = node.children?.length || 0;
      const childX = node.positionX !== undefined ? Math.round(node.positionX) : 100;
      const childY = node.positionY !== undefined ? Math.round(node.positionY + 240 + childCount * 180) : 350;

      const created = await ApiClient.createNode({
        projectId: node.projectId,
        parentNodeId: node.id,
        nodeTypeId: node.nodeTypeId,
        title: newChildTitle,
        description: `Sub-task of ${node.title}`,
        positionX: childX,
        positionY: childY,
        progressPct: 0,
      });

      // Also create sequence edge connecting parent to child!
      await ApiClient.createEdge({
        projectId: node.projectId,
        sourceNodeId: node.id,
        targetNodeId: created.id,
        kind: 'sequence',
        metadata: {
          sourceHandle: 'bottom',
          targetHandle: 'top',
        },
      });

      setNewChildTitle('');
      await loadNode(node.id);
      onNodeUpdated();
    } catch (err) {
      console.error('Failed to create child node', err);
    } finally {
      setCreatingChild(false);
    }
  };

  const quickRemarkPresets = [
    'Draft sent for client review and verification',
    'Awaiting physical stamp from local authority',
    'Site boundary inspection completed successfully',
    'Payment milestone invoice raised',
    'Urgent clarification required on easement setback',
  ];

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[500px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/70 dark:bg-slate-950/70">
        <div className="flex-1 mr-3">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
              {node.nodeType?.name || 'Task'}
            </span>
            {node.nodeType?.isGroup && (
              <span className="text-[10px] font-bold px-2 py-0.5 bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded-md flex items-center gap-1">
                <Layers className="w-3 h-3" />
                Group ({node.children?.length || 0} sub-items)
              </span>
            )}
            {node.status?.category === 'blocked' && (
              <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Waiting Blocker
              </span>
            )}
            {node.rollup && (
              <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md">
                Rollup: {node.rollup.progressPct}%
              </span>
            )}
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSaveDetails}
            className="w-full text-base font-bold bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-blue-500 focus:outline-none text-slate-900 dark:text-white"
            placeholder="Node Title"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {/* Lock / Unlock Node Toggle (Manager & Super Admin) */}
          {permissions.canToggleLock ? (
            <button
              onClick={handleToggleNodeLock}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm ${
                isNodeLocked
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950/50'
              }`}
              title={isNodeLocked ? 'Confidential node is locked. Click to unlock.' : 'Lock node as confidential.'}
            >
              {isNodeLocked ? <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
              <span>{isNodeLocked ? 'Locked' : 'Lock'}</span>
            </button>
          ) : isNodeLocked ? (
            <div className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" />
              <span>Confidential</span>
            </div>
          ) : null}

          {onOpenViewDetails && (
            <button
              onClick={() => {
                onClose();
                onOpenViewDetails(node.id);
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 transition-colors flex items-center gap-1 shadow-sm"
              title="Open Complete Task Details & Documents Modal"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Full Details</span>
            </button>
          )}

          {onDeleteNode && (
            <button
              onClick={() => {
                if (
                  window.confirm(
                    `Are you sure you want to delete task "${node.title}"? This cannot be undone.`
                  )
                ) {
                  onDeleteNode(node.id);
                  onClose();
                }
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 transition-colors flex items-center gap-1 shadow-sm"
              title="Delete this task"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
            title="Close Drawer (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('remarks')}
          className={`flex-1 py-2.5 px-2 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
            activeTab === 'remarks'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Remarks</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800">
            {node.remarks?.length || 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('details')}
          className={`flex-1 py-2.5 px-2 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
            activeTab === 'details'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Details</span>
        </button>

        <button
          onClick={() => setActiveTab('approval')}
          className={`flex-1 py-2.5 px-2 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
            activeTab === 'approval'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Approval</span>
          {node.customData?.managerReview?.reaction && (
            <span className="text-[10px]">
              {node.customData.managerReview.reaction === 'thumbs_up' ? '👍' : '👎'}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('docs')}
          className={`flex-1 py-2.5 px-2 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
            activeTab === 'docs'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Paperclip className="w-3.5 h-3.5" />
          <span>Docs</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800">
            {documents.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('children')}
          className={`flex-1 py-2.5 px-2 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
            activeTab === 'children'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Children</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800">
            {node.children?.length || 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2.5 px-2 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
            activeTab === 'history'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>History</span>
        </button>
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* TAB 1: REMARKS & COMMENTS (Voice, Photos, Presets) */}
        {activeTab === 'remarks' && (
          <div className="flex flex-col h-full space-y-4">
            {/* Quick remark presets */}
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                ⚡ Quick Status Updates
              </span>
              <div className="flex flex-wrap gap-1.5">
                {quickRemarkPresets.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAddRemark(undefined, preset)}
                    disabled={submittingRemark}
                    className="text-[11px] text-left px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Form with Audio & Photo Upload */}
            <form
              onSubmit={handleAddRemark}
              className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2.5"
            >
              <textarea
                value={newRemarkText}
                onChange={(e) => setNewRemarkText(e.target.value)}
                placeholder="Write a field remark or update..."
                rows={2}
                className="w-full text-xs bg-transparent border-0 focus:outline-none text-slate-900 dark:text-slate-100 resize-none"
              />

              {/* Photo Attachment Preview */}
              {attachedPhoto && (
                <div className="relative inline-block border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-w-[200px]">
                  <img src={attachedPhoto} alt="Attachment" className="max-h-28 object-cover" />
                  <button
                    type="button"
                    onClick={() => setAttachedPhoto(null)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-slate-900/80 text-white hover:bg-rose-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Recorded Audio Preview */}
              {recordedAudioUrl && (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900">
                  <Mic className="w-4 h-4 text-blue-600" />
                  <audio src={recordedAudioUrl} controls className="h-7 w-full max-w-[240px]" />
                  <button
                    type="button"
                    onClick={() => setRecordedAudioUrl(null)}
                    className="p-1 text-slate-400 hover:text-rose-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Active Voice Recording Indicator */}
              {isRecording && (
                <div className="flex items-center justify-between p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                    <span>Recording audio: {formatSeconds(recordingSeconds)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="px-2 py-1 bg-rose-600 text-white rounded-md text-[11px] font-bold flex items-center gap-1 shadow-sm"
                  >
                    <Square className="w-3 h-3" />
                    <span>Stop</span>
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800">
                <div className="flex items-center gap-1 text-slate-400">
                  {/* Voice recording trigger */}
                  {!isRecording ? (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-600 transition-colors"
                      title="Record Voice Note"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="p-1.5 rounded-lg bg-rose-100 text-rose-600"
                      title="Stop Recording"
                    >
                      <Square className="w-4 h-4" />
                    </button>
                  )}

                  {/* Photo attachment trigger */}
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-600 transition-colors"
                    title="Attach Site Photo"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </button>
                  <input
                    type="file"
                    ref={photoInputRef}
                    onChange={handlePhotoSelect}
                    accept="image/*"
                    hidden
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingRemark || (!newRemarkText.trim() && !recordedAudioUrl && !attachedPhoto)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-blue-500/20 disabled:opacity-50 flex items-center gap-1 transition-all"
                >
                  <Send className="w-3 h-3" />
                  <span>{submittingRemark ? 'Posting...' : 'Post Remark'}</span>
                </button>
              </div>
            </form>

            {/* Remarks Timeline */}
            <div className="flex-1 space-y-3 pt-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Activity & Remarks Feed
              </span>

              {node.remarks?.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No remarks yet. Add a quick update, voice note, or photo above!
                </div>
              ) : (
                node.remarks?.map((remark: any) => (
                  <div
                    key={remark.id}
                    className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
                          {remark.author?.fullName?.[0] || 'U'}
                        </div>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {remark.author?.fullName || 'Collaborator'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {new Date(remark.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {remark.body}
                    </p>

                    {/* Render attached photo if available */}
                    {remark.photoUrl && (
                      <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800">
                        <img
                          src={remark.photoUrl}
                          alt="Remark photo"
                          className="max-h-48 w-full object-cover cursor-pointer hover:opacity-95"
                          onClick={() => window.open(remark.photoUrl, '_blank')}
                        />
                      </div>
                    )}

                    {/* Render voice note if available */}
                    {remark.voiceUrl && (
                      <div className="mt-2 flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <Mic className="w-3.5 h-3.5 text-blue-500" />
                        <audio src={remark.voiceUrl} controls className="h-6 w-full" />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 2: DETAILS (Dates, Priority, Weight, Progress, Custom Fields) */}
        {activeTab === 'details' && (
          <div className="space-y-4">
            {/* Assigned Team Member & Presence (Assigning enabled for Manager & Team Lead) */}
            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-500" />
                  <span>Assigned Team Member</span>
                </label>
                {permissions.canAssignTasks && (
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md">
                    Assign Enabled ({permissions.roleLabel})
                  </span>
                )}
              </div>

              {permissions.canAssignTasks ? (
                <div className="space-y-2">
                  <select
                    value={ownerId}
                    onChange={async (e) => {
                      const newOwnerId = e.target.value;
                      setOwnerId(newOwnerId);
                      const chosen = workspaceMembers.find(
                        (m) => (m.user?.id || m.userId) === newOwnerId
                      );
                      const assigneeName = chosen?.user?.fullName || chosen?.user?.email;
                      const assigneeAvatar = chosen?.user?.avatarUrl;
                      const updatedCustom = {
                        ...customData,
                        assigneeName: assigneeName || undefined,
                        assigneeAvatar: assigneeAvatar || undefined,
                      };
                      setCustomData(updatedCustom);
                      await ApiClient.updateNode(node.id, {
                        ownerId: newOwnerId || null,
                        customData: updatedCustom,
                        version: node.version,
                      });
                      onNodeUpdated();
                      await loadNode(node.id);
                    }}
                    className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Unassigned (Click to Assign) --</option>
                    {workspaceMembers.map((m: any) => {
                      const u = m.user || {};
                      const uid = u.id || m.userId;
                      return (
                        <option key={m.id || uid} value={uid}>
                          {u.fullName || u.email || 'Team Member'} ({m.role || 'MEMBER'})
                        </option>
                      );
                    })}
                  </select>

                  {/* Presence Status Toggle (Live vs Offline) */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          customData?.isLive !== false ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                        }`}
                      />
                      <span>Presence Status:</span>
                    </span>
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={async () => {
                          const updated = { ...customData, isLive: true };
                          setCustomData(updated);
                          await ApiClient.updateNode(node.id, { customData: updated, version: node.version });
                          onNodeUpdated();
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          customData?.isLive !== false
                            ? 'bg-emerald-500 text-white shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        🟢 Live
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const updated = { ...customData, isLive: false };
                          setCustomData(updated);
                          await ApiClient.updateNode(node.id, { customData: updated, version: node.version });
                          onNodeUpdated();
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          customData?.isLive === false
                            ? 'bg-slate-600 text-white shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Offline
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                        {node.owner?.fullName ? node.owner.fullName[0] : 'U'}
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-white dark:ring-slate-800 ${
                          customData?.isLive !== false ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        {node.owner?.fullName || customData?.assigneeName || 'Unassigned'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {customData?.isLive !== false ? '🟢 Active & Live' : '⚪ Offline'}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 italic">Read-only (Member)</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={handleSaveDetails}
                rows={3}
                className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Scope of work and instructions..."
              />
            </div>

            {/* Dates (Start & Due with Date and Time) */}
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Start Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    onBlur={handleSaveDetails}
                    className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Due Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={dueDate}
                    onChange={(e) => {
                      const newVal = e.target.value;
                      if (node.dueDate && newVal !== dueDate) {
                        setPendingDueDate(newVal);
                        setIsDeadlineModalOpen(true);
                      } else {
                        setDueDate(newVal);
                        handleSaveDetails();
                      }
                    }}
                    className={`w-full p-2 text-xs rounded-xl border ${
                      countdown.isOverdue
                        ? 'border-rose-400 ring-2 ring-rose-500/20'
                        : 'border-slate-200 dark:border-slate-700'
                    } bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium`}
                  />
                </div>
              </div>

              {/* Due Date Alert / Overdue Action Banner */}
              {countdown.isOverdue ? (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900/60 flex items-center justify-between text-xs text-rose-800 dark:text-rose-300">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>🚨 {countdown.formattedText}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingDueDate(dueDate);
                      setIsDeadlineModalOpen(true);
                    }}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>Extend Deadline</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              ) : countdown.isTwoDaysAlert ? (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900/60 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 font-bold">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{countdown.formattedText} - Due Date Approaching!</span>
                </div>
              ) : null}
            </div>

            {/* Priority & Weight */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => {
                    setPriority(e.target.value);
                    ApiClient.updateNode(node.id, { priority: e.target.value as any }).then(() => {
                      onNodeUpdated();
                      loadNode(node.id);
                    });
                  }}
                  className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Weight (Rollup Impact)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value))}
                  onBlur={handleSaveDetails}
                  className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Dynamic Custom Fields Schema */}
            {node.nodeType?.fields?.length > 0 && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Custom Properties ({node.nodeType.name})
                </span>
                {node.nodeType.fields.map((field: any) => (
                  <div key={field.id}>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      {field.label} {field.required && <span className="text-rose-500">*</span>}
                    </label>
                    <input
                      type={field.type === 'number' || field.type === 'currency' ? 'number' : 'text'}
                      value={customData[field.fieldKey] || ''}
                      onChange={(e) =>
                        setCustomData((prev) => ({
                          ...prev,
                          [field.fieldKey]: e.target.value,
                        }))
                      }
                      onBlur={handleSaveDetails}
                      placeholder={`Enter ${field.label}...`}
                      className="w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Technical Metadata Card */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Node ID:</span>
                <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  {node.id.slice(0, 12)}...
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {node.status?.labelI18n?.en || node.status?.name || 'In Progress'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Version:</span>
                <span className="font-bold">v{node.version}</span>
              </div>
            </div>

            {/* Danger Zone: Delete Task */}
            {onDeleteNode && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-950/60 bg-rose-50/50 dark:bg-rose-950/20 flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-rose-700 dark:text-rose-400">
                      Delete this task
                    </h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Remove this task, remarks, and connections
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Are you sure you want to delete task "${node.title}"? This cannot be undone.`
                        )
                      ) {
                        onDeleteNode(node.id);
                        onClose();
                      }
                    }}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: MANAGER APPROVAL & REVIEW WORKFLOW (EXCLUSIVE TO MANAGERS) */}
        {activeTab === 'approval' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-md shadow-emerald-500/20">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Manager Review & Sign-Off
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Approving turns this task <span className="font-bold text-emerald-600">BRIGHT GREEN (#10b981)</span>. Rework turns it <span className="font-bold text-rose-600">AMBER/RED</span>.
                </p>
              </div>

              {/* Assignment Check */}
              {!node.owner && !node.ownerId ? (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 text-left text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Task Assignment Required</span>
                  </div>
                  <p className="text-[11px]">
                    This task must have an assigned member before manager sign-off.
                  </p>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-left flex items-center justify-between text-xs shadow-sm">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-blue-500" />
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Assigned Lead: {node.owner?.fullName || 'Assigned Member'}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200">
                    ✓ Assigned
                  </span>
                </div>
              )}

              {/* Non-Manager Read Only View */}
              {!isManager ? (
                <div className="p-3.5 rounded-xl border bg-slate-50 dark:bg-slate-900 text-left space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-700 dark:text-slate-300">
                    <ShieldCheck className="w-4 h-4 text-blue-500" />
                    <span>Manager Review Status (Read-Only)</span>
                  </div>
                  {node.customData?.managerReview ? (
                    <div
                      className={`p-3 rounded-lg border text-xs space-y-1 ${
                        node.customData.managerReview.reaction === 'thumbs_up'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                          : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 text-rose-800 dark:text-rose-300'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1.5">
                        {node.customData.managerReview.reaction === 'thumbs_up' ? (
                          <>
                            <ThumbsUp className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
                            <span>Approved by {node.customData.managerReview.reviewer}</span>
                          </>
                        ) : (
                          <>
                            <ThumbsDown className="w-3.5 h-3.5 text-rose-600 fill-rose-600" />
                            <span>Rework Requested by {node.customData.managerReview.reviewer}</span>
                          </>
                        )}
                      </div>
                      {node.customData.managerReview.note && (
                        <p className="text-[11px] italic bg-white/60 dark:bg-slate-800/60 p-2 rounded">
                          "{node.customData.managerReview.note}"
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">
                      ⏳ Pending Manager Review. Only workspace managers have permission to approve or request rework.
                    </p>
                  )}
                </div>
              ) : (
                /* Manager Controls (Exclusive to Manager) */
                <div className="text-left space-y-3 pt-1">
                  <div>
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
                      Manager Assessment / Feedback Note
                    </label>
                    <textarea
                      rows={2}
                      value={approvalNote}
                      onChange={(e) => setApprovalNote(e.target.value)}
                      placeholder="e.g. Drawings checked, deliverables inspected, approved..."
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={approving || (!node.owner && !node.ownerId)}
                      onClick={handleManagerApprove}
                      className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{approving ? 'Saving...' : '👍 Approve (Green)'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={approving || (!node.owner && !node.ownerId)}
                      onClick={handleManagerRework}
                      className="py-2.5 px-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      <span>{approving ? 'Saving...' : '👎 Rework (Red)'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Deadline Extension Request Section */}
              {customData?.deadlineExtension && (
                <div className="p-3.5 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 text-left space-y-2 mt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span>Timeline Extension Request</span>
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
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
                    <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/40 text-xs flex items-center gap-2">
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
                          className="flex-1 py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 shadow-sm"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve Extension</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleRejectDeadlineExtension}
                          className="flex-1 py-1.5 px-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 shadow-sm"
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
                    className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Request Timeline Extension with Reason & Document</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: DOCUMENTS (Drag-Drop, S3/MinIO, Inline Preview) */}
        {activeTab === 'docs' && (
          <div className="space-y-4">
            {/* Drag & Drop Upload Zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileUpload(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="p-6 border-2 border-dashed border-blue-300 dark:border-blue-900/60 hover:border-blue-500 rounded-2xl bg-blue-50/40 dark:bg-blue-950/20 text-center cursor-pointer transition-all"
            >
              <UploadCloud className="w-8 h-8 text-blue-500 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {uploadingDoc ? 'Uploading document...' : 'Click or drag files here to upload'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Supports PDF, DWG, DOCX, PNG, JPG (Versioned in S3/MinIO)
              </p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                className="hidden"
              />
            </div>

            {/* Documents List */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Attached Files ({documents.length})
              </span>

              {documents.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No documents attached yet. Drop a blueprint, contract, or survey above!
                </div>
              ) : (
                documents.map((doc: any) => {
                  const isDocLocked =
                    (customData?.lockedDocIds || []).includes(doc.id) || isNodeLocked;
                  const isRestrictedForMember = isDocLocked && !permissions.canViewConfidential;

                  return (
                    <div
                      key={doc.id}
                      className={`p-3.5 rounded-xl border flex items-center justify-between transition-colors ${
                        isDocLocked
                          ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isDocLocked
                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                              : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          {isDocLocked ? <Lock className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                              {doc.name}
                            </span>
                            {isDocLocked && (
                              <span className="text-[9px] font-extrabold px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 rounded border border-amber-300 dark:border-amber-800">
                                Confidential
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span className="font-bold text-blue-500">v{doc.version}</span>
                            <span>•</span>
                            <span>{Math.round(Number(doc.fileSize) / 1024) || 120} KB</span>
                            <span>•</span>
                            <span>{doc.uploader?.fullName || 'Manager'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isRestrictedForMember ? (
                          <span
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1"
                            title="Confidential document: Download and preview are restricted for Member role."
                          >
                            <Lock className="w-3 h-3 text-amber-600" />
                            <span>Restricted</span>
                          </span>
                        ) : (
                          <>
                            {/* Toggle Confidential Lock Button (Manager / Super Admin) */}
                            {permissions.canToggleLock && (
                              <button
                                type="button"
                                onClick={() => handleToggleDocLock(doc.id, isDocLocked)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  isDocLocked
                                    ? 'text-amber-600 bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200'
                                    : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                }`}
                                title={isDocLocked ? 'Document is locked. Click to make public.' : 'Lock document as confidential.'}
                              >
                                {isDocLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                              </button>
                            )}

                            {/* Preview button */}
                            <button
                              onClick={() => setPreviewDoc(doc)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50"
                              title="Preview Document"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Download button */}
                            <a
                              href={doc.storageKey?.startsWith('data:') ? doc.storageKey : '#'}
                              download={doc.name}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                              title="Download Document"
                            >
                              <Download className="w-4 h-4" />
                            </a>

                            {/* Delete button */}
                            <button
                              onClick={() => handleDeleteDocument(doc.id, doc.name)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                              title="Delete Document"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Document Preview Modal */}
            {previewDoc && (
              <div
                className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
                onClick={() => setPreviewDoc(null)}
              >
                <div
                  className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-4 shadow-2xl border border-slate-200 dark:border-slate-800"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <span>{previewDoc.name}</span>
                    </h4>
                    <button
                      onClick={() => setPreviewDoc(null)}
                      className="p-1 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="py-4 text-center">
                    {previewDoc.storageKey?.startsWith('data:image') ? (
                      <img
                        src={previewDoc.storageKey}
                        alt="Preview"
                        className="max-h-[60vh] mx-auto rounded-lg object-contain shadow-md"
                      />
                    ) : (
                      <div className="p-8 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <FileText className="w-12 h-12 text-blue-500 mx-auto mb-3" />
                        <p className="font-bold text-xs text-slate-700 dark:text-slate-300">
                          {previewDoc.name}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Inline preview available for images and PDFs. Download to view CAD/DWG.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: CHILDREN & SUB-CANVAS */}
        {activeTab === 'children' && (
          <div className="space-y-4">
            {/* Drill Down into Sub-Canvas Action Banner */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-200 dark:border-purple-900/50">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                    Sub-Canvas View
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Open infinite sub-canvas dedicated to this item
                  </p>
                </div>
                <button
                  onClick={() => onDrillDown({ id: node.id, title: node.title })}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shadow-md shadow-purple-500/20 flex items-center gap-1.5"
                >
                  <span>Drill Down</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Create dynamic child node */}
            <form onSubmit={handleCreateChild} className="flex gap-2">
              <input
                type="text"
                value={newChildTitle}
                onChange={(e) => setNewChildTitle(e.target.value)}
                placeholder="New child sub-item title..."
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={creatingChild || !newChildTitle.trim()}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>

            {/* List of child items */}
            <div className="space-y-2">
              {node.children?.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No children yet. Add a child above or drill down to create on canvas!
                </div>
              ) : (
                node.children?.map((child: any) => (
                  <div
                    key={child.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-900 dark:text-white">
                        {child.title}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Weight: {child.weight}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {child.status?.name || 'Active'}
                      </span>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete child item "${child.title}"?`)) {
                            await ApiClient.deleteNode(child.id);
                            loadNode(node.id);
                            onNodeUpdated();
                          }
                        }}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        title="Delete child task"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 5: HISTORY & AUDIT TRAIL */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Audit Trail & Revision History
            </span>

            {loadingHistory ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                Loading history records...
              </div>
            ) : historyList.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                No history entries recorded yet. Changes will be audited automatically.
              </div>
            ) : (
              <div className="space-y-3">
                {historyList.map((log: any) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            log.action === 'DEADLINE_CHANGE'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                              : log.action === 'MANAGER_APPROVAL'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                          }`}
                        >
                          {log.action}
                        </span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {log.actor?.fullName || 'Collaborator'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(log.createdAt).toLocaleString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: true,
                        })}
                      </span>
                    </div>

                    {/* Formatted details for Deadline Change */}
                    {log.action === 'DEADLINE_CHANGE' && log.newValues?.dueDate && (
                      <div className="p-2.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                        <div className="font-semibold flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-amber-600" />
                          <span>
                            Revised Due Date: {new Date(log.newValues.dueDate).toLocaleString()}
                          </span>
                        </div>
                        {log.oldValues?.dueDate && (
                          <div className="text-[11px] text-slate-500 line-through">
                            Previous: {new Date(log.oldValues.dueDate).toLocaleString()}
                          </div>
                        )}
                        {log.newValues.reason && (
                          <div className="text-[11px] font-normal text-slate-600 dark:text-slate-400 mt-1 italic">
                            &quot;{log.newValues.reason}&quot;
                          </div>
                        )}
                      </div>
                    )}

                    {/* Formatted details for Manager Approval */}
                    {log.action === 'MANAGER_APPROVAL' && (
                      <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
                        <div className="font-bold flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Manager Verification &amp; Sign-off</span>
                        </div>
                        {log.newValues?.note && (
                          <div className="text-[11px] font-normal text-slate-600 dark:text-slate-400 italic">
                            &quot;{log.newValues.note}&quot;
                          </div>
                        )}
                      </div>
                    )}

                    {/* Generic changes fallback */}
                    {log.action !== 'DEADLINE_CHANGE' &&
                      log.action !== 'MANAGER_APPROVAL' &&
                      log.newValues && (
                        <div className="text-[11px] text-slate-500 font-mono bg-slate-50 dark:bg-slate-800 p-2 rounded-lg">
                          {Object.entries(log.newValues)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(' • ')}
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Deadline Extension Modal */}
      <DeadlineExtensionModal
        isOpen={isDeadlineModalOpen}
        currentDueDate={node.dueDate}
        pendingDueDate={pendingDueDate || node.dueDate}
        onClose={() => setIsDeadlineModalOpen(false)}
        onConfirm={handleConfirmDeadlineExtension}
      />
    </div>
  );
};
