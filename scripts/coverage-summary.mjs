import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('cov-full.json', 'utf8'));
const map = data.coverageMap;

function objLen(o) {
  return Object.keys(o).length;
}

function countBranches(c) {
  const b = c.branchMap;
  if (!b) return { branches: 0, hit: 0 };
  let branches = 0;
  let hit = 0;
  for (const [key, bm] of Object.entries(b)) {
    const locs = Array.isArray(bm.locations) ? bm.locations.length : 1;
    const counts = c.b[key] || [];
    for (let i = 0; i < locs; i++) {
      branches++;
      if (counts[i] > 0) hit++;
    }
  }
  return { branches, hit };
}

const rows = [];
for (const [file, c] of Object.entries(map)) {
  const stmts = objLen(c.statementMap);
  const stmtsHit = Object.values(c.s).filter((v) => v > 0).length;
  const fns = objLen(c.fnMap);
  const fnsHit = Object.values(c.f).filter((v) => v > 0).length;
  const { branches, hit: brHit } = countBranches(c);
  rows.push({
    file: file.replace(/\\/g, '/').replace('C:/Users/Ehua/codeyang/', ''),
    stmts,
    stmtsHit,
    stmtsPct: stmts ? Math.round((100 * stmtsHit) / stmts) : 0,
    fns,
    fnsHit,
    fnsPct: fns ? Math.round((100 * fnsHit) / fns) : 0,
    branches,
    brHit,
  });
}

// Totals over included set
const tot = rows.reduce(
  (a, r) => ({
    s: a.s + r.stmts,
    sh: a.sh + r.stmtsHit,
    f: a.f + r.fns,
    fh: a.fh + r.fnsHit,
    b: a.b + r.branches,
    bh: a.bh + r.brHit,
  }),
  { s: 0, sh: 0, f: 0, fh: 0, b: 0, bh: 0 },
);
console.log('=== GLOBAL ===');
console.log(
  `statements: ${Math.round((100 * tot.sh) / tot.s)}% (${tot.sh}/${tot.s})  functions: ${Math.round((100 * tot.fh) / tot.f)}% (${tot.fh}/${tot.f})  branches: ${Math.round((100 * tot.bh) / tot.b)}% (${tot.bh}/${tot.b})`,
);

// Group by top-level dir
const byDir = {};
for (const r of rows) {
  const dir = r.file.split('/')[1] ?? 'root';
  if (!byDir[dir]) byDir[dir] = { s: 0, sh: 0, f: 0, fh: 0 };
  byDir[dir].s += r.stmts;
  byDir[dir].sh += r.stmtsHit;
  byDir[dir].f += r.fns;
  byDir[dir].fh += r.fnsHit;
}
console.log('\n=== BY DIRECTORY ===');
for (const [dir, t] of Object.entries(byDir).sort((a, b) => (100 * a[1].sh) / a[1].s - (100 * b[1].sh) / b[1].s)) {
  console.log(
    `${dir.padEnd(20)} stmts ${String(Math.round((100 * t.sh) / t.s)).padStart(3)}% (${String(t.sh).padStart(4)}/${String(t.s).padStart(4)})  fns ${String(Math.round((100 * t.fh) / t.f)).padStart(3)}%`,
  );
}

console.log('\n=== LOWEST BRANCH COVERAGE (top 40, stmts>0) ===');
rows
  .filter((r) => r.branches > 0)
  .sort((a, b) => a.brHit / a.branches - b.brHit / b.branches)
  .slice(0, 40)
  .forEach((r) =>
    console.log(
      `${String(Math.round((100 * r.brHit) / r.branches)).padStart(3)}%  ${String(r.brHit).padStart(4)}/${String(r.branches).padStart(4)} br  |  stmts ${String(r.stmtsPct).padStart(3)}%  ${r.file}`,
    ),
  );

console.log('\n=== LOWEST 40 FILES ===');
rows
  .filter((r) => r.stmts > 0)
  .sort((a, b) => a.stmtsPct - b.stmtsPct)
  .slice(0, 40)
  .forEach((r) =>
    console.log(
      `${String(r.stmtsPct).padStart(3)}%  ${String(r.stmtsHit).padStart(4)}/${String(r.stmts).padStart(4)}  ${r.file}`,
    ),
  );
