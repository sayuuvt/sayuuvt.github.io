const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const source = readFileSync(join(__dirname, '../torneios/admin/simulator.js'), 'utf8');

function harness() {
  const nodes = new Map();
  const create = () => ({
    textContent: '', children: [], handlers: {},
    reportValidity: () => true,
    addEventListener(k, f) { this.handlers[k] = f; },
    replaceChildren() { this.children = []; this.textContent = ''; },
    append(...xs) { this.children.push(...xs); }
  });
  const get = (k) => {
    if (!nodes.has(k)) nodes.set(k, create());
    return nodes.get(k);
  };
  const values = {participants:32, minutes:120, runs:100, 'first-to':2, base:100,
    'opponent-seed':30, 'opponent-rank':25, 'own-seed':30, 'random-seed':42};
  vm.runInNewContext(source, {document:{querySelector:get,createElement:create},
    FormData:class {get(k){return values[k];}},navigator:{clipboard:{writeText:async()=>{}}}});
  return {get,values};
}

test('laboratory emits backend CLI with duration in seconds', () => {
  const {get,values} = harness();
  assert.match(get('#command').textContent, /--participants 32/);
  assert.match(get('#command').textContent, /--duration 7200$/);
  values.minutes = 30;
  get('#config').handlers.submit({preventDefault(){}});
  assert.match(get('#command').textContent, /--duration 1800$/);
});

test('laboratory imports only valid numeric reports', async () => {
  const {get} = harness();
  const report = {runs:1,completed_matches:10,cancelled_matches:2,novel_fraction:.9,
    mean_queue_seconds:5,true_top8_recall:.75};
  const upload = async r => get('#report').handlers.change({target:{files:[{size:100,text:async()=>JSON.stringify(r)}]}});
  await upload(report);
  assert.equal(get('#metrics').children.length,6);
  await upload({...report,novel_fraction:2});
  assert.equal(get('#metrics').children.length,0);
  assert.match(get('#metrics').textContent,/Não foi possível/);
});
