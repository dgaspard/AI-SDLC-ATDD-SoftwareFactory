import {SecretsManagerClient,GetSecretValueCommand} from '@aws-sdk/client-secrets-manager';
import {secretsManagerStore} from '../aws-secrets.mjs';
// Explicit provider prevents implicit use of a developer's default AWS credential chain.
// Call only after owner approval; importing/constructing this module makes no AWS call.
export function createAwsSecretsManagerStore({region,secretArn,versionId,credentials}) {
 if(typeof credentials!=='function')throw Error('Explicit owner-approved AWS credential provider required');
 // Validate before constructing an SDK client; no endpoint or credential discovery.
 secretsManagerStore({region,secretArn,versionId,getSecretValue:async()=>{throw Error();}});
 const client=new SecretsManagerClient({region,credentials,maxAttempts:1,
  endpoint:`https://secretsmanager.${region}.amazonaws.com`,ignoreConfiguredEndpointUrls:true});
 const store=secretsManagerStore({region,secretArn,versionId,
  getSecretValue:(input,options)=>client.send(new GetSecretValueCommand(input),options)});
 return Object.freeze({...store,close:()=>client.destroy()});
}
