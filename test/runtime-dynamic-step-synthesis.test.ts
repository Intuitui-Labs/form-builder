import { describe, it, expect, vi } from 'vitest';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import type { FormSchema, FormPage } from '../src/schema/FormSchema.js';
import type { IAdaptiveStepOraclePort } from '../src/ports/IAdaptiveStepOraclePort.js';

describe('Runtime Generative Step Synthesis & Adaptive Oracle Seam', () => {
  const createBaseWorkflowSchema = (): FormSchema => ({
    v: '1.0',
    id: 'workflow-dynamic-triage',
    tenantId: 'tenant-clinical',
    title: 'Adaptive Clinical Intake',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pages: [
      {
        id: 'page-intake',
        title: 'Initial Intake',
        fields: [
          { id: 'f-symptom', name: 'primary_symptom', type: 'text', label: 'Chief Complaint', required: true, order: 1 },
          { id: 'f-severity', name: 'severity_scale', type: 'number', label: 'Severity (1-10)', required: true, order: 2 },
        ],
      },
      {
        id: 'page-summary',
        title: 'Intake Summary',
        fields: [
          { id: 'f-notes', name: 'general_notes', type: 'text', label: 'Additional Notes', required: false, order: 1 },
        ],
      },
    ],
  });

  it('injects dynamic page at designated position and binds fields dynamically to form state', () => {
    const manager = new MultiStepFormManager(createBaseWorkflowSchema(), vi.fn());

    expect(manager.getTotalPages()).toBe(2);
    expect(manager.getState().values).toEqual({
      primary_symptom: '',
      severity_scale: null,
      general_notes: '',
    });

    const dynamicBiomarkerPage: FormPage = {
      id: 'page-biomarkers',
      title: 'Biomarker Diagnostics',
      fields: [
        { id: 'f-o2', name: 'blood_oxygen', type: 'number', label: 'SpO2 Percentage', required: true, order: 1 },
      ],
    };

    const injectResult = manager.injectDynamicPage(dynamicBiomarkerPage, { afterPageId: 'page-intake' });
    expect(injectResult).toBe(true);
    expect(manager.getTotalPages()).toBe(3);

    // FormManager DAG must have dynamically registered blood_oxygen
    const updatedValues = manager.getState().values;
    expect(updatedValues).toHaveProperty('blood_oxygen');

    // Fill in fields and verify values update without resetting other fields
    manager.setFieldValue('primary_symptom' as any, 'Shortness of breath');
    manager.setFieldValue('severity_scale' as any, 4);
    manager.setFieldValue('blood_oxygen' as any, 91);

    expect((manager.getState().values as any).primary_symptom).toBe('Shortness of breath');
    expect((manager.getState().values as any).severity_scale).toBe(4);
    expect((manager.getState().values as any).blood_oxygen).toBe(91);

    // Navigate to dynamic page
    const navSuccess = manager.nextStep();
    expect(navSuccess).toBe(true);
    expect(manager.getCurrentPage().id).toBe('page-biomarkers');
    expect(manager.getCurrentPage().title).toBe('Biomarker Diagnostics');
  });

  it('replaces dynamic branch and cleans up obsolete field registrations', () => {
    const manager = new MultiStepFormManager(createBaseWorkflowSchema(), vi.fn());

    manager.setFieldValue('primary_symptom' as any, 'Chest Pressure');
    manager.setFieldValue('severity_scale' as any, 9);

    const cardiologyBranch: FormPage[] = [
      {
        id: 'page-ecg-deepdive',
        title: 'ECG Analysis',
        fields: [
          { id: 'f-st', name: 'st_elevation_detected', type: 'checkbox', label: 'ST Elevation Observed', required: true, order: 1 },
        ],
      },
      {
        id: 'page-cath-lab',
        title: 'Immediate Cath Lab Prep',
        fields: [
          { id: 'f-npo', name: 'npo_status_hours', type: 'number', label: 'Hours NPO', required: true, order: 1 },
        ],
      },
    ];

    const branchResult = manager.replaceDynamicBranch('page-intake', cardiologyBranch);
    expect(branchResult).toBe(true);
    expect(manager.getTotalPages()).toBe(3); // page-intake + 2 cardiology pages

    const currentValues = manager.getState().values;
    // Replaced page-summary field should have been unregistered
    expect(currentValues).not.toHaveProperty('general_notes');
    // New cardiology branch fields should be registered
    expect(currentValues).toHaveProperty('st_elevation_detected');
    expect(currentValues).toHaveProperty('npo_status_hours');
    // Prior input must be fully preserved
    expect((currentValues as any).primary_symptom).toBe('Chest Pressure');
  });

  it('removes dynamic page and deregisters its fields from form state', () => {
    const manager = new MultiStepFormManager(createBaseWorkflowSchema(), vi.fn());

    const temporaryPage: FormPage = {
      id: 'page-temp-screening',
      title: 'Temporary Screening',
      fields: [
        { id: 'f-temp', name: 'body_temp_f', type: 'number', label: 'Body Temperature (F)', required: true, order: 1 },
      ],
    };

    const injectResult = manager.injectDynamicPage(temporaryPage);
    expect(injectResult).toBe(true);
    expect(manager.getTotalPages()).toBe(3);
    expect(manager.getState().values).toHaveProperty('body_temp_f');

    const removeResult = manager.removeDynamicPage('page-temp-screening');
    expect(removeResult).toBe(true);
    expect(manager.getTotalPages()).toBe(2);
    expect(manager.getState().values).not.toHaveProperty('body_temp_f');
  });

  it('autonomously synthesizes and jumps to AI-generated page via nextStepAsync and IAdaptiveStepOraclePort', async () => {
    const mockOracle: IAdaptiveStepOraclePort = {
      providerId: 'clinical-stat-oracle-v1',
      evaluateNextStep: vi.fn().mockImplementation(async (context) => {
        if (context.completedPage.id === 'page-intake' && Number(context.currentValues.severity_scale) >= 8) {
          return {
            action: 'inject_step',
            page: {
              id: 'page-stat-icu-alert',
              title: 'STAT Intensive Care Triage',
              fields: [
                {
                  id: 'f-icu-bed',
                  name: 'assigned_icu_bed',
                  type: 'text',
                  label: 'Assigned ICU Bed Unit',
                  required: true,
                  order: 1,
                },
              ],
            },
          };
        }
        return { action: 'continue' };
      }),
    };

    const manager = new MultiStepFormManager(createBaseWorkflowSchema(), vi.fn(), {
      experience: {
        adaptiveStepOracle: mockOracle,
      },
    });

    // Populate severe symptom values
    manager.setFieldValue('primary_symptom' as any, 'Acute respiratory failure');
    manager.setFieldValue('severity_scale' as any, 9);

    // Call async step transition
    const stepResult = await manager.nextStepAsync();

    expect(stepResult).toBe(true);
    expect(mockOracle.evaluateNextStep).toHaveBeenCalledTimes(1);
    expect(manager.getCurrentPage().id).toBe('page-stat-icu-alert');
    expect(manager.getCurrentPage().title).toBe('STAT Intensive Care Triage');
    expect(manager.getState().values).toHaveProperty('assigned_icu_bed');

    // On second step, set required field and proceed -> oracle returns continue -> standard page
    manager.setFieldValue('assigned_icu_bed' as any, 'ICU-WEST-3');
    const nextStepResult = await manager.nextStepAsync();
    expect(nextStepResult).toBe(true);
    expect(manager.getCurrentPage().id).toBe('page-summary');
  });

  it('gracefully degrades to standard navigation when IAdaptiveStepOraclePort throws an error', async () => {
    const failingOracle: IAdaptiveStepOraclePort = {
      providerId: 'flaky-llm-service',
      evaluateNextStep: vi.fn().mockRejectedValue(new Error('LLM Gateway 504 Gateway Timeout')),
    };

    const manager = new MultiStepFormManager(createBaseWorkflowSchema(), vi.fn(), {
      experience: {
        adaptiveStepOracle: failingOracle,
      },
    });

    manager.setFieldValue('primary_symptom' as any, 'Mild headache');
    manager.setFieldValue('severity_scale' as any, 2);

    // Should not crash, should fall back to standard nextStep()
    const result = await manager.nextStepAsync();
    expect(result).toBe(true);
    expect(manager.getCurrentPage().id).toBe('page-summary');
  });
});
