import React from 'react';
import { ArrowRight,Plus,BookOpen,Target,Flame,CheckCircle2,RotateCcw,ChartNoAxesCombined,FolderPlus,FileUp } from 'lucide-react';
import { learningSummary } from '../../shared/analytics.js';
import { SubjectCard } from './Subjects.jsx';
import { SubjectIcon,unassigned } from '../subject-ui.jsx';
import QuizCard from './QuizCard.jsx';

export default function Dashboard({data,onCreate,onSubject,startReview,children}){
  const summary=learningSummary(data.quizzes,data.attempts);
  const today=new Date().toLocaleDateString('vi-VN',{weekday:'long',day:'numeric',month:'long'});
  const ownSubjects=data.subjects.slice(0,4);
  const recent=summary.recent.slice(0,4);
  const weekTotal=summary.week.reduce((sum,d)=>sum+d.count,0);const max=Math.max(1,...summary.week.map(d=>d.count));
  const hasSession=!!data.session;
  return <>
    <div className="page-title dashboard-title"><div><h1>Tổng quan</h1></div><span className="today-label">{today}</span></div>
    {children}
    <div className="dashboard-grid"><div className="dashboard-main">
      {hasSession&&<section className="active-study"><div><span>Đang làm</span><h2>{data.session.title}</h2><p>Câu {data.session.index+1}/{data.session.questions.length}</p></div><a className="button primary" href="#run">Tiếp tục <ArrowRight size={15}/></a></section>}
      <section className="dashboard-metrics" aria-label="Thống kê học tập">{[{icon:BookOpen,color:'blue',value:data.quizzes.length,label:'Bộ quiz'},{icon:Target,color:'purple',value:summary.answered,label:'Câu đã trả lời'},{icon:ChartNoAxesCombined,color:'green',value:summary.accuracy===null?'—':`${summary.accuracy}%`,label:'Độ chính xác'},{icon:Flame,color:'orange',value:summary.streak,label:'Ngày liên tiếp'}].map(({icon:Icon,color,value,label})=><article className="metric-card" key={label}><span className={`metric-icon tone-${color}`}><Icon size={19}/></span><strong>{value}</strong><span className="metric-label">{label}</span></article>)}</section>
      <section className="dashboard-section"><div className="section-title"><h2>Môn học <span>{data.subjects.length}</span></h2><a href="#subjects">Xem tất cả <ArrowRight size={13}/></a></div>
        {!ownSubjects.length?<div className="compact-empty"><span className="section-icon purple"><FolderPlus size={23}/></span><div><strong>Chưa có môn học</strong></div><button onClick={()=>onSubject()}><Plus size={14}/> Thêm môn</button></div>:<div className="dashboard-subjects">{ownSubjects.map(subject=><SubjectCard key={subject.id} subject={subject} quizzes={data.quizzes} attempts={data.attempts} compact/>)}</div>}
      </section>
      <section className="dashboard-section"><div className="section-title"><h2>Quiz gần đây</h2><a href="#quizzes">Mở thư viện <ArrowRight size={13}/></a></div>{recent.length?<div className="recent-grid">{recent.map(q=><QuizCard key={q.id} quiz={q} subject={data.subjects.find(s=>s.id===q.subjectId)} attempt={summary.latest.get(q.id)}/>)}</div>:<div className="compact-empty"><span className="section-icon blue"><FileUp size={23}/></span><div><strong>Chưa có quiz</strong></div><button onClick={()=>onCreate(null)}><Plus size={14}/> Tạo quiz</button></div>}</section>
    </div><aside className="dashboard-aside">
      <section className="weekly-card"><div className="aside-card-heading"><h2>Hoạt động 7 ngày</h2><span className="weekly-icon"><Flame size={18}/></span></div><div className="weekly-total"><strong>{weekTotal}</strong><span>lượt làm bài</span></div><figure className="weekly-chart"><figcaption className="sr-only">Số lượt làm bài đã nộp theo ngày trong 7 ngày gần nhất</figcaption><div className="week-bars">{summary.week.map(day=><div className={`week-day ${day.today?'today':''}`} key={day.key} title={`${new Date(day.timestamp).toLocaleDateString('vi-VN')}: ${day.count} lượt`}><span className="week-value">{day.count}</span><div className="week-column"><span style={{height:day.count?`${Math.max(10,day.count/max*100)}%`:'4px'}} className={day.count?'has-activity':''}/></div><span className="week-label">{new Date(day.timestamp).toLocaleDateString('vi-VN',{weekday:'short'}).replace('Th ','T')}</span></div>)}</div></figure></section>
      <section className="review-suggestions"><div className="aside-card-heading"><h2>Ôn câu sai</h2><span className="review-icon"><RotateCcw size={17}/></span></div>{summary.review.length?<div className="review-suggestion-list">{summary.review.slice(0,3).map(({quiz,attempt})=><article key={quiz.id}><SubjectIcon subject={data.subjects.find(s=>s.id===quiz.subjectId)||unassigned} size={18}/><div><strong>{quiz.title}</strong><span>{attempt.wrongIds.length} câu cần ôn</span><button disabled={hasSession} title={hasSession?'Hoàn thành bài đang làm trước khi bắt đầu lượt ôn mới':undefined} onClick={()=>startReview(quiz.id)}>Ôn câu sai <ArrowRight size={12}/></button></div></article>)}</div>:<div className="no-review"><CheckCircle2 size={29}/><strong>{data.attempts.length?'Không có câu cần ôn':'Chưa có kết quả'}</strong></div>}</section>
    </aside></div>
  </>;
}
