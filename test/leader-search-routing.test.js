'use strict';
/**
 * leader-search-routing.test.js
 * ทดสอบ logic การ route คำถาม "ผู้ใหญ่บ้าน" / "กำนัน" 
 * จำลอง flow ใน handleEvent โดยไม่ต้อง call LINE API จริง
 */
const test   = require('node:test');
const assert = require('node:assert/strict');

// ─── จำลอง looksLikeSpecificQuery (copy จาก index.js) ───────────
function looksLikeSpecificQuery(text) {
  if (!text) return false;
  const cleanText = text.trim();

  const questionWords = [
    'เบอร์', 'โทร', 'ชื่อ', 'อะไร', 'ไหน', 'ใคร', 'ยังไง', 'คือ',
    'อีเมล', 'email', 'วาระ', 'ประวัติ', 'คดี', 'สืบสวน', 'สอบสวน',
    'จราจร', 'ปราบปราม', 'ร้อยเวร', 'ผู้กำกับ', 'ผกก', 'สารวัตร', 'สว'
  ];

  const hasQuestionWord = questionWords.some(word => cleanText.includes(word));
  const hasNumber = /[0-9]|๑|๒|๓|๔|๕|๖|๗|๘|๙|๐/.test(cleanText);

  const leaderPositionPrefixes = ['ผู้ใหญ่บ้าน', 'กำนัน', 'ผู้ช่วยผู้ใหญ่บ้าน', 'ผู้นำชุมชน', 'ผู้นำตำบล'];
  const hasLeaderPrefix = leaderPositionPrefixes.some(p => cleanText.startsWith(p));
  const hasNameAfterPosition = hasLeaderPrefix && cleanText.replace(leaderPositionPrefixes.find(p => cleanText.startsWith(p)) || '', '').trim().length >= 2;

  return hasQuestionWord || hasNumber || cleanText.length > 15 || hasNameAfterPosition;
}

// ─── จำลอง isLeaderMenuCmd ─────────────────────────────────────
function isLeaderMenuCmd(userText) {
  return (
    userText.includes('ทำเนียบผู้นำ') ||
    userText.includes('ผู้นำชุมชน') ||
    userText.includes('ผู้นำตำบล') ||
    userText === 'ผู้นำชุมชน' ||
    userText === 'ผู้นำตำบล' ||
    userText.includes('ผู้ใหญ่บ้าน') ||
    userText.includes('กำนัน') ||
    userText.startsWith('/ทำเนียบผู้นำ') ||
    userText.startsWith('/ผู้นำ')
  );
}

// ─── จำลอง isLeaderSearch ──────────────────────────────────────
function calcIsLeaderSearch(userText) {
  return (
    userText.startsWith('ผู้นำตำบล') ||
    userText.startsWith('ผู้นำชุมชน') ||
    userText.startsWith('ผู้ใหญ่บ้าน') ||
    userText.startsWith('กำนัน') ||
    userText.startsWith('ผู้ช่วยผู้ใหญ่บ้าน')
  );
}

// ─── จำลอง searchQuery strip ───────────────────────────────────
function calcSearchQuery(userText) {
  let q = userText.replace(/^(ค้นหา|ตรวจสอบ|เช็ค|ส่อง|check|search|หา|บุคลากร|ผู้นำตำบล|ผู้นำชุมชน|ผู้ใหญ่บ้าน|กำนัน|ผู้ช่วยผู้ใหญ่บ้าน|บอท|bot)\s*/i, '').trim();
  return q.replace(/(บอท|bot)\s*/gi, '').trim();
}

// ─── Flow decision helper ───────────────────────────────────────
// คืนค่า: 'menu' | 'search-all-by-position' | 'search-name' | 'skip' | 'analytical'
function routeDecision(userText) {
  if (isLeaderMenuCmd(userText) && !looksLikeSpecificQuery(userText)) return 'menu';

  const isLeader = calcIsLeaderSearch(userText);
  const q = calcSearchQuery(userText);

  if (!q && isLeader) return 'search-all-by-position';
  if (!q) return 'skip';
  return isLeader ? 'search-name-leader' : 'search-name-all';
}

// ═══════════════════════════════════════════════════════════
// SECTION 1: looksLikeSpecificQuery
// ═══════════════════════════════════════════════════════════

test('[ROUTE1] "ผู้ใหญ่บ้าน" (คำเดียว) → looksLikeSpecificQuery=false → menu', () => {
  assert.equal(looksLikeSpecificQuery('ผู้ใหญ่บ้าน'), false);
  assert.equal(routeDecision('ผู้ใหญ่บ้าน'), 'menu');
});

test('[ROUTE2] "กำนัน" (คำเดียว) → looksLikeSpecificQuery=false → menu', () => {
  assert.equal(looksLikeSpecificQuery('กำนัน'), false);
  assert.equal(routeDecision('กำนัน'), 'menu');
});

test('[ROUTE3] "ผู้ใหญ่บ้านสมชาย" → looksLikeSpecificQuery=true → search-name-leader', () => {
  assert.equal(looksLikeSpecificQuery('ผู้ใหญ่บ้านสมชาย'), true);
  assert.equal(routeDecision('ผู้ใหญ่บ้านสมชาย'), 'search-name-leader');
  assert.equal(calcSearchQuery('ผู้ใหญ่บ้านสมชาย'), 'สมชาย');
});

test('[ROUTE4] "ผู้ใหญ่บ้าน สมชาย ใจดี" → specific → search-name-leader', () => {
  assert.equal(looksLikeSpecificQuery('ผู้ใหญ่บ้าน สมชาย ใจดี'), true);
  assert.equal(routeDecision('ผู้ใหญ่บ้าน สมชาย ใจดี'), 'search-name-leader');
  assert.equal(calcSearchQuery('ผู้ใหญ่บ้าน สมชาย ใจดี'), 'สมชาย ใจดี');
});

test('[ROUTE5] "กำนันลานสัก" → specific → search-name-leader', () => {
  // "กำนันลานสัก" = 10 ตัวอักษร แต่ startsWith กำนัน + มีชื่อ "ลานสัก" ตาม
  assert.equal(looksLikeSpecificQuery('กำนันลานสัก'), true);
  assert.equal(routeDecision('กำนันลานสัก'), 'search-name-leader');
  assert.equal(calcSearchQuery('กำนันลานสัก'), 'ลานสัก');
});

test('[ROUTE6] "ผู้ใหญ่บ้านหมู่ 5" → มีตัวเลข → specific → search-name-leader', () => {
  assert.equal(looksLikeSpecificQuery('ผู้ใหญ่บ้านหมู่ 5'), true);
  assert.equal(routeDecision('ผู้ใหญ่บ้านหมู่ 5'), 'search-name-leader');
  // searchQuery = "หมู่ 5" → searchByName จะค้นใน leader sheet
  assert.equal(calcSearchQuery('ผู้ใหญ่บ้านหมู่ 5'), 'หมู่ 5');
});

test('[ROUTE7] "ผู้ใหญ่บ้านหมู่5" → มีตัวเลข → specific → search-name-leader', () => {
  assert.equal(looksLikeSpecificQuery('ผู้ใหญ่บ้านหมู่5'), true);
  assert.equal(calcSearchQuery('ผู้ใหญ่บ้านหมู่5'), 'หมู่5');
});

test('[ROUTE8] "ผู้ใหญ่บ้านทั้งหมด" → ยาวกว่า 15? ไม่ใช่ แต่มีชื่อ "ทั้งหมด" ตาม → specific', () => {
  // "ผู้ใหญ่บ้าน" = 11, "ทั้งหมด" ที่เหลือ = 7 → hasNameAfterPosition = true
  assert.equal(looksLikeSpecificQuery('ผู้ใหญ่บ้านทั้งหมด'), true);
  assert.equal(calcSearchQuery('ผู้ใหญ่บ้านทั้งหมด'), 'ทั้งหมด');
  // searchQuery = 'ทั้งหมด' → fetchLeaders() ทั้งหมด
});

test('[ROUTE9] "ผู้ใหญ่บ้านเบอร์โทร" → มี keyword "เบอร์โทร" → specific', () => {
  assert.equal(looksLikeSpecificQuery('ผู้ใหญ่บ้านเบอร์โทร'), true);
});

// ═══════════════════════════════════════════════════════════
// SECTION 2: isLeaderSearch & searchQuery stripping
// ═══════════════════════════════════════════════════════════

test('[ROUTE10] calcIsLeaderSearch ครอบคลุมทุก prefix', () => {
  assert.equal(calcIsLeaderSearch('ผู้ใหญ่บ้านสมชาย'), true);
  assert.equal(calcIsLeaderSearch('กำนันระบำ'), true);
  assert.equal(calcIsLeaderSearch('ผู้ช่วยผู้ใหญ่บ้านลานสัก'), true);
  assert.equal(calcIsLeaderSearch('ผู้นำตำบลน้ำรอบ'), true);
  assert.equal(calcIsLeaderSearch('ผู้นำชุมชนทุ่งนางาม'), true);
});

test('[ROUTE11] calcIsLeaderSearch ไม่จับ text ที่ไม่ใช่ leader', () => {
  assert.equal(calcIsLeaderSearch('สมชาย ใจดี'), false);
  assert.equal(calcIsLeaderSearch('ตำรวจ'), false);
  assert.equal(calcIsLeaderSearch('บุคลากรป้องกันปราบปราม'), false);
});

test('[ROUTE12] searchQuery strip ผู้ใหญ่บ้าน prefix ออก', () => {
  assert.equal(calcSearchQuery('ผู้ใหญ่บ้านสมชาย'), 'สมชาย');
  assert.equal(calcSearchQuery('ผู้ใหญ่บ้าน สมชาย'), 'สมชาย');
  assert.equal(calcSearchQuery('กำนัน บุญมา'), 'บุญมา');
  assert.equal(calcSearchQuery('ผู้นำตำบล น้ำรอบ'), 'น้ำรอบ');
});

test('[ROUTE13] searchQuery strip แล้วได้ "" เมื่อพิมพ์แค่ตำแหน่ง', () => {
  assert.equal(calcSearchQuery('ผู้ใหญ่บ้าน'), '');
  assert.equal(calcSearchQuery('กำนัน'), '');
  assert.equal(calcSearchQuery('ผู้ช่วยผู้ใหญ่บ้าน'), '');
});

// ═══════════════════════════════════════════════════════════
// SECTION 3: positionFilter logic
// ═══════════════════════════════════════════════════════════

function calcPositionFilter(userText) {
  // ต้องเช็ค ผู้ช่วยผู้ใหญ่บ้าน ก่อน เพราะ startsWith ผู้ใหญ่บ้าน จะจับมันด้วย
  if (userText.startsWith('ผู้ช่วยผู้ใหญ่บ้าน')) return 'ผู้ช่วยผู้ใหญ่บ้าน';
  if (userText.startsWith('ผู้ใหญ่บ้าน'))      return 'ผู้ใหญ่บ้าน';
  if (userText.startsWith('กำนัน'))              return 'กำนัน';
  return '';
}

const MOCK_ALL_LEADERS = [
  { fullName: 'นายA A', position: 'ผู้ใหญ่บ้าน', area: 'ลานสัก', village: 'หมู่ 4' },
  { fullName: 'นายB B', position: 'ผู้ใหญ่บ้าน', area: 'ลานสัก', village: 'หมู่ 5' },
  { fullName: 'นายC C', position: 'กำนัน',       area: 'ลานสัก', village: 'หมู่ 1' },
  { fullName: 'นายD D', position: 'ผู้ช่วยผู้ใหญ่บ้าน', area: 'น้ำรอบ', village: 'หมู่ 2' },
  { fullName: 'นายE E', position: 'ผู้ใหญ่บ้าน', area: 'ระบำ', village: 'หมู่ 3' },
];

test('[ROUTE14] filter "ผู้ใหญ่บ้าน" (exact) → ได้ 3 คน ไม่รวม ผู้ช่วย หรือ กำนัน', () => {
  const pf = calcPositionFilter('ผู้ใหญ่บ้าน');
  assert.equal(pf, 'ผู้ใหญ่บ้าน');
  // ใช้ exact match (=== แทน includes) เพื่อไม่ให้จับ ผู้ช่วยผู้ใหญ่บ้าน
  const filtered = MOCK_ALL_LEADERS.filter(l => (l.position || '').trim() === pf);
  assert.equal(filtered.length, 3);
  assert.ok(filtered.every(l => l.position === 'ผู้ใหญ่บ้าน'));
});

test('[ROUTE15] filter "กำนัน" → ได้ 1 คน', () => {
  const pf = calcPositionFilter('กำนัน');
  const filtered = MOCK_ALL_LEADERS.filter(l => (l.position || '').includes(pf));
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].fullName, 'นายC C');
});

test('[ROUTE16] filter "ผู้ช่วยผู้ใหญ่บ้าน" → ได้ 1 คน', () => {
  const pf = calcPositionFilter('ผู้ช่วยผู้ใหญ่บ้าน');
  const filtered = MOCK_ALL_LEADERS.filter(l => (l.position || '').includes(pf));
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].fullName, 'นายD D');
});

// ═══════════════════════════════════════════════════════════
// SECTION 4: ตรวจ scenario ที่ user รายงานว่า "หาไม่เจอ"
// ═══════════════════════════════════════════════════════════

const USER_INPUTS_REPORTED = [
  'ผู้ใหญ่บ้าน',
  'กำนัน',
  'ผู้ใหญ่บ้าน หมู่ 5',
  'กำนันลานสัก',
  'ผู้ใหญ่บ้านสมชาย',
  'ผู้ช่วยผู้ใหญ่บ้านระบำ',
];

for (const input of USER_INPUTS_REPORTED) {
  test(`[SCENARIO] "${input}" → ต้องไม่ return 'skip' (ต้องมีผลลัพธ์บางอย่าง)`, () => {
    const decision = routeDecision(input);
    assert.notEqual(decision, 'skip', `"${input}" ไม่ควร skip`);
    // ต้องได้เป็น menu (แสดง flex menu) หรือ search-name-leader หรือ search-all-by-position
    assert.ok(
      ['menu', 'search-name-leader', 'search-all-by-position'].includes(decision),
      `"${input}" ควรได้ menu/search แต่ได้ "${decision}"`
    );
  });
}
