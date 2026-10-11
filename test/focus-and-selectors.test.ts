import { describe, it, expect, vi } from 'vitest';
import { NativeFocusController, type FocusableNode } from '../src/focus/NativeFocusController.js';
import { FormManager } from '../src/manager/FormManager.js';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import type { FormSchema } from '../src/schema/FormSchema.js';

describe('Universal Architectural Seams: React 19 Focus, Selectors & Defaults', () => {
  /* =========================================================================
   * SEAM 3: REACT 19 CALLBACK REF CLEANUP PROTOCOL & FABRIC FOCUS CONTROLLER
   * ========================================================================= */
  describe('Seam 3: NativeFocusController & React 19 Callback Ref Protocol', () => {
    it('returns a cleanup function conforming to React 19 callback ref protocol', () => {
      const controller = new NativeFocusController();
      const mockNode: FocusableNode = {
        focus: vi.fn(),
        blur: vi.fn(),
      };

      // 1. Calling register returns a ref callback
      const refCallback = controller.register('email');
      expect(typeof refCallback).toBe('function');

      // 2. Passing the node registers it and returns a cleanup function (React 19 contract)
      const cleanup = refCallback(mockNode);
      expect(typeof cleanup).toBe('function');
      expect(controller.getNode('email')).toBe(mockNode);
      expect(controller.getRegisteredCount()).toBe(1);

      // 3. Invoking the React 19 cleanup function unregisters the node
      if (typeof cleanup === 'function') {
        cleanup();
      }
      expect(controller.getNode('email')).toBeUndefined();
      expect(controller.getRegisteredCount()).toBe(0);
    });

    it('handles React 18 null unmount callbacks gracefully', () => {
      const controller = new NativeFocusController();
      const mockNode: FocusableNode = { focus: vi.fn() };

      const refCallback = controller.register('username');
      refCallback(mockNode);
      expect(controller.getNode('username')).toBe(mockNode);

      // React 18 passes null on unmount
      refCallback(null);
      expect(controller.getNode('username')).toBeUndefined();
    });

    it('focuses field by name and handles missing or throwing nodes safely', () => {
      const controller = new NativeFocusController();
      const focusFn = vi.fn();
      const throwingNode: FocusableNode = {
        focus: () => {
          throw new Error('Native Fabric element unmounted');
        },
      };

      controller.register('validField')({ focus: focusFn });
      controller.register('brokenField')(throwingNode);

      expect(controller.focusField('validField')).toBe(true);
      expect(focusFn).toHaveBeenCalledTimes(1);

      // Nonexistent field returns false without error
      expect(controller.focusField('nonexistent')).toBe(false);

      // Throwing node returns false without crashing caller
      expect(controller.focusField('brokenField')).toBe(false);
    });

    it('advances focus to next sequential field via focusNext', () => {
      const controller = new NativeFocusController();
      const focusFirst = vi.fn();
      const focusSecond = vi.fn();
      const focusThird = vi.fn();

      controller.register('fieldA')({ focus: focusFirst });
      controller.register('fieldB')({ focus: focusSecond });
      controller.register('fieldC')({ focus: focusThird });

      const fieldOrder = ['fieldA', 'fieldB', 'fieldC'];
      const advanced = controller.focusNext('fieldA', fieldOrder);
      expect(advanced).toBe(true);
      expect(focusSecond).toHaveBeenCalledTimes(1);

      const advancedAgain = controller.focusNext('fieldB', fieldOrder);
      expect(advancedAgain).toBe(true);
      expect(focusThird).toHaveBeenCalledTimes(1);

      // Reaching end of sequence returns false
      const atEnd = controller.focusNext('fieldC', fieldOrder);
      expect(atEnd).toBe(false);
    });

    it('focuses first invalid field in sequence via focusFirstInvalid', () => {
      const controller = new NativeFocusController();
      const focusA = vi.fn();
      const focusB = vi.fn();
      const focusC = vi.fn();

      controller.register('fieldA')({ focus: focusA });
      controller.register('fieldB')({ focus: focusB });
      controller.register('fieldC')({ focus: focusC });

      const errors = {
        fieldB: 'Field B is required',
        fieldC: 'Field C is invalid',
      };

      const focused = controller.focusFirstInvalid(errors, ['fieldA', 'fieldB', 'fieldC']);
      expect(focused).toBe(true);
      expect(focusA).not.toHaveBeenCalled();
      expect(focusB).toHaveBeenCalledTimes(1);
      expect(focusC).not.toHaveBeenCalled();
    });
  });

  /* =========================================================================
   * SEAM 2: FINE-GRAINED SUBSCRIPTION SELECTORS (ISOLATING MOBILE KEYSTROKES)
   * ========================================================================= */
  describe('Seam 2: Fine-Grained Subscription Selectors (subscribeToField)', () => {
    it('notifies only the targeted field subscriber, isolating unrelated typing re-renders', () => {
      const form = new FormManager({
        fields: {
          firstName: { type: 'text', label: 'First Name', required: true },
          lastName: { type: 'text', label: 'Last Name', required: true },
          age: { type: 'number', label: 'Age' },
        },
        onSubmit: () => {},
      });

      const firstCalls: string[] = [];
      const lastCalls: string[] = [];

      const unsubFirst = form.subscribeToField('firstName', (val) => {
        firstCalls.push(val as string);
      });

      const unsubLast = form.subscribeToField('lastName', (val) => {
        lastCalls.push(val as string);
      });

      // Initial invocation upon subscription
      expect(firstCalls).toEqual(['']);
      expect(lastCalls).toEqual(['']);

      // 1. Changing firstName triggers ONLY firstName subscriber
      form.setFieldValue('firstName', 'Ada');
      expect(firstCalls).toEqual(['', 'Ada']);
      expect(lastCalls).toEqual(['']); // Untouched! 0 unnecessary re-renders for lastName

      // 2. Changing lastName triggers ONLY lastName subscriber
      form.setFieldValue('lastName', 'Lovelace');
      expect(firstCalls).toEqual(['', 'Ada']); // Untouched!
      expect(lastCalls).toEqual(['', 'Lovelace']);

      // 3. Unsubscribing stops callbacks
      unsubFirst();
      form.setFieldValue('firstName', 'Grace');
      expect(firstCalls).toEqual(['', 'Ada']); // Did not receive 'Grace'

      unsubLast();
    });

    it('delegates subscribeToField on MultiStepFormManager seamlessly', () => {
      const schema: FormSchema = {
        id: 'multi-sub-test',
        title: 'Selector Test',
        fields: [],
        pages: [
          {
            id: 'page1',
            title: 'Page 1',
            fields: [
              { id: 'f1', name: 'email', type: 'email', label: 'Email', required: true },
            ],
          },
        ],
      };

      const multi = new MultiStepFormManager(schema, () => {});
      const observed: Array<{ val: unknown; err?: string }> = [];

      const unsub = multi.subscribeToField('email', (val, err) => {
        observed.push({ val, err });
      });

      multi.getFormManager().setFieldValue('email', 'bad-email');
      expect(observed.length).toBe(2);
      expect(observed[1]?.val).toBe('bad-email');

      unsub();
    });
  });

  /* =========================================================================
   * SEAM 4: STRICT TYPE-AWARE DEFAULT INITIALIZATION
   * ========================================================================= */
  describe('Seam 4: Strict Type-Aware Default Initialization', () => {
    it('initializes numbers/sliders to null, switches/checkboxes to false, multiselect to empty array', () => {
      const form = new FormManager({
        fields: {
          strField: { type: 'text' },
          numField: { type: 'number' },
          sliderField: { type: 'slider' },
          boolField: { type: 'switch' },
          boxField: { type: 'checkbox' },
          tagsField: { type: 'multiselect' },
          explicitField: { type: 'number', defaultValue: 42 },
        },
        onSubmit: () => {},
      });

      const state = form.getState();
      expect(state.values.strField).toBe('');
      expect(state.values.numField).toBeNull();
      expect(state.values.sliderField).toBeNull();
      expect(state.values.boolField).toBe(false);
      expect(state.values.boxField).toBe(false);
      expect(state.values.tagsField).toEqual([]);
      expect(state.values.explicitField).toBe(42);
    });

    it('treats 0 as a valid entry for required number fields instead of falsy error', () => {
      const form = new FormManager({
        fields: {
          score: { type: 'number', label: 'Score', required: true },
        },
        onSubmit: () => {},
      });

      // Initially null -> required fails
      expect(form.validateField('score')).toBe(false);
      expect(form.getState().errors.score).toBe('Score is required');

      // User enters 0 -> 0 is a valid number, NOT falsy empty!
      form.setFieldValue('score', 0);
      expect(form.validateField('score')).toBe(true);
      expect(form.getState().errors.score).toBeUndefined();
    });
  });

  /* =========================================================================
   * SEAM 5: NON-DESTRUCTIVE ERROR ERGONOMICS & TOUCHED LIFECYCLE
   * ========================================================================= */
  describe('Seam 5: Non-Destructive Error Ergonomics & Touched Lifecycle', () => {
    it('tracks touched state on field modification and supports explicit setFieldTouched', () => {
      const form = new FormManager({
        fields: {
          name: { type: 'text', label: 'Name', required: true },
        },
        onSubmit: () => {},
      });

      expect(form.isFieldTouched('name')).toBe(false);
      expect(form.getState().touched.name).toBeUndefined();

      // UI blur event marks field touched explicitly
      form.setFieldTouched('name', true);
      expect(form.isFieldTouched('name')).toBe(true);
      expect(form.getState().touched.name).toBe(true);

      // Reset clears touched states
      form.reset();
      expect(form.isFieldTouched('name')).toBe(false);
    });
  });
});
