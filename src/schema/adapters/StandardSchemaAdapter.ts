import type { FormSchema } from '../FormSchema.js';
import type {
  ISchemaValidator,
  SchemaValidationResult,
  SchemaIssue,
  StandardSchemaV1,
  StandardSchemaV1Result,
} from '../../ports/index.js';

/**
 * Adapter that connects any Standard Schema v1 compliant validator
 * (Valibot, ArkType, Zod) to the engine's ISchemaValidator port.
 */
export class StandardSchemaAdapter implements ISchemaValidator<FormSchema> {
  public readonly name: string;
  private readonly standardSchema: StandardSchemaV1<unknown, FormSchema>;

  constructor(standardSchema: StandardSchemaV1<unknown, FormSchema>, name = 'standard-schema') {
    this.standardSchema = standardSchema;
    this.name = `${name}:${standardSchema['~standard'].vendor}`;
  }

  public safeValidate(input: unknown): SchemaValidationResult<FormSchema> {
    const rawResult = this.standardSchema['~standard'].validate(input);

    if (rawResult instanceof Promise) {
      throw new Error(
        'StandardSchemaAdapter requires synchronous validation for FormSchema evaluation'
      );
    }

    const result = rawResult as StandardSchemaV1Result<FormSchema>;

    if (!result.issues || result.issues.length === 0) {
      return {
        success: true,
        data: result.value,
      };
    }

    const issues: SchemaIssue[] = result.issues.map((issue) => {
      const path: (string | number)[] = issue.path
        ? issue.path.map((segment) =>
            typeof segment === 'object' && segment !== null && 'key' in segment
              ? String((segment as any).key)
              : (segment as string | number)
          )
        : [];

      return {
        path,
        message: issue.message,
      };
    });

    return {
      success: false,
      error: {
        message: issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        issues,
      },
    };
  }

  public validate(input: unknown): FormSchema {
    const res = this.safeValidate(input);
    if (!res.success || !res.data) {
      throw new Error(res.error?.message || 'Standard schema validation failed');
    }
    return res.data;
  }
}
