// ================== KONFIGURASI ==================
const BOT_TOKEN = 'ISI_TOKEN_BOT';
const SPREADSHEET_ID = '1DXD3WmzwiOV9spBz0gAaK2l9Tmr4zYsyJ9-fY1RVL78';
const DRIVE_FOLDER_ID = '1lHDnCFVFPZJtXEFa7fLa_jNLj76AnPyg';

const SHEET_MATERIALS = 'Materials';
const SHEET_COURSES = 'Courses';
const TIMEZONE = 'Asia/Jakarta';

// ================== WEB APP ==================
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Arsip Materi Perkuliahan')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ================== TELEGRAM WEBHOOK ==================
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    if (update.message) {
      handleMessage(update.message);
    }
    return ContentService.createTextOutput('OK');
  } catch (e) {
    Logger.log(e);
    return ContentService.createTextOutput('ERROR');
  }
}

// ================== BOT LOGIC ==================
function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : '';
  const props = PropertiesService.getScriptProperties();
  const pendingKey = 'PENDING_' + chatId;

  // TAHAP 2: NAMA MATKUL
  const pending = props.getProperty(pendingKey);
  if (pending && text) {
    const fileData = JSON.parse(pending);
    sendMessage(chatId, `⏳ Mengupload ${fileData.fileName} ...`);
    try {
      processUpload(chatId, fileData, text);
      props.deleteProperty(pendingKey);
    } catch (e) {
      sendMessage(chatId, `❌ Gagal upload: ${e.message}`);
    }
    return;
  }

  // TAHAP 1: FILE
  if (msg.document || msg.photo) {
    let fileId, fileName, mimeType, fileSize;

    if (msg.document) {
      fileId = msg.document.file_id;
      fileName = msg.document.file_name;
      mimeType = msg.document.mime_type;
      fileSize = msg.document.file_size;
    } else {
      const photo = msg.photo[msg.photo.length - 1];
      fileId = photo.file_id;
      fileName = `Foto_${Date.now()}.jpg`;
      mimeType = 'image/jpeg';
      fileSize = photo.file_size;
    }

    props.setProperty(pendingKey, JSON.stringify({
      fileId, fileName, mimeType, fileSize
    }));

    const courses = getCourseNames();
    const keyboard = courses.map(c => [{ text: c }]);

    sendMessage(
      chatId,
      `📂 File diterima: ${fileName}\nPilih Mata Kuliah:`,
      { keyboard, resize_keyboard: true, one_time_keyboard: true }
    );
    return;
  }

  sendMessage(chatId, '📎 Kirim file untuk upload materi.');
}

// ================== UPLOAD CORE ==================
function processUpload(chatId, fileData, courseName) {
  const blob = getTelegramFileBlob(fileData.fileId).setName(fileData.fileName);

  const root = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const folder = root.getFoldersByName(courseName).hasNext()
    ? root.getFoldersByName(courseName).next()
    : root.createFolder(courseName);

  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
    .getSheetByName(SHEET_MATERIALS);

  // Format: Course, Filename, Date, Type, Size, Link
  sheet.appendRow([
    courseName,
    fileData.fileName,
    Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd'),
    getMimeTypeLabel(fileData.mimeType),
    formatBytes(fileData.fileSize),
    file.getUrl()
  ]);

  sendMessage(chatId, `✅ Upload berhasil\n${file.getUrl()}`);
}

// ================== WEB UPLOAD LOGIC ==================
function getCoursesForWeb() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
    .getSheetByName(SHEET_COURSES);
  if (!sheet) return [];
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  // Ambil Name (Col 1) dan Semester (Col 3)
  const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  
  return data
    .filter(r => r[0]) // Filter jika nama kosong
    .map(r => ({ name: r[0], semester: r[2] }));
}

function uploadFileWeb(form) {
  try {
    const blob = form.file;
    const courseName = form.course;
    const semester = form.semester;
    
    if (!blob || !courseName || !semester) throw new Error("Data tidak lengkap");
    
    const root = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    
    // 1. Cek/Buat Folder Semester (Contoh: "Semester 1")
    const semName = "Semester " + semester;
    const semFolders = root.getFoldersByName(semName);
    const semFolder = semFolders.hasNext() ? semFolders.next() : root.createFolder(semName);
    
    // 2. Cek/Buat Folder Matkul di DALAM Folder Semester
    const folders = semFolder.getFoldersByName(courseName);
    const folder = folders.hasNext() ? folders.next() : semFolder.createFolder(courseName);
    
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_MATERIALS);
    
    sheet.appendRow([
      courseName,
      file.getName(),
      Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd'),
      getMimeTypeLabel(file.getMimeType()),
      formatBytes(file.getSize()),
      file.getUrl()
    ]);
    
    return "Berhasil diupload: " + file.getName();
  } catch (e) {
    throw new Error(e.toString());
  }
}

// ================== HELPERS ==================
function getCourseNames() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
    .getSheetByName(SHEET_COURSES);
  if (!sheet) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .getValues().flat().filter(Boolean);
}

function getTelegramFileBlob(fileId) {
  const info = UrlFetchApp.fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
  );
  const data = JSON.parse(info.getContentText());
  return UrlFetchApp.fetch(
    `https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`
  ).getBlob();
}

function sendMessage(chatId, text, replyMarkup) {
  UrlFetchApp.fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        chat_id: chatId,
        text: text,
        reply_markup: replyMarkup || { remove_keyboard: true }
      })
    }
  );
}

function getMimeTypeLabel(mime) {
  if (!mime) return 'file';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('image')) return 'image';
  if (mime.includes('word') || mime.includes('document')) return 'doc';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'ppt';
  if (mime.includes('spreadsheet') || mime.includes('excel')) return 'xls';
  return 'file';
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024,i)).toFixed(0)} ${units[i]}`;
}

// ================== DEBUGGING ==================
// Jalankan fungsi ini manual di Editor untuk cek ID
function testConnection() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    Logger.log("✅ Spreadsheet OK: " + ss.getName());
    
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    Logger.log("✅ Folder Drive OK: " + folder.getName());
  } catch (e) {
    Logger.log("❌ ERROR: " + e.message);
  }
}