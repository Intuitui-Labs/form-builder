import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { AppPage, BrandHeader, ContributorRow, Panel, SectionHeading } from '../components/FeedoraUi';
import { AccountBar } from '../components/AccountBar';
import { OrganizationPicker } from '../components/OrganizationPicker';
import { OrganizationStandingCard } from '../components/OrganizationStandingCard';
import { transportPort, useFeedora } from '../feedora';
import type { ContributionProfile } from '../domain/types';
import { colors } from '../theme';

export default function CommunityScreen() {
  const { entityId, entitiesList, membershipIds, joinEntity, profile, authUser, openAuthModal } = useFeedora();
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
        <SectionHeading title="Organization" />
        <OrganizationPicker
          entities={entitiesList}
          selectedId={entityId}
          membershipIds={membershipIds}
          onSelect={joinEntity}
        />
      </Panel>

      <OrganizationStandingCard
        profile={profile}
        guest={!authUser}
        onSignIn={openAuthModal}
      />

      <Panel>
        <SectionHeading title="Organization leaderboard" detail="Points and completions from this organization’s surveys." />
        {leaderboardLoading ? (
          <Text style={styles.empty}>Loading organization standings…</Text>
        ) : leaderboardError ? (
          <Text style={styles.empty}>Standings are unavailable while the research server cannot be reached.</Text>
        ) : contributors.length === 0 ? (
          <Text style={styles.empty}>No completed responses in this organization yet.</Text>
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
