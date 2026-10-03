const htsClientService = require('../services/htsClientService');

// Mengecek status koneksi HTS user saat ini
const getStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const status = await htsClientService.checkSession(userId);
    res.json(status);
  } catch (error) {
    console.error('[HTS Controller] Error checking status:', error);
    res.status(500).json({ error: error.message || 'Gagal memeriksa status koneksi HTS' });
  }
};

// Mengambil gambar CAPTCHA live dari portal HTS
const getCaptcha = async (req, res) => {
  try {
    const userId = req.user.id;
    const captchaData = await htsClientService.getCaptchaStream(userId);
    res.json(captchaData);
  } catch (error) {
    console.error('[HTS Controller] Error fetching captcha:', error);
    res.status(500).json({ error: error.message || 'Gagal mengambil gambar CAPTCHA dari portal HTS' });
  }
};

// Melakukan login ke portal HTS
const postLogin = async (req, res) => {
  const { email, password, captcha_code } = req.body;
  const userId = req.user.id;

  if (!email || !password || !captcha_code) {
    return res.status(400).json({ error: 'Email, password, dan kode CAPTCHA wajib diisi' });
  }

  try {
    const result = await htsClientService.login(userId, email, password, captcha_code);
    res.json(result);
  } catch (error) {
    console.error('[HTS Controller] Login error:', error.message);
    res.status(400).json({ error: error.message || 'Gagal melakukan login ke portal HTS' });
  }
};

// Memutuskan koneksi HTS (Logout)
const postLogout = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await htsClientService.logout(userId);
    res.json(result);
  } catch (error) {
    console.error('[HTS Controller] Logout error:', error);
    res.status(500).json({ error: error.message || 'Gagal memutuskan koneksi HTS' });
  }
};

// Mengambil Master Data Dropdown Portal HTS (OPD, Kategori, Sub-kategori, PIC)
const masterData = require('../config/htsMasterData.json');

const getMasterData = (req, res) => {
  res.json(masterData);
};

module.exports = {
  getStatus,
  getCaptcha,
  postLogin,
  postLogout,
  getMasterData
};
