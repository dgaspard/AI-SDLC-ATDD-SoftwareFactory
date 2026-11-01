// Node test-runner events, separate from sandbox stdout and diagnostic messages.
export default async function* reporter(source){
 for await(const event of source){
  const d=event.data;
  if(event.type==='test:pass'||event.type==='test:fail')yield JSON.stringify({type:event.type,name:d.name,skip:!!d.skip,todo:!!d.todo})+'\n';
  else if(event.type==='test:summary')yield JSON.stringify({type:event.type,success:d.success===true})+'\n';
  else if(event.type==='test:stdout'||event.type==='test:stderr'||event.type==='test:diagnostic')yield JSON.stringify({type:event.type,message:d.message??''})+'\n';
 }
}
