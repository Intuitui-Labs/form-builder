import { useMemo, useState, useEffect } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  MultiStepFormManager,
  type FormSchema,
} from '@intuitui-labs/form-builder-engine';
import {
  createAssessmentEngineForSchema,
  type AssessmentState,
} from '@intuitui-labs/form-builder-engine/assessment';
import {
  AppPage,
  BrandHeader,
  Panel,
  ActionButton,
  Tag,
} from '../components/EngineUi';
import { colors, radii } from '../theme';

const TELEGRAM_QUIZ_SCHEMA: FormSchema = {
  id: 'olympiad-speed-quiz',
  title: 'Telegram-Style Speed Olympiad',
  assessment: {
    timing: 'instant',
    stepTimerSeconds: 20,
    globalTimerSeconds: 120,
    passingPercent: 70,
  },
  pages: [
    {
      id: 'q1',
      title: 'Question 1: Algorithms',
      fields: [
        {
          id: 'algo_complexity',
          name: 'algo_complexity',
          type: 'select',
          label: 'What is the average-case time complexity of QuickSort?',
          required: true,
          order: 0,
          options: [
            { label: 'O(N²)', value: 'on2' },
            { label: 'O(N log N)', value: 'onlogn' },
            { label: 'O(N)', value: 'on' },
            { label: 'O(1)', value: 'o1' },
          ],
          rubric: {
            kind: 'single-choice',
            points: 50,
            correctValue: 'onlogn',
            explanation: 'QuickSort divides the array around a pivot in O(N) and recurses log N levels on average.',
            hint: { text: 'Divide and conquer algorithms often have logarithmic tree depth', penaltyPercent: 10 },
            tags: ['algorithms'],
          },
        },
      ],
      jumpRules: [
        {
          scoreCondition: {
            type: 'score-total-percent',
            operator: 'greaterThanOrEqual',
            value: 50,
          },
          targetPageId: 'q_advanced',
        },
      ],
      defaultNextPageId: 'q_remedial',
    },
    {
      id: 'q_remedial',
      title: 'Question 2: Fundamentals',
      fields: [
        {
          id: 'array_lookup',
          name: 'array_lookup',
          type: 'select',
          label: 'What is the time complexity to access an element by index in an array?',
          required: true,
          order: 0,
          options: [
            { label: 'O(1) Constant Time', value: 'o1' },
            { label: 'O(N) Linear Time', value: 'on' },
            { label: 'O(log N)', value: 'ologn' },
          ],
          rubric: {
            kind: 'single-choice',
            points: 50,
            correctValue: 'o1',
            explanation: 'Array elements are stored in contiguous memory; index lookup is a direct pointer calculation.',
            tags: ['fundamentals'],
          },
        },
      ],
    },
    {
      id: 'q_advanced',
      title: 'Question 2: Advanced Systems',
      fields: [
        {
          id: 'consensus_proto',
          name: 'consensus_proto',
          type: 'select',
          label: 'Which distributed algorithm is designed to solve consensus over crash-fault-tolerant networks?',
          required: true,
          order: 0,
          options: [
            { label: 'Raft / Paxos', value: 'raft' },
            { label: 'Dijkstra', value: 'dijkstra' },
            { label: 'Huffman Coding', value: 'huffman' },
          ],
          rubric: {
            kind: 'single-choice',
            points: 50,
            correctValue: 'raft',
            explanation: 'Raft and Paxos are foundational consensus protocols ensuring state-machine replication.',
            tags: ['distributed-systems'],
          },
        },
      ],
    },
  ],
};

export default function QuizScreen() {
  const [quizKey, setQuizKey] = useState(0);

  const assessmentEngine = useMemo(() => {
    return createAssessmentEngineForSchema(TELEGRAM_QUIZ_SCHEMA)!;
  }, [quizKey]);

  const [assessmentState, setAssessmentState] = useState<AssessmentState>(() =>
    assessmentEngine.getState()
  );

  const [isFinished, setIsFinished] = useState(false);
  const [revealedHint, setRevealedHint] = useState<string | null>(null);

  // Subscribe to assessment engine events (timer ticks, evaluations, proctoring)
  useEffect(() => {
    setAssessmentState(assessmentEngine.getState());
    return assessmentEngine.subscribe((nextState) => {
      setAssessmentState(nextState);
    });
  }, [assessmentEngine]);

  const manager = useMemo(() => {
    return new MultiStepFormManager(
      TELEGRAM_QUIZ_SCHEMA,
      () => {
        setIsFinished(true);
      },
      {
        experience: {
          assessmentEngine,
        },
      }
    );
  }, [assessmentEngine, quizKey]);

  const [, setRerender] = useState(0);
  useEffect(() => {
    return manager.subscribe(() => {
      setRerender((v) => v + 1);
    });
  }, [manager]);

  const currentPage = manager.getCurrentPage();
  const currentField = currentPage.fields[0];
  const fieldEvaluation = currentField ? assessmentState.evaluations[currentField.name] : undefined;
  const isAnswered = Boolean(fieldEvaluation);

  // Request hint
  const handleRequestHint = () => {
    if (!currentField) return;
    const hint = manager.requestAssessmentHint(currentField.name);
    if (hint) {
      setRevealedHint(hint);
    }
  };

  // Submit answer
  const handleSelectAnswer = (value: string) => {
    if (!currentField || isAnswered) return;
    manager.setFieldValue(currentField.name, value);
  };

  const handleNext = () => {
    setRevealedHint(null);
    if (manager.isLastStep()) {
      manager.submit();
      setIsFinished(true);
    } else {
      manager.nextStep();
    }
  };

  const remainingStepTime = assessmentState.stepTimerRemainingSeconds ?? 20;
  const isTimeLow = remainingStepTime <= 5 && remainingStepTime > 0;

  return (
    <AppPage>
      <BrandHeader
        eyebrow="Assessment Engine"
        title="Telegram & Moodle Quiz Player"
        subtitle="Instant tactile micro-haptics, cadence timer countdown, anti-cheat proctoring, and adaptive branching"
      />

      {/* Cadence Timer & Proctoring Status Bar */}
      <Panel style={styles.metricsBar}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Countdown</Text>
          <Text style={[styles.timerValue, isTimeLow && styles.timerValueAlert]}>
            ⏱️ {remainingStepTime}s
          </Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Total Score</Text>
          <Text style={styles.scoreValue}>
            🏆 {assessmentState.totalScore} / {assessmentState.maxPossibleScore}
          </Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Proctoring</Text>
          <Text style={styles.metricValue}>
            👁️ {assessmentState.proctoringEvents.filter((e) => e.type === 'app-blur').length} Blurs
          </Text>
        </View>
      </Panel>

      {!isFinished ? (
        <Panel style={styles.quizCard}>
          {/* Step / Question Header */}
          <View style={styles.questionHeader}>
            <Tag tone="violet">Step {manager.getCurrentPageIndex() + 1}</Tag>
            <Text style={styles.questionTitle}>{currentField?.label}</Text>
          </View>

          {/* Hint Area */}
          {revealedHint ? (
            <View style={styles.hintBox}>
              <Text style={styles.hintIcon}>💡</Text>
              <Text style={styles.hintText}>{revealedHint} (-10% penalty applied)</Text>
            </View>
          ) : !isAnswered ? (
            <Pressable onPress={handleRequestHint} style={styles.hintBtn}>
              <Text style={styles.hintBtnText}>💡 Request Hint (-10% points)</Text>
            </Pressable>
          ) : null}

          {/* Options List */}
          <View style={styles.optionsList}>
            {currentField?.options?.map((opt) => {
              const isSelected = fieldEvaluation?.userAnswer === opt.value;
              const isCorrectAnswer = fieldEvaluation?.isCorrect && isSelected;
              const isWrongAnswer = isSelected && !fieldEvaluation?.isCorrect;

              const cardStyles = [
                styles.optionCard,
                isAnswered && isCorrectAnswer && styles.optionCardCorrect,
                isAnswered && isWrongAnswer && styles.optionCardWrong,
              ];

              return (
                <Pressable
                  key={opt.value}
                  disabled={isAnswered}
                  onPress={() => handleSelectAnswer(opt.value)}
                  style={({ pressed }) => [cardStyles, pressed && !isAnswered && styles.optionCardPressed]}
                >
                  <Text style={styles.optionLabel}>{opt.label}</Text>
                  {isAnswered && isSelected ? (
                    <Text style={styles.resultEmoji}>{isCorrectAnswer ? '✅' : '❌'}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {/* Instant Explanation Reveal (Telegram Quiz Style) */}
          {isAnswered && fieldEvaluation?.explanation ? (
            <View
              style={[
                styles.explanationBox,
                fieldEvaluation.isCorrect ? styles.explanationCorrect : styles.explanationWrong,
              ]}
            >
              <Text style={styles.explanationTitle}>
                {fieldEvaluation.isCorrect ? '🎉 Correct!' : '❌ Not quite!'}
              </Text>
              <Text style={styles.explanationText}>{fieldEvaluation.explanation}</Text>
              <Text style={styles.earnedPointsText}>
                Earned: +{fieldEvaluation.score} points
              </Text>
            </View>
          ) : null}

          {/* Next Button */}
          {isAnswered ? (
            <View style={styles.nextBtnContainer}>
              <ActionButton
                label={manager.isLastStep() ? 'View Report Card' : 'Next Question ➔'}
                onPress={handleNext}
              />
            </View>
          ) : null}
        </Panel>
      ) : (
        /* Report Card Modal */
        <Panel style={styles.reportCard}>
          <Text style={styles.reportEmoji}>
            {assessmentState.isPassing ? '🎓' : '📚'}
          </Text>
          <Text style={styles.reportTitle}>
            {assessmentState.isPassing ? 'Assessment Passed!' : 'Assessment Complete'}
          </Text>
          <Text style={styles.reportSubtitle}>
            Final Score: {assessmentState.totalScore} / {assessmentState.maxPossibleScore} ({assessmentState.scorePercent}%)
          </Text>

          <View style={styles.reportBadgeContainer}>
            <Tag tone={assessmentState.isPassing ? 'teal' : 'amber'}>
              {assessmentState.isPassing ? 'Passing Status: Achieved' : 'Needs Review'}
            </Tag>
          </View>

          {/* Category Breakdown */}
          <View style={styles.categorySummary}>
            <Text style={styles.categoryTitle}>Domain Breakdown</Text>
            {Object.entries(assessmentState.categoryScores).map(([tag, cat]) => (
              <View key={tag} style={styles.categoryRow}>
                <Text style={styles.categoryTag}>{tag}</Text>
                <Text style={styles.categoryScore}>
                  {cat.score} / {cat.maxPoints} ({cat.percent}%)
                </Text>
              </View>
            ))}
          </View>

          <ActionButton
            label="Restart Assessment"
            onPress={() => {
              setQuizKey((k) => k + 1);
              setIsFinished(false);
              setRevealedHint(null);
            }}
          />
        </Panel>
      )}
    </AppPage>
  );
}

const styles = StyleSheet.create({
  metricsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: 14,
    marginBottom: 16,
  },
  metricItem: {
    alignItems: 'center',
    gap: 4,
  },
  metricDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.line,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
  },
  timerValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.violet,
  },
  timerValueAlert: {
    color: colors.red,
  },
  scoreValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.teal,
  },
  quizCard: {
    padding: 20,
    gap: 16,
  },
  questionHeader: {
    gap: 8,
  },
  questionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    lineHeight: 24,
  },
  hintBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.canvas,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  hintBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.amber,
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.amberSoft,
    padding: 10,
    borderRadius: radii.small,
    gap: 8,
  },
  hintIcon: {
    fontSize: 16,
  },
  hintText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.amber,
    flex: 1,
  },
  optionsList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.canvas,
    borderRadius: radii.medium,
    padding: 16,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  optionCardPressed: {
    backgroundColor: colors.violetSoft,
    borderColor: colors.violet,
  },
  optionCardCorrect: {
    backgroundColor: colors.tealSoft,
    borderColor: colors.teal,
  },
  optionCardWrong: {
    backgroundColor: colors.redSoft,
    borderColor: colors.red,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  resultEmoji: {
    fontSize: 18,
  },
  explanationBox: {
    borderRadius: radii.medium,
    padding: 14,
    gap: 6,
  },
  explanationCorrect: {
    backgroundColor: colors.tealSoft,
    borderLeftWidth: 4,
    borderLeftColor: colors.teal,
  },
  explanationWrong: {
    backgroundColor: colors.redSoft,
    borderLeftWidth: 4,
    borderLeftColor: colors.red,
  },
  explanationTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },
  explanationText: {
    fontSize: 13,
    color: colors.slate,
    lineHeight: 18,
  },
  earnedPointsText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 4,
  },
  nextBtnContainer: {
    marginTop: 8,
  },
  reportCard: {
    padding: 24,
    alignItems: 'center',
    gap: 14,
  },
  reportEmoji: {
    fontSize: 48,
  },
  reportTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  reportSubtitle: {
    fontSize: 14,
    color: colors.muted,
  },
  reportBadgeContainer: {
    marginVertical: 4,
  },
  categorySummary: {
    width: '100%',
    backgroundColor: colors.canvas,
    borderRadius: radii.medium,
    padding: 14,
    gap: 8,
    marginVertical: 8,
  },
  categoryTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  categoryTag: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    textTransform: 'capitalize',
  },
  categoryScore: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.violet,
  },
});
