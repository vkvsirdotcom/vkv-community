'use strict';
(() => {
const SB_URL = 'https://bfrobrqdqtppkhragwtx.supabase.co';
const SB_KEY = 'sb_publishable_qbTif15LV4rG4vY33vUfWA_6F15ddKE';
const VAPID = 'BO6NMzVX5KpovW5SsCn7uMd4VTLEM0Olw8HCXatu0jgT1R8JrFBvUv8j5VnI_4rF2zFlX7M65CrdhAnOhxiE_NU';
const BASE = location.origin + location.pathname.replace(/index\.html$/, '');
const sb = supabase.createClient(SB_URL, SB_KEY, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } });

const RULES = `1. Be respectful. No abuse, mockery or personal attacks.
2. No vulgar, political, religious or offensive content.
3. No forwards, spam, ads or unrelated links.
4. Post only exam- and career-related questions in the correct room.
5. Don't try to find or reveal anyone's real identity.
6. Faculty and moderators may delete content or mute members without notice.
7. Repeated violations lead to a permanent ban.`;
const PRIVACY = `Your full name, WhatsApp number, email, gender and date of birth are stored securely and are visible only to the community admin. Other members see only your masked code (for example ECA-S-2027-CS-482). Faculty and experts reviewing new members see only your college, branch, year and work details. You can edit your details or delete your account at any time from your profile.`;

const S = { user: null, me: null, profile: null, members: new Map(), rooms: [], myRooms: new Map(), branches: [], colleges: [], channel: null, pendingCount: 0 };
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const isAdmin = () => S.me?.app_role === 'admin';
const isMod = () => ['admin', 'moderator'].includes(S.me?.app_role);
const isStaff = () => isMod() || (S.me?.verified && ['faculty', 'expert'].includes(S.me?.role));

function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), err ? 6000 : 3000); }
function errMsg(e) { return (e?.message || String(e)).replace(/^.*?exception:\s*/i, ''); }
async function rpc(fn, args) { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; }
function openModal(html) { $('#modal-body').innerHTML = html; $('#modal').hidden = false; const f = $('#modal-body input, #modal-body select, #modal-body textarea, #modal-body button'); f && f.focus(); }
function closeModal() { $('#modal').hidden = true; $('#modal-body').innerHTML = ''; }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

function badge(m) {
  if (!m) return '';
  let b = '';
  if (m.app_role === 'admin') b += '<span class="badge b-mod">Admin</span>';
  else if (m.app_role === 'moderator') b += '<span class="badge b-mod">Moderator</span>';
  if (m.verified && m.role === 'faculty') b += '<span class="badge b-staff">✔ Faculty</span>';
  else if (m.verified && m.role === 'expert') b += '<span class="badge b-staff">✔ Expert</span>';
  if (!m.approved) b += '<span class="badge b-pend">🕓 Unverified</span>';
  return b;
}
const who = (id) => { const m = S.members.get(id); return `<span class="handle">${esc(m?.handle || 'Member')}</span>${badge(m)}`; };

// ---------- invite token capture ----------
const qp = new URLSearchParams(location.search);
if (qp.get('inv')) { try { localStorage.setItem('vkv_inv', qp.get('inv')); } catch {} }

// ---------- data loaders ----------
async function loadLookups() {
  const [b, c] = await Promise.all([sb.from('branches').select('*').order('sort'), sb.from('colleges').select('*').order('sort')]);
  S.branches = b.data || []; S.colleges = c.data || [];
}
async function loadMe() {
  const { data } = await sb.from('members').select('*').eq('id', S.user.id).maybeSingle();
  S.me = data;
}
async function loadCore() {
  const [m, r, rm] = await Promise.all([
    sb.from('members').select('id,handle,role,verified,app_role,approved,status,muted_until'),
    sb.from('rooms').select('*').order('created_at'),
    sb.from('room_members').select('*').eq('user_id', S.user.id),
  ]);
  S.members = new Map((m.data || []).map((x) => [x.id, x]));
  S.me = S.members.get(S.user.id) ? { ...S.me, ...S.members.get(S.user.id) } : S.me;
  S.rooms = r.data || [];
  S.myRooms = new Map((rm.data || []).map((x) => [x.room_id, x]));
  if (isStaff()) { try { const p = await rpc('pending_members'); S.pendingCount = (p || []).length; } catch { S.pendingCount = 0; } }
}
async function processInvite() {
  let t = null; try { t = localStorage.getItem('vkv_inv'); } catch {}
  if (!t) return;
  try {
    const r = await rpc('join_with_invite', { p_token: t });
    try { localStorage.removeItem('vkv_inv'); } catch {}
    await loadMe(); await loadCore();
    toast(r.approved ? 'You have joined the room.' : 'You have joined. Your account is awaiting approval.');
    history.replaceState(null, '', BASE + '#/room/' + r.room_id);
  } catch (e) { try { localStorage.removeItem('vkv_inv'); } catch {} toast(errMsg(e), true); }
}

// ---------- nav ----------
function renderNav() {
  const n = $('#nav');
  if (!S.me) { n.innerHTML = S.user ? '<a href="#" data-act="signout">Sign out</a>' : ''; return; }
  const h = location.hash;
  n.innerHTML = `<a href="#/" class="${h === '' || h === '#/' ? 'on' : ''}">Rooms</a>`
    + (isStaff() ? `<a href="#/admin/pending" class="${h.startsWith('#/admin') ? 'on' : ''}">${isMod() ? 'Admin' : 'Approvals'}${S.pendingCount ? `<span class="count">${S.pendingCount}</span>` : ''}</a>` : '')
    + `<a href="#/profile" class="${h.startsWith('#/profile') ? 'on' : ''}">Me</a>`;
}

// ---------- screens ----------
function viewLogin() {
  const inv = (() => { try { return localStorage.getItem('vkv_inv'); } catch { return null; } })();
  app.innerHTML = `<section class="hero">
    <h1>Ask, answer and learn together, without sharing your number.</h1>
    <p>A private Q&A space for students, alumni, faculty and industry experts preparing for exams and campus drives.</p>
    <ul class="small">
      <li>Doubts answered by experienced professionals and faculty</li>
      <li>Past questions and study material, saved for every new batch</li>
      <li>Live voice and video guidance sessions</li>
      <li>Your real name, number and email are never shown to other members</li>
    </ul>
    ${inv ? '<div class="notice teal">You have an invite link. Sign in to join the room.</div>' : ''}
    <p><button class="btn gold" data-act="login">Continue with Google</button></p>
    <p class="small"><b>Already a member?</b> Sign in with the same Gmail you used before. You won't need to fill the form again.</p>
    <p class="small muted">${esc(PRIVACY)}</p>
  </section>`;
}

function collegeOptions() { return S.colleges.map((c) => `<option value="${esc(c.code)}">${esc(c.name)} (${esc(c.code)})</option>`).join('') + '<option value="__other">Other (type below)</option>'; }
function branchOptions(sel) { return S.branches.map((b) => `<option value="${esc(b.code)}" ${b.code === sel ? 'selected' : ''}>${esc(b.name)} (${esc(b.code)})</option>`).join(''); }
function suggestCode(name) {
  const stop = new Set(['of', 'and', 'the', 'for', 'in', '&', 'at']);
  const w = name.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter((x) => x && !stop.has(x.toLowerCase()));
  return w.map((x) => x[0]).join('').toUpperCase().slice(0, 5);
}

function viewRegister() {
  const email = S.user.email;
  app.innerHTML = `<h1>Create your profile</h1>
  <p class="muted">Signed in as ${esc(email)}. Only the admin can see the details below. Other members will see only your masked code.</p>
  <form id="reg" class="panel" novalidate>
    <h2>About you</h2>
    <label for="f_name">Full name</label><input id="f_name" required autocomplete="name" maxlength="80">
    <div class="grid2">
      <div><label for="f_wa">WhatsApp number</label><input id="f_wa" required inputmode="tel" placeholder="9876543210" maxlength="15"></div>
      <div><label for="f_dob">Date of birth</label><input id="f_dob" type="date" required min="1930-01-01" max="2012-12-31"></div>
      <div><label for="f_gender">Gender</label><select id="f_gender" required><option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option><option value="na">Prefer not to say</option></select></div>
      <div><label for="f_city">City <span class="opt">(optional)</span></label><input id="f_city" maxlength="60"></div>
    </div>
    <h2>Your role</h2>
    <label for="f_role">I am a</label>
    <select id="f_role" required><option value="">Select</option><option value="student">Student</option><option value="alumni">Alumni</option><option value="faculty">Faculty</option><option value="expert">Industry expert / professional</option></select>
    <p class="small muted" id="role_note"></p>
    <h2>Education</h2>
    <label for="f_college">College / university</label><select id="f_college" required><option value="">Select</option>${collegeOptions()}</select>
    <div id="other_college" hidden class="grid2">
      <div><label for="f_cfull">College full name</label><input id="f_cfull" maxlength="120"></div>
      <div><label for="f_ccode">Short code (max 5 letters)</label><input id="f_ccode" maxlength="5" pattern="[A-Za-z]{1,5}"></div>
    </div>
    <div class="grid2">
      <div><label for="f_degree">Degree</label><select id="f_degree" required><option value="">Select</option><option>B.Tech / B.E.</option><option>M.Tech / M.E.</option><option>MBA</option><option>MCA</option><option>BCA</option><option>B.Sc / M.Sc</option><option>PhD</option><option>Diploma</option><option>Other</option></select></div>
      <div><label for="f_year" id="year_label">Pass-out year</label><input id="f_year" type="number" required min="1950" max="2035" inputmode="numeric"></div>
    </div>
    <label for="f_branch">Branch</label><select id="f_branch" required><option value="">Select</option>${branchOptions()}</select>
    <div id="work" hidden>
      <h2>Work</h2>
      <div class="grid2">
        <div><label for="f_company">Current company / institution</label><input id="f_company" maxlength="100"></div>
        <div><label for="f_desig">Designation</label><input id="f_desig" maxlength="80"></div>
        <div><label for="f_exp">Total experience (years)</label><input id="f_exp" type="number" min="0" max="70" step="0.5"></div>
        <div><label for="f_domain">Domain <span class="opt">(optional)</span></label><select id="f_domain"><option value="">Select</option><option>Software / IT</option><option>Core engineering</option><option>Government / PSU</option><option>Teaching / Research</option><option>Management / Consulting</option><option>Startup / Business</option><option>Other</option></select></div>
      </div>
      <label for="f_prev">Previous companies <span class="opt">(optional)</span></label><input id="f_prev" maxlength="200">
      <label for="f_li">LinkedIn profile <span class="opt">(optional, helps us verify you)</span></label><input id="f_li" type="url" placeholder="https://linkedin.com/in/…" maxlength="200">
      <label class="check"><input type="checkbox" id="f_willing">I am willing to answer questions and host guidance sessions</label>
    </div>
    <h2>Community rules</h2>
    <div class="rules notice">${esc(RULES)}</div>
    <label class="check"><input type="checkbox" id="f_rules" required>I have read and agree to the community rules.</label>
    <label class="check"><input type="checkbox" id="f_data" required>I consent to my details being stored as described: ${esc(PRIVACY)}</label>
    <p id="preview" class="notice teal" hidden></p>
    <button class="btn gold" type="submit">Create profile</button>
  </form>`;
  const f = $('#reg');
  const upd = () => {
    const role = $('#f_role').value;
    $('#work').hidden = !['alumni', 'faculty', 'expert'].includes(role);
    $('#year_label').textContent = role === 'student' ? 'Expected pass-out year' : role === 'faculty' ? 'Pass-out year (or joining year)' : 'Pass-out year';
    $('#role_note').textContent = ['faculty', 'expert'].includes(role) ? 'Faculty and expert badges are given after a moderator checks your details.' : '';
    const other = $('#f_college').value === '__other';
    $('#other_college').hidden = !other;
    const code = other ? ($('#f_ccode').value || '').toUpperCase() : $('#f_college').value;
    const y = $('#f_year').value, br = $('#f_branch').value;
    if (code && role && y && br) { $('#preview').hidden = false; $('#preview').textContent = `Your masked code will look like: ${code}-${role[0].toUpperCase()}-${y}-${br}-###`; } else $('#preview').hidden = true;
  };
  f.addEventListener('input', upd); f.addEventListener('change', upd);
  $('#f_cfull').addEventListener('input', (e) => { if (!$('#f_ccode').dataset.touched) $('#f_ccode').value = suggestCode(e.target.value); });
  $('#f_ccode').addEventListener('input', (e) => { e.target.dataset.touched = 1; e.target.value = e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase(); });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const role = $('#f_role').value, other = $('#f_college').value === '__other';
    const col = S.colleges.find((c) => c.code === $('#f_college').value);
    const v = (id) => $(id).value.trim();
    const req = ['#f_name', '#f_wa', '#f_dob', '#f_gender', '#f_role', '#f_college', '#f_degree', '#f_year', '#f_branch'];
    if (other) req.push('#f_cfull', '#f_ccode');
    if (['alumni', 'faculty', 'expert'].includes(role)) req.push('#f_company', '#f_desig');
    const miss = req.find((id) => !v(id));
    if (miss) { toast('Please fill in: ' + $(`label[for="${miss.slice(1)}"]`).textContent.replace(/\(.*\)/, '').trim(), true); $(miss).focus(); return; }
    if (!$('#f_rules').checked || !$('#f_data').checked) { toast('Please accept the rules and the privacy consent.', true); return; }
    const wa = v('#f_wa').replace(/[\s-]/g, '');
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const h = await rpc('complete_registration', {
        p_full_name: v('#f_name'), p_whatsapp: wa, p_gender: v('#f_gender'), p_dob: v('#f_dob'), p_city: v('#f_city') || null,
        p_role: role, p_college_full: other ? v('#f_cfull') : col.name, p_college_code: other ? v('#f_ccode') : col.code,
        p_degree: v('#f_degree'), p_branch: v('#f_branch'), p_pass_year: parseInt(v('#f_year'), 10),
        p_company: v('#f_company') || null, p_designation: v('#f_desig') || null, p_experience: v('#f_exp') ? Number(v('#f_exp')) : null,
        p_domain: v('#f_domain') || null, p_prev: v('#f_prev') || null, p_linkedin: v('#f_li') || null, p_willing: $('#f_willing').checked,
        p_agree_rules: true, p_agree_data: true });
      toast('Welcome, ' + h);
      await loadMe(); await loadCore(); await processInvite(); renderNav();
      if ('Notification' in window && Notification.permission !== 'granted') { S.afterAlerts = location.hash || '#/'; location.hash = '#/alerts'; } else route();
    } catch (err) { toast(errMsg(err), true); btn.disabled = false; }
  });
}

function pushBox() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return `<div class="notice">${ios ? 'To get alerts on iPhone: tap the Share button, choose <b>Add to Home Screen</b>, then open VKV Community from your home screen and enable alerts here.' : 'This browser does not support alerts. Open this page in Chrome to get alerts.'}</div>`;
  }
  if (Notification.permission === 'granted') return '';
  if (Notification.permission === 'denied') return '<div class="notice red">Alerts are blocked for this site. Allow notifications in your browser settings to get new-question alerts.</div>';
  return `<div class="notice red spread"><span><b>Alerts are off on this device.</b> You will miss new questions, answers and live sessions.</span><button class="btn sm gold" data-act="push">Turn on alerts</button></div>`;
}

function viewHome() {
  const mine = S.rooms.filter((r) => !r.archived && S.myRooms.has(r.id));
  const past = S.rooms.filter((r) => r.archived && S.myRooms.has(r.archived_from));
  const others = S.rooms.filter((r) => !r.archived && !S.myRooms.has(r.id));
  app.innerHTML = `
    ${S.me.status !== 'active' ? '<div class="notice red">Your account is banned.</div>' : ''}
    ${!S.me.approved ? '<div class="notice">Your account is awaiting approval by a faculty member or moderator. You can read everything, but you can post, upload and join live sessions only after approval.</div>' : ''}
    ${S.me.muted_until && new Date(S.me.muted_until) > new Date() ? `<div class="notice red">You are muted${S.me.muted_until.startsWith('infinity') ? '' : ' until ' + fmt(S.me.muted_until)}.</div>` : ''}
    ${pushBox()}
    <h1>Your rooms</h1>
    <p class="muted small">You appear as <span class="handle">${esc(S.me.handle)}</span>${badge(S.me)}</p>
    <div class="panel room-list" style="padding:0">${mine.length ? mine.map(roomLink).join('') : '<p class="empty">You have not joined any room yet. Open an invite link from your group to join one.</p>'}</div>
    ${past.length ? `<h2>Past drives and archives</h2><div class="panel room-list" style="padding:0">${past.map(roomLink).join('')}</div>` : ''}
    ${others.length && S.me.approved ? `<h2>Other rooms</h2><div class="panel room-list" style="padding:0">${others.map((r) => `<div class="room spread" style="padding:12px 14px;border-bottom:1px solid var(--line)"><div><div class="room-name">${esc(r.name)}</div><div class="small muted">${esc(r.objective || '')}</div></div><button class="btn sm ghost" data-act="joinroom" data-id="${r.id}">Join</button></div>`).join('')}</div>` : ''}`;
}
function roomLink(r) { return `<a class="room" href="#/room/${r.id}"><div class="room-name">${esc(r.name)}</div><div class="small muted">${esc(r.objective || (r.archived ? 'Read-only archive' : ''))}</div></a>`; }

// ---------- room ----------
let roomState = { id: null, msgs: [], urls: new Map() };
async function loadRoomMsgs(id) {
  const { data, error } = await sb.from('messages').select('*').eq('room_id', id).order('created_at', { ascending: true }).limit(2000);
  if (error) throw error;
  const unknown = [...new Set(data.map((m) => m.author_id))].filter((a) => !S.members.has(a));
  if (unknown.length) { const { data: mm } = await sb.from('members').select('id,handle,role,verified,app_role,approved,status,muted_until').in('id', unknown); (mm || []).forEach((x) => S.members.set(x.id, x)); }
  roomState.msgs = data;
}
function subscribeRoom(id) {
  if (S.channel) { sb.removeChannel(S.channel); S.channel = null; }
  S.channel = sb.channel('room-' + id).on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `room_id=eq.${id}` }, async () => {
    if (!location.hash.includes(id)) return;
    const scrollAtBottom = (innerHeight + scrollY) >= document.body.scrollHeight - 80;
    const draft = $('#c_text')?.value;
    await loadRoomMsgs(id); route(true);
    if ($('#c_text') && draft) $('#c_text').value = draft;
    if (scrollAtBottom) scrollTo(0, document.body.scrollHeight);
  }).subscribe();
}
async function signedUrl(path) {
  if (roomState.urls.has(path)) return roomState.urls.get(path);
  const { data } = await sb.storage.from('materials').createSignedUrl(path, 3600);
  const u = data?.signedUrl || ''; roomState.urls.set(path, u); return u;
}
function linkify(text, authorId) {
  const a = S.members.get(authorId);
  const trusted = a && (['admin', 'moderator'].includes(a.app_role) || (a.verified && ['faculty', 'expert'].includes(a.role)));
  const e = esc(text);
  return trusted ? e.replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>') : e;
}
function msgHtml(m, opts = {}) {
  const r = S.rooms.find((x) => x.id === m.room_id);
  const q = m.parent_id ? roomState.msgs.find((x) => x.id === m.parent_id) : null;
  const mine = m.author_id === S.user.id;
  const cls = ['msg', opts.q ? 'q' : '', m.is_best ? 'best' : '', m.kind === 'live' ? 'live' : '', m.pending ? 'pending' : ''].join(' ');
  let body = '';
  if (m.deleted_at) body = `<div class="body muted"><i>Deleted by a moderator.</i> ${isMod() ? esc(m.body) : ''}</div>`;
  else {
    body = m.body ? `<div class="body">${linkify(m.body, m.author_id)}</div>` : '';
    if (m.kind === 'file' && m.attachment_path) {
      const img = /^image\//.test(m.attachment_mime || '');
      body += `<div data-file="${esc(m.attachment_path)}" data-img="${img ? 1 : ''}" data-name="${esc(m.attachment_name)}"><span class="small muted">Loading file…</span></div>`;
    }
    if (m.kind === 'live') body = `<div class="body"><b>🔴 Live ${m.live_mode === 'voice' ? 'voice' : 'video'} session</b>${m.body ? ': ' + esc(m.body) : ''}</div><div class="row" style="margin-top:8px"><button class="btn red sm" data-act="joinlive" data-id="${m.id}">Join session</button><span class="small muted">You will join muted. The host can unmute you to ask a question.</span></div>`;
  }
  const replies = opts.q ? roomState.msgs.filter((x) => x.parent_id === m.id && !x.deleted_at).length : 0;
  const acts = [];
  if (!m.deleted_at) {
    if (opts.q) acts.push(`<button data-act="open" data-id="${m.id}">${replies ? replies + ' repl' + (replies > 1 ? 'ies' : 'y') : 'Reply'}</button>`);
    if (m.parent_id && q && (q.author_id === S.user.id || isStaff()) && !m.is_best) acts.push(`<button data-act="best" data-id="${m.id}">✔ Mark best answer</button>`);
    if (!mine) acts.push(`<button data-act="report" data-id="${m.id}">Report</button>`);
    if (mine || isStaff()) acts.push(`<button data-act="del" data-id="${m.id}">Delete</button>`);
    if (isStaff() && !mine) acts.push(`<button data-act="mute" data-id="${m.author_id}">Mute author</button>`);
    if (isStaff() && m.pending) acts.push(`<button data-act="approvemsg" data-id="${m.id}">Approve</button>`);
  }
  return `<article class="${cls}" ${opts.q ? `data-open="${m.id}"` : ''}>
    <div class="meta">${who(m.author_id)}<span>${fmt(m.created_at)}</span>${m.is_best ? '<span class="badge b-staff">Best answer</span>' : ''}${m.pending ? '<span class="badge b-pend">Waiting for approval</span>' : ''}</div>
    ${body}${acts.length ? `<div class="acts">${acts.join('')}</div>` : ''}</article>`;
}
async function hydrateFiles() {
  for (const el of app.querySelectorAll('[data-file]')) {
    const u = await signedUrl(el.dataset.file);
    if (!u) { el.innerHTML = '<span class="small muted">File unavailable</span>'; continue; }
    el.innerHTML = el.dataset.img ? `<a href="${esc(u)}" target="_blank" rel="noopener"><img class="thumb" src="${esc(u)}" alt="${esc(el.dataset.name)}" loading="lazy"></a>`
      : `<a class="file" href="${esc(u)}" target="_blank" rel="noopener">📎 ${esc(el.dataset.name)}</a>`;
  }
}
function composerHtml(room, parent) {
  if (room.archived) return '<div class="notice">This is a read-only archive.</div>';
  if (!S.myRooms.has(room.id) && !isMod()) return '<div class="notice">You are not a member of this room.</div>';
  if (!S.me.approved) return '<div class="notice">You can post after a faculty member or moderator approves your account.</div>';
  return `<form class="composer" id="composer" data-parent="${parent || ''}">
    <label for="c_text" class="small" style="margin-top:0">${parent ? 'Your reply' : 'Ask a question'}</label>
    <textarea id="c_text" maxlength="4000" placeholder="${parent ? 'Write a reply…' : 'Describe your doubt clearly…'}"></textarea>
    <div class="spread" style="margin-top:8px">
      <div class="row"><label class="btn sm ghost" style="margin:0">📎 Attach<input type="file" id="c_file" hidden accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xlsx,.txt"></label><span id="c_fname" class="small muted"></span></div>
      <div class="row">${isStaff() && !parent ? '<button type="button" class="btn sm red" data-act="golive">Start live session</button>' : ''}<button class="btn sm" type="submit">${parent ? 'Send reply' : 'Post question'}</button></div>
    </div>
    ${room.slow_mode_seconds && !isStaff() ? `<p class="small muted" style="margin:6px 0 0">Slow mode: one message every ${Math.round(room.slow_mode_seconds / 60)} min.</p>` : ''}
  </form>`;
}
async function viewRoom(id, threadId, keep) {
  const room = S.rooms.find((r) => r.id === id);
  if (!room) { app.innerHTML = '<p class="empty">Room not found.</p>'; return; }
  if (!keep || roomState.id !== id) { roomState = { id, msgs: [], urls: roomState.id === id ? roomState.urls : new Map() }; app.innerHTML = '<p class="loading">Loading room…</p>'; await loadRoomMsgs(id); subscribeRoom(id); }
  const rm = S.myRooms.get(id);
  if (threadId) {
    const q = roomState.msgs.find((m) => m.id === threadId);
    if (!q) { app.innerHTML = `<p><a href="#/room/${id}">← ${esc(room.name)}</a></p><p class="empty">This question is not available.</p>`; return; }
    const reps = roomState.msgs.filter((m) => m.parent_id === threadId);
    reps.sort((a, b) => (b.is_best - a.is_best) || (new Date(a.created_at) - new Date(b.created_at)));
    app.innerHTML = `<p><a href="#/room/${id}">← ${esc(room.name)}</a></p>${msgHtml(q)}
      <div class="replies">${reps.length ? reps.map((m) => msgHtml(m)).join('') : '<p class="empty">No replies yet.</p>'}</div>
      ${composerHtml(room, threadId)}`;
  } else {
    const qs = roomState.msgs.filter((m) => !m.parent_id && (!m.deleted_at || isMod())).reverse();
    const lives = qs.filter((m) => m.kind === 'live' && !m.deleted_at && (Date.now() - new Date(m.created_at)) < 4 * 3600e3);
    const rest = qs.filter((m) => !lives.includes(m));
    app.innerHTML = pushBox() + `<div class="spread"><h1 style="margin-bottom:0">${esc(room.name)}</h1>
      ${rm ? `<select id="notify" aria-label="Alerts for this room" style="width:auto;min-height:36px;padding:4px 8px"><option value="all" ${rm.notify === 'all' ? 'selected' : ''}>Alerts: everything</option><option value="mine" ${rm.notify === 'mine' ? 'selected' : ''}>Alerts: replies to me</option><option value="none" ${rm.notify === 'none' ? 'selected' : ''}>Alerts: off</option></select>` : ''}</div>
      ${room.objective ? `<p class="muted">${esc(room.objective)}</p>` : ''}
      ${room.whatsapp_channel ? `<p class="small"><a href="${esc(room.whatsapp_channel)}" target="_blank" rel="noopener">Follow this room's WhatsApp Channel</a></p>` : ''}
      <details class="rules-box"><summary>📌 Community rules</summary><div class="rules">${esc(RULES)}</div></details>
      ${lives.map((m) => msgHtml(m)).join('')}
      ${composerHtml(room, null)}
      <h2>Questions</h2>
      ${rest.length ? rest.map((m) => msgHtml(m, { q: true })).join('') : '<p class="empty">No questions yet. Ask the first one.</p>'}`;
    $('#notify')?.addEventListener('change', async (e) => {
      const { error } = await sb.from('room_members').update({ notify: e.target.value }).eq('room_id', id).eq('user_id', S.user.id);
      if (error) toast(errMsg(error), true); else { rm.notify = e.target.value; toast('Alert setting saved.'); }
    });
  }
  $('#c_file')?.addEventListener('change', (e) => { const f = e.target.files[0]; $('#c_fname').textContent = f ? f.name : ''; });
  $('#composer')?.addEventListener('submit', (e) => { e.preventDefault(); sendMsg(room, e.target.dataset.parent || null); });
  hydrateFiles();
}
async function sendMsg(room, parent) {
  const text = $('#c_text').value.trim(); const file = $('#c_file').files[0];
  if (!text && !file) { toast('Write something or attach a file.', true); return; }
  const btn = $('#composer button[type=submit]'); btn.disabled = true;
  try {
    const row = { room_id: room.id, author_id: S.user.id, parent_id: parent, body: text, kind: 'text' };
    if (file) {
      if (file.size > 10 * 1024 * 1024) throw new Error('Files must be under 10 MB.');
      const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
      const path = `${room.id}/${S.user.id}/${Date.now()}-${safe}`;
      const { error } = await sb.storage.from('materials').upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      Object.assign(row, { kind: 'file', attachment_path: path, attachment_name: file.name.slice(0, 120), attachment_mime: file.type });
    }
    const { error } = await sb.from('messages').insert(row);
    if (error) throw error;
    $('#c_text').value = ''; $('#c_file').value = ''; $('#c_fname').textContent = '';
    await loadRoomMsgs(room.id); route(true);
    if (row.kind === 'file' && room.image_approval && !isStaff()) toast('Your file will appear after a moderator approves it.');
  } catch (e) { toast(errMsg(e), true); } finally { btn.disabled = false; }
}

function viewAlerts() {
  app.innerHTML = `<section class="hero"><h1>One last step: turn on alerts</h1>
    <p>Get an instant notification on this phone when someone asks a question, answers yours, shares material or starts a live session. For example:</p>
    <div class="msg"><div class="meta"><b>VKV · GATE CS</b></div><div class="body">ECA-S-2027-CS-482: How to solve integration by parts when…</div></div>
    <p><button class="btn gold" data-act="push">Turn on alerts</button></p>
    <p class="small muted">When your phone asks, tap <b>Allow</b>. On iPhone, first tap Share → <b>Add to Home Screen</b>, open VKV from the home screen, then turn on alerts.</p>
    <p><a href="#/" data-act="skipalerts">Skip for now</a></p></section>`;
}

// ---------- profile ----------
async function viewProfile() {
  const { data: p } = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
  S.profile = p;
  const roomsHtml = [...S.myRooms.values()].map((rm) => { const r = S.rooms.find((x) => x.id === rm.room_id); return r ? `<tr><td>${esc(r.name)}</td><td><button class="btn sm ghost" data-act="leave" data-id="${r.id}">Leave</button></td></tr>` : ''; }).join('');
  app.innerHTML = `<h1>My profile</h1>
    <div class="panel"><p>You appear to others as <span class="handle">${esc(S.me.handle)}</span>${badge(S.me)}</p>
      <p class="small muted">Signed in as ${esc(S.user.email)}</p>${pushBox()}</div>
    ${p ? `<form id="prof" class="panel"><h2 style="margin-top:0">Private details <span class="small muted">(only you and the admin can see these)</span></h2>
      <p><b>${esc(p.full_name)}</b><br><span class="small muted">${esc(p.college_full)} · ${esc(p.degree)} · ${esc(p.branch_code)} · ${esc(p.pass_year)}</span></p>
      <div class="grid2">
        <div><label for="p_wa">WhatsApp number</label><input id="p_wa" value="${esc(p.whatsapp)}" inputmode="tel"></div>
        <div><label for="p_city">City</label><input id="p_city" value="${esc(p.city || '')}"></div>
        <div><label for="p_company">Company / institution</label><input id="p_company" value="${esc(p.company || '')}"></div>
        <div><label for="p_desig">Designation</label><input id="p_desig" value="${esc(p.designation || '')}"></div>
        <div><label for="p_exp">Experience (years)</label><input id="p_exp" type="number" step="0.5" value="${esc(p.experience_years ?? '')}"></div>
        <div><label for="p_domain">Domain</label><input id="p_domain" value="${esc(p.domain || '')}"></div>
      </div>
      <label for="p_prev">Previous companies</label><input id="p_prev" value="${esc(p.prev_companies || '')}">
      <label for="p_li">LinkedIn</label><input id="p_li" value="${esc(p.linkedin || '')}">
      <label class="check"><input type="checkbox" id="p_willing" ${p.willing_to_help ? 'checked' : ''}>I am willing to answer questions and host sessions</label>
      <p class="small muted">To correct your name, college, branch or year, ask a moderator.</p>
      <button class="btn" type="submit">Save changes</button></form>` : ''}
    <div class="panel"><h2 style="margin-top:0">My rooms</h2>${roomsHtml ? `<table class="tbl">${roomsHtml}</table>` : '<p class="muted">No rooms joined.</p>'}</div>
    <div class="panel"><h2 style="margin-top:0">Account</h2><div class="row"><button class="btn ghost" data-act="signout">Sign out</button><button class="btn red" data-act="delacct">Delete my account</button></div></div>`;
  $('#prof')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const v = (id) => $(id).value.trim() || null;
    try { await rpc('update_my_profile', { p_whatsapp: ($('#p_wa').value || '').replace(/[\s-]/g, ''), p_city: v('#p_city'), p_company: v('#p_company'), p_designation: v('#p_desig'), p_experience: v('#p_exp') ? Number(v('#p_exp')) : null, p_domain: v('#p_domain'), p_prev: v('#p_prev'), p_linkedin: v('#p_li'), p_willing: $('#p_willing').checked }); toast('Changes saved.'); }
    catch (err) { toast(errMsg(err), true); }
  });
}

// ---------- admin ----------
const TABS = [['pending', 'Approvals', isStaff], ['members', 'Members', isMod], ['rooms', 'Rooms & invites', isMod], ['reports', 'Reports', isStaff], ['log', 'Activity log', isMod], ['words', 'Blocked words', isMod]];
async function viewAdmin(tab) {
  if (!isStaff()) { app.innerHTML = '<p class="empty">Not allowed.</p>'; return; }
  const tabs = TABS.filter((t) => t[2]());
  if (!tabs.find((t) => t[0] === tab)) tab = tabs[0][0];
  app.innerHTML = `<h1>${isMod() ? 'Admin' : 'Approvals'}</h1><nav class="tabs">${tabs.map((t) => `<a href="#/admin/${t[0]}" class="${t[0] === tab ? 'on' : ''}">${t[1]}</a>`).join('')}</nav><div id="atab"><p class="loading">Loading…</p></div>`;
  const el = $('#atab');
  try {
    if (tab === 'pending') {
      const list = await rpc('pending_members'); S.pendingCount = list.length; renderNav();
      el.innerHTML = list.length ? list.map((p) => `<div class="panel"><div class="spread"><div><span class="handle">${esc(p.handle)}</span> <span class="badge b-pend">${esc(p.role)}</span></div><span class="small muted">${fmt(p.created_at)}</span></div>
        <p class="small">${esc(p.college_full)} · ${esc(p.degree)} · ${esc(p.branch_code)} · ${esc(p.pass_year)}${p.company ? `<br>${esc(p.designation || '')} at ${esc(p.company)}` : ''}${p.linkedin ? `<br><a href="${esc(p.linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn profile</a>` : ''}<br>Joined via: <b>${esc(p.invite_label || 'no invite link')}</b></p>
        <div class="row"><button class="btn sm" data-act="approve" data-id="${p.id}">Approve</button>${isMod() && ['faculty', 'expert'].includes(p.role) ? `<button class="btn sm ghost" data-act="approvebadge" data-id="${p.id}" data-role="${esc(p.role)}">Approve with ${esc(p.role)} badge</button>` : ''}${isAdmin() ? `<button class="btn sm red" data-act="ban" data-id="${p.id}">Ban</button>` : ''}</div></div>`).join('') : '<p class="empty">No one is waiting for approval.</p>';
    }
    if (tab === 'members') {
      const all = [...S.members.values()].sort((a, b) => a.handle.localeCompare(b.handle));
      const al = new Map(((await rpc('alerts_status')) || []).map((x) => [x.user_id, x.devices]));
      const onCount = all.filter((m) => al.get(m.id) > 0).length;
      el.innerHTML = `<p class="notice ${onCount < all.length ? '' : 'teal'}">Alerts on: <b>${onCount} of ${all.length}</b> members. Members without alerts only see new posts when they open the site.</p><input id="msearch" placeholder="Search by code, e.g. ECA-S-2027" aria-label="Search members"><div class="scroll"><table class="tbl" id="mtable"></table></div>`;
      const draw = (q) => { $('#mtable').innerHTML = '<tr><th>Member</th><th>Alerts</th><th>Status</th><th></th></tr>' + all.filter((m) => !q || m.handle.toLowerCase().includes(q)).map((m) => `<tr><td>${who(m.id)}</td><td class="small">${al.get(m.id) > 0 ? '🔔 On' : '🔕 Off'}</td><td class="small">${m.status === 'banned' ? 'Banned' : m.muted_until && new Date(m.muted_until) > new Date() ? 'Muted' : 'Active'}</td><td><button class="btn sm ghost" data-act="member" data-id="${m.id}">Manage</button></td></tr>`).join(''); };
      draw(''); $('#msearch').addEventListener('input', (e) => draw(e.target.value.toLowerCase().trim()));
    }
    if (tab === 'rooms') {
      const { data: invs } = await sb.from('invites').select('*').order('created_at', { ascending: false });
      el.innerHTML = (isAdmin() ? '<p><button class="btn gold" data-act="roomedit">Create room</button></p>' : '') + S.rooms.filter((r) => !r.archived).map((r) => {
        const ri = (invs || []).filter((i) => i.room_id === r.id);
        return `<div class="panel"><div class="spread"><div><div class="room-name">${esc(r.name)}</div><div class="small muted">${esc(r.type)} · slow mode ${Math.round(r.slow_mode_seconds / 60)} min · links ${r.allow_student_links ? 'allowed' : 'blocked'} for students · images ${r.image_approval ? 'need approval' : 'allowed'}</div></div>
          <div class="row">${isAdmin() ? `<button class="btn sm ghost" data-act="roomedit" data-id="${r.id}">Edit</button><button class="btn sm ghost" data-act="archive" data-id="${r.id}">Archive & rename</button>` : ''}<button class="btn sm" data-act="newinvite" data-id="${r.id}">New invite link</button></div></div>
          ${ri.length ? `<div class="scroll"><table class="tbl" style="margin-top:8px"><tr><th>Invite link for</th><th>Auto-approve</th><th>Joined</th><th>Expires</th><th></th></tr>${ri.map((i) => `<tr><td>${esc(i.label)}</td><td>${i.auto_approve ? `Yes, ${i.max_uses ? 'first ' + i.max_uses : 'everyone'}` : 'No'}</td><td>${i.uses}</td><td class="small">${i.disabled ? '<b>Disabled</b>' : i.expires_at ? fmt(i.expires_at) : 'Never'}</td><td><div class="row">${!i.disabled ? `<button class="btn sm ghost" data-act="showinvite" data-token="${esc(i.token)}" data-room="${r.id}">Invitation</button><button class="btn sm ghost" data-act="disinvite" data-id="${i.id}">Disable</button>` : ''}</div></td></tr>`).join('')}</table></div>` : '<p class="small muted">No invite links yet.</p>'}</div>`;
      }).join('');
    }
    if (tab === 'reports') {
      const { data: reps } = await sb.from('reports').select('*').order('created_at', { ascending: false });
      const ids = [...new Set((reps || []).map((r) => r.message_id))];
      const { data: msgs } = ids.length ? await sb.from('messages').select('*').in('id', ids) : { data: [] };
      el.innerHTML = ids.length ? ids.map((id) => { const m = (msgs || []).find((x) => x.id === id); const rs = reps.filter((r) => r.message_id === id); if (!m) return '';
        return `<div class="panel"><div class="small muted">${rs.length} report(s) · ${esc(S.rooms.find((r) => r.id === m.room_id)?.name || '')}</div><div class="msg"><div class="meta">${who(m.author_id)}<span>${fmt(m.created_at)}</span></div><div class="body">${esc(m.body)}${m.attachment_name ? '<br>📎 ' + esc(m.attachment_name) : ''}</div></div>
          <p class="small">Reasons: ${rs.map((r) => esc(r.reason || '–')).join('; ')}</p><div class="row">${!m.deleted_at ? `<button class="btn sm red" data-act="del" data-id="${m.id}">Delete message</button>` : '<span class="small muted">Already deleted</span>'}<button class="btn sm ghost" data-act="mute" data-id="${m.author_id}">Mute author</button><button class="btn sm ghost" data-act="dismiss" data-id="${m.id}">Dismiss reports</button>${m.pending ? `<button class="btn sm ghost" data-act="approvemsg" data-id="${m.id}">Approve message</button>` : ''}</div></div>`; }).join('') : '<p class="empty">No reports.</p>';
    }
    if (tab === 'log') {
      const { data: log } = await sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(500);
      el.innerHTML = `<input id="lsearch" placeholder="Filter by code, action or text" aria-label="Filter log"><div class="scroll"><table class="tbl" id="ltable"></table></div><p class="small muted">The activity log cannot be edited or deleted by anyone, including admins.</p>`;
      const rn = (id) => esc(S.rooms.find((r) => r.id === id)?.name || '');
      const draw = (q) => { $('#ltable').innerHTML = '<tr><th>When</th><th>Who</th><th>Action</th><th>To whom</th><th>Details</th></tr>' + (log || []).filter((l) => !q || JSON.stringify(l).toLowerCase().includes(q)).map((l) => `<tr><td class="small">${fmt(l.created_at)}</td><td>${esc(l.actor_handle || '')}</td><td>${esc(l.action.replace(/_/g, ' '))}</td><td>${esc(l.target_handle || '')}</td><td class="small">${rn(l.room_id)} ${esc(JSON.stringify(l.details) === '{}' ? '' : JSON.stringify(l.details))}</td></tr>`).join(''); };
      draw(''); $('#lsearch').addEventListener('input', (e) => draw(e.target.value.toLowerCase().trim()));
    }
    if (tab === 'words') {
      const { data: w } = await sb.from('bad_words').select('*').order('word');
      el.innerHTML = `<form id="wform" class="row"><input id="wnew" placeholder="Add a word to block" style="flex:1"><button class="btn">Add word</button></form><p>${(w || []).map((x) => `<span class="badge b-pend" style="margin:4px">${esc(x.word)} <button class="btn sm ghost" style="min-height:0;padding:0 4px;border:0" data-act="delword" data-w="${esc(x.word)}" aria-label="Remove ${esc(x.word)}">×</button></span>`).join('')}</p>`;
      $('#wform').addEventListener('submit', async (e) => { e.preventDefault(); const v = $('#wnew').value.trim(); if (!v) return; try { await rpc('admin_bad_word', { p_word: v, p_add: true }); route(); } catch (err) { toast(errMsg(err), true); } });
    }
  } catch (e) { el.innerHTML = `<p class="notice red">${esc(errMsg(e))}</p>`; }
}
function inviteText(room, token) {
  return `🎓 VKV Community – ${room.name}

A private Q&A space where students, alumni, faculty and industry experts help each other prepare.

What you get:
✅ Ask doubts and get answers from experienced professionals
✅ Past questions and study material, saved for every new batch
✅ Live voice and video guidance sessions
✅ Instant alerts on your phone

🔒 Your privacy: your name, number and email are never shown to other members. You appear only as a code like ECA-S-2027-CS-482.
${room.objective ? `\n🎯 Objective: ${room.objective}\n` : ''}
👉 Join with your Gmail: ${BASE}?inv=${token}
(Already a member? Use the same Gmail. No form again.)
🔔 After joining, tap "Turn on alerts" to get instant notifications.${room.whatsapp_channel ? `\n📢 Follow for updates: ${room.whatsapp_channel}` : ''}

Please read and follow the community rules shown when you join.`;
}
async function memberModal(id) {
  const m = S.members.get(id);
  let priv = '';
  if (isAdmin()) { const { data: p } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
    if (p) priv = `<div class="notice teal small"><b>${esc(p.full_name)}</b> (${esc(p.gender)}, born ${esc(p.dob)})<br>📱 ${esc(p.whatsapp)} · ✉ ${esc(p.email)}<br>${esc(p.college_full)} · ${esc(p.degree)} · ${esc(p.branch_code)} · ${esc(p.pass_year)}${p.company ? `<br>${esc(p.designation || '')} at ${esc(p.company)} (${esc(p.experience_years ?? '?')} yrs)` : ''}${p.linkedin ? `<br><a href="${esc(p.linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn</a>` : ''}<br>Joined ${fmt(p.created_at)}</div>`; }
  openModal(`<h2 style="margin-top:0">${who(id)}</h2>${priv}
    <label>Approval</label><div class="row">${m.approved ? (isMod() ? `<button class="btn sm ghost" data-act="unapprove" data-id="${id}">Revoke approval</button>` : 'Approved') : `<button class="btn sm" data-act="approve" data-id="${id}">Approve</button>`}</div>
    <label for="mm_role">Role and badge</label><div class="row"><select id="mm_role" style="flex:1">${['student', 'alumni', 'faculty', 'expert'].map((r) => `<option ${r === m.role ? 'selected' : ''}>${r}</option>`).join('')}</select><label class="check" style="margin:0"><input type="checkbox" id="mm_ver" ${m.verified ? 'checked' : ''}>Verified</label><button class="btn sm" data-act="setrole" data-id="${id}">Save</button></div>
    ${isAdmin() ? `<label for="mm_app">Permissions</label><div class="row"><select id="mm_app" style="flex:1">${['member', 'moderator', 'admin'].map((r) => `<option ${r === m.app_role ? 'selected' : ''}>${r}</option>`).join('')}</select><button class="btn sm" data-act="setapp" data-id="${id}">Save</button></div>` : ''}
    <label>Correct masked code</label><div class="row"><input id="mm_col" placeholder="College (max 5)" maxlength="5" style="flex:1" value="${esc(m.handle.split('-')[0])}"><input id="mm_year" type="number" style="width:100px" value="${esc(m.handle.split('-')[2])}"><select id="mm_br" style="flex:1">${branchOptions(m.handle.split('-')[3])}</select><button class="btn sm" data-act="rename" data-id="${id}">Rename</button></div>
    <label>Mute</label><div class="row"><button class="btn sm ghost" data-act="mute" data-id="${id}">Mute…</button>${m.muted_until && new Date(m.muted_until) > new Date() ? `<button class="btn sm ghost" data-act="unmute" data-id="${id}">Unmute</button>` : ''}</div>
    ${isAdmin() ? `<label>Ban</label><div class="row">${m.status === 'banned' ? `<button class="btn sm ghost" data-act="unban" data-id="${id}">Unban</button>` : `<button class="btn sm red" data-act="ban" data-id="${id}">Ban permanently</button>`}</div>` : ''}
    <label>Expert in rooms</label><div class="row">${S.rooms.filter((r) => !r.archived).map((r) => `<button class="btn sm ghost" data-act="expert" data-id="${id}" data-room="${r.id}">${esc(r.name)}</button>`).join('')}</div>
    <p style="margin-top:16px"><button class="btn ghost" data-close>Close</button></p>`);
}
function roomForm(r) {
  r = r || { slow_mode_seconds: 300 };
  openModal(`<h2 style="margin-top:0">${r.id ? 'Edit room' : 'Create room'}</h2><form id="rform">
    <label for="r_name">Room name</label><input id="r_name" value="${esc(r.name || '')}" required placeholder="e.g. TCS Drive 2026">
    <label for="r_slug">Short link name <span class="opt">(lowercase, no spaces)</span></label><input id="r_slug" value="${esc(r.slug || '')}" required pattern="[a-z0-9-]{2,40}" placeholder="tcs-2026">
    <label for="r_type">Type</label><select id="r_type">${['exam', 'drive', 'general'].map((t) => `<option ${t === r.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <label for="r_obj">Objective</label><textarea id="r_obj" maxlength="300">${esc(r.objective || '')}</textarea>
    <label for="r_ch">WhatsApp Channel link <span class="opt">(optional)</span></label><input id="r_ch" value="${esc(r.whatsapp_channel || '')}" placeholder="https://whatsapp.com/channel/…">
    <label for="r_slow">Slow mode for students</label><select id="r_slow">${[[0, 'Off'], [60, '1 minute'], [300, '5 minutes'], [600, '10 minutes'], [1800, '30 minutes']].map(([v, t]) => `<option value="${v}" ${v === r.slow_mode_seconds ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <label class="check"><input type="checkbox" id="r_links" ${r.allow_student_links ? 'checked' : ''}>Allow students to post links</label>
    <label class="check"><input type="checkbox" id="r_img" ${r.image_approval ? 'checked' : ''}>Student files and images need approval before others see them</label>
    <div class="row"><button class="btn gold">${r.id ? 'Save room' : 'Create room'}</button><button type="button" class="btn ghost" data-close>Cancel</button></div></form>`);
  $('#r_name').addEventListener('input', (e) => { if (!r.id && !$('#r_slug').dataset.t) $('#r_slug').value = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); });
  $('#r_slug').addEventListener('input', (e) => (e.target.dataset.t = 1));
  $('#rform').addEventListener('submit', async (e) => { e.preventDefault();
    try { await rpc('admin_upsert_room', { p_id: r.id || null, p_slug: $('#r_slug').value.trim(), p_name: $('#r_name').value.trim(), p_type: $('#r_type').value, p_objective: $('#r_obj').value.trim() || null, p_channel: $('#r_ch').value.trim() || null, p_slow: parseInt($('#r_slow').value, 10), p_links: $('#r_links').checked, p_img: $('#r_img').checked });
      closeModal(); await loadCore(); toast(r.id ? 'Room saved.' : 'Room created. Now create an invite link for each group.'); route(); } catch (err) { toast(errMsg(err), true); } });
}
function showInvite(room, token) {
  const txt = inviteText(room, token);
  openModal(`<h2 style="margin-top:0">Invitation for ${esc(room.name)}</h2><pre class="invite">${esc(txt)}</pre>
    <div class="row"><button class="btn" data-act="copy">Copy</button><a class="btn gold" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">Share on WhatsApp</a><button class="btn ghost" data-close>Close</button></div>`);
  $('#modal-body [data-act=copy]').addEventListener('click', async () => { try { await navigator.clipboard.writeText(txt); toast('Invitation copied.'); } catch { toast('Select the text and copy it manually.', true); } });
}

// ---------- push ----------
function b64ToU8(b) { const p = '='.repeat((4 - (b.length % 4)) % 4); const r = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); }
async function enablePush(silent) {
  try {
    const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
    if (!silent) { const perm = await Notification.requestPermission(); if (perm !== 'granted') { toast('Alerts were not allowed.', true); route(); return; } }
    else if (Notification.permission !== 'granted') return;
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID) });
    const j = sub.toJSON();
    const { error } = await sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, user_id: S.user.id, p256dh: j.keys.p256dh, auth: j.keys.auth });
    if (error) throw error;
    if (!silent) { toast('Alerts are on.'); try { reg.showNotification('VKV Community', { body: 'Alerts are on. You will be notified of new questions, answers and live sessions.', icon: 'icon-192.png' }); } catch {}
      if (S.afterAlerts) { const h = S.afterAlerts; S.afterAlerts = null; location.hash = h; } else route(); }
  } catch (e) { if (!silent) toast('Could not turn on alerts: ' + errMsg(e), true); }
}

// ---------- actions ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) { const o = e.target.closest('[data-open]'); if (o && !e.target.closest('a,button,[data-file]')) location.hash = `#/room/${roomState.id}/t/${o.dataset.open}`; return; }
  const a = t.dataset.act, id = t.dataset.id;
  const run = async (fn, args, ok) => { try { await rpc(fn, args); if (ok) toast(ok); await loadCore(); if (roomState.id) await loadRoomMsgs(roomState.id).catch(() => {}); if (!$('#modal').hidden && fn !== 'mod_delete_message') closeModal(); route(true); } catch (err) { toast(errMsg(err), true); } };
  switch (a) {
    case 'login': {
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: BASE, queryParams: { prompt: 'select_account' } } });
      if (error) toast(errMsg(error), true); break; }
    case 'signout': await sb.auth.signOut(); location.href = BASE; break;
    case 'push': enablePush(false); break;
    case 'skipalerts': S.afterAlerts = null; break;
    case 'open': location.hash = `#/room/${roomState.id}/t/${id}`; break;
    case 'joinroom': try { await rpc('join_room', { p_room: id }); await loadCore(); toast('Joined.'); location.hash = '#/room/' + id; } catch (err) { toast(errMsg(err), true); } break;
    case 'leave': if (confirm('Leave this room? You can rejoin later.')) { const { error } = await sb.from('room_members').delete().eq('room_id', id).eq('user_id', S.user.id); if (error) toast(errMsg(error), true); else { await loadCore(); route(); } } break;
    case 'best': run('mark_best', { p_msg: id }, 'Marked as best answer.'); break;
    case 'del': if (confirm('Delete this message?')) run('mod_delete_message', { p_msg: id, p_reason: null }, 'Message deleted.'); break;
    case 'approvemsg': run('mod_approve_message', { p_msg: id }, 'Message approved.'); break;
    case 'dismiss': run('dismiss_reports', { p_msg: id }, 'Reports dismissed.'); break;
    case 'report': { const r = prompt('Why are you reporting this message? (spam, abuse, off-topic…)'); if (r !== null) run('report_message', { p_msg: id, p_reason: r }, 'Thanks. A moderator will review it.'); break; }
    case 'mute': {
      const opts = isMod() ? 'Mute for how many hours? (e.g. 1, 24, 168). Type 0 for permanent.' : 'Mute for how many hours? (max 24)';
      const h = prompt(opts, '24'); if (h === null) break; const n = parseInt(h, 10);
      if (isNaN(n) || n < 0) { toast('Enter a number of hours.', true); break; }
      const reason = prompt('Reason (optional)') || null;
      run('mod_mute', { p_user: id, p_hours: n === 0 ? null : n, p_reason: reason }, 'Member muted.'); break; }
    case 'unmute': run('mod_unmute', { p_user: id }, 'Member unmuted.'); break;
    case 'approve': run('approve_member', { p_user: id, p_approve: true }, 'Member approved.'); break;
    case 'unapprove': if (confirm('Revoke approval? This member will become read-only.')) run('approve_member', { p_user: id, p_approve: false }, 'Approval revoked.'); break;
    case 'approvebadge': try { await rpc('approve_member', { p_user: id, p_approve: true }); await rpc('admin_verify', { p_user: id, p_role: t.dataset.role, p_verified: true }); toast('Approved with badge.'); await loadCore(); route(); } catch (err) { toast(errMsg(err), true); } break;
    case 'ban': if (confirm('Ban this member permanently?')) run('admin_set_status', { p_user: id, p_status: 'banned', p_reason: prompt('Reason (optional)') || null }, 'Member banned.'); break;
    case 'unban': run('admin_set_status', { p_user: id, p_status: 'active', p_reason: null }, 'Member unbanned.'); break;
    case 'setrole': run('admin_verify', { p_user: id, p_role: $('#mm_role').value, p_verified: $('#mm_ver').checked }, 'Role updated.'); break;
    case 'setapp': run('admin_set_app_role', { p_user: id, p_role: $('#mm_app').value }, 'Permissions updated.'); break;
    case 'rename': run('mod_rename', { p_user: id, p_college: $('#mm_col').value.trim(), p_branch: $('#mm_br').value, p_year: parseInt($('#mm_year').value, 10) }, 'Code updated.'); break;
    case 'expert': { const on = confirm(`Make this member an expert in "${t.textContent}"? Press Cancel to remove them as expert.`); run('set_room_expert', { p_room: t.dataset.room, p_user: id, p_expert: on }, on ? 'Expert assigned.' : 'Expert removed.'); break; }
    case 'member': memberModal(id); break;
    case 'roomedit': roomForm(S.rooms.find((r) => r.id === id)); break;
    case 'archive': { const r = S.rooms.find((x) => x.id === id); const n = prompt(`Current Q&A of "${r.name}" will be saved as a read-only archive. New name for this room:`, r.name); if (n && n.trim()) run('admin_archive_and_rename', { p_room: id, p_new_name: n.trim() }, 'Archived and renamed.'); break; }
    case 'newinvite': {
      const r = S.rooms.find((x) => x.id === id);
      openModal(`<h2 style="margin-top:0">New invite link: ${esc(r.name)}</h2><form id="iform">
        <label for="i_label">Which group will you share it in?</label><input id="i_label" required placeholder="e.g. ECA CS 2027 WhatsApp group" maxlength="80">
        <label class="check"><input type="checkbox" id="i_auto">Trusted group: approve people automatically</label>
        <div id="i_more" hidden class="grid2"><div><label for="i_max">Seats (people auto-approved)</label><input id="i_max" type="number" min="1" placeholder="e.g. 120"></div><div><label for="i_days">Link valid for (days)</label><input id="i_days" type="number" min="1" placeholder="e.g. 7"></div></div>
        <p class="small muted">After the seats are used up or the link expires, new joiners wait in the approval queue and can only read.</p>
        <div class="row"><button class="btn gold">Create invite link</button><button type="button" class="btn ghost" data-close>Cancel</button></div></form>`);
      $('#i_auto').addEventListener('change', (ev) => ($('#i_more').hidden = !ev.target.checked));
      $('#iform').addEventListener('submit', async (ev) => { ev.preventDefault();
        try { const auto = $('#i_auto').checked; const tok = await rpc('admin_create_invite', { p_room: id, p_label: $('#i_label').value.trim(), p_auto: auto, p_max: auto && $('#i_max').value ? parseInt($('#i_max').value, 10) : null, p_days: $('#i_days').value ? parseInt($('#i_days').value, 10) : null });
          showInvite(r, tok); if (location.hash.startsWith('#/admin/rooms')) viewAdmin('rooms'); } catch (err) { toast(errMsg(err), true); } });
      break; }
    case 'showinvite': showInvite(S.rooms.find((x) => x.id === t.dataset.room), t.dataset.token); break;
    case 'disinvite': if (confirm('Disable this invite link? People who already joined stay.')) run('admin_disable_invite', { p_invite: id }, 'Invite link disabled.'); break;
    case 'delword': run('admin_bad_word', { p_word: t.dataset.w, p_add: false }, 'Word removed.'); break;
    case 'delacct': if (confirm('Delete your account permanently? Your private details will be erased and your messages anonymised.')) { try { await rpc('delete_my_account'); await sb.auth.signOut(); location.href = BASE; } catch (err) { toast(errMsg(err), true); } } break;
    case 'golive': {
      const room = S.rooms.find((r) => r.id === roomState.id);
      openModal(`<h2 style="margin-top:0">Start a live session</h2><form id="lform">
        <label for="l_mode">Type</label><select id="l_mode"><option value="voice">Voice only</option><option value="video">Video</option></select>
        <label for="l_topic">Topic</label><input id="l_topic" maxlength="200" placeholder="e.g. HR round tips – Q&A">
        <p class="small muted">Everyone joins muted. As host, use “Mute everyone” and ask people to raise a hand, then unmute them one by one. The first person to open the session becomes host; Jitsi may ask you to sign in with Google once.</p>
        <div class="row"><button class="btn red">Start and notify room</button><button type="button" class="btn ghost" data-close>Cancel</button></div></form>`);
      $('#lform').addEventListener('submit', async (ev) => { ev.preventDefault();
        const rnd = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
        const url = `https://meet.jit.si/VKV-${room.slug}-${rnd}`;
        const { data, error } = await sb.from('messages').insert({ room_id: room.id, author_id: S.user.id, kind: 'live', live_url: url, live_mode: $('#l_mode').value, body: $('#l_topic').value.trim() }).select().single();
        if (error) { toast(errMsg(error), true); return; }
        closeModal(); openLive(data); await loadRoomMsgs(room.id); route(true); });
      break; }
    case 'joinlive': { const m = roomState.msgs.find((x) => x.id === id); if (m) openLive(m); break; }
  }
});
function openLive(m) {
  const name = encodeURIComponent(JSON.stringify(S.me.handle));
  const cfg = `#userInfo.displayName=${name}&config.startWithAudioMuted=true&config.prejoinConfig.enabled=false&config.disableDeepLinking=true` + (m.live_mode === 'voice' ? '&config.startAudioOnly=true&config.startWithVideoMuted=true' : '&config.startWithVideoMuted=true');
  window.open(m.live_url + cfg, '_blank', 'noopener');
}

// ---------- router ----------
async function route(keep) {
  renderNav();
  if (!S.user) return viewLogin();
  if (!S.me) return viewRegister();
  if (S.me.status !== 'active' && !location.hash.startsWith('#/profile')) { app.innerHTML = '<div class="notice red">Your account has been banned by an admin.</div>'; return; }
  const h = location.hash.replace(/^#\/?/, '').split('/');
  if (h[0] !== 'room' && S.channel) { sb.removeChannel(S.channel); S.channel = null; roomState.id = null; }
  try {
    if (h[0] === 'room' && h[1]) return await viewRoom(h[1], h[2] === 't' ? h[3] : null, keep);
    if (h[0] === 'profile') return await viewProfile();
    if (h[0] === 'alerts') return viewAlerts();
    if (h[0] === 'admin') return await viewAdmin(h[1]);
    return viewHome();
  } catch (e) { app.innerHTML = `<p class="notice red">${esc(errMsg(e))}</p>`; }
}
addEventListener('hashchange', () => { route(); scrollTo(0, 0); });

(async function boot() {
  await loadLookups();
  const { data: { session } } = await sb.auth.getSession();
  S.user = session?.user || null;
  if (location.search.includes('code=') || location.search.includes('inv=')) history.replaceState(null, '', BASE + location.hash);
  if (S.user) { await loadMe(); if (S.me) { await loadCore(); await processInvite(); enablePush(true); } }
  route();
  sb.auth.onAuthStateChange(async (ev, s) => {
    if (ev === 'SIGNED_IN' && !S.user) { S.user = s.user; await loadMe(); if (S.me) { await loadCore(); await processInvite(); } route(); }
    if (ev === 'SIGNED_OUT') { S.user = null; S.me = null; route(); }
  });
})();
})();
