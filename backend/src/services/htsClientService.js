const axios = require('axios');
const prisma = require('../config/db');

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
    attachmentUrl
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
  form1.append('opd', (opd || 'Masyarakat / Instansi').trim());
  form1.append('induk_opd_id', induk_opd_id ? String(induk_opd_id) : '57');
  
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

  form1.append('detil', (detil && detil.trim().length >= 5 ? detil.trim() : 'Keluhan dari WhatsApp Helpdesk').substring(0, 250));

  // Handle lampiran jika ada
  if (attachmentUrl) {
    const path = require('path');
    const fs = require('fs');
    const localFilePath = path.join(__dirname, '../../', attachmentUrl.replace(/^\//, ''));
    if (fs.existsSync(localFilePath)) {
      const fileBuffer = fs.readFileSync(localFilePath);
      const fileName = path.basename(localFilePath);
      const mime = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const fileBlob = new Blob([fileBuffer], { type: mime });
      form1.append('pic[]', fileBlob, fileName);
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

  // Ekstrak no_trouble dan id_trouble dari message
  const match = data1.message.match(/nomor aduan\s+([0-9]+-[A-Za-z0-9_-]+)/i);
  if (!match) {
    throw new Error('Respon HTS tidak memuat format nomor aduan yang valid: ' + data1.message);
  }

  const noTrouble = match[1];
  const idTrouble = noTrouble.split('-')[0];

  // TAHAP 2: Submit Aduan Status (/submit_aduan_status)
  // Memindahkan dari unsubmitted ke input-pic
  const form2 = new FormData();
  form2.append('id_trouble', idTrouble);
  form2.append('csrf_test_name', cookies['csrf_cookie_name'] || activeCsrf);

  const res2 = await axios.post(`${HTS_BASE_URL}/submit_aduan_status`, form2, {
    headers: {
      'Cookie': formatCookieHeader(cookies),
      'Referer': `${HTS_BASE_URL}/list_aduan`,
      'User-Agent': 'Mozilla/5.0'
    },
    timeout: 15000
  });

  cookies = parseCookies(res2.headers['set-cookie'], cookies);

  // TAHAP 3: Submit PIC (/submit_pic)
  // Menetapkan PIC penanganan dan memindahkan ke pending
  const targetPicId = pic_id ? String(pic_id) : '14'; // Default: Helpdesk - Ori (14)
  const form3 = new FormData();
  form3.append('id_trouble', idTrouble);
  form3.append('pic_id', targetPicId);
  form3.append('csrf_test_name', cookies['csrf_cookie_name'] || activeCsrf);

  const res3 = await axios.post(`${HTS_BASE_URL}/submit_pic`, form3, {
    headers: {
      'Cookie': formatCookieHeader(cookies),
      'Referer': `${HTS_BASE_URL}/input_pic_form/${idTrouble}`,
      'User-Agent': 'Mozilla/5.0'
    },
    timeout: 15000
  });

  cookies = parseCookies(res3.headers['set-cookie'], cookies);

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
    attachmentUrl
  } = technicalData;

  // Ekstrak ID numerik trouble jika formatnya nomor lengkap seperti "2025-TShoot-2026-jateng-09"
  const idTrouble = String(htsTicketId).includes('-') ? String(htsTicketId).split('-')[0] : String(htsTicketId);

  // Ambil sesi cookie aktif petugas
  let { cookies, csrfToken: activeCsrf } = await getActiveUserCookiesAndCsrf(userId);

  // TAHAP 1: Submit Input Teknis (/submit_input_teknis)
  const form1 = new FormData();
  form1.append('id_trouble', idTrouble);
  form1.append('csrf_test_name', cookies['csrf_cookie_name'] || activeCsrf);

  try {
    const res1 = await axios.post(`${HTS_BASE_URL}/submit_input_teknis`, form1, {
      headers: {
        'Cookie': formatCookieHeader(cookies),
        'Referer': `${HTS_BASE_URL}/tshoot`,
        'User-Agent': 'Mozilla/5.0'
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
  form2.append('detil', detil || 'Permasalahan telah selesai ditangani secara teknis.');
  form2.append('pic_id', pic_id ? String(pic_id) : '14');

  // Handle bukti penanganan (pic[]) jika ada
  if (attachmentUrl) {
    try {
      const path = require('path');
      const fs = require('fs');
      const cleanPath = attachmentUrl.replace(/^\/uploads\//, '');
      const filePath = path.join(__dirname, '../../uploads', cleanPath);
      if (fs.existsSync(filePath)) {
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);
        form2.append('pic[]', new Blob([fileBuffer]), fileName);
      } else {
        form2.append('pic[]', new Blob([]), '');
      }
    } catch (e) {
      form2.append('pic[]', new Blob([]), '');
    }
  } else {
    form2.append('pic[]', new Blob([]), '');
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
    message: data2.message || `Tiket HTS #${htsTicketId} berhasil diselesaikan.`
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
  formatCookieHeader,
  parseCookies
};

