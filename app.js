/* WebDich v0.2 — Voice → Text (row-synced, language-split chunks)
 * Phase 1 baseline + Phase-2 prep:
 *   - Mic ON → continuous recognition, row boundary every CHUNK_MS (2s) = "voice N"
 *   - Each voice chunk → one synchronized row: {en, vi}
 *   - Within a chunk, mixed-language text is SPLIT per word-run and routed to the
 *     correct column (e.g. "chào bạn hello" → VI:"chào bạn" | EN:"hello", same row)
 *   - Both columns always have the same row count (empty side keeps a blank line)
 * No translation / TTS / LLM yet — rows are the future translation-pair slots.
 */
(function () {
  'use strict';

  // ---------- DOM ----------
  var liveEl = document.getElementById('live');
  var enEl = document.getElementById('final-en');
  var viEl = document.getElementById('final-vi');
  var micBtn = document.getElementById('mic');

  // ---------- Config ----------
  var CHUNK_MS = 2000;      // one "voice" chunk = 2 seconds of speech
  var OVERLAP_TAIL = 20;    // words of committed history used for overlap strip

  // ---------- State ----------
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var supported = !!SR;
  var micOn = false;
  var rec = null;
  var userStopped = false;
  var restartTimer = null;
  var chunkTimer = null;
  var committedFinal = '';          // accumulated committed transcript (overlap strip)
  var preferredLang = navigator.language || 'en-US';
  var rows = [];                    // [{en, vi, finalized}] — synchronized row model
  var activeRow = null;             // row currently being filled

  // ---------- Word lists (per-word language classification) ----------
  var VI_DIACRITIC_RE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/;
  var NON_ASCII_RE = /[^\x00-\x7F]/;
  var VI_STOP = ['tôi','bạn','xin','chào','là','có','không','đi','đến','một','người','đây','đó',
    'gì','nào','mình','anh','chị','em','được','rồi','đang','sẽ','vì','nhưng','mà','và','với','từ',
    'trong','trên','dưới','giữa','sau','trước','ngay','rất','nhiều','ít','kia','này','hay','hoặc',
    'nếu','khi','đã','cũng','đều','lại','vẫn','chỉ','thì','ga','tàu','xe','nhà','biển','phố','ăn',
    'uống','nước','muốn','cảm','ơn','lỗi','cho','hỏi','ở','đâu','ra','vào','lên','xuống','qua','tiếp',
    'theo','nơi','đường','phải','trái','thẳng','đầu','cuối','giờ','phút','ngày','tuần','tháng','năm',
    'sáng','trưa','chiều','tối','nay','mai','quá','lại','nữa','về','xem','biết','nghe','nói','hỏi',
    'đợi','gặp','làm','lấy','đưa','trả','mua','bán','giá','bao','nhiêu','đồng','tiền','thẻ','vé',
    'máy','bay','sân','khách','sạn','nhà','hàng','quán','phòng','tắm','ngủ','y','tế','bệnh','viện',
    'thuốc','cứu','hỏa','trạm','ai','ấy','hắn','cô','dì','chú','bác','ông','bà','con','cháu','bè',
    'nhau','tạm','biệt','hẹn','lại','tên','gọi','xa','gần','thế','nào','ạ','ơi','ồ','à'];
  var EN_STOP = ['the','is','are','was','were','i','you','he','she','it','we','they','to','of','in',
    'for','on','with','at','by','from','up','about','into','over','after','be','have','has','had',
    'do','does','did','this','that','these','those','and','but','or','not','no','yes','hello','want',
    'wants','go','goes','home','station','train','how','what','where','when','why','a','an','my',
    'your','his','her','our','their','me','him','us','them','will','would','can','could','should',
    'please','thank','thanks','good','morning','afternoon','evening','night','bye','ok','okay','yeah',
    'like','get','take','make','see','know','think','say','said','tell','come','came','give','need',
    'time','today','tomorrow','yesterday','now','then','here','there','very','really','so','too',
    'just','only','also','well','right','left','straight','first','last','next','bus','taxi','hotel',
    'airport','street','road','city','country','food','water','coffee','tea','beer','wine','menu',
    'bill','check','money','ticket','passport','bag','luggage','help','emergency','doctor','pharmacy',
    'hospital','police','excuse','sorry','welcome','much','many','few','little','more','less','again',
    'still','already','yet','ever','never','always','often','sometimes','maybe','perhaps','sure',
    'course','fine','great','nice','expensive','cheap','big','small','hot','cold','open','closed',
    'early','late','far','near','fast','slow','stop','wait','walk','drive','fly','run','sit','stand',
    'eat','drink','sleep','work','play','read','write','listen','watch','learn','buy','sell','pay',
    'cost','find','love','enjoy','remember','forget','understand','believe','hope','must','all','each',
    'every','both','other','some','such','nor','own','same','than','because','as','until','while',
    'against','between','through','during','before','above','below','down','out','off','under',
    'further','once','which','who','whom','whose','hi','hey','oh','wow','uh','um','hmm'];

  // ---------- Helpers ----------
  function normalizeText(t) { return (t || '').trim().replace(/\s+/g, ' '); }
  function stripPunct(w) { return w.replace(/[.,!?;:()"'\[\]{}<>]/g, ''); }

  // Per-word language classification. Unknown ASCII → en; unknown non-ASCII → vi.
  function classifyWord(w) {
    var low = stripPunct((w || '').toLowerCase());
    if (!low) return null;
    if (VI_DIACRITIC_RE.test(w)) return 'vi';
    if (VI_STOP.indexOf(low) >= 0) return 'vi';
    if (EN_STOP.indexOf(low) >= 0) return 'en';
    if (NON_ASCII_RE.test(w)) return 'vi';
    return 'en';
  }

  // Split a text increment into maximal same-language runs.
  // "chào bạn hello" → [{lang:'vi',text:'chào bạn'}, {lang:'en',text:'hello'}]
  function splitByLanguage(text) {
    var words = normalizeText(text).split(' ').filter(Boolean);
    var segs = [], curLang = null, curWords = [];
    for (var i = 0; i < words.length; i++) {
      var lang = classifyWord(words[i]) || curLang || 'en';
      if (curLang === null) { curLang = lang; curWords = [words[i]]; }
      else if (lang === curLang) { curWords.push(words[i]); }
      else {
        segs.push({ lang: curLang, text: curWords.join(' ') });
        curLang = lang; curWords = [words[i]];
      }
    }
    if (curLang !== null) segs.push({ lang: curLang, text: curWords.join(' ') });
    return segs;
  }

  // Overlap strip (word-level): return only the NEW words in curr.
  function stripOverlap(prev, curr) {
    var a = normalizeText(prev).toLowerCase().split(' ').slice(-OVERLAP_TAIL);
    var bLow = normalizeText(curr).toLowerCase().split(' ');
    var bOrig = normalizeText(curr).split(' ');
    var maxK = Math.min(a.length, bLow.length), k = 0, i, j, match;
    for (i = maxK; i >= 1; i--) {
      match = true;
      for (j = 0; j < i; j++) {
        if (a[a.length - i + j] !== bLow[j]) { match = false; break; }
      }
      if (match) { k = i; break; }
    }
    return bOrig.slice(k).join(' ').trim();
  }

  // ---------- Live text ----------
  function updateLiveText(text) {
    liveEl.classList.remove('status');
    liveEl.textContent = text || '';
  }
  function clearLive() {
    liveEl.classList.remove('status');
    liveEl.textContent = '';
  }
  function showStatus(msg) {
    liveEl.classList.add('status');
    liveEl.textContent = msg;
  }

  // ---------- Row model (synchronized EN | VI) ----------
  function ensureActiveRow() {
    if (!activeRow || activeRow.finalized) {
      activeRow = { en: '', vi: '', finalized: false };
      rows.push(activeRow);
    }
  }
  function appendToCell(cell, text) {
    activeRow[cell] = activeRow[cell] ? activeRow[cell] + ' ' + text : text;
  }

  // New increment (already overlap-stripped) → split by language → append to active row.
  function handleIncrement(text) {
    text = normalizeText(text);
    if (!text) return;
    ensureActiveRow();
    var segs = splitByLanguage(text);
    var viWords = 0, enWords = 0;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      var wc = s.text.split(' ').length;
      if (s.lang === 'vi') { appendToCell('vi', s.text); viWords += wc; }
      else { appendToCell('en', s.text); enWords += wc; }
    }
    // adapt ASR language to the majority of this chunk
    preferredLang = (viWords >= enWords) ? 'vi-VN' : 'en-US';
    renderRows();
  }

  function renderRows() {
    enEl.innerHTML = '';
    viEl.innerHTML = '';
    var le = document.createElement('div');
    le.className = 'col-label'; le.textContent = 'Final English';
    enEl.appendChild(le);
    var lv = document.createElement('div');
    lv.className = 'col-label'; lv.textContent = 'Final Vietnamese';
    viEl.appendChild(lv);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var pe = document.createElement('p');
      pe.textContent = r.en || '\u00A0'; // blank line keeps columns synchronized
      if (!r.en) pe.style.opacity = '0.25';
      enEl.appendChild(pe);
      var pv = document.createElement('p');
      pv.textContent = r.vi || '\u00A0';
      if (!r.vi) pv.style.opacity = '0.25';
      viEl.appendChild(pv);
    }
    enEl.scrollTop = enEl.scrollHeight;
    viEl.scrollTop = viEl.scrollHeight;
  }

  // ---------- Chunk timer: one "voice" row every CHUNK_MS ----------
  function startChunkTimer() {
    stopChunkTimer();
    chunkTimer = setInterval(function () {
      if (activeRow && (activeRow.en || activeRow.vi)) {
        activeRow.finalized = true; // close row; next text starts a new synchronized row
        renderRows();
      }
    }, CHUNK_MS);
  }
  function stopChunkTimer() {
    if (chunkTimer) { clearInterval(chunkTimer); chunkTimer = null; }
  }

  // ---------- Speech Recognition ----------
  function startRecognition() {
    if (!supported) {
      showStatus('Speech recognition is not supported in this browser. Use Chrome / Edge on desktop or Android.');
      return;
    }
    stopRecognitionSilent();
    rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = preferredLang;
    rec.maxAlternatives = 1;
    userStopped = false;

    rec.onresult = function (e) {
      var interim = '', eventFinal = '';
      for (var i = 0; i < e.results.length; i++) {
        var r = e.results[i];
        var t = (r[0] && r[0].transcript) ? r[0].transcript : '';
        if (r.isFinal) eventFinal += t + ' ';
        else interim += t;
      }
      if (interim) updateLiveText(interim.trim());
      else clearLive();
      if (eventFinal.trim()) {
        var increment = stripOverlap(committedFinal, eventFinal);
        if (increment) {
          committedFinal = normalizeText(committedFinal + ' ' + increment)
            .split(' ').slice(-40).join(' ');
          handleIncrement(increment);
        }
      }
    };

    rec.onerror = function (e) {
      var err = e.error || '';
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        userStopped = true; micOn = false; updateMicUI(); stopChunkTimer();
        showStatus('Microphone access denied. Allow mic permission and tap again.');
      } else if (err === 'audio-capture') {
        userStopped = true; micOn = false; updateMicUI(); stopChunkTimer();
        showStatus('No microphone found on this device.');
      } else if (err === 'network') {
        showStatus('Speech service offline. Retrying…');
      }
    };

    rec.onend = function () {
      if (micOn && !userStopped) {
        clearTimeout(restartTimer);
        restartTimer = setTimeout(function () {
          if (micOn && !userStopped) startRecognition();
        }, 200);
      }
    };

    try { rec.start(); } catch (err) { /* already started */ }
  }

  function stopRecognitionSilent() {
    clearTimeout(restartTimer);
    if (rec) { try { rec.stop(); } catch (e) {} rec = null; }
  }

  // ---------- Microphone control ----------
  function startMicrophone() {
    micOn = true;
    committedFinal = '';
    rows = [];
    activeRow = null;
    renderRows();
    updateMicUI();
    startChunkTimer();
    startRecognition();
  }
  function stopMicrophone() {
    userStopped = true;
    micOn = false;
    stopChunkTimer();
    if (activeRow && (activeRow.en || activeRow.vi)) activeRow.finalized = true;
    stopRecognitionSilent();
    updateMicUI();
    clearLive();
    renderRows();
  }
  function updateMicUI() {
    micBtn.classList.toggle('on', micOn);
    micBtn.setAttribute('aria-pressed', micOn ? 'true' : 'false');
  }

  micBtn.addEventListener('click', function () {
    if (micOn) stopMicrophone();
    else startMicrophone();
  });

  // ---------- Init ----------
  if (!supported) {
    showStatus('Speech recognition not supported here. Open this page in Chrome / Edge (desktop or Android) over HTTPS or localhost.');
  }
})();
