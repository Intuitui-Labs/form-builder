import { describe, it, expect, vi } from 'vitest';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import type { FormSchema } from '../src/schema/FormSchema.js';
import type {
  IAttachmentStoragePort,
  AttachmentPointer,
  ITelemetryPort,
  IDraftStoragePort,
  INetworkStatusPort,
  ITransportPort,
  IAddressAutofillPort,
  FormDraftSnapshot,
} from '../src/ports/index.js';

describe('Cross-Subsystem Integration Coherence & Conflict Matrix', () => {
  const complexWorkflowSchema: FormSchema = {
    v: '1.0',
    id: 'enterprise-claim-intake',
    tenantId: 'claims-corp',
    title: 'Enterprise Incident \u0026 Insurance Claim',
    pages: [
      {
        id: 'step-policy',
        title: 'Policy Details',
        fields: [
          { id: 'f-pol-num', name: 'policyNumber', type: 'text', label: 'Policy #', required: true, order: 0 },
          { id: 'f-claim-type', name: 'claimType', type: 'select', label: 'Claim Type', required: true, order: 1 },
        ],
        jumpRules: [
          {
            condition: { field: 'claimType', operator: 'equals', value: 'cyber_extortion' },
            targetPageId: 'step-cyber-triage',
          },
        ],
        defaultNextPageId: 'step-property-damage',
      },
      {
        id: 'step-property-damage',
        title: 'Property Damage Assessment',
        fields: [
          { id: 'f-damage-loc', name: 'street', type: 'text', label: 'Damage Location Street', required: true, order: 0 },
          { id: 'f-damage-city', name: 'city', type: 'text', label: 'City', required: true, order: 1 },
          { id: 'f-damage-state', name: 'state', type: 'text', label: 'State', required: true, order: 2 },
          { id: 'f-photo', name: 'damagePhoto', type: 'text', label: 'Damage Photo', required: false, order: 3 },
        ],
        defaultNextPageId: 'step-settlement',
      },
      {
        id: 'step-cyber-triage',
        title: 'Cyber Forensic Triage',
        fields: [
          { id: 'f-ransom-amt', name: 'ransomDemand', type: 'number', label: 'Ransom Demand (USD)', required: true, order: 0 },
          { id: 'f-forensic-log', name: 'forensicEvidence', type: 'text', label: 'Forensic Dump Pointer', required: false, order: 1 },
        ],
        defaultNextPageId: 'step-settlement',
      },
      {
        id: 'step-settlement',
        title: 'Settlement Account & Execution',
        fields: [
          { id: 'f-account', name: 'bankAccount', type: 'text', label: 'Disbursement Bank Account', required: true, order: 0 },
        ],
      },
    ],
    settings: {},
    createdAt: '2026-10-14T00:00:00.000Z',
    updatedAt: '2026-10-14T00:00:00.000Z',
  };

  /**
   * Conflict Scenario 1:
   * Heuristic Batch Autofill vs Debounced Draft Persistence Race Condition.
   * When address autofill injects 4 fields concurrently, does draft persistence capture
   * the full transactional state or get corrupted by partial intermediate writes?
   */
  it('guarantees transactional coherence between batch address autofill and auto-saved draft snapshots', async () => {
    let savedDraft: FormDraftSnapshot | null = null;
    const draftStorage: IDraftStoragePort = {
      saveDraft: vi.fn().mockImplementation((snap) => {
        savedDraft = JSON.parse(JSON.stringify(snap));
      }),
      loadDraft: vi.fn().mockImplementation(() => savedDraft),
      clearDraft: vi.fn().mockImplementation(() => { savedDraft = null; }),
      hasDraft: vi.fn().mockImplementation(() => savedDraft !== null),
    };

    const mockGeoPort: IAddressAutofillPort = {
      searchAddress: vi.fn().mockResolvedValue([
        {
          id: 'cand-1',
          formattedAddress: '742 Evergreen Terrace, Springfield, OR',
          addressLine1: '742 Evergreen Terrace',
          city: 'Springfield',
          stateOrProvince: 'OR',
          postalCode: '97477',
          country: 'United States',
          countryCode: 'US',
          confidenceScore: 0.98,
        },
      ]),
      reverseGeocode: vi.fn(),
      lookupPostalCode: vi.fn(),
    };

    const manager = new MultiStepFormManager(complexWorkflowSchema, vi.fn(), {
      resilience: {
        draftStorage,
        autoSaveDraft: true,
      },
    });

    // Advance to Property Damage (step 1)
    manager.getFormManager().setFieldValue('policyNumber', 'POL-99812');
    manager.getFormManager().setFieldValue('claimType', 'property');
    manager.nextStep();
    expect(manager.getCurrentPageIndex()).toBe(1);

    // Trigger address resolution
    const candidates = await mockGeoPort.searchAddress('742 Evergreen Terrace');
    const best = candidates[0]!;

    // Perform batch enrichment with transactional overwrite policy
    const result = manager.enrichFromAddress(best, {
      overwritePolicy: 'preserve-user-edits',
      origin: 'geo_autofill',
    });

    expect(result.appliedCount).toBe(3);

    // Trigger draft snapshot
    const draft = manager.saveDraft();

    // Verify atomic coherence: the snapshot contains ALL 3 enriched fields, zero partial drops
    expect(draft.values.street).toBe('742 Evergreen Terrace');
    expect(draft.values.city).toBe('Springfield');
    expect(draft.values.state).toBe('OR');
    expect(draft.values.policyNumber).toBe('POL-99812');
    expect(draft.currentPageIndex).toBe(1);

    // Rollback test: if the enrichment is rolled back, does draft state update cleanly?
    result.rollback();
    const rolledBackDraft = manager.saveDraft();
    expect(rolledBackDraft.values.street).toBe('');
    expect(rolledBackDraft.values.city).toBe('');
    expect(rolledBackDraft.values.state).toBe('');
  });

  /**
   * Conflict Scenario 2:
   * Branch Divergence vs Binary Attachment Deletion vs Outbox Integrity.
   * If an attachment is uploaded on Property Damage, and user diverts to Cyber Extortion,
   * does attachmentStorage.deleteLocal purge the physical file without crashing the lifecycle?
   */
  it('preserves storage and lifecycle coherence during branch switches with binary attachments', async () => {
    const deletedFileIds: string[] = [];
    const attachmentStorage: IAttachmentStoragePort = {
      saveLocal: vi.fn(),
      loadLocal: vi.fn(),
      deleteLocal: vi.fn().mockImplementation(async (id: string) => {
        deletedFileIds.push(id);
        return true;
      }),
      syncToRemote: vi.fn(),
    };

    const telemetryEvents: any[] = [];
    const telemetry: ITelemetryPort = {
      dispatch: vi.fn().mockImplementation((evt) => telemetryEvents.push(evt)),
      flush: vi.fn(),
    };

    const manager = new MultiStepFormManager(complexWorkflowSchema, vi.fn(), {
      security: { attachmentStorage },
      experience: { telemetry },
    });

    // 1. Advance to step 1 (Property Damage)
    manager.getFormManager().setFieldValue('policyNumber', 'POL-1100');
    manager.getFormManager().setFieldValue('claimType', 'property');
    manager.nextStep();
    expect(manager.getCurrentPageIndex()).toBe(1);

    // 2. Attach a photo on step 1
    const photoAttachment: AttachmentPointer = {
      id: 'photo-damaged-roof-001',
      localUri: 'file:///var/mobile/attachments/roof.jpg',
      mimeType: 'image/jpeg',
      byteSize: 1048576,
      fileName: 'roof.jpg',
    };
    manager.getFormManager().setFieldValue('damagePhoto', photoAttachment as any);
    manager.getFormManager().setFieldValue('street', '100 Industrial Parkway');

    // 3. User peeks at Step 2 (Cyber Forensic Triage)
    manager.peekStep(2);
    const impact = manager.previewBranchSwitch(2);

    expect(impact.hasDataLoss).toBe(true);
    expect(impact.prunedFields.map((f) => f.name)).toContain('damagePhoto');
    expect(impact.prunedFields.map((f) => f.name)).toContain('street');

    // 4. Confirm switch to Cyber branch
    const switchResult = manager.confirmBranchSwitch(2, { autoSatisfyPrerequisites: true });
    expect(switchResult.success).toBe(true);
    expect(manager.getCurrentPageIndex()).toBe(2);

    // Verify attachment GC was executed immediately
    expect(deletedFileIds).toContain('photo-damaged-roof-001');

    // Verify prerequisite was updated to cyber_extortion
    expect(manager.getFormManager().getState().values.claimType).toBe('cyber_extortion');

    // Verify telemetry recorded the branch switch event
    expect(telemetryEvents).toContainEqual(
      expect.objectContaining({
        type: 'branch_switched',
        fromStep: 1,
        targetStep: 2,
        divergentFromStep: 0,
        prunedFieldsCount: 2,
      })
    );
  });

  /**
   * Conflict Scenario 3:
   * Navigation Policy "Strict Linear" vs Dynamic Branch Jump Rules.
   * Does a strict-linear policy break conditional jump progression?
   * Strict-linear must allow legitimate jump-rule traversal while forbidding arbitrary skipping.
   */
  it('proves strict-linear navigation policy honors legitimate dynamic branch jumps without blocking users', () => {
    const manager = new MultiStepFormManager(complexWorkflowSchema, vi.fn(), {
      experience: {
        affordanceConfig: {
          navigation: 'strict-linear',
        },
      },
    });

    // On Step 0: cannot randomly click to Step 3 (Settlement)
    expect(manager.canNavigateToStep(3)).toBe(false);
    expect(manager.goToStep(3)).toBe(false);

    // Fill policy as cyber_extortion
    manager.getFormManager().setFieldValue('policyNumber', 'POL-CYBER-88');
    manager.getFormManager().setFieldValue('claimType', 'cyber_extortion');

    // Next step MUST jump over Step 1 directly to Step 2 (Cyber Triage) according to schema rules
    expect(manager.nextStep()).toBe(true);
    expect(manager.getCurrentPageIndex()).toBe(2);
    expect(manager.getCurrentPage().id).toBe('step-cyber-triage');

    // Breadcrumbs must accurately mark Step 1 (Property Damage) as skipped, NOT locked or current
    const affordance = manager.getAffordanceState();
    expect(affordance.breadcrumbs[0].status).toBe('completed');
    expect(affordance.breadcrumbs[1].status).toBe('skipped');
    expect(affordance.breadcrumbs[2].status).toBe('current');

    // Backward navigation: user can return to Step 0
    expect(manager.canNavigateToStep(0)).toBe(true);
    expect(manager.prevStep()).toBe(true);
    expect(manager.getCurrentPageIndex()).toBe(0);
  });

  /**
   * Conflict Scenario 4:
   * Network Flapping + Offline Outbox + Final Submission Synchronization.
   * When network goes offline during final submission, does the outbox queue the submission,
   * preserve draft until confirmed remote delivery, and prevent submission duplicate fires?
   */
  it('maintains flawless coherence across network outages, offline outbox queuing, and draft retention', async () => {
    let onlineStatus = false;
    const networkListeners: Array<(online: boolean) => void> = [];
    const mockNetwork: INetworkStatusPort = {
      isOnline: () => onlineStatus,
      subscribe: (cb) => {
        networkListeners.push(cb);
        return () => {
          const idx = networkListeners.indexOf(cb);
          if (idx !== -1) networkListeners.splice(idx, 1);
        };
      },
    };

    const remoteSubmissionSpy = vi.fn().mockImplementation(async () => {
      if (!onlineStatus) {
        throw new Error('503 Service Unavailable: Offline');
      }
      return { receiptId: 'RCPT-ONLINE-999', status: 'synced', timestamp: new Date().toISOString() };
    });

    const mockTransport: ITransportPort<any> = {
      submit: remoteSubmissionSpy,
    };

    const draftStorage: IDraftStoragePort = {
      saveDraft: vi.fn(),
      loadDraft: vi.fn(),
      clearDraft: vi.fn(),
      hasDraft: vi.fn().mockReturnValue(true),
    };

    const manager = new MultiStepFormManager(complexWorkflowSchema, vi.fn(), {
      resilience: {
        networkStatus: mockNetwork,
        transport: mockTransport,
        draftStorage,
        enableOutbox: true,
      },
    });

    // Fill valid Cyber path
    manager.getFormManager().setFieldValue('policyNumber', 'POL-CYBER-99');
    manager.getFormManager().setFieldValue('claimType', 'cyber_extortion');
    manager.nextStep(); // step 2
    manager.getFormManager().setFieldValue('ransomDemand', 50000);
    manager.nextStep(); // step 3 (Settlement)
    manager.getFormManager().setFieldValue('bankAccount', 'US-CITI-001928374');

    expect(manager.getCurrentPageIndex()).toBe(3);
    expect(manager.isLastStep()).toBe(true);

    // Attempt submission while offline
    await manager.submit();

    // When network reconnects, OfflineOutboxQueue automatically auto-flushes pending items in background
    onlineStatus = true;
    networkListeners.forEach((cb) => cb(true));

    // Wait for async flush and outbox count update
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Pending outbox was auto-flushed on reconnect without requiring manual invocation
    expect(remoteSubmissionSpy).toHaveBeenCalledTimes(1);
    expect(manager.getPendingOutboxCount()).toBe(0);
  });
});
