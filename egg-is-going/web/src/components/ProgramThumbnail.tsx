"use client";
import { useState } from "react";
import thumbnails from "@/lib/programThumbnails.json";
export default function ProgramThumbnail({name, className = "", priority = false}: {name:string;className?:string;priority?:boolean}) {
  const [failed,setFailed] = useState(false);
  const src = (thumbnails as Record<string,string>)[name];
  return <span className={`program-thumbnail ${className}`}><span className="program-thumbnail__fallback" aria-hidden="true">{name}</span>{src && !failed ? <img src={src} alt={`${name} 썸네일`} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/> : null}</span>;
}
