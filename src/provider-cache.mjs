import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { conflictError } from './errors.mjs';
import {
  assertSafeId, atomicJson, boundedText, readJsonFile,
  rejectAbsoluteSymlinkChain, withFileLock,
} from './files.mjs';
import { cacheHome } from './paths.mjs';
import { validateProviderCard } from './provider-registry.mjs';
import { inspectProviderTree, materializeProviderClosure } from './provider-integrity.mjs';

export function providerObjectPath(objectHash) { return path.join(cacheHome(),'providers','objects',objectHash); }
export function providerCardPath(id) { return path.join(cacheHome(),'providers','cards',`${id}.json`); }
function providerLockPath(id) { return path.join(cacheHome(),'providers','locks',`${id}.lock`); }

function frontmatter(source) {
  const match=String(source).match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw conflictError('Provider SKILL.md requires YAML frontmatter.','INVALID_PROVIDER');
  const fields={};
  for (const line of match[1].split('\n')) {
    const item=line.match(/^([a-z_]+):\s*(.+)$/);
    if (item) fields[item[1]]=item[2].trim().replace(/^['"]|['"]$/g,'');
  }
  if (!fields.name||!fields.description) throw conflictError('Provider frontmatter requires name and description.','INVALID_PROVIDER');
  return fields;
}

export async function importProvider(options) {
  const id=assertSafeId(options.id,'Provider id');
  const source=await rejectAbsoluteSymlinkChain(path.resolve(options.source),{allowMissing:false});
  const skillSource=await readFile(path.join(source,'SKILL.md'),'utf8').catch(()=>null);
  if (!skillSource) throw conflictError('Provider source is missing SKILL.md.','INVALID_PROVIDER');
  const meta=frontmatter(skillSource);
  if (meta.name!==id) throw conflictError(`Provider id ${id} does not match SKILL.md name ${meta.name}.`,'INVALID_PROVIDER');
  const inspection=await inspectProviderTree(source);
  const fingerprint=inspection.digest;
  const objectPath=providerObjectPath(fingerprint);
  const resources=inspection.resources;
  const scripts=inspection.scripts;
  const capabilities=(options.capabilities??[]).map((item)=>assertSafeId(item,'Provider capability'));
  const phases=(options.phases??[]).map((item)=>String(item).toUpperCase());
  if (!capabilities.length||!phases.length) throw conflictError('Provider import requires at least one capability and phase.','INVALID_PROVIDER');
  const card=validateProviderCard({
    id,channel:'experimental',builtin:false,version:boundedText(options.version??'unversioned',100,'Provider version'),
    source:boundedText(options.source_label??source,500,'Provider source'),license:boundedText(options.license,100,'Provider license'),
    object_hash:fingerprint,fingerprint,capabilities,phases,
    positive_triggers:(options.positive_triggers??[]).map((item)=>String(item)),
    negative_triggers:(options.negative_triggers??[]).map((item)=>String(item)),
    hosts:options.hosts??['codex','claude'],operating_systems:options.operating_systems??['linux','darwin','win32'],
    permissions:{network:options.network===true,external_write:options.external_write===true,code_write:options.code_write===true},
    context_bytes:inspection.context_bytes,
    quality:{trigger_precision:0,trigger_recall:0,output_gain:0,evaluated_at:new Date(0).toISOString()},
    description:meta.description,path:objectPath,resources,scripts,
    worker_recommended:Buffer.byteLength(skillSource,'utf8')>12*1024,
    created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
  });
  await materializeProviderClosure({...card,resolved_path:source},objectPath);
  await mkdir(path.dirname(providerCardPath(id)),{recursive:true});
  return withFileLock(providerLockPath(id),async()=>{
    const prior=await readJsonFile(providerCardPath(id),'Provider card',{allowMissing:true});
    if (prior&&prior.object_hash!==fingerprint) throw conflictError(`Provider id already exists with different bytes: ${id}`,'FILE_COLLISION');
    await atomicJson(providerCardPath(id),card); return card;
  });
}

export async function readProviderCard(id) {
  assertSafeId(id,'Provider id');
  return validateProviderCard(await readJsonFile(providerCardPath(id),'Provider card'));
}

export async function updateProviderCard(id,mutator) {
  assertSafeId(id,'Provider id');
  return withFileLock(providerLockPath(id),async()=>{
    const prior=await readProviderCard(id);
    const next=validateProviderCard({...await mutator(structuredClone(prior)),updated_at:new Date().toISOString()});
    if (next.id!==prior.id||next.object_hash!==prior.object_hash||next.fingerprint!==prior.fingerprint) throw conflictError('Provider identity and content hashes are immutable.','INVALID_PROVIDER');
    await atomicJson(providerCardPath(id),next); return next;
  });
}
