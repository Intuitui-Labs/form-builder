import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
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

  return (
    <AppPage>
      <BrandHeader
        eyebrow="Measurement report"
        title="Your HMSAM profile"
        subtitle="Per-construct scores from your latest response, plus Cronbach's α for internal consistency across everyone who has responded this session."
      />

      <AccountBar />

      {report && interp ? (
        <>
          <Panel>
            <View style={styles.overallRow}>
              <View>
                <Text style={styles.overallLabel}>OVERALL ADOPTION</Text>
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

          <Panel>
            <SectionHeading
              title="Reliability"
              detail="Cronbach's α — internal consistency across respondents."
            />
            <View style={styles.alphaRow}>
              <Text style={styles.alphaValue}>
                {typeof alphaVal === 'number' ? alphaVal.toFixed(2) : '—'}
              </Text>
              <Tag tone={alphaTone}>{alphaInterp.toUpperCase()}</Tag>
            </View>
            <Text style={styles.alphaNote}>
              {serverAnalysis
                ? `Authoritative research database metric across ${serverAnalysis.totalResponses} participants. α ≥ 0.70 indicates robust internal consistency.`
                : reliability.note ??
                  `Based on ${reliability.sampleSize} complete responses × ${reliability.itemCount} items. α ≥ 0.70 is the usual acceptance threshold.`}
            </Text>
          </Panel>

          {serverAnalysis?.experimentalComparison && (
            <Panel>
              <SectionHeading
                title="Experimental Arm Comparison"
                detail="Comparative adoption between gamified treatment arm and non-gamified control arm."
              />
              <View style={styles.statRow}>
                <Stat
                  label="Gamified Responses"
                  value={String(serverAnalysis.experimentalComparison.arms?.gamified?.count ?? 0)}
                />
                <Stat
                  label="Control Responses"
                  value={String(serverAnalysis.experimentalComparison.arms?.control?.count ?? 0)}
                />
              </View>
              {serverAnalysis.experimentalComparison.statisticalComparison && (
                <View style={{ marginTop: 14, gap: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.faint, letterSpacing: 0.8 }}>
                    STATISTICAL SIGNIFICANCE (WELCH'S T & HEDGES' G)
                  </Text>
                  {Object.entries(serverAnalysis.experimentalComparison.statisticalComparison).map(
                    ([code, stat]) => (
                      <View
                        key={code}
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          paddingVertical: 6,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.line,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink }}>
                          {code.toUpperCase()}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                          <Tag tone={stat.isSignificant ? 'teal' : 'slate'}>
                            {stat.isSignificant ? `p < 0.05 (${stat.significanceMarker})` : 'ns'}
                          </Tag>
                          <Text style={{ fontSize: 11, color: colors.muted }}>
                            g = {stat.hedgesG ?? '—'} ({stat.effectSize})
                          </Text>
                        </View>
                      </View>
                    ),
                  )}
                </View>
              )}
            </Panel>
          )}
        </>
      ) : (
        <Panel style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={styles.emptyTitle}>No report yet</Text>
          <Text style={styles.emptyBody}>
            Complete the HMSAM survey once and your construct profile and reliability report will
            appear here.
          </Text>
        </Panel>
      )}

      {profile ? (
        <Panel>
          <SectionHeading title="Your standing" detail="Cumulative voice points across surveys in this entity." />
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
  overallRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  overallLabel: { fontSize: 10, letterSpacing: 0.8, color: colors.faint, fontWeight: '700' },
  overallValue: { fontSize: 36, fontWeight: '400', color: colors.ink, fontFamily: serifFont },
  overallMax: { fontSize: 16, color: colors.faint, fontWeight: '600' },
  overallFoot: { fontSize: 12.5, lineHeight: 18, color: colors.muted, marginTop: 10, fontWeight: '500' },
  overallSubFoot: { fontSize: 11, color: colors.faint, marginTop: 4, fontWeight: '500' },
  alphaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  alphaValue: { fontSize: 38, fontWeight: '400', color: colors.primaryDeep, fontFamily: serifFont },
  alphaNote: { fontSize: 12, lineHeight: 18, color: colors.muted },
  emptyCard: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '400', color: colors.ink, fontFamily: serifFont },
  emptyBody: { fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: 'center', maxWidth: 340 },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  stat: { flex: 1, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radii.small, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '700', color: colors.ink },
  statLabel: { fontSize: 10, color: colors.muted, fontWeight: '600', marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
});
