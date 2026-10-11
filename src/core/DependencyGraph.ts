/**
 * Directed Acyclic Graph (DAG) for reactive field-to-field dependency management.
 * Tracks reactive dependents for cross-field validation, conditional requirements,
 * and computed field derivations with cycle detection.
 */
export class FieldDependencyGraph {
  // sourceField -> Set of fields that depend on sourceField
  private dependentsMap: Map<string, Set<string>> = new Map();
  // dependentField -> Set of fields it depends on
  private dependenciesMap: Map<string, Set<string>> = new Map();

  /**
   * Registers that `dependentField` relies on changes from `sourceField`.
   */
  public addDependency(dependentField: string, sourceField: string): void {
    if (dependentField === sourceField) {
      throw new Error(`Self-dependency detected: field "${dependentField}" cannot depend on itself.`);
    }

    if (!this.dependentsMap.has(sourceField)) {
      this.dependentsMap.set(sourceField, new Set());
    }
    this.dependentsMap.get(sourceField)!.add(dependentField);

    if (!this.dependenciesMap.has(dependentField)) {
      this.dependenciesMap.set(dependentField, new Set());
    }
    this.dependenciesMap.get(dependentField)!.add(sourceField);
  }

  /**
   * Checks whether any field depends on `sourceField`.
   */
  public hasDependents(sourceField: string): boolean {
    const set = this.dependentsMap.get(sourceField);
    return Boolean(set && set.size > 0);
  }

  /**
   * Returns all direct and indirect dependents of `sourceField` in topological order.
   */
  public getDependents(sourceField: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const traverse = (current: string) => {
      const dependents = this.dependentsMap.get(current);
      if (!dependents) return;

      for (const dep of dependents) {
        if (!visited.has(dep)) {
          visited.add(dep);
          traverse(dep);
          result.push(dep);
        }
      }
    };

    traverse(sourceField);
    // Reverse so earliest dependencies appear first in evaluation order
    return result.reverse();
  }

  /**
   * Performs Depth-First Search cycle detection.
   * Returns the cycle path (e.g. ['A', 'B', 'A']) if a circular loop exists, null otherwise.
   */
  public detectCycles(): string[] | null {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const currentPath: string[] = [];

    const dfs = (node: string): string[] | null => {
      visited.add(node);
      recursionStack.add(node);
      currentPath.push(node);

      const neighbors = this.dependentsMap.get(node);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            const cycle = dfs(neighbor);
            if (cycle) return cycle;
          } else if (recursionStack.has(neighbor)) {
            const cycleStart = currentPath.indexOf(neighbor);
            return [...currentPath.slice(cycleStart), neighbor];
          }
        }
      }

      currentPath.pop();
      recursionStack.delete(node);
      return null;
    };

    const allNodes = new Set<string>([
      ...this.dependentsMap.keys(),
      ...this.dependenciesMap.keys(),
    ]);

    for (const node of allNodes) {
      if (!visited.has(node)) {
        const cycle = dfs(node);
        if (cycle) return cycle;
      }
    }

    return null;
  }

  /**
   * Clears all registered graph nodes and edges.
   */
  public clear(): void {
    this.dependentsMap.clear();
    this.dependenciesMap.clear();
  }
}
