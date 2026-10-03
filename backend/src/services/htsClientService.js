const axios = require('axios');
const prisma = require('../config/db');
const { getSafeUploadPath } = require('../utils/safePath');

const HTS_BASE_URL = 'https://hts.diskomdigi.jatengprov.go.id';

// Helper: Parse cookie dari Set-Cookie headers
const parseCookies = (setCookieHeaders, existingCookies = {}) => {
  const cookies = { ...existingCookies };
  if (!setCookieHeaders) return cookies;

  const headerArray = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  headerArray.forEach(header => {
    const parts = header.split(';')[0].split('=');
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      if (name && value) {
        cookies[name] = value;
      }
    }
  });
  return cookies;
};

// Helper: Serialize cookie object ke header string "name1=val1; name2=val2"
const formatCookieHeader = (cookieObj) => {
  if (!cookieObj || typeof cookieObj !== 'object') return '';
  return Object.entries(cookieObj)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
};

// 1. Mengambil Gambar Captcha Live & Token CSRF dari HTS
const getCaptchaStream = async (userId) => {
  try {
    // 1. Request halaman login untuk mengambil CSRF token awal dan cookie sesi CI
    const loginPageRes = await axios.get(`${HTS_BASE_URL}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
    });

    const cookies = parseCookies(loginPageRes.headers['set-cookie']);
    const html = loginPageRes.data || '';

    // Ekstrak CSRF token dari form HTML
    const csrfMatch = html.match(/name=["']csrf_test_name["']\s+value=["']([^"']+)["']/i);
    const csrfToken = csrfMatch ? csrfMatch[1] : (cookies['csrf_cookie_name'] || '');

    // 2. Request gambar captcha menggunakan cookie yang sama
    const rand = Math.floor(Math.random() * 1000000000) + 1000000000;
    const captchaRes = await axios.get(`${HTS_BASE_URL}/captcha?rand=${rand}`, {
      headers: {
        'Cookie': formatCookieHeader(cookies),
        'Referer': `${HTS_BASE_URL}/`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      responseType: 'arraybuffer',
      timeout: 10000
    });

    // Update cookie jika captcha memberikan set-cookie tambahan
    const mergedCookies = parseCookies(captchaRes.headers['set-cookie'], cookies);

    // Konversi buffer gambar ke Base64 Data URL
    const base64Image = `data:image/png;base64,${Buffer.from(captchaRes.data).toString('base64')}`;

    // Simpan cookie & token sementara ke database untuk user bersangkutan
    if (userId) {
      await prisma.htsUserSession.upsert({
        where: { user_id: parseInt(userId) },
        update: {
          cookie_data: JSON.stringify({ cookies: mergedCookies, csrfToken }),
          is_logged_in: false
        },
        create: {
          user_id: parseInt(userId),
          cookie_data: JSON.stringify({ cookies: mergedCookies, csrfToken }),
          is_logged_in: false
        }
      });
    }

    return {
      success: true,
      captchaImage: base64Image,
      csrfToken
    };
  } catch (error) {
    console.error('[HTS Service] Gagal mengambil captcha live:', error.message);
    throw new Error('Gagal terhubung ke server portal HTS Diskomdigi');
  }
};

// 2. Melakukan Login ke Portal HTS menggunakan Kredensial Petugas
const login = async (userId, email, password, captchaCode) => {
  if (!email || !password || !captchaCode) {
    throw new Error('Email, password, dan kode captcha wajib diisi');
  }

  // 1. Ambil data sesi sementara yang dibuat saat getCaptchaStream
  const userSession = await prisma.htsUserSession.findUnique({
    where: { user_id: parseInt(userId) }
  });

  if (!userSession || !userSession.cookie_data) {
    throw new Error('Sesi captcha tidak ditemukan, silakan refresh captcha terlebih dahulu');
  }

  let sessionState;
  try {
    sessionState = JSON.parse(userSession.cookie_data);
  } catch (e) {
    sessionState = {};
  }

  const initialCookies = sessionState.cookies || {};
  const csrfToken = sessionState.csrfToken || '';

  // Siapkan form body x-www-form-urlencoded
  const params = new URLSearchParams();
  params.append('csrf_test_name', csrfToken);
  params.append('email', email.trim());
  params.append('password', password);
  params.append('captcha_code', captchaCode.trim());

  try {
    const loginRes = await axios.post(`${HTS_BASE_URL}/login`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': formatCookieHeader(initialCookies),
        'Referer': `${HTS_BASE_URL}/login`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': HTS_BASE_URL
      },
      maxRedirects: 0, // Tangkap redirect status 302/303
      validateStatus: (status) => status >= 200 && status < 400,
      timeout: 15000
    });

    const updatedCookies = parseCookies(loginRes.headers['set-cookie'], initialCookies);

    // Verifikasi apakah login berhasil
    // Jika status 302/303 mengarah ke dashboard/list_aduan, atau verifikasi endpoint notifikasi
    let isSuccess = false;
    let location = loginRes.headers['location'] || '';

    if (location.includes('dashboard') || location.includes('list_aduan') || loginRes.status === 303 || loginRes.status === 302) {
      isSuccess = true;
    }

    // Lakukan verifikasi riil dengan memanggil /api/notif
    if (isSuccess) {
      try {
        const testRes = await axios.get(`${HTS_BASE_URL}/api/notif`, {
          headers: {
            'Cookie': formatCookieHeader(updatedCookies),
            'User-Agent': 'Mozilla/5.0'
          },
          timeout: 5000
        });
        if (testRes.status === 200) {
          isSuccess = true;
        }
      } catch (checkErr) {
        console.warn('[HTS Service] Test notif check warning:', checkErr.message);
      }
    }

    // Jika response HTML mengembalikan halaman login kembali
    if (!isSuccess && typeof loginRes.data === 'string') {
      if (loginRes.data.includes('captcha') || loginRes.data.includes('salah')) {
        throw new Error('Kode captcha salah atau kredensial tidak cocok');
      }
    }

    if (!isSuccess) {
      throw new Error('Gagal login ke portal HTS. Periksa email, password, dan kode captcha Anda.');
    }

    // Simpan sesi aktif ke database
    await prisma.htsUserSession.update({
      where: { user_id: parseInt(userId) },
      data: {
        cookie_data: JSON.stringify({ cookies: updatedCookies }),
        is_logged_in: true,
        last_login: new Date()
      }
    });

    // Simpan email HTS ke profil pengguna
    await prisma.user.update({
      where: { id: parseInt(userId) },
      data: { hts_email: email.trim() }
    });

    return {
      success: true,
      message: `Berhasil terhubung ke portal HTS Diskomdigi sebagai ${email}`,
      email: email.trim()
    };
  } catch (error) {
    if (error.response && error.response.data && typeof error.response.data === 'string' && error.response.data.includes('salah')) {
      throw new Error('Kredensial atau kode captcha salah. Silakan coba lagi.');
    }
    console.error('[HTS Service] Login error:', error.message);
    throw new Error(error.message || 'Gagal login ke portal HTS Diskomdigi');
  }
};

// 3. Mengecek Status Sesi Login User
const checkSession = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId) },
    include: { hts_session: true }
  });

  if (!user || !user.hts_session || !user.hts_session.is_logged_in) {
    return { isLoggedIn: false };
  }

  let sessionState;
  try {
    sessionState = JSON.parse(user.hts_session.cookie_data);
  } catch (e) {
    return { isLoggedIn: false };
  }

  const cookies = sessionState.cookies || {};
  if (!cookies['ci_session']) {
    return { isLoggedIn: false };
  }

  // Ping ringan ke /api/notif untuk memastikan session belum expired di server HTS
  try {
    const res = await axios.get(`${HTS_BASE_URL}/api/notif`, {
      headers: {
        'Cookie': formatCookieHeader(cookies),
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 5000
    });

    if (res.status === 200 && res.data) {
      return {
        isLoggedIn: true,
        email: user.hts_email || user.email,
        lastLogin: user.hts_session.last_login
      };
    } else {
      // Sesi habis di server HTS
      await prisma.htsUserSession.update({
        where: { user_id: parseInt(userId) },
        data: { is_logged_in: false }
      });
      return { isLoggedIn: false, expired: true };
    }
  } catch (err) {
    // Jika 302 redirect ke login, tandai expired
    if (err.response && (err.response.status === 302 || err.response.status === 401 || err.response.status === 403)) {
      await prisma.htsUserSession.update({
        where: { user_id: parseInt(userId) },
        data: { is_logged_in: false }
      });
      return { isLoggedIn: false, expired: true };
    }
    // Jika kendala timeout atau jaringan sementara, pertahankan status logged_in
    return {
      isLoggedIn: true,
      email: user.hts_email || user.email,
      lastLogin: user.hts_session.last_login,
      offline: true
    };
  }
};

// 4. Logout / Putus Sambungan Sesi HTS
const logout = async (userId) => {
  await prisma.htsUserSession.updateMany({
    where: { user_id: parseInt(userId) },
    data: {
      is_logged_in: false,
      cookie_data: ''
    }
  });
  return { success: true, message: 'Koneksi portal HTS berhasil diputus' };
};

// Helper: Ambil cookies dan CSRF token aktif untuk request create/solve
const getActiveUserCookiesAndCsrf = async (userId) => {
  const userSession = await prisma.htsUserSession.findUnique({
    where: { user_id: parseInt(userId) }
  });

  if (!userSession || !userSession.is_logged_in) {
    throw new Error('Sesi HTS belum terhubung. Silakan login ke portal HTS terlebih dahulu.');
  }

  let sessionState;
  try {
    sessionState = JSON.parse(userSession.cookie_data);
  } catch (e) {
    throw new Error('Format sesi HTS rusak, silakan login ulang.');
  }

  const cookies = sessionState.cookies || {};
  return {
    cookies,
    cookieHeader: formatCookieHeader(cookies),
    csrfToken: cookies['csrf_cookie_name'] || ''
  };
};

// Helper: Parse PIC IDs ke array string
const parsePicIds = (input) => {
  if (!input) return ['14'];
  if (Array.isArray(input)) return input.map(String).filter(Boolean);
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch (e) {}
    if (input.includes(',')) return input.split(',').map(s => s.trim()).filter(Boolean);
    return [input.trim()];
  }
  return [String(input)];
};

// 5. Otomasi Pipeline Pembuatan Tiket di Portal HTS (submit_aduan -> submit_aduan_status -> submit_pic)
const createTicketPipeline = async (userId, ticketData) => {
  const {
    cust,
    wa,
    opd,
    induk_opd_id,
    tgltshoot,
    jam_problem,
    kategori,
    sub_kategori,
    detil,
    pic_id,
    pic_ids,
    attachmentUrl,
    attachmentUrls
  } = ticketData;

  const session = await getActiveUserCookiesAndCsrf(userId);
  let cookies = session.cookies;

  // 1. Ambil halaman /tshoot untuk memperbarui CSRF token aktif form
  let activeCsrf = session.csrfToken;
  try {
    const tshootRes = await axios.get(`${HTS_BASE_URL}/tshoot`, {
      headers: {
        'Cookie': formatCookieHeader(cookies),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
    cookies = parseCookies(tshootRes.headers['set-cookie'], cookies);
    const csrfMatch = (tshootRes.data || '').match(/name=["']csrf_test_name["']\s+value=["']([^"']+)["']/i);
    if (csrfMatch && csrfMatch[1]) {
      activeCsrf = csrfMatch[1];
    }
  } catch (err) {
    console.warn('[HTS Service] Gagal refresh CSRF dari /tshoot, gunakan token cookie:', err.message);
  }

  // TAHAP 1: Submit Aduan (/submit_aduan)
  const form1 = new FormData();
  form1.append('csrf_test_name', activeCsrf);
  form1.append('cust', (cust || 'Pelapor').trim());
  form1.append('wa', (wa || '').replace(/[^0-9]/g, ''));
  form1.append('opd', (opd || 'Dinas Komunikasi dan Informatika Provinsi Jawa Tengah').trim());
  form1.append('induk_opd_id', induk_opd_id ? String(induk_opd_id) : '');
  
  // Format tanggal & jam
  const now = new Date();
  const dateStr = tgltshoot || now.toISOString().split('T')[0];
  const timeStr = jam_problem || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  form1.append('tgltshoot', dateStr);
  form1.append('jam_problem', timeStr);

  const catVal = (kategori || 'troubleshoot').toLowerCase();
  form1.append('kategori', catVal);
  if (catVal === 'troubleshoot') {
    form1.append('sub-kategori', sub_kategori || 'DISTRIBUTION NETWORK');
  }

  const cleanDetil = (detil || '').trim();
  if (cleanDetil.length < 10) {
    throw new Error(`Detil Permasalahan wajib diisi minimal 10 karakter untuk portal HTS (saat ini: ${cleanDetil.length} karakter).`);
  }
  form1.append('detil', cleanDetil.substring(0, 250));

  // Handle lampiran jika ada (mendukung multiple lampiran pic[])
  const targetAttachmentUrls = Array.isArray(attachmentUrls) 
    ? attachmentUrls 
    : (attachmentUrl ? [attachmentUrl] : []);

  if (targetAttachmentUrls.length > 0) {
    const path = require('path');
    const fs = require('fs');
    for (const url of targetAttachmentUrls) {
      if (!url) continue;
      const safeFilePath = getSafeUploadPath(url);
      if (safeFilePath) {
        const fileBuffer = fs.readFileSync(safeFilePath);
        const fileName = path.basename(safeFilePath);
        const ext = path.extname(fileName).toLowerCase();
        let mime = 'image/jpeg';
        if (ext === '.png') mime = 'image/png';
        else if (ext === '.pdf') mime = 'application/pdf';
        else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';

        const fileBlob = new Blob([fileBuffer], { type: mime });
        form1.append('pic[]', fileBlob, fileName);
      }
    }
  }

  const res1 = await axios.post(`${HTS_BASE_URL}/submit_aduan`, form1, {
    headers: {
      'Cookie': formatCookieHeader(cookies),
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${HTS_BASE_URL}/tshoot`,
      'User-Agent': 'Mozilla/5.0'
    },
    timeout: 20000
  });

  cookies = parseCookies(res1.headers['set-cookie'], cookies);
  const data1 = res1.data;
  if (!data1 || !data1.success) {
    throw new Error(data1?.message || 'Gagal mengirim form aduan ke HTS');
  }

  // Ekstrak no_trouble dari message
  const match = data1.message.match(/nomor aduan\s+([0-9]+-[A-Za-z0-9_-]+)/i);
  if (!match) {
    throw new Error('Respon HTS tidak memuat format nomor aduan yang valid: ' + data1.message);
  }

  const noTrouble = match[1];

  // Cari ID trouble numerik yang sebenarnya di database HTS melalui get_aduan_data (unsubmitted)
  let idTrouble = noTrouble.split('-')[0];
  try {
    const listRes = await axios.post(`${HTS_BASE_URL}/get_aduan_data`, {
      page: 1,
      limit: 10,
      status: 'unsubmitted'
    }, {
      headers: {
        'Cookie': formatCookieHeader(cookies),
        'User-Agent': 'Mozilla/5.0',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-TOKEN': cookies['csrf_cookie_name'] || activeCsrf,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (listRes.data && Array.isArray(listRes.data.data)) {
      const foundItem = listRes.data.data.find(d => d.no_trouble === noTrouble) || listRes.data.data[0];
      if (foundItem && foundItem.id_trouble) {
        idTrouble = String(foundItem.id_trouble);
      }
    }
  } catch (errList) {
    console.warn('[HTS Service] Gagal query get_aduan_data unsubmitted, fallback ke nomor prefix:', errList.message);
  }

  // TAHAP 2: Submit Aduan Status (/submit_aduan_status)
  // Memindahkan dari unsubmitted ke input-pic
  const form2 = new FormData();
  form2.append('id_trouble', idTrouble);
  form2.append('csrf_test_name', cookies['csrf_cookie_name'] || activeCsrf);

  const res2 = await axios.post(`${HTS_BASE_URL}/submit_aduan_status`, form2, {
    headers: {
      'Cookie': formatCookieHeader(cookies),
      'Referer': `${HTS_BASE_URL}/list_aduan`,
      'User-Agent': 'Mozilla/5.0',
      'X-Requested-With': 'XMLHttpRequest'
    },
    timeout: 15000
  });

  cookies = parseCookies(res2.headers['set-cookie'], cookies);
  if (res2.data && res2.data.success === false) {
    throw new Error(res2.data.message || 'Gagal memindahkan status aduan ke input-pic di HTS');
  }

  // TAHAP 3: Submit PIC (/submit_pic)
  // Menetapkan satu atau banyak PIC penanganan dan memindahkan ke pending
  const targetPicIds = parsePicIds(pic_ids || pic_id);
  const form3 = new FormData();
  form3.append('id_trouble', idTrouble);
  form3.append('csrf_test_name', cookies['csrf_cookie_name'] || activeCsrf);
  // Sesuai skrip frontend HTS: formData.append('pic_id', selectedPICs.join(','))
  form3.append('pic_id', targetPicIds.join(','));

  const res3 = await axios.post(`${HTS_BASE_URL}/submit_pic`, form3, {
    headers: {
      'Cookie': formatCookieHeader(cookies),
      'Referer': `${HTS_BASE_URL}/input_pic_form/${idTrouble}`,
      'User-Agent': 'Mozilla/5.0',
      'X-Requested-With': 'XMLHttpRequest'
    },
    timeout: 15000
  });

  cookies = parseCookies(res3.headers['set-cookie'], cookies);
  if (res3.data && res3.data.success === false) {
    throw new Error(res3.data.message || 'Gagal menetapkan PIC di HTS');
  }

  // Perbarui cookie sesi aktif di database
  await prisma.htsUserSession.update({
    where: { user_id: parseInt(userId) },
    data: {
      cookie_data: JSON.stringify({ cookies }),
      updated_at: new Date()
    }
  });

  return {
    success: true,
    idTrouble,
    noTrouble,
    status: 'PENDING',
    picIds: targetPicIds,
    message: `Tiket resmi HTS #${noTrouble} berhasil diterbitkan dan siap ditangani.`
  };
};

// 6. Menyelesaikan Tiket di Portal HTS (Submit Teknis / Solusi Masalah)
const solveTicketHts = async (userId, htsTicketId, technicalData = {}) => {
  if (!htsTicketId) {
    throw new Error('Nomor atau ID tiket HTS wajib disediakan');
  }

  const {
    detil,
    pic_id,
    tglteknis,
    jam_problem,
    attachmentUrl,
    attachmentUrls
  } = technicalData;

  // Ekstrak ID numerik trouble jika formatnya nomor lengkap seperti "2025-TShoot-2026-jateng-09"
  let idTrouble = String(htsTicketId).includes('-') ? String(htsTicketId).split('-')[0] : String(htsTicketId);

  // Ambil sesi cookie aktif petugas
  let { cookies, csrfToken: activeCsrf } = await getActiveUserCookiesAndCsrf(userId);

  // Jika input berupa nomor trouble, cari ID trouble numerik yang sebenarnya dari get_aduan_data (pending)
  if (String(htsTicketId).includes('-')) {
    let lookupOk = false;
    try {
      const pendingRes = await axios.post(`${HTS_BASE_URL}/get_aduan_data`, {
        page: 1,
        limit: 20,
        status: 'pending'
      }, {
        headers: {
          'Cookie': formatCookieHeader(cookies),
          'User-Agent': 'Mozilla/5.0',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-TOKEN': cookies['csrf_cookie_name'] || activeCsrf,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (pendingRes.data && Array.isArray(pendingRes.data.data)) {
        const matchItem = pendingRes.data.data.find(d => 
          d.no_trouble === String(htsTicketId) || String(d.id_trouble) === String(htsTicketId)
        );
        if (matchItem && matchItem.id_trouble) {
          idTrouble = String(matchItem.id_trouble);
          lookupOk = true;
        }
      }
    } catch (errP) {
      console.error('[HTS Service] Gagal query pending aduan:', errP.message);
    }

    if (!lookupOk) {
      // Rekonsiliasi Idempotensi: Cek apakah tiket sebenarnya sudah SOLVED di portal HTS (EDGE-01)
      try {
        const checkSolved = await lookupTicketByNumber(userId, htsTicketId);
        if (checkSolved && checkSolved.status === 'SOLVED') {
          console.log(`[HTS Service] Tiket #${htsTicketId} sudah berstatus SOLVED di portal HTS (rekonsiliasi berhasil).`);
          return {
            success: true,
            alreadySolved: true,
            message: `Tiket #${htsTicketId} sudah berstatus SOLVED di portal HTS.`,
            idTrouble: checkSolved.idTrouble
          };
        }
      } catch (recErr) {
        // Abaikan jika tidak ditemukan
      }

      throw new Error(`Tiket HTS #${htsTicketId} tidak ditemukan dalam daftar PENDING di portal HTS. Periksa status di portal HTS atau tautkan ulang nomor tiket.`);
    }
  }

  // TAHAP 1: Submit Input Teknis (/submit_input_teknis)
  const form1 = new FormData();
  form1.append('id_trouble', idTrouble);
  form1.append('csrf_test_name', cookies['csrf_cookie_name'] || activeCsrf);

  try {
    const res1 = await axios.post(`${HTS_BASE_URL}/submit_input_teknis`, form1, {
      headers: {
        'Cookie': formatCookieHeader(cookies),
        'Referer': `${HTS_BASE_URL}/tshoot`,
        'User-Agent': 'Mozilla/5.0',
        'X-Requested-With': 'XMLHttpRequest'
      },
      timeout: 15000
    });
    cookies = parseCookies(res1.headers['set-cookie'], cookies);
  } catch (err1) {
    console.warn('[HTS Service] Notice /submit_input_teknis:', err1.message);
  }

  // TAHAP 1.5: GET /submit_teknis_form untuk mengambil form dan token CSRF mutakhir
  let finalCsrf = cookies['csrf_cookie_name'] || activeCsrf;
  try {
    const resForm = await axios.get(`${HTS_BASE_URL}/submit_teknis_form`, {
      headers: {
        'Cookie': formatCookieHeader(cookies),
        'Referer': `${HTS_BASE_URL}/tshoot`,
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 15000
    });
    cookies = parseCookies(resForm.headers['set-cookie'], cookies);
    const formHtml = resForm.data || '';
    const csrfMatch = formHtml.match(/name=["']csrf_test_name["']\s+value=["']([^"']+)["']/i);
    if (csrfMatch && csrfMatch[1]) {
      finalCsrf = csrfMatch[1];
    }
  } catch (errForm) {
    console.warn('[HTS Service] Notice /submit_teknis_form:', errForm.message);
  }

  // TAHAP 2: Submit Form Teknis (/submit_teknis)
  const form2 = new FormData();
  form2.append('csrf_test_name', finalCsrf);
  form2.append('id_trouble', idTrouble);
  form2.append('tglteknis', tglteknis || new Date().toISOString().split('T')[0]);
  form2.append('jam_problem', jam_problem || new Date().toTimeString().split(' ')[0].substring(0, 5));
  form2.append('detil', detil && detil.trim() ? detil.trim() : 'Permasalahan telah selesai ditangani secara teknis.');
  const targetPicIds = parsePicIds(technicalData.pic_ids || pic_id);
  // Sesuai skrip frontend HTS: formData.append('pic_id', selectedPICs.join(','))
  form2.append('pic_id', targetPicIds.join(','));

  // Handle bukti penanganan (pic[]) jika ada (mendukung multiple lampiran bukti)
  const targetAttachmentUrls = Array.isArray(attachmentUrls) 
    ? attachmentUrls 
    : (attachmentUrl ? [attachmentUrl] : []);

  if (targetAttachmentUrls.length > 0) {
    try {
      const path = require('path');
      const fs = require('fs');
      for (const url of targetAttachmentUrls) {
        if (!url) continue;
        const safeFilePath = getSafeUploadPath(url);
        if (safeFilePath) {
          const fileBuffer = fs.readFileSync(safeFilePath);
          const fileName = path.basename(safeFilePath);
          const ext = path.extname(fileName).toLowerCase();
          let mime = 'image/jpeg';
          if (ext === '.png') mime = 'image/png';
          else if (ext === '.pdf') mime = 'application/pdf';
          else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';

          const fileBlob = new Blob([fileBuffer], { type: mime });
          form2.append('pic[]', fileBlob, fileName);
        }
      }
    } catch (e) {
      console.warn('[HTS Service] Gagal memproses file lampiran bukti teknis:', e.message);
    }
  }

  const res2 = await axios.post(`${HTS_BASE_URL}/submit_teknis`, form2, {
    headers: {
      'Cookie': formatCookieHeader(cookies),
      'Referer': `${HTS_BASE_URL}/submit_teknis_form`,
      'User-Agent': 'Mozilla/5.0',
      'X-Requested-With': 'XMLHttpRequest'
    },
    timeout: 20000
  });

  cookies = parseCookies(res2.headers['set-cookie'], cookies);

  // Perbarui cookie sesi aktif di database
  await prisma.htsUserSession.update({
    where: { user_id: parseInt(userId) },
    data: {
      cookie_data: JSON.stringify({ cookies }),
      updated_at: new Date()
    }
  });

  const data2 = res2.data;
  if (!data2 || !data2.success) {
    throw new Error(data2?.message || 'Gagal menyimpan data penanganan teknis di portal HTS');
  }

  return {
    success: true,
    idTrouble,
    status: 'SOLVED',
    picIds: targetPicIds,
    message: data2.message || `Tiket HTS #${htsTicketId} berhasil diselesaikan.`
  };
};

// 6. Mencari dan memvalidasi keberadaan tiket di portal HTS berdasarkan nomor aduan (Fase 7 - Disaster Recovery)
const lookupTicketByNumber = async (userId, noTroubleInput) => {
  if (!noTroubleInput) throw new Error('Nomor aduan HTS wajib diisi');
  
  // Bersihkan format nomor tiket (hilangkan karakter '#' dan spasi)
  const noTrouble = String(noTroubleInput).replace(/^#/, '').trim();
  const idTroublePrefix = noTrouble.split('-')[0];

  const session = await getActiveUserCookiesAndCsrf(userId);
  const cookies = session.cookies;
  const activeCsrf = cookies['csrf_cookie_name'] || session.csrfToken;

  // Cek list_aduan melalui get_aduan_data dengan prioritas status umum
  const statusesToCheck = ['pending', 'input-pic', 'unsubmitted', 'solved'];
  let foundTicket = null;

  for (const status of statusesToCheck) {
    try {
      const listRes = await axios.post(`${HTS_BASE_URL}/get_aduan_data`, {
        page: 1,
        limit: 50,
        status: status
      }, {
        headers: {
          'Cookie': formatCookieHeader(cookies),
          'User-Agent': 'Mozilla/5.0',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-TOKEN': activeCsrf,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (listRes.data && Array.isArray(listRes.data.data)) {
        const match = listRes.data.data.find(d => 
          String(d.no_trouble).trim().toLowerCase() === noTrouble.toLowerCase() ||
          String(d.id_trouble) === idTroublePrefix
        );
        if (match) {
          foundTicket = {
            idTrouble: String(match.id_trouble || idTroublePrefix),
            noTrouble: match.no_trouble || noTrouble,
            status: (match.status || status).toUpperCase(),
            kategori: match.kategori || 'troubleshoot',
            subKategori: match.sub_kategori || null,
            detil: match.detil || match.permasalahan || null,
            picIds: match.pic_id ? parsePicIds(match.pic_id) : ['14']
          };
          break;
        }
      }
    } catch (err) {
      console.warn(`[HTS Service] Lookup status ${status} warning:`, err.message);
    }
  }

  // Jika tiket tidak ditemukan di portal HTS setelah mengecek seluruh status, jangan karang status palsu (LOGIC-01)
  if (!foundTicket) {
    throw new Error(`Nomor aduan HTS "${noTrouble}" tidak ditemukan di portal HTS.`);
  }

  return foundTicket;
};

// 7. Melengkapi penugasan PIC untuk tiket HTS yang berstatus INPUT_PIC (Fase 7)
const completePicPipeline = async (userId, idTrouble, picIds) => {
  const session = await getActiveUserCookiesAndCsrf(userId);
  let cookies = session.cookies;
  const activeCsrf = cookies['csrf_cookie_name'] || session.csrfToken;

  const targetPicIds = parsePicIds(picIds);
  const picString = targetPicIds.join(',');

  const FormData = require('form-data');
  const form3 = new FormData();
  form3.append('id_trouble', idTrouble);
  form3.append('pic_id', picString);
  form3.append('csrf_test_name', activeCsrf);

  await axios.post(`${HTS_BASE_URL}/submit_pic`, form3, {
    headers: {
      ...form3.getHeaders(),
      'Cookie': formatCookieHeader(cookies),
      'Referer': `${HTS_BASE_URL}/list_aduan`,
      'User-Agent': 'Mozilla/5.0',
      'X-Requested-With': 'XMLHttpRequest'
    },
    timeout: 15000
  });

  return {
    success: true,
    status: 'PENDING',
    picIds: targetPicIds
  };
};

module.exports = {
  HTS_BASE_URL,
  getCaptchaStream,
  login,
  checkSession,
  logout,
  getActiveUserCookiesAndCsrf,
  createTicketPipeline,
  solveTicketHts,
  lookupTicketByNumber,
  completePicPipeline,
  formatCookieHeader,
  parseCookies
};


