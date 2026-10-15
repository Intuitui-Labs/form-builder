import { describe, it, expect, vi } from 'vitest';
import {
  createFormStudioStore,
  StudioShareCodec,
} from '../../src/studio/index.js';
import {
  MultiStepFormManager,
  type FormSchema,
  type ITelemetryPort,
  type FormTelemetryEvent,
  type IStoragePort,
} from '../../src/index.js';
import { OfflineOutboxQueue } from '../../src/persistence/index.js';
import { AnalyticsEngine } from '../../src/analytics/index.js';
import { MemoryStorageAdapter } from '../../src/adapters/index.js';

describe('Hostile Studio Sharing, Persistence & Analytics Operationalization', () => {
  it('Hostile Vector 1: Malformed, Truncated & Corrupted Shared URL Resilience', () => {
    // 1. Completely bogus base64
    const corrupt1 = StudioShareCodec.decodeFromSlug('not-a-valid-base64-@@@@');
    expect(corrupt1.success).toBe(false);
    expect(corrupt1.error).toBeDefined();

    // 2. Truncated base64 payload (e.g. cut off by browser URL limit or messaging app)
    const store = createFormStudioStore();
    const validSlug = StudioShareCodec.encodeToSlug(store.toFormSchema());
    const truncatedSlug = validSlug.substring(0, Math.floor(validSlug.length / 2));

    const corrupt2 = StudioShareCodec.decodeFromSlug(truncatedSlug);
    expect(corrupt2.success).toBe(false);

    // 3. Valid JSON but missing required FormSchema structure (e.g. empty object)
    const emptyObjectSlug = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url');
    const corrupt3 = StudioShareCodec.decodeFromSlug(emptyObjectSlug);
    expect(corrupt3.success).toBe(false);
    expect(corrupt3.error).toContain('missing pages array');

    // 4. URL extraction fallback on missing param
    const extractNone = StudioShareCodec.extractFromUrl('https://app.intuitui.local/studio');
    expect(extractNone.success).toBe(false);
  });

  it('Hostile Vector 2: Poisoned Schema Script Injection Defense (Zero-Day XSS Defanging)', () => {
    // Adversary crafts a schema with nested script tags and javascript pseudo-protocols
    const poisonedSchema: FormSchema = {
      id: 'poison-1',
      title: 'Harmless Form <scr<script>ipt>alert("pwned")</script>',
      description: 'Click here [Reward](javascript:stealCookies())',
      pages: [
        {
          id: 'step-1',
          title: 'Step 1 <img src="x" onerror="malicious()"/>',
          fields: [
            {
              id: 'q1',
              name: 'q1',
              type: 'text',
              label: 'Enter email <script>fetch("/exfil?c=" + document.cookie)</script>',
              placeholder: 'name <iframe src="evil.com"></iframe>',
            },
          ],
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const slug = StudioShareCodec.encodeToSlug(poisonedSchema);
    const url = `https://forms.intuitui.local/fill#f=${slug}`;

    const decoded = StudioShareCodec.extractFromUrl(url);
    expect(decoded.success).toBe(true);
    expect(decoded.schema).toBeDefined();

    const clean = decoded.schema!;
    // Invariant: script tags, error handlers, and dangerous protocols MUST be eliminated
    expect(clean.title).not.toContain('<script');
    expect(clean.title).not.toContain('alert');
    expect(clean.description).not.toContain('javascript:');
    expect(clean.pages[0]!.title).not.toContain('onerror');
    expect(clean.pages[0]!.fields[0]!.label).not.toContain('<script');
    expect(clean.pages[0]!.fields[0]!.placeholder).not.toContain('<iframe');
  });

  it('Hostile Vector 3: Studio Test Drive to Outbox Persistence Pipeline (Zero Data Loss)', async () => {
    // Author creates a 2-step form in the Studio
    const store = createFormStudioStore();
    const p1 = store.getState().activePageId;

    store.dispatch({
      type: 'INSERT_FIELD',
      payload: {
        pageId: p1,
        index: 0,
        field: { id: 'fullName', name: 'fullName', type: 'text', label: 'Full Name', required: true },
      },
    });

    store.dispatch({ type: 'ADD_PAGE', payload: { title: 'Step 2' } });
    const p2 = store.getState().activePageId;

    store.dispatch({
      type: 'INSERT_FIELD',
      payload: {
        pageId: p2,
        index: 0,
        field: { id: 'email', name: 'email', type: 'text', label: 'Email', required: true },
      },
    });

    const compiledSchema = store.toFormSchema();

    // Wire up offline outbox queue with memory storage
    const storage = new MemoryStorageAdapter();
    const outbox = new OfflineOutboxQueue(storage, {
      endpoint: 'https://api.intuitui.local/submissions',
      maxRetries: 3,
    });

    let submittedValues: Record<string, unknown> | null = null;
    const testDriveManager = new MultiStepFormManager(
      compiledSchema,
      async (values) => {
        submittedValues = values;
        // Hostile SRE invariant: write directly to outbox rather than blackhole alert()
        await outbox.enqueue({
          id: `env-${Date.now()}`,
          formId: compiledSchema.id,
          payload: values,
          timestamp: Date.now(),
          retryCount: 0,
        });
      },
      {
        storage,
      }
    );

    // Step 1: fill and advance
    testDriveManager.getFormManager().setFieldValue('fullName', 'Naween Fernando');
    expect(testDriveManager.nextStep()).toBe(true);

    // Step 2: fill and submit
    testDriveManager.getFormManager().setFieldValue('email', 'naween@intuitui.local');
    await testDriveManager.submit();

    expect(submittedValues).toEqual({
      fullName: 'Naween Fernando',
      email: 'naween@intuitui.local',
    });

    // Invariant: payload is safely enqueued in durable outbox storage
    const pendingCount = await outbox.getPendingCount();
    expect(pendingCount).toBe(1);
  });

  it('Hostile Vector 4: Live Telemetry Dispatch to AnalyticsEngine Bridge', async () => {
    // 1. Author designs a form in Studio
    const store = createFormStudioStore();
    const p1 = store.getState().activePageId;

    store.dispatch({
      type: 'INSERT_FIELD',
      payload: {
        pageId: p1,
        index: 0,
        field: { id: 'workEmail', name: 'workEmail', type: 'text', label: 'Work Email', required: true },
      },
    });

    const compiledSchema = store.toFormSchema();

    // 2. Telemetry capture port
    const capturedEvents: FormTelemetryEvent[] = [];
    const liveTelemetryPort: ITelemetryPort = {
      dispatch: (event) => capturedEvents.push(event as FormTelemetryEvent),
    };

    // 3. User 1 test-drives successfully
    const manager1 = new MultiStepFormManager(
      compiledSchema,
      vi.fn(),
      {
        experience: {
          telemetry: liveTelemetryPort,
        },
      }
    );

    manager1.getFormManager().setFieldValue('workEmail', 'valid@corp.com');
    await manager1.submit();

    // 4. User 2 encounters email friction and abandons
    const manager2 = new MultiStepFormManager(
      compiledSchema,
      vi.fn(),
      {
        experience: {
          telemetry: liveTelemetryPort,
        },
      }
    );

    // Simulate validation error and abandonment
    liveTelemetryPort.dispatch({
      type: 'field_error',
      formId: compiledSchema.id,
      fieldName: 'workEmail',
      stepIndex: 0,
      errorRule: 'email',
      timestamp: Date.now(),
    });
    liveTelemetryPort.dispatch({
      type: 'form_abandoned',
      formId: compiledSchema.id,
      lastStepIndex: 0,
      completedSteps: 0,
      totalDurationMs: 8500,
      timestamp: Date.now(),
    });

    // Invariant: AnalyticsEngine processes the live telemetry events without crashing
    const funnels = AnalyticsEngine.calculateFunnel(capturedEvents);
    expect(funnels['unassigned']).toBeDefined();
    expect(funnels['unassigned']!.totalStarts).toBe(2);
    expect(funnels['unassigned']!.totalSubmissions).toBe(1);
    expect(funnels['unassigned']!.overallConversionRatePercent).toBe(50);

    // Invariant: Friction analyzer pinpoints workEmail struggle
    const friction = AnalyticsEngine.calculateFrictionIndex(capturedEvents);
    const emailFriction = friction.find((f) => f.fieldName === 'workEmail');
    expect(emailFriction).toBeDefined();
    expect(emailFriction!.errorCount).toBeGreaterThanOrEqual(1);
  });

  it('Hostile Vector 5: Bounded Shareable Slug Size (Under 2KB URI Budget)', () => {
    // Generate a full multi-step form with 3 pages and 6 fields
    const store = createFormStudioStore();
    const p1 = store.getState().activePageId;

    for (let i = 0; i < 2; i++) {
      store.dispatch({
        type: 'INSERT_FIELD',
        payload: {
          pageId: p1,
          index: i,
          field: { id: `p1_q${i}`, name: `p1_q${i}`, type: 'text', label: `Step 1 Question ${i}` },
        },
      });
    }

    store.dispatch({ type: 'ADD_PAGE', payload: { title: 'Personal Details' } });
    const p2 = store.getState().activePageId;

    for (let i = 0; i < 2; i++) {
      store.dispatch({
        type: 'INSERT_FIELD',
        payload: {
          pageId: p2,
          index: i,
          field: { id: `p2_q${i}`, name: `p2_q${i}`, type: 'number', label: `Step 2 Question ${i}` },
        },
      });
    }

    const fullSchema = store.toFormSchema();
    const url = StudioShareCodec.generateShareableUrl('https://app.intuitui.local/fill', fullSchema);

    // Strict invariant: Shareable URL must comfortably fit inside standard 2,048-char limits
    expect(url.length).toBeLessThan(2048);

    // Verify round-trip restoration fidelity
    const restored = StudioShareCodec.extractFromUrl(url);
    expect(restored.success).toBe(true);
    expect(restored.schema?.pages).toHaveLength(2);
    expect(restored.schema?.pages[0]?.fields).toHaveLength(2);
    expect(restored.schema?.pages[1]?.fields).toHaveLength(2);
  });
});
