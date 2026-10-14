import { Tabs } from 'expo-router';
import { colors } from '../theme';

export default function RootLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.violet,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', paddingBottom: 4 },
        tabBarStyle: {
          height: 66,
          paddingTop: 7,
          paddingBottom: 6,
          backgroundColor: '#FFFFFF',
          borderTopColor: colors.line,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Multi-step' }} />
      <Tabs.Screen name="experiments" options={{ title: 'A/B Flags' }} />
      <Tabs.Screen name="hydration" options={{ title: 'JSON hydrate' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Telemetry' }} />
      <Tabs.Screen name="compatibility" options={{ title: 'Notes' }} />
    </Tabs>
  );
}
