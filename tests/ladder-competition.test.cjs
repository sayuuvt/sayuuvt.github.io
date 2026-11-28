const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../torneios');
const source = fs.readFileSync(path.join(root, 'competition.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'perfil.html'), 'utf8');

test('competition script parses and all referenced element IDs exist', () => {
  assert.doesNotThrow(() => new vm.Script(source));
  for (const match of source.matchAll(/\$\("([a-z0-9-]+)"\)/g)) {
    assert.ok(html.includes('id="' + match[1] + '"'), 'Missing element ' + match[1]);
  }
});
test('competition does not start network polling on public preview', () => {
  const nodes = new Map();
  const get = key => { if (!nodes.has(key)) nodes.set(key, {addEventListener(){}}); return nodes.get(key); };
  let polls = 0, calls = 0;
  vm.runInNewContext(source, {
    local:false, document:{getElementById:get, addEventListener(){},querySelectorAll(){return [];}},
    setInterval(){polls++;}, request(){calls++;}
  });
  assert.equal(polls,0);
  assert.equal(calls,0);
});
