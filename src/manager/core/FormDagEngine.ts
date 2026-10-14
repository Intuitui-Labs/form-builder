import { FieldDependencyGraph } from '../../core/DependencyGraph.js';
import { applyRule } from '../../validation/ValidationEngine.js';
import type { FormConfig } from '../FormManager.js';
import type { FormApi } from '@tanstack/form-core';

export class FormDagEngine<T extends Record<string, unknown>> {
  private dependencyGraph: FieldDependencyGraph = new FieldDependencyGraph();

  constructor(config: FormConfig<T>) {
    this.initialize(config);
  }

  private initialize(config: FormConfig<T>): void {
    for (const fieldName in config.fields) {
      const fieldConfig = config.fields[fieldName];
      if (!fieldConfig) continue;

      if (fieldConfig.dependsOn) {
        for (const dep of fieldConfig.dependsOn) {
          this.dependencyGraph.addDependency(fieldName, dep);
        }
      }

      if (fieldConfig.computed?.dependsOn) {
        for (const dep of fieldConfig.computed.dependsOn) {
          this.dependencyGraph.addDependency(fieldName, dep);
        }
      }

      if (fieldConfig.rules) {
        if (!fieldConfig.validators) {
          fieldConfig.validators = fieldConfig.rules.map((rule) => {
            return (val: unknown, allVals?: Record<string, unknown>) =>
              applyRule(rule, val, fieldConfig.label || fieldName, allVals);
          });
        }
        for (const rule of fieldConfig.rules) {
          if ('targetField' in rule && rule.targetField) {
            this.dependencyGraph.addDependency(fieldName, rule.targetField);
          }
        }
      }
    }

    const cycle = this.dependencyGraph.detectCycles();
    if (cycle) {
      throw new Error(
        `Circular dependency detected in form schema between fields: ${cycle.join(' -> ')}`
      );
    }
  }

  public getDependencyGraph(): FieldDependencyGraph {
    return this.dependencyGraph;
  }

  public getDependents(field: string): string[] {
    return this.dependencyGraph.getDependents(field);
  }

  /**
   * Recomputes derived fields in topological order and re-validates them.
   */
  public recomputeDependents(
    appliedFields: Array<keyof T>,
    config: FormConfig<T>,
    tsForm: FormApi<T, any>,
    validateField: (dep: keyof T) => boolean
  ): void {
    const allDependents = new Set<string>();
    for (const field of appliedFields) {
      const deps = this.dependencyGraph.getDependents(String(field));
      for (const d of deps) {
        allDependents.add(d);
      }
    }

    for (const dep of allDependents) {
      const depConfig = config.fields[dep as keyof T];
      if (depConfig) {
        if (depConfig.computed?.fn) {
          const derived = depConfig.computed.fn(
            tsForm.state.values as Record<string, unknown>
          );
          tsForm.setFieldValue(dep as any, derived as any);
        }
        validateField(dep as keyof T);
      }
    }
  }
}
