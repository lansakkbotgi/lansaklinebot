// ============================================================
//  places-data.js — ระบบค้นหาสถานที่ในพื้นที่ อ.ลานสัก สำหรับ AI
//  แหล่งข้อมูล: Google Sheet แท็บ "ฐานข้อมูลพื้นที่ลานสัก" (ผ่าน fetchPlaces() ใน sheets-writer.js)
//  ไม่ได้ฝังข้อมูลไว้ตายตัวในไฟล์นี้ — ดึงสดจากชีทและ cache ไว้ในหน่วยความจำ
//  เพื่อความเร็ว แล้ว refresh อัตโนมัติเป็นระยะ (เช่นเดียวกับ cache หลักใน ai.js)
// ============================================================

const { fetchPlaces } = require('./sheets-writer');

const PLACES_CACHE_TTL = 15 * 60 * 1000; // รีเฟรชทุก 15 นาที (ถี่กว่า cache หลักเล็กน้อย เพราะข้อมูลสถานที่อาจถูกแก้บ่อย)

let _placesCache = [];
let _lastLoaded = 0;
let _isLoading = false;

/** โหลด/รีเฟรชข้อมูลสถานที่จาก Google Sheet (internal) */
async function _refreshPlaces() {
  if (_isLoading) return;
  _isLoading = true;
  try {
    const places = await fetchPlaces();
    if (Array.isArray(places)) {
      _placesCache = places;
      _lastLoaded = Date.now();
      console.log(`[Places] โหลดข้อมูลสถานที่สำเร็จ: ${places.length} รายการ`);
    }
  } catch (err) {
    console.error('[Places] โหลดข้อมูลผิดพลาด:', err.message);
  } finally {
    _isLoading = false;
  }
}

// โหลดทันทีตอน start module + ตั้ง auto-refresh
_refreshPlaces().catch(e => console.error('[Places] Initial load failed:', e.message));
setInterval(() => {
  _refreshPlaces().catch(e => console.error('[Places] Auto-refresh failed:', e.message));
}, PLACES_CACHE_TTL);

/** รีเฟรชด้วยมือ (เผื่อเรียกจาก admin command เช่น "รีเฟรชสถานที่") */
async function manualRefreshPlaces() {
  await _refreshPlaces();
  return _placesCache.length;
}

/**
 * ค้นหาสถานที่ที่เกี่ยวข้องกับคำถาม โดยจับคู่คำในคำถามกับ
 * ชื่อ/ชื่อเรียกอื่น/ตำบล/ประเภท/คำค้นหาของแต่ละสถานที่
 * @param {string} query - คำถามหรือข้อความจากผู้ใช้
 * @param {number} limit - จำนวนผลลัพธ์สูงสุดที่จะคืนกลับ (ป้องกัน context บวม)
 * @returns {Array} รายการสถานที่ที่เกี่ยวข้อง เรียงตามคะแนนความเกี่ยวข้อง
 */
function searchPlaces(query, limit = 15) {
  const q = (query || '').toLowerCase().trim();
  if (!q || _placesCache.length === 0) return [];

  const scored = _placesCache
    .filter(p => p.status === 'เปิดใช้งาน')
    .map(p => {
      const name = (p.name || '').toLowerCase();
      let score = 0;

      if (name && q.includes(name)) score += 10;

      (p.keywords || '').split(',').forEach(kw => {
        kw = kw.trim().toLowerCase();
        // ข้าม keyword สั้นๆ ที่เป็นชื่อตำบล/อำเภอทั่วไป (เช่น "ลานสัก") เพราะ match ได้แทบทุกแถว
        if (kw && kw.length >= 3 && kw !== 'ลานสัก' && q.includes(kw)) score += 5;
      });
      (p.altNames || '').split(',').forEach(alt => {
        alt = alt.trim().toLowerCase();
        if (alt && q.includes(alt)) score += 5;
      });
      if (p.tambon && p.tambon !== 'ลานสัก' && q.includes(p.tambon.toLowerCase())) score += 3;
      if (p.subtype && p.subtype.length >= 3 && q.includes(p.subtype.toLowerCase())) score += 4;
      if (p.village && p.village.length >= 3 && q.includes(p.village.toLowerCase())) score += 3;

      return { place: p, score };
    })
    .filter(x => x.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.place);

  return scored;
}

/** คืนค่าสถานที่ทั้งหมดที่เปิดใช้งาน (ใช้เมื่อจำเป็นต้องดูภาพรวมทั้งหมด เช่น admin สั่งลิสต์) */
function getAllPlaces() {
  return _placesCache.filter(p => p.status === 'เปิดใช้งาน');
}

/** แปลงรายการสถานที่เป็นข้อความสำหรับใส่ใน AI context */
function formatPlacesText(places) {
  if (!places || places.length === 0) return 'ไม่พบสถานที่ที่เกี่ยวข้องกับคำถามนี้ในฐานข้อมูล';
  return places.map(p => {
    const altPart = p.altNames ? ` (หรือเรียกว่า ${p.altNames})` : '';
    const phonePart = p.phone ? ` | โทร: ${p.phone}` : '';
    const hoursPart = p.hours ? ` | เวลา: ${p.hours}` : '';
    const coordPart = (p.lat && p.lng) ? ` | พิกัด: ${p.lat},${p.lng}` : '';
    const detailPart = p.detail ? ` | รายละเอียด: ${p.detail}` : '';
    return `- [${p.code}] ${p.name}${altPart} | ประเภท: ${p.category}/${p.subtype} | ตำบล${p.tambon} อ.${p.amphoe} จ.${p.province}${coordPart}${phonePart}${hoursPart}${detailPart}`;
  }).join('\n');
}

module.exports = { searchPlaces, getAllPlaces, formatPlacesText, manualRefreshPlaces };
