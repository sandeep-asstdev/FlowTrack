import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClient } from '../../services/api';
import { FieldDefinitionDto, FIELD_TYPES, TARGET_TYPES } from '@flowtrack/shared';
import {
  X,
  Plus,
  Sliders,
  Type,
  AlignLeft,
  Hash,
  DollarSign,
  Calendar,
  CheckSquare,
  ListFilter,
  Layers,
  User as UserIcon,
  Users,
  ExternalLink,
  FileText,
  Lock,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  Eye,
  Archive,
  RefreshCw,
  FolderKanban,
  CheckCircle2,
} from 'lucide-react';

interface FieldConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFieldsChanged?: () => void;
  userRole?: string;
}

export const FieldConfigurationModal: React.FC<FieldConfigurationModalProps> = ({
  isOpen,
  onClose,
  onFieldsChanged,
  userRole = 'ADMIN',
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'all' | 'project' | 'stage' | 'task'>('all');
  const [fields, setFields] = useState<FieldDefinitionDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Editor Drawer state
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Fields
  const [targetType, setTargetType] = useState<'project' | 'stage' | 'task' | 'node'>('task');
  const [fieldKey, setFieldKey] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<string>('text');
  const [required, setRequired] = useState(false);
  const [groupName, setGroupName] = useState('General');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [defaultValue, setDefaultValue] = useState<any>('');
  const [choicesInput, setChoicesInput] = useState('');
  const [validationMin, setValidationMin] = useState<string>('');
  const [validationMax, setValidationMax] = useState<string>('');
  const [validationPattern, setValidationPattern] = useState('');
  const [patternMessage, setPatternMessage] = useState('');
  const [editableRoles, setEditableRoles] = useState<string[]>([]);
  const [labelEs, setLabelEs] = useState('');
  const [labelDe, setLabelDe] = useState('');
  const [saving, setSaving] = useState(false);

  // Load field definitions
  const loadFields = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await ApiClient.getFieldDefinitions({ includeInactive: true });
      setFields(data || []);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to load field definitions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadFields();
      setIsEditing(false);
      setEditingId(null);
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  const openCreateForm = (preferredTarget?: 'project' | 'stage' | 'task') => {
    setEditingId(null);
    setTargetType(preferredTarget || (activeTab === 'all' ? 'task' : activeTab));
    setFieldKey('');
    setLabel('');
    setDescription('');
    setType('text');
    setRequired(false);
    setGroupName('General');
    setDisplayOrder(fields.length);
    setDefaultValue('');
    setChoicesInput('');
    setValidationMin('');
    setValidationMax('');
    setValidationPattern('');
    setPatternMessage('');
    setEditableRoles([]);
    setLabelEs('');
    setLabelDe('');
    setErrorMsg(null);
    setIsEditing(true);
  };

  const openEditForm = (def: FieldDefinitionDto) => {
    setEditingId(def.id || null);
    setTargetType(def.targetType || 'task');
    setFieldKey(def.fieldKey);
    setLabel(def.label);
    setDescription(def.description || '');
    setType(def.type);
    setRequired(Boolean(def.required));
    setGroupName(def.groupName || 'General');
    setDisplayOrder(def.displayOrder ?? 0);
    setDefaultValue(def.defaultValue ?? '');

    const choices = (def.options as any)?.choices || [];
    setChoicesInput(
      choices
        .map((c: any) => (typeof c === 'object' && c !== null ? c.value : String(c)))
        .join(', ')
    );

    setValidationMin(def.validation?.min !== undefined ? String(def.validation.min) : '');
    setValidationMax(def.validation?.max !== undefined ? String(def.validation.max) : '');
    setValidationPattern(def.validation?.pattern || '');
    setPatternMessage(def.validation?.patternMessage || '');
    setEditableRoles(def.editableRoles || []);
    setLabelEs(def.labelI18n?.['es'] || '');
    setLabelDe(def.labelI18n?.['de'] || '');
    setErrorMsg(null);
    setIsEditing(true);
  };

  const handleLabelChange = (newLabel: string) => {
    setLabel(newLabel);
    if (!editingId) {
      // Auto-slug fieldKey on create
      const autoKey = newLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      setFieldKey(autoKey);
    }
  };

  const handleSaveField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) {
      setErrorMsg('Field display name is required.');
      return;
    }
    if (!fieldKey.trim()) {
      setErrorMsg('Field key is required.');
      return;
    }

    try {
      setSaving(true);
      setErrorMsg(null);

      // Parse choices for select/multiselect
      const choicesArray = choicesInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const labelI18n: Record<string, string> = { en: label.trim() };
      if (labelEs.trim()) labelI18n.es = labelEs.trim();
      if (labelDe.trim()) labelI18n.de = labelDe.trim();

      const validation: any = {};
      if (validationMin !== '') validation.min = Number(validationMin);
      if (validationMax !== '') validation.max = Number(validationMax);
      if (validationPattern.trim()) {
        validation.pattern = validationPattern.trim();
        if (patternMessage.trim()) validation.patternMessage = patternMessage.trim();
      }

      const payload: any = {
        targetType,
        fieldKey: fieldKey.trim().toLowerCase(),
        label: label.trim(),
        labelI18n,
        description: description.trim() || null,
        type,
        required,
        groupName: groupName.trim() || 'General',
        displayOrder: Number(displayOrder) || 0,
        options: {
          choices: choicesArray,
          defaultCurrency: type === 'currency' ? 'USD' : undefined,
        },
        validation,
        editableRoles,
      };

      if (defaultValue !== '') {
        payload.defaultValue = defaultValue;
      }

      if (editingId) {
        await ApiClient.updateFieldDefinition(editingId, payload);
        setSuccessMsg(`Field "${label}" updated successfully.`);
      } else {
        await ApiClient.createFieldDefinition(payload);
        setSuccessMsg(`Field "${label}" created successfully.`);
      }

      setIsEditing(false);
      setEditingId(null);
      await loadFields();
      if (onFieldsChanged) onFieldsChanged();
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to save custom field');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (field: FieldDefinitionDto) => {
    if (!field.id) return;
    try {
      setErrorMsg(null);
      const nextActive = !field.isActive;
      await ApiClient.updateFieldDefinition(field.id, { isActive: nextActive });
      setSuccessMsg(
        `Field "${field.label}" ${nextActive ? 'reactivated' : 'retired (existing records preserved)'}.`
      );
      await loadFields();
      if (onFieldsChanged) onFieldsChanged();
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to update field status');
    }
  };

  const handleDeletePermanent = async (field: FieldDefinitionDto) => {
    if (!field.id) return;
    if (!window.confirm(`Permanently delete field "${field.label}"?`)) return;

    try {
      setErrorMsg(null);
      await ApiClient.deleteFieldDefinition(field.id, true);
      setSuccessMsg(`Field "${field.label}" permanently deleted.`);
      await loadFields();
      if (onFieldsChanged) onFieldsChanged();
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to delete field');
    }
  };

  if (!isOpen) return null;

  const filteredFields = fields.filter((f) => {
    if (activeTab === 'all') return true;
    return f.targetType === activeTab;
  });

  const getFieldTypeIcon = (tStr: string) => {
    switch (tStr) {
      case 'text':
        return <Type className="w-3.5 h-3.5 text-blue-500" />;
      case 'longtext':
        return <AlignLeft className="w-3.5 h-3.5 text-blue-500" />;
      case 'number':
        return <Hash className="w-3.5 h-3.5 text-emerald-500" />;
      case 'currency':
        return <DollarSign className="w-3.5 h-3.5 text-emerald-500" />;
      case 'date':
        return <Calendar className="w-3.5 h-3.5 text-amber-500" />;
      case 'boolean':
      case 'checkbox':
        return <CheckSquare className="w-3.5 h-3.5 text-purple-500" />;
      case 'select':
        return <ListFilter className="w-3.5 h-3.5 text-indigo-500" />;
      case 'multiselect':
        return <Layers className="w-3.5 h-3.5 text-indigo-500" />;
      case 'user':
        return <UserIcon className="w-3.5 h-3.5 text-sky-500" />;
      case 'team':
        return <Users className="w-3.5 h-3.5 text-orange-500" />;
      case 'link':
      case 'url':
        return <ExternalLink className="w-3.5 h-3.5 text-cyan-500" />;
      case 'file':
      case 'document':
        return <FileText className="w-3.5 h-3.5 text-rose-500" />;
      default:
        return <Type className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-1.5rem)] overscroll-contain">
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Custom Fields & Industry Metadata
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Define configurable fields for projects, stages, and tasks without altering database schemas.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close custom fields modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notices */}
        {errorMsg && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="break-words-safe">{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span className="break-words-safe">{successMsg}</span>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {!isEditing ? (
            <>
              {/* Controls & Filter Tabs */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Tabs */}
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-semibold overflow-x-auto max-w-full">
                  <button
                    onClick={() => setActiveTab('all')}
                    className={`min-h-[40px] px-3.5 py-2 shrink-0 rounded-lg flex items-center justify-center transition-all ${
                      activeTab === 'all'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    All ({fields.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('project')}
                    className={`min-h-[40px] px-3.5 py-2 shrink-0 rounded-lg flex items-center justify-center transition-all ${
                      activeTab === 'project'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Project Level
                  </button>
                  <button
                    onClick={() => setActiveTab('stage')}
                    className={`min-h-[40px] px-3.5 py-2 shrink-0 rounded-lg flex items-center justify-center transition-all ${
                      activeTab === 'stage'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Stages / Groups
                  </button>
                  <button
                    onClick={() => setActiveTab('task')}
                    className={`min-h-[40px] px-3.5 py-2 shrink-0 rounded-lg flex items-center justify-center transition-all ${
                      activeTab === 'task'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Tasks & Items
                  </button>
                </div>

                {/* Create Field Action */}
                <button
                  onClick={() => openCreateForm()}
                  className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all hover:scale-[1.02]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Custom Field</span>
                </button>
              </div>

              {/* Fields Table / Card Grid */}
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                  <RefreshCw className="w-8 h-8 animate-spin mb-3 text-blue-500" />
                  <p className="text-xs">Loading configurable fields...</p>
                </div>
              ) : filteredFields.length === 0 ? (
                <div className="py-16 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mx-auto">
                    <Sliders className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    No custom fields configured for this section
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Add custom fields to adapt FlowTrack to construction inspections, dealership approvals, academic credentials, and more.
                  </p>
                  <button
                    onClick={() => openCreateForm()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold shadow-sm hover:bg-blue-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add First Field</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredFields.map((field) => (
                    <div
                      key={field.id || field.fieldKey}
                      className={`p-4 rounded-2xl border transition-all ${
                        field.isActive !== false
                          ? 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80 shadow-sm'
                          : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-70'
                      } space-y-3`}
                    >
                      {/* Top Bar: Icon, Label, Badges */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700/80 flex items-center justify-center flex-shrink-0">
                            {getFieldTypeIcon(field.type)}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                              <span>{field.label}</span>
                              {field.required && (
                                <span className="text-rose-500 font-bold" title="Required">
                                  *
                                </span>
                              )}
                              {field.isActive === false && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 font-normal">
                                  Retired
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400">
                              key: {field.fieldKey} (v{field.version || 1})
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditForm(field)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="Edit Field"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(field)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              field.isActive !== false
                                ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                                : 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                            }`}
                            title={field.isActive !== false ? 'Retire Field' : 'Reactivate Field'}
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeletePermanent(field)}
                            className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Permanent Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Meta Tags */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium capitalize">
                          {field.type}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-medium capitalize">
                          Target: {field.targetType || 'task'}
                        </span>
                        {field.groupName && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">
                            Group: {field.groupName}
                          </span>
                        )}
                        {field.editableRoles && field.editableRoles.length > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" />
                            <span>Roles: {field.editableRoles.join(', ')}</span>
                          </span>
                        )}
                      </div>

                      {/* Help Text / Choices Preview */}
                      {field.description && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 italic line-clamp-1">
                          {field.description}
                        </p>
                      )}
                      {(field.type === 'select' || field.type === 'multiselect') &&
                        (field.options as any)?.choices?.length > 0 && (
                          <div className="text-[10px] text-slate-400 line-clamp-1">
                            Choices: {(field.options as any).choices.join(', ')}
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Field Editor Form */
            <form onSubmit={handleSaveField} className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-500" />
                  <span>{editingId ? `Edit Field "${label}"` : 'Create New Custom Field'}</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Cancel
                </button>
              </div>

              {/* Grid 1: Basic Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Target Type */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Applicable Target <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={targetType}
                    onChange={(e: any) => setTargetType(e.target.value)}
                    className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="project">Project Level (Whole Project Metadata)</option>
                    <option value="stage">Stage / Group Level</option>
                    <option value="task">Task / Item Level</option>
                    <option value="node">Universal (All Nodes)</option>
                  </select>
                </div>

                {/* Field Type */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Field Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="text">Short Text (e.g. Contractor Name, Code)</option>
                    <option value="longtext">Long Text / Notes (Multi-line)</option>
                    <option value="number">Numeric Quantity</option>
                    <option value="currency">Currency Amount (with currency symbol)</option>
                    <option value="date">Calendar Date</option>
                    <option value="boolean">Boolean Switch (Yes / No)</option>
                    <option value="select">Single-Select Dropdown</option>
                    <option value="multiselect">Multi-Select Badges</option>
                    <option value="user">User Reference</option>
                    <option value="team">Team / Squad Reference</option>
                    <option value="link">URL / Web Link</option>
                    <option value="file">Document Reference</option>
                  </select>
                </div>

                {/* Display Name */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Display Label <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => handleLabelChange(e.target.value)}
                    placeholder="e.g. Primary Contractor, Inspection Date"
                    className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                {/* Identifier / Key */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Field Key (Immutable Identifier) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={Boolean(editingId)}
                    value={fieldKey}
                    onChange={(e) => setFieldKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="e.g. contractor_name"
                    className="w-full p-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                {/* Group Name */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Group Section Name
                  </label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="e.g. Financials, Compliance, Execution"
                    className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Required Flag */}
                <div className="flex items-center gap-3 pt-5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={required}
                      onChange={(e) => setRequired(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Required Field (blocks task completion if empty)
                    </span>
                  </label>
                </div>
              </div>

              {/* Help Text / Description */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Help Text / Description (Tooltip for collaborators)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Enter registered civil contractor licensed by the municipal council"
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Choices (Only for select and multiselect) */}
              {(type === 'select' || type === 'multiselect') && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    Select Choices (Comma Separated)
                  </label>
                  <input
                    type="text"
                    value={choicesInput}
                    onChange={(e) => setChoicesInput(e.target.value)}
                    placeholder="e.g. Foundation, Structural, Electrical, Plumbing"
                    className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                  <p className="text-[11px] text-slate-400">
                    Separate multiple choices with commas.
                  </p>
                </div>
              )}

              {/* Validation Constraints */}
              {(type === 'number' || type === 'currency' || type === 'text') && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                  <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Validation Constraints
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {type !== 'text' ? (
                      <>
                        <div>
                          <label className="text-[11px] text-slate-500 block mb-1">Min Value</label>
                          <input
                            type="number"
                            value={validationMin}
                            onChange={(e) => setValidationMin(e.target.value)}
                            placeholder="0"
                            className="w-full p-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500 block mb-1">Max Value</label>
                          <input
                            type="number"
                            value={validationMax}
                            onChange={(e) => setValidationMax(e.target.value)}
                            placeholder="1000000"
                            className="w-full p-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="text-[11px] text-slate-500 block mb-1">
                            Regex Pattern Format (Optional)
                          </label>
                          <input
                            type="text"
                            value={validationPattern}
                            onChange={(e) => setValidationPattern(e.target.value)}
                            placeholder="e.g. ^OEM-[A-Z0-9]+$"
                            className="w-full p-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500 block mb-1">
                            Pattern Error Message
                          </label>
                          <input
                            type="text"
                            value={patternMessage}
                            onChange={(e) => setPatternMessage(e.target.value)}
                            placeholder="e.g. Must start with OEM- code"
                            className="w-full p-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Role Permissions Restriction */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Editable Roles Restriction (Leave empty for all roles)
                </label>
                <div className="flex flex-wrap gap-4 pt-1">
                  {['ADMIN', 'MANAGER', 'TEAM_LEAD', 'MEMBER'].map((r) => {
                    const isChecked = editableRoles.includes(r);
                    return (
                      <label key={r} className="flex items-center gap-1.5 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditableRoles([...editableRoles, r]);
                            } else {
                              setEditableRoles(editableRoles.filter((role) => role !== r));
                            }
                          }}
                          className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{r}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400">
                  If selected, only users with the checked roles can edit this field's value.
                </p>
              </div>

              {/* Localizations */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Localization (Multi-language Labels)
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Spanish (es)</label>
                    <input
                      type="text"
                      value={labelEs}
                      onChange={(e) => setLabelEs(e.target.value)}
                      placeholder="e.g. Contratista"
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">German (de)</label>
                    <input
                      type="text"
                      value={labelDe}
                      onChange={(e) => setLabelDe(e.target.value)}
                      placeholder="e.g. Generalunternehmer"
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-end gap-2 sm:gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  {saving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{editingId ? 'Save Changes' : 'Create Field'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
