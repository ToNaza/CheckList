document.addEventListener('DOMContentLoaded', () => {
  // ===== Конфигурация Supabase =====
  const SUPABASE_URL = 'https://uwuqsvlvptldeaesabif.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXFzdmx2cHRsZGVhZXNhYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNzc0MTUsImV4cCI6MjEwNTY1MzQxNX0.FJPswfe83L57YprUJkSSeyi4u0RMvEXkhnCl9X76RWg';
  const TABLE = 'wishlist_items';
  const BUCKET = 'wishlist-photos';

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
    // fallback для тестирования вне Telegram (в обычном браузере)
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

  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const uploadPlaceholder = document.getElementById('uploadPlaceholder');
  const cropperContainer = document.getElementById('cropperContainer');
  const cropImage = document.getElementById('cropImage');
  const resetCropBtn = document.getElementById('resetCropBtn');
  const existingPhotoPreview = document.getElementById('existingPhotoPreview');

  const listEl = document.querySelector('.list');
  const sumValueEl = document.getElementById('sumValue');
  const sortSelect = document.getElementById('searchPriority');

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
    charCounter.classList.toggle('text-red-400', len >= 50);
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

  // ===== Загрузка фото в Storage =====
  async function uploadPhoto(blob, itemId) {
    const path = `${userId}/${itemId}.jpg`;
    const { error: uploadError } = await sb.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) throw uploadError;

    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
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

  // ===== Сортировка =====
  function getSortedItems() {
    const mode = sortSelect.value;
    const arr = [...items];
    switch (mode) {
      case 'high': // A-Я
        arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'));
        break;
      case 'medium': // Я-А
        arr.sort((a, b) => (b.title || '').localeCompare(a.title || '', 'ru'));
        break;
      case 'low': // дешёвые сначала
        arr.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'low2': // дорогие сначала
        arr.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      default:
        break; // без изменений — по дате добавления
    }
    return arr;
  }

  sortSelect.addEventListener('change', renderList);

  // ===== Рендер списка карточек =====
  function renderList() {
    const sorted = getSortedItems();
    listEl.innerHTML = '';

    sorted.forEach((item) => {
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

      // Обычный тап открывает ссылку, долгое удержание — редактирование
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

      listEl.appendChild(card);
    });

    updateSum();
  }

  function updateSum() {
    const sum = items.reduce((acc, it) => acc + (Number(it.price) || 0), 0);
    sumValueEl.textContent = sum.toLocaleString('ru-RU');
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

      if (!title) {
        alert('Введите описание');
        return;
      }

      if (editingId) {
        // === Редактирование существующей записи ===
        let photoUrl = editingPhotoUrl;
        if (photoChanged) {
          const blob = await getCroppedBlob();
          if (blob) photoUrl = await uploadPhoto(blob, editingId);
        }
        const { error } = await sb
          .from(TABLE)
          .update({ title, price, link, photo_url: photoUrl })
          .eq('id', editingId)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        // === Создание новой записи ===
        const { data, error } = await sb
          .from(TABLE)
          .insert([{ user_id: userId, title, price, link, photo_url: null }])
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