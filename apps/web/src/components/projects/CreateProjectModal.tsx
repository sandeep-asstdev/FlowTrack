import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClient } from '../../services/api';
import { DynamicCustomFieldsForm } from '../custom-fields/DynamicCustomFieldsForm';
import {
  X,
  Building2,
  Car,
  GraduationCap,
  Stethoscope,
  Laptop,
  Store,
  Factory,
  Sparkles,
  Calendar,
  Layers,
  CheckCircle2,
  Coins,
  Copy,
  Search,
  Eye,
  ShieldCheck,
  Flag,
  ArrowRight,
  GitFork,
  Users,
  BarChart3,
  Check,
} from 'lucide-react';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (project: any) => void;
  initialMode?: 'template' | 'blank' | 'clone';
  initialSourceProjectId?: string;
}

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  Building2: <Building2 className="w-5 h-5 text-amber-500" />,
  Car: <Car className="w-5 h-5 text-blue-500" />,
  GraduationCap: <GraduationCap className="w-5 h-5 text-indigo-500" />,
  Stethoscope: <Stethoscope className="w-5 h-5 text-emerald-500" />,
  Laptop: <Laptop className="w-5 h-5 text-cyan-500" />,
  Store: <Store className="w-5 h-5 text-rose-500" />,
  Factory: <Factory className="w-5 h-5 text-orange-500" />,
  Layers: <Layers className="w-5 h-5 text-slate-500" />,
};

const INDUSTRY_FILTERS = [
  { id: 'all', label: 'All Templates' },
  { id: 'automotive_dealerships', label: 'Automotive' },
  { id: 'construction_real_estate', label: 'Construction' },
  { id: 'education_academics', label: 'Education' },
  { id: 'manufacturing_industrial', label: 'Manufacturing' },
  { id: 'it_software', label: 'IT & Software' },
  { id: 'general', label: 'Universal' },
  { id: 'healthcare_hospital', label: 'Healthcare' },
  { id: 'retail_hospitality', label: 'Retail' },
];

const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'USD ($) — US Dollar' },
  { code: 'INR', symbol: '₹', name: 'INR (₹) — Indian Rupee' },
  { code: 'EUR', symbol: '€', name: 'EUR (€) — Euro' },
  { code: 'GBP', symbol: '£', name: 'GBP (£) — British Pound' },
  { code: 'AED', symbol: 'AED', name: 'AED — UAE Dirham' },
  { code: 'SGD', symbol: 'S$', name: 'SGD (S$) — Singapore Dollar' },
];

const METHODOLOGIES = [
  { id: 'stage_gate', label: 'Stage-Gate Delivery', desc: 'Formal sequential approval gates between phases' },
  { id: 'agile_sprint', label: 'Agile & Sprints', desc: 'Iterative backlog increments and velocity tracking' },
  { id: 'linear_waterfall', label: 'Linear Waterfall', desc: 'Strict chronological dependencies and milestones' },
  { id: 'kanban_flow', label: 'Continuous Kanban', desc: 'Work-in-progress limit board with real-time cycle times' },
];

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'template',
  initialSourceProjectId,
}) => {
  const { t } = useTranslation();

  // Mode: template | blank | clone
  const [creationMode, setCreationMode] = useState<'template' | 'blank' | 'clone'>(initialMode);
  const [step, setStep] = useState<1 | 2>(1);

  // Templates state
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedIndustry, setSelectedIndustry] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<any | null>(null);

  // Projects state for cloning
  const [existingProjects, setExistingProjects] = useState<any[]>([]);
  const [selectedSourceProjectId, setSelectedSourceProjectId] = useState<string>(
    initialSourceProjectId || ''
  );
  const [resetCloneProgress, setResetCloneProgress] = useState(true);

  // Form Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [methodology, setMethodology] = useState('stage_gate');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [targetDate, setTargetDate] = useState('2027-12-31T00:00:00.000Z');
  const [projectFields, setProjectFields] = useState<any[]>([]);
  const [projectCustomData, setProjectCustomData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
      if (initialMode) setCreationMode(initialMode);
      if (initialSourceProjectId) setSelectedSourceProjectId(initialSourceProjectId);
    }
  }, [isOpen, initialMode, initialSourceProjectId]);

  const loadData = async () => {
    try {
      const [tmplData, projData, fieldDefs] = await Promise.all([
        ApiClient.getTemplates(),
        ApiClient.getProjects(),
        ApiClient.getFieldDefinitions({ targetType: 'project' }).catch(() => []),
      ]);
      setTemplates(Array.isArray(tmplData) ? tmplData : []);
      const projs = Array.isArray(projData) ? projData : [];
      setExistingProjects(projs);
      setProjectFields(Array.isArray(fieldDefs) ? fieldDefs : []);
      if (!selectedSourceProjectId && projs.length > 0) {
        setSelectedSourceProjectId(projs[0].id);
        setName(`${projs[0].name} (Copy)`);
      }
    } catch (err) {
      console.error('Failed to load creation data:', err);
    }
  };

  if (!isOpen) return null;

  const handleTemplateClick = (tmpl: any) => {
    setSelectedTemplate(tmpl);
    setName(tmpl.name);
    setDescription(tmpl.description || '');
    if (tmpl.defaultSettings?.currency?.code) {
      setCurrencyCode(tmpl.defaultSettings.currency.code);
    }
    if (tmpl.defaultSettings?.methodology) {
      setMethodology(tmpl.defaultSettings.methodology);
    }
    setStep(2);
  };

  const handlePreviewOpen = (e: React.MouseEvent, tmpl: any) => {
    e.stopPropagation();
    setPreviewTemplate(tmpl);
  };

  const handleSourceProjectChange = (projectId: string) => {
    setSelectedSourceProjectId(projectId);
    const found = existingProjects.find((p) => p.id === projectId);
    if (found) {
      setName(`${found.name} (Copy)`);
      setDescription(found.description || '');
      if (found.settings?.currency?.code) {
        setCurrencyCode(found.settings.currency.code);
      }
    }
  };

  const filteredTemplates = templates.filter((t) => {
    const matchesIndustry = selectedIndustry === 'all' || t.industry === selectedIndustry;
    const matchesSearch =
      !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesIndustry && matchesSearch;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const selectedCurrency = CURRENCIES.find((c) => c.code === currencyCode) || {
      code: 'USD',
      symbol: '$',
    };

    try {
      let createdProject: any;

      if (creationMode === 'clone') {
        if (!selectedSourceProjectId) {
          throw new Error('Please select a project to copy');
        }
        const result = await ApiClient.cloneProject(selectedSourceProjectId, {
          name,
          description,
          targetDate: targetDate || undefined,
          resetProgress: resetCloneProgress,
        });
        createdProject = result.project;
      } else if (creationMode === 'template' && selectedTemplate) {
        const result = await ApiClient.instantiateTemplate(selectedTemplate.id, {
          projectName: name,
          projectDescription: description,
          targetDate: targetDate || undefined,
          customSettings: {
            currency: {
              code: selectedCurrency.code,
              symbol: selectedCurrency.symbol,
            },
            methodology,
          },
        });
        createdProject = result.project;
      } else {
        // Universal Blank Project
        createdProject = await ApiClient.createProject({
          name,
          description,
          targetDate: targetDate || undefined,
          customData: projectCustomData,
          settings: {
            industry: 'general',
            methodology,
            currency: {
              code: selectedCurrency.code,
              symbol: selectedCurrency.symbol,
            },
          },
        });
      }

      onSuccess(createdProject);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-3xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-500" />
              {creationMode === 'template' && step === 1
                ? 'Create Project from Reusable Template'
                : creationMode === 'blank'
                ? 'Create Universal Blank Project'
                : creationMode === 'clone'
                ? 'Clone & Duplicate Existing Project'
                : 'Configure Project Details'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Configurable delivery pipelines across any industry, structure, or methodology
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Creation Mode Segmented Bar (Only shown on Step 1) */}
        {step === 1 && (
          <div className="px-6 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                id="tab-mode-template"
                onClick={() => setCreationMode('template')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  creationMode === 'template'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Industry Blueprint
              </button>

              <button
                type="button"
                id="tab-mode-blank"
                onClick={() => {
                  setCreationMode('blank');
                  setSelectedTemplate(null);
                  setName('Universal Project');
                  setDescription('Universal configurable project canvas');
                  setStep(2);
                }}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  creationMode === 'blank'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Blank Canvas
              </button>

              <button
                type="button"
                id="tab-mode-clone"
                onClick={() => {
                  setCreationMode('clone');
                  setStep(2);
                }}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  creationMode === 'clone'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                }`}
              >
                <Copy className="w-3.5 h-3.5" />
                Clone Existing
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-3 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs rounded-xl">
            {error}
          </div>
        )}

        {/* STEP 1: Reusable Template Selection Grid */}
        {creationMode === 'template' && step === 1 && (
          <div className="p-6 overflow-y-auto space-y-4">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search blueprints (e.g. showroom, township, software)..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {INDUSTRY_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedIndustry(f.id)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${
                    selectedIndustry === f.id
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Templates Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredTemplates.map((t) => {
                const nodeCount = t.graphJson?.nodes?.length || 0;
                const icon = TEMPLATE_ICONS[t.icon] || <Layers className="w-5 h-5 text-blue-500" />;

                return (
                  <div
                    key={t.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 bg-white dark:bg-slate-800/40 hover:bg-blue-50/20 dark:hover:bg-blue-950/10 transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:scale-105 transition-transform">
                          {icon}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => handlePreviewOpen(e, t)}
                            className="px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-600 flex items-center gap-1 transition-colors"
                            title="Preview Blueprint Structure"
                          >
                            <Eye className="w-3 h-3" />
                            Preview
                          </button>
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            v{t.version || 1}
                          </span>
                        </div>
                      </div>

                      <h3 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {t.name}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {t.description}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                        {nodeCount} Stages & Gates
                      </span>
                      <button
                        type="button"
                        onClick={() => handleTemplateClick(t)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-blue-500/20 transition-all flex items-center gap-1"
                      >
                        Use Blueprint &rarr;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2: Configuration & Details */}
        {(step === 2 || creationMode !== 'template') && (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
            {/* Selected Blueprint or Mode Summary */}
            {creationMode === 'template' && selectedTemplate && (
              <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                    {selectedTemplate.icon ? (
                      TEMPLATE_ICONS[selectedTemplate.icon] || <Layers className="w-4 h-4" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {selectedTemplate.name}
                    </div>
                    <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium capitalize">
                      {selectedTemplate.category} • v{selectedTemplate.version || 1} •{' '}
                      {selectedTemplate.graphJson?.nodes?.length || 0} Stages & Gates
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Change Blueprint
                </button>
              </div>
            )}

            {/* Source Project Selector (for Clone Mode) */}
            {creationMode === 'clone' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <GitFork className="w-3.5 h-3.5 text-blue-500" />
                  Select Source Project to Duplicate
                </label>
                <select
                  value={selectedSourceProjectId}
                  onChange={(e) => handleSourceProjectChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                >
                  {existingProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (v{p.version} • {p.metrics?.totalNodes || 0} nodes)
                    </option>
                  ))}
                </select>

                <div className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={resetCloneProgress}
                      onChange={(e) => setResetCloneProgress(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                    <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                      Reset task progress and actual costs to 0% (recommended for fresh execution)
                    </span>
                  </label>
                  <p className="text-[11px] text-slate-400 mt-1 pl-6">
                    All stage structures, task hierarchies, sequences, and dependencies will be copied with fresh isolated IDs.
                  </p>
                </div>
              </div>
            )}

            {/* Project Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Project Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                placeholder="e.g. Apex Hospital Phase 2 Commissioning"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Description & Mission
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                placeholder="High-level mission, target milestones, and deliverables..."
              />
            </div>

            {/* Methodology Selector (Blank Canvas) */}
            {creationMode === 'blank' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Universal Delivery Methodology
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {METHODOLOGIES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethodology(m.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        methodology === m.id
                          ? 'border-blue-500 bg-blue-50/30 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 font-bold'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="text-xs">{m.label}</div>
                      <div className="text-[10px] text-slate-400 font-normal line-clamp-1 mt-0.5">
                        {m.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Currency & Date Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-slate-400" />
                  Project Currency
                </label>
                <select
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Target Handover Date
                </label>
                <input
                  type="date"
                  value={targetDate ? targetDate.split('T')[0] : ''}
                  onChange={(e) =>
                    setTargetDate(e.target.value ? new Date(e.target.value).toISOString() : '')
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
              </div>
            </div>

            {/* Project Custom Fields */}
            {projectFields.length > 0 && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Project Domain Properties & Custom Fields
                </span>
                <DynamicCustomFieldsForm
                  fields={projectFields}
                  values={projectCustomData}
                  onChange={setProjectCustomData}
                />
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-3 flex gap-2">
              {creationMode === 'template' && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  &larr; Back to Blueprints
                </button>
              )}
              <button
                id="launch-canvas-btn"
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading
                  ? 'Instantiating Canvas...'
                  : creationMode === 'clone'
                  ? '📋 Clone & Launch Project'
                  : '🚀 Launch Project Canvas'}
              </button>
            </div>
          </form>
        )}

        {/* TEMPLATE PREVIEW DRAWER / MODAL OVERLAY */}
        {previewTemplate && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                    {TEMPLATE_ICONS[previewTemplate.icon] || <Layers className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {previewTemplate.name}
                    </h3>
                    <p className="text-[11px] text-slate-400 capitalize">
                      {previewTemplate.category} • {previewTemplate.methodology?.replace('_', ' ')} • v{previewTemplate.version || 1}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-5">
                <div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Overview
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {previewTemplate.description}
                  </p>
                </div>

                {/* Pipeline Structure */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-500" />
                    Pipeline Stages & Quality Gates ({previewTemplate.graphJson?.nodes?.length || 0})
                  </h4>

                  <div className="space-y-2.5">
                    {(previewTemplate.graphJson?.nodes || []).map((node: any, idx: number) => {
                      const isMilestone = node.nodeTypeKey === 'milestone';
                      const isApproval = node.nodeTypeKey === 'approval';
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-start gap-3"
                        >
                          <div
                            className={`p-1.5 rounded-lg text-xs font-bold shrink-0 mt-0.5 ${
                              isMilestone
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                                : isApproval
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                            }`}
                          >
                            {idx + 1}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                                {node.title}
                              </h5>
                              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                {node.nodeTypeKey || 'task'}
                              </span>
                            </div>
                            {node.description && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {node.description}
                              </p>
                            )}

                            {/* Subtasks */}
                            {Array.isArray(node.subtasks) && node.subtasks.length > 0 && (
                              <div className="mt-2 pl-3 border-l-2 border-slate-200 dark:border-slate-700 space-y-1">
                                {node.subtasks.map((sub: any, sIdx: number) => (
                                  <div
                                    key={sIdx}
                                    className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5"
                                  >
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                                    {sub.title}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Settings & Controls */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">
                      Default Currency
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {previewTemplate.defaultSettings?.currency?.name ||
                        previewTemplate.defaultSettings?.currency?.code ||
                        'USD ($)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">
                      Date Format
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {previewTemplate.defaultSettings?.dateFormat || 'YYYY-MM-DD'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-800/40">
                <button
                  type="button"
                  onClick={() => setPreviewTemplate(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Close Preview
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleTemplateClick(previewTemplate);
                    setPreviewTemplate(null);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20"
                >
                  Use This Blueprint &rarr;
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
