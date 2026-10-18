function dayKey(date){return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;}

export function learningSummary(quizzes,attempts,now=Date.now()){
  const latest=new Map();
  for(const attempt of [...attempts].sort((a,b)=>b.completedAt-a.completedAt))if(!latest.has(attempt.quizId))latest.set(attempt.quizId,attempt);
  const total=attempts.reduce((sum,a)=>sum+a.total,0);
  const correct=attempts.reduce((sum,a)=>sum+a.correct,0);
  const answered=attempts.reduce((sum,a)=>sum+a.questions.filter(q=>a.answers[q.id]?.length).length,0);
  const today=new Date(now);today.setHours(0,0,0,0);
  const dates=new Set(attempts.map(a=>dayKey(new Date(a.completedAt))));
  let cursor=new Date(today);if(!dates.has(dayKey(cursor)))cursor.setDate(cursor.getDate()-1);
  let streak=0;while(dates.has(dayKey(cursor))){streak++;cursor.setDate(cursor.getDate()-1);}
  const week=Array.from({length:7},(_,index)=>{
    const date=new Date(today);date.setDate(date.getDate()-(6-index));
    const count=attempts.filter(a=>dayKey(new Date(a.completedAt))===dayKey(date)).length;
    return {key:dayKey(date),timestamp:date.getTime(),count,today:index===6};
  });
  const review=quizzes.map(quiz=>({quiz,attempt:latest.get(quiz.id)})).filter(({attempt})=>attempt?.wrongIds.length).sort((a,b)=>a.attempt.percent-b.attempt.percent);
  const recent=[...quizzes].sort((a,b)=>(latest.get(b.id)?.completedAt||b.createdAt)-(latest.get(a.id)?.completedAt||a.createdAt));
  return {latest,total,correct,answered,accuracy:total?Math.round(correct/total*100):null,streak,week,review,recent,completed:quizzes.filter(q=>latest.has(q.id)).length};
}

export function subjectSummary(subjectId,quizzes,attempts){
  const own=quizzes.filter(q=>(q.subjectId||null)===(subjectId||null));
  const ids=new Set(own.map(q=>q.id));const history=attempts.filter(a=>ids.has(a.quizId));
  const studied=new Set(history.map(a=>a.quizId)).size;
  const total=history.reduce((sum,a)=>sum+a.total,0);const correct=history.reduce((sum,a)=>sum+a.correct,0);
  return {quizzes:own,questionCount:own.reduce((sum,q)=>sum+q.questions.length,0),studied,progress:own.length?Math.round(studied/own.length*100):0,accuracy:total?Math.round(correct/total*100):null};
}
