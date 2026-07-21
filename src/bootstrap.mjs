import { conflictError } from './errors.mjs';
import { discoverContract } from './contract.mjs';
import { renderIntent, parseIntent } from './intent.mjs';
import { writeProjectText } from './files.mjs';
import { authoritySnapshot, parseTruthMap } from './truth.mjs';
import { attachWorktree } from './worktree.mjs';
import { readRoute, writeCurrentProjection } from './runtime.mjs';

export async function bootstrap(options={}) {
  const context=await discoverContract(options.project??process.cwd());
  const prior=parseIntent(context.intentSource);
  const next=renderIntent({status:options.confirmed?'confirmed':prior.status,goal:options.goal??prior.goal,success_evidence:options.success_evidence??prior.success_evidence,scope_boundaries:options.scope_boundaries?.length?options.scope_boundaries:prior.scope_boundaries,constraints:options.constraints?.length?options.constraints:prior.constraints});
  if (options.dry_run) return {status:'preview',before:context.intentSource,after:next};
  if (!options.yes) throw conflictError('Bootstrap requires --yes or --dry-run.','CONFIRMATION_REQUIRED');
  const truth=parseTruthMap(context.truthSource);
  const before=await authoritySnapshot(context.executionRoot,truth,context.intentSource);
  const runtime=await attachWorktree(context,before.authority_digest);
  const route=await readRoute(runtime.paths,{allowMissing:true}); if (route?.status==='active') throw conflictError('Intent cannot change while a step is active.','ACTIVE_STEP');
  await writeProjectText(context.root,context.manifest.intent,next);
  try {
    const after=await authoritySnapshot(context.executionRoot,truth,next);
    const current=runtime.current; current.authority_digest=after.authority_digest; current.updated_at=new Date().toISOString(); current.status='ready'; current.open_risks=[]; current.next_action=options.confirmed?'Choose the next bounded phase and slice.':'Confirm the Intent Contract before consequential work.';
    await writeCurrentProjection(runtime.paths,current);
    return {status:'updated',intent:parseIntent(next),authority_digest:after.authority_digest};
  } catch (error) { await writeProjectText(context.root,context.manifest.intent,context.intentSource).catch(()=>{}); throw error; }
}
