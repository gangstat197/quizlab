export async function request(url,{method='GET',body,keepalive=false,headers={}}={}) {
  const multipart=body instanceof FormData;
  let response;
  try {response=await fetch(url,{method,headers:{...(body&&!multipart?{'Content-Type':'application/json'}:{}),...headers},body:body?(multipart?body:JSON.stringify(body)):undefined,keepalive});}
  catch {throw new Error('Mất kết nối backend. Dữ liệu chưa đồng bộ sẽ được gửi lại khi kết nối trở lại.');}
  let data;try{data=await response.json();}catch{throw new Error('Backend chưa sẵn sàng hoặc cần khởi động lại.');}
  if(!response.ok){const error=new Error(data.error||'Không xử lý được yêu cầu.');error.status=response.status;throw error;}
  return data;
}
export function readLocal(key,fallback=null){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
export function writeLocal(key,value){localStorage.setItem(key,JSON.stringify(value));}
export function download(name,value,type='application/json'){
  const url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
