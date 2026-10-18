import { z } from 'zod';

export const subjectColors=['blue','purple','green','orange','pink','teal'];
export const subjectIcons=['book','code','calculator','languages','flask','globe','brain'];
export const subjectSchema=z.object({
  name:z.string().trim().min(1,'Nhập tên môn học.').max(80).transform(value=>value.replace(/\s+/g,' ')),
  color:z.enum(subjectColors).default('blue'),
  icon:z.enum(subjectIcons).default('book'),
});
export const subjectIdSchema=z.string().uuid().nullable();
export const normalizeSubjectName=name=>name.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');
