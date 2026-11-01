// Owner configuration only. Runner requests never select an endpoint or Region.
export function brokerUpstream(config={provider:'openai'}) {
 if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Invalid upstream configuration');
 if(config.provider==='openai'&&Object.keys(config).length===1)return 'https://api.openai.com/v1/responses';
 if(Object.keys(config).sort().join(',')!=='endpoint,provider,region'||config.provider!=='bedrock'||
    typeof config.region!=='string'||!/^(us|eu|ap|ca|sa|me|af|il|mx)-[a-z]+-\d$/.test(config.region))throw Error('Invalid Bedrock configuration');
 const paths={runtime:`https://bedrock-runtime.${config.region}.amazonaws.com/openai/v1/responses`,
  mantle:`https://bedrock-mantle.${config.region}.api.aws/v1/responses`,
  'mantle-openai':`https://bedrock-mantle.${config.region}.api.aws/openai/v1/responses`};
 if(!Object.hasOwn(paths,config.endpoint))throw Error('Unsupported Bedrock endpoint');
 return paths[config.endpoint];
}
