import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { configSchema, parseQuiz, prepareQuestions } from '../shared/quiz.js';
import { operationSchema, applyOperation, makeAttempt } from '../shared/session.js';
import { MAX_TOTAL_BYTES } from './documents.js';
import { getGeminiModel } from './gemini.js';
import { Store } from './store.js';
import { subjectSchema,subjectIdSchema,normalizeSubjectName } from '../shared/subjects.js';
import { JobQueue } from './jobs.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const draftSchema=z.object({config:configSchema,method:z.enum(['gemini','manual']),json:z.string().max(4*1024*1024),updatedAt:z.number().finite().min(0)});
const startSchema=z.object({quizId:z.string().min(1).max(100),mode:z.enum(['practice','exam','mistakes']),minutes:z.number().int().min(1).max(240).default(30),shuffleQuestions:z.boolean().default(true),shuffleAnswers:z.boolean().default(true)});

export function createApp({dataDir=process.env.QUIZLAB_DATA_DIR||path.join(root,'data'),fetchImpl,autoStart=true}={}) {
  const store=new Store(dataDir);const queue=new JobQueue(store,{fetchImpl,autoStart});
  const app=express();app.disable('x-powered-by');
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:18*1024*1024,files:5,fields:1,fieldSize:10000,parts:6}});
  app.locals.store=store;app.locals.queue=queue;
  app.locals.close=async()=>{await queue.stop();store.close();};
  app.use('/api',(req,res,next)=>{
    const origin=req.get('origin');
    if(origin) {try{if(new URL(origin).host!==req.get('host'))return res.status(403).json({error:'Yêu cầu từ nguồn không được cho phép.'});}catch{return res.status(403).json({error:'Nguồn yêu cầu không hợp lệ.'});}}
    res.set('Cache-Control','no-store');next();
  });
  app.use('/api',express.json({limit:'16mb'}));
  function finish(session) {return store.transaction(()=>{const attempt=makeAttempt(session);store.set('attempts',attempt.id,attempt);store.delete('sessions','active');return attempt;});}
  function expire() {const session=store.get('sessions','active');if(session?.deadline&&Date.now()>=session.deadline)finish(session);}
  function validSubject(id){if(id&&!store.get('subjects',id))throw new Error('Môn học không còn tồn tại. Hãy chọn lại.');return id||null;}
  function uniqueSubject(name,except){if(store.all('subjects').some(s=>s.id!==except&&normalizeSubjectName(s.name)===normalizeSubjectName(name)))throw new Error('Môn học này đã tồn tại.');}
  app.get('/api/health',(_req,res)=>res.json({ok:true,geminiConfigured:!!process.env.GEMINI_API_KEY,model:getGeminiModel(),storage:'sqlite'}));
  app.get('/api/state',(_req,res)=>{expire();res.json(store.state());});
  app.post('/api/subjects',(req,res)=>{const input=subjectSchema.parse(req.body);uniqueSubject(input.name);const subject={...input,id:randomUUID(),createdAt:Date.now()};store.set('subjects',subject.id,subject);res.status(201).json(subject);});
  app.patch('/api/subjects/:id',(req,res)=>{const current=store.get('subjects',req.params.id);if(!current)return res.status(404).json({error:'Không tìm thấy môn học.'});const input=subjectSchema.parse({...current,...req.body});uniqueSubject(input.name,current.id);res.json(store.set('subjects',current.id,{...current,...input,updatedAt:Date.now()}));});
  app.delete('/api/subjects/:id',(req,res)=>{
    if(!store.get('subjects',req.params.id))return res.status(404).json({error:'Không tìm thấy môn học.'});
    store.transaction(()=>{
      for(const quiz of store.all('quizzes'))if(quiz.subjectId===req.params.id)store.set('quizzes',quiz.id,{...quiz,subjectId:null});
      for(const job of store.all('jobs'))if(job.config.subjectId===req.params.id)store.set('jobs',job.id,{...job,config:{...job.config,subjectId:null}});
      const draft=store.get('settings','draft');if(draft?.config.subjectId===req.params.id)store.set('settings','draft',{...draft,config:{...draft.config,subjectId:null},updatedAt:Math.max(Date.now(),draft.updatedAt+1)});
      store.delete('subjects',req.params.id);
    });res.json({ok:true});
  });
  app.get('/api/jobs',(_req,res)=>res.json(store.all('jobs').sort((a,b)=>b.createdAt-a.createdAt)));
  app.get('/api/backup',async(_req,res,next)=>{
    const directory=await mkdtemp(path.join(tmpdir(),'quizlab-backup-'));const filename=path.join(directory,'quizlab.sqlite');
    try{store.db.prepare('VACUUM INTO ?').run(filename);res.download(filename,`quizlab-${new Date().toISOString().slice(0,10)}.sqlite`,error=>{void rm(directory,{recursive:true,force:true});if(error)next(error);});}
    catch(error){await rm(directory,{recursive:true,force:true});next(error);}
  });
  const createJob=[(req,res,next)=>{
    if(!process.env.GEMINI_API_KEY)return res.status(503).json({error:'Thêm GEMINI_API_KEY vào .env rồi khởi động lại backend.'});
    if(store.all('jobs').filter(j=>['queued','running'].includes(j.status)).length>=10)return res.status(429).json({error:'Đang có 10 tác vụ. Hãy đợi hoặc hủy bớt tác vụ.'});
    next();
  },upload.array('documents',5),(req,res)=>{
    if(!req.files?.length)return res.status(400).json({error:'Hãy chọn ít nhất một tài liệu.'});
    if(req.files.reduce((n,f)=>n+f.size,0)>MAX_TOTAL_BYTES)return res.status(413).json({error:'Tổng tài liệu tối đa 24 MB.'});
    for(const file of req.files){
      if([...file.originalname].every(c=>c.codePointAt(0)<=255)){const decoded=Buffer.from(file.originalname,'latin1').toString('utf8');if(!decoded.includes('\uFFFD'))file.originalname=decoded;}
      if(!/\.(pdf|docx|pptx)$/i.test(file.originalname))return res.status(400).json({error:'Chỉ hỗ trợ PDF, DOCX và PPTX.'});
      if(!file.size)return res.status(400).json({error:'Tệp rỗng không thể xử lý.'});
    }
    let raw;try{raw=JSON.parse(req.body.config);}catch{return res.status(400).json({error:'Cấu hình không hợp lệ.'});}
    const config=configSchema.parse(raw);validSubject(config.subjectId);
    // Save inputs and job atomically before replying. Closing the browser cannot cancel it.
    const id=req.get('Idempotency-Key');if(id)z.string().uuid().parse(id);
    res.status(202).json(queue.create(config,req.files,id));
  }];
  app.post('/api/jobs',...createJob);app.post('/api/generate',...createJob);
  app.post('/api/jobs/:id/cancel',(req,res)=>res.json(queue.cancel(req.params.id)));
  app.post('/api/jobs/:id/retry',(req,res)=>{if(!process.env.GEMINI_API_KEY)return res.status(503).json({error:'Chưa cấu hình Gemini API key.'});res.json(queue.retry(req.params.id));});
  app.delete('/api/jobs/:id',(req,res)=>{
    const job=store.get('jobs',req.params.id);if(!job)return res.status(404).json({error:'Không tìm thấy tác vụ.'});
    if(['queued','running'].includes(job.status))return res.status(409).json({error:'Hãy hủy tác vụ trước khi xóa.'});
    store.removeJob(job.id);res.json({ok:true});
  });
  app.post('/api/quizzes',(req,res)=>{
    const quiz=parseQuiz(req.body.quiz);const sources=z.array(z.string().max(1000)).max(5).default([]).parse(req.body.sources);const method=z.enum(['manual','demo']).default('manual').parse(req.body.method);
    const subjectId=validSubject(subjectIdSchema.nullish().parse(req.body.subjectId));
    const record={...quiz,id:randomUUID(),createdAt:Date.now(),sources,method,subjectId};store.set('quizzes',record.id,record);res.status(201).json(record);
  });
  app.patch('/api/quizzes/:id',(req,res)=>{
    const quiz=store.get('quizzes',req.params.id);if(!quiz)return res.status(404).json({error:'Không tìm thấy quiz.'});
    const patch=z.object({title:z.string().trim().min(1).max(160).optional(),subjectId:subjectIdSchema.optional()}).strict().parse(req.body);
    if(patch.subjectId!==undefined)validSubject(patch.subjectId);
    res.json(store.set('quizzes',quiz.id,{...quiz,...patch,updatedAt:Date.now()}));
  });
  app.delete('/api/quizzes/:id',(req,res)=>{store.delete('quizzes',req.params.id);res.json({ok:true});});
  app.put('/api/draft',(req,res)=>{const draft=draftSchema.parse(req.body);validSubject(draft.config.subjectId);const current=store.get('settings','draft');if(!current||draft.updatedAt>=current.updatedAt)store.set('settings','draft',draft);res.json({ok:true});});
  app.post('/api/sessions',(req,res)=>{
    expire();if(store.get('sessions','active'))return res.status(409).json({error:'Đang có bài làm dở. Hãy tiếp tục hoặc nộp bài đó trước.'});
    const options=startSchema.parse(req.body);const quiz=store.get('quizzes',options.quizId);if(!quiz)return res.status(404).json({error:'Không tìm thấy quiz.'});
    const latest=store.all('attempts').filter(a=>a.quizId===quiz.id).sort((a,b)=>b.completedAt-a.completedAt)[0];
    const questions=options.mode==='mistakes'?quiz.questions.filter(q=>latest?.wrongIds.includes(q.id)):quiz.questions;
    if(!questions.length)return res.status(400).json({error:'Chưa có câu sai để ôn.'});
    const session={id:randomUUID(),quizId:quiz.id,title:quiz.title,mode:options.mode,questions:prepareQuestions(questions,options.shuffleQuestions,options.shuffleAnswers),answers:{},checked:[],flags:[],index:0,startedAt:Date.now(),deadline:options.mode==='exam'?Date.now()+options.minutes*60000:null};
    store.set('sessions','active',session);res.status(201).json(session);
  });
  app.post('/api/sessions/:id/ops',(req,res)=>{
    expire();const op=operationSchema.parse(req.body);let session=store.get('sessions','active');
    const previous=store.db.prepare('SELECT session_id FROM operations WHERE id=?').get(op.id);
    if(previous&&previous.session_id!==req.params.id)return res.status(409).json({error:'Mã thao tác thuộc bài làm khác.'});
    if(previous||store.get('attempts',req.params.id))return res.json({session,attempt:store.get('attempts',req.params.id)});
    if(!session||session.id!==req.params.id)return res.status(409).json({error:'Bài làm đã thay đổi. Hãy tải lại trang.'});
    const result=store.transaction(()=>{
      let attempt=null;
      if(op.type==='submit'){attempt=makeAttempt(session);store.set('attempts',attempt.id,attempt);store.delete('sessions','active');session=null;}
      else {session=applyOperation(session,op);store.set('sessions','active',session);}
      store.db.prepare('INSERT INTO operations VALUES(?,?)').run(op.id,req.params.id);return {session,attempt};
    });res.json(result);
  });
  app.post('/api/migrate',(req,res)=>{
    const counts={quizzes:0,attempts:0,session:false};
    store.transaction(()=>{
      for(const item of (Array.isArray(req.body.library)?req.body.library:[]).slice(0,1000)){
        try{const quiz=parseQuiz(item);const id=z.string().uuid().parse(item.id);if(!store.get('quizzes',id)){store.set('quizzes',id,{...quiz,id,createdAt:Number(item.createdAt)||Date.now(),sources:Array.isArray(item.sources)?item.sources.filter(s=>typeof s==='string'):[],method:['gemini','demo','manual'].includes(item.method)?item.method:'manual'});counts.quizzes++;}}catch{}
      }
      for(const item of (Array.isArray(req.body.attempts)?req.body.attempts:[]).slice(0,1000)){
        try{const session=validateLegacySession({...item,startedAt:item.completedAt-(item.duration||1)*1000,index:0,checked:[],flags:[],deadline:null});const attempt=makeAttempt(session,Number(item.completedAt)||Date.now());if(!store.get('attempts',attempt.id)){store.set('attempts',attempt.id,attempt);counts.attempts++;}}catch{}
      }
      if(req.body.session&&!store.get('sessions','active')&&!store.get('settings','legacySessionImported')){
        try{const session=validateLegacySession(req.body.session);if(!store.get('attempts',session.id)){store.set('sessions','active',session);counts.session=true;}store.set('settings','legacySessionImported',true);}catch{}
      }
    });res.json(counts);
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'Không tìm thấy API.'}));
  app.use(express.static(path.join(root,'dist')));app.get('/{*path}',(_req,res)=>res.sendFile(path.join(root,'dist/index.html')));
  app.use((error,_req,res,_next)=>{
    if(error instanceof multer.MulterError)return res.status(413).json({error:'Tối đa 5 tệp, 18 MB/tệp, tổng 24 MB.'});
    if(error instanceof z.ZodError)return res.status(400).json({error:'Dữ liệu không hợp lệ: '+error.issues.slice(0,3).map(i=>i.path.join('.')+': '+i.message).join('; ')});
    if(error.type==='entity.too.large')return res.status(413).json({error:'Dữ liệu gửi lên quá lớn.'});
    let message=error.message||'Không xử lý được yêu cầu.';if(process.env.GEMINI_API_KEY)message=message.replaceAll(process.env.GEMINI_API_KEY,'[API key đã ẩn]');res.status(400).json({error:message});
  });return app;
}

function validateLegacySession(input) {
  const info=z.object({id:z.string().uuid(),quizId:z.string().min(1),title:z.string().min(1).max(160),mode:z.enum(['practice','exam','mistakes']),index:z.number().int().min(0),startedAt:z.number().finite(),deadline:z.number().finite().nullable(),checked:z.array(z.string()),flags:z.array(z.string())}).parse(input);
  const questions=parseQuiz({version:1,title:info.title,description:'',questions:input.questions}).questions;
  let session={...info,questions,answers:{},checked:[],flags:info.flags.filter(id=>questions.some(q=>q.id===id)),index:Math.min(info.index,questions.length-1)};
  for(const [questionId,answer] of Object.entries(input.answers||{}))session=applyOperation(session,{type:'answer',questionId,answer:z.array(z.number().int().min(0)).parse(answer)});
  session.checked=info.checked.filter(id=>questions.some(q=>q.id===id)&&session.answers[id]?.length);return session;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=createApp();const server=app.listen(Number(process.env.PORT)||3001,'127.0.0.1',()=>console.log(`Quizlab: http://127.0.0.1:${process.env.PORT||3001}`));
  let closing=false;
  const stop=async()=>{if(closing)return;closing=true;const force=setTimeout(()=>server.closeAllConnections(),5000);await new Promise(resolve=>server.close(resolve));clearTimeout(force);await app.locals.close();process.exit(0);};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
