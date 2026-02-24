/**
 * ARSIP KULIAH - LOGIC
 * 
 * Sistem ini sekarang menggunakan Google Sheets sebagai database backend.
 * Data diambil dalam format CSV melalui URL publik Google Sheets.
 */

// --- KONFIGURASI GOOGLE SHEETS ---
// Ganti URL di bawah ini dengan Link CSV dari Google Sheet Anda (File > Share > Publish to Web > CSV)
const COURSES_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ79qFIRk6XP-AJQIawW0OHGGT6rOm9YTp5tGxxJgV8EwbGOJxQ_tu_SEXiFEyTuRBE8a4L3L5EV3u4/pub?gid=0&single=true&output=csv';
const MATERIALS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ79qFIRk6XP-AJQIawW0OHGGT6rOm9YTp5tGxxJgV8EwbGOJxQ_tu_SEXiFEyTuRBE8a4L3L5EV3u4/pub?gid=1254497839&single=true&output=csv';
const ASSIGNMENTS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ79qFIRk6XP-AJQIawW0OHGGT6rOm9YTp5tGxxJgV8EwbGOJxQ_tu_SEXiFEyTuRBE8a4L3L5EV3u4/pub?gid=1922256483&single=true&output=csv';

// State Data
let coursesData = [];
let materialsData = [];
let assignmentsData = [];
let activeCourse = null; // Menyimpan data course yang sedang dibuka

// Load bookmarks & migrasi data lama jika perlu (dari string ke object)
let bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
if (bookmarks.length > 0 && typeof bookmarks[0] === 'string') {
    bookmarks = []; // Reset jika format lama (string nama MK) terdeteksi
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
}

// --- LOGIC UTAMA ---

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupEventListeners();
    initData(); // Mulai fetch data
});

// 1. Theme Handling
function initTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    const icon = toggleBtn.querySelector('i');
    
    // Cek preferensi tersimpan
    if (localStorage.getItem('theme') === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        icon.classList.replace('ph-moon', 'ph-sun');
    }

    toggleBtn.addEventListener('click', () => {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            icon.classList.replace('ph-sun', 'ph-moon');
        } else {
            document.body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            icon.classList.replace('ph-moon', 'ph-sun');
        }
    });
}

// 2. Data Fetching & Parsing
async function initData() {
    const dashboardStats = document.getElementById('total-courses');
    if(dashboardStats) dashboardStats.innerText = '...';

    // Tentukan semester dari URL/localStorage SEBELUM fetch data, agar UI tidak "flash"
    let savedSemester;
    if (window.location.hash) {
        const hash = window.location.hash.substring(1); // Remove '#'
        if (hash.startsWith('semester')) {
            savedSemester = hash.replace('semester', '');
        }
    }
    if (!savedSemester) {
        savedSemester = localStorage.getItem('semester') || '1';
    }

    const semesterSelect = document.getElementById('semester-filter');
    if (semesterSelect) {
        semesterSelect.value = savedSemester;
    }

    try {
        // Fetch semua data secara paralel
        const [coursesRes, materialsRes, assignmentsRes] = await Promise.all([
            fetch(COURSES_SHEET_URL).then(r => r.text()),
            fetch(MATERIALS_SHEET_URL).then(r => r.text()),
            fetch(ASSIGNMENTS_SHEET_URL).then(r => r.text())
        ]);

        coursesData = parseCSV(coursesRes);
        materialsData = parseCSV(materialsRes);
        assignmentsData = parseCSV(assignmentsRes);

        // Render UI setelah data siap
        loadDashboard(savedSemester);
        loadAssignments(savedSemester);
        renderBookmarks(savedSemester); // Tampilkan bookmark tersimpan sesuai semester
        loadCourses(savedSemester);

    } catch (error) {
        console.error("Gagal memuat data:", error);
        // Fallback jika fetch gagal (opsional: tampilkan pesan error di UI)
        document.getElementById('course-grid').innerHTML = '<p style="color:red; text-align:center; grid-column:1/-1;">Gagal memuat data dari Google Sheets. Periksa koneksi atau URL.</p>';
    }
}

function parseCSV(csvText) {
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
                        <button onclick="toggleBookmark('${generateId(t)}', 'tugas', '${t.course} - ${t.description.substring(0,20)}...', 'Deadline: ${t.deadline}', null, event)" class="list-bookmark-btn" title="Simpan Tugas" style="display: inline-flex; align-items: center; gap: 0.5rem;">
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
    // Buat ID unik sederhana dari properti objek
    return btoa(JSON.stringify(obj)).substring(0, 20); 
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
    // Sidebar Toggle (PC & Mobile)
    const menuToggle = document.getElementById('menu-toggle');

    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            document.documentElement.classList.toggle('sidebar-hidden');
            // Simpan status ke localStorage
            const isHidden = document.documentElement.classList.contains('sidebar-hidden');
            localStorage.setItem('sidebarState', isHidden ? 'hidden' : 'visible');
        });
    }
    
    // Notification Toggle
    const notifBtn = document.getElementById('notif-toggle');
    if (notifBtn) {
        notifBtn.addEventListener('click', () => {
            window.OneSignalDeferred.push(async function(OneSignal) {
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
        localStorage.setItem('semester', selectedSemester);
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
}





function openCourseModal(course) {
    activeCourse = course; // Set active course
    const modal = document.getElementById('material-modal');
    document.getElementById('modal-title').innerText = course.name;
    
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
    
    // Reset Tabs ke Default (Dokumen)
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="dokumen"]').classList.add('active');
    
    // Render Default Content
    renderModalContent('dokumen');

    modal.classList.add('active');
}

function renderModalContent(type) {
    const fileContainer = document.getElementById('modal-files');
    const course = activeCourse;
    
    // 1. Ambil materi dari materialsData yang cocok dengan nama course
    let materials = materialsData.filter(m => m.course === course.name);

    // 2. SORTING: Urutkan berdasarkan tanggal (Terbaru di Atas)
    // b.date - a.date = Descending
    materials.sort((a, b) => new Date(b.date) - new Date(a.date));

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
            const dateDisplay = new Date(m.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

            // 1. Buat link download (GitHub Raw)
            // Gunakan link dari CSV jika ada, jika tidak, buat path default ke folder /tugas/
            const downloadLink = m.link ? m.link : `https://github.com/arsipkuliah/arsipkuliah.github.io/raw/main/materi/${encodeURIComponent(course.name)}/${encodeURIComponent(m.filename)}`;

            // 2. Buat link preview
            let previewLink = downloadLink; // Defaultnya sama dengan link download (untuk gambar, dll)
            // Jika file office atau PDF, bungkus dengan Google Docs Viewer
            if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'pdf'].includes(m.type)) {
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
                    <button onclick="toggleBookmark('${itemId}', 'materi', '${m.filename.replace(/'/g, "\\'")}', '${course.name}', '${downloadLink}', event)" class="list-bookmark-btn" title="Simpan">
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

        fileContainer.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 1rem;">
                ${photos.map(m => {
                    const dateDisplay = new Date(m.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                    const fileLink = m.link ? m.link : `https://github.com/arsipkuliah/arsipkuliah.github.io/raw/main/materi/${encodeURIComponent(course.name)}/${encodeURIComponent(m.filename)}`;
                    const itemId = generateId(m);
                    const bookmarked = isBookmarked(itemId);
                    
                    return `
                    <div class="file-item" style="flex-direction: column; align-items: center; text-align: center; padding: 1rem; height: 100%; position: relative;">
                        <a href="${fileLink}" target="_blank" style="text-decoration: none; color: inherit; display: flex; flex-direction: column; align-items: center;">
                            <i class="ph ph-image" style="font-size:2.5rem; color: #10b981; margin-bottom: 0.5rem;"></i>
                            <div style="font-weight:600; font-size:0.85rem; word-break: break-word;">${m.filename}</div>
                            <div style="font-size:0.75rem; color: var(--text-secondary); margin-top: 4px;">${dateDisplay}</div>
                        </a>
                        <button onclick="toggleBookmark('${itemId}', 'materi', '${m.filename.replace(/'/g, "\\'")}', '${course.name}', '${fileLink}', event)" class="list-bookmark-btn" style="position: absolute; top: 0; right: 0;">
                            <i class="ph ${bookmarked ? 'ph-star-fill' : 'ph-star'}" style="color: ${bookmarked ? 'var(--accent-color)' : 'var(--text-secondary)'}"></i>
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

function toggleBookmark(id, type, title, subtitle, link, event) {
    if (event) {
        event.stopPropagation();
        // Update icon visual secara langsung agar responsif
        const btn = event.currentTarget;
        const icon = btn.querySelector('i');
        
        if (icon) {
            if (icon.classList.contains('ph-star-fill')) {
                icon.classList.remove('ph-star-fill');
                icon.classList.add('ph-star');
                icon.style.color = 'var(--text-secondary)';
            } else {
                icon.classList.remove('ph-star');
                icon.classList.add('ph-star-fill');
                icon.style.color = 'var(--accent-color)';
            }
        }
    }
    
    const index = bookmarks.findIndex(b => b.id === id);
    if (index > -1) {
        bookmarks.splice(index, 1);
    } else {
        bookmarks.push({ id, type, title, subtitle, link });
    }
    
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
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
        if (b.type === 'tugas') return validCourses.some(c => b.title.includes(c)); // title mengandung nama matkul
        return true;
    });

    if (filteredBookmarks.length === 0) {
        list.innerHTML = '<li class="empty-state" style="color:var(--text-secondary); font-size:0.9rem;">Tidak ada bookmark di semester ini</li>';
        return;
    }
    
    list.innerHTML = filteredBookmarks.map(b => {
        const isLink = b.link && b.link !== 'null';
        return `
            <li class="bookmark-item" style="margin-bottom: 0.8rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
                <a href="${isLink ? b.link : '#'}" ${isLink ? 'target="_blank"' : ''} style="display: block; text-decoration: none; color: var(--text-primary);">
                    <div style="font-size: 0.9rem; font-weight: 600; margin-bottom: 2px;">${b.title}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); display:flex; align-items:center; gap:4px;">
                        <i class="ph ph-star-fill" style="color: var(--accent-color);"></i> ${b.subtitle || ''}
                    </div>
                </a>
            </li>
        `;
    }).join('');
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