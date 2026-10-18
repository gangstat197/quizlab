import React,{useState} from 'react';
import { Plus,ArrowLeft,BookOpen,Search,SlidersHorizontal } from 'lucide-react';
import { learningSummary,subjectSummary } from '../../shared/analytics.js';
import { difficultyLabels } from '../../shared/quiz.js';
import { SubjectIcon } from '../subject-ui.jsx';
import QuizCard from './QuizCard.jsx';

export default function Library({data,subject,query,setQuery,onCreate,children}){
  const [status,setStatus]=useState('all');const [difficulty,setDifficulty]=useState('all');const [sort,setSort]=useState('newest');
  const summary=learningSummary(data.quizzes,data.attempts);
  const own=subject?subjectSummary(subject.id,data.quizzes,data.attempts):null;
  const source=own?.quizzes||data.quizzes;
  const list=source.filter(q=>(q.title+' '+q.description).toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')))
    .filter(q=>status==='all'||(status==='new'?!summary.latest.has(q.id):summary.latest.has(q.id)))
    .filter(q=>difficulty==='all'||q.questions.some(item=>item.difficulty===difficulty))
    .sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'vi'):sort==='oldest'?a.createdAt-b.createdAt:sort==='activity'?(summary.latest.get(b.id)?.completedAt||b.createdAt)-(summary.latest.get(a.id)?.completedAt||a.createdAt):b.createdAt-a.createdAt);
  const filtered=!!query||status!=='all'||difficulty!=='all';
  const changeSubject=value=>{window.location.hash=value==='all'?'quizzes':`subject/${value}`;};
  return <>
    {subject&&<a className="back library-back" href="#subjects"><ArrowLeft size={14}/> Môn học</a>}
    <div className="page-title"><div className="title-group">{subject&&<SubjectIcon subject={subject} size={26}/>}<div><h1>{subject?.name||'Thư viện quiz'}</h1>{subject&&<p className="page-description">{source.length} quiz · {own.questionCount} câu hỏi</p>}</div></div><button className="primary" onClick={()=>onCreate(subject?.id||null)}><Plus size={17}/>Tạo quiz</button></div>
    {children}
    <section className="library-tools" aria-label="Bộ lọc thư viện">
      <div className="library-search"><Search size={17}/><input aria-label="Tìm kiếm quiz trong thư viện" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm tên hoặc nội dung quiz…"/>{query&&<button className="link" onClick={()=>setQuery('')}>Xóa</button>}</div>
      <div className="library-filters"><span className="filter-caption"><SlidersHorizontal size={15}/> Lọc theo</span>
        <label><span className="sr-only">Môn học</span><select value={subject?(subject.id||'unassigned'):'all'} onChange={e=>changeSubject(e.target.value)}><option value="all">Tất cả môn học</option>{data.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}<option value="unassigned">Chưa phân loại</option></select></label>
        <label><span className="sr-only">Trạng thái luyện tập</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Mọi trạng thái</option><option value="new">Chưa luyện</option><option value="studied">Đã luyện</option></select></label>
        <label><span className="sr-only">Độ khó</span><select value={difficulty} onChange={e=>setDifficulty(e.target.value)}><option value="all">Mọi độ khó</option>{Object.entries(difficultyLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      </div>
    </section>
    <div className="library-count"><span>{list.length} bộ quiz{filtered?` / ${source.length}`:''}</span><div>{filtered&&<button className="link" onClick={()=>{setQuery('');setStatus('all');setDifficulty('all');}}>Xóa bộ lọc</button>}<label><span className="sr-only">Sắp xếp quiz</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Mới nhất</option><option value="activity">Hoạt động gần nhất</option><option value="oldest">Cũ nhất</option><option value="title">Tên A–Z</option></select></label></div></div>
    {!source.length?<div className="empty library-empty"><span className="empty-icon"><BookOpen size={33}/></span><h2>Chưa có quiz</h2><button className="primary" onClick={()=>onCreate(subject?.id||null)}><Plus size={15}/> Tạo quiz</button></div>:!list.length?<div className="empty"><span className="empty-icon"><Search size={29}/></span><h2>Chưa tìm thấy quiz phù hợp</h2><button onClick={()=>{setQuery('');setStatus('all');setDifficulty('all');}}>Xóa bộ lọc</button></div>:<div className="study-grid">{list.map(q=><QuizCard key={q.id} quiz={q} subject={data.subjects.find(s=>s.id===q.subjectId)} attempt={summary.latest.get(q.id)}/>)}</div>}
  </>;
}
