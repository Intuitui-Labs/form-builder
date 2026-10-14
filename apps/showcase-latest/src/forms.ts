import type {
  FieldDefinition,
  FormResponse,
  FormSchema,
} from '@intuitui-labs/form-builder-engine';
import { SearchGroundedFormCompiler } from '@intuitui-labs/form-builder-engine/ai';
import type { HydratedFieldDefinition } from '@intuitui-labs/form-builder-engine/hydration';
import { registerCustomValidator } from '@intuitui-labs/form-builder-engine/hydration';

export type Values = Record<string, unknown>;

const now = '2026-10-10T00:00:00.000Z';

export interface ShowcaseFormMeta {
  id: string;
  title: string;
  domain: string;
  badge: string;
  icon: string;
  headline: string;
  description: string;
  capabilities: string[];
  schema: FormSchema;
  samples: Values;
}

// ============================================================================
// 1. PRODUCT OPS: LAUNCH READINESS REVIEW
// ============================================================================
export const READINESS_SCHEMA: FormSchema = {
  v: '1.0',
  id: 'launch-readiness',
  tenantId: 'showcase-product',
  title: 'Launch readiness review',
  description: 'A multi-step, schema-driven project intake built with the engine and a custom React Native renderer.',
  settings: { category: 'product-intake', isPublished: true },
  createdAt: now,
  updatedAt: now,
  pages: [
    {
      id: 'identity',
      title: 'Your team',
      fields: [
        {
          id: 'contact-name', name: 'contactName', type: 'text', label: 'Your name', required: true,
          placeholder: 'e.g. Avery Chen', order: 0,
          rules: [{ type: 'minLength', value: 2, message: 'Use at least 2 characters.' }],
        },
        {
          id: 'work-email', name: 'workEmail', type: 'email', label: 'Work email', required: true,
          placeholder: 'avery@company.com', order: 1,
          rules: [{ type: 'email', message: 'Enter a valid email address.' }],
        },
        {
          id: 'organization', name: 'organization', type: 'text', label: 'Organization', required: true,
          placeholder: 'Company or team name', order: 2,
          rules: [{ type: 'minLength', value: 2, message: 'Add at least 2 characters.' }],
        },
        {
          id: 'role', name: 'role', type: 'select', label: 'Your role', required: true, order: 3,
          options: [
            { label: 'Product / design', value: 'product' },
            { label: 'Engineering', value: 'engineering' },
            { label: 'Operations', value: 'operations' },
            { label: 'Founder / executive', value: 'leadership' },
          ],
        },
      ],
    },
    {
      id: 'project',
      title: 'Project scope',
      fields: [
        {
          id: 'project-name', name: 'projectName', type: 'text', label: 'Project name', required: true,
          placeholder: 'e.g. Customer onboarding refresh', order: 0,
          rules: [{ type: 'minLength', value: 3, message: 'Use at least 3 characters.' }],
        },
        {
          id: 'project-type', name: 'projectType', type: 'select', label: 'What are you building?', required: true, order: 1,
          options: [
            { label: 'Customer-facing product', value: 'product', badge: 'High Touch', description: 'Web or mobile app for external end-users' },
            { label: 'Internal workflow', value: 'workflow', badge: 'Operational', description: 'Admin portals, queues, or back-office tools' },
            { label: 'Data collection experience', value: 'collection', badge: 'Analytics', description: 'Surveys, audits, or intake funnels' },
            { label: 'Research prototype', value: 'prototype', badge: 'R&D', description: 'Exploratory sandbox or test fixture' },
          ],
        },
        {
          id: 'team-size', name: 'teamSize', type: 'number', label: 'People involved', required: true,
          placeholder: 'e.g. 8', min: 1, max: 500, order: 2,
          rules: [
            { type: 'min', value: 1, message: 'At least one person is required.' },
            { type: 'max', value: 500, message: 'For this demo, enter 500 or fewer.' },
          ],
        },
      ],
    },
    {
      id: 'readiness',
      title: 'Readiness signals',
      media: {
        type: 'image',
        url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71',
        alt: 'Interactive readiness radar chart',
        caption: 'Autonomous Health & Readiness Telemetry',
      },
      fields: [
        {
          id: 'target-window', name: 'targetWindow', type: 'select', label: 'Target launch window', required: true, order: 0,
          options: [
            { label: 'Within 1 month', value: '1m', badge: 'Urgent' },
            { label: '1–3 months', value: '1-3m', badge: 'Planned' },
            { label: '3–6 months', value: '3-6m', badge: 'Future' },
            { label: 'Exploring, no date yet', value: 'later' },
          ],
        },
        {
          id: 'confidence', name: 'confidence', type: 'slider', label: 'How confident is the team?', required: true,
          min: 1, max: 10, scaleType: 'numeric', order: 1,
        },
        {
          id: 'readiness-projection', name: 'readinessProjection', type: 'visualization', label: 'Launch Velocity Projection', required: false, order: 2,
          visualization: {
            visualizationType: 'gauge',
            title: 'Projected Sprint Health',
            description: 'Calculated dynamically based on team size and confidence scores',
            metrics: [
              { label: 'Velocity Index', value: '84%', unit: '' },
              { label: 'Confidence Score', value: '8.5 / 10', unit: '' },
              { label: 'Risk Factor', value: 'Low', unit: '' },
            ],
            dataFallback: [
              { label: 'Velocity', value: 84 },
              { label: 'Confidence', value: 8.5 },
            ],
          },
        },
        {
          id: 'spec-upload', name: 'architectureDoc', type: 'file', label: 'Architecture Brief (Optional)', required: false, order: 3,
          placeholder: 'Upload system design diagram or RFC',
          rules: [
            { type: 'fileSize', maxBytes: 10 * 1024 * 1024, message: 'Max upload size is 10MB' },
            { type: 'fileType', allowedMimeTypes: ['image/*', 'application/pdf'] },
          ],
        },
        {
          id: 'blockers', name: 'blockers', type: 'textarea', label: 'Biggest unknown or blocker', required: false,
          placeholder: 'Tell us what is still uncertain…', order: 4,
          rules: [{ type: 'maxLength', value: 400, message: 'Keep this under 400 characters.' }],
        },
      ],
    },
    {
      id: 'guardrails',
      title: 'Guardrails & review',
      fields: [
        {
          id: 'data-sensitivity', name: 'dataSensitivity', type: 'likert', label: 'How sensitive is the data?', required: true,
          min: 1, max: 5, scaleType: 'numeric', order: 0,
        },
        {
          id: 'security-review', name: 'securityReview', type: 'select', label: 'Security review status', required: true, order: 1,
          options: [
            { label: 'Not started', value: 'not-started' },
            { label: 'In progress', value: 'in-progress' },
            { label: 'Complete', value: 'complete' },
            { label: 'Not applicable', value: 'na' },
          ],
        },
        {
          id: 'final-note', name: 'finalNote', type: 'textarea', label: 'Anything else we should know?', required: false,
          placeholder: 'Optional context for the review team', order: 2,
        },
      ],
    },
  ],
};

export const READINESS_SAMPLES: Values = {
  contactName: 'Mina Patel',
  workEmail: 'mina@example.com',
  organization: 'Northstar Labs',
  role: 'product',
  projectName: 'Native intake refresh',
  projectType: 'workflow',
  teamSize: 6,
  targetWindow: '1-3m',
  confidence: 8,
  blockers: 'The team is ready for a measured pilot.',
  dataSensitivity: 2,
  securityReview: 'complete',
  finalNote: 'Start with one customer cohort.',
};

// ============================================================================
// 2. HEALTHTECH: CLINICAL PATIENT INTAKE & TRIAGE
// ============================================================================
export const PATIENT_TRIAGE_SCHEMA: FormSchema = {
  v: '1.0',
  id: 'patient-triage',
  tenantId: 'showcase-health',
  title: 'Clinical Patient Intake & Triage',
  description: 'HIPAA-compliant telehealth intake with rich-text disclaimers, dynamic conditional fields (visibleIf), and sensitive data protection.',
  settings: { category: 'telehealth', isPublished: true },
  createdAt: now,
  updatedAt: now,
  pages: [
    {
      id: 'welcome-cover',
      title: 'Clinical Intake Welcome',
      description: 'Welcome to Northstar Telehealth. Please complete this rapid 3-minute intake prior to entering your consultation room. Your answers are encrypted and protected under HIPAA security guidelines.',
      role: 'cover',
      fields: [],
    },
    {
      id: 'consent-identity',
      title: 'Consent & identity',
      fields: [
        {
          id: 'triage-consent',
          name: 'triageConsent',
          type: 'rich-text',
          label: 'Patient Rights & Telehealth Informed Consent',
          required: false,
          order: 0,
          content:
            '### Notice of Telehealth Privacy & Emergency Triage\n' +
            '• **Immediate Danger:** If you are experiencing chest pain, severe shortness of breath, or sudden weakness, call **911** immediately.\n' +
            '• **HIPAA Protection:** All symptoms and health records submitted are encrypted at rest with strict audit logs.\n' +
            '• **Triage Response:** Responses are routed to our on-call clinician board within 15 minutes.',
        },
        {
          id: 'patient-full-name',
          name: 'patientFullName',
          type: 'text',
          label: 'Legal full name',
          placeholder: 'e.g. Dr. Evelyn Reed',
          semanticIntent: 'name-full',
          required: true,
          order: 1,
          rules: [{ type: 'minLength', value: 3, message: 'Please enter your full legal name.' }],
        },
        {
          id: 'date-of-birth',
          name: 'dateOfBirth',
          type: 'text',
          label: 'Date of birth (YYYY-MM-DD)',
          placeholder: 'YYYY-MM-DD',
          formatMask: 'YYYY-MM-DD',
          semanticIntent: 'birth-date',
          clarification: {
            title: 'Why is date of birth required?',
            body: 'Used to verify medical insurance eligibility and calculate age-stratified pediatric or geriatric dosing guidelines.',
          },
          required: true,
          order: 2,
          rules: [{ type: 'pattern', value: '^\\d{4}-\\d{2}-\\d{2}$', message: 'Use YYYY-MM-DD format.' }],
        },
        {
          id: 'emergency-phone',
          name: 'emergencyPhone',
          type: 'text',
          label: 'Emergency contact telephone',
          placeholder: '+1 (555) 234-5678',
          semanticIntent: 'contact-phone',
          formatMask: '+9 (999) 999-9999',
          clarification: {
            title: 'SMS verification & triage queue',
            body: 'We will dispatch an encrypted SMS verification code and estimated queue wait time to this mobile number.',
          },
          normalizer: 'phone-e164',
          required: true,
          order: 3,
          rules: [{ type: 'minLength', value: 10, message: 'Valid phone number required.' }],
        },
      ],
    },
    {
      id: 'symptoms-history',
      title: 'Symptoms & history',
      fields: [
        {
          id: 'primary-symptom',
          name: 'primarySymptom',
          type: 'select',
          label: 'Primary reason for visit',
          required: true,
          order: 0,
          options: [
            { label: 'Acute Respiratory / Cold & Flu', value: 'respiratory', badge: 'High Priority', description: 'Cough, fever, sore throat' },
            { label: 'Musculoskeletal Pain / Strain', value: 'ortho', badge: 'Standard', description: 'Joint, back, or tendon discomfort' },
            { label: 'Gastrointestinal Distress', value: 'gi', badge: 'Moderate', description: 'Nausea, acute stomach pain' },
            { label: 'Routine Prescription Renewal', value: 'refill', badge: 'Refill', description: 'Standard maintenance medication renewal' },
          ],
        },
        {
          id: 'pain-severity',
          name: 'painSeverity',
          type: 'likert',
          label: 'Current discomfort scale (1 = Mild, 10 = Severe)',
          required: true,
          min: 1,
          max: 10,
          scaleType: 'numeric',
          order: 1,
        },
        {
          id: 'has-allergies',
          name: 'hasAllergies',
          type: 'select',
          label: 'Do you have known drug or food allergies?',
          required: true,
          order: 2,
          options: [
            { label: 'No known drug allergies (NKDA)', value: 'no' },
            { label: 'Yes, I have documented allergies', value: 'yes', badge: 'Critical Flag' },
          ],
        },
        {
          id: 'allergy-details',
          name: 'allergyDetails',
          type: 'textarea',
          label: 'List specific allergies & reactions',
          placeholder: 'e.g. Penicillin (anaphylaxis, hives), Sulfa drugs...',
          required: true,
          order: 3,
          visibleIf: { field: 'hasAllergies', operator: 'equals', value: 'yes' },
          clearValueOnHide: true,
          sensitive: true,
          privacyRationale: 'Clinical record guarded under HIPAA rules; consulted before prescribing.',
          rules: [
            {
              type: 'requiredIfField',
              targetField: 'hasAllergies',
              operator: 'equals',
              value: 'yes',
              message: 'Please document your allergies before proceeding.',
            },
          ],
        },
      ],
    },
    {
      id: 'documents-pharmacy',
      title: 'Pharmacy & records',
      fields: [
        {
          id: 'prior-lab-report',
          name: 'priorLabReport',
          type: 'file',
          label: 'Recent lab results or referral letter (Optional)',
          placeholder: 'Attach PDF or camera scan of lab reports',
          required: false,
          order: 0,
          rules: [
            { type: 'fileSize', maxBytes: 15 * 1024 * 1024, message: 'Max attachment size is 15MB.' },
            { type: 'fileType', allowedMimeTypes: ['application/pdf', 'image/*'] },
          ],
        },
        {
          id: 'preferred-pharmacy',
          name: 'preferredPharmacy',
          type: 'textarea',
          label: 'Preferred dispensing pharmacy address',
          placeholder: 'Walgreens #4012, 450 Sutter St, San Francisco, CA 94108',
          required: true,
          order: 1,
          rules: [{ type: 'minLength', value: 8, message: 'Provide complete pharmacy street address.' }],
        },
      ],
    },
  ],
};

export const PATIENT_TRIAGE_SAMPLES: Values = {
  patientFullName: 'Dr. Evelyn Reed',
  dateOfBirth: '1988-04-14',
  emergencyPhone: '+15552345678',
  primarySymptom: 'respiratory',
  painSeverity: 4,
  hasAllergies: 'yes',
  allergyDetails: 'Penicillin (hives, wheezing), Amoxicillin',
  preferredPharmacy: 'Walgreens Pharmacy #4012, 450 Sutter St, Suite 800, San Francisco, CA 94108',
};

// ============================================================================
// 3. FINTECH: COMMERCIAL LENDING & KYC UNDERWRITING
// ============================================================================
export const COMMERCIAL_LENDING_SCHEMA: FormSchema = {
  v: '1.0',
  id: 'commercial-lending',
  tenantId: 'showcase-fintech',
  title: 'Commercial Credit & KYC Underwriting',
  description: 'Institutional loan evaluation testing Luhn card algorithms, EIN pattern masks, cross-field capital checks, and DTI projections.',
  settings: { category: 'underwriting', isPublished: true },
  createdAt: now,
  updatedAt: now,
  pages: [
    {
      id: 'entity-kyc',
      title: 'Corporate entity',
      fields: [
        {
          id: 'business-name',
          name: 'businessLegalName',
          type: 'text',
          label: 'Registered corporate entity name',
          placeholder: 'e.g. AeroTech Dynamics Inc',
          required: true,
          order: 0,
          rules: [{ type: 'minLength', value: 2, message: 'Corporate name required.' }],
        },
        {
          id: 'federal-ein',
          name: 'taxId',
          type: 'text',
          label: 'Federal Employer ID Number (EIN)',
          placeholder: '12-3456789',
          formatMask: '99-9999999',
          semanticIntent: 'identity-tax-id',
          clarification: {
            title: 'Where can I find my IRS EIN?',
            body: 'Your 9-digit EIN is found on your CP-575 confirmation notice, tax returns (Form 1120/1065), or banking verification letters.',
          },
          required: true,
          helperText: 'Must match IRS 9-digit format: XX-XXXXXXX',
          order: 1,
          rules: [{ type: 'pattern', value: '^\\d{2}-\\d{7}$', message: 'EIN must follow IRS format: XX-XXXXXXX.' }],
        },
        {
          id: 'business-address',
          name: 'businessAddress',
          type: 'text',
          label: 'Principal executive headquarters',
          placeholder: '100 Innovation Way, Austin, TX 78701',
          semanticIntent: 'address-line1',
          required: true,
          order: 2,
          rules: [{ type: 'minLength', value: 6, message: 'Valid physical address required.' }],
        },
        {
          id: 'officer-email',
          name: 'authorizedOfficerEmail',
          type: 'email',
          label: 'Authorizing officer email',
          placeholder: 'cfo@aerotechdynamics.com',
          semanticIntent: 'contact-email',
          required: true,
          order: 3,
          rules: [{ type: 'email', message: 'Valid business email required.' }],
        },
        {
          id: 'confirm-officer-email',
          name: 'confirmOfficerEmail',
          type: 'email',
          label: 'Confirm authorizing officer email',
          placeholder: 'cfo@aerotechdynamics.com',
          required: true,
          order: 4,
          rules: [
            {
              type: 'matchesField',
              targetField: 'authorizedOfficerEmail',
              message: 'Confirmation email must match authorizing officer email.',
            },
          ],
        },
      ],
    },
    {
      id: 'facility-underwriting',
      title: 'Facility & capital metrics',
      fields: [
        {
          id: 'requested-amount',
          name: 'requestedAmount',
          type: 'number',
          label: 'Requested credit facility ($USD)',
          placeholder: '350000',
          required: true,
          min: 10000,
          max: 10000000,
          order: 0,
          rules: [
            { type: 'min', value: 10000, message: 'Minimum facility amount is $10,000.' },
            { type: 'max', value: 10000000, message: 'Maximum automated facility is $10,000,000.' },
          ],
        },
        {
          id: 'annual-revenue',
          name: 'annualRevenue',
          type: 'number',
          label: 'Prior 12-month gross revenue ($USD)',
          placeholder: '2400000',
          required: true,
          min: 50000,
          order: 1,
          rules: [
            { type: 'min', value: 50000, message: 'Minimum annual revenue is $50,000.' },
            {
              type: 'greaterThanField',
              targetField: 'requestedAmount',
              message: 'Annual gross revenue must exceed the requested credit facility.',
            },
          ],
        },
        {
          id: 'capital-metric-card',
          name: 'capitalMetricCard',
          type: 'visualization',
          label: 'Capital Health & Coverage Assessment',
          required: false,
          order: 2,
          visualization: {
            visualizationType: 'comparison',
            title: 'Debt-to-Revenue & Liquidity Ratio',
            description: 'Evaluated continuously against institutional underwriting risk gates',
            metrics: [
              { label: 'Facility-to-Revenue', value: '14.6%', unit: '' },
              { label: 'Debt Service Coverage', value: '3.2x', unit: '' },
              { label: 'Capital Rating', value: 'AA (Prime Tier)', unit: '' },
            ],
            dataFallback: [
              { label: 'Coverage', value: 3.2 },
              { label: 'Ratio', value: 14.6 },
            ],
          },
        },
      ],
    },
    {
      id: 'settlement-card',
      title: 'Corporate settlement',
      fields: [
        {
          id: 'corporate-card-num',
          name: 'corporateCardNumber',
          type: 'text',
          label: 'Corporate guarantee card number',
          placeholder: '4242 4242 4242 4242',
          formatMask: '9999 9999 9999 9999',
          semanticIntent: 'payment-card-number',
          clarification: {
            title: 'PCI-DSS Tokenization Standard',
            body: 'Card numbers are tokenized in memory before transmission. We do not store plaintext primary account numbers (PAN).',
          },
          normalizer: 'card-number',
          required: true,
          order: 0,
          rules: [{ type: 'luhn', message: 'Card number failed the Luhn checksum verification.' }],
        },
        {
          id: 'corporate-card-expiry',
          name: 'corporateCardExpiry',
          type: 'text',
          label: 'Card expiration date (MM/YY)',
          placeholder: '10/28',
          formatMask: 'MM/YY',
          semanticIntent: 'payment-card-expiry',
          clarification: {
            title: 'Expiration Format',
            body: 'Enter two digits for month and two digits for year (MM/YY). Expiration is auto-formatted.',
          },
          required: true,
          order: 1,
          rules: [{ type: 'cardExpiry', message: 'Card has expired or date format is invalid.' }],
        },
        {
          id: 'balance-sheet-doc',
          name: 'balanceSheetDoc',
          type: 'file',
          label: 'Audited balance sheet or CPA review',
          placeholder: 'Upload corporate tax return or PDF balance sheet',
          required: false,
          order: 2,
          rules: [
            { type: 'fileSize', maxBytes: 20 * 1024 * 1024, message: 'Max PDF size is 20MB.' },
            { type: 'fileType', allowedMimeTypes: ['application/pdf'] },
          ],
        },
      ],
    },
  ],
};

export const COMMERCIAL_LENDING_SAMPLES: Values = {
  businessLegalName: 'AeroTech Dynamics Inc',
  taxId: '12-3456789',
  businessAddress: '100 Innovation Way, Austin, TX 78701',
  authorizedOfficerEmail: 'cfo@aerotechdynamics.com',
  confirmOfficerEmail: 'cfo@aerotechdynamics.com',
  requestedAmount: 350000,
  annualRevenue: 2400000,
  corporateCardNumber: '4242424242424242',
  corporateCardExpiry: '10/28',
};

// ============================================================================
// 4. DEVSECOPS: PRODUCTION INCIDENT POST-MORTEM & WAR ROOM
// ============================================================================
export const INCIDENT_POSTMORTEM_SCHEMA: FormSchema = {
  v: '1.0',
  id: 'incident-postmortem',
  tenantId: 'showcase-devsecops',
  title: 'Production Incident Post-Mortem & Triage',
  description: 'Mission-critical reliability engine showcasing page jump rules (branching), Markdown incident reports, SLA burn telemetry, and log ingestion.',
  settings: { category: 'incident-management', isPublished: true },
  createdAt: now,
  updatedAt: now,
  pages: [
    {
      id: 'classification',
      title: 'Incident triage',
      fields: [
        {
          id: 'incident-headline',
          name: 'incidentTitle',
          type: 'text',
          label: 'Incident title & service affected',
          placeholder: 'e.g. Auth Gateway Latency Spike & Degraded 504s',
          required: true,
          order: 0,
          rules: [{ type: 'minLength', value: 5, message: 'Provide a descriptive title.' }],
        },
        {
          id: 'incident-severity',
          name: 'incidentSeverity',
          type: 'select',
          label: 'Severity classification (P0 triggers emergency war room jump)',
          required: true,
          order: 1,
          options: [
            { label: 'P0 - Catastrophic Outage (SLA Breach)', value: 'P0', badge: 'CRITICAL', description: 'Immediate bridge required; customer-facing loss' },
            { label: 'P1 - High Severity (Core service degraded)', value: 'P1', badge: 'HIGH', description: 'Partial failover active, high p99 latency' },
            { label: 'P2 - Moderate (Internal tool throttled)', value: 'P2', badge: 'MEDIUM', description: 'Customer unaffected, background workers delayed' },
            { label: 'P3 - Low (Minor anomaly / cosmetic)', value: 'P3', badge: 'LOW', description: 'No SLO budget burn' },
          ],
        },
        {
          id: 'detection-method',
          name: 'detectionMethod',
          type: 'select',
          label: 'How was the anomaly detected?',
          required: true,
          order: 2,
          options: [
            { label: 'Datadog / Prometheus synthetic alert', value: 'synthetic' },
            { label: 'PagerDuty SLO error budget threshold', value: 'slo' },
            { label: 'Customer escalations / Zendesk surge', value: 'customer' },
            { label: 'Internal engineer discovery', value: 'manual' },
          ],
        },
      ],
      jumpRules: [
        {
          condition: { field: 'incidentSeverity', operator: 'equals', value: 'P0' },
          targetPageId: 'emergency-war-room',
        },
      ],
    },
    {
      id: 'standard-rca',
      title: 'Root cause analysis',
      fields: [
        {
          id: 'rca-guidance',
          name: 'rcaGuidance',
          type: 'rich-text',
          label: 'Blameless Post-Mortem Guiding Principles',
          required: false,
          order: 0,
          content:
            '### Engineering Blameless Retrospective Policy\n' +
            '• Focus on **system defenses, test gaps, and automation failures**, never blame individuals.\n' +
            '• Document exact timestamps: detection, triage, mitigation, and recovery.\n' +
            '• Every closed incident must link at least one merged prevention PR.',
        },
        {
          id: 'root-cause-notes',
          name: 'rootCauseAnalysis',
          type: 'textarea',
          label: 'Root cause breakdown & containment steps',
          placeholder: 'Detail the underlying trigger, cascading effects, and why automated circuit breakers failed…',
          required: true,
          order: 1,
          rules: [{ type: 'minLength', value: 15, message: 'Please provide at least 15 characters of RCA.' }],
        },
        {
          id: 'sla-telemetry-card',
          name: 'slaTelemetryCard',
          type: 'visualization',
          label: 'Reliability Telemetry & SLA Impact',
          required: false,
          order: 2,
          visualization: {
            visualizationType: 'projection',
            title: 'Mean Time to Detection & Recovery',
            description: 'Synthesized from incident trigger to traffic restoration',
            metrics: [
              { label: 'MTTD', value: '3m 15s', unit: '' },
              { label: 'MTTR', value: '41m 20s', unit: '' },
              { label: 'Error Budget Burn', value: '16.8%', unit: '' },
            ],
            dataFallback: [
              { label: 'MTTR', value: 41 },
              { label: 'Burn', value: 16.8 },
            ],
          },
        },
        {
          id: 'server-logs',
          name: 'serverLogBundle',
          type: 'file',
          label: 'Diagnostic logs / crash dump bundle',
          placeholder: 'Attach server logs (.log, .json, .zip)',
          required: false,
          order: 3,
          rules: [
            { type: 'fileSize', maxBytes: 25 * 1024 * 1024, message: 'Max bundle size is 25MB.' },
            { type: 'fileType', allowedMimeTypes: ['application/json', 'text/plain', 'application/zip'] },
          ],
        },
      ],
    },
    {
      id: 'emergency-war-room',
      title: 'P0 Emergency bridge',
      fields: [
        {
          id: 'emergency-banner',
          name: 'emergencyBanner',
          type: 'rich-text',
          label: '🚨 P0 EXECUTIVE ESCALATION PROTOCOL ACTIVATED',
          required: false,
          order: 0,
          content:
            '### CRITICAL INCIDENT COMMAND ACTIVE\n' +
            'Because this incident is classified as **P0 - Catastrophic**, standard linear RCA is deferred.\n' +
            '• Active War Room: **https://meet.internal/war-room-alpha**\n' +
            '• Executive notification sent to VP of Reliability.\n' +
            '• Status page update required within 5 minutes.',
        },
        {
          id: 'incident-commander',
          name: 'incidentCommander',
          type: 'text',
          label: 'Active Incident Commander (IC)',
          placeholder: 'e.g. Jordan V. (Staff Infrastructure SRE)',
          required: true,
          order: 1,
          rules: [{ type: 'minLength', value: 3, message: 'Designate an Incident Commander.' }],
        },
        {
          id: 'rollback-action',
          name: 'rollbackAction',
          type: 'textarea',
          label: 'Immediate mitigation or rollback action in flight',
          placeholder: 'e.g. Reverted commit 8fa921b and rerouted all regional traffic from us-east-1 to us-west-2.',
          required: true,
          order: 2,
          rules: [{ type: 'minLength', value: 10, message: 'Detail containment actions.' }],
        },
      ],
    },
  ],
};

export const INCIDENT_POSTMORTEM_SAMPLES: Values = {
  incidentTitle: 'Auth Gateway Latency Spike & Degraded 504s',
  incidentSeverity: 'P1',
  detectionMethod: 'slo',
  rootCauseAnalysis: 'Database connection pool exhausted due to unindexed query deployed in migration #142.',
};

// ============================================================================
// 5. HR & PEOPLE OPS: 360 PEER LEADERSHIP & CULTURE REVIEW
// ============================================================================
export const PEER_REVIEW_SCHEMA: FormSchema = {
  v: '1.0',
  id: 'peer-review-360',
  tenantId: 'showcase-people',
  title: '360 Talent & Peer Leadership Review',
  description: 'Culture and performance assessment featuring emoji Likert ratings, statement philosophy cards, rich option badges, and psychological safety guarantees.',
  settings: { category: 'performance-review', isPublished: true },
  createdAt: now,
  updatedAt: now,
  pages: [
    {
      id: 'culture-context',
      title: 'Colleague & role',
      fields: [
        {
          id: 'review-creed',
          name: 'reviewCreed',
          type: 'statement',
          label: 'Our Radical Candor & Growth Mindset Creed',
          required: false,
          order: 0,
          content:
            '"Great feedback is kind, clear, and actionable. We praise with specificity and challenge directly to unlock high performance."',
        },
        {
          id: 'reviewee-name',
          name: 'revieweeName',
          type: 'text',
          label: 'Colleague being reviewed',
          placeholder: 'e.g. Elena Rostova',
          required: true,
          order: 1,
          rules: [{ type: 'minLength', value: 2, message: 'Colleague name required.' }],
        },
        {
          id: 'working-relationship',
          name: 'workingRelationship',
          type: 'select',
          label: 'Your working relationship with them',
          required: true,
          order: 2,
          options: [
            { label: 'Direct squad peer', value: 'peer', badge: 'Core Team', description: 'Collaborates daily on code, sprint planning, and reviews' },
            { label: 'Cross-functional partner', value: 'partner', badge: 'Collaborator', description: 'Product, Design, or Data counterpart' },
            { label: 'Mentee / junior engineer', value: 'mentee', badge: 'Growth', description: 'Coaching or onboarding relationship' },
            { label: 'Technical lead / manager', value: 'lead', badge: 'Leadership', description: 'Architectural owner or people lead' },
          ],
        },
      ],
    },
    {
      id: 'competencies',
      title: 'Core competencies',
      fields: [
        {
          id: 'craft-execution',
          name: 'craftExecution',
          type: 'likert',
          label: 'Technical Craft & Delivery Speed',
          required: true,
          scaleType: 'emoji',
          min: 1,
          max: 5,
          helperText: 'How reliably does this colleague produce high-quality, dependable work?',
          order: 0,
        },
        {
          id: 'collaboration-empathy',
          name: 'collaborationEmpathy',
          type: 'likert',
          label: 'Empathy & Teamwork Spirit',
          required: true,
          scaleType: 'emoji',
          min: 1,
          max: 5,
          helperText: 'How actively do they unblock teammates and foster psychological safety?',
          order: 1,
        },
        {
          id: 'ownership-initiative',
          name: 'ownershipInitiative',
          type: 'likert',
          label: 'Ownership & Strategic Thinking',
          required: true,
          scaleType: 'emoji',
          min: 1,
          max: 5,
          helperText: 'Do they proactively spot hidden risks and champion necessary improvements?',
          order: 2,
        },
      ],
    },
    {
      id: 'growth-feedback',
      title: 'Qualitative growth',
      fields: [
        {
          id: 'greatest-superpower',
          name: 'greatestSuperpower',
          type: 'textarea',
          label: 'What is their greatest superpower?',
          placeholder: 'Cite a specific example where their leadership, insight, or craft made a major difference…',
          required: true,
          order: 0,
          rules: [{ type: 'minLength', value: 15, message: 'Please provide at least 15 characters of feedback.' }],
        },
        {
          id: 'growth-opportunity',
          name: 'growthOpportunity',
          type: 'textarea',
          label: 'One area where you would love to see them stretch',
          placeholder: 'Constructive suggestions for their next stage of professional growth…',
          required: true,
          sensitive: true,
          privacyRationale: 'This feedback is anonymized and aggregated into quarterly talent reviews.',
          order: 1,
          rules: [{ type: 'maxLength', value: 600, message: 'Keep review under 600 characters.' }],
        },
      ],
    },
  ],
};

export const PEER_REVIEW_SAMPLES: Values = {
  revieweeName: 'Elena Rostova',
  workingRelationship: 'peer',
  craftExecution: 5,
  collaborationEmpathy: 5,
  ownershipInitiative: 4,
  greatestSuperpower: 'Elena stepped up during the database migration and cleanly orchestrated the zero-downtime rollback plan.',
  growthOpportunity: 'Would love to see her present more of her architecture blueprints to the broader engineering all-hands.',
};

// ============================================================================
// 6. AI FINTECH: AUTONOMOUS MORTGAGE PRE-APPROVAL & RISK INTELLIGENCE
// ============================================================================
export const AI_MORTGAGE_SCHEMA: FormSchema = {
  v: '1.0',
  id: 'ai-mortgage-intake',
  tenantId: 'showcase-ai',
  title: 'AI Mortgage Pre-Approval & Risk Intelligence',
  description: 'Autonomous financial intake with heuristic GPS address autofill, contact card synthesis, and live debt-to-income gauge visualization.',
  settings: { category: 'ai-underwriting', isPublished: true },
  createdAt: now,
  updatedAt: now,
  pages: [
    {
      id: 'borrower-profile',
      title: 'Borrower Profile',
      defaultNextPageId: 'property-collateral',
      fields: [
        {
          id: 'applicant-name',
          name: 'applicantName',
          type: 'text',
          label: 'Full Legal Name',
          required: true,
          semanticIntent: 'name-full',
          placeholder: 'e.g. Jordan Vance Taylor',
          order: 0,
          rules: [{ type: 'minLength', value: 3, message: 'Enter your full legal name.' }],
        },
        {
          id: 'applicant-email',
          name: 'applicantEmail',
          type: 'email',
          label: 'Contact Email',
          required: true,
          semanticIntent: 'contact-email',
          placeholder: 'jordan.taylor@quantumlabs.dev',
          order: 1,
          rules: [{ type: 'email', message: 'Enter a valid email address.' }],
        },
        {
          id: 'applicant-phone',
          name: 'applicantPhone',
          type: 'text',
          label: 'Mobile Phone',
          required: true,
          semanticIntent: 'contact-phone',
          placeholder: '+1 (555) 839-2041',
          order: 2,
          rules: [{ type: 'required', message: 'Primary mobile number is required.' }],
        },
      ],
    },
    {
      id: 'property-collateral',
      title: 'Collateral Location',
      defaultNextPageId: 'financial-assessment',
      fields: [
        {
          id: 'property-street',
          name: 'propertyStreet',
          type: 'text',
          label: 'Property Street Address',
          required: true,
          semanticIntent: 'address-line1',
          placeholder: 'e.g. 100 Silicon Vista Blvd',
          order: 0,
          rules: [{ type: 'required', message: 'Street address is required.' }],
        },
        {
          id: 'property-city',
          name: 'propertyCity',
          type: 'text',
          label: 'City',
          required: true,
          semanticIntent: 'address-city',
          placeholder: 'Austin',
          order: 1,
          rules: [{ type: 'required', message: 'City is required.' }],
        },
        {
          id: 'property-state',
          name: 'propertyState',
          type: 'text',
          label: 'State / Province',
          required: true,
          semanticIntent: 'address-state',
          placeholder: 'TX',
          order: 2,
          rules: [{ type: 'required', message: 'State or province is required.' }],
        },
        {
          id: 'property-postal',
          name: 'propertyPostalCode',
          type: 'text',
          label: 'Postal / ZIP Code',
          required: true,
          semanticIntent: 'address-postal-code',
          placeholder: '78701',
          order: 3,
          rules: [{ type: 'required', message: 'Postal code is required.' }],
        },
      ],
    },
    {
      id: 'financial-assessment',
      title: 'Financial Underwriting & Gauge',
      fields: [
        {
          id: 'monthly-income',
          name: 'grossMonthlyIncome',
          type: 'number',
          label: 'Gross Monthly Income ($)',
          required: true,
          placeholder: '14500',
          min: 1000,
          max: 100000,
          order: 0,
          rules: [{ type: 'min', value: 1000, message: 'Minimum gross income is $1,000/mo.' }],
        },
        {
          id: 'monthly-debt',
          name: 'monthlyDebtObligations',
          type: 'number',
          label: 'Monthly Debt Obligations ($)',
          required: true,
          placeholder: '2100',
          min: 0,
          max: 50000,
          order: 1,
        },
        {
          id: 'requested-loan',
          name: 'requestedLoanAmount',
          type: 'number',
          label: 'Requested Loan Amount ($)',
          required: true,
          placeholder: '520000',
          min: 50000,
          max: 3000000,
          order: 2,
          rules: [{ type: 'min', value: 50000, message: 'Minimum loan amount is $50,000.' }],
        },
        {
          id: 'underwriting-gauge',
          name: 'riskGauge',
          type: 'visualization',
          label: 'Live DTI & Underwriting Assessment Quotient',
          required: false,
          order: 3,
          visualization: {
            visualizationType: 'gauge',
            title: 'Debt-to-Income Health Quotient',
            description: 'Automated 2026 algorithmic risk assessment based on debt ratios, liquid reserves, and prime capacity.',
            metrics: [
              { label: 'Projected DTI Ratio', value: 14.5, unit: '%' },
              { label: 'Approved Loan Capacity', value: 685000, unit: 'USD' },
              { label: 'Risk Band', value: 'Prime Tier-A' },
            ],
            dataFallback: [
              { label: 'Initial Estimate', value: 'Pending Input' },
            ],
          },
        },
      ],
    },
  ],
};

export const AI_MORTGAGE_SAMPLES: Values = {
  applicantName: 'Jordan Vance Taylor',
  applicantEmail: 'jordan.taylor@quantumlabs.dev',
  applicantPhone: '+1 (555) 839-2041',
  propertyStreet: '100 Silicon Vista Blvd',
  propertyCity: 'Austin',
  propertyState: 'TX',
  propertyPostalCode: '78701',
  grossMonthlyIncome: 14500,
  monthlyDebtObligations: 2100,
  requestedLoanAmount: 520000,
};

// ============================================================================
// SHOWCASE CATALOG OF ALL 6 FORMS
// ============================================================================
export const SHOWCASE_CATALOG: ShowcaseFormMeta[] = [
  {
    id: 'launch-readiness',
    title: 'Launch Readiness Review',
    domain: 'Product Ops',
    badge: 'Linear Gates',
    icon: '🚀',
    headline: 'Multi-Step Gate Pipeline',
    description: 'Long-form intake testing 4 stages, numeric Likert scales, sprint health gauges, and RFC file attachments.',
    capabilities: ['Multi-step linear progress', 'Sprint health gauge visualization', 'File attachment constraints', 'Numeric Likert & sliders'],
    schema: READINESS_SCHEMA,
    samples: READINESS_SAMPLES,
  },
  {
    id: 'patient-triage',
    title: 'Clinical Patient Intake & Triage',
    domain: 'HealthTech',
    badge: 'HIPAA & Dynamic',
    icon: '🩺',
    headline: 'Telehealth Intake & Dynamic Fields',
    description: 'Sanitized Markdown medical waivers, conditional field visibility (visibleIf), requiredIfField validation, and E.164 phone normalizers.',
    capabilities: ['Rich-text sanitized Markdown waiver', 'Dynamic visibleIf field evaluation', 'requiredIfField conditional validation', 'SemanticIntents (name-full, birth-date)'],
    schema: PATIENT_TRIAGE_SCHEMA,
    samples: PATIENT_TRIAGE_SAMPLES,
  },
  {
    id: 'commercial-lending',
    title: 'Commercial Credit & KYC Underwriting',
    domain: 'FinTech',
    badge: 'Financial & KYC',
    icon: '💳',
    headline: 'Institutional Lending & Validation',
    description: 'Financial security testing Luhn checksum verification, IRS EIN regex masks, cross-field revenue constraints, and comparison visualizations.',
    capabilities: ['Luhn card checksum validation', 'Cross-field greaterThanField & matchesField', 'EIN pattern regex matching', 'Comparison metric visualization'],
    schema: COMMERCIAL_LENDING_SCHEMA,
    samples: COMMERCIAL_LENDING_SAMPLES,
  },
  {
    id: 'incident-postmortem',
    title: 'Production Incident Post-Mortem',
    domain: 'DevSecOps',
    badge: 'Branching Wizard',
    icon: '🛡️',
    headline: 'SRE War Room & Dynamic Jumps',
    description: 'Mission-critical triage featuring conditional PageJumpRule branching (P0 jumps to emergency bridge), rich-text SOPs, and error budget burn projections.',
    capabilities: ['Conditional page branching (jumpRules)', 'P0 emergency war room route jump', 'Error budget projection telemetry', 'Log dump archive upload'],
    schema: INCIDENT_POSTMORTEM_SCHEMA,
    samples: INCIDENT_POSTMORTEM_SAMPLES,
  },
  {
    id: 'peer-review-360',
    title: '360 Talent & Peer Leadership Review',
    domain: 'People Ops',
    badge: 'Emoji Scales',
    icon: '⭐',
    headline: 'Culture & Psychological Safety',
    description: 'Employee assessment featuring emoji Likert scales (😡-🤩), core value creed statement cards, option badges, and sensitive privacy flags.',
    capabilities: ['Emoji Likert scales (😡 to 🤩)', 'Statement guidance philosophy card', 'Option badges & descriptions', 'Sensitive data privacy rationales'],
    schema: PEER_REVIEW_SCHEMA,
    samples: PEER_REVIEW_SAMPLES,
  },
  {
    id: 'ai-mortgage-intake',
    title: 'AI Mortgage Pre-Approval & Risk Intelligence',
    domain: 'AI FinTech',
    badge: 'AI & Heuristics',
    icon: '🏡',
    headline: 'AI Underwriting & Heuristic Autofill',
    description: 'Autonomous financial intake featuring heuristic GPS address geocoding, 1-tap contact card decomposition, and real-time DTI gauge visualization.',
    capabilities: [
      'Heuristic address & GPS geocoding',
      '1-tap contact card decomposition',
      'Real-time assessment gauge visualization',
      'Live debt-to-income quotient projection',
    ],
    schema: AI_MORTGAGE_SCHEMA,
    samples: AI_MORTGAGE_SAMPLES,
  },
  {
    id: 'ai-studio',
    title: 'Live AI Form Scaffolder Studio',
    domain: 'AI Studio',
    badge: 'Prompt Compiler',
    icon: '⚡',
    headline: 'Real-Time Grounded Prompt Compiler',
    description: 'Type any natural language regulatory prompt or select a 2026 preset to dynamically synthesize a full multi-step form with live assessment gauges.',
    capabilities: [
      'Prompt-to-schema dynamic compiler',
      'Multi-step cognitive chunking',
      'SemanticIntent auto-mapping',
      'Dynamic assessment gauge synthesis',
    ],
    schema: SearchGroundedFormCompiler.compileFromPrompt('California SB 1047 & Frontier AI Safety Intake').schema,
    samples: {
      model_name: 'Atlas-Omega-1T',
      safety_lead_name: 'Dr. Sarah Connor',
      safety_lead_email: 'safety@skynet-defense.org',
      training_flops_log: 27,
      autonomy_tier: 'tier_1_hazardous',
      kill_switch_protocol: 15,
    },
  },
];

// ============================================================================
// LEGACY COMPATIBILITY EXPORTS (FOR OTHER TABS)
// ============================================================================
export const HYDRATED_FIELDS: HydratedFieldDefinition[] = [
  {
    name: 'teamName', type: 'text', label: 'Team name', required: true,
    placeholder: 'e.g. Northstar',
    rules: [
      { type: 'minLength', value: 2, message: 'Use at least 2 characters.' },
      { type: 'custom', name: 'team-name-safe' },
    ],
  },
  {
    name: 'leadEmail', type: 'email', label: 'Team lead email', required: true,
    placeholder: 'lead@company.com', validate: 'email',
  },
  {
    name: 'companySize', type: 'select', label: 'Company size', required: true,
    options: [
      { label: '1–10', value: '1-10' },
      { label: '11–50', value: '11-50' },
      { label: '51–200', value: '51-200' },
      { label: '201+', value: '201+' },
    ],
  },
  {
    name: 'readiness', type: 'likert', label: 'How ready are you to pilot?', required: true,
    min: 1, max: 5, scaleType: 'numeric',
  },
  {
    name: 'context', type: 'textarea', label: 'One thing the engine should know',
    placeholder: 'Optional context from the JSON definition',
    rules: [{ type: 'maxLength', value: 180, message: 'Please keep this under 180 characters.' }],
  },
];

export function registerShowcaseValidators() {
  registerCustomValidator('team-name-safe', (value) => {
    const clean = typeof value === 'string' && /^[\p{L}\p{N} .&'-]+$/u.test(value.trim());
    return clean
      ? { isValid: true }
      : { isValid: false, error: 'Use letters, numbers, spaces, or simple punctuation.' };
  });
}

export const ANALYTICS_FIELDS: FieldDefinition[] = [
  {
    id: 'project-type', name: 'projectType', type: 'select', label: 'Project type',
    options: [
      { label: 'Product', value: 'product' },
      { label: 'Workflow', value: 'workflow' },
      { label: 'Research', value: 'research' },
    ],
  },
  { id: 'team-size', name: 'teamSize', type: 'number', label: 'Team size' },
  { id: 'confidence', name: 'confidence', type: 'likert', label: 'Confidence score' },
  { id: 'project-name', name: 'projectName', type: 'text', label: 'Project name' },
];

export const ANALYTICS_RESPONSES: FormResponse[] = [
  {
    id: 'r-001', formId: 'launch-readiness', tenantId: 'showcase', submittedAt: '2026-10-01T09:00:00.000Z',
    data: { projectType: 'product', teamSize: 8, confidence: 8, projectName: 'Atlas' },
  },
  {
    id: 'r-002', formId: 'launch-readiness', tenantId: 'showcase', submittedAt: '2026-10-02T10:30:00.000Z',
    data: { projectType: 'workflow', teamSize: 14, confidence: 6, projectName: 'Bio, Better' },
  },
  {
    id: 'r-003', formId: 'launch-readiness', tenantId: 'showcase', submittedAt: '2026-10-04T13:15:00.000Z',
    data: { projectType: 'product', teamSize: 5, confidence: 9, projectName: '"Field Notes"' },
  },
  {
    id: 'r-004', formId: 'launch-readiness', tenantId: 'showcase', submittedAt: '2026-10-07T15:00:00.000Z',
    data: { projectType: 'research', teamSize: 3, confidence: 7, projectName: 'New Horizons' },
  },
];
