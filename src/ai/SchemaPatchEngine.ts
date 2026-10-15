import type {
  FormSchema,
  FormPage,
  FormField,
  FieldDefinition,
} from '../schema/FormSchema.js';
import type { PageJumpRule } from '../schema/FormBranching.js';
import { safeValidateFormSchema } from '../schema/FormSchemaValidation.js';
import { DefaultSanitizer } from '../core/DefaultSanitizer.js';

export type PatchOperationType = 'add' | 'remove' | 'replace' | 'move';

export interface SchemaPatchOp {
  op: PatchOperationType;
  path: string;
  value?: unknown;
  from?: string;
  previousValue?: unknown;
}

export interface PatchApplyResult {
  success: boolean;
  schema: FormSchema;
  appliedOpsCount: number;
  inverseOps: SchemaPatchOp[];
  prunedReferencesCount: number;
  error?: string;
}

export interface PatchOptions {
  sanitize?: boolean;
  enforceReferentialIntegrity?: boolean;
  validatePostPatch?: boolean;
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Enterprise Atomic Schema Patch & Diff Engine.
 * Enables AI agents to mutate, evolve, and repair FormSchema ASTs via fine-grained RFC 6902-style operations.
 * Enforces transactional rollback, bidirectional inverse patch generation, sanitization,
 * and automatic referential integrity cleanup (dangling jump rules & visibleIf expressions).
 */
export class SchemaPatchEngine {
  private static sanitizer = new DefaultSanitizer();

  /**
   * Deep clone helper to ensure transactional isolation.
   */
  public static cloneSchema(schema: FormSchema): FormSchema {
    return JSON.parse(JSON.stringify(schema));
  }

  /**
   * Applies an array of SchemaPatchOp transactions to a schema.
   * If any operation fails or if post-patch validation fails, rolls back completely.
   */
  public static applyPatch(
    schema: FormSchema,
    ops: SchemaPatchOp[],
    options: PatchOptions = {}
  ): PatchApplyResult {
    const sanitize = options.sanitize !== false;
    const enforceIntegrity = options.enforceReferentialIntegrity !== false;
    const validate = options.validatePostPatch !== false;

    const workingCopy = this.cloneSchema(schema);
    const inverseOps: SchemaPatchOp[] = [];
    let prunedReferencesCount = 0;

    try {
      for (const rawOp of ops) {
        const op = sanitize ? this.sanitizeOp(rawOp) : rawOp;
        const inverse = this.applySingleOp(workingCopy, op);
        inverseOps.unshift(inverse);
      }

      if (enforceIntegrity) {
        prunedReferencesCount = this.healReferentialIntegrity(workingCopy);
      }

      if (validate) {
        const validation = safeValidateFormSchema(workingCopy);
        if (!validation.success) {
          return {
            success: false,
            schema,
            appliedOpsCount: 0,
            inverseOps: [],
            prunedReferencesCount: 0,
            error: `Post-patch schema validation failed: ${validation.error?.issues.map((i) => i.message).join('; ')}`,
          };
        }
      }

      workingCopy.updatedAt = new Date().toISOString();

      return {
        success: true,
        schema: workingCopy,
        appliedOpsCount: ops.length,
        inverseOps,
        prunedReferencesCount,
      };
    } catch (err) {
      return {
        success: false,
        schema,
        appliedOpsCount: 0,
        inverseOps: [],
        prunedReferencesCount: 0,
        error: `Patch execution failed: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Generates a minimal list of SchemaPatchOp operations to transform schemaA into schemaB.
   */
  public static diff(schemaA: FormSchema, schemaB: FormSchema): SchemaPatchOp[] {
    const ops: SchemaPatchOp[] = [];

    // Title & description
    if (schemaA.title !== schemaB.title) {
      ops.push({ op: 'replace', path: '/title', value: schemaB.title, previousValue: schemaA.title });
    }
    if (schemaA.description !== schemaB.description) {
      ops.push({ op: 'replace', path: '/description', value: schemaB.description, previousValue: schemaA.description });
    }

    // Pages diff
    const pageMapA = new Map(schemaA.pages.map((p) => [p.id, p]));
    const pageMapB = new Map(schemaB.pages.map((p) => [p.id, p]));

    // Check removed pages
    for (const [pageId, pageA] of pageMapA.entries()) {
      if (!pageMapB.has(pageId)) {
        ops.push({ op: 'remove', path: `/pages/${pageId}`, previousValue: pageA });
      }
    }

    // Check added or modified pages
    for (let bIdx = 0; bIdx < schemaB.pages.length; bIdx++) {
      const pageB = schemaB.pages[bIdx];
      const pageA = pageMapA.get(pageB.id);

      if (!pageA) {
        ops.push({ op: 'add', path: `/pages/${bIdx}`, value: pageB });
        continue;
      }

      // Page title & description
      if (pageA.title !== pageB.title) {
        ops.push({ op: 'replace', path: `/pages/${pageB.id}/title`, value: pageB.title, previousValue: pageA.title });
      }
      if (pageA.description !== pageB.description) {
        ops.push({ op: 'replace', path: `/pages/${pageB.id}/description`, value: pageB.description, previousValue: pageA.description });
      }
      if (pageA.defaultNextPageId !== pageB.defaultNextPageId) {
        ops.push({ op: 'replace', path: `/pages/${pageB.id}/defaultNextPageId`, value: pageB.defaultNextPageId, previousValue: pageA.defaultNextPageId });
      }

      // Fields diff within page
      const fieldMapA = new Map(pageA.fields.map((f) => [f.name, f]));
      const fieldMapB = new Map(pageB.fields.map((f) => [f.name, f]));

      for (const [fieldName, fieldA] of fieldMapA.entries()) {
        if (!fieldMapB.has(fieldName)) {
          ops.push({ op: 'remove', path: `/pages/${pageB.id}/fields/${fieldName}`, previousValue: fieldA });
        }
      }

      for (let fIdx = 0; fIdx < pageB.fields.length; fIdx++) {
        const fieldB = pageB.fields[fIdx];
        const fieldA = fieldMapA.get(fieldB.name);

        if (!fieldA) {
          ops.push({ op: 'add', path: `/pages/${pageB.id}/fields/${fIdx}`, value: fieldB });
          continue;
        }

        // Compare field properties
        if (fieldA.label !== fieldB.label) {
          ops.push({ op: 'replace', path: `/pages/${pageB.id}/fields/${fieldB.name}/label`, value: fieldB.label, previousValue: fieldA.label });
        }
        if (fieldA.type !== fieldB.type) {
          ops.push({ op: 'replace', path: `/pages/${pageB.id}/fields/${fieldB.name}/type`, value: fieldB.type, previousValue: fieldA.type });
        }
        if (fieldA.required !== fieldB.required) {
          ops.push({ op: 'replace', path: `/pages/${pageB.id}/fields/${fieldB.name}/required`, value: fieldB.required, previousValue: fieldA.required });
        }
        if (fieldA.helperText !== fieldB.helperText) {
          ops.push({ op: 'replace', path: `/pages/${pageB.id}/fields/${fieldB.name}/helperText`, value: fieldB.helperText, previousValue: fieldA.helperText });
        }
        if (fieldA.placeholder !== fieldB.placeholder) {
          ops.push({ op: 'replace', path: `/pages/${pageB.id}/fields/${fieldB.name}/placeholder`, value: fieldB.placeholder, previousValue: fieldA.placeholder });
        }
        if (JSON.stringify(fieldA.options) !== JSON.stringify(fieldB.options)) {
          ops.push({ op: 'replace', path: `/pages/${pageB.id}/fields/${fieldB.name}/options`, value: fieldB.options, previousValue: fieldA.options });
        }
        if (JSON.stringify(fieldA.rubric) !== JSON.stringify(fieldB.rubric)) {
          ops.push({ op: 'replace', path: `/pages/${pageB.id}/fields/${fieldB.name}/rubric`, value: fieldB.rubric, previousValue: fieldA.rubric });
        }
      }
    }

    return ops;
  }

  private static sanitizeOp(op: SchemaPatchOp): SchemaPatchOp {
    if (op.op === 'add' || op.op === 'replace') {
      const val = op.value;
      if (typeof val === 'string') {
        return { ...op, value: this.sanitizer.sanitizeRichText(val) };
      }
      if (val && typeof val === 'object') {
        const sanitizedVal = JSON.parse(JSON.stringify(val));
        this.sanitizeObjectKeysAndStrings(sanitizedVal);
        return { ...op, value: sanitizedVal };
      }
    }
    return op;
  }

  private static sanitizeObjectKeysAndStrings(obj: any): void {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      if (DANGEROUS_KEYS.has(key)) {
        const safeKey = `safe_${key}`;
        obj[safeKey] = obj[key];
        delete obj[key];
        continue;
      }
      if (typeof obj[key] === 'string') {
        obj[key] = this.sanitizer.sanitizeRichText(obj[key]);
      } else if (typeof obj[key] === 'object') {
        this.sanitizeObjectKeysAndStrings(obj[key]);
      }
    }
  }

  private static applySingleOp(schema: FormSchema, op: SchemaPatchOp): SchemaPatchOp {
    const segments = this.parsePath(op.path);

    switch (op.op) {
      case 'add':
        return this.applyAdd(schema, segments, op.value);
      case 'remove':
        return this.applyRemove(schema, segments);
      case 'replace':
        return this.applyReplace(schema, segments, op.value);
      case 'move':
        return this.applyMove(schema, op.from!, op.path);
    }
  }

  private static parsePath(path: string): string[] {
    if (!path.startsWith('/')) {
      throw new Error(`Invalid JSON pointer path: "${path}". Must start with "/".`);
    }
    return path.slice(1).split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  }

  private static applyAdd(schema: FormSchema, segments: string[], value: unknown): SchemaPatchOp {
    if (segments.length === 0) {
      throw new Error('Cannot add to root schema directly');
    }

    // /pages/{indexOrId}
    if (segments[0] === 'pages') {
      if (segments.length === 1 || segments.length === 2) {
        const pageIdx = segments.length === 2 ? Number(segments[1]) : schema.pages.length;
        const pageToInsert = value as FormPage;
        if (!pageToInsert.id) {
          pageToInsert.id = `step-${schema.pages.length + 1}`;
        }
        if (!pageToInsert.fields) {
          pageToInsert.fields = [];
        }
        const insertAt = isNaN(pageIdx) ? schema.pages.length : Math.max(0, Math.min(schema.pages.length, pageIdx));
        schema.pages.splice(insertAt, 0, pageToInsert);
        return { op: 'remove', path: `/pages/${pageToInsert.id}` };
      }

      // /pages/{pageId}/fields/{fieldIndexOrName}
      const page = this.resolvePage(schema, segments[1]);
      if (segments[2] === 'fields') {
        if (segments.length === 3 || segments.length === 4) {
          const fieldToInsert = value as FormField;
          const idx = segments.length === 4 ? Number(segments[3]) : page.fields.length;
          const insertAt = isNaN(idx) ? page.fields.length : Math.max(0, Math.min(page.fields.length, idx));
          page.fields.splice(insertAt, 0, fieldToInsert);
          return { op: 'remove', path: `/pages/${page.id}/fields/${fieldToInsert.name}` };
        }
      }

      // /pages/{pageId}/jumpRules/{ruleIndex}
      if (segments[2] === 'jumpRules') {
        if (!page.jumpRules) page.jumpRules = [];
        const ruleIdx = segments.length === 4 ? Number(segments[3]) : page.jumpRules.length;
        const insertAt = isNaN(ruleIdx) ? page.jumpRules.length : Math.max(0, Math.min(page.jumpRules.length, ruleIdx));
        page.jumpRules.splice(insertAt, 0, value as PageJumpRule);
        return { op: 'remove', path: `/pages/${page.id}/jumpRules/${insertAt}` };
      }
    }

    // Root properties e.g. /settings/{key}
    if (segments[0] === 'settings' && segments.length === 2) {
      if (!schema.settings) schema.settings = {};
      const prev = schema.settings[segments[1]];
      schema.settings[segments[1]] = value;
      return prev !== undefined
        ? { op: 'replace', path: `/settings/${segments[1]}`, value: prev }
        : { op: 'remove', path: `/settings/${segments[1]}` };
    }

    throw new Error(`Unsupported add path: "/${segments.join('/')}"`);
  }

  private static applyRemove(schema: FormSchema, segments: string[]): SchemaPatchOp {
    if (segments[0] === 'pages') {
      if (segments.length === 2) {
        const pageIdx = this.resolvePageIndex(schema, segments[1]);
        const removed = schema.pages.splice(pageIdx, 1)[0];
        return { op: 'add', path: `/pages/${pageIdx}`, value: removed };
      }

      const page = this.resolvePage(schema, segments[1]);
      if (segments[2] === 'fields' && segments.length === 4) {
        const fieldIdx = this.resolveFieldIndex(page, segments[3]);
        const removed = page.fields.splice(fieldIdx, 1)[0];
        return { op: 'add', path: `/pages/${page.id}/fields/${fieldIdx}`, value: removed };
      }

      if (segments[2] === 'jumpRules' && segments.length === 4) {
        if (!page.jumpRules) throw new Error(`No jump rules on page ${page.id}`);
        const ruleIdx = Number(segments[3]);
        if (ruleIdx < 0 || ruleIdx >= page.jumpRules.length) {
          throw new Error(`Jump rule index ${ruleIdx} out of bounds on page ${page.id}`);
        }
        const removed = page.jumpRules.splice(ruleIdx, 1)[0];
        return { op: 'add', path: `/pages/${page.id}/jumpRules/${ruleIdx}`, value: removed };
      }
    }

    if (segments[0] === 'settings' && segments.length === 2) {
      if (!schema.settings) return { op: 'add', path: `/settings/${segments[1]}`, value: undefined };
      const prev = schema.settings[segments[1]];
      delete schema.settings[segments[1]];
      return { op: 'add', path: `/settings/${segments[1]}`, value: prev };
    }

    throw new Error(`Unsupported remove path: "/${segments.join('/')}"`);
  }

  private static applyReplace(schema: FormSchema, segments: string[], value: unknown): SchemaPatchOp {
    if (segments.length === 1) {
      const key = segments[0] as keyof FormSchema;
      const prev = schema[key];
      (schema as any)[key] = value;
      return { op: 'replace', path: `/${key}`, value: prev };
    }

    if (segments[0] === 'pages') {
      const page = this.resolvePage(schema, segments[1]);
      if (segments.length === 3) {
        const prop = segments[2] as keyof FormPage;
        const prev = page[prop];
        (page as any)[prop] = value;
        return { op: 'replace', path: `/pages/${page.id}/${prop}`, value: prev };
      }

      if (segments[2] === 'fields') {
        const field = this.resolveField(page, segments[3]);
        if (segments.length === 5) {
          const prop = segments[4] as keyof FormField;
          const prev = field[prop];
          (field as any)[prop] = value;
          return { op: 'replace', path: `/pages/${page.id}/fields/${field.name}/${prop}`, value: prev };
        }
        if (segments.length === 4) {
          // Replace entire field
          const fieldIdx = this.resolveFieldIndex(page, segments[3]);
          const prev = page.fields[fieldIdx];
          page.fields[fieldIdx] = value as FormField;
          return { op: 'replace', path: `/pages/${page.id}/fields/${segments[3]}`, value: prev };
        }
      }
    }

    throw new Error(`Unsupported replace path: "/${segments.join('/')}"`);
  }

  private static applyMove(schema: FormSchema, fromPath: string, toPath: string): SchemaPatchOp {
    const fromSegments = this.parsePath(fromPath);
    const toSegments = this.parsePath(toPath);

    // Reorder pages: /pages/{fromIndex} -> /pages/{toIndex}
    if (fromSegments[0] === 'pages' && fromSegments.length === 2 && toSegments[0] === 'pages' && toSegments.length === 2) {
      const fromIdx = this.resolvePageIndex(schema, fromSegments[1]);
      const toIdx = Number(toSegments[1]);
      if (isNaN(toIdx) || toIdx < 0 || toIdx >= schema.pages.length) {
        throw new Error(`Target page move index ${toSegments[1]} invalid.`);
      }
      const [movedPage] = schema.pages.splice(fromIdx, 1);
      schema.pages.splice(toIdx, 0, movedPage);
      return { op: 'move', from: toPath, path: fromPath };
    }

    // Reorder fields within page or across pages: /pages/{p1}/fields/{f1} -> /pages/{p2}/fields/{idx}
    if (fromSegments[0] === 'pages' && fromSegments[2] === 'fields' && toSegments[0] === 'pages' && toSegments[2] === 'fields') {
      const sourcePage = this.resolvePage(schema, fromSegments[1]);
      const targetPage = this.resolvePage(schema, toSegments[1]);
      const fromIdx = this.resolveFieldIndex(sourcePage, fromSegments[3]);
      const toIdx = Number(toSegments[3]);

      const [movedField] = sourcePage.fields.splice(fromIdx, 1);
      const targetIdx = isNaN(toIdx) ? targetPage.fields.length : Math.max(0, Math.min(targetPage.fields.length, toIdx));
      targetPage.fields.splice(targetIdx, 0, movedField);
      return { op: 'move', from: toPath, path: fromPath };
    }

    throw new Error(`Unsupported move from "${fromPath}" to "${toPath}"`);
  }

  private static resolvePage(schema: FormSchema, indexOrId: string): FormPage {
    const page = schema.pages.find((p) => p.id === indexOrId);
    if (page) return page;
    const idx = Number(indexOrId);
    if (!isNaN(idx) && schema.pages[idx]) {
      return schema.pages[idx];
    }
    throw new Error(`Page not found: "${indexOrId}"`);
  }

  private static resolvePageIndex(schema: FormSchema, indexOrId: string): number {
    const idx = schema.pages.findIndex((p) => p.id === indexOrId);
    if (idx !== -1) return idx;
    const num = Number(indexOrId);
    if (!isNaN(num) && num >= 0 && num < schema.pages.length) {
      return num;
    }
    throw new Error(`Page not found: "${indexOrId}"`);
  }

  private static resolveField(page: FormPage, indexOrName: string): FormField {
    const field = page.fields.find((f) => f.name === indexOrName || f.id === indexOrName);
    if (field) return field;
    const idx = Number(indexOrName);
    if (!isNaN(idx) && page.fields[idx]) {
      return page.fields[idx];
    }
    throw new Error(`Field not found: "${indexOrName}" on page "${page.id}"`);
  }

  private static resolveFieldIndex(page: FormPage, indexOrName: string): number {
    const idx = page.fields.findIndex((f) => f.name === indexOrName || f.id === indexOrName);
    if (idx !== -1) return idx;
    const num = Number(indexOrName);
    if (!isNaN(num) && num >= 0 && num < page.fields.length) {
      return num;
    }
    throw new Error(`Field not found: "${indexOrName}" on page "${page.id}"`);
  }

  /**
   * Scans schema for dangling pointers resulting from field or page deletions.
   * Auto-prunes orphaned jump targets and clean up condition references.
   */
  public static healReferentialIntegrity(schema: FormSchema): number {
    let prunedCount = 0;
    const validPageIds = new Set(schema.pages.map((p) => p.id));
    const validFieldNames = new Set(schema.pages.flatMap((p) => p.fields.map((f) => f.name)));

    for (const page of schema.pages) {
      // 1. Check defaultNextPageId
      if (page.defaultNextPageId && !validPageIds.has(page.defaultNextPageId)) {
        delete page.defaultNextPageId;
        prunedCount++;
      }

      // 2. Check jumpRules targetPageId
      if (page.jumpRules && page.jumpRules.length > 0) {
        const initialLen = page.jumpRules.length;
        page.jumpRules = page.jumpRules.filter((rule) => {
          if (!validPageIds.has(rule.targetPageId) || rule.targetPageId === page.id) {
            return false;
          }
          if (rule.condition && 'field' in rule.condition && !validFieldNames.has(rule.condition.field as string)) {
            return false;
          }
          return true;
        });
        prunedCount += initialLen - page.jumpRules.length;
        if (page.jumpRules.length === 0) {
          delete page.jumpRules;
        }
      }

      // 3. Check visibleIf conditions on fields
      for (const field of page.fields) {
        if (field.visibleIf && 'field' in field.visibleIf && !validFieldNames.has(field.visibleIf.field as string)) {
          delete field.visibleIf;
          prunedCount++;
        }
      }
    }

    return prunedCount;
  }
}
