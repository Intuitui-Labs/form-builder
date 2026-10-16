import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFeedora } from '../feedora';
import { colors, radii } from '../theme';

export function AccountBar() {
  const { authUser, authMode, profile, openAccountDrawer, openAuthModal } = useFeedora();

  if (!authUser) {
    return (
      <View style={styles.container}>
        <View style={styles.guestRow}>
          <Text style={styles.guestText}>Browsing as Guest · Choose auth engine</Text>
          <Pressable style={styles.signInBtn} onPress={openAuthModal}>
            <Text style={styles.signInBtnText}>Sign In / Register</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const isCreator = authUser.role === 'creator';
  const engineLabel =
    authMode === 'local' ? '⚡ SQLite' : authMode === 'supabase' ? '☁️ Supabase' : '🐍 Django';
  const displayedPoints = Math.max(profile?.totalPoints ?? 0, authUser.totalPoints ?? 0);

  return (
    <View style={styles.container}>
      <Pressable style={styles.userCard} onPress={openAccountDrawer}>
        <Text style={styles.avatar}>{authUser.avatar}</Text>
        <View style={styles.nameCol}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {authUser.displayName}
            </Text>
            <View
              style={[
                styles.rolePill,
                isCreator ? styles.rolePillCreator : styles.rolePillRespondent,
              ]}
            >
              <Text
                style={[
                  styles.rolePillText,
                  isCreator ? styles.rolePillTextCreator : styles.rolePillTextRespondent,
                ]}
              >
                {isCreator ? 'CREATOR' : 'RESPONDENT'}
              </Text>
            </View>
          </View>
          <View style={styles.subRow}>
            <Text style={styles.orgSub} numberOfLines={1}>
              {authUser.organizationName || 'University of Moratuwa'}
            </Text>
            {!isCreator && (
              <Text style={styles.pointsSub}>
                {' '}· 💎 {displayedPoints.toLocaleString()} pts
              </Text>
            )}
          </View>
        </View>

        {/* Engine switcher indicator */}
        <View style={styles.enginePill}>
          <Text style={styles.engineText}>{engineLabel}</Text>
          <Text style={styles.chevron}>▾</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.canvas,
    borderRadius: radii.medium,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  guestText: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '600',
  },
  signInBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.small,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  signInBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderRadius: radii.medium,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: '#1B1533',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
    gap: 10,
  },
  avatar: {
    fontSize: 22,
  },
  nameCol: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
  },
  rolePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  rolePillRespondent: {
    backgroundColor: colors.primarySoft,
  },
  rolePillCreator: {
    backgroundColor: colors.goldSoft,
  },
  rolePillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  rolePillTextRespondent: {
    color: colors.primary,
  },
  rolePillTextCreator: {
    color: colors.gold,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  orgSub: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '600',
    marginTop: 1,
  },
  pointsSub: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '800',
    marginTop: 1,
  },
  enginePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvas,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  engineText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.slate,
  },
  chevron: {
    fontSize: 10,
    color: colors.faint,
  },
});
