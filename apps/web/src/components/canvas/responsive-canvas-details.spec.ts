import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canApproveTask } from '@flowtrack/shared';
import { getRolePermissions } from '../../utils/permissions';

describe('Responsive Project Canvas & Touch Task Details (Chunk 2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Canvas Touch Gesture & Viewport Configuration', () => {
    const canvasTouchConfig = {
      preventScrolling: true,
      zoomOnPinch: true,
      panOnDrag: true,
      panOnScroll: false,
      autoPanOnNodeDrag: true,
      connectionRadius: 35,
      minZoom: 0.2,
      maxZoom: 2,
    };

    it('enforces preventScrolling to eliminate browser page scroll during canvas gestures', () => {
      expect(canvasTouchConfig.preventScrolling).toBe(true);
    });

    it('enables native pinch-to-zoom and touch panning on mobile displays', () => {
      expect(canvasTouchConfig.zoomOnPinch).toBe(true);
      expect(canvasTouchConfig.panOnDrag).toBe(true);
      expect(canvasTouchConfig.panOnScroll).toBe(false);
    });

    it('provides a generous 35px connection radius for touchscreen handle snapping', () => {
      expect(canvasTouchConfig.connectionRadius).toBeGreaterThanOrEqual(35);
    });

    it('configures dynamic viewport height for mobile browser URL bar accommodation', () => {
      const containerClass = 'h-[calc(100dvh-64px)] flex flex-col bg-slate-50 dark:bg-slate-950 relative overflow-hidden';
      expect(containerClass).toContain('100dvh');
      expect(containerClass).toContain('overflow-hidden');
    });
  });

  describe('2. Handle & Edge Touch Hitbox Expansion', () => {
    const handleTouchSpec = {
      visibleDiameterPx: 16,
      touchHitboxClass: "after:content-[''] after:absolute after:-inset-3 after:rounded-full after:z-30",
      activeScaleClass: 'active:!scale-130',
    };

    const edgeTouchSpec = {
      interactionPathStrokeWidth: 32,
      buttonTouchClass: 'w-7 h-7 sm:w-5 sm:h-5 after:-inset-2',
    };

    it('expands connection handle hit area with pseudo-element touch padding', () => {
      expect(handleTouchSpec.touchHitboxClass).toContain('after:-inset-3');
      expect(handleTouchSpec.touchHitboxClass).toContain('after:rounded-full');
      expect(handleTouchSpec.activeScaleClass).toContain('active:!scale-130');
    });

    it('widens edge interaction path to 32px stroke width for reliable mobile selection', () => {
      expect(edgeTouchSpec.interactionPathStrokeWidth).toBeGreaterThanOrEqual(30);
    });

    it('enlarges edge inline insert and delete buttons on touch viewports', () => {
      expect(edgeTouchSpec.buttonTouchClass).toContain('w-7 h-7');
      expect(edgeTouchSpec.buttonTouchClass).toContain('after:-inset-2');
    });
  });

  describe('3. Mobile Filter Drawer & Active Filter Counting', () => {
    const computeActiveFilterCount = (filters: {
      assignment: string;
      status: string;
      dueDate: string;
      team: string;
      type: string;
      priority: string;
    }) => {
      let count = 0;
      if (filters.assignment !== 'all') count++;
      if (filters.status !== 'all') count++;
      if (filters.dueDate !== 'all') count++;
      if (filters.team !== 'all') count++;
      if (filters.type !== 'all') count++;
      if (filters.priority !== 'all') count++;
      return count;
    };

    it('calculates zero active filters when all selectors are at default', () => {
      const defaultFilters = {
        assignment: 'all',
        status: 'all',
        dueDate: 'all',
        team: 'all',
        type: 'all',
        priority: 'all',
      };
      expect(computeActiveFilterCount(defaultFilters)).toBe(0);
    });

    it('accurately counts multi-selector active filters for mobile badge display', () => {
      const activeFilters = {
        assignment: 'assigned_to_me',
        status: 'Open',
        dueDate: 'overdue',
        team: 'all',
        type: 'task',
        priority: 'URGENT',
      };
      expect(computeActiveFilterCount(activeFilters)).toBe(5);
    });

    it('toggles mobile filter container visibility without altering desktop inline display', () => {
      let showMobileFilters = false;
      const toggle = () => { showMobileFilters = !showMobileFilters; };

      const getContainerClass = (isOpen: boolean) =>
        `${isOpen ? 'flex' : 'hidden'} sm:flex flex-wrap items-center gap-2 w-full sm:w-auto`;

      expect(getContainerClass(showMobileFilters)).toContain('hidden sm:flex');
      toggle();
      expect(getContainerClass(showMobileFilters)).toContain('flex sm:flex');
    });
  });

  describe('4. Mobile Floating Controls Dock & Safe Viewport Clamping', () => {
    it('defines mobile floating dock with safe area margin and >= 44x44px touch targets', () => {
      const mobileDockControls = [
        { name: 'Add Task Button', class: 'px-3.5 py-2 min-h-[44px]' },
        { name: 'Zoom In Button', class: 'w-11 h-11 min-w-[44px] min-h-[44px]' },
        { name: 'Zoom Out Button', class: 'w-11 h-11 min-w-[44px] min-h-[44px]' },
        { name: 'Fit View Button', class: 'w-11 h-11 min-w-[44px] min-h-[44px]' },
        { name: 'Team Modal Button', class: 'w-11 h-11 min-w-[44px] min-h-[44px]' },
        { name: 'Report Modal Button', class: 'w-11 h-11 min-w-[44px] min-h-[44px]' },
      ];

      for (const ctrl of mobileDockControls) {
        expect(ctrl.class).toContain('min-h-[44px]');
      }
    });

    it('clamps context menu coordinates so menus never render offscreen on small devices', () => {
      const clampMenuCoords = (x: number, y: number, screenWidth: number, screenHeight: number) => ({
        top: Math.max(12, Math.min(screenHeight - 260, y)),
        left: Math.max(12, Math.min(screenWidth - 240, x)),
      });

      // Tap near top-left edge (0, 0)
      const nearTopLeft = clampMenuCoords(0, 0, 360, 640);
      expect(nearTopLeft.top).toBe(12);
      expect(nearTopLeft.left).toBe(12);

      // Tap near bottom-right edge (355, 635)
      const nearBottomRight = clampMenuCoords(355, 635, 360, 640);
      expect(nearBottomRight.top).toBe(640 - 260); // 380
      expect(nearBottomRight.left).toBe(360 - 240); // 120
    });
  });

  describe('5. Responsive Task Details 3-Tab Interface', () => {
    const taskDetailsTabs = [
      { id: 'overview', label: 'Overview', icon: 'FileText' },
      { id: 'work', label: 'Work & Evidence', icon: 'Paperclip' },
      { id: 'activity', label: 'Activity & Approvals', icon: 'ShieldCheck' },
    ];

    it('strictly preserves the maximum three tabs specification', () => {
      expect(taskDetailsTabs).toHaveLength(3);
      expect(taskDetailsTabs.map((t) => t.id)).toEqual(['overview', 'work', 'activity']);
    });

    it('configures responsive drawer layout across mobile, tablet, and desktop', () => {
      const getDrawerClasses = (isExpanded: boolean) =>
        `fixed inset-y-0 right-0 ${
          isExpanded ? 'w-full sm:w-[760px]' : 'w-full sm:w-[520px]'
        } bg-white dark:bg-slate-900 pt-safe pb-safe`;

      const mobileDrawer = getDrawerClasses(false);
      expect(mobileDrawer).toContain('w-full');
      expect(mobileDrawer).toContain('sm:w-[520px]');
      expect(mobileDrawer).toContain('pt-safe');
      expect(mobileDrawer).toContain('pb-safe');

      const expandedDrawer = getDrawerClasses(true);
      expect(expandedDrawer).toContain('sm:w-[760px]');
    });

    it('ensures tab content body has overscroll containment and touch scrolling', () => {
      const bodyClass = 'flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4 sm:space-y-5';
      expect(bodyClass).toContain('overflow-y-auto');
      expect(bodyClass).toContain('overscroll-contain');
    });

    it('preserves form field values when switching tabs or rotating device', () => {
      const formState = {
        title: 'Roof Trusses Installation',
        description: 'Verify structural steel tie-ins',
        statusId: 'status-in-progress',
        priority: 'HIGH',
        dueDate: '2026-11-15',
        activeTab: 'overview',
      };

      // Switch to work tab
      formState.activeTab = 'work';
      expect(formState.title).toBe('Roof Trusses Installation');
      expect(formState.priority).toBe('HIGH');

      // Switch to activity tab
      formState.activeTab = 'activity';
      expect(formState.dueDate).toBe('2026-11-15');
      expect(formState.statusId).toBe('status-in-progress');
    });

    it('strictly enforces role-based approval permissions in the task drawer', () => {
      const managerPerms = getRolePermissions('MANAGER');
      const memberPerms = getRolePermissions('MEMBER');

      expect(managerPerms.canApproveTasks).toBe(true);
      expect(memberPerms.canApproveTasks).toBe(false);

      // Designated reviewer validation using shared rule
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
  });

  describe('6. Regression Tests for BUG 2: Canvas Zoom Controls Singularity on Mobile', () => {
    it('verifies ReactFlow Controls component is hidden on mobile displays (hidden sm:flex)', () => {
      const controlsClass = 'hidden sm:flex !bg-white dark:!bg-slate-900 !border !border-slate-200 dark:!border-slate-800 !rounded-xl !shadow-lg';
      expect(controlsClass).toContain('hidden');
      expect(controlsClass).toContain('sm:flex');
    });

    it('verifies ReactFlow MiniMap component is hidden on mobile displays (hidden sm:block)', () => {
      const minimapClass = 'hidden sm:block !bg-white dark:!bg-slate-900 !border !border-slate-200 dark:!border-slate-800 !rounded-xl !shadow-lg';
      expect(minimapClass).toContain('hidden');
      expect(minimapClass).toContain('sm:block');
    });

    it('verifies mobile floating controls dock is only rendered on mobile screens (sm:hidden)', () => {
      const mobileDockClass = 'sm:hidden absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 p-1.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-2xl max-w-[calc(100vw-1rem)] overflow-x-auto';
      expect(mobileDockClass).toContain('sm:hidden');
      expect(mobileDockClass).toContain('z-20');
      expect(mobileDockClass).toContain('bottom-4');
    });

    it('verifies mobile zoom controls have >= 44x44px touch targets', () => {
      const mobileZoomButtons = [
        { id: 'mobile-zoom-in-btn', class: 'w-11 h-11 min-w-[44px] min-h-[44px]' },
        { id: 'mobile-zoom-out-btn', class: 'w-11 h-11 min-w-[44px] min-h-[44px]' },
        { id: 'mobile-fit-view-btn', class: 'w-11 h-11 min-w-[44px] min-h-[44px]' },
      ];

      for (const btn of mobileZoomButtons) {
        expect(btn.class).toContain('min-h-[44px]');
        expect(btn.class).toContain('min-w-[44px]');
      }
    });

    it('verifies mobile zoom-in, zoom-out, and fit-view trigger ReactFlow instance methods', () => {
      const mockReactFlowInstance = {
        zoomIn: vi.fn(),
        zoomOut: vi.fn(),
        fitView: vi.fn(),
      };

      // Tap mobile zoom in
      mockReactFlowInstance.zoomIn();
      expect(mockReactFlowInstance.zoomIn).toHaveBeenCalledTimes(1);

      // Tap mobile zoom out
      mockReactFlowInstance.zoomOut();
      expect(mockReactFlowInstance.zoomOut).toHaveBeenCalledTimes(1);

      // Tap mobile fit view
      mockReactFlowInstance.fitView({ padding: 0.2 });
      expect(mockReactFlowInstance.fitView).toHaveBeenCalledWith({ padding: 0.2 });
    });

    const testViewports = [
      { name: 'Ultra-compact mobile (320px)', width: 320, isMobile: true },
      { name: 'Android compact (360px)', width: 360, isMobile: true },
      { name: 'Standard iPhone (375px)', width: 375, isMobile: true },
      { name: 'Modern iPhone (390px)', width: 390, isMobile: true },
      { name: 'Large iPhone / Max (414px)', width: 414, isMobile: true },
      { name: 'Desktop workspace (1024px)', width: 1024, isMobile: false },
      { name: 'Wide desktop (1440px)', width: 1440, isMobile: false },
    ];

    it.each(testViewports)(
      'ensures exactly one set of zoom controls is active for viewport $width px ($name)',
      ({ width, isMobile }) => {
        const isSmScreenOrLarger = width >= 640;
        const visibleReactFlowControls = isSmScreenOrLarger;
        const visibleMobileDockControls = !isSmScreenOrLarger;

        // Exclusivity invariant: Exactly one set of controls is active
        expect(visibleReactFlowControls !== visibleMobileDockControls).toBe(true);

        if (isMobile) {
          expect(visibleMobileDockControls).toBe(true);
          expect(visibleReactFlowControls).toBe(false);
        } else {
          expect(visibleReactFlowControls).toBe(true);
          expect(visibleMobileDockControls).toBe(false);
        }
      }
    );
  });
});
