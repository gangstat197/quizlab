import { useEffect, useRef, useState } from 'react';
import { configSchema, defaultConfig } from '../shared/quiz.js';
import { applyOperation } from '../shared/session.js';
import { request,readLocal,writeLocal } from './api.js';

const OUTBOX='quizlab.v2.outbox';
const LOCAL_DRAFT='quizlab.v2.draft';
function overlay(session,pending){
  if(!session)return null;
  for(const entry of pending.filter(e=>e.sessionId===session.id))try{session=applyOperation(session,entry.operation);}catch{}
  return session;
}

export function useWorkspace(){
  const [data,setData]=useState(null);const ref=useRef(null);const revision=useRef(0);
  const [error,setError]=useState('');const [sync,setSync]=useState('Đang tải…');const [resultId,setResultId]=useState(null);
  const pending=useRef(readLocal(OUTBOX,[]));const flushing=useRef(false);const stopped=useRef(false);const draftTimer=useRef(null);const draftAck=useRef(0);
  function commit(value){const next=typeof value==='function'?value(ref.current):value;revision.current++;ref.current=next;setData(next);}
  async function reload(){
    const before=revision.current;
    const next=await request('/api/state');
    if(!next.storeId||!Array.isArray(next.quizzes)||!Array.isArray(next.subjects))throw new Error('Hãy khởi động lại backend để cập nhật phiên bản dashboard và môn học.');
    const currentDraft=ref.current?.draft;
    if(currentDraft?.updatedAt>next.draft.updatedAt)next.draft=currentDraft;
    // A slow poll must never roll back an answer acknowledged while it was in flight.
    if(ref.current&&before!==revision.current){next.session=ref.current.session;next.attempts=ref.current.attempts;}
    const previousSession=ref.current?.session;
    if(previousSession&&!next.session&&next.attempts.some(a=>a.id===previousSession.id))setResultId(previousSession.id);
    commit({...next,session:overlay(next.session,pending.current)});return next;
  }
  async function flush(){
    if(flushing.current||!ref.current||stopped.current)return;
    flushing.current=true;
    try{
      while(pending.current.length&&!stopped.current){
        setSync(`Đang lưu ${pending.current.length} thay đổi…`);
        const entry=pending.current[0];
        const result=await request(`/api/sessions/${entry.sessionId}/ops`,{method:'POST',body:entry.operation});
        const remaining=pending.current.filter(e=>e.operation.id!==entry.operation.id);
        writeLocal(OUTBOX,remaining);pending.current=remaining;
        commit(old=>({...old,session:overlay(result.session,remaining),attempts:result.attempt?[result.attempt,...old.attempts.filter(a=>a.id!==result.attempt.id)]:old.attempts}));
        if(result.attempt)setResultId(result.attempt.id);
      }
      if(!pending.current.length)setSync(draftAck.current>=ref.current.draft.updatedAt?'Đã lưu':'Bản nháp đang lưu…');
    }catch(e){setError(e.message);setSync(`Chưa đồng bộ (${pending.current.length})`);}
    finally{flushing.current=false;}
  }
  function operate(operation){
    if(!ref.current?.session)return;
    const session=ref.current.session;
    if(pending.current.some(e=>e.sessionId===session.id&&e.operation.type==='submit'))return;
    try{
      const op={...operation,id:crypto.randomUUID()};const next=applyOperation(session,op);
      const entries=[...pending.current,{sessionId:session.id,operation:op}];
      // Write-ahead browser outbox covers refreshes while a disk write is in flight.
      writeLocal(OUTBOX,entries);pending.current=entries;commit(old=>({...old,session:next}));setSync('Đang lưu…');void flush();
    }catch(e){setError(e.message);}
  }
  function changeDraft(change){
    const draft={...ref.current.draft,...change,updatedAt:Math.max(Date.now(),ref.current.draft.updatedAt+1)};
    commit(old=>({...old,draft}));
    try{writeLocal(LOCAL_DRAFT,draft);}catch{setError('Không lưu được bản nháp trên trình duyệt. Hãy đợi xác nhận lưu xuống máy trước khi tải lại.');}
    clearTimeout(draftTimer.current);setSync('Đang lưu…');
    draftTimer.current=setTimeout(()=>{request('/api/draft',{method:'PUT',body:draft}).then(()=>{draftAck.current=Math.max(draftAck.current,draft.updatedAt);if(!pending.current.length&&draftAck.current>=ref.current.draft.updatedAt)setSync('Đã lưu');}).catch(e=>{setError(e.message);setSync('Bản nháp chưa đồng bộ');});},450);
  }
  async function initialize(){
    setError('');
    try{
      let state=await request('/api/state');
      if(!state.storeId||!Array.isArray(state.quizzes)||!Array.isArray(state.subjects))throw new Error('Hãy khởi động lại backend để cập nhật phiên bản dashboard và môn học.');
      if(readLocal('quizlab.v2.migratedStore')!==state.storeId){
        await request('/api/migrate',{method:'POST',body:{library:readLocal('quizlab.v1.library',[]),attempts:readLocal('quizlab.v1.attempts',[]),session:readLocal('quizlab.v1.session')}});
        try{writeLocal('quizlab.v2.migratedStore',state.storeId);}catch{}
        state=await request('/api/state');
      }
      let draft=readLocal(LOCAL_DRAFT);
      if(!draft&&state.draft.updatedAt===0){const oldConfig=configSchema.safeParse(readLocal('quizlab.v1.config',defaultConfig));draft={...state.draft,config:oldConfig.success?oldConfig.data:defaultConfig,updatedAt:Date.now()};}
      if(draft?.config?.subjectId&&!state.subjects.some(s=>s.id===draft.config.subjectId)){draft={...draft,config:{...draft.config,subjectId:null},updatedAt:Math.max(Date.now(),draft.updatedAt+1)};try{writeLocal(LOCAL_DRAFT,draft);}catch{}}
      if(draft&&draft.updatedAt>state.draft.updatedAt&&configSchema.safeParse(draft.config).success){await request('/api/draft',{method:'PUT',body:draft});state.draft=draft;}
      if(stopped.current)return;
      draftAck.current=state.draft.updatedAt;
      commit({...state,session:overlay(state.session,pending.current)});setSync(pending.current.length?'Đang đồng bộ…':'Đã lưu');void flush();
      if(location.hash==='#run'&&!state.session&&state.attempts.length)setResultId(state.attempts[0].id);
    }catch(e){if(!stopped.current)setError(e.status===404?'Backend đang chạy phiên bản cũ. Dừng lệnh hiện tại và chạy lại npm run dev.':e.message);}
  }
  useEffect(()=>{
    stopped.current=false;void initialize();
    const timer=setInterval(()=>{
      if(pending.current.length)void flush();
      const draft=readLocal(LOCAL_DRAFT);
      if(draft&&ref.current&&draft.updatedAt>draftAck.current&&!pending.current.length){
        request('/api/draft',{method:'PUT',body:draft}).then(()=>{draftAck.current=Math.max(draftAck.current,draft.updatedAt);if(!pending.current.length&&draftAck.current>=ref.current.draft.updatedAt)setSync('Đã lưu');}).catch(()=>{});
      }
    },3000);
    return()=>{stopped.current=true;clearInterval(timer);clearTimeout(draftTimer.current);};
  },[]);
  return {data,commit,reload,error,setError,sync,operate,resultId,setResultId,changeDraft,retry:()=>ref.current?flush():initialize(),submitting:pending.current.some(e=>e.operation.type==='submit')};
}
