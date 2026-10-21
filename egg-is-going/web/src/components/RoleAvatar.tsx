// Profile identity variants extend the reference's flat mascot vocabulary.
export default function RoleAvatar({ title, name, size = 40 }: { title: string; name?: string; size?: number }) {
  const pd = title.includes("PD");
  const ops = title.includes("운영");
  const main = title.includes("메인");
  const sub = title.includes("서브");
  const bg = ops ? "#E4E3F5" : pd ? "#E1EBDD" : "#F8F0BC";
  return <svg className="role-avatar" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`${name ? name + " · " : ""}${title} 캐릭터`}>
    <rect width="64" height="64" rx="22" fill={bg}/>
    <path d="M14 43C14 27 23 10 32 10s18 17 18 33c0 11-8 16-18 16S14 54 14 43Z" fill="#FFFEF9" stroke="#D9D3C5" strokeWidth="1.5"/>
    <ellipse cx="23" cy="42" rx="4" ry="2.5" fill="#F2C2A7"/><ellipse cx="41" cy="42" rx="4" ry="2.5" fill="#F2C2A7"/>
    <g fill="#262359"><circle cx="26" cy="35" r="2"/><circle cx="38" cy="35" r="2"/></g>
    <path d="M29 42q3 3 6 0" fill="none" stroke="#262359" strokeWidth="1.8" strokeLinecap="round"/>
    {ops ? <g fill="none" stroke="#1E1E7F" strokeWidth="2.5"><rect x="19" y="29" width="26" height="12" rx="5"/><path d="M15 25q17-20 34 0M47 27v17h-7"/></g> : pd ? main ? <g fill="none" stroke="#47715C" strokeWidth="3"><path d="M15 36v-7a17 17 0 0 1 34 0v16h-9"/><rect x="12" y="31" width="6" height="12" rx="3" fill="#47715C"/><rect x="46" y="31" width="6" height="12" rx="3" fill="#47715C"/></g> : sub ? <g fill="#628870"><path d="M17 24q14-23 29 0Z"/><rect x="15" y="22" width="36" height="5" rx="2"/></g> : <g transform="rotate(-12 44 50)"><rect x="36" y="45" width="22" height="14" rx="2" fill="#47715C"/><path d="M37 47h20M40 45l4 4m3-4 4 4" stroke="white" strokeWidth="2"/></g> : main ? <g fill="none" stroke="#1E1E7F" strokeWidth="2"><rect x="19" y="29" width="11" height="10" rx="4"/><rect x="34" y="29" width="11" height="10" rx="4"/><path d="M30 33h4M46 48l7-13"/></g> : sub ? <g><rect x="38" y="44" width="17" height="17" rx="2" fill="#1E1E7F"/><path d="M42 48h9m-9 4h9m-9 4h5" stroke="#FFF" strokeWidth="1.5"/></g> : <g transform="rotate(22 47 44)"><path d="M44 29h6v24l-3 6-3-6Z" fill="#F8E950" stroke="#9F8C29"/><path d="M44 33h6M45 54h4" stroke="#1E1E7F"/></g>}
  </svg>;
}
