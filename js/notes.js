
/* ================= Notes: private or shared, edited together =================
   Notes save on their own (not through the whole-app sync) with a version check, so two people
   can never silently overwrite each other. In live mode, Supabase Realtime streams other people's
   saves and shows who else has the note open. Note bodies are HTML, always sanitised with
   DOMPurify before they're shown or saved. */
const noteUI = {open:null, dirty:false, saving:false, conflict:null, remoteNewer:null, viewers:[], timer:null, chan:null, listChan:null, savedAt:null};

const noteById = id => (state.notes || []).find(n => n.id === id);
const isNoteOwner = n => !!n && n.owner === me().id;
const canViewNote = n => !!n && (n.owner === me().id || n.editors.includes(me().id) || n.viewers.includes(me().id) || n.club_access !== 'none');
const canEditNote = n => !!n && (isNoteOwner(n) || n.editors.includes(me().id) || n.club_access === 'edit');
const canDeleteNote = n => !!n && (isNoteOwner(n) || isAdmin());
const noteAccess = n => isNoteOwner(n) ? 'owner' : n.editors.includes(me().id) ? 'editor' : n.viewers.includes(me().id) ? 'viewer' : n.club_access === 'edit' ? 'club-editor' : 'club-viewer';
const noteTitle = n => n.title?.trim() || 'Untitled';
const pinKey = () => 'rocket-note-pins-' + me().id;
const notePins = () => { try { return JSON.parse(localStorage.getItem(pinKey()) || '[]'); } catch (e) { return []; } };
const togglePin = id => { const p = notePins(), next = p.includes(id) ? p.filter(x => x !== id) : [...p, id]; try { localStorage.setItem(pinKey(), JSON.stringify(next)); } catch (e) {} };

// Only formatting survives: no scripts, styles, event handlers, images or unsafe links.
const NOTE_TAGS = ['p', 'br', 'div', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'hr', 'span'];
function sanitizeNote(html) {
  if (!window.DOMPurify) { const d = document.createElement('div'); d.textContent = String(html || '').replace(/<[^>]*>/g, ' '); return d.innerHTML; }
  const clean = DOMPurify.sanitize(String(html || ''), {ALLOWED_TAGS:NOTE_TAGS, ALLOWED_ATTR:['href', 'data-checklist', 'data-checked'], ALLOW_DATA_ATTR:false});
  return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
}
// Plain text of a note (for previews, search, word counts) — a space between blocks so words don't run together.
const noteText = html => { const d = document.createElement('div'); d.innerHTML = sanitizeNote(html).replace(/<\/(p|div|h[1-6]|li|blockquote|pre|ul|ol)>|<br\s*\/?>/gi, '$& '); return (d.textContent || '').replace(/\s+/g, ' ').trim(); };

function notesList() {
  const f = filters.notes, q = f.q.trim().toLowerCase(), pins = notePins(), meId = me().id;
  return (state.notes || []).filter(n => canViewNote(n) && (f.tab === 'all' || (f.tab === 'mine' ? n.owner === meId : f.tab === 'shared' ? n.owner !== meId && (n.editors.includes(meId) || n.viewers.includes(meId)) : n.club_access !== 'none'))
      && (!q || `${n.title} ${noteText(n.body)}`.toLowerCase().includes(q)))
    .sort((a, b) => (pins.includes(b.id) - pins.includes(a.id)) || String(b.updated_at).localeCompare(String(a.updated_at)));
}
function noteShareIcon(n) {
  if (n.club_access !== 'none') return `<span class="nt-badge" title="Shared with the club">${ic('team')}Club</span>`;
  if (n.editors.length || n.viewers.length) return `<span class="nt-badge" title="Shared with ${n.editors.length + n.viewers.length}">${ic('team')}${n.editors.length + n.viewers.length}</span>`;
  return `<span class="nt-badge private" title="Only you">${ic('lock')}</span>`;
}
function noteListHtml() {
  const list = notesList(), pins = notePins();
  return list.length ? list.map(n => `<button type="button" class="nt-item ${noteUI.open === n.id ? 'active' : ''}" data-act="note-open" data-id="${esc(n.id)}">
      <span class="nt-item-top"><span class="nt-item-title">${pins.includes(n.id) ? '<span class="nt-pin">●</span>' : ''}${esc(noteTitle(n))}</span>${noteShareIcon(n)}</span>
      <span class="nt-snip">${esc(noteText(n.body).slice(0, 110) || 'No text yet')}</span>
      <span class="nt-meta">${fmtStamp(n.updated_at)}${n.owner !== me().id ? ` · ${esc(member(n.owner)?.name?.split(' ')[0] || 'Someone')}’s` : ''}</span></button>`).join('')
    : `<div class="empty">${filters.notes.q ? 'No notes match that search.' : 'No notes here yet.'}</div>`;
}

function vNotes() {
  const f = filters.notes, n = noteUI.open && canViewNote(noteById(noteUI.open)) ? noteById(noteUI.open) : null;
  if (noteUI.open && !n) noteUI.open = null;
  return `<div class="page notes-page">
    ${heading('Notes', 'Private by default. Share a note with people — or the whole club — and edit it together.', `<button class="btn btn-primary" data-act="note-new">${ic('plus')}New note</button>`)}
    <div class="notes-layout ${n ? 'editing' : ''}">
      <aside class="nt-side panel">
        <div class="nt-side-head"><label class="search" style="width:100%">${ic('search')}<input class="input" type="search" data-input="notes-q" value="${esc(f.q)}" placeholder="Search notes…" aria-label="Search notes" style="width:100%"></label>
          <div class="seg nt-tabs" role="group">${[['all', 'All'], ['mine', 'Mine'], ['shared', 'Shared'], ['club', 'Club']].map(([v, l]) => `<button type="button" data-act="notes-tab" data-v="${v}" aria-pressed="${f.tab === v}">${l}</button>`).join('')}</div></div>
        <div class="nt-list" id="nt-list">${noteListHtml()}</div>
      </aside>
      <section class="nt-main panel">${n ? noteEditorHtml(n) : `<div class="nt-empty">${ic('edit')}<p>Pick a note, or start a new one.</p><button class="btn btn-primary" data-act="note-new">${ic('plus')}New note</button></div>`}</section>
    </div>
  </div>`;
}

function noteEditorHtml(n) {
  const edit = canEditNote(n), owner = isNoteOwner(n), pinned = notePins().includes(n.id), acc = noteAccess(n);
  const tool = (cmd, label, title) => `<button type="button" class="nt-tool" data-cmd="${cmd}" title="${title}" aria-label="${title}">${label}</button>`;
  return `<div class="nt-bar">
      <button type="button" class="btn btn-ghost sm nt-back" data-act="note-close" aria-label="Back to notes">‹ Notes</button>
      <span class="nt-presence" id="nt-presence"></span>
      <span class="spacer"></span>
      <span class="nt-status" id="nt-status">${edit ? '' : 'View only'}</span>
      <button type="button" class="btn btn-ghost sm icon-btn" data-act="note-pin" data-id="${esc(n.id)}" title="${pinned ? 'Unpin' : 'Pin to top'}" aria-pressed="${pinned}">${pinned ? '●' : '○'}</button>
      ${owner ? `<button type="button" class="btn sm" data-act="note-share" data-id="${esc(n.id)}">${ic('team')}Share</button>` : `<span class="nt-badge">${acc === 'viewer' || acc === 'club-viewer' ? 'Can view' : 'Can edit'} · ${esc(member(n.owner)?.name?.split(' ')[0] || 'Owner')}’s note</span>`}
      ${canDeleteNote(n) ? `<button type="button" class="btn btn-ghost sm icon-btn" data-act="note-delete" data-id="${esc(n.id)}" title="Delete note" aria-label="Delete note">${ic('trash')}</button>` : ''}
    </div>
    <div id="nt-alert"></div>
    ${edit ? `<div class="nt-toolbar" role="toolbar" aria-label="Formatting">
      ${tool('bold', '<b>B</b>', 'Bold (⌘B)')}${tool('italic', '<i>I</i>', 'Italic (⌘I)')}${tool('underline', '<u>U</u>', 'Underline (⌘U)')}${tool('strikeThrough', '<s>S</s>', 'Strikethrough')}<span class="sep"></span>
      ${tool('h2', 'H1', 'Heading')}${tool('h3', 'H2', 'Subheading')}${tool('p', '¶', 'Body text')}<span class="sep"></span>
      ${tool('insertUnorderedList', '•', 'Bulleted list')}${tool('insertOrderedList', '1.', 'Numbered list')}${tool('checklist', '☑', 'Checklist')}<span class="sep"></span>
      ${tool('blockquote', '❝', 'Quote')}${tool('pre', '{ }', 'Code')}${tool('link', ic('link'), 'Link')}${tool('insertHorizontalRule', '—', 'Divider')}${tool('removeFormat', '⌫', 'Clear formatting')}
    </div>
    <div class="nt-linkbar" id="nt-linkbar" hidden><input class="input" id="nt-link-url" type="url" placeholder="https://…" aria-label="Link address"><button type="button" class="btn sm btn-primary" data-act="note-link-apply">Add link</button><button type="button" class="btn sm btn-ghost" data-act="note-link-cancel">Cancel</button></div>` : ''}
    <div class="nt-doc">
      <input class="nt-title" id="note-title" value="${esc(n.title)}" placeholder="Untitled" ${edit ? '' : 'readonly'} aria-label="Note title" maxlength="200">
      <div class="nt-body md" id="note-body" ${edit ? 'contenteditable="true"' : ''} role="textbox" aria-multiline="true" aria-label="Note" data-placeholder="Start writing…">${sanitizeNote(n.body)}</div>
    </div>
    <div class="nt-foot" id="nt-foot">${noteFoot(n)}</div>`;
}
function noteFoot(n) {
  const words = noteText(n.body).split(' ').filter(Boolean).length;
  return `Edited ${fmtStamp(n.updated_at)}${n.updated_by ? ` by ${esc(member(n.updated_by)?.name || 'someone')}` : ''} · ${words} word${words === 1 ? '' : 's'}`;
}
function setNoteStatus(s, cls = '') { const el = document.getElementById('nt-status'); if (el) { el.textContent = s; el.className = 'nt-status ' + cls; } }
function refreshNoteList() { const l = document.getElementById('nt-list'); if (l) l.innerHTML = noteListHtml(); }

/* ---- editing & saving ---- */
function openNote(id) {
  if (!canViewNote(noteById(id))) return toast('That note isn’t shared with you', '', true);
  flushNote();
  noteUI.open = id; noteUI.dirty = false; noteUI.conflict = noteUI.remoteNewer = null; noteUI.viewers = [];
  if (view !== 'notes') { view = 'notes'; closeDialog(); }
  render(); window.scrollTo(0, 0);
  joinNoteChannel(id);
}
function closeNote() { flushNote(); leaveNoteChannel(); noteUI.open = null; render(); }
function markNoteDirty() {
  noteUI.dirty = true; setNoteStatus('Editing…');
  clearTimeout(noteUI.timer); noteUI.timer = setTimeout(() => saveNote(), 900);
}
function flushNote() { if (noteUI.dirty) { clearTimeout(noteUI.timer); saveNote(); } }
async function saveNote(force = false) {
  const n = noteById(noteUI.open), titleEl = document.getElementById('note-title'), bodyEl = document.getElementById('note-body');
  if (!n || !titleEl || !bodyEl || !canEditNote(n) || noteUI.saving || (!noteUI.dirty && !force)) return;
  const title = titleEl.value.trim().slice(0, 200), body = sanitizeNote(bodyEl.innerHTML);
  noteUI.saving = true; noteUI.dirty = false; setNoteStatus('Saving…');
  try {
    if (!LIVE) {
      Object.assign(n, {title, body, version:n.version + 1, updated_at:new Date().toISOString(), updated_by:me().id}); save();
    } else {
      let q = sb.from('notes').update({title, body}).eq('id', n.id);
      if (!force) q = q.eq('version', n.version);
      const {data, error} = await q.select('version, updated_at, updated_by');
      if (error) throw error;
      if (!data.length) {   // someone saved first (or access was removed)
        const {data:latest} = await sb.from('notes').select('*').eq('id', n.id).maybeSingle();
        noteUI.saving = false;
        if (!latest) { setNoteStatus('No longer shared with you', 'err'); return; }
        noteUI.conflict = {...latest, mine:{title, body}}; noteUI.dirty = true; renderNoteAlert(); setNoteStatus('Not saved', 'err'); return;
      }
      Object.assign(n, {title, body}, data[0]);
    }
    noteUI.savedAt = Date.now(); setNoteStatus('Saved'); refreshNoteList();
    const foot = document.getElementById('nt-foot'); if (foot) foot.innerHTML = noteFoot(n);
  } catch (e) {
    noteUI.dirty = true; setNoteStatus('Offline — will retry', 'err');
    clearTimeout(noteUI.timer); noteUI.timer = setTimeout(() => saveNote(), 5000);
  } finally { noteUI.saving = false; }
  if (noteUI.dirty && !noteUI.conflict) { clearTimeout(noteUI.timer); noteUI.timer = setTimeout(() => saveNote(), 600); }   // typed while saving
}
function renderNoteAlert() {
  const el = document.getElementById('nt-alert'); if (!el) return;
  const c = noteUI.conflict, r = noteUI.remoteNewer;
  if (c) el.innerHTML = `<div class="nt-alert warn">${ic('info')}<span><b>${esc(member(c.updated_by)?.name || 'Someone')}</b> saved this note while you were editing. Which version should stay?</span>
      <button type="button" class="btn sm" data-act="note-take-theirs">Use theirs</button><button type="button" class="btn sm btn-primary" data-act="note-keep-mine">Keep mine</button></div>`;
  else if (r) el.innerHTML = `<div class="nt-alert">${ic('info')}<span><b>${esc(member(r.updated_by)?.name || 'Someone')}</b> just updated this note.</span><button type="button" class="btn sm btn-primary" data-act="note-load-latest">Show latest</button></div>`;
  else el.innerHTML = '';
}
function applyNoteRow(row) {   // replace the editor content with a server version
  const n = noteById(row.id); if (!n) return;
  Object.assign(n, {title:row.title, body:row.body, version:row.version, updated_at:row.updated_at, updated_by:row.updated_by, editors:row.editors || n.editors, viewers:row.viewers || n.viewers, club_access:row.club_access || n.club_access});
  if (noteUI.open === row.id) {
    const t = document.getElementById('note-title'), b = document.getElementById('note-body');
    if (t) t.value = n.title; if (b) b.innerHTML = sanitizeNote(n.body);
    const foot = document.getElementById('nt-foot'); if (foot) foot.innerHTML = noteFoot(n);
  }
  refreshNoteList();
}

/* ---- live updates & presence (live mode) ---- */
function joinNoteChannel(id) {
  leaveNoteChannel();
  if (!LIVE || !sb) return;
  const ch = sb.channel('rocket-note-' + id, {config:{presence:{key:me().id}}});
  ch.on('presence', {event:'sync'}, () => { noteUI.viewers = Object.keys(ch.presenceState()).filter(k => k !== me().id); renderPresence(); })
    .subscribe(async status => { if (status === 'SUBSCRIBED') await ch.track({at:Date.now()}); });
  noteUI.chan = ch;
}
function leaveNoteChannel() { if (noteUI.chan && sb) { sb.removeChannel(noteUI.chan); noteUI.chan = null; } noteUI.viewers = []; }
function renderPresence() {
  const el = document.getElementById('nt-presence'); if (!el) return;
  el.innerHTML = noteUI.viewers.length ? `${noteUI.viewers.slice(0, 4).map(id => avatar(id)).join('')}<span class="faint">${noteUI.viewers.length === 1 ? `${esc(member(noteUI.viewers[0])?.name?.split(' ')[0] || 'Someone')} is here` : `${noteUI.viewers.length} others here`}</span>` : '';
}
function startNotesRealtime() {
  if (!LIVE || !sb || noteUI.listChan) return;
  noteUI.listChan = sb.channel('rocket-notes')
    .on('postgres_changes', {event:'*', schema:'public', table:'notes'}, p => {
      if (!state) return;
      if (p.eventType === 'DELETE') { state.notes = state.notes.filter(n => n.id !== p.old.id); if (noteUI.open === p.old.id) { noteUI.open = null; toast('That note was deleted'); render(); } else refreshNoteList(); return; }
      const row = p.new, n = noteById(row.id);
      if (!n) { state.notes.push(normNote(row)); refreshNoteList(); return; }
      if (row.version <= n.version) return;   // our own save coming back
      const focused = document.activeElement?.id === 'note-body' || document.activeElement?.id === 'note-title';
      if (noteUI.open !== row.id) { applyNoteRow(row); return; }
      if (noteUI.dirty) return;               // the version check on our next save will ask which to keep
      if (focused) { noteUI.remoteNewer = row; Object.assign(n, {editors:row.editors, viewers:row.viewers, club_access:row.club_access}); renderNoteAlert(); }
      else applyNoteRow(row);
    }).subscribe();
}
const normNote = x => ({id:x.id, title:x.title || '', body:x.body || '', owner:x.owner, editors:x.editors || [], viewers:x.viewers || [], club_access:x.club_access || 'none', version:x.version || 1, updated_at:x.updated_at, updated_by:x.updated_by, created_at:x.created_at});

/* ---- sharing ---- */
function openNoteShare(id) {
  const n = noteById(id); if (!isNoteOwner(n)) return;
  const people = state.members.filter(m => m.active !== false && m.id !== me().id).sort((a, b) => a.name.localeCompare(b.name));
  const accessOf = m => n.editors.includes(m.id) ? 'edit' : n.viewers.includes(m.id) ? 'view' : '';
  openDialog(`<form data-form="note-share" data-id="${esc(n.id)}" novalidate>${dHead(`Share “${esc(noteTitle(n))}”`, 'Only you, the owner, can change who has access.')}
    <div class="dlg-body">
      ${field('Everyone in the club', `<select class="input" id="ns-club" name="club">${opt('none', 'Only the people below', n.club_access)}${opt('view', 'Everyone can view', n.club_access)}${opt('edit', 'Everyone can edit', n.club_access)}</select>`, 'ns-club')}
      <div class="sect"><span class="eyebrow">People</span>
        ${people.map(m => `<div class="ns-row"><span class="who">${avatar(m.id)}<span>${esc(m.name)}</span></span><span class="faint" style="font-size:12px">${esc(roleLabel(m.role))}</span>
          <select class="input" name="acc_${m.id}" aria-label="Access for ${esc(m.name)}">${opt('', 'No access', accessOf(m))}${opt('view', 'Can view', accessOf(m))}${opt('edit', 'Can edit', accessOf(m))}</select></div>`).join('')}</div>
      <span class="muted-note">People you add get a notification. Removing someone takes the note away from them straight away.</span>
    </div>${foot('<button class="btn btn-primary">Save sharing</button>')}</form>`, 'narrow');
}
async function saveNoteShare(f, fd) {
  const n = noteById(f.dataset.id); if (!isNoteOwner(n)) return closeDialog();
  const editors = [], viewers = [];
  state.members.forEach(m => { const a = fd.get('acc_' + m.id); if (a === 'edit') editors.push(m.id); else if (a === 'view') viewers.push(m.id); });
  const club = fd.get('club'), before = new Set([...n.editors, ...n.viewers]), added = [...editors, ...viewers].filter(u => !before.has(u));
  try {
    if (LIVE) { const {data, error} = await sb.from('notes').update({editors, viewers, club_access:club}).eq('id', n.id).select('version, updated_at, updated_by'); if (error) throw error; Object.assign(n, data[0] || {}); }
    Object.assign(n, {editors, viewers, club_access:club}); if (!LIVE) save();
    closeDialog(); render(); toast('Sharing saved', club !== 'none' ? `everyone in the club can ${club}` : `${editors.length + viewers.length} ${editors.length + viewers.length === 1 ? 'person' : 'people'}`);
    if (LIVE && added.length) fnApi('push', 'note-share', {id:n.id, added}).catch(() => {});
  } catch (e) { toast('Couldn’t save sharing: ' + e.message, '', true); }
}
async function newNote() {
  const n = normNote({id:uid('note'), title:'', body:'', owner:me().id, updated_at:new Date().toISOString(), updated_by:me().id, created_at:new Date().toISOString()});
  if (LIVE) {
    const {data, error} = await sb.from('notes').insert({id:n.id, title:'', body:''}).select('*').single();
    if (error) return toast('Couldn’t create a note: ' + error.message, '', true);
    Object.assign(n, normNote(data));
  }
  (state.notes ||= []).push(n); if (!LIVE) save();
  filters.notes.q = ''; openNote(n.id); setTimeout(() => document.getElementById('note-title')?.focus(), 50);
}
async function deleteNoteNow(n) {
  if (LIVE) { const {data, error} = await sb.from('notes').delete().eq('id', n.id).select('id'); if (error || !data.length) return toast('Couldn’t delete the note', error?.message || 'you may not have permission', true); }
  state.notes = state.notes.filter(x => x.id !== n.id); if (!LIVE) save();
  if (noteUI.open === n.id) { leaveNoteChannel(); noteUI.open = null; }
  render(); toast('Note deleted');
}

/* ---- formatting ---- */
let noteLinkRange = null;
function noteCommand(cmd) {
  const body = document.getElementById('note-body'); if (!body) return;
  body.focus();
  if (cmd === 'link') { const s = getSelection(); noteLinkRange = s.rangeCount ? s.getRangeAt(0).cloneRange() : null; const bar = document.getElementById('nt-linkbar'); bar.hidden = false; document.getElementById('nt-link-url').focus(); return; }
  if (['h2', 'h3', 'p', 'blockquote', 'pre'].includes(cmd)) document.execCommand('formatBlock', false, cmd);
  else if (cmd === 'checklist') {
    document.execCommand('insertUnorderedList');
    let el = getSelection().anchorNode; while (el && el !== body && el.nodeName !== 'UL') el = el.parentNode;
    if (el && el.nodeName === 'UL') el.setAttribute('data-checklist', '');
  } else document.execCommand(cmd, false, null);
  markNoteDirty();
}
function applyNoteLink() {
  const url = (document.getElementById('nt-link-url')?.value || '').trim();
  document.getElementById('nt-linkbar').hidden = true;
  if (!/^(https?:\/\/|mailto:)/i.test(url)) return url && toast('Links need to start with https:// or mailto:', '', true);
  const s = getSelection(); s.removeAllRanges(); if (noteLinkRange) s.addRange(noteLinkRange);
  if (s.isCollapsed) document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(url)}</a>`);
  else document.execCommand('createLink', false, url);
  markNoteDirty();
}

/* ---- wiring ---- */
const NOTE_ACTS = {
  'note-new': () => newNote(),
  'note-open': el => openNote(el.dataset.id),
  'note-close': () => closeNote(),
  'note-pin': el => { togglePin(el.dataset.id); render(); },
  'note-share': el => { flushNote(); openNoteShare(el.dataset.id); },
  'note-delete': el => { flushNote(); requestDeletion('note', el.dataset.id); },
  'notes-tab': el => { filters.notes.tab = el.dataset.v; render(); },
  'note-link-apply': () => applyNoteLink(),
  'note-link-cancel': () => { document.getElementById('nt-linkbar').hidden = true; },
  'note-take-theirs': () => { const c = noteUI.conflict; noteUI.conflict = null; noteUI.dirty = false; applyNoteRow(c); renderNoteAlert(); setNoteStatus('Showing their version'); },
  'note-keep-mine': () => { const c = noteUI.conflict, n = noteById(c.id); noteUI.conflict = null; n.version = c.version; renderNoteAlert(); noteUI.dirty = true; saveNote(true); },
  'note-load-latest': () => { const r = noteUI.remoteNewer; noteUI.remoteNewer = null; if (r) applyNoteRow(r); renderNoteAlert(); },
};
document.addEventListener('mousedown', e => { if (e.target.closest('.nt-tool')) e.preventDefault(); });   // keep the text selection
document.addEventListener('click', e => {
  const t = e.target.closest('.nt-tool'); if (t) { noteCommand(t.dataset.cmd); return; }
  const li = e.target.closest('#note-body ul[data-checklist] > li');
  if (li && e.offsetX < 26) { const n = noteById(noteUI.open); if (!canEditNote(n)) return; e.preventDefault();
    li.getAttribute('data-checked') === 'true' ? li.removeAttribute('data-checked') : li.setAttribute('data-checked', 'true'); markNoteDirty(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'note-body' || e.target.id === 'note-title') markNoteDirty();
  if (e.target.dataset?.input === 'notes-q') { filters.notes.q = e.target.value; refreshNoteList(); }
});
document.addEventListener('keydown', e => {
  if (!(e.target.id === 'note-body' || e.target.id === 'note-title')) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); clearTimeout(noteUI.timer); saveNote(); }
  if (e.target.id === 'note-title' && e.key === 'Enter') { e.preventDefault(); document.getElementById('note-body')?.focus(); }
});
document.addEventListener('keydown', e => { if (e.target.id === 'note-link-url' && e.key === 'Enter') { e.preventDefault(); applyNoteLink(); } });
document.addEventListener('paste', e => {   // paste formatting safely; plain text otherwise
  if (e.target.closest?.('#note-body') == null) return;
  e.preventDefault();
  const html = e.clipboardData.getData('text/html'), text = e.clipboardData.getData('text/plain');
  if (html && window.DOMPurify) document.execCommand('insertHTML', false, sanitizeNote(html));
  else document.execCommand('insertText', false, text);
  markNoteDirty();
});
window.addEventListener('beforeunload', e => { if (noteUI.dirty) { flushNote(); e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNote(); });
