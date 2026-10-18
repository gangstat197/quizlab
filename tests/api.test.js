import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createApp } from '../server/index.js';
import { Store } from '../server/store.js';
import { defaultConfig } from '../shared/quiz.js';
import { demoQuiz } from '../src/demo.js';

let app,server,base,directory,provider;
const originalKey=process.env.GEMINI_API_KEY;
const config={...defaultConfig,count:6,types:['single','multiple','true_false']};
const valid=()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(demoQuiz)}]}}]}));
async function boot(){app=createApp({dataDir:directory,fetchImpl:(...args)=>provider(...args)});server=app.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;}
async function shutdown(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await app.locals.close();}
beforeEach(async()=>{process.env.GEMINI_API_KEY='test-placeholder-not-a-real-key';directory=await mkdtemp('/private/tmp/quizlab-test-');provider=async()=>valid();await boot();});
afterEach(async()=>{await shutdown();await rm(directory,{recursive:true,force:true});if(originalKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=originalKey;});
async function api(route,{method='GET',body,headers={}}={}){const response=await fetch(base+route,{method,headers:{...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...headers},body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined});return {status:response.status,data:await response.json()};}
function documentBody(settings=config,filename='lecture.pdf'){const form=new FormData();form.append('config',JSON.stringify(settings));form.append('documents',new Blob(['%PDF-1.4 test']),filename);return form;}
async function until(condition){const deadline=Date.now()+4000;while(Date.now()<deadline){const value=await condition();if(value)return value;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Condition timed out');}
async function completed(id,status='completed'){return until(async()=>{const {data}=await api('/api/jobs');return data.find(j=>j.id===id&&j.status===status);});}
async function createQuiz(){return (await api('/api/quizzes',{method:'POST',body:{quiz:demoQuiz}})).data;}
async function start(quiz,patch={}){return (await api('/api/sessions',{method:'POST',body:{quizId:quiz.id,mode:'practice',shuffleQuestions:false,shuffleAnswers:false,...patch}})).data;}
async function op(session,operation,id=randomUUID()){return api(`/api/sessions/${session.id}/ops`,{method:'POST',body:{...operation,id}});}
function deferredProvider(){let release;provider=(_url,options)=>new Promise((resolve,reject)=>{release=()=>resolve(valid());options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});return ()=>release?.();}

test('Health reports SQLite and missing key is actionable without exposing credentials',async()=>{
  delete process.env.GEMINI_API_KEY;
  let result=await api('/api/health');assert.equal(result.data.storage,'sqlite');assert.equal(result.data.geminiConfigured,false);
  result=await api('/api/jobs',{method:'POST',body:documentBody()});assert.equal(result.status,503);assert.match(result.data.error,/GEMINI_API_KEY/);
});
test('Rejects cross-origin changes and invalid uploads before calling Gemini',async()=>{
  let calls=0;provider=async()=>{calls++;return valid();};
  assert.equal((await api('/api/jobs',{method:'POST',headers:{Origin:'https://untrusted.example'},body:documentBody()})).status,403);
  assert.equal((await api('/api/jobs',{method:'POST',body:documentBody({...config,count:500})})).status,400);
  assert.equal((await api('/api/jobs',{method:'POST',body:documentBody(config,'bad.exe')})).status,400);assert.equal(calls,0);
});
test('Acknowledges only after upload is committed; job survives completed HTTP response and a page reload',async()=>{
  const release=deferredProvider();
  const result=await api('/api/jobs',{method:'POST',body:documentBody(config,'Bài giảng.pdf')});assert.equal(result.status,202);
  assert.equal(app.locals.store.files(result.data.id)[0].buffer.toString(),'%PDF-1.4 test');
  await until(()=>app.locals.store.get('jobs',result.data.id).status==='running');
  const reloaded=(await api('/api/state')).data;assert.ok(reloaded.jobs.some(j=>j.id===result.data.id&&j.status==='running'));
  release();await completed(result.data.id);
  const state=(await api('/api/state')).data;assert.equal(state.quizzes.length,1);assert.deepEqual(state.quizzes[0].sources,['Bài giảng.pdf']);assert.equal(state.quizzes[0].questions.length,6);
});
test('Uses structured JSON request with server-side key, and persists quiz plus completion atomically',async()=>{
  let captured;provider=async(url,options)=>{captured={url,options};return valid();};
  const {data:job}=await api('/api/jobs',{method:'POST',body:documentBody()});await completed(job.id);
  const sent=JSON.parse(captured.options.body);assert.equal(sent.generationConfig.responseMimeType,'application/json');assert.equal(sent.generationConfig.responseJsonSchema.type,'object');assert.ok(!('responseFormat' in sent.generationConfig));assert.equal(sent.contents[0].parts[2].inlineData.mimeType,'application/pdf');
  assert.ok(!captured.url.includes(process.env.GEMINI_API_KEY));assert.equal(captured.options.headers['x-goog-api-key'],process.env.GEMINI_API_KEY);
  const {data}=await api('/api/state');assert.equal(data.jobs[0].quizId,data.quizzes[0].id);assert.ok(!JSON.stringify(data).includes(process.env.GEMINI_API_KEY));
});
test('Repeated upload with the same idempotency key produces one job and one quiz',async()=>{
  const headers={'Idempotency-Key':randomUUID()};
  const first=await api('/api/jobs',{method:'POST',headers,body:documentBody()});const second=await api('/api/jobs',{method:'POST',headers,body:documentBody()});
  assert.equal(first.data.id,second.data.id);await completed(first.data.id);
  const {data}=await api('/api/state');assert.equal(data.jobs.length,1);assert.equal(data.quizzes.length,1);
});
test('Only two workers run concurrently while additional jobs remain durable in the queue',async()=>{
  const releases=[];
  provider=(_url,options)=>new Promise((resolve,reject)=>{releases.push(()=>resolve(valid()));options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
  const ids=[];for(let i=0;i<3;i++)ids.push((await api('/api/jobs',{method:'POST',body:documentBody()})).data.id);
  await until(()=>releases.length===2);
  const jobs=(await api('/api/jobs')).data;assert.equal(jobs.filter(j=>j.status==='running').length,2);assert.equal(jobs.filter(j=>j.status==='queued').length,1);
  releases[0]();releases[1]();await until(()=>releases.length===3);releases[2]();
  for(const id of ids)await completed(id);
});
test('Explicit cancellation stops the worker and never commits a quiz',async()=>{
  deferredProvider();const {data:job}=await api('/api/jobs',{method:'POST',body:documentBody()});
  await until(()=>app.locals.queue.active.size===1);assert.equal((await api(`/api/jobs/${job.id}/cancel`,{method:'POST'})).status,200);
  await until(()=>app.locals.queue.active.size===0);assert.equal((await api('/api/state')).data.quizzes.length,0);await completed(job.id,'cancelled');
});
test('Quota/validation errors are persisted, sanitized and retryable using the saved source',async()=>{
  provider=async()=>new Response(JSON.stringify({error:{message:`Quota exceeded ${process.env.GEMINI_API_KEY}`}}),{status:429});
  const {data:job}=await api('/api/jobs',{method:'POST',body:documentBody()});const failed=await completed(job.id,'failed');
  assert.match(failed.error,/Quota/);assert.ok(!failed.error.includes(process.env.GEMINI_API_KEY));
  provider=async()=>valid();await api(`/api/jobs/${job.id}/retry`,{method:'POST'});await completed(job.id);assert.equal((await api('/api/state')).data.quizzes.length,1);
});
test('Invalid LLM output cannot enter the library',async()=>{
  provider=async()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"title":"bad"}'}]}}]}));
  const {data:job}=await api('/api/jobs',{method:'POST',body:documentBody()});const failed=await completed(job.id,'failed');assert.match(failed.error,/sai cấu trúc/);assert.equal((await api('/api/state')).data.quizzes.length,0);
});
test('Subjects persist through restart, reject duplicate names and retain their identity when edited',async()=>{
  const created=await api('/api/subjects',{method:'POST',body:{name:'  Hệ   điều hành  ',icon:'code',color:'blue'}});assert.equal(created.status,201);assert.equal(created.data.name,'Hệ điều hành');
  assert.equal((await api('/api/subjects',{method:'POST',body:{name:'hệ điều hành'}})).status,400);
  const edited=await api(`/api/subjects/${created.data.id}`,{method:'PATCH',body:{name:'Nguyên lý hệ điều hành',color:'purple'}});assert.equal(edited.status,200);assert.equal(edited.data.id,created.data.id);assert.equal(edited.data.icon,'code');
  await shutdown();await boot();const state=(await api('/api/state')).data;assert.equal(state.subjects.length,1);assert.equal(state.subjects[0].color,'purple');
});
test('Both imported and Gemini-generated quizzes keep their assigned subject, including reassignment',async()=>{
  const subject=(await api('/api/subjects',{method:'POST',body:{name:'Thống kê',color:'teal',icon:'calculator'}})).data;
  const imported=await api('/api/quizzes',{method:'POST',body:{quiz:demoQuiz,subjectId:subject.id}});assert.equal(imported.data.subjectId,subject.id);
  const job=(await api('/api/jobs',{method:'POST',body:documentBody({...config,subjectId:subject.id})})).data;await completed(job.id);
  let state=(await api('/api/state')).data;assert.equal(state.quizzes.find(q=>q.id===job.id).subjectId,subject.id);
  await api(`/api/quizzes/${imported.data.id}`,{method:'PATCH',body:{subjectId:null}});state=(await api('/api/state')).data;assert.equal(state.quizzes.find(q=>q.id===imported.data.id).subjectId,null);
  assert.equal((await api(`/api/quizzes/${imported.data.id}`,{method:'PATCH',body:{subjectId:randomUUID()}})).status,400);
});
test('Deleting a subject unassigns quizzes, queued jobs and drafts without removing any learning history',async()=>{
  const subject=(await api('/api/subjects',{method:'POST',body:{name:'Phân tích dữ liệu'}})).data;
  const quiz=(await api('/api/quizzes',{method:'POST',body:{quiz:demoQuiz,subjectId:subject.id}})).data;
  const session=await start(quiz);await op(session,{type:'submit'});
  await api('/api/draft',{method:'PUT',body:{config:{...config,subjectId:subject.id},method:'gemini',json:'',updatedAt:Date.now()}});
  const release=deferredProvider();const job=(await api('/api/jobs',{method:'POST',body:documentBody({...config,subjectId:subject.id})})).data;await until(()=>app.locals.queue.active.size===1);
  await api(`/api/subjects/${subject.id}`,{method:'DELETE'});release();await completed(job.id);
  const state=(await api('/api/state')).data;assert.equal(state.subjects.length,0);assert.equal(state.quizzes.length,2);assert.ok(state.quizzes.every(q=>q.subjectId===null));assert.equal(state.attempts.length,1);assert.equal(state.draft.config.subjectId,null);assert.equal(state.jobs[0].config.subjectId,null);
});
test('Quiz, file bytes, draft, active answers and history survive a backend restart',async()=>{
  const quiz=await createQuiz();const session=await start(quiz);
  await op(session,{type:'answer',questionId:'demo-2',answer:[2,0]});await op(session,{type:'navigate',index:1});
  await api('/api/draft',{method:'PUT',body:{config,method:'manual',json:'unfinished JSON',updatedAt:Date.now()}});
  await shutdown();await boot();
  let state=(await api('/api/state')).data;assert.equal(state.quizzes[0].id,quiz.id);assert.equal(state.session.index,1);assert.deepEqual(state.session.answers['demo-2'],[2,0]);assert.equal(state.draft.json,'unfinished JSON');
  await op(session,{type:'submit'});await shutdown();await boot();state=(await api('/api/state')).data;assert.equal(state.session,null);assert.equal(state.attempts.length,1);assert.equal(state.attempts[0].correct,1);
});
test('Repeated answer/flag/submit operations are idempotent across lost acknowledgements',async()=>{
  const quiz=await createQuiz();const session=await start(quiz);const id=randomUUID();
  await op(session,{type:'flag',questionId:'demo-1'},id);await op(session,{type:'flag',questionId:'demo-1'},id);
  assert.deepEqual((await api('/api/state')).data.session.flags,['demo-1']);
  await op(session,{type:'answer',questionId:'demo-1',answer:[1]});const submission=randomUUID();await op(session,{type:'submit'},submission);await op(session,{type:'submit'},submission);
  const state=(await api('/api/state')).data;assert.equal(state.attempts.length,1);assert.equal(state.attempts[0].correct,1);
});
test('Refresh does not reset exam deadline, and an expired exam is graded on reopening',async()=>{
  const quiz=await createQuiz();const session=await start(quiz,{mode:'exam',minutes:1});
  await op(session,{type:'answer',questionId:'demo-1',answer:[1]});assert.equal((await api('/api/state')).data.session.deadline,session.deadline);
  assert.equal((await op(session,{type:'check',questionId:'demo-1'})).status,400);
  const saved=app.locals.store.get('sessions','active');saved.startedAt=Date.now()-61000;saved.deadline=Date.now()-1000;app.locals.store.set('sessions','active',saved);
  const state=(await api('/api/state')).data;assert.equal(state.session,null);assert.equal(state.attempts[0].correct,1);assert.equal(state.attempts[0].completedAt,saved.deadline);
});
test('Migrates old browser data once without overwriting newer disk data or duplicating history',async()=>{
  const id=randomUUID();const session={id:randomUUID(),quizId:id,title:demoQuiz.title,questions:demoQuiz.questions,mode:'practice',index:2,answers:{'demo-1':[1]},checked:[],flags:[],startedAt:Date.now()-2000,deadline:null};
  const legacy={library:[{...demoQuiz,id,createdAt:Date.now(),method:'manual'}],session,attempts:[]};
  await api('/api/migrate',{method:'POST',body:legacy});await api('/api/migrate',{method:'POST',body:legacy});
  let state=(await api('/api/state')).data;assert.equal(state.quizzes.length,1);assert.equal(state.session.index,2);
  await op(session,{type:'submit'});await api('/api/migrate',{method:'POST',body:legacy});state=(await api('/api/state')).data;assert.equal(state.session,null);assert.equal(state.attempts.length,1);
});
test('Backup is a standalone consistent SQLite snapshot including inputs and active answers',async()=>{
  const quiz=await createQuiz();const session=await start(quiz);await op(session,{type:'answer',questionId:'demo-1',answer:[1]});
  deferredProvider();const {data:job}=await api('/api/jobs',{method:'POST',body:documentBody()});await until(()=>app.locals.queue.active.size===1);
  const response=await fetch(base+'/api/backup');assert.equal(response.status,200);
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,16).toString(),'SQLite format 3\0');
  const restoreDir=await mkdtemp('/private/tmp/quizlab-restore-');
  try{await writeFile(restoreDir+'/quizlab.sqlite',bytes);const copy=new Store(restoreDir);try{assert.equal(copy.state().quizzes[0].id,quiz.id);assert.deepEqual(copy.state().session.answers['demo-1'],[1]);assert.equal(copy.files(job.id)[0].buffer.toString(),'%PDF-1.4 test');}finally{copy.close();}}finally{await rm(restoreDir,{recursive:true,force:true});}
});
test('Recovers a running task from disk after abrupt process termination',async()=>{
  deferredProvider();const {data:job}=await api('/api/jobs',{method:'POST',body:documentBody()});await until(()=>app.locals.queue.active.size===1);await shutdown();
  const script=`import {createApp} from ${JSON.stringify(new URL('../server/index.js',import.meta.url).href)};const app=createApp({dataDir:process.argv[1],fetchImpl:()=>new Promise(()=>{})});const server=app.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port})));`;
  const child=spawn(process.execPath,['--input-type=module','-e',script,directory],{stdio:['ignore','pipe','pipe'],env:{...process.env,GEMINI_API_KEY:'test-placeholder-not-a-real-key'}});
  let output='';child.stdout.on('data',chunk=>output+=chunk.toString());
  try{
    await until(()=>output.includes('port'));const address=JSON.parse(output.trim()).port;
    await until(async()=>{const r=await fetch(`http://127.0.0.1:${address}/api/jobs`);return (await r.json()).find(j=>j.id===job.id)?.status==='running';});
    child.kill('SIGKILL');await once(child,'exit');provider=async()=>valid();await boot();await completed(job.id);
    const state=(await api('/api/state')).data;assert.equal(state.quizzes.length,1);assert.equal(state.quizzes[0].id,job.id);assert.equal(app.locals.store.files(job.id)[0].buffer.toString(),'%PDF-1.4 test');
  }finally{if(child.exitCode===null&&!child.signalCode)child.kill('SIGKILL');}
});
