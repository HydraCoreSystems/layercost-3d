import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LayerCostProvider } from '../src/store/useLayerCostStore';
import { EntitlementProvider } from '../src/services/EntitlementProvider';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LayerCostProvider>
        <EntitlementProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </EntitlementProvider>
      </LayerCostProvider>
    </SafeAreaProvider>
  );
}

