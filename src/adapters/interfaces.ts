import type { FormResponse, FormSchema } from '@intuitui-labs/form-builder-engine/schema/FormSchema';

export interface FormStorage {
  save(form: FormSchema): Promise<void>;
  load(id: string): Promise<FormSchema>;
  list(tenantId: string): Promise<FormSchema[]>;
  delete(id: string): Promise<void>;
}

export interface AggregatedStats {
  fieldId: string;
  label: string;
  type: string;
  totalResponses: number;
  data: unknown;
}

export interface FormAnalytics {
  record(formId: string, response: FormResponse): Promise<void>;
  aggregate(formId: string): Promise<AggregatedStats[]>;
  export(formId: string): Promise<string>;
}

export interface FormSync {
  push(form: FormSchema): Promise<void>;
  pull(since: Date): Promise<FormSchema[]>;
  resolveConflict(local: FormSchema, remote: FormSchema): FormSchema;
}

export interface QRCodePort {
  buildPublicFormUrl(slug: string): string;
  buildQRCodeUrl(publicUrl: string): string;
}
