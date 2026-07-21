#!/usr/bin/env node
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderGlobalDispatcher, renderProjectLauncher } from '../src/launcher.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ignored=new Set(['node_modules','coverage','.git','dist','build']);
const files=[];
async function walk(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    if(ignored.has(entry.name)) continue;
    const target=path.join(directory,entry.name);
    if(entry.isDirectory()) await walk(target);
    else if(entry.isFile()&&/\.(?:mjs|cjs|js)$/.test(entry.name)) files.push(target);
  }
}
await walk(root);
const temp=await mkdtemp(path.join(os.tmpdir(),'vibetether-generated-syntax-'));
const generated=[path.join(temp,'project-launcher.mjs'),path.join(temp,'global-dispatcher.mjs')];
await writeFile(generated[0],renderProjectLauncher());
await writeFile(generated[1],renderGlobalDispatcher());
files.push(...generated);
const failures=[];
for(const file of files.sort()){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8',windowsHide:true});
  if(result.status!==0) failures.push({file:path.relative(root,file),diagnostic:(result.stderr||result.stdout).trim()});
}
if(failures.length){
  for(const failure of failures) console.error(`Syntax failure: ${failure.file}\n${failure.diagnostic}`);
  process.exit(1);
}
console.log(`Syntax audit passed: ${files.length} JavaScript modules (including generated launchers).`);
