/**
 * Grid Card Gallery — Google Apps Script back end
 * ------------------------------------------------
 * Images are stored in a Google Drive folder; card data, collections,
 * comments and likes are stored in a Google Sheet. Both are created
 * automatically the first time you run setup().
 *
 * Deploy as a Web app:  Execute as "Me"  ·  Who has access "Anyone".
 * Then embed the /exec URL in Google Sites (Insert → Embed → By URL).
 */

const APP_NAME = 'Grid Card Gallery';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;   // 8 MB per upload
const MAX_PDF_BYTES = 30 * 1024 * 1024;    // bigger RPG files upload in pieces (startUpload / uploadChunk)
const MAX_COMMENT = 600;

/* ============================== setup ============================== */

/** Run this once from the editor (select "setup" → Run). */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty('SHEET_ID');
  if (!ssId) {
    const ss = SpreadsheetApp.create(APP_NAME + ' — Database');
    ssId = ss.getId();
    props.setProperty('SHEET_ID', ssId);
  }
  const ss = SpreadsheetApp.openById(ssId);
  ensureSheet_(ss, 'Cards', CARD_COLS);
  ensureSheet_(ss, 'Collections', COLL_COLS);
  ensureSheet_(ss, 'Comments', COMMENT_COLS);
  ensureSheet_(ss, 'Likes', ['cardId', 'visitor', 'created']);
  ensureSheet_(ss, 'Settings', ['key', 'value']);
  ensureSheet_(ss, 'Deck', DECK_COLS);
  ensureSheet_(ss, 'Decks', DECKS_COLS);
  ensureSheet_(ss, 'Files', FILE_COLS);
  ensureSheet_(ss, 'Scenarios', SCEN_COLS);
  ensureSheet_(ss, 'Expansions', EXP_COLS);
  ensureSheet_(ss, 'ComicSeries', CSER_COLS);
  ensureSheet_(ss, 'Comics', COMIC_COLS);
  comicTextCols_(ss);
  const first = ss.getSheetByName('Sheet1'); if (first && ss.getSheets().length > 1) ss.deleteSheet(first);

  if (!props.getProperty('FOLDER_ID')) {
    const folder = DriveApp.createFolder(APP_NAME + ' — Images');
    props.setProperty('FOLDER_ID', folder.getId());
  }
  if (!props.getProperty('ADMIN_PASSCODE')) props.setProperty('ADMIN_PASSCODE', 'changeme');

  const s = getSettingsMap_();
  const defaults = {
    siteTitle: 'The Morphin Archive',
    tagline: 'Heroes of the Grid Ranger cards — official and homebrew',
    allowSubmissions: 'false',
    allowComments: 'true',
    accent: '#E8B931'
  };
  Object.keys(defaults).forEach(k => { if (s[k] === undefined) setSetting_(k, defaults[k]); });

  Logger.log('Setup complete.');
  Logger.log('Database: ' + ss.getUrl());
  Logger.log('Images folder: ' + DriveApp.getFolderById(props.getProperty('FOLDER_ID')).getUrl());
  Logger.log('Admin passcode is "' + props.getProperty('ADMIN_PASSCODE') + '" — change it with setPasscode().');
}

/** Change the admin passcode: edit the text below, then run setPasscode. */
function setPasscode() {
  const NEW_PASSCODE = 'type-a-new-passcode-here';
  if (NEW_PASSCODE.length < 6) throw new Error('Use at least 6 characters.');
  PropertiesService.getScriptProperties().setProperty('ADMIN_PASSCODE', NEW_PASSCODE);
  Logger.log('Passcode updated.');
}

/* ============================== web app ============================== */

function doGet(e) {
  const src = e && e.parameter && e.parameter.src;
  if (src) {                                   // raw page sources, read by the GitHub Pages build (they are public pages anyway)
    if (!/^(Index|Mobile)$/.test(src)) return ContentService.createTextOutput('unknown source');
    return ContentService.createTextOutput(HtmlService.createTemplateFromFile(src).getRawContent()).setMimeType(ContentService.MimeType.TEXT);
  }
  migrate_();
  const data = publicPayload_();          // cached; sent with the page so the browser needs no second round trip
  const view = (e && e.parameter && e.parameter.view) || '';
  const t = HtmlService.createTemplateFromFile(view === 'm' ? 'Mobile' : 'Index');   // ?view=m opens the phone site
  t.boot = JSON.stringify({
    url: ScriptApp.getService().getUrl(),
    card: (e && e.parameter && e.parameter.card) || '',
    collection: (e && e.parameter && e.parameter.c) || '',
    deck: (e && e.parameter && e.parameter.d) || '',
    type: (e && e.parameter && e.parameter.t) || '',
    file: (e && e.parameter && e.parameter.f) || '',
    exp: (e && e.parameter && e.parameter.x) || '',
    cseries: (e && e.parameter && e.parameter.cs) || '',
    comic: (e && e.parameter && e.parameter.cm) || '',
    page: (e && e.parameter && e.parameter.p) || '',
    full: view === 'full',
    data
  }).replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle((data.settings && data.settings.siteTitle) || APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ====================== JSON API (site hosted on its own domain) ====================== */

/** Functions a standalone copy of the page may call. Everything else stays private. */
const API_ = {
  getData: getData, getLiked: getLiked, getComments: getComments, addComment: addComment, toggleLike: toggleLike,
  addView: addView, submitCard: submitCard, getDeck: getDeck, checkPasscode: checkPasscode, uploadCard: uploadCard,
  updateCard: updateCard, mergeCards: mergeCards, deleteCard: deleteCard, getPending: getPending, saveCollection: saveCollection,
  deleteCollection: deleteCollection, deleteComment: deleteComment, saveSettings: saveSettings,
  addDeckCard: addDeckCard, updateDeckCard: updateDeckCard, deleteDeckCard: deleteDeckCard,
  getDecks: getDecks, saveDeck: saveDeck, deleteDeck: deleteDeck, setCollectionCards: setCollectionCards, setDeckRangers: setDeckRangers,
  addFile: addFile, updateFile: updateFile, deleteFile: deleteFile, getCharSheet: getCharSheet,
  startUpload: startUpload, uploadChunk: uploadChunk, getFileRange: getFileRange,
  savePages: savePages, clearPages: clearPages, getPages: getPages, setRangerLinks: setRangerLinks,
  saveScenario: saveScenario, deleteScenario: deleteScenario, importScenarios: importScenarios,
  saveExpansion: saveExpansion, deleteExpansion: deleteExpansion, setExpansionItems: setExpansionItems, setItemExpansions: setItemExpansions, seedExpansions: seedExpansions,
  getComic: getComic, getComicsAdmin: getComicsAdmin, saveComicSeries: saveComicSeries, deleteComicSeries: deleteComicSeries,
  startComic: startComic, saveComicPages: saveComicPages, finishComic: finishComic, updateComic: updateComic, deleteComic: deleteComic
};

/** POST {fn, args} as text/plain; replies {ok, data} or {ok:false, error}. */
function doPost(e) {
  let out;
  try {
    migrate_();
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = API_[req.fn];
    if (typeof fn !== 'function' || !Object.prototype.hasOwnProperty.call(API_, req.fn)) throw new Error('Unknown request.');
    out = { ok: true, data: fn.apply(null, Array.isArray(req.args) ? req.args : []) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err).replace(/^Exception: /, '') };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================== public API ============================== */

/** Everything the gallery needs on load (comments are fetched per card). */
function getData(visitor) {
  const d = publicPayload_();
  d.liked = getLiked(visitor);
  return d;
}

/** Card ids this visitor has liked (fetched after the page is already showing). */
function getLiked(visitor) {
  if (!visitor) return [];
  return readAll_('Likes').filter(l => l.visitor === String(visitor)).map(l => l.cardId);
}

/** Public gallery data, cached for 10 minutes and cleared whenever something changes. */
function publicPayload_() {
  const hit = cacheGetJSON_(PUB_KEY);
  if (hit) return hit;
  const cards = readAll_('Cards').filter(c => c.status === 'published').map(publicCard_);
  const collections = readAll_('Collections').sort((a, b) => (+a.order || 0) - (+b.order || 0));
  const settings = getSettingsMap_();
  const counts = {};
  readAll_('Comments').forEach(c => { counts[c.cardId] = (counts[c.cardId] || 0) + 1; });
  const rows = readAll_('Deck'), size = {}, uniq = {}, first = {};
  rows.forEach(d => { const k = d.deckId; if (!k) return; size[k] = (size[k] || 0) + (+d.copies || 1); uniq[k] = (uniq[k] || 0) + 1;
    if (!first[k] || (+d.order || 0) < (+first[k].order || 0)) first[k] = d; });
  const decks = readAll_('Decks').sort((a, b) => (+a.order || 0) - (+b.order || 0) || String(a.name).localeCompare(String(b.name))).map(m => {
    const cov = (m.cover && rows.find(d => d.id === m.cover && d.deckId === m.id)) || first[m.id];
    const f = faceUrls_(m.faceFileId);
    return { id: m.id, name: m.name, description: m.description, order: +m.order || 0, created: m.created, cards: size[m.id] || 0, unique: uniq[m.id] || 0,
      kind: deckKind_(m.kind), face: f.face, faceThumb: f.faceThumb, expansions: splitList_(m.expansions),
      cover: cov ? cov.id : '', thumb: f.faceThumb || (cov ? 'https://lh3.googleusercontent.com/d/' + cov.fileId + '=w420' : '') };
  });
  cards.forEach(c => { c.comments = counts[c.id] || 0; c.deckCount = c.decks.reduce((a, id) => a + (size[id] || 0), 0); });
  const files = readAll_('Files').sort((a, b) => (+a.order || 0) - (+b.order || 0)).map(publicFile_);
  const scenarios = readAll_('Scenarios').sort(scenOrder_).map(publicScenario_);
  const expansions = readAll_('Expansions').sort(expOrder_).map(publicExpansion_);
  const cm = comicsPayload_();
  const out = {
    cards, collections, decks, files, scenarios, expansions, comicSeries: cm.series, comics: cm.comics,
    settings: {
      siteTitle: settings.siteTitle, tagline: settings.tagline, accent: settings.accent,
      allowSubmissions: settings.allowSubmissions === 'true', allowComments: settings.allowComments !== 'false', showGame: settings.showGame === 'true'
    }
  };
  cachePutJSON_(PUB_KEY, out, 600);
  return out;
}

/* ============================== Roleplaying Game files ============================== */

const FILE_COLS = ['id', 'title', 'description', 'category', 'fileId', 'coverFileId', 'source', 'size', 'pages', 'mime', 'order', 'created', 'template', 'pageImages', 'pagesFolder', 'area', 'sections', 'expansions'];

/** Links for one RPG file. The cover is the uploaded first-page picture, or Drive's own thumbnail. */
function publicFile_(f) {
  const id = f.fileId;
  return { id: f.id, title: f.title, description: f.description, category: f.category, size: +f.size || 0, pages: +f.pages || 0,
    order: +f.order || 0, created: f.created, source: f.source, mime: f.mime || 'application/pdf', template: String(f.template) === '1',
    cover: f.coverFileId ? 'https://lh3.googleusercontent.com/d/' + f.coverFileId + '=w600' : 'https://drive.google.com/thumbnail?id=' + id + '&sz=w600',
    preview: 'https://drive.google.com/file/d/' + id + '/preview', view: 'https://drive.google.com/file/d/' + id + '/view',
    download: 'https://drive.google.com/uc?export=download&id=' + id, pg: String(f.pageImages || ''),
    area: fileArea_(f.area), sections: splitList_(f.sections).filter(t => RULE_SECTIONS.indexOf(t) >= 0), expansions: splitList_(f.expansions) };
}
/** Files live in one of two libraries: '' = the Roleplaying Game, 'rules' = Heroes of the Grid rules.
    Rules documents can be assigned to card-type sections, which show them behind a Rules button. */
const RULE_SECTIONS = ['ranger', 'combat', 'zord', 'megazord', 'arsenal', 'footsoldier', 'monster', 'boss', 'nemesis'];
function fileArea_(a) { return a === 'rules' ? 'rules' : ''; }
function fileSections_(list) { return (Array.isArray(list) ? list : splitList_(list)).filter(t => RULE_SECTIONS.indexOf(t) >= 0).join(','); }
/** The Drive folder uploaded RPG files go in (made the first time, next to the card images). */
function rpgFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('RPG_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const images = DriveApp.getFolderById(props.getProperty('FOLDER_ID'));
  const parents = images.getParents();
  const folder = (parents.hasNext() ? parents.next() : DriveApp.getRootFolder()).createFolder(APP_NAME + ' – RPG files');
  props.setProperty('RPG_FOLDER_ID', folder.getId());
  return folder;
}
/** The file id from any Google Drive link (or a bare id). */
function driveId_(link) {
  const s = String(link || '').trim();
  const m = /\/d\/([-\w]{20,})/.exec(s) || /[?&]id=([-\w]{20,})/.exec(s) || /^([-\w]{20,})$/.exec(s);
  return m ? m[1] : '';
}
function savePdf_(dataUrl, title) {
  const pre = 'data:application/pdf;base64,', s = String(dataUrl || '');
  if (s.indexOf(pre) !== 0) throw new Error('Upload a PDF file.');
  const bytes = Utilities.base64Decode(s.slice(pre.length));
  if (bytes.length > MAX_PDF_BYTES) throw new Error('That PDF is over 30 MB, so it has to upload in pieces. Reload the page and try again.');
  const file = rpgFolder_().createFile(Utilities.newBlob(bytes, 'application/pdf', String(title).replace(/[^\w\- ]+/g, '').trim() + '.pdf'));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file;
}
/** A Drive file the site's account can open, shared so visitors can read it. */
function linkedFile_(link) {
  const id = driveId_(link);
  if (!id) throw new Error("That doesn't look like a Google Drive file link.");
  let file;
  try { file = DriveApp.getFileById(id); } catch (e) { throw new Error("Couldn't open that Drive file. Use a file in the Google Drive of the account that runs this site."); }
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}   // not ours to share: it keeps its own sharing
  return file;
}

/** Add an RPG file: {title, description, category, pages, cover (image data URL), and pdf (data URL) or link (Google Drive)}. */
function addFile(p, passcode) {
  requireAdmin_(passcode);
  const title = clean_(p.title, 140) || 'Untitled file';
  let file, source;
  if (p.pdf) { file = savePdf_(p.pdf, title); source = 'upload'; }
  else if (p.uploadedId) { file = uploadedFile_(p.uploadedId); source = 'upload'; }
  else if (p.link) { file = linkedFile_(p.link); source = 'drive'; }
  else throw new Error('Choose a PDF or paste a Google Drive link.');
  const row = {
    id: uid_(), title, description: clean_(p.description, 2000), category: clean_(p.category, 60), fileId: file.getId(),
    coverFileId: p.cover ? saveImage_(p.cover, title + ' cover').getId() : '', source, size: file.getSize(), pages: Math.max(0, Math.round(+p.pages || 0)) || '',
    mime: file.getMimeType(), created: new Date().toISOString(), template: p.template && p.area !== 'rules' ? '1' : '',
    area: fileArea_(p.area), sections: fileArea_(p.area) ? fileSections_(p.sections) : '', expansions: expIds_(p.expansions)
  };
  withLock_(() => { const all = readAll_('Files'); row.order = all.reduce((m, f) => Math.max(m, +f.order || 0), 0) + 1;
    if (row.template) all.filter(f => String(f.template) === '1').forEach(f => updateRow_('Files', f.id, { template: '' }));
    append_('Files', row); });
  bust_();
  return publicFile_(row);
}

function updateFile(id, f, passcode) {
  requireAdmin_(passcode);
  const old = findRow_('Files', id); if (!old) throw new Error('That file no longer exists.');
  const patch = {};
  if (f.title !== undefined) patch.title = clean_(f.title, 140) || old.title;
  if (f.description !== undefined) patch.description = clean_(f.description, 2000);
  if (f.category !== undefined) patch.category = clean_(f.category, 60);
  if (f.pages !== undefined) patch.pages = Math.max(0, Math.round(+f.pages || 0)) || '';
  if (f.order !== undefined) patch.order = +f.order || 0;
  if (f.template !== undefined) patch.template = f.template ? '1' : '';
  if (f.area !== undefined) { patch.area = fileArea_(f.area); if (patch.area) patch.template = ''; }
  if (f.sections !== undefined) patch.sections = fileSections_(f.sections);
  if (f.expansions !== undefined) patch.expansions = expIds_(f.expansions);
  let oldFile = '', oldCover = '';
  let oldPages = '';
  if (f.pdf || f.link || f.uploadedId) {                   // swap in a new version of the file
    const file = f.pdf ? savePdf_(f.pdf, patch.title || old.title) : f.uploadedId ? uploadedFile_(f.uploadedId) : linkedFile_(f.link);
    Object.assign(patch, { fileId: file.getId(), source: f.link && !f.pdf && !f.uploadedId ? 'drive' : 'upload', size: file.getSize(), mime: file.getMimeType() });
    if (old.source === 'upload' && old.fileId !== patch.fileId) oldFile = old.fileId;
    if (old.fileId !== patch.fileId) { patch.pageImages = ''; patch.pagesFolder = ''; oldPages = old.pagesFolder; }   // the old page pictures no longer match
  }
  if (f.cover) { patch.coverFileId = saveImage_(f.cover, (patch.title || old.title) + ' cover').getId(); oldCover = old.coverFileId; }
  else if (f.cover === '') { patch.coverFileId = ''; oldCover = old.coverFileId; }
  withLock_(() => {
    if (patch.template) readAll_('Files').filter(x => x.id !== id && String(x.template) === '1').forEach(x => updateRow_('Files', x.id, { template: '' }));
    updateRow_('Files', id, patch);
  });
  trashFile_(oldFile); trashFile_(oldCover); trashFolder_(oldPages);
  bust_();
  return publicFile_(findRow_('Files', id));
}

/* Fast pages: every page of a book saved once as a picture, so the reader can show it straight from Google's image servers.
   The admin's browser draws the pages and sends a few at a time. pageImages holds "fileId~height/width" per page, comma separated. */
function trashFolder_(id) { if (!id) return; try { DriveApp.getFolderById(id).setTrashed(true); } catch (e) {} }
function savePages(id, from, images, total, passcode) {
  requireAdmin_(passcode);
  const f = findRow_('Files', id); if (!f) throw new Error('That file is no longer on the site.');
  from = Math.max(1, Math.floor(+from || 1)); total = Math.max(1, Math.min(1200, Math.floor(+total || 0)));
  if (!Array.isArray(images) || !images.length || images.length > 8) throw new Error('Send between 1 and 8 pages at a time.');
  let folderId = f.pagesFolder, folder = null;
  if (folderId) { try { folder = DriveApp.getFolderById(folderId); if (folder.isTrashed()) folder = null; } catch (e) { folder = null; } }
  if (!folder) {
    folder = rpgFolder_().createFolder('Pages – ' + String(f.title).replace(/[^\w\- ]+/g, '').trim());
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    folderId = folder.getId();
  }
  const made = images.map((img, k) => {
    const m = /^data:image\/(jpeg|webp|png);base64,(.+)$/.exec(String(img && img.data || ''));
    if (!m) throw new Error('Page ' + (from + k) + ' is not a picture.');
    const bytes = Utilities.base64Decode(m[2]);
    if (bytes.length > 4 * 1024 * 1024) throw new Error('Page ' + (from + k) + ' is too big.');
    const n = from + k, ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const file = folder.createFile(Utilities.newBlob(bytes, 'image/' + m[1], 'p' + ('000' + n).slice(-4) + '.' + ext));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const r = Math.round((+img.ratio || 1.294) * 1000) / 1000;
    return file.getId() + '~' + r;
  });
  let done = 0, stale = [];
  withLock_(() => {
    dirty_('Files');
    const row = findRow_('Files', id); if (!row) return;
    const list = String(row.pageImages || '').split(',');
    while (list.length < total) list.push('');
    list.length = total;
    made.forEach((v, k) => { const i = from - 1 + k; if (i < total) { if (list[i]) stale.push(list[i].split('~')[0]); list[i] = v; } });
    done = list.filter(Boolean).length;
    updateRow_('Files', id, { pageImages: list.join(','), pagesFolder: folderId });
  });
  stale.forEach(trashFile_);
  if (done >= total) bust_();
  return { done: done, total: total, ids: made };
}
/** Throw away a book's page pictures (the reader goes back to drawing pages itself). */
function clearPages(id, passcode) {
  requireAdmin_(passcode);
  const f = findRow_('Files', id); if (!f) return false;
  withLock_(() => updateRow_('Files', id, { pageImages: '', pagesFolder: '' }));
  trashFolder_(f.pagesFolder);
  bust_();
  return true;
}
/** The page pictures saved so far for one book (the admin's browser uses this to pick up where it stopped). */
function getPages(id) {
  dirty_('Files');
  const f = findRow_('Files', id); if (!f) throw new Error('That file is not on the site.');
  return String(f.pageImages || '');
}

/* Big PDFs: the browser sends 8 MB pieces, and the archive passes each one straight on to a Google Drive resumable upload. */
const UPLOAD_CHUNK = 8 * 1024 * 1024;
function driveApi_(url, o) {
  o = o || {}; o.headers = Object.assign({ Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, o.headers || {});
  o.muteHttpExceptions = true; o.followRedirects = false;
  return UrlFetchApp.fetch(url, o);
}
function startUpload(p, passcode) {
  requireAdmin_(passcode);
  const size = Math.round(+p.size || 0);
  if (!size) throw new Error('That file is empty.');
  if (size > 4 * 1024 * 1024 * 1024) throw new Error('That file is over 4 GB.');
  const name = String(p.name || 'book.pdf').replace(/[^\w\- .()']+/g, '').trim().slice(0, 150) || 'book.pdf';
  const res = driveApi_('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
    method: 'post', contentType: 'application/json; charset=UTF-8',
    headers: { 'X-Upload-Content-Type': 'application/pdf', 'X-Upload-Content-Length': String(size) },
    payload: JSON.stringify({ name: name, mimeType: 'application/pdf', parents: [rpgFolder_().getId()] })
  });
  const h = res.getHeaders(), uri = h.Location || h.location;
  if (res.getResponseCode() !== 200 || !uri) throw new Error('Google Drive would not start the upload (' + res.getResponseCode() + ').');
  const id = uid_();
  CacheService.getScriptCache().put('up-' + id, JSON.stringify({ uri: uri, size: size }), 21600);
  return { uploadId: id, chunk: UPLOAD_CHUNK };
}
function uploadChunk(uploadId, offset, data, passcode) {
  requireAdmin_(passcode);
  const s = JSON.parse(CacheService.getScriptCache().get('up-' + uploadId) || 'null');
  if (!s) throw new Error('This upload has expired. Start it again.');
  const bytes = Utilities.base64Decode(String(data || '')); offset = Math.max(0, Math.floor(+offset || 0));
  if (!bytes.length) throw new Error('An empty piece arrived. Try again.');
  const end = offset + bytes.length - 1;
  const res = UrlFetchApp.fetch(s.uri, { method: 'put', contentType: 'application/pdf', payload: bytes, muteHttpExceptions: true, followRedirects: false,
    headers: { 'Content-Range': 'bytes ' + offset + '-' + end + '/' + s.size } });
  const code = res.getResponseCode();
  if (code === 308) { const r = String(res.getHeaders().Range || res.getHeaders().range || ''); const m = /-(\d+)$/.exec(r); return { done: false, next: m ? +m[1] + 1 : 0 }; }
  if (code === 200 || code === 201) {
    const f = JSON.parse(res.getContentText());
    DriveApp.getFileById(f.id).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    CacheService.getScriptCache().remove('up-' + uploadId);
    return { done: true, fileId: f.id };
  }
  throw new Error('Google Drive stopped the upload (' + code + '). Try again.');
}
/** A file that a finished upload put in the RPG folder. */
function uploadedFile_(id) {
  const file = DriveApp.getFileById(String(id));
  const folder = rpgFolder_().getId(); let ok = false; const it = file.getParents();
  while (it.hasNext()) if (it.next().getId() === folder) ok = true;
  if (!ok) throw new Error('That upload is not in the RPG files folder.');
  return file;
}
/** Bytes start..end (end exclusive, at most 4 MB) of a listed RPG file, for the site's own PDF reader. */
function getFileRange(id, start, end) {
  const f = findRow_('Files', id); if (!f) throw new Error('That file is not on the site.');
  start = Math.max(0, Math.floor(+start || 0)); end = Math.floor(+end || 0);
  if (!(end > start)) end = start + 1024 * 1024;
  end = Math.min(end, start + 4 * 1024 * 1024);
  const res = driveApi_('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(f.fileId) + '?alt=media&supportsAllDrives=true', { headers: { Range: 'bytes=' + start + '-' + (end - 1) } });
  const code = res.getResponseCode();
  if (code !== 206 && code !== 200) throw new Error('Google Drive would not send the file (' + code + ')');
  let bytes = res.getContent(), size = +f.size || 0;
  const cr = String(res.getHeaders()['Content-Range'] || res.getHeaders()['content-range'] || ''); const m = /\/(\d+)$/.exec(cr); if (m) size = +m[1];
  if (code === 200) { size = bytes.length; bytes = bytes.slice(start, end); }
  return { start: start, size: size, data: Utilities.base64Encode(bytes) };
}
/** Run this once from the editor (select it, then Run) to let the archive stream big books from Google Drive. */
function authorizeRpgReader() {
  const r = driveApi_('https://www.googleapis.com/drive/v3/about?fields=user');
  Logger.log(r.getResponseCode() === 200 ? 'Ready: the archive can now read and upload big RPG books.' : 'Drive answered ' + r.getResponseCode() + ': ' + r.getContentText());
}

/** The blank character sheet the Character Builder fills in, as base64. Only files listed in the RPG section can be read. */
function getCharSheet(id) {
  const f = findRow_('Files', id); if (!f) throw new Error('That file is not on the site.');
  const file = DriveApp.getFileById(f.fileId);
  if (file.getSize() > 15 * 1024 * 1024) throw new Error('That PDF is too big to use as a character sheet.');
  return { name: file.getName(), data: Utilities.base64Encode(file.getBlob().getBytes()) };
}

/** Remove an RPG file from the site. Files uploaded through the site go to the Drive bin; linked Drive files are left alone. */
function deleteFile(id, passcode) {
  requireAdmin_(passcode);
  const f = findRow_('Files', id); if (!f) return false;
  if (f.source === 'upload') trashFile_(f.fileId);
  trashFile_(f.coverFileId); trashFolder_(f.pagesFolder);
  withLock_(() => deleteRow_('Files', id));
  bust_();
  return true;
}

/* ============================== Heroes of the Grid scenarios ==============================
   Each scenario's fixed setup (enemies, boards, special rules), read from the rulebooks by the Card Converter
   or typed in by the admin. Lists are stored one name per line. Players' campaigns live in their own browsers. */
const SCEN_COLS = ['id', 'name', 'number', 'source', 'summary', 'difficulty', 'players', 'rangers', 'zords', 'megazords', 'boss', 'nemesis',
  'monsters', 'footsoldiers', 'boards', 'allies', 'setup', 'specialRules', 'victory', 'defeat', 'fileRef', 'page', 'order', 'created', 'expansions'];
const SCEN_LISTS = ['rangers', 'zords', 'megazords', 'boss', 'nemesis', 'monsters', 'footsoldiers', 'boards', 'allies'];
const SCEN_TEXT = { name: 140, number: 20, source: 140, summary: 1500, difficulty: 40, players: 40, setup: 4000, specialRules: 6000, victory: 1500, defeat: 1500, fileRef: 40 };
function scenOrder_(a, b) { return (+a.order || 0) - (+b.order || 0) || String(a.source).localeCompare(String(b.source)) || (parseFloat(a.number) || 0) - (parseFloat(b.number) || 0); }
function listOf_(v) { return (Array.isArray(v) ? v : String(v == null ? '' : v).split(/\n|\s*;\s*/)).map(x => clean_(x, 120)).filter(Boolean).slice(0, 40); }
function publicScenario_(r) {
  const o = { id: r.id, order: +r.order || 0, page: +r.page || 0, created: r.created };
  Object.keys(SCEN_TEXT).forEach(k => { o[k] = String(r[k] == null ? '' : r[k]); });
  SCEN_LISTS.forEach(k => { o[k] = String(r[k] || '').split('\n').filter(Boolean); });
  o.expansions = splitList_(r.expansions);
  return o;
}
function scenRow_(p) {
  const row = {};
  Object.keys(SCEN_TEXT).forEach(k => { if (p[k] !== undefined) row[k] = clean_(p[k], SCEN_TEXT[k]); });
  SCEN_LISTS.forEach(k => { if (p[k] !== undefined) row[k] = listOf_(p[k]).join('\n'); });
  if (p.page !== undefined) row.page = Math.max(0, Math.round(+p.page || 0)) || '';
  if (p.order !== undefined) row.order = +p.order || 0;
  if (p.expansions !== undefined) row.expansions = expIds_(p.expansions);
  return row;
}
/** Create or update one scenario. */
function saveScenario(p, passcode) {
  requireAdmin_(passcode);
  const row = scenRow_(p || {});
  if (row.name === '' || (!p.id && !row.name)) throw new Error('Give the scenario a name.');
  const out = withLock_(() => {
    if (p.id && findRow_('Scenarios', p.id)) { updateRow_('Scenarios', p.id, row); return findRow_('Scenarios', p.id); }
    const all = readAll_('Scenarios');
    row.id = uid_(); row.created = new Date().toISOString(); if (row.order === undefined) row.order = all.reduce((m, x) => Math.max(m, +x.order || 0), 0) + 1;
    append_('Scenarios', row); return Object.assign({}, row);
  });
  bust_();
  return publicScenario_(out);
}
function deleteScenario(id, passcode) {
  requireAdmin_(passcode);
  withLock_(() => deleteRow_('Scenarios', id));
  bust_();
  return true;
}
/** Add many scenarios at once (from the Card Converter). A scenario with the same name and book is updated instead of added twice. */
function importScenarios(list, passcode) {
  requireAdmin_(passcode);
  if (!Array.isArray(list) || !list.length) throw new Error('No scenarios to import.');
  if (list.length > 200) throw new Error('Import at most 200 scenarios at a time.');
  const key = x => (String(x.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '')) + '|' + (String(x.source || '').toLowerCase().replace(/[^a-z0-9]+/g, ''));
  let added = 0, updated = 0;
  withLock_(() => {
    const all = readAll_('Scenarios'), byKey = {}; all.forEach(x => { byKey[key(x)] = x; });
    let order = all.reduce((m, x) => Math.max(m, +x.order || 0), 0);
    const sh = sheet_('Scenarios'), h = headers_(sh), fresh = [];
    list.forEach(p => {
      if (!p || typeof p !== 'object' || !String(p.name || '').trim()) return;
      const row = scenRow_(p), ex = byKey[key(row)];
      if (ex && ex._new) { Object.keys(row).forEach(k => { if (row[k] !== '' && row[k] != null) ex[k] = row[k]; }); return; }   // listed twice in one file
      if (ex) { updateRow_('Scenarios', ex.id, row); updated++; return; }
      row.id = uid_(); row.created = new Date().toISOString(); row.order = ++order; row._new = true;
      fresh.push(row); byKey[key(row)] = row; added++;
    });
    if (fresh.length) sh.getRange(sh.getLastRow() + 1, 1, fresh.length, h.length).setValues(fresh.map(row => h.map(c => row[c] !== undefined ? row[c] : '')));
    dirty_('Scenarios');
  });
  bust_();
  return { added: added, updated: updated, scenarios: readAll_('Scenarios').sort(scenOrder_).map(publicScenario_) };
}

/** Run from the editor after editing the Sheet by hand, to show changes right away. */
/* ============================== Expansions ==============================
   Every Heroes of the Grid product (core box, big box expansions, Ranger packs, promos…). Cards, decks, scenarios and
   rulebooks list the expansions they come in (comma-separated ids in their 'expansions' column). Visitors mark the boxes
   they own in their own browser. */
const EXP_COLS = ['id', 'name', 'short', 'group', 'year', 'order', 'description', 'coverFileId', 'fileRef', 'created'];
const EXP_GROUPS = ['core', 'big', 'ranger', 'allies', 'villain', 'character', 'pack', 'promo', 'custom'];
const EXP_SHEETS = { cards: 'Cards', decks: 'Decks', scenarios: 'Scenarios', files: 'Files' };
function expGroup_(g) { return EXP_GROUPS.indexOf(g) >= 0 ? g : 'custom'; }
function expOrder_(a, b) { return EXP_GROUPS.indexOf(expGroup_(a.group)) - EXP_GROUPS.indexOf(expGroup_(b.group)) || (+a.order || 0) - (+b.order || 0) || String(a.name).localeCompare(String(b.name)); }
/** A clean comma list of expansion ids that exist. */
function expIds_(v) {
  const have = {}; readAll_('Expansions').forEach(e => { have[e.id] = true; });
  const l = (Array.isArray(v) ? v : splitList_(v)).map(x => String(x).trim()).filter(x => have[x]);
  return l.filter((x, i) => l.indexOf(x) === i).slice(0, 20).join(',');
}
function publicExpansion_(e) {
  const f = e.coverFileId ? 'https://lh3.googleusercontent.com/d/' + e.coverFileId : '';
  return { id: e.id, name: e.name, short: e.short || '', group: expGroup_(e.group), year: String(e.year || ''), order: +e.order || 0,
    description: e.description || '', cover: f, coverThumb: f ? f + '=w600' : '', fileRef: e.fileRef || '', created: e.created };
}
/** Create or update an expansion: {id?, name, short, group, year, description, fileRef, order, cover (image data URL, or '' to remove)}. */
function saveExpansion(p, passcode) {
  requireAdmin_(passcode);
  p = p || {};
  const row = {};
  if (p.name !== undefined) row.name = clean_(p.name, 120);
  if (p.short !== undefined) row.short = clean_(p.short, 40);
  if (p.group !== undefined) row.group = expGroup_(p.group);
  if (p.year !== undefined) row.year = clean_(p.year, 10);
  if (p.description !== undefined) row.description = clean_(p.description, 2000);
  if (p.fileRef !== undefined) row.fileRef = clean_(p.fileRef, 40);
  if (p.order !== undefined) row.order = +p.order || 0;
  const old = p.id ? findRow_('Expansions', p.id) : null;
  if (!old && !row.name) throw new Error('Give the expansion a name.');
  if (old && row.name === '') delete row.name;
  let oldCover = '';
  if (p.cover) { row.coverFileId = saveImage_(p.cover, (row.name || (old && old.name) || 'Expansion') + ' box').getId(); if (old) oldCover = old.coverFileId; }
  else if (p.cover === '' && old) { row.coverFileId = ''; oldCover = old.coverFileId; }
  const out = withLock_(() => {
    if (old) { updateRow_('Expansions', old.id, row); return findRow_('Expansions', old.id); }
    const all = readAll_('Expansions');
    row.id = uid_(); row.created = new Date().toISOString(); row.group = row.group || 'custom';
    if (row.order === undefined) row.order = all.reduce((m, x) => Math.max(m, +x.order || 0), 0) + 1;
    append_('Expansions', row); return Object.assign({}, row);
  });
  trashFile_(oldCover);
  bust_();
  return publicExpansion_(out);
}
/** Delete an expansion and take its tag off everything. The cards themselves stay. */
function deleteExpansion(id, passcode) {
  requireAdmin_(passcode);
  const e = findRow_('Expansions', id); if (!e) return true;
  withLock_(() => {
    deleteRow_('Expansions', id);
    Object.keys(EXP_SHEETS).forEach(k => setListMembership_(EXP_SHEETS[k], 'expansions', id, []));
  });
  trashFile_(e.coverFileId);
  bust_();
  return true;
}
/** What came in one box. items: {cards:[ids], decks:[ids], scenarios:[ids], files:[ids]}; each list given is the
    whole contents for that kind (or, with add=true, extra things to tag without untagging anything). */
function setExpansionItems(expId, items, add, passcode) {
  requireAdmin_(passcode);
  if (!findRow_('Expansions', expId)) throw new Error('That expansion no longer exists.');
  items = items || {};
  withLock_(() => {
    Object.keys(EXP_SHEETS).forEach(k => { if (Array.isArray(items[k])) setListMembership_(EXP_SHEETS[k], 'expansions', expId, items[k].map(String), !!add); });
  });
  bust_();
  return true;
}
/** The expansions one card, deck, scenario or rulebook comes in. */
function setItemExpansions(kind, id, expIds, passcode) {
  requireAdmin_(passcode);
  const sh = EXP_SHEETS[kind]; if (!sh) throw new Error('Unknown kind.');
  if (!findRow_(sh, id)) throw new Error('That item is no longer on the site.');
  const v = expIds_(expIds);
  withLock_(() => updateRow_(sh, id, { expansions: v }));
  bust_();
  return splitList_(v);
}
/** Renegade Game Studios' Heroes of the Grid products (from their collection checklist), so the admin needn't type them all. */
const OFFICIAL_EXPANSIONS = [
  ['core', 'Heroes of the Grid (core game)', 'Core game'],
  ['big', 'Rangers United Expansion', 'Rangers United'], ['big', 'Shattered Grid Expansion', 'Shattered Grid'],
  ['big', 'Rise of the Psycho Rangers Expansion', 'Psycho Rangers'], ['big', 'Light and Darkness Expansion', 'Light and Darkness'],
  ['ranger', 'Zeo Ranger Pack', 'Zeo Rangers'], ['ranger', 'Time Force Ranger Pack', 'Time Force'], ['ranger', 'S.P.D. Ranger Pack', 'S.P.D.'],
  ['ranger', 'Dino Thunder Ranger Pack', 'Dino Thunder'], ['ranger', 'RPM Ranger Pack', 'RPM'],
  ['ranger', 'Legendary Ranger: Tommy Oliver Pack', 'Tommy Oliver'], ['ranger', 'Legendary Rangers: Forever Rangers Pack', 'Forever Rangers'],
  ['allies', 'Ranger Allies Pack #1', 'Allies #1'], ['allies', 'Ranger Allies Pack #2', 'Allies #2'], ['allies', 'Ranger Allies Pack #3', 'Allies #3'], ['allies', 'Ranger Allies Pack #4', 'Allies #4'],
  ['villain', 'Villain Pack #1', 'Villains #1'], ['villain', 'Villain Pack #2: Machine Empire', 'Machine Empire'], ['villain', 'Villain Pack #3: Legacy of Evil', 'Legacy of Evil'],
  ['villain', 'Villain Pack #4: A Dark Turn', 'A Dark Turn'], ['villain', 'Villain Pack #5: Terror Through Time', 'Terror Through Time'],
  ['character', 'Zeo Gold Ranger', 'Zeo Gold'], ['character', 'Bulk & Skull Character Pack', 'Bulk & Skull'], ['character', 'Squatt & Baboo Character Pack', 'Squatt & Baboo'],
  ['character', 'Santa Versus Heximas', 'Santa vs Heximas'], ['character', 'Painted Megazord', 'Painted Megazord'],
  ['pack', 'Shadow of Venjix Theme Pack', 'Shadow of Venjix'], ['pack', 'Arsenal Pack', 'Arsenal'], ['pack', 'Merciless Minions Pack #1', 'Minions #1'],
  ['pack', 'Merciless Minions Pack #2', 'Minions #2'], ['pack', 'Mega Goldar Deluxe Figure', 'Mega Goldar'], ['pack', 'Scenario Book 2', 'Scenario Book 2'],
  ['promo', 'Foot Soldier Promo Pack', 'Foot Soldier promo'], ['promo', 'Zord Promo Pack', 'Zord promo'], ['promo', 'Zord Promo Pack 2', 'Zord promo 2'],
  ['promo', 'Zord Pack 3', 'Zord pack 3'], ['promo', 'Shadow Ranger Promo Pack', 'Shadow Ranger'], ['promo', 'Green Samurai Promo Pack', 'Green Samurai'],
  ['promo', 'Metal Lead Ranger Promo', 'Metal Lead'], ['promo', 'Forever Red Promo', 'Forever Red'], ['promo', 'Forever Blue Promo', 'Forever Blue'],
  ['promo', 'Fan Appreciation Kit', 'Fan kit']
];
/** Add the official products that aren't on the site yet (matched by name). */
function seedExpansions(passcode) {
  requireAdmin_(passcode);
  const key = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  let added = 0;
  withLock_(() => {
    const all = readAll_('Expansions'), have = {}; all.forEach(e => { have[key(e.name)] = true; });
    let order = all.reduce((m, x) => Math.max(m, +x.order || 0), 0);
    const sh = sheet_('Expansions'), h = headers_(sh), now = new Date().toISOString();
    const fresh = OFFICIAL_EXPANSIONS.filter(x => !have[key(x[1])]).map(x => ({ id: uid_(), name: x[1], short: x[2], group: x[0], order: ++order, created: now }));
    if (fresh.length) sh.getRange(sh.getLastRow() + 1, 1, fresh.length, h.length).setValues(fresh.map(r => h.map(c => r[c] !== undefined ? r[c] : '')));
    added = fresh.length; dirty_('Expansions');
  });
  bust_();
  return { added: added, expansions: readAll_('Expansions').sort(expOrder_).map(publicExpansion_) };
}

/* ============================== Comics ==============================
   Comic book series and their issues. The admin's browser opens each CBZ, CBR or PDF, and sends its pages here a few at
   a time; every page is saved as a picture in Google Drive ("Grid Card Gallery – Comics" / series / issue), so the
   reader shows them straight from Google's image servers. pageImages holds "fileId~height/width" per page, comma separated.
   A series marked hidden is left out of the public data: only the admin sees it (its page pictures are unlisted links). */
const CSER_COLS = ['id', 'name', 'publisher', 'years', 'description', 'order', 'hidden', 'folderId', 'created'];
const COMIC_COLS = ['id', 'seriesId', 'title', 'number', 'year', 'description', 'credits', 'pages', 'pageImages', 'pagesFolder', 'fileName', 'fileSize', 'status', 'created'];
const COMIC_MAX_PAGES = 1000;
function comicsFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('COMICS_FOLDER_ID');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const images = DriveApp.getFolderById(props.getProperty('FOLDER_ID'));
  const parents = images.getParents();
  const folder = (parents.hasNext() ? parents.next() : DriveApp.getRootFolder()).createFolder(APP_NAME + ' – Comics');
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  props.setProperty('COMICS_FOLDER_ID', folder.getId());
  return folder;
}
const driveName_ = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled';
/** Keeps typed issue numbers, titles and years as text (so "001" or "1.10" stay as typed). */
function comicTextCols_(ss) {
  const sh = ss.getSheetByName('Comics'); if (!sh) return;
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  ['title', 'number', 'year', 'fileName'].forEach(c => { const i = h.indexOf(c); if (i >= 0) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@'); });
  const s2 = ss.getSheetByName('ComicSeries'); if (!s2) return;
  const h2 = s2.getRange(1, 1, 1, s2.getLastColumn()).getValues()[0];
  ['name', 'years'].forEach(c => { const i = h2.indexOf(c); if (i >= 0) s2.getRange(1, i + 1, s2.getMaxRows(), 1).setNumberFormat('@'); });
}
const isHidden_ = s => String(s && s.hidden) === '1';
function publicSeries_(s) {
  return { id: s.id, name: String(s.name), publisher: String(s.publisher || ''), years: String(s.years || ''), description: String(s.description || ''),
    order: +s.order || 0, hidden: isHidden_(s), created: s.created };
}
/** One issue as listed on the site: no page list (the reader asks getComic for that). c = cover "fileId~ratio". */
function publicComic_(c) {
  const first = String(c.pageImages || '').split(',')[0] || '';
  return { id: c.id, s: c.seriesId, t: String(c.title || ''), n: String(c.number == null ? '' : c.number), y: String(c.year || ''),
    p: +c.pages || 0, c: first, at: c.created, st: c.status === 'ready' ? '' : 'uploading', f: String(c.fileName || '') };
}
function comicSeriesOrder_(a, b) { return (+a.order || 0) - (+b.order || 0) || String(a.name).localeCompare(String(b.name)); }
/** Public lists: series that aren't hidden, and their finished issues. */
function comicsPayload_() {
  const series = readAll_('ComicSeries').filter(s => !isHidden_(s)).sort(comicSeriesOrder_);
  const ok = {}; series.forEach(s => { ok[s.id] = true; });
  return { series: series.map(publicSeries_), comics: readAll_('Comics').filter(c => ok[c.seriesId] && c.status === 'ready').map(publicComic_) };
}
/** Everything, for the admin: hidden series and unfinished uploads included. */
function getComicsAdmin(passcode) {
  requireAdmin_(passcode);
  return { series: readAll_('ComicSeries').sort(comicSeriesOrder_).map(publicSeries_), comics: readAll_('Comics').map(publicComic_) };
}
/** One issue's pages and details. Issues in hidden series (and unfinished ones) need the admin passcode.
    Public issues are cached for 10 minutes (cleared when the issue changes). */
function getComic(id, passcode) {
  const key = 'cm-' + id;
  if (!passcode) { try { const hit = CacheService.getScriptCache().get(key); if (hit) return JSON.parse(hit); } catch (e) {} }
  const c = findRow_('Comics', id); if (!c) throw new Error('That comic is no longer on the site.');
  const s = findRow_('ComicSeries', c.seriesId);
  const open = s && !isHidden_(s) && c.status === 'ready';
  if (!open && !isAdmin_(passcode)) throw new Error('That comic is not on the site.');
  const out = Object.assign(publicComic_(c), { pg: String(c.pageImages || ''), description: String(c.description || ''), credits: String(c.credits || ''), size: +c.fileSize || 0 });
  if (open) { try { const j = JSON.stringify(out); if (j.length < 95000) CacheService.getScriptCache().put(key, j, 600); } catch (e) {} }
  return out;
}
const forgetComic_ = id => { try { CacheService.getScriptCache().remove('cm-' + id); } catch (e) {} };
/** Create or update a series: {id?, name, publisher, years, description, hidden, order}. */
function saveComicSeries(p, passcode) {
  requireAdmin_(passcode);
  p = p || {};
  const row = {};
  if (p.name !== undefined) row.name = clean_(p.name, 140);
  if (p.publisher !== undefined) row.publisher = clean_(p.publisher, 80);
  if (p.years !== undefined) row.years = clean_(p.years, 20);
  if (p.description !== undefined) row.description = clean_(p.description, 3000);
  if (p.hidden !== undefined) row.hidden = p.hidden ? '1' : '';
  if (p.order !== undefined) row.order = +p.order || 0;
  const old = p.id ? findRow_('ComicSeries', p.id) : null;
  if (p.id && !old) throw new Error('That series is no longer on the site.');
  if (!old && !row.name) throw new Error('Give the series a name.');
  if (old && row.name === '') delete row.name;
  const out = withLock_(() => {
    if (old) { updateRow_('ComicSeries', old.id, row); return findRow_('ComicSeries', old.id); }
    const all = readAll_('ComicSeries');
    const same = all.find(s => String(s.name).toLowerCase() === String(row.name).toLowerCase());
    if (same) return same;                                   // two uploads of the same new series land in one series
    row.id = uid_(); row.created = new Date().toISOString();
    if (row.order === undefined) row.order = all.reduce((m, x) => Math.max(m, +x.order || 0), 0) + 1;
    append_('ComicSeries', row); return Object.assign({}, row);
  });
  if (old && row.hidden !== undefined && row.hidden !== String(old.hidden || '')) readAll_('Comics').filter(c => c.seriesId === old.id).forEach(c => forgetComic_(c.id));
  if (old && row.name && row.name !== old.name && old.folderId) { try { DriveApp.getFolderById(old.folderId).setName(driveName_(row.name)); } catch (e) {} }
  bust_();
  return publicSeries_(out);
}
/** Delete a series and every issue in it (their pages go to the Drive bin). */
function deleteComicSeries(id, passcode) {
  requireAdmin_(passcode);
  const s = findRow_('ComicSeries', id); if (!s) return true;
  const issues = readAll_('Comics').filter(c => c.seriesId === id);
  withLock_(() => { issues.forEach(c => deleteRow_('Comics', c.id)); deleteRow_('ComicSeries', id); });
  issues.forEach(c => { forgetComic_(c.id); trashFolder_(c.pagesFolder); }); trashFolder_(s.folderId);
  bust_();
  return true;
}
/** Start (or pick up) one issue's upload: {seriesId, title, number, year, description, credits, fileName, fileSize, pages}.
    An unfinished upload of the same file in the same series is continued: its saved pages come back in pg. */
function startComic(p, passcode) {
  requireAdmin_(passcode);
  p = p || {};
  const s = findRow_('ComicSeries', p.seriesId); if (!s) throw new Error('Choose a series for this comic.');
  const pages = Math.floor(+p.pages || 0);
  if (pages < 1) throw new Error('No pages were found in this file.');
  if (pages > COMIC_MAX_PAGES) throw new Error('This comic has over ' + COMIC_MAX_PAGES + ' pages. Split it into smaller files.');
  const fileName = clean_(p.fileName, 200);
  const fields = { title: clean_(p.title, 160) || fileName || 'Untitled', number: clean_(p.number, 20), year: clean_(p.year, 10),
    description: clean_(p.description, 4000), credits: clean_(p.credits, 600), pages: pages, fileSize: Math.max(0, Math.round(+p.fileSize || 0)) || '' };
  const out = withLock_(() => {
    const all = readAll_('Comics');
    const was = fileName && all.find(c => c.seriesId === s.id && c.fileName === fileName);
    if (was && was.status === 'ready' && !p.replace) throw new Error('"' + fileName + '" is already in this series.');
    if (was && was.status !== 'ready') {
      const keep = +was.pages === pages ? {} : { pageImages: '' };
      updateRow_('Comics', was.id, Object.assign({}, fields, keep, { status: 'uploading' }));
      return findRow_('Comics', was.id);
    }
    const row = Object.assign({ id: uid_(), seriesId: s.id, fileName: fileName, status: 'uploading', created: new Date().toISOString() }, fields);
    append_('Comics', row); return Object.assign({}, row);
  });
  return Object.assign(publicComic_(out), { pg: String(out.pageImages || '') });
}
/** The Drive folder for one issue's pages, made inside its series' folder the first time (under the lock, so two
    page uploads arriving together can't make two folders). */
function comicFolder_(id) {
  return withLock_(() => {
    dirty_('Comics'); dirty_('ComicSeries');
    const c = findRow_('Comics', id); if (!c) throw new Error('That comic is no longer on the site.');
    if (c.pagesFolder) { try { const f = DriveApp.getFolderById(c.pagesFolder); if (!f.isTrashed()) return f; } catch (e) {} }
    const s = findRow_('ComicSeries', c.seriesId);
    let sf = null;
    if (s && s.folderId) { try { sf = DriveApp.getFolderById(s.folderId); if (sf.isTrashed()) sf = null; } catch (e) { sf = null; } }
    if (!sf) {
      sf = comicsFolder_().createFolder(driveName_(s ? s.name : 'Comics'));
      sf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      if (s) updateRow_('ComicSeries', s.id, { folderId: sf.getId() });
    }
    const f = sf.createFolder(driveName_([c.number ? '#' + c.number : '', c.title].filter(Boolean).join(' ')));
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    updateRow_('Comics', id, { pagesFolder: f.getId() });
    return f;
  });
}
/** Save pages from..from+n-1 of an issue: images [{data: picture data URL, ratio: height/width}], at most 8 per call. */
function saveComicPages(id, from, images, passcode) {
  requireAdmin_(passcode);
  const c = findRow_('Comics', id); if (!c) throw new Error('That comic is no longer on the site.');
  const total = Math.max(1, Math.min(COMIC_MAX_PAGES, Math.floor(+c.pages || 0)));
  from = Math.max(1, Math.floor(+from || 1));
  if (!Array.isArray(images) || !images.length || images.length > 8) throw new Error('Send between 1 and 8 pages at a time.');
  const folder = comicFolder_(id), folderId = folder.getId();
  const made = images.map((img, k) => {
    const m = /^data:image\/(jpeg|webp|png);base64,(.+)$/.exec(String(img && img.data || ''));
    if (!m) throw new Error('Page ' + (from + k) + ' is not a picture.');
    const bytes = Utilities.base64Decode(m[2]);
    if (bytes.length > 6 * 1024 * 1024) throw new Error('Page ' + (from + k) + ' is too big.');
    const n = from + k, ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const file = folder.createFile(Utilities.newBlob(bytes, 'image/' + m[1], 'p' + ('000' + n).slice(-4) + '.' + ext));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const r = Math.round((+img.ratio || 1.538) * 1000) / 1000;
    return file.getId() + '~' + r;
  });
  let done = 0; const stale = [];
  withLock_(() => {
    dirty_('Comics');
    const row = findRow_('Comics', id); if (!row) return;
    const list = String(row.pageImages || '').split(',');
    while (list.length < total) list.push('');
    list.length = total;
    made.forEach((v, k) => { const i = from - 1 + k; if (i < total) { if (list[i]) stale.push(list[i].split('~')[0]); list[i] = v; } });
    done = list.filter(Boolean).length;
    updateRow_('Comics', id, { pageImages: list.join(','), pagesFolder: folderId });
  });
  stale.forEach(trashFile_); forgetComic_(id);
  return { done: done, total: total, ids: made };
}
/** Mark an issue ready once every page is saved; returns the pages still missing otherwise. */
function finishComic(id, passcode) {
  requireAdmin_(passcode);
  dirty_('Comics');
  const c = findRow_('Comics', id); if (!c) throw new Error('That comic is no longer on the site.');
  const total = +c.pages || 0, list = String(c.pageImages || '').split(','), missing = [];
  for (let i = 0; i < total; i++) if (!list[i]) missing.push(i + 1);
  if (missing.length) return { ok: false, missing: missing, pg: String(c.pageImages || '') };
  withLock_(() => updateRow_('Comics', id, { status: 'ready' }));
  bust_();
  return { ok: true, comic: publicComic_(Object.assign(c, { status: 'ready' })) };
}
/** Edit an issue's details or move it to another series: {title, number, year, description, credits, seriesId}. */
function updateComic(id, f, passcode) {
  requireAdmin_(passcode);
  const old = findRow_('Comics', id); if (!old) throw new Error('That comic is no longer on the site.');
  f = f || {};
  const patch = {};
  if (f.title !== undefined) patch.title = clean_(f.title, 160) || old.title;
  if (f.number !== undefined) patch.number = clean_(f.number, 20);
  if (f.year !== undefined) patch.year = clean_(f.year, 10);
  if (f.description !== undefined) patch.description = clean_(f.description, 4000);
  if (f.credits !== undefined) patch.credits = clean_(f.credits, 600);
  if (f.seriesId !== undefined && f.seriesId !== old.seriesId) {
    if (!findRow_('ComicSeries', f.seriesId)) throw new Error('That series is no longer on the site.');
    patch.seriesId = f.seriesId;
  }
  withLock_(() => updateRow_('Comics', id, patch));
  forgetComic_(id); bust_();
  return getComic(id, passcode);
}
/** Remove one issue; its page pictures go to the Drive bin. */
function deleteComic(id, passcode) {
  requireAdmin_(passcode);
  const c = findRow_('Comics', id); if (!c) return true;
  withLock_(() => deleteRow_('Comics', id));
  forgetComic_(id); trashFolder_(c.pagesFolder);
  bust_();
  return true;
}
/* ============================== end of comics ============================== */

function clearCache() { bust_(); Logger.log('Gallery cache cleared.'); }

function getComments(cardId) {
  return readAll_('Comments').filter(c => c.cardId === cardId)
    .sort((a, b) => new Date(a.created) - new Date(b.created))
    .map(c => ({ id: c.id, name: c.name, text: c.text, created: c.created }));
}

function addComment(cardId, name, text, visitor) {
  if (getSettingsMap_().allowComments === 'false') throw new Error('Comments are turned off.');
  name = clean_(name, 40) || 'Anonymous Ranger';
  text = clean_(text, MAX_COMMENT);
  if (!text) throw new Error('Write a comment first.');
  rateLimit_('c:' + visitor, 8);
  const row = { id: uid_(), cardId, name, text, created: new Date().toISOString(), visitor: String(visitor || '') };
  withLock_(() => append_('Comments', row));
  bust_();
  return { id: row.id, name, text, created: row.created };
}

function toggleLike(cardId, visitor) {
  if (!visitor) throw new Error('Missing visitor id.');
  rateLimit_('l:' + visitor, 30);
  return withLock_(() => {
    const sh = sheet_('Likes'); const data = sh.getDataRange().getValues();
    let liked;
    const idx = data.findIndex((r, i) => i > 0 && r[0] === cardId && r[1] === String(visitor));
    dirty_('Likes');
    if (idx > 0) { sh.deleteRow(idx + 1); liked = false; }
    else { sh.appendRow([cardId, String(visitor), new Date().toISOString()]); liked = true; }
    const likes = data.filter((r, i) => i > 0 && r[0] === cardId).length + (liked ? 1 : -1);
    updateRow_('Cards', cardId, { likes: Math.max(0, likes) });
    bust_();
    return { liked, likes: Math.max(0, likes) };
  });
}

function addView(cardId) {
  const cache = CacheService.getScriptCache();
  const key = 'v:' + cardId; const pending = +(cache.get(key) || 0) + 1;
  // batch view writes so a busy card doesn't hammer the sheet
  if (pending >= 3) {
    cache.remove(key);
    withLock_(() => { const c = findRow_('Cards', cardId); if (c) updateRow_('Cards', cardId, { views: (+c.views || 0) + pending }); });
  } else cache.put(key, String(pending), 21600);
  return true;
}

/** Visitor submission (only when enabled in Settings). Goes to the review queue. */
function submitCard(payload, visitor) {
  if (getSettingsMap_().allowSubmissions !== 'true') throw new Error('Submissions are closed right now.');
  rateLimit_('s:' + visitor, 5);
  payload.kind = 'homebrew';
  return saveCard_(payload, 'pending');
}

/* ============================== admin API ============================== */

function checkPasscode(passcode) { const ok = isAdmin_(passcode); if (ok) bust_(); return ok; }

function uploadCard(payload, passcode) { requireAdmin_(passcode); const c = saveCard_(payload, 'published'); bust_(); return c; }

function updateCard(id, fields, passcode) {
  requireAdmin_(passcode);
  const allowed = ['title', 'character', 'ranger', 'series', 'color', 'abilityName', 'abilityText', 'tags', 'description', 'collections', 'featured', 'status', 'creator', 'kind', 'decks', 'rangers'];
  if (fields.type !== undefined) { fields.type = cardType_(fields.type); allowed.push('type'); }
  if (fields.expansions !== undefined) { fields.expansions = expIds_(fields.expansions); allowed.push('expansions'); }
  const patch = {};
  allowed.forEach(k => { if (fields[k] !== undefined) patch[k] = typeof fields[k] === 'string' ? clean_(fields[k], 2000) : fields[k]; });
  const oldFile = fields.image ? newImage_('Cards', id, fields, patch) : '';
  let gone = '';
  if (fields.addAlt || fields.removeAlt || fields.primaryAlt) {
    const row = findRow_('Cards', id); if (!row) throw new Error('That card no longer exists.');
    let alts = altList_(row.alts);
    if (fields.addAlt) { const f = saveImage_(fields.addAlt, (fields.title || row.title) + ' alt'); alts.push({ id: f.getId(), w: +fields.altW || 0, h: +fields.altH || 0 }); }
    if (fields.removeAlt) { if (alts.some(a => a.id === fields.removeAlt)) gone = fields.removeAlt; alts = alts.filter(a => a.id !== fields.removeAlt); }
    if (fields.primaryAlt) {                       // swap an alternate with the main picture
      const k = alts.findIndex(a => a.id === fields.primaryAlt);
      if (k >= 0) { const a = alts[k]; alts[k] = { id: patch.fileId || row.fileId, w: +patch.width || +row.width || 0, h: +patch.height || +row.height || 0 };
        patch.fileId = a.id; if (a.w) patch.width = a.w; if (a.h) patch.height = a.h; }
    }
    patch.alts = altText_(alts);
  }
  withLock_(() => updateRow_('Cards', id, patch));
  trashFile_(oldFile); trashFile_(gone);
  bust_();
  return publicCard_(findRow_('Cards', id));
}

/** Folds card `otherId` into card `keepId`: its picture (and its own alternates) become alternate artwork,
    and its likes, views, comments, decks, collections, links and expansions move over. The other card is removed. */
function mergeCards(keepId, otherId, passcode) {
  requireAdmin_(passcode);
  if (keepId === otherId) throw new Error('Choose two different cards.');
  const keep = findRow_('Cards', keepId), other = findRow_('Cards', otherId);
  if (!keep || !other) throw new Error('That card no longer exists.');
  const join = (a, b) => [...new Set([...splitList_(a), ...splitList_(b)])].join(',');
  const alts = altList_(keep.alts).concat([{ id: other.fileId, w: +other.width || 0, h: +other.height || 0 }], altList_(other.alts));
  withLock_(() => {
    updateRow_('Cards', keepId, {
      alts: altText_(alts), likes: (+keep.likes || 0) + (+other.likes || 0), views: (+keep.views || 0) + (+other.views || 0),
      decks: join(keep.decks, other.decks), collections: join(keep.collections, other.collections), rangers: join(keep.rangers, other.rangers),
      expansions: join(keep.expansions, other.expansions), tags: join(keep.tags, other.tags)
    });
    // comments and likes follow the card; links from Zords and other cards point at the kept card
    ['Comments', 'Likes'].forEach(name => {
      const sh = sheet_(name); const v = sh.getDataRange().getValues(); const col = v[0].indexOf('cardId'); if (col < 0) return;
      let n = 0; for (let i = 1; i < v.length; i++) if (v[i][col] === otherId) { sh.getRange(i + 1, col + 1).setValue(keepId); n++; }
      if (n) dirty_(name);
    });
    readAll_('Cards').forEach(c => { const l = splitList_(c.rangers); if (l.indexOf(otherId) >= 0 && c.id !== otherId)
      updateRow_('Cards', c.id, { rangers: [...new Set(l.map(x => x === otherId ? keepId : x))].filter(x => x !== c.id).join(',') }); });
    deleteRow_('Cards', otherId);
  });
  bust_();
  return publicCard_(findRow_('Cards', keepId));
}

function deleteCard(id, passcode) {
  requireAdmin_(passcode);
  const c = findRow_('Cards', id); if (!c) return false;
  try { DriveApp.getFileById(c.fileId).setTrashed(true); } catch (e) {}
  altList_(c.alts).forEach(x => trashFile_(x.id));
  withLock_(() => { deleteRow_('Cards', id); setListMembership_('Cards', 'rangers', id, []); });   // its decks stay: they are shared and live in the Decks section
  bust_();
  return true;
}

function getPending(passcode) {
  requireAdmin_(passcode);
  return readAll_('Cards').filter(c => c.status === 'pending').map(publicCard_);
}

function saveCollection(col, passcode) {
  requireAdmin_(passcode);
  const row = { name: clean_(col.name, 80), description: clean_(col.description, 600), cover: col.cover || '', order: col.order || 0 };
  if (!row.name) throw new Error('Give the collection a name.');
  bust_();
  return withLock_(() => {
    if (col.id && findRow_('Collections', col.id)) { updateRow_('Collections', col.id, row); return findRow_('Collections', col.id); }
    row.id = uid_(); row.created = new Date().toISOString(); append_('Collections', row); return row;
  });
}

function deleteCollection(id, passcode) {
  requireAdmin_(passcode);
  withLock_(() => {
    deleteRow_('Collections', id);
    readAll_('Cards').forEach(c => {
      const ids = splitList_(c.collections);
      if (ids.includes(id)) updateRow_('Cards', c.id, { collections: ids.filter(x => x !== id).join(',') });
    });
  });
  bust_();
  return true;
}

function deleteComment(id, passcode) { requireAdmin_(passcode); withLock_(() => deleteRow_('Comments', id)); bust_(); return true; }

function saveSettings(s, passcode) {
  requireAdmin_(passcode);
  ['siteTitle', 'tagline', 'accent'].forEach(k => { if (s[k] !== undefined) setSetting_(k, clean_(s[k], 120)); });
  ['allowSubmissions', 'allowComments', 'showGame'].forEach(k => { if (s[k] !== undefined) setSetting_(k, s[k] ? 'true' : 'false'); });
  bust_();
  return publicPayload_().settings;
}

/* ============================== decks ============================== */

const byOrder_ = (a, b) => (+a.order || 0) - (+b.order || 0) || new Date(a.created) - new Date(b.created);

/** The combat cards in one deck (public). */
function getDeck(deckId) {
  const rows = readAll_('Deck');
  const mine = rows.filter(d => d.deckId === deckId);
  return (mine.length ? mine : rows.filter(d => !d.deckId && d.cardId === deckId)).sort(byOrder_).map(publicDeckCard_);
}

/** Several decks at once: {deckId: [cards]}. */
function getDecks(ids) {
  const want = {}; (Array.isArray(ids) ? ids : []).slice(0, 40).forEach(id => { want[id] = []; });
  readAll_('Deck').forEach(d => { if (want[d.deckId]) want[d.deckId].push(d); });
  Object.keys(want).forEach(k => { want[k] = want[k].sort(byOrder_).map(publicDeckCard_); });
  return want;
}

/** Create or rename a deck. */
function saveDeck(deck, passcode) {
  requireAdmin_(passcode);
  const row = { name: clean_(deck.name, 100), description: clean_(deck.description, 800) };
  if (deck.cover !== undefined) row.cover = clean_(deck.cover, 40);
  if (deck.kind !== undefined) row.kind = deckKind_(deck.kind);
  if (deck.expansions !== undefined) row.expansions = expIds_(deck.expansions);
  if (!row.name) throw new Error('Give the deck a name.');
  const old = deck.id ? findRow_('Decks', deck.id) : null;
  if (deck.face) row.faceFileId = saveImage_(deck.face, row.name + ' face').getId();   // a new face card picture
  const out = withLock_(() => {
    if (old) { updateRow_('Decks', deck.id, row); return findRow_('Decks', deck.id); }
    const all = readAll_('Decks');
    row.id = uid_(); row.cover = row.cover || ''; row.kind = row.kind || ''; row.faceFileId = row.faceFileId || ''; row.expansions = row.expansions || '';
    row.created = new Date().toISOString(); row.order = all.reduce((m, d) => Math.max(m, +d.order || 0), 0) + 1;
    append_('Decks', row); return row;
  });
  if (old && row.faceFileId && old.faceFileId) trashFile_(old.faceFileId);
  bust_();
  return Object.assign({ id: out.id, name: out.name, description: out.description, cover: out.cover || '', order: +out.order || 0, created: out.created, kind: deckKind_(out.kind), expansions: splitList_(out.expansions) }, faceUrls_(out.faceFileId));
}

/** Delete a deck, its combat cards and their images, and unassign it from every Ranger. */
function deleteDeck(id, passcode) {
  requireAdmin_(passcode);
  const cards = readAll_('Deck').filter(d => d.deckId === id);
  cards.forEach(d => { try { DriveApp.getFileById(d.fileId).setTrashed(true); } catch (e) {} });
  const meta = findRow_('Decks', id); if (meta) trashFile_(meta.faceFileId);
  withLock_(() => {
    cards.forEach(d => deleteRow_('Deck', d.id));
    deleteRow_('Decks', id);
    setListMembership_('Cards', 'decks', id, []);
  });
  bust_();
  return true;
}

/** Make exactly these Ranger cards members of a collection. */
function setCollectionCards(collectionId, cardIds, passcode) {
  requireAdmin_(passcode);
  if (!findRow_('Collections', collectionId)) throw new Error('That collection no longer exists.');
  withLock_(() => setListMembership_('Cards', 'collections', collectionId, cardIds || []));
  bust_();
  return true;
}

/** Zords and Megazords belong to Ranger cards: a Zord or Megazord card lists its Rangers in the rangers column.
    From a Ranger's side: make exactly these cards of one type (zord or megazord) list this Ranger. */
const LINK_TYPES = ['zord', 'megazord'];
function setRangerLinks(rangerId, type, cardIds, passcode) {
  requireAdmin_(passcode);
  if (LINK_TYPES.indexOf(type) < 0) throw new Error('Only Zords and Megazords can be assigned to a Ranger.');
  if (!findRow_('Cards', rangerId)) throw new Error('That Ranger card no longer exists.');
  const want = {}; (cardIds || []).forEach(id => { want[String(id)] = true; });
  withLock_(() => {
    const sh = sheet_('Cards'), v = sh.getDataRange().getValues(), h = v[0], ci = h.indexOf('rangers'), ii = h.indexOf('id'), ti = h.indexOf('type');
    if (ci < 0 || v.length < 2) return;
    let changed = false;
    const out = v.slice(1).map(row => {
      if (cardType_(row[ti]) !== type) return [row[ci]];
      const ids = splitList_(row[ci]), has = ids.indexOf(rangerId) >= 0, should = !!want[String(row[ii])];
      if (should && !has) { changed = true; return [ids.concat(rangerId).join(',')]; }
      if (!should && has) { changed = true; return [ids.filter(x => x !== rangerId).join(',')]; }
      return [row[ci]];
    });
    if (changed) sh.getRange(2, ci + 1, out.length, 1).setValues(out);
    dirty_('Cards');
  });
  bust_();
  return true;
}

/** Assign a deck to exactly these Ranger cards. */
function setDeckRangers(deckId, cardIds, passcode) {
  requireAdmin_(passcode);
  if (!findRow_('Decks', deckId)) throw new Error('That deck no longer exists.');
  withLock_(() => setListMembership_('Cards', 'decks', deckId, cardIds || []));
  bust_();
  return true;
}

function addDeckCard(deckId, p, passcode) {
  requireAdmin_(passcode);
  if (!findRow_('Decks', deckId)) throw new Error('That deck no longer exists.');
  const title = clean_(p.title, 120) || 'Untitled combat card';
  const file = saveImage_(p.image, title);
  const existing = readAll_('Deck').filter(d => d.deckId === deckId);
  const row = {
    id: uid_(), deckId, cardId: '', fileId: file.getId(), title, type: clean_(p.type, 20), cost: clean_(p.cost, 4),
    text: clean_(p.text, 1200), copies: Math.max(1, Math.min(9, +p.copies || 1)),
    dice: stat_(p.dice), hits: stat_(p.hits), shields: stat_(p.shields), star: p.star ? 'true' : '',
    order: existing.reduce((m, d) => Math.max(m, +d.order || 0), 0) + 1, created: new Date().toISOString()
  };
  withLock_(() => append_('Deck', row));
  bust_();
  return publicDeckCard_(row);
}

function updateDeckCard(id, f, passcode) {
  requireAdmin_(passcode);
  const patch = {};
  ['title', 'type', 'cost', 'text'].forEach(k => { if (f[k] !== undefined) patch[k] = clean_(f[k], 1200); });
  if (f.copies !== undefined) patch.copies = Math.max(1, Math.min(9, +f.copies || 1));
  ['dice', 'hits', 'shields'].forEach(k => { if (f[k] !== undefined) patch[k] = stat_(f[k]); });
  if (f.star !== undefined) patch.star = f.star ? 'true' : '';
  if (f.order !== undefined) patch.order = +f.order || 0;
  const oldFile = f.image ? newImage_('Deck', id, f, patch) : '';
  withLock_(() => updateRow_('Deck', id, patch));
  trashFile_(oldFile);
  bust_();
  return publicDeckCard_(findRow_('Deck', id));
}

function deleteDeckCard(id, passcode) {
  requireAdmin_(passcode);
  const d = findRow_('Deck', id); if (!d) return false;
  try { DriveApp.getFileById(d.fileId).setTrashed(true); } catch (e) {}
  withLock_(() => deleteRow_('Deck', id));
  bust_();
  return true;
}

/** Replacing a card's picture: saves the new image, points the row at it and returns the old file to bin once the row is updated.
    A new file gets a new link, so browsers never show the old picture from their cache. */
function newImage_(sheet, id, f, patch) {
  const row = findRow_(sheet, id); if (!row) throw new Error('That card no longer exists.');
  const file = saveImage_(f.image, f.title || row.title);
  patch.fileId = file.getId();
  if (sheet === 'Cards') { if (+f.width) patch.width = +f.width; if (+f.height) patch.height = +f.height; }
  return row.fileId;
}
function trashFile_(fileId) { if (fileId) try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {} }

/** Attack dice, hits and shields: whole numbers 0-9. */
function stat_(v) { const n = Math.round(+v || 0); return Math.max(0, Math.min(9, n)); }

function publicDeckCard_(d) {
  return {
    id: d.id, deckId: d.deckId, title: d.title, type: d.type, cost: String(d.cost === undefined ? '' : d.cost), text: d.text,
    copies: +d.copies || 1, order: +d.order || 0, created: d.created,
    dice: +d.dice || 0, hits: +d.hits || 0, shields: +d.shields || 0, star: String(d.star) === 'true',
    src: 'https://lh3.googleusercontent.com/d/' + d.fileId,
    thumb: 'https://lh3.googleusercontent.com/d/' + d.fileId + '=w420',
    download: 'https://drive.google.com/uc?export=download&id=' + d.fileId
  };
}

/* ============================== internals ============================== */

const CARD_COLS = ['id', 'fileId', 'title', 'character', 'ranger', 'series', 'color', 'abilityName', 'abilityText', 'tags',
  'description', 'collections', 'featured', 'status', 'creator', 'width', 'height', 'likes', 'views', 'created', 'kind', 'decks', 'type', 'rangers', 'expansions', 'alts'];
/** Heroes of the Grid card types stored in the Cards sheet. Combat cards live in decks (the Deck sheet). */
const CARD_TYPES = ['ranger', 'zord', 'megazord', 'arsenal', 'footsoldier', 'monster', 'boss', 'nemesis'];
function cardType_(t) { return CARD_TYPES.indexOf(t) >= 0 ? t : 'ranger'; }
const DECK_COLS = ['id', 'cardId', 'fileId', 'title', 'type', 'cost', 'text', 'copies', 'order', 'created', 'dice', 'hits', 'shields', 'star', 'deckId'];
const DECKS_COLS = ['id', 'name', 'description', 'cover', 'order', 'created', 'kind', 'faceFileId', 'expansions'];
/** Deck kinds: '' is a Ranger combat deck; the rest are enemy decks, shown with a face card. */
const DECK_KINDS = ['footsoldier', 'monster', 'boss', 'nemesis'];
function deckKind_(k) { return DECK_KINDS.indexOf(k) >= 0 ? k : ''; }
function faceUrls_(fid) { return fid ? { face: 'https://lh3.googleusercontent.com/d/' + fid, faceThumb: 'https://lh3.googleusercontent.com/d/' + fid + '=w420' } : { face: '', faceThumb: '' }; }
const COLL_COLS = ['id', 'name', 'description', 'cover', 'order', 'created'];
const COMMENT_COLS = ['id', 'cardId', 'name', 'text', 'created', 'visitor'];

function saveCard_(p, status) {
  const title = clean_(p.title, 120) || 'Untitled card';
  const file = saveImage_(p.image, title);
  const row = {
    id: uid_(), fileId: file.getId(), title,
    character: clean_(p.character, 80), ranger: clean_(p.ranger, 120), series: clean_(p.series, 60), color: clean_(p.color, 30),
    abilityName: clean_(p.abilityName, 120), abilityText: clean_(p.abilityText, 1200),
    tags: clean_(p.tags, 300), description: clean_(p.description, 1500), collections: clean_(p.collections, 500),
    featured: p.featured ? 'true' : '', status, creator: clean_(p.creator, 60), kind: p.kind === 'official' ? 'official' : 'homebrew', type: cardType_(p.type), expansions: expIds_(p.expansions),
    width: +p.width || '', height: +p.height || '', likes: 0, views: 0, created: new Date().toISOString()
  };
  withLock_(() => append_('Cards', row));
  return publicCard_(row);
}

function saveImage_(dataUrl, title) {
  if (!dataUrl) throw new Error('Choose an image to upload.');
  const m = /^data:(image\/(png|jpeg|webp|gif));base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error('Upload a PNG, JPG, WebP or GIF image.');
  const bytes = Utilities.base64Decode(m[3]);
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('That image is over 8 MB. Export a smaller version and try again.');
  const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
  const folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
  const file = folder.createFile(Utilities.newBlob(bytes, m[1], String(title).replace(/[^\w\- ]+/g, '') + '.' + ext));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file;
}

/** Adds new sheets/columns after an update, without re-running setup(). Runs at most every 6 hours. */
function migrate_() {
  const cache = CacheService.getScriptCache();
  if (cache.get('schema-v14')) return;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID'); if (!id) return;
  const ss = SpreadsheetApp.openById(id);
  ensureSheet_(ss, 'Cards', CARD_COLS);
  ensureSheet_(ss, 'Deck', DECK_COLS);
  ensureSheet_(ss, 'Decks', DECKS_COLS);
  ensureSheet_(ss, 'Files', FILE_COLS);
  ensureSheet_(ss, 'Scenarios', SCEN_COLS);
  ensureSheet_(ss, 'Expansions', EXP_COLS);
  ensureSheet_(ss, 'ComicSeries', CSER_COLS);
  ensureSheet_(ss, 'Comics', COMIC_COLS);
  comicTextCols_(ss);
  migrateDecks_();
  const s = getSettingsMap_();
  if (s.tagline === 'Custom Heroes of the Grid Ranger cards') setSetting_('tagline', 'Heroes of the Grid Ranger cards — official and homebrew');
  cache.put('schema-v14', '1', 21600);
  bust_();
}

/** Combat cards saved before named decks existed belonged straight to a Ranger card.
    Give each such Ranger its own named deck and assign it, once. */
function migrateDecks_() {
  withLock_(() => {
    ['Deck', 'Cards', 'Decks'].forEach(dirty_);
    const dsh = sheet_('Deck'), dv = dsh.getDataRange().getValues(), dh = dv[0] || [];
    const iDeck = dh.indexOf('deckId'), iCard = dh.indexOf('cardId');
    if (iDeck < 0 || dv.length < 2) return;
    const todo = {};
    for (let r = 1; r < dv.length; r++) { if (dv[r].join('') === '' || dv[r][iDeck]) continue; const k = String(dv[r][iCard] || ''); (todo[k] = todo[k] || []).push(r); }
    const keys = Object.keys(todo); if (!keys.length) return;
    const byId = {}; readAll_('Cards').forEach(c => { byId[c.id] = c; });
    let order = readAll_('Decks').reduce((m, d) => Math.max(m, +d.order || 0), 0);
    const made = [], assign = {};
    keys.forEach(cid => {
      const c = byId[cid];
      const name = c ? ([c.character, c.ranger].filter(Boolean).join(' — ') || c.title || 'Untitled deck') : 'Unassigned deck';
      const id = uid_(); made.push({ id, name, description: '', cover: '', order: ++order, created: new Date().toISOString() }); assign[cid] = id;
      todo[cid].forEach(r => { dv[r][iDeck] = id; });
    });
    dsh.getRange(2, iDeck + 1, dv.length - 1, 1).setValues(dv.slice(1).map(row => [row[iDeck]]));
    const ksh = sheet_('Decks'), kh = headers_(ksh);
    ksh.getRange(ksh.getLastRow() + 1, 1, made.length, kh.length).setValues(made.map(d => kh.map(k => d[k] !== undefined ? d[k] : '')));
    const csh = sheet_('Cards'), cv = csh.getDataRange().getValues(), ch = cv[0], iD = ch.indexOf('decks'), iI = ch.indexOf('id');
    if (iD >= 0 && cv.length > 1) {
      for (let r = 1; r < cv.length; r++) { const id = assign[cv[r][iI]]; if (!id) continue; const l = splitList_(cv[r][iD]); if (l.indexOf(id) < 0) l.push(id); cv[r][iD] = l.join(','); }
      csh.getRange(2, iD + 1, cv.length - 1, 1).setValues(cv.slice(1).map(row => [row[iD]]));
    }
    ['Deck', 'Cards', 'Decks'].forEach(dirty_);
  });
  bust_();
}

/** Add or remove one id in a comma-list column for many rows at once (one read, one write). */
function setListMembership_(sheetName, col, value, includeIds, onlyAdd) {
  dirty_(sheetName);
  const sh = sheet_(sheetName), v = sh.getDataRange().getValues(), h = v[0], ci = h.indexOf(col), ii = h.indexOf('id');
  if (ci < 0 || v.length < 2) return;
  const want = {}; includeIds.forEach(id => { want[String(id)] = true; });
  let changed = false;
  const out = v.slice(1).map(row => {
    const ids = splitList_(row[ci]), has = ids.indexOf(value) >= 0, should = !!want[String(row[ii])];
    if (should && !has) { changed = true; return [ids.concat(value).join(',')]; }
    if (!should && has && !onlyAdd) { changed = true; return [ids.filter(x => x !== value).join(',')]; }
    return [row[ci]];
  });
  if (changed) sh.getRange(2, ci + 1, out.length, 1).setValues(out);
  dirty_(sheetName);
}

function publicCard_(c) {
  return {
    id: c.id, title: c.title, character: c.character, ranger: c.ranger, series: c.series, color: c.color,
    abilityName: c.abilityName, abilityText: c.abilityText, tags: splitList_(c.tags), description: c.description,
    collections: splitList_(c.collections), decks: splitList_(c.decks), rangers: splitList_(c.rangers), expansions: splitList_(c.expansions), featured: String(c.featured) === 'true', status: c.status, creator: c.creator,
    kind: c.kind === 'official' ? 'official' : 'homebrew', type: cardType_(c.type),
    width: +c.width || 0, height: +c.height || 0, likes: +c.likes || 0, views: +c.views || 0, created: c.created,
    src: 'https://lh3.googleusercontent.com/d/' + c.fileId,
    thumb: 'https://lh3.googleusercontent.com/d/' + c.fileId + '=w720',
    download: 'https://drive.google.com/uc?export=download&id=' + c.fileId,
    alts: altList_(c.alts).map(a => ({ id: a.id, w: a.w, h: a.h, src: 'https://lh3.googleusercontent.com/d/' + a.id,
      thumb: 'https://lh3.googleusercontent.com/d/' + a.id + '=w720', download: 'https://drive.google.com/uc?export=download&id=' + a.id }))
  };
}
/** Alternate artwork for a card, stored as "fileId~width~height,…". */
function altList_(v) { return String(v || '').split(',').filter(Boolean).map(x => { const p = x.split('~'); return { id: p[0], w: +p[1] || 0, h: +p[2] || 0 }; }); }
function altText_(list) { return list.map(a => a.id + '~' + (a.w || '') + '~' + (a.h || '')).join(','); }

function isAdmin_(passcode) {
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSCODE');
  if (!passcode || !real) return false;
  const ok = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(passcode)).join() ===
             Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, real).join();
  if (!ok) { Utilities.sleep(600); } // slow down guessing
  return ok;
}
function requireAdmin_(p) { if (!isAdmin_(p)) throw new Error('Wrong passcode.'); }

function rateLimit_(key, maxPerMinute) {
  const cache = CacheService.getScriptCache(); const k = 'rl:' + key;
  const n = +(cache.get(k) || 0) + 1;
  if (n > maxPerMinute) throw new Error('Slow down a little and try again in a minute.');
  cache.put(k, String(n), 60);
}

// One spreadsheet handle and one read per sheet per request (opening the Sheet is the slow part).
let SS_ = null; const SH_ = {}; const RD_ = {};
function sheet_(name) {
  if (!SS_) {
    const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (!id) throw new Error('The gallery is not set up yet. Run setup() in the Apps Script editor.');
    SS_ = SpreadsheetApp.openById(id);
  }
  return SH_[name] || (SH_[name] = SS_.getSheetByName(name));
}
function dirty_(name) { delete RD_[name]; }

/* ---- chunked CacheService helpers (100 KB per value limit) ---- */
const PUB_KEY = 'pub-v13';
function cachePutJSON_(key, obj, ttl) {
  try {
    const s = JSON.stringify(obj), size = 90000, parts = {};
    const n = Math.ceil(s.length / size) || 1;
    for (let i = 0; i < n; i++) parts[key + ':' + i] = s.slice(i * size, (i + 1) * size);
    parts[key] = String(n);
    if (n > 80) return;              // too big to cache; just build it each time
    CacheService.getScriptCache().putAll(parts, ttl);
  } catch (e) {}
}
function cacheGetJSON_(key) {
  try {
    const c = CacheService.getScriptCache(); const n = +c.get(key); if (!n) return null;
    const keys = []; for (let i = 0; i < n; i++) keys.push(key + ':' + i);
    const got = c.getAll(keys); let s = '';
    for (let i = 0; i < n; i++) { const v = got[key + ':' + i]; if (v == null) return null; s += v; }
    return JSON.parse(s);
  } catch (e) { return null; }
}
function bust_() { try { CacheService.getScriptCache().remove(PUB_KEY); } catch (e) {} }
function ensureSheet_(ss, name, cols) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  cols.forEach(c => { if (have.indexOf(c) < 0) { sh.getRange(1, sh.getLastColumn() + 1).setValue(c); } });
  sh.setFrozenRows(1); sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
}
function readAll_(name) {
  if (!RD_[name]) {
    const v = sheet_(name).getDataRange().getValues(); const h = v.shift() || [];
    RD_[name] = v.filter(r => r.join('') !== '').map(r => { const o = {}; h.forEach((k, i) => { o[k] = r[i] instanceof Date ? r[i].toISOString() : r[i]; }); return o; });
  }
  return RD_[name].map(o => Object.assign({}, o));
}
function headers_(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]; }
function append_(name, obj) { dirty_(name); const sh = sheet_(name); sh.appendRow(headers_(sh).map(h => obj[h] !== undefined ? obj[h] : '')); }
function findIndex_(sh, id) { const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues(); for (let i = 1; i < ids.length; i++) if (ids[i][0] === id) return i + 1; return -1; }
function findRow_(name, id) { return readAll_(name).find(r => r.id === id) || null; }
function updateRow_(name, id, patch) {
  dirty_(name); const sh = sheet_(name); const r = findIndex_(sh, id); if (r < 0) throw new Error('Not found.');
  const h = headers_(sh); const row = sh.getRange(r, 1, 1, h.length).getValues()[0];
  Object.keys(patch).forEach(k => { const i = h.indexOf(k); if (i >= 0) row[i] = patch[k]; });
  sh.getRange(r, 1, 1, h.length).setValues([row]);
}
function deleteRow_(name, id) { dirty_(name); const sh = sheet_(name); const r = findIndex_(sh, id); if (r > 0) sh.deleteRow(r); }
function getSettingsMap_() {
  try { const o = {}; readAll_('Settings').forEach(r => { o[r.key] = String(r.value); }); return o; } catch (e) { return {}; }
}
function setSetting_(key, value) {
  dirty_('Settings'); const sh = sheet_('Settings'); const v = sh.getDataRange().getValues();
  const i = v.findIndex((r, n) => n > 0 && r[0] === key);
  if (i > 0) sh.getRange(i + 1, 2).setValue(value); else sh.appendRow([key, value]);
}
/** Runs fn while holding the script lock. Sheet writes are flushed before the lock is let go, so the next caller reads them. */
function withLock_(fn) { const l = LockService.getScriptLock(); l.waitLock(30000); try { const r = fn(); SpreadsheetApp.flush(); return r; } finally { l.releaseLock(); } }
function uid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function splitList_(s) { return String(s || '').split(',').map(x => x.trim()).filter(Boolean); }
function clean_(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max); }
