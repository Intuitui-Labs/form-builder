import { describe, it, expect, vi } from 'vitest';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import type { FormSchema } from '../src/schema/FormSchema.js';
import type { IAttachmentStoragePort, AttachmentPointer } from '../src/ports/IAttachmentStoragePort.js';
import type { IHapticFeedbackPort } from '../src/ports/IHapticFeedbackPort.js';
import type { IDraftStoragePort } from '../src/ports/IDraftStoragePort.js';

describe('Branch Peeking & Atomic Branch Switching Deep Test Suite', () => {
  const multiBranchSchema: FormSchema = {
    v: '1.0',
    id: 'deep-branching-system',
    tenantId: 'enterprise-triage',
    title: 'Enterprise Incident Mitigation',
    pages: [
      {
        id: 'step-0-tier',
        title: 'Support Tier Selection',
        fields: [
          {
            id: 'f-tier',
            name: 'tier',
            type: 'select',
            label: 'Support Tier',
            required: true,
            order: 0,
            options: [
              { label: 'Community', value: 'community' },
              { label: 'Enterprise Mission Critical', value: 'mission_critical' },
            ],
          },
        ],
        jumpRules: [
          {
            condition: { field: 'tier', operator: 'equals', value: 'mission_critical' },
            targetPageId: 'step-2-escalation',
          },
        ],
        defaultNextPageId: 'step-1-forum',
      },
      {
        id: 'step-1-forum',
        title: 'Community Forum Details',
        fields: [
          {
            id: 'f-forum-post',
            name: 'forumPostUrl',
            type: 'text',
            label: 'Public Forum URL',
            required: true,
            order: 0,
          },
          {
            id: 'f-screenshot',
            name: 'diagnosticLog',
            type: 'text',
            label: 'Diagnostic Log Attachment',
            required: false,
            order: 1,
          },
        ],
        defaultNextPageId: 'step-3-signoff',
      },
      {
        id: 'step-2-escalation',
        title: 'Executive Escalation Bridge',
        fields: [
          {
            id: 'f-sla-level',
            name: 'slaMinutes',
            type: 'number',
            label: 'Contract SLA (Minutes)',
            required: true,
            order: 0,
          },
          {
            id: 'f-war-room',
            name: 'warRoomLink',
            type: 'text',
            label: 'War Room Link',
            required: true,
            order: 1,
          },
        ],
        defaultNextPageId: 'step-3-signoff',
      },
      {
        id: 'step-3-signoff',
        title: 'Incident Resolution Signoff',
        fields: [
          {
            id: 'f-lead-name',
            name: 'leadSignoff',
            type: 'text',
            label: 'Incident Lead Name',
            required: true,
            order: 0,
          },
        ],
      },
    ],
    settings: {},
    createdAt: '2026-10-14T00:00:00.000Z',
    updatedAt: '2026-10-14T00:00:00.000Z',
  };

  it('explainPeekStep returns accurate classification and spoken narrative for all page types', () => {
    const manager = new MultiStepFormManager(multiBranchSchema, vi.fn());

    // 1. Current step (index 0)
    const currentImpact = manager.explainPeekStep(0);
    expect(currentImpact.status).toBe('current');
    expect(currentImpact.canSwitch).toBe(false);
    expect(currentImpact.spokenExplanation).toContain('currently viewing Step 1: Support Tier Selection');

    // 2. Active path step (index 1) - default progression when tier is unset
    const activePathImpact = manager.explainPeekStep(1);
    expect(activePathImpact.status).toBe('active-path');
    expect(activePathImpact.canSwitch).toBe(true);
    expect(activePathImpact.spokenExplanation).toContain('is on your active path');

    // 3. Conditional branch step (index 2) - alternate escalation path
    const conditionalImpact = manager.explainPeekStep(2);
    expect(conditionalImpact.status).toBe('conditional-branch');
    expect(conditionalImpact.isConditional).toBe(true);
    expect(conditionalImpact.isActivePath).toBe(false);
    expect(conditionalImpact.canSwitch).toBe(true);
    expect(conditionalImpact.prerequisites).toHaveLength(1);
    expect(conditionalImpact.prerequisites[0]).toMatchObject({
      field: 'tier',
      expectedValue: 'mission_critical',
      satisfied: false,
    });
    expect(conditionalImpact.spokenExplanation).toContain('alternate conditional branch');
    expect(conditionalImpact.spokenExplanation).toContain('Requires: Support Tier must be \'mission_critical\'');

    // 4. Out of bounds index
    const outOfBoundsImpact = manager.explainPeekStep(99);
    expect(outOfBoundsImpact.status).toBe('unreachable');
    expect(outOfBoundsImpact.canSwitch).toBe(false);
    expect(outOfBoundsImpact.spokenExplanation).toContain('does not exist');
  });

  it('previewBranchSwitch is purely read-only and leaves form state, values, and inspection unchanged', () => {
    const manager = new MultiStepFormManager(multiBranchSchema, vi.fn());
    manager.getFormManager().setFieldValue('tier', 'community');
    manager.nextStep(); // on step 1 (forum)
    manager.getFormManager().setFieldValue('forumPostUrl', 'https://forum.example.com/t/123');

    // Inspect step 2
    manager.peekStep(2);
    const beforeValues = { ...manager.getFormManager().getState().values };

    const preview = manager.previewBranchSwitch(2);
    expect(preview.hasDataLoss).toBe(true);
    expect(preview.prunedFields).toHaveLength(1);
    expect(preview.prunedFields[0].name).toBe('forumPostUrl');

    // Assert zero mutations occurred from preview
    expect(manager.getFormManager().getState().values).toEqual(beforeValues);
    expect(manager.getCurrentPageIndex()).toBe(1);
    expect(manager.isPeeking()).toBe(true);
    expect(manager.getInspectedPageIndex()).toBe(2);
  });

  it('confirmBranchSwitch auto-satisfies prerequisites and purges abandoned downstream attachments via attachmentStorage', async () => {
    const deleteLocalSpy = vi.fn().mockResolvedValue(true);
    const attachmentStorage: IAttachmentStoragePort = {
      saveLocal: vi.fn(),
      loadLocal: vi.fn(),
      deleteLocal: deleteLocalSpy,
      syncToRemote: vi.fn(),
    };

    const prunedCallbackSpy = vi.fn();
    const hapticSpy = vi.fn();
    const hapticPort: IHapticFeedbackPort = {
      trigger: hapticSpy,
    };

    const draftSaveSpy = vi.fn();
    const draftStorage: IDraftStoragePort = {
      saveDraft: draftSaveSpy,
      loadDraft: vi.fn().mockReturnValue(null),
      clearDraft: vi.fn(),
      hasDraft: vi.fn().mockReturnValue(false),
    };

    const manager = new MultiStepFormManager(multiBranchSchema, vi.fn(), {
      security: {
        attachmentStorage,
        onAttachmentPruned: prunedCallbackSpy,
      },
      experience: {
        hapticFeedback: hapticPort,
      },
      resilience: {
        draftStorage,
        autoSaveDraft: true,
      },
    });

    // Advance down community path (step 0 -> step 1)
    manager.getFormManager().setFieldValue('tier', 'community');
    manager.nextStep();
    expect(manager.getCurrentPageIndex()).toBe(1);

    // Populate text and attachment pointer on abandoned branch
    const mockAttachment: AttachmentPointer = {
      id: 'att-diag-999',
      localUri: 'file:///data/user/0/cache/diag.log',
      mimeType: 'text/plain',
      byteSize: 4096,
      fileName: 'diag.log',
    };
    manager.getFormManager().setFieldValue('forumPostUrl', 'https://forum.example.com/topic');
    manager.getFormManager().setFieldValue('diagnosticLog', mockAttachment as any);

    // Peek and switch to Executive Escalation Bridge (step 2)
    manager.peekStep(2);
    const result = manager.confirmBranchSwitch(2, { autoSatisfyPrerequisites: true });

    expect(result.success).toBe(true);
    expect(result.newActiveIndex).toBe(2);
    expect(manager.getCurrentPageIndex()).toBe(2);
    expect(manager.getCurrentPage().id).toBe('step-2-escalation');
    expect(manager.isPeeking()).toBe(false);

    // 1. Prerequisite auto-satisfied
    expect(manager.getFormManager().getState().values.tier).toBe('mission_critical');

    // 2. Downstream fields pruned
    expect(manager.getFormManager().getState().values.forumPostUrl).toBe('');
    expect(manager.getFormManager().getState().values.diagnosticLog).toBe('');

    // 3. Attachment garbage-collection invoked
    expect(prunedCallbackSpy).toHaveBeenCalledWith('diagnosticLog', mockAttachment);
    expect(deleteLocalSpy).toHaveBeenCalledWith('att-diag-999');

    // 4. Haptic feedback triggered
    expect(hapticSpy).toHaveBeenCalledWith('selection');

    // 5. Draft auto-saved on branch switch
    expect(draftSaveSpy).toHaveBeenCalled();
  });

  it('rejects branch switch gracefully if target index is unreachable or current', () => {
    const manager = new MultiStepFormManager(multiBranchSchema, vi.fn());

    // 1. Cannot switch to current step (index 0)
    const resCurrent = manager.confirmBranchSwitch(0);
    expect(resCurrent.success).toBe(false);
    expect(resCurrent.error).toContain('Cannot switch to step 0 with status \'current\'');
    expect(resCurrent.newActiveIndex).toBe(0);

    // 2. Cannot switch to invalid/unreachable index
    const resInvalid = manager.confirmBranchSwitch(99);
    expect(resInvalid.success).toBe(false);
    expect(resInvalid.error).toContain('Cannot switch to step 99 with status \'unreachable\'');
  });

  it('rolls back all mutated fields and state if lifecycle kernel transition fails', () => {
    const manager = new MultiStepFormManager(multiBranchSchema, vi.fn());
    manager.getFormManager().setFieldValue('tier', 'community');
    manager.nextStep();
    manager.getFormManager().setFieldValue('forumPostUrl', 'https://vital-forum-data.com');

    // Simulate lifecycle rejection
    const originalSend = (manager as any).lifecyclePort.send.bind((manager as any).lifecyclePort);
    (manager as any).lifecyclePort.send = vi.fn().mockImplementation((event: any) => {
      if (event.type === 'STEP_JUMP') {
        return { accepted: false, rejectedReason: 'Policy lock violation' };
      }
      return originalSend(event);
    });

    const result = manager.confirmBranchSwitch(2);
    expect(result.success).toBe(false);
    expect(result.rollbackApplied).toBe(true);
    expect(result.error).toContain('Lifecycle kernel rejected transition to branch step');

    // Data perfectly restored
    expect(manager.getCurrentPageIndex()).toBe(1);
    expect(manager.getFormManager().getState().values.tier).toBe('community');
    expect(manager.getFormManager().getState().values.forumPostUrl).toBe('https://vital-forum-data.com');
  });

  it('cancelBranchSwitch returns viewport from peeking back to active editing step', () => {
    const manager = new MultiStepFormManager(multiBranchSchema, vi.fn());
    manager.getFormManager().setFieldValue('tier', 'community');
    manager.nextStep();
    manager.getFormManager().setFieldValue('forumPostUrl', 'https://keep-my-work.com');

    // Start peeking step 2
    manager.peekStep(2);
    expect(manager.isPeeking()).toBe(true);
    expect(manager.getInspectedPageIndex()).toBe(2);

    // User hits cancel
    manager.cancelBranchSwitch();
    expect(manager.isPeeking()).toBe(false);
    expect(manager.getInspectedPageIndex()).toBe(1);
    expect(manager.getCurrentPageIndex()).toBe(1);
    expect(manager.getFormManager().getState().values.forumPostUrl).toBe('https://keep-my-work.com');
  });

  it('honors autoSatisfyPrerequisites: false option without mutating prerequisite values', () => {
    const manager = new MultiStepFormManager(multiBranchSchema, vi.fn());
    manager.getFormManager().setFieldValue('tier', 'community');
    manager.nextStep();

    manager.peekStep(2);
    const result = manager.confirmBranchSwitch(2, { autoSatisfyPrerequisites: false });
    expect(result.success).toBe(true);
    // Tier was NOT modified to mission_critical because autoSatisfyPrerequisites was false
    expect(manager.getFormManager().getState().values.tier).toBe('community');
    expect(manager.getCurrentPageIndex()).toBe(2);
  });

  it('synthesizes spoken branch explanations via ISpeechSynthesisPort for accessible peek narration', () => {
    let speaking = false;
    let spokenText = '';
    const mockSpeechPort: ISpeechSynthesisPort = {
      speak: vi.fn().mockImplementation((text: string) => {
        speaking = true;
        spokenText = text;
      }),
      stop: vi.fn().mockImplementation(() => {
        speaking = false;
      }),
      isSpeaking: vi.fn().mockImplementation(() => speaking),
    };

    const manager = new MultiStepFormManager(multiBranchSchema, vi.fn(), {
      experience: {
        speechSynthesis: mockSpeechPort,
      },
    });

    // Peeking at step 2 (conditional branch)
    manager.peekStep(2);
    expect(manager.isSpeaking()).toBe(false);

    // Speak explanation
    manager.speakPeekExplanation(2);
    expect(mockSpeechPort.speak).toHaveBeenCalledTimes(1);
    expect(spokenText).toContain('Executive Escalation Bridge is an alternate conditional branch');
    expect(spokenText).toContain('Support Tier must be \'mission_critical\'');
    expect(manager.isSpeaking()).toBe(true);

    // Stop speaking
    manager.stopSpeaking();
    expect(mockSpeechPort.stop).toHaveBeenCalledTimes(1);
    expect(manager.isSpeaking()).toBe(false);
  });
});
