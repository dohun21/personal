// app/review.tsx
import { auth } from '@/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Priority = '필수' | '중요' | '선택';
type Phase = 'study' | 'cooldown';

type StudyRecordDraft = {
  phase: Phase;
  subject: string;
  detail?: string;
  priority?: Priority;
  plannedMinutes: number;
  elapsedSeconds: number;
  completed: boolean;
  endedAtISO: string;
  index: number;
};

type PlanItem = {
  id?: string;
  subject: string;
  detail?: string;
  minutes: number;
  priority?: Priority;
  startAt?: string;
  cooldownMinutes?: number;
};

const DRAFT_KEY = '@studyRecordsDraftV1';
const PLAN_KEY = '@aiPlanV1';

const LAST_SUMMARY_KEY = '@lastSummaryV1';

const feelingsList = [
  '집중됨', '피곤', '졸림', '재밌었음', '어려웠음', '지루함', '보통', '만족', '아쉬움'
] as const;
type Feeling = typeof feelingsList[number];

type GoalStatus = 'full' | 'partial' | 'none';
type TimeSlotOK = 'good' | 'ok' | 'bad';          // 좋았다/괜찮았다/집중 안 됨
type TimeAllocOK = 'adequate' | 'insufficient' | 'leftover'; // 적절/부족/남음

export default function SummaryScreen() {
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  // 기록/계획 불러오기
  const [drafts, setDrafts] = useState<StudyRecordDraft[]>([]);
  const [plan, setPlan] = useState<PlanItem[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const rawDraft = await AsyncStorage.getItem(DRAFT_KEY);
        const list: StudyRecordDraft[] = rawDraft ? JSON.parse(rawDraft) : [];
        setDrafts(list);

        const rawPlan = await AsyncStorage.getItem(PLAN_KEY);
        const arr: PlanItem[] = rawPlan ? JSON.parse(rawPlan) : [];
        setPlan(arr);
      } catch (e) {
        console.error(e);
        Alert.alert('오류', '기록을 불러오는 중 문제가 발생했어요.');
      }
    })();
  }, []);

  // 통계 계산
  const stats = useMemo(() => {
    const totalPlannedMin = drafts.reduce((acc, r) => acc + (r.phase === 'study' ? (r.plannedMinutes || 0) : 0), 0);
    const totalElapsedSec = drafts.reduce((acc, r) => acc + (r.phase === 'study' ? (r.elapsedSeconds || 0) : 0), 0);
    const totalCompleted = drafts.filter((r) => r.phase === 'study' && r.completed).length;
    const totalStudySteps = drafts.filter((r) => r.phase === 'study').length;

    const completionRate = totalStudySteps > 0 ? Math.round((totalCompleted / totalStudySteps) * 100) : 0;

    return {
      totalPlannedMin,
      totalElapsedSec,
      totalStudySteps,
      totalCompleted,
      completionRate,
    };
  }, [drafts]);

  // ===== 후기 입력 상태 =====
  const [stars, setStars] = useState<number>(0); // 집중도 1~5
  const [feelings, setFeelings] = useState<Feeling[]>([]);
  const [goalStatus, setGoalStatus] = useState<GoalStatus>('partial');
  const [timeSlot, setTimeSlot] = useState<TimeSlotOK>('ok');
  const [timeAlloc, setTimeAlloc] = useState<TimeAllocOK>('adequate');
  const [memo, setMemo] = useState<string>('');

  const toggleFeeling = (f: Feeling) => {
    setFeelings((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  // ===== 제출 =====
  async function onSubmit() {
    try {
      if (stars <= 0) {
        Alert.alert('확인', '집중도(별점)를 선택해 주세요.');
        return;
      }

      // AI에 보낼 페이로드 구성
      const payload = {
        dateISO: new Date().toISOString(),
        uid,
        summary: {
          focusStars: stars,
          feelings,
          goalStatus,  // 'full' | 'partial' | 'none'
          timeSlot,    // 'good' | 'ok' | 'bad'
          timeAlloc,   // 'adequate' | 'insufficient' | 'leftover'
          memo,
        },
        plan,   // 원래 계획(과목/세부계획/분/우선순위 등)
        drafts, // 실제 실행 기록(공부/쿨다운, 경과/완료 등)
        stats: {
          totalPlannedMin: stats.totalPlannedMin,
          totalElapsedSec: stats.totalElapsedSec,
          completionRate: stats.completionRate,
          steps: stats.totalStudySteps,
          stepsCompleted: stats.totalCompleted,
        },
      };

      // 1) 로컬에 보관(최근 요약)
      await AsyncStorage.setItem(LAST_SUMMARY_KEY, JSON.stringify(payload));

      // 2) (옵션) AI 서버로 전송
      const endpoint = process.env.EXPO_PUBLIC_AI_ENDPOINT;
      if (endpoint) {
        try {
          await fetch(`${endpoint}/summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } catch (e) {
          console.warn('AI 전송 실패(무시 가능):', e);
        }
      }

      // 3) (옵션) Firestore 저장 지점 —— 필요하면 여기에 붙여줘
      // import { db } from '@/firebaseConfig'; import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
      // if (uid) {
      //   await addDoc(collection(db, 'studySummaries'), {
      //     uid,
      //     createdAt: serverTimestamp(),
      //     ...payload,
      //   });
      // }

      // 사용한 Draft 초기화 (원하면 남겨도 됨)
      await AsyncStorage.removeItem(DRAFT_KEY);

      Alert.alert('저장 완료', '후기를 저장했어요!', [
        { text: '확인', onPress: () => router.replace('/home' as any) },
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert('오류', '제출 중 문제가 발생했어요.');
    }
  }

  // 형식 유틸
  function mmss(sec: number) {
    const m = Math.floor(Math.max(0, sec) / 60);
    const s = Math.max(0, sec) % 60;
    return `${m}분 ${String(s).padStart(2, '0')}초`;
  }

  // ===== UI =====
  return (
    <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.title}>오늘 공부 요약 & 후기</Text>

      {/* 상단 요약 카드 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>오늘의 요약</Text>
        <Text style={styles.meta}>계획(공부) 합계: {stats.totalPlannedMin}분</Text>
        <Text style={styles.meta}>실제 공부: {mmss(stats.totalElapsedSec)}</Text>
        <Text style={styles.meta}>완료율: {stats.completionRate}% ({stats.totalCompleted}/{stats.totalStudySteps})</Text>
      </View>

      {/* 집중도(별점) */}
      <View style={styles.card}>
        <Text style={styles.label}>집중도</Text>
        <View style={styles.starRow}>
          {[1,2,3,4,5].map((n) => (
            <TouchableOpacity key={n} onPress={() => setStars(n)} style={styles.starBtn}>
              <Text style={[styles.star, { opacity: n <= stars ? 1 : 0.35 }]}>{'★'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 오늘의 느낌(여러 개 선택) */}
      <View style={styles.card}>
        <Text style={styles.label}>오늘의 느낌</Text>
        <View style={styles.chipWrap}>
          {feelingsList.map((f) => {
            const active = feelings.includes(f);
            return (
              <TouchableOpacity
                key={f}
                onPress={() => toggleFeeling(f)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 목표 달성 여부 */}
      <View style={styles.card}>
        <Text style={styles.label}>목표 달성 여부</Text>
        <View style={styles.row3}>
          <RadioBtn label="완료" value="full"    current={goalStatus} onChange={setGoalStatus} />
          <RadioBtn label="부분" value="partial" current={goalStatus} onChange={setGoalStatus} />
          <RadioBtn label="미달" value="none"    current={goalStatus} onChange={setGoalStatus} />
        </View>
      </View>

      {/* 시간대 적절성 */}
      <View style={styles.card}>
        <Text style={styles.label}>시간대가 적절했는지</Text>
        <View style={styles.row3}>
          <RadioBtn label="좋았다"     value="good" current={timeSlot} onChange={setTimeSlot} />
          <RadioBtn label="괜찮았다"   value="ok"   current={timeSlot} onChange={setTimeSlot} />
          <RadioBtn label="집중 안 됨" value="bad"  current={timeSlot} onChange={setTimeSlot} />
        </View>
      </View>

      {/* 시간 배분 적절성 */}
      <View style={styles.card}>
        <Text style={styles.label}>시간 배분이 적절했는지</Text>
        <View style={styles.row3}>
          <RadioBtn label="적절" value="adequate"     current={timeAlloc} onChange={setTimeAlloc} />
          <RadioBtn label="부족" value="insufficient" current={timeAlloc} onChange={setTimeAlloc} />
          <RadioBtn label="남음" value="leftover"     current={timeAlloc} onChange={setTimeAlloc} />
        </View>
      </View>

      {/* 리뷰 메모 */}
      <View style={styles.card}>
        <Text style={styles.label}>한 줄 리뷰 / 개선점</Text>
        <TextInput
          placeholder="예) 밤 10시 이후 집중이 떨어져요. 내일은 수학 먼저!"
          value={memo}
          onChangeText={setMemo}
          style={styles.input}
          multiline
        />
      </View>

      <TouchableOpacity onPress={onSubmit} style={[styles.btn, styles.primary]}>
        <Text style={styles.btnText}>제출하고 완료하기</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.replace('/home' as any)} style={[styles.btn, styles.gray, { marginTop: 10 }]}>
        <Text style={styles.btnText}>나중에 할게요(홈으로)</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/* 라디오 버튼(텍스트 버전) */
function RadioBtn<T extends string>({
  label, value, current, onChange,
}: { label: string; value: T; current: T; onChange: (v: T) => void }) {
  const active = current === value;
  return (
    <TouchableOpacity onPress={() => onChange(value)} style={[styles.radio, active && styles.radioActive]}>
      <Text style={[styles.radioText, active && styles.radioTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 24 },
  title: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 14 },

  card: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  cardTitle: { fontSize: 14, fontWeight: '800', marginBottom: 6, color: '#0F172A' },

  label: { fontSize: 12, color: '#6B7280', marginBottom: 8 },
  meta: { fontSize: 13, color: '#334155', marginBottom: 4 },

  starRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  starBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  star: { fontSize: 28, textAlign: 'center' },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#3B82F6' },
  chipText: { fontSize: 12, color: '#1F2937' },
  chipTextActive: { color: '#FFFFFF', fontWeight: '700' },

  row3: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  radio: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: '#E5E7EB' },
  radioActive: { backgroundColor: '#059669' },
  radioText: { fontSize: 13, color: '#1F2937' },
  radioTextActive: { color: '#FFFFFF', fontWeight: '800' },

  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, minHeight: 60, fontSize: 13 },

  btn: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#059669' },
  gray: { backgroundColor: '#6B7280' },
  btnText: { color: '#FFFFFF', fontWeight: '800' },
});
