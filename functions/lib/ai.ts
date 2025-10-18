// app/lib/ai.ts
import Constants from "expo-constants";

const AI_ENDPOINT =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_AI_ENDPOINT ||
  process.env.EXPO_PUBLIC_AI_ENDPOINT;

export type StudyTask = {
  subject: string;
  priority: "high" | "mid" | "low";
  detail: string;
  minutes?: number;
};

export type AiPlanItem = {
  subject: string;
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
  detail: string;
};

export async function requestAiSchedule(payload: {
  tasks: StudyTask[];
  constraints?: {
    weekdaySchool?: boolean;
    lunchAt?: string;
    totalMinutes?: number;
  };
}) {
  if (!AI_ENDPOINT) throw new Error("AI endpoint missing.");
  const message = buildPrompt(payload);

  const res = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) throw new Error("AI 요청 실패");
  const data = await res.json();
  return data.reply as string; // 서버가 { reply: string } 반환한다고 가정
}

function buildPrompt(payload: {
  tasks: StudyTask[];
  constraints?: { weekdaySchool?: boolean; lunchAt?: string; totalMinutes?: number };
}) {
  const { tasks, constraints } = payload;
  return `
너는 학습 스케줄러야. 아래 오늘의 공부 할 일과 제약을 바탕으로
JSON 배열만 출력해. 불필요한 설명 금지.

형식:
[
  {"subject":"수학","detail":"2단원 문제 풀이","start":"18:00","end":"18:40"},
  {"subject":"영어","detail":"단어 30개","start":"18:50","end":"19:20"}
]

할 일:
${tasks.map((t,i)=>`${i+1}. [${t.priority}] ${t.subject} - ${t.detail} ${t.minutes?`(${t.minutes}분)`:""}`).join("\n")}

제약:
- 총 공부 가능 시간: ${constraints?.totalMinutes ?? 120}분
- 평일 학교시간 제외: ${constraints?.weekdaySchool ? "예":"아니오"}
- 식사/휴식 고려: ${constraints?.lunchAt ?? "기본"}

이제 위 형식(JSON)만 반환해.
`.trim();
}
