// Sanity test: every level 1..150 generates, is solvable (par found) and fast.
const fs = require('fs'), vm = require('vm'), path = require('path');
const dir = path.join(__dirname, '..', 'www', 'js');
const code = ['config', 'util', 'sim', 'levels'].map(f => fs.readFileSync(path.join(dir, f + '.js'), 'utf8')).join('\n') + '\nthis.genLevel = genLevel;';
const ctx = {}; vm.createContext(ctx); vm.runInContext(code, ctx);
let worst = 0, bad = 0;
for (let n = 1; n <= 150; n++) {
  const t = Date.now(), d = ctx.genLevel(n); const ms = Date.now() - t; worst = Math.max(worst, ms);
  if (!d.orbs.length || d.par < 1 || d.taps <= d.par) { bad++; console.log('BAD level', n, d.par, d.taps); }
}
console.log(bad ? 'FAIL' : 'OK', '150 levels; slowest', worst + 'ms');
process.exit(bad ? 1 : 0);
