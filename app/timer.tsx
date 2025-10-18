// app/session/timer.tsx
import { auth, db } from '@/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Priority = '필수' | '중요' | '선택';

type PlanItem = {
  id?: string;
  subject: string;
  detail?: string;
  minutes: number;
  priority?: Priority;
  startAt?: string;
  cooldownMinutes?: number;
};

type StudyRecordDraft = {
  phase: 'study' | 'cooldown';
  subject: string;
  detail?: string;
  priority?: Priority;
  plannedMinutes: number;
  elapsedSeconds: number;
  completed: boolean;
  endedAtISO: string;
  index: number;
};

const AI_PLAN_KEY = '@aiPlanV1';
const STUDY_RECORDS_DRAFT_KEY = '@studyRecordsDraftV1';

function mmss(sec: number) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${m}분 ${String(s).padStart(2, '0')}초`;
}

// --- PlanItem 변환 함수 ---
function toPlanItem(b: any, i: number): PlanItem {
  return {
    id: b.id ?? `p-${i}`,
    subject: String(b.subject ?? b.title ?? '기타'),
    detail: String(b.detail ?? b.content ?? ''),
    minutes: Math.max(1, Number(b.minutes ?? b.duration ?? 1)),
    priority: b.priority as Priority | undefined,
    startAt: b.startAt ?? b.start_time ?? undefined,
    cooldownMinutes: Math.max(0, Number(b.cooldownMinutes ?? b.cooldown ?? 0)),
  };
}

export default function TimerScreen() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(true);
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  const current = useMemo(() => {
    if (!plan.length) return null;
    return plan[index];
  }, [plan, index]);

  // ✅ AI 계획 불러오기 + 시간순 정렬
  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        let arr: any[] | null = null;
        const local = await AsyncStorage.getItem(AI_PLAN_KEY);
        if (local) arr = JSON.parse(local);
        else {
          const snap = await getDoc(doc(db, 'schedule', uid));
          if (snap.exists()) {
            const data = snap.data() as any;
            if (Array.isArray(data.blocks)) arr = data.blocks;
            else if (typeof data.blocks === 'string') arr = JSON.parse(data.blocks);
          }
        }
        if (!arr || arr.length === 0) {
          Alert.alert('계획 없음', 'AI가 만든 공부 계획이 없습니다.');
          router.replace('/home' as any);
          return;
        }

        // 🔹 startAt 기준 정렬
        const parsed = arr.map(toPlanItem).sort((a, b) => {
          const toMin = (t?: string) => {
            if (!t) return 24 * 60;
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
          };
          return toMin(a.startAt) - toMin(b.startAt);
        });

        setPlan(parsed);
        setIndex(0);
        setReady(true);
        setRunning(false);
      } catch (e) {
        console.error(e);
        Alert.alert('오류', '계획을 불러오는 중 문제가 발생했습니다.');
      }
    })();
  }, [uid]);

  // 타이머
  useEffect(() => {
    if (!running) return;
    if (intervalRef.current) return;

    intervalRef.current = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          stopTimer();
          setTimeout(() => finishStep(true), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => stopTimer();
  }, [running]);

  const stopTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const pushDraft = async (rec: StudyRecordDraft) => {
    const raw = await AsyncStorage.getItem(STUDY_RECORDS_DRAFT_KEY);
    const list: StudyRecordDraft[] = raw ? JSON.parse(raw) : [];
    list.push(rec);
    await AsyncStorage.setItem(STUDY_RECORDS_DRAFT_KEY, JSON.stringify(list));
  };

  const finishStep = async (auto: boolean) => {
    if (!current) return;
    const planned = current.minutes * 60;
    const elapsed = planned - seconds;

    const record: StudyRecordDraft = {
      phase: 'study',
      subject: current.subject,
      detail: current.detail,
      priority: current.priority,
      plannedMinutes: current.minutes,
      elapsedSeconds: elapsed,
      completed: auto,
      endedAtISO: new Date().toISOString(),
      index,
    };
    await pushDraft(record);

    const next = index + 1;
    if (next >= plan.length) {
      Alert.alert('완료', '모든 공부를 마쳤어요!', [
        { text: '확인', onPress: () => router.replace('/review' as any) },
      ]);
      return;
    }
    setIndex(next);
    setReady(true);
    setRunning(false);
  };

  const onStart = () => {
    if (!current) return;
    setSeconds(current.minutes * 60);
    setReady(false);
    setRunning(true);
  };

  const toggleRun = () => setRunning((r) => !r);

  if (!current)
    return (
      <View style={styles.page}>
        <Text style={styles.title}>진행할 공부가 없어요</Text>
        <TouchableOpacity onPress={() => router.replace('/home' as any)} style={[styles.btn, styles.primary]}>
          <Text style={styles.btnText}>홈으로</Text>
        </TouchableOpacity>
      </View>
    );

  // --- 시작 전 화면 ---
  if (ready)
    return (
      <ScrollView style={styles.page}>
        <Text style={styles.title}>오늘의 공부</Text>
        <View style={styles.card}>
          <Text style={styles.step}>
            [{index + 1}/{plan.length}]
          </Text>
          <Text style={styles.label}>과목</Text>
          <Text style={styles.value}>{current.subject}</Text>
          {!!current.detail && (
            <>
              <Text style={[styles.label, { marginTop: 10 }]}>세부계획</Text>
              <Text style={styles.value}>{current.detail}</Text>
            </>
          )}
          {!!current.priority && (
            <>
              <Text style={[styles.label, { marginTop: 10 }]}>우선순위</Text>
              <Text style={styles.value}>{current.priority}</Text>
            </>
          )}
          {!!current.startAt && (
            <>
              <Text style={[styles.label, { marginTop: 10 }]}>시작시간</Text>
              <Text style={styles.value}>{current.startAt}</Text>
            </>
          )}
          <Text style={[styles.label, { marginTop: 10 }]}>목표 시간</Text>
          <Text style={[styles.value, { fontWeight: '700' }]}>{current.minutes}분</Text>
        </View>

        <TouchableOpacity onPress={onStart} style={[styles.btn, styles.primary, { alignSelf: 'center', width: 180 }]}>
          <Text style={styles.btnText}>시작하기</Text>
        </TouchableOpacity>
      </ScrollView>
    );

  // --- 진행 중 화면 ---
  return (
    <View style={styles.page}>
      <Text style={styles.title}>공부 중</Text>
      <Text style={styles.subject}>{current.subject}</Text>
      {!!current.detail && <Text style={styles.detail}>{current.detail}</Text>}
      <View style={styles.timerBox}>
        <Text style={styles.timer}>{mmss(seconds)}</Text>
      </View>

      <View style={styles.btnRow}>
        <TouchableOpacity onPress={toggleRun} style={[styles.btn, styles.primary, { flex: 1 }]}>
          <Text style={styles.btnText}>{running ? '일시정지' : '재개'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => finishStep(false)} style={[styles.btn, styles.blue, { flex: 1 }]}>
          <Text style={styles.btnText}>마치기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 60 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 20 },
  card: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginBottom: 20,
  },
  label: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  value: { fontSize: 15, color: '#111827', marginTop: 2 },
  step: { fontSize: 12, color: '#9CA3AF', textAlign: 'right' },
  subject: { textAlign: 'center', fontSize: 18, fontWeight: '700', marginTop: 20 },
  detail: { textAlign: 'center', fontSize: 14, color: '#4B5563', marginTop: 8 },
  timerBox: { alignItems: 'center', marginTop: 40 },
  timer: { fontSize: 42, fontWeight: '900', color: '#111' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 30 },
  btn: {
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: '#059669' },
  blue: { backgroundColor: '#3B82F6' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
