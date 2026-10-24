import { describe, it, expect } from 'vitest';
import {
  projectSettingsSchema,
  createTemplateSchema,
  instantiateTemplateSchema,
} from '../index.js';
import {
  UNIVERSAL_INDUSTRIES,
  DEFAULT_INDUSTRY_TERMINOLOGY,
  SUPPORTED_CURRENCIES,
} from '../constants/industry.js';

describe('Universal Project Settings Schema', () => {
  it('applies comprehensive universal defaults when given empty input', () => {
    const settings = projectSettingsSchema.parse({});
    expect(settings.industry).toBe('general');
    expect(settings.methodology).toBe('stage_gate');
    expect(settings.currency.code).toBe('USD');
    expect(settings.currency.symbol).toBe('$');
    expect(settings.dateFormat).toBe('YYYY-MM-DD');
    expect(settings.features.budgetTracking).toBe(true);
    expect(settings.features.approvals).toBe(true);
    expect(settings.terminology.task).toBe('Task');
  });

  it('accepts and preserves industry-specific configuration and custom terminology', () => {
    const constructionTerminology = DEFAULT_INDUSTRY_TERMINOLOGY.construction_real_estate;
    const settings = projectSettingsSchema.parse({
      industry: 'construction_real_estate',
      methodology: 'stage_gate',
      currency: { code: 'INR', symbol: '₹' },
      dateFormat: 'DD/MM/YYYY',
      terminology: constructionTerminology,
    });

    expect(settings.industry).toBe('construction_real_estate');
    expect(settings.currency.symbol).toBe('₹');
    expect(settings.terminology.task).toBe('Construction Task');
    expect(settings.terminology.owner).toBe('Site Engineer / Contractor');
  });

  it('validates all supported universal industries', () => {
    for (const ind of UNIVERSAL_INDUSTRIES) {
      const parsed = projectSettingsSchema.parse({ industry: ind });
      expect(parsed.industry).toBe(ind);
    }
  });
});

describe('Universal Template Schema', () => {
  it('validates a complete industry template graph', () => {
    const validTemplate = {
      name: 'Automobile Dealership Launch',
      description: 'End-to-end dealership launch workflow',
      category: 'Automobile & Showrooms',
      industry: 'automotive_dealerships',
      methodology: 'stage_gate',
      icon: 'Car',
      tags: ['dealership', 'automotive', 'showroom'],
      isPublic: true,
      defaultSettings: {
        industry: 'automotive_dealerships',
        methodology: 'stage_gate',
        currency: { code: 'USD', symbol: '$' },
      },
      graphJson: {
        nodes: [
          {
            key: 'site_selection',
            title: '1. Site Selection & Feasibility',
            description: 'Evaluate prime commercial highway frontage',
            nodeTypeKey: 'stage',
            positionX: 100,
            positionY: 200,
            weight: 2.0,
            priority: 'HIGH',
          },
          {
            key: 'oem_signoff',
            title: '2. OEM Brand Architecture Approval',
            description: 'Corporate identity standards audit',
            nodeTypeKey: 'approval',
            positionX: 450,
            positionY: 200,
            weight: 1.5,
            priority: 'URGENT',
          },
        ],
        edges: [
          {
            sourceIndex: 0,
            targetIndex: 1,
            kind: 'sequence',
            label: 'Requires Feasibility',
          },
        ],
      },
    };

    const parsed = createTemplateSchema.parse(validTemplate);
    expect(parsed.name).toBe('Automobile Dealership Launch');
    expect(parsed.graphJson.nodes).toHaveLength(2);
    expect(parsed.graphJson.edges).toHaveLength(1);
    expect(parsed.graphJson.edges[0].sourceIndex).toBe(0);
    expect(parsed.graphJson.edges[0].targetIndex).toBe(1);
  });

  it('validates instantiate template payload', () => {
    const payload = {
      projectName: 'Metro Hyundai 3S Dealership',
      projectDescription: 'New 3S dealership setup in Bengaluru',
      targetDate: '2027-06-30T00:00:00.000Z',
      customSettings: {
        currency: { code: 'INR', symbol: '₹' },
        dateFormat: 'DD/MM/YYYY',
      },
    };

    const parsed = instantiateTemplateSchema.parse(payload);
    expect(parsed.projectName).toBe('Metro Hyundai 3S Dealership');
    expect(parsed.customSettings?.currency?.symbol).toBe('₹');
  });

  it('rejects invalid template with empty title in node', () => {
    const invalidTemplate = {
      name: 'Test Template',
      graphJson: {
        nodes: [
          {
            title: '', // Invalid: min(1) required
            nodeTypeKey: 'task',
          },
        ],
      },
    };

    expect(() => createTemplateSchema.parse(invalidTemplate)).toThrow();
  });
});
