// ============================================================
//  setup-menu.js  — สร้าง Rich Menu 2 หน้า
//  การสลับหน้าใช้ postback message → บอทจัดการ switchRichMenu
//  รัน: node setup-menu.js
// ============================================================

require('dotenv').config();
const line = require('@line/bot-sdk');
const fs   = require('fs');
const path = require('path');

const TOKEN  = process.env.LINE_CHANNEL_TOKEN;
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: TOKEN,
});

const W = 2500, H = 1686, ROW = 843;

// ── หน้า 1: 4 cols บน + 4 cols ล่าง ──────────────────────────
function buildPage1() {
  const CW = Math.floor(W / 4); // 625
  return {
    size: { width: W, height: H },
    selected: true,
    name: 'เมนูหลักสายตรวจลานสัก',
    chatBarText: '📋 เมนูหลัก',
    areas: [
      { bounds: { x: 0,    y: 0,   width: CW, height: ROW },
        action: { type: 'message', label: 'ค้นหาชื่อ', text: '/ค้นหาชื่อผู้ต้องหา' } },
      { bounds: { x: CW,   y: 0,   width: CW, height: ROW },
        action: { type: 'message', label: 'ทำเนียบบุคลากร', text: 'ทำเนียบบุคลากร' } },
      { bounds: { x: CW*2, y: 0,   width: CW, height: ROW },
        action: { type: 'uri',     label: 'เว็บสายตรวจ',
                  uri: 'https://liff.line.me/2010319438-PkvEgigE' } },
      { bounds: { x: CW*3, y: 0,   width: CW, height: ROW },
        action: { type: 'message', label: 'ผู้นำตำบล', text: 'ทำเนียบผู้นำตำบล' } },
      { bounds: { x: 0,    y: ROW, width: CW, height: ROW },
        action: { type: 'message', label: 'รายการเมนู', text: '/เมนู' } },
      { bounds: { x: CW,   y: ROW, width: CW, height: ROW },
        action: { type: 'message', label: 'วิธีใช้งาน', text: '/คำสั่ง' } },
      { bounds: { x: CW*2, y: ROW, width: CW, height: ROW },
        action: { type: 'message', label: 'จุดเสี่ยง', text: '/จุดเสี่ยง' } },
      // ปุ่มถัดไป — ส่ง __NEXT_PAGE__ บอทจะ switchRichMenu ให้
      { bounds: { x: CW*3, y: ROW, width: CW, height: ROW },
        action: { type: 'message', label: 'ถัดไป', text: '__NEXT_PAGE__' } },
    ],
  };
}

// ── หน้า 2: 3 cols บน + 3 cols ล่าง ──────────────────────────
function buildPage2() {
  const CW = Math.floor(W / 3); // 833
  return {
    size: { width: W, height: H },
    selected: false,
    name: 'เมนูเพิ่มเติมสายตรวจลานสัก',
    chatBarText: '📋 เมนูเพิ่มเติม',
    areas: [
      { bounds: { x: 0,    y: 0,   width: CW,   height: ROW },
        action: { type: 'message', label: 'ยืนยันตัวตน', text: '/ยืนยันตัวตน' } },
      { bounds: { x: CW,   y: 0,   width: CW,   height: ROW },
        action: { type: 'message', label: 'บุคคลสุ่มเสี่ยง', text: '/รายชื่อ' } },
      { bounds: { x: CW*2, y: 0,   width: CW+1, height: ROW },
        action: { type: 'message', label: 'ค้นทะเบียนราษฎร์', text: '/ค้นหารายชื่อบุคคล' } },
      { bounds: { x: 0,    y: ROW, width: CW,   height: ROW },
        action: { type: 'message', label: 'เบอร์ปั๊ม', text: '/เบอร์ปั๊ม' } },
      { bounds: { x: CW,   y: ROW, width: CW,   height: ROW },
        action: { type: 'message', label: 'ติดต่อเจ้าหน้าที่', text: 'ติดต่อเจ้าหน้าที่' } },
      // ปุ่มย้อนกลับ — ส่ง __PREV_PAGE__ บอทจะ switchRichMenu ให้
      { bounds: { x: CW*2, y: ROW, width: CW+1, height: ROW },
        action: { type: 'message', label: 'ย้อนกลับ', text: '__PREV_PAGE__' } },
    ],
  };
}

// ─── Upload รูป ────────────────────────────────────────────────
async function uploadImage(richMenuId, imagePath) {
  const stats = fs.statSync(imagePath);
  let buf = fs.readFileSync(imagePath);
  let ct  = 'image/png';
  console.log(`   📐 ${path.basename(imagePath)} — ${(stats.size/1024).toFixed(0)} KB`);
  if (stats.size > 900 * 1024) {
    console.log('   🗜️  compress...');
    try {
      const sharp = require('sharp');
      buf = await sharp(imagePath).resize(W,H,{fit:'fill'})
              .jpeg({quality:70,progressive:true}).toBuffer();
      ct  = 'image/jpeg';
      console.log(`   ✅ ${(buf.length/1024).toFixed(0)} KB`);
    } catch { console.warn('   ⚠️  ไม่พบ sharp ใช้ไฟล์เดิม'); }
  }
  const r = await fetch(
    `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
    { method:'POST', headers:{ Authorization:`Bearer ${TOKEN}`, 'Content-Type':ct }, body:buf }
  );
  if (!r.ok) throw new Error(`Upload failed (${r.status}): ${await r.text()}`);
  console.log(`   📤 อัปโหลดสำเร็จ`);
}

// ─── ลบของเก่า ─────────────────────────────────────────────────
async function deleteAllRichMenus() {
  const { richmenus } = await client.getRichMenuList();
  if (!richmenus?.length) return;
  console.log(`🗑️  ลบ Rich Menu เก่า ${richmenus.length} รายการ...`);
  await Promise.all(richmenus.map(m => client.deleteRichMenu(m.richMenuId)));
}

// ─── Main ──────────────────────────────────────────────────────
(async () => {
  try {
    console.log('🚀 เริ่มสร้าง Rich Menu 2 หน้า...\n');

    const img1 = path.join(__dirname, 'richmenu_page1.png');
    const img2 = path.join(__dirname, 'richmenu_page2.png');
    if (!fs.existsSync(img1)) throw new Error('ไม่พบไฟล์: richmenu_page1.png');
    if (!fs.existsSync(img2)) throw new Error('ไม่พบไฟล์: richmenu_page2.png');

    await deleteAllRichMenus();

    // สร้าง + upload หน้า 1
    console.log('\n📄 สร้าง Rich Menu หน้า 1...');
    const { richMenuId: id1 } = await client.createRichMenu(buildPage1());
    console.log(`   ✅ ${id1}`);
    await uploadImage(id1, img1);

    // สร้าง + upload หน้า 2
    console.log('\n📄 สร้าง Rich Menu หน้า 2...');
    const { richMenuId: id2 } = await client.createRichMenu(buildPage2());
    console.log(`   ✅ ${id2}`);
    await uploadImage(id2, img2);

    // ตั้ง Default หน้า 1
    console.log('\n⭐ ตั้ง Default Rich Menu...');
    await client.setDefaultRichMenu(id1);

    // บันทึก ID ลงไฟล์ (index.js จะอ่านไปใช้สลับหน้า)
    const ids = { page1: id1, page2: id2, createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(__dirname, 'richmenu-ids.json'), JSON.stringify(ids, null, 2));
    console.log('   💾 บันทึก ID ไว้ใน richmenu-ids.json');

    console.log('\n' + '='.repeat(52));
    console.log('🎉 Rich Menu 2 หน้าพร้อมใช้งานแล้วครับ!');
    console.log('='.repeat(52));
    console.log(`\n   หน้า 1 : ${id1}`);
    console.log(`   หน้า 2 : ${id2}`);
    console.log('\n⚠️  เพิ่มเติม: เพิ่ม handler __NEXT_PAGE__ และ __PREV_PAGE__');
    console.log('   ใน index.js เพื่อให้ปุ่มถัดไป/ย้อนกลับทำงานได้\n');

  } catch (err) {
    console.error('\n❌ เกิดข้อผิดพลาด:', err.message);
    if (err.originalError?.response?.data)
      console.error('   LINE API:', JSON.stringify(err.originalError.response.data, null, 2));
    process.exit(1);
  }
})();
