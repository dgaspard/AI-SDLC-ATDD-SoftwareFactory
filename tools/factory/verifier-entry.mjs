// Trusted verifier startup; consumer selection remains in the pinned consumer interface.
import fs from 'node:fs';import {spawn} from 'node:child_process';
fs.mkdirSync('/tmp/git-objects',{recursive:true});
const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--config'||args[2]!=='--trust')throw Error('Explicit verifier binding required');
const child=spawn(process.execPath,['/opt/factory/tools/factory/consumer.mjs','verify','--root','/workspace','--config',args[1],'--trust',args[3],'--mode','full'],{stdio:'inherit',env:{...process.env,FACTORY_CHECKOUT:'/opt/factory',GIT_CONFIG_NOSYSTEM:'0',GIT_CONFIG_GLOBAL:'/dev/null',GIT_OPTIONAL_LOCKS:'0'}});
process.exitCode=await new Promise(resolve=>{child.once('error',()=>resolve(5));child.once('exit',code=>resolve(code??9));});
