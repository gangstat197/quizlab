import { randomUUID } from 'node:crypto';
import { buildPrompt, parseQuiz } from '../shared/quiz.js';
import { documentParts } from './documents.js';
import { buildGeminiRequest, getGeminiModel, geminiErrorMessage } from './gemini.js';

export class JobQueue {
  constructor(store,{fetchImpl=(...args)=>fetch(...args),autoStart=true}={}) {
    this.store=store;this.fetchImpl=fetchImpl;this.active=new Map();this.stopping=false;
    for (const job of store.all('jobs')) if (job.status==='running') store.set('jobs',job.id,{...job,status:'queued',stage:'queued',updatedAt:Date.now()});
    if(autoStart)this.wake();
  }
  create(config,files,id=randomUUID()) {
    const existing=this.store.get('jobs',id);if(existing)return existing;
    const job={id,status:'queued',stage:'queued',config,sources:files.map(f=>f.originalname),model:getGeminiModel(),createdAt:Date.now(),updatedAt:Date.now(),error:null,quizId:null};
    this.store.addJob(job,files);this.wake();return job;
  }
  update(id,patch) {const job=this.store.get('jobs',id);if(!job)return null;return this.store.set('jobs',id,{...job,...patch,updatedAt:Date.now()});}
  wake() {setImmediate(()=>this.pump());}
  pump() {
    if(this.stopping||!process.env.GEMINI_API_KEY)return;
    const pending=this.store.all('jobs').filter(j=>j.status==='queued'&&!this.active.has(j.id)).sort((a,b)=>a.createdAt-b.createdAt);
    for(const job of pending) {
      if(this.active.size>=2)break;
      const controller=new AbortController();const entry={controller,promise:null};this.active.set(job.id,entry);
      entry.promise=this.run(job,controller).finally(()=>{this.active.delete(job.id);if(!this.stopping)this.wake();});
    }
  }
  async run(job,controller) {
    const timeout=setTimeout(()=>controller.abort(),180000);
    try {
      this.update(job.id,{status:'running',stage:'reading',error:null});
      const parts=[{text:buildPrompt(job.config)}];
      for(const file of this.store.files(job.id)) {controller.signal.throwIfAborted();parts.push(...await documentParts(file));}
      controller.signal.throwIfAborted();this.update(job.id,{stage:'generating'});
      const response=await this.fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(job.model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},signal:controller.signal,body:JSON.stringify(buildGeminiRequest(parts))});
      let data;try{data=await response.json();}catch{throw new Error('Gemini trả về dữ liệu không hợp lệ. Hãy thử lại.');}
      if(!response.ok)throw new Error(geminiErrorMessage(response.status,data,process.env.GEMINI_API_KEY));
      controller.signal.throwIfAborted();this.update(job.id,{stage:'validating'});
      const candidate=data.candidates?.[0];
      if(candidate?.finishReason!=='STOP')throw new Error('Gemini chưa trả về quiz hoàn chỉnh. Hãy giảm số câu hoặc chia nhỏ tài liệu.');
      let quiz;try{quiz=parseQuiz(candidate.content?.parts?.filter(p=>!p.thought&&p.text).map(p=>p.text).join(''));}catch{throw new Error('Gemini trả về quiz sai cấu trúc. Hãy thử lại hoặc giảm số câu.');}
      if(quiz.questions.some(q=>!job.config.types.includes(q.type)))throw new Error('Gemini tạo dạng câu ngoài cấu hình. Hãy thử lại.');
      if(quiz.questions.length!==job.config.count)quiz.description+=`\nLưu ý: nhận được ${quiz.questions.length}/${job.config.count} câu yêu cầu.`;
      if(this.store.get('jobs',job.id)?.status==='cancelled')return;
      this.store.transaction(()=>{const subjectId=job.config.subjectId&&this.store.get('subjects',job.config.subjectId)?job.config.subjectId:null;this.store.set('quizzes',job.id,{...quiz,id:job.id,createdAt:Date.now(),sources:job.sources,method:'gemini',subjectId});this.update(job.id,{status:'completed',stage:'completed',quizId:job.id});});
    } catch(error) {
      const currentStatus=this.store.get('jobs',job.id)?.status;
      if(currentStatus==='cancelled'||(!this.stopping&&controller.signal.aborted&&currentStatus==='queued'))return;
      if(this.stopping)this.update(job.id,{status:'queued',stage:'queued'});
      else {let message=error.name==='AbortError'?'Xử lý quá 3 phút. Hãy giảm số câu hoặc chia nhỏ tài liệu.':error.message||'Không tạo được quiz.';if(process.env.GEMINI_API_KEY)message=message.replaceAll(process.env.GEMINI_API_KEY,'[API key đã ẩn]');this.update(job.id,{status:'failed',stage:'failed',error:message});}
    } finally {clearTimeout(timeout);}
  }
  cancel(id) {const job=this.store.get('jobs',id);if(!job)throw new Error('Không tìm thấy tác vụ.');if(!['queued','running'].includes(job.status))throw new Error('Tác vụ đã kết thúc.');this.update(id,{status:'cancelled',stage:'cancelled'});this.active.get(id)?.controller.abort();return this.store.get('jobs',id);}
  retry(id) {const job=this.store.get('jobs',id);if(!job)throw new Error('Không tìm thấy tác vụ.');if(!['failed','cancelled'].includes(job.status))throw new Error('Chỉ thử lại tác vụ thất bại hoặc đã hủy.');this.update(id,{status:'queued',stage:'queued',model:getGeminiModel(),error:null});this.wake();return this.store.get('jobs',id);}
  async stop() {this.stopping=true;for(const {controller} of this.active.values())controller.abort();await Promise.all([...this.active.values()].map(e=>e.promise));}
}
