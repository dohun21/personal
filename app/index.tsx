import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function StartScreen() {
  const router = useRouter();

  const handleStart = () => {
    router.push("/login");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.appTitle}>StudyFit</Text>

      <TouchableOpacity style={styles.startButton} onPress={handleStart} activeOpacity={0.8}>
        <Text style={styles.startButtonText}>시작하기</Text>
      </TouchableOpacity>
    </View>
  );
}

/* =========================
 *  스타일 
 * ========================= */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  appTitle: {
    fontSize: 42,
    fontWeight: "700",
    color: "#059669",
    marginBottom: 300,
  },
  startButton: {
    width: "100%",
    maxWidth: 320,
    height: 52,
    backgroundColor: "#3B82F6",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3, 
  },
  startButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
});
