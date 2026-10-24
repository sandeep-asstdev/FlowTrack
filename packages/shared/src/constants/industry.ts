export const UNIVERSAL_INDUSTRIES = [
  'construction_real_estate',
  'automotive_dealerships',
  'education_academics',
  'manufacturing_industrial',
  'healthcare_hospital',
  'retail_hospitality',
  'marketing_events',
  'government_nonprofit',
  'it_software',
  'general',
] as const;

export type UniversalIndustry = typeof UNIVERSAL_INDUSTRIES[number];

export const PROJECT_METHODOLOGIES = [
  'stage_gate',
  'agile_sprint',
  'linear_milestone',
  'process_pipeline',
  'hybrid',
] as const;

export type ProjectMethodology = typeof PROJECT_METHODOLOGIES[number];

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
}

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
];

export const DATE_FORMATS = [
  'YYYY-MM-DD',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'DD-MM-YYYY',
] as const;

export type DateFormat = typeof DATE_FORMATS[number];

export interface IndustryTerminology {
  stage: string;
  task: string;
  subtask: string;
  milestone: string;
  owner: string;
  approver: string;
}

export const DEFAULT_INDUSTRY_TERMINOLOGY: Record<UniversalIndustry, IndustryTerminology> = {
  construction_real_estate: {
    stage: 'Phase / Work Package',
    task: 'Construction Task',
    subtask: 'Punch List / Checklist',
    milestone: 'Key Handover Milestone',
    owner: 'Site Engineer / Contractor',
    approver: 'Project Manager / Architect',
  },
  automotive_dealerships: {
    stage: 'Launch Workstream',
    task: 'Setup Activity',
    subtask: 'Audit Checklist',
    milestone: 'OEM Compliance Gate',
    owner: 'Dealer Department Head',
    approver: 'General Manager / OEM Lead',
  },
  education_academics: {
    stage: 'Academic Phase',
    task: 'Curricular / Admin Task',
    subtask: 'Verification Item',
    milestone: 'Accreditation Milestone',
    owner: 'Faculty Lead / Coordinator',
    approver: 'Dean / Academic Director',
  },
  manufacturing_industrial: {
    stage: 'Production Stage',
    task: 'Operation / SOP Task',
    subtask: 'Quality Inspection',
    milestone: 'Factory Acceptance Gate',
    owner: 'Line Supervisor',
    approver: 'Plant Head / Quality QA',
  },
  healthcare_hospital: {
    stage: 'Clinical / Setup Phase',
    task: 'Compliance Task',
    subtask: 'Triage / Protocol Item',
    milestone: 'NABH / Regulatory Gate',
    owner: 'Medical Lead / Dept Head',
    approver: 'Medical Superintendent',
  },
  retail_hospitality: {
    stage: 'Store Launch Stage',
    task: 'Store Fit-out Task',
    subtask: 'Merchandising Checklist',
    milestone: 'Trial Operations Gate',
    owner: 'Store Manager',
    approver: 'Retail Operations Head',
  },
  marketing_events: {
    stage: 'Campaign Phase',
    task: 'Deliverable / Creative',
    subtask: 'Review Point',
    milestone: 'Go-Live / Event Date',
    owner: 'Creative / Campaign Lead',
    approver: 'Marketing Director',
  },
  government_nonprofit: {
    stage: 'Programme Phase',
    task: 'Scheme Initiative',
    subtask: 'Beneficiary Metric',
    milestone: 'Sanction / Audit Milestone',
    owner: 'Nodal Officer / Project Lead',
    approver: 'Steering Committee / Trustee',
  },
  it_software: {
    stage: 'Sprint / Epic',
    task: 'Story / Feature',
    subtask: 'Acceptance Criteria',
    milestone: 'Release Milestone',
    owner: 'Engineer / Tech Lead',
    approver: 'Product Owner / Lead QA',
  },
  general: {
    stage: 'Stage',
    task: 'Task',
    subtask: 'Subtask',
    milestone: 'Milestone',
    owner: 'Assignee',
    approver: 'Manager',
  },
};
