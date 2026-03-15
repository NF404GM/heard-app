import { Stack } from 'expo-router/stack';
import { GPUProvider } from '../src/gpu/context';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { tokens } from '../src/theme/tokens';

export default function RootLayout() {
  return (
    <GPUProvider>
      <View style={{ flex: 1, backgroundColor: tokens.colors.bg }}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: tokens.colors.bg },
            headerTintColor: tokens.colors.text,
            contentStyle: { backgroundColor: tokens.colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="card/[id]" options={{ title: 'Card', presentation: 'modal' }} />
          <Stack.Screen name="deck/[id]" options={{ title: 'Deck' }} />
          <Stack.Screen name="circle/index" options={{ title: 'Close Circle' }} />
        </Stack>
      </View>
    </GPUProvider>
  );
}
