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

module.exports = {
  summarizePersonnel,
  formatPersonnelFacts,
  formatPersonnelFactsOrUnavailable,
  isPersonnelAnalysisQuestion,
  buildPersonnelAnalysisContext,
};
