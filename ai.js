const { GoogleGenerativeAI } = require('@google/generative-ai');

// ตั้งค่า Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

/**
 * ฟังก์ชันตอบคำถามด้วย AI โดยใช้ข้อมูลจาก Sheets เป็นบริบท
 */
async function askAI(userQuestion, sheetContext) {
  if (!process.env.GEMINI_API_KEY) return null;

  try {
    const systemPrompt = `
      คุณคือ "ผู้ช่วยอัจฉริยะ สายตรวจภูธรลานสัก" มีหน้าที่ตอบคำถามประชาชนและเจ้าหน้าที่
      ข้อมูลปัจจุบันในระบบมีดังนี้:
      ---
      ${sheetContext}
      ---
      คำแนะนำในการตอบ:
      1. ตอบด้วยภาษาที่สุภาพ เป็นกันเอง และดูเป็นมืออาชีพ
      2. หากข้อมูลที่ถามอยู่ในระบบ ให้สรุปคำตอบให้ชัดเจน
      3. หากไม่พบข้อมูลในระบบ ให้แนะนำช่องทางติดต่อสถานี (191 หรือ 056-559-xxx)
      4. ตอบให้กระชับ เข้าใจง่าย
    `;

    const result = await model.generateContent([systemPrompt, userQuestion]);
    const response = await result.response;
    return response.text();
  } catch (err) {
    console.error('AI Error:', err.message);
    return null;
  }
}

module.exports = { askAI };
