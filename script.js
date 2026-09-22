document.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById('open');
  const modalOverlay = document.getElementById('modalOverlay');
  const closeModalBtn = document.getElementById('closeModalBtn');
  
  const titleInput = document.getElementById('titleInput');
  const charCounter = document.getElementById('charCounter');
  
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const uploadPlaceholder = document.getElementById('uploadPlaceholder');
  const cropperContainer = document.getElementById('cropperContainer');
  const cropImage = document.getElementById('cropImage');
  const resetCropBtn = document.getElementById('resetCropBtn');

  let cropper = null;

  // Открытие модального окна по клику на #open
  openBtn.addEventListener('click', () => {
    modalOverlay.classList.remove('hidden');
  });

  // Закрытие окна
  const closeModal = () => {
    modalOverlay.classList.add('hidden');
  };

  closeModalBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Счетчик символов для названия
  titleInput.addEventListener('input', () => {
    const currentLength = titleInput.value.length;
    charCounter.textContent = `${currentLength} / 50`;
    if (currentLength >= 50) {
      charCounter.classList.add('text-red-400');
    } else {
      charCounter.classList.remove('text-red-400');
    }
  });

  // Логика выбора и обрезки фото
  dropZone.addEventListener('click', (e) => {
    if (e.target !== resetCropBtn && !cropperContainer.contains(e.target)) {
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        cropImage.src = event.target.result;
        uploadPlaceholder.classList.add('hidden');
        cropperContainer.classList.remove('hidden');

        if (cropper) cropper.destroy();

        // Инициализация Cropper 1:1
        cropper = new Cropper(cropImage, {
          aspectRatio: 1,
          viewMode: 1,
          autoCropArea: 1,
          responsive: true
        });
      };
      reader.readAsDataURL(file);
    }
  });

  // Сброс загруженного фото
  resetCropBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (cropper) cropper.destroy();
    cropper = null;
    fileInput.value = '';
    cropImage.src = '';
    cropperContainer.classList.add('hidden');
    uploadPlaceholder.classList.remove('hidden');
  });
});