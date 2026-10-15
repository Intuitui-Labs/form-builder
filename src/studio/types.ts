import type {
  FieldDefinition,
  FormField,
  FormPage,
  FormSchema,
} from '../schema/FormSchema.js';
import type { PageJumpRule } from '../schema/FormBranching.js';
import type { FormAffordanceConfig } from '../schema/FormAffordance.js';
import type { AssessmentSchemaConfig, QuestionRubric } from '../assessment/types.js';
import type { SchemaLintResult } from '../lint/index.js';

export type StudioSheetType =
  | 'palette'
  | 'field-edit'
  | 'rubric'
  | 'branching'
  | 'rewards'
  | 'settings';

export type StudioViewMode = 'edit' | 'preview';

export interface StudioHistory {
  past: FormSchema[];
  future: FormSchema[];
  maxDepth: number;
}

export interface StudioState {
  /** The root serializable form schema under construction */
  schema: FormSchema;
  /** Active page being edited or viewed */
  activePageId: string;
  /** Field currently selected for editing/inspecting */
  selectedFieldId: string | null;
  /** Currently open modal bottom sheet, or null if none */
  activeSheet: StudioSheetType | null;
  /** Studio view mode: visual canvas editing vs interactive test drive */
  mode: StudioViewMode;
  /** Cached linting diagnostics for real-time validation */
  lintResult: SchemaLintResult;
  /** Undo/Redo transaction stack */
  history: StudioHistory;
  /** Dirty flag indicating unsaved modifications */
  isDirty: boolean;
}

export type StudioAction =
  | { type: 'SET_SCHEMA'; payload: FormSchema }
  | { type: 'SET_ACTIVE_PAGE'; payload: { pageId: string } }
  | { type: 'SELECT_FIELD'; payload: { fieldId: string | null } }
  | { type: 'OPEN_SHEET'; payload: { sheet: StudioSheetType; fieldId?: string } }
  | { type: 'CLOSE_SHEET' }
  | { type: 'SET_MODE'; payload: { mode: StudioViewMode } }
  | { type: 'INSERT_FIELD'; payload: { pageId: string; index: number; field: FieldDefinition } }
  | { type: 'REMOVE_FIELD'; payload: { pageId: string; fieldId: string } }
  | { type: 'REORDER_FIELDS'; payload: { pageId: string; fromIndex: number; toIndex: number } }
  | { type: 'UPDATE_FIELD'; payload: { pageId: string; fieldId: string; updates: Partial<FieldDefinition> } }
  | { type: 'SET_FIELD_RUBRIC'; payload: { fieldId: string; rubric: QuestionRubric | undefined } }
  | { type: 'ADD_PAGE'; payload: { title?: string; description?: string } }
  | { type: 'REMOVE_PAGE'; payload: { pageId: string } }
  | { type: 'REORDER_PAGES'; payload: { fromIndex: number; toIndex: number } }
  | { type: 'UPDATE_PAGE'; payload: { pageId: string; updates: Partial<FormPage> } }
  | {
      type: 'UPDATE_FORM_METADATA';
      payload: {
        title?: string;
        description?: string;
        coverImage?: string;
        logoUrl?: string;
        themeColor?: string;
      };
    }
  | {
      type: 'UPDATE_FORM_SETTINGS';
      payload: {
        collectEmail?: boolean;
        showProgressBar?: boolean;
        confirmationMessage?: string;
        isPublished?: boolean;
        [key: string]: unknown;
      };
    }
  | { type: 'ADD_JUMP_RULE'; payload: { pageId: string; rule: PageJumpRule } }
  | { type: 'REMOVE_JUMP_RULE'; payload: { pageId: string; ruleIndex: number } }
  | { type: 'UPDATE_REWARD_CONFIG'; payload: { config: Partial<FormAffordanceConfig> } }
  | { type: 'UPDATE_ASSESSMENT_CONFIG'; payload: { config: Partial<AssessmentSchemaConfig> } }
  | { type: 'BATCH_ACTIONS'; payload: { actions: StudioAction[]; label?: string } }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET_DIRTY' };

