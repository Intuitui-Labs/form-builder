import { describe, it, expect } from 'vitest';
import * as RootEngine from '../../src/index.js';

describe('Hostile Modular Monolith & Subpath Isolation Invariants', () => {
  it('Hostile Invariant 1: Root Barrel Purity (Zero Domain Contamination)', () => {
    // The root export MUST contain the complete headless form evaluation, validation, analytics, and persistence suite
    expect(RootEngine.MultiStepFormManager).toBeDefined();
    expect(RootEngine.FormManager).toBeDefined();
    expect(RootEngine.FormLifecycleMachine).toBeDefined();
    expect(RootEngine.ConditionEvaluator).toBeDefined();
    expect(RootEngine.ValidationEngine).toBeDefined();
    expect(RootEngine.FormHydrator).toBeDefined();
    expect(RootEngine.DefaultSanitizer).toBeDefined();
    expect(RootEngine.AnalyticsEngine).toBeDefined();
    expect(RootEngine.OfflineOutboxQueue).toBeDefined();
    expect(RootEngine.DraftManager).toBeDefined();
    expect(RootEngine.SearchGroundedFormCompiler).toBeDefined();

    // The root export MUST NEVER contain heavy subsystem stores, canvas editors, hardware IO, or exam proctors
    const rootExports = RootEngine as Record<string, unknown>;

    // 1. Zero Visual Studio Canvas Store in Root (Canvas UI state remains isolated to /studio)
    expect(rootExports.createFormStudioStore).toBeUndefined();
    expect(rootExports.StudioShareCodec).toBeUndefined();

    // 2. Zero EdTech Assessment Proctoring / Exam Engines in Root (LMS logic remains isolated to /assessment)
    expect(rootExports.AssessmentEngine).toBeUndefined();
    expect(rootExports.RubricEvaluator).toBeUndefined();
    expect(rootExports.CadenceTimer).toBeUndefined();

    // 3. Zero Heavy External Adapters in Root (Hardware/Speech/Haptics/Effect remain isolated to /adapters)
    expect(rootExports.MemoryStorageAdapter).toBeUndefined();
    expect(rootExports.WebSpeechAffordanceAdapter).toBeUndefined();
    expect(rootExports.ExpoHapticsAffordanceAdapter).toBeUndefined();
    expect(rootExports.EffectLifecycleAdapter).toBeUndefined();
    expect(rootExports.LkEduGeoAddressAdapter).toBeUndefined();
  });

  it('Hostile Invariant 2: Subpath Hermetic Isolation (Independent Loadability)', async () => {
    // Each subsystem subpath must be independently resolvable without pulling adjacent domains
    const aiModule = await import('../../src/ai/index.js');
    expect(aiModule.SearchGroundedFormCompiler).toBeDefined();
    expect(aiModule.runPersonaFuzzSimulation).toBeDefined();

    const studioModule = await import('../../src/studio/index.js');
    expect(studioModule.createFormStudioStore).toBeDefined();
    expect(studioModule.StudioShareCodec).toBeDefined();

    const assessmentModule = await import('../../src/assessment/index.js');
    expect(assessmentModule.AssessmentEngine).toBeDefined();
    expect(assessmentModule.RubricEvaluator).toBeDefined();

    const analyticsModule = await import('../../src/analytics/index.js');
    expect(analyticsModule.AnalyticsEngine).toBeDefined();
    expect(analyticsModule.ResponseAggregator).toBeDefined();

    const persistenceModule = await import('../../src/persistence/index.js');
    expect(persistenceModule.OfflineOutboxQueue).toBeDefined();
    expect(persistenceModule.DraftManager).toBeDefined();

    const adaptersModule = await import('../../src/adapters/index.js');
    expect(adaptersModule.MemoryStorageAdapter).toBeDefined();
    expect(adaptersModule.MemoryTelemetryAdapter).toBeDefined();

    const hydrationModule = await import('../../src/hydration/index.js');
    expect(hydrationModule.FormHydrator).toBeDefined();
    expect(hydrationModule.ExperimentFormHydrator).toBeDefined();
  });

  it('Hostile Invariant 3: Hydration Module Unification & Legacy Parity', async () => {
    const canonicalHydration = await import('../../src/hydration/index.js');
    const legacyFormHydrator = await import('../../src/hydrator/FormHydrator.js');
    const legacyExpHydrator = await import('../../src/hydrator/ExperimentFormHydrator.js');

    expect(canonicalHydration.FormHydrator).toBe(legacyFormHydrator.FormHydrator);
    expect(canonicalHydration.ExperimentFormHydrator).toBe(legacyExpHydrator.ExperimentFormHydrator);
    expect(canonicalHydration.registerCustomValidator).toBe(legacyFormHydrator.registerCustomValidator);
  });
});
