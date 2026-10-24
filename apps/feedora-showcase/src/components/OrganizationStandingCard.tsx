import type { ContributionProfile } from '../domain/types';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, LevelProgress, Panel, SectionHeading } from './FeedoraUi';
import { colors, radii } from '../theme';

/** One consistent, activity-backed standing summary for Insights and Community. */
export function OrganizationStandingCard({
  profile,
  detail = 'Your progress is scoped to the selected organization.',
  guest = false,
  onSignIn,
}: {
  profile: ContributionProfile | null;
  detail?: string;
  guest?: boolean;
  onSignIn?: () => void;
}) {
  if (!profile || (profile.surveysCompleted < 1 && profile.totalPoints < 1)) return null;

  return (
    <Panel>
      <SectionHeading title="Your standing" detail={detail} />
      <LevelProgress standing={profile.standing} totalPoints={profile.totalPoints} />
      {guest && onSignIn ? (
        <View style={styles.guestPrompt}>
          <Text style={styles.guestPromptText}>
            Save your points and join the community leaderboard.
          </Text>
          <ActionButton label="Sign in or create account" secondary compact onPress={onSignIn} />
        </View>
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  guestPrompt: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: 16,
    paddingTop: 14,
    gap: 10,
  },
  guestPromptText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
});
