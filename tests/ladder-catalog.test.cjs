const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../torneios/catalog.js'), 'utf8');
test('public catalog never connects to localhost on Pages', () => {
  let calls=0;
  vm.runInNewContext(source,{location:{origin:'https://sayuuvt.github.io'},fetch(){calls++;}});
  assert.equal(calls,0);
});
