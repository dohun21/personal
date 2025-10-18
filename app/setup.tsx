// app/setup.tsx
import { auth } from "@/firebaseConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Priority = "필수" | "중요" | "선택";
type Plan = {
  id: string;
  subject: string;
  content: string;
  priority: Priority;
  minutes: number;
  done?: boolean;
  createdAt?: string;
};

const COLOR = {
  text: "#0F172A",
  muted: "#6B7280",
  border: "#E5E7EB",
  card: "#FFFFFF",
  bg: "#FFFFFF",
  primary: "#2563EB",
  red: "#EF4444",
  amber: "#F59E0B",
  green: "#10B981",
  chip: "#F3F4F6",
};
const P_COLOR: Record<Priority, string> = {
  필수: COLOR.red,
  중요: COLOR.amber,
  선택: COLOR.green,
};
const SUBJECTS = ["국어", "영어", "수학", "과학", "역사", "사회"];

const keyWithUid = (base: string, uid: string) => `${base}_${uid}`;

export default function SetupPage() {
  const router = useRouter();

  // ✅ 로그인 UID
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  // 폼 상태
  const [priority, setPriority] = useState<Priority>("필수");
  const [subject, setSubject] = useState("국어");
  const [openSubjects, setOpenSubjects] = useState(false);
  const [content, setContent] = useState("");

  // 🔁 시간 Picker (시/분 휠)
  const HOURS = useMemo(() => Array.from({ length: 7 }, (_, i) => i), []); // 0~6h
  const MINUTES = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 5), []); // 0..55 step 5
  const [hour, setHour] = useState(1);
  const [minute, setMinute] = useState(0);
  const totalMinutes = hour * 60 + minute;

  // ✅ 저장 (todayPlans + todayPlans_<uid>)
  const saveTask = async () => {
    if (!content.trim()) {
      Alert.alert("입력 필요", "세부계획을 적어주세요.");
      return;
    }
    if (totalMinutes <= 0) {
      Alert.alert("시간 필요", "예상 시간을 1분 이상으로 설정하세요.");
      return;
    }

    const id = `${Date.now()}`;
    const newPlan: Plan = {
      id,
      subject,
      content: content.trim(),
      priority,
      minutes: totalMinutes,
      done: false,
      createdAt: new Date().toISOString(),
    };

    const raw = await AsyncStorage.getItem("todayPlans");
    const list: Plan[] = raw ? JSON.parse(raw) : [];
    const next = [newPlan, ...list];
    await AsyncStorage.setItem("todayPlans", JSON.stringify(next));

    if (uid) {
      const rawU = await AsyncStorage.getItem(keyWithUid("todayPlans", uid));
      const listU: Plan[] = rawU ? JSON.parse(rawU) : [];
      const nextU = [newPlan, ...listU];
      await AsyncStorage.setItem(keyWithUid("todayPlans", uid), JSON.stringify(nextU));
    }

    router.replace("/list");
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: 30 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>공부 항목 추가</Text>

      {/* 우선순위 세그먼트 */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>우선순위</Text>
        <View style={styles.segmentWrap}>
          {(["필수", "중요", "선택"] as Priority[]).map((p, idx) => {
            const selected = p === priority;
            return (
              <TouchableOpacity
                key={p}
                style={[
                  styles.segmentItem,
                  idx < 2 && styles.segmentDivider,
                  selected && {
                    backgroundColor: `${P_COLOR[p]}14`,
                    borderColor: P_COLOR[p],
                  },
                ]}
                onPress={() => setPriority(p)}
                activeOpacity={0.9}
              >
                <View style={[styles.dot, { backgroundColor: P_COLOR[p] }]} />
                <Text style={[styles.segmentTxt, selected && { color: P_COLOR[p], fontWeight: "800" }]}>{p}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 과목 드롭다운 */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>과목</Text>
        <TouchableOpacity
          style={styles.dropdown}
          onPress={() => setOpenSubjects((o) => !o)}
          activeOpacity={0.85}
        >
          <Text style={styles.dropdownText}>{subject}</Text>
          <Text style={styles.dropdownCaret}>{openSubjects ? "︿" : "﹀"}</Text>
        </TouchableOpacity>
        {openSubjects && (
          <View style={styles.dropdownList}>
            {SUBJECTS.map((s) => (
              <TouchableOpacity
                key={s}
                style={styles.dropdownItem}
                onPress={() => {
                  setSubject(s);
                  setOpenSubjects(false);
                }}
              >
                <Text style={[styles.dropdownItemTxt, s === subject && { color: COLOR.primary, fontWeight: "800" }]}>
                  {s}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* 세부계획: 한 줄 입력 */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>세부계획</Text>
        <TextInput
          style={styles.singleLine}
          placeholder="예: 확률 단원 정리 + 기출 10문제"
          value={content}
          onChangeText={setContent}
          numberOfLines={1}
          multiline={false}
          returnKeyType="done"
          maxLength={80}
        />
      </View>

      {/* 예상 시간: Picker 휠 (시 : 분) */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>예상 시간</Text>
        <View style={styles.pickerRow}>
          <View style={styles.pickerBox}>
            <Picker
              selectedValue={hour}
              onValueChange={(v) => setHour(v)}
              style={styles.picker}
              itemStyle={styles.pickerItem}
            >
              {HOURS.map((h) => (
                <Picker.Item key={h} label={`${h} 시간`} value={h} />
              ))}
            </Picker>
          </View>
          <Text style={styles.colon}>:</Text>
          <View style={styles.pickerBox}>
            <Picker
              selectedValue={minute}
              onValueChange={(v) => setMinute(v)}
              style={styles.picker}
              itemStyle={styles.pickerItem}
            >
              {MINUTES.map((mm) => (
                <Picker.Item key={mm} label={`${mm} 분`} value={mm} />
              ))}
            </Picker>
          </View>
        </View>
        <Text style={styles.totalHint}>
          현재 선택: {hour > 0 ? `${hour}시간 ` : ""}{minute}분 (총 {totalMinutes}분)
        </Text>
      </View>

      {/* 저장 */}
      <TouchableOpacity style={styles.primaryBtn} onPress={saveTask} activeOpacity={0.9}>
        <Text style={styles.primaryBtnTxt}>저장</Text>
      </TouchableOpacity>

      {/* 목록으로 이동 */}
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: "#111827" }]}
        onPress={() => router.push("/list")}
        activeOpacity={0.9}
      >
        <Text style={styles.primaryBtnTxt}>list으로 가기</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg, padding: 20 },
  title: { fontSize: 24, fontWeight: "800", color: COLOR.text, marginBottom: 20, marginTop: 60 },

  /* 공통 카드 */
  card: {
    borderWidth: 1,
    borderColor: COLOR.border,
    backgroundColor: COLOR.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
    }),
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: COLOR.text, marginBottom: 10 },

  /* 드롭다운 */
  dropdown: {
    borderWidth: 1,
    borderColor: COLOR.border,
    backgroundColor: COLOR.card,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownText: { fontSize: 15, fontWeight: "800", color: COLOR.text },
  dropdownCaret: { fontSize: 18, color: COLOR.muted },
  dropdownList: {
    borderWidth: 1,
    borderColor: COLOR.border,
    backgroundColor: COLOR.card,
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 6,
  },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  dropdownItemTxt: { fontSize: 16, color: COLOR.text },

  /* 세부계획: 한 줄 */
  singleLine: {
    borderWidth: 1,
    borderColor: COLOR.border,
    backgroundColor: COLOR.card,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },

  /* Picker 레이아웃 */
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  pickerBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLOR.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#FFF",
  },
  picker: {
    width: "100%",
    height: 160, // 휠 높이
  },
  pickerItem: {
    fontSize: 18,
  } as any,
  colon: { width: 18, textAlign: "center", fontSize: 18, color: COLOR.muted },

  totalHint: { marginTop: 10, color: COLOR.muted, fontSize: 13 },

  /* 우선순위 세그먼트 */
  segmentWrap: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: COLOR.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLOR.card,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderColor: COLOR.border,
  },
  segmentDivider: { borderRightWidth: 1, borderRightColor: COLOR.border },
  segmentTxt: { fontWeight: "700", color: COLOR.text },
  dot: { width: 10, height: 10, borderRadius: 999, marginBottom: 4 },

  /* 버튼 */
  primaryBtn: {
    backgroundColor: COLOR.primary,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 16,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 3 },
    }),
  },
  primaryBtnTxt: { color: "#fff", textAlign: "center", fontWeight: "900", fontSize: 16 },
});
