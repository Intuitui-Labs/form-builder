import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ActionButton,
  AppPage,
  BrandHeader,
  ConstructBar,
  LevelProgress,
  Meter,
  Panel,
  SectionHeading,
  Tag,
} from '../components/FeedoraUi';
import { AccountBar } from '../components/AccountBar';
import { FEEDORA_BADGES } from '../domain/types';
import { measurementPort, transportPort, useFeedora } from '../feedora';
import { FEEDORA_REMOTE } from '../config';
import type { RemoteSurveyAnalysis } from '../domain/ports/transportTypes';
import { colors, radii, sansFont, serifFont } from '../theme';

export default function InsightsScreen() {
  const router = useRouter();
  const { profile, responses, activeSurveyUuid, authMode } = useFeedora();
  const [serverAnalysis, setServerAnalysis] = useState<RemoteSurveyAnalysis | null>(null);

  useEffect(() => {
    let cancelled = false;
    const targetUuid = activeSurveyUuid || FEEDORA_REMOTE.surveyUuid;
    if (authMode === 'django' && targetUuid) {
      transportPort
        .fetchSurveyAnalysis(targetUuid)
        .then((data) => {
          if (!cancelled && data.ok) {
            setServerAnalysis(data);
          }
        })
        .catch(() => {
          // Fall back gracefully to client-side measurementPort
        });
    }
    return () => {
      cancelled = true;
    };
  }, [activeSurveyUuid, authMode, responses.length]);

  const reliability = measurementPort.computeReliability(responses);
  const last = responses[responses.length - 1];
  const report = last ? measurementPort.score(last) : null;
  const interp = report ? measurementPort.interpretOverall(report.overall) : null;

  const alphaVal = serverAnalysis?.overallAlpha?.value ?? reliability.cronbachAlpha;
  const alphaInterp = serverAnalysis?.overallAlpha?.interpretation ?? reliability.interpretation;
  const alphaTone =
    alphaVal >= 0.8 ? 'teal' : alphaVal >= 0.7 ? 'gold' : 'slate';

  const expComp = serverAnalysis?.experimentalComparison;
  const armsData = expComp?.arms ?? {};
  const gamifiedArm = armsData['gamified'];
  const controlArm = armsData['control'];
  const variableArm = armsData['variable'];
  const nrArm = armsData['negative_reinforcement'];

  return (
    <AppPage>
      <BrandHeader
        eyebrow="Academic analytics & insights"
        title="HMSAM Research & Arms"
        subtitle="Empirical comparative analysis between Gamified treatment, Baseline control, Variable rewards, and Negative reinforcement."
      />

      <AccountBar />

      {/* ── 1. Experimental Arms & Comparative Research (Always Front & Center) ── */}
      <Panel>
        <SectionHeading
          title="🔬 Experimental Arm Comparison"
          detail="Evaluation across treatment arms to measure hedonic motivation and psychometric adoption."
        />

        <View style={styles.armsGrid}>
          {/* Gamified Arm */}
          <View style={[styles.armCard, styles.armCardGamified]}>
            <View style={styles.armHeader}>
              <Text style={styles.armEmoji}>🎮</Text>
              <Tag tone="teal">TREATMENT</Tag>
            </View>
            <Text style={styles.armTitle}>Gamified Arm</Text>
            <Text style={styles.armDesc}>
              Points, Badges, Level Progression & Feedback Mascots.
            </Text>
            <View style={styles.armStatRow}>
              <Text style={styles.armStatNum}>{gamifiedArm?.count ?? 0}</Text>
              <Text style={styles.armStatLabel}>Responses</Text>
            </View>
            {gamifiedArm?.overallScore ? (
              <Text style={styles.armScoreText}>
                {Math.round(gamifiedArm.overallScore)}% Hedonic Adoption
              </Text>
            ) : null}
          </View>

          {/* Control Arm */}
          <View style={[styles.armCard, styles.armCardControl]}>
            <View style={styles.armHeader}>
              <Text style={styles.armEmoji}>⚖️</Text>
              <Tag tone="slate">CONTROL</Tag>
            </View>
            <Text style={styles.armTitle}>Control Arm</Text>
            <Text style={styles.armDesc}>
              Unmodified baseline instrument with zero gamification.
            </Text>
            <View style={styles.armStatRow}>
              <Text style={styles.armStatNum}>{controlArm?.count ?? 0}</Text>
              <Text style={styles.armStatLabel}>Responses</Text>
            </View>
            {controlArm?.overallScore ? (
              <Text style={styles.armScoreText}>
                {Math.round(controlArm.overallScore)}% Baseline Adoption
              </Text>
            ) : null}
          </View>

          {/* Variable Rewards Arm */}
          <View style={[styles.armCard, styles.armCardVariable]}>
            <View style={styles.armHeader}>
              <Text style={styles.armEmoji}>🎰</Text>
              <Tag tone="gold">OPTIONAL</Tag>
            </View>
            <Text style={styles.armTitle}>Variable Rewards</Text>
            <Text style={styles.armDesc}>
              Skinnerian variable-ratio schedule (1.2x – 2.0x surprise boost).
            </Text>
            <View style={styles.armStatRow}>
              <Text style={styles.armStatNum}>{variableArm?.count ?? 0}</Text>
              <Text style={styles.armStatLabel}>Responses</Text>
            </View>
            <Text style={styles.armScoreText}>40% Dopamine Multiplier</Text>
          </View>

          {/* Negative Reinforcement Arm */}
          <View style={[styles.armCard, styles.armCardNr]}>
            <View style={styles.armHeader}>
              <Text style={styles.armEmoji}>🛡️</Text>
              <Tag tone="violet">OPTIONAL</Tag>
            </View>
            <Text style={styles.armTitle}>Negative Reinforcement</Text>
            <Text style={styles.armDesc}>
              Friction removal upon completion + 7-day institutional streak shield.
            </Text>
            <View style={styles.armStatRow}>
              <Text style={styles.armStatNum}>{nrArm?.count ?? 0}</Text>
              <Text style={styles.armStatLabel}>Responses</Text>
            </View>
            <Text style={styles.armScoreText}>Aversive Stimulus Removal</Text>
          </View>
        </View>

        {/* Statistical Significance & Effect Size */}
        {expComp?.statisticalComparison && Object.keys(expComp.statisticalComparison).length > 0 && (
          <View style={{ marginTop: 18, gap: 8 }}>
            <Text style={styles.significanceHeader}>
              STATISTICAL SIGNIFICANCE (WELCH'S T & HEDGES' G)
            </Text>
            {Object.entries(expComp.statisticalComparison).map(([code, stat]) => (
              <View key={code} style={styles.statRowItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.constructCodeText}>{code.toUpperCase()}</Text>
                  <Text style={styles.constructSubDetail}>
                    t({stat.degreesOfFreedom ?? '—'}) = {stat.tStatistic ?? '—'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Tag tone={stat.isSignificant ? 'teal' : 'slate'}>
                    {stat.isSignificant ? `p < 0.05 (${stat.significanceMarker})` : 'ns'}
                  </Tag>
                  <Text style={styles.hedgesGText}>
                    g = {stat.hedgesG ?? '—'} ({stat.effectSize})
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Panel>

      {/* ── 2. Psychometric Reliability (Cronbach's Alpha) ── */}
      <Panel>
        <SectionHeading
          title="Psychometric Reliability"
          detail="Cronbach's α — measure of internal consistency across respondents."
        />
        <View style={styles.alphaRow}>
          <Text style={styles.alphaValue}>
            {typeof alphaVal === 'number' ? alphaVal.toFixed(2) : '—'}
          </Text>
          <Tag tone={alphaTone}>{alphaInterp.toUpperCase()}</Tag>
        </View>
        <Text style={styles.alphaNote}>
          {serverAnalysis
            ? `Authoritative research database metric calculated across ${serverAnalysis.totalResponses} participants. α ≥ 0.70 is the international psychometric threshold for high internal consistency.`
            : reliability.note ??
              `Calculated from this device session's responses. α ≥ 0.70 is the acceptance threshold.`}
        </Text>
      </Panel>

      {/* ── 3. Personal HMSAM Profile (From Local or Server Response) ── */}
      {report && interp ? (
        <>
          <Panel>
            <View style={styles.overallRow}>
              <View>
                <Text style={styles.overallLabel}>YOUR HEDONIC ADOPTION</Text>
                <Text style={[styles.overallValue, { color: interp.color }]}>
                  {report.overall}
                  <Text style={styles.overallMax}> %</Text>
                </Text>
              </View>
              <Tag tone={report.overall >= 70.1 ? 'teal' : report.overall >= 56.1 ? 'gold' : 'slate'}>
                {interp.level.toUpperCase()}
              </Tag>
            </View>
            <Meter percent={report.overall} color={interp.color} height={8} />
            <Text style={styles.overallFoot}>{interp.description}</Text>
            <Text style={styles.overallSubFoot}>
              {report.answeredItems} of {measurementPort.itemCount} items · {measurementPort.instrumentVersion}
            </Text>
          </Panel>

          <Panel>
            <SectionHeading title="Construct breakdown" detail={measurementPort.instrument} />
            {report.constructs.map((construct) => (
              <ConstructBar
                key={construct.constructId}
                label={construct.label}
                mean={construct.mean}
                score={construct.score}
                interpretation={construct.interpretation}
                color={construct.color}
                answered={construct.count}
                itemCount={construct.itemCount}
              />
            ))}
          </Panel>
        </>
      ) : (
        <Panel style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={styles.emptyTitle}>Personal Profile Pending</Text>
          <Text style={styles.emptyBody}>
            You haven't submitted a survey on this device session yet. Complete the survey to compute your individual HMSAM construct scores and see where you place in the research dataset.
          </Text>
          <View style={{ marginTop: 12 }}>
            <ActionButton label="Take Survey Now →" onPress={() => router.push('/')} />
          </View>
        </Panel>
      )}

      {/* ── 4. Standing & Badges ── */}
      {profile ? (
        <Panel>
          <SectionHeading
            title="Your standing & badges"
            detail="Cumulative voice points across surveys in this entity."
          />
          <LevelProgress standing={profile.standing} totalPoints={profile.totalPoints} />
          <View style={styles.statRow}>
            <Stat label="Surveys" value={String(profile.surveysCompleted)} />
            <Stat label="Badges" value={String(profile.badges.length)} />
            <Stat label="Points" value={profile.totalPoints.toLocaleString()} />
          </View>
          {profile.badges.length > 0 ? (
            <View style={styles.badgeRow}>
              {profile.badges.map((badgeId) => {
                const badge = FEEDORA_BADGES.find((b) => b.id === badgeId);
                return (
                  <Tag key={badgeId} tone="gold">
                    {badge ? `${badge.icon} ${badge.label}` : badgeId}
                  </Tag>
                );
              })}
            </View>
          ) : null}
        </Panel>
      ) : null}
    </AppPage>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  armsGrid: {
    gap: 12,
    marginTop: 8,
  },
  armCard: {
    borderRadius: radii.small,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  armCardGamified: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
  },
  armCardControl: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  armCardVariable: {
    backgroundColor: '#FEFCE8',
    borderColor: '#FEF08A',
  },
  armCardNr: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  armHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  armEmoji: {
    fontSize: 22,
  },
  armTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },
  armDesc: {
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.muted,
  },
  armStatRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 4,
  },
  armStatNum: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  armStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  armScoreText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDeep,
    marginTop: 2,
  },
  significanceHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.faint,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  statRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    alignItems: 'center',
  },
  constructCodeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  constructSubDetail: {
    fontSize: 10.5,
    color: colors.faint,
    marginTop: 1,
  },
  hedgesGText: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  overallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  overallLabel: {
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.faint,
    fontWeight: '700',
  },
  overallValue: {
    fontSize: 36,
    fontWeight: '400',
    color: colors.ink,
    fontFamily: serifFont,
  },
  overallMax: {
    fontSize: 16,
    color: colors.faint,
    fontWeight: '600',
  },
  overallFoot: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.muted,
    marginTop: 10,
    fontWeight: '500',
  },
  overallSubFoot: {
    fontSize: 11,
    color: colors.faint,
    marginTop: 4,
    fontWeight: '500',
  },
  alphaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  alphaValue: {
    fontSize: 38,
    fontWeight: '400',
    color: colors.primaryDeep,
    fontFamily: serifFont,
  },
  alphaNote: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  emptyEmoji: {
    fontSize: 44,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.ink,
    fontFamily: serifFont,
  },
  emptyBody: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 340,
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.small,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  statLabel: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '600',
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
});
