#!/usr/bin/env node
// Manual sanity check for giaFiles.ts's detectFileSource() — pure regex
// logic, copied here to avoid pulling in the browser-only supabase client
// import that giaFiles.ts has at its top. Run: node tools/test-file-source-detect.mjs

const URL_RE = /https?:\/\/[^\s，,。]+/i;
const DRIVE_FILE_RE = /drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]{10,})/i;

function detectFileSource(text) {
  const driveMatch = text.match(DRIVE_FILE_RE);
  if (driveMatch) return { type: 'drive_file', ref: driveMatch[1] };
  const urlMatch = text.match(URL_RE);
  if (urlMatch) return { type: 'url', ref: urlMatch[0].replace(/[)\]}>,.;]+$/, '') };
  return null;
}

const cases = [
  { text: '把这个链接里的PDF存到公司资料 https://example.com/x.pdf', expect: { type: 'url', ref: 'https://example.com/x.pdf' } },
  { text: '把这个Google Drive文件登记一下 https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing', expect: { type: 'drive_file', ref: '1AbCdEfGhIjKlMnOp' } },
  { text: '这几个合同我这周要处理，帮我收好', expect: null },
  { text: '（链接在括号里 https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp）', expect: { type: 'drive_file', ref: '1AbCdEfGhIjKlMnOp' } },
];

let pass = 0;
for (const c of cases) {
  const got = detectFileSource(c.text);
  const ok = JSON.stringify(got) === JSON.stringify(c.expect);
  console.log(`[${ok ? 'PASS' : 'FAIL'}] "${c.text}" -> ${JSON.stringify(got)} (expected ${JSON.stringify(c.expect)})`);
  if (ok) pass++;
}
console.log(`\n${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
