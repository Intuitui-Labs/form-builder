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
]);

export const ValidatorRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('required'), message: z.string().optional() }),
  z.object({ type: z.literal('email'), message: z.string().optional() }),
  z.object({ type: z.literal('minLength'), value: z.number(), message: z.string().optional() }),
  z.object({ type: z.literal('maxLength'), value: z.number(), message: z.string().optional() }),
  z.object({ type: z.literal('min'), value: z.number(), message: z.string().optional() }),
  z.object({ type: z.literal('max'), value: z.number(), message: z.string().optional() }),
  z.object({ type: z.literal('pattern'), value: z.string(), message: z.string().optional() }),
  z.object({ type: z.literal('custom'), name: z.string() }),
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
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  scaleType: z.enum(['emoji', 'numeric']).optional(),
  order: z.number().optional().default(0),
  config: z.record(z.string(), z.unknown()).optional(),
  conditions: z.array(z.unknown()).optional(),
  rules: z.array(ValidatorRuleSchema).optional(),
});

export const FormPageSchemaZod = z.object({
  id: z.string(),
  title: z.string().optional(),
  fields: z.array(FormFieldSchemaZod),
  conditions: z.array(z.unknown()).optional(),
});

export const FormSettingsSchemaZod = z.object({
  isPublished: z.boolean().optional(),
  category: z.string().optional(),
  slug: z.string().optional(),
}).passthrough();

export const FormSchemaZod = z.object({
  v: z.literal('1.0'),
  id: z.string(),
  tenantId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  pages: z.array(FormPageSchemaZod).min(1, 'Form must contain at least one page'),
  settings: FormSettingsSchemaZod.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});

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

