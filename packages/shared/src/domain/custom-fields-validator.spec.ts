import { describe, it, expect } from 'vitest';
import {
  validateCustomData,
  isFieldVisible,
  isFieldEditable,
  getLocalizedFieldLabel,
} from './custom-fields-validator.js';
import { FieldDefinitionDto } from '../schemas/custom-fields.js';

describe('Custom Fields Validation Engine', () => {
  const baseDefinitions: FieldDefinitionDto[] = [
    {
      fieldKey: 'contractor_name',
      label: 'Contractor Name',
      targetType: 'task',
      type: 'text',
      required: true,
      validation: { minLength: 3, maxLength: 50 },
      displayOrder: 1,
      isActive: true,
      version: 1,
    },
    {
      fieldKey: 'estimated_budget',
      label: 'Estimated Budget',
      targetType: 'project',
      type: 'currency',
      required: false,
      validation: { min: 1000 },
      options: { defaultCurrency: 'INR' },
      displayOrder: 2,
      isActive: true,
      version: 1,
    },
    {
      fieldKey: 'safety_clearance',
      label: 'Safety Clearance Passed',
      targetType: 'task',
      type: 'boolean',
      required: false,
      displayOrder: 3,
      isActive: true,
      version: 1,
    },
    {
      fieldKey: 'inspection_category',
      label: 'Inspection Category',
      targetType: 'stage',
      type: 'select',
      required: true,
      options: { choices: ['Foundation', 'Electrical', 'Structural', 'Plumbing'] },
      displayOrder: 4,
      isActive: true,
      version: 1,
    },
  ];

  it('validates and sanitizes valid custom field values', () => {
    const input = {
      contractor_name: 'Apex Infrastructure Ltd  ',
      estimated_budget: 150000,
      safety_clearance: true,
      inspection_category: 'Structural',
    };

    const res = validateCustomData(baseDefinitions, input);
    expect(res.isValid).toBe(true);
    expect(res.errors).toEqual({});
    expect(res.sanitized.contractor_name).toBe('Apex Infrastructure Ltd');
    expect(res.sanitized.estimated_budget).toEqual({ amount: 150000, currency: 'INR' });
    expect(res.sanitized.safety_clearance).toBe(true);
    expect(res.sanitized.inspection_category).toBe('Structural');
  });

  it('rejects missing required fields', () => {
    const input = {
      inspection_category: 'Foundation',
    };

    const res = validateCustomData(baseDefinitions, input);
    expect(res.isValid).toBe(false);
    expect(res.errors.contractor_name).toContain('is required');
  });

  it('rejects invalid choices for select field', () => {
    const input = {
      contractor_name: 'Metro Builders',
      inspection_category: 'InvalidChoiceNotAllowed',
    };

    const res = validateCustomData(baseDefinitions, input);
    expect(res.isValid).toBe(false);
    expect(res.errors.inspection_category).toContain('must be one of: Foundation, Electrical');
  });

  it('preserves untyped existing fields gracefully', () => {
    const input = {
      contractor_name: 'Valid Corp',
      inspection_category: 'Foundation',
      legacy_custom_tag: 'retained_data',
    };

    const res = validateCustomData(baseDefinitions, input);
    expect(res.isValid).toBe(true);
    expect(res.sanitized.legacy_custom_tag).toBe('retained_data');
  });

  describe('All 11 Field Types Validation', () => {
    const fullTypesDefinitions: FieldDefinitionDto[] = [
      { fieldKey: 'short_text', label: 'Short Text', targetType: 'task', type: 'text', required: true, displayOrder: 1, isActive: true, version: 1 },
      { fieldKey: 'long_text', label: 'Long Text', targetType: 'task', type: 'longtext', required: false, displayOrder: 2, isActive: true, version: 1 },
      { fieldKey: 'number_val', label: 'Quantity', targetType: 'task', type: 'number', required: true, validation: { min: 1, max: 100, decimalPlaces: 2 }, displayOrder: 3, isActive: true, version: 1 },
      { fieldKey: 'currency_val', label: 'Cost', targetType: 'task', type: 'currency', required: true, options: { defaultCurrency: 'USD' }, displayOrder: 4, isActive: true, version: 1 },
      { fieldKey: 'date_val', label: 'Due Date', targetType: 'task', type: 'date', required: true, displayOrder: 5, isActive: true, version: 1 },
      { fieldKey: 'bool_val', label: 'Is Approved', targetType: 'task', type: 'boolean', required: false, displayOrder: 6, isActive: true, version: 1 },
      { fieldKey: 'select_val', label: 'Severity', targetType: 'task', type: 'select', required: true, options: { choices: [{ value: 'LOW', label: 'Low' }, { value: 'HIGH', label: 'High' }] }, displayOrder: 7, isActive: true, version: 1 },
      { fieldKey: 'multi_val', label: 'Tags', targetType: 'task', type: 'multiselect', required: true, options: { choices: ['frontend', 'backend', 'devops'], minItems: 1, maxItems: 2 }, displayOrder: 8, isActive: true, version: 1 },
      { fieldKey: 'user_val', label: 'Lead User', targetType: 'task', type: 'user', required: true, displayOrder: 9, isActive: true, version: 1 },
      { fieldKey: 'team_val', label: 'Assigned Team', targetType: 'task', type: 'team', required: true, displayOrder: 10, isActive: true, version: 1 },
      { fieldKey: 'url_val', label: 'CAD Portal URL', targetType: 'task', type: 'link', required: true, displayOrder: 11, isActive: true, version: 1 },
      { fieldKey: 'file_val', label: 'Compliance Doc', targetType: 'task', type: 'file', required: true, displayOrder: 12, isActive: true, version: 1 },
    ];

    it('successfully validates every field type with correct data', () => {
      const validPayload = {
        short_text: 'Bridge Inspection',
        long_text: 'Detailed inspection report regarding pier 4 foundation structural integrity.',
        number_val: '42.506',
        currency_val: { amount: 8500, currency: 'USD' },
        date_val: '2026-11-15T00:00:00.000Z',
        bool_val: true,
        select_val: 'HIGH',
        multi_val: ['frontend', 'backend'],
        user_val: 'usr-123e4567-e89b',
        team_val: 'team-987e6543-a21c',
        url_val: 'https://cad.infra.company.com/drawings/402',
        file_val: 'doc-soil-test-report-v2.pdf',
      };

      const res = validateCustomData(fullTypesDefinitions, validPayload);
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
      expect(res.sanitized.number_val).toBe(42.51); // rounded to 2 decimal places
      expect(res.sanitized.currency_val).toEqual({ amount: 8500, currency: 'USD' });
      expect(res.sanitized.multi_val).toEqual(['frontend', 'backend']);
      expect(res.sanitized.url_val).toBe('https://cad.infra.company.com/drawings/402');
    });

    it('rejects invalid URL format', () => {
      const res = validateCustomData(fullTypesDefinitions, {
        short_text: 'Test',
        number_val: 10,
        currency_val: 50,
        date_val: '2026-10-10',
        select_val: 'LOW',
        multi_val: ['frontend'],
        user_val: 'u1',
        team_val: 't1',
        url_val: 'invalid-not-a-url',
        file_val: 'doc1',
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.url_val).toContain('must be a valid URL');
    });

    it('rejects number outside min/max range', () => {
      const res = validateCustomData(fullTypesDefinitions, {
        short_text: 'Test',
        number_val: 150, // Max is 100
        currency_val: 50,
        date_val: '2026-10-10',
        select_val: 'LOW',
        multi_val: ['frontend'],
        user_val: 'u1',
        team_val: 't1',
        url_val: 'https://example.com',
        file_val: 'doc1',
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.number_val).toContain('must not exceed 100');
    });

    it('rejects multiselect exceeding maxItems', () => {
      const res = validateCustomData(fullTypesDefinitions, {
        short_text: 'Test',
        number_val: 10,
        currency_val: 50,
        date_val: '2026-10-10',
        select_val: 'LOW',
        multi_val: ['frontend', 'backend', 'devops'], // Max is 2
        user_val: 'u1',
        team_val: 't1',
        url_val: 'https://example.com',
        file_val: 'doc1',
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.multi_val).toContain('accepts at most 2 selections');
    });
  });

  describe('Conditional Visibility Rules', () => {
    const visibilityDefs: FieldDefinitionDto[] = [
      {
        fieldKey: 'has_defect',
        label: 'Defect Identified?',
        targetType: 'task',
        type: 'boolean',
        required: false,
        displayOrder: 1,
        isActive: true,
        version: 1,
      },
      {
        fieldKey: 'defect_severity',
        label: 'Defect Severity',
        targetType: 'task',
        type: 'select',
        required: true,
        options: { choices: ['Minor', 'Major', 'Critical'] },
        visibilityRules: [
          { dependsOnField: 'has_defect', operator: 'equals', value: true },
        ],
        displayOrder: 2,
        isActive: true,
        version: 1,
      },
    ];

    it('is not visible when condition is false and therefore not required', () => {
      const data = { has_defect: false };
      expect(isFieldVisible(visibilityDefs[1], data)).toBe(false);

      const res = validateCustomData(visibilityDefs, data);
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });

    it('is visible when condition is true and validates required constraint', () => {
      const data = { has_defect: true };
      expect(isFieldVisible(visibilityDefs[1], data)).toBe(true);

      const res = validateCustomData(visibilityDefs, data);
      expect(res.isValid).toBe(false);
      expect(res.errors.defect_severity).toContain('is required');

      const validRes = validateCustomData(visibilityDefs, {
        has_defect: true,
        defect_severity: 'Major',
      });
      expect(validRes.isValid).toBe(true);
      expect(validRes.sanitized.defect_severity).toBe('Major');
    });
  });

  describe('Editable Roles & Permission Guards', () => {
    const roleRestrictedDefs: FieldDefinitionDto[] = [
      {
        fieldKey: 'general_notes',
        label: 'General Notes',
        targetType: 'task',
        type: 'text',
        required: false,
        displayOrder: 1,
        isActive: true,
        version: 1,
      },
      {
        fieldKey: 'financial_approval_code',
        label: 'Financial Approval Code',
        targetType: 'task',
        type: 'text',
        required: false,
        editableRoles: ['ADMIN', 'MANAGER'],
        displayOrder: 2,
        isActive: true,
        version: 1,
      },
    ];

    it('allows ADMIN or MANAGER to edit restricted field', () => {
      expect(isFieldEditable(roleRestrictedDefs[1], 'ADMIN')).toBe(true);
      expect(isFieldEditable(roleRestrictedDefs[1], 'MANAGER')).toBe(true);

      const res = validateCustomData(
        roleRestrictedDefs,
        { financial_approval_code: 'FIN-2026-99' },
        { userRole: 'MANAGER', existingData: {} }
      );
      expect(res.isValid).toBe(true);
      expect(res.sanitized.financial_approval_code).toBe('FIN-2026-99');
    });

    it('blocks MEMBER or TEAM_LEAD from modifying restricted field', () => {
      expect(isFieldEditable(roleRestrictedDefs[1], 'MEMBER')).toBe(false);
      expect(isFieldEditable(roleRestrictedDefs[1], 'TEAM_LEAD')).toBe(false);

      const res = validateCustomData(
        roleRestrictedDefs,
        { financial_approval_code: 'HACKED-CODE' },
        { userRole: 'MEMBER', existingData: { financial_approval_code: 'ORIGINAL' } }
      );
      expect(res.isValid).toBe(false);
      expect(res.errors.financial_approval_code).toContain('requires one of the following roles: ADMIN, MANAGER');
    });
  });

  describe('Retired Fields & Renaming Compatibility', () => {
    const retiredFieldDefs: FieldDefinitionDto[] = [
      {
        fieldKey: 'legacy_permit_num',
        label: 'Municipal Permit (Archived)',
        targetType: 'stage',
        type: 'text',
        required: true, // Marked required, but isActive is false!
        isActive: false,
        displayOrder: 1,
        version: 2,
      },
      {
        fieldKey: 'new_permit_id',
        label: 'Digital State Clearance ID',
        targetType: 'stage',
        type: 'text',
        required: true,
        isActive: true,
        displayOrder: 2,
        version: 1,
      },
    ];

    it('does not enforce required constraint on retired fields', () => {
      const res = validateCustomData(retiredFieldDefs, {
        new_permit_id: 'PERMIT-2026-X',
        // legacy_permit_num omitted
      });
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });

    it('preserves existing data of retired fields without corruption', () => {
      const res = validateCustomData(retiredFieldDefs, {
        new_permit_id: 'PERMIT-2026-X',
        legacy_permit_num: 'OLD-990-2020',
      });
      expect(res.isValid).toBe(true);
      expect(res.sanitized.legacy_permit_num).toBe('OLD-990-2020');
    });
  });

  describe('Industry Examples (Construction, Dealership, Education)', () => {
    it('validates Construction metadata: contractor, inspection date, budget allocation', () => {
      const constructionDefs: FieldDefinitionDto[] = [
        { fieldKey: 'contractor', label: 'Primary Contractor', targetType: 'task', type: 'text', required: true, displayOrder: 1, isActive: true, version: 1 },
        { fieldKey: 'inspection_date', label: 'Site Inspection Date', targetType: 'task', type: 'date', required: true, displayOrder: 2, isActive: true, version: 1 },
        { fieldKey: 'budget_allocation', label: 'Budget Allocation', targetType: 'task', type: 'currency', required: true, options: { defaultCurrency: 'INR' }, displayOrder: 3, isActive: true, version: 1 },
      ];

      const validConstruction = {
        contractor: 'Larsen & Toubro Civil Ltd',
        inspection_date: '2026-11-20T09:00:00.000Z',
        budget_allocation: { amount: 4500000, currency: 'INR' },
      };

      const res = validateCustomData(constructionDefs, validConstruction);
      expect(res.isValid).toBe(true);
      expect(res.sanitized.contractor).toBe('Larsen & Toubro Civil Ltd');
      expect(res.sanitized.budget_allocation.currency).toBe('INR');
      expect(res.sanitized.budget_allocation.amount).toBe(4500000);
    });

    it('validates Dealership metadata: brand approval reference, showroom readiness', () => {
      const dealershipDefs: FieldDefinitionDto[] = [
        { fieldKey: 'brand_approval_ref', label: 'OEM Brand Approval Ref', targetType: 'stage', type: 'text', required: true, validation: { pattern: '^OEM-[A-Z0-9]{4,10}$', patternMessage: 'Must start with OEM- followed by uppercase code' }, displayOrder: 1, isActive: true, version: 1 },
        { fieldKey: 'showroom_readiness', label: 'Showroom Readiness Status', targetType: 'stage', type: 'select', required: true, options: { choices: ['Under Renovation', 'Pre-Launch Inspection', 'Customer Ready'] }, displayOrder: 2, isActive: true, version: 1 },
      ];

      // Test valid payload
      const validDealer = {
        brand_approval_ref: 'OEM-BMW9901',
        showroom_readiness: 'Customer Ready',
      };
      const res1 = validateCustomData(dealershipDefs, validDealer);
      expect(res1.isValid).toBe(true);

      // Test invalid pattern regex
      const invalidDealer = {
        brand_approval_ref: 'invalid-ref-123',
        showroom_readiness: 'Customer Ready',
      };
      const res2 = validateCustomData(dealershipDefs, invalidDealer);
      expect(res2.isValid).toBe(false);
      expect(res2.errors.brand_approval_ref).toContain('Must start with OEM-');
    });

    it('validates Education metadata: accreditation deadline, department, classroom readiness', () => {
      const educationDefs: FieldDefinitionDto[] = [
        { fieldKey: 'accreditation_deadline', label: 'NAAC Accreditation Deadline', targetType: 'project', type: 'date', required: true, displayOrder: 1, isActive: true, version: 1 },
        { fieldKey: 'department', label: 'Academic Department', targetType: 'project', type: 'select', required: true, options: { choices: ['Computer Science', 'Mechanical Engineering', 'School of Business'] }, displayOrder: 2, isActive: true, version: 1 },
        { fieldKey: 'classroom_readiness', label: 'Classroom & Lab Readiness', targetType: 'task', type: 'boolean', required: true, displayOrder: 3, isActive: true, version: 1 },
      ];

      const validEdu = {
        accreditation_deadline: '2026-12-31T23:59:59.000Z',
        department: 'Computer Science',
        classroom_readiness: true,
      };
      const res = validateCustomData(educationDefs, validEdu);
      expect(res.isValid).toBe(true);
      expect(res.sanitized.department).toBe('Computer Science');
      expect(res.sanitized.classroom_readiness).toBe(true);
    });
  });

  describe('Localization Support', () => {
    it('returns localized label when current locale is available', () => {
      const field = {
        label: 'Contractor',
        labelI18n: {
          en: 'Contractor',
          es: 'Contratista',
          de: 'Generalunternehmer',
          hi: 'ठेकेदार',
        },
      };

      expect(getLocalizedFieldLabel(field, 'es')).toBe('Contratista');
      expect(getLocalizedFieldLabel(field, 'de')).toBe('Generalunternehmer');
      expect(getLocalizedFieldLabel(field, 'hi')).toBe('ठेकेदार');
      expect(getLocalizedFieldLabel(field, 'fr')).toBe('Contractor'); // fallback to label
    });
  });
});
