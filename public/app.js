// ── STATE ──
let viewer = null;
let searchResults = [];
let currentIdx = -1;
let viewerReady = false;
let ocrIndex = [];
let ocrReady = false;
let ocrWorker = null;

// ── FILE UPLOAD ──
document.getElementById('file-input').addEventListener('change', e => { if (e.target.files[0]) processFile(e.target.files[0]); });
const dz = document.getElementById('drop-zone');
dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', ()  => dz.classList.remove('drag'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('drag');
  if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
});

async function processFile(file) {
  viewerReady = false; ocrReady = false; ocrIndex = [];
  document.getElementById('search-wrap').classList.remove('enabled');
  document.getElementById('search-hint').textContent = '';
  document.getElementById('results-list').innerHTML = '';
  document.getElementById('no-results').textContent = '';
  searchResults = [];

  showFileInfo('📄 ' + file.name + ' (' + (file.size/1024/1024).toFixed(1) + ' MB)');
  showProgress('Subiendo archivo...', 10);

  try {
    const form = new FormData();
    form.append('file', file);
    const upRes = await fetch('/api/models/upload', { method: 'POST', body: form });
    if (!upRes.ok) throw new Error('Upload: ' + await upRes.text());
    const { urn } = await upRes.json();

    showProgress('Traduciendo plano en Autodesk (1-3 min)...', 30);
    await pollStatus(urn);

    showProgress('Cargando visor...', 90);
    await initViewer(urn);

    hideProgress();
    setStatus('✅ Plano listo — iniciando OCR...', 'green');
    viewerReady = true;
    document.getElementById('search-wrap').classList.add('enabled');
    document.getElementById('search-hint').textContent = '⏳ Leyendo textos del plano...';
    toast('✅ Plano cargado — leyendo textos con OCR...');

    setTimeout(() => runOCR(), 3000);

  } catch(e) {
    hideProgress();
    setStatus('Error: ' + e.message.substring(0,80), 'red');
    toast('❌ ' + e.message.substring(0,100));
    console.error(e);
  }
}

async function pollStatus(urn) {
  for (let i = 0; i < 90; i++) {
    await sleep(5000);
    const res  = await fetch('/api/models/status/' + urn);
    const data = await res.json();
    const pct  = parseInt(data.progress) || 0;
    showProgress('Traduciendo: ' + data.status + (pct ? ' ' + pct + '%' : ''), 30 + Math.round(pct * 0.55));
    if (data.status === 'success') return;
    if (data.status === 'failed')  throw new Error('Traducción fallida.');
  }
  throw new Error('Tiempo de espera agotado');
}

// ── VIEWER ──
async function initViewer(urnB64) {
  const el = document.getElementById('forge-viewer');
  el.style.display = 'block';
  document.getElementById('placeholder').style.display = 'none';
  if (viewer) { viewer.finish(); viewer = null; }
  el.innerHTML = '';

  await new Promise((resolve, reject) => {
    Autodesk.Viewing.Initializer({
      env: 'AutodeskProduction2',
      api: 'streamingV2',
      getAccessToken: async (cb) => {
        const r = await fetch('/api/auth/token');
        const d = await r.json();
        cb(d.access_token, d.expires_in);
      }
    }, () => {
      viewer = new Autodesk.Viewing.GuiViewer3D(el, {});
      viewer.start();
      Autodesk.Viewing.Document.load('urn:' + urnB64,
        doc => {
          const geom = doc.getRoot().getDefaultGeometry();
          viewer.loadDocumentNode(doc, geom).then(resolve).catch(reject);
        },
        err => reject(new Error('Error: ' + JSON.stringify(err)))
      );
    });
  });
}

function zoomFit()     { if (viewer) viewer.fitToView(); }
function viewerZoom(f) { if (!viewer) return; viewer.navigation.setZoomFactor(viewer.navigation.getZoomFactor() * f); }

// ── OCR ──
async function runOCR() {
  const hint = document.getElementById('search-hint');
  hint.textContent = '⏳ Leyendo textos del plano con OCR...';
  setStatus('Leyendo textos del plano...', 'blue');

  try {
    if (!window.Tesseract) {
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    }

    const canvas = getViewerCanvas();
    if (!canvas) throw new Error('No se pudo capturar el visor');

    hint.textContent = '⏳ Procesando OCR... (30-60 seg)';

    ocrWorker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          hint.textContent = `⏳ OCR: ${Math.round(m.progress * 100)}%`;
        }
      }
    });

    await ocrWorker.setParameters({
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/().,- ',
      preserve_interword_spaces: '1',
    });

    const result = await ocrWorker.recognize(canvas);
    await ocrWorker.terminate();

    ocrIndex = [];
    const vw = canvas.width;
    const vh = canvas.height;

    result.data.words.forEach(word => {
      const text = word.text.trim();
      if (text.length < 2) return;
      const bbox = word.bbox;
      ocrIndex.push({
        text,
        textLower: text.toLowerCase(),
        px: (bbox.x0 + bbox.x1) / 2 / vw,
        py: (bbox.y0 + bbox.y1) / 2 / vh,
        bbox
      });
    });

    result.data.lines.forEach(line => {
      const text = line.text.trim();
      if (text.length < 3) return;
      const bbox = line.bbox;
      ocrIndex.push({
        text,
        textLower: text.toLowerCase(),
        px: (bbox.x0 + bbox.x1) / 2 / vw,
        py: (bbox.y0 + bbox.y1) / 2 / vh,
        bbox,
        isLine: true
      });
    });

    ocrReady = true;
    hint.textContent = `✅ ${ocrIndex.filter(o=>!o.isLine).length} textos indexados — escribe y presiona Buscar`;
    setStatus(`✅ OCR listo`, 'green');
    toast(`✅ OCR listo — puedes buscar códigos y números`);

  } catch(e) {
    console.error('OCR error:', e);
    hint.textContent = '⚠ OCR falló — intenta presionar F5 para reintentar';
    setStatus('OCR no disponible', '');
  }
}

function getViewerCanvas() {
  const el = document.getElementById('forge-viewer');
  const canvases = el.querySelectorAll('canvas');
  for (const c of canvases) {
    if (c.width > 100 && c.height > 100) return c;
  }
  return null;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ── SEARCH ──
async function doSearch() {
  if (!viewerReady || !viewer) { toast('⚠ Espera a que el plano cargue'); return; }
  const term = document.getElementById('search-input').value.trim();
  if (!term) { toast('⚠ Escribe algo para buscar'); return; }
  const exact = document.getElementById('exact-check').checked;
  const termLower = term.toLowerCase();

  searchResults = []; currentIdx = -1;
  document.getElementById('results-list').innerHTML = '';
  document.getElementById('no-results').textContent = 'Buscando...';
  document.getElementById('results-count').textContent = '';
  document.getElementById('btn-prev').disabled = true;
  document.getElementById('btn-next').disabled = true;
  setStatus('Buscando: ' + term, 'blue');

  if (ocrReady && ocrIndex.length > 0) {
    const words = ocrIndex.filter(item => !item.isLine && (exact ? item.text === term || item.textLower === termLower : item.textLower.includes(termLower)));
    const lines = ocrIndex.filter(item => item.isLine && (exact ? item.textLower === termLower : item.textLower.includes(termLower)));
    const combined = [...words, ...lines];

    if (combined.length > 0) {
      searchResults = combined.map((r, i) => ({
        id: i, name: r.text,
        prop: r.isLine ? 'Línea OCR' : 'Texto OCR',
        px: r.px, py: r.py, type: 'ocr'
      }));
      renderResults(term);
      currentIdx = 0;
      goToResultOCR(0);
      setStatus(searchResults.length + ' resultado(s) para: ' + term, 'green');
      return;
    }
  }

  viewer.search(term,
    ids => {
      if (!ids || ids.length === 0) { showNoResults('Sin coincidencias para: ' + term); setStatus('Sin resultados', ''); return; }
      const results = [];
      let pending = ids.length;
      ids.forEach(dbId => {
        viewer.getProperties(dbId, props => {
          let matchProp = '', matchVal = '';
          (props.properties || []).forEach(p => {
            const v = String(p.displayValue || '');
            if ((exact ? v === term : v.toLowerCase().includes(termLower)) && !matchProp) { matchProp = p.displayName; matchVal = v; }
          });
          results.push({ dbId, name: props.name || ('Obj ' + dbId), prop: matchProp, val: matchVal, type: 'prop' });
          if (--pending === 0) { searchResults = results; renderResults(term); currentIdx = 0; goToResult(0); setStatus(results.length + ' resultado(s) para: ' + term, 'green'); }
        }, () => { if (--pending === 0) { searchResults = results; renderResults(term); } });
      });
    },
    () => { showNoResults('Sin coincidencias para: ' + term); setStatus('Sin resultados', ''); },
    ['name'], exact
  );
}

function renderResults(term) {
  const list = document.getElementById('results-list');
  document.getElementById('no-results').textContent = '';
  if (searchResults.length === 0) { showNoResults('Sin coincidencias'); return; }
  document.getElementById('results-count').textContent = searchResults.length + ' resultado(s)';
  document.getElementById('btn-prev').disabled = false;
  document.getElementById('btn-next').disabled = false;
  list.innerHTML = '';
  searchResults.forEach((r, i) => {
    const d = document.createElement('div');
    d.className = 'result-item' + (i === 0 ? ' active' : '');
    d.innerHTML = `<span class="ri-name">${hl(r.name, term)}</span><span class="ri-detail">${r.prop}</span><span class="ri-id">${r.type === 'ocr' ? '📷 OCR' : '⚙ CAD'}</span>`;
    d.addEventListener('click', () => { currentIdx = i; goToResultAuto(i); });
    list.appendChild(d);
  });
}

function hl(text, term) {
  const e = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text).replace(new RegExp(e, 'gi'), m => `<mark style="background:rgba(251,191,36,.3);color:inherit;border-radius:2px">${m}</mark>`);
}

function showNoResults(msg) {
  document.getElementById('results-list').innerHTML = '';
  document.getElementById('no-results').textContent = msg || 'Sin resultados';
  document.getElementById('results-count').textContent = '';
  document.getElementById('btn-prev').disabled = true;
  document.getElementById('btn-next').disabled = true;
}

function navigate(dir) {
  if (!searchResults.length) return;
  currentIdx = (currentIdx + dir + searchResults.length) % searchResults.length;
  goToResultAuto(currentIdx);
}

function goToResultAuto(i) {
  if (searchResults[i]?.type === 'ocr') goToResultOCR(i);
  else goToResult(i);
}

function goToResultOCR(i) {
  if (!viewer || i < 0 || i >= searchResults.length) return;
  document.querySelectorAll('.result-item').forEach((el, j) => {
    el.classList.toggle('active', j === i);
    if (j === i) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  const r = searchResults[i];
  const vw = viewer.container.clientWidth;
  const vh = viewer.container.clientHeight;
  const sx = r.px * vw;
  const sy = r.py * vh;
  const worldPt = viewer.clientToWorld(sx, sy, false);
  if (worldPt && worldPt.point) {
    const nav = viewer.navigation;
    nav.setTarget(worldPt.point);
    const currentDist = nav.getEyeVector().length();
    nav.setEyeToCameraDistance(Math.max(currentDist * 0.3, 50));
  }
  placeMarkerAtScreen(sx, sy);
  setStatus(`Resultado ${i+1}/${searchResults.length} (OCR): ${r.name}`, 'green');
}

function goToResult(i) {
  if (!viewer || i < 0 || i >= searchResults.length) return;
  document.querySelectorAll('.result-item').forEach((el, j) => {
    el.classList.toggle('active', j === i);
    if (j === i) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  const r = searchResults[i];
  viewer.clearSelection();
  viewer.select([r.dbId]);
  viewer.fitToView([r.dbId]);
  setTimeout(() => placeMarker(r.dbId), 700);
  setStatus(`Resultado ${i+1}/${searchResults.length}: ${r.name}`, 'green');
}

function placeMarkerAtScreen(sx, sy) {
  const wr = document.getElementById('viewer-wrap').getBoundingClientRect();
  const vr = document.getElementById('forge-viewer').getBoundingClientRect();
  const mk = document.getElementById('marker');
  mk.style.left = (vr.left - wr.left + sx) + 'px';
  mk.style.top  = (vr.top  - wr.top  + sy) + 'px';
  mk.style.display = 'block';
  setTimeout(() => mk.style.display = 'none', 5000);
}

function placeMarker(dbId) {
  if (!viewer) return;
  try {
    const tree = viewer.model.getData().instanceTree;
    if (!tree) return;
    const bbox = new THREE.Box3();
    tree.enumNodeFragments(dbId, fid => {
      const b = new THREE.Box3();
      viewer.model.getFragmentList().getWorldBounds(fid, b);
      bbox.union(b);
    }, true);
    if (bbox.isEmpty()) return;
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const vp = viewer.worldToClient(center);
    placeMarkerAtScreen(vp.x, vp.y);
  } catch(e) { console.warn('marker', e); }
}

// ── HELPERS ──
function showFileInfo(msg) { const el = document.getElementById('file-info'); el.textContent = msg; el.style.display = 'block'; }
function showProgress(msg, pct) {
  document.getElementById('progress-wrap').style.display = 'flex';
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-text').textContent = msg;
  setStatus(msg, 'blue');
}
function hideProgress() { document.getElementById('progress-wrap').style.display = 'none'; }
function setStatus(msg, type) {
  document.getElementById('status-text').textContent = msg;
  document.getElementById('status-dot').className = 's-dot' + (type ? ' ' + type : '');
}
function toast(msg, ms = 4000) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', ms);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

document.addEventListener('keydown', e => {
  if (e.key === 'F5' && viewerReady) { e.preventDefault(); runOCR(); }
});
