import { describe, it, expect } from 'vitest';
import {
  NoopSpatialAffordanceAdapter,
  evaluateGestaltProximity,
  calculateFieldQuantumDensity,
  SpatialAffordanceAdapter,
  lintFormSchema,
  type FormSchema,
  type FieldDefinition,
} from '../src/index.js';

describe('Spatial Affordance Engine & Hexagonal Ports', () => {
  describe('NoopSpatialAffordanceAdapter (Zero-Bloat Fallback)', () => {
    it('provides balanced defaults without computational overhead', () => {
      const adapter = new NoopSpatialAffordanceAdapter();
      const evaluation = adapter.evaluateContainer(
        {
          containerId: 'main-card',
          widthPx: 600,
          paddingPx: { top: 16, right: 16, bottom: 16, left: 16 },
          childGapPx: 12,
        },
        []
      );

      expect(evaluation.densityMode).toBe('balanced');
      expect(evaluation.shouldPartitionToNextStep).toBe(false);
      expect(evaluation.violations).toHaveLength(0);
    });
  });

  describe('evaluateGestaltProximity', () => {
    it('passes when gap to next group comfortably exceeds label-to-input gap', () => {
      const res = evaluateGestaltProximity(8, 24);
      expect(res.passes).toBe(true);
      expect(res.ratio).toBe(3.0);
    });

    it('fails when proximity ratio is under 1.0 (label visually detaches and clings to previous field)', () => {
      const res = evaluateGestaltProximity(20, 10);
      expect(res.passes).toBe(false);
      expect(res.ratio).toBe(0.5);
      expect(res.reason).toContain('Label visually detaches');
    });

    it('flags borderline proximity when ratio is between 1.0 and 1.5', () => {
      const res = evaluateGestaltProximity(12, 14);
      expect(res.passes).toBe(false);
      expect(res.ratio).toBe(1.17);
      expect(res.reason).toContain('below comfortable threshold');
    });
  });

  describe('calculateFieldQuantumDensity', () => {
    it('assigns calibrated weights to diverse atomic field types', () => {
      const fields: FieldDefinition[] = [
        { id: 'h1', name: 'h1', type: 'heading', label: 'Section' },
        { id: 'f1', name: 'f1', type: 'text', label: 'First Name' },
        { id: 'f2', name: 'f2', type: 'textarea', label: 'Bio' },
        { id: 'f3', name: 'f3', type: 'visualization', label: 'Chart' },
      ];

      // 0.25 (heading) + 1.0 (text) + 1.5 (textarea) + 3.5 (visualization) = 6.25 -> 6.3 QDU
      const qdu = calculateFieldQuantumDensity(fields);
      expect(qdu).toBe(6.3);
    });

    it('adds cognitive penalty for long helper text hotspots', () => {
      const simpleField: FieldDefinition[] = [
        { id: 'f1', name: 'f1', type: 'text', label: 'Code' },
      ];
      const verboseField: FieldDefinition[] = [
        {
          id: 'f1',
          name: 'f1',
          type: 'text',
          label: 'Code',
          helperText: 'This is a verbose explanatory hotspot that extends well beyond fifty characters to test cognitive drag.',
        },
      ];

      expect(calculateFieldQuantumDensity(verboseField)).toBeGreaterThan(
        calculateFieldQuantumDensity(simpleField)
      );
    });
  });

  describe('SpatialAffordanceAdapter', () => {
    const adapter = new SpatialAffordanceAdapter({ maxQduPerContainer: 16 });

    it('detects Gestalt enclosure violation when padding is smaller than child gap', () => {
      const evalResult = adapter.evaluateContainer(
        {
          containerId: 'cramped-card',
          widthPx: 400,
          paddingPx: { top: 8, right: 8, bottom: 8, left: 8 },
          childGapPx: 16, // Padding (8px) < Gap (16px) -> Violated!
        },
        [{ id: '1', name: '1', type: 'text', label: 'A' }]
      );

      expect(evalResult.violations.some((v) => v.includes('violating Gestalt enclosure'))).toBe(true);
    });

    it('recommends multi-column layouts on wide viewports with sufficient fields', () => {
      const fields: FieldDefinition[] = [
        { id: '1', name: '1', type: 'text', label: 'A' },
        { id: '2', name: '2', type: 'text', label: 'B' },
        { id: '3', name: '3', type: 'text', label: 'C' },
        { id: '4', name: '4', type: 'text', label: 'D' },
        { id: '5', name: '5', type: 'text', label: 'E' },
        { id: '6', name: '6', type: 'text', label: 'F' },
      ];

      const mobileEval = adapter.evaluateContainer(
        {
          containerId: 'c1',
          widthPx: 500,
          paddingPx: { top: 16, right: 16, bottom: 16, left: 16 },
          childGapPx: 12,
        },
        fields
      );
      expect(mobileEval.recommendedColumns).toBe(1);

      const desktopEval = adapter.evaluateContainer(
        {
          containerId: 'c1',
          widthPx: 1280,
          paddingPx: { top: 24, right: 24, bottom: 24, left: 24 },
          childGapPx: 16,
        },
        fields
      );
      expect(desktopEval.recommendedColumns).toBe(3);
    });

    it('identifies claustrophobic containers and recommends step partitioning', () => {
      // 5 visualization fields (3.5 * 5 = 17.5 QDU) exceeds capacity of 16
      const heavyFields: FieldDefinition[] = Array.from({ length: 5 }, (_, i) => ({
        id: `vis_${i}`,
        name: `vis_${i}`,
        type: 'visualization',
        label: `Metric ${i + 1}`,
      }));

      const evalResult = adapter.evaluateContainer(
        {
          containerId: 'heavy-form',
          widthPx: 600,
          paddingPx: { top: 20, right: 20, bottom: 20, left: 20 },
          childGapPx: 16,
        },
        heavyFields
      );

      expect(evalResult.densityMode).toBe('claustrophobic');
      expect(evalResult.shouldPartitionToNextStep).toBe(true);
      expect(evalResult.violations.some((v) => v.includes('exceeds capacity'))).toBe(true);
    });
  });

  describe('SchemaLint Spatial & Gestalt Rules', () => {
    it('flags SPATIAL_DENSITY_EXCEEDED when a single page packs excessive QDU', () => {
      const denseSchema: FormSchema = {
        id: 'dense-form',
        title: 'Overloaded Form',
        pages: [
          {
            id: 'page_1',
            title: 'Overloaded Page',
            fields: Array.from({ length: 18 }, (_, i) => ({
              id: `field_${i}`,
              name: `field_${i}`,
              type: 'text',
              label: `Input ${i}`,
              required: false,
              order: i,
            })),
          },
        ],
      };

      const result = lintFormSchema(denseSchema);
      const spatialIssue = result.warnings.find((w) => w.code === 'SPATIAL_DENSITY_EXCEEDED');
      expect(spatialIssue).toBeDefined();
      expect(spatialIssue?.message).toContain('spatial density (18 QDU) exceeds comfortable capacity');
    });

    it('emits GESTALT_PROXIMITY_COLLAPSE when high-mass fields lack section dividers', () => {
      const unorganizedSchema: FormSchema = {
        id: 'unorganized-form',
        title: 'Unorganized Form',
        pages: [
          {
            id: 'p1',
            title: 'Details',
            fields: [
              { id: 'f1', name: 'f1', type: 'text', label: 'Name', required: false, order: 0 },
              { id: 'f2', name: 'f2', type: 'email', label: 'Email', required: false, order: 1 },
              { id: 'vis1', name: 'vis1', type: 'visualization', label: 'Chart 1', required: false, order: 2 },
              { id: 'file1', name: 'file1', type: 'file', label: 'Upload', required: false, order: 3 },
              { id: 'img1', name: 'img1', type: 'image-capture', label: 'Photo', required: false, order: 4 },
            ],
          },
        ],
      };

      const result = lintFormSchema(unorganizedSchema);
      const gestaltIssue = result.infos.find((i) => i.code === 'GESTALT_PROXIMITY_COLLAPSE');
      expect(gestaltIssue).toBeDefined();
      expect(gestaltIssue?.message).toContain('groups 3 high-mass complex fields without visual rhythm');
    });
  });
});
