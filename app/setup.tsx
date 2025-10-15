// app/setup.tsx
import { useRouter } from "expo-router";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import React, { useMemo, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { auth, db } from "../firebaseConfig";

type Importance = 1 | 2 | 3; // 1:높음 2:보통 3:낮음
type Task = {
  id: string;
  subject: string;
  importance: Importance;
  plan: string;
};

const SUBJECT_PRESETS = ["수학", "영어", "국어", "과학", "사회"];

export default function SetupPage() {
  const router = useRouter();

  const today = useMemo(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }, []);

  // 총 공부 시간(선택 입력)
  const [hours, setHours] = useState("2");
  const [mins, setMins] = useState("0");

  // 입력 폼
  const [subject, setSubject] = useState("");
  const [importance, setImportance] = useState<Importance>(1);
  const [plan, setPlan] = useState("");

  // 추가된 목록
  const [tasks, setTasks] = useState<Task[]>([]);
  const [saving, setSaving] = useState(false);

  const addTask = () => {
    if (!subject.trim()) return Alert.alert("과목을 입력해주세요.");
    if (!plan.trim()) return Alert.alert("세부 계획을 입력해주세요.");

    const newTask: Task = {
      id: `t_${Date.now()}`,
      subject: subject.trim(),
      importance,
      plan: plan.trim(),
    };
    setTasks((prev) => [newTask, ...prev]);

    // 초기화
    setSubject("");
    setImportance(1);
    setPlan("");
  };

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const onSave = async () => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("로그인이 필요합니다.");
    if (tasks.length === 0) return Alert.alert("최소 1개의 항목을 추가해주세요.");

    const totalMinutes =
      (parseInt(hours || "0", 10) || 0) * 60 + (parseInt(mins || "0", 10) || 0);

    try {
      setSaving(true);
      await setDoc(doc(db, "users", user.uid, "days", today), {
        date: today,
        prefs: { totalMinutes }, // 0이면 미입력으로 간주
        tasks: tasks.map(({ id, subject, importance, plan }) => ({
          id,
          subject,
          importance, // 1:높음 2:보통 3:낮음
          plan,
        })),
        schedule: [], // AI 배치 전
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      router.push("/aischedule");
    } catch (e: any) {
      Alert.alert("저장 실패", e?.message ?? "다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: "padding", android: undefined })}
      style={{ flex: 1, backgroundColor: "#fff" }}
    >
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 헤더 */}
        <Text style={{ fontSize: 24, fontWeight: "800", color: "#111827" }}>
          사전 설정
        </Text>
        <Text style={{ color: "#6B7280", marginTop: 6 }}>
          오늘의 공부 시간을 정하고, 할 일을 추가하세요.
        </Text>

        {/* 총 공부 시간 */}
        <View style={card}>
          <Text style={sectionTitle}>오늘 총 공부 시간 (선택)</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <TextInput
              value={hours}
              onChangeText={(t) => setHours(t.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              placeholder="시간"
              style={[input, { flex: 1 }]}
            />
            <TextInput
              value={mins}
              onChangeText={(t) => setMins(t.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              placeholder="분"
              style={[input, { flex: 1 }]}
            />
          </View>
          <Text style={hint}>예: 2시간 30분 → ‘2’와 ‘30’ 입력</Text>
        </View>

        {/* 과목/중요도/세부계획 입력 */}
        <View style={[card, { gap: 12 }]}>
          <Text style={sectionTitle}>공부할 내용 추가</Text>

          {/* 과목 프리셋 + 직접 입력 */}
          <Text style={label}>과목</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {SUBJECT_PRESETS.map((name) => (
              <TouchableOpacity
                key={name}
                onPress={() => setSubject(name)}
                style={[chip, subject === name && { backgroundColor: "#3B82F6" }]}
              >
                <Text
                  style={{
                    color: subject === name ? "#fff" : "#374151",
                    fontWeight: "700",
                  }}
                >
                  {name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="직접 입력 (예: 한국사)"
            style={input}
          />

          {/* 중요도 */}
          <Text style={label}>중요도</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {([1, 2, 3] as const).map((lv) => (
              <TouchableOpacity
                key={lv}
                onPress={() => setImportance(lv)}
                style={[chip, importance === lv && { backgroundColor: "#3B82F6" }]}
              >
                <Text
                  style={{
                    color: importance === lv ? "#fff" : "#374151",
                    fontWeight: "700",
                  }}
                >
                  {lv === 1 ? "높음" : lv === 2 ? "보통" : "낮음"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 세부 계획 */}
          <Text style={label}>세부 계획</Text>
          <TextInput
            value={plan}
            onChangeText={setPlan}
            placeholder="예: 2단원 개념 정리 + 문제 20개"
            multiline
            style={[input, { height: 96, textAlignVertical: "top" }]}
          />

          <TouchableOpacity onPress={addTask} style={primaryBtn}>
            <Text style={primaryBtnText}>할 일 추가</Text>
          </TouchableOpacity>
        </View>

        {/* 추가된 리스트 */}
        {tasks.length > 0 && (
          <View style={[card, { gap: 8 }]}>
            <Text style={sectionTitle}>오늘 입력한 할 일</Text>
            {tasks.map((t) => (
              <View
                key={t.id}
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  padding: 12,
                }}
              >
                <Text style={{ fontWeight: "800", color: "#111827" }}>
                  {t.subject} · {t.importance === 1 ? "높음" : t.importance === 2 ? "보통" : "낮음"}
                </Text>
                <Text style={{ color: "#6B7280", marginTop: 4 }}>{t.plan}</Text>
                <TouchableOpacity
                  onPress={() => removeTask(t.id)}
                  style={{ alignSelf: "flex-end", marginTop: 8, padding: 6 }}
                >
                  <Text style={{ color: "#EF4444", fontWeight: "700" }}>삭제</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* 저장 & 다음 */}
        <TouchableOpacity
          onPress={onSave}
          disabled={saving}
          style={[primaryBtn, { backgroundColor: "#10B981", marginTop: 16 }]}
        >
          <Text style={primaryBtnText}>
            {saving ? "저장 중..." : "저장하고 다음으로"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* 스타일 */
const card = {
  marginTop: 16,
  backgroundColor: "#F9FAFB",
  borderRadius: 16,
  padding: 16,
} as const;

const sectionTitle = {
  fontWeight: "800" as const,
  color: "#111827",
  marginBottom: 10,
} as const;

const label = { color: "#374151", fontWeight: "700" as const } as const;
const hint = { color: "#6B7280", marginTop: 8 } as const;

const input = {
  backgroundColor: "#fff",
  borderRadius: 12,
  borderWidth: 1,
  borderColor: "#E5E7EB",
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 16 as const,
} as const;

const chip = {
  paddingHorizontal: 14,
  paddingVertical: 8,
  borderRadius: 9999,
  backgroundColor: "#E5E7EB",
} as const;

const primaryBtn = {
  height: 48,
  borderRadius: 14,
  backgroundColor: "#3B82F6",
  alignItems: "center",
  justifyContent: "center",
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 3 },
} as const;

const primaryBtnText = {
  color: "#fff",
  fontWeight: "800" as const,
  fontSize: 16 as const,
} as const;
