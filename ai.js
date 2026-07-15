const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * ฟังก์ชันตอบคำถามด้วย AI โดยใช้ข้อมูลจาก Sheets เป็นบริบท
 * ปรับปรุง: ใช้เวอร์ชัน v1 (Stable) เพื่อป้องกัน Error 404 ใน v1beta
 */
async function askAI(userQuestion, sheetContext) {
  if (!process.env.GEMINI_API_KEY) return "⚠️ ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในระบบครับ";

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // ปรับชื่อโมเดลให้ตรงตามที่ Google กำหนด (ใช้รุ่น Gemini 3.5 และ 2.5 ซึ่งเป็นรุ่นปัจจุบันที่เปิดให้บริการ)
  const modelNames = ['gemini-3.5-flash', 'gemini-2.5-flash'];
  const errors = [];

  for (const modelName of modelNames) {
    try {
      // โหลดโมเดล (ระบุ apiVersion เป็น v1 เพื่อใช้เวอร์ชันที่เสถียรสูงสุด ป้องกัน Error 404 บน v1beta)
      const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1' });
      
      const systemPrompt = `
        คุณคือ "ผู้ช่วยอัจฉริยะ สายตรวจภูธรลานสัก"
        หน้าที่ของคุณคือการช่วยเหลือและตอบคำถามเกี่ยวกับบุคลากร ผู้นำชุมชน และเบอร์โทรของ สภ.ลานสัก
        
        กฎการทำงาน:
        1. หากคำถามเกี่ยวข้องกับข้อมูลรายชื่อคน ตำแหน่ง เบอร์โทรศัพท์ หรือข้อมูลภายในของ สภ.ลานสัก:
           - ให้ตรวจสอบข้อมูลในระบบด้านล่างอย่างละเอียดก่อนตอบ
           - หากหาข้อมูลไม่พบในระบบจริงๆ ให้ตอบว่า "ไม่พบข้อมูลดังกล่าวในระบบครับ"
        2. หากคำถามเป็นการทักทายทั่วไป หรือคำถามทั่วไปที่ไม่เกี่ยวข้องกับข้อมูลระบบ (เช่น ทักทาย, ถามเวลา, คำนวณเลข, ทดสอบระบบ):
           - ให้ตอบสนองอย่างเป็นมิตร สุภาพ และมีไมตรีจิตในฐานะผู้ช่วยตำรวจ
           - ไม่จำเป็นต้องตอบว่า "ไม่พบ" หรือปฏิเสธการสนทนาทั่วไป
        
        ข้อมูลในระบบ:
        ${sheetContext || 'ไม่มีข้อมูล'}
      `;

      const result = await model.generateContent([systemPrompt, userQuestion]);
      const response = await result.response;
      const text = response.text();
      
      if (text) return text;
    } catch (err) {
      console.error(`AI Error (${modelName}):`, err.message);
      errors.push(`${modelName}: ${err.message}`);
      continue;
    }
  }

  return `❌ AI ขัดข้อง:\n${errors.join('\n')}\n\n💡 กรุณาตรวจสอบสิทธิ์การใช้งานและการตั้งค่าคีย์ที่ Google AI Studio`;
}

module.exports = { askAI };
