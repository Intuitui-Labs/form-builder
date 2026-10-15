/**
 * @intuitui-labs/form-builder-engine
 * Headless schema-driven form evaluation, validation, DAG execution, and multi-step runtime.
 */

export * from './core/index.js';
export * from './schema/index.js';
export * from './ports/index.js';
export * from './validation/index.js';
export * from './hydration/index.js';
export * from './manager/index.js';
export * from './analytics/index.js';
export * from './codegen/index.js';
export * from './affordance/index.js';
export * from './persistence/index.js';
export * from './focus/index.js';
export * from './lint/index.js';
export * from './ai/index.js';
export * from './governance/index.js';

// Heavy subsystems (adapters, assessment, and studio) are NOT re-exported here —
// they are available via their dedicated subpaths:
//   '@intuitui-labs/form-builder-engine/adapters'
//   '@intuitui-labs/form-builder-engine/assessment'
//   '@intuitui-labs/form-builder-engine/studio'
// so apps pay only for what they import (preventing evaluation of hardware I/O,
// speech, haptics, geolocation, XState, Effect-TS, proctoring timers, and canvas stores).