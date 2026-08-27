const fs = require('fs');
const path = require('path');

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.ts') ? [path.join(d, e.name)] : [],
  );
}

const files = walk('src/experimental');
let n = 0;
for (const f of files) {
  let src = fs.readFileSync(f, 'utf8');
  // 修复 "from '../../'../xxx.js'" -> "from '../../xxx.js'"
  src = src.replace(/from\s+['"](\.\.\/){2}['"]?\.\.\//g, "from '../../");
  // 修复 "from '../xxx.js'"（原本一级引用但现在需要两级）-> 只处理仍存在的单级 ../ 指向 src 的
  fs.writeFileSync(f, src);
  n++;
}
console.log('fixed:', n);
