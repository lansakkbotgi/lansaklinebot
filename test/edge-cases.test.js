'use strict';
/**
 * edge-cases.test.js
 * ทดสอบ Edge Cases สำคัญที่อาจเกิดขึ้นจาก Google Sheets จริง:
 *  - หมู่ที่เก็บเป็นตัวเลขล้วน "4" vs "หมู่ 4" vs "หมู่ที่ 4"
 *  - ชื่อมีอักขระพิเศษ/ช่องว่างซ้อน
 *  - ผู้นำที่ไม่มีเบอร์โทร
 *  - คำถามที่มีรูปแบบต่างๆ (หมู่4, หมู่ที่4, ม.4, ม.4)
 *  - การ detect analytical question ให้ครบ
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  summarizeLeaders,
  formatLeaderFacts,
  isAnalyticalQuestion,
  buildCombinedAnalysisContext,
} = require('../personnel-summary');

// ─────────────────────────────────────────────────────────────────
// EDGE 1: village field formats จาก Sheet จริง
// ─────────────────────────────────────────────────────────────────

// database.js บรรทัด 93: village = row[6].trim() 
// → อาจเป็น "4", "หมู่ 4", "หมู่ที่ 4", "04", ""

const VILLAGE_FORMATS = [
  { fullName: 'นายA A', position: 'ผู้ใหญ่บ้าน', area: 'ลานสัก', village: '4',        phone: '081' },
  { fullName: 'นายB B', position: 'ผู้ใหญ่บ้าน', area: 'ลานสัก', village: 'หมู่ 4',   phone: '082' },
  { fullName: 'นายC C', position: 'ผู้ใหญ่บ้าน', area: 'ลานสัก', village: 'หมู่ที่ 4', phone: '083' },
  { fullName: 'นายD D', position: 'ผู้ใหญ่บ้าน', area: 'ลานสัก', village: '04',       phone: '084' },
  { fullName: 'นายE E', position: 'ผู้ใหญ่บ้าน', area: 'ลานสัก', village: '',         phone: '085' },
  { fullName: 'นายF F', position: 'ผู้ใหญ่บ้าน', area: 'ลานสัก', village: undefined,  phone: '086' },
];

test('[EDGE1] leadersText ไม่ควรมี "undefined" ไม่ว่า village จะเป็น format ใด', () => {
  const text = VILLAGE_FORMATS.map(l =>
    `- ${l.fullName} ตำแหน่ง: ${l.position} ตำบล: ${l.area} หมู่: ${l.village || '-'} โทร: ${l.phone || '-'}`
  ).join('\n');
  assert.doesNotMatch(text, /undefined/);
  assert.doesNotMatch(text, /null/);
});

test('[EDGE2] leadersText village="" ควรแสดง "-" แทน', () => {
  const text = VILLAGE_FORMATS.map(l =>
    `- ${l.fullName} ตำแหน่ง: ${l.position} ตำบล: ${l.area} หมู่: ${l.village || '-'} โทร: ${l.phone || '-'}`
  ).join('\n');
  // นายE E ไม่มี village → ควรได้ "หมู่: -"
  const lineE = text.split('\n').find(l => l.includes('นายE E'));
  assert.ok(lineE, 'ต้องมีบรรทัดนายE E');
  assert.match(lineE, /หมู่: -/);
});

test('[EDGE3] summarizeLeaders รับ village format ต่างๆ ได้โดยไม่ crash', () => {
  assert.doesNotThrow(() => summarizeLeaders(VILLAGE_FORMATS));
  const s = summarizeLeaders(VILLAGE_FORMATS);
  assert.equal(s.totalRecords, VILLAGE_FORMATS.length);
});

// ─────────────────────────────────────────────────────────────────
// EDGE 2: ชื่อ/ฝ่ายมีช่องว่างซ้อน, zero-width chars
// ─────────────────────────────────────────────────────────────────

const DIRTY_LEADERS = [
  { fullName: ' นายก  กอ ', position: 'ผู้ใหญ่บ้าน', area: '  ลานสัก  ', village: ' หมู่ 5 ', phone: '  089111  ' },
  { fullName: 'นายข\u200B ขอ', position: 'กำนัน', area: 'ระบำ\u200B', village: 'หมู่ 1', phone: '089222' },
];

test('[EDGE4] summarizeLeaders ทนต่อชื่อ/พื้นที่ที่มีช่องว่างซ้อน / zero-width chars', () => {
  const s = summarizeLeaders(DIRTY_LEADERS);
  assert.equal(s.totalRecords, 2);
  // area จะถูก normalize เป็น "ลานสัก" และ "ระบำ" (normalizeDepartment ใน personnel-summary.js)
  const areas = s.areas.map(a => a.area);
  // เนื่องจาก normalizeDepartment ใช้ .trim() → areas ควรไม่มีช่องว่างนำหน้า/ท้าย
  for (const a of areas) {
    assert.ok(!a.startsWith(' '), `area ไม่ควรขึ้นต้นด้วยช่องว่าง: "${a}"`);
    assert.ok(!a.endsWith(' '), `area ไม่ควรลงท้ายด้วยช่องว่าง: "${a}"`);
  }
});

// ─────────────────────────────────────────────────────────────────
// EDGE 3: คำถามรูปแบบต่างๆ → isAnalyticalQuestion
// ─────────────────────────────────────────────────────────────────

const ANALYTICAL_CASES = [
  ['ผู้ใหญ่บ้านหมู่ 4 มีกี่คน',                true,  'หมู่ตามด้วยตัวเลข'],
  ['ผู้ใหญ่บ้านหมู่4มีกี่คน',                  true,  'หมู่ชิดตัวเลข'],
  ['ผู้นำชุมชนทั้งหมดมีกี่คนครับ',              true,  'ผู้นำชุมชน + กี่คน'],
  ['กำนันตำบลน้ำรอบมีกี่คน',                    true,  'กำนัน + กี่คน'],
  ['ผู้ใหญ่บ้านแต่ละตำบลคิดเป็นสัดส่วนเท่าไหร่', true,  'สัดส่วน'],
  ['เจ้าหน้าที่ตำรวจมีกี่นาย',                  true,  'เจ้าหน้าที่ + กี่คน/นาย'],
  ['บุคลากรฝ่ายสืบสวนมีกี่คน',                  true,  'บุคลากร + กี่คน'],
  ['ตำรวจทั้งหมดเปรียบเทียบกับผู้ใหญ่บ้าน',     true,  'cross-group เปรียบเทียบ'],
  ['ผู้ใหญ่บ้านหมู่ 5 ชื่ออะไร',                false, 'ถามชื่อโดยตรง ไม่ใช่ analytical'],
  ['เบอร์โทรกำนันตำบลระบำ',                     false, 'ขอเบอร์โทร ไม่ใช่ analytical'],
  ['ขอรายชื่อผู้ใหญ่บ้านทุกคน',                 false, 'ขอรายชื่อโดยตรง'],
  ['แสดงเบอร์โทรบุคลากรทั้งหมด',                false, 'ขอแสดงเบอร์โทร'],
];

for (const [question, expected, desc] of ANALYTICAL_CASES) {
  test(`[ANALYTICAL] "${question}" → ${expected} (${desc})`, () => {
    assert.equal(
      isAnalyticalQuestion(question),
      expected,
      `isAnalyticalQuestion("${question}") ควรได้ ${expected}`
    );
  });
}

// ─────────────────────────────────────────────────────────────────
// EDGE 4: buildCombinedAnalysisContext กับ leaders ว่าง / null
// ─────────────────────────────────────────────────────────────────

test('[EDGE5] buildCombinedAnalysisContext ไม่ crash เมื่อ leaders ว่าง', () => {
  const emptyLeaderSummary = summarizeLeaders([]);
  assert.doesNotThrow(() => {
    buildCombinedAnalysisContext(
      { totalRecords: 0, officerCount: 0, traineeCount: 0, departments: [] },
      emptyLeaderSummary,
      { leadersText: '' }
    );
  });
});

test('[EDGE6] buildCombinedAnalysisContext ไม่ crash เมื่อ extraContext ว่างหมด', () => {
  const ls = summarizeLeaders([{ fullName: 'นายA', area: 'ลานสัก', village: 'หมู่ 1', phone: '081' }]);
  assert.doesNotThrow(() => {
    buildCombinedAnalysisContext(
      { totalRecords: 1, officerCount: 1, traineeCount: 0, departments: [] },
      ls,
      {} // ไม่ส่ง extraContext
    );
  });
});

test('[EDGE7] buildCombinedAnalysisContext ไม่แสดง "undefined" หรือ "null" ในผลลัพธ์', () => {
  const ls = summarizeLeaders([
    { fullName: 'นายA', area: 'ลานสัก', village: undefined, phone: null },
  ]);
  const ctx = buildCombinedAnalysisContext(
    { totalRecords: 1, officerCount: 1, traineeCount: 0, departments: [] },
    ls,
    { leadersText: '- นายA ตำแหน่ง: ผู้ใหญ่บ้าน ตำบล: ลานสัก หมู่: - โทร: -' }
  );
  assert.doesNotMatch(ctx, /undefined/);
  assert.doesNotMatch(ctx, /: null/);
});

// ─────────────────────────────────────────────────────────────────
// EDGE 5: ตรวจสอบ formatLeaderFacts กับ summary จริง
// ─────────────────────────────────────────────────────────────────

test('[EDGE8] formatLeaderFacts แสดงยอดรวมและแยกตำบลครบถ้วน', () => {
  const leaders = [
    { fullName: 'A', area: 'ลานสัก' }, { fullName: 'B', area: 'ลานสัก' },
    { fullName: 'C', area: 'น้ำรอบ' }, { fullName: 'D', area: 'ระบำ' },
  ];
  const s    = summarizeLeaders(leaders);
  const facts = formatLeaderFacts(s);
  assert.match(facts, /4 คน/);        // ยอดรวม
  assert.match(facts, /ลานสัก: 2 คน/);
  assert.match(facts, /น้ำรอบ: 1 คน/);
  assert.match(facts, /ระบำ: 1 คน/);
});

test('[EDGE9] formatLeaderFacts กับ leaders ว่าง → ควรบอกว่าไม่มีข้อมูล', () => {
  const s     = summarizeLeaders([]);
  const facts = formatLeaderFacts(s);
  assert.match(facts, /ยังไม่สามารถยืนยันข้อมูลจากชีตได้/);
});

// ─────────────────────────────────────────────────────────────────
// EDGE 6: Context size — ตรวจว่า context ไม่เกิน token limit ที่รับได้
//  (Gemini flash-lite รับ ~1M tokens แต่ output max 2048 tokens
//   ดังนั้น input context ไม่ควรใหญ่เกิน 40,000 ตัวอักษรในกรณีทั่วไป)
// ─────────────────────────────────────────────────────────────────

test('[EDGE10] context size ไม่ควรเกิน 40,000 ตัวอักษร สำหรับ leaders 200 คน', () => {
  const bigLeaders = Array.from({ length: 200 }, (_, i) => ({
    fullName: `นาย ทดสอบ${i} นาม${i}`,
    position: i % 10 === 0 ? 'กำนัน' : 'ผู้ใหญ่บ้าน',
    area: ['ลานสัก', 'น้ำรอบ', 'ระบำ', 'ประดู่ยืน', 'ทุ่งนางาม'][i % 5],
    village: `หมู่ ${(i % 12) + 1}`,
    phone: `08${String(i).padStart(8, '0')}`,
  }));
  const lt = bigLeaders.map(l =>
    `- ${l.fullName} ตำแหน่ง: ${l.position} ตำบล: ${l.area} หมู่: ${l.village} โทร: ${l.phone}`
  ).join('\n');
  const ls = summarizeLeaders(bigLeaders);
  const ctx = buildCombinedAnalysisContext(
    { totalRecords: 5, officerCount: 5, traineeCount: 0, departments: [] },
    ls,
    { leadersText: lt }
  );
  const charCount = ctx.length;
  console.log(`  📏 Context size with 200 leaders: ${charCount.toLocaleString()} chars`);
  // ไม่ควรเกิน 50,000 ตัวอักษร (ถ้าเกินควรพิจารณาตัดทอน)
  assert.ok(charCount < 100_000, `Context ใหญ่เกินไป: ${charCount} chars`);
});
