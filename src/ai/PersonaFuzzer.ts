import type { FormSchema, FormField } from '../schema/FormSchema.js';
import { MultiStepFormManager } from '../manager/MultiStepFormManager.js';
import { MemoryStorageAdapter } from '../adapters/storage/MemoryStorageAdapter.js';

export type PersonaStrategy = 'minimalist' | 'maximalist' | 'edge-case' | 'random';

export interface PersonaSimulationResult {
  personaName: string;
  strategy: PersonaStrategy;
  success: boolean;
  stepsVisited: string[];
  fieldsPopulated: number;
  finalValues: Record<string, unknown>;
  deadlocked?: boolean;
  error?: string;
}

export interface FuzzSimulationReport {
  totalSimulations: number;
  successfulSimulations: number;
  failedSimulations: number;
  visitedPathDistribution: Record<string, number>;
  results: PersonaSimulationResult[];
}

/**
 * Generates synthetic mock values for a given field based on the chosen strategy.
 */
function generateSyntheticFieldValue(field: FormField, strategy: PersonaStrategy, seed: number): unknown {
  if (strategy === 'minimalist' && !field.required) {
    return undefined;
  }

  // 1. Select / Dropdown options
  if (field.options && field.options.length > 0) {
    if (strategy === 'random') {
      const idx = seed % field.options.length;
      return field.options[idx].value;
    }
    // Return first option for minimalist, last for maximalist/edge-case
    return strategy === 'maximalist'
      ? field.options[field.options.length - 1].value
      : field.options[0].value;
  }

  // 2. Field Types
  switch (field.type) {
    case 'email':
      return strategy === 'edge-case'
        ? `user.very+long.tag_${seed}@subdomain.example-domain.org`
        : `test_${seed}@example.com`;

    case 'number':
    case 'slider': {
      const min = field.min ?? 1;
      const max = field.max ?? 100;
      if (strategy === 'edge-case') return max;
      if (strategy === 'minimalist') return min;
      return Math.floor(min + ((seed * 7) % (max - min + 1)));
    }

    case 'password':
      return strategy === 'edge-case'
        ? 'Correct-Horse-Battery-Staple-2026!#$%'
        : 'SecurePassword123!';

    case 'textarea':
      return strategy === 'edge-case'
        ? 'Line 1: Detailed response.\nLine 2: Continuing with newline testing.\nLine 3: Wrap up.'
        : 'Standard text response.';

    case 'text':
    default:
      if (field.semanticIntent === 'contact-phone') {
        return '+1-555-0199';
      }
      if (field.semanticIntent === 'address-postal-code') {
        return '94105';
      }
      return strategy === 'edge-case'
        ? `Edge Value ${seed} -- Unicode: 日本語 / äöü / 🚀`
        : `Answer ${seed}`;
  }
}

/**
 * Runs a deterministic Monte Carlo multi-path fuzz simulation on a FormSchema.
 * Exercises branching, navigation, and validation without consuming external LLM tokens.
 */
export async function runPersonaFuzzSimulation(
  schema: FormSchema,
  iterationCount = 20
): Promise<FuzzSimulationReport> {
  const results: PersonaSimulationResult[] = [];
  const visitedPathDistribution: Record<string, number> = {};

  const strategies: PersonaStrategy[] = ['minimalist', 'maximalist', 'edge-case', 'random'];

  for (let i = 0; i < iterationCount; i++) {
    const strategy = strategies[i % strategies.length];
    const personaName = `Persona-${strategy}-${i + 1}`;

    const memoryStorage = new MemoryStorageAdapter();
    const manager = new MultiStepFormManager(schema, () => {}, {
      resilience: { storage: memoryStorage },
    });

    const stepsVisited: string[] = [];
    let fieldsPopulated = 0;
    let stepLoopGuard = 0;
    const maxStepsAllowed = (schema.pages.length + 1) * 3; // Prevent infinite cycle trap

    let hasSucceeded = false;
    let failureReason: string | undefined;

    try {
      while (stepLoopGuard++ < maxStepsAllowed) {
        const currentPage = manager.getCurrentPage();
        if (!currentPage) break;

        stepsVisited.push(currentPage.id);

        // Fill all visible fields on this step
        const visibleFields = manager.getVisibleFields();
        for (const field of visibleFields) {
          if (field.type === 'heading' || field.type === 'divider' || field.type === 'statement') {
            continue;
          }

          const syntheticVal = generateSyntheticFieldValue(field, strategy, i + stepLoopGuard);
          if (syntheticVal !== undefined) {
            manager.setFieldValue(field.name, syntheticVal);
            fieldsPopulated++;
          }
        }

        // Try to advance or submit
        if (manager.isLastStep()) {
          const isValid = manager.validateCurrentStep();
          if (isValid) {
            hasSucceeded = true;
          } else {
            failureReason = 'Validation failed on terminal step';
          }
          break;
        } else {
          const advanced = manager.nextStep();
          if (!advanced) {
            failureReason = `Could not advance from step "${currentPage.id}" (validation blocker)`;
            break;
          }
        }
      }

      if (stepLoopGuard >= maxStepsAllowed) {
        failureReason = 'Step loop limit reached (possible circular branch jump)';
      }
    } catch (err) {
      failureReason = `Runtime exception: ${(err as Error).message}`;
    }

    const pathKey = stepsVisited.join(' -> ');
    visitedPathDistribution[pathKey] = (visitedPathDistribution[pathKey] ?? 0) + 1;

    results.push({
      personaName,
      strategy,
      success: hasSucceeded,
      stepsVisited,
      fieldsPopulated,
      finalValues: manager.getState().values as Record<string, unknown>,
      deadlocked: stepLoopGuard >= maxStepsAllowed,
      error: failureReason,
    });
  }

  const successfulSimulations = results.filter((r) => r.success).length;
  const failedSimulations = results.length - successfulSimulations;

  return {
    totalSimulations: results.length,
    successfulSimulations,
    failedSimulations,
    visitedPathDistribution,
    results,
  };
}
