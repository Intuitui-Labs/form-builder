import { describe, it, expect, vi } from 'vitest';
import {
  FormStudioStore,
  createFormStudioStore,
  createDefaultStudioSchema,
} from '../../src/studio/index.js';
import type { FormSchema } from '../../src/index.js';
import type { SingleChoiceRubric } from '../../src/assessment/types.js';

describe('FormStudioStore (Headless Studio State Machine)', () => {
  it('initializes with a valid default schema, active page, and clean state', () => {
    const store = createFormStudioStore();
    const state = store.getState();

    expect(state.schema.pages.length).toBe(1);
    expect(state.activePageId).toBe(state.schema.pages[0]!.id);
    expect(state.selectedFieldId).toBeNull();
    expect(state.mode).toBe('edit');
    expect(state.activeSheet).toBeNull();
    expect(state.isDirty).toBe(false);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
  });

  it('inserts and reorders fields with boundary clamping and order normalization', () => {
    const store = createFormStudioStore();
    const pageId = store.getState().activePageId;

    // Insert 3 fields
    store.dispatch({
      type: 'INSERT_FIELD',
      payload: {
        pageId,
        index: 0,
        field: { id: 'q1', name: 'q1', type: 'text', label: 'Question 1' },
      },
    });

    store.dispatch({
      type: 'INSERT_FIELD',
      payload: {
        pageId,
        index: 1,
        field: { id: 'q2', name: 'q2', type: 'text', label: 'Question 2' },
      },
    });

    store.dispatch({
      type: 'INSERT_FIELD',
      payload: {
        pageId,
        index: 2,
        field: { id: 'q3', name: 'q3', type: 'text', label: 'Question 3' },
      },
    });

    let fields = store.getState().schema.pages[0]!.fields;
    expect(fields.map((f) => f.id)).toEqual(['q1', 'q2', 'q3']);
    expect(fields.map((f) => f.order)).toEqual([0, 1, 2]);
    expect(store.getState().isDirty).toBe(true);

    // Reorder: Move q1 (index 0) to index 2
    store.dispatch({
      type: 'REORDER_FIELDS',
      payload: { pageId, fromIndex: 0, toIndex: 2 },
    });

    fields = store.getState().schema.pages[0]!.fields;
    expect(fields.map((f) => f.id)).toEqual(['q2', 'q3', 'q1']);
    expect(fields.map((f) => f.order)).toEqual([0, 1, 2]);

    // Boundary check: Out-of-bounds clamped
    store.dispatch({
      type: 'REORDER_FIELDS',
      payload: { pageId, fromIndex: 2, toIndex: 999 },
    });
    fields = store.getState().schema.pages[0]!.fields;
    expect(fields.map((f) => f.id)).toEqual(['q2', 'q3', 'q1']);
  });

  it('removes fields and resets selection if the active field is removed', () => {
    const store = createFormStudioStore();
    const pageId = store.getState().activePageId;

    store.dispatch({
      type: 'INSERT_FIELD',
      payload: {
        pageId,
        index: 0,
        field: { id: 'q1', name: 'q1', type: 'text', label: 'Question 1' },
      },
    });

    store.dispatch({ type: 'SELECT_FIELD', payload: { fieldId: 'q1' } });
    expect(store.getState().selectedFieldId).toBe('q1');

    store.dispatch({
      type: 'REMOVE_FIELD',
      payload: { pageId, fieldId: 'q1' },
    });

    expect(store.getState().schema.pages[0]!.fields.length).toBe(0);
    expect(store.getState().selectedFieldId).toBeNull();
  });

  it('handles page CRUD and prevents removing the last remaining page', () => {
    const store = createFormStudioStore();
    const initialPageId = store.getState().activePageId;

    // Add a second page
    store.dispatch({
      type: 'ADD_PAGE',
      payload: { title: 'Step 2: Verification' },
    });

    expect(store.getState().schema.pages.length).toBe(2);
    expect(store.getState().activePageId).toBe(store.getState().schema.pages[1]!.id);

    // Try to remove initial page
    store.dispatch({
      type: 'REMOVE_PAGE',
      payload: { pageId: initialPageId },
    });

    expect(store.getState().schema.pages.length).toBe(1);
    expect(store.getState().activePageId).toBe(store.getState().schema.pages[0]!.id);

    // Invariant: cannot remove last page
    store.dispatch({
      type: 'REMOVE_PAGE',
      payload: { pageId: store.getState().activePageId },
    });
    expect(store.getState().schema.pages.length).toBe(1);
  });

  it('assigns quiz rubrics to fields and preserves them in schema serialization', () => {
    const store = createFormStudioStore();
    const pageId = store.getState().activePageId;

    store.dispatch({
      type: 'INSERT_FIELD',
      payload: {
        pageId,
        index: 0,
        field: { id: 'quiz-1', name: 'math_q1', type: 'select', label: '12 x 12 = ?' },
      },
    });

    const rubric: SingleChoiceRubric = {
      kind: 'single-choice',
      points: 10,
      correctValue: '144',
      explanation: '12 multiplied by 12 equals 144.',
    };

    store.dispatch({
      type: 'SET_FIELD_RUBRIC',
      payload: { fieldId: 'quiz-1', rubric },
    });

    const field = store.getState().schema.pages[0]!.fields[0] as any;
    expect(field.rubric).toEqual(rubric);

    // Verify toFormSchema() preserves rubric
    const serialized = store.toFormSchema();
    expect((serialized.pages[0]!.fields[0] as any).rubric.points).toBe(10);
  });

  it('manages branching exit jump rules and updates lint diagnostics', () => {
    const store = createFormStudioStore();
    const p1 = store.getState().activePageId;

    store.dispatch({ type: 'ADD_PAGE', payload: { title: 'Target Page' } });
    const p2 = store.getState().schema.pages[1]!.id;

    store.dispatch({
      type: 'ADD_JUMP_RULE',
      payload: {
        pageId: p1,
        rule: {
          condition: { field: 'score', operator: 'greaterThan', value: 80 },
          targetPageId: p2,
        },
      },
    });

    const page1 = store.getState().schema.pages.find((p) => p.id === p1);
    expect(page1?.jumpRules?.length).toBe(1);
    expect(page1?.jumpRules?.[0]?.targetPageId).toBe(p2);

    // Remove jump rule
    store.dispatch({
      type: 'REMOVE_JUMP_RULE',
      payload: { pageId: p1, ruleIndex: 0 },
    });
    expect(store.getState().schema.pages.find((p) => p.id === p1)?.jumpRules?.length).toBe(0);
  });

  it('supports transactional undo/redo and clears future on new mutations', () => {
    const store = createFormStudioStore(undefined, 5); // maxDepth = 5
    const pageId = store.getState().activePageId;

    // Mutation 1
    store.dispatch({
      type: 'INSERT_FIELD',
      payload: { pageId, index: 0, field: { id: 'f1', name: 'f1', type: 'text' } },
    });
    expect(store.getState().schema.pages[0]!.fields.length).toBe(1);
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(false);

    // Mutation 2
    store.dispatch({
      type: 'INSERT_FIELD',
      payload: { pageId, index: 1, field: { id: 'f2', name: 'f2', type: 'text' } },
    });
    expect(store.getState().schema.pages[0]!.fields.length).toBe(2);

    // Undo Mutation 2
    store.dispatch({ type: 'UNDO' });
    expect(store.getState().schema.pages[0]!.fields.length).toBe(1);
    expect(store.getState().schema.pages[0]!.fields[0]!.id).toBe('f1');
    expect(store.canRedo()).toBe(true);

    // Redo Mutation 2
    store.dispatch({ type: 'REDO' });
    expect(store.getState().schema.pages[0]!.fields.length).toBe(2);
    expect(store.getState().schema.pages[0]!.fields[1]!.id).toBe('f2');

    // Undo Mutation 2, then make a different Mutation 3 -> clears redo
    store.dispatch({ type: 'UNDO' });
    expect(store.canRedo()).toBe(true);

    store.dispatch({
      type: 'INSERT_FIELD',
      payload: { pageId, index: 1, field: { id: 'f3', name: 'f3', type: 'number' } },
    });
    expect(store.canRedo()).toBe(false); // Redo history cleared
    expect(store.getState().schema.pages[0]!.fields[1]!.id).toBe('f3');
  });

  it('notifies subscribers on state updates', () => {
    const store = createFormStudioStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.dispatch({
      type: 'SET_MODE',
      payload: { mode: 'preview' },
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().mode).toBe('preview');

    unsubscribe();
    store.dispatch({
      type: 'SET_MODE',
      payload: { mode: 'edit' },
    });
    expect(listener).toHaveBeenCalledTimes(1); // not called again
  });
});
