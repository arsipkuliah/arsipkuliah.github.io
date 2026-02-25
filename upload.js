/**
 * ARSIP KULIAH - UPLOAD LOGIC
 * Menangani upload file ke Google Apps Script (GAS)
 */

// GANTI URL INI DENGAN URL DEPLOYMENT WEB APP GOOGLE APPS SCRIPT ANDA
const GAS_ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbxsBNokPtKybCa5NQ7gTv2HokMNWtpj5_Rao2HxctdNI1Gny3UYmaUnXWGpum0M07UUig/exec'; 

document.addEventListener('DOMContentLoaded', () => {
    handleNavigation();
    window.addEventListener('hashchange', handleNavigation);
    
    setupForm();
});

// 1. Navigation Logic (Show/Hide Upload Page)
function handleNavigation() {
    const hash = window.location.hash;
    const mainLayout = document.querySelector('.main-layout');
    const uploadContainer = document.getElementById('upload-container');
    
    if (hash === '#upload') {
        if (mainLayout) mainLayout.style.display = 'none';
        if (uploadContainer) {
            uploadContainer.style.display = 'block';
            initCourseSelection(); // Isi dropdown saat halaman dibuka
        }
    } else {
        if (mainLayout) mainLayout.style.display = ''; // Restore default (grid/flex)
        if (uploadContainer) uploadContainer.style.display = 'none';
    }
}

// 2. Populate Dropdown Logic
function initCourseSelection() {
    const semesterSelect = document.getElementById('upload-semester');
    const courseSelect = document.getElementById('upload-course');
    
    if (!semesterSelect || !courseSelect) return;
    
    // Cek apakah coursesData (dari script.js) sudah tersedia
    if (typeof coursesData !== 'undefined' && coursesData.length > 0) {
        
        // Handler saat semester berubah
        semesterSelect.onchange = () => {
            const selectedSem = semesterSelect.value;
            populateCourses(selectedSem);
        };

        // Jika semester sudah terpilih (misal dari cache browser), isi langsung
        if (semesterSelect.value) {
            populateCourses(semesterSelect.value);
        }
    } else {
        // Jika data belum siap, coba lagi dalam 500ms
        setTimeout(initCourseSelection, 500);
    }
}

function populateCourses(semester) {
    const select = document.getElementById('upload-course');
    
    // Filter courses based on semester
    const filtered = coursesData.filter(c => c.semester == semester);
    const sorted = filtered.sort((a, b) => a.name.localeCompare(b.name));
    
    select.innerHTML = '<option value="" disabled selected>Pilih Mata Kuliah...</option>';
    
    if (sorted.length > 0) {
        select.disabled = false;
        sorted.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.name;
            opt.innerText = c.name;
            select.appendChild(opt);
        });
    } else {
        select.disabled = true;
        select.innerHTML = '<option value="" disabled selected>Tidak ada mata kuliah</option>';
    }
}

// 3. Form Handling
function setupForm() {
    const form = document.getElementById('upload-form');
    const fileInput = document.getElementById('upload-file');
    const dropArea = document.getElementById('drop-area');
    const preview = document.getElementById('file-preview');
    
    // Drag & Drop Visuals
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropArea.classList.add('dragover');
        }, false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropArea.classList.remove('dragover');
        }, false);
    });
    
    // File Selection
    dropArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        fileInput.files = files;
        updatePreview();
    });
    
    fileInput.addEventListener('change', updatePreview);
    
    function updatePreview() {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            preview.innerText = `Terpilih: ${file.name} (${(file.size/1024/1024).toFixed(2)} MB)`;
        } else {
            preview.innerText = '';
        }
    }

    // Submit Logic
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('btn-submit');
        const statusDiv = document.getElementById('upload-status');
        const file = fileInput.files[0];
        const course = document.getElementById('upload-course').value;

        if (!file || !course) {
            alert("Mohon lengkapi semua data.");
            return;
        }

        // UI Loading State
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Mengupload...';
        statusDiv.className = 'upload-status loading';
        statusDiv.innerText = 'Sedang memproses file, mohon tunggu...';

        // Convert File to Base64
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async function() {
            const base64Data = reader.result.split(',')[1]; // Remove "data:application/pdf;base64," prefix
            
            const payload = {
                course: course,
                filename: file.name,
                mimeType: file.type,
                size: file.size,
                file: base64Data
            };

            try {
                // Gunakan mode 'no-cors' jika endpoint tidak mengembalikan header CORS yang benar,
                // TAPI untuk mendapatkan response JSON, kita perlu setup GAS dengan benar.
                // Kita gunakan fetch standard.
                const response = await fetch(GAS_ENDPOINT_URL, {
                    method: 'POST',
                    redirect: 'follow',
                    headers: {
                        "Content-Type": "text/plain;charset=utf-8",
                    },
                    body: JSON.stringify(payload)
                });
                
                const result = await response.json();
                
                if (result.result === 'success') {
                    statusDiv.className = 'upload-status success';
                    statusDiv.innerHTML = `Berhasil! File telah diupload.<br><a href="${result.url}" target="_blank">Lihat File</a>`;
                    form.reset();
                    preview.innerText = '';
                    setTimeout(() => {
                        window.location.hash = ''; // Kembali ke home
                        window.location.reload(); // Reload untuk refresh data
                    }, 3000);
                } else {
                    throw new Error(result.error || 'Gagal upload');
                }
            } catch (error) {
                console.error(error);
                statusDiv.className = 'upload-status error';
                statusDiv.innerHTML = `Gagal upload: ${error.message}.<br><small>Cek koneksi atau izin Script (Harus "Anyone").</small>`;
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span class="btn-text">Upload Sekarang</span><i class="ph ph-paper-plane-right"></i>';
            }
        };
    });
}