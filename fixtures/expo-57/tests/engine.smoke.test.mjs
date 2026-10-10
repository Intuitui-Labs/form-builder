import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AnalyticsEngine,
  FormManager,
  MultiStepFormManager,
  ValidationEngine,
  applyRule,
} from '@intuitui-labs/form-builder-engine';
import {
  FormHydrator,
  clearCustomValidators,
  registerCustomValidator,
} from '@intuitui-labs/form-builder-engine/hydration';

const schema = {
  v: '1.0',
  id: 'smoke-wizard',
  tenantId: 'tests',
  title: 'Two-page smoke test',
  settings: {},
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
  pages: [
    {
      id: 'contact', title: 'Contact',
      fields: [{ id: 'name', name: 'name', type: 'text', label: 'Name', required: true, order: 0 }],
    },
    {
      id: 'details', title: 'Details',
      fields: [{
        id: 'email', name: 'email', type: 'email', label: 'Email', required: true, order: 0,
        rules: [{ type: 'email', message: 'Email format is invalid.' }],
      }],
    },
  ],
};

test('published validation rules reject empty, malformed, and out-of-range values', () => {
  assert.equal(applyRule({ type: 'required', message: 'Required.' }, '').isValid, false);
  assert.equal(applyRule({ type: 'email' }, 'not-an-email').isValid, false);
  assert.equal(applyRule({ type: 'min', value: 3 }, 2).isValid, false);
  assert.equal(ValidationEngine.email('dev@example.org').isValid, true);
});

test('a first-pass valid FormManager submission succeeds', async () => {
  let submitted;
  const manager = new FormManager({
    fields: {
      name: { type: 'text', label: 'Name', required: true, defaultValue: 'Taylor' },
      email: {
        type: 'email', label: 'Email', required: true, defaultValue: 'taylor@example.org',
        validators: [(value) => ValidationEngine.email(String(value ?? ''))],
      },
    },
    onSubmit: async (values) => { submitted = values; },
  });

  await manager.submit();
  assert.equal(manager.getState().submitSuccess, true);
  assert.deepEqual(submitted, { name: 'Taylor', email: 'taylor@example.org' });
});

test('v0.1.0 regression verified fixed: corrected errors clear from errorMap and allow submission', async () => {
  let submitted;
  const manager = new FormManager({
    fields: {
      name: { type: 'text', label: 'Name', required: true },
      email: {
        type: 'email', label: 'Email', required: true,
        validators: [(value) => ValidationEngine.email(String(value ?? ''))],
      },
    },
    onSubmit: async (values) => { submitted = values; },
  });

  assert.equal(manager.validate(), false);
  manager.setFieldValue('name', 'Taylor');
  manager.setFieldValue('email', 'taylor@example.org');
  assert.equal(manager.validate(), true);
  assert.deepEqual(manager.getState().errors, {});
  await manager.submit();

  assert.deepEqual(submitted, { name: 'Taylor', email: 'taylor@example.org' });
  assert.equal(manager.getState().submitSuccess, true);
  assert.equal(manager.tsForm.state.errorMap.name, undefined);
  assert.equal(manager.tsForm.state.errorMap.email, undefined);
});

test('MultiStepFormManager gates steps and successfully submits once errors are corrected', async () => {
  let submitted;
  const manager = new MultiStepFormManager(schema, async (values) => { submitted = values; });
  const form = manager.getFormManager();

  assert.equal(manager.getTotalPages(), 2);
  assert.equal(manager.nextStep(), false);
  assert.equal(form.getState().errors.name, 'Name is required');
  form.setFieldValue('name', 'Taylor');
  assert.equal(manager.nextStep(), true);
  assert.equal(manager.getCurrentPageIndex(), 1);
  form.setFieldValue('email', 'bad-address');
  assert.equal(form.getState().errors.email, 'Email format is invalid.');
  form.setFieldValue('email', 'taylor@example.org');
  assert.equal(form.validate(), true);
  await manager.submit();

  assert.deepEqual(form.getState().errors, {});
  assert.deepEqual(submitted, { name: 'Taylor', email: 'taylor@example.org' });
  assert.equal(form.getState().submitSuccess, true);
});

test('FormHydrator builds from JSON and custom validators, and allows submission upon correction', async () => {
  clearCustomValidators();
  registerCustomValidator('letters-only', (value) => {
    const valid = typeof value === 'string' && /^[A-Za-z ]+$/.test(value.trim());
    return valid ? { isValid: true } : { isValid: false, error: 'Use letters and spaces only.' };
  });
  let submitted;
  const manager = FormHydrator.hydrate({
    fields: [{
      name: 'team', type: 'text', label: 'Team', required: true, defaultValue: 'Acme',
      rules: [{ type: 'custom', name: 'letters-only' }],
    }],
  }, async (values) => { submitted = values; });

  assert.equal(manager.getState().values.team, 'Acme');
  manager.setFieldValue('team', 'Ops 7');
  assert.equal(manager.getState().errors.team, 'Use letters and spaces only.');
  manager.setFieldValue('team', 'North Star');
  assert.equal(manager.validate(), true);
  await manager.submit();
  assert.deepEqual(submitted, { team: 'North Star' });
  assert.equal(manager.getState().submitSuccess, true);
  clearCustomValidators();
});

test('AnalyticsEngine aggregates responses and emits CSV and Excel-compatible XML', () => {
  const fields = [
    { id: 'kind', name: 'kind', type: 'select', label: 'Kind', options: [{ label: 'Product', value: 'product' }, { label: 'Workflow', value: 'workflow' }] },
    { id: 'size', name: 'size', type: 'number', label: 'Team size' },
    { id: 'confidence', name: 'confidence', type: 'likert', label: 'Confidence' },
    { id: 'note', name: 'note', type: 'text', label: 'Project name' },
  ];
  const responses = [
    { id: '1', formId: 'f', tenantId: 't', submittedAt: '2026-10-01T09:00:00.000Z', data: { kind: 'product', size: 4, confidence: 8, note: 'Bio, Better' } },
    { id: '2', formId: 'f', tenantId: 't', submittedAt: '2026-10-02T09:00:00.000Z', data: { kind: 'product', size: 8, confidence: 6, note: 'Atlas' } },
    { id: '3', formId: 'f', tenantId: 't', submittedAt: '2026-10-03T09:00:00.000Z', data: { kind: 'workflow', size: 3, confidence: 9, note: 'North Star' } },
  ];
  const stats = AnalyticsEngine.aggregate(fields, responses);
  assert.deepEqual(stats[0].data, { product: 2, workflow: 1 });
  assert.deepEqual(stats[1].data, { average: 5, min: 3, max: 8, count: 3 });
  assert.deepEqual(stats[2].data, [8, 6, 9]);
  const csv = AnalyticsEngine.toCSV(fields, responses);
  assert.match(csv, /"Bio, Better"/);
  assert.match(csv, /Project name/);
  const xml = AnalyticsEngine.toXLSX(fields, responses);
  assert.match(xml, /<Workbook/);
  assert.match(xml, /Bio, Better/);
});
