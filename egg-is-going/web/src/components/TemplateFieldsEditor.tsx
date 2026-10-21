"use client";
import { useState } from "react";
import type { TemplateRules } from "@/lib/agents/types";
type Field = TemplateRules["fields"][number];
const SOURCES = {meta:"회의 정보",confirmed:"확정 결정",topic_changes:"아이디어 변경",actions:"후속 업무",on_hold:"보류",dropped:"제외된 안"};
export default function TemplateFieldsEditor({ initial }: { initial: Field[] }) {
  const [fields,setFields] = useState(initial);
  const update = (index:number, patch: Partial<Field>) => setFields(fs => fs.map((f,i) => i === index ? {...f,...patch} : f));
  const move = (index:number,direction:number) => setFields(fs => { const next = [...fs]; [next[index],next[index+direction]] = [next[index+direction],next[index]]; return next; });
  return <div className="template-editor"><input type="hidden" name="rules" value={JSON.stringify({fields})}/>{fields.map((f,index) => <fieldset key={f.id}>
    <legend>{index+1}. {f.label || "새 항목"}</legend>
    <div className="fg-row"><label className="eg-label">항목 이름<input className="eg-input" value={f.label} required maxLength={60} onChange={e => update(index,{label:e.target.value})}/></label><label className="eg-label">가져올 내용<select className="eg-select" value={f.source} onChange={e => update(index,{source:e.target.value as Field["source"]})}>{Object.entries(SOURCES).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    <label className="eg-label">표시 방식<select className="eg-select" value={f.format} onChange={e => { const format=e.target.value as Field["format"]; update(index,{format,columns:format === "table" ? ["업무","담당","기한","근거"] : null}); }}><option value="paragraph">문단</option><option value="bullets">목록</option><option value="table">표</option></select></label>
    {f.format === "table" ? <label className="eg-label">표 열 이름 · 쉼표로 구분<input className="eg-input" value={f.columns?.join(", ") ?? ""} required onChange={e => update(index,{columns:e.target.value.split(",").map(c=>c.trim())})}/></label> : null}
    <label className="eg-label">작성 기준<input className="eg-input" value={f.rule} required maxLength={500} onChange={e => update(index,{rule:e.target.value})}/></label>
    <div className="field-controls"><label><input type="checkbox" checked={f.required} onChange={e => update(index,{required:e.target.checked})}/> 필수 항목</label><span className="sp"/><button type="button" className="eg-btn eg-btn--ghost eg-btn--sm" disabled={index === 0} onClick={()=>move(index,-1)} aria-label={`${f.label} 위로`}>↑</button><button type="button" className="eg-btn eg-btn--ghost eg-btn--sm" disabled={index === fields.length-1} onClick={()=>move(index,1)} aria-label={`${f.label} 아래로`}>↓</button><button type="button" className="eg-btn eg-btn--ghost eg-btn--sm" disabled={fields.length < 2} onClick={()=>setFields(fs => fs.filter((_,i)=>i!==index))} aria-label={`${f.label} 삭제`}>삭제</button></div>
  </fieldset>)}<button type="button" className="eg-btn eg-btn--ghost eg-btn--sm" onClick={()=>setFields(fs => [...fs,{id:`custom_${crypto.randomUUID().replaceAll("-","")}`,label:"새 항목",source:"confirmed",format:"bullets",rule:"원문에 있는 내용만 작성",required:false,columns:null}])}>+ 항목 추가</button><p className="eg-help">저장하면 새 양식 버전이 만들어집니다.</p></div>;
}
