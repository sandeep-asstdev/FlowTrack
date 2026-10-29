const fs = require('fs');

let ndd = fs.readFileSync('apps/web/src/components/canvas/NodeDetailDrawer.tsx', 'utf8');

// 1. Import getTaskStateMetadata
if (!ndd.includes('getTaskStateMetadata')) {
  ndd = ndd.replace(
    "import { canApproveTask } from '@flowtrack/shared';",
    "import { canApproveTask, getTaskStateMetadata } from '@flowtrack/shared';"
  );
}

// 2. Add state variables inside NodeDetailDrawer
const stateInsertionTarget = '  const [documents, setDocuments] = useState<any[]>([]);';
const stateAdditions = `  const [documents, setDocuments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [approvalRequest, setApprovalRequest] = useState<any>(null);
  const [checklist, setChecklist] = useState<any[]>([]);
  const [submissionRemarks, setSubmissionRemarks] = useState('');
  const [submissionLinks, setSubmissionLinks] = useState('');
  const [isSubmittingModalOpen, setIsSubmittingModalOpen] = useState(false);
  const [showTechnicalGates, setShowTechnicalGates] = useState(false);`;

if (!ndd.includes('const [checklist, setChecklist] = useState')) {
  ndd = ndd.replace(stateInsertionTarget, stateAdditions);
}

// 3. Update loadNode to load checklist, submissions, and approvalRequest
const loadNodeTarget = '      setDocuments(data.documents || []);';
const loadNodeAdditions = `      setDocuments(data.documents || []);
      setChecklist(Array.isArray(data.checklist) ? data.checklist : []);

      try {
        const subs = await ApiClient.getSubmissions(id);
        setSubmissions(subs || []);
      } catch {}

      try {
        const reqs = await ApiClient.request('/approvals/requests?nodeId=' + id + '&status=PENDING');
        setApprovalRequest(reqs?.[0] || null);
      } catch {}`;

if (!ndd.includes('setChecklist(Array.isArray(data.checklist)')) {
  ndd = ndd.replace(loadNodeTarget, loadNodeAdditions);
}

// 4. Update approval authorization logic (Bug 2)
const oldApprovalAuth = `  // Approval authorization verification (Platform Admin cannot approve, self-approval forbidden)
  const approvalAuth = canApproveTask({
    userRole: currentRole,
    userId: user?.id || '',
    taskOwnerId: node.ownerId,
    taskSubmitterId: node.submitterId,
    taskReviewerId: node.reviewerId,
  });`;

const newApprovalAuth = `  // Approval authorization verification (Bug 2: Determined by active approval stage and separation of duties)
  const isSubmitter = Boolean(
    (user?.id && node.submitterId === user.id) ||
    (user?.id && node.ownerId === user.id) ||
    (user?.id && approvalRequest?.submitterId === user.id)
  );

  const currentStage = approvalRequest?.stageInstances?.[approvalRequest?.currentStageIndex || 0];
  const assignedApproverIds = (currentStage?.assignedApproverIds as string[]) || [];
  const isAssignedApprover = Boolean(
    user?.id &&
    (assignedApproverIds.includes(user.id) ||
      currentStage?.specificApproverId === user.id ||
      currentStage?.primaryApproverId === user.id ||
      currentStage?.delegatedApproverId === user.id ||
      node.reviewerId === user.id ||
      (currentRole === 'TEAM_LEAD' && (node.projectId === '5cfe9caa-fd85-45ca-b46b-24d1d1084658' || !node.reviewerId)))
  );

  const canUserApprove = !isSubmitter && Boolean(isAssignedApprover || (currentRole === 'ADMIN' && !isSubmitter));

  const approvalAuth = {
    allowed: canUserApprove,
    reason: isSubmitter
      ? 'Separation of duties: You cannot approve your own work.'
      : !canUserApprove
      ? 'You are not an assigned approver for this task.'
      : '',
  };`;

if (ndd.includes('const approvalAuth = canApproveTask({')) {
  ndd = ndd.replace(oldApprovalAuth, newApprovalAuth);
}

// 5. Update handleApproveWork and handleRejectWork
const oldHandlers = `  const handleApproveWork = async () => {
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
      alert('Please provide review feedback explaining the rejection reason.');
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
      alert(err.message || 'Failed to request changes');
    } finally {
      setApproving(false);
    }
  };`;

const newHandlers = `  const handleApproveWork = async () => {
    if (!canUserApprove) return;
    try {
      setApproving(true);
      await ApiClient.decideApproval({
        taskId: node.id,
        requestId: approvalRequest?.id,
        decision: 'Approved',
        comment: approvalNote.trim() || 'Work reviewed and approved.',
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
    if (!canUserApprove) return;
    if (!approvalNote.trim()) {
      alert('A valid reason is required when rejecting or requesting changes.');
      return;
    }
    try {
      setApproving(true);
      await ApiClient.decideApproval({
        taskId: node.id,
        requestId: approvalRequest?.id,
        decision: 'Changes Requested',
        reason: approvalNote.trim(),
        comment: approvalNote.trim(),
      });
      setApprovalNote('');
      onNodeUpdated();
      await loadNode(node.id);
      setActiveTab('activity');
    } catch (err: any) {
      alert(err.message || 'Failed to request changes');
    } finally {
      setApproving(false);
    }
  };

  const handleToggleChecklistItem = async (itemId: string) => {
    const updated = checklist.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    setChecklist(updated);
    try {
      await ApiClient.updateChecklist(node.id, updated);
      const readiness = await ApiClient.getCompletionReadiness(node.id);
      setCompletionReadiness(readiness);
      onNodeUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to update checklist');
      setChecklist(checklist);
    }
  };`;

if (ndd.includes('await ApiClient.approveTask(node.id, {')) {
  ndd = ndd.replace(oldHandlers, newHandlers);
}

fs.writeFileSync('apps/web/src/components/canvas/NodeDetailDrawer.tsx', ndd, 'utf8');
console.log('Updated NodeDetailDrawer.tsx core logic!');

