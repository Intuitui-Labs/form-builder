import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { transportPort } from '../feedora';
import { colors } from '../theme';

export function OrganizationPlatformSharingControl({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}) {
  const [value, setValue] = useState(enabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(enabled);
    setError(null);
  }, [organizationId, enabled]);

  const update = async (next: boolean) => {
    setPending(true);
    setError(null);
    try {
      await transportPort.setOrganizationAggregateSharing(organizationId, next);
      setValue(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this setting.');
    } finally {
      setPending(false);
    }
  };

  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.title}>Share aggregate activity with Feedora</Text>
        <Text style={styles.detail}>
          Monthly completion counts are shared by default. No respondent identities, answers, individual points, or rewards are shared.
          An organization owner can turn this off at any time; doing so removes its saved aggregate counts.
        </Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </View>
      {pending ? <ActivityIndicator accessibilityLabel="Saving sharing preference" /> : (
        <Switch
          value={value}
          onValueChange={(next) => void update(next)}
          accessibilityLabel="Share aggregate completion counts with Feedora"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  copy: { flex: 1, gap: 6 },
  title: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  detail: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  error: { color: '#a22', fontSize: 12 },
});
