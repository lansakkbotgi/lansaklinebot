'use strict';

const TRAINEE_DEPARTMENT = 'เด็กฝึกงาน';
const DEPARTMENT_ORDER = [
  'ผู้บังคับบัญชา',
  'งานป้องกันปราบปราม',
  'งานสืบสวน',
  'งานอำนวยการ',
  'งานสอบสวน',
  'งานจราจร',
  'ช่วยราชการ',
];

function normalizeDepartment(value) {
  return String(value || '').replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ').trim();
}

function summarizePersonnel(personnel) {
  const records = Array.isArray(personnel) ? personnel.filter(Boolean) : [];
  const departmentCounts = new Map();
  let traineeCount = 0;
  let officerCount = 0;

  for (const person of records) {
    const department = normalizeDepartment(person.area) || 'ไม่ระบุฝ่าย';
    if (department === TRAINEE_DEPARTMENT) {
      traineeCount += 1;
      continue;
    }

    officerCount += 1;
    departmentCounts.set(department, (departmentCounts.get(department) || 0) + 1);
  }

  const orderedDepartments = [
    ...DEPARTMENT_ORDER.filter(department => departmentCounts.has(department)),
    ...[...departmentCounts.keys()]
      .filter(department => !DEPARTMENT_ORDER.includes(department))
      .sort((a, b) => a.localeCompare(b, 'th')),
  ].map(department => ({ department, count: departmentCounts.get(department) }));

  return {
    totalRecords: records.length,
    officerCount,
    traineeCount,
    departments: orderedDepartments,
  };
}

function formatPersonnelFacts(summary) {
  const departmentLines = summary.departments.length > 0
    ? summary.departments.map(({ department, count }) => `- ${department}: ${count} คน`).join('\n')
    : '- ไม่มีข้อมูลฝ่าย/งาน';

  return [
    'ข้อมูลสรุปทำเนียบบุคลากรที่โปรแกรมคำนวณจากชีตจริง (ใช้เป็นข้อเท็จจริง):',
    `- บุคลากรทั้งหมดในชีต: ${summary.totalRecords} คน`,
    `- เจ้าหน้าที่ตำรวจ (ไม่รวมเด็กฝึกงาน): ${summary.officerCount} คน`,
    `- เด็กฝึกงาน: ${summary.traineeCount} คน`,
    '- จำนวนเจ้าหน้าที่แยกตามฝ่าย:',
    departmentLines,
    'เมื่อตอบคำถามเชิงวิเคราะห์ ให้ใช้ตัวเลขชุดนี้เป็นฐาน ห้ามนับรายชื่อซ้ำหรือสร้างรายการที่ไม่มีในข้อมูลจริง',
  ].join('\n');
}

function formatPersonnelFactsOrUnavailable(summary) {
  if (!summary || summary.totalRecords === 0) {
    return [
      'สถานะข้อมูลทำเนียบบุคลากร: ยังไม่สามารถยืนยันข้อมูลจากชีตได้ในขณะนี้',
      'ห้ามคาดเดาหรือรายงานยอดจำนวนบุคลากร จนกว่าจะโหลดข้อมูลจากชีตสำเร็จ',
    ].join('\n');
  }

  return formatPersonnelFacts(summary);
}

function isPersonnelAnalysisQuestion(value) {
  const text = String(value || '').replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ').trim();
  if (!text) return false;

  const mentionsPersonnel = /(ตำรวจ|บุคลากร|เจ้าหน้าที่|กำลังพล|ทำเนียบบุคลากร)/u.test(text);
  const requestsAnalysis = /(วิเคราะห์|จำนวน|กี่คน|เท่าไร|มากที่สุด|น้อยที่สุด|เปรียบเทียบ|สัดส่วน|จัดกำลัง|กระจายกำลัง|นับ|รวม)/u.test(text);
  const rejectsDetails = /(?:ไม่ต้อง|ไม่เอา|ไม่ต้องการ).{0,32}(?:รายชื่อ|ชื่อ|เบอร์|โทร|อีเมล)/u.test(text);
  const requestsDetails = /(?:ขอ|แสดง|ดึง|ส่ง|แจ้ง|บอก|เอา).{0,32}(?:รายชื่อ|ชื่อ|เบอร์|โทร|อีเมล)/u.test(text);

  return mentionsPersonnel && requestsAnalysis && (!requestsDetails || rejectsDetails);
}

// ============================================================
//  ผู้นำตำบล (กำนัน/ผู้ใหญ่บ้าน) — สรุปยอดในรูปแบบเดียวกับบุคลากร
// ============================================================

function summarizeLeaders(leaders) {
  const records = Array.isArray(leaders) ? leaders.filter(Boolean) : [];
  const areaCounts = new Map();

  for (const person of records) {
    const area = normalizeDepartment(person.area) || 'ไม่ระบุตำบล';
    areaCounts.set(area, (areaCounts.get(area) || 0) + 1);
  }

  const orderedAreas = [...areaCounts.keys()]
    .sort((a, b) => a.localeCompare(b, 'th'))
    .map(area => ({ area, count: areaCounts.get(area) }));

  return { totalRecords: records.length, areas: orderedAreas };
}

function formatLeaderFacts(summary) {
  if (!summary || summary.totalRecords === 0) {
    return 'สถานะข้อมูลผู้นำตำบล: ยังไม่สามารถยืนยันข้อมูลจากชีตได้ในขณะนี้ ห้ามคาดเดายอดจำนวน';
  }
  const areaLines = summary.areas.length > 0
    ? summary.areas.map(({ area, count }) => `- ${area}: ${count} คน`).join('\n')
    : '- ไม่มีข้อมูลตำบล';

  return [
    'ข้อมูลสรุปทำเนียบผู้นำตำบล (กำนัน/ผู้ใหญ่บ้าน) ที่โปรแกรมคำนวณจากชีตจริง (ใช้เป็นข้อเท็จจริง):',
    `- ผู้นำตำบลทั้งหมดในชีต: ${summary.totalRecords} คน`,
    '- จำนวนแยกตามตำบล:',
    areaLines,
  ].join('\n');
}

/**
 * ครอบคลุมคำถามวิเคราะห์ทั้งสองกลุ่ม (บุคลากรตำรวจ และ/หรือ ผู้นำตำบล) รวมถึงคำถาม
 * เปรียบเทียบ/สัดส่วนข้ามกลุ่ม เช่น "ตำรวจกับผู้ใหญ่บ้านคิดเป็นกี่ % ของทั้งหมด"
 */
function isAnalyticalQuestion(value) {
  const text = String(value || '').replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ').trim();
  if (!text) return false;

  const mentionsGroup = /(ตำรวจ|บุคลากร|เจ้าหน้าที่|กำลังพล|ทำเนียบบุคลากร|ผู้นำตำบล|ผู้นำชุมชน|ผู้ใหญ่บ้าน|กำนัน)/u.test(text);
  const requestsAnalysis = /(วิเคราะห์|สรุป|จำนวน|กี่คน|กี่นาย|กี่ราย|เท่าไร|เท่าไหร่|มากที่สุด|น้อยที่สุด|เปรียบเทียบ|สัดส่วน|เปอร์เซ็นต์|%|คิดเป็น|แบ่งเป็น|จัดกำลัง|กระจายกำลัง|นับ|รวม)/u.test(text);
  const rejectsDetails = /(?:ไม่ต้อง|ไม่เอา|ไม่ต้องการ).{0,32}(?:รายชื่อ|ชื่อ|เบอร์|โทร|อีเมล)/u.test(text);
  const requestsDetails = /(?:ขอ|แสดง|ดึง|ส่ง|แจ้ง|บอก|เอา).{0,32}(?:รายชื่อ|ชื่อ|เบอร์|โทร|อีเมล)/u.test(text);

  return mentionsGroup && requestsAnalysis && (!requestsDetails || rejectsDetails);
}

function buildPersonnelAnalysisContext(summary) {
  const facts = formatPersonnelFactsOrUnavailable(summary);
  if (!summary || summary.totalRecords === 0) return facts;

  return [
    facts,
    '',
    'คำถามนี้ต้องการการวิเคราะห์กำลังพล: ตอบเชิงวิเคราะห์จากข้อเท็จจริงข้างต้น',
    'ไม่ต้องแสดงรายชื่อทั้งหมด เว้นแต่ผู้ใช้ขอรายชื่อโดยตรง',
  ].join('\n');
}

/**
 * บริบทวิเคราะห์แบบรวม บุคลากรตำรวจ + ผู้นำตำบล พร้อมยอดรวมทั้งสองกลุ่ม
 * เพื่อให้ AI คำนวณสัดส่วน/เปอร์เซ็นต์ข้ามกลุ่มได้ถูกต้องจากตัวเลขจริง โดยไม่ต้องเดา
 */
function buildCombinedAnalysisContext(personnelSummary, leaderSummary, extraContext = {}) {
  const personnelFacts = formatPersonnelFactsOrUnavailable(personnelSummary);
  const leaderFacts = formatLeaderFacts(leaderSummary);
  const officerCount = personnelSummary?.officerCount ?? null;
  const leaderCount = leaderSummary?.totalRecords ?? null;
  const grandTotal = (officerCount !== null && leaderCount !== null) ? officerCount + leaderCount : null;

  const totalsLine = grandTotal !== null
    ? `- รวมทั้งสองกลุ่ม (เจ้าหน้าที่ตำรวจ + ผู้นำตำบล): ${grandTotal} คน (ตำรวจ ${officerCount} คน, ผู้นำตำบล ${leaderCount} คน)`
    : null;

  const lines = [
    personnelFacts,
    '',
    leaderFacts,
    ...(totalsLine ? ['', totalsLine] : []),
  ];

  if (extraContext.leadersText) {
    lines.push('', 'ทำเนียบผู้นำตำบล (กำนัน/ผู้ใหญ่บ้าน/ผู้นำชุมชน ทุกหมู่บ้าน):', extraContext.leadersText);
  }
  if (extraContext.personnelText) {
    lines.push('', 'ทำเนียบบุคลากร สภ.ลานสัก:', extraContext.personnelText);
  }
  if (extraContext.locationsText) {
    lines.push('', 'รายการสถานที่/จุดตรวจเสี่ยงภัย:', extraContext.locationsText);
  }
  if (extraContext.suspectsText) {
    lines.push('', 'บัญชีผู้ต้องหาและหมายจับ (เฝ้าระวัง):', extraContext.suspectsText);
  }

  lines.push(
    '',
    'คำถามนี้ต้องการการวิเคราะห์/เปรียบเทียบจากข้อเท็จจริงข้างต้น:',
    '- หากผู้ใช้ถามถึงผู้นำ/ผู้ใหญ่บ้าน/กำนัน/ตำรวจ ในหมู่บ้านหรือตำบลใดๆ (เช่น ผู้ใหญ่บ้านหมู่ 4, หมู่ 5) ให้ตรวจสอบรายชื่อใน Context และแสดงชื่อ-นามสกุล, ตำแหน่ง, หมู่, ตำบล และเบอร์โทรศัพท์ให้ครบถ้วนทุกคน',
    '- หากผู้ใช้ขอให้คำนวณสัดส่วนหรือเปอร์เซ็นต์ ให้แสดงจำนวนคนในกลุ่มนั้นๆ พร้อมรายชื่อและเบอร์โทร แล้วคำนวณ % เทียบกับยอดรวมให้ชัดเจน'
  );

  return lines.join('\n');
}

module.exports = {
  summarizePersonnel,
  formatPersonnelFacts,
  formatPersonnelFactsOrUnavailable,
  isPersonnelAnalysisQuestion,
  buildPersonnelAnalysisContext,
  summarizeLeaders,
  formatLeaderFacts,
  isAnalyticalQuestion,
  buildCombinedAnalysisContext,
};
