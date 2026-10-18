import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuiz, grade, prepareQuestions, isCorrect, configSchema, defaultConfig, buildPrompt } from '../shared/quiz.js';
import { demoQuiz } from '../src/demo.js';

const fixture=()=>structuredClone(demoQuiz);
test('Import accepts valid JSON and a fenced LLM response',()=>{
  assert.equal(parseQuiz(JSON.stringify(demoQuiz)).questions.length,6);
  assert.equal(parseQuiz('```json\n'+JSON.stringify(demoQuiz)+'\n```').version,1);
});
test('Malformed LLM JSON gives a useful error',()=>assert.throws(()=>parseQuiz('{"title":'),/JSON chưa hợp lệ/));
test('Answers outside the options are rejected before grading',()=>{
  const q=fixture();q.questions[0].answer=[9];assert.throws(()=>parseQuiz(q),/Chỉ số đáp án/);
});
test('Duplicate question IDs and repeated answer indices are rejected',()=>{
  const q=fixture();q.questions[1].id=q.questions[0].id;assert.throws(()=>parseQuiz(q),/ID câu hỏi/);
  const r=fixture();r.questions[1].answer=[0,0];assert.throws(()=>parseQuiz(r),/bị trùng/);
});
test('Multiple-choice cannot label every option correct or have only one correct answer',()=>{
  for(const answer of [[0],[0,1,2,3]]){const q=fixture();q.questions[1].answer=answer;assert.throws(()=>parseQuiz(q),/đáp án nhiễu/);}
});
test('True-false must have exactly two options; single cannot have multiple answers',()=>{
  const q=fixture();q.questions[3].options.push('Không biết');assert.throws(()=>parseQuiz(q),/đúng 2 lựa chọn/);
  const r=fixture();r.questions[0].answer=[0,1];assert.throws(()=>parseQuiz(r),/đúng một đáp án/);
});
test('Missing explanations, source citations and duplicate choices are rejected',()=>{
  for(const key of ['explanation','source']){const q=fixture();delete q.questions[0][key];assert.throws(()=>parseQuiz(q));}
  const q=fixture();q.questions[0].options[1]=q.questions[0].options[0];assert.throws(()=>parseQuiz(q),/không được trùng/);
});
test('Multiple answers are order independent and require an exact set',()=>{
  const q=demoQuiz.questions[1];assert.ok(isCorrect(q,[2,0]));assert.equal(isCorrect(q,[0]),false);assert.equal(isCorrect(q,[0,1,2]),false);assert.equal(isCorrect(q),false);
});
test('Unanswered questions count as wrong and score uses all questions',()=>{
  assert.deepEqual(grade(demoQuiz.questions,{'demo-1':[1],'demo-2':[2,0]}),{correct:2,total:6,percent:33});
});
test('Shuffling preserves the semantic correct answers without mutating source',()=>{
  const before=fixture();
  for(let run=0;run<30;run++){
    const shuffled=prepareQuestions(demoQuiz.questions,true,true);
    assert.equal(shuffled.length,6);
    for(const q of shuffled){const original=before.questions.find(o=>o.id===q.id);assert.deepEqual(q.answer.map(i=>q.options[i]).sort(),original.answer.map(i=>original.options[i]).sort());}
  }
  assert.deepEqual(demoQuiz,before);
});
test('Generation configuration limits and prompt stay aligned',()=>{
  assert.ok(configSchema.safeParse(defaultConfig).success);
  for(const patch of [{count:0},{count:51},{types:[]},{difficulty:'easy'},{language:'xx'}])assert.equal(configSchema.safeParse({...defaultConfig,...patch}).success,false);
  const prompt=buildPrompt({...defaultConfig,count:27,difficulty:'expert',types:['multiple'],focus:'Chương 2'});
  assert.match(prompt,/27/);assert.match(prompt,/80%/);assert.match(prompt,/Chương 2/);assert.match(prompt,/BẮT ĐẦU TỪ 0/);
});
