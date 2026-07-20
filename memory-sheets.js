require('dotenv').config();
const { google } = require('googleapis');

// ============================================================
//  memory-sheets.js
//  จัดการชีต "Memory" (บันทึกข้อมูล) และ "Reminder" (แจ้งเตือน)
//  แยกไฟล์ต่างหาก ไม่แก้ sheets-writer.js เดิม เพื่อไม่ให้กระทบระบบเดิม
// ============================================================

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const SHEET_MEMORY   = 'Memory';
const SHEET_REMINDER = 'Reminder';

const MEMORY_HEADERS   = ['id', 'created_at', 'type', 'message', 'status', 'created_by'];
const REMINDER_HEADERS = ['id', 'created_at', 'message', 'remind_time', 'status', 'sent', 'created_by'];

let _sheetsClient = null;
const _ensuredSheets = new Set();

/** สร้าง Google Sheets client ด้วย Service Account (รูปแบบเดียวกับ sheets-writer.js) */
function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;

  let privateKey = process.env.GOOGLE_PRIVATE_KEY || process.env.GGOOGLE_PRIVATE_KEY || '';
  privateKey = privateKey.replace(/\\n/g, '\n').trim();

  if (privateKey.includes('BEGINPRIVATEKEY')) privateKey = privateKey.replace('BEGINPRIVATEKEY', 'BEGIN PRIVATE KEY');
  if (privateKey.includes('ENDPRIVATEKEY')) privateKey = privateKey.replace('ENDPRIVATEKEY', 'END PRIVATE KEY');
  if (privateKey && !privateKey.includes('-----BEGIN PRIVATE KEY-----')) privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}`;
  if (privateKey && !privateKey.includes('-----END PRIVATE KEY-----')) privateKey = `${privateKey}\n-----END PRIVATE KEY-----\n`;

  const credentials = {
    type: 'service_account',
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: privateKey,
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
  };

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  _sheetsClient = google.sheets({ version: 'v4', auth });
  return _sheetsClient;
}

/** สร้าง Sheet (tab) อัตโนมัติถ้ายังไม่มี พร้อมใส่หัวตาราง */
async function ensureSheetExists(title, headers) {
  if (_ensuredSheets.has(title)) return;
  const sheets = getSheetsClient();
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const exists = (meta.data.sheets || []).some(s => s.properties.title === title);
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title } } }] },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${title}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [headers] },
      });
      console.log(`[memory-sheets] สร้างชีต "${title}" ใหม่พร้อมหัวตารางแล้ว`);
    }
    _ensuredSheets.add(title);
  } catch (err) {
    console.error(`[memory-sheets] ตรวจสอบ/สร้างชีต "${title}" ล้มเหลว:`, err.message);
  }
}

function nowBangkok() {
  return new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
}

// ============================================================
//  📝 Memory (บันทึกข้อมูล)
// ============================================================

/** เพิ่มบันทึกข้อมูลใหม่ลงชีต Memory */
async function appendMemory({ message, type = 'note', createdBy = '' }) {
  await ensureSheetExists(SHEET_MEMORY, MEMORY_HEADERS);
  const sheets = getSheetsClient();

  const countRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_MEMORY}!A:A`,
  });
  const nextId = (countRes.data.values || []).length || 1; // แถว 1 = header → id เริ่มที่ 1

  const row = [nextId, nowBangkok(), type, message, 'active', createdBy || ''];
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_MEMORY}!A:F`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });

  return { id: nextId, createdAt: row[1], type, message, status: 'active' };
}

/** ดึงบันทึกข้อมูลล่าสุด (จำกัดจำนวน) */
async function getAllMemories(limit = 20) {
  await ensureSheetExists(SHEET_MEMORY, MEMORY_HEADERS);
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_MEMORY}!A:F`,
    });
    const rows = (res.data.values || []).slice(1); // ข้าม header
    const items = rows
      .filter(r => (r[3] || '').trim())
      .map(r => ({
        id: r[0], createdAt: r[1], type: r[2], message: r[3], status: r[4] || 'active', createdBy: r[5] || '',
      }));
    return items.slice(-limit).reverse(); // ล่าสุดก่อน
  } catch (err) {
    console.error('[memory-sheets] getAllMemories error:', err.message);
    return [];
  }
}

// ============================================================
//  ⏰ Reminder (แจ้งเตือน)
// ============================================================

/** เพิ่มแจ้งเตือนใหม่ลงชีต Reminder */
async function appendReminder({ message, remindAt, createdBy = '' }) {
  await ensureSheetExists(SHEET_REMINDER, REMINDER_HEADERS);
  const sheets = getSheetsClient();

  const countRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_REMINDER}!A:A`,
  });
  const nextId = (countRes.data.values || []).length || 1;

  const remindTimeStr = new Date(remindAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  const row = [nextId, nowBangkok(), message, remindTimeStr, 'waiting', 'false', createdBy || ''];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_REMINDER}!A:G`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });

  return { id: nextId, createdAt: row[1], message, remindAt: remindTimeStr, status: 'waiting', sent: 'false' };
}

/** ดึงแจ้งเตือนทั้งหมดที่ยังรอดำเนินการ (status = waiting และ sent = false) พร้อมเลขแถวจริงในชีต */
async function getWaitingReminders() {
  await ensureSheetExists(SHEET_REMINDER, REMINDER_HEADERS);
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_REMINDER}!A:G`,
    });
    const rows = res.data.values || [];
    const items = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const status = (r[4] || '').trim().toLowerCase();
      const sent = (r[5] || '').trim().toLowerCase();
      if (!r[2]) continue;
      if (status === 'waiting' && sent !== 'true') {
        items.push({
          rowIndex: i + 1, // เลขแถวจริงใน Sheet (1-based)
          id: r[0], createdAt: r[1], message: r[2], remindTime: r[3], status, sent, createdBy: r[6] || '',
        });
      }
    }
    return items;
  } catch (err) {
    console.error('[memory-sheets] getWaitingReminders error:', err.message);
    return [];
  }
}

/** อัปเดตสถานะแจ้งเตือน (ระบุแถวจริงในชีตที่ได้จาก getWaitingReminders) */
async function updateReminderStatus(rowIndex, status, sent) {
  const sheets = getSheetsClient();
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_REMINDER}!E${rowIndex}:F${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[status, sent ? 'true' : 'false']] },
    });
    return true;
  } catch (err) {
    console.error('[memory-sheets] updateReminderStatus error:', err.message);
    return false;
  }
}

module.exports = {
  appendMemory,
  getAllMemories,
  appendReminder,
  getWaitingReminders,
  updateReminderStatus,
};
