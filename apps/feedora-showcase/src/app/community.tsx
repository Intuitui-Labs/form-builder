import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { AppPage, BrandHeader, ContributorRow, Panel, SectionHeading } from '../components/FeedoraUi';
import { AccountBar } from '../components/AccountBar';
import { OrganizationPicker } from '../components/OrganizationPicker';
import { OrganizationStandingCard } from '../components/OrganizationStandingCard';
import { OrganizationPlatformSharingControl } from '../components/OrganizationPlatformSharingControl';
import { transportPort, useFeedora } from '../feedora';
import type { ContributionProfile } from '../domain/types';
import { colors } from '../theme';

export default function CommunityScreen() {
  const { entityId, entitiesList, membershipIds, joinEntity, profile, authUser, openAuthModal } = useFeedora();
  const selectedScope = entitiesList.find((entity) => entity.id === entityId);
  const isPlatform = selectedScope?.scopeKind === 'platform';
  const [contributors, setContributors] = useState<ContributionProfile[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLeaderboardLoading(true);
    setLeaderboardError(false);
    transportPort.fetchLeaderboard(entityId).then((result) => {
      if (!cancelled) setContributors(result.contributors.map((contributor) => ({
        ...contributor,
        updatedAt: new Date().toISOString(),
      })));
    }).catch(() => {
      if (!cancelled) {
        setContributors([]);
        setLeaderboardError(true);
      }
    }).finally(() => {
      if (!cancelled) setLeaderboardLoading(false);
    });
    return () => { cancelled = true; };
  }, [entityId, profile?.totalPoints, profile?.surveysCompleted]);

  return (
    <AppPage>
      <BrandHeader title="Contributors & standing" />
      <AccountBar />

      <Panel>
        <SectionHeading title="Research scope" />
        <OrganizationPicker
          entities={entitiesList}
          selectedId={entityId}
          membershipIds={membershipIds}
          onSelect={joinEntity}
        />
      </Panel>

      {selectedScope?.scopeKind === 'organization' && selectedScope.canManageAggregateSharing ? (
        <Panel>
          <OrganizationPlatformSharingControl
            organizationId={selectedScope.id.replace(/^org-/, '')}
            enabled={Boolean(selectedScope.aggregateStatsSharingEnabled)}
          />
        </Panel>
      ) : null}

      <OrganizationStandingCard
        profile={profile}
        detail={isPlatform ? 'Your platform-wide progress' : 'Your progress in this organization'}
        guest={!authUser}
        onSignIn={openAuthModal}
      />

      <Panel>
        <SectionHeading
          title={isPlatform ? 'Platform leaderboard' : 'Organization leaderboard'}
          detail={isPlatform
            ? 'Points and completions from platform-scoped surveys only.'
            : 'Points and completions from this organization’s surveys.'}
        />
        {leaderboardLoading ? (
          <Text style={styles.empty}>Loading {isPlatform ? 'platform' : 'organization'} standings…</Text>
        ) : leaderboardError ? (
          <Text style={styles.empty}>Standings are unavailable while the research server cannot be reached.</Text>
        ) : contributors.length === 0 ? (
          <Text style={styles.empty}>No completed responses in this {isPlatform ? 'platform' : 'organization'} scope yet.</Text>
        ) : contributors.map((contributor, index) => (
          <ContributorRow
            key={`${contributor.userId}-${contributor.entityId}`}
            rank={index + 1}
            avatar={contributor.avatar}
            name={contributor.displayName}
            points={contributor.totalPoints}
            standing={contributor.standing}
            isYou={contributor.userId === `user-${authUser?.id}` || contributor.userId === profile?.userId}
          />
        ))}
      </Panel>
    </AppPage>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 12, color: colors.muted, fontStyle: 'italic', paddingVertical: 8 },
});
