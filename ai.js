const { GoogleGenerativeAI } = require('@google/generative-ai');

// ตั้งค่า Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

/**
 * ฟังก์ชันตอบคำถามด้วย AI โดยใช้ข้อมูลจาก Sheets เป็นบริบท
 */
async function askAI(userQuestion, sheetContext) {
  if (!process.env.GEMINI_API_KEY) return "⚠️ ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในระบบครับ";

  try {
    const systemPrompt = `
      คุณคือ "ผู้ช่วยอัจฉริยะ สายตรวจภูธรลานสัก"
      ข้อมูลในระบบ:
      ${sheetContext}
    `;

    const result = await model.generateContent([systemPrompt, userQuestion]);
    const response = await result.response;
    const text = response.text();
    return text || "AI คิดไม่ออกครับ ลองถามใหม่อีกครั้ง";
  } catch (err) {
    console.error('AI Error:', err.message);
    return `❌ AI ขัดข้อง: ${err.message}`;
  }
}

module.exports = { askAI };
