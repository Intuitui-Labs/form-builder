import { describe, it, expect } from 'vitest';
import {
  PureSchemaAdapter,
  ZodSchemaAdapter,
  type FormSchema,
} from '../../src/index.js';

describe('Multimedia & Interactive Visualizations Schema Validation', () => {
  const multimediaSchema: FormSchema = {
    v: '1.0',
    id: 'interactive-onboarding',
    tenantId: 'tenant-demo',
    title: 'Visual & Interactive Intake',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pages: [
      {
        id: 'welcome-page',
        title: 'Welcome to Acme',
        description: 'An interactive guided walkthrough',
        media: {
          type: 'video',
          url: 'https://cdn.example.com/videos/intro.mp4',
          alt: 'Product introduction video',
          caption: 'Watch our 60-second walkthrough',
          posterUrl: 'https://cdn.example.com/thumbnails/intro.jpg',
          aspectRatio: '16:9',
          autoPlay: false,
          transcriptionUrl: 'https://cdn.example.com/transcripts/intro.vtt',
        },
        fields: [
          {
            id: 'f-guidance',
            name: 'onboarding_intro',
            type: 'rich-text',
            label: 'Important Guidance',
            required: false,
            order: 0,
            content: '### Welcome!\nPlease choose your plan below. You can change your choice anytime.',
          },
          {
            id: 'f-plan',
            name: 'selected_plan',
            type: 'select',
            label: 'Choose Your Tier',
            required: true,
            order: 1,
            options: [
              {
                label: 'Starter',
                value: 'starter',
                description: 'For solo creators and small projects',
                imageSrc: 'https://cdn.example.com/icons/starter.png',
                badge: 'Popular',
              },
              {
                label: 'Enterprise',
                value: 'enterprise',
                description: 'Full audit logs, dedicated support, and SLA',
                imageSrc: 'https://cdn.example.com/icons/enterprise.png',
                badge: 'Custom',
              },
            ],
          },
          {
            id: 'f-upload',
            name: 'verification_document',
            type: 'file',
            label: 'Government ID',
            required: true,
            order: 2,
            rules: [
              { type: 'fileSize', maxBytes: 5 * 1024 * 1024, message: 'Max file size is 5MB' },
              { type: 'fileType', allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'] },
              { type: 'maxFiles', max: 2 },
            ],
          },
          {
            id: 'f-viz',
            name: 'savings_projection',
            type: 'visualization',
            label: 'Projected Annual ROI',
            required: false,
            order: 3,
            visualization: {
              visualizationType: 'gauge',
              title: 'Estimated Cloud Cost Reduction',
              metrics: [
                { label: 'Current Spend', value: '$12,000', unit: 'USD' },
                { label: 'Projected Spend', value: '$7,200', unit: 'USD' },
                { label: 'Estimated Savings', value: 40, target: 50, unit: '%' },
              ],
              dataFallback: [
                { label: 'Current Spend', value: 12000 },
                { label: 'Projected Spend', value: 7200 },
                { label: 'Savings Percentage', value: 40 },
              ],
            },
          },
        ],
      },
    ],
  };

  it('validates multimedia schema with PureSchemaAdapter (0 kB runtime)', () => {
    const adapter = new PureSchemaAdapter();
    const result = adapter.safeValidate(multimediaSchema);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.pages[0].media?.type).toBe('video');
    expect(result.data?.pages[0].fields[0].type).toBe('rich-text');
    expect(result.data?.pages[0].fields[1].options?.[0].imageSrc).toBe('https://cdn.example.com/icons/starter.png');
    expect(result.data?.pages[0].fields[2].rules).toHaveLength(3);
    expect(result.data?.pages[0].fields[3].visualization?.visualizationType).toBe('gauge');
  });

  it('validates multimedia schema with ZodSchemaAdapter', () => {
    const adapter = new ZodSchemaAdapter();
    const result = adapter.safeValidate(multimediaSchema);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.pages[0].fields[2].type).toBe('file');
  });

  it('rejects unsupported field types in PureSchemaAdapter', () => {
    const invalidSchema = {
      ...multimediaSchema,
      pages: [
        {
          ...multimediaSchema.pages[0],
          fields: [
            {
              id: 'f-bad',
              name: 'bad_field',
              type: 'unknown-widget-type',
              label: 'Bad',
              required: false,
              order: 0,
            },
          ],
        },
      ],
    };

    const adapter = new PureSchemaAdapter();
    const result = adapter.safeValidate(invalidSchema);
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('Invalid field type: unknown-widget-type');
  });
});
