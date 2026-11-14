import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClient } from '../../services/api';
import {
  X,
  Sparkles,
  Calendar,
  Layers,
  Building2,
  Loader2,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  ShieldCheck,
  Flag,
  Users,
  CheckSquare,
  ArrowRight,
  Info,
  Sliders,
} from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { groupMembersByRole } from '../../utils/memberGrouping';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (project: any) => void;
  initialMode?: 'template' | 'blank' | 'clone';
  initialSourceProjectId?: string;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'template',
  initialSourceProjectId,
}) => {
  const { t } = useTranslation();

  // Mode: 'template' | 'blank' | 'clone'
  const [mode, setMode] = useState<'template' | 'blank' | 'clone'>(initialMode);
  const [step, setStep] = useState<'config' | 'assign_people'>('config');

  // Form Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [targetDate, setTargetDate] = useState('');
  const [classification, setClassification] = useState<'INTERNAL' | 'RESTRICTED' | 'CONFIDENTIAL' | 'HIGHLY_CONFIDENTIAL'>('CONFIDENTIAL');
  const [ownerId, setOwnerId] = useState('');
  const [responsibleManagerId, setResponsibleManagerId] = useState('');
  const [currencyCode, setCurrencyCode] = useState('INR');
  const [budget, setBudget] = useState<number | string>('50000000');

  // Templates
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});
  const [taskDurationOverrides, setTaskDurationOverrides] = useState<Record<string, number>>({});

  // Members for guided role assignment
  const [members, setMembers] = useState<any[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<Record<string, string>>({});

  // Result project
  const [createdProject, setCreatedProject] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch templates and members when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setStep('config');
      setName('');
      setDescription('');
      setStartDate(new Date().toISOString().slice(0, 10));
      setTargetDate('');
      setClassification('CONFIDENTIAL');
      setOwnerId('');
      setResponsibleManagerId('');
      setCurrencyCode('INR');
      setBudget('50000000');
      setError(null);
      setCreatedProject(null);
      setTaskDurationOverrides({});
      setRoleAssignments({});

      // Fetch templates
      setLoadingTemplates(true);
      ApiClient.getTemplates()
        .then((res: any) => {
          const list = Array.isArray(res) ? res : [];
          setTemplates(list);
          const defaultTmpl = list.find((t: any) => t.name === 'Plotted Real Estate Layout (50 acres)') || list[0];
          if (defaultTmpl) {
            setSelectedTemplateId(defaultTmpl.id);
            setName(defaultTmpl.name === 'Plotted Real Estate Layout (50 acres)' ? 'Green Valley Layout, 50 Acres' : defaultTmpl.name);
            setDescription(defaultTmpl.description || '');
          }
        })
        .catch(() => {})
        .finally(() => setLoadingTemplates(false));

      // Fetch workspace members
      const activeWs = ApiClient.getActiveWorkspaceId();
      if (activeWs) {
        ApiClient.getWorkspaceMembers(activeWs)
          .then((res: any) => {
            const mems = Array.isArray(res) ? res : res?.members || [];
            setMembers(mems);
          })
          .catch(() => {});
      }
    }
  }, [isOpen, initialMode]);

  // Selected template object
  const selectedTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || null;
  }, [templates, selectedTemplateId]);

  // Group template nodes into phases and child tasks
  const templateHierarchy = useMemo(() => {
    if (!selectedTemplate?.graphJson?.nodes) return [];
    const allNodes: any[] = selectedTemplate.graphJson.nodes;
    const phases = allNodes.filter((n) => !n.parentKey);
    return phases.map((phase) => {
      const children = allNodes.filter((n) => n.parentKey === phase.key);
      return {
        ...phase,
        children,
      };
    });
  }, [selectedTemplate]);

  // Distinct role placeholders in template for Step 2 guided assignment
  const rolePlaceholders = useMemo(() => {
    if (!selectedTemplate?.graphJson?.nodes) return [];
    const placeholders = new Set<string>();
    selectedTemplate.graphJson.nodes.forEach((n: any) => {
      if (n.rolePlaceholder) {
        placeholders.add(n.rolePlaceholder);
      }
    });
    return Array.from(placeholders);
  }, [selectedTemplate]);

  // Auto-calculate target date based on template duration
  useEffect(() => {
    if (mode === 'template' && selectedTemplate && startDate) {
      const allNodes: any[] = selectedTemplate.graphJson?.nodes || [];
      let maxDays = 0;
      allNodes.forEach((n) => {
        const offset = n.offsetDays ?? 0;
        const dur = taskDurationOverrides[n.key] ?? n.durationDays ?? 1;
        const finish = offset + dur;
        if (finish > maxDays) maxDays = finish;
      });
      if (maxDays > 0) {
        const start = new Date(startDate);
        const calculatedTarget = new Date(start.getTime() + maxDays * 24 * 60 * 60 * 1000);
        setTargetDate(calculatedTarget.toISOString().slice(0, 10));
      }
    }
  }, [mode, selectedTemplate, startDate, taskDurationOverrides]);

  const togglePhase = (phaseKey: string) => {
    setExpandedPhases((prev) => ({
      ...prev,
      [phaseKey]: !prev[phaseKey],
    }));
  };

  const handleDurationChange = (taskKey: string, newDuration: number) => {
    setTaskDurationOverrides((prev) => ({
      ...prev,
      [taskKey]: Math.max(1, newDuration),
    }));
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a project name');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      if (mode === 'clone' && initialSourceProjectId) {
        const result = await ApiClient.cloneProject(initialSourceProjectId, {
          name: name.trim(),
          description: description.trim() || undefined,
          targetDate: targetDate || undefined,
          resetProgress: true,
        });
        onSuccess(result.project);
        onClose();
      } else if (mode === 'template' && selectedTemplateId) {
        // Instantiate template through backend service
        const result = await ApiClient.instantiateTemplate(selectedTemplateId, {
          projectName: name.trim(),
          projectDescription: description.trim() || undefined,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          targetDate: targetDate ? new Date(targetDate).toISOString() : undefined,
          classification,
          ownerId: ownerId || undefined,
          responsibleManagerId: responsibleManagerId || undefined,
          budget: budget ? Number(budget) : undefined,
          currency: {
            code: currencyCode,
            symbol: currencyCode === 'INR' ? '₹' : currencyCode === 'EUR' ? '€' : '$',
          },
          taskDurations: taskDurationOverrides,
        });

        const created = result.project;
        setCreatedProject(created);

        // Move to Step 2: "Next: Assign People"
        if (rolePlaceholders.length > 0) {
          setStep('assign_people');
        } else {
          onSuccess(created);
          onClose();
        }
      } else {
        // Blank Project
        const created = await ApiClient.createProject({
          name: name.trim(),
          description: description.trim() || undefined,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          targetDate: targetDate ? new Date(targetDate).toISOString() : undefined,
          classification,
          ownerId: ownerId || undefined,
          responsibleManagerId: responsibleManagerId || undefined,
          settings: {
            industry: 'general',
            methodology: 'stage_gate',
            currency: {
              code: currencyCode,
              symbol: currencyCode === 'INR' ? '₹' : currencyCode === 'EUR' ? '€' : '$',
            },
          },
        });
        onSuccess(created);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Confirm guided role assignments
  const handleConfirmAssignments = async () => {
    setLoading(true);
    try {
      // If user selected assignments for role placeholders, we update matching tasks
      if (createdProject && Object.keys(roleAssignments).length > 0) {
        const nodesRes = await ApiClient.getProjectNodes(createdProject.id);
        const nodes = Array.isArray(nodesRes) ? nodesRes : [];
        for (const node of nodes) {
          const placeholder = node.customData?.rolePlaceholder;
          if (placeholder && roleAssignments[placeholder]) {
            try {
              await ApiClient.updateNode(node.id, {
                ownerId: roleAssignments[placeholder],
              });
            } catch (assignErr) {
              // Ignore single assignment failures
            }
          }
        }
      }
      onSuccess(createdProject);
      onClose();
    } catch (err: any) {
      onSuccess(createdProject);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)] overscroll-contain animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 id="modal-title" className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">
                {step === 'assign_people' ? 'Next: Assign People' : t('newProject')}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {step === 'assign_people'
                  ? 'A template contains NO people. Map team members to role placeholders below.'
                  : 'Start with a structured governance template or a blank project'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="w-10 h-10 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mx-5 mt-3 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs rounded-xl shrink-0">
            {error}
          </div>
        )}

        {/* STEP 1: CONFIGURATION */}
        {step === 'config' && (
          <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* Mode Switcher */}
            <div className="flex p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
              <button
                type="button"
                onClick={() => setMode('template')}
                className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'template'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Start from Template</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('blank')}
                className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'blank'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Blank Project</span>
              </button>
            </div>

            {/* Template Picker */}
            {mode === 'template' && (
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
                  Select Project Template
                </label>
                {loadingTemplates ? (
                  <div className="p-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span>Loading templates library...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {templates.map((tmpl) => {
                      const isSelected = tmpl.id === selectedTemplateId;
                      return (
                        <div
                          key={tmpl.id}
                          onClick={() => {
                            setSelectedTemplateId(tmpl.id);
                            setName(tmpl.name === 'Plotted Real Estate Layout (50 acres)' ? 'Green Valley Layout, 50 Acres' : tmpl.name);
                            setDescription(tmpl.description || '');
                          }}
                          className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 ring-2 ring-blue-500/20'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                              <Building2 className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                  {tmpl.name}
                                </h4>
                                {tmpl.name === 'Plotted Real Estate Layout (50 acres)' && (
                                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold px-1.5 py-0.2 rounded">
                                    Recommended
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                                {tmpl.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Approvals Pack Notice */}
                {selectedTemplate?.description?.includes('Starter checklist') && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                    <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Starter checklist — verify with your legal and liaison team.</span>
                      <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                        Statutory approvals (conversion, planning sanction, RERA, utility NOCs) are starter tasks. Durations and items can be tailored per state.
                      </p>
                    </div>
                  </div>
                )}

                {/* Collapsible Tree Preview */}
                {selectedTemplate && (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-950/40">
                    <div className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-blue-600" />
                        <span>Template Structure & Duration Adjuster</span>
                      </div>
                      <span className="text-[11px] font-normal text-slate-500">
                        {templateHierarchy.length} Phases • Click phase to expand/adjust
                      </span>
                    </div>

                    <div className="p-2 space-y-1.5 max-h-56 overflow-y-auto">
                      {templateHierarchy.map((phase) => {
                        const isExpanded = !!expandedPhases[phase.key];
                        return (
                          <div key={phase.key} className="border border-slate-200/80 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
                            <div
                              onClick={() => togglePhase(phase.key)}
                              className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                )}
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                  {phase.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[11px] text-slate-400">
                                  {phase.children?.length || 0} tasks
                                </span>
                                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                  ~{phase.durationDays}d
                                </span>
                              </div>
                            </div>

                            {/* Phase Children */}
                            {isExpanded && (
                              <div className="px-3 pb-2 pt-1 border-t border-slate-100 dark:border-slate-800 space-y-1.5 bg-slate-50/40 dark:bg-slate-950/20">
                                {phase.children.map((child: any) => {
                                  const currentDuration = taskDurationOverrides[child.key] ?? child.durationDays ?? 1;
                                  return (
                                    <div
                                      key={child.key}
                                      className="p-2 rounded-lg bg-white dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-2 text-xs"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                                            {child.title}
                                          </span>
                                          {child.isMilestone && (
                                            <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold px-1.5 rounded flex items-center gap-0.5">
                                              <Flag className="w-2.5 h-2.5" /> Milestone
                                            </span>
                                          )}
                                          {child.approvalPolicyLink && (
                                            <span className={`text-[10px] font-bold px-1.5 rounded ${
                                              child.approvalPolicyLink === 'Critical'
                                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                                : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                            }`}>
                                              {child.approvalPolicyLink} Approval
                                            </span>
                                          )}
                                          {child.isRequired === false && (
                                            <span className="text-[10px] bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 px-1.5 rounded">
                                              Optional
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                                          <span>Placeholder: {child.rolePlaceholder || 'Unassigned'}</span>
                                          <span>•</span>
                                          <span>Offset: +{child.offsetDays}d</span>
                                        </div>
                                      </div>

                                      {/* Duration Editor */}
                                      <div className="flex items-center gap-1 shrink-0">
                                        <span className="text-[11px] text-slate-400">Duration:</span>
                                        <input
                                          type="number"
                                          min={1}
                                          value={currentDuration}
                                          onChange={(e) => handleDurationChange(child.key, parseInt(e.target.value) || 1)}
                                          className="w-14 px-1.5 py-0.5 text-center text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                                        />
                                        <span className="text-[11px] text-slate-400">days</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Project Details Fields */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                  Project Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Green Valley Layout, 50 Acres"
                  className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                  Description / Objective <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Develop 50 acres into approved, registrable residential plots..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
                />
              </div>

              {/* Dates & Classification Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    Target Date
                  </label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    Classification
                  </label>
                  <select
                    value={classification}
                    onChange={(e: any) => setClassification(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="CONFIDENTIAL">Confidential</option>
                    <option value="RESTRICTED">Restricted</option>
                    <option value="HIGHLY_CONFIDENTIAL">Highly Confidential</option>
                    <option value="INTERNAL">Internal</option>
                  </select>
                </div>
              </div>

              {/* Roles: Owner & Responsible Manager */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    Project Owner (Executive / Director)
                  </label>
                  <select
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Project Owner...</option>
                    {groupMembersByRole(members).map((group) => (
                      <optgroup key={group.role} label={group.groupName}>
                        {group.members.map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.user?.fullName || m.user?.email}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    Responsible Manager (Project Head)
                  </label>
                  <select
                    value={responsibleManagerId}
                    onChange={(e) => setResponsibleManagerId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Responsible Manager...</option>
                    {groupMembersByRole(members).map((group) => (
                      <optgroup key={group.role} label={group.groupName}>
                        {group.members.map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.user?.fullName || m.user?.email}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              {/* Budget & Currency */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    Currency
                  </label>
                  <select
                    value={currencyCode}
                    onChange={(e) => setCurrencyCode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="INR">INR (₹) Indian Rupee</option>
                    <option value="USD">USD ($) US Dollar</option>
                    <option value="EUR">EUR (€) Euro</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    Total Project Budget
                  </label>
                  <input
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="e.g. 50000000"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 min-h-[44px] text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating project...</span>
                  </>
                ) : (
                  <>
                    <span>{mode === 'template' ? 'Create from Template' : 'Create Project'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: GUIDED ROLE ASSIGNMENT */}
        {step === 'assign_people' && (
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl flex items-start gap-2.5 text-xs text-blue-900 dark:text-blue-200">
              <Users className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Project created successfully!</span>
                <p className="text-[11px] text-blue-800 dark:text-blue-300 mt-0.5">
                  Templates contain NO hard-coded people so nobody is accidentally assigned. Map your team members to the role placeholders below in one guided step.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Assign Role Placeholders
              </h3>

              <div className="space-y-2.5">
                {rolePlaceholders.map((roleName) => (
                  <div
                    key={roleName}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 flex items-center justify-between gap-3"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        {roleName}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Responsible for phase tasks and reviews
                      </p>
                    </div>

                    <select
                      value={roleAssignments[roleName] || ''}
                      onChange={(e) =>
                        setRoleAssignments((prev) => ({
                          ...prev,
                          [roleName]: e.target.value,
                        }))
                      }
                      className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
                    >
                      <option value="">Leave Unassigned</option>
                      {groupMembersByRole(members).map((group) => (
                        <optgroup key={group.role} label={group.groupName}>
                          {group.members.map((m) => (
                            <option key={m.userId} value={m.userId}>
                              {m.user?.fullName || m.user?.email}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  onSuccess(createdProject);
                  onClose();
                }}
                className="px-4 py-2.5 min-h-[44px] text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Skip for Now
              </button>
              <button
                type="button"
                onClick={handleConfirmAssignments}
                disabled={loading}
                className="px-5 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Confirm & Open Canvas</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
