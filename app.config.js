// app.config.js
module.exports = {
  expo: {
    name: "personal",
    slug: "personal",
    scheme: "personal",
    extra: {
      //   LLM 함수(Cloud Run) URL 
      EXPO_PUBLIC_AI_ENDPOINT: "https://chatwithai-aqyo5fjnda-uc.a.run.app",
    },
  },
};
