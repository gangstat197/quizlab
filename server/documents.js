import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const xmlParser = new XMLParser({ignoreAttributes:true, processEntities:true, parseTagValue:false, trimValues:false});
function textNodes(node) {
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key, value]) => {
    if (key === 'a:t' || key === 'w:t') return (Array.isArray(value) ? value : [value]).map(v => typeof v === 'object' ? String(v['#text'] ?? '') : String(v));
    return Array.isArray(value) ? value.flatMap(textNodes) : textNodes(value);
  });
}
async function boundedEntry(entry, budget) {
  return new Promise((resolve, reject) => {
    const chunks=[];
    const stream=entry.internalStream('nodebuffer');
    let failed=false;
    stream.on('data', chunk => {
      if (failed) return;
      budget.bytes += chunk.length;
      if (budget.bytes > 36 * 1024 * 1024) {
        failed=true; stream.pause(); chunks.length=0;
        reject(new Error('Tài liệu giải nén quá lớn (tối đa 36 MB). Hãy chia nhỏ hoặc xuất PDF.'));
      }
      else chunks.push(chunk);
    });
    stream.on('error', reject); stream.on('end', () => {if(!failed)resolve(Buffer.concat(chunks));});
    stream.resume();
  });
}
function paragraphs(node) {
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key,value])=>{
    if (key==='w:p') return (Array.isArray(value)?value:[value]).map(p=>textNodes(p).join(''));
    return Array.isArray(value)?value.flatMap(paragraphs):paragraphs(value);
  });
}
export async function documentParts(file) {
  const ext=file.originalname.split('.').pop().toLowerCase();
  const name=file.originalname.replace(/[\r\n]/g,' ');
  if (ext === 'pdf') {
    if (!file.buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error(`${name}: nội dung không phải PDF hợp lệ.`);
    return [{text:`Tài liệu: ${name}`},{inlineData:{mimeType:'application/pdf',data:file.buffer.toString('base64')}}];
  }
  if (!['docx','pptx'].includes(ext)) throw new Error('Chỉ hỗ trợ PDF, DOCX, PPTX. Với DOC/PPT cũ, hãy xuất PDF trước.');
  let zip;
  try { zip=await JSZip.loadAsync(file.buffer); } catch { throw new Error(`${name}: tệp hỏng hoặc không đúng định dạng ${ext.toUpperCase()}.`); }
  const entries=Object.values(zip.files).filter(e=>!e.dir);
  if (entries.length>2000) throw new Error(`${name}: quá nhiều thành phần, hãy xuất PDF.`);
  const budget={bytes:0};
  // Bound decompression before passing the Office archive to a parser.
  const content=new Map();
  for (const e of entries) content.set(e.name, await boundedEntry(e,budget));
  let text='';
  if (ext==='docx') {
    if (!content.has('word/document.xml')) throw new Error(`${name}: DOCX không hợp lệ.`);
    const sections=['word/document.xml',...content.keys()].filter((n,i,a)=>a.indexOf(n)===i && /^word\/(document|footnotes|endnotes|header\d+|footer\d+)\.xml$/.test(n));
    text=sections.map(n=>paragraphs(xmlParser.parse(content.get(n).toString())).join('\n')).join('\n\n');
  } else {
    const slides=[...content.keys()].filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]));
    if (!slides.length) throw new Error(`${name}: không tìm thấy slide.`);
    text=slides.map(n=>`[Slide ${n.match(/slide(\d+)/)[1]}]\n${textNodes(xmlParser.parse(content.get(n).toString())).join('\n')}`).join('\n\n');
  }
  if (text.length>500000) throw new Error(`${name}: quá nhiều văn bản. Hãy chia tài liệu thành các phần nhỏ hơn.`);
  const media=[...content.keys()].filter(n=>/^(word|ppt)\/media\//.test(n) && /\.(png|jpe?g|webp)$/i.test(n));
  if (media.length>40) throw new Error(`${name}: có hơn 40 hình ảnh. Hãy xuất PDF để giữ bố cục và xử lý đầy đủ.`);
  if (!text.trim() && !media.length) throw new Error(`${name}: không tìm thấy nội dung đọc được. Hãy xuất PDF.`);
  const parts=[{text:`Tài liệu: ${name}\n${text}\nHình ảnh đính kèm bên dưới thuộc tài liệu này; chỉ dẫn trang/slide nếu xác định được, không đoán số trang.`}];
  for (const path of media) {
    const ext=path.split('.').pop().toLowerCase();
    parts.push({text:`Hình ảnh: ${name} / ${path}`},{inlineData:{mimeType:ext==='jpg'?'image/jpeg':`image/${ext}`,data:content.get(path).toString('base64')}});
  }
  return parts;
}
