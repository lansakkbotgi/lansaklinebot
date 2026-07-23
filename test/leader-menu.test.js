'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildVillageLeaderMenuFlex, buildWelcomeFlex } = require('../flex');
const { buildCombinedAnalysisContext, summarizeLeaders, summarizePersonnel } = require('../personnel-summary');

test('buildVillageLeaderMenuFlex returns correct Flex Message structure for leader directory', () => {
  const flexMsg = buildVillageLeaderMenuFlex();
  assert.equal(flexMsg.type, 'flex');
  assert.equal(flexMsg.altText, 'ทำเนียบผู้นำชุมชน — เลือกตำบลที่ต้องการ');
  
  const headerContents = flexMsg.contents.header.contents;
  const titleTextObj = headerContents.find(item => item.text && item.text.includes('ทำเนียบผู้นำ'));
  assert.ok(titleTextObj, 'Header should contain title text');
  assert.equal(titleTextObj.text, '🏘️ ทำเนียบผู้นำชุมชน');
});

test('buildWelcomeFlex includes button for /ทำเนียบผู้นำชุมชน', () => {
  const flexMsg = buildWelcomeFlex(false);
  const bubbles = flexMsg.contents.contents;
  const mainBubble = bubbles[0];
  const items = mainBubble.body.contents;
  
  const leaderBtn = items.find(b => b.action && (b.action.label === 'ทำเนียบผู้นำชุมชน' || b.action.text === '/ทำเนียบผู้นำชุมชน'));
  assert.ok(leaderBtn, 'Welcome flex should have button for /ทำเนียบผู้นำชุมชน');
  assert.equal(leaderBtn.action.label, 'ทำเนียบผู้นำชุมชน');
  assert.equal(leaderBtn.action.text, '/ทำเนียบผู้นำชุมชน');
});

test('buildCombinedAnalysisContext includes raw leader records and phone instructions for village-level questions', () => {
  const pSummary = summarizePersonnel([{ area: 'งานป้องกันปราบปราม' }]);
  const lSummary = summarizeLeaders([{ fullName: 'นายสมศักดิ์', area: 'ลานสัก', village: 'หมู่ 4', phone: '0812345678' }]);
  
  const context = buildCombinedAnalysisContext(pSummary, lSummary, {
    leadersText: '- นายสมศักดิ์ ตำแหน่ง: ผู้ใหญ่บ้าน ตำบล: ลานสัก หมู่: หมู่ 4 โทร: 0812345678',
  });

  assert.match(context, /นายสมศักดิ์/);
  assert.match(context, /หมู่ 4/);
  assert.match(context, /0812345678/);
  assert.match(context, /เบอร์โทรศัพท์/);
});
