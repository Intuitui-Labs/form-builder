import { describe, it, expect, vi } from 'vitest';
import { CadenceTimerController } from '../../src/assessment/timer.js';
import { RubricEvaluator } from '../../src/assessment/evaluator.js';
import { AssessmentEngine } from '../../src/assessment/engine.js';
import { createFormStudioStore } from '../../src/studio/index.js';
import { MultiStepFormManager } from '../../src/manager/MultiStepFormManager.js';
import type { FormSchema } from '../../src/schema/FormSchema.js';
import type { TextMatchRubric } from '../../src/assessment/types.js';

describe('Hostile Assessment & Studio Operationalization (Adversarial SRE Harness)', () => {
  it('Hostile Vector 1: Device Clock Rewind / Time-Travel Exploit Prevention', () => {
    vi.useFakeTimers();
    try {
      const onTick = vi.fn();
      const timer = new CadenceTimerController({ onStepTick: onTick });

      // Start 15-second step countdown
      timer.startStepTimer(15);
      expect(timer.getStepRemainingSeconds()).toBe(15);

      // Advance 5 seconds normally
      vi.advanceTimersByTime(5000);
      expect(timer.getStepRemainingSeconds()).toBe(10);

      // ADVERSARIAL ATTACK: User rewinds system clock back 1 hour (3,600,000ms)
      const currentTime = Date.now();
      vi.setSystemTime(currentTime - 3600000);

      // Remaining seconds must be CLAMPED to original duration (15s), NOT 3610s!
      const remainingSec = timer.getStepRemainingSeconds();
      expect(remainingSec).toBeLessThanOrEqual(15);
      expect(remainingSec).toBe(15);

      timer.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Hostile Vector 2: ReDoS & Mega-Payload Defense in Rubric Text-Match', () => {
    const maliciousRegexRubric: TextMatchRubric = {
      kind: 'text-match',
      points: 10,
      acceptableAnswers: ['correct_answer'],
      // Catastrophic backtracking regex pattern if unhandled
      regexPattern: '^(a+)+$',
    };

    // Adversarial string: 20,000 characters of 'a's ending in '!'
    const maliciousPayload = 'a'.repeat(20000) + '!';

    const startTime = performance.now();
    const result = RubricEvaluator.evaluate('field-1', maliciousRegexRubric, maliciousPayload);
    const duration = performance.now() - startTime;

    // Must evaluate cleanly as false in under 50ms without catastrophic backtracking
    expect(result.isCorrect).toBe(false);
    expect(duration).toBeLessThan(50);
  });

  it('Hostile Vector 3: Background Proctoring Sentry & Lifecycle Tamper Log', () => {
    const engine = new AssessmentEngine({
      timing: 'instant',
      stepTimerSeconds: 30,
    });

    engine.registerRubric('q1', {
      kind: 'single-choice',
      points: 100,
      correctValue: 'A',
    });

    engine.startStepTimer();

    // User switches to ChatGPT/browser (backgrounds app)
    engine.handleAppStateChange('background');

    let state = engine.getState();
    expect(state.proctoringEvents.some((e) => e.type === 'app-blur')).toBe(true);

    // User returns to app (resumes)
    engine.handleAppStateChange('active');
    state = engine.getState();
    expect(state.proctoringEvents.some((e) => e.type === 'app-focus')).toBe(true);

    engine.dispose();
  });

  it('Hostile Vector 4: Studio State Machine Invariant Defense (NaN and Malformed Payloads)', () => {
    const store = createFormStudioStore();
    const initialPageId = store.getState().activePageId;

    // 1. Insert a test field
    store.dispatch({
      type: 'INSERT_FIELD',
      payload: {
        pageId: initialPageId,
        index: 0,
        field: { id: 'f1', name: 'f1', type: 'text', label: 'Field 1' },
      },
    });

    // 2. Dispatch malicious REORDER_FIELDS with NaN
    store.dispatch({
      type: 'REORDER_FIELDS',
      payload: {
        pageId: initialPageId,
        fromIndex: NaN,
        toIndex: NaN,
      },
    });

    // Schema must remain intact, fields not wiped or corrupted
    expect(store.getState().schema.pages[0]!.fields.length).toBe(1);
    expect(store.getState().schema.pages[0]!.fields[0]!.id).toBe('f1');

    // 3. Dispatch REORDER_PAGES with out-of-bound negative indices
    store.dispatch({
      type: 'REORDER_PAGES',
      payload: {
        fromIndex: -999,
        toIndex: 500,
      },
    });
    expect(store.getState().schema.pages.length).toBe(1);
  });

  it('Hostile Vector 5: Seam Fault Tolerance (MultiStepFormManager Resilience with Port Errors)', async () => {
    const mockFaultyPort = {
      isInstantTiming: () => true,
      hasStepTimer: () => false,
      startStepTimer: () => {},
      stopStepTimer: () => {},
      handleAppStateChange: () => {},
      getState: () => ({
        totalScore: 0,
        maxPossibleScore: 0,
        scorePercent: 0,
        isPassing: false,
        evaluations: {},
        categoryScores: {},
        proctoringLog: [],
        remainingStepSeconds: undefined,
        remainingGlobalSeconds: undefined,
        isStepExpired: false,
        isGlobalExpired: false,
      }),
      subscribe: () => () => {},
      requestHint: () => {
        throw new Error('Hostile hint injection exception');
      },
      submitAnswer: () => {
        throw new Error('Hostile grading crash');
      },
      gradeAll: () => ({}),
      evaluateScoreCondition: () => false,
      dispose: () => {},
    };

    const schema: FormSchema = {
      id: 'seam-test',
      title: 'Seam Resilience',
      pages: [
        {
          id: 'p1',
          fields: [{ id: 'f1', name: 'f1', type: 'text', required: true, order: 0 }],
        },
      ],
    };

    let submitted = false;
    const manager = new MultiStepFormManager(schema, () => {
      submitted = true;
    }, {
      experience: { assessmentEngine: mockFaultyPort },
    });

    // Setting field value must not crash host form even if assessmentPort throws
    expect(() => manager.setFieldValue('f1', 'valid_val')).not.toThrow();

    // Requesting hint with hostile exception throws or returns undefined gracefully
    expect(() => manager.requestAssessmentHint('f1')).toThrow('Hostile hint injection exception');

    // Form can still submit without stalling
    await manager.submit();
    expect(submitted).toBe(true);

    manager.dispose();
  });
});
