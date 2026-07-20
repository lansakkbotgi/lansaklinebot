'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  summarizePersonnel,
  formatPersonnelFacts,
  formatPersonnelFactsOrUnavailable,
  isPersonnelAnalysisQuestion,
  buildPersonnelAnalysisContext,
} = require('../personnel-summary');

test('summarizes officers and trainees without double-counting', () => {
  const summary = summarizePersonnel([
    { area: 'ผู้บังคับบัญชา' },
    { area: 'งานป้องกันปราบปราม' },
    { area: 'งานป้องกันปราบปราม' },
    { area: 'เด็กฝึกงาน' },
    { area: ' เด็กฝึกงาน ' },
    { area: 'ช่วยราชการ' },
  ]);

  assert.deepEqual(summary, {
    totalRecords: 6,
    officerCount: 4,
    traineeCount: 2,
    departments: [
      { department: 'ผู้บังคับบัญชา', count: 1 },
      { department: 'งานป้องกันปราบปราม', count: 2 },
      { department: 'ช่วยราชการ', count: 1 },
    ],
  });
});

test('formats calculated facts for an analytical AI answer', () => {
  const facts = formatPersonnelFacts({
    totalRecords: 73,
    officerCount: 69,
    traineeCount: 4,
    departments: [
      { department: 'งานป้องกันปราบปราม', count: 31 },
      { department: 'งานจราจร', count: 3 },
    ],
  });

  assert.match(facts, /เจ้าหน้าที่ตำรวจ \(ไม่รวมเด็กฝึกงาน\): 69 คน/);
  assert.match(facts, /งานป้องกันปราบปราม: 31 คน/);
  assert.match(facts, /งานจราจร: 3 คน/);
});

test('selects compact context for personnel analysis, including a request not to list names', () => {
  const question = 'ช่วยวิเคราะห์กำลังพลตำรวจ โดยไม่ต้องแสดงรายชื่อทั้งหมด: ฝ่ายใดมากที่สุด และต้องจัดกำลังอย่างไร';
  const summary = {
    totalRecords: 73,
    officerCount: 69,
    traineeCount: 4,
    departments: [
      { department: 'งานป้องกันปราบปราม', count: 31 },
      { department: 'งานจราจร', count: 3 },
    ],
  };

  assert.equal(isPersonnelAnalysisQuestion(question), true);
  assert.equal(isPersonnelAnalysisQuestion('ขอรายชื่อเจ้าหน้าที่ตำรวจทุกคนและนับจำนวน'), false);
  assert.equal(isPersonnelAnalysisQuestion('ช่วยวิเคราะห์เหตุการณ์ที่หน้าธนาคาร'), false);

  const context = buildPersonnelAnalysisContext(summary);
  assert.match(context, /เจ้าหน้าที่ตำรวจ \(ไม่รวมเด็กฝึกงาน\): 69 คน/);
  assert.match(context, /ตอบเชิงวิเคราะห์จากข้อเท็จจริง/);
  assert.doesNotMatch(context, /พ\.ต\.อ\./);
});

test('does not make up a zero count when personnel data cannot be loaded', () => {
  const unavailable = formatPersonnelFactsOrUnavailable(summarizePersonnel([]));

  assert.match(unavailable, /ยังไม่สามารถยืนยันข้อมูลจากชีต/);
  assert.doesNotMatch(unavailable, /เจ้าหน้าที่ตำรวจ \(ไม่รวมเด็กฝึกงาน\): 0 คน/);
});
