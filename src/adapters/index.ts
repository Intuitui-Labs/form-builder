export * from './interfaces.js';
export * from '../affordance/index.js';

// Storage adapters
export { MemoryStorageAdapter } from './storage/MemoryStorageAdapter.js';
export { WebStorageAdapter } from './storage/WebStorageAdapter.js';
export { StandardStorageAdapter, type StandardStorageOptions } from './storage/StandardStorageAdapter.js';

// Network status adapters
export { AlwaysOnlineNetworkAdapter } from './network/AlwaysOnlineNetworkAdapter.js';
export { WebNetworkStatusAdapter } from './network/WebNetworkStatusAdapter.js';

// Transport adapters
export { CallbackTransportAdapter } from './transport/CallbackTransportAdapter.js';
export { StandardFetchTransportAdapter, type StandardFetchTransportOptions } from './transport/StandardFetchTransportAdapter.js';

// Effect v4 Hexagonal adapters are available via '@intuitui-labs/form-builder-engine/adapters/effect'
// to ensure zero runtime dependency leakage for default bundle consumers.

// Experiment & Feature Flag adapters
export { MemoryExperimentAdapter, type MemoryExperimentOptions, type RecordedExposure } from './MemoryExperimentAdapter.js';
export { DeterministicHashExperimentAdapter, type DeterministicHashOptions, type WeightedVariant, type ExperimentDefinition } from './DeterministicHashExperimentAdapter.js';
export { CallbackExperimentAdapter, type CallbackExperimentHooks } from './CallbackExperimentAdapter.js';

// Telemetry adapters
export { MemoryTelemetryAdapter, type MemoryTelemetryOptions } from './telemetry/MemoryTelemetryAdapter.js';
export { BatchingTelemetryAdapter, type BatchingTelemetryOptions } from './telemetry/BatchingTelemetryAdapter.js';
export { CallbackTelemetryAdapter, type CallbackTelemetryHooks } from './telemetry/CallbackTelemetryAdapter.js';

// Lifecycle Statechart adapters
export { XStateLifecycleAdapter, type XStateLifecycleAdapterOptions, type XStateActorLike } from './xstate/XStateLifecycleAdapter.js';

// Geo & Heuristic Address adapters
export * from './geo/index.js';

// AI Entity Extraction adapters
export { RegexRuleExtractorAdapter } from './ai/RegexRuleExtractorAdapter.js';
export { CallbackLLMExtractorAdapter, type CallbackLLMExtractorOptions, type LLMExtractorCaller } from './ai/CallbackLLMExtractorAdapter.js';
export { CompositeEntityExtractorAdapter } from './ai/CompositeEntityExtractorAdapter.js';

// Tactile & Haptic adapters
export { NullHapticAdapter } from './haptics/NullHapticAdapter.js';
export { WebVibrationAdapter, type WebVibrationOptions } from './haptics/WebVibrationAdapter.js';
export { ExpoHapticsAdapter, type ExpoHapticsOptions, type ExpoHapticsModule } from './haptics/ExpoHapticsAdapter.js';
