// popup.js – Gestión de packs con prompts paso a paso y subida de imagen sencilla

let packs = [];
let editingIndex = null;
let tempIconBase64 = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadPacks();
  setupImageModal();
  document.getElementById('add-pack').onclick = () => openEditor(null);
  document.getElementById('export-packs').onclick = exportPacks;
  document.getElementById('import-btn').onclick = () => document.getElementById('import-packs').click();
  document.getElementById('import-packs').onchange = importPacks;
});

async function loadPacks() {
  const result = await chrome.storage.local.get('packs');
  packs = result.packs || [];
  renderPacks();
}

async function savePacks() {
  await chrome.storage.local.set({ packs });
  renderPacks();
  notifyTab();
}

function renderPacks() {
  const container = document.getElementById('packs-container');
  container.innerHTML = '';
  packs.forEach((pack, index) => {
    const div = document.createElement('div');
    div.className = 'pack';
    div.draggable = true;
    div.dataset.index = index;

    let iconPreview = '';
    if (pack.icon) {
      iconPreview = `<img src="${pack.icon}" style="height:18px; vertical-align:middle; margin-right:5px;">`;
    }

    div.innerHTML = `
      <div class="pack-header">
        <span class="pack-name">${iconPreview}${pack.name || 'Pack ' + (index+1)}</span>
        <span class="pack-actions">
          <button class="edit-pack" data-index="${index}">✏️</button>
          <button class="delete-pack" data-index="${index}">🗑️</button>
        </span>
      </div>
      <div class="pack-words">${pack.words ? pack.words.join(', ') : '(sin palabras)'}</div>
    `;

    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('drop', handleDrop);
    div.addEventListener('dragend', handleDragEnd);

    container.appendChild(div);
  });

  document.querySelectorAll('.edit-pack').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      openEditor(index);
    });
  });

  document.querySelectorAll('.delete-pack').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      deletePack(index);
    });
  });
}

// ---------- Editor paso a paso ----------
function openEditor(index) {
  const pack = index !== null ? packs[index] : { name: '', words: [], color: null, icon: null };

  // Paso 1: Nombre
  const name = prompt('Nombre del pack:', pack.name || '');
  if (name === null) return; // Canceló

  // Paso 2: Palabras
  const wordsStr = prompt('Palabras clave (separadas por coma):', pack.words.join(', '));
  if (wordsStr === null) return;
  const words = wordsStr.split(',').map(w => w.trim()).filter(Boolean);

  // Paso 3: Color
  const color = prompt('Color del texto (opcional, ej. #FF0000):', pack.color || '');
  if (color === null) return;

  // Paso 4: Imagen (aquí entra el minimodal)
  // Guardamos temporalmente lo que ya tenemos
  const basePack = {
    name,
    words,
    color: color || null,
    icon: pack.icon || null // mantenemos el existente si no se cambia
  };

  // Abrimos el minimodal de imagen
  openImagePicker(basePack, index);
}

// ---------- Minimodal para elegir imagen ----------
function setupImageModal() {
  document.getElementById('img-cancel').onclick = () => {
    document.getElementById('image-picker-modal').style.display = 'none';
    // Cancelar todo el editor
  };
  document.getElementById('img-skip').onclick = () => {
    document.getElementById('image-picker-modal').style.display = 'none';
    // Guardar sin cambiar la imagen (usar la que ya tenía o null)
    finishEditing(tempBasePack, editingIndex);
  };
  document.getElementById('img-file').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      tempIconBase64 = ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  document.getElementById('img-save').onclick = () => {
    document.getElementById('image-picker-modal').style.display = 'none';
    // Usar la nueva imagen (si no se seleccionó, tempIconBase64 será null)
    const updatedPack = { ...tempBasePack, icon: tempIconBase64 || tempBasePack.icon };
    if (editingIndex !== null) {
      packs[editingIndex] = updatedPack;
    } else {
      packs.push(updatedPack);
    }
    savePacks();
  };
}

let tempBasePack = null;

function openImagePicker(basePack, index) {
  tempBasePack = basePack;
  editingIndex = index;
  tempIconBase64 = null; // resetear selección nueva
  document.getElementById('image-picker-modal').style.display = 'flex';
  document.getElementById('img-file').value = ''; // limpiar input
}

function finishEditing(pack, index) {
  if (index !== null) {
    packs[index] = pack;
  } else {
    packs.push(pack);
  }
  savePacks();
}

// ---------- Eliminar pack ----------
function deletePack(index) {
  if (confirm('¿Eliminar este pack?')) {
    packs.splice(index, 1);
    savePacks();
  }
}

// ---------- Drag & drop ----------
let dragStartIndex;

function handleDragStart(e) {
  dragStartIndex = parseInt(e.target.closest('.pack').dataset.index);
  e.dataTransfer.effectAllowed = 'move';
  e.target.closest('.pack').classList.add('dragging');
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
  e.preventDefault();
  const dropIndex = parseInt(e.target.closest('.pack').dataset.index);
  if (dropIndex !== dragStartIndex && !isNaN(dropIndex)) {
    const item = packs.splice(dragStartIndex, 1)[0];
    packs.splice(dropIndex, 0, item);
    savePacks();
  }
}

function handleDragEnd(e) {
  e.target.closest('.pack').classList.remove('dragging');
}

// ---------- Exportar / Importar ----------
function exportPacks() {
  const json = JSON.stringify(packs, null, 2);
  const blob = new Blob([json], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'icon-it-packs.json';
  a.click();
}

function importPacks(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (Array.isArray(imported)) {
        packs = packs.concat(imported);
        savePacks();
      } else {
        alert('Formato incorrecto. Debe ser un arreglo JSON.');
      }
    } catch (err) {
      alert('No se pudo leer el archivo.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ---------- Notificar a la pestaña activa ----------
async function notifyTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, { action: 'updatePacks' });
    }
  } catch (error) {
    // Ignorar error si no hay content script
  }
}