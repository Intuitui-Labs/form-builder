export type FieldType =
  | 'text'
  | 'email'
  | 'password'
  | 'select'
  | 'textarea'
  | 'number'
  | 'heading'
  | 'divider'
  | 'slider'
  | 'likert';

export type ValidatorRule =
  | { type: 'required'; message?: string }
  | { type: 'email'; message?: string }
  | { type: 'minLength'; value: number; message?: string }
  | { type: 'maxLength'; value: number; message?: string }
  | { type: 'min'; value: number; message?: string }
  | { type: 'max'; value: number; message?: string }
  | { type: 'pattern'; value: string; message?: string }
  | { type: 'custom'; name: string };

export interface FormField {
  id: string;
  name: string;
  type: FieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  scaleType?: 'emoji' | 'numeric';
  order: number;
  config?: Record<string, unknown>;
  conditions?: unknown[];
  rules?: ValidatorRule[];
}

export interface FieldDefinition {
  id: string;
  name: string;
  type: FieldType;
  label?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: unknown;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  scaleType?: 'emoji' | 'numeric';
  config?: Record<string, unknown>;
  conditions?: unknown[];
  rules?: ValidatorRule[];
}

export interface FormPage {
  id: string;
  title?: string;
  fields: FormField[];
  conditions?: unknown[];
}

export interface FormSettings {
  isPublished?: boolean;
  category?: string;
  slug?: string;
  [key: string]: unknown;
}

export interface FormSchema {
  v: '1.0';
  id: string;
  tenantId: string;
  title: string;
  description?: string;
  pages: FormPage[];
  settings: FormSettings;
  createdAt: string;
  updatedAt: string;
}

export interface FormResponse {
  id: string;
  formId: string;
  responderId?: string;
  tenantId: string;
  data: Record<string, unknown>;
  submittedAt: string;
}
