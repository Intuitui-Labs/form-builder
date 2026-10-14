import { describe, it, expect, vi } from 'vitest';
import {
  FormManager,
  ValidationEngine,
  applyRule,
  type AttachmentPointer,
  type FormSchema,
} from '../../src/index.js';

describe('Reactive Visualizations & File Validation Rules', () => {
  it('reactively recalculates derived visualization metrics via topological DAG', () => {
    const form = new FormManager({
      fields: {
        loanAmount: {
          type: 'slider',
          defaultValue: 100000,
        },
        interestRate: {
          type: 'number',
          defaultValue: 5, // 5%
        },
        monthlyPayment: {
          type: 'number',
          dependsOn: ['loanAmount', 'interestRate'],
          computed: {
            dependsOn: ['loanAmount', 'interestRate'],
            fn: (values) => {
              const p = Number(values.loanAmount || 0);
              const r = Number(values.interestRate || 0) / 100 / 12;
              const n = 360; // 30 years
              if (r === 0) return p / n;
              return Math.round((p * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1));
            },
          },
        },
      },
      onSubmit: vi.fn(),
    });

    // Initial calculation: $100,000 at 5% = ~$537 / mo
    form.setFieldValue('loanAmount', 100000);
    expect(form.getState().values.monthlyPayment).toBe(537);

    // User slides loan amount to $200,000 -> reactively updates to $1,074
    form.setFieldValue('loanAmount', 200000);
    expect(form.getState().values.monthlyPayment).toBe(1074);

    // User changes interest rate to 6% -> reactively updates to $1,199
    form.setFieldValue('interestRate', 6);
    expect(form.getState().values.monthlyPayment).toBe(1199);
  });

  describe('Attachment Validation Rules (applyRule)', () => {
    const smallFile: AttachmentPointer = {
      id: 'f1',
      name: 'avatar.png',
      size: 512000, // 500 KB
      mimeType: 'image/png',
      localUri: 'file:///avatar.png',
    };

    const bigFile: AttachmentPointer = {
      id: 'f2',
      name: 'archive.zip',
      size: 15 * 1024 * 1024, // 15 MB
      mimeType: 'application/zip',
      localUri: 'file:///archive.zip',
    };

    it('evaluates fileSize rule properly', () => {
      const rule = { type: 'fileSize' as const, maxBytes: 2 * 1024 * 1024 }; // 2MB max

      expect(applyRule(rule, smallFile).isValid).toBe(true);
      const res = applyRule(rule, bigFile);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('File size exceeds the limit');
    });

    it('evaluates fileType rule with exact and wildcard mime matches', () => {
      const rule = {
        type: 'fileType' as const,
        allowedMimeTypes: ['image/*', 'application/pdf'],
      };

      expect(applyRule(rule, smallFile).isValid).toBe(true); // image/png matches image/*
      expect(applyRule(rule, { size: 100, mimeType: 'application/pdf' }).isValid).toBe(true);

      const invalidRes = applyRule(rule, bigFile); // application/zip does not match
      expect(invalidRes.isValid).toBe(false);
      expect(invalidRes.error).toContain('File type application/zip is not accepted');
    });

    it('evaluates maxFiles rule for attachment arrays', () => {
      const rule = { type: 'maxFiles' as const, max: 2 };

      expect(applyRule(rule, [smallFile]).isValid).toBe(true);
      expect(applyRule(rule, [smallFile, smallFile]).isValid).toBe(true);

      const invalidRes = applyRule(rule, [smallFile, smallFile, smallFile]);
      expect(invalidRes.isValid).toBe(false);
      expect(invalidRes.error).toContain('Maximum 2 files allowed');
    });
  });

  it('skips non-input fields (rich-text, statement, visualization) during form validation', () => {
    const schema: FormSchema = {
      v: '1.0',
      id: 'rich-form',
      tenantId: 't1',
      title: 'Rich Form',
      pages: [
        {
          id: 'p1',
          fields: [
            { id: 'f1', name: 'content_banner', type: 'rich-text', label: '', required: false, order: 0 },
            { id: 'f2', name: 'calc_viz', type: 'visualization', label: '', required: false, order: 1 },
            { id: 'f3', name: 'user_name', type: 'text', label: 'Name', required: true, order: 2 },
          ],
        },
      ],
    };

    const resValid = ValidationEngine.validateForm({ user_name: 'Alice' }, schema);
    expect(resValid.isValid).toBe(true);
    expect(resValid.errors).toEqual({});

    const resInvalid = ValidationEngine.validateForm({ user_name: '' }, schema);
    expect(resInvalid.isValid).toBe(false);
    expect(resInvalid.errors.user_name).toBeDefined();
    // rich-text and visualization are not flagged as missing
    expect(resInvalid.errors.content_banner).toBeUndefined();
    expect(resInvalid.errors.calc_viz).toBeUndefined();
  });
});
