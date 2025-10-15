import * as dotenv from "dotenv";
import * as functions from "firebase-functions";
import OpenAI from "openai";

dotenv.config();

// 🔹 OpenAI 클라이언트 생성
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🔹 ChatGPT와 연결하는 Firebase Function
export const chatWithAI = functions.https.onRequest(async (req, res) => {
  try {
    // POST 요청만 허용
    if (req.method !== "POST") {
      res.status(405).send("Only POST requests are allowed");
      return;
    }

    const userMessage = req.body.message;

    if (!userMessage) {
      res.status(400).json({ error: "⚠️ 'message' 필드가 필요합니다." });
      return;
    }

    // ✅ GPT-4o 모델 호출
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant for StudyFit." },
        { role: "user", content: userMessage },
      ],
    });

    const reply = completion.choices[0].message?.content || "응답을 가져오지 못했습니다.";

    res.status(200).json({ reply });
  } catch (error: any) {
    console.error("🔥 OpenAI 요청 중 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다.", details: error.message });
  }
});
