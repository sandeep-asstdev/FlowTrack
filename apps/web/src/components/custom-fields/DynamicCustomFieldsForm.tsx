import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FieldDefinitionDto,
  isFieldVisible,
  isFieldEditable,
  getLocalizedFieldLabel,
  extractChoiceValues,
} from '@flowtrack/shared';
import {
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
  HelpCircle,
  AlertCircle,
} from 'lucide-react';

export interface DynamicCustomFieldsFormProps {
  fields: FieldDefinitionDto[];
  values: Record<string, any>;
  onChange: (updatedValues: Record<string, any>) => void;
  onBlur?: () => void;
  userRole?: string;
  currentUserRole?: string;
  members?: any[];
  isReadOnly?: boolean;
  errors?: Record<string, string>;
  className?: string;
  gridCols?: 1 | 2;
}

export const DynamicCustomFieldsForm: React.FC<DynamicCustomFieldsFormProps> = ({
  fields,
  values,
  onChange,
  onBlur,
  userRole,
  currentUserRole,
  members,
  isReadOnly = false,
  errors = {},
  className = '',
  gridCols = 2,
}) => {
  const effectiveUserRole = userRole || currentUserRole;
  const { i18n } = useTranslation();
  const currentLang = i18n.language || 'en';

  // Filter visible and active fields, grouped by groupName
  const groupedFields = useMemo(() => {
    const activeFields = fields.filter((f) => f.isActive !== false);
    const visibleFields = activeFields.filter((f) => isFieldVisible(f, values));

    const groups: Record<string, FieldDefinitionDto[]> = {};
    for (const f of visibleFields) {
      const g = f.groupName || 'General';
      if (!groups[g]) {
        groups[g] = [];
      }
      groups[g].push(f);
    }

    // Sort fields in each group by displayOrder
    for (const g in groups) {
      groups[g].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    }

    return groups;
  }, [fields, values]);

  const handleChange = (fieldKey: string, val: any) => {
    onChange({
      ...values,
      [fieldKey]: val,
    });
  };

  const getFieldIcon = (type: string) => {
    switch (type) {
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

  const groupKeys = Object.keys(groupedFields);
  if (groupKeys.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {groupKeys.map((groupName) => {
        const groupItems = groupedFields[groupName];
        return (
          <div
            key={groupName}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm shadow-sm space-y-4"
          >
            {groupKeys.length > 1 && (
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {groupName}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  {groupItems.length}
                </span>
              </div>
            )}

            <div
              className={`grid gap-4 ${
                gridCols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
              }`}
            >
              {groupItems.map((field) => {
                const label = getLocalizedFieldLabel(field, currentLang);
                const fieldKey = field.fieldKey;
                const value = values[fieldKey];
                const error = errors[fieldKey];
                const editable = !isReadOnly && isFieldEditable(field, userRole);
                const choices = extractChoiceValues(field.options);

                return (
                  <div
                    key={field.id || fieldKey}
                    className={`space-y-1.5 ${
                      field.type === 'longtext' ? 'sm:col-span-2' : ''
                    }`}
                  >
                    {/* Header: Label, Icon, Required, Help, Lock */}
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        {getFieldIcon(field.type)}
                        <span>{label}</span>
                        {field.required && (
                          <span className="text-rose-500 font-bold" title="Required">
                            *
                          </span>
                        )}
                        {!editable && (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-normal"
                            title={`Restricted to roles: ${field.editableRoles?.join(', ') || 'Restricted'}`}
                          >
                            <Lock className="w-2.5 h-2.5" />
                            <span>Locked</span>
                          </span>
                        )}
                      </label>

                      {field.description && (
                        <span
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-help"
                          title={field.description}
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>

                    {/* Field Input Control */}
                    <div>
                      {/* 1. Short Text */}
                      {field.type === 'text' && (
                        <input
                          type="text"
                          disabled={!editable}
                          value={value ?? ''}
                          onChange={(e) => handleChange(fieldKey, e.target.value)}
                          onBlur={onBlur}
                          placeholder={`Enter ${label}...`}
                          className={`w-full px-3 py-2 text-xs rounded-xl border ${
                            error
                              ? 'border-rose-400 focus:ring-rose-500'
                              : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500'
                          } bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 transition-all`}
                        />
                      )}

                      {/* 2. Long Text */}
                      {field.type === 'longtext' && (
                        <textarea
                          rows={3}
                          disabled={!editable}
                          value={value ?? ''}
                          onChange={(e) => handleChange(fieldKey, e.target.value)}
                          onBlur={onBlur}
                          placeholder={`Enter ${label}...`}
                          className={`w-full px-3 py-2 text-xs rounded-xl border ${
                            error
                              ? 'border-rose-400 focus:ring-rose-500'
                              : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500'
                          } bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 transition-all resize-y`}
                        />
                      )}

                      {/* 3. Number */}
                      {field.type === 'number' && (
                        <input
                          type="number"
                          disabled={!editable}
                          value={value ?? ''}
                          min={field.validation?.min}
                          max={field.validation?.max}
                          step={
                            field.validation?.decimalPlaces
                              ? Math.pow(10, -field.validation.decimalPlaces)
                              : 'any'
                          }
                          onChange={(e) => handleChange(fieldKey, e.target.value)}
                          onBlur={onBlur}
                          placeholder="0"
                          className={`w-full px-3 py-2 text-xs rounded-xl border ${
                            error
                              ? 'border-rose-400 focus:ring-rose-500'
                              : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500'
                          } bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 transition-all`}
                        />
                      )}

                      {/* 4. Currency */}
                      {field.type === 'currency' && (
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 select-none">
                            {typeof value === 'object' && value !== null
                              ? value.currency || field.options?.defaultCurrency || 'USD'
                              : field.options?.defaultCurrency || 'USD'}
                          </span>
                          <input
                            type="number"
                            disabled={!editable}
                            value={
                              typeof value === 'object' && value !== null
                                ? value.amount ?? ''
                                : value ?? ''
                            }
                            onChange={(e) => {
                              const amt = e.target.value;
                              const curr =
                                typeof value === 'object' && value?.currency
                                  ? value.currency
                                  : field.options?.defaultCurrency || 'USD';
                              handleChange(fieldKey, {
                                amount: amt === '' ? '' : Number(amt),
                                currency: curr,
                              });
                            }}
                            onBlur={onBlur}
                            placeholder="0.00"
                            className={`flex-1 px-3 py-2 text-xs rounded-xl border ${
                              error
                                ? 'border-rose-400 focus:ring-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500'
                            } bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 transition-all`}
                          />
                        </div>
                      )}

                      {/* 5. Date */}
                      {field.type === 'date' && (
                        <input
                          type="date"
                          disabled={!editable}
                          value={
                            value
                              ? new Date(value).toISOString().substring(0, 10)
                              : ''
                          }
                          min={field.validation?.minDate}
                          max={field.validation?.maxDate}
                          onChange={(e) => handleChange(fieldKey, e.target.value)}
                          onBlur={onBlur}
                          className={`w-full px-3 py-2 text-xs rounded-xl border ${
                            error
                              ? 'border-rose-400 focus:ring-rose-500'
                              : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500'
                          } bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 transition-all`}
                        />
                      )}

                      {/* 6. Boolean / Checkbox */}
                      {(field.type === 'boolean' || field.type === 'checkbox') && (
                        <label className="flex items-center gap-3 py-1 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            disabled={!editable}
                            checked={Boolean(value)}
                            onChange={(e) => {
                              handleChange(fieldKey, e.target.checked);
                              if (onBlur) onBlur();
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600 relative"></div>
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {Boolean(value) ? 'Yes / Enabled' : 'No / Disabled'}
                          </span>
                        </label>
                      )}

                      {/* 7. Select */}
                      {field.type === 'select' && (
                        <select
                          disabled={!editable}
                          value={value ?? ''}
                          onChange={(e) => handleChange(fieldKey, e.target.value)}
                          onBlur={onBlur}
                          className={`w-full px-3 py-2 text-xs rounded-xl border ${
                            error
                              ? 'border-rose-400 focus:ring-rose-500'
                              : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500'
                          } bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 transition-all`}
                        >
                          <option value="">-- Select {label} --</option>
                          {choices.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      )}

                      {/* 8. Multiselect */}
                      {field.type === 'multiselect' && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1.5 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 min-h-[42px]">
                            {choices.length > 0 ? (
                              choices.map((choice) => {
                                const selectedList: string[] = Array.isArray(value)
                                  ? value
                                  : [];
                                const isSelected = selectedList.includes(choice);

                                return (
                                  <button
                                    key={choice}
                                    type="button"
                                    disabled={!editable}
                                    onClick={() => {
                                      if (!editable) return;
                                      const next = isSelected
                                        ? selectedList.filter((s) => s !== choice)
                                        : [...selectedList, choice];
                                      handleChange(fieldKey, next);
                                      if (onBlur) onBlur();
                                    }}
                                    className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition-all ${
                                      isSelected
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                                    } disabled:opacity-60 disabled:cursor-not-allowed`}
                                  >
                                    {choice}
                                  </button>
                                );
                              })
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">
                                No choices configured.
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 9. User or Team Reference */}
                      {(field.type === 'user' || field.type === 'team') && (
                        <input
                          type="text"
                          disabled={!editable}
                          value={value ?? ''}
                          onChange={(e) => handleChange(fieldKey, e.target.value)}
                          onBlur={onBlur}
                          placeholder={`Enter ${field.type === 'user' ? 'User ID or Name' : 'Team ID or Squad'}...`}
                          className={`w-full px-3 py-2 text-xs rounded-xl border ${
                            error
                              ? 'border-rose-400 focus:ring-rose-500'
                              : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500'
                          } bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 transition-all`}
                        />
                      )}

                      {/* 10. Link / URL */}
                      {(field.type === 'link' || field.type === 'url') && (
                        <div className="flex items-center gap-2">
                          <input
                            type="url"
                            disabled={!editable}
                            value={value ?? ''}
                            onChange={(e) => handleChange(fieldKey, e.target.value)}
                            onBlur={onBlur}
                            placeholder="https://..."
                            className={`flex-1 px-3 py-2 text-xs rounded-xl border ${
                              error
                                ? 'border-rose-400 focus:ring-rose-500'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500'
                            } bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 transition-all`}
                          />
                          {value && (
                            <a
                              href={String(value)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                              title="Open link in new tab"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      )}

                      {/* 11. File / Document Reference */}
                      {(field.type === 'file' || field.type === 'document') && (
                        <input
                          type="text"
                          disabled={!editable}
                          value={typeof value === 'object' ? value.name || '' : value ?? ''}
                          onChange={(e) => handleChange(fieldKey, e.target.value)}
                          onBlur={onBlur}
                          placeholder="Document filename or storage key..."
                          className={`w-full px-3 py-2 text-xs rounded-xl border ${
                            error
                              ? 'border-rose-400 focus:ring-rose-500'
                              : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500'
                          } bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 transition-all`}
                        />
                      )}
                    </div>

                    {/* Inline Error Message */}
                    {error && (
                      <p className="text-[11px] text-rose-500 flex items-center gap-1 font-medium">
                        <AlertCircle className="w-3 h-3 flex-shrink-0" />
                        <span>{error}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
