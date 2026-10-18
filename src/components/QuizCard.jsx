import React from 'react';
import { ArrowUpRight,FileQuestion,Clock3,CheckCircle2 } from 'lucide-react';
import { SubjectIcon,SubjectBadge,unassigned } from '../subject-ui.jsx';
import { difficultyLabels } from '../../shared/quiz.js';

export default function QuizCard({quiz,subject,attempt}){
  const category=subject||unassigned;
  const levels=[...new Set(quiz.questions.map(q=>q.difficulty))];
  return <a className="study-card" href={`#quiz/${quiz.id}`}>
    <div className="study-card-top"><SubjectIcon subject={category}/><SubjectBadge subject={category}/></div>
    <h3>{quiz.title}</h3>
    <div className="study-card-meta"><span><FileQuestion size={14}/>{quiz.questions.length} câu hỏi</span><span className="level-tag">{levels.length===1?difficultyLabels[levels[0]]:'Nhiều mức độ'}</span></div>
    <div className="study-card-foot"><span>{attempt?<><CheckCircle2 size={13}/> Gần nhất {attempt.percent}%</>:<><Clock3 size={13}/> Chưa luyện tập</>}</span><span className="card-launch"><ArrowUpRight size={17}/></span></div>
  </a>;
}
