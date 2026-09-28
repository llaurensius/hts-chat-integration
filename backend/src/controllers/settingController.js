const prisma = require('../config/db');

// Mengambil pengaturan Auto-Reply Bot
const getAutoReplySetting = async (req, res) => {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: 'auto_reply' }
    });

    if (!setting) {
      return res.json({
        message: 'Baik untuk aduan akan kami cek dahulu mohon ditunggu.',
        isActive: true
      });
    }

    res.json({
      message: setting.value,
      isActive: setting.is_active,
      updatedAt: setting.updated_at
    });
  } catch (error) {
    console.error('[Setting API] Error fetching auto_reply:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Mengubah pengaturan Auto-Reply Bot (Khusus L1)
const updateAutoReplySetting = async (req, res) => {
  const { message, isActive } = req.body;

  if (message !== undefined && message.trim().length === 0) {
    return res.status(400).json({ error: 'Pesan balasan tidak boleh kosong' });
  }

  try {
    const updated = await prisma.setting.upsert({
      where: { key: 'auto_reply' },
      update: {
        ...(message !== undefined && { value: message.trim() }),
        ...(isActive !== undefined && { is_active: Boolean(isActive) })
      },
      create: {
        key: 'auto_reply',
        value: message && message.trim() ? message.trim() : 'Baik untuk aduan akan kami cek dahulu mohon ditunggu.',
        is_active: isActive !== undefined ? Boolean(isActive) : true
      }
    });

    res.json({
      success: true,
      message: updated.value,
      isActive: updated.is_active,
      updatedAt: updated.updated_at
    });
  } catch (error) {
    console.error('[Setting API] Error updating auto_reply:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getAutoReplySetting,
  updateAutoReplySetting
};
