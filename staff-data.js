// ============================================================
//  staff-data.js  — ฟังก์ชันจัดการข้อมูลสำหรับหน้าเว็บแอดมิน (staff.html)
//  ไฟล์นี้แยกต่างหาก 100% ไม่ได้แก้ไข sheets-writer.js เดิมเลย
//  จึงไม่กระทบระบบไลน์บอทที่ทำงานอยู่แล้วไม่ว่ากรณีใด
// ============================================================

require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const SHEET_PERSONNEL = 'บุคลากร สภ.';
const SHEET_LEADERS   = 'ผู้นำตำบล';
const SHEET_WATCHLIST = 'ผู้ต้องหา';
const SHEET_ADMINS    = 'รายชื่อแอดมิน';
const SHEET_BLOCKED   = 'รายชื่อผู้ใช้ที่ถูกปิดกั้น';

/**
 * สร้าง Google Sheets client ด้วย Service Account
 * (คัดลอกวิธีเดียวกับ sheets-writer.js เพื่อให้ใช้ .env ชุดเดียวกันได้)
 */
function getSheetsClient() {
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || process.env.GGOOGLE_PRIVATE_KEY || '';
  privateKey = privateKey.replace(/\\n/g, '\n').trim();

  if (privateKey.includes('BEGINPRIVATEKEY')) {
    privateKey = privateKey.replace('BEGINPRIVATEKEY', 'BEGIN PRIVATE KEY');
  }
  if (privateKey.includes('ENDPRIVATEKEY')) {
    privateKey = privateKey.replace('ENDPRIVATEKEY', 'END PRIVATE KEY');
  }
  if (privateKey && !privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}`;
  }
  if (privateKey && !privateKey.includes('-----END PRIVATE KEY-----')) {
    privateKey = `${privateKey}\n-----END PRIVATE KEY-----\n`;
  }

  const credentials = {
    type: 'service_account',
    project_id:     process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key:    privateKey,
    client_email:   process.env.GOOGLE_CLIENT_EMAIL,
    client_id:      process.env.GOOGLE_CLIENT_ID,
    auth_uri:       'https://accounts.google.com/o/oauth2/auth',
    token_uri:      'https://oauth2.googleapis.com/token',
  };

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// ============================================================
//  Generic Row Helpers
// ============================================================
async function findRowIndexInSheet(sheetName, firstName, lastName) {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!B:C`,
  });
  const rows = response.data.values;
  if (!rows) return null;
  for (let i = 0; i < rows.length; i++) {
    const rowFirstName = (rows[i][0] || '').trim();
    const rowLastName  = (rows[i][1] || '').trim();
    if (rowFirstName === (firstName || '').trim() && rowLastName === (lastName || '').trim()) {
      return i + 1;
    }
  }
  return null;
}

async function deleteRowInSheet(sheetName, firstName, lastName) {
  const sheets = getSheetsClient();
  const rowIndex = await findRowIndexInSheet(sheetName, firstName, lastName);
  if (!rowIndex) return { success: false, message: 'ไม่พบรายชื่อนี้ในระบบ' };

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
  if (!sheet) return { success: false, message: `ไม่พบ Sheet: ${sheetName}` };
  const sheetId = sheet.properties.sheetId;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex } }
      }],
    },
  });
  return { success: true, rowIndex };
}

async function updateRowInSheet(sheetName, rowIndex, values, lastCol = 'H') {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A${rowIndex}:${lastCol}${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
  return { success: true, rowIndex };
}

async function deleteRowByUserId(sheetName, userId) {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:A`,
  });
  const rows = response.data.values || [];
  const rowIndex = rows.findIndex(row => row[0] === userId);
  if (rowIndex === -1) return { success: true, removed: false };

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
  if (!sheet) return { success: false, message: `ไม่พบ Sheet: ${sheetName}` };
  const sheetId = sheet.properties.sheetId;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 } }
      }],
    },
  });
  return { success: true, removed: true };
}

// ============================================================
//  บุคลากร สภ.
// ============================================================
async function appendPersonnel(p) {
  const sheets = getSheetsClient();
  const now = new Date().toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric', timeZone:'Asia/Bangkok' });
  const row = [
    (p.rank||'').trim(), (p.firstName||'').trim(), (p.lastName||'').trim(),
    (p.position||'').trim(), (p.area||'').trim(), (p.phone||'').trim(),
    (p.email||'').trim(), now,
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_PERSONNEL}!A3:H`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
  return { success: true, row };
}

async function updatePersonnel(origFirstName, origLastName, p) {
  const rowIndex = await findRowIndexInSheet(SHEET_PERSONNEL, origFirstName, origLastName);
  if (!rowIndex) return { success: false, message: 'ไม่พบรายชื่อนี้ในระบบ' };
  const row = [
    (p.rank||'').trim(), (p.firstName||'').trim(), (p.lastName||'').trim(),
    (p.position||'').trim(), (p.area||'').trim(), (p.phone||'').trim(),
    (p.email||'').trim(), (p.date||'').trim(),
  ];
  return updateRowInSheet(SHEET_PERSONNEL, rowIndex, row, 'H');
}

async function deletePersonnel(firstName, lastName) {
  return deleteRowInSheet(SHEET_PERSONNEL, firstName, lastName);
}

// ============================================================
//  ผู้นำตำบล
// ============================================================
async function appendLeader(p) {
  const sheets = getSheetsClient();
  const now = new Date().toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric', timeZone:'Asia/Bangkok' });
  const row = [
    (p.rank||'').trim(), (p.firstName||'').trim(), (p.lastName||'').trim(),
    (p.position||'').trim(), (p.area||'').trim(), (p.phone||'').trim(),
    (p.village||'').trim(), now,
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_LEADERS}!A3:H`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
  return { success: true, row };
}

async function updateLeader(origFirstName, origLastName, p) {
  const rowIndex = await findRowIndexInSheet(SHEET_LEADERS, origFirstName, origLastName);
  if (!rowIndex) return { success: false, message: 'ไม่พบรายชื่อนี้ในระบบ' };
  const row = [
    (p.rank||'').trim(), (p.firstName||'').trim(), (p.lastName||'').trim(),
    (p.position||'').trim(), (p.area||'').trim(), (p.phone||'').trim(),
    (p.village||'').trim(), (p.date||'').trim(),
  ];
  return updateRowInSheet(SHEET_LEADERS, rowIndex, row, 'H');
}

async function deleteLeader(firstName, lastName) {
  return deleteRowInSheet(SHEET_LEADERS, firstName, lastName);
}

// ============================================================
//  ผู้ต้องหา — แก้ไขทั้งแถว
// ============================================================
async function updateSuspectFull(origFirstName, origLastName, s) {
  const rowIndex = await findRowIndexInSheet(SHEET_WATCHLIST, origFirstName, origLastName);
  if (!rowIndex) return { success: false, message: 'ไม่พบรายชื่อนี้ในระบบ' };
  const row = [
    (s.rank||'').trim(), (s.firstName||'').trim(), (s.lastName||'').trim(),
    (s.crime||'').trim(), (s.status||'เฝ้าระวัง').trim(), (s.area||'').trim(),
    (s.caseNo||'').trim(), (s.date||'').trim(), 'Admin เว็บ',
  ];
  return updateRowInSheet(SHEET_WATCHLIST, rowIndex, row, 'I');
}

// ============================================================
//  ยกเลิกบล็อก / ถอดสิทธิ์แอดมิน (ต้องใช้ updateUserRoleInSheet ของเดิม
//  ส่งเข้ามาเป็น parameter เพื่อไม่ต้องแตะไฟล์เดิม)
// ============================================================
async function unblockUserInSheet(userId, updateUserRoleFn) {
  await deleteRowByUserId(SHEET_BLOCKED, userId);
  if (typeof updateUserRoleFn === 'function') await updateUserRoleFn(userId, 'people');
  return { success: true };
}

async function removeAdminInSheet(userId, updateUserRoleFn) {
  await deleteRowByUserId(SHEET_ADMINS, userId);
  if (typeof updateUserRoleFn === 'function') await updateUserRoleFn(userId, 'people');
  return { success: true };
}

// ============================================================
//  SHEET NAMES — ระบบหลังบ้านใหม่
// ============================================================
const SHEET_AUDIT    = 'บันทึกการทำงาน';
const SHEET_VERIFY   = 'รหัสยืนยันตัวตน';
const SHEET_SETTINGS = 'ตั้งค่าระบบ';

// ── helper ดึง sheetId ──
async function getSheetId(sheets, sheetName) {
  const ss = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sh = ss.data.sheets.find(s => s.properties.title === sheetName);
  return sh ? sh.properties.sheetId : null;
}

// ── สร้าง Sheet ใหม่ถ้ายังไม่มี ──
async function ensureSheet(sheets, sheetName, headers) {
  const ss = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = ss.data.sheets.some(s => s.properties.title === sheetName);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
    });
    if (headers) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [headers] },
      });
    }
  }
}

// ============================================================
//  📜 Audit Logs — บันทึกประวัติการทำงานของแอดมิน
// ============================================================
async function appendAuditLog(userId, userName, action, details) {
  try {
    const sheets = getSheetsClient();
    await ensureSheet(sheets, SHEET_AUDIT, ['วันเวลา', 'User ID', 'ชื่อผู้ทำรายการ', 'การกระทำ', 'รายละเอียด']);
    const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_AUDIT}!A:E`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[now, userId || '-', userName || '-', action || '-', details || '-']] },
    });
  } catch (e) {
    console.error('[AuditLog] error:', e.message);
  }
}

async function getAuditLogs(limit = 100) {
  const sheets = getSheetsClient();
  await ensureSheet(sheets, SHEET_AUDIT, ['วันเวลา', 'User ID', 'ชื่อผู้ทำรายการ', 'การกระทำ', 'รายละเอียด']);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_AUDIT}!A:E`,
  });
  const rows = (res.data.values || []).slice(1); // skip header
  return rows.slice(-limit).reverse().map(r => ({
    timestamp: r[0] || '',
    userId: r[1] || '',
    userName: r[2] || '',
    action: r[3] || '',
    details: r[4] || '',
  }));
}

// ============================================================
//  🔑 Auth Codes — จัดการรหัสยืนยันตัวตนแบบไดนามิก
// ============================================================
async function getAuthCodes() {
  const sheets = getSheetsClient();
  await ensureSheet(sheets, SHEET_VERIFY, ['รหัส/นามเรียกขาน', 'สถานะ', 'ใช้โดย', 'วันที่ใช้']);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_VERIFY}!A:D`,
  });
  const rows = (res.data.values || []).slice(1);
  return rows.map(r => ({
    code:    r[0] || '',
    status:  r[1] || 'active',    // active | used
    usedBy:  r[2] || '',
    usedAt:  r[3] || '',
  })).filter(r => r.code);
}

async function addAuthCode(code) {
  const sheets = getSheetsClient();
  await ensureSheet(sheets, SHEET_VERIFY, ['รหัส/นามเรียกขาน', 'สถานะ', 'ใช้โดย', 'วันที่ใช้']);
  // ตรวจซ้ำก่อนเพิ่ม
  const existing = await getAuthCodes();
  if (existing.some(r => r.code === code.trim())) {
    return { success: false, message: `รหัส "${code}" มีอยู่แล้วในระบบ` };
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_VERIFY}!A:D`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[code.trim(), 'active', '', '']] },
  });
  return { success: true };
}

async function deleteAuthCode(code) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_VERIFY}!A:A`,
  });
  const rows = res.data.values || [];
  const rowIndex = rows.findIndex(r => r[0] === code.trim());
  if (rowIndex === -1) return { success: false, message: 'ไม่พบรหัสนี้ในระบบ' };

  const sheetId = await getSheetId(sheets, SHEET_VERIFY);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
        },
      }],
    },
  });
  return { success: true };
}

// ============================================================
//  ⚙️ System Settings — ตั้งค่าระบบ
// ============================================================
const DEFAULT_SETTINGS = {
  ai_enabled: 'true',
  welcome_message: '',
};

async function getSystemSettings() {
  const sheets = getSheetsClient();
  await ensureSheet(sheets, SHEET_SETTINGS, ['key', 'value', 'คำอธิบาย']);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_SETTINGS}!A:C`,
  });
  const rows = (res.data.values || []).slice(1);
  const settings = { ...DEFAULT_SETTINGS };
  rows.forEach(r => {
    if (r[0]) settings[r[0]] = r[1] || '';
  });
  return settings;
}

async function updateSystemSetting(key, value) {
  const sheets = getSheetsClient();
  await ensureSheet(sheets, SHEET_SETTINGS, ['key', 'value', 'คำอธิบาย']);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_SETTINGS}!A:A`,
  });
  const rows = res.data.values || [];
  const rowIndex = rows.findIndex(r => r[0] === key);
  if (rowIndex === -1) {
    // เพิ่ม row ใหม่
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_SETTINGS}!A:C`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[key, value, '']] },
    });
  } else {
    // แก้ไขค่าเดิม
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_SETTINGS}!B${rowIndex + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[value]] },
    });
  }
  return { success: true };
}

module.exports = {
  appendPersonnel, updatePersonnel, deletePersonnel,
  appendLeader, updateLeader, deleteLeader,
  updateSuspectFull,
  unblockUserInSheet, removeAdminInSheet,
  // ── ใหม่ ──
  appendAuditLog, getAuditLogs,
  getAuthCodes, addAuthCode, deleteAuthCode,
  getSystemSettings, updateSystemSetting,
};
