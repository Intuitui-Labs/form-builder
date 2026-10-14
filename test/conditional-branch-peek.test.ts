import { describe, it, expect, vi } from 'vitest';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import type { FormSchema } from '../src/schema/FormSchema.js';

describe('Conditional Branch Peeking & Atomic Branch Switching', () => {
  const branchingSchema: FormSchema = {
    v: '1.0',
    id: 'triage-wizard',
    tenantId: 'tenant-devsecops',
    title: 'Incident Triage & Mitigation',
    pages: [
      {
        id: 'step-severity',
        title: 'Severity Classification',
        fields: [
          {
            id: 'f-severity',
            name: 'severity',
            type: 'select',
            label: 'Incident Severity',
            required: true,
            order: 0,
            options: [
              { label: 'P0 - Catastrophic Outage', value: 'P0' },
              { label: 'P1 - High Degradation', value: 'P1' },
            ],
          },
        ],
        jumpRules: [
          {
            condition: { field: 'severity', operator: 'equals', value: 'P0' },
            targetPageId: 'step-war-room',
          },
        ],
        defaultNextPageId: 'step-standard-rca',
      },
      {
        id: 'step-standard-rca',
        title: 'Standard Root Cause Analysis',
        fields: [
          {
            id: 'f-rca',
            name: 'rootCauseNotes',
            type: 'textarea',
            label: 'Root Cause Breakdown',
            required: true,
            order: 0,
          },
          {
            id: 'f-workaround',
            name: 'workaround',
            type: 'text',
            label: 'Temporary Workaround',
            required: false,
            order: 1,
          },
        ],
        defaultNextPageId: 'step-summary',
      },
      {
        id: 'step-war-room',
        title: 'P0 Emergency War Room',
        fields: [
          {
            id: 'f-bridge',
            name: 'bridgeUrl',
            type: 'text',
            label: 'Incident Commander Bridge Link',
            required: true,
            order: 0,
          },
        ],
        defaultNextPageId: 'step-summary',
      },
      {
        id: 'step-summary',
        title: 'Incident Summary & Sign-off',
        fields: [
          {
            id: 'f-commander',
            name: 'incidentCommander',
            type: 'text',
            label: 'Sign-off Commander',
            required: true,
            order: 0,
          },
        ],
      },
    ],
    settings: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('classifies peek branch status accurately between current, active path, and alternate branch', () => {
    const manager = new MultiStepFormManager(branchingSchema, vi.fn());
    // Active step is 0 (Severity Classification)
    expect(manager.getCurrentPageIndex()).toBe(0);
    expect(manager.getPeekBranchStatus(0)).toBe('current');

    // Default severity unset/P1 -> projected path goes to step 1 (Standard RCA)
    expect(manager.getPeekBranchStatus(1)).toBe('active-path');

    // Step 2 (War Room) is an alternate branch reachable only if severity == P0
    expect(manager.getPeekBranchStatus(2)).toBe('conditional-branch');

    // Out of bounds step
    expect(manager.getPeekBranchStatus(99)).toBe('unreachable');
  });

  it('generates rich spoken and structured explanation for alternate conditional branch peeking', () => {
    const manager = new MultiStepFormManager(branchingSchema, vi.fn());
    // Default answers: set severity to P1
    manager.getFormManager().setFieldValue('severity', 'P1');

    // Peek at Step 2 (War Room)
    manager.peekStep(2);
    expect(manager.isPeeking()).toBe(true);
    expect(manager.getInspectedPageIndex()).toBe(2);

    const impact = manager.explainPeekStep(2);
    expect(impact.status).toBe('conditional-branch');
    expect(impact.isConditional).toBe(true);
    expect(impact.isActivePath).toBe(false);
    expect(impact.divergentFromStepIndex).toBe(0);
    expect(impact.divergentFromStepTitle).toBe('Severity Classification');

    // Prerequisite check
    expect(impact.prerequisites.length).toBe(1);
    expect(impact.prerequisites[0].field).toBe('severity');
    expect(impact.prerequisites[0].expectedValue).toBe('P0');
    expect(impact.prerequisites[0].currentValue).toBe('P1');
    expect(impact.prerequisites[0].satisfied).toBe(false);

    // No downstream data yet
    expect(impact.hasDataLoss).toBe(false);
    expect(impact.prunedFields).toHaveLength(0);

    // Spoken guidance
    expect(impact.spokenExplanation).toContain('P0 Emergency War Room is an alternate conditional branch');
    expect(impact.spokenExplanation).toContain("Requires: Incident Severity must be 'P0' (currently 'P1')");
    expect(impact.spokenExplanation).toContain('zero data loss');
  });

  it('detects data loss when downstream fields on the abandoned branch contain user input', () => {
    const manager = new MultiStepFormManager(branchingSchema, vi.fn());

    // 1. User picks P1 and advances to Standard RCA
    manager.getFormManager().setFieldValue('severity', 'P1');
    const advanced = manager.nextStep();
    expect(advanced).toBe(true);
    expect(manager.getCurrentPageIndex()).toBe(1);

    // 2. User fills in downstream fields on Standard RCA
    manager.getFormManager().setFieldValue('rootCauseNotes', 'Database connection pool exhausted due to leak in v2.4');
    manager.getFormManager().setFieldValue('workaround', 'Restarted worker pods');

    // 3. User peeks at Step 2 (P0 Emergency War Room)
    manager.peekStep(2);

    const impact = manager.previewBranchSwitch(2);
    expect(impact.hasDataLoss).toBe(true);
    expect(impact.prunedStepIndices).toContain(1);
    expect(impact.prunedFields).toHaveLength(2);

    const rcaField = impact.prunedFields.find((f) => f.name === 'rootCauseNotes');
    expect(rcaField).toBeDefined();
    expect(rcaField?.label).toBe('Root Cause Breakdown');
    expect(rcaField?.value).toContain('Database connection pool');

    // Spoken explanation warns about the exact discarded fields
    expect(impact.spokenExplanation).toContain('discard 2 answered field(s)');
    expect(impact.spokenExplanation).toContain('Root Cause Breakdown');
    expect(impact.spokenExplanation).toContain('Temporary Workaround');
  });

  it('atomically switches branch, auto-satisfies prerequisites, prunes downstream data, and transitions step', () => {
    const telemetrySpy = vi.fn();
    const manager = new MultiStepFormManager(branchingSchema, vi.fn(), {
      experience: { telemetry: { dispatch: telemetrySpy, flush: vi.fn() } },
    });

    // Start on P1 and enter RCA data on Step 1
    manager.getFormManager().setFieldValue('severity', 'P1');
    manager.nextStep();
    manager.getFormManager().setFieldValue('rootCauseNotes', 'Memory limit exceeded');

    // Peek at War Room (Step 2)
    manager.peekStep(2);
    expect(manager.isPeeking()).toBe(true);

    // Execute atomic switch
    const result = manager.confirmBranchSwitch(2, { autoSatisfyPrerequisites: true });
    expect(result.success).toBe(true);
    expect(result.newActiveIndex).toBe(2);

    // Active state updated
    expect(manager.getCurrentPageIndex()).toBe(2);
    expect(manager.getCurrentPage().id).toBe('step-war-room');
    expect(manager.isPeeking()).toBe(false);

    // Prerequisite auto-satisfied
    expect(manager.getFormManager().getState().values.severity).toBe('P0');

    // Abandoned downstream fields cleanly pruned
    expect(manager.getFormManager().getState().values.rootCauseNotes).toBe('');

    // Telemetry dispatched
    expect(telemetrySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'branch_switched',
        formId: 'triage-wizard',
        fromStep: 1,
        targetStep: 2,
        divergentFromStep: 0,
        prunedFieldsCount: 1,
      })
    );
  });

  it('cancels branch switch cleanly preserving progress and restoring active viewport', () => {
    const manager = new MultiStepFormManager(branchingSchema, vi.fn());
    manager.getFormManager().setFieldValue('severity', 'P1');
    manager.nextStep();
    manager.getFormManager().setFieldValue('rootCauseNotes', 'Preserve my notes!');

    // Peek at War Room
    manager.peekStep(2);
    expect(manager.isPeeking()).toBe(true);

    // User decides to cancel
    manager.cancelBranchSwitch();
    expect(manager.isPeeking()).toBe(false);
    expect(manager.getCurrentPageIndex()).toBe(1);
    expect(manager.getCurrentPage().id).toBe('step-standard-rca');
    expect(manager.getFormManager().getState().values.rootCauseNotes).toBe('Preserve my notes!');
    expect(manager.getFormManager().getState().values.severity).toBe('P1');
  });

  it('safely rolls back if branch transition fails', () => {
    const manager = new MultiStepFormManager(branchingSchema, vi.fn());
    manager.getFormManager().setFieldValue('severity', 'P1');
    manager.nextStep();
    manager.getFormManager().setFieldValue('rootCauseNotes', 'Critical RCA payload');

    // Mock lifecyclePort send to throw
    const originalSend = (manager as any).lifecyclePort.send.bind((manager as any).lifecyclePort);
    (manager as any).lifecyclePort.send = vi.fn().mockImplementation((event: any) => {
      if (event.type === 'STEP_JUMP') {
        return { accepted: false };
      }
      return originalSend(event);
    });

    const result = manager.confirmBranchSwitch(2, { autoSatisfyPrerequisites: true });
    expect(result.success).toBe(false);
    expect(result.rollbackApplied).toBe(true);

    // Values were restored to pre-transaction snapshot
    expect(manager.getFormManager().getState().values.severity).toBe('P1');
    expect(manager.getFormManager().getState().values.rootCauseNotes).toBe('Critical RCA payload');
  });
});
