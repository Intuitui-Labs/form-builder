import type { FormSchema } from '@intuitui-labs/form-builder-engine';
import {
  CONSTRUCT_ORDER,
  HMSAM_CONSTRUCTS,
  HMSAM_ITEMS,
  HMSAM_SCALE_MAX,
  HMSAM_SCALE_MIN,
  hmsamItemsFor,
  type HMSAMItem,
} from '../domain/hmsam';
import { FEEDORA_FEATURES } from './seed';

/** The signed-in contributor for this showcase session. */
export const DEFAULT_USER = {
  id: 'user-2',
  displayName: 'gihinilwaid',
  avatar: '🎙️',
};

export const HMSAM_FORM_ID = 'hmsam-38';

function likertField(item: HMSAMItem, order: number) {
  return {
    id: item.field,
    name: item.field,
    type: 'likert' as const,
    label: item.prompt,
    required: true,
    order,
    min: HMSAM_SCALE_MIN,
    max: HMSAM_SCALE_MAX,
    scaleType: 'numeric' as const,
    helperText: '1 = Strongly Disagree · 5 = Strongly Agree',
  };
}

export const HMSAM_FORM_SCHEMA: FormSchema = {
  id: HMSAM_FORM_ID,
  kind: 'survey',
  accessPolicy: {
    allowRedo: false,
    maxAttempts: 1,
    rewardStrategy: 'first_attempt_only',
  },
  title: 'Hedonic System Adoption Survey',
  description:
    'The 38-item HMSAM instrument measuring perceived ease of use, usefulness, joy, curiosity, control, focused immersion and behavioural intention.',
  pages: [
    {
      id: 'welcome',
      title: 'Hedonic System Adoption Survey',
      role: 'cover',
      description:
        'Your answers help researchers understand how hedonic (enjoyment-driven) systems are adopted. Responses are collected and scored exactly the way her Django app scores them.',
      badge: 'HMSAM · 38 ITEMS',
      fields: [],
    },
    ...CONSTRUCT_ORDER.map((constructId) => {
      const construct = HMSAM_CONSTRUCTS[constructId];
      return {
        id: constructId,
        title: construct.label,
        description: `${hmsamItemsFor(constructId).length} items · ${construct.shortLabel}`,
        badge: construct.shortLabel.toUpperCase(),
        fields: [
          {
            id: `${constructId}-heading`,
            name: `${constructId}-heading`,
            type: 'heading' as const,
            label: construct.label,
            required: false,
            order: 0,
          },
          ...hmsamItemsFor(constructId).map((item, index) => likertField(item, index + 1)),
        ],
      };
    }),
  ],
  settings: {
    isPublished: true,
    category: 'research',
    slug: 'hmsam-adoption',
    showProgressBar: true,
    confirmationMessage: 'Thank you — your responses have been recorded.',
    gamification: FEEDORA_FEATURES,
  },
};

export const HMSAM_ITEM_COUNT = HMSAM_ITEMS.length;
