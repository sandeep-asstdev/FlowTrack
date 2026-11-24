import { describe, it, expect } from 'vitest';
import {
  isPositionColliding,
  getNonOverlappingPosition,
  getSmartViewportPosition,
  isNodeInViewport,
  getClampedQuickAddPosition,
  DEFAULT_NODE_DIMENSIONS,
} from './positioning';

describe('Canvas Positioning & Collision Avoidance Utility', () => {
  describe('isPositionColliding', () => {
    it('detects collision when two nodes overlap', () => {
      const existing = [{ position: { x: 100, y: 100 } }];
      // Point within node bounding box
      expect(isPositionColliding({ x: 120, y: 110 }, existing)).toBe(true);
      expect(isPositionColliding({ x: 100, y: 100 }, existing)).toBe(true);
    });

    it('returns false when position is safely separated', () => {
      const existing = [{ position: { x: 100, y: 100 } }];
      // Far enough horizontally and vertically
      expect(isPositionColliding({ x: 500, y: 100 }, existing)).toBe(false);
      expect(isPositionColliding({ x: 100, y: 400 }, existing)).toBe(false);
    });
  });

  describe('getNonOverlappingPosition', () => {
    it('returns base position if no collision exists', () => {
      const existing = [{ position: { x: 0, y: 0 } }];
      const pos = getNonOverlappingPosition({ x: 500, y: 500 }, existing);
      expect(pos).toEqual({ x: 500, y: 500 });
    });

    it('offsets position to the right when initial spot is occupied', () => {
      const existing = [{ position: { x: 100, y: 100 } }];
      const pos = getNonOverlappingPosition({ x: 100, y: 100 }, existing, 'right');
      expect(pos.x).toBeGreaterThan(100 + DEFAULT_NODE_DIMENSIONS.width);
      expect(isPositionColliding(pos, existing)).toBe(false);
    });

    it('offsets sequentially when multiple consecutive spots are occupied', () => {
      const existing = [
        { position: { x: 100, y: 100 } },
        { position: { x: 440, y: 100 } }, // 100 + 288 + 52
      ];
      const pos = getNonOverlappingPosition({ x: 100, y: 100 }, existing, 'right');
      expect(pos.x).toBeGreaterThan(440);
      expect(isPositionColliding(pos, existing)).toBe(false);
    });

    it('supports downward offset for child task hierarchies', () => {
      const existing = [{ position: { x: 200, y: 200 } }];
      const pos = getNonOverlappingPosition({ x: 200, y: 200 }, existing, 'down');
      expect(pos.y).toBeGreaterThan(200 + DEFAULT_NODE_DIMENSIONS.height);
      expect(isPositionColliding(pos, existing)).toBe(false);
    });
  });

  describe('getSmartViewportPosition', () => {
    it('places node at the center of viewport in flow coordinates', () => {
      const viewport = { x: 0, y: 0, zoom: 1 };
      const container = { width: 1200, height: 800 };

      const pos = getSmartViewportPosition(viewport, container, []);
      // Center is 600, 400 minus half node width (144) and half node height (90)
      expect(pos.x).toBe(600 - 144);
      expect(pos.y).toBe(400 - 90);
    });

    it('accounts for canvas pan offset', () => {
      // Panned 500px left and 300px up
      const viewport = { x: -500, y: -300, zoom: 1 };
      const container = { width: 1000, height: 600 };

      const pos = getSmartViewportPosition(viewport, container, []);
      // Center in screen: 500, 300
      // FlowCenter = (500 - (-500)) = 1000, (300 - (-300)) = 600
      expect(pos.x).toBe(1000 - 144);
      expect(pos.y).toBe(600 - 90);
    });

    it('accounts for canvas zoom scale', () => {
      // Zoomed in 2x
      const viewport = { x: 0, y: 0, zoom: 2 };
      const container = { width: 1000, height: 800 };

      const pos = getSmartViewportPosition(viewport, container, []);
      // ScreenCenter: 500, 400
      // FlowCenter: 500/2 = 250, 400/2 = 200
      expect(pos.x).toBe(250 - 144);
      expect(pos.y).toBe(200 - 90);
    });

    it('avoids overlap with existing nodes at viewport center', () => {
      const viewport = { x: 0, y: 0, zoom: 1 };
      const container = { width: 1000, height: 800 };
      const idealX = 500 - 144;
      const idealY = 400 - 90;

      const existing = [{ position: { x: idealX, y: idealY } }];
      const pos = getSmartViewportPosition(viewport, container, existing);

      expect(pos.x).not.toBe(idealX);
      expect(isPositionColliding(pos, existing)).toBe(false);
    });
  });

  describe('isNodeInViewport', () => {
    it('returns true when node is inside visible canvas bounds', () => {
      const viewport = { x: 0, y: 0, zoom: 1 };
      const container = { width: 1200, height: 800 };
      const nodePos = { x: 400, y: 300 };

      expect(isNodeInViewport(nodePos, viewport, container)).toBe(true);
    });

    it('returns false when node is outside visible canvas bounds', () => {
      const viewport = { x: 0, y: 0, zoom: 1 };
      const container = { width: 1200, height: 800 };
      const offscreenPos = { x: 1800, y: 1500 };

      expect(isNodeInViewport(offscreenPos, viewport, container)).toBe(false);
    });
  });

  describe('getClampedQuickAddPosition', () => {
    it('positions exactly at pointer when within open canvas space', () => {
      const pos = getClampedQuickAddPosition(500, 300, 1280, 800);
      expect(pos.left).toBe(500);
      expect(pos.top).toBe(300);
      expect(pos.width).toBe(220);
    });

    it('clamps strictly inside mobile canvas on 360px viewport', () => {
      const pos = getClampedQuickAddPosition(350, 700, 360, 740);
      // Popup width is 220, right edge must not exceed 360px viewport
      expect(pos.left + pos.width).toBeLessThanOrEqual(360);
      expect(pos.left).toBeGreaterThanOrEqual(12);
      // Top must be below top navigation (64px) and above mobile dock (80px margin from bottom)
      expect(pos.top).toBeGreaterThanOrEqual(64);
      expect(pos.top + 90).toBeLessThanOrEqual(740 - 80);
    });

    it('avoids overlapping ReactFlow desktop MiniMap in bottom-right corner', () => {
      const windowWidth = 1280;
      const windowHeight = 800;
      // Clicked near bottom-right where minimap is (minimap is approx 1280-230 to 1280, 800-180 to 800)
      const pos = getClampedQuickAddPosition(1200, 750, windowWidth, windowHeight);
      const minimapTop = windowHeight - 180;
      // Must be pushed above the minimap
      expect(pos.top + 90).toBeLessThanOrEqual(minimapTop);
      expect(pos.left + pos.width).toBeLessThanOrEqual(windowWidth);
    });

    it('avoids overlapping desktop canvas controls in bottom-left corner', () => {
      const windowWidth = 1280;
      const windowHeight = 800;
      // Clicked in bottom-left corner near controls
      const pos = getClampedQuickAddPosition(20, 750, windowWidth, windowHeight);
      const controlsTop = windowHeight - 180;
      expect(pos.top + 90).toBeLessThanOrEqual(controlsTop);
      expect(pos.left).toBeGreaterThanOrEqual(12);
    });
  });
});
