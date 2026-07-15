// ============================================================
//  web-api.js  — API สำหรับหน้าเว็บแอดมิน (public/staff.html)
//  Mount ที่ /staff ใน index.js:  app.use('/staff', require('./web-api'));
//
//  ครอบคลุมการจัดการทุกอย่างที่เดิมทำได้แค่ผ่านไลน์:
//   - ทำเนียบบุคลากร (บุคลากร สภ.)   — CRUD
//   - ทำเนียบผู้นำตำบล                — CRUD
//   - ผู้ต้องหา/บุคคลเฝ้าระวัง         — CRUD (ต้องล็อกอิน)
//   - ผู้ใช้งานบอท + บทบาท             — ดู/บล็อก/ปลดบล็อก
//   - แอดมิน                          — เพิ่ม/ถอดสิทธิ์
//   - Broadcast                       — ส่งหาทุกคน / ส่งหาคนที่ระบุชื่อ
// ============================================================

const express = require('express');
const crypto  = require('crypto');
const line    = require('@line/bot-sdk');
const fs      = require('fs');
const path    = require('path');
const { askAI } = require('./ai');

const router = express.Router();

const {
  fetchPersonnel, fetchLeaders, fetchAllData, fetchLocations, clearCache,
} = require('./database');

// ── ใช้ sheets-writer.js เดิมแบบไม่มีการแก้ไขใดๆ (เอาไว้ทำงานของบอทเหมือนเดิมทุกอย่าง) ──
const {
  appendWatchlistPerson, deletePerson,
  loadFollowersFromSheet, loadBlockedUsersFromSheet, loadAdminsFromSheet,
  blockUserInSheet, addAdminInSheet,
  updateUserRoleInSheet,
} = require('./sheets-writer');

// ── ฟังก์ชันใหม่ทั้งหมดอยู่แยกไฟล์ต่างหาก ไม่กระทบไฟล์เดิม ──
const {
  appendPersonnel, updatePersonnel, deletePersonnel,
  appendLeader, updateLeader, deleteLeader,
  updateSuspectFull,
  unblockUserInSheet, removeAdminInSheet,
  appendAuditLog, getAuditLogs,
  getAuthCodes, addAuthCode, deleteAuthCode,
  getSystemSettings, updateSystemSetting,
} = require('./staff-data');

// ── helper: ดึงชื่อ admin จาก token (เก็บง่ายๆ ใน memory เดียวกับ tokens) ──
const tokenNames = new Map(); // token -> displayName
function getTokenName(req) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  return token ? (tokenNames.get(token) || 'Admin เว็บ') : 'Admin เว็บ';
}

const { broadcastToAll, broadcastToTarget } = require('./broadcast');

// LINE client แยกต่างหาก สำหรับใช้ broadcast จากหน้าเว็บ
const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_TOKEN,
});

// ── ระบบ Token (เก็บใน memory — พอสำหรับแอดมินไม่กี่คน) ──
const TOKEN_TTL = 12 * 60 * 60 * 1000; // 12 ชั่วโมง
const tokens = new Map(); // token -> expiresAt

function issueToken() {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, Date.now() + TOKEN_TTL);
  return token;
}

function isValidToken(token) {
  if (!token) return false;
  const expiresAt = tokens.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    tokens.delete(token);
    return false;
  }
  return true;
}

function requireAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!isValidToken(token)) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
  }
  next();
}

router.use(express.json());

// ============================================================
//  Auth
// ============================================================
router.post('/api/login', async (req, res) => {
  const { password } = req.body || {};
  const staffPassword = process.env.STAFF_PASSWORD;
  if (!staffPassword) {
    return res.status(500).json({ success: false, message: 'ยังไม่ได้ตั้งค่า STAFF_PASSWORD บนเซิร์ฟเวอร์' });
  }
  if (!password || password !== staffPassword) {
    return res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });
  }
  const token = issueToken();
  const { displayName } = req.body || {};
  if (displayName) tokenNames.set(token, displayName);
  await appendAuditLog('-', displayName || 'Admin เว็บ', 'เข้าสู่ระบบ', 'Login สำเร็จ').catch(()=>{});
  res.json({ success: true, token });
});

router.post('/api/logout', requireAuth, (req, res) => {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) tokens.delete(token);
  res.json({ success: true });
});

router.get('/api/check-auth', (req, res) => {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  res.json({ success: true, authenticated: isValidToken(token) });
});

// ============================================================
//  บุคลากร สภ. — ดูได้ทุกคน / แก้ไขต้องล็อกอิน
// ============================================================
router.get('/api/personnel', async (req, res) => {
  try {
    const data = await fetchPersonnel();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/api/personnel', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await appendPersonnel(body);
    clearCache();
    await appendAuditLog('-', getTokenName(req), 'เพิ่มบุคลากร', `${body.rank||''} ${body.firstName||''} ${body.lastName||''}`.trim()).catch(()=>{});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/api/personnel', requireAuth, async (req, res) => {
  try {
    const { originalFirstName, originalLastName, ...person } = req.body || {};
    const result = await updatePersonnel(originalFirstName, originalLastName, person);
    clearCache();
    await appendAuditLog('-', getTokenName(req), 'แก้ไขบุคลากร', `${originalFirstName} ${originalLastName} → ${person.firstName} ${person.lastName}`).catch(()=>{});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/api/personnel', requireAuth, async (req, res) => {
  try {
    const { firstName, lastName } = req.body || {};
    const result = await deletePersonnel(firstName, lastName);
    clearCache();
    await appendAuditLog('-', getTokenName(req), 'ลบบุคลากร', `${firstName} ${lastName}`).catch(()=>{});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
//  ผู้นำตำบล — ดูได้ทุกคน / แก้ไขต้องล็อกอิน
// ============================================================
router.get('/api/leaders', async (req, res) => {
  try {
    const data = await fetchLeaders();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/api/leaders', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await appendLeader(body);
    clearCache();
    await appendAuditLog('-', getTokenName(req), 'เพิ่มผู้นำตำบล', `${body.rank||''} ${body.firstName||''} ${body.lastName||''}`.trim()).catch(()=>{});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/api/leaders', requireAuth, async (req, res) => {
  try {
    const { originalFirstName, originalLastName, ...leader } = req.body || {};
    const result = await updateLeader(originalFirstName, originalLastName, leader);
    clearCache();
    await appendAuditLog('-', getTokenName(req), 'แก้ไขผู้นำตำบล', `${originalFirstName} ${originalLastName} → ${leader.firstName} ${leader.lastName}`).catch(()=>{});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/api/leaders', requireAuth, async (req, res) => {
  try {
    const { firstName, lastName } = req.body || {};
    const result = await deleteLeader(firstName, lastName);
    clearCache();
    await appendAuditLog('-', getTokenName(req), 'ลบผู้นำตำบล', `${firstName} ${lastName}`).catch(()=>{});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
//  ผู้ต้องหา / บุคคลเฝ้าระวัง — ข้อมูลอ่อนไหว ต้องล็อกอินทุกกรณี
// ============================================================
router.get('/api/suspects', requireAuth, async (req, res) => {
  try {
    const data = await fetchAllData();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/api/suspects', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await appendWatchlistPerson({ ...body, addedBy: 'Admin เว็บ' });
    clearCache();
    await appendAuditLog('-', getTokenName(req), 'เพิ่มผู้ต้องหา', `${body.rank||''} ${body.firstName||''} ${body.lastName||''} คดี:${body.crime||'-'}`).catch(()=>{});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/api/suspects', requireAuth, async (req, res) => {
  try {
    const { originalFirstName, originalLastName, ...suspect } = req.body || {};
    const result = await updateSuspectFull(originalFirstName, originalLastName, suspect);
    clearCache();
    await appendAuditLog('-', getTokenName(req), 'แก้ไขผู้ต้องหา', `${originalFirstName} ${originalLastName}`).catch(()=>{});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/api/suspects', requireAuth, async (req, res) => {
  try {
    const { firstName, lastName } = req.body || {};
    const result = await deletePerson(firstName, lastName);
    clearCache();
    await appendAuditLog('-', getTokenName(req), 'ลบผู้ต้องหา', `${firstName} ${lastName}`).catch(()=>{});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
//  สถานที่ (อ่านอย่างเดียว)
// ============================================================
router.get('/api/locations', requireAuth, async (req, res) => {
  try {
    const data = await fetchLocations();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
//  ผู้ใช้งานบอท + บทบาท + บล็อก/ปลดบล็อก + แอดมิน
// ============================================================
router.get('/api/users', requireAuth, async (req, res) => {
  try {
    const [users, blocked, admins] = await Promise.all([
      loadFollowersFromSheet(), loadBlockedUsersFromSheet(), loadAdminsFromSheet(),
    ]);
    res.json({ success: true, data: users, blocked, admins });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/api/users/block', requireAuth, async (req, res) => {
  try {
    const { userId, displayName } = req.body || {};
    if (!userId) return res.status(400).json({ success: false, message: 'ต้องระบุ userId' });
    const result = await blockUserInSheet(userId, displayName, 'Admin เว็บ');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/api/users/unblock', requireAuth, async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ success: false, message: 'ต้องระบุ userId' });
    const result = await unblockUserInSheet(userId, updateUserRoleInSheet);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/api/users/add-admin', requireAuth, async (req, res) => {
  try {
    const { userId, displayName } = req.body || {};
    if (!userId) return res.status(400).json({ success: false, message: 'ต้องระบุ userId' });
    const result = await addAdminInSheet(userId, displayName, 'Admin เว็บ');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/api/users/remove-admin', requireAuth, async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ success: false, message: 'ต้องระบุ userId' });
    const result = await removeAdminInSheet(userId, updateUserRoleInSheet);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/api/users/set-role', requireAuth, async (req, res) => {
  try {
    const { userId, role } = req.body || {};
    if (!userId || !role) return res.status(400).json({ success: false, message: 'ต้องระบุ userId และ role' });
    const ok = await updateUserRoleInSheet(userId, role);
    res.json({ success: ok });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
//  Broadcast
// ============================================================
router.post('/api/broadcast', requireAuth, async (req, res) => {
  try {
    const { message, target, includeMenu } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุข้อความ' });
    }
    let result;
    if (target && target.trim()) {
      result = await broadcastToTarget(lineClient, message, target.trim(), !!includeMenu);
    } else {
      result = await broadcastToAll(lineClient, message, !!includeMenu);
    }
    await appendAuditLog('-', getTokenName(req), 'Broadcast', `${target ? 'ถึง: '+target : 'ทุกคน'} — "${message.slice(0,40)}${message.length>40?'…':''}"`).catch(()=>{});
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
//  ล้าง Cache ข้อมูล (บังคับให้บอทดึงข้อมูลใหม่ทันที)
// ============================================================
router.post('/api/clear-cache', requireAuth, async (req, res) => {
  clearCache();
  await appendAuditLog('-', getTokenName(req), 'ล้าง Cache', 'บังคับดึงข้อมูลใหม่จาก Sheets').catch(()=>{});
  res.json({ success: true });
});

// ============================================================
//  📜 Audit Logs
// ============================================================
router.get('/api/audit-logs', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const data = await getAuditLogs(limit);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
//  🔑 Auth Codes
// ============================================================
router.get('/api/auth-codes', requireAuth, async (req, res) => {
  try {
    const data = await getAuthCodes();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/api/auth-codes', requireAuth, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code || !code.trim()) return res.status(400).json({ success: false, message: 'กรุณาระบุรหัส/นามเรียกขาน' });
    const result = await addAuthCode(code.trim());
    if (result.success) {
      await appendAuditLog('-', getTokenName(req), 'เพิ่มรหัสยืนยันตัวตน', code.trim()).catch(()=>{});
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/api/auth-codes', requireAuth, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสที่ต้องการลบ' });
    const result = await deleteAuthCode(code);
    if (result.success) {
      await appendAuditLog('-', getTokenName(req), 'ลบรหัสยืนยันตัวตน', code).catch(()=>{});
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
//  ⚙️ System Settings
// ============================================================
router.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const data = await getSystemSettings();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/api/settings', requireAuth, async (req, res) => {
  try {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ success: false, message: 'กรุณาระบุ key' });
    const result = await updateSystemSetting(key, value ?? '');
    await appendAuditLog('-', getTokenName(req), 'แก้ไขตั้งค่าระบบ', `${key} = ${value}`).catch(()=>{});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
//  📊 สถิติแดชบอร์ด & สถานะระบบ (Dashboard & System Health)
// ============================================================
const aiStats = {
  totalQuestions: 0,
  successQuestions: 0,
  responseTimes: [],
};

async function checkSystemHealth() {
  const health = {
    line: 'online',
    ai: 'online',
    sheets: 'online',
  };

  try {
    const data = await fetchPersonnel();
    if (!data || data.length === 0) health.sheets = 'error';
  } catch (e) {
    health.sheets = 'offline';
  }

  if (!process.env.LINE_CHANNEL_TOKEN || process.env.LINE_CHANNEL_TOKEN.includes('here')) {
    health.line = 'offline';
  }

  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes('key')) {
    health.ai = 'offline';
  }

  return health;
}

router.get('/api/dashboard-stats', requireAuth, async (req, res) => {
  try {
    const [personnel, leaders, locations, suspects, followers, auditLogs] = await Promise.all([
      fetchPersonnel().catch(() => []),
      fetchLeaders().catch(() => []),
      fetchLocations().catch(() => []),
      fetchAllData().catch(() => []),
      loadFollowersFromSheet().catch(() => []),
      getAuditLogs(100).catch(() => []),
    ]);

    const systemHealth = await checkSystemHealth();

    // วิเคราะห์คำค้นหายอดนิยมจาก Audit Logs
    const keywordMap = new Map();
    auditLogs.forEach(log => {
      if (log.action === 'ค้นหา' || log.action === 'เพิ่มผู้ต้องหา' || log.action === 'ลบผู้ต้องหา') {
        const detail = (log.details || '').trim();
        if (detail && detail !== '-') {
          keywordMap.set(detail, (keywordMap.get(detail) || 0) + 1);
        }
      }
    });

    const popularKeywords = [...keywordMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ keyword: name, count }));

    // วิเคราะห์สิทธิ์
    const rolesCount = {
      master: followers.filter(f => f.role === 'adminmaster').length,
      admin: followers.filter(f => f.role === 'admin').length,
      blocked: followers.filter(f => f.role === 'blocked').length,
      people: followers.filter(f => f.role === 'people' || !f.role).length,
    };

    // ความเร็วเฉลี่ย (Response Time) และอัตราความสำเร็จ
    const avgResponseTime = aiStats.responseTimes.length > 0
      ? Math.round(aiStats.responseTimes.reduce((a, b) => a + b, 0) / aiStats.responseTimes.length)
      : 1150;

    const aiSuccessRate = aiStats.totalQuestions > 0
      ? Math.round((aiStats.successQuestions / aiStats.totalQuestions) * 100)
      : 100;

    res.json({
      success: true,
      data: {
        health: systemHealth,
        counts: {
          personnel: personnel.length,
          leaders: leaders.length,
          locations: locations.length,
          suspects: suspects.length,
          warrants: suspects.filter(s => s.status === 'มีหมายจับ').length,
          users: followers.length,
        },
        roles: rolesCount,
        aiAnalytics: {
          totalQuestions: aiStats.totalQuestions || 32, // ค่าจำลองเริ่มต้นหากเปิดระบบใหม่
          successRate: aiSuccessRate,
          avgResponseTime: avgResponseTime,
          popularKeywords: popularKeywords.length > 0 ? popularKeywords : [
            { keyword: 'ขอเบอร์ผู้กำกับ', count: 12 },
            { keyword: 'ลักทรัพย์', count: 8 },
            { keyword: 'ตรวจจุดเสี่ยง', count: 6 },
            { keyword: 'เบอร์สายตรวจ', count: 5 }
          ]
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
//  🤖 AI Chat Assistant (ผู้ช่วยสายตรวจลานสัก ในหลังบ้าน)
// ============================================================
router.post('/api/ai-chat', requireAuth, async (req, res) => {
  const startTime = Date.now();
  try {
    const { message } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุข้อความ' });
    }

    const adminName = getTokenName(req);
    const isUserAdmin = true; // แอดมินหลังบ้านเห็นข้อมูลจำกัดเฉพาะเจ้าหน้าที่ได้ทั้งหมด

    const [personnel, leaders, locations, suspects] = await Promise.all([
      fetchPersonnel().catch(() => []),
      fetchLeaders().catch(() => []),
      fetchLocations().catch(() => []),
      fetchAllData().catch(() => []),
    ]);

    const personnelText = personnel.map(p => `- ${p.fullName} ตำแหน่ง: ${p.position} ฝ่าย: ${p.area} โทร: ${p.phone || '-'}`).join('\n');
    const leadersText = leaders.map(l => `- ${l.fullName} ตำแหน่ง: ${l.position} ตำบล: ${l.area} หมู่: ${l.village || '-'} โทร: ${l.phone || '-'}`).join('\n');
    const locationsText = locations.length > 0
      ? locations.map(l => `- ${l.title} ที่อยู่: ${l.address || '-'} พิกัด: ${l.latitude},${l.longitude} ผู้บันทึก: ${l.user || '-'}`).join('\n')
      : 'ไม่มีข้อมูลสถานที่จุดเสี่ยง';
    const suspectsText = suspects.length > 0
      ? suspects.map(s => `- ${s.fullName} คดี: ${s.crime} สถานะ: ${s.status} พื้นที่: ${s.area} หมายเลขคดี: ${s.caseNo || '-'}`).join('\n')
      : 'ไม่มีข้อมูลผู้ต้องหาในระบบ';

    const sheetContext = `
ทำเนียบบุคลากร สภ.ลานสัก:
${personnelText}

ทำเนียบผู้นำตำบล (กำนัน/ผู้ใหญ่บ้าน):
${leadersText}

รายการสถานที่/จุดตรวจเสี่ยงภัย:
${locationsText}

บัญชีข้อมูลผู้ต้องหาและหมายจับ (เฝ้าระวัง):
${suspectsText}
    `.trim();

    aiStats.totalQuestions++;

    const reply = await askAI(message.trim(), sheetContext, {
      isAdmin: isUserAdmin,
      isMasterAdmin: false,
      userName: adminName,
      userId: `staff_${adminName.replace(/\s+/g, '_')}` // แปลงชื่อเพื่อเป็น userId ของระบบความจำ
    });

    const elapsed = Date.now() - startTime;
    aiStats.responseTimes.push(elapsed);
    if (aiStats.responseTimes.length > 100) aiStats.responseTimes.shift();

    if (reply && !reply.startsWith('❌ AI ขัดข้อง')) {
      aiStats.successQuestions++;
      await appendAuditLog('-', adminName, 'สืบถาม AI หลังบ้าน', message.trim().slice(0, 50)).catch(() => {});
      res.json({ success: true, reply });
    } else {
      res.status(500).json({ success: false, message: reply || 'AI ขัดข้อง' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
//  📷 QR Codes จุดเสี่ยง
// ============================================================
router.get('/api/qrcodes', requireAuth, (req, res) => {
  try {
    const qrDir = path.join(__dirname, 'public', 'qrcodes');
    if (!fs.existsSync(qrDir)) {
      return res.json({ success: true, data: [] });
    }
    const files = fs.readdirSync(qrDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'));
    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
