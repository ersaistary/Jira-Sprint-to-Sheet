// check-models.js
require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
  const models = await genAI.listModels();
  console.log("Model yang tersedia untuk API Key kamu:");
  models.models.forEach(m => {
    console.log(`- ${m.name} (support generateContent: ${m.supportedMethodNames.includes('generateContent')})`);
  });
}

listModels().catch(console.error);