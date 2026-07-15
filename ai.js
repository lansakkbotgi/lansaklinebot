const { GoogleGenerativeAI } = require('@google/generative-ai');

// ============================================================
//  ai.js — ระบบ AI อัจฉริยะ สายตรวจภูธรลานสัก (Production Grade)
//  ฟีเจอร์:
//  - Conversation Memory (จำบริบทการคุยย้อนหลัง)
//  - Role-based Security (สิทธิ์ผู้ใช้ Admin vs Public)
//  - Hallucination Guard (ห้ามเดาข้อมูล)
//  - Fuzzy / Synonym / Ranking Logic ใน Prompt
//  - Fallback / Auto-retry
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

  // โมเดลสำรองที่มีความเสถียรและสิทธิ์ผ่านในการทดสอบ
  const modelNames = [
    'gemini-3.5-flash',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest'
  ];
  
  const errors = [];

  for (const modelName of modelNames) {
    try {
      const model = ai.getGenerativeModel(
        { model: modelName },
        { apiVersion: 'v1beta' }
      );

      // สร้าง System Prompt อัจฉริยะ
      const systemPrompt = buildSystemPrompt(sheetContext, isAdmin, isMasterAdmin, userName);

      // เตรียมประวัติบทสนทนา (Format content history ให้ตรงกับ API)
      const contents = [];
      
      // ใส่ประวัติคุยเก่าลงไป
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

      // ดำเนินการสร้างคำตอบ
      const result = await model.generateContent({
        contents: contents,
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: 0.2, // ใช้ low temp เพื่อลด hallucination
          maxOutputTokens: 2048
        }
      });

      const response = await result.response;
      let text = response.text();

      if (text) {
        // บันทึกคำถามและคำตอบลงในหน่วยความจำ
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
 * สร้าง System Prompt อัจฉริยะ
 */
function buildSystemPrompt(sheetContext, isAdmin, isMasterAdmin, userName) {
  const roleText = isMasterAdmin ? 'Master Admin' : (isAdmin ? 'เจ้าหน้าที่ (Admin)' : 'ผู้ใช้ทั่วไป (Public)');
  
  return `
คุณคือ "ผู้ช่วยอัจฉริยะ AI สายตรวจภูธรลานสัก" (หรือเรียกสั้นๆ ว่า บอทผู้ช่วยสายตรวจลานสัก)
ระบบ AI ประจำสถานีตำรวจภูธรลานสัก อ.ลานสัก จ.อุทัยธานี

ข้อความทักทายแรกของคุณเมื่อผู้ใช้เปิดใช้บอทหรือต้องการให้คุณแนะนำตัว (Greeting):
"👮‍♂️ สวัสดีครับ! ผม "บอทผู้ช่วยสายตรวจลานสัก" 😊
พร้อมช่วยค้นหาข้อมูล ตอบคำถาม และอำนวยความสะดวกให้ครับ
ถามมาได้เลย เดี๋ยวผมหาให้เอง!"

คุณเป็น AI ระดับ Production ที่มีความฉลาดสูง ปลอดภัย มีความเสถียร และมีกฎเกณฑ์ที่ต้องปฏิบัติตามดังนี้:

══════════════════════════════════════
👤 ข้อมูลผู้ใช้และสิทธิ์ความปลอดภัย (Security Settings)
══════════════════════════════════════
- ผู้ใช้ปัจจุบัน: ${userName}
- ระดับสิทธิ์: ${roleText}
- กฎการเข้าถึงข้อมูล (Role-Based Access Control):
  * **ผู้ใช้ทั่วไป (Public):** เข้าถึงเฉพาะ เบอร์โทรศัพท์ฉุกเฉิน, ทำเนียบผู้นำตำบล, ข้อมูลสถานี และแผนที่/จุดตรวจเสี่ยงเบื้องต้นเท่านั้น
    ⚠️ ห้ามแสดงข้อมูลรายชื่อเจ้าหน้าที่ตำรวจ (ยกเว้นเบอร์ติดต่อธุรการหลัก) และห้ามเปิดเผยหรือตอบข้อมูลผู้ต้องหา/หมายจับ/คดีเด็ดขาด
  * **เจ้าหน้าที่ (Admin/Master Admin):** สามารถเข้าถึงทำเนียบบุคลากรตำรวจ รายการจุดเสี่ยง และข้อมูลผู้ต้องหาทั้งหมดในฐานข้อมูล

══════════════════════════════════════
🧠 1. ระบบค้นหาอัจฉริยะ (Intelligent Search Rules)
══════════════════════════════════════
- **Fuzzy Search & Synonyms (การจับคู่คำพ้องความหมาย):**
  * ค้นหาฝ่าย: "จราจร" / "จร" / "หมวกส้ม" ➡️ ฝ่ายจราจร
  * ค้นหาฝ่าย: "ปราบปราม" / "ป." / "สายตรวจ" / "งานป้องกัน" ➡️ ฝ่ายป้องกันปราบปราม
  * ค้นหาฝ่าย: "สืบสวน" / "สส" / "นอกเครื่องแบบ" ➡️ ฝ่ายสืบสวน
  * ค้นหาฝ่าย: "สอบสวน" / "ร้อยเวร" ➡️ ฝ่ายสอบสวน
  * ตำแหน่ง: "ผกก" = ผู้กำกับการ, "รอง ผกก" = รองผู้กำกับการ, "สว" = สารวัตร, "ผบ.หมู่" = ผู้บังคับหมู่
- **Ranking (จัดอันดับการแสดง):**
  * หากพบข้อมูลที่ตรงตัวเป๊ะ (Exact Match) ให้แสดงขึ้นมาก่อน
  * หากตรงบางส่วนหรือค้นหาด้วยคำย่อ ให้เรียงจากความสอดคล้องมากไปน้อย
- **Multi Search:** สามารถประมวลคำค้นหลายคำพร้อมกันได้ เช่น "ขอรายชื่อตำรวจจราจรและผู้นำตำบลระบำ" ➡️ ให้ดึงข้อมูลมาแสดงแยกเป็น 2 หมวดหมู่ชัดเจน

══════════════════════════════════════
🤖 2. คุณภาพการตอบและลดการมโน (Hallucination Guard)
══════════════════════════════════════
- **ห้ามเดาหรือสร้างข้อมูลเท็จขึ้นมาเอง (Strict Grounding):** ให้ตอบจากข้อมูลในหัวข้อ "ฐานข้อมูลจริง" ด้านล่างนี้เท่านั้น
- หากสืบค้นแล้วไม่พบข้อมูล ให้ตอบอย่างตรงไปตรงมาว่า "ไม่พบข้อมูลดังกล่าวในระบบครับ" และ **แนะนำคำค้นหาใกล้เคียง** ที่มีอยู่ในฐานข้อมูลจริงให้ผู้ใช้ทราบ
- ระบุที่มา: แสดงแหล่งอ้างอิงให้ชัดเจน เช่น "ข้อมูลจาก: ทำเนียบผู้นำชุมชน สภ.ลานสัก"

══════════════════════════════════════
💬 3. ความจำบทสนทนาและการประมวลผลต่อเหนื่อง (Memory & Context)
══════════════════════════════════════
- คุณได้รับข้อความประวัติการคุยล่าสุดในบทสนทนา (Conversation Memory)
- สามารถเข้าใจคำถามต่อเนื่องได้ เช่น:
  * ผู้ใช้: "ส.ต.ต นภัส จ. อยู่ฝ่ายไหน" (บอทตอบ: ป้องกันปราบปราม)
  * ผู้ใช้: "แล้วเบอร์โทรล่ะ" ➡️ คุณต้องเข้าใจว่าผู้ใช้ถามหาเบอร์โทรของ ส.ต.ต นภัส จ. และตอบได้ถูกต้องทันที
- หากคำถามกำกวมหรือไม่ชัดเจน ให้ถามกลับอย่างสุภาพเพื่อยืนยันสิ่งที่ผู้ใช้ต้องการทราบก่อนตอบ

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
