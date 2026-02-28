/**
 * F.AGRIELLA - LOGIC
 * 
 * Sistem ini sekarang menggunakan Google Sheets sebagai database backend.
 * Data diambil dalam format CSV melalui URL publik Google Sheets.
 */

// --- KONFIGURASI GOOGLE SHEETS ---
// Ganti URL di bawah ini dengan Link CSV dari Google Sheet Anda (File > Share > Publish to Web > CSV)
const COURSES_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTEAg3iZc-gW93aYLpM8qqdDXtIL4vg4wdWykWo62bdRFuUzRWEMbmxnzOQXqVKCjPhUTyMCyrSRDDy/pub?gid=188724190&single=true&output=csv';
const MATERIALS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTEAg3iZc-gW93aYLpM8qqdDXtIL4vg4wdWykWo62bdRFuUzRWEMbmxnzOQXqVKCjPhUTyMCyrSRDDy/pub?gid=1308771559&single=true&output=csv';
const ASSIGNMENTS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTEAg3iZc-gW93aYLpM8qqdDXtIL4vg4wdWykWo62bdRFuUzRWEMbmxnzOQXqVKCjPhUTyMCyrSRDDy/pub?gid=1992582246&single=true&output=csv';
const ARSIP_FOTO_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTEAg3iZc-gW93aYLpM8qqdDXtIL4vg4wdWykWo62bdRFuUzRWEMbmxnzOQXqVKCjPhUTyMCyrSRDDy/pub?gid=0&single=true&output=csv'; // Ganti gid arsip foto nantinya

// State Data
let coursesData = [];
let materialsData = [];
let assignmentsData = [];
let arsipFotoData = [];
let activeCourse = null; // Menyimpan data course yang sedang dibuka

// Load bookmarks & migrasi data lama jika perlu (dari string ke object)
let bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
if (bookmarks.length > 0 && typeof bookmarks[0] === 'string') {
    bookmarks = []; // Reset jika format lama (string nama MK) terdeteksi
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
}

// --- LOGIC UTAMA ---

document.addEventListener('DOMContentLoaded', () => {
    initCookieConsent();
    initTheme();
    setupEventListeners();
    initData(); // Mulai fetch data

    // Periksa status tombol Upload saat load
    if (localStorage.getItem('pj_token')) {
        document.getElementById('menu-upload').style.display = 'block';
    }
});

function initCookieConsent() {
    const banner = document.getElementById('cookie-consent-banner');
    const acceptAllBtn = document.getElementById('accept-cookie-btn');
    const manageBtn = document.getElementById('manage-cookies-btn');
    const settingsModal = document.getElementById('cookie-settings-modal');
    const savePrefsBtn = document.getElementById('save-cookie-prefs-btn');
    const closeSettingsBtn = document.getElementById('close-cookie-settings-modal');
    const personalizationToggle = document.getElementById('consent-personalization-toggle');

    if (!banner) return;

    const showBanner = () => {
        if (localStorage.getItem('cookieConsent') !== 'true') {
            banner.classList.add('show');
        }
    };

    const hideBanner = () => banner.classList.remove('show');

    const openSettingsModal = () => {
        // Set toggle state based on current preference
        personalizationToggle.checked = localStorage.getItem('consent_personalization') === 'true';
        settingsModal.classList.add('active');
    };

    const closeSettingsModal = () => settingsModal.classList.remove('active');

    const acceptAll = () => {
        localStorage.setItem('cookieConsent', 'true');
        localStorage.setItem('consent_personalization', 'true');
        hideBanner();
    };

    const savePreferences = () => {
        localStorage.setItem('cookieConsent', 'true');
        localStorage.setItem('consent_personalization', personalizationToggle.checked);

        // Cek input Token PJ
        const tokenInput = document.getElementById('token-input');
        const statusEl = document.getElementById('token-status');
        let shouldDelayClose = false;

        if (tokenInput) {
            const inputVal = tokenInput.value.trim();
            if (inputVal.length > 0 && inputVal.length < 3) {
                if (statusEl) {
                    statusEl.innerText = '⚠️ Nama Token terlalu pendek.';
                    statusEl.style.color = 'var(--accent-color)';
                }
                return; // Stop & jangan tutup modal jika error panjang nama
            } else if (inputVal.length >= 3) {
                // Validasi input dengan daftar PIC dari Google Sheets
                let isValidToken = false;
                if (coursesData && coursesData.length > 0) {
                    for (const course of coursesData) {
                        if (course.pic) {
                            const pics = course.pic.split(',').map(p => p.trim().toLowerCase());
                            if (pics.includes(inputVal.toLowerCase())) {
                                isValidToken = true;
                                break;
                            }
                        }
                    }
                }

                // Jika pengecekan gagal, beri status tertolak (opsi bypass: admin)
                if (!isValidToken && inputVal.toLowerCase() !== 'admin') {
                    if (statusEl) {
                        statusEl.innerText = '❌ Token Akses ditolak atau tidak terdaftar.';
                        statusEl.style.color = 'var(--accent-color)';
                    }
                    return; // Stop & jangan tutup modal
                }

                localStorage.setItem('pj_token', inputVal);
                const menuUpload = document.getElementById('menu-upload');
                if (menuUpload) menuUpload.style.display = 'block';
                if (statusEl) {
                    statusEl.innerText = '✅ Otorisasi berhasil disetujui.';
                    statusEl.style.color = 'green';
                }
                shouldDelayClose = true;
            } else if (inputVal === '') {
                // Hapus token jika input dikosongkan
                localStorage.removeItem('pj_token');
                const menuUpload = document.getElementById('menu-upload');
                if (menuUpload) menuUpload.style.display = 'none';
            }
        }

        const finalizeClose = () => {
            hideBanner();
            closeSettingsModal();
            if (statusEl) statusEl.innerText = '';

            // Jika pengguna menonaktifkan personalisasi, hapus data yang ada
            if (!personalizationToggle.checked) {
                localStorage.removeItem('theme');
                localStorage.removeItem('bookmarks');
                localStorage.removeItem('pj_token'); // Juga reset token jika tidak valid
                window.location.reload();
            } else {
                // Jika dari hash #token, arahkan ke upload jika token valid
                if (window.location.hash === '#token' && localStorage.getItem('pj_token')) {
                    window.location.hash = 'upload';
                }
            }
        };

        if (shouldDelayClose) {
            setTimeout(finalizeClose, 1000); // Beri jeda 1 detik untuk melihat centang hijau
        } else {
            finalizeClose();
        }
    };

    // Event Listeners
    acceptAllBtn.addEventListener('click', acceptAll);
    manageBtn.addEventListener('click', openSettingsModal);
    savePrefsBtn.addEventListener('click', savePreferences);
    closeSettingsBtn.addEventListener('click', closeSettingsModal);
    setTimeout(() => {
        showBanner();
    }, 1500);
}


// 1. Theme Handling
function initTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    const icon = toggleBtn.querySelector('i');

    // Atur ikon awal berdasarkan tema yang sudah diterapkan oleh skrip inline di <head>
    if (document.documentElement.getAttribute('data-theme') === 'dark') {
        icon.classList.replace('ph-moon', 'ph-sun');
    }

    toggleBtn.addEventListener('click', () => {
        // Gunakan documentElement (<html>) untuk konsistensi dengan skrip inline
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            if (localStorage.getItem('consent_personalization') === 'true') {
                localStorage.setItem('theme', 'light');
            }
            icon.classList.replace('ph-sun', 'ph-moon');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            if (localStorage.getItem('consent_personalization') === 'true') {
                localStorage.setItem('theme', 'dark');
            }
            icon.classList.replace('ph-moon', 'ph-sun');
        }
    });
}

// 2. Data Fetching & Parsing
async function initData() {
    const dashboardStats = document.getElementById('total-courses');
    if (dashboardStats) dashboardStats.innerText = '...';

    // Tentukan semester dari URL/localStorage SEBELUM fetch data, agar UI tidak "flash"
    let savedSemester;
    if (window.location.hash) {
        const hash = window.location.hash.substring(1); // Remove '#'
        if (hash.startsWith('semester')) {
            savedSemester = hash.replace('semester', '');
        }
    }
    if (!savedSemester) {
        if (localStorage.getItem('consent_personalization') === 'true') {
            savedSemester = localStorage.getItem('semester') || '1';
        } else {
            savedSemester = '1';
        }
    }

    const semesterSelect = document.getElementById('semester-filter');
    if (semesterSelect) {
        semesterSelect.value = savedSemester;
    }

    try {
        // Fetch semua data secara paralel
        const [coursesRes, materialsRes, assignmentsRes, arsipFotoRes] = await Promise.all([
            fetch(COURSES_SHEET_URL).then(r => r.ok ? r.text() : '').catch(() => ''),
            fetch(MATERIALS_SHEET_URL).then(r => r.ok ? r.text() : '').catch(() => ''),
            fetch(ASSIGNMENTS_SHEET_URL).then(r => r.ok ? r.text() : '').catch(() => ''),
            fetch(ARSIP_FOTO_SHEET_URL).then(r => r.ok ? r.text() : '').catch(() => '')
        ]);

        coursesData = parseCSV(coursesRes);
        materialsData = parseCSV(materialsRes);
        assignmentsData = parseCSV(assignmentsRes);
        arsipFotoData = parseCSV(arsipFotoRes);

        // Render UI setelah data siap
        loadDashboard(savedSemester);
        loadAssignments(savedSemester);
        renderBookmarks(savedSemester); // Tampilkan bookmark tersimpan sesuai semester
        loadCourses(savedSemester);

        // Panggil routing hash setelah semua data dipastikan termuat
        checkHashRoute();

    } catch (error) {
        console.error("Gagal memuat data:", error);
        // Fallback jika fetch gagal (opsional: tampilkan pesan error di UI)
        document.getElementById('course-grid').innerHTML = '<p style="color:red; text-align:center; grid-column:1/-1;">Gagal memuat data dari Google Sheets. Periksa koneksi atau URL.</p>';
    } finally {
        // Sembunyikan loading overlay setelah selesai (sukses/gagal)
        const loader = document.getElementById('loading-overlay');
        if (loader) loader.classList.add('hidden');
    }
}

function parseCSV(csvText) {
    if (!csvText || csvText.trim() === '') return [];
    if (csvText.trim().toLowerCase().startsWith('<')) return []; // Handle HTML response gracefully

    // Parser CSV yang lebih kuat untuk menangani baris baru di dalam sel (multiline)
    const rows = [];
    let currentRow = [];
    let currentVal = '';
    let inQuote = false;

    // Normalisasi baris baru (\r\n -> \n)
    csvText = csvText.replace(/\r\n/g, '\n');

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];

        if (char === '"') {
            if (inQuote && nextChar === '"') { // Handle escaped quote ""
                currentVal += '"';
                i++;
            } else {
                inQuote = !inQuote;
            }
        } else if (char === ',' && !inQuote) {
            currentRow.push(currentVal);
            currentVal = '';
        } else if (char === '\n' && !inQuote) {
            currentRow.push(currentVal);
            rows.push(currentRow);
            currentRow = [];
            currentVal = '';
        } else {
            currentVal += char;
        }
    }
    if (currentRow.length > 0 || currentVal) {
        currentRow.push(currentVal);
        rows.push(currentRow);
    }

    if (rows.length === 0) return [];

    const headers = rows[0].map(h => h.trim().replace(/^"|"$/g, ''));
    return rows.slice(1).filter(row => row.length === headers.length).map(values => {
        const row = {};
        headers.forEach((header, index) => {
            // Hapus kutip di awal/akhir dari setiap nilai dan trim spasi
            row[header] = (values[index] || '').trim().replace(/^"|"$/g, '');
        });
        return row;
    });
}

// 3. Assignment Logic (Group by Date)
function loadAssignments(semesterFilter) {
    const listContainer = document.getElementById('assignment-list');
    listContainer.innerHTML = '';

    // --- Filter Tugas Aktif (Deadline belum lewat) ---
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set ke awal hari untuk perbandingan tanggal

    const formatDate = (d) => {
        const dateObj = parseDateStr(d);
        if (!dateObj) return d;
        return dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    // Filter Course berdasarkan Semester
    const validCourses = (!semesterFilter || semesterFilter === 'all')
        ? coursesData.map(c => c.name)
        : coursesData.filter(c => c.semester == semesterFilter).map(c => c.name);

    const activeAssignments = assignmentsData.filter(task => {
        // Cek apakah mata kuliah ada di semester ini
        if (!validCourses.includes(task.course)) return false;

        const deadlineDate = parseDateStr(task.deadline);
        const createdDate = parseDateStr(task.date);

        if (deadlineDate) {
            // Jika ada deadline, harus hari ini atau masa depan
            return deadlineDate.getTime() >= today.getTime();
        }

        // Jika tidak ada deadline, cek umur tugas (maks 30 hari)
        if (createdDate) {
            const age = (today - createdDate) / (1000 * 60 * 60 * 24);
            return age <= 30;
        }

        return false;
    });

    // --- Group active assignments by course ---
    const groupedByCourse = {};
    activeAssignments.forEach(task => {
        const courseName = (task.course || 'Tanpa Nama').trim();
        if (!groupedByCourse[courseName]) {
            groupedByCourse[courseName] = {
                course: courseName,
                tasks: [],
                deadlines: []
            };
        }
        groupedByCourse[courseName].tasks.push(task);
        if (task.deadline) {
            groupedByCourse[courseName].deadlines.push(task.deadline);
        }
    });

    // Convert to array and sort by the nearest deadline within each group
    const sortedGroups = Object.values(groupedByCourse).sort((a, b) => {
        const earliestA = Math.min(...a.tasks.map(t => (parseDateStr(t.deadline) || Infinity)));
        const earliestB = Math.min(...b.tasks.map(t => (parseDateStr(t.deadline) || Infinity)));
        return earliestA - earliestB;
    });

    if (activeAssignments.length === 0) {
        listContainer.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-secondary);">Tidak ada tugas aktif</div>';
        document.getElementById('total-assignments').innerText = '0';
        return;
    }

    // Render Top 5 Course Groups
    listContainer.innerHTML = sortedGroups.slice(0, 5).map(group => {
        // Prepare data for modal
        const modalData = {
            date: group.tasks[0]?.date, // Use date from the first task in the group
            tasks: group.tasks
        };
        const encodedData = encodeURIComponent(JSON.stringify(modalData));

        // Format dan Dedup Deadline
        const uniqueDeadlines = [...new Set(group.deadlines)];
        const sortedDeadlines = uniqueDeadlines.sort((a, b) => {
            return (parseDateStr(a) || 0) - (parseDateStr(b) || 0);
        });

        const deadlineText = sortedDeadlines.length > 0
            ? `Deadline: ${sortedDeadlines.map(d => formatDate(d)).join(', ')}`
            : 'Klik untuk detail';

        return `
        <a href="#" class="assignment-item" onclick="openAssignmentModal('${encodedData}'); return false;">
            <i class="ph ph-file-text assignment-icon"></i>
            <div style="flex: 1;">
                <div style="font-weight:600; line-height: 1.2;">${group.course} (${group.tasks.length} tugas)</div>
                <div style="font-size:0.75rem; color:var(--text-secondary); margin-top: 2px;">${deadlineText}</div>
            </div>
        </a>
        `;
    }).join('');

    document.getElementById('total-assignments').innerText = activeAssignments.length;
}

function openAssignmentModal(encodedData) {
    try {
        const data = JSON.parse(decodeURIComponent(encodedData));

        // Isi Data ke Modal
        document.getElementById('assign-modal-date').innerText = data.date || '-';

        const listContainer = document.getElementById('assign-modal-list');

        // Helper Format Tanggal untuk Tampilan
        const formatDate = (d) => {
            if (!d) return '-';
            const parts = d.trim().replace(/\//g, '-').split('-');
            if (parts.length !== 3) return d;

            let [p1, p2, p3] = parts.map(n => parseInt(n, 10));
            let dateObj;

            // Cek format YYYY-MM-DD
            if (p1 > 31) {
                dateObj = new Date(p1, p2 - 1, p3);
            } else {
                // Asumsi DD-MM-YYYY
                if (p3 < 100) p3 += 2000;
                dateObj = new Date(p3, p2 - 1, p1);
            }

            if (isNaN(dateObj.getTime())) return d;
            return dateObj.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        };

        if (data.tasks && data.tasks.length > 0) {
            listContainer.innerHTML = data.tasks.map(t => `
                <div class="file-item" style="display:block; margin-bottom:1rem;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; align-items: flex-start;">
                        <strong style="color:var(--brand-color); font-size:1.1rem;">${t.course}</strong>
                        <span class="badge" style="background:var(--danger); color:white; padding: 0.25rem 0.75rem; border-radius: 50px; font-size: 0.8rem;">Deadline: ${formatDate(t.deadline)}</span>
                    </div>
                    <div style="font-size:0.9rem; margin-bottom:0.5rem;"><strong>Dosen:</strong> ${t.lecturer}</div>
                    <div style="background:var(--bg-color); padding:0.8rem; border-radius:6px; font-size:0.95rem;">${t.description}</div>
                    ${t.note ? `
                    <div style="margin-top: 0.75rem; padding: 0.5rem 0.8rem; background: rgba(230, 126, 34, 0.1); border-radius: 6px; font-size: 0.85rem;">
                        <strong><i class="ph ph-note"></i> Catatan:</strong> ${t.note}
                    </div>
                    ` : ''}
                    
                    <div style="margin-top: 0.5rem; text-align: right;">
                        <button onclick="toggleBookmark('${generateId(t)}', 'tugas', '${t.course} - ${t.description.substring(0, 20)}...', 'Deadline: ${t.deadline}', null, 'tugas', event)" class="list-bookmark-btn" title="Simpan Tugas" style="display: inline-flex; align-items: center; gap: 0.5rem;">
                            <i class="ph ${isBookmarked(generateId(t)) ? 'ph-star-fill' : 'ph-star'}" 
                               style="color: ${isBookmarked(generateId(t)) ? 'var(--accent-color)' : 'var(--text-secondary)'}; font-size: 1.2rem;"></i>
                            <span style="font-size: 0.9rem; color: var(--text-secondary);">Simpan Tugas</span>
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            listContainer.innerHTML = '<p>Tidak ada daftar tugas.</p>';
        }

        document.getElementById('assignment-modal').classList.add('active');
    } catch (e) {
        alert("Gagal memuat tugas: " + e.message);
    }
}

// Helper ID Generator
function generateId(obj) {
    // Buat ID unik menggunakan fungsi hash sederhana pada representasi string dari objek.
    // Metode btoa(string).substring() sebelumnya sangat rentan terhadap kolisi (ID yang sama untuk item berbeda),
    // yang menyebabkan bug pada fitur bookmark.
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32bit integer
    }
    return 'id' + Math.abs(hash); // Gunakan Math.abs untuk menghindari ID negatif dan memastikan konsistensi
}

// 4. Course Logic
function loadCourses(semesterFilter) {
    const grid = document.getElementById('course-grid');
    grid.innerHTML = ''; // Clear

    // Filter Data
    const filtered = semesterFilter === 'all'
        ? coursesData
        : coursesData.filter(c => c.semester == semesterFilter);

    // Render Cards
    filtered.forEach(course => {
        // Hitung jumlah file untuk course ini dari materialsData
        const fileCount = materialsData.filter(m => m.course === course.name).length;

        const card = document.createElement('div');
        card.className = 'course-card';
        card.innerHTML = `
            <span class="course-tag">Sem ${course.semester}</span>
            <div class="course-icon">
                <i class="ph ph-book-bookmark" style="font-size: 2rem; color: var(--accent-color);"></i>
            </div>
            <h4 class="course-title">${course.name}</h4>
            <div class="course-dosen">
                <i class="ph ph-user" style="margin-top: 3px;"></i>
                <div>${course.dosen.split(/[\n;]/).map(d => d.trim()).filter(Boolean).join('<br>')}</div>
            </div>
            <div style="margin-top: 1rem; font-size: 0.85rem; color: var(--text-secondary);">
                <i class="ph ph-folder-notch"></i> ${fileCount} Materi Tersedia
            </div>
        `;

        // Event Click Card -> Buka Modal
        card.addEventListener('click', () => openCourseModal(course));
        grid.appendChild(card);
    });

    // Update Dashboard Stat
    // Stat ini sekarang di-update oleh loadDashboard()
}

function loadDashboard(semesterFilter) {
    const filteredCourses = semesterFilter === 'all'
        ? coursesData
        : coursesData.filter(c => c.semester == semesterFilter);
    document.getElementById('total-courses').innerText = filteredCourses.length;
}

// 5. Modal & Search Logic
function setupEventListeners() {
    // Main Menu Toggle
    const menuToggle = document.getElementById('menu-toggle');
    const mainMenu = document.getElementById('main-menu');
    const closeMenuBtn = document.getElementById('close-main-menu');
    const menuOverlay = document.getElementById('menu-overlay');

    const openMenu = () => {
        mainMenu.classList.add('active');
        menuOverlay.classList.add('active');
    };
    const closeMenu = () => {
        mainMenu.classList.remove('active');
        menuOverlay.classList.remove('active');
    };

    menuToggle.addEventListener('click', openMenu);
    closeMenuBtn.addEventListener('click', closeMenu);
    menuOverlay.addEventListener('click', closeMenu);

    // Menu Links
    document.getElementById('menu-beranda').addEventListener('click', closeMenu);
    document.getElementById('menu-arsip-foto').addEventListener('click', (e) => {
        e.preventDefault();
        openGlobalPhotoArchive();
        closeMenu();
    });
    document.getElementById('menu-pengaturan').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('manage-cookies-btn').click(); // Trigger cookie modal
        closeMenu();
    });

    // Notification Toggle
    const notifBtn = document.getElementById('notif-toggle');
    if (notifBtn) {
        notifBtn.addEventListener('click', () => {
            window.OneSignalDeferred.push(async function (OneSignal) {
                const permission = await OneSignal.getNotificationPermission();
                const isSubscribed = OneSignal.User.PushSubscription.optedIn;

                let statusMessage = `Status Langganan: ${isSubscribed ? 'Terdaftar' : 'Belum Terdaftar'}\n`;
                statusMessage += `Izin Browser: ${permission.toUpperCase()}`;

                if (isSubscribed) {
                    alert(statusMessage);
                } else if (permission === 'denied') {
                    alert(statusMessage + "\n\nNotifikasi diblokir. Harap reset izin notifikasi di pengaturan situs (ikon gembok di address bar).");
                } else {
                    alert("Anda belum terdaftar notifikasi. Klik OK untuk memulai pendaftaran.");
                    await OneSignal.User.PushSubscription.optIn();
                }
            });
        });
    }

    // Filter Semester
    document.getElementById('semester-filter').addEventListener('change', (e) => {
        const selectedSemester = e.target.value;
        if (localStorage.getItem('consent_personalization') === 'true') {
            localStorage.setItem('semester', selectedSemester);
        }
        loadCourses(selectedSemester);
        loadDashboard(selectedSemester);
        loadAssignments(selectedSemester);
        renderBookmarks(selectedSemester);

        // Update URL Hash
        window.location.hash = 'semester' + selectedSemester;
    });

    // Search Toggle Mobile
    const searchBar = document.querySelector('.search-bar');
    searchBar.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            // Jangan tutup jika yang diklik adalah input itu sendiri
            if (e.target.tagName === 'INPUT') return;

            searchBar.classList.toggle('active');
            if (searchBar.classList.contains('active')) {
                document.getElementById('global-search').focus();
            }
        }
    });

    // Close search when clicking outside
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && !searchBar.contains(e.target)) {
            searchBar.classList.remove('active');
        }
    });

    // Search Global
    document.getElementById('global-search').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const cards = document.querySelectorAll('.course-card');

        cards.forEach(card => {
            const text = card.innerText.toLowerCase();
            card.style.display = text.includes(term) ? 'block' : 'none';
        });
    });

    // Close Modal
    document.querySelector('.close-modal').addEventListener('click', () => {
        document.getElementById('material-modal').classList.remove('active');
    });

    document.getElementById('close-assign-modal').addEventListener('click', () => {
        document.getElementById('assignment-modal').classList.remove('active');
    });

    // Close Preview Modal
    const closePreviewBtn = document.getElementById('close-preview-modal');
    if (closePreviewBtn) {
        closePreviewBtn.addEventListener('click', () => {
            document.getElementById('preview-modal').classList.remove('active');
            document.getElementById('preview-frame').src = ''; // Stop loading
        });
    }

    // Fullscreen Toggle Logic
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const previewModalContent = document.querySelector('#preview-modal .modal-content');
    const previewFrame = document.getElementById('preview-frame');

    if (fullscreenBtn && previewModalContent && previewFrame) {
        fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                // Request fullscreen pada iframe langsung agar header tidak terlihat
                previewFrame.requestFullscreen().catch(err => {
                    console.error(`Error enabling fullscreen: ${err.message}`);
                    previewModalContent.requestFullscreen(); // Fallback jika iframe gagal
                });
            } else {
                document.exitFullscreen();
            }
        });

        document.addEventListener('fullscreenchange', () => {
            const icon = fullscreenBtn.querySelector('i');
            if (document.fullscreenElement) {
                icon.classList.replace('ph-corners-out', 'ph-corners-in');
                if (document.fullscreenElement === previewModalContent) {
                    previewModalContent.style.borderRadius = '0';
                }
            } else {
                icon.classList.replace('ph-corners-in', 'ph-corners-out');
                previewModalContent.style.borderRadius = '';
            }
        });
    }

    // Tab Switching Logic
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Reset active class
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            // Render content based on tab
            renderModalContent(e.target.dataset.tab);
        });
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        // Shortcut: ESC to close any active modal
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal.active');
            if (activeModal) {
                activeModal.classList.remove('active');
                // Special handling for preview modal to stop video/content loading
                if (activeModal.id === 'preview-modal') {
                    document.getElementById('preview-frame').src = 'about:blank'; // Stop loading
                }
            }
        }

        // Shortcut: Ctrl + F or Ctrl + K to focus search
        if (e.ctrlKey && (e.key === 'f' || e.key === 'k')) {
            e.preventDefault(); // Prevent default browser search
            const searchInput = document.getElementById('global-search');
            searchInput.focus();
            // Ensure mobile search bar becomes visible
            searchInput.parentElement.classList.add('active');
        }
    });

    // Hash Router Handler (Untuk fitur Spesifik: Upload & Token)
    window.addEventListener('hashchange', checkHashRoute);

    // Default Beranda click (Clear Hash dan Matikan Popups)
    document.getElementById('menu-beranda')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.hash = ''; // defaults to beranda
        closeMenu();
    });

    document.getElementById('menu-arsip-foto')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.hash = 'arsipfoto';
        closeMenu();
    });

    document.getElementById('menu-pengaturan')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.hash = 'pengaturan';
        closeMenu();
    });

    document.getElementById('menu-upload')?.addEventListener('click', (e) => {
        e.preventDefault();
        const savedToken = localStorage.getItem('pj_token');
        if (savedToken) {
            window.location.hash = 'upload';
        } else {
            alert('Akses Ditolak. Silakan masukkan Token PJ Anda terlebih dahulu.');
            window.location.hash = 'token';
        }
        closeMenu();
    });


    document.getElementById('close-token-modal')?.addEventListener('click', () => {
        document.getElementById('token-modal').classList.remove('active');
        window.history.pushState('', document.title, window.location.pathname); // clear hash
    });
}

// Router Khusus Berbasis Hash Link
function checkHashRoute() {
    let hash = window.location.hash.substring(1);

    // Clear semua class active di sidebar menu
    document.querySelectorAll('.main-menu-links li a').forEach(a => a.classList.remove('active'));

    // BERSERIKAN SEMUA MODAL SAAT PINDAH RUTE (Global Cleanup)
    document.getElementById('upload-modal')?.classList.remove('active');
    document.getElementById('cookie-settings-modal')?.classList.remove('active');
    document.getElementById('preview-modal')?.classList.remove('active');

    const matModal = document.getElementById('material-modal');
    if (matModal) {
        matModal.classList.remove('active', 'fullscreen-modal');
        matModal.querySelector('.modal-content')?.classList.remove('fullscreen');
        matModal.querySelector('.modal-header').style.display = 'flex'; // Reset header back to normal
    }

    // Kembalikan header utama ke default
    const navBrand = document.querySelector('.navbar .logo');
    if (navBrand) navBrand.innerHTML = '<span class="accent">F.</span>AGRIELLA';

    // 1. Rute Semester (atau kosongan dihitung Beranda)
    if (!hash || hash.startsWith('semester')) {
        const btn = document.getElementById('menu-beranda');
        if (btn) btn.classList.add('active');
    }
    // 2. Rute Upload
    else if (hash === 'upload') {
        const uploadBtn = document.getElementById('menu-upload');
        if (uploadBtn) uploadBtn.classList.add('active');

        const token = localStorage.getItem('pj_token');
        if (token) {
            const uploadModal = document.getElementById('upload-modal');
            if (uploadModal) uploadModal.classList.add('active');
            const iframe = document.getElementById('upload-iframe');
            if (iframe && iframe.src === 'about:blank' || iframe.src === window.location.href) {
                iframe.src = 'https://script.google.com/macros/s/AKfycbzhZkLgXDqLVi80_NY7cbIx8UwZVBONgvwBnJIik4EqHfThHq2iU0EuPGzlBxa-OQpd/exec?token=' + encodeURIComponent(token);
            }
        } else {
            window.location.hash = 'token';
        }
    }
    // 3. Rute Token & Pengaturan (Membuka popup yang sama, namun token scroll/isi tokenbox)
    else if (hash === 'token' || hash === 'pengaturan') {
        const pengaturanBtn = document.getElementById('menu-pengaturan');
        if (pengaturanBtn) pengaturanBtn.classList.add('active');

        const settingsModal = document.getElementById('cookie-settings-modal');
        if (settingsModal) settingsModal.classList.add('active');

        if (hash === 'token') {
            const input = document.getElementById('token-input');
            if (input) input.value = localStorage.getItem('pj_token') || '';
            const statusEl = document.getElementById('token-status');
            if (statusEl) statusEl.innerText = '';
        }
    }
    // 4. Rute Arsip Foto
    else if (hash.startsWith('arsipfoto')) {
        const arsipFotoBtn = document.getElementById('menu-arsip-foto');
        if (arsipFotoBtn) arsipFotoBtn.classList.add('active');

        // Ubah header utama
        const navBrand = document.querySelector('.navbar .logo');
        if (navBrand) navBrand.innerHTML = '<span class="accent">Arsip</span> Foto';

        // Ekstrak parameter dari hash: arsipfoto/Semester/NamaAlbum
        const parts = hash.split('/');
        const targetSem = parts[1] ? decodeURIComponent(parts[1]) : null;
        const targetMk = parts[2] ? decodeURIComponent(parts[2]) : null;

        openGlobalPhotoArchive(targetSem, targetMk);
    }
}





function openCourseModal(course) {
    activeCourse = course; // Set active course
    const modal = document.getElementById('material-modal');
    const tabs = document.querySelector('.modal-tabs');
    const titleEl = document.getElementById('modal-title');
    modal.querySelector('.modal-header').style.display = 'flex';
    titleEl.innerText = course.name;

    const metaContainer = document.getElementById('modal-meta-container');
    const dosenList = course.dosen.split(/[\n;]/).map(d => d.trim()).filter(Boolean);
    const picList = course.pic ? course.pic.split(',').map(p => p.trim()).filter(Boolean) : [];

    let metaHtml = '<div class="modal-meta-grid">';

    // Dosen Column
    if (dosenList.length > 0) {
        metaHtml += `
            <div class="meta-column">
                <h4>Dosen</h4>
                <ul>${dosenList.map(d => `<li>${d}</li>`).join('')}</ul>
            </div>
        `;
    }

    // PIC Column
    if (picList.length > 0) {
        metaHtml += `
            <div class="meta-column">
                <h4>Penanggung Jawab</h4>
                <ul>${picList.map(p => `<li>${p}</li>`).join('')}</ul>
            </div>
        `;
    }

    metaHtml += '</div>';
    metaContainer.innerHTML = metaHtml;

    tabs.style.display = 'flex'; // Pastikan tab terlihat
    // Reset Tabs ke Default (Dokumen)
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="dokumen"]').classList.add('active');

    // Render Default Content
    renderModalContent('dokumen');

    modal.classList.remove('fullscreen-modal'); // Kembalikan posisi z-index layer
    modal.querySelector('.modal-content').classList.remove('fullscreen'); // Kembalikan default styling
    modal.classList.add('active');
}

function openGlobalPhotoArchive(targetSem = null, targetMk = null) {
    const modal = document.getElementById('material-modal');
    const title = document.getElementById('modal-title');
    const metaContainer = document.getElementById('modal-meta-container');
    const tabs = document.querySelector('.modal-tabs');
    const fileContainer = document.getElementById('modal-files');

    modal.querySelector('.modal-header').style.display = 'none';
    metaContainer.innerHTML = ''; // Sembunyikan meta
    tabs.style.display = 'none'; // Sembunyikan tabs

    const photos = materialsData.filter(m => ['image', 'jpg', 'png', 'jpeg'].includes(m.type));

    // Gabungkan dengan sumber sheet arsipfoto
    const additionalPhotos = arsipFotoData.filter(m => m.link);
    const allPhotos = [...photos, ...additionalPhotos];

    modal.classList.add('fullscreen-modal'); // Ubah z-index wrapper agar di bawah navbar
    modal.querySelector('.modal-content').classList.add('fullscreen'); // Paksa layar penuh

    // Mengelompokkan berdasarkan Semester dan Mata Kuliah / Album
    const groupedPhotos = {};
    allPhotos.forEach(m => {
        // Cari semester berdasarkan m.course // m.album di coursesData
        const relatedCourse = coursesData.find(c => c.name === m.course || c.name === m.album);
        const sem = relatedCourse && relatedCourse.semester ? relatedCourse.semester : 'Lainnya';
        const mk = m.course || m.album || 'Lain-lain';

        if (!groupedPhotos[sem]) groupedPhotos[sem] = {};
        if (!groupedPhotos[sem][mk]) groupedPhotos[sem][mk] = [];
        groupedPhotos[sem][mk].push(m);
    });

    if (allPhotos.length === 0) {
        fileContainer.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-secondary);">Belum ada foto di arsip.</div>';
    } else {
        let htmlStr = '';

        // Container khusus untuk tombol kembali ke daftar semester
        htmlStr += `<div id="semester-back-nav" style="display: none; align-items:center; gap: 1rem; margin-bottom: 1rem;">
                        <button onclick="closeSemester()" style="display:inline-flex; align-items:center; gap:8px; padding:8px 16px; background:var(--card-bg); border:1px solid var(--border-color); color:var(--text-primary); border-radius:var(--radius); cursor:pointer; font-weight:600; transition:all 0.2s;">
                            <i class="ph ph-arrow-left"></i> Kembali
                        </button>
                        <div id="active-semester-title" style="display:flex; flex-direction:column; justify-content:center;">
                            <h2 style="color: var(--text-primary); font-size: 1.2rem; margin:0; line-height:1.2;">-</h2>
                        </div>
                    </div>`;

        // Container khusus untuk tombol kembali ke daftar album (dalam satu semester)
        htmlStr += `<div id="album-back-nav" style="display: none; align-items:center; gap: 1rem; margin-bottom: 1rem;">
                        <button onclick="closeAlbum()" style="display:inline-flex; align-items:center; gap:8px; padding:8px 16px; background:var(--card-bg); border:1px solid var(--border-color); color:var(--text-primary); border-radius:var(--radius); cursor:pointer; font-weight:600; transition:all 0.2s;">
                            <i class="ph ph-arrow-left"></i> Kembali
                        </button>
                        <div id="active-album-title" style="display:flex; flex-direction:column; justify-content:center;">
                            <h2 style="color: var(--text-primary); font-size: 1.2rem; margin:0; line-height:1.2;">-</h2>
                            <span style="color: var(--text-secondary); font-size: 0.85rem; margin:0;">-</span>
                        </div>
                    </div>`;

        // Fungsi Buka Semester
        window.openSemester = function (semester) {
            document.getElementById('semester-grid-container').style.display = 'none';
            document.querySelectorAll('.semester-albums-grid').forEach(g => g.style.display = 'none');

            const el = document.getElementById(`semester-${semester}-albums`);
            if (el) el.style.display = 'grid';

            document.getElementById('semester-back-nav').style.display = 'flex';
            document.getElementById('album-back-nav').style.display = 'none';

            // Update teks judul di samping tombol back
            const titleContainer = document.getElementById('active-semester-title');
            if (titleContainer) {
                titleContainer.querySelector('h2').innerText = 'Semester ' + decodeURIComponent(semester).replace(/-/g, ' ');
            }

            window.activeSemesterPhotoArchive = semester;
            window.history.replaceState(null, null, `#arsipfoto/${semester}`);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        // Fungsi Tutup Semester (Kembali ke Pilih Semester)
        window.closeSemester = function () {
            document.querySelectorAll('.semester-albums-grid').forEach(g => g.style.display = 'none');
            document.getElementById('semester-grid-container').style.display = 'grid';
            document.getElementById('semester-back-nav').style.display = 'none';

            window.activeSemesterPhotoArchive = null;
            window.history.replaceState(null, null, `#arsipfoto`);
        };

        // Fungsi helper navigasi ke dalam album foto
        window.toggleAlbum = function (semester, mk) {
            const el = document.getElementById(`album-${semester}-${mk}`);
            if (el) {
                // Sembunyikan daftar album di semester ini
                document.querySelectorAll('.semester-albums-grid').forEach(g => g.style.display = 'none');
                document.getElementById('semester-back-nav').style.display = 'none';

                // Update teks judul di samping tombol back
                const titleContainer = document.getElementById('active-album-title');
                if (titleContainer) {
                    titleContainer.querySelector('h2').innerText = decodeURIComponent(mk).replace(/-/g, ' ');
                    titleContainer.querySelector('span').innerText = 'Semester ' + decodeURIComponent(semester).replace(/-/g, ' ');
                }

                document.getElementById('semester-back-nav').style.display = 'none';

                // Tampilkan container foto dari album yang dipilih & tombol back
                el.style.display = 'grid';
                document.getElementById('album-back-nav').style.display = 'flex';

                window.history.replaceState(null, null, `#arsipfoto/${semester}/${mk}`);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        };

        // Fungsi untuk kembali ke daftar album
        window.closeAlbum = function () {
            // Sembunyikan semua grid foto
            document.querySelectorAll('.album-photos-grid').forEach(g => g.style.display = 'none');

            // Tampilkan kembali daftar album untuk semester yang aktif
            if (window.activeSemesterPhotoArchive) {
                const el = document.getElementById(`semester-${window.activeSemesterPhotoArchive}-albums`);
                if (el) el.style.display = 'grid';
                document.getElementById('semester-back-nav').style.display = 'block';
                document.getElementById('album-back-nav').style.display = 'none';
                window.history.replaceState(null, null, `#arsipfoto/${window.activeSemesterPhotoArchive}`);
            } else {
                closeSemester();
            }
        };

        // TIER 1: Pilih Semester
        htmlStr += `<div id="semester-grid-container" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap:1rem; padding: 0.5rem;">`;

        const sortedSemesters = Object.keys(groupedPhotos).sort((a, b) => {
            if (a === 'Lainnya') return 1;
            if (b === 'Lainnya') return -1;
            return a.localeCompare(b, undefined, { numeric: true });
        });

        sortedSemesters.forEach(sem => {
            const safeSem = sem.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
            const albumKeys = Object.keys(groupedPhotos[sem]);
            const albumCount = albumKeys.length;

            // Cari foto valid pertama di dalam salah satu album semester ini
            let coverSrc = '';
            for (let i = 0; i < albumKeys.length; i++) {
                const mk = albumKeys[i];
                if (groupedPhotos[sem][mk].length > 0) {
                    const firstPhoto = groupedPhotos[sem][mk][0];
                    if (firstPhoto && firstPhoto.link) {
                        coverSrc = firstPhoto.link;
                        break;
                    }
                }
            }

            if (coverSrc && coverSrc.includes('drive.google.com')) {
                const match = coverSrc.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
                if (match && match[1]) {
                    coverSrc = `https://drive.google.com/uc?export=view&id=${match[1]}`;
                }
            }

            htmlStr += `
                <div class="album-folder" style="cursor:pointer; position: relative; height: 140px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius); overflow: hidden; display:flex; align-items:flex-end; box-shadow: var(--shadow); transition: transform 0.2s;" onclick="openSemester('${safeSem}')" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                    ${coverSrc ? `<img src="${coverSrc}" alt="Cover" loading="lazy" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: cover; z-index: 0; filter: brightness(0.7);">` : `<div style="position: absolute; top:0; left:0; width:100%; height:100%; background: var(--border-color); z-index: 0; display:flex; align-items:center; justify-content:center;"><i class="ph ph-images" style="font-size:2.5rem; color:var(--text-secondary);"></i></div>`}
                    <div style="position: relative; z-index: 1; padding: 0.8rem; width: 100%; background: linear-gradient(transparent, rgba(0,0,0,0.8)); color: white; display:flex; flex-direction: column; align-items:flex-start; font-size: 1rem; font-weight:600; text-shadow: 1px 1px 3px rgba(0,0,0,0.5);">
                        <div style="display:flex; align-items:center; margin-bottom: 2px;">
                            <i class="ph ph-folder" style="margin-right:8px; color:var(--accent-color);"></i>
                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Semester ${sem}</span>
                        </div>
                        <span style="font-size: 0.8rem; font-weight: 400; color: #ddd;">${albumCount} Album</span>
                    </div>
                </div>`;
        });
        htmlStr += `</div>`;

        // TIER 2: Daftar Album (per semester)
        htmlStr += `<div id="all-semester-albums-container">`;
        sortedSemesters.forEach(sem => {
            const safeSem = sem.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');

            htmlStr += `<div id="semester-${safeSem}-albums" class="semester-albums-grid" style="display:none; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:1rem; padding:0.5rem;">`;

            // Loop album
            Object.keys(groupedPhotos[sem]).sort().forEach(mk => {
                const safeMk = mk.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');

                // Ambil foto pertama sbg cover album
                const firstPhoto = groupedPhotos[sem][mk][0];
                let coverSrc = firstPhoto && firstPhoto.link ? firstPhoto.link : '';
                if (coverSrc && coverSrc.includes('drive.google.com')) {
                    const match = coverSrc.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
                    if (match && match[1]) {
                        coverSrc = `https://drive.google.com/uc?export=view&id=${match[1]}`;
                    }
                }

                htmlStr += `
                    <div class="album-folder" style="cursor:pointer; position: relative; height: 140px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius); overflow: hidden; display:flex; align-items:flex-end; box-shadow: var(--shadow); transition: transform 0.2s;" onclick="toggleAlbum('${safeSem}', '${safeMk}')" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                        ${coverSrc ? `<img src="${coverSrc}" alt="Cover" loading="lazy" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: cover; z-index: 0; filter: brightness(0.7);">` : `<div style="position: absolute; top:0; left:0; width:100%; height:100%; background: var(--border-color); z-index: 0; display:flex; align-items:center; justify-content:center;"><i class="ph ph-image" style="font-size:2rem; color:var(--text-secondary);"></i></div>`}
                        <div style="position: relative; z-index: 1; padding: 0.8rem; width: 100%; background: linear-gradient(transparent, rgba(0,0,0,0.8)); color: white; display:flex; align-items:center; font-size: 1rem; font-weight:600; text-shadow: 1px 1px 3px rgba(0,0,0,0.5);">
                            <i class="ph ph-folder" style="margin-right:8px; color:var(--accent-color);"></i>
                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${mk}</span>
                        </div>
                    </div>`;
            });
            htmlStr += `</div>`;
        });
        htmlStr += `</div>`;

        // TIER 3: Isi Foto-foto dari masing-masing album
        htmlStr += `<div id="all-album-photos-container">`;
        sortedSemesters.forEach(sem => {
            Object.keys(groupedPhotos[sem]).forEach(mk => {
                const safeMk = mk.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
                const safeSem = sem.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');

                htmlStr += `
                    <div id="album-${safeSem}-${safeMk}" class="album-photos-grid" style="display: none; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; padding: 0.5rem;">`;

                // Loop setiap foto
                groupedPhotos[sem][mk].forEach(m => {
                    const dateObj = parseDateStr(m.date) || new Date(m.date || Date.now());
                    const dateDisplay = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                    const fileLink = m.link;

                    let imgSrc = fileLink;
                    if (fileLink && fileLink.includes('drive.google.com')) {
                        const match = fileLink.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
                        if (match && match[1]) {
                            imgSrc = `https://drive.google.com/uc?export=view&id=${match[1]}`;
                        }
                    }

                    const previewLink = fileLink ? fileLink.replace(/\/view.*/, '/preview') : '#';
                    const itemId = generateId(m);
                    const bookmarked = isBookmarked(itemId);

                    htmlStr += `
                        <div class="file-item" style="flex-direction: column; align-items: stretch; text-align: center; padding: 0; height: auto; position: relative; background: transparent; border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow);">
                            <a href="${fileLink}" onclick="event.preventDefault(); showPreview('${previewLink}', '${m.filename.replace(/'/g, "\\'")}')" style="text-decoration: none; color: inherit; display: flex; flex-direction: column; height: 100%;">
                                <img src="${imgSrc}" alt="${m.filename}" loading="lazy" style="width: 100%; height: 120px; object-fit: cover; background-color: var(--bg-color); border-bottom: 1px solid var(--border-color);">
                                <div style="padding: 0.75rem; background-color: var(--card-bg); flex-grow: 1; display: flex; flex-direction: column; justify-content: center;">
                                    <div style="font-weight:600; font-size:0.85rem; word-break: break-word; line-height: 1.3;">${m.filename}</div>
                                    <div style="font-size:0.75rem; color: var(--text-secondary); margin-top: 4px;">${dateDisplay}</div>
                                </div>
                            </a>
                            <button onclick="toggleBookmark('${itemId}', 'materi', '${m.filename.replace(/'/g, "\\'")}', '${m.course}', '${fileLink}', '${m.type}', event)" class="list-bookmark-btn" title="Simpan" style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.4); border-radius: 50%; color: white; height: 32px; width: 32px; display: flex; align-items: center; justify-content: center;">
                                <i class="ph ${bookmarked ? 'ph-star-fill' : 'ph-star'}" style="color: ${bookmarked ? 'var(--accent-color)' : 'white'};"></i>
                            </button>
                        </div>`;
                });
                htmlStr += `</div>`; // End of individual album photos grid
            });
        });

        htmlStr += `</div>`; // End of all-album-photos-container

        fileContainer.innerHTML = htmlStr;

        // Auto Open Folder jika ada parameter Target yang masuk
        if (targetSem && targetMk) {
            setTimeout(() => {
                const safeTargetSem = targetSem.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
                const safeTargetMk = targetMk.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');

                window.activeSemesterPhotoArchive = safeTargetSem;
                document.getElementById('semester-grid-container').style.display = 'none';

                const el = document.getElementById(`album-${safeTargetSem}-${safeTargetMk}`);
                if (el && el.style.display === 'none') {
                    window.toggleAlbum(safeTargetSem, safeTargetMk);
                }
            }, 100);
        } else if (targetSem) {
            setTimeout(() => {
                const safeTargetSem = targetSem.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
                window.openSemester(safeTargetSem);
            }, 100);
        }
    }

    modal.classList.add('active');
}

function renderModalContent(type) {
    const fileContainer = document.getElementById('modal-files');
    const course = activeCourse;

    // 1. Ambil materi dari materialsData yang cocok dengan nama course
    let materials = materialsData.filter(m => m.course === course.name);

    // 2. SORTING: Urutkan berdasarkan tanggal (Terbaru di Atas)
    // b.date - a.date = Descending
    materials.sort((a, b) => {
        const dateA = parseDateStr(a.date) || new Date(0);
        const dateB = parseDateStr(b.date) || new Date(0);
        return dateB - dateA;
    });

    // Helper untuk menentukan ikon & warna berdasarkan tipe file
    const getFileIcon = (fileType) => {
        if (fileType === 'pdf') return { icon: 'ph-file-pdf', color: '#ef4444' };
        if (fileType === 'doc' || fileType === 'docx') return { icon: 'ph-file-doc', color: '#2563eb' };
        if (fileType === 'ppt' || fileType === 'pptx') return { icon: 'ph-file-ppt', color: '#f59e0b' };
        return { icon: 'ph-file', color: 'var(--text-secondary)' };
    };

    if (type === 'dokumen') {
        // Filter hanya file dokumen (bukan gambar)
        const docs = materials.filter(m => !['image', 'jpg', 'png', 'jpeg'].includes(m.type));

        if (docs.length === 0) {
            fileContainer.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-secondary);">Belum ada dokumen.</div>';
            return;
        }

        fileContainer.innerHTML = docs.map(m => {
            const { icon, color } = getFileIcon(m.type);
            const dateObj = parseDateStr(m.date) || new Date(m.date);
            const dateDisplay = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

            // 1. Buat link download (GitHub Raw)
            // Gunakan link dari CSV jika ada, jika tidak, buat path default ke folder /materi/
            const downloadLink = m.link ? m.link : `https://github.com/FAGRIELLA/FAGRIELLA.github.io/raw/main/materi/${encodeURIComponent(course.name)}/${encodeURIComponent(m.filename)}`;

            // 2. Buat link preview
            let previewLink = downloadLink; // Defaultnya sama dengan link download (untuk gambar, dll)

            // Cek apakah link adalah Google Drive (agar tidak double viewer)
            if (downloadLink.includes('drive.google.com') || downloadLink.includes('docs.google.com')) {
                // Ubah /view menjadi /preview agar bisa di-embed di dalam modal
                previewLink = downloadLink.replace(/\/view.*/, '/preview');
            }
            // Jika file office atau PDF biasa (Direct Link), bungkus dengan Google Docs Viewer
            else if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'pdf'].includes(m.type)) {
                previewLink = `https://docs.google.com/gview?url=${encodeURIComponent(downloadLink)}&embedded=true`;
            }

            const itemId = generateId(m);
            const bookmarked = isBookmarked(itemId);

            return `
            <div class="file-item" style="display: flex; align-items: center; justify-content: space-between;">
                <a href="${previewLink}" onclick="event.preventDefault(); showPreview(this.href, '${m.filename.replace(/'/g, "\\'")}')" style="display: flex; align-items: center; text-decoration: none; color: inherit; flex: 1; cursor: pointer;">
                    <i class="ph ${icon}" style="font-size:1.5rem; margin-right:10px; color: ${color};"></i>
                    <div>
                        <div style="font-weight:600;">
                            ${m.filename} 
                            <span class="file-size-tag" data-url="${downloadLink}" style="font-weight:400; font-size:0.85em; color:var(--text-secondary);">
                                ${m.size ? `(${m.size})` : ''}
                            </span>
                        </div>
                        <div style="font-size:0.8rem; color: var(--text-secondary);">
                            ${dateDisplay} • Diunggah oleh ${course.pic}
                        </div>
                    </div>
                </a>
                <div style="display: flex; align-items: center;">
                    <a href="${downloadLink}" target="_blank" download class="list-bookmark-btn" title="Download">
                        <i class="ph ph-download-simple"></i>
                    </a>
                    <button onclick="toggleBookmark('${itemId}', 'materi', '${m.filename.replace(/'/g, "\\'")}', '${course.name}', '${downloadLink}', '${m.type}', event)" class="list-bookmark-btn" title="Simpan">
                        <i class="ph ${bookmarked ? 'ph-star-fill' : 'ph-star'}" style="color: ${bookmarked ? 'var(--accent-color)' : 'var(--text-secondary)'}"></i>
                    </button>
                </div>
            </div>
            `;
        }).join('');

        // Trigger auto-detect size untuk file yang belum punya ukuran
        document.querySelectorAll('.file-size-tag').forEach(el => fetchFileSize(el));

    } else if (type === 'foto') {
        // Filter hanya file gambar
        const photos = materials.filter(m => ['image', 'jpg', 'png', 'jpeg'].includes(m.type));

        if (photos.length === 0) {
            fileContainer.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-secondary);">Belum ada foto.</div>';
            return;
        }

        // Tampilan Grid untuk Foto
        fileContainer.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem;">
                ${photos.map(m => {
            const dateObj = parseDateStr(m.date) || new Date(m.date);
            const dateDisplay = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
            const fileLink = m.link; // Link dari Google Sheet

            // Buat URL sumber gambar yang bisa ditampilkan langsung, terutama untuk Google Drive
            let imgSrc = fileLink;
            if (fileLink && fileLink.includes('drive.google.com')) {
                const match = fileLink.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
                if (match && match[1]) {
                    imgSrc = `https://drive.google.com/uc?export=view&id=${match[1]}`;
                }
            }

            // Buat URL untuk preview di iframe
            const previewLink = fileLink ? fileLink.replace(/\/view.*/, '/preview') : '#';

            const itemId = generateId(m);
            const bookmarked = isBookmarked(itemId);

            return `
                    <div class="file-item" style="flex-direction: column; align-items: stretch; text-align: center; padding: 0; height: auto; position: relative; background: transparent; border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow);">
                        <a href="${fileLink}" onclick="event.preventDefault(); showPreview('${previewLink}', '${m.filename.replace(/'/g, "\\'")}')" style="text-decoration: none; color: inherit; display: flex; flex-direction: column; height: 100%;">
                            <img src="${imgSrc}" alt="${m.filename}" loading="lazy" style="width: 100%; height: 120px; object-fit: cover; background-color: var(--bg-color); border-bottom: 1px solid var(--border-color);">
                            <div style="padding: 0.75rem; background-color: var(--card-bg); flex-grow: 1; display: flex; flex-direction: column; justify-content: center;">
                                <div style="font-weight:600; font-size:0.85rem; word-break: break-word; line-height: 1.3;">${m.filename}</div>
                                <div style="font-size:0.75rem; color: var(--text-secondary); margin-top: 4px;">${dateDisplay}</div>
                            </div>
                        </a>
                        <button onclick="toggleBookmark('${itemId}', 'materi', '${m.filename.replace(/'/g, "\\'")}', '${course.name}', '${fileLink}', '${m.type}', event)" class="list-bookmark-btn" title="Simpan" style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.4); border-radius: 50%; color: white; height: 32px; width: 32px; display: flex; align-items: center; justify-content: center;">
                            <i class="ph ${bookmarked ? 'ph-star-fill' : 'ph-star'}" style="color: ${bookmarked ? 'var(--accent-color)' : 'white'};"></i>
                        </button>
                    </div>
                    `;
        }).join('')}
            </div>
        `;
    }
}

// 6. Bookmark Logic
function isBookmarked(id) {
    return bookmarks.some(b => b.id === id);
}

function toggleBookmark(id, type, title, subtitle, link, fileType, event) {
    if (event) event.stopPropagation();

    const index = bookmarks.findIndex(b => b.id === id);
    let isNowBookmarked;

    if (index > -1) {
        // Item ada, hapus dari bookmark
        bookmarks.splice(index, 1);
        isNowBookmarked = false;
    } else {
        // Item tidak ada, tambahkan ke bookmark
        bookmarks.push({ id, type, title, subtitle, link, fileType });
        isNowBookmarked = true;
    }

    if (localStorage.getItem('consent_personalization') === 'true') {
        localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
    }

    // Update ikon yang diklik secara langsung untuk feedback instan, JIKA event ada
    if (event) {
        const icon = event.currentTarget.querySelector('i');
        if (icon) {
            const isPhoto = ['image', 'jpg', 'png', 'jpeg'].includes(fileType);
            if (isNowBookmarked) {
                icon.classList.remove('ph-star');
                icon.classList.add('ph-star-fill');
                icon.style.color = 'var(--accent-color)';
            } else {
                icon.classList.remove('ph-star-fill');
                icon.classList.add('ph-star');
                // Foto memiliki warna ikon non-aktif yang berbeda (putih)
                icon.style.color = isPhoto ? 'white' : 'var(--text-secondary)';
            }
        }
    }

    // Ambil semester yang sedang aktif dan re-render bookmark list
    const selectedSemester = document.getElementById('semester-filter').value;
    renderBookmarks(selectedSemester);
}

function renderBookmarks(semesterFilter) {
    const list = document.getElementById('bookmark-list');
    if (!list) return;

    if (bookmarks.length === 0) {
        list.innerHTML = '<li class="empty-state" style="color:var(--text-secondary); font-size:0.9rem;">Belum ada bookmark</li>';
        return;
    }

    // Filter Bookmark berdasarkan Semester
    const validCourses = (!semesterFilter || semesterFilter === 'all')
        ? coursesData.map(c => c.name)
        : coursesData.filter(c => c.semester == semesterFilter).map(c => c.name);

    const filteredBookmarks = bookmarks.filter(b => {
        if (b.type === 'materi') return validCourses.includes(b.subtitle); // subtitle = nama matkul
        // Untuk tugas, title adalah "Nama Matkul - Deskripsi..."
        if (b.type === 'tugas') return validCourses.some(c => b.title.startsWith(c));
        return true;
    });

    if (filteredBookmarks.length === 0) {
        list.innerHTML = '<li class="empty-state" style="color:var(--text-secondary); font-size:0.9rem;">Tidak ada bookmark di semester ini</li>';
        return;
    }

    // Pisahkan bookmark foto dan non-foto
    const photoBookmarks = filteredBookmarks.filter(b => b.fileType && ['image', 'jpg', 'png', 'jpeg'].includes(b.fileType));
    const otherBookmarks = filteredBookmarks.filter(b => !photoBookmarks.includes(b));

    let html = '';

    // Render bookmark non-foto (dokumen, tugas) sebagai list
    if (otherBookmarks.length > 0) {
        html += otherBookmarks.map(b => {
            const isLink = b.link && b.link !== 'null';

            // Logic Preview untuk Bookmark
            let href = isLink ? b.link : '#';
            let onclick = '';
            let target = isLink ? 'target="_blank"' : '';

            if (isLink && b.type === 'materi') {
                let previewLink = b.link;
                let canPreview = false;

                // 1. Google Drive
                if (b.link.includes('drive.google.com') || b.link.includes('docs.google.com')) {
                    previewLink = b.link.replace(/\/view.*/, '/preview');
                    canPreview = true;
                }
                // 2. Dokumen Office/PDF (Cek ekstensi)
                else {
                    const lowerUrl = b.link.toLowerCase();
                    const lowerTitle = b.title.toLowerCase();
                    const docExts = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx'];

                    if (docExts.some(ext => lowerUrl.endsWith(ext) || lowerTitle.endsWith(ext))) {
                        previewLink = `https://docs.google.com/gview?url=${encodeURIComponent(b.link)}&embedded=true`;
                        canPreview = true;
                    }
                }

                if (canPreview) {
                    href = previewLink;
                    target = '';
                    onclick = `onclick="event.preventDefault(); showPreview('${previewLink}', '${b.title.replace(/'/g, "\\'")}')"`;
                }
            }

            return `
                <li class="bookmark-item" style="margin-bottom: 0.8rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
                    <a href="${href}" ${target} ${onclick} style="display: block; text-decoration: none; color: var(--text-primary);">
                        <div style="font-size: 0.9rem; font-weight: 600; margin-bottom: 2px;">${b.title}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); display:flex; align-items:center; gap:4px;">
                            <i class="ph ph-star-fill" style="color: var(--accent-color);"></i> ${b.subtitle || ''}
                        </div>
                    </a>
                </li>
            `;
        }).join('');
    }

    // Render bookmark foto sebagai grid
    if (photoBookmarks.length > 0) {
        // Bungkus seluruh bagian grid foto dalam satu <li> agar struktur HTML valid
        html += '<li style="list-style-type: none; padding: 0; border: none;">';
        html += '<h4 class="bookmark-grid-title">Foto Tersimpan</h4>';
        html += '<div class="bookmark-photo-grid">';
        html += photoBookmarks.map(b => {
            let imgSrc = b.link;
            if (imgSrc && imgSrc.includes('drive.google.com')) {
                const match = imgSrc.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
                if (match && match[1]) {
                    imgSrc = `https://drive.google.com/uc?export=view&id=${match[1]}`;
                }
            }
            const previewLink = b.link ? b.link.replace(/\/view.*/, '/preview') : '#';

            return `
            <div class="bookmark-photo-item">
                <a href="${previewLink}" onclick="event.preventDefault(); showPreview('${previewLink}', '${b.title.replace(/'/g, "\\'")}')">
                    <img src="${imgSrc}" alt="${b.title}" loading="lazy">
                    <div class="bookmark-photo-title">${b.title}</div>
                </a>
            </div>`;
        }).join('');
        html += '</div></li>'; // Menutup div grid dan li pembungkus
    }

    list.innerHTML = html;
}

function openCourseByName(name) {
    const course = coursesData.find(c => c.name === name);
    if (course) {
        openCourseModal(course);
    }
}

// 7. Preview File Logic
function showPreview(url, title) {
    const modal = document.getElementById('preview-modal');
    const frame = document.getElementById('preview-frame');
    const titleEl = document.getElementById('preview-title');

    titleEl.innerText = title;
    frame.src = url;
    modal.classList.add('active');
}

// 8. Auto-Detect File Size Logic
async function fetchFileSize(element) {
    // Jika sudah ada teks (dari CSV), jangan cek lagi
    if (element.innerText.trim() !== '') return;

    const url = element.dataset.url;
    if (!url) return;

    // Skip Google Drive links (karena biasanya diblokir CORS)
    if (url.includes('drive.google.com') || url.includes('docs.google.com')) return;

    try {
        const response = await fetch(url, { method: 'HEAD' });
        if (response.ok) {
            const size = response.headers.get('Content-Length');
            if (size) element.innerText = `(${formatBytes(size)})`;
        }
    } catch (e) { /* Ignore error */ }
}

function formatBytes(bytes, decimals = 0) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// Helper Date Parser (Global)
function parseDateStr(d) {
    if (!d || typeof d !== 'string') return null;

    // Pisahkan Tanggal dan Jam (jika ada)
    // Contoh: "25-02-2026 09:00" -> dateStr="25-02-2026", timeStr="09:00"
    const [dateStr, timeStr] = d.trim().split(/\s+/);

    const cleanD = dateStr.replace(/\//g, '-');
    const parts = cleanD.split('-');
    if (parts.length !== 3) return null;

    let [p1, p2, p3] = parts.map(n => parseInt(n, 10));
    if (isNaN(p1) || isNaN(p2) || isNaN(p3)) return null;

    let dateObj;
    // Cek format YYYY-MM-DD (p1 > 31 asumsi tahun)
    if (p1 > 31) {
        dateObj = new Date(p1, p2 - 1, p3);
    } else {
        // Asumsi DD-MM-YYYY
        let year = p3;
        if (year < 100) year += 2000;
        dateObj = new Date(year, p2 - 1, p1);
    }

    // Handle Jam (Time)
    if (timeStr) {
        const [h, m] = timeStr.split(':').map(n => parseInt(n, 10));
        if (!isNaN(h)) dateObj.setHours(h);
        if (!isNaN(m)) dateObj.setMinutes(m);
        else dateObj.setMinutes(0);
    } else {
        // Default: Jika tidak ada jam, anggap deadline akhir hari (23:59:59)
        // Ini agar logika "Deadline Hari Ini" tetap valid sampai malam
        dateObj.setHours(23, 59, 59);
    }

    return dateObj;
}