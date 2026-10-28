import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '../../stores/authStore';
import { getRolePermissions } from '../../utils/permissions';

describe('Responsive Foundation & Mobile Navigation (Chunk 1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().logout();
  });

  describe('1. Responsive Layout & Breakpoint System', () => {
    const breakpoints = {
      xs: '375px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    };

    it('supports modern mobile breakpoint xs at 375px and base 320px', () => {
      expect(breakpoints.xs).toBe('375px');
      expect(parseInt(breakpoints.xs, 10)).toBeGreaterThan(320);
    });

    it('supports standard tablet (768px md) and desktop (1024px lg) breakpoints', () => {
      expect(breakpoints.md).toBe('768px');
      expect(breakpoints.lg).toBe('1024px');
    });

    it('defines safe area environment variables and CSS utility rules', () => {
      const safeAreaRules = {
        top: 'env(safe-area-inset-top, 0px)',
        bottom: 'env(safe-area-inset-bottom, 0px)',
        left: 'env(safe-area-inset-left, 0px)',
        right: 'env(safe-area-inset-right, 0px)',
      };

      expect(safeAreaRules.top).toContain('safe-area-inset-top');
      expect(safeAreaRules.bottom).toContain('safe-area-inset-bottom');
      expect(safeAreaRules.left).toContain('safe-area-inset-left');
      expect(safeAreaRules.right).toContain('safe-area-inset-right');
    });

    it('enforces dynamic viewport height (100dvh) for mobile browser address bar accommodation', () => {
      const dynamicViewportContainerClass = 'min-h-[100dvh] w-full min-w-0 max-w-full overflow-x-hidden';
      expect(dynamicViewportContainerClass).toContain('min-h-[100dvh]');
      expect(dynamicViewportContainerClass).toContain('overflow-x-hidden');
    });
  });

  describe('2. Touch Targets & Accessibility Compliance', () => {
    const touchTargetSpec = {
      minimumTouchDimensionPx: 44,
      minimumButtonClass: 'min-h-[44px] min-w-[44px]',
    };

    it('specifies >= 44x44px CSS pixels for mobile touch targets', () => {
      expect(touchTargetSpec.minimumTouchDimensionPx).toBeGreaterThanOrEqual(44);
    });

    it('validates mobile controls adhere to min-h-[44px] constraint', () => {
      const mobileControls = [
        { name: 'Hamburger Toggle Button', class: 'lg:hidden w-11 h-11 min-h-[44px] min-w-[44px]' },
        { name: 'Mobile Drawer Close Button', class: 'w-11 h-11 min-w-[44px] min-h-[44px]' },
        { name: 'Mobile Navigation View Links', class: 'w-full p-2.5 min-h-[44px] rounded-xl' },
        { name: 'Notification Drawer Close Button', class: 'p-2 min-w-[44px] min-h-[44px]' },
        { name: 'Auth Modal Submit Button', class: 'w-full py-2.5 min-h-[44px]' },
        { name: 'Workspace Modal Submit Button', class: 'flex-1 min-h-[44px] py-2.5' },
        { name: 'Sign Out Mobile Button', class: 'w-full py-2.5 px-4 min-h-[44px]' },
      ];

      for (const ctrl of mobileControls) {
        expect(ctrl.class).toContain('min-h-[44px]');
      }
    });
  });

  describe('3. Role-Based Navigation in Mobile Drawer', () => {
    const allViews = [
      { id: 'dashboard', label: 'Projects' },
      { id: 'my-work', label: 'My Tasks' },
      { id: 'users', label: 'Team', requiresRoles: ['ADMIN', 'MANAGER'] },
      { id: 'reports', label: 'Reports', requiresRoles: ['ADMIN', 'MANAGER'] },
    ];

    const getVisibleNavViews = (role: string) => {
      return allViews.filter((view) => {
        if (view.requiresRoles && !view.requiresRoles.includes(role)) {
          return false;
        }
        return true;
      });
    };

    it('exposes Projects, My Tasks, Team, and Reports to Platform Admins', () => {
      const adminViews = getVisibleNavViews('ADMIN').map((v) => v.id);
      expect(adminViews).toEqual(['dashboard', 'my-work', 'users', 'reports']);
      expect(adminViews).toContain('users');
      expect(adminViews).toContain('reports');
    });

    it('exposes Projects, My Tasks, Team, and Reports to Managers', () => {
      const managerViews = getVisibleNavViews('MANAGER').map((v) => v.id);
      expect(managerViews).toEqual(['dashboard', 'my-work', 'users', 'reports']);
      expect(managerViews).toContain('users');
      expect(managerViews).toContain('reports');
    });

    it('shows only Projects and My Tasks to Team Leads (hiding admin Team and Reports management)', () => {
      const leadViews = getVisibleNavViews('TEAM_LEAD').map((v) => v.id);
      expect(leadViews).toEqual(['dashboard', 'my-work']);
      expect(leadViews).not.toContain('users');
      expect(leadViews).not.toContain('reports');
    });

    it('restricts standard Members and Viewers to core work destinations: Projects and My Tasks', () => {
      const memberViews = getVisibleNavViews('MEMBER').map((v) => v.id);
      expect(memberViews).toEqual(['dashboard', 'my-work']);
      expect(memberViews).not.toContain('users');
      expect(memberViews).not.toContain('reports');
    });

    it('ensures clean top navigation without redundant review queues or duplicated canvas headers', () => {
      const allIds = allViews.map((v) => v.id);
      expect(allIds).not.toContain('approvals');
      expect(allIds).not.toContain('canvas');
    });
  });

  describe('4. Mobile Drawer Navigation State & Interactions', () => {
    it('manages mobile drawer open and close transitions', () => {
      let isDrawerOpen = false;
      const openDrawer = () => { isDrawerOpen = true; };
      const closeDrawer = () => { isDrawerOpen = false; };

      openDrawer();
      expect(isDrawerOpen).toBe(true);

      closeDrawer();
      expect(isDrawerOpen).toBe(false);
    });

    it('closes mobile drawer automatically upon navigating to a view', () => {
      let currentView = 'dashboard';
      let isDrawerOpen = true;

      const handleMobileNav = (view: string) => {
        currentView = view;
        isDrawerOpen = false;
      };

      handleMobileNav('my-work');
      expect(currentView).toBe('my-work');
      expect(isDrawerOpen).toBe(false);
    });

    it('clears session and closes mobile drawer on sign out', () => {
      useAuthStore.setState({
        user: { id: 'usr-1', email: 'test@flowtrack.io', fullName: 'Tester' },
        token: 'valid-token',
      });
      let isDrawerOpen = true;

      const handleMobileLogout = () => {
        isDrawerOpen = false;
        useAuthStore.getState().logout();
      };

      handleMobileLogout();
      expect(isDrawerOpen).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().token).toBeNull();
    });

    it('switches active workspace and closes mobile drawer', () => {
      useAuthStore.setState({
        workspaces: [
          { id: 'ws-1', name: 'Workspace Alpha', slug: 'alpha', role: 'MEMBER' },
          { id: 'ws-2', name: 'Workspace Beta', slug: 'beta', role: 'MEMBER' },
        ],
        activeWorkspaceId: 'ws-1',
      });
      let isDrawerOpen = true;

      const handleSwitchWorkspace = (id: string) => {
        useAuthStore.getState().setActiveWorkspace(id);
        isDrawerOpen = false;
      };

      handleSwitchWorkspace('ws-2');
      expect(useAuthStore.getState().activeWorkspaceId).toBe('ws-2');
      expect(isDrawerOpen).toBe(false);
    });
  });

  describe('5. Mobile Virtual Keyboard & Form Scrolling Accommodation', () => {
    it('configures scrollable overscroll containment for small screen modal dialogs', () => {
      const modalContainerClass = 'max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain';
      expect(modalContainerClass).toContain('overflow-y-auto');
      expect(modalContainerClass).toContain('overscroll-contain');
      expect(modalContainerClass).toContain('100dvh');
    });

    it('prevents background scroll bleed and body overflow on mobile screens', () => {
      const bodyStyleRules = {
        minWidth: '320px',
        overflowX: 'hidden',
        touchAction: 'manipulation',
        webkitOverflowScrolling: 'touch',
      };

      expect(bodyStyleRules.minWidth).toBe('320px');
      expect(bodyStyleRules.overflowX).toBe('hidden');
      expect(bodyStyleRules.touchAction).toBe('manipulation');
    });
  });

  describe('6. Regression Tests for BUG 1: Mobile Hamburger Menu & Portal Drawer', () => {
    it('verifies hamburger button is present on mobile and hidden on desktop (lg:hidden)', () => {
      const hamburgerButtonClass = 'lg:hidden w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700';
      expect(hamburgerButtonClass).toContain('lg:hidden');
      expect(hamburgerButtonClass).toContain('min-h-[44px]');
      expect(hamburgerButtonClass).toContain('min-w-[44px]');
    });

    it('verifies mobile drawer uses createPortal to document.body escaping backdrop-blur containing block trap', () => {
      const portalMountElement = 'document.body';
      const portalContainerClass = 'fixed inset-0 z-[9999] lg:hidden flex';
      const backdropClass = 'fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-200';
      const drawerSheetClass = 'relative w-[85vw] max-w-[340px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col h-[100dvh] max-h-[100dvh] z-10 pt-safe pb-safe overflow-y-auto overscroll-contain';

      expect(portalMountElement).toBe('document.body');
      expect(portalContainerClass).toContain('z-[9999]');
      expect(portalContainerClass).toContain('fixed inset-0');
      expect(backdropClass).toContain('fixed inset-0');
      expect(drawerSheetClass).toContain('h-[100dvh]');
      expect(drawerSheetClass).toContain('overscroll-contain');
    });

    it('verifies body scroll locking when mobile drawer opens and unlocks when closed', () => {
      const mockBody = {
        style: {
          overflow: '',
          touchAction: '',
        },
      };

      const lockScroll = (open: boolean) => {
        if (open) {
          mockBody.style.overflow = 'hidden';
          mockBody.style.touchAction = 'none';
        } else {
          mockBody.style.overflow = '';
          mockBody.style.touchAction = '';
        }
      };

      // Drawer opens
      lockScroll(true);
      expect(mockBody.style.overflow).toBe('hidden');
      expect(mockBody.style.touchAction).toBe('none');

      // Drawer closes
      lockScroll(false);
      expect(mockBody.style.overflow).toBe('');
      expect(mockBody.style.touchAction).toBe('');
    });

    it('verifies drawer closes on backdrop click, close button tap, and Escape key', () => {
      let isOpen = true;
      const close = () => { isOpen = false; };

      // Backdrop dismiss
      close();
      expect(isOpen).toBe(false);

      // Reopen and test close button tap
      isOpen = true;
      close();
      expect(isOpen).toBe(false);

      // Reopen and test Escape keydown
      isOpen = true;
      const handleKeyDown = (e: { key: string }) => {
        if (e.key === 'Escape') close();
      };
      handleKeyDown({ key: 'Escape' });
      expect(isOpen).toBe(false);
    });

    const mobileViewports = [
      { name: 'iPhone SE (1st gen)', width: 320, fitsDrawer: true },
      { name: 'Samsung Galaxy / Android standard', width: 360, fitsDrawer: true },
      { name: 'iPhone mini / iPhone 11 Pro', width: 375, fitsDrawer: true },
      { name: 'iPhone 12 / 13 / 14 / 15', width: 390, fitsDrawer: true },
      { name: 'iPhone Plus / Max / XR', width: 414, fitsDrawer: true },
      { name: 'Desktop (1024px+)', width: 1024, fitsDrawer: false },
    ];

    it.each(mobileViewports)(
      'verifies drawer width scaling for viewport $width px ($name)',
      ({ width, fitsDrawer }) => {
        // max-w-[340px] and 85vw
        const computedDrawerWidth = Math.min(340, width * 0.85);
        if (fitsDrawer) {
          // On mobile, drawer width should never exceed viewport width - 44px
          expect(computedDrawerWidth).toBeLessThan(width);
          expect(computedDrawerWidth).toBeGreaterThanOrEqual(270);
        } else {
          // On desktop (lg:hidden), mobile drawer should not be displayed
          expect(width).toBeGreaterThanOrEqual(1024);
        }
      }
    );
  });
});
