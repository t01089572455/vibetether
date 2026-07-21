import { discoverContract } from './contract.mjs';
import { loadProviderRegistry } from './provider-registry.mjs';
import { validateRoutes } from './routes.mjs';
import { brokerSkills } from './skill-broker.mjs';
import { loadProviderStats } from './runtime.mjs';
import { authoritySnapshot, parseTruthMap } from './truth.mjs';
import { attachWorktree } from './worktree.mjs';

export async function showCapabilities(options={}) {
  const registry=await loadProviderRegistry();
  if (!options.phase&&!options.capability) return {schema_version:1,capabilities:registry.capabilities.capabilities,provider_count:registry.providers.length};
  const context=await discoverContract(options.project??process.cwd());
  const routes=context.routes?validateRoutes(context.routes,registry.capabilities,registry.providers):null;
  const authority=await authoritySnapshot(context.executionRoot,parseTruthMap(context.truthSource),context.intentSource);
  const runtime=await attachWorktree(context,authority.authority_digest);
  const stats=await loadProviderStats(runtime.paths);
  return brokerSkills(registry,{phase:options.phase,capability:options.capability,signals:options.signals??[],agent:options.agent??'codex',provider:options.provider??null,permissions:options.permissions??{}},context.skills,routes,stats);
}
