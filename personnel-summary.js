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

// ลำดับชั้นยศจากสูงไปต่ำ (เพื่อเรียงแสดงผล)
const RANK_ORDER = [
  'พ.ต.อ.', 'พ.ต.ท.', 'พ.ต.ต.',
  'ร.ต.อ.', 'ร.ต.ท.', 'ร.ต.ต.',
  'ด.ต.', 'จ.ส.ต.', 'ส.ต.อ.', 'ส.ต.ท.', 'ส.ต.ต.',
];

function normalizeDepartment(value) {
  return String(value || '').replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ').trim();
}

function summarizePersonnel(personnel) {
  const records = Array.isArray(personnel) ? personnel.filter(Boolean) : [];
  const departmentCounts = new Map();
  const rankCounts = new Map();
  const positionCounts = new Map();
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

    // — นับตามยศ —
    const rank = normalizeDepartment(person.rank) || 'ไม่ระบุยศ';
    rankCounts.set(rank, (rankCounts.get(rank) || 0) + 1);

    // — นับตามตำแหน่ง —
    const position = normalizeDepartment(person.position) || 'ไม่ระบุตำแหน่ง';
    positionCounts.set(position, (positionCounts.get(position) || 0) + 1);
  }

  const orderedDepartments = [
    ...DEPARTMENT_ORDER.filter(department => departmentCounts.has(department)),
    ...[...departmentCounts.keys()]
      .filter(department => !DEPARTMENT_ORDER.includes(department))
      .sort((a, b) => a.localeCompare(b, 'th')),
  ].map(department => ({ department, count: departmentCounts.get(department) }));

  // เรียงยศตาม RANK_ORDER (สูง→ต่ำ) ที่เหลือเรียง alphabetical
  const orderedRanks = [
    ...RANK_ORDER.filter(r => rankCounts.has(r)),
    ...[...rankCounts.keys()]
      .filter(r => !RANK_ORDER.includes(r))
      .sort((a, b) => a.localeCompare(b, 'th')),
  ].map(rank => ({ rank, count: rankCounts.get(rank) }));

  // เรียงตำแหน่งจากมากไปน้อย
  const orderedPositions = [...positionCounts.entries()]
    .map(([position, count]) => ({ position, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalRecords: records.length,
    officerCount,
    traineeCount,
    departments: orderedDepartments,
    ranks: orderedRanks,
    positions: orderedPositions,
  };
}

function formatPersonnelFacts(summary) {
  const departmentLines = summary.departments.length > 0
    ? summary.departments.map(({ department, count }) => `- ${department}: ${count} คน`).join('\n')
    : '- ไม่มีข้อมูลฝ่าย/งาน';

  const rankLines = summary.ranks && summary.ranks.length > 0
    ? summary.ranks.map(({ rank, count }) => `- ${rank}: ${count} คน`).join('\n')
    : '- ไม่มีข้อมูลยศ';

  const positionLines = summary.positions && summary.positions.length > 0
    ? summary.positions.map(({ position, count }) => `- ${position}: ${count} คน`).join('\n')
    : '- ไม่มีข้อมูลตำแหน่ง';

  return [
    'ข้อมูลสรุปทำเนียบบุคลากรที่โปรแกรมคำนวณจากชีตจริง (ใช้เป็นข้อเท็จจริง):',
    `- บุคลากรทั้งหมดในชีต: ${summary.totalRecords} คน`,
    `- เจ้าหน้าที่ตำรวจ (ไม่รวมเด็กฝึกงาน): ${summary.officerCount} คน`,
    `- เด็กฝึกงาน: ${summary.traineeCount} คน`,
    '- จำนวนเจ้าหน้าที่แยกตามฝ่าย/งาน:',
    departmentLines,
    '- จำนวนเจ้าหน้าที่แยกตามชั้นยศ (สูงไปต่ำ):',
    rankLines,
    '- จำนวนเจ้าหน้าที่แยกตามตำแหน่ง (มากไปน้อย):',
    positionLines,
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
  const requestsAnalysis = /(วิเคราะห์|จำนวน|กี่คน|เท่าไร|มากที่สุด|น้อยที่สุด|เปรียบเทียบ|สัดส่วน|จัดกำลัง|กระจายกำลัง|นับ|รวม|เยอะกว่า|น้อยกว่า|มากกว่า|ครึ่ง|อัตราส่วน|สมดุล|ใน\s*100|สุ่ม)/u.test(text);
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
  // ขยาย pattern ให้รองรับภาษาพูด เช่น "เยอะกว่า", "ครึ่งหนึ่ง", "ใน 100 คน", "สุ่ม 1 คน" ฯลฯ
  const requestsAnalysis = /(วิเคราะห์|สรุป|จำนวน|กี่คน|กี่นาย|กี่ราย|เท่าไร|เท่าไหร่|มากที่สุด|น้อยที่สุด|เปรียบเทียบ|สัดส่วน|เปอร์เซ็นต์|%|คิดเป็น|แบ่งเป็น|จัดกำลัง|กระจายกำลัง|นับ|รวม|เยอะกว่า|น้อยกว่า|มากกว่า|ครึ่ง|อัตราส่วน|สมดุล|ใน\s*100|สุ่ม|ตรวจสอบ|ซ้ำ|ขาด|ไม่ครบ|ไม่มีเบอร์|ไม่มีข้อมูล|แยกตาม(?:ยศ|ชั้น|ตำแหน่ง|ฝ่าย|ตำบล|หมู่)|คาดการณ์|เพิ่มปีละ|กระจาย|จัดสรร)/u.test(text);
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

// ============================================================
//  ตรวจสอบคุณภาพข้อมูล (Data Quality)
// ============================================================

/**
 * ตรวจหาบุคลากรที่ข้อมูลไม่ครบ (ไม่มีเบอร์, ไม่มีตำแหน่ง, ไม่มีฝ่าย ฯลฯ)
 * @param {Array} personnel - รายชื่อบุคลากรตำรวจ
 * @param {Array} leaders   - รายชื่อผู้นำตำบล
 * @returns {{ personnelMissing: Array, leadersMissing: Array }}
 */
function findMissingData(personnel = [], leaders = []) {
  const personnelMissing = personnel
    .filter(p => p.area !== TRAINEE_DEPARTMENT) // ข้ามเด็กฝึกงาน
    .map(p => {
      const missing = [
        !p.phone    && 'เบอร์โทร',
        !p.position && 'ตำแหน่ง',
        !p.area     && 'ฝ่าย/งาน',
        !p.rank     && 'ยศ',
      ].filter(Boolean);
      return missing.length ? { name: p.fullName || `${p.firstName} ${p.lastName}`, missing } : null;
    })
    .filter(Boolean);

  const leadersMissing = leaders.map(l => {
    const missing = [
      !l.phone   && 'เบอร์โทร',
      !l.village && 'หมู่ที่',
      !l.area    && 'ตำบล',
    ].filter(Boolean);
    return missing.length ? { name: l.fullName || `${l.firstName} ${l.lastName}`, missing } : null;
  }).filter(Boolean);

  return { personnelMissing, leadersMissing };
}

/**
 * ตรวจหาข้อมูลซ้ำภายในกลุ่มเดียวกัน (ชื่อซ้ำ หรือเบอร์ซ้ำ)
 * @param {Array}    records  - รายชื่อที่ต้องการตรวจ
 * @param {Function} keyFn   - ฟังก์ชันดึง key ที่จะตรวจซ้ำ (default: เบอร์โทร)
 * @returns {Array<{ key: string, names: string[] }>}
 */
function findDuplicates(records = [], keyFn = r => (r.phone || '').replace(/[\s-]/g, '')) {
  const seen = new Map();
  for (const r of records) {
    const key = (keyFn(r) || '').trim();
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(r.fullName || `${r.firstName} ${r.lastName}`);
  }
  return [...seen.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([key, names]) => ({ key, names }));
}

/**
 * ตรวจหาบุคลากรที่ปรากฏในทั้งชีตบุคลากรตำรวจ และผู้นำตำบล (ชื่อ-นามสกุลตรงกัน)
 * @param {Array} personnel - รายชื่อบุคลากรตำรวจ
 * @param {Array} leaders   - รายชื่อผู้นำตำบล
 * @returns {Array<{ name: string, personnelRole: string, leaderRole: string }>}
 */
function findCrossSheetDuplicates(personnel = [], leaders = []) {
  const normalizeNameKey = r =>
    `${normalizeDepartment(r.firstName)}_${normalizeDepartment(r.lastName)}`;

  const leaderNameSet = new Map(
    leaders.map(l => [normalizeNameKey(l), l])
  );

  return personnel
    .filter(p => p.area !== TRAINEE_DEPARTMENT)
    .filter(p => leaderNameSet.has(normalizeNameKey(p)))
    .map(p => {
      const matchedLeader = leaderNameSet.get(normalizeNameKey(p));
      return {
        name: p.fullName || `${p.firstName} ${p.lastName}`,
        personnelRole: `${p.rank || ''} ${p.position || ''} ${p.area || ''}`.trim(),
        leaderRole: `${matchedLeader.position || ''} ${matchedLeader.area || ''} หมู่${matchedLeader.village || '-'}`.trim(),
      };
    });
}

/**
 * สร้างสรุปคุณภาพข้อมูลเป็น text สำหรับแนบใน AI context
 */
function formatDataQualityFacts(personnel = [], leaders = []) {
  const missing = findMissingData(personnel, leaders);
  const phoneDupPersonnel = findDuplicates(personnel);
  const phoneDupLeaders   = findDuplicates(leaders);
  const nameDupPersonnel  = findDuplicates(personnel, r => `${normalizeDepartment(r.firstName)}_${normalizeDepartment(r.lastName)}`);
  const crossDups         = findCrossSheetDuplicates(personnel, leaders);

  const lines = ['ข้อมูลตรวจสอบคุณภาพข้อมูล (Data Quality Check):'];

  // บุคลากรที่ข้อมูลขาด
  if (missing.personnelMissing.length > 0) {
    lines.push(`\n[ตำรวจที่ข้อมูลไม่ครบ: ${missing.personnelMissing.length} คน]`);
    missing.personnelMissing.forEach(({ name, missing: m }) => {
      lines.push(`- ${name}: ขาด ${m.join(', ')}`);
    });
  } else {
    lines.push('- ข้อมูลบุคลากรตำรวจครบถ้วนทุกคน ✅');
  }

  if (missing.leadersMissing.length > 0) {
    lines.push(`\n[ผู้นำตำบลที่ข้อมูลไม่ครบ: ${missing.leadersMissing.length} คน]`);
    missing.leadersMissing.forEach(({ name, missing: m }) => {
      lines.push(`- ${name}: ขาด ${m.join(', ')}`);
    });
  } else {
    lines.push('- ข้อมูลผู้นำตำบลครบถ้วนทุกคน ✅');
  }

  // เบอร์โทรซ้ำ
  if (phoneDupPersonnel.length > 0) {
    lines.push(`\n[เบอร์โทรตำรวจซ้ำ: ${phoneDupPersonnel.length} เบอร์]`);
    phoneDupPersonnel.forEach(({ key, names }) => {
      lines.push(`- เบอร์ ${key}: ${names.join(', ')}`);
    });
  }
  if (phoneDupLeaders.length > 0) {
    lines.push(`\n[เบอร์โทรผู้นำตำบลซ้ำ: ${phoneDupLeaders.length} เบอร์]`);
    phoneDupLeaders.forEach(({ key, names }) => {
      lines.push(`- เบอร์ ${key}: ${names.join(', ')}`);
    });
  }

  // ชื่อซ้ำในชีตเดียวกัน
  if (nameDupPersonnel.length > 0) {
    lines.push(`\n[ชื่อซ้ำในทำเนียบตำรวจ: ${nameDupPersonnel.length} รายการ]`);
    nameDupPersonnel.forEach(({ names }) => {
      lines.push(`- ${names.join(' / ')}`);
    });
  }

  // ซ้ำข้ามชีต
  if (crossDups.length > 0) {
    lines.push(`\n[บุคลากรที่ปรากฏในทั้งสองชีต: ${crossDups.length} คน]`);
    crossDups.forEach(({ name, personnelRole, leaderRole }) => {
      lines.push(`- ${name}: [ตำรวจ] ${personnelRole} / [ผู้นำตำบล] ${leaderRole}`);
    });
  }

  if (phoneDupPersonnel.length === 0 && phoneDupLeaders.length === 0 &&
      nameDupPersonnel.length === 0 && crossDups.length === 0) {
    lines.push('- ไม่พบข้อมูลซ้ำกันในระบบ ✅');
  }

  return lines.join('\n');
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

  const officerPct = grandTotal ? ((officerCount / grandTotal) * 100).toFixed(2) : null;
  const leaderPct  = grandTotal ? ((leaderCount  / grandTotal) * 100).toFixed(2) : null;

  const totalsLine = grandTotal !== null
    ? [
        `- รวมทั้งสองกลุ่ม (เจ้าหน้าที่ตำรวจ + ผู้นำตำบล): ${grandTotal} คน`,
        `  • เจ้าหน้าที่ตำรวจ: ${officerCount} คน (${officerPct}% ของทั้งหมด)`,
        `  • ผู้นำตำบล: ${leaderCount} คน (${leaderPct}% ของทั้งหมด)`,
        `  • กลุ่มที่มากกว่า: ${officerCount >= leaderCount ? 'ตำรวจ' : 'ผู้นำตำบล'} (มากกว่า ${Math.abs(officerCount - leaderCount)} คน หรือ ${Math.abs(officerCount - leaderCount) > 0 ? (Math.abs(officerCount - leaderCount) / Math.min(officerCount, leaderCount) * 100).toFixed(2) : '0.00'}%)`,
        `  • สูตรตรวจสอบ: (${officerCount} ÷ ${grandTotal}) × 100 = ${officerPct}% และ (${leaderCount} ÷ ${grandTotal}) × 100 = ${leaderPct}% รวมกัน = ${(parseFloat(officerPct) + parseFloat(leaderPct)).toFixed(2)}%`,
      ].join('\n')
    : null;

  const lines = [
    personnelFacts,
    '',
    leaderFacts,
    ...(totalsLine ? ['', totalsLine] : []),
  ];

  // แนบข้อมูลคุณภาพข้อมูล ถ้ามีรายชื่อจริงส่งมาด้วย
  if (extraContext.rawPersonnel && extraContext.rawLeaders) {
    const qualityFacts = formatDataQualityFacts(extraContext.rawPersonnel, extraContext.rawLeaders);
    lines.push('', qualityFacts);
  }

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
    'คำแนะนำการวิเคราะห์สำหรับ AI (อ่านอย่างละเอียด):',
    '- ใช้ตัวเลขในส่วน "ข้อเท็จจริง" ข้างต้นเป็นฐานในการตอบเท่านั้น ห้ามนับรายชื่อซ้ำ หรือสร้างตัวเลขขึ้นเอง',
    '- หากผู้ใช้ถามถึงผู้นำ/ผู้ใหญ่บ้าน/กำนัน/ตำรวจ ในหมู่บ้านหรือตำบลใดๆ ให้ตรวจสอบรายชื่อใน Context และแสดงชื่อ-นามสกุล, ตำแหน่ง, หมู่, ตำบล และเบอร์โทรศัพท์ให้ครบถ้วนทุกคน',
    '- หากผู้ใช้ขอคำนวณ% ให้แสดงสูตร: (จำนวน ÷ ยอดรวม) × 100 ด้วยเสมอ',
    '- หากถามว่าข้อมูลในอดีตหรือเดือนก่อนเป็นอย่างไร ให้แจ้งว่าระบบไม่มีข้อมูลประวัติ มีเฉพาะข้อมูลปัจจุบัน',
    '- หากถามว่าจะสร้างกราฟ ให้แจ้งว่า LINE ไม่รองรับกราฟโดยตรง และเสนอแสดงเป็นตาราง text แทน',
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
  // ── Data Quality ──
  findMissingData,
  findDuplicates,
  findCrossSheetDuplicates,
  formatDataQualityFacts,
};
