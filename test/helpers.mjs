import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { main } from '../src/cli.mjs';
import { discoverContract } from '../src/contract.mjs';
import { parseTruthMap, authoritySnapshot } from '../src/truth.mjs';
import { attachWorktree } from '../src/worktree.mjs';
import { readRoute } from '../src/runtime.mjs';

export function git(cwd,args,{allowFailure=false}={}) {
  const result=spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true});
  if (!allowFailure && result.status!==0) throw new Error(result.stderr||result.stdout||`git exited ${result.status}`);
  return result;
}
export async function fixture(name='project',{gitRepo=true}={}) {
  const base=await mkdtemp(path.join(os.tmpdir(),`vibetether-${name}-`));
  const root=path.join(base,'project'); await mkdir(root,{recursive:true});
  const userHome=path.join(base,'home'); await mkdir(userHome,{recursive:true});
  process.env.VIBETETHER_STATE_HOME=path.join(base,'state');
  process.env.VIBETETHER_CACHE_HOME=path.join(base,'cache');
  process.env.VIBETETHER_CONFIG_HOME=path.join(base,'config');
  process.env.VIBETETHER_USER_HOME=userHome;
  if (gitRepo) {
    git(root,['init','-q']); git(root,['config','user.email','test@example.com']); git(root,['config','user.name','VibeTether Tests']);
    await writeFile(path.join(root,'app.txt'),'initial\n'); git(root,['add','app.txt']); git(root,['commit','-qm','initial']);
  }
  return {base,root,userHome,state:process.env.VIBETETHER_STATE_HOME,cache:process.env.VIBETETHER_CACHE_HOME,config:process.env.VIBETETHER_CONFIG_HOME};
}
export async function initProject(name='project',options={}) {
  const f=await fixture(name,options);
  await main(['init','--project',f.root,'--agent',options.agent??'codex','--goal',options.goal??'Keep the project aligned.','--success-evidence',options.success??'Focused and completion checks pass.','--confirmed','--yes','--json',...(options.controlMode?['--control-mode',options.controlMode]:[])]);
  return f;
}
export async function mainJson(args) { return JSON.parse(await main([...args,'--json'])); }
export async function jsonFile(target) { return JSON.parse(await readFile(target,'utf8')); }
export async function writeJson(target,value) { await mkdir(path.dirname(target),{recursive:true}); await writeFile(target,`${JSON.stringify(value,null,2)}\n`); }
export function cli(root,args,env={}) {
  return spawnSync(process.execPath,[path.join(root,'bin','vibetether.mjs'),...args],{encoding:'utf8',windowsHide:true,env:{...process.env,...env}});
}


export function testSuccessCheck(claim='Focused command passes.', artifact='vibetether-test-output.txt') {
  return {
    id: 'test-focused-check',
    claim,
    kind: 'command',
    command: [process.execPath,'-e',`const fs=require('node:fs');if(fs.readFileSync(${JSON.stringify(artifact)},'utf8')!=='verified\\n')process.exit(7)`],
    covers_paths: [artifact],
    consumer_paths: [artifact],
  };
}

export function successCheckCliArgs(claim='Focused command passes.', artifact='vibetether-test-output.txt') {
  return ['--success-check-json',JSON.stringify(testSuccessCheck(claim,artifact))];
}

export async function materializeSuccessCheck(root,check) {
  for (const relative of check.covers_paths??[]) {
    const target=path.join(root,...relative.split('/'));
    await mkdir(path.dirname(target),{recursive:true});
    await writeFile(target,'verified\n','utf8');
  }
}

export function routeProofOptions(route, artifact=(route.success_checks?.[0]?.covers_paths??[])[0]??'vibetether-test-output.txt') {
  const checkId=route.success_checks?.[0]?.id??'test-focused-check';
  return {
    output_proofs:(route.required_outputs??[]).map((output)=>({output,check_ids:[checkId],summary:`The focused check supports ${output}.`,artifact_paths:(output.includes('/')||/\.[a-z0-9]{1,12}$/i.test(output))?[artifact,output]:[artifact]})),
    exit_proofs:(route.exit_evidence??[]).map((criterion)=>({criterion,check_ids:[checkId],summary:'The predeclared focused check passed against the final product bytes.',artifact_paths:[artifact]})),
  };
}

export async function contractFinishOptions(root) {
  const context=await discoverContract(root);
  const authority=await authoritySnapshot(context.executionRoot,parseTruthMap(context.truthSource),context.intentSource);
  const runtime=await attachWorktree(context,authority.authority_digest);
  const route=await readRoute(runtime.paths);
  for (const check of route.success_checks??[]) await materializeSuccessCheck(root,check);
  for (const output of route.required_outputs??[]) {
    const pathLike=output.includes('/')||/\.[a-z0-9]{1,12}$/i.test(output);
    if (pathLike) {
      const target=path.join(root,...output.replace(/^\.\//,'').split('/'));
      await mkdir(path.dirname(target),{recursive:true});
      await writeFile(target,'# Verified output\n','utf8');
    }
  }
  return routeProofOptions(route);
}

export async function contractFinishArgs(root,{createPathOutputs=true}={}) {
  const context=await discoverContract(root);
  const authority=await authoritySnapshot(context.executionRoot,parseTruthMap(context.truthSource),context.intentSource);
  const runtime=await attachWorktree(context,authority.authority_digest);
  const route=await readRoute(runtime.paths);
  for (const check of route.success_checks??[]) await materializeSuccessCheck(root,check);
  const artifact=(route.success_checks?.[0]?.covers_paths??[])[0]??'vibetether-test-output.txt';
  const args=[];
  for (const output of route.required_outputs??[]) {
    const pathLike=output.includes('/')||/\.[a-z0-9]{1,12}$/i.test(output);
    if (pathLike&&createPathOutputs) {
      const target=path.join(root,...output.replace(/^\.\//,'').split('/'));
      await mkdir(path.dirname(target),{recursive:true});
      await writeFile(target,'# Verified output\n','utf8');
    }
    args.push('--output-proof-json',JSON.stringify({output,check_ids:[route.success_checks[0].id],summary:`The focused check supports ${output}.`,artifact_paths:pathLike?[artifact,output]:[artifact]}));
  }
  for (const criterion of route.exit_evidence??[]) args.push('--exit-proof-json',JSON.stringify({criterion,check_ids:[route.success_checks[0].id],summary:'The predeclared focused check passed against the final product bytes.',artifact_paths:[artifact]}));
  return args;
}


export function deepResolution(card) {
  const confirmationSource = 'user-message:test-approved-start-card';
  return {
    user_confirmation: {
      source: confirmationSource,
      summary: 'The user reviewed the exact bounded Start Card, selected its direction, and approved implementation of only that slice.',
    },
    facts_verified: (card.facts ?? []).map((fact) => ({
      fact,
      evidence: `Repository inspection and the focused baseline check established this fact before approval: ${fact}`,
      evidence_kind: 'repository-and-command',
      source_locator: 'test-fixture:repository-baseline',
    })),
    assumptions_resolved: (card.assumptions ?? []).map((assumption) => ({
      assumption,
      disposition: 'confirmed',
      rationale: `The user confirmed the required precondition and accepted its bounded effect for this slice: ${assumption}`,
      confirmation_source: confirmationSource,
    })),
    decisions_resolved: (card.decisions_needed ?? []).map((decision) => ({
      decision,
      resolution: `The user selected one bounded option and explicitly excluded unapproved alternatives for this slice: ${decision}`,
      confirmation_source: confirmationSource,
    })),
    success_evidence_confirmed: [...(card.success_evidence ?? [])],
    success_evidence_verifiers: (card.success_evidence ?? []).map((criterion) => ({
      criterion,
      verifier: `Run the predeclared focused real-consumer check against final product bytes and bind its receipt to this criterion: ${criterion}`,
    })),
    counterexample_challenge: {
      challenge: 'Could a materially different unapproved alternative satisfy the same outcome with less risk?',
      outcome: 'The reviewed alternative would change the approved direction, so the user retained the exact bounded Start Card.',
      evidence: 'The recorded user-confirmation source identifies the selected direction and the alternatives excluded from this slice.',
    },
  };
}
