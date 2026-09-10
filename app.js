/* WebDich v0.1 — Voice → Text
 * Phase 1 only: MIC → ASR → LIVE → Language Detect → FINAL (EN / VI)
 * No translation, no TTS, no LLM, no backend.
 */
(function () {
  'use strict';

  // ---------- DOM ----------
  var liveEl = document.getElementById('live');
  var enEl = document.getElementById('final-en');
  var viEl = document.getElementById('final-vi');
  var micBtn = document.getElementById('mic');

  // ---------- State ----------
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var supported = !!SR;
  var micOn = false;
  var rec = null;
  var userStopped = false;
  var restartTimer = null;
  var finalEnglish = [];   // buffer per language (spec §11)
  var finalVietnamese = [];
  var lastFinal = '';      // anti-duplication (spec §10, §20)
  var committedFinal = ''; // accumulated committed transcript (for overlap strip)
  var preferredLang = navigator.language || 'en-US'; // adaptive ASR language
  var CONFIDENCE_THRESHOLD = 0.70; // spec §6

  // ---------- Language detection (spec §5) ----------
  // Heuristic only — no AI/LLM. Vietnamese diacritics + stopword frequency.
  var VI_DIACRITIC_RE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/g;

  var VI_STOP = ['tôi','bạn','xin','chào','là','có','không','đi','đến','một','người','đây','đó',
    'gì','nào','mình','anh','chị','em','được','rồi','đang','sẽ','vì','nhưng','mà','và','với','từ',
    'trong','trên','dưới','giữa','sau','trước','ngay','rất','nhiều','ít','kia','này','hay','hoặc',
    'nếu','khi','đã','cũng','đều','lại','vẫn','chỉ','thì','ga','tàu','xe','nhà','biển','phố','ăn',
    'uống','nước','muốn','cảm','ơn','lỗi','cho','hỏi','ở','đâu','ra','vào','lên','xuống','qua','tiếp',
    'theo','nơi','đường','phải','trái','thẳng','đầu','cuối','giờ','phút','ngày','tuần','tháng','năm',
    'sáng','trưa','chiều','tối','nay','mai','quá','đi','lại','nữa','rồi','về','đến','từ','đi','xem',
    'biết','nghe','nói','hỏi','đợi','gặp','làm','lấy','đưa','trả','mua','bán','giá','bao','nhiêu',
    'đồng','tiền','thẻ','vé','máy','bay','sân','bay','khách','sạn','nhà','hàng','quán','phòng',
    'tắm','ngủ','y','tế','bệnh','viện','thuốc','cứu','hỏa','trạm','gặp','ai','ấy','hắn','cô','dì',
    'chú','bác','ông','bà','con','cháu','bạn','bè','gặp','nhau','tạm','biệt','hẹn','gặp','lại'];

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
    'hospital','police','excuse','me','sorry','welcome','much','many','few','little','more','less',
    'again','still','already','yet','ever','never','always','often','sometimes','maybe','perhaps',
    'sure','of','course','fine','great','nice','lovely','expensive','cheap','big','small','hot','cold',
    'open','closed','early','late','far','near','fast','slow','left','right','stop','go','wait',
    'walk','drive','fly','swim','run','sit','stand','eat','drink','sleep','work','play','read','write',
    'listen','watch','learn','teach','buy','sell','pay','cost','spend','save','find','lose','win',
    'lose','love','like','hate','enjoy','prefer','remember','forget','understand','know','think',
    'believe','hope','wish','want','need','must','have','should','would','could','can','may','might',
    'shall','will','am','is','are','was','were','be','been','being','do','does','did','have','has',
    'had','having','i','me','my','mine','myself','you','your','yours','yourself','he','him','his',
    'himself','she','her','hers','herself','it','its','itself','we','us','our','ours','ourselves',
    'they','them','their','theirs','themselves','what','which','who','whom','whose','where','when',
    'why','how','all','each','every','both','few','more','most','other','some','such','no','nor',
    'not','only','own','same','so','than','too','very','just','because','as','until','while','of',
    'at','by','for','with','about','against','between','into','through','during','before','after',
    'above','below','to','from','up','down','in','out','on','off','over','under','again','further',
    'once','here','there','when','where','why','how','all','any','both','each','few','more','most',
    'other','some','such','no','nor','not','only','own','same','so','than','too','very','s','t','can',
    'will','just','don','should','now'];

  function detectLanguage(text) {
    var t = (text || '').toLowerCase().trim();
    if (!t) return { language: 'unknown', confidence: 0 };

    var dia = (t.match(VI_DIACRITIC_RE) || []).length;
    var words = t.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

    var viSw = 0, enSw = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (VI_STOP.indexOf(w) >= 0) viSw++;
      if (EN_STOP.indexOf(w) >= 0) enSw++;
    }

    var viScore = dia * 3 + viSw * 2;
    var enScore = enSw * 2;
    var total = viScore + enScore;

    if (total === 0) {
      if (dia > 0) return { language: 'vi', confidence: 0.6 };
      return { language: 'unknown', confidence: 0.2 };
    }

    if (viScore > enScore) {
      var cVi = Math.min(0.99, viScore / total);
      if (dia <= 1 && viSw === 0) cVi = Math.min(cVi, 0.78); // single diacritic, weak signal
      return { language: 'vi', confidence: cVi };
    }
    if (enScore > viScore) {
      return { language: 'en', confidence: Math.min(0.99, enScore / total) };
    }
    // tie
    if (dia > 0) return { language: 'vi', confidence: Math.min(0.99, 0.5 + dia / (words.length + 1)) };
    return { language: 'unknown', confidence: 0.4 };
  }

  // ---------- Overlap stripping (fix: Chrome continuous mode re-delivers accumulated transcript) ----------
  // Word-level, case-insensitive. Returns only the NEW words in `curr` that are
  // not already a suffix of `prev`. Persists across recognition auto-restarts.
  // Pure duplicate / stutter ("hello hello") → empty string → dropped.
  function normalizeText(t) { return (t || '').trim().replace(/\s+/g, ' '); }

  function stripOverlap(prev, curr) {
    var a = normalizeText(prev).toLowerCase().split(' ').slice(-20); // recent tail only
    var bLow = normalizeText(curr).toLowerCase().split(' ');
    var bOrig = normalizeText(curr).split(' ');
    var maxK = Math.min(a.length, bLow.length);
    var k = 0;
    for (var i = maxK; i >= 1; i--) {
      var match = true;
      for (var j = 0; j < i; j++) {
        if (a[a.length - i + j] !== bLow[j]) { match = false; break; }
      }
      if (match) { k = i; break; }
    }
    return bOrig.slice(k).join(' ').trim();
  }

  // ---------- Live text (spec §9: replace, never append) ----------
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

  // ---------- Final buffers (spec §11, §10: commit once) ----------
  // Tiny fragments (≤3 words, typical of Android Chrome's frequent final events)
  // are appended to the last line of the same language when no sentence boundary
  // exists — prevents one-word-per-line fragmentation without adding latency.
  function wordCount(t) { return (t || '').trim().split(/\s+/).filter(Boolean).length; }
  function endsWithSentenceBoundary(t) { return /[.?!。？！:;]\s*$/.test(t || ''); }

  function commitEnglish(text) {
    var last = finalEnglish.length ? finalEnglish[finalEnglish.length - 1] : '';
    if (last && !endsWithSentenceBoundary(last) && wordCount(text) <= 3) {
      finalEnglish[finalEnglish.length - 1] = last + ' ' + text;
    } else {
      finalEnglish.push(text);
    }
    renderFinals();
  }
  function commitVietnamese(text) {
    var last = finalVietnamese.length ? finalVietnamese[finalVietnamese.length - 1] : '';
    if (last && !endsWithSentenceBoundary(last) && wordCount(text) <= 3) {
      finalVietnamese[finalVietnamese.length - 1] = last + ' ' + text;
    } else {
      finalVietnamese.push(text);
    }
    renderFinals();
  }
  function renderFinals() {
    enEl.innerHTML = '';
    viEl.innerHTML = '';
    var i, p;
    for (i = 0; i < finalEnglish.length; i++) {
      p = document.createElement('p');
      p.textContent = finalEnglish[i];
      enEl.appendChild(p);
    }
    for (i = 0; i < finalVietnamese.length; i++) {
      p = document.createElement('p');
      p.textContent = finalVietnamese[i];
      viEl.appendChild(p);
    }
    enEl.scrollTop = enEl.scrollHeight;
    viEl.scrollTop = viEl.scrollHeight;
  }

  // ---------- Final handling + routing (spec §6) ----------
  function handleFinal(text) {
    text = (text || '').trim();
    if (!text) return; // empty result → ignore (spec §20)

    // anti-duplication: skip identical final (spec §10, §20)
    if (text === lastFinal) return;
    if (finalEnglish.length && finalEnglish[finalEnglish.length - 1] === text) return;
    if (finalVietnamese.length && finalVietnamese[finalVietnamese.length - 1] === text) return;
    lastFinal = text;

    var det = detectLanguage(text);

    if (det.confidence >= CONFIDENCE_THRESHOLD && det.language === 'vi') {
      commitVietnamese(text);
      preferredLang = 'vi-VN'; // adaptive: improve next ASR pass
      clearLive();
    } else if (det.confidence >= CONFIDENCE_THRESHOLD && det.language === 'en') {
      commitEnglish(text);
      preferredLang = 'en-US';
      clearLive();
    } else {
      // unknown / low confidence → keep in LIVE, do NOT commit (spec §6)
      updateLiveText(text);
    }
  }

  function handlePartial(text) {
    text = (text || '').trim();
    if (text) updateLiveText(text); // replace current buffer (spec §9)
  }

  // ---------- Speech Recognition (spec §7) ----------
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
      // Iterate ALL results: eventFinal = accumulated final transcript for this
      // session (Chrome continuous mode keeps finalized results in the list).
      for (var i = 0; i < e.results.length; i++) {
        var r = e.results[i];
        var t = (r[0] && r[0].transcript) ? r[0].transcript : '';
        if (r.isFinal) eventFinal += t + ' ';
        else interim += t;
      }
      if (interim) handlePartial(interim);
      if (eventFinal.trim()) {
        // Strip everything already committed; keep only the new increment.
        var increment = stripOverlap(committedFinal, eventFinal);
        if (increment) {
          committedFinal = normalizeText(committedFinal + ' ' + increment)
            .split(' ').slice(-40).join(' '); // bound memory
          handleFinal(increment); // detect language on the NEW text only
        }
        // empty increment → pure duplicate / stutter → drop (not committed)
      }
    };

    rec.onerror = function (e) {
      var err = e.error || '';
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        userStopped = true;
        micOn = false;
        updateMicUI();
        showStatus('Microphone access denied. Allow mic permission and tap again.');
      } else if (err === 'audio-capture') {
        userStopped = true;
        micOn = false;
        updateMicUI();
        showStatus('No microphone found on this device.');
      } else if (err === 'network') {
        showStatus('Speech service offline. Retrying…');
      }
      // no-speech / aborted → ignore; onend will restart if mic still ON
    };

    rec.onend = function () {
      // auto-restart if microphone still ON (spec §7, §20)
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
    if (rec) {
      try { rec.stop(); } catch (e) {}
      rec = null;
    }
  }

  // ---------- Microphone control (spec §13, §14) ----------
  function startMicrophone() {
    micOn = true;
    lastFinal = '';
    committedFinal = ''; // fresh listening session
    updateMicUI();
    startRecognition();
  }
  function stopMicrophone() {
    userStopped = true;
    micOn = false;
    stopRecognitionSilent();
    updateMicUI();
    clearLive();
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
