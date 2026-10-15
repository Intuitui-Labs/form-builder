export type EvaluationTiming = 'instant' | 'deferred';

export type PartialCreditStrategy =
  | 'all-or-nothing'
  | 'jaccard'
  | 'proportional-with-penalty';

export type RubricKind =
  | 'single-choice'
  | 'multiple-choice'
  | 'numeric-range'
  | 'text-match'
  | 'boolean';

export interface SaltedHash {
  hash: string;
  salt: string;
  algorithm?: 'fnv1a32' | 'sha256';
}

export interface RubricHint {
  text: string;
  /** Percentage penalty deducted from max points if hint is used (0-100) */
  penaltyPercent: number;
}

export interface BaseQuestionRubric {
  /** Maximum points awarded for full correctness */
  points: number;
  /** Optional penalty deducted for incorrect answer (negative marking) */
  negativePoints?: number;
  /** Explanation revealed upon answer in instant mode, or post-submission */
  explanation?: string;
  /** Optional hint available before answering */
  hint?: RubricHint;
  /** Optional penalty percentage deducted per retry attempt (0-100) */
  penaltyPerRetryPercent?: number;
  /** Optional knowledge domain / skill taxonomy tags (e.g. ['algebra', 'derivatives']) */
  tags?: string[];
}

export interface SingleChoiceRubric extends BaseQuestionRubric {
  kind: 'single-choice';
  /** Expected value or salted hash for anti-tampering */
  correctValue: string | SaltedHash;
}

export interface MultipleChoiceRubric extends BaseQuestionRubric {
  kind: 'multiple-choice';
  /** List of expected values or salted hashes */
  correctValues: (string | SaltedHash)[];
  /** Strategy for assigning partial credit */
  partialCreditStrategy: PartialCreditStrategy;
  /** Total count of all available options (used in proportional penalty calculation) */
  totalOptionsCount?: number;
}

export interface NumericRangeRubric extends BaseQuestionRubric {
  kind: 'numeric-range';
  targetValue: number;
  /** Acceptable margin of error (±tolerance) */
  tolerance: number;
  /** Whether tolerance bounds are inclusive (default true) */
  inclusive?: boolean;
}

export interface TextMatchRubric extends BaseQuestionRubric {
  kind: 'text-match';
  /** List of canonical acceptable answers */
  acceptableAnswers: string[];
  caseSensitive?: boolean;
  trimWhitespace?: boolean;
  ignorePunctuation?: boolean;
  /** Optional regex pattern for formulaic or formatted inputs */
  regexPattern?: string;
}

export interface BooleanRubric extends BaseQuestionRubric {
  kind: 'boolean';
  correctValue: boolean;
}

export type QuestionRubric =
  | SingleChoiceRubric
  | MultipleChoiceRubric
  | NumericRangeRubric
  | TextMatchRubric
  | BooleanRubric;

export interface AssessmentSchemaConfig {
  /**
   * 'instant': Telegram/Duolingo style - evaluate and reveal tactile feedback on choice tap
   * 'deferred': Moodle/QTI exam style - record silently, evaluate upon final submission
   */
  timing: EvaluationTiming;
  /** Minimum total score required to achieve passing status */
  passingScore?: number;
  /** Minimum score percentage (0-100) required to pass */
  passingPercent?: number;
  /** Speed round countdown timer per step/question in seconds */
  stepTimerSeconds?: number;
  /** Global examination countdown timer in seconds */
  globalTimerSeconds?: number;
  /** Max retries allowed per question (default: 1 in exam mode, unlimited or N in practice) */
  maxAttemptsPerQuestion?: number;
  /** Whether question choices should be randomized per attempt */
  shuffleOptions?: boolean;
  /** Whether questions in a page should be randomized */
  shuffleQuestions?: boolean;
  /** PRNG seed for deterministic randomization (e.g. user ID or session ID) */
  seed?: number | string;
  /** Telegram speed bonus window in seconds (answering within this window awards bonus points) */
  speedBonusWindowSeconds?: number;
  /** Telegram speed bonus maximum percent awarded (0-100, e.g. 50 for up to 50% extra points) */
  speedBonusMaxPercent?: number;
  /** Whether streak multiplier is enabled (consecutive correct answers award bonus multipliers) */
  streakBonusEnabled?: boolean;
  /** Moodle-style score floor: prevent negative total scores if negative marking is severe (default true) */
  floorScoreToZero?: boolean;
  /** Default tags for the whole assessment */
  tags?: string[];
}

export interface QuestionEvaluation {
  fieldId: string;
  isCorrect: boolean;
  score: number;
  maxPoints: number;
  negativePenalty: number;
  speedBonus?: number;
  partialCreditRatio: number; // 0..1
  attemptsUsed: number;
  hintUsed: boolean;
  explanation?: string;
  answeredAt: string;
  latencyMs?: number;
  userAnswer: unknown;
}

export interface CategoryScoreSummary {
  tag: string;
  score: number;
  maxPoints: number;
  percent: number;
  questionsCount: number;
  correctCount: number;
}

export interface ProctoringEvent {
  type:
    | 'app-blur'
    | 'app-focus'
    | 'tab-change'
    | 'timer-expired'
    | 'suspicious-speed'
    | 'hint-requested'
    | 'retry-attempted';
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface AssessmentState {
  evaluations: Record<string, QuestionEvaluation>;
  totalScore: number;
  maxPossibleScore: number;
  scorePercent: number;
  isPassing: boolean;
  categoryScores: Record<string, CategoryScoreSummary>;
  globalTimerRemainingSeconds?: number;
  stepTimerRemainingSeconds?: number;
  isGlobalExpired: boolean;
  isStepExpired: boolean;
  proctoringEvents: ProctoringEvent[];
  /** Telegram speed quiz streak: consecutive correct answers */
  currentStreak: number;
  /** Highest streak achieved during this session */
  maxStreak: number;
  /** Active streak multiplier applied to points (e.g. 1.0, 1.2, 1.5) */
  streakMultiplier: number;
  /** Running Bayesian/exponential mastery vector by topic tag [0-100] */
  tagMastery: Record<string, number>;
  /** Deterministically shuffled order of questions per page (pageId -> fieldNames) */
  shuffledQuestionOrder?: Record<string, string[]>;
  /** Deterministically shuffled order of options per field (fieldName -> optionValues) */
  shuffledOptionOrder?: Record<string, string[]>;
}
