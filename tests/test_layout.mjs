import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('mobile grid permits panels narrower than scrollable relationship graph',()=>{
 const css=readFileSync(new URL('../static/style.css',import.meta.url),'utf8');
 const mobile=css.slice(css.indexOf('@media(max-width:720px)'));
 assert.match(mobile,/\.workspace\{grid-template-columns:minmax\(0,1fr\)\}/);
 assert.match(mobile,/\.results-panel,\.inspector-panel\{min-width:0\}/);
});
