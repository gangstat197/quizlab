import test from 'node:test';
import assert from 'node:assert/strict';
import { learningSummary,subjectSummary } from '../shared/analytics.js';
import { demoQuiz } from '../src/demo.js';

const now=new Date(2026,9,18,12).getTime();
const day=(offset)=>{const value=new Date(now);value.setDate(value.getDate()+offset);return value.getTime();};
const quiz={...demoQuiz,id:'q',createdAt:day(-6),subjectId:'subject-1'};
function attempt(id,offset,correct=2,total=6){return {id,quizId:'q',completedAt:day(offset),correct,total,percent:Math.round(correct/total*100),questions:demoQuiz.questions,answers:{'demo-1':[1],'demo-2':[0,2]},wrongIds:['demo-3']};}
test('Empty dashboards show no invented accuracy, study time, streak or activity',()=>{const summary=learningSummary([],[],now);assert.equal(summary.accuracy,null);assert.equal(summary.streak,0);assert.equal(summary.answered,0);assert.ok(summary.week.every(d=>d.count===0));assert.equal(summary.review.length,0);});
test('Dashboard counts actual answers and computes accuracy weighted by number of questions',()=>{const summary=learningSummary([quiz],[attempt('a',0,2,2),attempt('b',-1,0,6)],now);assert.equal(summary.accuracy,25);assert.equal(summary.answered,4);assert.equal(summary.week.at(-1).count,1);assert.equal(summary.week.at(-2).count,1);assert.equal(summary.streak,2);});
test('Streak continues from yesterday but not after a missed day; multiple attempts do not multiply days',()=>{assert.equal(learningSummary([quiz],[attempt('a',-1),attempt('b',-2),attempt('c',-2)],now).streak,2);assert.equal(learningSummary([quiz],[attempt('a',-2)],now).streak,0);});
test('Review suggestions use the latest attempt only and exclude deleted quizzes',()=>{const earlier=attempt('a',-1);const latest={...attempt('b',0,6),wrongIds:[]};assert.equal(learningSummary([quiz],[latest,earlier],now).review.length,0);assert.equal(learningSummary([],[earlier],now).review.length,0);assert.equal(learningSummary([quiz],[earlier],now).review[0].attempt.id,'a');});
test('Subject progress counts distinct quizzes studied, not attempts or a claim of mastery',()=>{const stats=subjectSummary('subject-1',[quiz,{...quiz,id:'q2'}, {...quiz,id:'other',subjectId:null}],[attempt('a',0),attempt('b',-1)]);assert.equal(stats.quizzes.length,2);assert.equal(stats.questionCount,12);assert.equal(stats.studied,1);assert.equal(stats.progress,50);assert.equal(subjectSummary(null,[{...quiz,subjectId:null}],[]).quizzes.length,1);});
