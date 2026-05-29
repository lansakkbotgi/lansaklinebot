require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  if (!process.env.GEMINI_API_KEY) {
    console.log('❌ GEMINI_API_KEY is not set');
    return;
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  console.log('--- Testing API v1 ---');
  try {
    // There is no easy "listModels" in the standard SDK without more complex setup, 
    // but we can try a simple generateContent with a few model names.
    const modelsToTry = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro', 'gemini-pro'];
    
    for (const m of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: m }, { apiVersion: 'v1' });
        const result = await model.generateContent('Hi');
        console.log(`✅ v1 supports model: ${m}`);
      } catch (e) {
        console.log(`❌ v1 does NOT support model: ${m} (${e.message})`);
      }
    }
  } catch (err) {
    console.log('Error testing v1:', err.message);
  }

  console.log('\n--- Testing API v1beta ---');
  try {
    const modelsToTry = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro', 'gemini-pro'];
    
    for (const m of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: m }, { apiVersion: 'v1beta' });
        const result = await model.generateContent('Hi');
        console.log(`✅ v1beta supports model: ${m}`);
      } catch (e) {
        console.log(`❌ v1beta does NOT support model: ${m} (${e.message})`);
      }
    }
  } catch (err) {
    console.log('Error testing v1beta:', err.message);
  }
}

test();
