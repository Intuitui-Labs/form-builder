import { describe, it, expect, vi } from 'vitest';
import {
  AttemptReservationCoordinator,
  AdmissionRecoveryOrchestrator,
  ConstructMeasurementEngine,
  SurveySchemaConverter,
  OfflineOutboxQueue,
  type IStoragePort,
  type IAttemptReservationPort,
  type ITransportPort,
  type SubmissionEnvelope,
} from '../../src/index.js';

function createMockStorage(initial: Record<string, string> = {}): IStoragePort & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
    clear: async () => { values.clear(); },
  };
}

describe('Hostile Architectural Operationalization: Attempt Lifecycle & Psychometrics', () => {
  it('Hostile Test 1: AttemptReservationCoordinator times out gracefully and resumes offline from sanitized cache', async () => {
    const storage = createMockStorage();
    const formId = 'research_survey_99';
    const ownerKey = 'user_123';
    const scopeId = 'lab_alpha';

    // Seed existing stored attempt and cached metadata with sensitive credentials
    const attemptKey = `intuitui_form_attempt:v1:${encodeURIComponent(ownerKey)}:${encodeURIComponent(scopeId)}:${encodeURIComponent(formId)}`;
    const cacheKey = `intuitui_form_meta:v1:${encodeURIComponent(formId)}`;
    await storage.setItem(attemptKey, 'att_cached_999');
    await storage.setItem(cacheKey, JSON.stringify({
      id: formId,
      policyVersion: '1.0.0',
      title: 'Cached Survey',
      csrfToken: 'stale_csrf_secret',
      accessGrant: 'stale_bearer_token',
    }));

    // Transport port hangs indefinitely to simulate offline/network failure
    const reservationPort: IAttemptReservationPort = {
      startAttempt: () => new Promise(() => {}), // Never resolves
    };

    const coordinator = new AttemptReservationCoordinator({
      storage,
      reservationPort,
      timeoutMs: 50, // Rapid hostile timeout
    });

    const result = await coordinator.prepareAttempt({
      formId,
      ownerKey,
      scopeId,
      initialMeta: { id: formId, title: 'Fresh Survey', csrfToken: 'secret_leak' },
    });

    expect(result.status).toBe('offline_resumed');
    expect(result.resumed).toBe(true);
    expect(result.attemptId).toBe('att_cached_999');
    expect(result.policyVersion).toBe('1.0.0');

    // SRE Guard: Verify sensitive tokens were completely redacted from offline storage cache
    const cachedStored = JSON.parse((await storage.getItem(cacheKey))!);
    expect(cachedStored.csrfToken).toBeUndefined();
    expect(cachedStored.accessGrant).toBeUndefined();
  });

  it('Hostile Test 2: AttemptReservationCoordinator recovers from policy drift and terminal attempts', async () => {
    const storage = createMockStorage();
    const formId = 'evolving_form';
    const ownerKey = 'guest_456';

    let attemptCallCount = 0;
    const reservationPort: IAttemptReservationPort = {
      startAttempt: async (fId, attId) => {
        attemptCallCount++;
        if (attemptCallCount === 1) {
          const err = new Error('Policy outdated on server');
          Object.assign(err, { status: 400, code: 'policy_changed' });
          throw err;
        }
        return {
          attemptId: 'att_renewed_001',
          policyVersion: '2.0.0',
          resumed: false,
        };
      },
    };

    const coordinator = new AttemptReservationCoordinator({
      storage,
      reservationPort,
    });

    // 1. Without policy confirmation: must flag policy_confirmation_required
    const unconfirmed = await coordinator.prepareAttempt({
      formId,
      ownerKey,
      initialMeta: { id: formId },
      confirmPolicyChange: false,
    });
    expect(unconfirmed.status).toBe('policy_confirmation_required');

    // 2. With confirmation: automatically reserves fresh attempt
    const confirmed = await coordinator.prepareAttempt({
      formId,
      ownerKey,
      initialMeta: { id: formId },
      confirmPolicyChange: true,
    });
    expect(confirmed.status).toBe('active');
    expect(confirmed.attemptId).toBe('att_renewed_001');
    expect(confirmed.policyVersion).toBe('2.0.0');
  });

  it('Hostile Test 3: AdmissionRecoveryOrchestrator recovers DLQ response, rebinds context, and retries with stable ID', async () => {
    const storage = createMockStorage();
    const submissionId = 'sub_idempotent_immutable_77';
    const formId = 'gated_exam';

    const deadItem = {
      envelope: {
        id: submissionId,
        formId,
        values: { q1: 'answer' },
        submittedAt: new Date().toISOString(),
        retryCount: 5,
        context: {
          scopeId: 'old_scope',
          transportMetadata: { attemptId: 'old_attempt' },
        },
      },
      queuedAt: Date.now(),
      lastError: '403 Access code required',
      lastErrorCode: 'access_code_required',
    };
    await storage.setItem('intuitui_outbox_queue_dlq', JSON.stringify([deadItem]));

    const submitSpy = vi.fn().mockResolvedValue({
      receiptId: 'rec_ok_77',
      status: 'accepted',
      timestamp: new Date().toISOString(),
    });

    const transport: ITransportPort = { submit: submitSpy };
    const outbox = new OfflineOutboxQueue({ storage, transport });

    const recoveryResult = await AdmissionRecoveryOrchestrator.recoverAdmissionDenied(outbox, {
      formId,
      scopeId: 'new_authorized_scope',
      attemptId: 'att_fresh_88',
      policyVersion: '3.0.0',
    });

    expect(recoveryResult.status).toBe('synced');
    expect(recoveryResult.submissionId).toBe(submissionId);

    // Verify submission sent to transport retains the exact immutable ID
    expect(submitSpy).toHaveBeenCalledTimes(1);
    const deliveredEnvelope = submitSpy.mock.calls[0][0] as SubmissionEnvelope;
    expect(deliveredEnvelope.id).toBe(submissionId);
    expect(deliveredEnvelope.policyVersion).toBe('3.0.0');
    expect(deliveredEnvelope.context?.scopeId).toBe('new_authorized_scope');
    expect(deliveredEnvelope.context?.transportMetadata?.attemptId).toBe('att_fresh_88');

    // Verify DLQ is now empty
    const dlq = await outbox.getDeadLetterQueue();
    expect(dlq).toHaveLength(0);
  });

  it('Hostile Test 4: ConstructMeasurementEngine handles sparse answers and divide-by-zero bounds gracefully', () => {
    const engine = new ConstructMeasurementEngine({
      instrument: 'Test Scale',
      constructs: [
        { id: 'ease', label: 'Perceived Ease' },
        { id: 'usefulness', label: 'Perceived Usefulness' },
      ],
      items: [
        { field: 'e1', constructId: 'ease', scaleMin: 1, scaleMax: 5 },
        { field: 'e2', constructId: 'ease', scaleMin: 1, scaleMax: 5 },
        { field: 'u1', constructId: 'usefulness', scaleMin: 1, scaleMax: 5 },
      ],
    });

    // Case 1: Completely empty answers
    const emptyReport = engine.score({});
    expect(emptyReport.overallScore).toBe(0);
    expect(emptyReport.answeredItems).toBe(0);
    expect(emptyReport.completionPercent).toBe(0);
    expect(emptyReport.constructs[0].score).toBe(0);
    expect(emptyReport.constructs[0].distribution).toEqual([0, 0, 0, 0, 0]);

    // Case 2: Partial answers with maximum score
    const report = engine.score({ e1: 5, e2: 5 }); // Ease answered (100%), Usefulness empty
    expect(report.answeredItems).toBe(2);
    expect(report.totalItems).toBe(3);
    expect(report.completionPercent).toBeCloseTo(66.7, 1);
    expect(report.constructs[0].score).toBe(100);
    expect(report.constructs[0].interpretation).toBe('outstanding');
    expect(report.constructs[0].distribution).toEqual([0, 0, 0, 0, 2]); // two 5s
    expect(report.constructs[1].score).toBe(0); // empty construct
  });

  it('Hostile Test 5: ConstructMeasurementEngine calculates Cronbach Alpha with Bessel correction and guards zero variance', () => {
    const engine = new ConstructMeasurementEngine({
      constructs: [{ id: 'dim1', label: 'Dimension 1' }],
      items: [
        { field: 'q1', constructId: 'dim1' },
        { field: 'q2', constructId: 'dim1' },
      ],
    });

    // Consistent ratings across respondents with high variance between items
    const highReliabilityMatrix = [
      [5, 5, 4],
      [4, 4, 4],
      [5, 5, 5],
      [1, 1, 2],
      [2, 2, 1],
    ];

    const relResult = engine.computeReliability({ dim1: highReliabilityMatrix });
    expect(relResult.dim1.alpha).toBeGreaterThanOrEqual(0.85);
    expect(relResult.dim1.interpretation).toMatch(/reliability/i);
    expect(relResult.dim1.sampleCount).toBe(5);

    // Zero variance (all respondents gave identical answers) must not divide by zero
    const zeroVarMatrix = [
      [3, 3],
      [3, 3],
      [3, 3],
    ];
    const zeroVarResult = engine.computeReliability({ dim1: zeroVarMatrix });
    expect(zeroVarResult.dim1.alpha).toBe(0.0);
    expect(zeroVarResult.dim1.interpretation).toMatch(/Zero variance/i);
  });

  it('Hostile Test 6: SurveySchemaConverter compiles external question CMS definitions into executable FormSchema', () => {
    const schema = SurveySchemaConverter.convert({
      id: 'ext_survey_001',
      title: 'Customer Experience Survey',
      description: 'Annual NPS and Usability audit',
      maxQuestionsPerPage: 2,
      access_policy: {
        allow_redo: false,
        max_attempts: 1,
        reward_strategy: 'first_attempt_only',
        cooldown_minutes: 60,
        version: 'v1.4',
      },
      questions: [
        { id: 1, code: 'PEU1', text: 'Easy to navigate?', type: 'likert', ratingMax: 5, construct: 'ease' },
        { id: 2, code: 'PEU2', text: 'Clear instructions?', type: 'likert', ratingMax: 5, construct: 'ease' },
        { id: 3, code: 'USE1', text: 'Valuable service?', type: 'likert', ratingMax: 5, construct: 'usefulness' },
        { id: 4, code: 'COMM', text: 'Additional feedback', type: 'open' },
        {
          id: 5,
          code: 'PLAN',
          text: 'Subscription tier',
          type: 'mcq',
          options: [{ id: 'free', text: 'Free' }, { id: 'pro', text: 'Pro' }],
        },
      ],
    });

    expect(schema.id).toBe('ext_survey_001');
    expect(schema.title).toBe('Customer Experience Survey');
    expect(schema.accessPolicy?.allowRedo).toBe(false);
    expect(schema.accessPolicy?.maxAttempts).toBe(1);
    expect(schema.accessPolicy?.version).toBe('v1.4');

    // Welcome cover + 3 question pages (chunked at max 2 per page)
    expect(schema.pages).toHaveLength(4);
    expect(schema.pages[0].role).toBe('cover');
    expect(schema.pages[1].fields).toHaveLength(2);
    expect(schema.pages[1].fields[0].type).toBe('likert');
    expect(schema.pages[1].fields[0].helperText).toBe('1 = Strongly Disagree · 5 = Strongly Agree');

    // Test that ConstructMeasurementEngine can introspect the converted schema directly!
    const engine = ConstructMeasurementEngine.fromSchema(schema);
    const scoreReport = engine.score({ PEU1: 5, PEU2: 5, USE1: 4 });
    expect(scoreReport.constructs).toHaveLength(2); // ease, usefulness
    expect(scoreReport.constructs[0].constructId).toBe('ease');
    expect(scoreReport.constructs[0].score).toBe(100);
    expect(scoreReport.constructs[1].constructId).toBe('usefulness');
    expect(scoreReport.constructs[1].score).toBe(80);
    expect(scoreReport.overallScore).toBe(90);
  });
});
