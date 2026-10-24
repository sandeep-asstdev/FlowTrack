import { describe, it, expect } from 'vitest';
import {
  validateCustomFieldValues,
  isFieldVisible,
  isFieldEditable,
  getLocalizedFieldLabel,
  FieldDefinitionDto,
} from '@flowtrack/shared';

describe('Custom Fields & Dynamic Form Integration (Chunk 5)', () => {
  describe('Industry Adaptability Metadata Test Cases', () => {
    it('handles Construction industry metadata: contractor, inspection date, budget allocation', () => {
      const constructionFields: FieldDefinitionDto[] = [
        {
          id: 'cf-const-1',
          targetType: 'project',
          fieldKey: 'contractor',
          label: 'Primary Contractor',
          labelI18n: { es: 'Contratista Principal', de: 'Hauptauftragnehmer' },
          type: 'text',
          required: true,
          validation: { minLength: 3, maxLength: 100 },
          groupName: 'Execution Partners',
          isActive: true,
          version: 1,
        },
        {
          id: 'cf-const-2',
          targetType: 'stage',
          fieldKey: 'inspectionDate',
          label: 'Site Inspection Date',
          type: 'date',
          required: true,
          groupName: 'Compliance & Quality',
          isActive: true,
          version: 1,
        },
        {
          id: 'cf-const-3',
          targetType: 'task',
          fieldKey: 'budgetAllocation',
          label: 'Budget Allocation ($)',
          type: 'currency',
          required: false,
          validation: { min: 0, max: 50000000 },
          groupName: 'Financials',
          isActive: true,
          version: 1,
        },
      ];

      // Localized labels test
      expect(getLocalizedFieldLabel(constructionFields[0], 'es')).toBe('Contratista Principal');
      expect(getLocalizedFieldLabel(constructionFields[0], 'de')).toBe('Hauptauftragnehmer');
      expect(getLocalizedFieldLabel(constructionFields[0], 'en')).toBe('Primary Contractor');

      // Valid construction data
      const validConstruction = {
        contractor: 'Skanska Balfour Joint Venture',
        inspectionDate: '2027-05-15',
        budgetAllocation: 1250000.5,
      };

      const resultValid = validateCustomFieldValues(constructionFields, validConstruction);
      expect(resultValid.isValid).toBe(true);
      expect(resultValid.sanitizedValues.budgetAllocation).toEqual({
        amount: 1250000.5,
        currency: 'USD',
      });

      // Invalid: contractor too short, budget negative
      const invalidConstruction = {
        contractor: 'A',
        inspectionDate: '2027-05-15',
        budgetAllocation: -500,
      };

      const resultInvalid = validateCustomFieldValues(constructionFields, invalidConstruction);
      expect(resultInvalid.isValid).toBe(false);
      expect(resultInvalid.errors.contractor).toContain('at least 3 characters');
      expect(resultInvalid.errors.budgetAllocation).toContain('at least 0');
    });

    it('handles Dealership industry metadata: brand approval reference, showroom readiness', () => {
      const dealershipFields: FieldDefinitionDto[] = [
        {
          id: 'cf-deal-1',
          targetType: 'task',
          fieldKey: 'brandApprovalReference',
          label: 'Brand Approval Reference',
          type: 'text',
          required: true,
          validation: { pattern: '^[A-Z]{3}-[0-9]{4}$' },
          helpText: 'Format: OEM-1234',
          isActive: true,
          version: 1,
        },
        {
          id: 'cf-deal-2',
          targetType: 'stage',
          fieldKey: 'showroomReadiness',
          label: 'Showroom Readiness Status',
          type: 'select',
          required: true,
          choices: ['Pending Review', 'Staged & Prepped', 'VIP Unveiling Approved', 'Archived'],
          isActive: true,
          version: 1,
        },
      ];

      // Regex validation constraint test
      const validDealership = {
        brandApprovalReference: 'BMW-8921',
        showroomReadiness: 'VIP Unveiling Approved',
      };
      const resValid = validateCustomFieldValues(dealershipFields, validDealership);
      expect(resValid.isValid).toBe(true);

      const invalidDealership = {
        brandApprovalReference: 'invalid-code',
        showroomReadiness: 'Unknown State',
      };
      const resInvalid = validateCustomFieldValues(dealershipFields, invalidDealership);
      expect(resInvalid.isValid).toBe(false);
      expect(resInvalid.errors.brandApprovalReference).toContain('format is invalid');
      expect(resInvalid.errors.showroomReadiness).toContain('must be one of');
    });

    it('handles Education industry metadata: accreditation deadline, department, classroom readiness', () => {
      const educationFields: FieldDefinitionDto[] = [
        {
          id: 'cf-edu-1',
          targetType: 'project',
          fieldKey: 'accreditationDeadline',
          label: 'Accreditation Deadline',
          type: 'date',
          required: true,
          isActive: true,
          version: 1,
        },
        {
          id: 'cf-edu-2',
          targetType: 'task',
          fieldKey: 'department',
          label: 'Academic Department',
          type: 'select',
          required: true,
          choices: ['Computer Science', 'Biomedical Engineering', 'Humanities', 'Business Administration'],
          isActive: true,
          version: 1,
        },
        {
          id: 'cf-edu-3',
          targetType: 'task',
          fieldKey: 'classroomReadiness',
          label: 'Classroom & Lab Readiness Signoff',
          type: 'boolean',
          required: true,
          isActive: true,
          version: 1,
        },
      ];

      const validEdu = {
        accreditationDeadline: '2028-06-30',
        department: 'Computer Science',
        classroomReadiness: true,
      };
      const resValid = validateCustomFieldValues(educationFields, validEdu);
      expect(resValid.isValid).toBe(true);
      expect(resValid.sanitizedValues.classroomReadiness).toBe(true);

      const invalidEdu = {
        department: 'Aerospace',
      };
      const resInvalid = validateCustomFieldValues(educationFields, invalidEdu);
      expect(resInvalid.isValid).toBe(false);
      expect(resInvalid.errors.accreditationDeadline).toContain('is required');
      expect(resInvalid.errors.department).toContain('must be one of');
    });
  });

  describe('Conditional Visibility Rules & Safe Evaluation', () => {
    it('dynamically hides fields and bypasses validation when condition is not satisfied', () => {
      const conditionalFields: FieldDefinitionDto[] = [
        {
          id: 'f1',
          fieldKey: 'isSubcontracted',
          label: 'Is Subcontracted?',
          type: 'boolean',
          required: true,
          isActive: true,
          version: 1,
        },
        {
          id: 'f2',
          fieldKey: 'subcontractorLicense',
          label: 'Subcontractor License #',
          type: 'text',
          required: true, // Only required when isSubcontracted is true
          visibilityRules: {
            dependsOnField: 'isSubcontracted',
            operator: 'equals',
            value: true,
          },
          isActive: true,
          version: 1,
        },
      ];

      // When isSubcontracted is false, subcontractorLicense is hidden
      expect(isFieldVisible(conditionalFields[1], { isSubcontracted: false })).toBe(false);

      // Validation should succeed even though subcontractorLicense is required, because it is hidden
      const resWhenFalse = validateCustomFieldValues(conditionalFields, { isSubcontracted: false });
      expect(resWhenFalse.isValid).toBe(true);

      // When isSubcontracted is true, subcontractorLicense becomes visible and required
      expect(isFieldVisible(conditionalFields[1], { isSubcontracted: true })).toBe(true);
      const resWhenTrueMissing = validateCustomFieldValues(conditionalFields, { isSubcontracted: true });
      expect(resWhenTrueMissing.isValid).toBe(false);
      expect(resWhenTrueMissing.errors.subcontractorLicense).toContain('is required');
    });

    it('safely handles operators (contains, greater_than, is_empty) without eval', () => {
      const fieldWithContains: FieldDefinitionDto = {
        id: 'fc',
        fieldKey: 'expeditedHandlingReason',
        label: 'Expedite Reason',
        type: 'text',
        visibilityRules: {
          dependsOnField: 'tags',
          operator: 'contains',
          value: 'URGENT',
        },
        isActive: true,
        version: 1,
      };

      expect(isFieldVisible(fieldWithContains, { tags: ['STANDARD', 'URGENT'] })).toBe(true);
      expect(isFieldVisible(fieldWithContains, { tags: ['STANDARD'] })).toBe(false);
    });
  });

  describe('Role-Based Editing Guards', () => {
    it('restricts editable fields to authorized roles', () => {
      const restrictedField: FieldDefinitionDto = {
        id: 'fr',
        fieldKey: 'financialAuditSignoff',
        label: 'Audit Signoff',
        type: 'text',
        editableRoles: ['ADMIN', 'MANAGER'],
        isActive: true,
        version: 1,
      };

      expect(isFieldEditable(restrictedField, 'ADMIN')).toBe(true);
      expect(isFieldEditable(restrictedField, 'MANAGER')).toBe(true);
      expect(isFieldEditable(restrictedField, 'MEMBER')).toBe(false);
      expect(isFieldEditable(restrictedField, 'OBSERVER')).toBe(false);

      // Unrestricted field allows any role
      const openField: FieldDefinitionDto = {
        id: 'fo',
        fieldKey: 'notes',
        label: 'General Notes',
        type: 'text',
        isActive: true,
        version: 1,
      };
      expect(isFieldEditable(openField, 'MEMBER')).toBe(true);
      expect(isFieldEditable(openField, 'OBSERVER')).toBe(true);
    });
  });

  describe('Field Retirement & Version Compatibility', () => {
    it('allows inactive/retired fields to retain data without blocking validation', () => {
      const fieldList: FieldDefinitionDto[] = [
        {
          id: 'f-active',
          fieldKey: 'activeField',
          label: 'Active Field',
          type: 'text',
          required: true,
          isActive: true,
          version: 2,
        },
        {
          id: 'f-retired',
          fieldKey: 'legacyTaxCode',
          label: 'Retired Tax Code',
          type: 'text',
          required: true, // was required in past versions
          isActive: false, // retired
          version: 1,
        },
      ];

      // Missing the retired field should NOT cause validation failure
      const currentRecord = { activeField: 'Valid data' };
      const validation = validateCustomFieldValues(fieldList, currentRecord);
      expect(validation.isValid).toBe(true);

      // Existing retired data is preserved in sanitized values
      const recordWithOldData = { activeField: 'Valid data', legacyTaxCode: 'TAX-1999' };
      const valPreserved = validateCustomFieldValues(fieldList, recordWithOldData);
      expect(valPreserved.isValid).toBe(true);
      expect(valPreserved.sanitizedValues.legacyTaxCode).toBe('TAX-1999');
    });
  });
});
