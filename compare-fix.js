// 对比：修复前 vs 修复后，真实开发命令能不能跑
const OLD_RULES = [
  ['rm -rf*', 'ask'], ['sudo*', 'ask'], ['git push --force*', 'ask'], ['git push -f*', 'ask'],
  ['curl*|*sh', 'deny'], ['curl*|*bash', 'deny'], ['> /dev/sd*', 'deny'], ['mkfs*', 'deny'],
];

const NEW_RULES = [
  ['rm -rf*', 'ask'], ['rm -fr*', 'ask'], ['rm -Rf*', 'ask'], ['rm -fR*', 'ask'],
  ['rm -r -f*', 'ask'], ['rm -f -r*', 'ask'], ['rm --recursive*', 'ask'], ['rm --force*', 'ask'],
  ['sudo*', 'ask'], ['*/sudo *', 'ask'], ['su *', 'ask'], ['doas*', 'ask'], ['pkexec*', 'ask'],
  ['git push --force*', 'ask'], ['git push -f*', 'ask'], ['git reset --hard*', 'ask'], ['git clean -*', 'ask'],
  ['curl*|*sh', 'deny'], ['curl*|*bash', 'deny'], ['wget*|*sh', 'deny'], ['wget*|*bash', 'deny'],
  ['*> /dev/sd*', 'deny'], ['*> /dev/nvme*', 'deny'], ['*> /dev/hd*', 'deny'],
  ['*> /dev/mmcblk*', 'deny'], ['*> /dev/disk*', 'deny'],
  ['dd *', 'ask'], ['mkfs*', 'deny'], ['shred*', 'ask'],
  ['chmod -R 777*', 'ask'], ['chown -R*', 'ask'],
];

function match(pat, subject) {
  const src = pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + src + '$', 'i').test(subject);
}
function check(rules, subject) {
  const sorted = [...rules].sort((a, b) => b[0].length - a[0].length);
  for (const [p, l] of sorted) if (match(p, subject)) return l;
  return 'allow';
}

// 修复前：只检查首词 | 修复后：检查完整命令 + 各分段
const oldSubjects = (cmd) => cmd.replace(/[;&|`$()<>{}[\]]+/g, ' ').split(/\s+/).filter(Boolean).map(s => s.split(' ')[0]).filter(Boolean);
const newSubjects = (cmd) => {
  const out = new Set([cmd.trim()]);
  for (const seg of cmd.split(/[;&|\n]+/)) { if (seg.trim()) out.add(seg.trim()); }
  return [...out];
};
const rank = { deny: 3, ask: 2, allow: 1 };

function evaluate(cmd, rules, subjectFn) {
  let worst = 'allow';
  for (const s of subjectFn(cmd)) {
    const l = check(rules, s);
    if ((rank[l] ?? 0) > (rank[worst] ?? 0)) worst = l;
  }
  return worst;
}

// BashTool 遇 ask/deny 都会 throw —— 所以 ask 实际等于"被拦下"
const COMMANDS = [
  ['git status', '日常'], ['git log --oneline -5', '日常'], ['npm test', '日常'],
  ['npm run build && npm test', '日常'], ['npx tsc --noEmit', '日常'],
  ['git log | head -20', '管道'], ['ls -la | grep node_modules', '管道'],
  ['cat package.json > /dev/null', '重定向'],
  ['git reset --hard HEAD~1', '常用 git'], ['git clean -fd', '常用 git'],
  ['git checkout -b feature', '常用 git'], ['git stash pop', '常用 git'],
  ['rm -rf node_modules', '清理'], ['rm -rf dist', '清理'],
  ['chmod -R 755 ./scripts', '权限'], ['chown -R node:node /app', '容器'],
  ['dd if=/dev/zero of=./test.img bs=1M count=10', '测试用 dd'],
  ['find . -name "*.log" -delete', '清理'],
];

console.log('命令'.padEnd(48) + '| 修复前   | 修复后   | 变化');
console.log('-'.repeat(82));
let broke = 0, fixed = 0;
for (const [cmd, tag] of COMMANDS) {
  const before = evaluate(cmd, OLD_RULES, oldSubjects);
  const after = evaluate(cmd, NEW_RULES, newSubjects);
  const b = before === 'allow' ? '✅通过' : '❌拦下';
  const a = after === 'allow' ? '✅通过' : '❌拦下';
  let delta = '';
  if (before === 'allow' && after !== 'allow') { delta = '⚠️ 新被拦'; broke++; }
  else if (before !== 'allow' && after === 'allow') { delta = '✅ 新放行'; fixed++; }
  else if (before !== 'allow' && after !== 'allow' && rank[after] > rank[before]) { delta = '🔒 更严'; }
  console.log(cmd.padEnd(48) + '| ' + b + ' | ' + a + ' | ' + delta);
}
console.log('\n新增拦截(可用性下降): ' + broke + ' 条');
console.log('新增放行(安全性提升): ' + fixed + ' 条');
