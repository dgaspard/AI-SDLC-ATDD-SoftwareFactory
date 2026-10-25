import http from 'node:http';
import crypto from 'node:crypto';
import {normalizeRequest,validateStream,validateResponse} from './broker-protocol.mjs';

const positive = (n, max) => Number.isSafeInteger(n) && n > 0 && n <= max;
const fixedUpstream = 'https://api.openai.com/v1/responses';

// A single-run relay component. No CLI, Docker launcher or real-runner activation.
// offlineUpstream is explicit test injection and accepts loopback HTTP only.
export function createModelBroker({ runId, model, credentialStore, ttlMs = 1800000,
  maxRequests = 40, maxConcurrent = 1, requestBytes = 1048576,
  responseBytes = 16777216, timeoutMs = 120000, maxOutputTokens = 8192,
  audit = () => {}, offlineUpstream = null }) {
  if (typeof runId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(runId) ||
      typeof model !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(model) ||
      typeof credentialStore?.readSecret !== 'function' ||
      !positive(ttlMs,1800000) || !positive(maxRequests,1000) ||
      !positive(maxConcurrent,4) || !positive(requestBytes,1048576) ||
      !positive(responseBytes,16777216) || !positive(timeoutMs,120000) ||
      !positive(maxOutputTokens,8192)) throw new Error('Invalid broker configuration');
  let upstream = fixedUpstream;
  if (offlineUpstream !== null) {
    const u = new URL(offlineUpstream);
    if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || u.username || u.password || u.pathname !== '/v1/responses' || u.search || u.hash)
      throw new Error('Invalid offline upstream');
    upstream = u.href;
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expected = Buffer.from('Bearer ' + token);
  const deadline = Date.now() + ttlMs;
  let revoked = false, count = 0, active = 0;
  const controllers = new Set(), sockets = new Set();
  function revoke() { revoked = true; for (const c of controllers) c.abort(); }
  const expiry = setTimeout(revoke, ttlMs); expiry.unref();
  const jobs = new Set();
  async function handle(req, res) {
    const requestId = crypto.randomUUID(), started = Date.now();
    let bytes = 0, responseLength = 0, status = 500, admitted = false;
    const controller = new AbortController();
    let timer;
    const reply = (code) => { status = code; if (!res.destroyed && !res.headersSent) { res.writeHead(code, {'content-type':'application/json','connection':'close'}); res.end(JSON.stringify({error:'Broker request rejected',requestId})); } };
    res.on('close', () => { if (!res.writableFinished) controller.abort(); });
    try {
      const supplied = Buffer.from(req.headers.authorization ?? '');
      if (revoked || Date.now() >= deadline || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied,expected)) return reply(401);
      if (req.method !== 'POST' || req.url !== '/v1/responses' || req.headers['content-type'] !== 'application/json') return reply(403);
      const headers = Object.keys(req.headers);
      if (headers.some(h => !['host','authorization','content-type','content-length','connection','transfer-encoding','accept','accept-encoding','accept-language','user-agent','sec-fetch-mode','x-codex-beta-features','x-codex-window-id','x-codex-turn-metadata','x-client-request-id','session-id','thread-id','originator'].includes(h))) return reply(403);
      if (count >= maxRequests || active >= maxConcurrent) return reply(429);
      count++; active++; admitted = true; controllers.add(controller);
      timer = setTimeout(() => controller.abort(), timeoutMs);
      controller.signal.addEventListener('abort', () => { if (!req.complete) req.destroy(); }, {once:true});
      const chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > requestBytes) return reply(413);
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply(400); }
      body=normalizeRequest(body,model,maxOutputTokens);
      if(!body) return reply(403);
      // Only the broker reads the store. No incoming headers are forwarded.
      const secret = await new Promise((resolve,reject)=>{
        const abort=()=>reject(new Error('Credential read cancelled'));
        if(controller.signal.aborted) return abort();
        controller.signal.addEventListener('abort',abort,{once:true});
        Promise.resolve().then(()=>credentialStore.readSecret({signal:controller.signal})).then(resolve,reject)
          .finally(()=>controller.signal.removeEventListener('abort',abort));
      });
      if (controller.signal.aborted || revoked) return reply(401);
      const upstreamResponse = await fetch(upstream, {
        method:'POST',redirect:'manual',signal:controller.signal,
        headers:{authorization:'Bearer '+secret,'content-type':'application/json'},
        body:JSON.stringify(body)
      });
      if (!upstreamResponse.ok) { await upstreamResponse.body?.cancel(); return reply(502); }
      const type = upstreamResponse.headers.get('content-type') ?? '';
      const streaming=body.stream===true;
      if (!(streaming ? /^text\/event-stream(?:;|$)/i.test(type) : /^application\/json(?:;|$)/i.test(type))) {
        await upstreamResponse.body?.cancel(); return reply(502);
      }
      // Buffer within byte/time caps: no partial tool call or secret reaches the runner.
      const output = [];
      for await (const chunk of upstreamResponse.body) {
        responseLength += chunk.length;
        if (responseLength > responseBytes) throw new Error('Response limit');
        output.push(chunk);
      }
      const payload = Buffer.concat(output);
      if (payload.includes(Buffer.from(secret)) || payload.includes(Buffer.from(token)) || revoked || controller.signal.aborted) return reply(502);
      try {
        if(streaming) validateStream(payload,[secret,token]);
        else validateResponse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payload)),[secret,token]);
      } catch { return reply(502); }
      status = 200;
      res.writeHead(200,{'content-type':streaming?'text/event-stream':'application/json','connection':'close'});
      res.end(payload);
    } catch { reply(controller.signal.aborted ? 504 : 502); }
    finally {
      clearTimeout(timer); controllers.delete(controller); if(admitted) active--;
      try { audit({runId,requestId,status,durationMs:Date.now()-started,requestBytes:bytes,responseBytes:responseLength}); } catch { revoke(); }
    }
  }
  const server = http.createServer((req,res)=>{const job=handle(req,res);jobs.add(job);void job.finally(()=>jobs.delete(job));});
  server.headersTimeout = 10000; server.requestTimeout = timeoutMs;
  server.on('connection', s => { sockets.add(s); s.on('close',()=>sockets.delete(s)); });
  return Object.freeze({server, token, revoke,
    async close() { revoke(); clearTimeout(expiry); const done = new Promise(resolve=>server.close(resolve)); for(const s of sockets)s.destroy(); await done; await Promise.allSettled([...jobs]); }
  });
}
