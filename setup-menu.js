// ============================================================
//  setup-menu.js  — สร้าง Rich Menu 2 หน้า
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

// ── ขนาดรูปจริง richmenu_page1.png = 1536×1024 ──────────────
// ── ขนาดรูปจริง richmenu_page2.png = 2500×1686 ──────────────
//
// หน้า 1 layout (1536×1024):
// ┌──────┬──────┬──────┬──────────────────────────┐
// │      │      │      │  [ถัดไป] ลอยบนขวา         │  ← y:19-297
// │ค้นหา│ทำเนียบ│เว็บ  │ผู้นำตำบล (ส่วนล่าง)       │  ← y:0-512
// ├──────┴──────┴──────┴──────────────────────────┤
// │  รายการเมนู  │  วิธีใช้งาน  │    จุดเสี่ยง   │  ← y:512-1024
// └──────────────┴──────────────┴─────────────────┘
//
// หน้า 2 layout (2500×1686):
// ┌──────────┬──────────┬──────────┐
// │ยืนยันตัว│บุคคลสุ่มฯ│ค้นราษฎร์│  ← y:0-843
// ├──────────┼──────────┼──────────┤
// │ เบอร์ปั๊ม│ ติดต่อ  │◀ย้อนกลับ│  ← y:843-1686
// └──────────┴──────────┴──────────┘

// ── หน้า 1 (1536×1024) ──────────────────────────────────────
function buildPage1() {
  const W = 1536, H = 1024, ROW = 512;
  const CW4 = 384;  // W/4
  const CW3 = 512;  // W/3

  // ปุ่มถัดไปลอยมุมบนขวา (วัดจากรูปจริง)
  const BTN_X = 857, BTN_Y = 19, BTN_W = 665, BTN_H = 278;

  return {
    size: { width: W, height: H },
    selected: true,
    name: 'เมนูหลักสายตรวจลานสัก',
    chatBarText: '📋 เมนูหลัก',
    areas: [
      // ── แถวบน: ปุ่ม 1-3 เต็มความสูง ──
      { bounds: { x: 0,     y: 0, width: CW4, height: ROW },
        action: { type: 'message', label: 'ค้นหาชื่อ', text: '/ค้นหาชื่อผู้ต้องหา' } },
      { bounds: { x: CW4,   y: 0, width: CW4, height: ROW },
        action: { type: 'message', label: 'ทำเนียบบุคลากร', text: 'ทำเนียบบุคลากร' } },
      { bounds: { x: CW4*2, y: 0, width: CW4, height: ROW },
        action: { type: 'uri', label: 'เว็บสายตรวจ',
                  uri: 'https://liff.line.me/2010319438-PkvEgigE' } },

      // ── ปุ่มถัดไป (ลอยมุมบนขวา — area ตรงกับรูปพอดี) ──
      { bounds: { x: BTN_X, y: BTN_Y, width: BTN_W, height: BTN_H },
        action: { type: 'message', label: 'ถัดไป', text: '__NEXT_PAGE__' } },

      // ── ผู้นำตำบล (ส่วนที่เหลือใต้ปุ่มถัดไป) ──
      { bounds: { x: CW4*3, y: BTN_Y + BTN_H, width: CW4, height: ROW - BTN_Y - BTN_H },
        action: { type: 'message', label: 'ผู้นำตำบล', text: 'ทำเนียบผู้นำตำบล' } },

      // ── แถวล่าง 3 ปุ่ม ──
      { bounds: { x: 0,     y: ROW, width: CW3, height: ROW },
        action: { type: 'message', label: 'รายการเมนู', text: '/เมนู' } },
      { bounds: { x: CW3,   y: ROW, width: CW3, height: ROW },
        action: { type: 'message', label: 'วิธีใช้งาน', text: '/คำสั่ง' } },
      { bounds: { x: CW3*2, y: ROW, width: CW3, height: ROW },
        action: { type: 'message', label: 'จุดเสี่ยง', text: '/จุดเสี่ยง' } },
    ],
  };
}

// ── หน้า 2 (2500×1686) ──────────────────────────────────────
function buildPage2() {
  const W = 2500, H = 1686, ROW = 843;
  const CW = Math.floor(W / 3); // 833

  // ปุ่มย้อนกลับลอยมุมบนซ้าย (วัดจากรูปจริง richmenu_page2)
  // รูป page2 ขนาด 2500×1686, ปุ่มย้อนกลับอยู่ y≈19-297
  const BTN_W = 620, BTN_H = 260, BTN_X = 25, BTN_Y = 19;

  return {
    size: { width: W, height: H },
    selected: false,
    name: 'เมนูเพิ่มเติมสายตรวจลานสัก',
    chatBarText: '📋 เมนูเพิ่มเติม',
    areas: [
      // ── ปุ่มย้อนกลับ (ลอยมุมบนซ้าย) ──
      { bounds: { x: BTN_X, y: BTN_Y, width: BTN_W, height: BTN_H },
        action: { type: 'message', label: 'ย้อนกลับ', text: '__PREV_PAGE__' } },

      // ── ยืนยันตัวตน (ส่วนที่เหลือใต้ปุ่มย้อนกลับ) ──
      { bounds: { x: 0,     y: BTN_Y + BTN_H, width: CW, height: ROW - BTN_Y - BTN_H },
        action: { type: 'message', label: 'ยืนยันตัวตน', text: '/ยืนยันตัวตน' } },

      // ── แถวบน col 2-3 เต็มความสูง ──
      { bounds: { x: CW,    y: 0, width: CW,   height: ROW },
        action: { type: 'message', label: 'บุคคลสุ่มเสี่ยง', text: '/รายชื่อ' } },
      { bounds: { x: CW*2,  y: 0, width: CW+1, height: ROW },
        action: { type: 'message', label: 'ค้นทะเบียนราษฎร์', text: '/ค้นหารายชื่อบุคคล' } },

      // ── แถวล่าง ──
      { bounds: { x: 0,     y: ROW, width: CW,   height: ROW },
        action: { type: 'message', label: 'เบอร์ปั๊ม', text: '/เบอร์ปั๊ม' } },
      { bounds: { x: CW,    y: ROW, width: CW,   height: ROW },
        action: { type: 'message', label: 'ติดต่อเจ้าหน้าที่', text: 'ติดต่อเจ้าหน้าที่' } },
      { bounds: { x: CW*2,  y: ROW, width: CW+1, height: ROW },
        action: { type: 'message', label: 'ย้อนกลับ (การ์ด)', text: '__PREV_PAGE__' } },
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
      buf = await sharp(imagePath).jpeg({quality:75,progressive:true}).toBuffer();
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

    console.log('\n📄 สร้าง Rich Menu หน้า 1...');
    const { richMenuId: id1 } = await client.createRichMenu(buildPage1());
    console.log(`   ✅ ${id1}`);
    await uploadImage(id1, img1);

    console.log('\n📄 สร้าง Rich Menu หน้า 2...');
    const { richMenuId: id2 } = await client.createRichMenu(buildPage2());
    console.log(`   ✅ ${id2}`);
    await uploadImage(id2, img2);

    console.log('\n⭐ ตั้ง Default Rich Menu...');
    await client.setDefaultRichMenu(id1);

    const ids = { page1: id1, page2: id2, createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(__dirname, 'richmenu-ids.json'), JSON.stringify(ids, null, 2));

    console.log('\n' + '='.repeat(52));
    console.log('🎉 Rich Menu 2 หน้าพร้อมใช้งานแล้วครับ!');
    console.log('='.repeat(52));
    console.log(`\n   หน้า 1 : ${id1}`);
    console.log(`   หน้า 2 : ${id2}\n`);

  } catch (err) {
    console.error('\n❌ เกิดข้อผิดพลาด:', err.message);
    if (err.originalError?.response?.data)
      console.error('   LINE API:', JSON.stringify(err.originalError.response.data, null, 2));
    process.exit(1);
  }
})();
