import type {
  FormSchema,
  FieldDefinition,
  FormField,
} from '../schema/FormSchema.js';
import type {
  StudioAction,
  StudioState,
} from '../studio/types.js';
import { FormStudioStore } from '../studio/FormStudioStore.js';
import { DefaultSanitizer } from '../core/DefaultSanitizer.js';

export interface AiToolActionProposal {
  id: string;
  rationale: string;
  actions: StudioAction[];
  rollbackSnapshot?: FormSchema;
}

export interface ProposalValidationResult {
  valid: boolean;
  hasStaleReferences: boolean;
  rejectedActions: Array<{ action: StudioAction; reason: string }>;
  admissibleActions: StudioAction[];
}

export interface ApplyProposalOptions {
  staleTargetPolicy?: 'reject-all' | 'prune-and-continue';
}

export interface ApplyProposalResult {
  success: boolean;
  appliedCount: number;
  prunedCount: number;
  prunedDetails?: Array<{ action: StudioAction; reason: string }>;
  error?: string;
}

export interface ParseToolCallResult {
  success: boolean;
  action: StudioAction | null;
  error?: string;
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Hostile-hardened AI Copilot Dispatcher for Form Studio.
 * Enforces transactional single-step undo batching, validates against concurrency race conditions
 * (stale targets / orphaned pointers), neutralizes prompt injection payloads, and handles truncated JSON streams.
 */
export class AiStudioCopilotDispatcher {
  private static sanitizer = new DefaultSanitizer();

  /**
   * Pre-flight validation of an AI action proposal against current studio state.
   */
  public static validateProposal(
    state: StudioState,
    proposal: AiToolActionProposal
  ): ProposalValidationResult {
    const existingPageIds = new Set(state.schema.pages.map((p) => p.id));
    const declaredPageIds = new Set<string>(existingPageIds);
    const existingFieldIds = new Set(state.schema.pages.flatMap((p) => p.fields.map((f) => f.id || f.name)));

    const rejectedActions: Array<{ action: StudioAction; reason: string }> = [];
    const admissibleActions: StudioAction[] = [];

    for (const action of proposal.actions) {
      if (action.type === 'ADD_PAGE') {
        admissibleActions.push(action);
        continue;
      }

      if (action.type === 'REMOVE_PAGE') {
        const pageId = action.payload.pageId;
        if (!declaredPageIds.has(pageId)) {
          rejectedActions.push({
            action,
            reason: `Target pageId "${pageId}" does not exist in schema (stale reference).`,
          });
          continue;
        }
        if (declaredPageIds.size <= 1) {
          rejectedActions.push({
            action,
            reason: `Cannot remove pageId "${pageId}". Form must have at least one page.`,
          });
          continue;
        }
        declaredPageIds.delete(pageId);
        admissibleActions.push(action);
        continue;
      }

      if (action.type === 'UPDATE_PAGE') {
        const pageId = action.payload.pageId;
        if (!declaredPageIds.has(pageId)) {
          rejectedActions.push({
            action,
            reason: `Target pageId "${pageId}" does not exist in schema (stale reference).`,
          });
          continue;
        }
        admissibleActions.push(action);
        continue;
      }

      if (action.type === 'REORDER_PAGES') {
        const { fromIndex, toIndex } = action.payload;
        const total = declaredPageIds.size;
        if (fromIndex < 0 || fromIndex >= total || toIndex < 0 || toIndex >= total) {
          rejectedActions.push({
            action,
            reason: `Reorder page index out of bounds: [${fromIndex}, ${toIndex}] vs total ${total}.`,
          });
          continue;
        }
        admissibleActions.push(action);
        continue;
      }

      if (action.type === 'INSERT_FIELD') {
        const targetPageId = action.payload.pageId;
        if (!declaredPageIds.has(targetPageId)) {
          rejectedActions.push({
            action,
            reason: `Target pageId "${targetPageId}" does not exist in active schema (stale reference).`,
          });
          continue;
        }
        if (action.payload.field) {
          existingFieldIds.add(action.payload.field.id || action.payload.field.name);
        }
        admissibleActions.push(action);
        continue;
      }

      if (action.type === 'REMOVE_FIELD' || action.type === 'UPDATE_FIELD' || action.type === 'REORDER_FIELDS') {
        const targetPageId = action.payload.pageId;
        if (!declaredPageIds.has(targetPageId)) {
          rejectedActions.push({
            action,
            reason: `Target pageId "${targetPageId}" does not exist in active schema (stale reference).`,
          });
          continue;
        }
        admissibleActions.push(action);
        continue;
      }

      if (action.type === 'SET_FIELD_RUBRIC') {
        const fieldId = action.payload.fieldId;
        if (!existingFieldIds.has(fieldId)) {
          rejectedActions.push({
            action,
            reason: `Target fieldId "${fieldId}" does not exist in schema (stale rubric target).`,
          });
          continue;
        }
        admissibleActions.push(action);
        continue;
      }

      if (action.type === 'ADD_JUMP_RULE') {
        const sourcePageId = action.payload.pageId;
        const targetPageId = action.payload.rule.targetPageId;

        if (!declaredPageIds.has(sourcePageId)) {
          rejectedActions.push({
            action,
            reason: `Source pageId "${sourcePageId}" does not exist in schema.`,
          });
          continue;
        }

        if (!declaredPageIds.has(targetPageId)) {
          rejectedActions.push({
            action,
            reason: `Target jump pageId "${targetPageId}" does not exist in schema (stale reference).`,
          });
          continue;
        }

        admissibleActions.push(action);
        continue;
      }

      if (action.type === 'REMOVE_JUMP_RULE') {
        const pageId = action.payload.pageId;
        if (!declaredPageIds.has(pageId)) {
          rejectedActions.push({
            action,
            reason: `Target pageId "${pageId}" does not exist in schema.`,
          });
          continue;
        }
        admissibleActions.push(action);
        continue;
      }

      // Metadata, settings, etc.
      admissibleActions.push(action);
    }

    const hasStale = rejectedActions.length > 0;
    return {
      valid: !hasStale,
      hasStaleReferences: hasStale,
      rejectedActions,
      admissibleActions,
    };
  }

  /**
   * Sanitizes all field labels, strings, URLs, and option values against injection and pollution.
   */
  public static sanitizeAction(action: StudioAction): StudioAction {
    if (action.type === 'ADD_PAGE') {
      const payload = { ...action.payload };
      if (payload.title) payload.title = this.sanitizer.sanitizeRichText(payload.title);
      if (payload.description) payload.description = this.sanitizer.sanitizeRichText(payload.description);
      return { ...action, payload };
    }

    if (action.type === 'UPDATE_PAGE') {
      const updates = { ...action.payload.updates };
      if (updates.title) updates.title = this.sanitizer.sanitizeRichText(updates.title);
      if (updates.description) updates.description = this.sanitizer.sanitizeRichText(updates.description);
      return { ...action, payload: { ...action.payload, updates } };
    }

    if (action.type === 'SET_FIELD_RUBRIC' && action.payload.rubric) {
      const rubric = { ...action.payload.rubric };
      if (rubric.explanation) rubric.explanation = this.sanitizer.sanitizeRichText(rubric.explanation);
      if (rubric.hint?.text) {
        rubric.hint = { ...rubric.hint, text: this.sanitizer.sanitizeRichText(rubric.hint.text) };
      }
      return { ...action, payload: { ...action.payload, rubric } };
    }

    if (action.type === 'INSERT_FIELD') {
      const field = { ...action.payload.field };
      if (DANGEROUS_KEYS.has(field.name)) {
        field.name = `field_${field.name}`;
      }
      if (field.label) {
        field.label = this.sanitizer.sanitizeRichText(field.label);
      }
      if (field.helperText) {
        field.helperText = this.sanitizer.sanitizeRichText(field.helperText);
      }
      if (field.placeholder) {
        field.placeholder = this.sanitizer.sanitizeRichText(field.placeholder);
      }
      if (Array.isArray(field.options)) {
        field.options = field.options.map((opt) => ({
          ...opt,
          label: this.sanitizer.sanitizeRichText(opt.label).replace(/<[^>]*>/g, '').trim(),
          value: DANGEROUS_KEYS.has(String(opt.value)) ? `opt_${opt.value}` : opt.value,
        }));
      }

      return {
        ...action,
        payload: {
          ...action.payload,
          field,
        },
      };
    }

    if (action.type === 'UPDATE_FIELD') {
      const updates = { ...action.payload.updates };
      if (updates.name && DANGEROUS_KEYS.has(updates.name)) {
        updates.name = `field_${updates.name}`;
      }
      if (updates.label) {
        updates.label = this.sanitizer.sanitizeRichText(updates.label);
      }
      if (updates.helperText) {
        updates.helperText = this.sanitizer.sanitizeRichText(updates.helperText);
      }
      return {
        ...action,
        payload: {
          ...action.payload,
          updates,
        },
      };
    }

    if (action.type === 'UPDATE_FORM_METADATA') {
      const payload = { ...action.payload };
      if (payload.title) {
        payload.title = this.sanitizer.sanitizeRichText(payload.title);
      }
      if (payload.description) {
        payload.description = this.sanitizer.sanitizeRichText(payload.description);
      }
      if (payload.coverImage) {
        const sanitized = this.sanitizer.sanitizeUrl(payload.coverImage);
        payload.coverImage = sanitized || undefined;
      }
      if (payload.logoUrl) {
        const sanitized = this.sanitizer.sanitizeUrl(payload.logoUrl);
        payload.logoUrl = sanitized || undefined;
      }
      return {
        ...action,
        payload,
      };
    }

    return action;
  }

  /**
   * Applies an AI proposal atomically to FormStudioStore, collapsing all sub-mutations
   * into a single undo frame.
   */
  public static applyProposal(
    store: FormStudioStore,
    proposal: AiToolActionProposal,
    options?: ApplyProposalOptions
  ): ApplyProposalResult {
    const policy = options?.staleTargetPolicy ?? 'reject-all';
    const validation = this.validateProposal(store.getState(), proposal);

    if (validation.hasStaleReferences && policy === 'reject-all') {
      return {
        success: false,
        appliedCount: 0,
        prunedCount: validation.rejectedActions.length,
        prunedDetails: validation.rejectedActions,
        error: `Proposal contains ${validation.rejectedActions.length} stale reference(s).`,
      };
    }

    const actionsToApply = validation.admissibleActions.map((act) => this.sanitizeAction(act));

    if (actionsToApply.length === 0) {
      return {
        success: true,
        appliedCount: 0,
        prunedCount: validation.rejectedActions.length,
        prunedDetails: validation.rejectedActions.length > 0 ? validation.rejectedActions : undefined,
      };
    }

    // Atomic Dispatch via BATCH_ACTIONS
    store.dispatch({
      type: 'BATCH_ACTIONS',
      payload: {
        actions: actionsToApply,
        label: proposal.rationale,
      },
    });

    return {
      success: true,
      appliedCount: actionsToApply.length,
      prunedCount: validation.rejectedActions.length,
      prunedDetails: validation.rejectedActions.length > 0 ? validation.rejectedActions : undefined,
    };
  }

  /**
   * Safely parses raw or streaming tool call text from an LLM.
   * Auto-heals minor trailing syntax truncations where salvageable.
   */
  public static parseRawToolCall(raw: string): ParseToolCallResult {
    if (!raw || typeof raw !== 'string') {
      return { success: false, action: null, error: 'Empty or non-string payload' };
    }

    const trimmed = raw.trim();
    if (!trimmed.startsWith('{')) {
      return { success: false, action: null, error: 'Malformed payload: does not start with JSON object brace' };
    }

    let parsedObj: any = null;

    // 1. Try standard JSON parse
    try {
      parsedObj = JSON.parse(trimmed);
    } catch (initialErr) {
      // 2. Attempt truncation auto-healing by balancing unclosed braces
      let candidate = trimmed;
      let healed = false;
      for (let i = 0; i < 4; i++) {
        candidate += '}';
        try {
          parsedObj = JSON.parse(candidate);
          healed = true;
          break;
        } catch {
          // continue attempting
        }
      }

      if (!healed) {
        return {
          success: false,
          action: null,
          error: `JSON parse failed on truncated stream: ${(initialErr as Error).message}`,
        };
      }
    }

    if (!parsedObj || typeof parsedObj !== 'object') {
      return { success: false, action: null, error: 'Parsed JSON is not an object' };
    }

    // Map tool object format to StudioAction
    if (parsedObj.type && typeof parsedObj.type === 'string' && parsedObj.payload) {
      return { success: true, action: parsedObj as StudioAction };
    }

    // Convenience format for tool calls: { pageId, field } -> INSERT_FIELD
    if (parsedObj.pageId && parsedObj.field) {
      return {
        success: true,
        action: {
          type: 'INSERT_FIELD',
          payload: {
            pageId: parsedObj.pageId,
            index: parsedObj.index ?? 0,
            field: parsedObj.field,
          },
        },
      };
    }

    return {
      success: false,
      action: null,
      error: 'Unrecognized action structure in tool payload',
    };
  }
}
