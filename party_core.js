// ---------- מסיבה בלי קלפים ----------
// משחק קבוצתי בלי חפיסה פיזית: מכשיר אחד מנגן ומשמש לוח, וכל טלפון אחר הוא
// ציר הזמן הפרטי של שחקן. כולם משבצים את אותו שיר בו זמנית ובסתר, ואין תורות,
// כי בשולחן של שישה אנשים תור אחד לשיר פירושו חמישה שממתינים.
//
// חלוקת האחריות: המארח הוא המקור היחיד לאמת. הטלפונים הם תצוגה בלבד ושולחים
// כוונות בלבד. כל שידור הוא תמונת מצב שלמה ולא הפרש, ולכן טלפון שהחמיץ עשר
// הודעות נכון לגמרי אחרי הודעה אחת, ואין מצב חוסר סנכרון שצריך לאבחן בערב.
const Party = (() => {
  const B = () => window.App.bridge;
  const $ = id => document.getElementById(id);
  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  };
  // מספרים בעברית נשברים בלי בידוד דו כיווני
  const bdi = n => { const b = document.createElement('bdi'); b.dir = 'ltr'; b.textContent = n; return b; };
  const COLORS = ['#ff3d81', '#4cc9f0', '#ffd166', '#06d6a0', '#b5179e', '#f77f00', '#8ecae6', '#c77dff'];
  const LS_ME = 'lg_me_v1', LS_ROOM = 'lg_room_v1', LS_CFG = 'lg_cfg_v1';

  // ============================================================
  // שכבת תקשורת. שש מתודות בלבד, ושום קוד משחק לא נוגע ב-PeerJS.
  // החלפה לשרת אחר נוגעת רק כאן.
  // ============================================================
  const Net = (() => {
    let peer = null, conns = new Map(), role = null, hostConn = null;
    const PEERJS = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';

    function loadLib() {
      if (window.Peer) return Promise.resolve();
      return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = PEERJS;
        s.onload = res;
        s.onerror = () => rej(new Error('peerjs blocked'));
        document.head.appendChild(s);
        setTimeout(() => rej(new Error('peerjs timeout')), 12000);
      });
    }
    const idFor = code => 'hstrmx-' + code;

    async function hostOpen(code, h) {
      await loadLib();
      role = 'host';
      return new Promise((res, rej) => {
        peer = new Peer(idFor(code), { debug: 0 });
        const timer = setTimeout(() => rej(new Error('open timeout')), 15000);
        peer.on('open', () => { clearTimeout(timer); res(); });
        peer.on('error', e => {
          clearTimeout(timer);
          // מזהה תפוס פירושו קוד תפוס, והמשחק מגלגל קוד אחר
          if (e && e.type === 'unavailable-id') rej(Object.assign(new Error('taken'), { taken: true }));
          else if (!conns.size) rej(e);
        });
        peer.on('connection', c => {
          c.on('open', () => { conns.set(c.peer, c); });
          c.on('data', d => h.onMessage(c.peer, d, c));
          c.on('close', () => { conns.delete(c.peer); h.onDrop(c.peer); });
          c.on('error', () => { conns.delete(c.peer); h.onDrop(c.peer); });
        });
      });
    }
    const hostSend = (key, msg) => { const c = conns.get(key); if (c && c.open) try { c.send(msg); } catch (e) {} };
    const hostBroadcast = msg => { for (const c of conns.values()) if (c.open) try { c.send(msg); } catch (e) {} };

    async function joinRoom(code, h) {
      await loadLib();
      role = 'player';
      // חיבור קודם נסגר במפורש, אחרת הצטרפות מחדש משאירה עמית יתום שממשיך
      // לקבל הודעות ומבלבל את הספירה אצל המארח
      try { if (peer) peer.destroy(); } catch (e) {}
      peer = null; hostConn = null;
      return new Promise((res, rej) => {
        peer = new Peer({ debug: 0 });
        const timer = setTimeout(() => rej(new Error('join timeout')), 15000);
        peer.on('open', () => {
          hostConn = peer.connect(idFor(code), { reliable: true });
          hostConn.on('open', () => { clearTimeout(timer); res(); });
          hostConn.on('data', d => h.onMessage(d));
          hostConn.on('close', () => h.onDrop());
          hostConn.on('error', () => h.onDrop());
        });
        peer.on('error', e => {
          clearTimeout(timer);
          // חדר לא קיים: קוד שגוי או שהמארח סגר
          rej(Object.assign(new Error(e.type || 'peer error'),
            { missing: e && e.type === 'peer-unavailable' }));
        });
      });
    }
    const playerSend = msg => { if (hostConn && hostConn.open) try { hostConn.send(msg); } catch (e) {} };
    function close() {
      try { for (const c of conns.values()) c.close(); } catch (e) {}
      try { if (hostConn) hostConn.close(); } catch (e) {}
      try { if (peer) peer.destroy(); } catch (e) {}
      peer = null; hostConn = null; conns = new Map(); role = null;
    }
    return { hostOpen, hostSend, hostBroadcast, joinRoom, playerSend, close,
             connected: () => role === 'host' ? conns.size : !!(hostConn && hostConn.open) };
  })();

  // ============================================================
  // ציר זמן משותף: אותו רכיב משמש את מסך השיבוץ ואת לוח המארח
  // ============================================================
  // גדלים יורדים ככל שהציר מתארך, אחרת עשרה שירים לא נכנסים למסך טלפון
  function sizes(n) {
    if (n <= 5) return { row: 44, gap: 56 };
    if (n <= 8) return { row: 40, gap: 52 };
    return { row: 36, gap: 48 };
  }
  const gapLabel = (tl, i) => {
    if (!tl.length) return 'השיר הראשון שלי';
    if (i === 0) return ['לפני ', tl[0].y];
    if (i === tl.length) return ['אחרי ', tl[tl.length - 1].y];
    return ['בין ', tl[i - 1].y, ' לבין ', tl[i].y];
  };
  const labelToNode = parts => {
    const frag = document.createDocumentFragment();
    if (typeof parts === 'string') { frag.appendChild(document.createTextNode(parts)); return frag; }
    for (const p of parts) frag.appendChild(typeof p === 'number' ? bdi(p) : document.createTextNode(p));
    return frag;
  };

  // ציר הזמן: הזמן זורם מלמעלה למטה ולעולם לא לרוחב. ציר אופקי דו משמעי בעברית,
  // וגלילה אופקית ב-RTL היא המקום הכי תקול בדפדפני נייד.
  function renderTimeline(box, tl, opts = {}) {
    const { onGap = null, chosen = null, locked = false, justAdded = null } = opts;
    const sz = sizes(tl.length);
    box.innerHTML = '';
    if (onGap && !tl.length) {
      const b = el('button', 'lg-first', 'השיר הראשון שלי');
      b.onclick = () => onGap(0);
      if (chosen === 0) b.classList.add('sel');
      box.appendChild(b);
      return;
    }
    box.appendChild(el('div', 'lg-edge', 'למעלה: ישן יותר'));
    const addGap = i => {
      if (!onGap) return;
      const b = el('button', 'lg-gap');
      b.style.minHeight = sz.gap + 'px';
      b.appendChild(labelToNode(gapLabel(tl, i)));
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', chosen === i ? 'true' : 'false');
      if (chosen === i) b.classList.add('sel');
      if (chosen !== null && chosen !== i) b.classList.add('dim');
      if (locked && chosen === i) b.classList.add('locked');
      b.onclick = () => { if (!locked) onGap(i); };
      box.appendChild(b);
    };
    addGap(0);
    tl.forEach((s, i) => {
      const row = el('div', 'lg-song' + (justAdded === i ? ' pulse' : ''));
      row.style.minHeight = sz.row + 'px';
      const y = el('span', 'lg-y'); y.appendChild(bdi(s.y));
      row.appendChild(y);
      row.appendChild(el('span', 'lg-t', s.t));
      box.appendChild(row);
      addGap(i + 1);
    });
    box.appendChild(el('div', 'lg-edge', 'למטה: חדש יותר'));
  }

  // ============================================================
  // חוקי המשחק
  // ============================================================
  // שיבוץ נכון: השנה יושבת בתוך הרווח שנבחר. אי שוויון לא חמור בשני הצדדים,
  // כדי ששנה שכבר קיימת בציר תיתן שני רווחים תקפים במקום מלכודת.
  function correct(tl, idx, year) {
    const lo = idx > 0 ? tl[idx - 1].y : -Infinity;
    const hi = idx < tl.length ? tl[idx].y : Infinity;
    return year >= lo && year <= hi;
  }
  const insertAt = (tl, song) => {
    const out = [...tl, { y: song.year, t: song.t, a: song.a }];
    out.sort((a, b) => a.y - b.y);
    return out;
  };

  // הגרלה: משקללים שנה לפי min(מספר שירים, 6) כדי ששנה עם 45 שירים
  // לא תהיה סבירה פי 45 משנה עם 3, ואז בוחרים בתוכה עם הבורר הקיים
  function draw(usedYears) {
    const pool = B().pool();
    if (!pool) return null;
    const mf = (B().MODES.find(m => m.k === B().gameMode()) || {}).filter;
    const years = [];
    for (const [y, cats] of Object.entries(pool)) {
      const all = [...(cats.heb || []), ...(cats.int || [])];
      const fit = mf ? all.filter(mf) : all;
      const playable = fit.filter(s => s.p || B().fullMode());
      if (playable.length) years.push([Number(y), Math.min(playable.length, 6), playable]);
    }
    if (!years.length) return null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const total = years.reduce((s, y) => s + y[1], 0);
      let r = Math.random() * total, pick = years[0];
      for (const y of years) { r -= y[1]; if (r <= 0) { pick = y; break; } }
      const [year, , list] = pick;
      // שנה צמודה מדי לשנה שכבר בציר יוצרת רווח שאי אפשר להכריע, ולכן מוגרלת מחדש
      if (attempt < 6 && usedYears.some(y => Math.abs(y - year) <= 2)) continue;
      const fresh = list.filter(s => !B().used.has(s.a + '::' + s.t));
      const from = fresh.length ? fresh : list;
      const song = from[Math.floor(Math.random() * from.length)];
      return { ...song, year };
    }
    const [year, , list] = years[Math.floor(Math.random() * years.length)];
    return { ...list[Math.floor(Math.random() * list.length)], year };
  }

  return { Net, renderTimeline, correct, insertAt, draw, gapLabel, labelToNode,
           COLORS, LS_ME, LS_ROOM, LS_CFG, $, el, bdi, B };
})();

window.Party = Party;
