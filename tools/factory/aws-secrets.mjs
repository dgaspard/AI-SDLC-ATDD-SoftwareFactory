// Broker-side adapter. getSecretValue is a trusted SDK transport, never runner input.
export function secretsManagerStore({region,secretArn,versionId,getSecretValue}) {
 if(typeof region!=='string'||!/^(us|eu|ap|ca|sa|me|af|il|mx)-[a-z]+-\d$/.test(region)||
    typeof secretArn!=='string'||!new RegExp('^arn:aws:secretsmanager:'+region+':[0-9]{12}:secret:[A-Za-z0-9/_+=.@-]+-[A-Za-z0-9]{6}$').test(secretArn)||
    typeof versionId!=='string'||!/^[A-Za-z0-9-]{32,64}$/.test(versionId)||typeof getSecretValue!=='function')throw Error('Invalid Secrets Manager binding');
 return Object.freeze({async readSecret({signal}={}) {
  try{
   if(signal?.aborted)throw Error();
   const value=await getSecretValue({SecretId:secretArn,VersionId:versionId},{abortSignal:signal});
   if(signal?.aborted||value?.ARN!==secretArn||value.VersionId!==versionId||value.SecretBinary!==undefined||
      typeof value.SecretString!=='string'||!/^[A-Za-z0-9_./+=-]{16,8192}$/.test(value.SecretString))throw Error();
   return value.SecretString;
  }catch{throw Error('Credential unavailable');}
 }});
}
