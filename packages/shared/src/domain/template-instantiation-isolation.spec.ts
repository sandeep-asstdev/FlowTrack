import { describe, it, expect } from 'vitest';
import {
  projectSettingsSchema,
  createTemplateSchema,
  calculateGroupRollup,
  validateStatusTransition,
} from '../index.js';

describe('Chunk 2 Acceptance Criteria: Independent Project Customization & Data Isolation', () => {
  // Definition A: Automobile Showroom Construction Blueprint
  const automobileTemplate = createTemplateSchema.parse({
    name: 'New Automobile Showroom Construction',
    category: 'Automotive & Dealerships',
    industry: 'automotive_dealerships',
    methodology: 'stage_gate',
    icon: 'Car',
    tags: ['automotive', 'showroom'],
    defaultSettings: {
      industry: 'automotive_dealerships',
      methodology: 'stage_gate',
      currency: { code: 'USD', symbol: '$' },
    },
    graphJson: {
      nodes: [
        {
          key: 'site_selection',
          title: '1. OEM Site Inspection & LOI',
          nodeTypeKey: 'stage',
          weight: 2,
          progressPct: 0,
          subtasks: [
            { title: 'Highway Frontage Survey', nodeTypeKey: 'task', weight: 1, progressPct: 0 },
            { title: 'OEM Territory Signoff', nodeTypeKey: 'task', weight: 1, progressPct: 0 },
          ],
        },
        {
          key: 'workshop_tooling',
          title: '2. Workshop Service Bays Rigging',
          nodeTypeKey: 'stage',
          weight: 3,
          progressPct: 0,
        },
      ],
      edges: [{ sourceIndex: 0, targetIndex: 1, kind: 'sequence' }],
    },
  });

  // Definition B: Residential Real-Estate Development Blueprint
  const realEstateTemplate = createTemplateSchema.parse({
    name: 'Residential Real-Estate Development',
    category: 'Construction & Real Estate',
    industry: 'construction_real_estate',
    methodology: 'stage_gate',
    icon: 'Building2',
    tags: ['real-estate', 'construction'],
    defaultSettings: {
      industry: 'construction_real_estate',
      methodology: 'stage_gate',
      currency: { code: 'INR', symbol: '₹' },
    },
    graphJson: {
      nodes: [
        {
          key: 'land_sanction',
          title: '1. Town Planning & Environmental NOC',
          nodeTypeKey: 'stage',
          weight: 2.5,
          progressPct: 0,
        },
        {
          key: 'civil_foundation',
          title: '2. Excavation & Raft Foundation',
          nodeTypeKey: 'stage',
          weight: 4,
          progressPct: 0,
        },
      ],
      edges: [{ sourceIndex: 0, targetIndex: 1, kind: 'sequence' }],
    },
  });

  it('instantiates two projects from different templates with completely isolated state', () => {
    // Instantiate Project 1 (Automotive Showroom in Texas)
    const project1 = {
      id: 'proj-auto-texas',
      name: 'Austin Lexus Dealership Launch',
      settings: projectSettingsSchema.parse({
        ...automobileTemplate.defaultSettings,
        currency: { code: 'USD', symbol: '$' },
      }),
      nodes: [
        {
          id: 'n-auto-1',
          title: '1. OEM Site Inspection & LOI',
          progressPct: 0,
          weight: 2,
          parentNodeId: null,
          customData: { bayCount: 12 },
        },
        {
          id: 'n-auto-sub-1',
          title: 'Highway Frontage Survey',
          progressPct: 0,
          weight: 1,
          parentNodeId: 'n-auto-1',
        },
        {
          id: 'n-auto-sub-2',
          title: 'OEM Territory Signoff',
          progressPct: 0,
          weight: 1,
          parentNodeId: 'n-auto-1',
        },
      ],
    };

    // Instantiate Project 2 (Residential Real Estate in Bangalore)
    const project2 = {
      id: 'proj-re-bangalore',
      name: 'Sobha Green Acres 50-Acre Phase 1',
      settings: projectSettingsSchema.parse({
        ...realEstateTemplate.defaultSettings,
        currency: { code: 'INR', symbol: '₹' },
      }),
      nodes: [
        {
          id: 'n-re-1',
          title: '1. Town Planning & Environmental NOC',
          progressPct: 0,
          weight: 2.5,
          parentNodeId: null,
          customData: { sanctionedUnits: 450 },
        },
        {
          id: 'n-re-2',
          title: '2. Excavation & Raft Foundation',
          progressPct: 0,
          weight: 4,
          parentNodeId: null,
        },
      ],
    };

    // Verify initial settings and currency independence
    expect(project1.settings.currency.symbol).toBe('$');
    expect(project1.settings.industry).toBe('automotive_dealerships');

    expect(project2.settings.currency.symbol).toBe('₹');
    expect(project2.settings.industry).toBe('construction_real_estate');

    // 1. Customize Project 1: Advance Subtasks and verify rollup progress calculation
    project1.nodes[1].progressPct = 100; // Highway survey completed
    project1.nodes[2].progressPct = 50;  // Territory signoff in review
    project1.nodes[0].customData.bayCount = 16; // Add more service bays

    // Rollup calculation for Project 1 subtasks:
    const p1Subtasks = [
      { id: 'sub-1', progressPct: project1.nodes[1].progressPct, weight: 1, statusCategory: 'done' },
      { id: 'sub-2', progressPct: project1.nodes[2].progressPct, weight: 1, statusCategory: 'active' },
    ];
    const p1Rollup = calculateGroupRollup(p1Subtasks);

    // Root node 1 has 2 subtasks of weight 1: (100*1 + 50*1) / 2 = 75%
    expect(p1Rollup.progressPct).toBe(75);
    expect(p1Rollup.openCount).toBe(1);
    expect(p1Rollup.doneCount).toBe(1);
    expect(project1.nodes[0].customData.bayCount).toBe(16);

    // 2. Verify Project 2 was NOT mutated or affected in any way
    expect(project2.nodes[0].progressPct).toBe(0);
    expect(project2.nodes[0].customData.sanctionedUnits).toBe(450);
    expect(project2.settings.currency.code).toBe('INR');

    // 3. Customize Project 2: Add custom fields and advance status independently
    project2.nodes[0].progressPct = 100;
    project2.nodes[1].progressPct = 30;

    const p2Tasks = [
      { id: 'p2-1', progressPct: project2.nodes[0].progressPct, weight: 2.5, statusCategory: 'done' },
      { id: 'p2-2', progressPct: project2.nodes[1].progressPct, weight: 4.0, statusCategory: 'active' },
    ];
    const p2Rollup = calculateGroupRollup(p2Tasks);

    // Weighted average: (100 * 2.5 + 30 * 4) / (2.5 + 4) = (250 + 120) / 6.5 = 56.9% -> 57%
    expect(p2Rollup.progressPct).toBe(57);
    expect(p2Rollup.openCount).toBe(1);
    expect(p2Rollup.doneCount).toBe(1);

    // Project 1 remains unaffected at 75%
    expect(p1Rollup.progressPct).toBe(75);

    // 4. Verify workflow rule engine operates universally across both project structures
    const validTransition = validateStatusTransition({
      fromCategory: 'not_started',
      toCategory: 'active',
    });
    const unapprovedGateTransition = validateStatusTransition({
      fromCategory: 'active',
      toCategory: 'done',
      isApprovalGate: true,
      approvalStatus: 'pending',
    });
    const blockedStageTransition = validateStatusTransition({
      fromCategory: 'active',
      toCategory: 'done',
      uncompletedChildrenCount: 3,
    });

    expect(validTransition.canTransition).toBe(true);
    expect(unapprovedGateTransition.canTransition).toBe(false);
    expect(blockedStageTransition.canTransition).toBe(false);
  });
});
