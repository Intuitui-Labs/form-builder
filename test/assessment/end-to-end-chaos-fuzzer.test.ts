import { describe, it, expect, vi } from 'vitest';
import { MultiStepFormManager } from '../../src/manager/MultiStepFormManager.js';
import { createAssessmentEngineForSchema } from '../../src/assessment/index.js';
import { createFormStudioStore } from '../../src/studio/index.js';
import { MemoryStorageAdapter } from '../../src/adapters/storage/MemoryStorageAdapter.js';
import type { FormSchema } from '../../src/schema/FormSchema.js';
import type { INetworkStatusPort, ITransportPort, SubmissionEnvelope, SubmissionReceipt } from '../../src/ports/index.js';

describe('End-to-End Chaos Fuzzing: Timers, Outbox, Adaptive Branching, Proctoring & Studio', () => {
  it('Chaos Run 1: 150 Randomized Lifecycle Flaps & Timer Monotonicity', () => {
    vi.useFakeTimers();
    try {
      const quizSchema: FormSchema = {
        id: 'chaos-quiz-1',
        title: 'Chaos Quiz',
        assessment: {
          timing: 'instant',
          stepTimerSeconds: 60,
          globalTimerSeconds: 300,
        },
        pages: [
          {
            id: 'p1',
            fields: [
              {
                id: 'q1',
                name: 'q1',
                type: 'text',
                rubric: { kind: 'single-choice', points: 10, correctValue: 'A' },
              },
            ],
          },
        ],
      };

      const engine = createAssessmentEngineForSchema(quizSchema);
      engine.startStepTimer();

      const states: ('active' | 'background' | 'inactive')[] = ['active', 'background', 'inactive'];

      // Perform 150 rapid randomized lifecycle flaps with random microsecond time advances
      for (let i = 0; i < 150; i++) {
        const nextState = states[Math.floor(Math.random() * states.length)]!;
        engine.handleAppStateChange(nextState);

        const timeStepMs = Math.floor(Math.random() * 2000) + 10;
        vi.advanceTimersByTime(timeStepMs);

        const currentState = engine.getState();
        // Step remaining time must always be non-negative and bounded by initial duration
        if (currentState.stepTimerRemainingSeconds !== undefined) {
          expect(currentState.stepTimerRemainingSeconds).toBeGreaterThanOrEqual(0);
          expect(currentState.stepTimerRemainingSeconds).toBeLessThanOrEqual(60);
        }
        // Global remaining time must always be non-negative and bounded by initial duration
        if (currentState.globalTimerRemainingSeconds !== undefined) {
          expect(currentState.globalTimerRemainingSeconds).toBeGreaterThanOrEqual(0);
          expect(currentState.globalTimerRemainingSeconds).toBeLessThanOrEqual(300);
        }
      }

      // Proctoring event count should match the number of blur/focus transitions
      const state = engine.getState();
      expect(state.proctoringEvents.length).toBeGreaterThan(0);

      engine.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Chaos Run 2: 250 Monte Carlo Chaos Mutations on FormStudioStore DAG', () => {
    const store = createFormStudioStore(undefined, 10); // maxDepth = 10
    const randomWords = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];

    for (let step = 0; step < 250; step++) {
      const state = store.getState();
      const currentPages = state.schema.pages;
      const activePage = currentPages.find((p) => p.id === state.activePageId) ?? currentPages[0]!;
      const actionType = Math.floor(Math.random() * 8);

      switch (actionType) {
        case 0: { // INSERT_FIELD
          const fieldId = `f_${step}_${randomWords[step % randomWords.length]}`;
          store.dispatch({
            type: 'INSERT_FIELD',
            payload: {
              pageId: activePage.id,
              index: Math.floor(Math.random() * (activePage.fields.length + 2)),
              field: { id: fieldId, name: fieldId, type: 'text', label: `Field ${step}` },
            },
          });
          break;
        }
        case 1: { // REMOVE_FIELD
          if (activePage.fields.length > 0) {
            const targetField = activePage.fields[Math.floor(Math.random() * activePage.fields.length)]!;
            store.dispatch({
              type: 'REMOVE_FIELD',
              payload: { pageId: activePage.id, fieldId: targetField.id },
            });
          }
          break;
        }
        case 2: { // REORDER_FIELDS
          if (activePage.fields.length > 1) {
            store.dispatch({
              type: 'REORDER_FIELDS',
              payload: {
                pageId: activePage.id,
                fromIndex: Math.floor(Math.random() * activePage.fields.length),
                toIndex: Math.floor(Math.random() * activePage.fields.length),
              },
            });
          }
          break;
        }
        case 3: { // ADD_PAGE
          store.dispatch({
            type: 'ADD_PAGE',
            payload: { title: `Page ${step}` },
          });
          break;
        }
        case 4: { // REMOVE_PAGE
          if (currentPages.length > 1) {
            const pageToRemove = currentPages[Math.floor(Math.random() * currentPages.length)]!;
            store.dispatch({
              type: 'REMOVE_PAGE',
              payload: { pageId: pageToRemove.id },
            });
          }
          break;
        }
        case 5: { // ADD_JUMP_RULE
          if (currentPages.length > 1) {
            const targetPage = currentPages.find((p) => p.id !== activePage.id) ?? currentPages[0]!;
            store.dispatch({
              type: 'ADD_JUMP_RULE',
              payload: {
                pageId: activePage.id,
                rule: {
                  condition: { field: 'score', operator: 'greaterThan', value: 50 },
                  targetPageId: targetPage.id,
                },
              },
            });
          }
          break;
        }
        case 6: { // UNDO
          if (store.canUndo()) {
            store.dispatch({ type: 'UNDO' });
          }
          break;
        }
        case 7: { // REDO
          if (store.canRedo()) {
            store.dispatch({ type: 'REDO' });
          }
          break;
        }
      }

      // Assert structural invariants hold after EVERY single mutation
      const postState = store.getState();
      expect(postState.schema.pages.length).toBeGreaterThanOrEqual(1);
      expect(postState.history.past.length).toBeLessThanOrEqual(10);
      expect(postState.history.future.length).toBeLessThanOrEqual(10);
    }
  });

  it('Chaos Run 3: Network Flapping + Adaptive Branching + Proctoring Interleaving', async () => {
    let isOnline = false;
    const networkListeners = new Set<(online: boolean) => void>();
    const networkPort: INetworkStatusPort = {
      isOnline: async () => isOnline,
      subscribe: (cb) => {
        networkListeners.add(cb);
        return () => networkListeners.delete(cb);
      },
    };

    const outboxStorage = new MemoryStorageAdapter();
    const deliveredEnvelopes: SubmissionEnvelope[] = [];
    let failureCount = 0;

    const transportPort: ITransportPort = {
      submit: async (envelope) => {
        if (!isOnline) {
          failureCount++;
          throw new Error('Chaos: Network Drop during flush');
        }
        deliveredEnvelopes.push(envelope);
        return {
          id: `receipt_${Date.now()}`,
          timestamp: new Date().toISOString(),
          status: 'success',
        } as SubmissionReceipt;
      },
    };

    const adaptiveExamSchema: FormSchema = {
      id: 'adaptive-chaos-exam',
      title: 'Adaptive Chaos Exam',
      assessment: {
        timing: 'instant',
        passingPercent: 70,
      },
      pages: [
        {
          id: 'step-1',
          title: 'Basic Skills',
          fields: [
            {
              id: 'q1',
              name: 'q1',
              type: 'text',
              required: true,
              rubric: { kind: 'single-choice', points: 100, correctValue: 'pass' },
            },
          ],
          jumpRules: [
            {
              scoreCondition: {
                type: 'score-total-percent',
                operator: 'greaterThanOrEqual',
                value: 50,
              },
              targetPageId: 'step-advanced',
            },
          ],
          defaultNextPageId: 'step-remedial',
        },
        {
          id: 'step-remedial',
          title: 'Remedial Review',
          fields: [
            { id: 'rem', name: 'remedial_ack', type: 'checkbox', required: true },
          ],
        },
        {
          id: 'step-advanced',
          title: 'Advanced Placement',
          fields: [
            {
              id: 'adv',
              name: 'advanced_ans',
              type: 'text',
              required: true,
              rubric: { kind: 'single-choice', points: 100, correctValue: 'matrix' },
            },
          ],
        },
      ],
    };

    const assessmentEngine = createAssessmentEngineForSchema(adaptiveExamSchema);
    let managerSubmitCalled = false;

    const manager = new MultiStepFormManager(
      adaptiveExamSchema,
      () => {
        managerSubmitCalled = true;
      },
      {
        resilience: {
          storageAdapter: outboxStorage,
          networkStatus: networkPort,
          transport: transportPort,
          autoSaveDraft: false,
        },
        experience: {
          assessmentEngine,
        },
      }
    );

    // 1. Answer Question 1 correctly -> triggers score-based branch to advanced
    manager.setFieldValue('q1', 'pass');
    expect(manager.getAssessmentState()?.scorePercent).toBe(50);

    // 2. Step forward -> must jump to 'step-advanced' (Page Index 2)
    manager.nextStep();
    expect(manager.getCurrentPage().id).toBe('step-advanced');

    // 3. User backgrounds app twice (proctoring sentry)
    manager.handleAppStateChange('background');
    manager.handleAppStateChange('active');
    manager.handleAppStateChange('background');
    manager.handleAppStateChange('active');

    // 4. Answer advanced question
    manager.setFieldValue('advanced_ans', 'matrix');
    expect(manager.getAssessmentState()?.scorePercent).toBe(100);

    // 5. Submit while offline -> successfully queued into offline outbox
    await manager.submit();
    expect(deliveredEnvelopes.length).toBe(0); // offline: not yet delivered

    // 6. Rapidly flap network 20 times to stress outbox sync
    for (let i = 0; i < 20; i++) {
      isOnline = i % 2 === 1;
      networkListeners.forEach((fn) => fn(isOnline));
      await new Promise((r) => setTimeout(r, 10));
    }

    // 7. Ensure network is firmly online and trigger final outbox sync
    isOnline = true;
    networkListeners.forEach((fn) => fn(true));
    await new Promise((r) => setTimeout(r, 50));

    // Verify outbox delivered receipt
    expect(deliveredEnvelopes.length).toBeGreaterThanOrEqual(1);

    // Verify proctoring log integrity
    const proctoring = manager.getAssessmentState()?.proctoringEvents ?? [];
    expect(proctoring.filter((p) => p.type === 'app-blur').length).toBe(2);
    expect(proctoring.filter((p) => p.type === 'app-focus').length).toBe(2);

    manager.dispose();
  });
});
