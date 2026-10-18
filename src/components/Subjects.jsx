import React,{useEffect,useRef,useState} from 'react';
import { Plus,ArrowUpRight,PenLine,Trash2,X,BookOpen } from 'lucide-react';
import { subjectColors,subjectIcons } from '../../shared/subjects.js';
import { subjectSummary } from '../../shared/analytics.js';
import { SubjectIcon,unassigned,colorLabels,iconLabels,icons } from '../subject-ui.jsx';
import { request } from '../api.js';

export function SubjectCard({subject,quizzes,attempts,onEdit,compact=false}){
  const stats=subjectSummary(subject.id,quizzes,attempts);
  return <article className={`subject-card tone-${subject.color} ${compact?'compact':''}`}>
    <a href={`#subject/${subject.id||'unassigned'}`} className="subject-card-link"><div className="subject-card-top"><SubjectIcon subject={subject} size={25}/>{!onEdit&&<ArrowUpRight size={17}/>}</div><h3>{subject.name}</h3><p>{stats.quizzes.length} quiz <span>·</span> {stats.questionCount} câu hỏi</p><div className="subject-progress-label"><span>Đã luyện {stats.studied}/{stats.quizzes.length} quiz</span><strong>{stats.progress}%</strong></div><div className="subject-progress"><span style={{width:`${stats.progress}%`}}/></div></a>
    {onEdit&&subject.id&&<button className="subject-edit icon" aria-label={`Sửa môn ${subject.name}`} onClick={()=>onEdit(subject)}><PenLine size={14}/></button>}
  </article>;
}

export default function Subjects({data,openEditor,run,reload}){
  const [query,setQuery]=useState('');
  const list=data.subjects.filter(s=>s.name.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
  async function remove(subject){
    const count=data.quizzes.filter(q=>q.subjectId===subject.id).length;
    if(!confirm(`Xóa môn “${subject.name}”? ${count} quiz sẽ chuyển sang Chưa phân loại. Quiz và lịch sử vẫn được giữ.`))return;
    await request(`/api/subjects/${subject.id}`,{method:'DELETE'});await reload();
  }
  return <>
    <div className="page-title"><div><h1>Môn học</h1></div><button className="primary" onClick={()=>openEditor()}><Plus size={17}/>Thêm môn học</button></div>
    {data.subjects.length>6&&<input className="subject-search" aria-label="Tìm môn học" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm môn học…"/>}
    {!data.subjects.length&&<section className="onboarding-card"><span className="section-icon purple"><BookOpen size={26}/></span><h2>Chưa có môn học</h2><div className="subject-suggestions">{[{name:'Hệ điều hành',icon:'code',color:'blue'},{name:'Toán học',icon:'calculator',color:'purple'},{name:'Tiếng Anh',icon:'languages',color:'orange'}].map(s=><button key={s.name} onClick={()=>openEditor(s)}><Plus size={13}/>{s.name}</button>)}</div></section>}
    <div className="subjects-grid">{list.map(subject=><div className="managed-subject" key={subject.id}><SubjectCard subject={subject} quizzes={data.quizzes} attempts={data.attempts} onEdit={openEditor}/><div className="subject-management"><a href={`#subject/${subject.id}`}>Mở môn học <ArrowUpRight size={12}/></a><button className="icon" aria-label={`Xóa môn ${subject.name}`} onClick={()=>run(()=>remove(subject))}><Trash2 size={14}/></button></div></div>)}
      {(!query||unassigned.name.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')))&&<SubjectCard subject={unassigned} quizzes={data.quizzes} attempts={data.attempts}/>}
    </div>
    {query&&!list.length&&!unassigned.name.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))&&<div className="empty"><h2>Không tìm thấy môn học</h2></div>}
  </>;
}

export function SubjectEditor({subject,onClose,onSaved}){
  const [name,setName]=useState(subject?.name||'');const [color,setColor]=useState(subject?.color||'blue');const [icon,setIcon]=useState(subject?.icon||'book');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const dialog=useRef(null);
  useEffect(()=>{dialog.current.showModal();return()=>dialog.current?.close();},[]);
  async function save(e){e.preventDefault();setBusy(true);setError('');try{const saved=await request(`/api/subjects${subject?.id?'/'+subject.id:''}`,{method:subject?.id?'PATCH':'POST',body:{name,color,icon}});await onSaved(saved);}catch(e){setError(e.message);setBusy(false);}}
  function radioKeys(e){if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...e.currentTarget.querySelectorAll('button')];let index=buttons.indexOf(document.activeElement);index=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+buttons.length)%buttons.length;buttons[index]?.focus();buttons[index]?.click();}
  return <dialog ref={dialog} className="subject-dialog" onCancel={e=>{if(busy)e.preventDefault();else onClose();}} onClick={e=>{if(e.target===dialog.current&&!busy)onClose();}} aria-labelledby="subject-dialog-title"><form onSubmit={save}>
    <div className="dialog-heading"><h2 id="subject-dialog-title">{subject?.id?'Chỉnh sửa môn học':'Thêm môn học'}</h2><button type="button" className="icon" aria-label="Đóng" disabled={busy} onClick={onClose}><X size={19}/></button></div>
    <div className={`subject-preview tone-${color}`}><SubjectIcon subject={{id:'preview',color,icon}} size={30}/><strong>{name.trim()||'Môn học mới'}</strong></div>
    <label className="field-label" htmlFor="subject-name">Tên môn học</label><input id="subject-name" autoFocus required maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Ví dụ: Hệ điều hành" disabled={busy}/>
    <fieldset disabled={busy}><legend>Màu sắc</legend><div className="color-options" role="radiogroup" aria-label="Màu môn học" onKeyDown={radioKeys}>{subjectColors.map(value=><button type="button" className={`color-choice tone-${value} ${color===value?'chosen':''}`} key={value} role="radio" tabIndex={color===value?0:-1} aria-checked={color===value} aria-label={colorLabels[value]} onClick={()=>setColor(value)}><span/>{color===value&&'✓'}</button>)}</div></fieldset>
    <fieldset disabled={busy}><legend>Biểu tượng</legend><div className="icon-options" role="radiogroup" aria-label="Biểu tượng môn học" onKeyDown={radioKeys}>{subjectIcons.map(value=>{const Icon=icons[value];return <button key={value} type="button" role="radio" tabIndex={icon===value?0:-1} aria-checked={icon===value} aria-label={iconLabels[value]} className={icon===value?'chosen':''} onClick={()=>setIcon(value)}><Icon size={21}/></button>;})}</div></fieldset>
    {error&&<p className="error-text" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Hủy</button><button type="submit" className="primary" disabled={busy||!name.trim()}>{busy?'Đang lưu…':subject?.id?'Lưu thay đổi':'Tạo môn học'}</button></div>
  </form></dialog>;
}
