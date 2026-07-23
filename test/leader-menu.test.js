'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildVillageLeaderMenuFlex, buildWelcomeFlex } = require('../flex');

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
