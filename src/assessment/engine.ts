import type { IHapticFeedbackPort } from '../ports/IHapticFeedbackPort.js';
import type { IAssessmentPort } from '../ports/IAssessmentPort.js';
import type { FormSchema } from '../schema/FormSchema.js';
import { RubricEvaluator } from './evaluator.js';
import { CadenceTimerController } from './timer.js';
import { AssessmentHapticDriver } from './haptics.js';
import { ScoreConditionEvaluator, type ScoreCondition } from './branching.js';
import type {
  QuestionRubric,
  AssessmentSchemaConfig,
  AssessmentState,
  QuestionEvaluation,
  CategoryScoreSummary,
  ProctoringEvent,
} from './types.js';

import type { AssessmentHapticOptions } from './haptics.js';

export interface AssessmentEngineOptions {
  hapticPort?: IHapticFeedbackPort;
  hapticOptions?: AssessmentHapticOptions;
  onStateChange?: (state: AssessmentState) => void;
  onExpired?: (type: 'step' | 'global') => void;
}

export class Mulberry32PRNG {
  private state: number;

  constructor(seed: number | string = 1337) {
    if (typeof seed === 'string') {
      let h = 0x811c9dc5;
      for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      this.state = h >>> 0;
    } else {
      this.state = seed >>> 0;
    }
  }

  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public shuffle<U>(array: U[]): U[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

export class AssessmentEngine implements IAssessmentPort {
  private readonly rubrics: Map<string, QuestionRubric>;
  private readonly config: AssessmentSchemaConfig;
  private readonly hapticDriver: AssessmentHapticDriver;
  private readonly timerController: CadenceTimerController;
  private readonly prng: Mulberry32PRNG;

  private evaluations: Record<string, QuestionEvaluation> = {};
  private attempts: Record<string, number> = {};
  private hintUsage: Record<string, boolean> = {};
  private rawAnswers: Record<string, unknown> = {};
  private proctoringLog: ProctoringEvent[] = [];

  private currentStreak = 0;
  private maxStreak = 0;
  private streakMultiplier = 1.0;

  private shuffledQuestionCache: Record<string, string[]> = {};
  private shuffledOptionCache: Record<string, string[]> = {};

  private isGlobalExpired = false;
  private isStepExpired = false;

  private subscribers: Set<(state: AssessmentState) => void> = new Set();
  private readonly onExpiredCallback?: (type: 'step' | 'global') => void;

  constructor(
    rubricsOrConfig:
      | Record<string, QuestionRubric>
      | Map<string, QuestionRubric>
      | AssessmentSchemaConfig,
    configOrOptions?: AssessmentSchemaConfig | AssessmentEngineOptions,
    options?: AssessmentEngineOptions
  ) {
    let resolvedRubrics: Map<string, QuestionRubric>;
    let resolvedConfig: AssessmentSchemaConfig;
    let resolvedOptions: AssessmentEngineOptions = {};

    const isConfig =
      typeof (rubricsOrConfig as AssessmentSchemaConfig).timing === 'string';

    if (isConfig) {
      resolvedRubrics = new Map();
      resolvedConfig = rubricsOrConfig as AssessmentSchemaConfig;
      resolvedOptions = (configOrOptions as AssessmentEngineOptions) ?? {};
    } else {
      resolvedRubrics =
        rubricsOrConfig instanceof Map
          ? rubricsOrConfig
          : new Map(Object.entries(rubricsOrConfig as Record<string, QuestionRubric>));
      resolvedConfig = (configOrOptions as AssessmentSchemaConfig) ?? { timing: 'instant' };
      resolvedOptions = options ?? {};
    }

    this.rubrics = resolvedRubrics;
    this.config = resolvedConfig;
    this.prng = new Mulberry32PRNG(this.config.seed ?? 1337);
    this.hapticDriver = new AssessmentHapticDriver(resolvedOptions.hapticPort, resolvedOptions.hapticOptions);
    this.onExpiredCallback = resolvedOptions.onExpired;

    if (resolvedOptions.onStateChange) {
      this.subscribers.add(resolvedOptions.onStateChange);
    }

    this.timerController = new CadenceTimerController({
      onStepTick: () => this.notifySubscribers(),
      onGlobalTick: () => this.notifySubscribers(),
      onStepWarning: () => this.hapticDriver.onTimerWarning(),
      onGlobalWarning: () => this.hapticDriver.onTimerWarning(),
      onStepExpired: () => {
        this.isStepExpired = true;
        this.recordProctoring('timer-expired', { scope: 'step' });
        this.onExpiredCallback?.('step');
        this.notifySubscribers();
      },
      onGlobalExpired: () => {
        this.isGlobalExpired = true;
        this.recordProctoring('timer-expired', { scope: 'global' });
        this.onExpiredCallback?.('global');
        this.notifySubscribers();
      },
    });

    if (this.config.globalTimerSeconds) {
      this.timerController.startGlobalTimer(this.config.globalTimerSeconds);
    }
  }

  public getRubric(fieldId: string): QuestionRubric | undefined {
    return this.rubrics.get(fieldId);
  }

  public registerRubric(fieldId: string, rubric: QuestionRubric): void {
    this.rubrics.set(fieldId, rubric);
  }

  public getConfig(): AssessmentSchemaConfig {
    return this.config;
  }

  /**
   * Submit or update an answer for a specific question.
   */
  public submitAnswer(
    fieldId: string,
    value: unknown,
    options: { latencyMs?: number } = {}
  ): QuestionEvaluation | undefined {
    this.rawAnswers[fieldId] = value;
    const rubric = this.rubrics.get(fieldId);
    if (!rubric) return undefined;

    // Check attempt budget
    const currentAttempts = (this.attempts[fieldId] ?? 0) + 1;
    const maxAttempts = this.config.maxAttemptsPerQuestion;
    if (maxAttempts !== undefined && currentAttempts > maxAttempts) {
      return this.evaluations[fieldId];
    }
    this.attempts[fieldId] = currentAttempts;

    if (currentAttempts > 1) {
      this.recordProctoring('retry-attempted', { fieldId, attempt: currentAttempts });
    }

    const isHintUsed = Boolean(this.hintUsage[fieldId]);

    // Check latency anomaly (< 100ms on human cognitive questions)
    if (options.latencyMs !== undefined && options.latencyMs < 100) {
      this.recordProctoring('suspicious-speed', { fieldId, latencyMs: options.latencyMs });
    }

    // Evaluate
    const evaluation = RubricEvaluator.evaluate(fieldId, rubric, value, {
      attemptsUsed: currentAttempts,
      hintUsed: isHintUsed,
      latencyMs: options.latencyMs,
    });

    // Real Telegram & Moodle Mechanics: Streak and Speed Bonus
    if (evaluation.isCorrect) {
      this.currentStreak++;
      if (this.currentStreak > this.maxStreak) {
        this.maxStreak = this.currentStreak;
      }
      if (this.config.streakBonusEnabled !== false) {
        if (this.currentStreak >= 5) {
          this.streakMultiplier = 1.5;
        } else if (this.currentStreak >= 3) {
          this.streakMultiplier = 1.2;
        } else {
          this.streakMultiplier = 1.0;
        }
      }

      // Telegram speed bonus
      if (this.config.speedBonusWindowSeconds && options.latencyMs !== undefined) {
        const windowMs = this.config.speedBonusWindowSeconds * 1000;
        if (options.latencyMs < windowMs) {
          const maxPercent = this.config.speedBonusMaxPercent ?? 50;
          const speedRatio = Math.max(0, (windowMs - options.latencyMs) / windowMs);
          const bonus = Math.round(evaluation.score * (maxPercent / 100) * speedRatio * 100) / 100;
          evaluation.speedBonus = bonus;
          evaluation.score = Math.round((evaluation.score + bonus) * 100) / 100;
        }
      }

      // Apply streak multiplier
      if (this.streakMultiplier > 1.0) {
        evaluation.score = Math.round(evaluation.score * this.streakMultiplier * 100) / 100;
      }
    } else {
      this.currentStreak = 0;
      this.streakMultiplier = 1.0;
    }

    this.evaluations[fieldId] = evaluation;

    // Trigger haptics in instant mode
    if (this.config.timing === 'instant') {
      if (evaluation.isCorrect) {
        this.hapticDriver.onCorrectAnswer();
      } else {
        this.hapticDriver.onIncorrectAnswer();
      }
    }

    this.notifySubscribers();
    return evaluation;
  }

  /**
   * Request a hint for a given field
   */
  public requestHint(fieldId: string): string | undefined {
    const rubric = this.rubrics.get(fieldId);
    if (!rubric || !rubric.hint) return undefined;

    this.hintUsage[fieldId] = true;
    this.recordProctoring('hint-requested', {
      fieldId,
      penaltyPercent: rubric.hint.penaltyPercent,
    });
    this.notifySubscribers();
    return rubric.hint.text;
  }

  /**
   * Grade all answered questions in batch (typically for deferred exam mode)
   */
  public gradeAll(values: Record<string, unknown>): Record<string, QuestionEvaluation> {
    for (const [fieldId, rubric] of this.rubrics.entries()) {
      const val = values[fieldId];
      const attempts = Math.max(1, this.attempts[fieldId] ?? 1);
      const isHintUsed = Boolean(this.hintUsage[fieldId]);

      const evalResult = RubricEvaluator.evaluate(fieldId, rubric, val, {
        attemptsUsed: attempts,
        hintUsed: isHintUsed,
      });
      this.evaluations[fieldId] = evalResult;
    }

    this.notifySubscribers();
    return { ...this.evaluations };
  }

  /**
   * Start or restart the speed-round timer for the current step
   */
  public startStepTimer(seconds?: number): void {
    const duration = seconds ?? this.config.stepTimerSeconds;
    if (duration) {
      this.isStepExpired = false;
      this.timerController.startStepTimer(duration);
    }
  }

  public stopStepTimer(): void {
    this.timerController.stopStepTimer();
  }

  /**
   * Mobile backgrounding / focus loss event dispatcher
   */
  public handleAppStateChange(state: 'active' | 'background' | 'inactive'): void {
    if (state === 'background' || state === 'inactive') {
      this.recordProctoring('app-blur');
    } else if (state === 'active') {
      this.recordProctoring('app-focus');
    }
    this.timerController.handleAppStateChange(state);
  }

  public recordProctoring(
    type: ProctoringEvent['type'],
    metadata?: Record<string, unknown>
  ): void {
    this.proctoringLog.push({
      type,
      timestamp: new Date().toISOString(),
      metadata,
    });
  }

  public getState(): Readonly<AssessmentState> {
    let totalScore = 0;
    let maxPossibleScore = 0;
    const categoryAccumulator: Record<
      string,
      { score: number; maxPoints: number; questionsCount: number; correctCount: number }
    > = {};

    for (const [fieldId, rubric] of this.rubrics.entries()) {
      maxPossibleScore += rubric.points;
      const evaluation = this.evaluations[fieldId];
      const earned = evaluation ? evaluation.score : 0;
      const isCorrect = Boolean(evaluation?.isCorrect);
      totalScore += earned;

      const tags = rubric.tags ?? this.config.tags ?? ['general'];
      for (const tag of tags) {
        if (!categoryAccumulator[tag]) {
          categoryAccumulator[tag] = {
            score: 0,
            maxPoints: 0,
            questionsCount: 0,
            correctCount: 0,
          };
        }
        categoryAccumulator[tag].maxPoints += rubric.points;
        categoryAccumulator[tag].score += earned;
        categoryAccumulator[tag].questionsCount += 1;
        if (isCorrect) {
          categoryAccumulator[tag].correctCount += 1;
        }
      }
    }

    // Moodle-style score floor: prevent negative total scores
    if (this.config.floorScoreToZero !== false && totalScore < 0) {
      totalScore = 0;
    }

    // Normalized percent
    const scorePercent =
      maxPossibleScore > 0 ? Math.round((Math.max(0, totalScore) / maxPossibleScore) * 10000) / 100 : 0;

    // Passing status evaluation
    let isPassing = true;
    if (this.config.passingScore !== undefined) {
      isPassing = isPassing && totalScore >= this.config.passingScore;
    }
    if (this.config.passingPercent !== undefined) {
      isPassing = isPassing && scorePercent >= this.config.passingPercent;
    }

    // Format category scores
    const categoryScores: Record<string, CategoryScoreSummary> = {};
    const tagMastery: Record<string, number> = {};
    for (const [tag, data] of Object.entries(categoryAccumulator)) {
      const percent =
        data.maxPoints > 0
          ? Math.round((Math.max(0, data.score) / data.maxPoints) * 10000) / 100
          : 0;
      categoryScores[tag] = {
        tag,
        score: Math.round(data.score * 100) / 100,
        maxPoints: data.maxPoints,
        percent,
        questionsCount: data.questionsCount,
        correctCount: data.correctCount,
      };
      tagMastery[tag] = percent;
    }

    return {
      evaluations: { ...this.evaluations },
      totalScore: Math.round(totalScore * 100) / 100,
      maxPossibleScore,
      scorePercent,
      isPassing,
      categoryScores,
      globalTimerRemainingSeconds: this.timerController.getGlobalRemainingSeconds(),
      stepTimerRemainingSeconds: this.timerController.getStepRemainingSeconds(),
      isGlobalExpired: this.isGlobalExpired,
      isStepExpired: this.isStepExpired,
      proctoringEvents: [...this.proctoringLog],
      currentStreak: this.currentStreak,
      maxStreak: this.maxStreak,
      streakMultiplier: this.streakMultiplier,
      tagMastery,
      shuffledQuestionOrder: { ...this.shuffledQuestionCache },
      shuffledOptionOrder: { ...this.shuffledOptionCache },
    };
  }

  public getShuffledQuestionNames(pageId: string, questionNames: string[]): string[] {
    if (!this.config.shuffleQuestions) return [...questionNames];
    if (this.shuffledQuestionCache[pageId]) {
      return [...this.shuffledQuestionCache[pageId]];
    }
    const shuffled = this.prng.shuffle(questionNames);
    this.shuffledQuestionCache[pageId] = shuffled;
    return [...shuffled];
  }

  public getShuffledOptionValues(fieldName: string, optionValues: string[]): string[] {
    if (!this.config.shuffleOptions) return [...optionValues];
    if (this.shuffledOptionCache[fieldName]) {
      return [...this.shuffledOptionCache[fieldName]];
    }
    const shuffled = this.prng.shuffle(optionValues);
    this.shuffledOptionCache[fieldName] = shuffled;
    return [...shuffled];
  }

  public getCurrentStreak(): number {
    return this.currentStreak;
  }

  public getMaxStreak(): number {
    return this.maxStreak;
  }

  public getStreakMultiplier(): number {
    return this.streakMultiplier;
  }

  public getTagMastery(tag: string): number {
    return this.getState().tagMastery[tag] ?? 0;
  }

  public subscribe(listener: (state: AssessmentState) => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  private notifySubscribers(): void {
    const state = this.getState();
    for (const listener of this.subscribers) {
      listener(state);
    }
  }

  public isInstantTiming(): boolean {
    return this.config.timing === 'instant';
  }

  public hasStepTimer(): boolean {
    return Boolean(this.config.stepTimerSeconds);
  }

  public evaluateScoreCondition(condition: ScoreCondition): boolean {
    return ScoreConditionEvaluator.evaluate(condition, this.getState());
  }

  public dispose(): void {
    this.timerController.dispose();
    this.subscribers.clear();
  }
}

/**
 * Factory helper for composition roots to construct an AssessmentEngine
 * directly from a declarative FormSchema without coupling the core kernel.
 */
export function createAssessmentEngineForSchema(
  schema: FormSchema,
  options: AssessmentEngineOptions = {}
): AssessmentEngine | undefined {
  if (!schema.assessment) return undefined;
  const rubrics = new Map<string, QuestionRubric>();
  for (const page of schema.pages) {
    for (const field of page.fields) {
      if (field.rubric) {
        rubrics.set(field.name, field.rubric);
      }
    }
  }
  return new AssessmentEngine(rubrics, schema.assessment, options);
}
