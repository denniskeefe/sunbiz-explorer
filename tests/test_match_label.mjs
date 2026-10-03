import test from 'node:test';
import assert from 'node:assert/strict';
import * as helpers from '../static/helpers.mjs';
test('candidate matching name is shown separately from entity name',()=>{
 assert.equal(typeof helpers.matchLabel,'function');
 assert.equal(helpers.matchLabel({name:'SMITH, JOHN',entity_name:'BUSINESS LLC'}),'Listed name: SMITH, JOHN');
 assert.equal(helpers.matchLabel({name:'BUSINESS LLC',entity_name:'BUSINESS LLC'}),'');
 assert.equal(helpers.matchLabel({entity_name:'BUSINESS LLC'}),'');
});
