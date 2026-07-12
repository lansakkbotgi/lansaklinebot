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
} = require('./staff-data');

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
router.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  const staffPassword = process.env.STAFF_PASSWORD;
  if (!staffPassword) {
    return res.status(500).json({ success: false, message: 'ยังไม่ได้ตั้งค่า STAFF_PASSWORD บนเซิร์ฟเวอร์' });
  }
  if (!password || password !== staffPassword) {
    return res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });
  }
  res.json({ success: true, token: issueToken() });
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
    const result = await appendPersonnel(req.body || {});
    clearCache();
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
    const result = await appendLeader(req.body || {});
    clearCache();
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
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
//  ล้าง Cache ข้อมูล (บังคับให้บอทดึงข้อมูลใหม่ทันที)
// ============================================================
router.post('/api/clear-cache', requireAuth, (req, res) => {
  clearCache();
  res.json({ success: true });
});

module.exports = router;
