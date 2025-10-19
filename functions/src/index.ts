import * as dotenv from "dotenv";
import { onRequest } from "firebase-functions/v2/https";
import { } from "firebase/firestore";
import OpenAI from "openai";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const chatWithAI = onRequest(async (req, res) => {
  const { path, method, body } = req;
  
  try {
    if (path === "/" && method === "POST") {
      const userMessage = body.message;

      if (!userMessage) {
        res.status(400).json({ error: "⚠️ 'message' 필드가 필요합니다." });
        return;
      }

      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant for StudyFit.",
          },
          { role: "user", content: userMessage },
        ],
      });

      const reply =
        completion.choices[0].message?.content || "응답을 가져오지 못했습니다.";

      res.status(200).json({ reply });
    } else if (path === "/summary" && method === "POST") {
      const payload = body.payload;
      const promt = [
        "너는 'StudyFit' 앱의 개인 공부 코치야.",
        "사용자가 오늘 공부를 마친 뒤 작성한 리뷰 데이터를 받게 돼.",
        "데이터에는 다음 정보가 포함돼:",
      
        "- 집중도(focuStars): 1~5점",
        "- 오늘의 느낌(feelings): ['피곤함', '집중 잘됨', 시간 남았음, 괜찮음 등)",
        "- 목표 달성 여부(goalStatus): full, partial, none",
        "- 시간대 적절성(timeSlot): good, ok, bad",
        "- 시간 배분 적절성(timeAlloc): adequate, insufficient, leftover",
        "- 개선점(memo): 사용자가 직접 적은 메모나 개선사항",

        "너의 역할:",
        "1. 위 정보를 분석해서 오늘의 공부 상태를 요약",
        "2. 개선점 또는 패턴을 찾아 피드백을 2~5개 생성",
        //"3. 태그(tags) 3~6개 생성 (예: ['집중', '루틴', '시간관리'])",
        "4. 모델은 이전 학습 데이터를 참고해 반복되는 패턴이나 개선사항이 있으면 반영해라.",


        "유저의 리뷰 데이터(json):",
        payload,
        "",
        "출력은 반드시 다음 JSON 형식으로만 해. summary 키의 값: 다음 시간표 제작 요청이 올때 제공되는 리뷰에 따른 앞으로의 시간표 제작 개선점 3줄로 나열.",
        `{ "summary": "" }`,
      ]; 

      const finalPrompt = promt.join("\n");
      
      const request = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant for StudyFit.",
          },
          { role: "user", content: finalPrompt },
        ],
      });

      const reply =
        request.choices[0].message?.content || "응답을 가져오지 못했습니다.";
      res.status(200).json({ reply });
    }
  } catch (error: any) {
    console.error("🔥 OpenAI 요청 중 오류:", error);
    res
      .status(500)
      .json({ error: "서버 오류가 발생했습니다.", details: error.message });
  }
});
