import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      appName: 'FlowTrack',
      tagline: 'Canvas Project Management',
      projects: 'Projects',
      newProject: 'New Project',
      fromTemplate: 'From Template',
      overview: 'Overview',
      allProjects: 'All Projects',
      inProgress: 'In Progress',
      completed: 'Completed',
      waiting: 'Waiting',
      overdue: 'Overdue',
      nodes: 'Nodes',
      edges: 'Edges',
      openCanvas: 'Open Canvas',
      outlineView: 'Outline View',
      simpleMode: 'Simple Mode',
      tidyUp: 'Tidy Up',
      doubleClickHint: 'Double-click anywhere to add a node',
      login: 'Sign In',
      signup: 'Sign Up',
      logout: 'Sign Out',
      email: 'Email',
      password: 'Password',
      fullName: 'Full Name',
      phone: 'Phone Number',
      otpHint: 'Development Mock OTP: 123456',
      workspace: 'Workspace',
      switchWorkspace: 'Switch Workspace',
      createWorkspace: 'Create Workspace',
      searchProjects: 'Search projects...',

      // Intelligence, Reports & Budgeting
      intelligenceReports: 'Intelligence & Reports',
      reportsDossier: 'Executive Audit Dossier',
      milestoneRoadmap: 'Milestone Roadmap',
      budgetAndFinancials: 'Budget & Financials',
      approvedBudget: 'Approved Budget',
      actualExpenditure: 'Actual Spend',
      forecastFinalCost: 'Forecast Final Cost',
      budgetVariance: 'Budget Variance',
      contingencyReserve: 'Contingency Reserve',
      physicalProgress: 'Physical Work Progress',
      financialSpentRatio: 'Budget Spent Ratio',
      teamWorkload: 'Team Workload',
      overdueAndBlocked: 'Overdue & Blocked Work',
      pendingApprovals: 'Pending Approvals',
      exportCsv: 'Export CSV',
      printDossier: 'Print Dossier',
      notSpecified: 'Not specified',
      estimate: 'Estimate',
      favorable: 'Favorable',
      unfavorable: 'Unfavorable',

      // Custom fields, files, notifications & security
      customFields: 'Custom Fields',
      evidenceDocuments: 'Evidence & Documents',
      notifications: 'Notifications',
      auditHistory: 'Audit History',
      activityTimeline: 'Activity Timeline',
      markAllRead: 'Mark all as read',
      approvalDecision: 'Approval Decision',
      approve: 'Approve',
      reject: 'Reject',
      requestRework: 'Request Rework',
      reportBlocker: 'Report Blocker',
      requestExtension: 'Request Extension',
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
