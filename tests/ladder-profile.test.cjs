const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../torneios/profile.js'), 'utf8');
test('profile preview does not call the local API from public Pages', async () => {
  const nodes = new Map();
  const get = k => { if (!nodes.has(k)) nodes.set(k, {addEventListener(){}}); return nodes.get(k); };
  let calls = 0;
  vm.runInNewContext(source, {
    location:{origin:'https://sayuuvt.github.io',search:'',pathname:'/torneios/perfil.html'},
    URLSearchParams,document:{querySelector:get},fetch(){calls++;throw new Error('unexpected request');}
  });
  assert.equal(get('#login').disabled,true);
  assert.equal(calls,0);
});
