import { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LegendList } from '@legendapp/list/react-native';
import type { Entity } from '../domain/types';
import { colors, radii, sansFont } from '../theme';

interface OrganizationPickerProps {
  entities: readonly Entity[];
  selectedId: string;
  membershipIds?: readonly string[];
  onSelect: (entityId: string) => void | Promise<void>;
  style?: StyleProp<ViewStyle>;
}

/** One research-scope selector shared by Survey and Community. */
export function OrganizationPicker({
  entities,
  selectedId,
  membershipIds = [],
  onSelect,
  style,
}: OrganizationPickerProps) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const { height: viewportHeight } = useWindowDimensions();
  const listHeight = Math.max(120, Math.min(320, viewportHeight * 0.42));
  const selected = entities.find((entity) => entity.id === selectedId) ?? entities[0];
  const searchable = entities.length >= 6;
  const filteredEntities = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!searchable || !normalizedQuery) return entities;
    return entities.filter((entity) =>
      `${entity.name} ${entity.type} ${entity.country ?? ''}`
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [entities, query, searchable]);

  const close = () => {
    setVisible(false);
    setQuery('');
  };

  return (
    <>
      <Pressable
        style={[styles.trigger, style]}
        onPress={() => setVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={`Current research scope: ${selected?.name ?? 'Choose scope'}. Change scope.`}
        accessibilityState={{ expanded: visible }}
      >
        <Text style={styles.icon}>
          {selected?.scopeKind === 'platform' ? '◉' : selected?.type === 'university' ? '🏛️' : selected?.type === 'research' ? '🔬' : '🏢'}
        </Text>
        <Text style={styles.triggerText} numberOfLines={1}>
          {selected?.name ?? 'Choose organization'}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close organization picker" />
          <View style={styles.sheet}>
            <Text style={styles.title}>Choose a research scope</Text>
            <Text style={styles.subtitle}>Points and progress stay separate for the platform and each organization.</Text>
            {searchable ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search scopes"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Search research scopes"
                returnKeyType="search"
                style={styles.search}
              />
            ) : null}
            <LegendList
              data={filteredEntities}
              keyExtractor={(entity) => entity.id}
              keyboardShouldPersistTaps="handled"
              style={[styles.list, { height: listHeight }]}
              renderItem={({ item: entity }) => {
                const isSelected = entity.id === selectedId;
                return (
                  <Pressable
                    key={entity.id}
                    style={[styles.option, isSelected && styles.optionSelected]}
                    onPress={() => {
                      close();
                      void onSelect(entity.id);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View style={styles.optionCopy}>
                      <Text style={styles.optionName}>{entity.name}</Text>
                      <Text style={styles.optionDetail}>
                        {[
                          entity.scopeKind === 'platform' ? 'Platform scope' : membershipIds.includes(entity.id) ? 'Member' : 'Available to join',
                          entity.type,
                          entity.country,
                        ].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Text style={styles.check}>{isSelected ? '✓' : ''}</Text>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.empty}>No research scopes match “{query}”.</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
  },
  icon: { fontSize: 16 },
  triggerText: { flex: 1, minWidth: 0, color: colors.ink, fontSize: Platform.select({ web: 14, default: 12 }), fontWeight: '700', fontFamily: sansFont },
  chevron: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 22,
    backgroundColor: 'rgba(20, 20, 15, 0.42)',
  },
  sheet: {
    maxHeight: '78%',
    padding: 18,
    borderRadius: 18,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
  },
  title: { color: colors.ink, fontSize: Platform.select({ web: 24, default: 18 }), lineHeight: Platform.select({ web: 32, default: 24 }), fontWeight: '800', fontFamily: sansFont },
  subtitle: { color: colors.muted, fontSize: Platform.select({ web: 16, default: 12 }), lineHeight: Platform.select({ web: 24, default: 18 }), marginTop: 4, marginBottom: 12, fontFamily: sansFont },
  search: {
    minHeight: 44,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    color: colors.ink,
    fontSize: Platform.select({ web: 16, default: 14 }),
    backgroundColor: '#FFFFFF',
  },
  list: {},
  option: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionSelected: { borderColor: colors.line, backgroundColor: '#F4F1F8' },
  optionCopy: { flex: 1, gap: 3 },
  optionName: { color: colors.ink, fontSize: Platform.select({ web: 16, default: 13 }), fontWeight: '700', fontFamily: sansFont },
  optionDetail: { color: colors.muted, fontSize: Platform.select({ web: 14, default: 11 }), lineHeight: 20, textTransform: 'capitalize', fontFamily: sansFont },
  check: { width: 22, color: colors.ink, textAlign: 'right', fontWeight: '800' },
  empty: { padding: 16, color: colors.muted, textAlign: 'center', fontSize: Platform.select({ web: 16, default: 12 }), fontFamily: sansFont },
});
