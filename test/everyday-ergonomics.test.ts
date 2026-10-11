import { describe, it, expect } from 'vitest';
import { FormManager } from '../src/manager/FormManager.js';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import { FieldDependencyGraph } from '../src/core/DependencyGraph.js';
import { ValueNormalizer } from '../src/core/ValueNormalizer.js';
import { PaymentCardHelper } from '../src/core/PaymentCardHelper.js';
import { PasswordEntropyEstimator } from '../src/core/PasswordEntropyEstimator.js';
import type { FormSchema } from '../src/schema/FormSchema.js';

describe('Everyday Form Ergonomics & Relational Invariants Engine', () => {
  describe('Pillar 1: FieldDependencyGraph & Cycle Protection', () => {
    it('registers dependencies and returns topological dependents in evaluation order', () => {
      const graph = new FieldDependencyGraph();
      // B depends on A, C depends on B
      graph.addDependency('B', 'A');
      graph.addDependency('C', 'B');

      expect(graph.hasDependents('A')).toBe(true);
      expect(graph.hasDependents('C')).toBe(false);

      const dependentsOfA = graph.getDependents('A');
      expect(dependentsOfA).toContain('B');
      expect(dependentsOfA).toContain('C');
    });

    it('detects circular dependency loops and returns the cycle path', () => {
      const graph = new FieldDependencyGraph();
      // A -> B -> C -> A
      graph.addDependency('B', 'A');
      graph.addDependency('C', 'B');
      graph.addDependency('A', 'C');

      const cycle = graph.detectCycles();
      expect(cycle).not.toBeNull();
      expect(cycle).toContain('A');
      expect(cycle).toContain('B');
      expect(cycle).toContain('C');
    });

    it('throws immediately on self-dependency', () => {
      const graph = new FieldDependencyGraph();
      expect(() => graph.addDependency('A', 'A')).toThrow(/cannot depend on itself/);
    });

    it('rejects circular dependencies during FormManager initialization', () => {
      expect(() => {
        new FormManager({
          fields: {
            stepA: {
              type: 'text',
              dependsOn: ['stepB'],
            },
            stepB: {
              type: 'text',
              dependsOn: ['stepA'],
            },
          },
          onSubmit: () => {},
        });
      }).toThrow(/Circular dependency detected/);
    });
  });

  describe('Pillar 2: Reactive Cross-Field Validation Invariants', () => {
    it('re-validates confirmPassword reactively when password changes', () => {
      const manager = new FormManager({
        fields: {
          password: {
            type: 'password',
            required: true,
          },
          confirmPassword: {
            type: 'password',
            required: true,
            rules: [
              {
                type: 'matchesField',
                targetField: 'password',
                message: 'Passwords must match',
              },
            ],
          },
        },
        onSubmit: () => {},
      });

      // Initially set password
      manager.setFieldValue('password', 'Secret123!');
      manager.setFieldValue('confirmPassword', 'WrongPass');
      expect(manager.getState().errors.confirmPassword).toBe('Passwords must match');

      // Now match confirmPassword -> error clears
      manager.setFieldValue('confirmPassword', 'Secret123!');
      expect(manager.getState().errors.confirmPassword).toBeUndefined();

      // Crucial test: User edits original password -> confirmPassword reactively becomes invalid!
      manager.setFieldValue('password', 'NewSecret999!');
      expect(manager.getState().errors.confirmPassword).toBe('Passwords must match');
    });

    it('validates date ranges (greaterThanField / lessThanField)', () => {
      const manager = new FormManager({
        fields: {
          startDate: {
            type: 'text',
            required: true,
          },
          endDate: {
            type: 'text',
            required: true,
            rules: [
              {
                type: 'greaterThanField',
                targetField: 'startDate',
                message: 'End date must be after start date',
              },
            ],
          },
        },
        onSubmit: () => {},
      });

      manager.setFieldValue('startDate', '2026-10-15');
      // End date before start date -> fails
      manager.setFieldValue('endDate', '2026-10-10');
      expect(manager.getState().errors.endDate).toBe('End date must be after start date');

      // End date after start date -> passes
      manager.setFieldValue('endDate', '2026-10-20');
      expect(manager.getState().errors.endDate).toBeUndefined();

      // Advancing start date past end date reactively invalidates end date!
      manager.setFieldValue('startDate', '2026-10-25');
      expect(manager.getState().errors.endDate).toBe('End date must be after start date');
    });

    it('enforces conditional requirements via requiredIfField', () => {
      const manager = new FormManager({
        fields: {
          isBusiness: {
            type: 'checkbox',
            defaultValue: false,
          },
          taxId: {
            type: 'text',
            rules: [
              {
                type: 'requiredIfField',
                targetField: 'isBusiness',
                operator: 'equals',
                value: true,
                message: 'Tax ID is required for business accounts',
              },
            ],
          },
        },
        onSubmit: () => {},
      });

      // Individual account: taxId is optional
      manager.setFieldValue('isBusiness', false);
      expect(manager.validateField('taxId')).toBe(true);

      // Switched to business: taxId is now required!
      manager.setFieldValue('isBusiness', true);
      expect(manager.getState().errors.taxId).toBe('Tax ID is required for business accounts');

      // Populating taxId clears the error
      manager.setFieldValue('taxId', '12-3456789');
      expect(manager.getState().errors.taxId).toBeUndefined();
    });
  });

  describe('Pillar 3: Postel’s Law Normalization Pipeline', () => {
    it('normalizes inputs using built-in normalizers', () => {
      expect(ValueNormalizer.trim('  hello world  ')).toBe('hello world');
      expect(ValueNormalizer.lowercase(' Alice@Example.COM ')).toBe('alice@example.com');
      expect(ValueNormalizer.uppercase(' save20 ')).toBe('SAVE20');
      expect(ValueNormalizer.digitsOnly('A-123.45#6')).toBe('123456');
      expect(ValueNormalizer.cardNumber('4111 2222 3333 4444')).toBe('4111222233334444');
      expect(ValueNormalizer.phoneE164('+1 (555) 123-4567')).toBe('+15551234567');
      expect(ValueNormalizer.phoneE164('(555) 123-4567')).toBe('5551234567');
    });

    it('applies onBlur normalization to protect caret position during typing', () => {
      const manager = new FormManager({
        fields: {
          email: {
            type: 'email',
            normalizer: 'lowercase',
            normalizeOn: 'blur', // default safe mode
          },
        },
        onSubmit: () => {},
      });

      // While typing, raw value is preserved to avoid jumping cursor
      manager.setFieldValue('email', '  TestUser@Domain.Com ');
      expect(manager.getState().values.email).toBe('  TestUser@Domain.Com ');

      // On blur, value is canonicalized and cleaned
      manager.blurField('email');
      expect(manager.getState().values.email).toBe('testuser@domain.com');
    });

    it('applies immediate onChange normalization for strict digit/card fields', () => {
      const manager = new FormManager({
        fields: {
          cardNumber: {
            type: 'text',
            normalizer: 'card-number',
            normalizeOn: 'change',
          },
        },
        onSubmit: () => {},
      });

      manager.setFieldValue('cardNumber', '4111 2222 3333 4444');
      expect(manager.getState().values.cardNumber).toBe('4111222233334444');
    });
  });

  describe('Pillar 4: Payment Card Luhn, Brand Intelligence & Expiry Math', () => {
    it('validates card numbers using Luhn Mod-10 checksum', () => {
      // Known valid test card numbers (test data)
      expect(PaymentCardHelper.validateLuhn('49927398716')).toBe(true);
      expect(PaymentCardHelper.validateLuhn('49927398717')).toBe(false); // 1 digit wrong
      expect(PaymentCardHelper.validateLuhn('12345')).toBe(false); // Too short
    });

    it('detects card brands accurately from IIN prefixes', () => {
      expect(PaymentCardHelper.detectCardBrand('4111222233334444')).toBe('visa');
      expect(PaymentCardHelper.detectCardBrand('5500000000000004')).toBe('mastercard');
      expect(PaymentCardHelper.detectCardBrand('378282246310005')).toBe('amex');
      expect(PaymentCardHelper.detectCardBrand('6011111111111117')).toBe('discover');
      expect(PaymentCardHelper.detectCardBrand('9999999999999999')).toBe('unknown');
    });

    it('adapts CVC requirements dynamically for American Express', () => {
      expect(PaymentCardHelper.getCvcSpecs('amex')).toEqual({
        minLength: 4,
        maxLength: 4,
        mask: '####',
      });
      expect(PaymentCardHelper.getCvcSpecs('visa')).toEqual({
        minLength: 3,
        maxLength: 4,
        mask: '###',
      });
    });

    it('validates expiration dates safely with timezone and month-end awareness', () => {
      const refDate = new Date(Date.UTC(2026, 9, 15)); // Oct 15, 2026

      // Past month in same year -> expired
      const pastMonth = PaymentCardHelper.validateCardExpiry('09/26', refDate);
      expect(pastMonth.isValid).toBe(false);
      expect(pastMonth.error).toBe('Card has expired');

      // Current month (valid until end of month) -> valid!
      const currentMonth = PaymentCardHelper.validateCardExpiry('10/26', refDate);
      expect(currentMonth.isValid).toBe(true);

      // Future month -> valid!
      const futureMonth = PaymentCardHelper.validateCardExpiry('12/28', refDate);
      expect(futureMonth.isValid).toBe(true);

      // Invalid month number -> invalid
      const invalidMonth = PaymentCardHelper.validateCardExpiry('13/26', refDate);
      expect(invalidMonth.isValid).toBe(false);
      expect(invalidMonth.error).toBe('Expiration month must be between 01 and 12');
    });

    it('exposes cardBrand and dynamic CVC formatMask in MultiStepFormManager guidance', () => {
      const schema: FormSchema = {
        id: 'checkout',
        title: 'Checkout',
        fields: [],
        pages: [
          {
            id: 'payment',
            title: 'Payment',
            fields: [
              {
                id: 'cardNumber',
                name: 'cardNumber',
                type: 'text',
                label: 'Card Number',
                semanticIntent: 'payment-card-number',
              },
              {
                id: 'cvc',
                name: 'cvc',
                type: 'text',
                label: 'Security Code',
                semanticIntent: 'payment-card-cvc',
              },
            ],
          },
        ],
      };

      const manager = new MultiStepFormManager(schema, () => {});

      // Typing an Amex card number
      manager.setFieldValue('cardNumber', '378282246310005');
      const cardGuidance = manager.getFieldGuidance('cardNumber');
      expect(cardGuidance?.cardBrand).toBe('amex');

      // CVC field dynamically adapts format mask to '####' for Amex
      const cvcGuidance = manager.getFieldGuidance('cvc');
      expect(cvcGuidance?.formatMask).toBe('####');

      // Typing a Visa card number
      manager.setFieldValue('cardNumber', '4111222233334444');
      expect(manager.getFieldGuidance('cardNumber')?.cardBrand).toBe('visa');
      // CVC field adapts back to '###' for Visa
      expect(manager.getFieldGuidance('cvc')?.formatMask).toBe('###');
    });
  });

  describe('Pillar 5: Password Entropy Estimator & Human Guidance', () => {
    it('estimates Shannon entropy and penalizes common patterns', () => {
      const common = PasswordEntropyEstimator.estimate('password123');
      expect(common.score).toBeLessThanOrEqual(1);
      expect(common.feedback.length).toBeGreaterThan(0);

      const weak = PasswordEntropyEstimator.estimate('short');
      expect(weak.score).toBe(0);
      expect(weak.feedback).toContain('Make password at least 8 characters long.');

      const strong = PasswordEntropyEstimator.estimate('Correct-Horse-Battery-Staple-2026!');
      expect(strong.score).toBeGreaterThanOrEqual(3);
    });

    it('exposes entropyScore and actionable tips in MultiStepFormManager guidance', () => {
      const schema: FormSchema = {
        id: 'signup',
        title: 'Signup',
        fields: [],
        pages: [
          {
            id: 'account',
            title: 'Account',
            fields: [
              {
                id: 'pwd',
                name: 'pwd',
                type: 'password',
                label: 'Password',
                semanticIntent: 'new-password',
              },
            ],
          },
        ],
      };

      const manager = new MultiStepFormManager(schema, () => {});

      manager.setFieldValue('pwd', 'abc');
      const guidance = manager.getFieldGuidance('pwd');
      expect(guidance?.entropyScore).toBeDefined();
      expect(guidance?.entropyScore).toBeLessThanOrEqual(1);
      expect(guidance?.entropyFeedback?.length).toBeGreaterThan(0);
    });
  });

  describe('Pillar 6: Reactive Computed / Derived Fields', () => {
    it('automatically recomputes derived field values when dependencies change', () => {
      const manager = new FormManager({
        fields: {
          quantity: {
            type: 'number',
            defaultValue: 2,
          },
          unitPrice: {
            type: 'number',
            defaultValue: 50,
          },
          total: {
            type: 'number',
            defaultValue: 100,
            computed: {
              dependsOn: ['quantity', 'unitPrice'],
              fn: (values) => Number(values.quantity || 0) * Number(values.unitPrice || 0),
            },
          },
        },
        onSubmit: () => {},
      });

      expect(manager.getState().values.total).toBe(100);

      // Changing quantity reactively updates total!
      manager.setFieldValue('quantity', 5);
      expect(manager.getState().values.total).toBe(250);

      // Changing unitPrice reactively updates total!
      manager.setFieldValue('unitPrice', 20);
      expect(manager.getState().values.total).toBe(100);
    });
  });
});
