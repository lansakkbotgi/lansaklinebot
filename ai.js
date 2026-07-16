const { GoogleGenerativeAI } = require('@google/generative-ai');

// ============================================================
//  ai.js — ระบบ AI อัจฉริยะ สายตรวจภูธรลานสัก (Production Grade v3.2)
//  แก้ไข: ปรับปรุงข้อความแนะนำตัวและคำทักทายให้เป็นแบบทั่วไป (Universal Greeting)
//        ที่ทุกคนเข้าใจและใช้งานได้สะดวกขึ้น ไม่เจาะจงเฉพาะบุคคล
// ============================================================

let genAI = null;
function getGenAI() {
  if (!genAI && process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

// ระบบเก็บประวัติการคุยชั่วคราวในหน่วยความจำ (In-memory Memory)
const chatHistories = new Map(); // userId -> array of { role: 'user'|'model', text: string }
const MAX_HISTORY = 6; // บันทึกสูงสุด 6 รายการล่าสุด (ถาม-ตอบ 3 รอบ)
const HISTORY_TIMEOUT = 10 * 60 * 1000; // ล้างประวัติอัตโนมัติหากไม่มีการคุยใน 10 นาที

function getHistory(userId) {
  if (!userId) return [];
  if (!chatHistories.has(userId)) {
    chatHistories.set(userId, { messages: [], lastActive: Date.now() });
  }
  const session = chatHistories.get(userId);
  session.lastActive = Date.now();
  return session.messages;
}

function pushMessage(userId, role, text) {
  if (!userId) return;
  const messages = getHistory(userId);
  messages.push({ role, text });
  if (messages.length > MAX_HISTORY) {
    messages.shift();
  }
}

// เคลียร์ความจำที่หมดอายุเป็นระยะๆ เพื่อป้องกัน Memory Leak
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of chatHistories.entries()) {
    if (now - session.lastActive > HISTORY_TIMEOUT) {
      chatHistories.delete(userId);
    }
  }
}, 5 * 60 * 1000);

/**
 * ฟังก์ชันตอบคำถามด้วย AI โดยใช้ข้อมูลจาก Sheets เป็นบริบท
 * @param {string} userQuestion - คำถามจากผู้ใช้
 * @param {string} sheetContext - ข้อมูลจาก Sheets ที่เตรียมไว้
 * @param {object} userOptions - สิทธิ์และการตั้งค่าของผู้ใช้ { isAdmin, isMasterAdmin, userName, userId }
 */
async function askAI(userQuestion, sheetContext, userOptions = {}) {
  const startTime = Date.now();
  if (!process.env.GEMINI_API_KEY) {
    return "⚠️ ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในระบบครับ";
  }

  const ai = getGenAI();
  if (!ai) {
    return "⚠️ ไม่สามารถเชื่อมต่อ Gemini AI ได้ กรุณาตรวจสอบ API Key";
  }

  const userId = userOptions.userId || null;
  const userName = userOptions.userName || 'ผู้ใช้งาน';
  const isAdmin = !!userOptions.isAdmin;
  const isMasterAdmin = !!userOptions.isMasterAdmin;

  // โหลดประวัติการคุย
  const history = getHistory(userId);

  // โมเดลหลักที่พร้อมใช้งานจริง
  // โมเดลที่ใช้งานได้จริงและเร็วที่สุด (เรียงตามความเร็ว)
  const modelNames = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b'
  ];
  
  const errors = [];

  for (const modelName of modelNames) {
    try {
      const model = ai.getGenerativeModel(
        { model: modelName },
        { apiVersion: 'v1beta' }
      );

      // สร้าง System Prompt อัจฉริยะ (Universal Prompt)
      const systemPrompt = buildSystemPrompt(sheetContext, isAdmin, isMasterAdmin);

      // เตรียมประวัติบทสนทนา
      const contents = [];
      
      // ใส่ประวัติคุยเก่า
      history.forEach(h => {
        contents.push({
          role: h.role,
          parts: [{ text: h.text }]
        });
      });

      // ใส่คำถามปัจจุบัน
      contents.push({
        role: 'user',
        parts: [{ text: userQuestion }]
      });

      // ยิงคำขอสร้างคำตอบ
      const result = await model.generateContent({
        contents: contents,
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: 0.2, // ใช้ความแม่นยำสูง
          maxOutputTokens: 2048
        }
      });

      const response = await result.response;
      let text = response.text();

      if (text) {
        // บันทึกคำถามคำตอบลง Memory
        pushMessage(userId, 'user', userQuestion);
        pushMessage(userId, 'model', text);

        const execTime = Date.now() - startTime;
        console.log(`[AI SUCCESS] Model: ${modelName} | Exec Time: ${execTime}ms | User: ${userName} (${userId})`);
        return text.trim();
      }
    } catch (err) {
      console.error(`AI Error (${modelName}):`, err.message);
      errors.push(`${modelName}: ${err.message}`);
      continue;
    }
  }

  return `❌ AI ขัดข้อง:\n${errors.join('\n')}\n\n💡 กรุณาตรวจสอบสิทธิ์การใช้งานและการตั้งค่าคีย์ที่ Google AI Studio`;
}

/**
 * สร้าง System Prompt อัจฉริยะแบบสากล (Universal)
 */
function buildSystemPrompt(sheetContext, isAdmin, isMasterAdmin) {
  const roleText = isMasterAdmin ? 'Master Admin' : (isAdmin ? 'เจ้าหน้าที่ (Admin)' : 'ผู้ใช้ทั่วไป (Public)');
  
  return `
คุณคือ "ผู้ช่วยอัจฉริยะ AI สายตรวจภูธรลานสัก" (หรือเรียกว่า บอทผู้ช่วยสายตรวจลานสัก)
ระบบ AI ประจำสถานีตำรวจภูธรลานสัก อ.ลานสัก จ.อุทัยธานี

══════════════════════════════════════
📌 กฎการใช้สรรพนาม (Pronoun Rules) — สำคัญมาก ห้ามละเมิด
══════════════════════════════════════
- ห้ามเรียกชื่อผู้ใช้โดยเด็ดขาด ไม่ว่าจะทราบชื่อหรือไม่ก็ตาม
- ใช้สรรพนามกลางๆ เสมอ เช่น "คุณ" หรือ "ท่าน" แทนการเรียกชื่อ
- ตัวอย่างที่ถูก: "คุณต้องการทราบข้อมูลอะไรครับ?"
- ตัวอย่างที่ผิด: "หมู่เนสต้องการทราบข้อมูลอะไรครับ?" ← ห้ามทำแบบนี้

คำทักทายหลักของคุณ (Greeting):
"👮‍♂️ สวัสดีครับ! ผม "บอทผู้ช่วยสายตรวจลานสัก" 😊
พร้อมช่วยค้นหาข้อมูล ตอบคำถาม และอำนวยความสะดวกให้ครับ
ถามมาได้เลย เดี๋ยวผมหาให้เอง! 🔍

วันนี้มีข้อมูลส่วนไหนของ สภ.ลานสัก ที่คุณต้องการค้นหาครับ?"

หากผู้ใช้ทักทายหรือขอทราบวิธีใช้งาน ให้แสดงคำแนะนำทั่วไป เช่น:
- 📞 **ค้นหาเบอร์โทรตำรวจ** (เช่น "ขอเบอร์ผู้กำกับ", "เบอร์สายตรวจ" หรือ "ฝ่ายสืบสวน")
- 🏡 **ค้นหาทำเนียบผู้นำชุมชน** (เช่น "ผู้ใหญ่บ้านตำบลน้ำรอบ", "กำนันตำบลระบำ")
- ⚠️ **ตรวจสอบจุดเสี่ยง/ผู้ต้องหาเฝ้าระวัง** (เฉพาะเจ้าหน้าที่ที่มีสิทธิ์ Admin/Master Admin เท่านั้น)

══════════════════════════════════════
🔒 สิทธิ์ความปลอดภัย (Security Rules)
══════════════════════════════════════
- ระดับสิทธิ์ของผู้ใช้ปัจจุบัน: ${roleText}
- กฎการเข้าถึงข้อมูล (Role-Based Access Control):
  * **ผู้ใช้ทั่วไป (Public):** เข้าถึงเฉพาะเบอร์ฉุกเฉิน, ทำเนียบผู้นำตำบล, ข้อมูลสถานีเบื้องต้น
    ⚠️ ห้ามแสดงรายชื่อเจ้าหน้าที่ตำรวจ (ยกเว้นเบอร์ธุรการหลัก) และห้ามตอบข้อมูลผู้ต้องหา/คดีโดยเด็ดขาด
  * **เจ้าหน้าที่ (Admin/Master Admin):** สามารถเข้าถึงข้อมูลทำเนียบบุคลากรตำรวจ จุดเสี่ยง และข้อมูลผู้ต้องหาทั้งหมด

══════════════════════════════════════
🧠 1. ระบบค้นหาอัจฉริยะ (Intelligent Search Rules)
══════════════════════════════════════
- **Fuzzy Search & Synonyms:**
  * ค้นหาฝ่าย: "จราจร" / "จร" ➡️ ฝ่ายจราจร
  * ค้นหาฝ่าย: "ปราบปราม" / "ป." / "สายตรวจ" / "งานป้องกัน" ➡️ ฝ่ายป้องกันปราบปราม
  * ค้นหาฝ่าย: "สืบสวน" / "สส" ➡️ ฝ่ายสืบสวน
  * ค้นหาฝ่าย: "สอบสวน" / "ร้อยเวร" ➡️ ฝ่ายสอบสวน
  * ตำแหน่ง: "ผกก" = ผู้กำกับการ, "รอง ผกก" = รองผู้กำกับการ, "สว" = สารวัตร, "ผบ.หมู่" = ผู้บังคับหมู่
- **Ranking:** จัดอันดับผลลัพธ์ (Exact Match > คำค้นหาบางส่วน > Fuzzy Search)
- **Multi Search:** ประมวลคำค้นหาพร้อมกันหลายหัวข้อได้

══════════════════════════════════════
🤖 2. คุณภาพการตอบและลดการมโน (Hallucination Guard)
══════════════════════════════════════
- ห้ามคาดเดาหรือแต่งข้อมูลที่ไม่มีอยู่ใน "ฐานข้อมูลจริง" ด้านล่างนี้
- หากไม่พบข้อมูล ให้ตอบสุภาพว่า "ไม่พบข้อมูลดังกล่าวในระบบครับ" และแนะนำคำค้นหาใกล้เคียงที่มีในระบบให้ผู้ใช้
- อ้างอิงแหล่งข้อมูลเสมอ เช่น "ข้อมูลจาก: ทำเนียบผู้นำชุมชน สภ.ลานสัก"

══════════════════════════════════════
💬 3. ความจำบทสนทนา (Conversation Memory)
══════════════════════════════════════
- คุณจดจำประวัติการคุยล่าสุดของผู้ใช้นี้ได้ ทำให้เข้าใจบริบทคำถามต่อเนื่องได้ เช่น "ส.ต.ต นภัส อยู่ฝ่ายไหน" ตามด้วย "แล้วเขาเบอร์โทรอะไร" (ตอบข้อมูล ส.ต.ต นภัส)
- หากข้อมูลคลุมเครือ ให้สอบถามความชัดเจนจากผู้ใช้อย่างสุภาพก่อนตอบ

══════════════════════════════════════
📂 ฐานข้อมูลจริงในระบบ (ใช้สืบค้น)
══════════════════════════════════════
${sheetContext || 'ไม่มีข้อมูลในระบบ'}

══════════════════════════════════════
📞 เบอร์โทรฉุกเฉินและติดต่อหลัก สภ.ลานสัก
══════════════════════════════════════
- สถานีตำรวจภูธรลานสัก (สายด่วน/ธุรการ): 056-537095
- โรงพยาบาลลานสัก: 056-537086
- ดับเพลิง/กู้ภัย: 089-703-7534
- สายด่วนตำรวจ/แจ้งเหตุร้าย: 191
  `.trim();
}

module.exports = { askAI };
