import type {
  FieldDefinition,
  FormField,
  FormPage,
  FormSchema,
} from '../schema/FormSchema.js';
import type { PageJumpRule } from '../schema/FormBranching.js';
import type { FormAffordanceConfig } from '../schema/FormAffordance.js';
import type { AssessmentSchemaConfig, QuestionRubric } from '../assessment/types.js';
import { lintFormSchema, type SchemaLintResult } from '../lint/index.js';
import type {
  StudioAction,
  StudioHistory,
  StudioState,
  StudioViewMode,
} from './types.js';

/**
 * Deep clones a schema object to maintain immutability and transactional safety.
 */
function cloneSchema(schema: FormSchema): FormSchema {
  return JSON.parse(JSON.stringify(schema));
}

/**
 * Creates an empty starter schema if none is provided.
 */
export function createDefaultStudioSchema(title = 'Untitled Form'): FormSchema {
  const initialPageId = 'page-1';
  return {
    id: `form-${Date.now().toString(36)}`,
    title,
    description: '',
    pages: [
      {
        id: initialPageId,
        title: 'Step 1',
        description: '',
        fields: [],
      },
    ],
    settings: {
      isPublished: false,
      showProgressBar: true,
      collectEmail: false,
      confirmationMessage: 'Thank you! Your response has been recorded.',
      themeColor: '#6366f1',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Headless Studio Reducer handling all AST mutations, navigation, and sheet states.
 */
export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case 'SET_SCHEMA': {
      const newSchema = cloneSchema(action.payload);
      const firstPage = newSchema.pages[0];
      return {
        ...state,
        schema: newSchema,
        activePageId: firstPage ? firstPage.id : '',
        selectedFieldId: null,
        lintResult: lintFormSchema(newSchema),
        isDirty: false,
      };
    }

    case 'SET_ACTIVE_PAGE': {
      const pageExists = state.schema.pages.some((p) => p.id === action.payload.pageId);
      if (!pageExists) return state;
      return {
        ...state,
        activePageId: action.payload.pageId,
        selectedFieldId: null,
      };
    }

    case 'SELECT_FIELD': {
      return {
        ...state,
        selectedFieldId: action.payload.fieldId,
      };
    }

    case 'OPEN_SHEET': {
      return {
        ...state,
        activeSheet: action.payload.sheet,
        selectedFieldId: action.payload.fieldId ?? state.selectedFieldId,
      };
    }

    case 'CLOSE_SHEET': {
      return {
        ...state,
        activeSheet: null,
      };
    }

    case 'SET_MODE': {
      return {
        ...state,
        mode: action.payload.mode,
        activeSheet: null,
      };
    }

    case 'INSERT_FIELD': {
      const { pageId, index, field } = action.payload;
      const schema = cloneSchema(state.schema);
      const page = schema.pages.find((p) => p.id === pageId);
      if (!page) return state;

      const newField: FormField = {
        id: field.id || `f-${Date.now().toString(36)}`,
        name: field.name || `field_${Date.now().toString(36)}`,
        type: field.type,
        label: field.label ?? 'New Question',
        required: field.required ?? false,
        placeholder: field.placeholder,
        helperText: field.helperText,
        semanticIntent: field.semanticIntent,
        privacyRationale: field.privacyRationale,
        order: index,
        options: field.options,
        rules: field.rules,
        config: field.config,
        rubric: field.rubric,
      };


      const clampedIndex = Math.max(0, Math.min(index, page.fields.length));
      page.fields.splice(clampedIndex, 0, newField);
      // Re-normalize order
      page.fields.forEach((f, idx) => {
        f.order = idx;
      });

      schema.updatedAt = new Date().toISOString();
      return commitSchemaMutation(state, schema);
    }

    case 'REMOVE_FIELD': {
      const { pageId, fieldId } = action.payload;
      const schema = cloneSchema(state.schema);
      const page = schema.pages.find((p) => p.id === pageId);
      if (!page) return state;

      const initialLength = page.fields.length;
      page.fields = page.fields.filter((f) => f.id !== fieldId);
      if (page.fields.length === initialLength) return state;

      // Re-normalize order
      page.fields.forEach((f, idx) => {
        f.order = idx;
      });

      schema.updatedAt = new Date().toISOString();
      const nextState = commitSchemaMutation(state, schema);
      return {
        ...nextState,
        selectedFieldId: state.selectedFieldId === fieldId ? null : state.selectedFieldId,
      };
    }

    case 'REORDER_FIELDS': {
      const { pageId, fromIndex, toIndex } = action.payload;
      if (fromIndex === toIndex || Number.isNaN(fromIndex) || Number.isNaN(toIndex)) return state;

      const schema = cloneSchema(state.schema);
      const page = schema.pages.find((p) => p.id === pageId);
      if (!page) return state;

      const fields = [...page.fields];
      if (fromIndex < 0 || fromIndex >= fields.length) return state;
      const clampedTo = Math.max(0, Math.min(toIndex, fields.length - 1));

      const [movedItem] = fields.splice(fromIndex, 1);
      if (!movedItem) return state;
      fields.splice(clampedTo, 0, movedItem);

      fields.forEach((f, idx) => {
        f.order = idx;
      });
      page.fields = fields;

      schema.updatedAt = new Date().toISOString();
      return commitSchemaMutation(state, schema);
    }

    case 'UPDATE_FIELD': {
      const { pageId, fieldId, updates } = action.payload;
      const schema = cloneSchema(state.schema);
      const page = schema.pages.find((p) => p.id === pageId);
      if (!page) return state;

      const field = page.fields.find((f) => f.id === fieldId);
      if (!field) return state;

      Object.assign(field, updates);
      schema.updatedAt = new Date().toISOString();
      return commitSchemaMutation(state, schema);
    }

    case 'SET_FIELD_RUBRIC': {
      const { fieldId, rubric } = action.payload;
      const schema = cloneSchema(state.schema);
      let found = false;

      for (const page of schema.pages) {
        const field = page.fields.find((f) => f.id === fieldId);
        if (field) {
          (field as FormField & { rubric?: QuestionRubric }).rubric = rubric;
          found = true;
          break;
        }
      }

      if (!found) return state;
      schema.updatedAt = new Date().toISOString();
      return commitSchemaMutation(state, schema);
    }

    case 'ADD_PAGE': {
      const schema = cloneSchema(state.schema);
      const newPageId = `page-${schema.pages.length + 1}-${Date.now().toString(36)}`;
      const newPage: FormPage = {
        id: newPageId,
        title: action.payload.title ?? `Step ${schema.pages.length + 1}`,
        description: action.payload.description,
        fields: [],
      };

      schema.pages.push(newPage);
      schema.updatedAt = new Date().toISOString();
      const nextState = commitSchemaMutation(state, schema);
      return {
        ...nextState,
        activePageId: newPageId,
      };
    }

    case 'REMOVE_PAGE': {
      const { pageId } = action.payload;
      if (state.schema.pages.length <= 1) {
        // Enforce invariant: schema must have at least one page
        return state;
      }

      const schema = cloneSchema(state.schema);
      const remainingPages = schema.pages.filter((p) => p.id !== pageId);
      if (remainingPages.length === 0) {
        return state;
      }
      schema.pages = remainingPages;

      // Clean up dangling jump rules pointing to the deleted page
      for (const p of schema.pages) {
        if (p.jumpRules) {
          p.jumpRules = p.jumpRules.filter((r) => r.targetPageId !== pageId);
        }
      }

      schema.updatedAt = new Date().toISOString();

      const nextActiveId =
        state.activePageId === pageId ? schema.pages[0]?.id ?? '' : state.activePageId;

      const nextState = commitSchemaMutation(state, schema);
      return {
        ...nextState,
        activePageId: nextActiveId,
        selectedFieldId: null,
      };
    }

    case 'REORDER_PAGES': {
      const { fromIndex, toIndex } = action.payload;
      if (fromIndex === toIndex || Number.isNaN(fromIndex) || Number.isNaN(toIndex)) return state;

      const schema = cloneSchema(state.schema);
      const pages = [...schema.pages];
      if (fromIndex < 0 || fromIndex >= pages.length) return state;
      const clampedTo = Math.max(0, Math.min(toIndex, pages.length - 1));

      const [movedPage] = pages.splice(fromIndex, 1);
      if (!movedPage) return state;
      pages.splice(clampedTo, 0, movedPage);

      schema.pages = pages;
      schema.updatedAt = new Date().toISOString();
      return commitSchemaMutation(state, schema);
    }

    case 'UPDATE_PAGE': {
      const { pageId, updates } = action.payload;
      const schema = cloneSchema(state.schema);
      const page = schema.pages.find((p) => p.id === pageId);
      if (!page) return state;

      Object.assign(page, updates);
      schema.updatedAt = new Date().toISOString();
      return commitSchemaMutation(state, schema);
    }

    case 'UPDATE_FORM_METADATA': {
      const { title, description, coverImage, logoUrl, themeColor } = action.payload;
      const schema = cloneSchema(state.schema);
      if (title !== undefined) schema.title = title;
      if (description !== undefined) schema.description = description;
      if (coverImage !== undefined) {
        schema.coverImage = coverImage;
        schema.settings = schema.settings || {};
        schema.settings.coverImage = coverImage;
      }
      if (logoUrl !== undefined || themeColor !== undefined) {
        schema.settings = schema.settings || {};
        if (logoUrl !== undefined) schema.settings.logoUrl = logoUrl;
        if (themeColor !== undefined) schema.settings.themeColor = themeColor;
      }
      schema.updatedAt = new Date().toISOString();
      return commitSchemaMutation(state, schema);
    }

    case 'UPDATE_FORM_SETTINGS': {
      const schema = cloneSchema(state.schema);
      schema.settings = {
        ...schema.settings,
        ...action.payload,
      };
      schema.updatedAt = new Date().toISOString();
      return commitSchemaMutation(state, schema);
    }

    case 'ADD_JUMP_RULE': {
      const { pageId, rule } = action.payload;
      const schema = cloneSchema(state.schema);
      const page = schema.pages.find((p) => p.id === pageId);
      if (!page) return state;

      page.jumpRules = page.jumpRules ? [...page.jumpRules, rule] : [rule];
      schema.updatedAt = new Date().toISOString();
      return commitSchemaMutation(state, schema);
    }

    case 'REMOVE_JUMP_RULE': {
      const { pageId, ruleIndex } = action.payload;
      const schema = cloneSchema(state.schema);
      const page = schema.pages.find((p) => p.id === pageId);
      if (!page || !page.jumpRules) return state;

      page.jumpRules = page.jumpRules.filter((_, idx) => idx !== ruleIndex);
      schema.updatedAt = new Date().toISOString();
      return commitSchemaMutation(state, schema);
    }

    case 'UPDATE_REWARD_CONFIG': {
      const schema = cloneSchema(state.schema);
      schema.affordanceConfig = {
        ...schema.affordanceConfig,
        ...action.payload.config,
      };
      schema.updatedAt = new Date().toISOString();
      return commitSchemaMutation(state, schema);
    }

    case 'UPDATE_ASSESSMENT_CONFIG': {
      const schema = cloneSchema(state.schema);
      const current = (schema as FormSchema & { assessment?: AssessmentSchemaConfig }).assessment;
      (schema as FormSchema & { assessment?: AssessmentSchemaConfig }).assessment = {
        timing: current?.timing ?? 'instant',
        ...current,
        ...action.payload.config,
      };
      schema.updatedAt = new Date().toISOString();
      return commitSchemaMutation(state, schema);
    }

    case 'BATCH_ACTIONS': {
      const { actions } = action.payload;
      if (!actions || actions.length === 0) return state;

      const priorSchema = cloneSchema(state.schema);
      let currentState = state;

      for (const subAction of actions) {
        if (
          subAction.type === 'BATCH_ACTIONS' ||
          subAction.type === 'UNDO' ||
          subAction.type === 'REDO'
        ) {
          continue;
        }
        currentState = studioReducer(currentState, subAction);
      }

      if (currentState.schema !== state.schema) {
        const past = [...state.history.past, priorSchema];
        if (past.length > state.history.maxDepth) {
          past.shift();
        }

        return {
          ...currentState,
          lintResult: lintFormSchema(currentState.schema),
          history: {
            ...currentState.history,
            past,
            future: [],
          },
          isDirty: true,
        };
      }

      return currentState;
    }

    case 'UNDO': {
      if (state.history.past.length === 0) return state;
      const previousSchema = state.history.past[state.history.past.length - 1];
      if (!previousSchema) return state;

      const newPast = state.history.past.slice(0, -1);
      const newFuture = [cloneSchema(state.schema), ...state.history.future];

      // Ensure active page still exists in the reverted schema
      const activeExists = previousSchema.pages.some((p) => p.id === state.activePageId);
      const activePageId = activeExists ? state.activePageId : previousSchema.pages[0]?.id ?? '';

      return {
        ...state,
        schema: cloneSchema(previousSchema),
        activePageId,
        selectedFieldId: null,
        lintResult: lintFormSchema(previousSchema),
        history: {
          ...state.history,
          past: newPast,
          future: newFuture,
        },
        isDirty: true,
      };
    }

    case 'REDO': {
      if (state.history.future.length === 0) return state;
      const nextSchema = state.history.future[0];
      if (!nextSchema) return state;

      const newFuture = state.history.future.slice(1);
      const newPast = [...state.history.past, cloneSchema(state.schema)];

      const activeExists = nextSchema.pages.some((p) => p.id === state.activePageId);
      const activePageId = activeExists ? state.activePageId : nextSchema.pages[0]?.id ?? '';

      return {
        ...state,
        schema: cloneSchema(nextSchema),
        activePageId,
        selectedFieldId: null,
        lintResult: lintFormSchema(nextSchema),
        history: {
          ...state.history,
          past: newPast,
          future: newFuture,
        },
        isDirty: true,
      };
    }

    case 'RESET_DIRTY': {
      return {
        ...state,
        isDirty: false,
      };
    }

    default:
      return state;
  }
}

/**
 * Commits a mutation by recording the prior state to the bounded undo history stack.
 */
function commitSchemaMutation(currentState: StudioState, nextSchema: FormSchema): StudioState {
  const past = [...currentState.history.past, cloneSchema(currentState.schema)];
  if (past.length > currentState.history.maxDepth) {
    past.shift();
  }

  return {
    ...currentState,
    schema: nextSchema,
    lintResult: lintFormSchema(nextSchema),
    history: {
      ...currentState.history,
      past,
      future: [], // Clear redo history on new mutation
    },
    isDirty: true,
  };
}

/**
 * Headless Studio Store managing the state, subscriptions, and dispatching.
 */
export class FormStudioStore {
  private state: StudioState;
  private listeners: Set<(state: StudioState) => void> = new Set();

  constructor(initialSchema?: FormSchema, maxHistoryDepth = 30) {
    const schema = initialSchema ? cloneSchema(initialSchema) : createDefaultStudioSchema();
    const firstPage = schema.pages[0];

    this.state = {
      schema,
      activePageId: firstPage ? firstPage.id : '',
      selectedFieldId: null,
      activeSheet: null,
      mode: 'edit',
      lintResult: lintFormSchema(schema),
      history: {
        past: [],
        future: [],
        maxDepth: maxHistoryDepth,
      },
      isDirty: false,
    };
  }

  public getState(): Readonly<StudioState> {
    return this.state;
  }

  public dispatch(action: StudioAction): void {
    const nextState = studioReducer(this.state, action);
    if (nextState !== this.state) {
      this.state = nextState;
      this.notify();
    }
  }

  public subscribe(listener: (state: StudioState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public toFormSchema(): FormSchema {
    return cloneSchema(this.state.schema);
  }

  public canUndo(): boolean {
    return this.state.history.past.length > 0;
  }

  public canRedo(): boolean {
    return this.state.history.future.length > 0;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('Error in FormStudioStore listener:', err);
      }
    }
  }
}

export type StudioPlatformTarget = 'web' | 'mobile' | 'node';

/**
 * Returns recommended history depth based on runtime memory budgets:
 * - Mobile: 15 frames (protects constrained native memory and bridge performance)
 * - Web / Desktop: 50 frames (spacious memory capacity for complex sessions)
 * - Default / Node: 30 frames
 */
export function getDefaultHistoryDepth(platform?: StudioPlatformTarget): number {
  if (platform === 'mobile') return 15;
  if (platform === 'web') return 50;
  return 30;
}

/**
 * Factory for creating a new studio store.
 * Accepts either an explicit max history depth number or a platform target string ('web' | 'mobile' | 'node').
 */
export function createFormStudioStore(
  initialSchema?: FormSchema,
  historyOption: number | StudioPlatformTarget = 30
): FormStudioStore {
  const maxHistoryDepth = typeof historyOption === 'number' ? historyOption : getDefaultHistoryDepth(historyOption);
  return new FormStudioStore(initialSchema, maxHistoryDepth);
}
