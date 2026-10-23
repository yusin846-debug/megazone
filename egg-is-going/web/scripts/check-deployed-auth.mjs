/** Smoke test against the public, fictional PoC. Never prints session cookies/tokens. */
import assert from 'node:assert/strict';
const base = process.argv[2];
if (base !== 'https://egg-is-going.vercel.app') throw new Error('This check is scoped to the authorized public PoC deployment.');
const samples = [ ['lee','이혜연','Egg!Lee2026'], ['oh','오다은','Egg!Oh2026'], ['han','한지수','Egg!Han2026'], ['park','박준호','Egg!Park2026'], ['choi','최민재','Egg!Choi2026'], ['yoon','윤하람','Egg!Yoon2026'], ['ops','정운영','Egg!Ops2026'] ];
const request = (path, body, cookie='', origin=base) => fetch(base+path, {method:body?'POST':'GET', redirect:'manual', headers:{Origin:origin, 'Content-Type':'application/json', ...(cookie?{Cookie:cookie}:{})}, ...(body?{body:JSON.stringify(body)}:{})});
const cookies = response => response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
const check = name=>console.log('PASS '+name);
const loginRedirect = async response => { const destination=response.headers.get('location'); if(destination?.includes('/login')) return; const html=await response.text(); assert.ok(html.includes('NEXT_REDIRECT;replace;/login;307;') && html.includes('http-equiv="refresh"')); };
const home = await request('/'); await loginRedirect(home); check('unauthenticated home redirects to login');
const forged = await request('/',undefined,'eg_user=00000000-0000-0000-0000-000000000001'); await loginRedirect(forged); check('legacy user cookie grants no access');
const legacy = await request('/demo-login?u=lee'); assert.ok(legacy.headers.get('location')?.endsWith('/login?sample=lee')); assert.ok(!cookies(legacy).includes('session_token')); check('demo link only prefills the form');
const invalid = await request('/api/auth/sign-in/email',{email:'lee@egg.test',password:'incorrect-password'}); assert.equal(invalid.status,401); check('incorrect password rejected by deployed API');
for (const [subject,name,password] of samples) {
 const response = await request('/api/auth/sign-in/email',{email:subject+'@egg.test',password,rememberMe:false});
 assert.equal(response.status,200,`sign-in ${subject}: ${response.status}`);
 const cookie = cookies(response);
 const session = await (await request('/api/auth/get-session',undefined,cookie)).json();
 assert.equal(session.user.email,subject+'@egg.test'); assert.ok(session.user.appUserId);
 if (subject==='lee') {
   const complete=await request('/auth/complete',undefined,cookie); assert.ok([302,303,307,308].includes(complete.status));
   const html=await (await request('/',undefined,cookie+'; '+cookies(complete))).text();
   assert.ok(html.includes('맛따라 길따라 대명이따라')); assert.ok(html.includes('이혜연')); check('Lee enters the designated PoC');
 }
 const out=await request('/api/auth/sign-out',{},cookie); assert.equal(out.status,200);
 assert.equal(await (await request('/api/auth/get-session',undefined,cookie)).json(),null);
 check(`${name}: login, mapped session, logout, stale session rejected`);
}
const csrf=await request('/api/auth/sign-in/email',{email:'lee@egg.test',password:'Egg!Lee2026'},'', 'https://untrusted.example'); assert.equal(csrf.status,403); check('cross-origin login rejected');
const signup=await request('/api/auth/sign-up/email',{name:'Uninvited test',email:'uninvited@egg.test',password:'NotARealPassword!2026'}); assert.ok(signup.status>=400); check('public signup blocked');
console.log('Deployed authentication smoke test passed. No meeting data was changed.');
