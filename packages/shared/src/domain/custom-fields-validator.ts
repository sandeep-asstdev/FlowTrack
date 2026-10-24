import { FieldDefinitionDto, VisibilityRuleDto } from '../schemas/custom-fields.js';

export interface CustomFieldValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  sanitized: Record<string, any>;
  sanitizedValues: Record<string, any>;
}

export interface ValidationOptions {
  userRole?: string;
  existingData?: Record<string, any>;
  isCompleting?: boolean;
}

/**
 * Evaluates visibility rules safely without arbitrary code execution.
 */
export function isFieldVisible(def: FieldDefinitionDto, currentData: Record<string, any> = {}): boolean {
  if (!def.visibilityRules) {
    return true;
  }

  const rules = Array.isArray(def.visibilityRules)
    ? def.visibilityRules
    : [def.visibilityRules as unknown as VisibilityRuleDto];

  if (rules.length === 0) {
    return true;
  }

  // All visibility rules must be satisfied (AND logic)
  for (const rule of rules) {
    if (!evaluateRule(rule, currentData)) {
      return false;
    }
  }

  return true;
}

function evaluateRule(
  rule: { dependsOnField: string; operator?: string; value?: any },
  data: Record<string, any>
): boolean {
  const val = data[rule.dependsOnField];
  const operator = rule.operator || 'equals';

  switch (operator) {
    case 'equals':
      if (typeof val === 'boolean' || typeof rule.value === 'boolean') {
        return Boolean(val) === Boolean(rule.value);
      }
      return String(val ?? '') === String(rule.value ?? '');

    case 'not_equals':
      if (typeof val === 'boolean' || typeof rule.value === 'boolean') {
        return Boolean(val) !== Boolean(rule.value);
      }
      return String(val ?? '') !== String(rule.value ?? '');

    case 'contains':
      if (Array.isArray(val)) {
        return val.map(String).includes(String(rule.value));
      }
      return String(val || '').toLowerCase().includes(String(rule.value || '').toLowerCase());

    case 'greater_than':
      return Number(val) > Number(rule.value);

    case 'less_than':
      return Number(val) < Number(rule.value);

    case 'is_empty':
      return (
        val === undefined ||
        val === null ||
        val === '' ||
        (Array.isArray(val) && val.length === 0) ||
        (typeof val === 'object' && Object.keys(val).length === 0)
      );

    case 'is_not_empty':
      return !(
        val === undefined ||
        val === null ||
        val === '' ||
        (Array.isArray(val) && val.length === 0) ||
        (typeof val === 'object' && Object.keys(val).length === 0)
      );

    default:
      return true;
  }
}

/**
 * Checks if the specified user role is permitted to modify this field.
 */
export function isFieldEditable(def: FieldDefinitionDto, userRole?: string): boolean {
  if (!def.editableRoles || def.editableRoles.length === 0) {
    return true;
  }
  if (!userRole) {
    return false;
  }
  const normalized = userRole.toUpperCase();
  return def.editableRoles.some((r) => r.toUpperCase() === normalized);
}

/**
 * Resolves localized label for a custom field according to current locale.
 */
export function getLocalizedFieldLabel(
  field: { label: string; labelI18n?: Record<string, string> | null },
  locale: string = 'en'
): string {
  if (field.labelI18n && typeof field.labelI18n === 'object') {
    const direct = field.labelI18n[locale];
    if (direct) return direct;
    const shortLocale = locale.split(/[-_]/)[0];
    if (field.labelI18n[shortLocale]) return field.labelI18n[shortLocale];
  }
  return field.label;
}

/**
 * Extracts allowed choices array from options (handles both string[] and object[]).
 */
export function extractChoiceValues(optionsOrDef?: any): string[] {
  if (!optionsOrDef) {
    return [];
  }
  const choices = optionsOrDef.choices || optionsOrDef.options?.choices;
  if (!choices || !Array.isArray(choices)) {
    return [];
  }
  return choices.map((c: any) => (typeof c === 'object' && c !== null ? c.value : String(c)));
}

/**
 * Validates customData against an array of FieldDefinitions.
 */
export function validateCustomData(
  definitions: FieldDefinitionDto[],
  customData: Record<string, any> = {},
  options: ValidationOptions = {}
): CustomFieldValidationResult {
  const errors: Record<string, string> = {};
  const sanitized: Record<string, any> = {};
  const { userRole, existingData = {} } = options;

  for (const def of definitions) {
    // 1. Check if field is visible under current data
    const visible = isFieldVisible(def, customData);
    if (!visible) {
      // If hidden and was not previously set, omit from required checks
      if (customData[def.fieldKey] !== undefined) {
        sanitized[def.fieldKey] = customData[def.fieldKey];
      }
      continue;
    }

    // 2. Check Role Edit Permissions if value changed
    const incomingVal = customData[def.fieldKey];
    const existingVal = existingData[def.fieldKey];
    const isValueChanged = JSON.stringify(incomingVal) !== JSON.stringify(existingVal);

    if (isValueChanged && userRole && !isFieldEditable(def, userRole)) {
      errors[def.fieldKey] = `Modifying "${def.label}" requires one of the following roles: ${def.editableRoles?.join(', ')}.`;
      continue;
    }

    const value = incomingVal !== undefined ? incomingVal : def.defaultValue;

    // 3. Check Required constraint (only for active fields)
    const isActive = def.isActive !== false;
    const isEmpty =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (def.required && isActive && isEmpty) {
      const customMsg = def.validation?.errorMessage;
      errors[def.fieldKey] = customMsg || `${def.label} is required.`;
      continue;
    }

    // Skip validation for empty optional values
    if (isEmpty) {
      if (value !== undefined) {
        sanitized[def.fieldKey] = value;
      }
      continue;
    }

    const valRules = def.validation || {};
    const fieldType = def.type;

    // 4. Type & Constraint Validations
    switch (fieldType) {
      case 'text':
      case 'longtext': {
        if (typeof value !== 'string') {
          errors[def.fieldKey] = `${def.label} must be a text string.`;
        } else {
          const trimmed = value.trim();
          if (valRules.minLength !== undefined && trimmed.length < valRules.minLength) {
            errors[def.fieldKey] = `${def.label} must be at least ${valRules.minLength} characters.`;
          } else if (valRules.maxLength !== undefined && trimmed.length > valRules.maxLength) {
            errors[def.fieldKey] = `${def.label} must not exceed ${valRules.maxLength} characters.`;
          } else if (valRules.pattern) {
            try {
              const regex = new RegExp(valRules.pattern);
              if (!regex.test(trimmed)) {
                errors[def.fieldKey] = valRules.patternMessage || `${def.label} format is invalid.`;
              } else {
                sanitized[def.fieldKey] = trimmed;
              }
            } catch {
              // Regex pattern error on definition - safe fallback
              sanitized[def.fieldKey] = trimmed;
            }
          } else {
            sanitized[def.fieldKey] = trimmed;
          }
        }
        break;
      }

      case 'number': {
        const num = Number(value);
        if (isNaN(num)) {
          errors[def.fieldKey] = `${def.label} must be a valid number.`;
        } else if (valRules.min !== undefined && num < valRules.min) {
          errors[def.fieldKey] = `${def.label} must be at least ${valRules.min}.`;
        } else if (valRules.max !== undefined && num > valRules.max) {
          errors[def.fieldKey] = `${def.label} must not exceed ${valRules.max}.`;
        } else {
          sanitized[def.fieldKey] = valRules.decimalPlaces !== undefined ? Number(num.toFixed(valRules.decimalPlaces)) : num;
        }
        break;
      }

      case 'currency': {
        if (typeof value === 'object' && value !== null) {
          const amount = Number(value.amount);
          if (isNaN(amount)) {
            errors[def.fieldKey] = `${def.label} amount must be a number.`;
          } else if (valRules.min !== undefined && amount < valRules.min) {
            errors[def.fieldKey] = `${def.label} amount must be at least ${valRules.min}.`;
          } else if (valRules.max !== undefined && amount > valRules.max) {
            errors[def.fieldKey] = `${def.label} amount must not exceed ${valRules.max}.`;
          } else {
            sanitized[def.fieldKey] = {
              amount,
              currency: value.currency || def.options?.defaultCurrency || 'USD',
            };
          }
        } else {
          const amount = Number(value);
          if (isNaN(amount)) {
            errors[def.fieldKey] = `${def.label} must be a valid numeric amount.`;
          } else if (valRules.min !== undefined && amount < valRules.min) {
            errors[def.fieldKey] = `${def.label} must be at least ${valRules.min}.`;
          } else if (valRules.max !== undefined && amount > valRules.max) {
            errors[def.fieldKey] = `${def.label} must not exceed ${valRules.max}.`;
          } else {
            sanitized[def.fieldKey] = {
              amount,
              currency: def.options?.defaultCurrency || 'USD',
            };
          }
        }
        break;
      }

      case 'date': {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          errors[def.fieldKey] = `${def.label} must be a valid date.`;
        } else if (valRules.minDate && date < new Date(valRules.minDate)) {
          errors[def.fieldKey] = `${def.label} must be on or after ${valRules.minDate}.`;
        } else if (valRules.maxDate && date > new Date(valRules.maxDate)) {
          errors[def.fieldKey] = `${def.label} must be on or before ${valRules.maxDate}.`;
        } else {
          sanitized[def.fieldKey] = date.toISOString();
        }
        break;
      }

      case 'boolean':
      case 'checkbox': {
        sanitized[def.fieldKey] = Boolean(value);
        break;
      }

      case 'select': {
        const choices = extractChoiceValues(def);
        const strVal = String(value);
        if (choices.length > 0 && !choices.includes(strVal) && !def.options?.allowCustom) {
          errors[def.fieldKey] = `${def.label} must be one of: ${choices.join(', ')}.`;
        } else {
          sanitized[def.fieldKey] = strVal;
        }
        break;
      }

      case 'multiselect': {
        if (!Array.isArray(value)) {
          errors[def.fieldKey] = `${def.label} must be a list of values.`;
        } else {
          const choices = extractChoiceValues(def);
          const strList = value.map(String);
          if (choices.length > 0 && !def.options?.allowCustom) {
            const invalid = strList.filter((v) => !choices.includes(v));
            if (invalid.length > 0) {
              errors[def.fieldKey] = `Invalid choices for ${def.label}: ${invalid.join(', ')}.`;
              break;
            }
          }
          if (def.options?.minItems !== undefined && strList.length < def.options.minItems) {
            errors[def.fieldKey] = `${def.label} requires at least ${def.options.minItems} selections.`;
          } else if (def.options?.maxItems !== undefined && strList.length > def.options.maxItems) {
            errors[def.fieldKey] = `${def.label} accepts at most ${def.options.maxItems} selections.`;
          } else {
            sanitized[def.fieldKey] = strList;
          }
        }
        break;
      }

      case 'link':
      case 'url': {
        try {
          const urlStr = String(value).trim();
          const parsed = new URL(urlStr);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            errors[def.fieldKey] = `${def.label} must start with http:// or https://.`;
          } else {
            sanitized[def.fieldKey] = urlStr;
          }
        } catch {
          errors[def.fieldKey] = `${def.label} must be a valid URL.`;
        }
        break;
      }

      case 'user':
      case 'team': {
        if (typeof value !== 'string' || value.trim() === '') {
          errors[def.fieldKey] = `${def.label} must be a valid identifier.`;
        } else {
          sanitized[def.fieldKey] = value.trim();
        }
        break;
      }

      case 'file':
      case 'document': {
        // Can be a document ID or storage object
        if (typeof value === 'object' && value !== null) {
          sanitized[def.fieldKey] = value;
        } else if (typeof value === 'string' && value.trim() !== '') {
          sanitized[def.fieldKey] = value.trim();
        } else {
          errors[def.fieldKey] = `${def.label} must be a valid document reference.`;
        }
        break;
      }

      default:
        sanitized[def.fieldKey] = value;
        break;
    }
  }

  // Preserve existing untyped custom fields that aren't governed by definitions
  for (const [k, v] of Object.entries(customData)) {
    if (!definitions.some((d) => d.fieldKey === k) && v !== undefined) {
      sanitized[k] = v;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitized,
    sanitizedValues: sanitized,
  };
}

export const validateCustomFieldValues = validateCustomData;
