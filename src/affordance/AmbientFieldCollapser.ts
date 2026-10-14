import type { FormField } from '../schema/FormSchema.js';
import type { FieldOriginInfo } from '../manager/FormManager.js';

export interface FieldClusterDefinition {
  id: string;
  title: string;
  fieldNames: string[];
  summaryFormatter?: (values: Record<string, unknown>) => string;
}

export interface CollapsedClusterSummary {
  clusterId: string;
  title: string;
  fieldNames: string[];
  summaryText: string;
  isCollapsed: boolean;
  autoResolved: boolean;
}

/**
 * AmbientFieldCollapser: Implements "Self-Shrinking" form behavior.
 * When ambient sources (autofill, geo resolution, company lookups) satisfy an entire
 * cluster of fields, it collapses them into a single confirmed summary card with 1-click editability.
 * 
 * Hostile Defense: Never collapses clusters while an input in that cluster has active focus.
 */
export class AmbientFieldCollapser {
  private clusters: FieldClusterDefinition[];
  private manuallyExpandedClusters: Set<string> = new Set();

  constructor(clusters: FieldClusterDefinition[]) {
    this.clusters = clusters;
  }

  public expandCluster(clusterId: string): void {
    this.manuallyExpandedClusters.add(clusterId);
  }

  public collapseCluster(clusterId: string): void {
    this.manuallyExpandedClusters.delete(clusterId);
  }

  public isClusterExpanded(clusterId: string): boolean {
    return this.manuallyExpandedClusters.has(clusterId);
  }

  /**
   * Computes which clusters should be collapsed based on current form values, field origins,
   * and currently active focused field.
   */
  public evaluateClusters(
    values: Record<string, unknown>,
    origins: Partial<Record<string, FieldOriginInfo>>,
    activeFocusedField?: string,
  ): CollapsedClusterSummary[] {
    const results: CollapsedClusterSummary[] = [];

    for (const cluster of this.clusters) {
      const isManuallyExpanded = this.manuallyExpandedClusters.has(cluster.id);
      const isAnyFieldFocused = activeFocusedField ? cluster.fieldNames.includes(activeFocusedField) : false;

      // Check if all fields in the cluster have valid non-empty values
      const allPopulated = cluster.fieldNames.every((name) => {
        const val = values[name];
        return val !== undefined && val !== null && val !== '';
      });

      // Check if fields were satisfied by ambient/autofill origin
      const anyAmbientOrigin = cluster.fieldNames.some((name) => {
        const origin = origins[name]?.origin;
        return origin && origin.startsWith('autofill');
      });

      const shouldCollapse = allPopulated && !isManuallyExpanded && !isAnyFieldFocused;

      const summaryText = cluster.summaryFormatter
        ? cluster.summaryFormatter(values)
        : cluster.fieldNames
            .map((f) => String(values[f] || ''))
            .filter(Boolean)
            .join(' · ');

      results.push({
        clusterId: cluster.id,
        title: cluster.title,
        fieldNames: cluster.fieldNames,
        summaryText,
        isCollapsed: shouldCollapse,
        autoResolved: anyAmbientOrigin,
      });
    }

    return results;
  }
}
