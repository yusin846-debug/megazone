// Generated 3D crew portraits, optimized locally for small UI surfaces.
export default function RoleAvatar({title,name,size=40}: {title:string;name?:string;size?:number}) {
  const pd=title.includes("PD");
  const level=title.includes("메인") ? "lead" : title.includes("서브") ? "mid" : "junior";
  const asset=title.includes("운영") ? "operator" : `${pd ? "pd" : "writer"}-${level}`;
  return <span className="role-avatar" style={{width:size,height:size}} role="img" aria-label={`${name ? name+" · " : ""}${title} 캐릭터`}><img src={`/brand/${asset}.webp`} alt="" width={size} height={size} decoding="async"/></span>;
}
