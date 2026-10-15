/**
 * The real Hedonic-Motivation System Adoption Model (HMSAM) instrument.
 *
 * Lifted verbatim from her Django research app:
 *   - `surveys/hmsam.py`            → the 38 items, codes and constructs
 *   - `surveys/models.py`           → HMSAM_CONSTRUCTS choices
 *   - `surveys/analytics.py`        → CONSTRUCT_ORDER / CONSTRUCT_LABELS
 *
 * Measured on a 5-point Likert scale. Unlike the v1 draft of this showcase,
 * the real instrument has NO reverse-scored items.
 */

export interface HMSAMItem {
  /** Field name on the FormSchema — her `Question.code` (e.g. "PEU1"). */
  field: string;
  code: string;
  prompt: string;
  constructId: HMSAMConstructId;
}

export interface HMSAMConstruct {
  id: HMSAMConstructId;
  label: string;
  shortLabel: string;
  color: string;
}

export type HMSAMConstructId = 'peou' | 'pu' | 'joy' | 'curiosity' | 'control' | 'fi' | 'biu';

export const HMSAM_SCALE_MIN = 1;
export const HMSAM_SCALE_MAX = 5;

/** Likert labels, exactly as her questionnaire template defines them. */
export const HMSAM_SCALE_LABELS = [
  'Strongly Disagree',
  'Disagree',
  'Neutral',
  'Agree',
  'Strongly Agree',
] as const;

export const CONSTRUCT_ORDER: HMSAMConstructId[] = [
  'joy',
  'curiosity',
  'peou',
  'pu',
  'control',
  'biu',
  'fi',
];

/** Her CONSTRUCT_LABELS, extended with a display colour for the showcase UI. */
export const HMSAM_CONSTRUCTS: Record<HMSAMConstructId, HMSAMConstruct> = {
  peou: { id: 'peou', label: 'Perceived Ease of Use', shortLabel: 'Ease', color: '#0E9F6E' },
  pu: { id: 'pu', label: 'Perceived Usefulness', shortLabel: 'Usefulness', color: '#6D28D9' },
  joy: { id: 'joy', label: 'Joy', shortLabel: 'Joy', color: '#A855F7' },
  curiosity: { id: 'curiosity', label: 'Curiosity', shortLabel: 'Curiosity', color: '#38BDF8' },
  control: { id: 'control', label: 'Control', shortLabel: 'Control', color: '#E11D48' },
  fi: { id: 'fi', label: 'Focused Immersion', shortLabel: 'Immersion', color: '#F59E0B' },
  biu: { id: 'biu', label: 'Behavioural Intention to Use', shortLabel: 'Intention', color: '#221C3A' },
};

/** (construct, code, text) — copied 1:1 from `surveys/hmsam.py` HMSAM_QUESTIONS. */
const HMSAM_QUESTIONS: [HMSAMConstructId, string, string][] = [
  ['peou', 'PEU1', 'I find it easy to learn how to use the features of this application / software.'],
  ['peou', 'PEU2', 'I find it easy to operate features of this application / software as I need.'],
  ['peou', 'PEU3', 'I find the display and instructions clear and understandable.'],
  ['peou', 'PEU4', 'I find navigation of this application / software simple.'],
  ['peou', 'PEU5', 'I find myself quickly getting used to the navigation of this app / software.'],
  ['peou', 'PEU6', 'I find features of this app / software easy to use.'],

  ['pu', 'PU1', 'I find this application / software useful for entertainment.'],
  ['pu', 'PU2', 'I find this application / software useful for relaxation.'],
  ['pu', 'PU3', 'I find this application / software provides the information I need.'],
  ['pu', 'PU4', 'I find this application / software useful in my daily life.'],
  ['pu', 'PU5', 'I find this application / software helps me spend my leisure time.'],
  ['pu', 'PU6', 'I find this application / software useful for expanding my social connections.'],

  ['joy', 'JOY1', 'I find using this application / software enjoyable.'],
  ['joy', 'JOY2', 'I find this application / software entertaining.'],
  ['joy', 'JOY3', 'I find myself truly enjoying this application / software.'],
  ['joy', 'JOY4', 'I find myself satisfied after using this application / software.'],
  ['joy', 'JOY5', 'I find the this application / software experience pleasant.'],

  ['curiosity', 'CUR1', 'I find myself curious to keep exploring this application / software.'],
  ['curiosity', 'CUR2', 'I find myself eager to discover new things through this application / software.'],
  ['curiosity', 'CUR3', 'I find myself driven to learn new things from this application / software.'],
  ['curiosity', 'CUR4', 'I find this application / software stimulates my curiosity.'],
  ['curiosity', 'CUR5', "I find myself interested in this application / software's features."],

  ['control', 'CTR1', 'I find I am free to use this application / software as per my free will without being influenced by other forces.'],
  ['control', 'CTR2', "I find I can manage my time whenever I'm using this application / software."],
  ['control', 'CTR3', 'I find I have full control over how I use this application / software.'],
  ['control', 'CTR4', 'I find I can manage my interactions while using this application / software.'],
  ['control', 'CTR5', 'I find I can use this application / software according to my own preferences.'],

  ['fi', 'IMM1', 'I find myself fully focused when using this application / software.'],
  ['fi', 'IMM2', 'I find myself absorbed when using this application / software.'],
  ['fi', 'IMM3', 'I find myself losing track of time while using this application / software.'],
  ['fi', 'IMM4', 'I find myself feeling present in this application / software.'],
  ['fi', 'IMM5', 'I find my full attention absorbed in this application / software.'],
  ['fi', 'IMM6', 'I find this application / software usage makes me immersed.'],

  ['biu', 'BIU1', 'I intend to keep using this application / software.'],
  ['biu', 'BIU2', 'I plan to use this application / software more often.'],
  ['biu', 'BIU3', 'I want to continue using this application / software long-term.'],
  ['biu', 'BIU4', 'I want to recommend this application / software to others.'],
  ['biu', 'BIU5', 'I want to make this application / software usage a habit.'],
];

export const HMSAM_ITEMS: HMSAMItem[] = HMSAM_QUESTIONS.map(([constructId, code, prompt]) => ({
  field: code,
  code,
  prompt,
  constructId,
}));

export function hmsamItemsFor(constructId: HMSAMConstructId): HMSAMItem[] {
  return HMSAM_ITEMS.filter((item) => item.constructId === constructId);
}

export const HMSAM_CONSTRUCT_LIST: HMSAMConstruct[] = CONSTRUCT_ORDER.map((id) => HMSAM_CONSTRUCTS[id]);
