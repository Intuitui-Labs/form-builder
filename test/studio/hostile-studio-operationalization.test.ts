import { describe, it, expect } from 'vitest';
import {
  createFormStudioStore,
  type StudioState,
} from '../../src/studio/index.js';
import { CadenceTimerController } from '../../src/assessment/timer.js';
import type { FormSchema } from '../../src/schema/FormSchema.js';

describe('Hostile Studio & Assessment Operationalization', () => {
  it('Hostile Vector 1: Dangling Jump Pointer Identification on Page Removal', () => {
    const store = createFormStudioStore();
    const p1 = store.getState().activePageId;

    // Add page 2 and page 3
    store.dispatch({ type: 'ADD_PAGE', payload: { title: 'Step 2' } });
    const p2 = store.getState().activePageId;

    store.dispatch({ type: 'ADD_PAGE', payload: { title: 'Step 3' } });
    const p3 = store.getState().activePageId;

    // Add jump rule on p1 pointing to p2
    store.dispatch({
      type: 'ADD_JUMP_RULE',
      payload: {
        pageId: p1,
        rule: {
          id: 'rule-p1-to-p2',
          targetPageId: p2,
          conditions: [{ field: 'q1', operator: 'equals', value: 'yes' }],
        },
      },
    });

    let schema = store.toFormSchema();
    expect(schema.pages[0]!.jumpRules).toHaveLength(1);
    expect(schema.pages[0]!.jumpRules![0]!.targetPageId).toBe(p2);

    // Hostile Action: Author removes target page p2
    store.dispatch({ type: 'REMOVE_PAGE', payload: { pageId: p2 } });

    // The store state must reflect removal without crashing
    const state = store.getState();
    expect(state.schema.pages.some((p) => p.id === p2)).toBe(false);

    // Invariant: dangling jump rules pointing to deleted page are proactively purged
    expect(state.schema.pages[0]!.jumpRules).toHaveLength(0);

    // Lint result is computed without throwing
    expect(state.lintResult).toBeDefined();
  });

  it('Hostile Vector 2: Rapid Reorder Flood & Strict History Bounding (Memory Leak Defense)', () => {
    const maxDepth = 15;
    const store = createFormStudioStore(undefined, maxDepth);
    const p1 = store.getState().activePageId;

    // Insert 3 fields
    for (let i = 0; i < 3; i++) {
      store.dispatch({
        type: 'INSERT_FIELD',
        payload: {
          pageId: p1,
          index: i,
          field: { id: `f-${i}`, name: `field_${i}`, type: 'text', label: `Field ${i}` },
        },
      });
    }

    // Flood with 100 rapid reorder mutations
    for (let i = 0; i < 100; i++) {
      const from = i % 2 === 0 ? 0 : 1;
      const to = i % 2 === 0 ? 1 : 0;
      store.dispatch({
        type: 'REORDER_FIELDS',
        payload: { pageId: p1, fromIndex: from, toIndex: to },
      });
    }

    const state = store.getState();
    // Invariant: past history must NEVER exceed maxDepth, preventing mobile heap starvation
    expect(state.history.past.length).toBeLessThanOrEqual(maxDepth);
    expect(state.history.future).toHaveLength(0);

    // Test undo down to the maximum bound
    let undoCount = 0;
    while (store.canUndo()) {
      store.dispatch({ type: 'UNDO' });
      undoCount++;
      if (undoCount > maxDepth + 5) break; // safety guard
    }

    expect(undoCount).toBe(maxDepth);
    expect(store.canUndo()).toBe(false);
  });

  it('Hostile Vector 3: Cadence Timer Monotonic Clock Drift & Tampering Resistance', () => {
    let expiredFired = false;
    let ticks: number[] = [];

    const timer = new CadenceTimerController(
      {
        onGlobalTick: (rem) => ticks.push(rem),
        onGlobalExpired: () => {
          expiredFired = true;
        },
      },
      { tickIntervalMs: 100 }
    );

    // Start 10s timer
    timer.startGlobalTimer(10);
    expect(timer.getGlobalRemainingSeconds()).toBe(10);

    // Hostile simulation: App was backgrounded or system clock jumped forward by 25 seconds
    const originalDateNow = Date.now;
    try {
      Date.now = () => originalDateNow() + 25000; // +25 seconds drift!

      // Trigger tick / resume sentry
      timer.handleAppStateChange('active');
      timer.tick();

      // Remaining seconds must clamp safely to 0 (never negative values like -15s!)
      expect(timer.getGlobalRemainingSeconds()).toBe(0);
      expect(expiredFired).toBe(true);
    } finally {
      Date.now = originalDateNow;
      timer.dispose();
    }
  });

  it('Hostile Vector 4: Minimum Page Invariant Guard (Cannot Delete Last Remaining Page)', () => {
    const store = createFormStudioStore();
    const singlePageId = store.getState().activePageId;

    expect(store.getState().schema.pages).toHaveLength(1);

    // Hostile Action: User tries to delete the only remaining page
    store.dispatch({ type: 'REMOVE_PAGE', payload: { pageId: singlePageId } });

    // Invariant: Schema must never enter an illegal 0-page state
    expect(store.getState().schema.pages).toHaveLength(1);
    expect(store.getState().schema.pages[0]!.id).toBe(singlePageId);
    expect(store.getState().activePageId).toBe(singlePageId);
  });
});
