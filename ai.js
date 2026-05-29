const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * ฟังก์ชันตอบคำถามด้วย AI โดยใช้ข้อมูลจาก Sheets เป็นบริบท
 * ปรับปรุง: ใช้เวอร์ชัน v1 (Stable) เพื่อป้องกัน Error 404 ใน v1beta
 */
async function askAI(userQuestion, sheetContext) {
  if (!process.env.GEMINI_API_KEY) return "⚠️ ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในระบบครับ";

  // ใช้ API เวอร์ชัน 1 (Stable) แทน v1beta
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // รายชื่อโมเดลที่ต้องการลองใช้ (เน้นตัวที่เสถียร)
  const modelNames = ['gemini-1.5-flash', 'gemini-1.0-pro'];
  
  let lastError = null;

  for (const modelName of modelNames) {
    try {
      // ระบุเวอร์ชัน API เป็น v1
      const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1' });
      
      const systemPrompt = `
        คุณคือ "ผู้ช่วยอัจฉริยะ สายตรวจภูธรลานสัก"
        ทำหน้าที่ตอบคำถามจากข้อมูลที่ได้รับเท่านั้น หากไม่มีในข้อมูลให้บอกว่าไม่พบ
        ข้อมูลในระบบ:
        ${sheetContext}
      `;

      const result = await model.generateContent([systemPrompt, userQuestion]);
      const response = await result.response;
      const text = response.text();
      
      if (text) return text;
    } catch (err) {
      console.error(`AI Error (${modelName}):`, err.message);
      lastError = err.message;
      
      // ถ้าเป็น 404 ให้ลองตัวถัดไป
      if (err.message.includes('404') || err.message.includes('not found')) {
        continue;
      }
      break;
    }
  }

  return `❌ AI ขัดข้อง (Stable V1): ${lastError}\nกรุณาตรวจสอบสิทธิ์การใช้งานที่ Google AI Studio`;
}

/**
 * วิเคราะห์รูปภาพ (OCR) บัตรประชาชน หรือ ป้ายทะเบียน
 */
async function analyzeImage(imageBuffer, mimeType) {
  if (!process.env.GEMINI_API_KEY) return null;

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // ใช้ 1.5-flash เพราะเก่งเรื่อง OCR และรวดเร็ว
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }, { apiVersion: 'v1' });

    const prompt = `
      คุณคือผู้เชี่ยวชาญด้าน OCR ของตำรวจไทย หน้าที่ของคุณคือสกัดข้อมูลจากรูปภาพที่ส่งมาอย่างแม่นยำที่สุด:
      
      กรณีที่ 1: "บัตรประชาชน"
      - สกัด ชื่อ (firstName) และ นามสกุล (lastName) เป็นภาษาไทย
      - ไม่ต้องใส่คำนำหน้า (นาย/นาง/นางสาว)
      - สกัด "ที่อยู่ตามบัตร" (address) ให้ครบถ้วนที่สุด
      
      กรณีที่ 2: "ป้ายทะเบียนรถ"
      - สกัด เลขทะเบียน (plateNo) เช่น "1กข 1234"
      - สกัด จังหวัด (province) เช่น "อุทัยธานี"
      
      ตอบกลับเป็น JSON รูปแบบนี้เท่านั้น (ห้ามมีคำพูดอื่นนอกเหนือจาก JSON):
      {
        "type": "id_card" หรือ "license_plate",
        "firstName": "...",
        "lastName": "...",
        "address": "...",
        "plateNo": "...",
        "province": "...",
        "confidence": 0-1
      }
      
      สำคัญ: หากสแกนไม่สำเร็จหรือไม่มั่นใจ ให้ใส่ค่าเป็น null ในฟิลด์นั้นๆ แต่ยังคงส่งรูปแบบ JSON เดิมมา
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType
        }
      }
    ]);

    const response = await result.response;
    const rawText = response.text().trim();
    console.log('🤖 Raw AI OCR Response:', rawText);
    
    // พยายามหา JSON ภายในข้อความ (กรณี AI แอบใส่คำนำหน้ามา)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('❌ AI did not return a valid JSON format');
      return null;
    }
    
    const cleanJson = jsonMatch[0].replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    
    // ตรวจสอบความถูกต้องเบื้องต้น
    if (!parsed.type) return null;
    
    return parsed;
  } catch (err) {
    console.error('Analyze Image Error:', err.stack || err.message);
    return null;
  }
}

module.exports = { askAI, analyzeImage };
