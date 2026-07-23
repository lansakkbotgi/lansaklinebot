'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseSavedMessageCommand,
  handleSavedMessageCommand,
  formatSavedMessages,
  getPersistentStorageCommandHint,
  formatSavedMessageStorageError,
} = require('../saved-message-command');
const { normalizePrivateKey } = require('../memory-sheets');

test('parses an exact save command with a complex incident message', () => {
  const text = '/บันทึกข้อความ พบชายแปลกหน้าวนเวียนหน้าธนาคารช่วง 14:30 น. แต่งกายเสื้อสีดำ และเฝ้าสังเกตทางเข้าออก';
  assert.deepEqual(parseSavedMessageCommand(text), {
    action: 'save',
    message: 'พบชายแปลกหน้าวนเวียนหน้าธนาคารช่วง 14:30 น. แต่งกายเสื้อสีดำ และเฝ้าสังเกตทางเข้าออก',
  });
});

test('accepts incident-command aliases and list aliases as persistent commands', () => {
  assert.deepEqual(parseSavedMessageCommand('/บันทึกเหตุการณ์ พบชายแปลกหน้าหน้าธนาคาร'), {
    action: 'save',
    message: 'พบชายแปลกหน้าหน้าธนาคาร',
  });
  assert.deepEqual(parseSavedMessageCommand('/บันทึกเหตุการ พบชายแปลกหน้าหน้าธนาคาร'), {
    action: 'save',
    message: 'พบชายแปลกหน้าหน้าธนาคาร',
  });
  assert.deepEqual(parseSavedMessageCommand('/ดูรายการที่บันทึก'), { action: 'list' });
  assert.deepEqual(parseSavedMessageCommand('/ดูบันทึกเหตุการณ์'), { action: 'list' });
});

test('does not confuse a normal complex analysis question with a save request', async () => {
  const question = 'หากมีผู้พบเห็นบุคคลต้องสงสัยวนเวียนใกล้ธนาคาร ควรวิเคราะห์ความเสี่ยง แยกข้อเท็จจริงจากข้อสันนิษฐาน และแจ้งเจ้าหน้าที่อย่างไร';
  let storageCalls = 0;

  const result = await handleSavedMessageCommand(question, {
    userId: 'U-test',
    appendMemory: async () => { storageCalls += 1; },
    getMemoriesByCreator: async () => { storageCalls += 1; },
  });

  assert.equal(result, null);
  assert.equal(storageCalls, 0);
});

test('does not treat natural language containing the word บันทึก as the slash command', () => {
  assert.equal(parseSavedMessageCommand('ช่วยบันทึกข้อความนี้ไว้ แล้วช่วยวิเคราะห์ความเสี่ยงด้วย'), null);
  assert.equal(parseSavedMessageCommand('/บันทึกข้อความเรื่องนี้ช่วยวิเคราะห์ด้วย'), null);
});

test('redirects legacy in-memory note phrases instead of letting them claim a persistent save', () => {
  assert.match(getPersistentStorageCommandHint('ช่วยบันทึกว่า พบเหตุผิดปกติหน้าธนาคาร'), /Google Sheets/);
  assert.match(getPersistentStorageCommandHint('ดูบันทึก'), /\/ดูข้อความที่บันทึก/);
  assert.equal(getPersistentStorageCommandHint('ช่วยวิเคราะห์บันทึกเหตุการณ์ที่เกิดขึ้น'), null);
});

test('gives an actionable but non-sensitive storage error for invalid credentials', () => {
  const text = formatSavedMessageStorageError(new Error('invalid_grant: Invalid JWT Signature.'));
  assert.match(text, /Service Account key/);
  assert.doesNotMatch(text, /JWT Signature/i);
});

test('returns usage text for an empty save command', async () => {
  const result = await handleSavedMessageCommand('/บันทึกข้อความ', {
    userId: 'U-test',
    appendMemory: async () => assert.fail('must not save'),
    getMemoriesByCreator: async () => assert.fail('must not list'),
  });

  assert.match(result, /\/บันทึกข้อความ <รายละเอียด>/);
});

test('stores an exact command using the caller user ID', async () => {
  let received;
  const result = await handleSavedMessageCommand('/บันทึกข้อความ บันทึกเหตุการณ์เพื่อให้เจ้าหน้าที่ตรวจสอบ', {
    userId: 'U-owner-only',
    appendMemory: async (entry) => {
      received = entry;
      return { id: 5, createdAt: '20/7/2569 14:30:00' };
    },
    getMemoriesByCreator: async () => assert.fail('must not list'),
  });

  assert.deepEqual(received, {
    message: 'บันทึกเหตุการณ์เพื่อให้เจ้าหน้าที่ตรวจสอบ',
    type: 'saved_message',
    createdBy: 'U-owner-only',
  });
  assert.match(result, /Google Sheets/);
});

test('lists records returned by the configured shared-memory reader', async () => {
  let requestedLimit;
  const result = await handleSavedMessageCommand('/ดูข้อความที่บันทึก', {
    userId: 'U-owner-only',
    appendMemory: async () => assert.fail('must not save'),
    getAllMemories: async (limit) => {
      requestedLimit = limit;
      return [{
        createdAt: '20/7/2569 14:30:00',
        message: 'ข้อความของผู้ใช้คนนี้',
      }];
    },
  });

  assert.equal(requestedLimit, 10);
  assert.match(result, /ข้อความของผู้ใช้คนนี้/);
});

test('formats an empty saved-message list clearly', () => {
  assert.match(formatSavedMessages([]), /ยังไม่มีข้อความ/);
});

test('repairs a PEM label that an environment editor wrapped across lines', () => {
  const malformed = '-----BEGIN PRIVATE\nKEY-----\nabc123\n-----END PRIVATE\nKEY-----';
  assert.equal(
    normalizePrivateKey(malformed),
    '-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----'
  );
});

test('removes the unambiguous stray n left by a broken escaped newline', () => {
  const malformed = '-----BEGIN PRIVATE KEY-----\nnABCD\n-----END PRIVATE KEY-----';
  assert.equal(
    normalizePrivateKey(malformed),
    '-----BEGIN PRIVATE KEY-----\nABCD\n-----END PRIVATE KEY-----'
  );
});

test('repairs a literal escaped newline split across physical lines', () => {
  const slash = String.fromCharCode(92);
  const malformed = `-----BEGIN PRIVATE KEY-----${slash}\nnABCD${slash}\n-----END PRIVATE KEY-----${slash}\nn`;

  assert.equal(
    normalizePrivateKey(malformed),
    '-----BEGIN PRIVATE KEY-----\nABCD\n-----END PRIVATE KEY-----'
  );
});
