import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable, Modal } from 'react-native';
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

// Metadata definitions for all scientific constructs and inferential statistics
const CONSTRUCT_EXPLANATIONS: Record<string, { name: string; concept: string; paperRef: string }> = {
  peou: {
    name: 'Perceived Ease of Use',
    concept: 'The degree to which a user believes using Feedora will be effortless and intuitive.',
    paperRef: 'Davis (1989) / Lowry et al. (2013)',
  },
  pu: {
    name: 'Perceived Usefulness',
    concept: 'The prospective contributor’s belief that contributing voice data enhances their institutional productivity.',
    paperRef: 'Davis (1989) TAM',
  },
  joy: {
    name: 'Joy (Hedonic Enjoyment)',
    concept: 'Subjective pleasure, playfulness, and emotional reward derived directly from the act of participation.',
    paperRef: 'HMSAM Core Hedonic Construct',
  },
  curiosity: {
    name: 'Curiosity (Cognitive Novelty)',
    concept: 'The extent to which unexpected stimuli, progression levels, or variable rewards trigger inquisitive behavior.',
    paperRef: 'Malone & Lepper / Lowry et al. (2013)',
  },
  control: {
    name: 'Perceived Control',
    concept: 'The user feeling in sovereign command over their pace, data privacy, and survey progression.',
    paperRef: 'Deci & Ryan Self-Determination Theory',
  },
  fi: {
    name: 'Focused Immersion',
    concept: 'State of total cognitive absorption where peripheral distractions and time awareness dissolve.',
    paperRef: 'Flow Theory (Csikszentmihalyi 1990)',
  },
  biu: {
    name: 'Behavioral Intention to Use',
    concept: 'The likelihood and frequency with which the participant intends to continue using Feedora in the future.',
    paperRef: 'Fishbein & Ajzen TRA',
  },
  alpha: {
    name: "Cronbach's Alpha (α)",
    concept: 'Measures internal psychometric consistency across multiple scale items. Values >= 0.70 verify high reliability.',
    paperRef: 'Nunnally (1978) Psychometric Standard',
  },
  welch: {
    name: "Welch's t-test & Hedges' g",
    concept: "Robust inferential comparison of unequal variance groups (Gamified vs Control). Hedges' g calculates unbiased standardized effect size.",
    paperRef: "Welch (1947) / Hedges (1981)",
  },
};

export default function InsightsScreen() {
  const router = useRouter();
  const { profile, responses, activeSurveyUuid, authMode, effectiveRole } = useFeedora();
  const [serverAnalysis, setServerAnalysis] = useState<RemoteSurveyAnalysis | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<{ title: string; concept: string; ref: string } | null>(null);

  const isCreator = effectiveRole === 'creator';

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

  const showInfo = (key: string) => {
    const meta = CONSTRUCT_EXPLANATIONS[key.toLowerCase()];
    if (meta) {
      setActiveTooltip({ title: meta.name, concept: meta.concept, ref: meta.paperRef });
    }
  };

  return (
    <AppPage>
      <BrandHeader
        title={isCreator ? "Research & Arm Telemetry" : "Your Insights & Standing"}
      />

      <AccountBar />

      {/* ── 1. Personal Profile (Primary Focus for Respondents) ── */}
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
            <Meter percent={report.overall} color={interp.color} height={6} />
            <Text style={styles.overallFoot}>{interp.description}</Text>
            <Text style={styles.overallSubFoot}>
              {report.answeredItems} of {measurementPort.itemCount} items · {measurementPort.instrumentVersion}
            </Text>
          </Panel>

          <Panel>
            <View style={styles.sectionHeaderRow}>
              <SectionHeading
                title="Construct breakdown"
              />
              <Pressable style={styles.infoBadge} onPress={() => showInfo('joy')}>
                <Text style={styles.infoBadgeText}>i</Text>
              </Pressable>
            </View>
            {report.constructs.map((construct) => (
              <View key={construct.constructId} style={{ marginBottom: 12 }}>
                <ConstructBar
                  label={construct.label}
                  mean={construct.mean}
                  score={construct.score}
                  interpretation={construct.interpretation}
                  color={construct.color}
                  answered={construct.count}
                  itemCount={construct.itemCount}
                />
              </View>
            ))}
          </Panel>
        </>
      ) : (
        <Panel style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={styles.emptyTitle}>Personal Profile Pending</Text>
          <Text style={styles.emptyBody}>
            You haven't submitted a response on this session yet. Take the survey to compute your individual construct profile and see your voice points in real-time.
          </Text>
          <View style={{ marginTop: 12 }}>
            <ActionButton label="Take Survey Now →" onPress={() => router.push('/')} />
          </View>
        </Panel>
      )}

      {/* ── 2. Experimental Arms & Comparative Research (Prominent for Creators, Context for Respondents) ── */}
      <Panel>
        <View style={styles.sectionHeaderRow}>
          <SectionHeading
            title="🔬 Experimental Arms"
          />
          <Pressable style={styles.infoBadge} onPress={() => showInfo('welch')}>
            <Text style={styles.infoBadgeText}>i</Text>
          </Pressable>
        </View>

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

        {/* Statistical Significance Table — Clean and Spacious */}
        {expComp?.statisticalComparison && Object.keys(expComp.statisticalComparison).length > 0 && (
          <View style={{ marginTop: 18, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.significanceHeader}>
                {isCreator ? "STATISTICAL SIGNIFICANCE (WELCH'S T & HEDGES' G)" : "RESEARCH COMPARISON"}
              </Text>
            </View>

            {Object.entries(expComp.statisticalComparison).map(([code, stat]) => (
              <View key={code} style={styles.statRowItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.constructCodeText}>{code.toUpperCase()}</Text>
                  {isCreator ? (
                    <Text style={styles.constructSubDetail}>
                      t({stat.degreesOfFreedom ?? '—'}) = {stat.tStatistic ?? '—'}
                    </Text>
                  ) : (
                    <Text style={styles.constructSubDetail}>
                      {stat.isSignificant ? "Strong treatment effect" : "Equivalent baseline"}
                    </Text>
                  )}
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

      {/* ── 3. Psychometric Reliability (Cronbach's Alpha) ── */}
      <Panel>
        <View style={styles.sectionHeaderRow}>
          <SectionHeading
            title="Psychometric Reliability"
          />
          <Pressable style={styles.infoBadge} onPress={() => showInfo('alpha')}>
            <Text style={styles.infoBadgeText}>i</Text>
          </Pressable>
        </View>
        <View style={styles.alphaRow}>
          <Text style={styles.alphaValue}>
            {typeof alphaVal === 'number' ? alphaVal.toFixed(2) : '—'}
          </Text>
          <Tag tone={alphaTone}>{alphaInterp.toUpperCase()}</Tag>
        </View>
        <Text style={styles.alphaNote}>
          {serverAnalysis
            ? `Authoritative research database metric calculated across ${serverAnalysis.totalResponses} participants. α ≥ 0.70 is the international psychometric threshold for robust internal consistency.`
            : reliability.note ??
              `Calculated from this device session's responses. α ≥ 0.70 is the acceptance threshold.`}
        </Text>
      </Panel>

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

      {/* ── 5. Info Tooltip Modal ── */}
      {activeTooltip && (
        <Modal transparent animationType="fade" visible={!!activeTooltip} onRequestClose={() => setActiveTooltip(null)}>
          <View style={styles.tooltipBackdrop}>
            <View style={styles.tooltipCard}>
              <View style={styles.tooltipHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tooltipMetaLabel}>PSYCHOMETRIC CONSTRUCT INFO</Text>
                  <Text style={styles.tooltipTitle}>{activeTooltip.title}</Text>
                </View>
                <Pressable style={styles.tooltipCloseBtn} onPress={() => setActiveTooltip(null)}>
                  <Text style={styles.tooltipCloseText}>✕</Text>
                </Pressable>
              </View>
              <Text style={styles.tooltipConcept}>{activeTooltip.concept}</Text>
              <View style={styles.tooltipRefWrap}>
                <Text style={styles.tooltipRefText}>📚 Reference: {activeTooltip.ref}</Text>
              </View>
              <ActionButton label="Got it" onPress={() => setActiveTooltip(null)} />
            </View>
          </View>
        </Modal>
      )}
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
  roleNoticeRow: {
    backgroundColor: '#F1F5F9',
    borderRadius: radii.small,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 4,
  },
  roleNoticeSub: {
    fontSize: 11,
    color: colors.muted,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  infoBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.hover,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  infoBadgeInline: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.hover,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  infoBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    fontFamily: serifFont,
  },
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
  tooltipBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  tooltipCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.paper,
    borderRadius: 14,
    padding: 20,
    gap: 12,
  },
  tooltipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tooltipMetaLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.faint,
    letterSpacing: 0.8,
  },
  tooltipTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
    fontFamily: serifFont,
    marginTop: 2,
  },
  tooltipCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.hover,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltipCloseText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  tooltipConcept: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  tooltipRefWrap: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    padding: 8,
  },
  tooltipRefText: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: 'italic',
  },
});
