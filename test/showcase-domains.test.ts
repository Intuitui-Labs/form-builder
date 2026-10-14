import { describe, it, expect } from 'vitest';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import { PureSchemaAdapter } from '../src/schema/adapters/PureSchemaAdapter.js';
import { validateFormSchema } from '../src/schema/FormSchemaValidation.js';
import {
  READINESS_SCHEMA,
  PATIENT_TRIAGE_SCHEMA,
  COMMERCIAL_LENDING_SCHEMA,
  INCIDENT_POSTMORTEM_SCHEMA,
  PEER_REVIEW_SCHEMA,
  AI_MORTGAGE_SCHEMA,
  SHOWCASE_CATALOG,
  READINESS_SAMPLES,
  PATIENT_TRIAGE_SAMPLES,
  COMMERCIAL_LENDING_SAMPLES,
  INCIDENT_POSTMORTEM_SAMPLES,
  PEER_REVIEW_SAMPLES,
  AI_MORTGAGE_SAMPLES,
} from '../apps/showcase-latest/src/forms.js';

describe('Showcase 6-Domain Form Architectures', () => {
  const adapter = new PureSchemaAdapter();

  it('contains exactly 7 uniquely targeted domain archetypes in SHOWCASE_CATALOG', () => {
    expect(SHOWCASE_CATALOG).toHaveLength(7);
    const domains = SHOWCASE_CATALOG.map((c) => c.domain);
    expect(domains).toEqual(['Product Ops', 'HealthTech', 'FinTech', 'DevSecOps', 'People Ops', 'AI FinTech', 'AI Studio']);
  });

  describe('Domain 1: Product Ops (Launch Readiness Review)', () => {
    it('validates schema structure and linear step progress', () => {
      const res = adapter.safeValidate(READINESS_SCHEMA);
      expect(res.success).toBe(true);
      expect(validateFormSchema(READINESS_SCHEMA).id).toBe('launch-readiness');

      const manager = new MultiStepFormManager(READINESS_SCHEMA);
      expect(manager.getTotalPages()).toBe(4);
      expect(manager.getCurrentPage().id).toBe('identity');
      manager.destroy();
    });
  });

  describe('Domain 2: HealthTech (Clinical Patient Triage & Intake)', () => {
    it('validates sanitized Markdown rich-text consent & dynamic visibleIf fields', () => {
      const res = adapter.safeValidate(PATIENT_TRIAGE_SCHEMA);
      expect(res.success).toBe(true);

      const manager = new MultiStepFormManager(PATIENT_TRIAGE_SCHEMA);
      const form = manager.getFormManager();

      // Step 0: Cover page
      expect(manager.getCurrentPage().role).toBe('cover');
      expect(manager.validateCurrentStep()).toBe(true);
      manager.nextStep();

      // Step 1: Consent & Identity
      expect(manager.getCurrentPage().fields[0]?.type).toBe('rich-text');
      expect(manager.getCurrentPage().fields[0]?.content).toContain('Notice of Telehealth Privacy');

      // Populate valid step 1 data
      form.setFieldValue('patientFullName', PATIENT_TRIAGE_SAMPLES.patientFullName);
      form.setFieldValue('dateOfBirth', PATIENT_TRIAGE_SAMPLES.dateOfBirth);
      form.setFieldValue('emergencyPhone', PATIENT_TRIAGE_SAMPLES.emergencyPhone);
      expect(manager.validateCurrentStep()).toBe(true);
      manager.nextStep();

      // Step 2: Symptoms & Medical History
      expect(manager.getCurrentPageIndex()).toBe(2);

      // When hasAllergies is 'no', allergyDetails is hidden
      form.setFieldValue('primarySymptom', 'respiratory');
      form.setFieldValue('painSeverity', 5);
      form.setFieldValue('hasAllergies', 'no');
      let visible = manager.getVisibleFields();
      expect(visible.some((f) => f.name === 'allergyDetails')).toBe(false);

      // When hasAllergies is 'yes', allergyDetails dynamically becomes visible
      form.setFieldValue('hasAllergies', 'yes');
      visible = manager.getVisibleFields();
      expect(visible.some((f) => f.name === 'allergyDetails')).toBe(true);

      // requiredIfField enforces description when visible
      form.setFieldValue('allergyDetails', '');
      expect(manager.validateCurrentStep()).toBe(false);

      form.setFieldValue('allergyDetails', 'Penicillin allergy');
      expect(manager.validateCurrentStep()).toBe(true);

      manager.destroy();
    });
  });

  describe('Domain 3: FinTech (Commercial Credit & KYC Underwriting)', () => {
    it('enforces Luhn card checksum, EIN pattern, and cross-field matches', () => {
      const res = adapter.safeValidate(COMMERCIAL_LENDING_SCHEMA);
      expect(res.success).toBe(true);

      const manager = new MultiStepFormManager(COMMERCIAL_LENDING_SCHEMA);
      const form = manager.getFormManager();

      // Step 1: Entity & KYC
      form.setFieldValue('businessLegalName', 'Apex Logistics');
      form.setFieldValue('businessAddress', '100 Main St, Austin, TX');

      // Test EIN pattern rule
      form.setFieldValue('taxId', '123456789'); // missing hyphen
      expect(form.validateField('taxId')).toBe(false);
      form.setFieldValue('taxId', '12-3456789'); // valid IRS format
      expect(form.validateField('taxId')).toBe(true);

      // Test matchesField for email confirmation
      form.setFieldValue('authorizedOfficerEmail', 'officer@apex.com');
      form.setFieldValue('confirmOfficerEmail', 'different@apex.com');
      expect(form.validateField('confirmOfficerEmail')).toBe(false);
      form.setFieldValue('confirmOfficerEmail', 'officer@apex.com');
      expect(form.validateField('confirmOfficerEmail')).toBe(true);

      // Populate step 1 and step 2 to navigate legally
      expect(manager.validateCurrentStep()).toBe(true);
      manager.nextStep();

      form.setFieldValue('requestedAmount', 250000);
      form.setFieldValue('annualRevenue', 1500000);
      expect(manager.validateCurrentStep()).toBe(true);
      manager.nextStep();

      // Step 3: Card settlement with Luhn validation
      expect(manager.getCurrentPageIndex()).toBe(2);
      form.setFieldValue('corporateCardNumber', '4242424242424241'); // 1 digit off -> invalid Luhn
      expect(form.validateField('corporateCardNumber')).toBe(false);

      form.setFieldValue('corporateCardNumber', '4242424242424242'); // valid Luhn
      expect(form.validateField('corporateCardNumber')).toBe(true);

      manager.destroy();
    });
  });

  describe('Domain 4: DevSecOps (Production Incident Post-Mortem & War Room)', () => {
    it('branches via PageJumpRule from classification directly to emergency war room on P0', () => {
      const res = adapter.safeValidate(INCIDENT_POSTMORTEM_SCHEMA);
      expect(res.success).toBe(true);

      const manager = new MultiStepFormManager(INCIDENT_POSTMORTEM_SCHEMA);
      const form = manager.getFormManager();

      // Classify as standard P1 -> next page is standard-rca
      form.setFieldValue('incidentTitle', 'Database Latency Spike');
      form.setFieldValue('incidentSeverity', 'P1');
      form.setFieldValue('detectionMethod', 'slo');
      expect(manager.validateCurrentStep()).toBe(true);
      manager.nextStep();
      expect(manager.getCurrentPage().id).toBe('standard-rca');

      // Now reset and classify as P0 -> jumpRule routes straight to emergency-war-room
      manager.goToStep(0);
      form.setFieldValue('incidentSeverity', 'P0');
      manager.nextStep();
      expect(manager.getCurrentPage().id).toBe('emergency-war-room');

      manager.destroy();
    });
  });

  describe('Domain 5: People Ops (360 Talent & Peer Leadership Review)', () => {
    it('supports emoji Likert scales and statement culture cards', () => {
      const res = adapter.safeValidate(PEER_REVIEW_SCHEMA);
      expect(res.success).toBe(true);

      const manager = new MultiStepFormManager(PEER_REVIEW_SCHEMA);
      const form = manager.getFormManager();

      // Step 1: Statement creed
      expect(manager.getCurrentPage().fields[0]?.type).toBe('statement');

      // Populate step 1 to advance
      form.setFieldValue('revieweeName', PEER_REVIEW_SAMPLES.revieweeName);
      form.setFieldValue('workingRelationship', PEER_REVIEW_SAMPLES.workingRelationship);
      expect(manager.validateCurrentStep()).toBe(true);
      manager.nextStep();

      // Step 2: Emoji Likert questions
      expect(manager.getCurrentPageIndex()).toBe(1);
      const emojiFields = manager.getCurrentPage().fields;
      expect(emojiFields.every((f) => f.scaleType === 'emoji')).toBe(true);

      form.setFieldValue('craftExecution', 5);
      form.setFieldValue('collaborationEmpathy', 4);
      form.setFieldValue('ownershipInitiative', 5);
      expect(manager.validateCurrentStep()).toBe(true);

      manager.destroy();
    });
  });

  describe('Domain 6: AI FinTech (AI Mortgage Pre-Approval & Risk Intelligence)', () => {
    it('validates schema structure, heuristic address/contact enrichment, and live DTI gauge', () => {
      const res = adapter.safeValidate(AI_MORTGAGE_SCHEMA);
      expect(res.success).toBe(true);

      const manager = new MultiStepFormManager(AI_MORTGAGE_SCHEMA);
      const form = manager.getFormManager();

      expect(manager.getTotalPages()).toBe(3);
      expect(manager.getCurrentPage().id).toBe('borrower-profile');

      // Test Contact Autofill
      const contactResult = form.enrichFromContact({
        name: 'Jordan Vance Taylor',
        email: 'jordan.taylor@quantumlabs.dev',
        tel: '+1 (555) 839-2041',
      });
      expect(contactResult.appliedFields.length).toBe(3);
      expect(form.getState().values.applicantName).toBe('Jordan Vance Taylor');
      expect(form.getState().values.applicantEmail).toBe('jordan.taylor@quantumlabs.dev');
      expect(form.getState().values.applicantPhone).toBe('+1 (555) 839-2041');

      expect(manager.validateCurrentStep()).toBe(true);
      manager.nextStep();

      // Step 2: Property Collateral Address
      expect(manager.getCurrentPage().id).toBe('property-collateral');

      // Test Address Autofill
      const addressResult = form.enrichFromAddress({
        addressLine1: '100 Silicon Vista Blvd',
        city: 'Austin',
        stateOrProvince: 'TX',
        postalCode: '78701',
      });
      expect(addressResult.appliedFields.length).toBeGreaterThanOrEqual(3);
      expect(form.getState().values.propertyStreet).toBe('100 Silicon Vista Blvd');
      expect(form.getState().values.propertyCity).toBe('Austin');

      expect(manager.validateCurrentStep()).toBe(true);
      manager.nextStep();

      // Step 3: Financial Underwriting & Live Gauge Visualization
      expect(manager.getCurrentPage().id).toBe('financial-assessment');
      const gaugeField = manager.getCurrentPage().fields.find((f) => f.type === 'visualization');
      expect(gaugeField).toBeDefined();
      expect(gaugeField?.visualization?.visualizationType).toBe('gauge');
      expect(gaugeField?.visualization?.metrics).toHaveLength(3);

      form.setFieldValue('grossMonthlyIncome', AI_MORTGAGE_SAMPLES.grossMonthlyIncome);
      form.setFieldValue('monthlyDebtObligations', AI_MORTGAGE_SAMPLES.monthlyDebtObligations);
      form.setFieldValue('requestedLoanAmount', AI_MORTGAGE_SAMPLES.requestedLoanAmount);
      expect(manager.validateCurrentStep()).toBe(true);

      manager.destroy();
    });
  });
});
