'use strict';
/**
 * ai-context-simulation.test.js
 * จำลองการสร้าง context ที่ส่งให้ AI และตรวจสอบว่าคำถามซับซ้อนต่างๆ
 * ได้รับข้อมูลครบถ้วนในรูปแบบที่ AI จะใช้ตอบได้ถูกต้อง
 */
const test  = require('node:test');
const assert = require('node:assert/strict');
const {
  summarizePersonnel,
  summarizeLeaders,
  formatLeaderFacts,
  formatPersonnelFactsOrUnavailable,
  buildCombinedAnalysisContext,
  isAnalyticalQuestion,
} = require('../personnel-summary');

// ─────────────────────────────────────────────
//  ข้อมูลจำลอง (Mock data) — คล้ายกับที่ Google Sheet จริงๆ
// ─────────────────────────────────────────────
const MOCK_LEADERS = [
  { fullName: 'นายสมศักดิ์ ใจดี',    position: 'ผู้ใหญ่บ้าน', area: 'ลานสัก',    village: 'หมู่ 4', phone: '0812345671' },
  { fullName: 'นางสมหญิง รักงาน',   position: 'ผู้ใหญ่บ้าน', area: 'ลานสัก',    village: 'หมู่ 5', phone: '0812345672' },
  { fullName: 'นายวิชัย ขยันดี',     position: 'ผู้ใหญ่บ้าน', area: 'ลานสัก',    village: 'หมู่ 5', phone: '0812345673' },
  { fullName: 'นายกำนัน บุญมา',      position: 'กำนัน',       area: 'ลานสัก',    village: 'หมู่ 1', phone: '0812345674' },
  { fullName: 'นายประสิทธิ์ น้ำรอบ', position: 'ผู้ใหญ่บ้าน', area: 'น้ำรอบ',    village: 'หมู่ 2', phone: '0812345675' },
  { fullName: 'นางมาลี ระบำ',        position: 'ผู้ใหญ่บ้าน', area: 'ระบำ',      village: 'หมู่ 3', phone: '0812345676' },
  { fullName: 'นายอนันต์ ประดู่',    position: 'ผู้ใหญ่บ้าน', area: 'ประดู่ยืน', village: 'หมู่ 6', phone: '0812345677' },
  { fullName: 'นายสุรชัย ทุ่งนา',   position: 'ผู้ใหญ่บ้าน', area: 'ทุ่งนางาม', village: 'หมู่ 7', phone: '0812345678' },
];

const MOCK_PERSONNEL = [
  { fullName: 'ร.ต.อ. สมชาย มั่นคง',  position: 'ผู้กำกับการ',       area: 'ผู้บังคับบัญชา',       phone: '0811111101' },
  { fullName: 'ด.ต. สมหมาย ดีงาม',    position: 'ผู้บังคับหมู่',      area: 'งานป้องกันปราบปราม',   phone: '0811111102' },
  { fullName: 'จ.ส.ต. วีระ แกล้วกล้า', position: 'เจ้าหน้าที่สายตรวจ', area: 'งานป้องกันปราบปราม',   phone: '0811111103' },
  { fullName: 'ด.ต. ปิติ สืบสวน',     position: 'นักสืบ',             area: 'งานสืบสวน',            phone: '0811111104' },
  { fullName: 'ส.ต.ต. นภัส จ.',       position: 'ผู้ช่วยสายตรวจ',     area: 'งานป้องกันปราบปราม',   phone: '0811111105' },
  { fullName: 'นักเรียน ฝึกงาน',      position: 'นักศึกษาฝึกงาน',     area: 'เด็กฝึกงาน',           phone: '-' },
];

// สร้าง leadersText เหมือน index.js สร้างจริง
function buildLeadersText(leaders) {
  return leaders.map(l =>
    `- ${l.fullName} ตำแหน่ง: ${l.position} ตำบล: ${l.area} หมู่: ${l.village || '-'} โทร: ${l.phone || '-'}`
  ).join('\n');
}

function buildPersonnelText(personnel) {
  return personnel.map(p =>
    `- ${p.fullName} ตำแหน่ง: ${p.position} ฝ่าย: ${p.area} โทร: ${p.phone || '-'}`
  ).join('\n');
}

const LEADERS_TEXT    = buildLeadersText(MOCK_LEADERS);
const PERSONNEL_TEXT  = buildPersonnelText(MOCK_PERSONNEL);
const LEADER_SUMMARY  = summarizeLeaders(MOCK_LEADERS);
const PERSONNEL_SUMMARY = summarizePersonnel(MOCK_PERSONNEL);

// ─────────────────────────────────────────────
//  helper: สร้าง context แบบเต็ม (เหมือน sheetContext ใน index.js)
// ─────────────────────────────────────────────
function buildSheetContext(isAdmin = true) {
  const personnelFacts = isAdmin ? formatPersonnelFactsOrUnavailable(PERSONNEL_SUMMARY) : '🔒 จำกัดเฉพาะเจ้าหน้าที่เท่านั้น';
  const leaderFacts    = formatLeaderFacts(LEADER_SUMMARY);
  const personnelText  = isAdmin ? PERSONNEL_TEXT : '🔒 จำกัดเฉพาะเจ้าหน้าที่เท่านั้น';
  const suspectsText   = isAdmin ? '- ไม่มีข้อมูลผู้ต้องหา (mock)' : '🔒 จำกัดเฉพาะเจ้าหน้าที่เท่านั้น';
  const locationsText  = isAdmin ? '- จุดตรวจบ้านทุ่งนา ที่อยู่: หมู่ 7 ลานสัก' : '🔒 จำกัดเฉพาะเจ้าหน้าที่เท่านั้น';

  return [
    personnelFacts, '',
    leaderFacts, '',
    'ทำเนียบบุคลากร สภ.ลานสัก:', personnelText, '',
    'ทำเนียบผู้นำตำบล (กำนัน/ผู้ใหญ่บ้าน/ผู้นำชุมชน ทุกหมู่บ้าน):', LEADERS_TEXT, '',
    'รายการสถานที่/จุดตรวจเสี่ยงภัย:', locationsText, '',
    'บัญชีข้อมูลผู้ต้องหาและหมายจับ (เฝ้าระวัง):', suspectsText,
  ].join('\n');
}

function buildAnalyticalContext() {
  return buildCombinedAnalysisContext(PERSONNEL_SUMMARY, LEADER_SUMMARY, {
    leadersText:   LEADERS_TEXT,
    personnelText: PERSONNEL_TEXT,
    locationsText: '- จุดตรวจบ้านทุ่งนา ที่อยู่: หมู่ 7 ลานสัก',
    suspectsText:  '- ไม่มีข้อมูลผู้ต้องหา (mock)',
  });
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 1: isAnalyticalQuestion — ตรวจสอบ regex ว่า detect ถูกหรือไม่
// ═══════════════════════════════════════════════════════════════════

test('[Q1] ผู้ใหญ่บ้านหมู่ 4 และหมู่ 5 มีกี่คน → ต้องเป็น analytical', () => {
  assert.equal(isAnalyticalQuestion('ผู้ใหญ่บ้านหมู่ 4 และหมู่ 5 มีกี่คน'), true);
});

test('[Q2] ผู้ใหญ่บ้านหมู่ 5 มีกี่คนให้วิเคราะห์เปอร์เซ็นต์ → analytical', () => {
  assert.equal(isAnalyticalQuestion('ผู้ใหญ่บ้านหมู่ 5 มีกี่คนให้วิเคราะห์เปอร์เซ็นต์'), true);
});

test('[Q3] ผู้นำชุมชนตำบลลานสักทั้งหมดมีกี่คน → analytical', () => {
  assert.equal(isAnalyticalQuestion('ผู้นำชุมชนตำบลลานสักทั้งหมดมีกี่คน'), true);
});

test('[Q4] กำนันตำบลระบำมีใครบ้าง เบอร์โทรอะไร → NOT analytical (ขอรายชื่อ/เบอร์)', () => {
  // คำถามนี้ควรใช้ sheetContext ปกติ (ไม่ใช่ analytical)
  assert.equal(isAnalyticalQuestion('กำนันตำบลระบำมีใครบ้าง เบอร์โทรอะไร'), false);
});

test('[Q5] ผู้ใหญ่บ้านทุกตำบล เปอร์เซ็นต์แยกตามตำบล → analytical', () => {
  assert.equal(isAnalyticalQuestion('ผู้ใหญ่บ้านทุกตำบล เปอร์เซ็นต์แยกตามตำบล'), true);
});

test('[Q6] ตำรวจฝ่ายป้องกันปราบปรามมีกี่คน → analytical', () => {
  assert.equal(isAnalyticalQuestion('ตำรวจฝ่ายป้องกันปราบปรามมีกี่คน'), true);
});

test('[Q7] เบอร์โทรผู้ใหญ่บ้านหมู่ 4 → NOT analytical (ขอเบอร์โดยตรง)', () => {
  // "เบอร์โทร" ไม่มี requestsAnalysis keywords → should be false
  assert.equal(isAnalyticalQuestion('เบอร์โทรผู้ใหญ่บ้านหมู่ 4'), false);
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 2: sheetContext — ตรวจว่าข้อมูลรายบรรทัดอยู่ใน context จริง
// ═══════════════════════════════════════════════════════════════════

test('[CTX1] sheetContext (admin) ต้องมีรายชื่อ ผู้ใหญ่บ้าน หมู่ 4 พร้อมเบอร์', () => {
  const ctx = buildSheetContext(true);
  assert.match(ctx, /นายสมศักดิ์ ใจดี/);
  assert.match(ctx, /หมู่ 4/);
  assert.match(ctx, /0812345671/);
});

test('[CTX2] sheetContext (admin) ต้องมี ผู้ใหญ่บ้าน หมู่ 5 ทั้ง 2 คน', () => {
  const ctx = buildSheetContext(true);
  assert.match(ctx, /นางสมหญิง รักงาน/);
  assert.match(ctx, /นายวิชัย ขยันดี/);
  // ทั้งคู่มีหมู่ 5
  const countHmu5 = (ctx.match(/หมู่ 5/g) || []).length;
  assert.ok(countHmu5 >= 2, `ควรมี หมู่ 5 อย่างน้อย 2 ครั้ง แต่พบ ${countHmu5}`);
});

test('[CTX3] sheetContext (public) ต้องไม่มีบุคลากรตำรวจ (ข้อมูลล็อค)', () => {
  const ctx = buildSheetContext(false);
  assert.doesNotMatch(ctx, /ร\.ต\.อ\. สมชาย/);
  assert.match(ctx, /🔒 จำกัดเฉพาะเจ้าหน้าที่เท่านั้น/);
});

test('[CTX4] sheetContext (public) ต้องมีทำเนียบผู้นำชุมชนครบ (ข้อมูล public)', () => {
  const ctx = buildSheetContext(false);
  assert.match(ctx, /นายสมศักดิ์ ใจดี/);
  assert.match(ctx, /นางมาลี ระบำ/);
});

test('[CTX5] sheetContext ต้องมี leaderFacts (ยอดรวมแยกตำบล)', () => {
  const ctx = buildSheetContext(true);
  assert.match(ctx, /ผู้นำตำบลทั้งหมดในชีต:/);
  // ยอด mock = 8 คน
  assert.match(ctx, /8 คน/);
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 3: analyticalContext — ตรวจว่า raw records ติดมาด้วย
// ═══════════════════════════════════════════════════════════════════

test('[ANA1] analytical context ต้องมีรายชื่อทุกคน (raw rows)', () => {
  const ctx = buildAnalyticalContext();
  assert.match(ctx, /นายสมศักดิ์ ใจดี/);
  assert.match(ctx, /นางสมหญิง รักงาน/);
  assert.match(ctx, /นายวิชัย ขยันดี/);
  assert.match(ctx, /นายกำนัน บุญมา/);
  assert.match(ctx, /นายประสิทธิ์ น้ำรอบ/);
});

test('[ANA2] analytical context ต้องมีเบอร์โทรทุกคน', () => {
  const ctx = buildAnalyticalContext();
  assert.match(ctx, /0812345671/);
  assert.match(ctx, /0812345672/);
  assert.match(ctx, /0812345673/);
  assert.match(ctx, /0812345675/);
});

test('[ANA3] analytical context ต้องมีคำสั่งให้ AI แสดงชื่อ-เบอร์-หมู่', () => {
  const ctx = buildAnalyticalContext();
  assert.match(ctx, /เบอร์โทรศัพท์/);
  assert.match(ctx, /หมู่/);
});

test('[ANA4] analytical context ต้องมียอดรวมทั้ง 2 กลุ่ม (ตำรวจ + ผู้นำ)', () => {
  const ctx = buildAnalyticalContext();
  assert.match(ctx, /รวมทั้งสองกลุ่ม/);
  // officerCount = 5 (เด็กฝึกงาน 1 คน ไม่นับ), leaderCount = 8
  assert.match(ctx, /ตำรวจ 5 คน/);
  assert.match(ctx, /ผู้นำตำบล 8 คน/);
});

test('[ANA5] analytical context ต้องมีบุคลากรตำรวจด้วย (สำหรับถามข้ามกลุ่ม)', () => {
  const ctx = buildAnalyticalContext();
  assert.match(ctx, /ร\.ต\.อ\. สมชาย มั่นคง/);
  assert.match(ctx, /ส\.ต\.ต\. นภัส จ\./);
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 4: scenario ซับซ้อน — ตรวจ filter ใน context จำลอง
// ═══════════════════════════════════════════════════════════════════

test('[SIM1] ซับซ้อน: คัดกรอง "ผู้ใหญ่บ้าน หมู่ 5" จาก leadersText ได้ครบ', () => {
  const hmu5 = MOCK_LEADERS.filter(l =>
    l.position === 'ผู้ใหญ่บ้าน' && l.village === 'หมู่ 5'
  );
  assert.equal(hmu5.length, 2, `ควรมีผู้ใหญ่บ้านหมู่ 5 จำนวน 2 คน แต่ได้ ${hmu5.length}`);
  const names = hmu5.map(l => l.fullName);
  assert.ok(names.includes('นางสมหญิง รักงาน'));
  assert.ok(names.includes('นายวิชัย ขยันดี'));
});

test('[SIM2] ซับซ้อน: เปอร์เซ็นต์ผู้ใหญ่บ้านหมู่ 5 เทียบยอดรวม', () => {
  const total    = MOCK_LEADERS.length;                                // 8
  const hmu5     = MOCK_LEADERS.filter(l => l.village === 'หมู่ 5').length; // 2
  const percent  = ((hmu5 / total) * 100).toFixed(2);
  assert.equal(total,   8);
  assert.equal(hmu5,    2);
  assert.equal(percent, '25.00');
});

test('[SIM3] ซับซ้อน: ผู้ใหญ่บ้านตำบลลานสักทั้งหมดมีกี่คน', () => {
  const lansak = MOCK_LEADERS.filter(l => l.area === 'ลานสัก');
  assert.equal(lansak.length, 4); // หมู่ 1(กำนัน), 4, 5, 5
  const posHmu = lansak.filter(l => l.position === 'ผู้ใหญ่บ้าน');
  assert.equal(posHmu.length, 3); // หมู่ 4, 5, 5
});

test('[SIM4] ซับซ้อน: รายชื่อผู้นำที่ไม่มีเบอร์โทร ควรแสดง "-" ไม่ใช่ undefined', () => {
  const noPhone = { fullName: 'นายไม่มีเบอร์', position: 'ผู้ใหญ่บ้าน', area: 'ลานสัก', village: 'หมู่ 9', phone: undefined };
  const line = `- ${noPhone.fullName} ตำแหน่ง: ${noPhone.position} ตำบล: ${noPhone.area} หมู่: ${noPhone.village || '-'} โทร: ${noPhone.phone || '-'}`;
  assert.match(line, /โทร: -/);
  assert.doesNotMatch(line, /undefined/);
});

test('[SIM5] ซับซ้อน: ตรวจสอบว่า leaderFacts แยกยอดตำบลถูกต้อง', () => {
  const facts = formatLeaderFacts(LEADER_SUMMARY);
  assert.match(facts, /ลานสัก: 4 คน/);
  assert.match(facts, /น้ำรอบ: 1 คน/);
  assert.match(facts, /ระบำ: 1 คน/);
  assert.match(facts, /ประดู่ยืน: 1 คน/);
  assert.match(facts, /ทุ่งนางาม: 1 คน/);
});

test('[SIM6] ซับซ้อน: คำถาม cross-group "ตำรวจป้องกันปราบปราม เปรียบกับผู้ใหญ่บ้านทั้งหมด" → analytical', () => {
  const q = 'ตำรวจป้องกันปราบปราม เปรียบกับผู้ใหญ่บ้านทั้งหมดคิดเป็นเปอร์เซ็นต์เท่าไหร่';
  assert.equal(isAnalyticalQuestion(q), true);
});

test('[SIM7] ซับซ้อน: คำถาม "บุคลากรทั้งหมดมีกี่คน แยกฝ่าย" → analytical', () => {
  assert.equal(isAnalyticalQuestion('บุคลากรทั้งหมดมีกี่คน แยกฝ่าย'), true);
});

test('[SIM8] ซับซ้อน: คำถาม "เบอร์โทรของ ส.ต.ต. นภัส" → NOT analytical (ค้นหาบุคคล)', () => {
  assert.equal(isAnalyticalQuestion('เบอร์โทรของ ส.ต.ต. นภัส'), false);
});

test('[SIM9] ซับซ้อน: analytical context ครอบคลุมผู้นำทุกตำบล ไม่หาย', () => {
  const ctx = buildAnalyticalContext();
  const areas = ['ลานสัก', 'น้ำรอบ', 'ระบำ', 'ประดู่ยืน', 'ทุ่งนางาม'];
  for (const area of areas) {
    assert.match(ctx, new RegExp(area), `ควรมีตำบล ${area} ใน context`);
  }
});

test('[SIM10] ซับซ้อน: context ต้องไม่ทำให้ข้อมูลหมู่ซ้ำหรือสลับกัน', () => {
  const ctx = buildAnalyticalContext();
  // ตรวจว่า นายสมศักดิ์ หมู่ 4 ไม่ขึ้นอยู่บรรทัดที่มีหมู่ 5
  const lines = ctx.split('\n');
  const sLine = lines.find(l => l.includes('นายสมศักดิ์ ใจดี'));
  assert.ok(sLine, 'ต้องมีบรรทัดนายสมศักดิ์');
  assert.match(sLine, /หมู่ 4/);
  assert.doesNotMatch(sLine, /หมู่ 5/);
});
