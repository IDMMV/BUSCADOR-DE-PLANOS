// ── STATE ──
let viewer = null;
let searchResults = [];
let currentIdx = -1;
let viewerReady = false;

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
  viewerReady = false;
  document.getElementById('search-wrap').classList.remove('enabled');
  document.getElementById('search-hint').textContent = '';
  document.getElementById('results-list').innerHTML = '';
  document.getElementById('no-results').textContent = '';
  searchResults = [];

  showFileInfo('📄 ' + file.name + ' (' + (file.size / 1024 / 1024).toFixed(1) + ' MB)');
  showProgress('Subiendo archivo...', 10);

  try {
    // 1. Upload via nuestro servidor
    const form = new FormData();
    form.append('file', file);
    const upRes  = await fetch('/api/models/upload', { method: 'POST', body: form });
    if (!upRes.ok) throw new Error('Upload: ' + await upRes.text());
    const { urn } = await upRes.json();

    showProgress('Traduciendo plano en Autodesk (1-3 min)...', 30);

    // 2. Poll status
    await pollStatus(urn);

    showProgress('Cargando visor...', 90);

    // 3. Init viewer
    await initViewer(urn);

    hideProgress();
    setStatus('✅ Plano listo: ' + file.name, 'green');
    viewerReady = true;
    document.getElementById('search-wrap').classList.add('enabled');
    document.getElementById('search-hint').textContent = '✅ Plano listo — escribe y presiona Buscar';
    toast('✅ Plano cargado correctamente');

  } catch (e) {
    hideProgress();
    setStatus('Error: ' + e.message.substring(0, 80), 'red');
    toast('❌ ' + e.message.substring(0, 100));
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
    if (data.status === 'failed')  throw new Error('Traducción fallida. Verifica el archivo DWG.');
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
        err => reject(new Error('Error al cargar: ' + JSON.stringify(err)))
      );
    });
  });
}

function zoomFit()       { if (viewer) viewer.fitToView(); }
function viewerZoom(f)   { if (!viewer) return; viewer.navigation.setZoomFactor(viewer.navigation.getZoomFactor() * f); }

// ── SEARCH ──
async function doSearch() {
  if (!viewerReady || !viewer) { toast('⚠ Espera a que el plano cargue'); return; }
  const term  = document.getElementById('search-input').value.trim();
  if (!term)  { toast('⚠ Escribe algo para buscar'); return; }
  const exact = document.getElementById('exact-check').checked;

  searchResults = []; currentIdx = -1;
  document.getElementById('results-list').innerHTML = '';
  document.getElementById('no-results').textContent = 'Buscando...';
  document.getElementById('results-count').textContent = '';
  document.getElementById('btn-prev').disabled = true;
  document.getElementById('btn-next').disabled = true;
  setStatus('Buscando: ' + term, 'blue');

  viewer.search(term,
    ids => {
      if (!ids || ids.length === 0) { showNoResults('Sin coincidencias para: ' + term); setStatus('Sin resultados', ''); return; }
      const results = [];
      let pending = ids.length;
      ids.forEach(dbId => {
        viewer.getProperties(dbId, props => {
          let matchProp = '', matchVal = '';
          (props.properties || []).forEach(p => {
            const v   = String(p.displayValue || '');
            const hit = exact ? v === term : v.toLowerCase().includes(term.toLowerCase());
            if (hit && !matchProp) { matchProp = p.displayName; matchVal = v; }
          });
          results.push({ dbId, name: props.name || ('Objeto ' + dbId), prop: matchProp, val: matchVal });
          if (--pending === 0) {
            searchResults = results;
            renderResults(term);
            currentIdx = 0;
            goToResult(0);
            setStatus(results.length + ' resultado(s) para: ' + term, 'green');
          }
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
    d.innerHTML = `<span class="ri-name">${hl(r.name, term)}</span>`
      + (r.prop ? `<span class="ri-detail">${r.prop}: ${hl(r.val, term)}</span>` : '')
      + `<span class="ri-id">ID ${r.dbId}</span>`;
    d.addEventListener('click', () => { currentIdx = i; goToResult(i); });
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
  goToResult(currentIdx);
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
  setStatus(`Resultado ${i + 1}/${searchResults.length}: ${r.name}`, 'green');
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
    const wr = document.getElementById('viewer-wrap').getBoundingClientRect();
    const vr = document.getElementById('forge-viewer').getBoundingClientRect();
    const mk = document.getElementById('marker');
    mk.style.left = (vr.left - wr.left + vp.x) + 'px';
    mk.style.top  = (vr.top  - wr.top  + vp.y) + 'px';
    mk.style.display = 'block';
    setTimeout(() => mk.style.display = 'none', 4000);
  } catch (e) { console.warn('marker', e); }
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
function toast(msg, ms = 3500) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', ms);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
