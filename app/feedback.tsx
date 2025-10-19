// app/feedback/index.tsx
import { auth, db } from '@/firebaseConfig';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

type AIFeedback =
  | string
  | {
      reply?: string | { summary?: string; insights?: string[]; [k: string]: any };
      summary?: string;
      insights?: string[];
      [k: string]: any;
    };

type FeedbackDoc = {
  aifeedback?: AIFeedback;
  createdAt?: Timestamp | null;
  creatdAt?: Timestamp | null; // 오타 대응
  [k: string]: any;
};

/** ✅ 순수 텍스트(요약)만 추출: 문자열이 JSON이면 파싱해 summary만 반환 */
function pickPlainText(v: AIFeedback | undefined): string {
  if (!v) return '';

  // 1) 단순 문자열
  if (typeof v === 'string') {
    const s = v.trim();
    // 문자열이 {"summary":"..."} 같은 JSON이면 파싱해서 summary만
    if (s.startsWith('{')) {
      try {
        const parsed = JSON.parse(s);
        if (parsed && typeof parsed.summary === 'string') return parsed.summary.trim();
      } catch { /* 그냥 원문 사용 */ }
    }
    return s;
  }

  // 2) 객체: reply 우선
  const r = (v as any)?.reply;
  if (typeof r === 'string') {
    const s = r.trim();
    if (s.startsWith('{')) {
      try {
        const parsed = JSON.parse(s);
        if (parsed && typeof parsed.summary === 'string') return parsed.summary.trim();
      } catch { /* ignore */ }
    }
    return s;
  }
  if (r && typeof r === 'object' && typeof r.summary === 'string') {
    return r.summary.trim();
  }

  // 3) 바로 summary가 있으면 사용
  if (typeof (v as any)?.summary === 'string') return (v as any).summary.trim();

  // 4) insights가 있으면 첫 문장
  if (Array.isArray((v as any)?.insights) && (v as any).insights[0]) {
    return String((v as any).insights[0]).trim();
  }

  // 5) 마지막: 문자열화
  try {
    const s = JSON.stringify(v);
    if (s && s.startsWith('{')) {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed.summary === 'string') return parsed.summary.trim();
    }
    return s;
  } catch {
    return String(v);
  }
}

function tsToString(ts?: Timestamp | null): string {
  if (!ts || !ts.toDate) return '';
  const d = ts.toDate();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(
    d.getDate()
  ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function FeedbackScreen() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [text, setText] = useState<string>('');
  const [when, setWhen] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return unsub;
  }, []);

  const load = useCallback(async (currentUid?: string | null) => {
    if (!currentUid) {
      setText('로그인이 필요합니다.');
      setWhen('');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const ref = doc(db, 'feedback', currentUid); // 문서 id = uid
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setText('AI 피드백 문서를 찾을 수 없습니다.');
        setWhen('');
      } else {
        const data = snap.data() as FeedbackDoc;
        const plain = pickPlainText(data?.aifeedback);
        setText(plain || 'AI 피드백 내용이 비어 있습니다.');
        setWhen(tsToString(data?.createdAt ?? data?.creatdAt ?? null));
      }
    } catch (e) {
      console.error('feedback load error', e);
      setText('피드백을 불러오는 중 오류가 발생했습니다.');
      setWhen('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(uid);
  }, [uid, load]);

  return (
    <View style={s.safe}>
      <View style={s.header}>
        <Text style={s.headerTitle}>AI 피드백</Text>
        <TouchableOpacity onPress={() => router.push("/list")}>
          <Text style={s.headerBtn}>닫기</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator />
          <Text style={s.muted}>불러오는 중…</Text>
        </View>
      ) : (
        <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 32 }}>
          <View style={s.row}>
            <View style={s.avatar}>
              <Text style={{ fontSize: 16 }}>🤖</Text>
            </View>

            {/* 🔹 제목 바로 아래 텍스트 전체 출력, 말풍선 박스 크게 */}
            <View style={s.bubbleLarge}>
              <Text style={s.aiTitle}>AI가 전하는 피드백</Text>
              <Text style={s.aiText}>{text}</Text>
              {!!when && <Text style={s.aiSub}>{when}</Text>}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' , marginTop:  80},
  headerBtn: { color: '#2563EB', fontSize: 14, marginTop:  80},

  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  muted: { color: '#6B7280', fontSize: 13 },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 },

  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },

  /** 🔹 여유 padding + minHeight로 박스 크게, 줄 제한 없음 */
  bubbleLarge: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 3,
    borderLeftColor: '#22C55E',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    minHeight: 80,
  },

  aiTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  aiText: { fontSize: 15, color: '#0F172A', lineHeight: 22 },
  aiSub: { marginTop: 8, fontSize: 11, color: '#64748B' },
});
