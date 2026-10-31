// Closed owner-reviewed profile for the built-in update-only launcher.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {object,need,read,digest,regular,canonical,sha,entire,hash} from './change-support.mjs';
import {validateQualificationReports,requiredReports} from './qualification-proof.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
export const launcherCases=['actual-cli-update','protected-operations','aliases','original-git-factory-verifier','credentials-network','trace-escape','descendant-cleanup','interruption','relay-loss','failed-acceptance','stale-evidence'];
export function executionProfileHash(p){return hash(JSON.stringify({docker:p.docker,runnerImage:p.runnerImage,broker:p.broker,verifier:p.verifier}));}
function closedTree(root){function walk(file){const st=fs.lstatSync(file);if(st.isSymbolicLink()){const target=fs.realpathSync(file);need(target===root||target.startsWith(root+path.sep),'TRUST_INVALID','External runtime dependency alias');}else if(st.isDirectory()){for(const n of fs.readdirSync(file))walk(path.join(file,n));}else need(st.isFile(),'TRUST_INVALID','Special runtime dependency');}walk(root);}
export function loadRealProfile(runner){
 need(runner.argv.length===4&&fs.realpathSync(runner.argv[0])===fs.realpathSync(process.execPath)&&runner.argv[1]===path.join(here,'real-launcher.mjs')&&runner.argv[2]==='--profile','TOOLING_UNAVAILABLE','Unsupported real launcher');
 const profilePath=canonical(runner.argv[3]);regular(profilePath,'TOOLING_UNAVAILABLE');
 const declared=new Map(runner.inputs.map(x=>[x.path,x.sha256]));
 need(declared.get(profilePath)===digest(profilePath),'TRUST_INVALID','Undeclared launcher profile');
 const p=read(profilePath);object(p,['schemaVersion','enabled','docker','runnerImage','broker','verifier','qualification']);
 need(p.schemaVersion===1&&p.enabled===true&&runner.network==='model-proxy','TOOLING_UNAVAILABLE','Reviewed model-proxy profile is not enabled');
 object(p.docker,['path','sha256','endpoint']);regular(p.docker.path,'TOOLING_UNAVAILABLE');sha(p.docker.sha256);
 need(digest(p.docker.path)===p.docker.sha256&&declared.get(p.docker.path)===p.docker.sha256,'TRUST_INVALID','Docker executable not bound');
 need(typeof p.docker.endpoint==='string'&&p.docker.endpoint.startsWith('unix:///')&&!p.docker.endpoint.includes('\0'),'REQUEST_INVALID','Local Docker endpoint required');
 need(/^sha256:[a-f0-9]{64}$/.test(p.runnerImage),'REQUEST_INVALID','Immutable runner image required');
 object(p.broker,['region','profile','model','sdkRoot','sdkSha256']);sha(p.broker.sdkSha256);
 need(typeof p.broker.region==='string'&&typeof p.broker.profile==='string'&&typeof p.broker.model==='string','REQUEST_INVALID','Explicit broker identifiers required');
 need(p.broker.sdkRoot===path.join(here,'aws/node_modules')&&entire(p.broker.sdkRoot)===p.broker.sdkSha256,'TRUST_INVALID','Provisioned SDK changed');
 closedTree(p.broker.sdkRoot);
 object(p.verifier,['image','resources','dependencies']);need(/^sha256:[a-f0-9]{64}$/.test(p.verifier.image)&&Array.isArray(p.verifier.dependencies),'REQUEST_INVALID','Immutable verifier required');
 for(const d of p.verifier.dependencies){closedTree(d.source);object(d,['source','target','sha256']);sha(d.sha256);need(canonical(d.source)===d.source&&entire(d.source)===d.sha256,'TRUST_INVALID','Verifier dependency changed');need(/^\/(workspace|opt\/factory)\/(?:[\w.-]+\/)*node_modules$/.test(d.target),'REQUEST_INVALID','Dependency target must be node_modules');}
 object(p.qualification,['path','sha256']);need(declared.get(p.qualification.path)===p.qualification.sha256&&digest(p.qualification.path)===p.qualification.sha256,'TRUST_INVALID','Qualification record not bound');
 const q=read(p.qualification.path);need(q.executionProfileSha256===executionProfileHash(p),'TRUST_INVALID','Execution profile differs from qualification');need(Array.isArray(q.artifacts)&&q.artifacts.length>0,'TOOLING_UNAVAILABLE','Qualification has no retained evidence');for(const a of q.artifacts){object(a,['path','sha256']);regular(a.path,'TOOLING_UNAVAILABLE');need(digest(a.path)===a.sha256,'TRUST_INVALID','Qualification artifact changed');}need(q.schemaVersion===1&&q.scope==='update-only launcher qualification'&&q.runnerImage===p.runnerImage&&q.verifierImage===p.verifier.image,'TOOLING_UNAVAILABLE','Full launcher qualification missing');
 // The immutable factory commit binds source as well; explicit descriptor inputs close module/config discovery.
 for(const name of fs.readdirSync(here).filter(n=>n.endsWith('.mjs'))){const file=path.join(here,name);need(declared.get(file)===digest(file)&&q.sourceHashes?.[file]===digest(file),'TRUST_INVALID','Undeclared or unqualified factory module: '+name);}
 for(const relative of ['aws/converse.mjs','aws/package.json','aws/package-lock.json']){const file=path.join(here,relative);need(declared.get(file)===digest(file)&&q.sourceHashes?.[file]===digest(file),'TRUST_INVALID','Undeclared or unqualified broker input');}
 for(const [file,value] of Object.entries(q.sourceHashes??{}))need(declared.get(file)===value&&digest(file)===value,'TRUST_INVALID','Qualified source changed');
 for(const suite of Object.keys(requiredReports)){const file=path.join(here,suite);regular(file,'TOOLING_UNAVAILABLE');need(q.suiteHashes?.[suite]===digest(file)&&q.sourceHashes?.[file]===digest(file),'TRUST_INVALID','Qualification harness changed');}
 validateQualificationReports(q,executionProfileHash(p));
 return p;
}
