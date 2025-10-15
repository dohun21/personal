// app/_layout.tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* 상태바 표시 */}
      <StatusBar style="dark" hidden={false} translucent={false} />
      
      {/* 네비게이션 스택 */}
      <Stack
        screenOptions={{
          headerShown: false, // 상단 네비게이션 헤더만 제거
        }}
      />
    </SafeAreaProvider>
  );
}
