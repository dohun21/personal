// app/list.tsx
import { auth } from "@/firebaseConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Priority = "필수" | "중요" | "선택";
type Plan = { id: string; subject: string; content: string; priority: Priority; minutes: number; createdAt?: string };

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
};
const P_COLOR: Record<Priority, string> = { 필수: COLOR.red, 중요: COLOR.amber, 선택: COLOR.green };

const keyWithUid = (base: string, uid: string) => `${base}_${uid}`;

// 우선순위 정렬 가중치 (낮을수록 위로)
const PRIORITY_RANK: Record<Priority, number> = { 필수: 0, 중요: 1, 선택: 2 };

export default function TaskListScreen() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Plan[]>([]);
  const listRef = useRef<FlatList<Plan>>(null);
  const [showGoTop, setShowGoTop] = useState(false);

  // ✅ UID 구하기
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  // ✅ uid 키 우선 읽기 → 없으면 기본 키
  const load = useCallback(async () => {
    try {
      if (uid) {
        const rawU = await AsyncStorage.getItem(keyWithUid("todayPlans", uid));
        if (rawU) {
          setTasks(JSON.parse(rawU) as Plan[]);
          return;
        }
      }
      const raw = await AsyncStorage.getItem("todayPlans");
      setTasks(raw ? (JSON.parse(raw) as Plan[]) : []);
    } catch {
      setTasks([]);
    }
  }, [uid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ✅ 정렬된 목록 (필수 → 중요 → 선택, 같은 우선순위는 최신 등록 우선)
  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr !== 0) return pr;
      // createdAt 내림차순(최근이 위)
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    });
  }, [tasks]);

  // ✅ 삭제 시 두 키 모두 반영
  const remove = useCallback(
    async (id: string) => {
      const next = tasks.filter((t) => t.id !== id);
      setTasks(next);

      // 기본 키
      const raw = await AsyncStorage.getItem("todayPlans");
      const list: Plan[] = raw ? JSON.parse(raw) : [];
      const nextPlans = list.filter((p) => p.id !== id);
      await AsyncStorage.setItem("todayPlans", JSON.stringify(nextPlans));

      // uid 키
      if (uid) {
        const rawU = await AsyncStorage.getItem(keyWithUid("todayPlans", uid));
        const listU: Plan[] = rawU ? JSON.parse(rawU) : [];
        const nextU = listU.filter((p) => p.id !== id);
        await AsyncStorage.setItem(keyWithUid("todayPlans", uid), JSON.stringify(nextU));
      }
    },
    [tasks, uid]
  );

  // 등록 시각(KST) 표시용
  const toKSTTime = (iso?: string) => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      const str = d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
      return str;
    } catch {
      return null;
    }
  };

  // 스크롤 위치에 따라 "맨위" 버튼 표시
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    setShowGoTop(y > 300);
  };

  const renderItem = ({ item }: { item: Plan }) => {
    const created = toKSTTime(item.createdAt);
    return (
      <View style={[styles.card, { borderLeftColor: P_COLOR[item.priority] }]}>
        {/* 상단: 과목(굵게) + 삭제 */}
        <View style={styles.row}>
          <Text style={styles.subject}>{item.subject}</Text>
          <TouchableOpacity onPress={() => remove(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.delete}>삭제</Text>
          </TouchableOpacity>
        </View>

        {/* 본문: 세부 계획 */}
        <Text style={styles.content}>{item.content}</Text>

        {/* 하단: 왼쪽 우선순위 / 오른쪽 예상 소요 시간*/}
        <View style={styles.footerRow}>
          <View style={[styles.badge, { backgroundColor: `${P_COLOR[item.priority]}22`, borderColor: P_COLOR[item.priority] }]}>
            <View style={[styles.dot, { backgroundColor: P_COLOR[item.priority] }]} />
            <Text style={[styles.badgeTxt, { color: P_COLOR[item.priority] }]}>{item.priority}</Text>
          </View>

          <View style={styles.right}>
            <View style={styles.timeBadge}>
              <Text style={styles.timeTxt}>예상 소요 {item.minutes}분</Text>
            </View>
           
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>오늘의 공부 목록</Text>

      {sorted.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTxt}>아직 추가된 공부가 없어요.</Text>
          <TouchableOpacity style={styles.linkBtn} onPress={() => router.push("/setup")}>
            <Text style={styles.linkBtnTxt}>지금 추가하기</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={sorted}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 140 }}
          onScroll={onScroll}
          scrollEventThrottle={16}
        />
      )}

      {/* 하단: AI에게 요청 */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.aiBtn}  onPress={() => router.push({ pathname: "/setting", params: { auto: "1" } })} activeOpacity={0.9}>
          <Text style={styles.aiBtnTxt}>AI에게 요청</Text>
        </TouchableOpacity>
      </View>

      {/* 우하단 FAB(+) */}
      <TouchableOpacity style={styles.fab} onPress={() => router.push("/setup")} activeOpacity={0.9}>
        <Text style={styles.fabPlus}>＋</Text>
      </TouchableOpacity>

      {/* 우하단 "맨위" 버튼 (스크롤 내려갔을 때만 표시) */}
      {showGoTop && (
        <TouchableOpacity
          style={styles.toTop}
          onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
          activeOpacity={0.9}
        >
          <Text style={styles.toTopTxt}>맨위↑</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ---------------- Styles ---------------- */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg, padding: 20 },
  title: { fontSize: 24, fontWeight: "800", color: COLOR.text, marginBottom: 20, marginTop: 60 },

  card: {
    backgroundColor: COLOR.card,
    borderWidth: 1,
    borderColor: COLOR.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 5, // 우선순위 컬러 보더
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },

  row: { flexDirection: "row", alignItems: "center" },
  subject: { fontWeight: "800", color: COLOR.text, fontSize: 16, flex: 1 },
  delete: { color: "#9CA3AF", fontWeight: "700" },

  content: { color: COLOR.muted, marginTop: 6, lineHeight: 20, fontSize: 14 },

  footerRow: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  right: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8 },

  // 우선순위 뱃지
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F9FAFB",
  },
  dot: { width: 8, height: 8, borderRadius: 999, marginRight: 6 },
  badgeTxt: { fontWeight: "800", fontSize: 12 },

  // 시간/예상 시간 뱃지
  timeBadge: {
    borderWidth: 1,
    borderColor: COLOR.border,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginLeft: 6,
  },
  timeTxt: { color: COLOR.text, fontWeight: "800", fontSize: 12 },

  // 하단 바 + 버튼
  bottomBar: { position: "absolute", left: 20, right: 20, bottom: 24, alignItems: "flex-start" },
  aiBtn: {
    backgroundColor: "#111827",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 3 },
    }),
  },
  aiBtnTxt: { color: "#fff", fontWeight: "900", fontSize: 14 },

  // FAB(+)
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: COLOR.primary,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 6 },
    }),
  },
  fabPlus: { color: "#fff", fontSize: 32, lineHeight: 34, fontWeight: "900" },

  // 빈 상태
  emptyBox: {
    backgroundColor: COLOR.card,
    borderWidth: 1,
    borderColor: COLOR.border,
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    marginTop: 30,
  },
  emptyTxt: { color: COLOR.muted, marginBottom: 10 },
  linkBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: COLOR.primary },
  linkBtnTxt: { color: "#fff", fontWeight: "800" },

  // 맨위 버튼
  toTop: {
    position: "absolute",
    right: 20,
    bottom: 94, // FAB 위쪽에 겹치지 않게
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 5 },
    }),
  },
  toTopTxt: { color: "#fff", fontWeight: "900", fontSize: 12 },
});
