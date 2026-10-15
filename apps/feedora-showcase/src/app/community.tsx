import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  AppPage,
  BrandHeader,
  ContributorRow,
  EntityCard,
  LevelProgress,
  Panel,
  SectionHeading,
  Tag,
} from '../components/FeedoraUi';
import { AccountBar } from '../components/AccountBar';
import { contributionPort, entities, useFeedora } from '../feedora';
import type { ContributionProfile } from '../domain/types';
import { colors } from '../theme';

export default function CommunityScreen() {
  const { entityId, setEntityId, profile, contributorCounts, version } = useFeedora();
  const [contributors, setContributors] = useState<ContributionProfile[]>([]);

  useEffect(() => {
    let cancelled = false;
    contributionPort.listContributors(entityId).then((list) => {
      if (!cancelled) setContributors(list);
    });
    return () => {
      cancelled = true;
    };
  }, [entityId, version]);

  const entity = contributionPort.getEntity(entityId);

  return (
    <AppPage>
      <BrandHeader
        eyebrow="Voice economy"
        title="Contributors & standing"
        subtitle="People join an organization, contribute voice across surveys, and accumulate points that unlock levels and badges."
      />

      <AccountBar />

      <Panel>
        <SectionHeading title="Organizations" detail="Choose whose community you're contributing to." />
        {entities.map((item) => (
          <EntityCard
            key={item.id}
            entity={item}
            memberCount={contributorCounts[item.id] ?? 0}
            selected={item.id === entityId}
            onSelect={() => setEntityId(item.id)}
          />
        ))}
      </Panel>

      {entity ? (
        <Panel>
          <View style={styles.entityHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.entityName}>{entity.name}</Text>
              <Text style={styles.entityTagline}>{entity.tagline}</Text>
            </View>
            <Tag tone="violet">{entity.type.toUpperCase()}</Tag>
          </View>
        </Panel>
      ) : null}

      {profile ? (
        <Panel>
          <SectionHeading title="Your standing" />
          <LevelProgress standing={profile.standing} totalPoints={profile.totalPoints} />
        </Panel>
      ) : null}

      <Panel>
        <SectionHeading
          title="Leaderboard"
          detail="Strongest contributors in this entity, by cumulative voice points."
        />
        {contributors.length === 0 ? (
          <Text style={styles.empty}>No contributors yet — be the first.</Text>
        ) : (
          contributors.map((contributor, index) => (
            <ContributorRow
              key={`${contributor.userId}-${contributor.entityId}`}
              rank={index + 1}
              avatar={contributor.avatar}
              name={contributor.displayName}
              points={contributor.totalPoints}
              standing={contributor.standing}
              isYou={contributor.userId === profile?.userId}
            />
          ))
        )}
      </Panel>
    </AppPage>
  );
}

const styles = StyleSheet.create({
  entityHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  entityName: { fontSize: 17, fontWeight: '700', color: colors.ink },
  entityTagline: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { fontSize: 12, color: colors.muted, fontStyle: 'italic', paddingVertical: 8 },
});
