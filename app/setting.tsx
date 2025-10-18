// app/setting.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  subject: string;
  content: string;
  priority: Priority;
  minutes: number;
  done?: boolean;
  createdAt?: string;
};

type PlannerBlock = {
  start?: string; // "HH:mm"
  title: string;
  subject?: string;
  priority?: Priority;
  minutes: number;
  note?: string;
};

type PlannerJSON = {
  summary?: string[];
  totalMinutes?: number;
  blocks: PlannerBlock[];
};

/* =========================
 * 유틸: JSON 안전 파서
 * =======================*/
function safeParsePlanner(input: string | undefined | null): PlannerJSON | null {
  if (!input) return null;
  try {
    const codeBlock = input.match(/```json\s*([\s\S]*?)```/i);
    if (codeBlock?.[1]) {
      return JSON.parse(codeBlock[1]);
    }
    if (input.trim().startsWith("{") || input.trim().startsWith("[")) {
      return JSON.parse(input);
    }
  } catch {
    // 파싱 실패 시 폴백
  }
  return null;
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
  const [loading, setLoading] = useState(false);
  const [aiRaw, setAiRaw] = useState("");
  const [aiJson, setAiJson] = useState<PlannerJSON | null>(null);

  const AI_ENDPOINT = useMemo(
    () =>
      process.env.EXPO_PUBLIC_AI_ENDPOINT ||
      "https://chatwithai-aqyo5fjnda-uc.a.run.app",
    []
  );

  /** todayPlans → 프롬프트 빌드 (JSON 스키마 요구 포함) */
  const buildPlannerPrompt = async (): Promise<string> => {
    const raw = await AsyncStorage.getItem("todayPlans");
    const plans: Plan[] = raw ? JSON.parse(raw) : [];

    const lines =
      plans.length > 0
        ? plans
            .map(
              (p, i) =>
                `${i + 1}. [${p.subject}·${p.priority}] ${p.content} (${p.minutes ?? 0}분${
                  p.done ? ", 완료" : ""
                })`
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
      "",
      "### 반환 형식",
      "1) 자연스러운 한국어 설명",
      "2) 아래 JSON을 반드시 포함해줘. 꼭 코드블럭으로 감싸.",
      "```json",
      '{ "summary": ["핵심 요약 문장", "..."], "totalMinutes": 0, "blocks": [ { "start": "HH:mm", "title": "무엇을 할지", "subject": "과목", "priority": "필수|중요|선택", "minutes": 25, "note": "선택" } ] }',
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
        (data && (data.reply ?? data.result)) ||
        JSON.stringify(data, null, 2);

      const parsed = safeParsePlanner(reply);
      setAiJson(parsed);
      setAiRaw(reply);
    } catch (err) {
      console.error(err);
      Alert.alert("오류", "AI 요청 중 문제가 발생했어요.");
      setAiRaw("오류가 발생했습니다.");
      setAiJson(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={S.screen}>
      <Text style={S.title}>AI 플래너</Text>

      <TouchableOpacity
        style={[S.btn, loading && S.btnDisabled]}
        onPress={requestPlanner}
        disabled={loading}
        activeOpacity={0.9}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={S.btnTxt}>플래너 받아오기</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[S.btn, { backgroundColor: "#111827" }]}
        onPress={() => router.push("/list")}
        activeOpacity={0.9}
      >
        <Text style={S.btnTxt}>목록으로</Text>
      </TouchableOpacity>

      {loading ? null : aiJson ? (
        <PlannerView data={aiJson} raw={aiRaw} />
      ) : aiRaw ? (
        <RawFallbackView raw={aiRaw} />
      ) : null}
    </View>
  );
}

/* =========================
 * 컴포넌트: JSON 기반 플래너 뷰
 * =======================*/
function PlannerView({ data, raw }: { data: PlannerJSON; raw: string }) {
  const blocks = Array.isArray(data.blocks) ? data.blocks : [];
  const total =
    typeof data.totalMinutes === "number"
      ? data.totalMinutes
      : blocks.reduce((sum, b) => sum + (b.minutes || 0), 0);

  return (
    <ScrollView
      style={S.result}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      showsVerticalScrollIndicator={false}
    >
      {/* 요약 카드 */}
      {Array.isArray(data.summary) && data.summary.length > 0 ? (
        <View style={S.card}>
          <Text style={S.cardTitle}>오늘의 요약</Text>
          <View style={{ gap: 6 }}>
            {data.summary.map((line, idx) => (
              <View key={`sum-${idx}`} style={S.bulletRow}>
                <View style={S.dotSmall} />
                <Text style={S.cardText}>{line}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* 통계 행 */}
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

      {/* 타임라인 */}
      <View style={S.card}>
        <Text style={S.cardTitle}>시간표</Text>
        <View style={S.timelineWrap}>
          <View style={S.timelineBar} />
          <View style={{ gap: 14 }}>
            {blocks.map((b, idx) => (
              <TimelineItem
                key={`blk-${idx}`}
                block={b}
                isLast={idx === blocks.length - 1}
              />
            ))}
          </View>
        </View>
      </View>

      {/* 원문 보기(디버그/폴백) */}
      <View style={[S.card, { backgroundColor: "#F9FAFB" }]}>
        <Text style={[S.cardTitle, { marginBottom: 8 }]}>AI 원문</Text>
        <Text style={S.rawText}>{raw}</Text>
      </View>
    </ScrollView>
  );
}

/* =========================
 * 컴포넌트: 타임라인 아이템
 * =======================*/
function TimelineItem({
  block,
  isLast,
}: {
  block: PlannerBlock;
  isLast: boolean;
}) {
  const p = block.priority as Priority | undefined;
  const tagColor = p ? TAG_COLOR[p] : "#6B7280";

  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      {/* 왼쪽 타임라인 점 + 선 */}
      <View style={{ width: 16, alignItems: "center" }}>
        <View style={[S.dot, { borderColor: tagColor }]} />
        {!isLast && <View style={S.vertLine} />}
      </View>

      {/* 콘텐츠 박스 */}
      <View style={S.blockBox}>
        <View style={[S.rowBetween, { marginBottom: 4 }]}>
          <Text style={S.blockTitle}>{block.title}</Text>
          <Text style={S.blockMinutes}>{block.minutes}분</Text>
        </View>

        <View
          style={[
            S.rowBetween,
            { marginBottom: 6, flexWrap: "wrap", gap: 8 },
          ]}
        >
          <Pill text={block.start ? block.start : "순서"} />
          {block.subject ? <Pill text={block.subject} /> : null}
          {p ? <Pill text={p} color={tagColor} /> : null}
        </View>

        {block.note ? <Text style={S.blockNote}>{block.note}</Text> : null}
      </View>
    </View>
  );
}

/* =========================
 * 컴포넌트: 통계 칩
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
 * 컴포넌트: Pill
 * =======================*/
function Pill({ text, color = "#E5E7EB" }: { text: string; color?: string }) {
  const fg = color === "#E5E7EB" ? "#111827" : "#fff";
  const bg = color === "#E5E7EB" ? "#F3F4F6" : color;
  return (
    <View style={[S.pill, { backgroundColor: bg }]}>
      <Text style={[S.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

/* =========================
 * 폴백: 원문 텍스트 카드
 * =======================*/
function RawFallbackView({ raw }: { raw: string }) {
  return (
    <ScrollView
      style={S.result}
      contentContainerStyle={{ padding: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={S.card}>
        <Text style={S.cardTitle}>AI 플래너</Text>
        <Text style={S.rawText}>{raw}</Text>
      </View>
      <View
        style={[S.card, { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }]}
      >
        <Text style={[S.cardTitle, { marginBottom: 6 }]}>팁</Text>
        <Text style={S.cardText}>
          더 예쁜 시간표를 위해, AI 응답이 JSON 코드블럭을 포함하도록 요청했습니다.
          여전히 일반 텍스트만 오면 버튼을 눌러 재요청해 보세요.
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
  title: { fontSize: 22, fontWeight: "800", color: "#0F172A", marginBottom: 16 },
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
  btnTxt: { color: "#fff", fontWeight: "900", fontSize: 16, letterSpacing: 0.3 },

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
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A", marginBottom: 8 },
  cardText: { color: "#111827", fontSize: 14, lineHeight: 20 },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 8 },

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
  statLabel: { fontSize: 12, color: "#6B7280", marginBottom: 4, fontWeight: "600" },
  statValue: { fontSize: 16, color: "#111827", fontWeight: "800" },

  /* 타임라인 */
  timelineWrap: { flexDirection: "row" },
  timelineBar: {
    width: 2,
    backgroundColor: "#E5E7EB",
    marginRight: 16,
    marginLeft: 7,
    borderRadius: 2,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
  },
  dotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" },
  vertLine: {
    position: "absolute",
    top: 16,
    bottom: 0,
    width: 2,
    backgroundColor: "#E5E7EB",
  },

  blockBox: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  blockTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  blockMinutes: { fontSize: 13, fontWeight: "800", color: "#2563EB" },
  blockNote: { color: "#374151", fontSize: 13, lineHeight: 18 },

  pill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: "800" },

  rawText: { color: "#111827", fontSize: 13, lineHeight: 19 },
});
