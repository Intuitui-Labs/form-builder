import { describe, it, expect } from 'vitest';

const a11yGate = await (async () => {
  try {
    // @ts-ignore
    return await import('../../a11y-gate/src/index.js');
  } catch {
    try {
      // @ts-ignore
      return await import('@intuitui-labs/a11y-gate');
    } catch {
      return null;
    }
  }
})();

const {
  auditTypographicMicroAttributes = () => ({} as any),
  auditInterContainerRelations = () => ({} as any),
  auditVisualNoiseClutter = () => ({} as any),
} = a11yGate ?? {};

type TypographicAttributeSpec = any;
type InterContainerSpec = any;

describe.skipIf(!a11yGate)('Showcase UI Live Forensic Audit with @intuitui-labs/a11y-gate', () => {
  it('catches all typographic legibility violations extracted from EngineUi.tsx', () => {
    // Exact typographic styles from apps/showcase-latest/src/components/EngineUi.tsx
    const showcaseElements: TypographicAttributeSpec[] = [
      {
        role: 'caption',
        fontSizePx: 8,
        fontWeight: 800,
        colorHex: '#9BA7B8', // colors.faint
        bgHex: '#FBFCFE',
        textSnippet: 'requiredMark (*)',
      },
      {
        role: 'caption',
        fontSizePx: 8,
        fontWeight: 800,
        colorHex: '#92400E',
        bgHex: '#FEF3C7',
        textSnippet: 'peekReadOnlyTag (READ-ONLY)',
      },
      {
        role: 'caption',
        fontSizePx: 9,
        fontWeight: 700,
        colorHex: '#9BA7B8', // colors.faint
        bgHex: '#FFFFFF',
        textSnippet: 'progressLabel (Step description)',
      },
      {
        role: 'caption',
        fontSizePx: 10,
        fontWeight: 800,
        colorHex: '#148C78', // colors.teal
        bgHex: '#E6F6F2',
        textSnippet: 'liveText (SDK 57)',
      },
      {
        role: 'caption',
        fontSizePx: 10,
        fontWeight: 400,
        colorHex: '#66758D', // colors.muted
        bgHex: '#FFFFFF',
        textSnippet: 'fieldHelperText (Helper description)',
      },
      {
        role: 'caption',
        fontSizePx: 12,
        fontWeight: 400, // Anemic regular stroke on sub-14px!
        colorHex: '#66758D',
        bgHex: '#FFFFFF',
        letterSpacingEm: -0.01, // Squeezed tracking!
        textSnippet: 'sectionDetail (Contextual detail)',
      },
    ];

    const result = auditTypographicMicroAttributes(showcaseElements);

    // The audit must FAIL and catch every single one of these violations!
    expect(result.passes).toBe(false);

    // 1. Catches sub-12px micro-fonts
    expect(
      result.violations.some((v) =>
        v.includes('Text "requiredMark (*)" font size (8px) violates the 12px absolute legibility floor')
      )
    ).toBe(true);
    expect(
      result.violations.some((v) =>
        v.includes('Text "progressLabel (Step description)" font size (9px) violates the 12px absolute legibility floor')
      )
    ).toBe(true);
    expect(
      result.violations.some((v) =>
        v.includes('Text "liveText (SDK 57)" font size (10px) violates the 12px absolute legibility floor')
      )
    ).toBe(true);

    // 2. Catches washed-out grey ghosting (#9BA7B8 on #FBFCFE)
    expect(
      result.violations.some((v) =>
        v.includes('fails micro-copy legibility threshold (Lc >= 70 required). Washed-out grey ghosting is banned')
      )
    ).toBe(true);

    // 3. Catches anemic strokes on sub-14px text (requires Medium >= 500)
    expect(
      result.violations.some((v) =>
        v.includes('Sub-14px text "sectionDetail (Contextual detail)" (12px) requires at least Medium weight (>= 500)')
      )
    ).toBe(true);

    // 4. Catches squeezed tracking on micro-copy
    expect(
      result.violations.some((v) =>
        v.includes('tracking (-0.01em) is squeezed: minimum +0.02em required')
      )
    ).toBe(true);
  });

  it('catches horizontal domain card clipping/overflow in DomainPicker', () => {
    // 3 domain cards in a row inside a 600px container width
    const domainPickerRow: InterContainerSpec = {
      outerMarginPx: 20,
      interContainerGutterPx: 14,
      intraContainerPaddingPx: 16,
      containerWidthPx: 640,
      childItems: [
        { id: 'talent-review', minWidthPx: 230 },
        { id: 'ai-mortgage', minWidthPx: 230 },
        { id: 'ai-studio', minWidthPx: 230 }, // 230 * 3 + 28 = 718px > 640px!
      ],
      isScrollableOrWrap: false, // clips on screen!
    };

    const result = auditInterContainerRelations(domainPickerRow);
    expect(result.passes).toBe(false);
    expect(
      result.violations.some((v) =>
        v.includes('Horizontal row container (width 640px) overflows with 3 items totaling 718px')
      )
    ).toBe(true);
  });

  it('catches stacked duplicate header clutter between AI studio cards', () => {
    // The exact titles from the screenshot
    const adjacentHeaders = {
      titles: [
        'Real-Time Search-Grounded AI Compiler',
        'Real-Time Grounded Prompt Compiler',
      ],
    };

    const result = auditVisualNoiseClutter(adjacentHeaders);
    expect(result.passes).toBe(false);
    expect(
      result.violations.some((v) =>
        v.includes('Visual redundancy detected between adjacent titles') &&
        v.includes('devouring vertical screen space with duplicate headers')
      )
    ).toBe(true);
  });
});
