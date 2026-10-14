import { describe, it, expect, vi } from 'vitest';
import {
  MultiStepFormManager,
  FormLifecycleMachine,
  DefaultSanitizer,
  MemoryStorageAdapter,
  type FormSchema,
  type ITelemetryPort,
  type TelemetryEvent,
  type INetworkStatusPort,
} from '../../src/index.js';

const TEST_SCHEMA: FormSchema = {
  v: '1.0',
  id: 'hostile-op-form',
  tenantId: 'tenant-1',
  title: 'Hostile Operationalization Form',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  pages: [
    {
      id: 'step-1',
      title: 'Step 1',
      fields: [
        {
          id: 'f1',
          name: 'first_name',
          type: 'text',
          label: 'First Name',
          required: true,
          order: 0,
        },
        {
          id: 'f-rich',
          name: 'info',
          type: 'rich-text',
          label: 'Info',
          required: false,
          order: 1,
          content: 'Welcome! <scr<script>ipt>alert(1)</script><iframe src="https://evil.com"></iframe>[click](javascript:alert(2))',
        },
      ],
    },
    {
      id: 'step-2',
      title: 'Step 2',
      fields: [
        {
          id: 'f2',
          name: 'last_name',
          type: 'text',
          label: 'Last Name',
          required: false,
          order: 0,
        },
      ],
    },
  ],
};

describe('Hostile Operationalization & Resource Lifecycle', () => {
  it('Hostile Test 1: Hydration Deadlock Prevention (Fresh empty session unlocks to idle)', async () => {
    const storage = new MemoryStorageAdapter();
    // Verify storage has no draft
    const hasDraft = await storage.getItem('intuitui_draft_hostile-op-form');
    expect(hasDraft).toBeNull();

    const manager = new MultiStepFormManager(
      TEST_SCHEMA,
      vi.fn(),
      {
        storage,
        autoRestoreDraft: true, // autoRestoreDraft requested!
      },
    );

    // Yield macro/microtasks for checkDraft() promise to settle
    await new Promise((r) => setTimeout(r, 10));

    // Must NOT be stuck in 'unhydrated'!
    expect(manager.getLifecyclePhase()).toBe('idle');
    expect(manager.isHydrated()).toBe(true);

    // End-user fills field and advances: MUST NOT be blocked by guard!
    manager.getFormManager().setFieldValue('first_name', 'Grace');
    const advanced = manager.nextStep();
    expect(advanced).toBe(true);
    expect(manager.getCurrentPageIndex()).toBe(1);

    manager.destroy();
  });

  it('Hostile Test 2: Resource Lifecycle & Teardown (destroy/dispose eliminates zombie listeners)', async () => {
    let networkCallback: ((online: boolean) => void) | undefined;
    const mockNetwork: INetworkStatusPort = {
      isOnline: () => true,
      subscribe: (cb) => {
        networkCallback = cb;
        return () => {
          networkCallback = undefined;
        };
      },
    };

    const manager = new MultiStepFormManager(
      TEST_SCHEMA,
      vi.fn(),
      {
        networkStatus: mockNetwork,
        enableOutbox: true,
      },
    );

    const subscriberSpy = vi.fn();
    manager.subscribe(subscriberSpy);

    expect(networkCallback).toBeDefined();

    // Trigger teardown
    manager.destroy();

    // network listener must be completely detached
    expect(networkCallback).toBeUndefined();

    // Verify manager subscribers were cleared and detached
    subscriberSpy.mockClear();
    manager.getFormManager().setFieldValue('first_name', 'Ada');
    expect(subscriberSpy).not.toHaveBeenCalled();
  });

  it('Hostile Test 3: Debounced Autosave IO Protection (Keystrokes do not spam storage)', async () => {
    let rawSaves = 0;
    const storage = new MemoryStorageAdapter();
    const originalSetItem = storage.setItem.bind(storage);
    storage.setItem = async (k, v) => {
      rawSaves++;
      return originalSetItem(k, v);
    };

    const manager = new MultiStepFormManager(
      TEST_SCHEMA,
      vi.fn(),
      {
        storage,
        autoSaveDraft: true,
        draftDebounceMs: 50,
      },
    );

    // Simulate fast typing of 10 characters
    const form = manager.getFormManager();
    for (let i = 1; i <= 10; i++) {
      form.setFieldValue('first_name', 'typing'.slice(0, i));
    }

    // Immediately after typing, raw storage writes must be 0 (debounced!)
    expect(rawSaves).toBe(0);

    // Wait past the debounce window
    await new Promise((r) => setTimeout(r, 80));

    // Storage should have received at most 1 debounced write
    expect(rawSaves).toBe(1);

    manager.destroy();
  });

  it('Hostile Test 4: DefaultSanitizer Nested Tag & Protocol Evasion Neutralization', () => {
    const sanitizer = new DefaultSanitizer();

    // 1. Nested script tag evasion: <scr<script>ipt> -> must not leave <script>
    const nestedScript = 'Hello <scr<script>ipt>alert(1)</script>World';
    const cleanedScript = sanitizer.sanitizeRichText(nestedScript);
    expect(cleanedScript).not.toContain('<script');
    expect(cleanedScript).not.toContain('alert(1)');

    // 2. Iframe container stripping
    const iframeHtml = '<p>Check this</p><iframe src="https://phishing.site"></iframe>';
    const cleanedIframe = sanitizer.sanitizeRichText(iframeHtml);
    expect(cleanedIframe).not.toContain('<iframe');

    // 3. Dangerous protocols in markdown links
    const jsMarkdown = '[Click](javascript:alert(1)) and [Data](data:text/html;base64,abc)';
    const cleanedMarkdown = sanitizer.sanitizeRichText(jsMarkdown);
    expect(cleanedMarkdown).toBe('[Click](#) and [Data](#)');

    // 4. Manager getCurrentPage sanitizes rich-text field content
    const manager = new MultiStepFormManager(TEST_SCHEMA, vi.fn(), { sanitizer });
    const page = manager.getCurrentPage();
    const richField = page.fields.find((f) => f.name === 'info');
    expect(richField?.content).toBeDefined();
    expect(richField!.content).not.toContain('<script');
    expect(richField!.content).not.toContain('<iframe');
    expect(richField!.content).toContain('[click](#)');

    manager.destroy();
  });

  it('Hostile Test 5: Guard Lockout Telemetry Dispatches', async () => {
    const telemetryEvents: TelemetryEvent[] = [];
    const mockTelemetry: ITelemetryPort = {
      dispatch: (e) => {
        telemetryEvents.push(e);
      },
    };

    let finishSubmit: () => void = () => {};
    const submitPromise = new Promise<void>((resolve) => {
      finishSubmit = resolve;
    });

    const manager = new MultiStepFormManager(
      TEST_SCHEMA,
      async () => {
        await submitPromise;
      },
      {
        telemetry: mockTelemetry,
      },
    );

    manager.getFormManager().setFieldValue('first_name', 'Margaret');

    // Advance to step 2 (last step)
    expect(manager.nextStep()).toBe(true);
    expect(manager.isLastStep()).toBe(true);

    // Trigger async submission
    const submitCall = manager.submit();

    // While submitting, machine is in 'submitting' phase. Attempt navigation!
    const navAttempt = manager.prevStep();
    expect(navAttempt).toBe(false);

    // Verify transition_rejected telemetry event was emitted
    const rejectedNav = telemetryEvents.find(
      (e) => (e as any).type === 'transition_rejected' && (e as any).action === 'STEP_PREV',
    );
    expect(rejectedNav).toBeDefined();
    expect((rejectedNav as any).phase).toBe('submitting');

    // Attempt second submit while first is in flight
    await manager.submit();
    const rejectedSubmit = telemetryEvents.find((e) => (e as any).type === 'submit_rejected');
    expect(rejectedSubmit).toBeDefined();

    // Release async submit
    finishSubmit();
    await submitCall;

    manager.destroy();
  });

  it('Hostile Test 6: Telemetry Flush on Manager Destroy (Prevents event drops on unmount)', () => {
    const flushSpy = vi.fn();
    const mockTelemetry: ITelemetryPort = {
      dispatch: vi.fn(),
      flush: flushSpy,
    };

    const manager = new MultiStepFormManager(
      TEST_SCHEMA,
      vi.fn(),
      {
        telemetry: mockTelemetry,
      },
    );

    manager.destroy();
    expect(flushSpy).toHaveBeenCalledTimes(1);
  });
});
