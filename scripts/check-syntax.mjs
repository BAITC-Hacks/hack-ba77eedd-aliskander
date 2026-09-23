import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Script } from 'node:vm';
for(const directory of ['src','public','scripts'])for(const name of readdirSync(directory)){
  if(/\.(?:cjs|mjs|js)$/.test(name)){
    const result=spawnSync(process.execPath,['--check',`${directory}/${name}`],{stdio:'inherit'});
    if(result.status!==0)process.exit(result.status||1);
  }else if(name.endsWith('.html')){
    const html=readFileSync(`${directory}/${name}`,'utf8');
    for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(match[1].trim())new Script(match[1],{filename:name});
  }
}
console.log('JavaScript and inline prototype scripts: syntax OK');
