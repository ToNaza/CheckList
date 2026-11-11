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
    // Без этого свайп вниз (в том числе при перетаскивании блока) сворачивает мини-апп
    try { tg.disableVerticalSwipes?.(); } catch (e) { /* старый клиент Telegram */ }
  }

  const haptic = (type = 'medium') => {
    try { tg?.HapticFeedback?.impactOccurred(type); } catch (e) { /* не критично */ }
  };

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
  const plusBtn = document.querySelector('.ostrov');
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
  const groupPicker = document.getElementById('groupPicker');

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
  const toastEl = document.getElementById('toast');

  // ===== Состояние =====
  let items = [];
  let cropper = null;
  let photoChanged = false;
  let editingId = null;
  let editingItem = null;
  let editingPhotoUrl = null;
  let editMode = false;
  let lastDragEnd = 0;
  let sortable = null;

  // ===== Всплывающая подсказка =====
  let toastTimer = null;
  function showToast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

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
    editingItem = null;
    editingPhotoUrl = null;
    addForm.reset();
    charCounter.textContent = '0 / 50';
    groupInput.value = '';
    closeGroupPicker();
    resetPhotoUI();
    modalTitle.textContent = 'Create a record';
    submitBtn.textContent = 'Add';
    modalOverlay.classList.remove('hidden');
  }

  function openModalForEdit(item) {
    editingId = item.id;
    editingItem = item;
    editingPhotoUrl = item.photo_url;
    titleInput.value = item.title || '';
    numberInput.value = item.price ?? '';
    linkInput.value = item.link || '';
    groupInput.value = item.group_name || '';
    charCounter.textContent = `${titleInput.value.length} / 50`;
    closeGroupPicker();
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
    closeGroupPicker();
    modalOverlay.classList.add('hidden');
  }

  // Модалка закрывается только крестиком — клик мимо окна больше ничего не закрывает
  closeModalBtn.addEventListener('click', closeModal);

  // ===== Кнопка «+»: тап — создать, удержание — режим редактирования =====
  const PLUS_HOLD_MS = 600;
  let plusTimer = null;
  let plusHoldFired = false;

  function setEditMode(on) {
    editMode = on;
    document.body.classList.toggle('edit-mode', on);
    showToast(on ? 'Edit mode ON: tap a block to edit it' : 'Edit mode OFF');
    haptic('medium');
  }

  plusBtn.addEventListener('pointerdown', () => {
    plusHoldFired = false;
    clearTimeout(plusTimer);
    plusTimer = setTimeout(() => {
      plusHoldFired = true;
      setEditMode(!editMode);
    }, PLUS_HOLD_MS);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => {
    plusBtn.addEventListener(ev, () => clearTimeout(plusTimer));
  });
  plusBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  plusBtn.addEventListener('click', () => {
    if (plusHoldFired) return; // это было удержание, а не тап
    openModalForCreate();
  });

  // ===== Счётчик символов =====
  titleInput.addEventListener('input', () => {
    const len = titleInput.value.length;
    charCounter.textContent = `${len} / 50`;
    charCounter.classList.toggle('limit-reached', len >= 50);
  });

  // ===== Поле группы: тап — вводить новую, удержание — выбрать из существующих =====
  const GROUP_HOLD_MS = 450;
  let groupTimer = null;
  let groupHoldFired = false;
  let groupPointerType = 'mouse';

  function getGroupNames() {
    const counts = new Map();
    items.forEach((it) => {
      const g = (it.group_name || '').trim();
      if (g) counts.set(g, (counts.get(g) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
  }

  function closeGroupPicker() {
    groupPicker.classList.add('hidden');
    groupPicker.innerHTML = '';
  }

  function openGroupPicker() {
    const current = groupInput.value.trim();
    groupPicker.innerHTML = '';

    const addOption = (label, value, count) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'group-option';
      if (current === value) btn.classList.add('active');

      const nameEl = document.createElement('span');
      nameEl.className = 'group-option-name';
      nameEl.textContent = label;
      btn.appendChild(nameEl);

      if (count) {
        const countEl = document.createElement('span');
        countEl.className = 'group-option-count';
        countEl.textContent = count;
        btn.appendChild(countEl);
      }

      btn.addEventListener('click', () => {
        groupInput.value = value;
        closeGroupPicker();
      });
      groupPicker.appendChild(btn);
    };

    addOption('— No group —', '', '');
    const names = getGroupNames();
    if (names.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'group-empty';
      empty.textContent = 'No groups yet — just type a name';
      groupPicker.appendChild(empty);
    } else {
      names.forEach(([name, count]) => addOption(name, name, String(count)));
    }

    groupPicker.classList.remove('hidden');
    groupPicker.scrollIntoView({ block: 'nearest' });
  }

  groupInput.addEventListener('pointerdown', (e) => {
    groupHoldFired = false;
    groupPointerType = e.pointerType || 'mouse';
    closeGroupPicker();
    clearTimeout(groupTimer);
    groupTimer = setTimeout(() => {
      groupHoldFired = true;
      groupInput.blur(); // не держим клавиатуру открытой, пока выбираем из списка
      openGroupPicker();
      haptic('light');
    }, GROUP_HOLD_MS);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => {
    groupInput.addEventListener(ev, () => clearTimeout(groupTimer));
  });
  // На телефоне долгое нажатие вызывает системное меню — подавляем его, на ПК правый клик не трогаем
  groupInput.addEventListener('contextmenu', (e) => {
    if (groupHoldFired || groupPointerType === 'touch') e.preventDefault();
  });
  // После удержания не даём телефону поставить курсор и поднять клавиатуру
  groupInput.addEventListener('touchend', (e) => {
    if (groupHoldFired) e.preventDefault();
  }, { passive: false });
  groupInput.addEventListener('focus', () => {
    if (groupHoldFired) groupInput.blur();
  });
  groupInput.addEventListener('input', closeGroupPicker);

  // Клик в любом другом месте закрывает список групп
  document.addEventListener('pointerdown', (e) => {
    if (groupPicker.classList.contains('hidden')) return;
    if (groupPicker.contains(e.target) || e.target === groupInput) return;
    closeGroupPicker();
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

  // ===== Группы и порядок =====
  // «Блок верхнего уровня» (unit) — это либо группа целиком, либо одиночная запись.
  // Именно такие блоки можно перетаскивать. Позиция блока хранится в sort_order:
  // у всех записей одной группы он одинаковый.
  const priceOf = (it) => Number(it.price) || 0;
  const orderOf = (it) => Number(it.sort_order) || 0;
  const createdMs = (it) => Date.parse(it.created_at) || 0;

  function sumPrices(arr) {
    return arr.reduce((acc, it) => acc + priceOf(it), 0);
  }

  function buildUnits(all) {
    const groups = new Map();
    const units = [];
    all.forEach((it) => {
      const g = (it.group_name || '').trim();
      if (!g) {
        units.push({ type: 'item', key: 'i:' + it.id, item: it, pos: orderOf(it), newest: createdMs(it) });
        return;
      }
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(it);
    });
    groups.forEach((arr, name) => {
      units.push({
        type: 'group',
        key: 'g:' + name,
        name,
        items: arr,
        pos: Math.min(...arr.map(orderOf)),
        newest: Math.max(...arr.map(createdMs))
      });
    });
    return units;
  }

  // Ручной порядок: по позиции, при равенстве сначала группы, затем новые
  function compareManual(a, b) {
    if (a.pos !== b.pos) return a.pos - b.pos;
    if (a.type !== b.type) return a.type === 'group' ? -1 : 1;
    return b.newest - a.newest;
  }

  function groupPosition(name, exceptId) {
    const members = items.filter((it) => (it.group_name || '').trim() === name && it.id !== exceptId);
    return members.length ? Math.min(...members.map(orderOf)) : null;
  }

  // Новая запись попадает наверх списка, а в существующую группу — на место этой группы
  function sortOrderForNew(groupName) {
    if (groupName) {
      const pos = groupPosition(groupName);
      if (pos !== null) return pos;
    }
    return items.length ? Math.min(...items.map(orderOf)) - 1 : 0;
  }

  // ===== Автосортировка (когда выбран не Base) =====
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
        copy.sort((a, b) => priceOf(a) - priceOf(b));
        break;
      case 'low2':
        copy.sort((a, b) => priceOf(b) - priceOf(a));
        break;
      default:
        break;
    }
    return copy;
  }

  const unitTitle = (u) => (u.type === 'group' ? u.name : (u.item.title || ''));
  const unitPrice = (u) => (u.type === 'group' ? u.total : priceOf(u.item));

  const unitComparators = {
    high: (a, b) => unitTitle(a).localeCompare(unitTitle(b), 'ru'),
    medium: (a, b) => unitTitle(b).localeCompare(unitTitle(a), 'ru'),
    low: (a, b) => unitPrice(a) - unitPrice(b),
    low2: (a, b) => unitPrice(b) - unitPrice(a)
  };

  // ===== Рендер карточки/группы =====
  function createCardElement(item) {
    const card = document.createElement('div');
    card.className = 'block_r';
    card.dataset.id = item.id;

    card.innerHTML = `
      <img class="photo" src="${item.photo_url || './media/notimg.svg'}" draggable="false" />
      <div class="stovb">
        <p>${escapeHtml(item.title || '')}</p>
        <p>${item.price ?? 0}<span class="currency-symbol">¤</span></p>
      </div>
      <button class="delete-btn"><img src="./media/trash_of.svg" draggable="false" /></button>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.delete-btn')) return;
      if (Date.now() - lastDragEnd < 400) return; // клик сразу после перетаскивания игнорируем
      if (editMode) {
        openModalForEdit(item);
        return;
      }
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
    const mode = sortSelect.value;       // a1 (Base, ручной порядок) / high / medium / low / low2
    const view = viewModeSelect.value;   // all / groupsOnly / individualOnly
    const range = getPriceRange();
    const scrollTop = listEl.scrollTop;
    listEl.innerHTML = '';

    // 1. Что показываем (фильтр по виду и цене)
    let visible = [];
    buildUnits(items).sort(compareManual).forEach((u) => {
      if (u.type === 'group') {
        if (view === 'individualOnly') return;
        if (view === 'groupsOnly') {
          // только группы: цена проверяется по сумме всей группы
          const total = sumPrices(u.items);
          if (!inRange(total, range)) return;
          visible.push({ ...u, shown: u.items, total });
        } else {
          // все: цена проверяется по каждой записи отдельно
          const shown = u.items.filter((it) => inRange(priceOf(it), range));
          if (shown.length === 0) return;
          visible.push({ ...u, shown, total: sumPrices(shown) });
        }
      } else {
        if (view === 'groupsOnly') return;
        if (!inRange(priceOf(u.item), range)) return;
        visible.push(u);
      }
    });

    // 2. В каком порядке: Base = ручной (перетаскиванием), остальное — автосортировка
    const manual = mode === 'a1';
    const cmp = unitComparators[mode];
    if (cmp) {
      const groupsPart = visible.filter((u) => u.type === 'group').sort(cmp);
      const itemsPart = visible.filter((u) => u.type === 'item').sort(cmp);
      visible = [...groupsPart, ...itemsPart];
    }

    // 3. Рисуем
    let shownSum = 0;
    let shownCount = 0;
    visible.forEach((u) => {
      let el;
      if (u.type === 'group') {
        el = createGroupBlock(u.name, sortItemsByMode(u.shown, mode), u.total);
        shownSum += u.total;
        shownCount += u.shown.length;
      } else {
        el = createCardElement(u.item);
        shownSum += priceOf(u.item);
        shownCount += 1;
      }
      el.dataset.unit = u.key;
      el.classList.add('sortable-unit');
      listEl.appendChild(el);
    });

    listEl.scrollTop = scrollTop;
    sumValueEl.textContent = shownSum.toLocaleString('ru-RU');
    if (itemCountEl) itemCountEl.textContent = `${shownCount}/${items.length}`;

    // Перетаскивание имеет смысл только в ручном порядке
    if (sortable) sortable.option('disabled', !manual);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== Перетаскивание блоков =====
  function initSortable() {
    if (!window.Sortable) {
      console.warn('SortableJS не загрузился — перетаскивание отключено');
      return;
    }
    sortable = new Sortable(listEl, {
      draggable: '.sortable-unit',     // только блоки верхнего уровня; карточка в группе тянет всю группу
      filter: '.delete-btn',           // кнопка удаления не начинает перетаскивание
      preventOnFilter: false,
      animation: 150,
      forceFallback: true,             // один и тот же механизм на телефоне и на ПК
      fallbackTolerance: 5,            // мелкая дрожь мыши — это клик, а не перетаскивание
      delay: 250,                      // на телефоне сначала удержание, чтобы список можно было скроллить
      delayOnTouchOnly: true,
      touchStartThreshold: 8,
      ghostClass: 'drag-ghost',
      chosenClass: 'drag-chosen',
      onEnd: onSortEnd
    });
  }

  async function onSortEnd(evt) {
    lastDragEnd = Date.now();
    if (evt.oldIndex === evt.newIndex) return;
    const visibleKeys = [...listEl.children].map((el) => el.dataset.unit).filter(Boolean);
    await saveOrder(visibleKeys);
  }

  // Новый порядок видимых блоков занимает те же «места», что они занимали в полном списке,
  // поэтому скрытые фильтром блоки остаются на своих местах.
  async function saveOrder(visibleKeys) {
    const units = buildUnits(items).sort(compareManual);
    const byKey = new Map(units.map((u) => [u.key, u]));
    const visibleSet = new Set(visibleKeys);

    let vi = 0;
    const newKeys = units.map((u) => (visibleSet.has(u.key) ? visibleKeys[vi++] : u.key));
    if (newKeys.some((k) => !byKey.has(k))) {
      await loadItems(); // список на экране разошёлся с данными — перерисовываем
      return;
    }

    const changed = [];
    newKeys.forEach((key, index) => {
      const u = byKey.get(key);
      const members = u.type === 'group' ? u.items : [u.item];
      members.forEach((it) => {
        if (orderOf(it) !== index) {
          it.sort_order = index;
          changed.push({ ...it });
        }
      });
    });
    if (changed.length === 0) return;

    const { error } = await sb.from(TABLE).upsert(changed, { onConflict: 'id' });
    if (error) {
      console.error(error);
      alert('Не удалось сохранить порядок');
      await loadItems();
    }
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
        const payload = { title, price, link, photo_url: photoUrl, group_name: groupName };

        // Если запись переехала в уже существующую группу — встаёт на место этой группы
        const oldGroup = (editingItem?.group_name || '').trim() || null;
        if (groupName && groupName !== oldGroup) {
          const pos = groupPosition(groupName, editingId);
          if (pos !== null) payload.sort_order = pos;
        }

        const { error } = await sb
          .from(TABLE)
          .update(payload)
          .eq('id', editingId)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { data, error } = await sb
          .from(TABLE)
          .insert([{
            user_id: userId,
            title,
            price,
            link,
            photo_url: null,
            group_name: groupName,
            sort_order: sortOrderForNew(groupName)
          }])
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

  // ===== Панель фильтров =====
  const filterBtn = document.getElementById('filterBtn');
  const filterPanel = document.getElementById('filterPanel');

  filterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    filterPanel.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!filterPanel.contains(e.target) && e.target !== filterBtn) {
      filterPanel.classList.add('hidden');
    }
  });

  // ===== Старт =====
  initSortable();
  loadItems();
});