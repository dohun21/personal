// app/setting.tsx
import { auth, db } from "@/firebaseConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/* =========================
 * 타입
 * =======================*/
type Priority = "필수" | "중요" | "선택";
type Plan = {
  id: string;
  subject: string; //과목
  content: string; // 세부계획
  priority: Priority; // 중요도
  minutes: number; // 예상 소요 시간
  done?: boolean; // 완료 여부
  createdAt?: string;
}; ///////// 이게 사용자가 입력한 공부 계획 //////

export type PlannerBlock = {
  start?: string; //
  title: string;
  subject?: string;
  priority?: Priority;
  minutes: number;
  note?: string; // 리스트가 올 수 있음
};
/////////이게 ai가 만들어준 일정표에 들어가는 값들 //////

export type PlannerJSON = {
  summary?: string[];
  totalMinutes?: number;
  blocks: PlannerBlock[];
};
/// ai가  반환하는 구조 /////////

/* =========================
 * 유틸: JSON 안전 파서
 * =======================*/
function safeParsePlanner(
  input: string | undefined | null
): PlannerJSON | null {
  if (!input) return null;
  try {
    const codeBlock = input.match(/```json\s*([\s\S]*?)```/i);
    if (codeBlock?.[1]) return JSON.parse(codeBlock[1]);
    if (input.trim().startsWith("{") || input.trim().startsWith("[")) {
      return JSON.parse(input);
    }
  } catch {}
  return null;
}

/* =========================
 * 리스트 추출 & 렌더러 (HTML/MD → 불릿)
 * =======================*/
function extractListItems(input: string): string[] {
  if (!input) return [];
  ///////입력값이 없으면 빈배열 ///////

  const htmlMatches = Array.from(
    input.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)
  ).map((m) => m[1].replace(/<[^>]+>/g, "").trim()); ///// html 태그 중에 <li> 이런거 없애서 텍스트만 남게 하는 <li>"영어"</li> ---> "영어"

  // Markdown -, *
  const mdMatches = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, "").trim());

  const items = [...htmlMatches, ...mdMatches];
  return Array.from(new Set(items)).filter(Boolean); ///// 리스트 합치고 중복 제거, 빈문자열 제거
}

function BulletList({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null; //빈배열 출력 x
  return (
    <View style={{ gap: 6 }}>
      {items.map((t, i) => (
        <View
          key={`li-${i}`}
          style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: "#10B981",
              marginTop: 6,
            }}
          />
          <Text
            style={{ color: "#111827", fontSize: 14, lineHeight: 20, flex: 1 }}
          >
            {t}
          </Text>
        </View>
      ))}
    </View>
  );
} //////// ● 영어 단어 암기  이런식으로 출려되게 ////

/* HTML 정리용 폴백 (리스트 외 태그 제거) */
function stripHtml(s?: string): string {
  if (!s) return "";
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/* =========================
 * 시간 계산
 * =======================*/
function addMinutesToHHmm(hhmm?: string, minutes?: number): string | null {
  if (!hhmm || typeof minutes !== "number") return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2], 10) + minutes;
  h = (h + Math.floor(min / 60)) % 24;
  min = ((min % 60) + 60) % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(h)}:${pad(min)}`;
}
function buildTimeRange(start?: string, minutes?: number): string | null {
  if (!start || typeof minutes !== "number") return null;
  const end = addMinutesToHHmm(start, minutes);
  return end ? `${start}–${end}` : null;
}

/* =========================
 * 우선순위 태그 색상
 * =======================*/
const TAG_COLOR: Record<Priority, string> = {
  필수: "#EF4444",
  중요: "#F59E0B",
  선택: "#10B981",
};

export default function SettingScreen() {
  const router = useRouter();
  const { auto } = useLocalSearchParams(); // /setting?auto=1

  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiRaw, setAiRaw] = useState("");
  const [aiJson, setAiJson] = useState<PlannerJSON | null>(null);

  const hasPlan =
    !!aiJson && Array.isArray(aiJson.blocks) && aiJson.blocks.length > 0;

  const AI_ENDPOINT = process.env.EXPO_PUBLIC_AI_ENDPOINT || ''; // https://naver.com

  // 로그인 상태
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  /** todayPlans → 프롬프트 빌드 */
  const buildPlannerPrompt = async (): Promise<string> => {
    const raw = await AsyncStorage.getItem("todayPlans");
    const plans: Plan[] = raw ? JSON.parse(raw) : [];

    const lines =
      plans.length > 0
        ? plans
            .map(
              (p, i) =>
                `${i + 1}. [${p.subject}·${p.priority}] ${p.content} (${
                  p.minutes ?? 0
                }분${p.done ? ", 완료" : ""})`
            )
            .join("\n")
        : "등록된 계획이 없습니다.";

    return [
      "# 오늘의 공부 항목",
      lines,
      "",
      "위 목록을 바탕으로 오늘 일정 플래너를 만들어줘.",
      "- 우선순위(필수>중요>선택) 반영",
      "- 같은 과목은 무리되지 않도록 적절히 분할",
      "- 각 블록의 추천 길이(분)와 순서 제안",
      "- 상단에 4~5줄 요약 포함",
      "- 하단에는 시간표 형태로 정리",
      "아래 시간대에는 공부를 실행하지 않도록 해줘",
      "- 평일 학교 가는 날 8:00 ~ 15:30 ",
      "- 아침 : 7:00 ~ 8:00, 저녁 : 18:00 ~ 18:30", 
      "- 취침 시각 23 : 00 ~",  
      "",
      "### 반환 형식",
      "1) 자연스러운 한국어 설명",
      "2) 아래 JSON을 반드시 포함해줘. 꼭 코드블럭으로 감싸.",
      "```json",
      '{ "summary": ["한 줄 요약 1","한 줄 요약 2"], "totalMinutes": 0, "blocks": [ { "start": "HH:mm", "title": "무엇을 할지", "subject": "과목", "priority": "필수|중요|선택", "minutes": 25, "note": "선택" } ] }',
      "```",
    ].join("\n");
  };

  /** AI 요청 */
  const requestPlanner = async () => {
    try {
      setLoading(true);
      setAiRaw("");
      setAiJson(null);

      const message = await buildPlannerPrompt();
      const res = await fetch(AI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`요청 실패 ${res.status}: ${text}`);
      }

      const data = await res.json();
      const reply =
        (data && (data.reply ?? data.result)) || JSON.stringify(data, null, 2);

      const parsed = safeParsePlanner(reply);
      if (parsed) {
        // 타이머에서 사용할 캐시
        await AsyncStorage.setItem("todaySchedule", JSON.stringify(parsed));
        // Firestore 저장 (배열로, 서버시간)
        if (uid) {
          await setDoc(
            doc(db, "schedule", uid),
            {
              summary: parsed.summary ?? null,
              totalMinutes: parsed.totalMinutes ?? null,
              blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      }

      setAiJson(parsed);
      setAiRaw(reply);
    } catch (err) {
      console.error(err);
      Alert.alert(
        "오류",
        err instanceof Error ? err.message : "AI 요청 중 문제가 발생했어요."
      );
      setAiRaw("오류가 발생했습니다.");
      setAiJson(null);
    } finally {
      setLoading(false);
    }
  };

  // /setting?auto=1 이면 자동 실행 (uid 준비 후 1회)
  useEffect(() => {
    if (auto === "1" && uid && !loading && !aiJson) {
      requestPlanner();
    }
  }, [auto, uid, loading, aiJson] );

  return (
    <View style={S.screen}>
      <Text style={S.title}>AI 플래너</Text>

      {/* 플랜 없을 때만 목록 버튼 */}
      {!hasPlan && (
        <TouchableOpacity
          style={[S.btn, { backgroundColor: "#111827" }]}
          onPress={() => router.push("/list")}
          activeOpacity={0.9}
          disabled={loading}
        >
          <Text style={S.btnTxt}>목록으로</Text>
        </TouchableOpacity>
      )}

      {/* 플랜 준비되면 타이머 실행 */}
      {hasPlan && (
        <TouchableOpacity
          style={[S.btn, { backgroundColor: "#111827" }]}
          onPress={() => router.push("/timer")}
          activeOpacity={0.9}
        >
          <Text style={S.btnTxt}>타이머로 실행</Text>
        </TouchableOpacity>
      )}

      {/* 본문 */}
      {loading ? null : aiJson ? (
        <PlannerView data={aiJson} raw={aiRaw} />
      ) : aiRaw ? (
        <RawFallbackView raw={aiRaw} />
      ) : (
        <View style={[S.card, { marginTop: 8 }]}>
          <Text style={S.cardTitle}>아직 생성된 플래너가 없습니다.</Text>
          <Text style={S.cardText}>
            list 화면에서 ‘AI에게 요청’ → 이 화면으로 오면 자동으로 생성돼요.
          </Text>
        </View>
      )}

      {/* 로딩 오버레이 */}
      <Modal visible={loading} transparent animationType="fade">
        <View style={S.loadingWrap}>
          <View style={S.loadingBox}>
            <ActivityIndicator size="large" />
            <Text style={{ marginTop: 12, fontWeight: "700" }}>
              플래너 생성 중…
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* =========================
 * JSON 기반 플래너 뷰
 *  👉 시간표는 카드형 ul 리스트(PlannerList) 사용
 * =======================*/
function PlannerView({ data, raw }: { data: PlannerJSON; raw: string }) {
  const blocks = Array.isArray(data.blocks) ? data.blocks : [];
  const total =
    typeof data.totalMinutes === "number"
      ? data.totalMinutes
      : blocks.reduce((sum, b) => sum + (b.minutes || 0), 0);

  const listItems = extractListItems(raw);

  return (
    <ScrollView
      style={S.result}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      showsVerticalScrollIndicator={false}
    >
      {/* 통계 */}
      <View
        style={[
          S.card,
          {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          },
        ]}
      >
        <StatChip label="총 소요" value={`${total}분`} />
        <StatChip label="블록 수" value={`${blocks.length}개`} />
        <StatChip label="완성도" value={estimateDensity(total)} />
      </View>

      {/* 시간표 (카드형 ul 리스트) */}
      <View style={S.card}>
        <Text style={S.cardTitle}>시간표</Text>
        <PlannerList blocks={blocks} />
      </View>

      {/* 오늘의 요약 (아래) */}
      {Array.isArray(data.summary) && data.summary.length > 0 ? (
        <View style={S.card}>
          <Text style={S.cardTitle}>오늘의 요약</Text>
          <BulletList items={data.summary} />
        </View>
      ) : null}

      {/* AI 원문: 리스트가 있으면 리스트로 렌더 */}
      <View style={[S.card, { backgroundColor: "#F9FAFB" }]}>
        <Text style={[S.cardTitle, { marginBottom: 8 }]}>AI 원문</Text>
        {listItems.length > 0 ? (
          <BulletList items={listItems} />
        ) : (
          <Text style={S.rawText}>{stripHtml(raw)}</Text>
        )}
      </View>
    </ScrollView>
  );
}

/* =========================
 * 시간 순서 카드 리스트(ul)
 * =======================*/
function PlannerList({ blocks }: { blocks: PlannerBlock[] }) {
  const sorted = [...blocks].sort((a, b) => {
    const aa = a.start ?? "";
    const bb = b.start ?? "";
    return aa.localeCompare(bb);
  });

  return (
    <View style={{ gap: 10 }}>
      {sorted.map((b, i) => {
        const timeLabel =
          buildTimeRange(b.start, b.minutes) ??
          (b.start ? b.start : `순서 ${i + 1}`);
        const prColor = TAG_COLOR[b.priority || "선택"] || "#6B7280";
        return (
          <View key={`plan-${i}`} style={S.planCard}>
            <View style={S.rowBetween}>
              <Text style={S.timeText}>{timeLabel}</Text>
              {b.priority ? (
                <Text style={[S.priority, { color: prColor }]}>
                  {b.priority}
                </Text>
              ) : null}
            </View>
            <Text style={S.subjectText}>{b.subject || "과목 없음"}</Text>
            <Text style={S.titleText}>{b.title}</Text>
            {typeof b.minutes === "number" ? (
              <Text style={S.minsText}>{b.minutes}분</Text>
            ) : null}
            {b.note ? (
              <Text style={S.noteText}>{stripHtml(b.note)}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/* =========================
 * 통계 칩
 * =======================*/
function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={S.statChip}>
      <Text style={S.statLabel}>{label}</Text>
      <Text style={S.statValue}>{value}</Text>
    </View>
  );
}

/* =========================
 * 폴백 뷰 (리스트 렌더)
 * =======================*/
function RawFallbackView({ raw }: { raw: string }) {
  const items = extractListItems(raw);
  return (
    <ScrollView
      style={S.result}
      contentContainerStyle={{ padding: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={S.card}>
        <Text style={S.cardTitle}>AI 플래너</Text>
        {items.length > 0 ? (
          <BulletList items={items} />
        ) : (
          <Text style={S.rawText}>{stripHtml(raw)}</Text>
        )}
      </View>
      <View
        style={[S.card, { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }]}
      >
        <Text style={[S.cardTitle, { marginBottom: 6 }]}>팁</Text>
        <Text style={S.cardText}>
          AI가 일반 텍스트만 보내도 목록(-, * 또는 &lt;ul&gt;&lt;li&gt;)을 보기
          좋게 렌더링합니다.
        </Text>
      </View>
    </ScrollView>
  );
}

/* =========================
 * 보조: 총 소요에 따른 밀도 라벨
 * =======================*/
function estimateDensity(totalMin: number) {
  if (totalMin >= 240) return "빡빡함";
  if (totalMin >= 150) return "보통";
  return "여유";
}

/* =========================
 * 스타일
 * =======================*/
const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF", padding: 20, paddingTop: 60 },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 16,
  },
  btn: {
    height: 52,
    backgroundColor: "#2563EB",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  btnDisabled: { opacity: 0.7 },
  btnTxt: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 0.3,
  },

  result: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    maxHeight: 560,
  },

  /* 카드 */
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 8,
  },
  cardText: { color: "#111827", fontSize: 14, lineHeight: 20 },

  /* 통계칩 */
  statChip: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 92,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  statLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
    fontWeight: "600",
  },
  statValue: { fontSize: 16, color: "#111827", fontWeight: "800" },

  /* ✅ ul 카드 한 개 */
  planCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  timeText: { fontSize: 15, fontWeight: "800", color: "#2563EB" },
  subjectText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
    marginTop: 6,
  },
  titleText: { fontSize: 14, color: "#374151", marginTop: 4 },
  minsText: { fontSize: 12, fontWeight: "700", color: "#6B7280", marginTop: 2 },
  noteText: { fontSize: 13, color: "#6B7280", marginTop: 6 },
  priority: { fontWeight: "900" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  rawText: { color: "#111827", fontSize: 13, lineHeight: 19 },

  /* 로딩 오버레이 */
  loadingWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingBox: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    minWidth: 180,
  },
});
