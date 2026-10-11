import type { FormSchema } from './FormSchema.js';
import type { ISchemaValidator } from '../ports/index.js';
import { PureSchemaAdapter } from './adapters/PureSchemaAdapter.js';

let activeValidator: ISchemaValidator<FormSchema> = new PureSchemaAdapter();

/**
 * Returns the currently active global ISchemaValidator adapter.
 * Defaults to PureSchemaAdapter (zero external dependencies).
 */
export function getSchemaValidator(): ISchemaValidator<FormSchema> {
  return activeValidator;
}

/**
 * Replaces the active global schema validator with an alternative adapter
 * (e.g. ZodSchemaAdapter, StandardSchemaAdapter, or a custom in-house validator).
 */
export function setSchemaValidator(validator: ISchemaValidator<FormSchema>): void {
  activeValidator = validator;
}

/**
 * Resets the active validator to the default PureSchemaAdapter.
 */
export function resetSchemaValidator(): void {
  activeValidator = new PureSchemaAdapter();
}
