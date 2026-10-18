import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { documentParts } from '../server/documents.js';

async function office(name,entries){const zip=new JSZip();for(const [key,value] of Object.entries(entries))zip.file(key,value);return {originalname:name,buffer:await zip.generateAsync({type:'nodebuffer'})};}
test('PDF is forwarded with its name and correct media type',async()=>{
  const parts=await documentParts({originalname:'lecture.pdf',buffer:Buffer.from('%PDF-1.4 test')});
  assert.match(parts[0].text,/lecture.pdf/);assert.equal(parts[1].inlineData.mimeType,'application/pdf');
});
test('Rejects disguised PDF, legacy Office, corrupt and empty slide files',async()=>{
  await assert.rejects(documentParts({originalname:'bad.pdf',buffer:Buffer.from('not pdf')}),/không phải PDF/);
  await assert.rejects(documentParts({originalname:'old.ppt',buffer:Buffer.from('data')}),/Chỉ hỗ trợ/);
  await assert.rejects(documentParts({originalname:'bad.docx',buffer:Buffer.from('data')}),/tệp hỏng/);
  await assert.rejects(documentParts(await office('empty.pptx',{'docProps/app.xml':'<x/>'})),/không tìm thấy slide/);
});
test('DOCX preserves Vietnamese, numeric text, paragraphs, tables, headers and embedded images',async()=>{
  const file=await office('bai-hoc.docx',{
    'word/document.xml':'<w:document><w:body><w:p><w:r><w:t>Học &amp; hiểu </w:t></w:r><w:r><w:t>0012</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Nội dung bảng</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
    'word/header1.xml':'<w:hdr><w:p><w:r><w:t>Chương một</w:t></w:r></w:p></w:hdr>',
    'word/media/image1.png':Buffer.from('image')
  });
  const parts=await documentParts(file);assert.match(parts[0].text,/Học & hiểu 0012\nNội dung bảng/);assert.match(parts[0].text,/Chương một/);assert.equal(parts[2].inlineData.mimeType,'image/png');
});
test('PPTX orders slides numerically rather than lexicographically and decodes text',async()=>{
  const slide=t=>`<p:sld><p:cSld><p:spTree><p:sp><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:sp></p:spTree></p:cSld></p:sld>`;
  const parts=await documentParts(await office('lecture.pptx',{'ppt/slides/slide10.xml':slide('Mười'),'ppt/slides/slide2.xml':slide('Hai'),'ppt/slides/slide1.xml':slide('Một &amp; 001')}));
  assert.match(parts[0].text,/\[Slide 1\]\nMột & 001[\s\S]*\[Slide 2\]\nHai[\s\S]*\[Slide 10\]\nMười/);
});
test('Rejects archives expanding beyond the processing budget',async()=>{
  const zip=new JSZip();zip.file('word/document.xml','x'.repeat(37*1024*1024));
  const buffer=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
  await assert.rejects(documentParts({originalname:'huge.docx',buffer}),/giải nén quá lớn/);
});
