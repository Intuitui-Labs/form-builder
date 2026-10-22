import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFeedora } from '../feedora';
import { colors, radii, sansFont } from '../theme';

export function AccountBar() {
  const { authUser, profile, entitiesList, entityId, openAccountDrawer, openWelcome, effectiveRole, previewRole } = useFeedora();

  if (!authUser) {
    const unsavedPoints = profile?.totalPoints ?? 0;
    return (
      <View style={styles.container}>
        <View style={styles.guestRow}>
          <Text style={styles.guestText}>
            🎓 Guest{unsavedPoints > 0 ? ` · 💎 ${unsavedPoints} pts` : ''}
          </Text>
          <Pressable style={styles.signInBtn} onPress={openWelcome}>
            <Text style={styles.signInBtnText}>Sign In / Register →</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const isCreator = authUser.role === 'creator';
  const isPreviewing = isCreator && previewRole === 'respondent';
  const displayedPoints = profile?.totalPoints ?? 0;
  const selectedOrganization = entitiesList.find((entity) => entity.id === entityId)?.name;

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
                {isPreviewing ? '👁️ PREVIEWING' : isCreator ? '🔬 CREATOR' : '🎓 RESPONDENT'}
              </Text>
            </View>
          </View>
          <View style={styles.subRow}>
            <Text style={styles.orgSub} numberOfLines={1}>
              {selectedOrganization || authUser.organizationName || 'Organization'}
            </Text>
            {!isCreator && (
              <Text style={styles.pointsSub}>
                {' '}· 💎 {displayedPoints.toLocaleString()} pts
              </Text>
            )}
          </View>
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
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    fontWeight: '600',
    fontFamily: sansFont,
  },
  signInBtn: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.small,
    paddingHorizontal: 14,
  },
  signInBtnText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    fontFamily: sansFont,
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
});
