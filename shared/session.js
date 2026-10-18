import { z } from 'zod';
import { isCorrect, grade } from './quiz.js';

export const operationSchema = z.discriminatedUnion('type', [
  z.object({id:z.string().uuid(),type:z.literal('answer'),questionId:z.string(),answer:z.array(z.number().int().min(0)).max(6)}),
  z.object({id:z.string().uuid(),type:z.literal('check'),questionId:z.string()}),
  z.object({id:z.string().uuid(),type:z.literal('flag'),questionId:z.string()}),
  z.object({id:z.string().uuid(),type:z.literal('navigate'),index:z.number().int().min(0)}),
  z.object({id:z.string().uuid(),type:z.literal('submit')}),
]);

export function applyOperation(session, operation) {
  if (operation.type==='submit') return session;
  if (operation.type==='navigate') {
    if (operation.index>=session.questions.length) throw new Error('Câu hỏi không tồn tại.');
    return {...session,index:operation.index};
  }
  const question=session.questions.find(q=>q.id===operation.questionId);
  if (!question) throw new Error('Câu hỏi không tồn tại.');
  if (operation.type==='answer') {
    if (session.checked.includes(question.id)) throw new Error('Đáp án đã kiểm tra không thể thay đổi.');
    if (new Set(operation.answer).size!==operation.answer.length || operation.answer.some(i=>i>=question.options.length) || (question.type!=='multiple'&&operation.answer.length>1)) throw new Error('Đáp án không hợp lệ.');
    return {...session,answers:{...session.answers,[question.id]:operation.answer}};
  }
  if (operation.type==='check') {
    if (session.mode==='exam') throw new Error('Chỉ xem đáp án sau khi nộp bài thi.');
    if (!session.answers[question.id]?.length) throw new Error('Hãy chọn đáp án trước.');
    return {...session,checked:[...new Set([...session.checked,question.id])]};
  }
  return {...session,flags:session.flags.includes(question.id)?session.flags.filter(id=>id!==question.id):[...session.flags,question.id]};
}

export function makeAttempt(session, completedAt=Date.now()) {
  const end=session.deadline?Math.min(completedAt,session.deadline):completedAt;
  return {...grade(session.questions,session.answers),id:session.id,quizId:session.quizId,title:session.title,mode:session.mode,
    completedAt:end,duration:Math.max(1,Math.round((end-session.startedAt)/1000)),questions:session.questions,answers:session.answers,
    wrongIds:session.questions.filter(q=>!isCorrect(q,session.answers[q.id])).map(q=>q.id)};
}
