import { describe, it, expect } from 'vitest';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import { resolveSemanticIntent } from '../src/core/SemanticIntentResolver.js';
import { MemoryDraftStorageAdapter } from '../src/affordance/index.js';
import type { FormSchema } from '../src/schema/FormSchema.js';

describe('Semantic Intent Taxonomy & Zero-Knowledge Security', () => {
  describe('SemanticIntentResolver', () => {
    it('resolves one-time-code intent with numeric keyboard and sensitive flag', () => {
      const meta = resolveSemanticIntent('one-time-code');
      expect(meta).toBeDefined();
      expect(meta?.autoComplete).toBe('one-time-code');
      expect(meta?.keyboardType).toBe('numeric');
      expect(meta?.textContentType).toBe('oneTimeCode');
      expect(meta?.inputMode).toBe('numeric');
      expect(meta?.isSensitive).toBe(true);
      expect(meta?.formatMask).toBe('###-###');
    });

    it('resolves password intents with password textContentType and sensitive flag', () => {
      const newPwd = resolveSemanticIntent('new-password');
      expect(newPwd?.autoComplete).toBe('new-password');
      expect(newPwd?.textContentType).toBe('newPassword');
      expect(newPwd?.isSensitive).toBe(true);
      expect(newPwd?.autoCapitalize).toBe('none');
      expect(newPwd?.autoCorrect).toBe(false);

      const curPwd = resolveSemanticIntent('current-password');
      expect(curPwd?.autoComplete).toBe('current-password');
      expect(curPwd?.textContentType).toBe('password');
      expect(curPwd?.isSensitive).toBe(true);
      expect(curPwd?.autoCapitalize).toBe('none');
    });

    it('resolves payment credit card security code as sensitive', () => {
      const csc = resolveSemanticIntent('payment-card-cvc');
      expect(csc?.autoComplete).toBe('cc-csc');
      expect(csc?.keyboardType).toBe('numeric');
      expect(csc?.isSensitive).toBe(true);
      expect(csc?.formatMask).toBe('####');
    });

    it('resolves passkey/webauthn intent correctly', () => {
      const passkey = resolveSemanticIntent('webauthn-passkey');
      expect(passkey?.autoComplete).toBe('webauthn');
      expect(passkey?.textContentType).toBe('username');
      expect(passkey?.isSensitive).toBe(false);
    });

    it('resolves address intents to standard iOS textContentType and HTML autocomplete', () => {
      const addr1 = resolveSemanticIntent('address-line1');
      expect(addr1?.autoComplete).toBe('address-line1');
      expect(addr1?.textContentType).toBe('streetAddressLine1');

      const postal = resolveSemanticIntent('address-postal-code');
      expect(postal?.autoComplete).toBe('postal-code');
      expect(postal?.textContentType).toBe('postalCode');
      expect(postal?.autoCapitalize).toBe('characters');
    });

    it('returns undefined for undefined or unknown intent', () => {
      expect(resolveSemanticIntent(undefined)).toBeUndefined();
      expect(resolveSemanticIntent('unknown-custom-intent' as any)).toBeUndefined();
    });
  });

  describe('Precedence Hierarchy & Guidance Augmentation', () => {
    const testSchema: FormSchema = {
      id: 'checkout-form',
      title: 'Checkout',
      fields: [],
      pages: [
        {
          id: 'step-contact',
          title: 'Contact & Security',
          fields: [
            {
              id: 'email',
              name: 'email',
              type: 'text',
              label: 'Email',
              semanticIntent: 'contact-email',
              privacyRationale: 'We only use this to send order confirmations and receipt.',
              required: true,
            },
            {
              id: 'phone',
              name: 'phone',
              type: 'text',
              label: 'Phone Number',
              semanticIntent: 'contact-phone',
              // Override keyboardType explicitly
              keyboardType: 'default',
              required: true,
            },
            {
              id: 'customSecret',
              name: 'customSecret',
              type: 'text',
              label: 'Internal Code',
              sensitive: true,
              required: true,
            },
          ],
        },
        {
          id: 'step-otp',
          title: 'Verification',
          fields: [
            {
              id: 'otp',
              name: 'otp',
              type: 'text',
              label: 'One-Time Code',
              semanticIntent: 'one-time-code',
              autoAdvanceOnComplete: true,
              validation: {
                maxLength: 6,
                minLength: 6,
              },
            },
            {
              id: 'manualChoice',
              name: 'manualChoice',
              type: 'select',
              label: 'Select Option',
              autoAdvanceOnComplete: false,
              options: [
                { label: 'Option A', value: 'a' },
                { label: 'Option B', value: 'b' },
              ],
            },
          ],
        },
      ],
    };

    it('applies semantic defaults when explicit props are absent', () => {
      const manager = new MultiStepFormManager(testSchema, () => {});
      const emailGuidance = manager.getFieldGuidance('email');

      expect(emailGuidance).toBeDefined();
      expect(emailGuidance?.semanticIntent).toBe('contact-email');
      expect(emailGuidance?.autoComplete).toBe('email');
      expect(emailGuidance?.keyboardType).toBe('email-address');
      expect(emailGuidance?.autoCapitalize).toBe('none');
      expect(emailGuidance?.isSensitive).toBe(false);
      expect(emailGuidance?.privacyRationale).toBe(
        'We only use this to send order confirmations and receipt.'
      );
    });

    it('gives explicit field props priority over semantic intent defaults', () => {
      const manager = new MultiStepFormManager(testSchema, () => {});
      const phoneGuidance = manager.getFieldGuidance('phone');

      expect(phoneGuidance).toBeDefined();
      expect(phoneGuidance?.semanticIntent).toBe('contact-phone');
      // Overridden by field.keyboardType = 'default' rather than 'phone-pad'
      expect(phoneGuidance?.keyboardType).toBe('default');
      expect(phoneGuidance?.autoComplete).toBe('tel');
    });

    it('marks fields sensitive if explicitly flagged even without semantic intent', () => {
      const manager = new MultiStepFormManager(testSchema, () => {});
      const secretGuidance = manager.getFieldGuidance('customSecret');

      expect(secretGuidance).toBeDefined();
      expect(secretGuidance?.isSensitive).toBe(true);
    });

    it('computes shouldAutoAdvance when conclusive token condition is satisfied', () => {
      const manager = new MultiStepFormManager(testSchema, () => {});
      manager.goToStep(1);

      // Initially OTP is empty -> shouldAutoAdvance false
      expect(manager.getFieldGuidance('otp')?.shouldAutoAdvance).toBe(false);

      // Incomplete OTP (empty) -> shouldAutoAdvance false
      manager.setFieldValue('otp', '');
      expect(manager.getFieldGuidance('otp')?.shouldAutoAdvance).toBe(false);

      // Populated valid OTP -> shouldAutoAdvance true
      manager.setFieldValue('otp', '123456');
      expect(manager.getFieldGuidance('otp')?.shouldAutoAdvance).toBe(true);

      // Field with autoAdvanceOnComplete: false never auto-advances
      manager.setFieldValue('manualChoice', 'a');
      expect(manager.getFieldGuidance('manualChoice')?.shouldAutoAdvance).toBe(false);
    });
  });

  describe('Zero-Knowledge Draft Redaction & Safe Resumption', () => {
    const paymentSchema: FormSchema = {
      id: 'secure-payment-flow',
      version: '2.0.0',
      title: 'Payment Flow',
      fields: [],
      pages: [
        {
          id: 'step-customer',
          title: 'Customer Details',
          fields: [
            {
              id: 'fullName',
              name: 'fullName',
              type: 'text',
              label: 'Full Name',
              semanticIntent: 'name-full',
            },
            {
              id: 'accountPassword',
              name: 'accountPassword',
              type: 'password',
              label: 'Password',
              semanticIntent: 'new-password',
            },
          ],
        },
        {
          id: 'step-payment',
          title: 'Card Details',
          fields: [
            {
              id: 'cardNumber',
              name: 'cardNumber',
              type: 'text',
              label: 'Card Number',
              semanticIntent: 'payment-card-number',
            },
            {
              id: 'cvv',
              name: 'cvv',
              type: 'text',
              label: 'CVV',
              semanticIntent: 'payment-card-cvc',
            },
            {
              id: 'pinCode',
              name: 'pinCode',
              type: 'text',
              label: 'ATM PIN',
              sensitive: true, // explicitly sensitive
            },
          ],
        },
      ],
    };

    it('redacts sensitive fields from persisted snapshot while retaining safe values', () => {
      const storage = new MemoryDraftStorageAdapter();
      const manager = new MultiStepFormManager(
        paymentSchema,
        () => {},
        { resilience: { draftStorage: storage } }
      );

      // Populate safe and sensitive values
      manager.setFieldValue('fullName', 'Ada Lovelace');
      manager.setFieldValue('accountPassword', 'superSecretP@ss1');
      manager.setFieldValue('cardNumber', '4111222233334444');
      manager.setFieldValue('cvv', '987');
      manager.setFieldValue('pinCode', '1234');

      // Save draft
      const snapshot = manager.saveDraft();

      // Verify safe fields exist in snapshot
      expect(snapshot.values).toBeDefined();
      expect((snapshot.values as any).fullName).toBe('Ada Lovelace');
      expect((snapshot.values as any).cardNumber).toBe('4111222233334444');

      // Verify sensitive fields are completely redacted from snapshot values
      expect((snapshot.values as any).accountPassword).toBeUndefined();
      expect((snapshot.values as any).cvv).toBeUndefined();
      expect((snapshot.values as any).pinCode).toBeUndefined();

      // Verify redactedFields metadata list contains all stripped fields
      expect(snapshot.redactedFields).toEqual(
        expect.arrayContaining(['accountPassword', 'cvv', 'pinCode'])
      );
      expect(snapshot.redactedFields?.length).toBe(3);

      // Verify storage received the exact same redacted payload
      const stored = storage.loadDraft('secure-payment-flow');
      expect(stored).toBeDefined();
      expect((stored?.values as any).cvv).toBeUndefined();
      expect((stored?.values as any).accountPassword).toBeUndefined();
      expect((stored?.values as any).pinCode).toBeUndefined();
      expect((stored?.values as any).fullName).toBe('Ada Lovelace');
    });

    it('restores draft safely without shaming user with premature validation errors on redacted fields', async () => {
      const storage = new MemoryDraftStorageAdapter();
      const manager1 = new MultiStepFormManager(
        paymentSchema,
        () => {},
        { resilience: { draftStorage: storage } }
      );

      manager1.setFieldValue('fullName', 'Grace Hopper');
      manager1.setFieldValue('accountPassword', 'ComplexPass123!');
      manager1.setFieldValue('cvv', '321');
      manager1.goToStep(1);
      manager1.saveDraft();

      // Fresh session resuming from draft
      const manager2 = new MultiStepFormManager(
        paymentSchema,
        () => {},
        { resilience: { draftStorage: storage } }
      );
      const restored = await manager2.restoreDraft();
      expect(restored).toBe(true);

      const state2 = manager2.getState();
      expect((state2.values as any).fullName).toBe('Grace Hopper');

      // Sensitive fields must remain pristine/empty
      expect((state2.values as any).accountPassword).toBeFalsy();
      expect((state2.values as any).cvv).toBeFalsy();

      // Resumed manager position is preserved
      expect(manager2.getCurrentPageIndex()).toBe(1);

      // Crucial: redacted fields were NOT touched during restore, preventing premature error shaming
      expect(manager2.isFieldTouched('accountPassword')).toBe(false);
      expect(manager2.isFieldTouched('cvv')).toBe(false);
      expect(state2.errors?.['cvv']).toBeUndefined();
      expect(state2.errors?.['accountPassword']).toBeUndefined();
    });
  });
});
