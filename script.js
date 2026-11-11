document.addEventListener('DOMContentLoaded', () => {
  // ===== Конфигурация Supabase =====
  const SUPABASE_URL = 'https://uwuqsvlvptldeaesabif.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXFzdmx2cHRsZGVhZXNhYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNzc0MTUsImV4cCI6MjEwNTY1MzQxNX0.FJPswfe83L57YprUJkSSeyi4u0RMvEXkhnCl9X76RWg';
  const TABLE = 'wishlist_items';

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ===== Telegram WebApp =====
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  function getUserId() {
    const tgUser = tg?.initDataUnsafe?.user;
    if (tgUser?.id) return String(tgUser.id);
    let debugId = localStorage.getItem('debug_user_id');
    if (!debugId) {
      debugId = 'debug_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('debug_user_id', debugId);
    }
    return debugId;
  }

  const userId = getUserId();

  // ===== DOM =====
  const openBtn = document.getElementById('open');
  const modalOverlay = document.getElementById('modalOverlay');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const modalTitle = document.getElementById('modalTitle');
  const submitBtn = document.getElementById('submitBtn');

  const addForm = document.getElementById('addForm');
  const titleInput = document.getElementById('titleInput');
  const charCounter = document.getElementById('charCounter');
  const numberInput = document.getElementById('numberInput');
  const linkInput = document.getElementById('linkInput');
  const groupInput = document.getElementById('groupInput');
  const groupOptionsEl = document.getElementById('groupOptions');

  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const uploadPlaceholder = document.getElementById('uploadPlaceholder');
  const cropperContainer = document.getElementById('cropperContainer');
  const cropImage = document.getElementById('cropImage');
  const resetCropBtn = document.getElementById('resetCropBtn');
  const existingPhotoPreview = document.getElementById('existingPhotoPreview');

  const listEl = document.querySelector('.list');
  const sumValueEl = document.getElementById('sumValue');
  const itemCountEl = document.getElementById('itemCount');
  const sortSelect = document.getElementById('searchPriority');
  const viewModeSelect = document.getElementById('viewMode');
  const priceMinInput = document.getElementById('priceMin');
  const priceMaxInput = document.getElementById('priceMax');

  // ===== Состояние =====
  let items = [];
  let cropper = null;
  let photoChanged = false;
  let editingId = null;
  let editingPhotoUrl = null;

  // ===== Модалка: сброс UI фото =====
  function resetPhotoUI() {
    if (cropper) { cropper.destroy(); cropper = null; }
    fileInput.value = '';
    cropImage.src = '';
    photoChanged = false;
    cropperContainer.classList.add('hidden');
    if (existingPhotoPreview) existingPhotoPreview.classList.add('hidden');
    uploadPlaceholder.classList.remove('hidden');
  }

  function openModalForCreate() {
    editingId = null;
    editingPhotoUrl = null;
    addForm.reset();
    charCounter.textContent = '0 / 50';
    groupInput.value = '';
    resetPhotoUI();
    modalTitle.textContent = 'Create a record';
    submitBtn.textContent = 'Add';
    modalOverlay.classList.remove('hidden');
  }

  function openModalForEdit(item) {
    editingId = item.id;
    editingPhotoUrl = item.photo_url;
    titleInput.value = item.title || '';
    numberInput.value = item.price ?? '';
    linkInput.value = item.link || '';
    groupInput.value = item.group_name || '';
    charCounter.textContent = `${titleInput.value.length} / 50`;
    resetPhotoUI();
    if (item.photo_url && existingPhotoPreview) {
      existingPhotoPreview.src = item.photo_url;
      existingPhotoPreview.classList.remove('hidden');
      uploadPlaceholder.classList.add('hidden');
    }
    modalTitle.textContent = 'Edit record';
    submitBtn.textContent = 'Save';
    modalOverlay.classList.remove('hidden');
  }

  function closeModal() {
    modalOverlay.classList.add('hidden');
  }

  openBtn.addEventListener('click', openModalForCreate);
  closeModalBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // ===== Счётчик символов =====
  titleInput.addEventListener('input', () => {
    const len = titleInput.value.length;
    charCounter.textContent = `${len} / 50`;
    charCounter.classList.toggle('limit-reached', len >= 50);
  });

  // ===== Выбор и кроп фото =====
  dropZone.addEventListener('click', (e) => {
    if (e.target !== resetCropBtn && !cropperContainer.contains(e.target)) {
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      cropImage.src = event.target.result;
      uploadPlaceholder.classList.add('hidden');
      if (existingPhotoPreview) existingPhotoPreview.classList.add('hidden');
      cropperContainer.classList.remove('hidden');
      photoChanged = true;

      if (cropper) cropper.destroy();
      cropper = new Cropper(cropImage, {
        aspectRatio: 1,
        viewMode: 1,
        autoCropArea: 1,
        responsive: true
      });
    };
    reader.readAsDataURL(file);
  });

  resetCropBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetPhotoUI();
  });

  function getCroppedBlob() {
    return new Promise((resolve, reject) => {
      if (!cropper) return resolve(null);
      cropper.getCroppedCanvas({ width: 600, height: 600 }).toBlob((blob) => {
        blob ? resolve(blob) : reject(new Error('Не удалось обработать изображение'));
      }, 'image/jpeg', 0.85);
    });
  }

  // ===== Загрузка фото через серверную функцию Vercel =====
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function uploadPhoto(blob, itemId) {
    const path = `${userId}/${itemId}.jpg`;
    const base64 = await blobToBase64(blob);

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, path })
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Upload failed');

    return result.url;
  }

  // ===== Загрузка списка из Supabase =====
  async function loadItems() {
    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      return;
    }
    items = data || [];
    renderList();
  }

  // ===== Фильтр по цене =====
  priceMinInput.addEventListener('input', renderList);
  priceMaxInput.addEventListener('input', renderList);

  function getPriceRange() {
    const min = priceMinInput.value === '' ? null : Number(priceMinInput.value);
    const max = priceMaxInput.value === '' ? null : Number(priceMaxInput.value);
    return { min, max };
  }

  function inRange(price, range) {
    if (range.min !== null && price < range.min) return false;
    if (range.max !== null && price > range.max) return false;
    return true;
  }

  sortSelect.addEventListener('change', renderList);
  viewModeSelect.addEventListener('change', renderList);

  // ===== Группировка =====
  function groupItems(all) {
    const groups = new Map();
    const ungrouped = [];
    all.forEach((it) => {
      const g = (it.group_name || '').trim();
      if (!g) {
        ungrouped.push(it);
        return;
      }
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(it);
    });
    return { groups, ungrouped };
  }

  function sumPrices(arr) {
    return arr.reduce((acc, it) => acc + (Number(it.price) || 0), 0);
  }

  function populateGroupOptions() {
    if (!groupOptionsEl) return;
    const names = new Set();
    items.forEach((it) => {
      const g = (it.group_name || '').trim();
      if (g) names.add(g);
    });
    groupOptionsEl.innerHTML = '';
    names.forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      groupOptionsEl.appendChild(opt);
    });
  }

  // ===== Сортировка =====
  function sortItemsByMode(arr, mode) {
    const copy = [...arr];
    switch (mode) {
      case 'high':
        copy.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'));
        break;
      case 'medium':
        copy.sort((a, b) => (b.title || '').localeCompare(a.title || '', 'ru'));
        break;
      case 'low':
        copy.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'low2':
        copy.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      default:
        break;
    }
    return copy;
  }

  function sortGroupsByMode(arr, mode) {
    const copy = [...arr];
    switch (mode) {
      case 'high':
        copy.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        break;
      case 'medium':
        copy.sort((a, b) => b.name.localeCompare(a.name, 'ru'));
        break;
      case 'low':
        copy.sort((a, b) => a.total - b.total);
        break;
      case 'low2':
        copy.sort((a, b) => b.total - a.total);
        break;
      default:
        break;
    }
    return copy;
  }

  // ===== Рендер карточки/группы =====
  function createCardElement(item) {
    const card = document.createElement('div');
    card.className = 'block_r';
    card.dataset.id = item.id;

    card.innerHTML = `
      <img class="photo" src="${item.photo_url || './media/notimg.svg'}" />
      <div class="stovb">
        <p>${escapeHtml(item.title || '')}</p>
        <p>${item.price ?? 0}<span class="currency-symbol">¤</span></p>
      </div>
      <button class="delete-btn"><img src="./media/trash_of.svg" /></button>
    `;

    let pressTimer = null;
    let isLongPress = false;

    const startPress = () => {
      isLongPress = false;
      pressTimer = setTimeout(() => {
        isLongPress = true;
        openModalForEdit(item);
      }, 500);
    };
    const cancelPress = () => clearTimeout(pressTimer);

    card.addEventListener('mousedown', startPress);
    card.addEventListener('touchstart', startPress);
    card.addEventListener('mouseup', cancelPress);
    card.addEventListener('mouseleave', cancelPress);
    card.addEventListener('touchend', cancelPress);
    card.addEventListener('touchmove', cancelPress);

    card.addEventListener('click', (e) => {
      if (e.target.closest('.delete-btn')) return;
      if (isLongPress) return;
      if (item.link) {
        if (tg) tg.openLink(item.link);
        else window.open(item.link, '_blank');
      }
    });

    card.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteItem(item.id);
    });

    return card;
  }

  function createGroupBlock(name, groupItemsArr, total) {
    const block = document.createElement('div');
    block.className = 'group-block';

    const header = document.createElement('div');
    header.className = 'group-header';
    header.innerHTML = `
      <span class="group-name">${escapeHtml(name)}</span>
      <span class="group-total">${total}<span class="currency-symbol">¤</span></span>
    `;
    block.appendChild(header);

    groupItemsArr.forEach((item) => {
      block.appendChild(createCardElement(item));
    });

    return block;
  }

  // ===== Основной рендер списка =====
  function renderList() {
    const mode = sortSelect.value;       // сортировка: a1 / high / medium / low / low2
    const view = viewModeSelect.value;   // вид: all / groupsOnly / individualOnly
    const range = getPriceRange();
    listEl.innerHTML = '';

    const { groups, ungrouped } = groupItems(items);
    let shownSum = 0;
    let shownCount = 0;

    const appendGroup = (name, groupArr) => {
      const total = sumPrices(groupArr);
      listEl.appendChild(createGroupBlock(name, groupArr, total));
      shownSum += total;
      shownCount += groupArr.length;
    };

    const appendStandalone = (arr) => {
      arr.forEach((it) => {
        listEl.appendChild(createCardElement(it));
        shownSum += Number(it.price) || 0;
        shownCount += 1;
      });
    };

    if (view === 'individualOnly') {
      // Только записи без группы, диапазон проверяется по каждой отдельно
      let list = ungrouped.filter((it) => inRange(Number(it.price) || 0, range));
      list = sortItemsByMode(list, mode);
      appendStandalone(list);

    } else if (view === 'groupsOnly') {
      // Только группы, диапазон проверяется по сумме всей группы
      let groupEntries = [...groups.entries()]
        .map(([name, arr]) => ({ name, items: arr, total: sumPrices(arr) }))
        .filter((g) => inRange(g.total, range));
      groupEntries = sortGroupsByMode(groupEntries, mode);
      groupEntries.forEach((g) => appendGroup(g.name, g.items));

    } else {
      // "All": показываем и группы, и отдельные записи вместе,
      // диапазон цены проверяется по каждой записи индивидуально
      let groupEntries = [...groups.entries()]
        .map(([name, arr]) => ({
          name,
          items: arr.filter((it) => inRange(Number(it.price) || 0, range))
        }))
        .filter((g) => g.items.length > 0)
        .map((g) => ({ ...g, total: sumPrices(g.items) }));

      groupEntries = sortGroupsByMode(groupEntries, mode);

      let visibleUngrouped = ungrouped.filter((it) => inRange(Number(it.price) || 0, range));
      visibleUngrouped = sortItemsByMode(visibleUngrouped, mode);

      groupEntries.forEach((g) => appendGroup(g.name, sortItemsByMode(g.items, mode)));
      appendStandalone(visibleUngrouped);
    }

    sumValueEl.textContent = shownSum.toLocaleString('ru-RU');
    if (itemCountEl) itemCountEl.textContent = `${shownCount}/${items.length}`;

    populateGroupOptions();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== Создание / редактирование записи =====
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = editingId ? 'Saving...' : 'Adding...';

    try {
      const title = titleInput.value.trim();
      const price = Number(numberInput.value) || 0;
      const link = linkInput.value.trim();
      const groupName = groupInput.value.trim() || null;

      if (!title) {
        alert('Введите описание');
        return;
      }

      if (editingId) {
        let photoUrl = editingPhotoUrl;
        if (photoChanged) {
          const blob = await getCroppedBlob();
          if (blob) photoUrl = await uploadPhoto(blob, editingId);
        }
        const { error } = await sb
          .from(TABLE)
          .update({ title, price, link, photo_url: photoUrl, group_name: groupName })
          .eq('id', editingId)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { data, error } = await sb
          .from(TABLE)
          .insert([{ user_id: userId, title, price, link, photo_url: null, group_name: groupName }])
          .select();
        if (error) throw error;

        const newItem = data[0];
        if (photoChanged) {
          const blob = await getCroppedBlob();
          if (blob) {
            const photoUrl = await uploadPhoto(blob, newItem.id);
            await sb.from(TABLE).update({ photo_url: photoUrl }).eq('id', newItem.id);
          }
        }
      }

      closeModal();
      await loadItems();
    } catch (err) {
      console.error(err);
      alert('Что-то пошло не так. Попробуйте ещё раз.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editingId ? 'Save' : 'Add';
    }
  });

  // ===== Удаление записи =====
  async function deleteItem(id) {
    if (!confirm('Удалить этот элемент?')) return;
    const { error } = await sb.from(TABLE).delete().eq('id', id).eq('user_id', userId);
    if (error) {
      console.error(error);
      alert('Не удалось удалить');
      return;
    }
    await loadItems();
  }

  // ===== Старт =====
  loadItems();
});