import { describe, it, expect, vi } from 'vitest';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import {
  MemoryDraftStorageAdapter,
  LocalStorageDraftAdapter,
} from '../src/affordance/index.js';
import type { FormSchema } from '../src/schema/FormSchema.js';
import type { FormDraftSnapshot } from '../src/schema/FormDraft.js';

describe('Draft Persistence & Multi-Path Session Resume', () => {
  const branchingSchema: FormSchema = {
    id: 'applicant-survey',
    version: '1.2.0',
    title: 'Applicant Onboarding',
    fields: [],
    pages: [
      {
        id: 'step-role',
        title: 'Select Role',
        fields: [
          {
            id: 'role',
            name: 'role',
            type: 'text',
            label: 'Role',
            required: true,
          },
        ],
        jumpRules: [
          {
            condition: { field: 'role', operator: 'equals', value: 'developer' },
            targetPageId: 'step-dev-skills',
          },
          {
            condition: { field: 'role', operator: 'equals', value: 'designer' },
            targetPageId: 'step-design-portfolio',
          },
        ],
        defaultNextPageId: 'step-general',
      },
      {
        id: 'step-general',
        title: 'General Info',
        fields: [
          {
            id: 'notes',
            name: 'notes',
            type: 'text',
            label: 'Notes',
          },
        ],
      },
      {
        id: 'step-dev-skills',
        title: 'Developer Details',
        fields: [
          {
            id: 'github',
            name: 'github',
            type: 'text',
            label: 'GitHub Handle',
            required: true,
          },
          {
            id: 'framework',
            name: 'framework',
            type: 'text',
            label: 'Favorite Framework',
          },
        ],
        defaultNextPageId: 'step-review',
      },
      {
        id: 'step-design-portfolio',
        title: 'Design Portfolio',
        fields: [
          {
            id: 'figmaUrl',
            name: 'figmaUrl',
            type: 'text',
            label: 'Figma Profile',
            required: true,
          },
        ],
        defaultNextPageId: 'step-review',
      },
      {
        id: 'step-review',
        title: 'Final Review',
        fields: [
          {
            id: 'confirmed',
            name: 'confirmed',
            type: 'checkbox',
            label: 'Confirm submissions',
          },
        ],
      },
    ],
  };

  it('saves active draft snapshot including multi-path branch lineage', () => {
    const storage = new MemoryDraftStorageAdapter();
    const manager = new MultiStepFormManager(
      branchingSchema,
      () => {},
      { resilience: { draftStorage: storage } }
    );

    // Fill role as developer
    manager.getFormManager().setFieldValue('role', 'developer');
    expect(manager.nextStep()).toBe(true);
    expect(manager.getCurrentPageIndex()).toBe(2); // Jumped to step-dev-skills

    // Fill dev skills
    manager.getFormManager().setFieldValue('github', 'octocat');
    manager.getFormManager().setFieldValue('framework', 'TypeScript');

    const draft = manager.saveDraft();
    expect(draft.schemaId).toBe('applicant-survey');
    expect(draft.currentPageIndex).toBe(2);
    expect(draft.completedStepIndices).toContain(0);
    expect(draft.values.role).toBe('developer');
    expect(draft.values.github).toBe('octocat');
    expect(draft.branchLineage.length).toBeGreaterThan(0);
    expect(storage.hasDraft('applicant-survey')).toBe(true);
  });

  it('restores draft session into a fresh manager instance with identical progress and lineage', () => {
    const storage = new MemoryDraftStorageAdapter();
    const manager1 = new MultiStepFormManager(
      branchingSchema,
      () => {},
      { resilience: { draftStorage: storage } }
    );

    manager1.getFormManager().setFieldValue('role', 'developer');
    manager1.nextStep();
    manager1.getFormManager().setFieldValue('github', 'torvalds');
    manager1.saveDraft();

    // Spawn completely fresh manager sharing the storage
    const manager2 = new MultiStepFormManager(
      branchingSchema,
      () => {},
      { resilience: { draftStorage: storage } }
    );

    expect(manager2.getCurrentPageIndex()).toBe(0);
    expect(manager2.getFormManager().getState().values.role).toBe('');

    // Restore from storage
    const restored = manager2.restoreDraft();
    expect(restored).toBe(true);

    expect(manager2.getCurrentPageIndex()).toBe(2);
    expect(manager2.getFormManager().getState().values.role).toBe('developer');
    expect(manager2.getFormManager().getState().values.github).toBe('torvalds');
    expect(manager2.getCompletedStepIndices()).toContain(0);

    // Branching state reflects active path
    const projectedPath = manager2.getProjectedPath();
    expect(projectedPath).toEqual([0, 2, 4]); // 0 -> 2 (dev) -> 4 (review)
  });

  it('preserves branch lineage after resume so changing branch decisions prunes obsolete branch data', () => {
    const storage = new MemoryDraftStorageAdapter();
    const manager1 = new MultiStepFormManager(
      branchingSchema,
      () => {},
      { resilience: { draftStorage: storage } }
    );

    // Go down developer path
    manager1.getFormManager().setFieldValue('role', 'developer');
    manager1.nextStep();
    manager1.getFormManager().setFieldValue('github', 'kentcdodds');
    manager1.nextStep();
    expect(manager1.getCurrentPageIndex()).toBe(4); // Review

    manager1.saveDraft();

    // Restore in manager2
    const manager2 = new MultiStepFormManager(
      branchingSchema,
      () => {},
      { resilience: { draftStorage: storage } }
    );
    manager2.restoreDraft();
    expect(manager2.getCurrentPageIndex()).toBe(4);

    // Retrace back to step 0
    manager2.prevStep(); // step 2
    manager2.prevStep(); // step 0
    expect(manager2.getCurrentPageIndex()).toBe(0);

    // Change branch from developer to designer
    manager2.getFormManager().setFieldValue('role', 'designer');
    expect(manager2.willDivertBranch(0)).toBe(true);
    expect(manager2.hasDownstreamBranchData(0)).toBe(true);

    // Advance to designer branch
    manager2.nextStep();
    expect(manager2.getCurrentPageIndex()).toBe(3); // designer step

    // Old developer branch data (github) was pruned!
    expect(manager2.getFormManager().getState().values.github).toBe('');
    expect(manager2.getCompletedStepIndices()).not.toContain(2);
  });

  it('auto-saves draft on step transitions and input changes when autoSaveDraft is true', () => {
    const storage = new MemoryDraftStorageAdapter();
    const manager = new MultiStepFormManager(
      branchingSchema,
      () => {},
      {
        resilience: {
          draftStorage: storage,
          autoSaveDraft: true,
        },
      }
    );

    // 1. Changing field auto-saves
    manager.getFormManager().setFieldValue('role', 'developer');
    let loaded = storage.loadDraft('applicant-survey');
    expect(loaded?.values.role).toBe('developer');

    // 2. Advancing step auto-saves
    manager.nextStep();
    loaded = storage.loadDraft('applicant-survey');
    expect(loaded?.currentPageIndex).toBe(2);

    // 3. Modifying downstream field auto-saves
    manager.getFormManager().setFieldValue('github', 'gaearon');
    loaded = storage.loadDraft('applicant-survey');
    expect(loaded?.values.github).toBe('gaearon');

    // 4. Going back auto-saves
    manager.prevStep();
    loaded = storage.loadDraft('applicant-survey');
    expect(loaded?.currentPageIndex).toBe(0);
  });

  it('clears draft on final submission so future sessions start clean', async () => {
    const storage = new MemoryDraftStorageAdapter();
    const submitSpy = vi.fn();
    const manager = new MultiStepFormManager(
      branchingSchema,
      submitSpy,
      {
        resilience: {
          draftStorage: storage,
          autoSaveDraft: true,
        },
      }
    );

    manager.getFormManager().setFieldValue('role', 'developer');
    manager.nextStep();
    manager.getFormManager().setFieldValue('github', 'alice');
    manager.nextStep(); // step 4 (review)
    expect(manager.getCurrentPageIndex()).toBe(4);

    expect(storage.hasDraft('applicant-survey')).toBe(true);

    // Submit
    await manager.submit();
    expect(submitSpy).toHaveBeenCalledTimes(1);

    // Draft should now be cleared
    expect(storage.hasDraft('applicant-survey')).toBe(false);
    expect(storage.loadDraft('applicant-survey')).toBeNull();
  });

  it('reflects canSaveAndExit in affordance navigation state based on allowSaveAndResumeLater policy', () => {
    const manager = new MultiStepFormManager(
      branchingSchema,
      () => {},
      {
        experience: {
          affordanceConfig: {
            allowSaveAndResumeLater: true,
          },
        },
      }
    );

    const state = manager.getAffordanceState();
    expect(state.navigation.canSaveAndExit).toBe(true);
    expect(state.policy.allowSaveAndResumeLater).toBe(true);
  });

  it('LocalStorageDraftAdapter falls back gracefully without DOM window', () => {
    const adapter = new LocalStorageDraftAdapter('test_prefix:');

    const snapshot: FormDraftSnapshot = {
      schemaId: 'offline-test',
      schemaVersion: '1.0.0',
      savedAt: new Date().toISOString(),
      currentPageIndex: 0,
      completedStepIndices: [],
      stepHistory: [0],
      branchLineage: [],
      branchTargetHistory: [],
      values: { name: 'Test' },
      isSubmitted: false,
    };

    adapter.saveDraft(snapshot);
    expect(adapter.hasDraft('offline-test')).toBe(true);

    const loaded = adapter.loadDraft('offline-test');
    expect(loaded?.values.name).toBe('Test');

    adapter.clearDraft('offline-test');
    expect(adapter.hasDraft('offline-test')).toBe(false);
    expect(adapter.loadDraft('offline-test')).toBeNull();
  });

  it('returns false when trying to restore mismatched schema draft', () => {
    const storage = new MemoryDraftStorageAdapter();
    const manager = new MultiStepFormManager(
      branchingSchema,
      () => {},
      { resilience: { draftStorage: storage } }
    );

    const badSnapshot: FormDraftSnapshot = {
      schemaId: 'other-unrelated-schema',
      schemaVersion: '1.0.0',
      savedAt: new Date().toISOString(),
      currentPageIndex: 1,
      completedStepIndices: [],
      stepHistory: [0, 1],
      branchLineage: [],
      branchTargetHistory: [],
      values: {},
      isSubmitted: false,
    };

    const restored = manager.restoreDraft(badSnapshot);
    expect(restored).toBe(false);
    expect(manager.getCurrentPageIndex()).toBe(0);
  });

  it('preserves draft if submission fails due to an error, preventing data loss', async () => {
    const storage = new MemoryDraftStorageAdapter();
    const failingSubmit = vi.fn().mockRejectedValue(new Error('Network failure 503'));
    const manager = new MultiStepFormManager(
      branchingSchema,
      failingSubmit,
      {
        resilience: {
          draftStorage: storage,
          autoSaveDraft: true,
        },
      }
    );

    manager.getFormManager().setFieldValue('role', 'developer');
    manager.nextStep();
    manager.getFormManager().setFieldValue('github', 'gracehopper');
    manager.nextStep(); // step 4 (review)

    expect(storage.hasDraft('applicant-survey')).toBe(true);

    // Attempt submit which will reject inside onSubmit
    await manager.submit();
    expect(failingSubmit).toHaveBeenCalledTimes(1);

    // FormManager failed, so draft must remain intact for retry!
    expect(manager.getFormManager().getState().submitSuccess).toBe(false);
    expect(storage.hasDraft('applicant-survey')).toBe(true);
    const retained = storage.loadDraft('applicant-survey');
    expect(retained?.values.github).toBe('gracehopper');
  });
});
