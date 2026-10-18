import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultConfig } from '../shared/quiz.js';

export class Store {
  constructor(directory) {
    mkdirSync(directory,{recursive:true});
    this.db=new DatabaseSync(path.join(directory,'quizlab.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS job_inputs (job_id TEXT NOT NULL, position INTEGER NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, content BLOB NOT NULL, PRIMARY KEY(job_id,position));
      CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, session_id TEXT NOT NULL);`);
    if (!this.get('settings','storeId')) this.set('settings','storeId',randomUUID());
  }
  get(kind,id) {const row=this.db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind,id);return row?JSON.parse(row.value):null;}
  all(kind) {return this.db.prepare('SELECT value FROM records WHERE kind=?').all(kind).map(row=>JSON.parse(row.value));}
  set(kind,id,value) {this.db.prepare('INSERT INTO records(kind,id,value) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value').run(kind,id,JSON.stringify(value));return value;}
  delete(kind,id) {this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind,id);}
  transaction(fn) {this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
  addJob(job,files) {return this.transaction(()=>{const insert=this.db.prepare('INSERT INTO job_inputs VALUES(?,?,?,?,?)');files.forEach((f,i)=>insert.run(job.id,i,f.originalname,f.mimetype||'application/octet-stream',f.buffer));return this.set('jobs',job.id,job);});}
  files(jobId) {return this.db.prepare('SELECT name,mime,content FROM job_inputs WHERE job_id=? ORDER BY position').all(jobId).map(row=>({originalname:row.name,mimetype:row.mime,buffer:Buffer.from(row.content)}));}
  removeJob(id) {this.transaction(()=>{this.delete('jobs',id);this.db.prepare('DELETE FROM job_inputs WHERE job_id=?').run(id);});}
  state() {return {storeId:this.get('settings','storeId'),subjects:this.all('subjects').sort((a,b)=>a.name.localeCompare(b.name,'vi')),quizzes:this.all('quizzes').map(q=>({...q,subjectId:q.subjectId||null})).sort((a,b)=>b.createdAt-a.createdAt),attempts:this.all('attempts').sort((a,b)=>b.completedAt-a.completedAt),session:this.get('sessions','active'),jobs:this.all('jobs').sort((a,b)=>b.createdAt-a.createdAt),draft:this.get('settings','draft')||{config:defaultConfig,method:'gemini',json:'',updatedAt:0}};}
  close() {this.db.close();}
}
