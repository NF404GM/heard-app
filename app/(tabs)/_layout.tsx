import { Tabs } from 'expo-router';
import { tokens } from '../../src/theme/tokens';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: tokens.colors.text,
        tabBarInactiveTintColor: tokens.colors.textMuted,
        tabBarStyle: {
          backgroundColor: tokens.colors.surface,
          borderTopColor: tokens.colors.surfaceLight,
        },
        headerStyle: { backgroundColor: tokens.colors.bg },
        headerTintColor: tokens.colors.text,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Collection',
          tabBarLabel: 'Collection',
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarLabel: 'Explore',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
        }}
      />
    </Tabs>
  );
}
