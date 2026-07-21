import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { conflictError } from './errors.mjs';
import {
  assertSafeId, atomicJson, boundedText, copyVerifiedDirectory, hashTree, readJsonFile,
  rejectAbsoluteSymlinkChain, safeRelative, withFileLock,
} from './files.mjs';
import { cacheHome } from './paths.mjs';
import { validateProviderCard } from './provider-registry.mjs';

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

async function discoverFiles(root) {
  const resources=[]; const scripts=[];
  async function walk(directory,prefix='') {
    const entries=await readdir(directory,{withFileTypes:true});
    for (const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
      const relative=prefix?`${prefix}/${entry.name}`:entry.name;
      const target=path.join(directory,entry.name);
      if (entry.isSymbolicLink()) throw conflictError(`Provider contains symbolic link: ${relative}`,'SYMLINK_PATH');
      if (entry.isDirectory()) await walk(target,relative);
      else if (entry.isFile()&&relative!=='SKILL.md') {
        if (relative.startsWith('scripts/')) scripts.push(relative); else resources.push(relative);
      } else if (!entry.isFile()) throw conflictError(`Provider contains unsupported file type: ${relative}`,'UNSAFE_PROVIDER');
    }
  }
  await walk(root); return {resources,scripts};
}

export async function importProvider(options) {
  const id=assertSafeId(options.id,'Provider id');
  const source=await rejectAbsoluteSymlinkChain(path.resolve(options.source),{allowMissing:false});
  const skillSource=await readFile(path.join(source,'SKILL.md'),'utf8').catch(()=>null);
  if (!skillSource) throw conflictError('Provider source is missing SKILL.md.','INVALID_PROVIDER');
  const meta=frontmatter(skillSource);
  if (meta.name!==id) throw conflictError(`Provider id ${id} does not match SKILL.md name ${meta.name}.`,'INVALID_PROVIDER');
  const fingerprint=await hashTree(source);
  const objectPath=providerObjectPath(fingerprint);
  await copyVerifiedDirectory(source,objectPath,fingerprint);
  const {resources,scripts}=await discoverFiles(objectPath);
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
    context_bytes:Buffer.byteLength(skillSource,'utf8'),
    quality:{trigger_precision:0,trigger_recall:0,output_gain:0,evaluated_at:new Date(0).toISOString()},
    description:meta.description,path:objectPath,resources,scripts,
    worker_recommended:Buffer.byteLength(skillSource,'utf8')>12*1024,
    created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
  });
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
