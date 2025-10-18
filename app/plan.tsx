// app/plan.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

export default function PlanScreen() {
  const router = useRouter();
  const { data } = useLocalSearchParams();
  const schedule = JSON.parse((data as string) || "[]");

  const [index, setIndex] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);

  const current = schedule[index];
  const isLast = index === schedule.length - 1;

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (running) timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const onNext = () => {
    if (!isLast) {
      setRunning(false);
      setSeconds(0);
      setIndex((i) => i + 1);
    } else {
      router.push("/review");
    }
  };

  if (!schedule.length) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
        <Text>AI가 만든 스케줄이 없습니다.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#fff", padding: 24 }}
      contentContainerStyle={{ alignItems: "center" }}
    >
      <Text style={{ fontSize: 22, fontWeight: "900" }}>오늘의 학습 스케줄</Text>

      {/* 진행 표시 */}
      <Text style={{ color: "#6B7280", marginTop: 4 }}>
        {index + 1} / {schedule.length}
      </Text>

      {/* 현재 과목 카드 */}
      <View
        style={{
          backgroundColor: "#F9FAFB",
          borderColor: "#E5E7EB",
          borderWidth: 1,
          borderRadius: 16,
          padding: 24,
          marginTop: 16,
          width: "100%",
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: "900" }}>{current.subject}</Text>
        <Text style={{ color: "#6B7280", marginTop: 6 }}>{current.detail}</Text>
        <Text style={{ marginTop: 10, color: "#111827" }}>
          {current.start} ~ {current.end}
        </Text>

        <View style={{ alignItems: "center", marginTop: 24 }}>
          <Text style={{ fontSize: 48, fontWeight: "900" }}>{formatTime(seconds)}</Text>

          <TouchableOpacity
            onPress={() => setRunning((r) => !r)}
            style={{
              backgroundColor: running ? "#EF4444" : "#3B82F6",
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 24,
              marginTop: 10,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>
              {running ? "일시정지" : "시작"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onNext}
            style={{
              backgroundColor: "#10B981",
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 24,
              marginTop: 12,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>
              {isLast ? "모든 과목 완료" : "다음 과목으로"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 아래 전체 목록 */}
      <View style={{ width: "100%", marginTop: 20 }}>
        <Text style={{ fontWeight: "800", marginBottom: 8 }}>오늘의 전체 계획</Text>
        {schedule.map((item: any, i: number) => (
          <View
            key={i}
            style={{
              backgroundColor: i === index ? "#DBEAFE" : "#F3F4F6",
              borderRadius: 10,
              padding: 10,
              marginBottom: 8,
            }}
          >
            <Text style={{ fontWeight: "700" }}>
              {i + 1}. {item.subject}
            </Text>
            <Text style={{ color: "#6B7280" }}>{item.start} ~ {item.end}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
