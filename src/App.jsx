import React,{useEffect,useRef,useState} from 'react';
import { Plus,ArrowLeft,ArrowRight,Check,LoaderCircle,Settings2,X,Download,BookOpen,BarChart3,Sparkles,Clock3,ChevronRight,Upload,CheckCircle2,XCircle,Flag,LayoutDashboard,FolderOpen,Search,Database,ChevronDown } from 'lucide-react';
import { buildPrompt,difficultyLabels,typeLabels,parseQuiz,isCorrect } from '../shared/quiz.js';
import { request,download,readLocal,writeLocal } from './api.js';
import { loadFiles,saveFiles } from './files.js';
import { useWorkspace } from './useWorkspace.js';
import { demoQuiz } from './demo.js';
import Dashboard from './components/Dashboard.jsx';
import Library from './components/Library.jsx';
import Subjects,{SubjectEditor} from './components/Subjects.jsx';
import { SubjectIcon,SubjectBadge,unassigned } from './subject-ui.jsx';

const date=value=>new Date(value).toLocaleDateString('vi-VN');
const time=value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
const go=route=>{window.location.hash=route;window.scrollTo({top:0});};
function useRoute(){const [route,setRoute]=useState(()=>location.hash.slice(1)||'dashboard');useEffect(()=>{const update=()=>setRoute(location.hash.slice(1)||'dashboard');window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);return route;}

export default function App(){
  const workspace=useWorkspace();const {data,commit,reload,error,setError,sync,operate,resultId,setResultId}=workspace;
  const route=useRoute();const [health,setHealth]=useState(null);const [search,setSearch]=useState('');const [editor,setEditor]=useState(null);
  const hasJobs=data?.jobs.some(j=>['queued','running'].includes(j.status));
  useEffect(()=>{request('/api/health').then(setHealth).catch(()=>{});},[]);
  useEffect(()=>{if(resultId){go(`result/${resultId}`);setResultId(null);}},[resultId]);
  useEffect(()=>{
    const refresh=()=>reload().catch(e=>setError(e.message));
    const timer=hasJobs?setInterval(refresh,1800):null;
    window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[hasJobs]);
  async function run(action){try{setError('');return await action();}catch(e){setError(e.message);}}
  function openEditor(subject,afterSave){setEditor({subject,afterSave});}
  function createNew(subjectId=null){if(!data)return;workspace.changeDraft({config:{...data.draft.config,subjectId}});go('new');}
  async function startSession(quizId,options){const session=await request('/api/sessions',{method:'POST',body:{...options,quizId}});commit(old=>({...old,session}));go('run');}
  const quiz=data?.quizzes.find(q=>q.id===route.split('/')[1]);
  const result=data?.attempts.find(a=>a.id===route.split('/')[1]);
  const subject=route==='subject/unassigned'?unassigned:data?.subjects.find(s=>s.id===route.split('/')[1]);
  const libraryView=route==='quizzes'||route.startsWith('subject/');
  const navigation=[{id:'dashboard',label:'Tổng quan',icon:LayoutDashboard},{id:'quizzes',label:'Thư viện quiz',icon:BookOpen},{id:'subjects',label:'Môn học',icon:FolderOpen},{id:'history',label:'Lịch sử',icon:BarChart3}];
  const active=route==='new'?'new':route==='run'||route.startsWith('quiz/')||route.startsWith('subject/')?'quizzes':route.startsWith('result/')?'history':route;
  const heading=route==='new'?'Tạo quiz':route==='run'?'Đang làm bài':navigation.find(n=>n.id===active)?.label||'Không gian học tập';
  const links=navigation.map(({id,label,icon:Icon})=><a key={id} className={active===id?'active':''} href={`#${id}`} onClick={()=>setSearch('')}><Icon size={19}/><span>{label}</span>{id==='quizzes'&&!!data?.quizzes.length&&<em>{data.quizzes.length}</em>}</a>);
  return <div className={`app ${route==='run'?'focus-mode':''}`}>
    <aside className="sidebar">
      <a className="brand" href="#dashboard"><span className="brand-icon"><BookOpen size={24}/></span><span className="brand-name">quizlab<span>.</span></span></a>
      <button className="primary sidebar-create" disabled={!data} onClick={()=>createNew(null)}><Plus size={18}/> Tạo quiz mới</button>
      <nav className="sidebar-nav" aria-label="Điều hướng chính">{links}</nav>
      <div className="sidebar-subject-heading"><span className="sidebar-label">MÔN HỌC</span><button className="icon" disabled={!data} aria-label="Thêm môn học" onClick={()=>openEditor()}><Plus size={16}/></button></div>
      <nav className="sidebar-subjects" aria-label="Môn học">{data?.subjects.slice(0,5).map(s=><a className={route===`subject/${s.id}`?'active':''} href={`#subject/${s.id}`} key={s.id} onClick={()=>setSearch('')}><span className={`subject-dot tone-${s.color}`}/><span>{s.name}</span><em>{data.quizzes.filter(q=>q.subjectId===s.id).length}</em></a>)}{!data?.subjects.length&&<button className="add-first-subject" disabled={!data} onClick={()=>openEditor()}><Plus size={14}/> Thêm môn đầu tiên</button>}{!!data?.subjects.length&&<a href="#subjects" className="all-subjects">Xem tất cả môn <ArrowRight size={12}/></a>}</nav>
    </aside>
    <div className="workspace">
      <header className="header"><a className="mobile-brand" href="#dashboard"><BookOpen size={22}/><strong>quizlab.</strong></a><div className="header-location"><strong>{heading}</strong></div><div className="header-right">{!libraryView&&route!=='run'&&<form className="global-search" onSubmit={e=>{e.preventDefault();go('quizzes');}}><Search size={16}/><input aria-label="Tìm quiz" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm quiz của bạn…"/><kbd>↵</kbd></form>}<span className={`connection-pill ${health?.geminiConfigured?'ready':''}`} title={health?.geminiConfigured?'Đã cấu hình API key':'Thêm API key trong .env'}><i/>{health?.geminiConfigured?'Gemini':'Chưa cấu hình AI'}</span><Settings health={health}/></div></header>
      <main className={route==='run'?'main reading':`main ${route==='new'?'creating':''}`}>
        {error&&<div className="notice error" role="alert"><span>{error}</span><button onClick={()=>{setError('');workspace.retry();}}>Thử lại</button><button className="icon" aria-label="Đóng lỗi" onClick={()=>setError('')}><X size={15}/></button></div>}
        {!data?<div className="empty"><p>{error?'Không tải được dữ liệu.':'Đang mở dữ liệu…'}</p>{error&&<button onClick={workspace.retry}>Kết nối lại</button>}</div>:<>
          {data.session&&route!=='run'&&route!=='dashboard'&&<div className="resume"><div><strong>Bài làm chưa hoàn thành</strong><p>{data.session.title} · Câu {data.session.index+1}/{data.session.questions.length}</p></div><button onClick={()=>go('run')}>Tiếp tục <ArrowRight size={15}/></button></div>}
          {route==='dashboard'?<Dashboard data={data} onCreate={createNew} onSubject={openEditor} startReview={id=>run(()=>startSession(id,{mode:'mistakes',minutes:30,shuffleQuestions:true,shuffleAnswers:true}))}><Jobs jobs={data.jobs} run={run} reload={reload}/></Dashboard>
            :route==='subjects'?<Subjects data={data} openEditor={openEditor} run={run} reload={reload}/>
            :route==='new'?<Create draft={data.draft} change={workspace.changeDraft} health={health} run={run} reload={reload} subjects={data.subjects} openEditor={openEditor}/>
            :route==='run'&&data.session?<Runner session={data.session} operate={operate} submitting={workspace.submitting}/>
            :route.startsWith('quiz/')&&quiz?<Quiz key={quiz.id} quiz={quiz} subjects={data.subjects} openEditor={openEditor} attempts={data.attempts} activeSession={data.session} run={run} update={async patch=>{await request(`/api/quizzes/${quiz.id}`,{method:'PATCH',body:patch});await reload();}} start={options=>startSession(quiz.id,options)} remove={()=>run(async()=>{if(!confirm(`Xóa “${quiz.title}”? Lịch sử làm bài vẫn được giữ.`))return;await request(`/api/quizzes/${quiz.id}`,{method:'DELETE'});await reload();go('quizzes');})}/>
            :route.startsWith('result/')&&result?<Result attempt={result} quizExists={data.quizzes.some(q=>q.id===result.quizId)}/>
            :route==='history'?<History attempts={data.attempts}/>
            :libraryView&&(!route.startsWith('subject/')||subject)?<Library key={route} data={data} subject={route.startsWith('subject/')?subject:undefined} query={search} setQuery={setSearch} onCreate={createNew}><Jobs jobs={data.jobs} run={run} reload={reload}/></Library>
            :<div className="empty"><h2>Không tìm thấy nội dung</h2><a className="button primary" href="#dashboard">Về tổng quan</a></div>}
        </>}
      </main>
      <footer><span className={`save-status ${sync.startsWith('Chưa')?'unsaved':''}`} role="status">{sync}</span></footer>
    </div>
    <nav className="mobile-nav" aria-label="Điều hướng trên điện thoại">{links}<a className={route==='new'?'active':''} href="#new"><Plus size={20}/><span>Tạo quiz</span></a></nav>
    {editor&&<SubjectEditor subject={editor.subject} onClose={()=>setEditor(null)} onSaved={async saved=>{await reload();if(editor.afterSave)await editor.afterSave(saved);setEditor(null);}}/>}
  </div>;
}

function Settings({health}){
  return <details className="settings"><summary aria-label="Cài đặt"><Settings2 size={18}/></summary><div><strong>{health?.geminiConfigured?'Gemini đã cấu hình':'Chưa cấu hình Gemini'}</strong><p>{health?.model||'Backend chưa sẵn sàng'}</p><p>Thay đổi API key hoặc model trong <code>.env</code>, rồi khởi động lại backend.</p><hr/><p>Quiz, môn học, tài liệu và tiến độ lưu ở <code>data/quizlab.sqlite</code>.</p><a className="button backup" href="/api/backup" download><Download size={13}/> Tải bản sao lưu</a></div></details>;
}

function Jobs({jobs,run,reload}){
  const visible=jobs.filter(j=>j.status!=='completed');
  if(!visible.length)return null;
  const labels={queued:'Đang chờ',reading:'Đang đọc tài liệu',generating:'Gemini đang tạo câu hỏi',validating:'Đang kiểm tra & lưu',failed:'Tạo quiz thất bại',cancelled:'Đã hủy'};
  async function action(job,verb){await request(`/api/jobs/${job.id}${verb?'/'+verb:''}`,{method:verb?'POST':'DELETE'});await reload();}
  return <section className="jobs" aria-label="Tác vụ tạo quiz">{visible.map(job=>{
    const active=['running','queued'].includes(job.status);
    return <div className={`job ${job.status==='failed'?'failed':''}`} key={job.id}>
      <div className="job-heading">{active&&<LoaderCircle className="spin" size={16}/>}<div><strong>{job.config.title||job.sources.join(', ')}</strong><p>{labels[job.stage]||job.status}</p></div>
        {active?<button onClick={()=>run(()=>action(job,'cancel'))}>Hủy</button>:<><button onClick={()=>run(()=>action(job,'retry'))}>Thử lại</button><button className="icon" aria-label="Xóa tác vụ" onClick={()=>run(()=>action(job,''))}><X size={15}/></button></>}
      </div>
      {job.error&&<p className="job-error">{job.error}</p>}
    </div>;
  })}</section>;
}

function Create({draft,change,health,run,reload,subjects,openEditor}){
  const {config,method,json}=draft;
  const [files,setFiles]=useState([]);const [ready,setReady]=useState(false);const [busy,setBusy]=useState(false);const [localError,setLocalError]=useState('');const [copied,setCopied]=useState(false);
  const fileInput=useRef(null);const jsonInput=useRef(null);
  useEffect(()=>{let mounted=true;loadFiles().then(value=>{if(mounted)setFiles(value);}).catch(()=>{if(mounted)setLocalError('Không đọc được tệp nháp trong trình duyệt. Hãy chọn lại tài liệu.');}).finally(()=>{if(mounted)setReady(true);});return()=>{mounted=false;};},[]);
  const set=(key,value)=>change({config:{...config,[key]:value}});
  async function updateFiles(next){try{await saveFiles(next);setFiles(next);setLocalError('');}catch{setFiles(next);setLocalError('Không lưu được tệp nháp. Đừng tải lại trước khi tải tệp lên xong.');}}
  async function addFiles(selected){
    const next=[...files];let error='';
    for(const file of Array.from(selected)){
      if(!/\.(pdf|docx|pptx)$/i.test(file.name)){error='Chỉ nhận PDF, DOCX và PPTX.';continue;}
      if(!file.size||file.size>18*1024*1024){error='Tệp phải có nội dung và không vượt quá 18 MB.';continue;}
      if(next.some(f=>f.name===file.name&&f.size===file.size))continue;
      if(next.length>=5||next.reduce((n,f)=>n+f.size,0)+file.size>24*1024*1024){error='Tối đa 5 tệp, tổng dung lượng 24 MB.';continue;}
      next.push(file);
    }
    await updateFiles(next);if(error)setLocalError(error);
  }
  async function submit(){
    setBusy(true);setLocalError('');
    await run(async()=>{
      if(method==='manual'){
        const quiz=await request('/api/quizzes',{method:'POST',body:{quiz:parseQuiz(json),method:'manual',subjectId:config.subjectId||null}});
        change({json:''});await reload();go(`quiz/${quiz.id}`);return;
      }
      if(!files.length)throw new Error('Hãy chọn tài liệu trước.');
      const body=new FormData();files.forEach(f=>body.append('documents',f));body.append('config',JSON.stringify(config));
      const signature=JSON.stringify({config,files:files.map(f=>[f.name,f.size,f.lastModified])});
      let key=readLocal('quizlab.v2.uploadKey');if(key?.signature!==signature){key={id:crypto.randomUUID(),signature};writeLocal('quizlab.v2.uploadKey',key);}
      await request('/api/jobs',{method:'POST',body,headers:{'Idempotency-Key':key.id}});
      // The server has committed the upload before the draft is cleared.
      localStorage.removeItem('quizlab.v2.uploadKey');
      try{await saveFiles([]);}catch{}
      setFiles([]);await reload();go('quizzes');
    });setBusy(false);
  }
  async function copy(){try{await navigator.clipboard.writeText(buildPrompt(config));setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{setLocalError('Không sao chép được. Mở “Xem prompt” và sao chép thủ công.');}}
  return <div className="form-page">
    <div className="page-title"><div className="title-group"><span className="section-icon purple"><Sparkles size={23}/></span><h1>Tạo quiz</h1></div></div>
    <div className="method-tabs" role="group" aria-label="Cách tạo quiz"><button disabled={busy} className={method==='gemini'?'selected':''} onClick={()=>change({method:'gemini'})}><Sparkles size={16}/> Gemini</button><button disabled={busy} className={method==='manual'?'selected':''} onClick={()=>change({method:'manual'})}><BookOpen size={16}/> Nhập từ LLM</button></div>
    <SubjectSelect subjects={subjects} value={config.subjectId} onChange={value=>set('subjectId',value)} onCreate={()=>openEditor(undefined,saved=>set('subjectId',saved.id))}/>
    <div className="form-grid">
      <label>Số câu<select disabled={busy} value={config.count} onChange={e=>set('count',Number(e.target.value))}>{[...new Set([3,5,10,15,20,25,30,40,50,config.count])].sort((a,b)=>a-b).map(n=><option key={n} value={n}>{n} câu</option>)}</select></label>
      <label>Độ khó<select disabled={busy} value={config.difficulty} onChange={e=>set('difficulty',e.target.value)}>{Object.entries(difficultyLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      <label>Ngôn ngữ<select disabled={busy} value={config.language} onChange={e=>set('language',e.target.value)}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label>
    </div>
    <fieldset disabled={busy}><legend>Dạng câu hỏi</legend><div className="checks">{Object.entries(typeLabels).map(([id,label])=><label key={id}><input type="checkbox" checked={config.types.includes(id)} onChange={e=>{if(!e.target.checked&&config.types.length===1)return;set('types',e.target.checked?[...config.types,id]:config.types.filter(t=>t!==id));}}/>{label}</label>)}</div></fieldset>
    <details className="advanced"><summary>Thêm tên & nội dung trọng tâm</summary><label>Tên quiz<input disabled={busy} value={config.title} maxLength={160} placeholder="Để trống để AI đặt tên" onChange={e=>set('title',e.target.value)}/></label><label>Nội dung trọng tâm<textarea disabled={busy} value={config.focus} maxLength={4000} rows={3} placeholder="Ví dụ: phân biệt các khái niệm dễ nhầm trong chương 2" onChange={e=>set('focus',e.target.value)}/></label></details>
    {method==='gemini'?<section className="upload-section">
      <label>Tài liệu</label><input hidden ref={fileInput} type="file" accept=".pdf,.docx,.pptx" multiple disabled={busy||!ready} onChange={e=>{addFiles(e.target.files);e.target.value='';}}/>
      <button className="file-picker" disabled={busy||!ready} onClick={()=>fileInput.current.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy&&ready)addFiles(e.dataTransfer.files);}}><span className="upload-icon"><Upload size={24}/></span><span>Chọn hoặc kéo thả PDF, DOCX, PPTX</span></button>
      <p className="hint">Tối đa 5 tệp · 18 MB/tệp · Tổng 24 MB.</p>
      {files.length>0&&<ul className="files">{files.map((f,i)=><li key={`${f.name}-${f.size}`}><span>{f.name}<small>{(f.size/1024/1024).toFixed(1)} MB</small></span><button className="icon" disabled={busy} aria-label={`Bỏ ${f.name}`} onClick={()=>updateFiles(files.filter((_,n)=>n!==i))}><X size={15}/></button></li>)}</ul>}
      {health&&!health.geminiConfigured&&<p className="hint warning">Thêm GEMINI_API_KEY vào .env và khởi động lại backend để dùng Gemini.</p>}
    </section>:<section className="manual-section">
      <div className="inline-actions"><button onClick={copy}>{copied?'Đã sao chép':'Sao chép prompt'}</button><button onClick={()=>download('quizlab-prompt.txt',buildPrompt(config),'text/plain')}>Tải prompt</button></div>
      <p className="hint">Gửi prompt cùng tài liệu cho LLM, rồi nhập JSON trả về.</p>
      <details className="prompt"><summary>Xem prompt</summary><textarea readOnly rows={10} value={buildPrompt(config)} aria-label="Prompt cho LLM"/></details>
      <div className="json-heading"><label htmlFor="json">Quiz JSON</label><div><button className="link" onClick={()=>jsonInput.current.click()}>Chọn tệp</button><button className="link" onClick={()=>download('quizlab-example.json',demoQuiz)}>JSON mẫu</button></div></div>
      <input hidden ref={jsonInput} type="file" accept=".json,application/json" onChange={async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;if(f.size>4*1024*1024){setLocalError('JSON tối đa 4 MB.');return;}change({json:await f.text()});}}/>
      <textarea id="json" className="json-input" rows={10} maxLength={4*1024*1024} value={json} onChange={e=>change({json:e.target.value})} placeholder={'{ "version": 1, "title": "…", "questions": […] }'} spellCheck={false}/>
    </section>}
    {localError&&<p className="error-text" role="alert">{localError}</p>}
    <div className="form-bottom"><button className="primary" disabled={busy||!ready||(method==='manual'&&!json.trim())} onClick={submit}>{busy?<><LoaderCircle size={15} className="spin"/>{method==='gemini'?'Đang lưu tài liệu…':'Đang lưu quiz…'}</>:method==='gemini'?'Tạo quiz':'Kiểm tra & lưu quiz'}</button>{busy&&<span className="hint">Đợi tải tệp xong trước khi đóng trang.</span>}</div>
  </div>;
}

function Quiz({quiz,subjects,openEditor,attempts,activeSession,run,start,remove,update}){
  const [mode,setMode]=useState('practice');const [minutes,setMinutes]=useState(Math.max(5,quiz.questions.length*2));const [shuffle,setShuffle]=useState(true);const [busy,setBusy]=useState(false);
  const latest=attempts.find(a=>a.quizId===quiz.id);const mistakes=latest?.wrongIds.length||0;
  return <>
    <a className="back" href="#quizzes"><ArrowLeft size={14}/> Quiz</a>
    <div className="quiz-title"><SubjectBadge subject={subjects.find(s=>s.id===quiz.subjectId)}/><h1>{quiz.title}</h1><p>{quiz.questions.length} câu · {date(quiz.createdAt)}</p></div>
    <div className="quiz-organization"><SubjectSelect subjects={subjects} value={quiz.subjectId} onChange={value=>run(()=>update({subjectId:value}))} onCreate={()=>openEditor(undefined,saved=>update({subjectId:saved.id}))}/></div>
    <div className="start-bar"><label className="sr-only" htmlFor="mode">Chế độ làm bài</label><select id="mode" value={mode} onChange={e=>setMode(e.target.value)}><option value="practice">Luyện tập</option><option value="exam">Thi thử</option><option value="mistakes" disabled={!mistakes}>Ôn câu sai{mistakes?` (${mistakes})`:''}</option></select>{mode==='exam'&&<label className="minutes"><input aria-label="Thời gian thi (phút)" type="number" min={1} max={240} value={minutes} onChange={e=>setMinutes(e.target.value)}/> phút</label>}<button className="primary" disabled={busy||!!activeSession||(mode==='exam'&&(!minutes||minutes<1||minutes>240))} onClick={async()=>{setBusy(true);await run(()=>start({mode,minutes:Number(minutes),shuffleQuestions:shuffle,shuffleAnswers:shuffle}));setBusy(false);}}>{busy?'Đang mở…':'Bắt đầu'} <ArrowRight size={15}/></button></div>
    <label className="check"><input type="checkbox" checked={shuffle} onChange={e=>setShuffle(e.target.checked)}/>Đảo câu hỏi và đáp án</label>
    <div className="quiz-actions"><button className="link" onClick={()=>download('quizlab-quiz.json',quiz)}><Download size={13}/> Xuất JSON</button><button className="link danger" onClick={remove}>Xóa quiz</button></div>
    <details className="metadata"><summary>Mô tả & tài liệu</summary><p>{quiz.description}</p>{quiz.sources?.map((s,i)=><p key={i}>{s}</p>)}</details>
    <section className="preview"><h2>Câu hỏi</h2>{quiz.questions.map((q,i)=><details className="review-item" key={q.id}><summary><span className="question-number">{i+1}.</span><span>{q.question}</span></summary><Review question={q}/></details>)}</section>
  </>;
}

function Runner({session,operate,submitting}){
  const [now,setNow]=useState(Date.now());const expired=useRef(false);const currentStep=useRef(null);
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
  useEffect(()=>{if(session.deadline&&now>=session.deadline&&!expired.current){expired.current=true;operate({type:'submit'});}},[now,session.deadline]);
  useEffect(()=>{currentStep.current?.scrollIntoView({block:'nearest',inline:'center'});},[session.index]);
  const q=session.questions[session.index];const selected=session.answers[q.id]||[];const checked=session.checked.includes(q.id);
  const answered=Object.values(session.answers).filter(a=>a.length).length;
  function choose(i){operate({type:'answer',questionId:q.id,answer:q.type==='multiple'?(selected.includes(i)?selected.filter(v=>v!==i):[...selected,i]):[i]});}
  function submit(){if(confirm(`Nộp bài? Đã trả lời ${answered}/${session.questions.length} câu.`))operate({type:'submit'});}
  return <section className="runner">
    <div className="exam-toolbar">
      <a className="exam-exit" href="#quizzes"><XCircle size={18}/> Để sau</a>
      <div className="step-bar"><nav className="step-track" aria-label="Danh sách câu hỏi">{session.questions.map((item,i)=>{
        const reviewed=session.checked.includes(item.id);const correct=reviewed&&isCorrect(item,session.answers[item.id]);
        return <button key={item.id} ref={i===session.index?currentStep:null} disabled={submitting} aria-label={`Câu ${i+1}${reviewed?(correct?', đúng':', sai'):session.answers[item.id]?.length?', đã trả lời':''}${session.flags.includes(item.id)?', đã đánh dấu':''}`} aria-current={i===session.index?'step':undefined} className={`step ${reviewed?(correct?'right':'wrong'):session.answers[item.id]?.length?'answered':''} ${i===session.index?'current':''}`} onClick={()=>operate({type:'navigate',index:i})}>{i+1}{session.flags.includes(item.id)&&<i/>}</button>;
      })}</nav><button className="step-next" disabled={submitting||session.index===session.questions.length-1} aria-label="Câu tiếp theo" onClick={()=>operate({type:'navigate',index:session.index+1})}><ChevronRight size={25}/></button></div>
      <div className={`exam-timer ${session.deadline&&session.deadline-now<60000?'urgent':''}`}><Clock3 size={19}/><span>{time(Math.max(0,Math.floor((session.deadline?session.deadline-now:now-session.startedAt)/1000)))}</span></div>
    </div>
    <h1 className="running-title">{session.title}</h1>
    <div className="exam-layout">
      <section className="question-pane" aria-label="Câu hỏi hiện tại">
        <div className="question-meta"><span>{session.index+1} / {session.questions.length}</span><span className="type-badge">{typeLabels[q.type]}</span></div>
        <h2 className="question-text">{q.question}</h2>
        {q.type==='multiple'&&<p className="hint">Chọn tất cả đáp án đúng.</p>}
        <div className="question-context"><span className="topic-badge"><BookOpen size={14}/>{q.topic}</span><span className="mode-badge">{session.mode==='exam'?'Thi thử':session.mode==='mistakes'?'Ôn câu sai':'Luyện tập'}</span></div>
        <div className="question-bottom"><label className="check"><input type="checkbox" checked={session.flags.includes(q.id)} disabled={submitting} onChange={()=>operate({type:'flag',questionId:q.id})}/><Flag size={14}/> Đánh dấu câu này</label><div className="completion-label"><span>Đã trả lời</span><strong>{answered}/{session.questions.length}</strong></div><div className="completion-track"><span style={{width:`${answered/session.questions.length*100}%`}}/></div></div>
      </section>
      <section className="answer-pane" aria-label="Đáp án">
        <div className="answers">{q.options.map((option,i)=><button key={i} disabled={checked||submitting} aria-pressed={selected.includes(i)} className={`answer ${selected.includes(i)?'selected':''} ${checked&&q.answer.includes(i)?'correct':''} ${checked&&selected.includes(i)&&!q.answer.includes(i)?'incorrect':''}`} onClick={()=>choose(i)}><span className="letter">{String.fromCharCode(65+i)}</span><span>{option}</span>{checked&&q.answer.includes(i)?<Check size={18}/>:selected.includes(i)?<span className="selection-dot"/>:null}</button>)}</div>
        {checked&&<div className={`explanation feedback ${isCorrect(q,selected)?'feedback-correct':'feedback-incorrect'}`}><strong>{isCorrect(q,selected)?<CheckCircle2 size={17}/>:<XCircle size={17}/>} {isCorrect(q,selected)?'Chính xác':'Chưa chính xác'}</strong><p>{q.explanation}</p><small>{q.source}</small></div>}
        <div className="runner-controls"><div className="runner-actions"><button disabled={submitting||session.index===0} onClick={()=>operate({type:'navigate',index:session.index-1})}><ArrowLeft size={14}/> Trước</button><div>{session.mode!=='exam'&&!checked&&<button disabled={!selected.length||submitting} onClick={()=>operate({type:'check',questionId:q.id})}>Kiểm tra</button>}{session.index<session.questions.length-1?<button className="primary" disabled={submitting} onClick={()=>operate({type:'navigate',index:session.index+1})}>Tiếp <ArrowRight size={14}/></button>:<button className="primary" disabled={submitting} onClick={submit}>{submitting?'Đang nộp…':'Nộp bài'}</button>}</div></div><div className="runner-secondary"><button className="link" disabled={submitting} onClick={submit}>Nộp bài</button></div></div>
      </section>
    </div>
  </section>;
}

function Result({attempt,quizExists}){
  const [wrongOnly,setWrongOnly]=useState(false);
  return <>
    <a className="back" href="#history"><ArrowLeft size={14}/> Lịch sử</a><div className="result-heading"><span className={`result-score ${attempt.percent>=80?'high':attempt.percent>=50?'medium':'low'}`}>{attempt.percent}<small>%</small></span><div><h1>{attempt.title}</h1><p><strong>{attempt.correct}/{attempt.total} câu đúng</strong><span><Clock3 size={14}/> {time(attempt.duration)}</span></p></div></div>
    {quizExists&&<a className="button primary" href={`#quiz/${attempt.quizId}`}>Làm lại / Ôn câu sai <ArrowRight size={15}/></a>}
    <div className="review-heading"><h2>Xem lại đáp án</h2><label className="check"><input type="checkbox" checked={wrongOnly} onChange={e=>setWrongOnly(e.target.checked)}/>Chỉ câu sai</label></div>
    {attempt.questions.map((q,i)=>({q,i,correct:isCorrect(q,attempt.answers[q.id])})).filter(({correct})=>!wrongOnly||!correct).map(({q,i,correct})=><details className="review-item" key={q.id}><summary><span className={`result-mark ${correct?'good':'bad'}`}>{correct?'✓':'×'}</span><span>{i+1}. {q.question}</span></summary><Review question={q} answers={attempt.answers[q.id]||[]}/></details>)}
    {wrongOnly&&attempt.correct===attempt.total&&<p className="empty">Không có câu sai.</p>}
  </>;
}

function Review({question:q,answers}){
  return <div className="review-content"><div className="review-options">{q.options.map((o,i)=><div key={i} className={`${q.answer.includes(i)?'correct':''} ${answers?.includes(i)&&!q.answer.includes(i)?'incorrect':''}`}><span className="letter">{String.fromCharCode(65+i)}</span><span>{o}</span>{q.answer.includes(i)&&<Check size={14}/>}</div>)}</div>{answers&&!answers.length&&<p className="hint">Chưa trả lời.</p>}<div className="explanation"><p>{q.explanation}</p><small>{q.source}</small></div></div>;
}

function History({attempts}){
  return <><div className="page-title"><div className="title-group"><span className="section-icon mint"><BarChart3 size={23}/></span><div><h1>Lịch sử</h1><p className="hint">{attempts.length} lượt làm bài</p></div></div></div>{!attempts.length?<div className="empty"><p>Chưa có bài đã nộp.</p></div>:<div className="list">{attempts.map(a=><a className="history-row" href={`#result/${a.id}`} key={a.id}><span className={`history-icon ${a.percent>=80?'high':a.percent>=50?'medium':'low'}`}>{a.percent>=80?<CheckCircle2 size={22}/>:<BarChart3 size={22}/>}</span><div><h2>{a.title}</h2><p>{date(a.completedAt)} · {a.mode==='exam'?'Thi thử':a.mode==='mistakes'?'Ôn câu sai':'Luyện tập'} · {a.correct}/{a.total} câu</p></div><strong className={`score-chip ${a.percent>=80?'high':a.percent>=50?'medium':'low'}`}>{a.percent}%</strong><ChevronRight size={17}/></a>)}</div>}</>;
}

function SubjectSelect({subjects,value,onChange,onCreate}){
  const id=React.useId();
  return <div className="subject-field"><label htmlFor={id}>Môn học</label><div className="subject-field-controls"><select id={id} value={value||''} onChange={e=>onChange(e.target.value||null)}><option value="">Chưa phân loại</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button type="button" onClick={onCreate}><Plus size={15}/> Thêm môn</button></div></div>;
}
