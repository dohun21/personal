// app/_layout.tsx
import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,  // ✅ 모든 화면의 상단바 제거
      }}
    />
  );
}
