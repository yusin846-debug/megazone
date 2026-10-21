// 아이콘·캐릭터 스프라이트 (디자인 시스템 src/_sprite.svg 와 동일)
export default function Sprite() {
  return (
<svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
  <defs>
    <radialGradient id="eggShade" cx="36%" cy="28%" r="78%">
      <stop offset="0" stopColor="#FFFEFA"/><stop offset=".62" stopColor="#F6EEDD"/><stop offset="1" stopColor="#E4D6BA"/>
    </radialGradient>
    <radialGradient id="yolkShade" cx="38%" cy="32%" r="70%">
      <stop offset="0" stopColor="#FFE97A"/><stop offset=".7" stopColor="#F7C928"/><stop offset="1" stopColor="#E9AE12"/>
    </radialGradient>
  </defs>
  <symbol id="egg" viewBox="0 0 64 76">
    <path d="M32 2C17 2 4 26 4 46c0 16 12.5 28 28 28s28-12 28-28C60 26 47 2 32 2Z" fill="url(#eggShade)"/>
    <ellipse cx="23" cy="45" rx="2.6" ry="3.6" fill="#1A1814"/><ellipse cx="41" cy="45" rx="2.6" ry="3.6" fill="#1A1814"/>
    <path d="M26.5 54c3 2.8 8 2.8 11 0" stroke="#1A1814" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
  </symbol>
  <symbol id="yolk" viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="29" fill="url(#yolkShade)"/>
    <ellipse cx="24" cy="31" rx="2.6" ry="3.6" fill="#1A1814"/><ellipse cx="40" cy="31" rx="2.6" ry="3.6" fill="#1A1814"/>
    <path d="M27 40c2.8 2.4 7.2 2.4 10 0" stroke="#1A1814" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
  </symbol>
  <symbol id="i-wave" viewBox="0 0 24 24"><path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3"/></symbol>
  <symbol id="i-bulb" viewBox="0 0 24 24"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/></symbol>
  <symbol id="i-checks" viewBox="0 0 24 24"><path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/></symbol>
  <symbol id="i-doc" viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M16 13H8M16 17H8M10 9H8"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.6-4.6"/></symbol>
  <symbol id="i-layers" viewBox="0 0 24 24"><path d="M12.8 2.2a2 2 0 0 0-1.6 0L2.6 6.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.6 0l8.6-3.9a1 1 0 0 0 0-1.8Z"/><path d="m22 12.6-9.2 4.2a2 2 0 0 1-1.6 0L2 12.6M22 17.6l-9.2 4.2a2 2 0 0 1-1.6 0L2 17.6"/></symbol>
  <symbol id="i-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/></symbol>
  <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.9 1 6.7 2.7L21 8"/><path d="M21 3v5h-5"/></symbol>
  <symbol id="i-play" viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5Z" fill="currentColor" stroke="none"/></symbol>
  <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></symbol>
  <symbol id="i-upload" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></symbol>
  <symbol id="i-users" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></symbol>
  <symbol id="i-inbox" viewBox="0 0 24 24"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z"/></symbol>
  <symbol id="i-template" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="7" rx="1.5"/><rect x="3" y="14" width="9" height="7" rx="1.5"/><rect x="16" y="14" width="5" height="7" rx="1.5"/></symbol>
  <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></symbol>
  <symbol id="i-alert" viewBox="0 0 24 24"><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4M12 17h.01"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></symbol>
  <symbol id="i-send" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></symbol>
  <symbol id="i-chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>
  <symbol id="i-diff" viewBox="0 0 24 24"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7M11 18H8a2 2 0 0 1-2-2V9"/></symbol>
  <symbol id="i-pencil" viewBox="0 0 24 24"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></symbol>
  <symbol id="i-home" viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/></symbol>
  <symbol id="i-grip" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="15" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="18" r="1" fill="currentColor"/><circle cx="15" cy="18" r="1" fill="currentColor"/></symbol>
  <symbol id="i-lock" viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></symbol>
</svg>
  );
}
