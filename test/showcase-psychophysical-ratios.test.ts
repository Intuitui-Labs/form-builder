import { describe, it, expect } from 'vitest';
import {
  auditPsychophysicalRatios,
  auditConcentricCornerRadius,
  auditFocusRingRatio,
  auditHarmonicAspectRatio,
  auditChromostereopsisHazard,
  computeNonUniformDynamicScale,
  auditOpticalStemThickness,
  PSYCHOPHYSICAL_RATIOS,
} from '../../a11y-gate/src/index.js';

describe('Form Builder Engine & Showcase Psychophysical Ratio Audit', () => {
  describe('1. Mobile & Desktop Layout Psychophysical Ratios', () => {
    it('verifies mobile form layout honors all psychophysical ratio floors', () => {
      // Metric specs derived from apps/showcase-latest/src/components/EngineUi.tsx
      const mobileSpec = {
        viewportWidthPx: 390,
        viewportHeightPx: 844,
        canvasMarginHorizontalPx: 20, // 20 / 390 = 5.1% (>= 4% floor)
        contentWidthPx: 350,

        interContainerGutterPx: 14, // marginBottom on panel
        intraContainerPaddingPx: 18, // padding on panel (14 / 18 = 0.78 >= 0.75 floor)

        labelToInputGapPx: 6, // fieldLabelRow marginBottom: 6
        inputToNextGroupGapPx: 17, // fieldWrap marginBottom: 17 (17 / 6 = 2.83 >= 1.50)

        headingMarginTopPx: 18, // sectionHeading marginTop: 18
        headingMarginBottomPx: 6, // sectionHeading marginBottom: 6 (18 / 6 = 3.0 >= 2.0)

        fontSizePx: 14, // input fontSize: 14
        fontWeight: 500,
        lineHeightPx: 22,
        colorHex: '#152238', // colors.ink on #FFFFFF
        bgHex: '#FFFFFF',
        role: 'body' as const,

        touchHitDimensionPx: 48, // input minHeight: 48 (>= 44px floor)
        visualGlyphDimensionPx: 18,
      };

      const result = auditPsychophysicalRatios(mobileSpec);

      expect(result.passes).toBe(true);
      expect(result.score).toBe(100);
      expect(result.violations).toHaveLength(0);
      expect(result.ratios.canvasMarginRatio).toBe(0.051);
      expect(result.ratios.spatialHierarchyRatio).toBe(0.78);
      expect(result.ratios.gestaltProximityRatio).toBe(2.83);
      expect(result.ratios.headingClingingRatio).toBe(3);
    });

    it('verifies desktop responsive form layout maintains generous whitespace ratio', () => {
      const desktopSpec = {
        viewportWidthPx: 1280,
        viewportHeightPx: 900,
        canvasMarginHorizontalPx: 260, // (1280 - 760) / 2 = 260px
        contentWidthPx: 760, // maxWidth: 760

        interContainerGutterPx: 18,
        intraContainerPaddingPx: 24,

        labelToInputGapPx: 6,
        inputToNextGroupGapPx: 20,

        headingMarginTopPx: 24,
        headingMarginBottomPx: 8,

        fontSizePx: 15,
        fontWeight: 500,
        lineHeightPx: 24,
        colorHex: '#152238',
        bgHex: '#FFFFFF',
        role: 'body' as const,

        touchHitDimensionPx: 50,
        visualGlyphDimensionPx: 20,
      };

      const result = auditPsychophysicalRatios(desktopSpec);

      expect(result.passes).toBe(true);
      expect(result.ratios.whitespaceRatio).toBeGreaterThanOrEqual(
        PSYCHOPHYSICAL_RATIOS.WHITESPACE_RATIO_MIN
      );
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('2. Concentric Corner Radius Audit on Showcase Components', () => {
    it('evaluates container nesting concentricity', () => {
      // Outer panel: radius 24px, padding 18px
      // A nested card with padding 18px has ideal inner radius: max(0, 24 - 18) = 6px
      const concentricNestedCard = auditConcentricCornerRadius({
        outerRadiusPx: 24,
        innerRadiusPx: 6,
        paddingPx: 18,
      });

      expect(concentricNestedCard.passes).toBe(true);
      expect(concentricNestedCard.idealInnerRadiusPx).toBe(6);
      expect(concentricNestedCard.deltaPx).toBe(0);

      // Pre-remediation flaw: card radius 12px, padding 10px, chip 8px -> Delta 6px (optical buckling)
      const uncalibrated = auditConcentricCornerRadius({
        outerRadiusPx: 12,
        innerRadiusPx: 8,
        paddingPx: 10,
      });
      expect(uncalibrated.passes).toBe(false);
      expect(uncalibrated.deltaPx).toBe(6);

      // Post-remediation in EngineUi.tsx: card radius 14px, padding 8px, chip radius 6px
      // 14 - 8 = 6px -> Delta 0px! Pure Swiss/Apple concentric curve harmony!
      const calibrated = auditConcentricCornerRadius({
        outerRadiusPx: 14,
        innerRadiusPx: 6,
        paddingPx: 8,
      });
      expect(calibrated.passes).toBe(true);
      expect(calibrated.deltaPx).toBe(0);
      expect(calibrated.idealInnerRadiusPx).toBe(6);
    });
  });

  describe('3. Focus Ring Ratios and Hit Targets', () => {
    it('evaluates WCAG 2.2 SC 2.4.13 focus indicators', () => {
      // High-visibility focus ring specification
      const compliantFocusRing = auditFocusRingRatio({
        focusRingStrokePx: 2.5,
        focusOffsetGapPx: 2.0,
        elementBorderPx: 1.0,
      });

      expect(compliantFocusRing.passes).toBe(true);
      expect(compliantFocusRing.strokeRatio).toBe(2.5);

      // Weak zero-offset ring
      const weakFocusRing = auditFocusRingRatio({
        focusRingStrokePx: 1.0,
        focusOffsetGapPx: 0.0,
        elementBorderPx: 1.0,
      });

      expect(weakFocusRing.passes).toBe(false);
      expect(weakFocusRing.violation).toContain('visibility threshold');
    });
  });

  describe('4. Canonical Aspect Ratios of Showcase Interactive Elements', () => {
    it('confirms 1:1 square aspect ratio for touch targets and avatar affordances', () => {
      // Calendar affordance button: 48x48
      const calendarBtn = auditHarmonicAspectRatio({ widthPx: 48, heightPx: 48 });
      expect(calendarBtn.passes).toBe(true);
      expect(calendarBtn.nearestCanonicalName).toBe('SQUARE');

      // Brand mark: 30x30
      const brandMark = auditHarmonicAspectRatio({ widthPx: 30, heightPx: 30 });
      expect(brandMark.passes).toBe(true);
      expect(brandMark.nearestCanonicalName).toBe('SQUARE');
    });
  });

  describe('5. Palette Chromostereopsis and Contrast Safety', () => {
    it('confirms showcase theme colors do not create retinal chromostereopsis hazards', () => {
      const colors = {
        canvas: '#F4F6FB',
        paper: '#FFFFFF',
        ink: '#152238',
        violet: '#6348E8',
        teal: '#148C78',
        amber: '#B86A16',
        red: '#C44356',
        slate: '#475569',
      };

      // Check key text/bg pairings
      const violetOnPaper = auditChromostereopsisHazard(colors.violet, colors.paper);
      expect(violetOnPaper.hasHazard).toBe(false);

      const tealOnPaper = auditChromostereopsisHazard(colors.teal, colors.paper);
      expect(tealOnPaper.hasHazard).toBe(false);

      const redOnPaper = auditChromostereopsisHazard(colors.red, colors.paper);
      expect(redOnPaper.hasHazard).toBe(false);

      const slateOnCanvas = auditChromostereopsisHazard(colors.slate, colors.canvas);
      expect(slateOnCanvas.hasHazard).toBe(false);
    });
  });

  describe('6. Non-Uniform Dynamic Type Scale on Form Fields', () => {
    it('verifies non-uniform scaling preserves form structure under 1.5x OS accessibility scaling', () => {
      const scaleFactor = 1.5;

      // Hero title (30px base)
      const heroTitle = computeNonUniformDynamicScale({
        baseFontSizePx: 30,
        scaleFactor,
        role: 'display',
      });
      // 30 * (1.5 ^ 0.65) = ~39.0px (sub-linear, prevents two-line header overflow)
      expect(heroTitle.scaledFontSizePx).toBeLessThan(30 * scaleFactor);
      expect(heroTitle.scaledFontSizePx).toBe(39);

      // Form label (13px base)
      const formLabel = computeNonUniformDynamicScale({
        baseFontSizePx: 13,
        scaleFactor,
        role: 'body',
      });
      expect(formLabel.scaledFontSizePx).toBe(19.9);

      // Micro helper text (10px base)
      const helperText = computeNonUniformDynamicScale({
        baseFontSizePx: 10,
        scaleFactor,
        role: 'caption',
      });
      // 10 * (1.5 ^ 1.22) = ~16.4px (super-linear boost for low vision)
      expect(helperText.scaledFontSizePx).toBeGreaterThan(10 * scaleFactor);
      expect(helperText.scaledFontSizePx).toBe(16.4);
    });
  });

  describe('7. Optical Stem Thickness on Form Typography', () => {
    it('validates all live showcase micro-copy satisfies the 1.25px physical stem floor', () => {
      // 10px liveText @ 800 weight -> stem width = 10 * (0.06 + 0.8 * 0.16) = 1.88px (>= 1.25px)
      const liveTextStem = auditOpticalStemThickness({
        fontSizePx: 10,
        fontWeight: 800,
      });
      expect(liveTextStem.passes).toBe(true);
      expect(liveTextStem.estimatedStemWidthPx).toBe(1.88);

      // 11px requiredMark @ 800 weight -> stem width = 11 * 0.188 = 2.07px (>= 1.25px)
      const requiredMarkStem = auditOpticalStemThickness({
        fontSizePx: 11,
        fontWeight: 800,
      });
      expect(requiredMarkStem.passes).toBe(true);
      expect(requiredMarkStem.estimatedStemWidthPx).toBe(2.07);

      // 13px fieldLabel @ 800 weight -> stem width = 13 * 0.188 = 2.44px (>= 1.25px)
      const labelStem = auditOpticalStemThickness({
        fontSizePx: 13,
        fontWeight: 800,
      });
      expect(labelStem.passes).toBe(true);
      expect(labelStem.estimatedStemWidthPx).toBe(2.44);
    });
  });
});
