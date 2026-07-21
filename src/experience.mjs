import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { EXPERIENCE_RECALL_MAX, EXPERIENCE_SCHEMA_VERSION, EXPERIENCE_STATES } from './constants.mjs';
import { conflictError } from './errors.mjs';
import {
  assertSafeId, atomicJson, boundedText, containsSecret, normalizeSignal, readRegularFileChunk,
  rejectSymlinkChain, resolveInside, safeRelative, sha256File,
} from './files.mjs';
import { loadEvidence } from './runtime.mjs';

const ENTRY_KEYS=new Set(['id','status','use_when','systems','artifacts','verified_at','review_after','revalidate_when','verification','environment','counterevidence','capture_class','summary','decisive_conditions','observed_sequence','reusability_reasons','source_route_id','evidence_ids']);
const VERIFICATION_KEYS=new Set(['authority_digest','skills_digest','evidence_ids']);
const ENVIRONMENT_KEYS=new Set(['os','node_major']);
const CAPTURE_CLASSES=new Set(['first-proven-path','recovered-path','changed-proven-path','repeat-proven-path','routine-non-path']);
const REUSABLE_SIGNALS=new Set(['first-proven-path','recovered-path','changed-proven-path','publication','publish','release','deployment','deploy','migration','authentication','external-service','incident-recovery','recovery','environment-setup','bootstrap','ci','windows-file-lock']);

function signals(value,label,{allowEmpty=false}={}) {
  if (!Array.isArray(value)||(!allowEmpty&&value.length===0)) throw conflictError(`${label} must be ${allowEmpty?'an':'a non-empty'} array.`,'INVALID_EXPERIENCE');
  const normalized=value.map(normalizeSignal);
  if (normalized.some((item)=>!item||!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(item))) throw conflictError(`${label} contains an invalid signal.`,'INVALID_EXPERIENCE');
  if (new Set(normalized).size!==normalized.length) throw conflictError(`${label} contains duplicate signals.`,'INVALID_EXPERIENCE');
  return normalized;
}
function boundedStringList(value, label, { allowEmpty = true, maxItems = 12, maxBytes = 500 } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > maxItems) {
    throw conflictError(`${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array with at most ${maxItems} entries.`, 'INVALID_EXPERIENCE');
  }
  const normalized = value.map((item) => boundedText(item, maxBytes, label));
  if (new Set(normalized).size !== normalized.length) throw conflictError(`${label} contains duplicate entries.`, 'INVALID_EXPERIENCE');
  return normalized;
}

function artifact(value) {
  if (!value||typeof value!=='object'||Array.isArray(value)) throw conflictError('Experience artifact must be an object.','INVALID_EXPERIENCE');
  const normalized={path:safeRelative(value.path,'Experience artifact path')};
  if (value.sha256!==null&&value.sha256!==undefined&&!/^[a-f0-9]{64}$/.test(value.sha256)) throw conflictError('Experience artifact sha256 is invalid.','INVALID_EXPERIENCE');
  normalized.sha256=value.sha256??null; return normalized;
}
function only(value,allowed,label) { for (const key of Object.keys(value)) if (!allowed.has(key)) throw conflictError(`${label} contains unsupported field: ${key}`,'INVALID_EXPERIENCE'); }

export function emptyExperienceIndex() { return {schema_version:EXPERIENCE_SCHEMA_VERSION,entries:[]}; }

export function validateExperienceIndex(value) {
  if (containsSecret(value)) throw conflictError('Experience index appears to contain a credential or private key.','SECRET_VALUE');
  if (!value||typeof value!=='object'||Array.isArray(value)||value.schema_version!==EXPERIENCE_SCHEMA_VERSION||!Array.isArray(value.entries)) throw conflictError(`Experience index requires schema_version ${EXPERIENCE_SCHEMA_VERSION} and entries array.`,'INVALID_EXPERIENCE');
  const ids=new Set();
  for (const entry of value.entries) {
    if (!entry||typeof entry!=='object'||Array.isArray(entry)) throw conflictError('Experience entry must be an object.','INVALID_EXPERIENCE');
    only(entry,ENTRY_KEYS,`Experience ${entry.id??''}`);
    assertSafeId(entry.id,'Experience id'); if (ids.has(entry.id)) throw conflictError(`Duplicate Experience id: ${entry.id}`,'INVALID_EXPERIENCE'); ids.add(entry.id);
    if (!EXPERIENCE_STATES.has(entry.status)) throw conflictError(`Experience ${entry.id} has invalid status.`,'INVALID_EXPERIENCE');
    entry.use_when=signals(entry.use_when,`Experience ${entry.id} use_when`);
    entry.systems=signals(entry.systems??[],`Experience ${entry.id} systems`,{allowEmpty:true});
    entry.revalidate_when=signals(entry.revalidate_when??[],`Experience ${entry.id} revalidate_when`,{allowEmpty:true});
    if (!Array.isArray(entry.artifacts)||(entry.status==='proven'&&!entry.artifacts.length)) throw conflictError(`Experience ${entry.id} ${entry.status==='proven'?'requires artifacts':'artifacts must be an array'}.`,'INVALID_EXPERIENCE');
    entry.artifacts=entry.artifacts.map(artifact);
    if (new Set(entry.artifacts.map((item)=>item.path)).size!==entry.artifacts.length) throw conflictError(`Experience ${entry.id} has duplicate artifacts.`,'INVALID_EXPERIENCE');
    if (entry.verified_at!==null&&entry.verified_at!==undefined&&!Number.isFinite(Date.parse(entry.verified_at))) throw conflictError(`Experience ${entry.id} verified_at is invalid.`,'INVALID_EXPERIENCE');
    if (entry.review_after!==null&&entry.review_after!==undefined&&!Number.isFinite(Date.parse(entry.review_after))) throw conflictError(`Experience ${entry.id} review_after is invalid.`,'INVALID_EXPERIENCE');
    if (entry.verified_at&&Date.parse(entry.verified_at)>Date.now()+5*60*1000) throw conflictError(`Experience ${entry.id} verified_at is in the future.`,'INVALID_EXPERIENCE');
    if (entry.verified_at&&entry.review_after&&Date.parse(entry.review_after)<=Date.parse(entry.verified_at)) throw conflictError(`Experience ${entry.id} review_after must follow verified_at.`,'INVALID_EXPERIENCE');
    if (!Array.isArray(entry.counterevidence??[])||(entry.counterevidence??[]).some((item)=>typeof item!=='string'||!item.trim()||Buffer.byteLength(item,'utf8')>500||containsSecret(item))) throw conflictError(`Experience ${entry.id} counterevidence is invalid.`,'INVALID_EXPERIENCE');
    if (entry.capture_class!==undefined&&entry.capture_class!==null&&!CAPTURE_CLASSES.has(entry.capture_class)) throw conflictError(`Experience ${entry.id} capture_class is invalid.`,'INVALID_EXPERIENCE');
    if (entry.summary!==undefined&&entry.summary!==null) entry.summary=boundedText(entry.summary,1000,`Experience ${entry.id} summary`);
    entry.decisive_conditions=signals(entry.decisive_conditions??[],`Experience ${entry.id} decisive_conditions`,{allowEmpty:true});
    entry.observed_sequence=boundedStringList(entry.observed_sequence??[],`Experience ${entry.id} observed_sequence`,{allowEmpty:true,maxItems:12,maxBytes:500});
    entry.reusability_reasons=boundedStringList(entry.reusability_reasons??[],`Experience ${entry.id} reusability_reasons`,{allowEmpty:true,maxItems:8,maxBytes:500});
    if (entry.source_route_id!==undefined&&entry.source_route_id!==null&&(typeof entry.source_route_id!=='string'||!/^route-[0-9a-f-]+$/.test(entry.source_route_id))) throw conflictError(`Experience ${entry.id} source_route_id is invalid.`,'INVALID_EXPERIENCE');
    if (!Array.isArray(entry.evidence_ids??[])||(entry.evidence_ids??[]).some((id)=>typeof id!=='string'||!/^ev-[0-9a-f-]+$/.test(id))) throw conflictError(`Experience ${entry.id} evidence_ids are invalid.`,'INVALID_EXPERIENCE');
    if (entry.status==='proven') {
      if (!entry.verification||typeof entry.verification!=='object'||Array.isArray(entry.verification)) throw conflictError(`Proven Experience ${entry.id} requires verification.`,'INVALID_EXPERIENCE');
      only(entry.verification,VERIFICATION_KEYS,`Experience ${entry.id} verification`);
      if (!/^[a-f0-9]{64}$/.test(entry.verification.authority_digest??'')||!/^[a-f0-9]{64}$/.test(entry.verification.skills_digest??'')||!Array.isArray(entry.verification.evidence_ids)||!entry.verification.evidence_ids.length||entry.verification.evidence_ids.some((id)=>typeof id!=='string'||!/^ev-[0-9a-f-]+$/.test(id))) throw conflictError(`Proven Experience ${entry.id} requires authority, skills, and evidence receipts.`,'INVALID_EXPERIENCE');
      if (!entry.environment||typeof entry.environment!=='object'||Array.isArray(entry.environment)) throw conflictError(`Proven Experience ${entry.id} requires environment.`,'INVALID_EXPERIENCE');
      only(entry.environment,ENVIRONMENT_KEYS,`Experience ${entry.id} environment`);
      if (typeof entry.environment.os!=='string'||!Number.isInteger(entry.environment.node_major)) throw conflictError(`Proven Experience ${entry.id} environment is invalid.`,'INVALID_EXPERIENCE');
      if (entry.artifacts.some((item)=>!item.sha256)) throw conflictError(`Proven Experience ${entry.id} requires artifact hashes.`,'INVALID_EXPERIENCE');
    }
  }
  return value;
}

async function inspectArtifact(context,item) {
  await rejectSymlinkChain(context.executionRoot,item.path,{allowMissing:true});
  const target=resolveInside(context.executionRoot,item.path,'Experience artifact');
  try {
    const metadata=await lstat(target);
    if (!metadata.isFile()||metadata.isSymbolicLink()) return {ok:false,reason:'artifact-not-regular'};
    const source=await readFile(target,'utf8').catch(()=>null);
    if (source!==null&&source.trim().length<20) return {ok:false,reason:'artifact-trivial'};
    const digest=await sha256File(target);
    return {ok:!item.sha256||digest===item.sha256,digest,reason:item.sha256&&digest!==item.sha256?'artifact-changed':null};
  } catch (error) { if (error.code==='ENOENT') return {ok:false,reason:'artifact-missing'}; throw error; }
}

export async function auditExperience(context,paths,index,{authorityDigest,skillsDigest,signals:activeSignals=[]}={}) {
  validateExperienceIndex(index);
  const active=new Set(activeSignals.map(normalizeSignal)); const health=[];
  for (const entry of index.entries) {
    const reasons=[];
    if (entry.status==='provisional') reasons.push('provisional');
    if (entry.status==='candidate') reasons.push('candidate');
    if (entry.status==='suspect') reasons.push('declared-suspect');
    if (entry.status==='proven') {
      for (const item of entry.artifacts) { const result=await inspectArtifact(context,item); if (!result.ok) reasons.push(result.reason); }
      if (entry.verification.authority_digest!==authorityDigest) reasons.push('authority-changed');
      if (entry.verification.skills_digest!==skillsDigest) reasons.push('skills-changed');
      if (entry.review_after&&Date.parse(entry.review_after)<Date.now()) reasons.push('review-expired');
      if (entry.environment.os!==process.platform) reasons.push('operating-system-changed');
      if (entry.environment.node_major!==Number(process.versions.node.split('.')[0])) reasons.push('node-major-changed');
      if ((entry.counterevidence??[]).length) reasons.push('counterevidence');
      for (const signal of entry.revalidate_when) if (active.has(signal)) reasons.push(signal);
      for (const evidenceId of entry.verification.evidence_ids) {
        try { const evidence=await loadEvidence(paths,evidenceId); if (!evidence.successful) reasons.push('evidence-failed'); }
        catch { reasons.push('evidence-missing'); }
      }
    }
    const effective=entry.status==='proven'&&reasons.length?'suspect':entry.status;
    health.push({id:entry.id,declared_status:entry.status,effective_status:effective,reasons:[...new Set(reasons)]});
  }
  await atomicJson(paths.experience_health,{schema_version:1,audited_at:new Date().toISOString(),entries:health});
  return health;
}

export async function recallExperience(context,paths,index,options) {
  const health=await auditExperience(context,paths,index,options); const status=new Map(health.map((item)=>[item.id,item]));
  const active=new Set((options.signals??[]).map(normalizeSignal));
  return index.entries
    .filter((entry)=>status.get(entry.id)?.effective_status==='proven')
    .map((entry)=>({entry,match_count:[...entry.use_when,...entry.systems].filter((signal)=>active.has(signal)).length}))
    .filter((item)=>item.match_count>0)
    .sort((a,b)=>b.match_count-a.match_count||String(b.entry.verified_at).localeCompare(String(a.entry.verified_at))||a.entry.id.localeCompare(b.entry.id))
    .slice(0,EXPERIENCE_RECALL_MAX)
    .map(({entry,match_count})=>({id:entry.id,status:'proven',match_count,artifacts:entry.artifacts.map((item)=>item.path),verified_at:entry.verified_at}));
}

export function createExperienceCandidate(index,{id,use_when,systems=[],artifacts,revalidate_when=[]}) {
  validateExperienceIndex(index); assertSafeId(id,'Experience id');
  if (index.entries.some((entry)=>entry.id===id)) throw conflictError(`Experience id already exists: ${id}`,'EXPERIENCE_DUPLICATE');
  if (!Array.isArray(artifacts)||!artifacts.length) throw conflictError('Experience candidate requires artifacts.','INVALID_EXPERIENCE');
  const entry={id,status:'candidate',use_when:signals(use_when,'Experience use_when'),systems:signals(systems,'Experience systems',{allowEmpty:true}),artifacts:artifacts.map((item)=>artifact({path:item,sha256:null})),verified_at:null,review_after:null,revalidate_when:signals(revalidate_when,'Experience revalidate_when',{allowEmpty:true}),verification:null,environment:null,counterevidence:[],capture_class:null,summary:null,decisive_conditions:[],source_route_id:null,evidence_ids:[]};
  return {...index,entries:[...index.entries,entry]};
}

export async function confirmExperience(context,paths,index,id,{authorityDigest,skillsDigest,evidenceIds,artifactPaths=[],reviewDays=90}) {
  validateExperienceIndex(index);
  const entry=index.entries.find((item)=>item.id===id);
  if (!entry||!['candidate','provisional','suspect'].includes(entry.status)) throw conflictError('Experience must be candidate, provisional, or suspect before confirmation.','EXPERIENCE_STATE');
  if (!Number.isInteger(reviewDays)||reviewDays<1||reviewDays>3650) throw conflictError('Experience reviewDays must be 1-3650.','INVALID_EXPERIENCE');
  const evidence=[];
  for (const evidenceId of evidenceIds??[]) {
    const record=await loadEvidence(paths,evidenceId);
    if (!record.successful||record.kind==='assertion') throw conflictError('Experience confirmation requires successful command or artifact evidence.','INVALID_EVIDENCE');
    if (record.authority_digest!==authorityDigest||record.skills_digest!==skillsDigest) throw conflictError('Experience evidence belongs to different authority or Skill configuration.','INVALID_EVIDENCE');
    evidence.push(evidenceId);
  }
  if (!evidence.length) throw conflictError('Experience confirmation requires evidence receipts.','INVALID_EVIDENCE');
  const sourceArtifacts=entry.artifacts.length?entry.artifacts:(artifactPaths??[]).map((item)=>artifact({path:item,sha256:null}));
  if (!sourceArtifacts.length) throw conflictError('Experience confirmation requires at least one durable artifact path.','INVALID_EXPERIENCE');
  const artifacts=[];
  for (const item of sourceArtifacts) {
    const inspected=await inspectArtifact(context,item);
    if (!inspected.ok&&inspected.reason) throw conflictError(`Experience artifact is not suitable for proof: ${item.path} (${inspected.reason})`,'INVALID_EXPERIENCE');
    artifacts.push({path:item.path,sha256:inspected.digest});
  }
  const now=new Date();
  const proven={...entry,status:'proven',artifacts,verified_at:now.toISOString(),review_after:new Date(now.getTime()+reviewDays*86400000).toISOString(),verification:{authority_digest:authorityDigest,skills_digest:skillsDigest,evidence_ids:[...new Set(evidence)]},environment:{os:process.platform,node_major:Number(process.versions.node.split('.')[0])},counterevidence:[]};
  return {...index,entries:index.entries.map((item)=>item.id===id?proven:item)};
}

export function updateExperienceStatus(index,id,status,reason=null) {
  validateExperienceIndex(index);
  if (!EXPERIENCE_STATES.has(status)||status==='proven') throw conflictError('Invalid Experience state transition; use confirm for proven.','EXPERIENCE_STATE');
  if (!index.entries.some((entry)=>entry.id===id)) throw conflictError(`Experience not found: ${id}`,'EXPERIENCE_NOT_FOUND');
  return {...index,entries:index.entries.map((entry)=>entry.id===id?{...entry,status,...(reason&&status==='suspect'?{counterevidence:[...(entry.counterevidence??[]),boundedText(reason,500,'Counterevidence')]}:{})}:entry)};
}
export function addExperienceCounterevidence(index,ids,reason) {
  validateExperienceIndex(index); const selected=new Set(ids??[]); if (!selected.size) return index;
  for (const id of selected) if (!index.entries.some((entry)=>entry.id===id)) throw conflictError(`Experience not found: ${id}`,'EXPERIENCE_NOT_FOUND');
  const text=boundedText(reason,500,'Experience counterevidence');
  return {...index,entries:index.entries.map((entry)=>selected.has(entry.id)?{...entry,status:['obsolete','quarantined'].includes(entry.status)?entry.status:'suspect',counterevidence:[...new Set([...(entry.counterevidence??[]),text])]}:entry)};
}


export function successCandidateArtifact(entry) {
  if (!entry || entry.status !== 'candidate' || !entry.id) throw conflictError('Success candidate artifact requires a candidate Experience entry.', 'INVALID_EXPERIENCE');
  const path = `docs/operations/vibetether-candidates/${entry.id}.md`;
  const lines = [
    `# VibeTether Proven Path Candidate: ${entry.id}`,
    '',
    'Status: candidate — non-authoritative until explicitly confirmed.',
    '',
    '## Use when',
    '',
    ...(entry.use_when ?? []).map((item) => `- ${item}`),
    '',
    '## Why this may be reusable',
    '',
    ...(entry.reusability_reasons ?? []).map((item) => `- ${item}`),
    '',
    '## Observed safe sequence',
    '',
    ...(entry.observed_sequence ?? []).map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Decisive conditions',
    '',
    ...((entry.decisive_conditions ?? []).length ? entry.decisive_conditions.map((item) => `- ${item}`) : ['- None recorded beyond the routed capability and evidence.']),
    '',
    '## Evidence references',
    '',
    ...(entry.evidence_ids ?? []).map((item) => `- ${item}`),
    '',
    '## Revalidation',
    '',
    '- Revalidate after authority, environment, Provider, artifact, or procedure changes.',
    '- Do not copy credentials, private reasoning, transcripts, or unbounded provider output into this candidate.',
    '',
  ];
  return { path, content: `${lines.join('\n')}\n` };
}

export async function readExperienceArtifact(context,index,id,position=0,options={}) {
  const entry=index.entries.find((item)=>item.id===id); if (!entry) throw conflictError(`Experience not found: ${id}`,'EXPERIENCE_NOT_FOUND');
  const item=entry.artifacts[position]; if (!item) throw conflictError('Experience artifact index is out of range.','EXPERIENCE_NOT_FOUND');
  const target=resolveInside(context.executionRoot,item.path,'Experience artifact'); await rejectSymlinkChain(context.executionRoot,item.path,{allowMissing:false});
  return {experience_id:id,path:item.path,...await readRegularFileChunk(target,options)};
}


const REUSABILITY_TEXT = /\b(?:order|sequence|flag|port|permission|version|lock|workaround|retry|credential|environment|env|authentication|authorization|token|migration|deploy|publish|release|recovery|bootstrap|ci|windows|macos|linux|multiple attempts|rediscover|costly)\b|顺序|参数|端口|权限|版本|锁|重试|凭据|环境|认证|鉴权|迁移|部署|发布|恢复|启动|多次尝试|重新发现|耗时/u;
const HIGH_VALUE_CAPABILITIES = new Set(['release','deployment','migration','authentication','external-service','recovery','environment-setup','bootstrap','ci','publication']);

function successCaptureAssessment(route, explicit = null) {
  const aliases = {
    first: 'first-proven-path', recovered: 'recovered-path', changed: 'changed-proven-path',
    repeat: 'repeat-proven-path', routine: 'routine-non-path', reusable: 'first-proven-path',
  };
  const active = new Set((route.signals ?? []).map(normalizeSignal));
  let automatic;
  if (active.has('recovered-path')) automatic = { classification: 'recovered-path', reasons: ['A previously failing workflow was recovered with fresh evidence.'], decisive_conditions: ['recovered-path'] };
  else if (active.has('changed-proven-path')) automatic = { classification: 'changed-proven-path', reasons: ['A known reusable workflow materially changed.'], decisive_conditions: ['changed-proven-path'] };
  else if (active.has('repeat-proven-path')) automatic = { classification: 'repeat-proven-path', reasons: ['An unchanged reusable workflow succeeded again.'], decisive_conditions: ['repeat-proven-path'] };
  else {
    const text = [route.capability, route.slice, ...(route.success_evidence ?? []), ...(route.required_outputs ?? []), ...(route.exit_evidence ?? [])].join(' ');
    const reusableSignals = [...active].filter((signal) => REUSABLE_SIGNALS.has(signal));
    const highValue = HIGH_VALUE_CAPABILITIES.has(normalizeSignal(route.capability)) || reusableSignals.length > 0;
    const nonObvious = REUSABILITY_TEXT.test(text);
    if (highValue || nonObvious) {
      const reasons = [];
      if (highValue) reasons.push('The verified workflow crosses a reusable operational, environment, authentication, recovery, migration, CI, deployment, publication, or release boundary.');
      if (nonObvious) reasons.push('The workflow contains a non-obvious condition whose rediscovery would be costly.');
      automatic = { classification: 'first-proven-path', reasons, decisive_conditions: [...reusableSignals, ...(nonObvious ? ['non-obvious-procedure'] : [])] };
    } else automatic = { classification: 'routine-non-path', reasons: ['The verified result is local or routine and does not justify durable experience.'], decisive_conditions: [] };
  }
  if (!explicit) return automatic;
  const requested = aliases[explicit] ?? explicit;
  if (!CAPTURE_CLASSES.has(requested)) throw conflictError(`Unsupported Success Capture classification: ${explicit}`, 'INVALID_EXPERIENCE');
  if (requested === 'routine-non-path') return { classification: requested, reasons: ['The controlled task explicitly classified the result as routine and non-reusable.'], decisive_conditions: [] };
  if (automatic.classification === 'routine-non-path') return automatic;
  if (requested === 'repeat-proven-path') return { ...automatic, classification: requested, reasons: [...automatic.reasons, 'The controlled task matched an existing reusable path.'] };
  return { ...automatic, classification: requested, reasons: [...automatic.reasons, 'The controlled task refined the reusable-path lifecycle classification without raising a routine result.'] };
}

export function classifySuccessCapture(route, explicit = null) {
  return successCaptureAssessment(route, explicit).classification;
}

function similarReusableEntry(index, route, useWhen) {
  return index.entries.find((entry) => {
    if (['obsolete','quarantined'].includes(entry.status)) return false;
    if (entry.source_route_id === route.id) return true;
    const signals = new Set(entry.use_when ?? []);
    const distinctive = useWhen.filter((signal) => REUSABLE_SIGNALS.has(signal) || signal !== normalizeSignal(route.capability));
    const overlap = distinctive.filter((signal) => signals.has(signal)).length;
    if (distinctive.length === 0) return false;
    return overlap >= Math.min(2, distinctive.length);
  });
}

export function captureSuccessCandidate(index, route, evidence, explicit = null) {
  validateExperienceIndex(index);
  const assessment = successCaptureAssessment(route, explicit);
  const classification = assessment.classification;
  if (classification === 'routine-non-path') return { index, disposition: classification, candidate_id: null };
  if (!evidence?.successful || evidence.kind === 'assertion') throw conflictError('Reusable Success Capture requires successful command or artifact evidence.', 'INVALID_EVIDENCE');
  const useWhen = [...new Set((route.signals ?? []).map(normalizeSignal).filter(Boolean))];
  const capabilitySignal = normalizeSignal(route.capability);
  if (capabilitySignal && !useWhen.includes(capabilitySignal)) useWhen.push(capabilitySignal);
  const existing = similarReusableEntry(index, route, useWhen);
  if (classification === 'repeat-proven-path' || existing) return { index, disposition: 'repeat-proven-path', candidate_id: existing?.id ?? null };
  const id = `capture-${route.id.replace(/^route-/, '')}`;
  const decisive = [...new Set([
    ...assessment.decisive_conditions,
    ...useWhen.filter((signal) => REUSABLE_SIGNALS.has(signal)),
  ])];
  const observedSequence = [
    `Selected ${route.provider?.id ?? 'the routed provider'} for capability ${route.capability}.`,
    `Executed the bounded slice: ${route.slice}`,
  ];
  if (Array.isArray(evidence.command) && evidence.command.length) observedSequence.push(`Ran the verified command: ${evidence.command.join(' ')}`);
  const coveredEvidenceArtifacts = (evidence.coverage_artifacts ?? [])
    .filter((item) => item?.present === true && typeof item.path === 'string' && /^[a-f0-9]{64}$/.test(item.sha256 ?? ''))
    .map((item) => ({ path: item.path, sha256: item.sha256 }));
  if (coveredEvidenceArtifacts.length) observedSequence.push(`Verified covered artifacts: ${coveredEvidenceArtifacts.map((item) => item.path).join(', ')}.`);
  observedSequence.push(`Bound the result to ${evidence.kind} evidence receipt ${evidence.id}.`);
  if ((route.required_outputs ?? []).length) observedSequence.push(`Validated required outputs: ${route.required_outputs.join(', ')}.`);
  const durableArtifacts = new Map();
  for (const item of [...(route.output_contract?.validated_artifacts ?? []), ...coveredEvidenceArtifacts]) {
    if (item?.path && /^[a-f0-9]{64}$/.test(item.sha256 ?? '')) durableArtifacts.set(item.path, { path: item.path, sha256: item.sha256 });
  }
  const entry = {
    id,
    status: 'candidate',
    use_when: useWhen,
    systems: [normalizeSignal(process.platform)],
    artifacts: [...durableArtifacts.values()],
    verified_at: null,
    review_after: null,
    revalidate_when: [],
    verification: null,
    environment: null,
    counterevidence: [],
    capture_class: classification,
    summary: boundedText(route.slice, 1000, 'Success Capture summary'),
    decisive_conditions: decisive,
    observed_sequence: observedSequence,
    reusability_reasons: assessment.reasons,
    source_route_id: route.id,
    evidence_ids: [evidence.id],
  };
  const next = { ...index, entries: [...index.entries, entry] };
  validateExperienceIndex(next);
  return { index: next, disposition: classification, candidate_id: id };
}
