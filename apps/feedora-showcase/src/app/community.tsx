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
import { FEEDORA_BADGES, type ContributionProfile } from '../domain/types';
import { colors } from '../theme';

export default function CommunityScreen() {
  const {
    entityId,
    setEntityId,
    entitiesList,
    joinEntity,
    profile,
    contributorCounts,
    version,
  } = useFeedora();
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
        {(entitiesList || entities).map((item) => (
          <EntityCard
            key={item.id}
            entity={item}
            memberCount={contributorCounts[item.id] ?? 0}
            selected={item.id === entityId}
            onSelect={() => joinEntity(item.id)}
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
          title="Badges & recognition"
          detail="Participation milestones earned across surveys."
        />
        <View style={styles.badgesRow}>
          {FEEDORA_BADGES.map((b) => {
            const completedCount = profile?.surveysCompleted ?? 0;
            const isUnlocked = completedCount >= b.minResponses;
            return (
              <View
                key={b.id}
                style={[
                  styles.badgeCard,
                  isUnlocked ? styles.badgeCardUnlocked : styles.badgeCardLocked,
                ]}
              >
                <Text style={[styles.badgeIcon, !isUnlocked && styles.badgeIconLocked]}>
                  {b.icon}
                </Text>
                <Text style={styles.badgeName}>{b.label}</Text>
                <Text style={styles.badgeRule}>{b.rule}</Text>
                <View
                  style={[
                    styles.badgePill,
                    isUnlocked ? styles.badgePillUnlocked : styles.badgePillLocked,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgePillText,
                      isUnlocked ? styles.badgePillTextUnlocked : styles.badgePillTextLocked,
                    ]}
                  >
                    {isUnlocked ? '✓ Unlocked' : `${completedCount}/${b.minResponses}`}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </Panel>

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
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  badgeCard: {
    flex: 1,
    minWidth: 95,
    backgroundColor: colors.paper,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    gap: 4,
  },
  badgeCardUnlocked: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  badgeCardLocked: {
    opacity: 0.6,
  },
  badgeIcon: {
    fontSize: 26,
    marginBottom: 2,
  },
  badgeIconLocked: {
    opacity: 0.35,
  },
  badgeName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  badgeRule: {
    fontSize: 10,
    color: colors.muted,
    textAlign: 'center',
    minHeight: 24,
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    marginTop: 4,
  },
  badgePillUnlocked: {
    backgroundColor: '#DCFCE7',
  },
  badgePillLocked: {
    backgroundColor: '#F3F4F6',
  },
  badgePillText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  badgePillTextUnlocked: {
    color: '#166534',
  },
  badgePillTextLocked: {
    color: '#6B7280',
  },
});
