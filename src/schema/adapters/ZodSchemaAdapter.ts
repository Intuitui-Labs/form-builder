import { z } from 'zod';
import type { FormSchema } from '../FormSchema.js';
import type { ISchemaValidator, SchemaValidationResult, SchemaIssue } from '../../ports/index.js';
import { FormSchemaZod } from '../FormSchemaValidation.js';

/**
 * Zod-backed implementation of ISchemaValidator.
 * Utilizes the canonical FormSchemaZod contract with deep parsing and coercions.
 */
export class ZodSchemaAdapter implements ISchemaValidator<FormSchema> {
  public readonly name = 'zod';

  public safeValidate(input: unknown): SchemaValidationResult<FormSchema> {
    const parseResult = FormSchemaZod.safeParse(input);

    if (parseResult.success) {
      return {
        success: true,
        data: parseResult.data as FormSchema,
      };
    }

    const issues: SchemaIssue[] = parseResult.error.issues.map((issue) => ({
      path: issue.path as (string | number)[],
      message: issue.message,
    }));

    return {
      success: false,
      error: {
        message: parseResult.error.message,
        issues,
      },
    };
  }

  public validate(input: unknown): FormSchema {
    return FormSchemaZod.parse(input) as FormSchema;
  }
}
