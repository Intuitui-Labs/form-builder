import { describe, it, expect } from 'vitest';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import { MaskTokenizer } from '../src/core/MaskTokenizer.js';
import { CountryDialRegistry } from '../src/core/CountryDialRegistry.js';
import type { FormSchema } from '../src/schema/FormSchema.js';

describe('MaskTokenizer', () => {
  it('masks dates progressively into YYYY-MM-DD', () => {
    expect(MaskTokenizer.maskDate('1990').formatted).toBe('1990');
    expect(MaskTokenizer.maskDate('19900').formatted).toBe('1990-0');
    expect(MaskTokenizer.maskDate('199005').formatted).toBe('1990-05');
    expect(MaskTokenizer.maskDate('1990052').formatted).toBe('1990-05-2');
    expect(MaskTokenizer.maskDate('19900521').formatted).toBe('1990-05-21');
    expect(MaskTokenizer.maskDate('19900521').isComplete).toBe(true);
  });

  it('masks phone numbers progressively into (###) ###-####', () => {
    expect(MaskTokenizer.maskPhone('415').formatted).toBe('(415');
    expect(MaskTokenizer.maskPhone('415555').formatted).toBe('(415) 555');
    expect(MaskTokenizer.maskPhone('4155552671').formatted).toBe('(415) 555-2671');
    expect(MaskTokenizer.maskPhone('4155552671').isComplete).toBe(true);
  });

  it('masks generic custom patterns like IRS EIN ##-#######', () => {
    expect(MaskTokenizer.maskPattern('12', '##-#######').formatted).toBe('12-');
    expect(MaskTokenizer.maskPattern('123456789', '##-#######').formatted).toBe('12-3456789');
    expect(MaskTokenizer.maskPattern('123456789', '##-#######').isComplete).toBe(true);
  });
});

describe('CountryDialRegistry', () => {
  it('searches by dial code, country name, and ISO code', () => {
    const frMatches = CountryDialRegistry.search('fra');
    expect(frMatches.some((c) => c.name === 'France' && c.dialCode === '+33')).toBe(true);

    const ukMatches = CountryDialRegistry.search('44');
    expect(ukMatches.some((c) => c.iso === 'GB')).toBe(true);

    const usMatches = CountryDialRegistry.search('US');
    expect(usMatches.some((c) => c.iso === 'US' && c.flag === '🇺🇸')).toBe(true);
  });

  it('formats clean E.164 strings', () => {
    expect(CountryDialRegistry.toE164('+1', '(415) 555-2671')).toBe('+14155552671');
    expect(CountryDialRegistry.toE164('+33', '06 12 34 56 78')).toBe('+330612345678');
  });
});

describe('MultiStepFormManager Step Peeking (Dual Cursor)', () => {
  const schema: FormSchema = {
    v: '1.0',
    id: 'peeking-test',
    tenantId: 'test',
    title: 'Peeking Test Form',
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    pages: [
      {
        id: 'step-0',
        title: 'Step 0: Identity',
        role: 'cover',
        fields: [{ id: 'name', name: 'name', type: 'text', label: 'Name', required: true, order: 0 }],
      },
      {
        id: 'step-1',
        title: 'Step 1: Details',
        fields: [{ id: 'role', name: 'role', type: 'text', label: 'Role', required: true, order: 0 }],
      },
      {
        id: 'step-2',
        title: 'Step 2: Review',
        fields: [{ id: 'notes', name: 'notes', type: 'textarea', label: 'Notes', required: false, order: 0 }],
      },
    ],
  };

  it('allows peeking forward to future steps in read-only mode without advancing validation gate', () => {
    const manager = new MultiStepFormManager(schema);
    expect(manager.getCurrentPageIndex()).toBe(0);
    expect(manager.isPeeking()).toBe(false);

    // Peek ahead to step 2 (unvalidated)
    expect(manager.peekStep(2)).toBe(true);
    expect(manager.isPeeking()).toBe(true);
    expect(manager.getInspectedPageIndex()).toBe(2);
    expect(manager.getInspectedPage().id).toBe('step-2');

    // Active edit cursor remains on step 0!
    expect(manager.getCurrentPageIndex()).toBe(0);

    // Stop peeking returns directly to step 0
    manager.stopPeeking();
    expect(manager.isPeeking()).toBe(false);
    expect(manager.getInspectedPageIndex()).toBe(0);

    manager.destroy();
  });
});
