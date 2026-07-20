'use strict';

// Commands in this module are intentionally exact. Keeping this routing
// separate from ai.js prevents ordinary questions from being treated as notes.
const SAVE_COMMAND = '/บันทึกข้อความ';
const SAVE_COMMANDS = new Set([
  SAVE_COMMAND,
  '/บันทึกเหตุการณ์',
  '/บันทึกเหตุการ',
]);
const LIST_COMMANDS = new Set([
  '/ดูข้อความที่บันทึก',
  '/ดูข้อความที่บันทึกไว้',
  '/ดูรายการที่บันทึก',
  '/ดูบันทึกเหตุการณ์',
  '/ดูบันทึกเหตุการ',
]);
const MAX_SAVED_MESSAGE_LENGTH = 1000;
const MAX_LIST_ITEMS = 10;

function parseSavedMessageCommand(text) {
  if (typeof text !== 'string') return null;

  const normalized = text.trim();
  if (LIST_COMMANDS.has(normalized)) return { action: 'list' };

  // Whitespace is required when content follows the command. This avoids
  // treating similarly named text as a save request.
  const match = normalized.match(/^\/(?:บันทึกข้อความ|บันทึกเหตุการณ์|บันทึกเหตุการ)(?:\s+([\s\S]*))?$/u);
  if (!match) return null;

  const message = (match[1] || '').trim();
  if (!message) return { action: 'usage' };
  if (message.length > MAX_SAVED_MESSAGE_LENGTH) {
    return { action: 'too_long', maxLength: MAX_SAVED_MESSAGE_LENGTH };
  }

  return { action: 'save', message };
}

function buildUsageText() {
  return [
    '📝 วิธีบันทึกข้อความ',
    '',
    'พิมพ์: /บันทึกข้อความ <รายละเอียด>',
    'หรือ: /บันทึกเหตุการณ์ <รายละเอียด>',
    'ตัวอย่าง: /บันทึกข้อความ พบชายแปลกหน้าวนเวียนอยู่หน้าธนาคาร เวลา 14:30 น.',
    '',
    'ดูข้อความของคุณ: /ดูข้อความที่บันทึก หรือ /ดูรายการที่บันทึก',
    '',
    'หมายเหตุ: ระบบจะบันทึกเฉพาะข้อความที่ขึ้นต้นด้วยคำสั่ง / เท่านั้น คำถามหรือข้อความทั่วไปจะไม่ถูกบันทึกโดยไม่ตั้งใจ',
  ].join('\n');
}

/**
 * Redirect phrases previously intercepted by the volatile in-memory note
 * feature. This runs in index.js before askAI(), so it cannot claim a save
 * succeeded unless the persistent Google Sheets command was used.
 */
function getPersistentStorageCommandHint(text) {
  if (typeof text !== 'string') return null;
  const normalized = text.trim();
  if (!normalized || normalized.startsWith('/')) return null;

  const looksLikeLegacySave = [
    /^(?:ช่วย)?บันทึก(?:ข้อความ)?(?:ให้หน่อย|หน่อย)?(?:ว่า|:|\s+)\s*(.+)/su,
    /^(?:ช่วย)?จดไว้(?:ว่า|:|\s+)\s*(.+)/su,
    /^(?:ช่วย)?จำ(?:ไว้)?(?:ว่า|:|\s+)\s*(.+)/su,
    /^(?:ช่วย)?note[:\s]+(.+)/isu,
  ].some(pattern => pattern.test(normalized));

  if (looksLikeLegacySave) {
    return [
      '📝 เพื่อให้บันทึกถาวรลง Google Sheets โปรดใช้คำสั่งนี้ครับ',
      '/บันทึกข้อความ <รายละเอียด>',
      'หรือ /บันทึกเหตุการณ์ <รายละเอียด>',
    ].join('\n');
  }

  const looksLikeLegacyList = /^(?:ช่วย)?(?:ดู(?:บันทึก|note|สิ่งที่บันทึก)|บันทึก(?:วันนี้|ที่มี|ทั้งหมด)|note(?:s)?(?:วันนี้|ทั้งหมด)?)\s*$/iu.test(normalized);
  if (looksLikeLegacyList) {
    return '📋 ดูรายการที่บันทึกถาวรได้ด้วย /ดูข้อความที่บันทึก หรือ /ดูรายการที่บันทึก';
  }

  return null;
}

function formatSavedMessageStorageError(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('invalid jwt signature') || message.includes('invalid_grant')) {
    return '❌ ยังเชื่อม Google Sheets ไม่ได้ เพราะ Service Account key ของระบบไม่ถูกต้อง กรุณาให้ผู้ดูแลเปลี่ยนคีย์ใหม่แล้วตั้งค่าในเซิร์ฟเวอร์';
  }
  if (message.includes('permission') || message.includes('not found')) {
    return '❌ ยังเชื่อม Google Sheets ไม่ได้ กรุณาตรวจสอบว่า Service Account ได้รับสิทธิ์ Editor สำหรับชีตนี้แล้ว';
  }
  return '❌ ไม่สามารถบันทึกหรือเรียกดูข้อความจาก Google Sheets ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
}

function truncateText(text, maxLength = 300) {
  const value = String(text || '').trim();
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function formatSavedMessages(memories) {
  if (!Array.isArray(memories) || memories.length === 0) {
    return '📋 ยังไม่มีข้อความที่คุณบันทึกไว้\n\nพิมพ์ /บันทึกข้อความ <รายละเอียด> เพื่อเพิ่มข้อความใหม่';
  }

  const items = memories.slice(0, MAX_LIST_ITEMS);
  const lines = items.map((memory, index) => {
    const createdAt = memory.createdAt || 'ไม่ระบุเวลา';
    return `${index + 1}. [${createdAt}]\n   ${truncateText(memory.message)}`;
  });

  return `📋 ข้อความที่คุณบันทึกไว้ (${items.length} รายการล่าสุด)\n${'─'.repeat(24)}\n${lines.join('\n\n')}`;
}

/**
 * Return null when the input is not one of this feature's exact commands.
 * The caller can then continue through the existing search/AI route unchanged.
 */
async function handleSavedMessageCommand(text, { userId, appendMemory, getMemoriesByCreator }) {
  const command = parseSavedMessageCommand(text);
  if (!command) return null;

  if (!userId) return '❌ ไม่สามารถระบุตัวผู้บันทึกได้ กรุณาลองใหม่อีกครั้ง';
  if (command.action === 'usage') return buildUsageText();
  if (command.action === 'too_long') {
    return `❌ ข้อความยาวเกินไป กรุณาบันทึกไม่เกิน ${command.maxLength} ตัวอักษร`;
  }

  if (command.action === 'save') {
    const saved = await appendMemory({
      message: command.message,
      type: 'saved_message',
      createdBy: userId,
    });
    return `✅ บันทึกข้อความลง Google Sheets เรียบร้อยแล้ว\n📝 ${command.message}\n📅 ${saved.createdAt || 'บันทึกแล้ว'}`;
  }

  const memories = await getMemoriesByCreator(userId, MAX_LIST_ITEMS);
  return formatSavedMessages(memories);
}

module.exports = {
  SAVE_COMMAND,
  SAVE_COMMANDS,
  MAX_LIST_ITEMS,
  parseSavedMessageCommand,
  buildUsageText,
  formatSavedMessages,
  getPersistentStorageCommandHint,
  formatSavedMessageStorageError,
  handleSavedMessageCommand,
};
