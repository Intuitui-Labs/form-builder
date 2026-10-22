import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import {
  AppPage,
  BrandHeader,
  Panel,
  SectionHeading,
  Tag,
} from '../components/FeedoraUi';
import { AccountBar } from '../components/AccountBar';
import { transportPort, useFeedora } from '../feedora';
import { FEEDORA_REMOTE } from '../config';
import type { RemoteSurveyAnalysis } from '../domain/ports/transportTypes';
import { colors, radii, serifFont } from '../theme';
import { OrganizationStandingCard } from '../components/OrganizationStandingCard';

export default function InsightsScreen() {
  const { profile, activeSurveyUuid, effectiveRole, authUser, openAuthModal } = useFeedora();
  const [serverAnalysis, setServerAnalysis] = useState<RemoteSurveyAnalysis | null>(null);

  const isCreator = effectiveRole === 'creator';

  useEffect(() => {
    let cancelled = false;
    const targetUuid = activeSurveyUuid || FEEDORA_REMOTE.surveyUuid;
    setServerAnalysis(null);
    if (isCreator && targetUuid) {
      transportPort
        .fetchSurveyAnalysis(targetUuid)
        .then((data) => {
          if (!cancelled && data.ok) {
            setServerAnalysis(data);
          }
        })
        .catch(() => {
          // Keep research-only values unavailable when the server is unreachable.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [activeSurveyUuid, isCreator]);

  const alphaVal = isCreator ? serverAnalysis?.overallAlpha?.value : undefined;
  const alphaInterp = isCreator
    ? serverAnalysis?.overallAlpha?.interpretation ?? 'Awaiting authorized analysis'
    : '';
  const alphaTone =
    typeof alphaVal === 'number' && alphaVal >= 0.8 ? 'teal' :
      typeof alphaVal === 'number' && alphaVal >= 0.7 ? 'gold' : 'slate';

  const expComp = serverAnalysis?.experimentalComparison;
  const armsData = expComp?.arms ?? {};
  const populatedArms = Object.entries(armsData).filter(([, arm]) => arm.count > 0);

  return (
    <AppPage>
      <BrandHeader
        title={isCreator ? "Research & Arm Telemetry" : "Your Insights & Standing"}
      />

      <AccountBar />

      {!isCreator && profile && (profile.surveysCompleted > 0 || profile.totalPoints > 0) ? (
        <OrganizationStandingCard
          profile={profile}
          detail="Your current standing"
          guest={!authUser}
          onSignIn={openAuthModal}
        />
      ) : !isCreator ? (
        <Panel style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No completed surveys yet</Text>
          <Text style={styles.emptyBody}>
            {authUser
              ? 'Complete a survey here, or switch organizations to see your standing there.'
              : 'Complete a survey to see your standing here.'}
          </Text>
        </Panel>
      ) : null}

      {/* Creator-only experimental aggregates and inference. */}
      {isCreator ? <Panel>
        <View style={styles.sectionHeaderRow}>
          <SectionHeading
            title="🔬 Experimental Arms"
          />
        </View>

        {populatedArms.length > 0 ? (
          <View style={styles.armsGrid}>
            {populatedArms.map(([arm, data]) => (
              <View key={arm} style={styles.armCard}>
                <Text style={styles.armTitle}>{arm.replaceAll('_', ' ')}</Text>
                <View style={styles.armStatRow}>
                  <Text style={styles.armStatNum}>{data.count}</Text>
                  <Text style={styles.armStatLabel}>responses</Text>
                </View>
                {typeof data.overallScore === 'number' ? (
                  <Text style={styles.armScoreText}>Mean score: {data.overallScore.toFixed(1)}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.alphaNote}>No completed responses are available for arm comparison.</Text>
        )}

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
      </Panel> : null}

      {/* ── 3. Psychometric Reliability (Cronbach's Alpha) ── */}
      {isCreator ? <Panel>
        <View style={styles.sectionHeaderRow}>
          <SectionHeading
            title="Psychometric Reliability"
          />
        </View>
        <View style={styles.alphaRow}>
          <Text style={styles.alphaValue}>
            {typeof alphaVal === 'number' ? alphaVal.toFixed(2) : '—'}
          </Text>
          <Tag tone={alphaTone}>{alphaInterp.toUpperCase()}</Tag>
        </View>
        <Text style={styles.alphaNote}>
          {serverAnalysis
            ? `Research database metric calculated across ${serverAnalysis.totalResponses} participants.`
            : 'Authorized research analysis is unavailable for this survey.'}
        </Text>
      </Panel> : null}

    </AppPage>
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
    fontSize: Platform.select({ web: 24, default: 19 }),
    lineHeight: Platform.select({ web: 32, default: 26 }),
    fontWeight: '700',
    color: colors.ink,
    fontFamily: serifFont,
  },
  emptyBody: {
    fontSize: Platform.select({ web: 16, default: 12.5 }),
    lineHeight: Platform.select({ web: 24, default: 18 }),
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 340,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
});
