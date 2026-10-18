import React from 'react';
import { BookOpen,Code2,Calculator,Languages,FlaskConical,Globe2,Brain,FolderOpen } from 'lucide-react';

export const icons={book:BookOpen,code:Code2,calculator:Calculator,languages:Languages,flask:FlaskConical,globe:Globe2,brain:Brain};
export const iconLabels={book:'Sách',code:'Lập trình',calculator:'Toán học',languages:'Ngôn ngữ',flask:'Khoa học',globe:'Xã hội',brain:'Tư duy'};
export const colorLabels={blue:'Xanh dương',purple:'Tím',green:'Xanh lá',orange:'Cam',pink:'Hồng',teal:'Xanh ngọc'};
export const unassigned={id:null,name:'Chưa phân loại',color:'neutral',icon:'book'};
export function SubjectIcon({subject,size=22,className=''}){const Icon=subject?.id?(icons[subject.icon]||BookOpen):FolderOpen;return <span className={`subject-icon tone-${subject?.color||'neutral'} ${className}`}><Icon size={size}/></span>;}
export function SubjectBadge({subject}){return <span className={`subject-badge tone-${subject?.color||'neutral'}`}>{subject?.name||'Chưa phân loại'}</span>;}
