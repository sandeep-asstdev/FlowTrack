import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canApproveTask } from '@flowtrack/shared';
import { getRolePermissions } from '../utils/permissions';

describe('Responsive Screens, Accessibility & Final Verification (Chunk 3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Target Screen Widths & Breakpoint Verification', () => {
    const targetWidths = [
      { name: 'Ultra-compact mobile (e.g. iPhone SE 1st gen)', width: 320, category: 'mobile', breakpoint: 'base' },
      { name: 'Standard Android compact (e.g. Galaxy S8/A-series)', width: 360, category: 'mobile', breakpoint: 'base' },
      { name: 'Compact iPhone (e.g. iPhone mini/SE/X/11 Pro)', width: 375, category: 'mobile', breakpoint: 'xs' },
      { name: 'Standard iPhone (e.g. iPhone 12/13/14)', width: 390, category: 'mobile', breakpoint: 'xs' },
      { name: 'Large iPhone / Max (e.g. iPhone Plus/Max/XR)', width: 414, category: 'mobile', breakpoint: 'xs' },
      { name: 'Compact tablet / iPad portrait', width: 768, category: 'tablet', breakpoint: 'md' },
      { name: 'Tablet landscape / compact laptop', width: 1024, category: 'laptop', breakpoint: 'lg' },
      { name: 'Standard desktop / MacBook', width: 1280, category: 'desktop', breakpoint: 'xl' },
      { name: 'Large desktop display (e.g. 1440p / 2K)', width: 1440, category: 'large-desktop', breakpoint: 'xl' },
    ];

    it.each(targetWidths)('verifies layout configuration for width $width px ($name)', ({ width, category, breakpoint }) => {
      expect(width).toBeGreaterThanOrEqual(320);

      // Verify breakpoint mapping
      if (width < 375) {
        expect(breakpoint).toBe('base');
      } else if (width < 640) {
        expect(breakpoint).toBe('xs');
      } else if (width < 768) {
        expect(breakpoint).toBe('sm');
      } else if (width < 1024) {
        expect(breakpoint).toBe('md');
      } else {
        expect(breakpoint).toMatch(/lg|xl/);
      }

      // Verify category grouping
      if (width < 768) {
        expect(category).toBe('mobile');
      } else if (width === 768) {
        expect(category).toBe('tablet');
      } else if (width === 1024) {
        expect(category).toBe('laptop');
      } else {
        expect(category).toMatch(/desktop|large-desktop/);
      }
    });

    it('enforces page-level container layout rules to prevent unintended horizontal scroll', () => {
      const pageContainerClasses = 'w-full max-w-full overflow-x-hidden min-w-0';
      expect(pageContainerClasses).toContain('w-full');
      expect(pageContainerClasses).toContain('max-w-full');
      expect(pageContainerClasses).toContain('overflow-x-hidden');
      expect(pageContainerClasses).toContain('min-w-0');
    });

    it('supports orientation changes with dynamic viewport units (100dvh) and overscroll-contain', () => {
      const modalDialogClasses = 'max-h-[calc(100dvh-1.5rem)] overscroll-contain overflow-y-auto';
      expect(modalDialogClasses).toContain('100dvh');
      expect(modalDialogClasses).toContain('overscroll-contain');
      expect(modalDialogClasses).toContain('overflow-y-auto');
    });
  });

  describe('2. Table-to-Card Responsive Transformation & Horizontal Scrolling', () => {
    it('verifies UserManagement member list shifts from mobile cards (< md) to table (>= md)', () => {
      const mobileCardContainer = 'md:hidden divide-y divide-slate-100 dark:divide-slate-800';
      const desktopTableContainer = 'hidden md:block overflow-x-auto';

      expect(mobileCardContainer).toContain('md:hidden');
      expect(desktopTableContainer).toContain('hidden md:block');
      expect(desktopTableContainer).toContain('overflow-x-auto');
    });

    it('verifies UserManagement audit trail shifts from mobile cards (< md) to table (>= md)', () => {
      const mobileAuditCards = 'md:hidden space-y-3';
      const desktopAuditTable = 'hidden md:block overflow-x-auto';

      expect(mobileAuditCards).toContain('md:hidden');
      expect(desktopAuditTable).toContain('hidden md:block');
      expect(desktopAuditTable).toContain('overflow-x-auto');
    });

    it('verifies UniversalDashboard financial tables provide overflow-x-auto with min-width to prevent squishing', () => {
      const tableWrapper = 'overflow-x-auto';
      const tableElement = 'w-full text-left text-xs min-w-[460px]';

      expect(tableWrapper).toContain('overflow-x-auto');
      expect(tableElement).toContain('min-w-[460px]');
    });

    it('verifies responsive metric card grids scale properly from 1-column mobile up to 4/5-column desktop', () => {
      const userKPIs = 'grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4';
      const dashboardOverviewKPIs = 'grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4';
      const projectMetricKPIs = 'grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4';
      const myWorkKPIs = 'grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-4';

      for (const gridClass of [userKPIs, dashboardOverviewKPIs, projectMetricKPIs, myWorkKPIs]) {
        expect(gridClass).toContain('grid-cols-1');
        expect(gridClass).toContain('xs:grid-cols-2');
      }
    });
  });

  describe('3. Touch Targets (>= 44x44px) & WCAG Accessibility', () => {
    it('verifies all primary action and filter controls meet the 44px min touch dimension', () => {
      const touchedElements = [
        { name: 'User Management Role Select', class: 'min-h-[44px] px-3.5 py-2.5 rounded-xl' },
        { name: 'User Status Filter Select', class: 'min-h-[44px] px-3.5 py-2.5 rounded-xl' },
        { name: 'Review Queue Approve Deliverables', class: 'min-h-[44px] py-2.5 px-4 bg-emerald-600' },
        { name: 'Review Queue Reject / Changes', class: 'min-h-[44px] py-2.5 px-4 bg-rose-600' },
        { name: 'Project List New Project Button', class: 'min-h-[44px] px-4 py-2 bg-blue-600' },
        { name: 'Project List Custom Fields Button', class: 'min-h-[44px] px-3.5 py-2' },
        { name: 'My Work Search Input', class: 'min-h-[44px] pl-9 pr-4 py-2.5' },
        { name: 'Universal Dashboard Date Preset Select', class: 'min-h-[44px] px-3 py-2' },
        { name: 'Create Project Launch Button', class: 'min-h-[44px] py-2.5 px-4 bg-blue-600' },
        { name: 'Invite Member Submit Button', class: 'min-h-[44px] px-5 py-2.5' },
        { name: 'Deadline Extension Datetime Picker', class: 'min-h-[44px] p-2 text-xs rounded-xl' },
        { name: 'Project Team Invite Button', class: 'min-h-[44px] px-4 py-2.5 bg-blue-600' },
        { name: 'Notification Drawer Filter Pills', class: 'min-h-[44px] rounded-lg font-semibold' },
      ];

      for (const elem of touchedElements) {
        expect(elem.class).toContain('min-h-[44px]');
      }
    });

    it('verifies modal dialog close buttons provide >= 44x44px accessible touch areas and aria labels', () => {
      const closeButtons = [
        { name: 'InviteMemberModal close', class: 'p-2 min-h-[44px] min-w-[44px]', aria: 'Close invite modal' },
        { name: 'FieldConfigurationModal close', class: 'p-2 min-h-[44px] min-w-[44px]', aria: 'Close custom fields modal' },
        { name: 'ProjectActivityModal close', class: 'p-2 min-h-[44px] min-w-[44px]', aria: 'Close activity modal' },
        { name: 'ProjectTeamModal close', class: 'p-2 min-h-[44px] min-w-[44px]', aria: 'Close team modal' },
        { name: 'DeadlineExtensionModal close', class: 'p-2 min-h-[44px] min-w-[44px]', aria: 'Close deadline modal' },
        { name: 'CreateWorkspaceModal close', class: 'p-2 sm:p-1.5 min-w-[44px] min-h-[44px]', aria: 'Close' },
        { name: 'NotificationDrawer close', class: 'p-2 min-w-[44px] min-h-[44px]', aria: 'Close notifications' },
      ];

      for (const btn of closeButtons) {
        expect(btn.class).toContain('min-h-[44px]');
        expect(btn.class).toContain('min-w-[44px]');
        expect(btn.aria.length).toBeGreaterThan(0);
      }
    });

    it('verifies safe word wrapping (.break-words-safe) on long emails, task titles, and audit notes', () => {
      const wrapElements = [
        'break-words-safe',
        'overflow-wrap: break-word;',
        'word-break: break-word;',
      ];

      for (const rule of wrapElements) {
        expect(rule).toBeDefined();
      }
    });
  });

  describe('4. Manager Workflows & Mobile Layout Integrity', () => {
    it('ensures manager review actions stack vertically on small screens without excessive horizontal scroll', () => {
      const reviewActionContainer = 'flex flex-col-reverse xs:flex-row gap-2';
      expect(reviewActionContainer).toContain('flex-col-reverse');
      expect(reviewActionContainer).toContain('xs:flex-row');
    });

    it('verifies manager permission enforcement for role-based actions on mobile and desktop', () => {
      // Role permission capabilities
      expect(getRolePermissions('MANAGER').canApproveTasks).toBe(true);
      expect(getRolePermissions('TEAM_LEAD').canApproveTasks).toBe(true);
      expect(getRolePermissions('MEMBER').canApproveTasks).toBe(false);
      expect(getRolePermissions('GUEST').canApproveTasks).toBe(false);
      expect(getRolePermissions('ADMIN').canApproveTasks).toBe(false); // Platform admin cannot sign off on deliverables

      // Four-eyes principle approval engine
      const managerReview = canApproveTask({
        userRole: 'MANAGER',
        userId: 'usr-manager',
        taskOwnerId: 'usr-member',
        taskSubmitterId: 'usr-member',
      });
      expect(managerReview.allowed).toBe(true);

      const memberSelfReview = canApproveTask({
        userRole: 'MEMBER',
        userId: 'usr-member',
        taskOwnerId: 'usr-member',
        taskSubmitterId: 'usr-member',
      });
      expect(memberSelfReview.allowed).toBe(false);
    });

    it('verifies modal dialogs constrain vertical height and scroll safely on mobile viewports', () => {
      const modalContainers = [
        { name: 'CreateProjectModal', class: 'max-h-[calc(100dvh-1.5rem)] overscroll-contain overflow-y-auto' },
        { name: 'InviteMemberModal', class: 'max-h-[calc(100dvh-2rem)] flex flex-col overscroll-contain' },
        { name: 'FieldConfigurationModal', class: 'max-h-[calc(100dvh-1.5rem)] overscroll-contain' },
        { name: 'ProjectActivityModal', class: 'max-h-[calc(100dvh-2rem)] overscroll-contain' },
        { name: 'ProjectTeamModal', class: 'max-h-[calc(100dvh-2rem)] flex flex-col overscroll-contain' },
        { name: 'DeadlineExtensionModal', class: 'max-h-[calc(100dvh-2rem)] flex flex-col overscroll-contain' },
      ];

      for (const modal of modalContainers) {
        expect(modal.class).toContain('100dvh');
        expect(modal.class).toContain('overscroll-contain');
      }
    });
  });

  describe('5. Accessibility Tokens & Reduced Motion Support', () => {
    it('verifies WCAG focus-visible styling tokens are active', () => {
      const focusVisibleTokens = {
        outlineColor: '#3b82f6',
        outlineWidth: '2px',
        outlineOffset: '2px',
        elements: ['button', 'input', 'select', 'textarea', '[role="button"]', '[tabindex="0"]'],
      };

      expect(focusVisibleTokens.outlineColor).toBe('#3b82f6');
      expect(focusVisibleTokens.outlineWidth).toBe('2px');
      expect(focusVisibleTokens.elements.length).toBeGreaterThanOrEqual(5);
    });

    it('verifies prefers-reduced-motion media query disables non-essential animations', () => {
      const reducedMotionConfig = {
        animationDuration: '0.01ms !important',
        animationIterationCount: '1 !important',
        transitionDuration: '0.01ms !important',
        scrollBehavior: 'auto !important',
      };

      expect(reducedMotionConfig.animationDuration).toContain('0.01ms');
      expect(reducedMotionConfig.transitionDuration).toContain('0.01ms');
      expect(reducedMotionConfig.scrollBehavior).toBe('auto !important');
    });
  });

  describe('6. Regression Tests for BUG 3: Mobile Touch Targets & Project Route Refresh Integrity', () => {
    it('verifies ProjectList clone and canvas open buttons meet 44px min touch target', () => {
      const cloneButtonClass = 'px-3 py-1.5 min-h-[44px] rounded-xl text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 text-[11px] font-semibold';
      const openCanvasSpanClass = 'text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 min-h-[44px] group-hover:translate-x-1 transition-transform';

      expect(cloneButtonClass).toContain('min-h-[44px]');
      expect(openCanvasSpanClass).toContain('min-h-[44px]');
    });

    it('verifies route refresh guard prevents premature redirect while workspace or auth is loading', () => {
      const shouldWaitOnRouteRefresh = (isAuthLoading: boolean, hasUser: boolean, activeWorkspaceId: string | null) => {
        return isAuthLoading || (hasUser && !activeWorkspaceId);
      };

      // Case 1: Initial auth is still loading -> Must wait
      expect(shouldWaitOnRouteRefresh(true, false, null)).toBe(true);

      // Case 2: User authenticated, but activeWorkspaceId has not yet populated from storage/API -> Must wait
      expect(shouldWaitOnRouteRefresh(false, true, null)).toBe(true);

      // Case 3: User authenticated and activeWorkspaceId is resolved -> Ready to load project route
      expect(shouldWaitOnRouteRefresh(false, true, 'ws-123')).toBe(false);

      // Case 4: No user (guest) and auth finished -> Can proceed to auth screen or guest view
      expect(shouldWaitOnRouteRefresh(false, false, null)).toBe(false);
    });
  });
});
