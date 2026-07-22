#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/constants.mjs';
import { loadProviderRegistry } from '../src/provider-registry.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
const packageJson=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
if(packageJson.version!==VERSION) failures.push(`package.json version ${packageJson.version} differs from runtime ${VERSION}`);
if(packageJson.dependencies&&Object.keys(packageJson.dependencies).length) failures.push('Runtime dependencies must remain empty.');
const required=['README.md','CHANGELOG.md','CONTRIBUTING.md','SECURITY.md','THIRD_PARTY_NOTICES.md','LICENSE','docs/architecture/0001-lean-control-kernel.md','docs/design/VIBETETHER-BEGINNER-AND-CAPABILITY-CONTRACT.md','docs/design/VIBETETHER-COMPATIBILITY-AND-DATA-CONTRACT.md','docs/verification.md','skills/vibe-tether/SKILL.md','skills/vibe-tether-deep/SKILL.md','registry/community-provenance.json','.gitattributes','.github/workflows/ci.yml','scripts/test-package-journey.mjs','scripts/test-live-v063-migration.mjs','scripts/sync-provider-integrity.mjs'];
for(const relative of required){try{const st=await lstat(path.join(root,relative));if(!st.isFile())failures.push(`${relative} is not a file`);}catch{failures.push(`${relative} is missing`);}}

const registry=await loadProviderRegistry();
const ids=new Set(registry.providers.map((item)=>item.id));
for(const capability of registry.capabilities.capabilities){
  const fallback=registry.providers.find((item)=>item.id===capability.fallback);
  if(!fallback||!fallback.builtin||!fallback.id.startsWith('vibetether-built-in-')) failures.push(`Capability ${capability.id} lacks a built-in fallback`);
}
for(const provider of registry.providers){
  if(!provider.fingerprint||!/^[a-f0-9]{64}$/.test(provider.fingerprint)) failures.push(`Provider ${provider.id} lacks a verified fingerprint`);
  if(provider.object_hash!==provider.fingerprint) failures.push(`Provider ${provider.id} expected identity fields disagree`);
  if(provider.observed_content_sha256!==provider.fingerprint) failures.push(`Provider ${provider.id} observed bytes differ from the immutable release digest`);
  if(Date.parse(provider.quality.evaluated_at)>Date.now()+300000) failures.push(`Provider ${provider.id} has a future evaluation date`);
}
if(!ids.has('vibetether-built-in-alignment')) failures.push('Core alignment Provider is missing.');

// Project-authored acquisition instructions must not follow a floating main ref.
for(const relative of ['src','bin','skills/vibe-tether','docs','README.md']){
  async function scan(target){
    const st=await lstat(target);
    if(st.isDirectory()){
      for(const entry of await readdir(target,{withFileTypes:true})) await scan(path.join(target,entry.name));
    }else if(/\.(?:mjs|json|md)$/.test(target)){
      const source=await readFile(target,'utf8');
      if(source.includes('tar.gz/refs/heads/main')) failures.push(`Floating main acquisition URL in ${path.relative(root,target)}`);
    }
  }
  await scan(path.join(root,relative));
}

const provenance=JSON.parse(await readFile(path.join(root,'registry/community-provenance.json'),'utf8'));
if(provenance.schema_version!==1||!Array.isArray(provenance.sources)) failures.push('Community provenance registry is invalid.');
for(const source of provenance.sources??[]){
  if(!/^[a-f0-9]{40}$/.test(source.resolved_commit??'')) failures.push(`Source ${source.id} lacks an immutable commit`);
  if(typeof source.requested_ref!=='string'||!source.requested_ref) failures.push(`Source ${source.id} lacks requested_ref`);
  if(!source.license_evidence||typeof source.license_evidence.mode!=='string') failures.push(`Source ${source.id} lacks license evidence`);
  if(source.license_evidence.mode==='full-text'){
    const licensePath=path.join(root,'registry/licenses',`${source.id}.LICENSE.txt`);
    try{
      const bytes=await readFile(licensePath);
      const digest=createHash('sha256').update(bytes).digest('hex');
      if(digest!==source.license_evidence.sha256) failures.push(`License digest mismatch for ${source.id}`);
    }catch{failures.push(`Full license text missing for ${source.id}`);}
  }else if(source.license_evidence.mode==='readme-declaration'){
    if(!source.license_evidence.declaration) failures.push(`README license declaration missing for ${source.id}`);
    if(source.redistribution_status!=='metadata-only-not-redistributed'||source.packaged_content!==false) failures.push(`Declaration-only source ${source.id} must remain metadata-only and must not be redistributed`);
    const evidenceFile=source.license_evidence.evidence_file;
    if(typeof evidenceFile!=='string'||!evidenceFile.startsWith('registry/licenses/')) failures.push(`Declaration evidence file missing for ${source.id}`);
    else {
      try {
        const bytes=await readFile(path.join(root,evidenceFile));
        const digest=createHash('sha256').update(bytes).digest('hex');
        if(digest!==source.license_evidence.evidence_file_sha256) failures.push(`Declaration evidence digest mismatch for ${source.id}`);
      } catch { failures.push(`Declaration evidence file cannot be read for ${source.id}`); }
    }
  }
}


const metadataOnlySources=new Map((provenance.sources??[])
  .filter((source)=>source.redistribution_status==='metadata-only-not-redistributed')
  .map((source)=>[source.repository.replace(/\.git$/,''),source.id]));
for(const provider of registry.providers){
  for(const [repository,sourceId] of metadataOnlySources){
    if(String(provider.source).includes(repository)) failures.push(`Metadata-only source ${sourceId} is still redistributed by Provider ${provider.id}`);
  }
}

const community=registry.providers.filter((p)=>p.resolved_path.includes(`${path.sep}registry${path.sep}community${path.sep}`));
if(community.length<30) failures.push(`Expected rich cold community inventory, found ${community.length}`);
const packs=new Set(community.flatMap((p)=>p.packs));
for(const pack of ['standard','extended','web','production']) if(!packs.has(pack)) failures.push(`Provider pack missing: ${pack}`);

if(failures.length){for(const item of failures)console.error(`Release audit: ${item}`);process.exit(1);}
console.log(`Release audit passed for VibeTether ${VERSION}: ${registry.providers.length} verified Providers, ${registry.capabilities.capabilities.length} capabilities, ${provenance.sources.length} pinned community sources.`);
