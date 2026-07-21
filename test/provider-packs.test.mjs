import assert from 'node:assert/strict';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { main } from '../src/cli.mjs';
import { discoverContract, createSkillsLock } from '../src/contract.mjs';
import { loadProviderRegistry } from '../src/provider-registry.mjs';
import { brokerSkills } from '../src/skill-broker.mjs';
import { fixture } from './helpers.mjs';

test('default initialization enables the cold standard pack without copying Provider assets into the project', async()=>{
  const {root}=await fixture('provider-standard');
  await main(['init','--project',root,'--agent','codex','--goal','Diagnose problems safely.','--success-evidence','Root cause and regression evidence exist.','--confirmed','--yes']);
  const context=await discoverContract(root);
  assert.deepEqual(context.skills.packs,['standard']);
  await assert.rejects(lstat(path.join(root,'.vibetether','providers')),/ENOENT/);
  const registry=await loadProviderRegistry();
  const result=brokerSkills(registry,{phase:'DIAGNOSE',capability:'debugging',signals:['runtime-failure'],agent:'codex',permissions:{network:false,external_write:false,code_write:false}},context.skills);
  assert.equal(result.selected.id,'superpowers-systematic-debugging');
  assert.ok(result.shortlist.some((item)=>item.id==='vibetether-built-in-debugging'));
});

test('extended, web, and production packs are selected explicitly and remain cold', async()=>{
  const {root}=await fixture('provider-all-packs');
  await main(['init','--project',root,'--agent','both','--profile','extended','--bundle','web','--bundle','production','--goal','Build and verify a web product.','--success-evidence','Current functional and release evidence pass.','--confirmed','--yes']);
  const context=await discoverContract(root);
  assert.deepEqual(context.skills.packs,['standard','extended','web','production']);
  const registry=await loadProviderRegistry();
  assert.ok(registry.providers.some((provider)=>provider.packs.includes('extended')));
  assert.ok(registry.providers.some((provider)=>provider.packs.includes('web')));
  assert.ok(registry.providers.some((provider)=>provider.packs.includes('production')));
  await assert.rejects(lstat(path.join(root,'.vibetether','providers')),/ENOENT/);
});

test('core profile routes only through built-in fallbacks', async()=>{
  const registry=await loadProviderRegistry();
  const result=brokerSkills(registry,{phase:'DIAGNOSE',capability:'debugging',signals:['runtime-failure'],agent:'codex',permissions:{network:false,external_write:false,code_write:false}},createSkillsLock({packs:[]}));
  assert.equal(result.selected.id,'vibetether-built-in-debugging');
});
