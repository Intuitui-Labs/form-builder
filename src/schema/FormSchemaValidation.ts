import { z } from 'zod';
import type { FormSchema } from './FormSchema.js';

export const FieldTypeSchema = z.enum([
  'text',
  'email',
  'password',
  'select',
  'textarea',
  'number',
  'heading',
  'divider',
  'slider',
  'likert',
  'rich-text',
  'statement',
  'file',
  'image-capture',
  'audio-record',
  'visualization',
]);

export const MediaTypeSchemaZod = z.enum(['image', 'gif', 'video', 'audio', 'embed', 'lottie']);

export const MediaDescriptorSchemaZod = z.object({
  type: MediaTypeSchemaZod,
  url: z.string().min(1, 'Media URL is required'),
  alt: z.string().min(1, 'Accessible alt text is required'),
  caption: z.string().optional(),
  posterUrl: z.string().optional(),
  aspectRatio: z.string().optional(),
  autoPlay: z.boolean().optional(),
  loop: z.boolean().optional(),
  muted: z.boolean().optional(),
  transcriptionUrl: z.string().optional(),
  lazyLoad: z.boolean().optional(),
});

export const VisualizationMetricSchemaZod = z.object({
  label: z.string(),
  value: z.union([z.number(), z.string()]),
  target: z.number().optional(),
  unit: z.string().optional(),
});

export const VisualizationDescriptorSchemaZod = z.object({
  visualizationType: z.enum(['gauge', 'bar', 'line', 'comparison', 'projection']),
  title: z.string(),
  description: z.string().optional(),
  metrics: z.array(VisualizationMetricSchemaZod),
  computedFrom: z.array(z.string()).optional(),
  formula: z.string().optional(),
  dataFallback: z.array(z.object({ label: z.string(), value: z.union([z.string(), z.number()]) })),
});

export const FormFieldOptionSchemaZod = z.object({
  label: z.string(),
  value: z.string(),
  description: z.string().optional(),
  imageSrc: z.string().optional(),
  gifSrc: z.string().optional(),
  badge: z.string().optional(),
});

export const ValidatorRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('required'), message: z.string().optional() }),
  z.object({ type: z.literal('email'), message: z.string().optional() }),
  z.object({ type: z.literal('minLength'), value: z.number(), message: z.string().optional() }),
  z.object({ type: z.literal('maxLength'), value: z.number(), message: z.string().optional() }),
  z.object({ type: z.literal('min'), value: z.number(), message: z.string().optional() }),
  z.object({ type: z.literal('max'), value: z.number(), message: z.string().optional() }),
  z.object({ type: z.literal('pattern'), value: z.string(), message: z.string().optional() }),
  z.object({ type: z.literal('custom'), name: z.string() }),
  z.object({ type: z.literal('matchesField'), targetField: z.string(), message: z.string().optional() }),
  z.object({ type: z.literal('greaterThanField'), targetField: z.string(), allowEqual: z.boolean().optional(), message: z.string().optional() }),
  z.object({ type: z.literal('lessThanField'), targetField: z.string(), allowEqual: z.boolean().optional(), message: z.string().optional() }),
  z.object({ type: z.literal('requiredIfField'), targetField: z.string(), operator: z.enum(['equals', 'notEquals', 'contains', 'present']), value: z.unknown().optional(), message: z.string().optional() }),
  z.object({ type: z.literal('luhn'), message: z.string().optional() }),
  z.object({ type: z.literal('cardExpiry'), message: z.string().optional() }),
  z.object({ type: z.literal('passwordStrength'), minScore: z.number().optional(), message: z.string().optional() }),
  z.object({ type: z.literal('fileSize'), maxBytes: z.number(), message: z.string().optional() }),
  z.object({ type: z.literal('fileType'), allowedMimeTypes: z.array(z.string()), message: z.string().optional() }),
  z.object({ type: z.literal('maxFiles'), max: z.number(), message: z.string().optional() }),
]);

export const FormFieldSchemaZod = z.object({
  id: z.string(),
  name: z.string().refine((val) => !['__proto__', 'constructor', 'prototype'].includes(val), {
    message: 'Illegal property name',
  }),
  type: FieldTypeSchema,
  label: z.string().optional().default(''),
  required: z.boolean().optional().default(false),
  placeholder: z.string().optional(),
  defaultValue: z.unknown().optional(),
  content: z.string().optional(),
  options: z.array(FormFieldOptionSchemaZod).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  scaleType: z.enum(['emoji', 'numeric']).optional(),
  order: z.number().optional().default(0),
  config: z.record(z.string(), z.unknown()).optional(),
  conditions: z.array(z.unknown()).optional(),
  rules: z.array(ValidatorRuleSchema).optional(),
  media: MediaDescriptorSchemaZod.optional(),
  visualization: VisualizationDescriptorSchemaZod.optional(),
}).passthrough();

export const FormPageSchemaZod = z.object({
  id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  fields: z.array(FormFieldSchemaZod),
  conditions: z.array(z.unknown()).optional(),
  jumpRules: z.array(z.unknown()).optional(),
  defaultNextPageId: z.string().optional(),
  media: MediaDescriptorSchemaZod.optional(),
}).passthrough();

export const FormSettingsSchemaZod = z.object({
  isPublished: z.boolean().optional(),
  category: z.string().optional(),
  slug: z.string().optional(),
}).passthrough();

export const FormSchemaZod = z.object({
  v: z.string().optional().default('1.0'),
  id: z.string(),
  tenantId: z.string().optional().default('default-tenant'),
  title: z.string(),
  description: z.string().optional(),
  pages: z.array(FormPageSchemaZod).min(1, 'Form must contain at least one page'),
  settings: FormSettingsSchemaZod.default({}),
  createdAt: z.string().optional().default(() => new Date().toISOString()),
  updatedAt: z.string().optional().default(() => new Date().toISOString()),
}).passthrough();

import { getSchemaValidator } from './SchemaValidatorRegistry.js';

/**
 * Validates a raw object against the active ISchemaValidator contract.
 * Returns the parsed typed FormSchema or throws a structured validation error.
 */
export function validateFormSchema(input: unknown): FormSchema {
  return getSchemaValidator().validate(input);
}

/**
 * Safely parses a raw object against the active ISchemaValidator contract.
 */
export function safeValidateFormSchema(input: unknown) {
  return getSchemaValidator().safeValidate(input);
}

