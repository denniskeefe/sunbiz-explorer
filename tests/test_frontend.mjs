import test from 'node:test';
import assert from 'node:assert/strict';
const helpers = await import('../static/helpers.mjs').catch(() => ({}));
test('pagination deduplicates documents, never equal person or entity names', () => {
  assert.equal(typeof helpers.mergeResults, 'function');
  const a = {name:'Same',document_number:'A',url:'https://example.test/A'};
  const b = {name:'Same',document_number:'B',url:'https://example.test/B'};
  assert.deepEqual(helpers.mergeResults([a], [a,b]), [a,b]);
  assert.equal(helpers.mergeResults([], [{name:'Same',url:'https://example.test/1'},{name:'Same',url:'https://example.test/2'}]).length, 2);
});
test('network preserves separate person occurrences and evidence per entity', () => {
  assert.equal(typeof helpers.buildNetwork, 'function');
  const records = ['A','B'].map(document_number => ({document_number,name:'Entity',source_url:'https://example.test/'+document_number,registered_agent:{name:'Alex'},officers:[{name:'Alex',title:'P'},{name:'Alex',title:'MGR'}]}));
  const network = helpers.buildNetwork(records);
  assert.equal(network.nodes.length, 8);
  assert.equal(network.edges.length, 6);
  assert.equal(new Set(network.nodes.map(n=>n.id)).size, 8);
  assert.equal(network.nodes.filter(n=>n.kind==='person').length, 6);
  assert.ok(network.edges.every(e=>e.source_url.endsWith(e.entityKey)));
});
test('CSV quotes commas, newlines and quotes and neutralizes spreadsheet formulas', () => {
  assert.equal(typeof helpers.csvCell, 'function');
  assert.equal(helpers.csvCell('A, "B"\nC'), '"A, ""B""\nC"');
  assert.equal(helpers.csvCell('=1+1'), '"\'=1+1"');
  assert.equal(helpers.csvCell(null), '""');
});
test('safe external links accept only absolute HTTP(S) URLs', () => {
  assert.equal(typeof helpers.safeLink, 'function');
  assert.equal(helpers.safeLink('https://search.sunbiz.org/a?q=1'), 'https://search.sunbiz.org/a?q=1');
  for (const value of ['javascript:alert(1)', 'data:text/html,x', '/relative', '//evil.test', '', null, 'https://user:pass@evil.test']) assert.equal(helpers.safeLink(value), null);
});
