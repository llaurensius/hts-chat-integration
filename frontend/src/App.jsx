import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Search, Send, User, UserPlus, Clock, Phone, AlertCircle, MessageSquare, FileText, Download, Lock, LogOut, Paperclip, CheckCircle, Users, Bot, Trash2, Plus, PhoneCall, Radio, Sliders, Edit2, Check, X, Globe, Key, ShieldCheck, RefreshCw, ExternalLink, Calendar, Image as ImageIcon, History, ChevronDown, ChevronUp, Zap, Bell, BellRing, Volume2, VolumeX, Sparkles, Link as LinkIcon, Eye, Copy } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';

const formatChatTimestamp = (timestamp) => {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    if (isToday(d)) {
      return format(d, 'HH:mm');
    }
    if (isYesterday(d)) {
      return 'Kemarin';
    }
    return format(d, 'dd/MM/yy');
  } catch {
    return '';
  }
};

const BASE_URL = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : `${window.location.protocol}//${window.location.hostname}:3000`;
const API_URL = `${BASE_URL}/api`;
const SOCKET_URL = BASE_URL;

const socket = io(SOCKET_URL, {
  auth: (cb) => {
    cb({ token: localStorage.getItem('token') || '' });
  },
  autoConnect: Boolean(localStorage.getItem('token'))
});

// --- Konfigurasi Axios Global ---
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ==========================================
// 1. KOMPONEN LOGIN
// ==========================================
function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_URL}/auth/login`, { email, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      socket.auth = { token: res.data.token };
      if (!socket.connected) {
        socket.connect();
      } else {
        socket.disconnect().connect();
      }
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login gagal. Periksa kembali email & password.');
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 items-center justify-center font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-[400px]">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Lock className="text-white w-8 h-8" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">HTS Workspace</h2>
        <p className="text-center text-sm text-gray-500 mb-8">Masuk untuk mengelola tiket bantuan</p>
        
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 text-center">{error}</div>}
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
              placeholder="nama@helpdesk.go.id"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition shadow-md mt-4">
            Masuk ke Sistem
          </button>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 2. KOMPONEN DASHBOARD UTAMA
// ==========================================
function Dashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [currentTab, setCurrentTab] = useState('chat'); // 'chat' atau 'report'

  // --- STATE CHAT ---
  const [tickets, setTickets] = useState([]);
  const [activeTicket, setActiveTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [internalNoteText, setInternalNoteText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedInternalFile, setSelectedInternalFile] = useState(null);
  const internalFileInputRef = useRef(null);
  const [previewImageUrl, setPreviewImageUrl] = useState(null);
  const [chatMode, setChatMode] = useState('public'); // 'public' (balas WA pelapor) | 'internal' (catatan internal L1 ke L2)
  
  // State Riwayat Lampau & On-demand WA Archive (Fase 3 V4)
  const [pastTickets, setPastTickets] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showPastHistory, setShowPastHistory] = useState(false);
  const [isFetchingWaHistory, setIsFetchingWaHistory] = useState(false);
  const [waArchivedMessages, setWaArchivedMessages] = useState([]);

  // State Redesign UI & Filter V4 (Fase 4)
  const [ticketFilterTab, setTicketFilterTab] = useState('all'); // 'all' | 'aduan' | 'biasa' | 'pending_hts' | 'closed'
  const [searchTicketQuery, setSearchTicketQuery] = useState('');
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [isTogglingAduan, setIsTogglingAduan] = useState(false);
  const [isClosingGeneral, setIsClosingGeneral] = useState(false);

  // --- STATE & HELPER FASE 5 (QUICK REPLIES, AUDIO & SLA) ---
  const [quickReplies, setQuickReplies] = useState([]);
  const [showQuickRepliesPopup, setShowQuickRepliesPopup] = useState(false);
  const [quickReplyFilter, setQuickReplyFilter] = useState('');
  const [quickReplySelectedIndex, setQuickReplySelectedIndex] = useState(0);
  const [showQuickRepliesModal, setShowQuickRepliesModal] = useState(false);
  const [newQuickReply, setNewQuickReply] = useState({ shortcut: '', title: '', content: '' });
  const [isSavingQuickReply, setIsSavingQuickReply] = useState(false);

  // Audio Notifikasi & Desktop Alert Browser
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [desktopNotifPermission, setDesktopNotifPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  );

  // Filter Laporan SPV (Fase 5)
  const [reportFilterType, setReportFilterType] = useState('all'); // 'all' | 'aduan' | 'biasa'

  // Fungsi Audio Chime Web Audio API (Synthesized Dua Nada Lembut D5 -> A5)
  const playNotificationChime = () => {
    if (isAudioMuted) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {
      // Audio autoplay policy notice
    }
  };

  // Fungsi Notifikasi Desktop Browser (HTML5)
  const triggerDesktopNotification = (title, body, ticketId) => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
        try {
          const notif = new Notification(title, {
            body: body || 'Pesan baru diterima dari WhatsApp pelanggan',
            icon: '/favicon.ico'
          });
          notif.onclick = () => {
            window.focus();
            if (ticketId) {
              const target = tickets.find(t => t.id === ticketId);
              if (target) setActiveTicket(target);
            }
            notif.close();
          };
        } catch (err) {
          console.warn('Desktop notif error:', err);
        }
      }
    }
  };

  const requestDesktopNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setDesktopNotifPermission(perm);
        if (perm === 'granted') {
          playNotificationChime();
          new Notification('Notifikasi Dasbor Aktif', {
            body: 'Anda akan menerima pemberitahuan setiap ada pesan masuk baru dari pelanggan.',
            icon: '/favicon.ico'
          });
        }
      } catch (e) {
        console.warn('Gagal meminta izin notifikasi desktop:', e);
      }
    } else {
      alert('Browser Anda tidak mendukung notifikasi desktop.');
    }
  };

  // Load Quick Replies
  const loadQuickReplies = async () => {
    try {
      const res = await axios.get(`${API_URL}/chat/quick-replies`);
      setQuickReplies(res.data || []);
    } catch (err) {
      console.warn('Gagal memuat template balasan cepat:', err);
    }
  };

  // Filter Quick Replies berdasarkan ketikan setelah slash
  const filteredQuickReplies = quickReplies.filter(r => {
    if (!quickReplyFilter) return true;
    const q = quickReplyFilter.toLowerCase();
    return r.shortcut.toLowerCase().includes(q) || r.title.toLowerCase().includes(q);
  });

  // Handler pergantian teks reply input dengan deteksi slash `/`
  const handleReplyInputChange = (val) => {
    setReplyText(val);
    const slashMatch = val.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);
    if (slashMatch) {
      setQuickReplyFilter(slashMatch[1]);
      setShowQuickRepliesPopup(true);
      setQuickReplySelectedIndex(0);
    } else {
      setShowQuickRepliesPopup(false);
    }
  };

  // Sisipkan template balasan cepat ke kotak chat
  const insertQuickReply = (template) => {
    if (!template) return;
    setReplyText(prev => {
      const replaced = prev.replace(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/, (match) => {
        const leadingSpace = match.startsWith(' ') ? ' ' : '';
        return leadingSpace + template.content;
      });
      return replaced;
    });
    setShowQuickRepliesPopup(false);
    setQuickReplyFilter('');
  };

  // Handler keyboard navigation di input box
  const handleReplyInputKeyDown = (e) => {
    if (showQuickRepliesPopup && filteredQuickReplies.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setQuickReplySelectedIndex(prev => (prev + 1) % filteredQuickReplies.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setQuickReplySelectedIndex(prev => (prev - 1 + filteredQuickReplies.length) % filteredQuickReplies.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredQuickReplies[quickReplySelectedIndex] || filteredQuickReplies[0];
        insertQuickReply(selected);
        return;
      }
      if (e.key === 'Escape') {
        setShowQuickRepliesPopup(false);
        return;
      }
    }
  };

  // Handler Simpan Template Balasan Cepat Baru
  const handleSaveQuickReply = async (e) => {
    e.preventDefault();
    if (!newQuickReply.shortcut.trim() || !newQuickReply.title.trim() || !newQuickReply.content.trim()) {
      return alert('Shortcut, judul, dan isi balasan wajib diisi!');
    }
    setIsSavingQuickReply(true);
    try {
      await axios.post(`${API_URL}/chat/quick-replies`, newQuickReply);
      alert('Template balasan cepat berhasil ditambahkan!');
      setNewQuickReply({ shortcut: '', title: '', content: '' });
      loadQuickReplies();
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal menyimpan template');
    } finally {
      setIsSavingQuickReply(false);
    }
  };

  // Handler Update Template Balasan Cepat
  const handleUpdateQuickReply = async (e) => {
    e.preventDefault();
    if (!editingQuickReply.shortcut.trim() || !editingQuickReply.title.trim() || !editingQuickReply.content.trim()) {
      return alert('Shortcut, judul, dan isi balasan wajib diisi!');
    }
    setIsSavingQuickReply(true);
    try {
      await axios.put(`${API_URL}/chat/quick-replies/${editingQuickReplyId}`, editingQuickReply);
      alert('Template balasan cepat berhasil diperbarui!');
      setEditingQuickReplyId(null);
      setEditingQuickReply({ shortcut: '', title: '', content: '' });
      loadQuickReplies();
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal memperbarui template');
    } finally {
      setIsSavingQuickReply(false);
    }
  };

  // Handler Pencarian Kontak Buku Telepon HP & Master Data Import
  const handleSearchContacts = async (query = '', { append = false } = {}) => {
    if (append) {
      setIsLoadingMoreContacts(true);
    } else {
      setNewChatSearchContact(query);
      setIsSearchingContacts(true);
    }
    try {
      const offset = append ? contactsOffset : 0;
      const params = new URLSearchParams({
        limit: String(CONTACTS_PAGE_SIZE),
        offset: String(offset)
      });
      const q = (query ?? newChatSearchContact).trim();
      if (q) params.set('q', q);

      const res = await axios.get(`${API_URL}/chat/contacts/search?${params.toString()}`);
      const data = res.data || {};
      const page = Array.isArray(data) ? data : (data.contacts || []);

      setNewChatContactsList(prev => (append ? [...prev, ...page] : page));
      setContactsTotal(data.total ?? page.length);
      setContactsHasMore(Boolean(data.hasMore));
      setContactsOffset(offset + page.length);
    } catch (err) {
      console.warn(append ? 'Gagal memuat kontak lanjutan:' : 'Gagal memuat direktori kontak:', err.message);
    } finally {
      setIsSearchingContacts(false);
      setIsLoadingMoreContacts(false);
    }
  };

  const handleLoadMoreContacts = () => {
    if (isLoadingMoreContacts || !contactsHasMore) return;
    handleSearchContacts(newChatSearchContact, { append: true });
  };

  // Handler Hapus Seluruh Data Master Kontak Pelanggan (Admin Only)
  const handleClearAllCustomerContacts = async () => {
    const confirmation = prompt('PERINGATAN: Tindakan ini akan MENGHAPUS SEMUA MASTER KONTAK pelanggan di database.\n\nKetik "HAPUS KONTAK" untuk melanjutkan:');
    if (confirmation !== 'HAPUS KONTAK') {
      if (confirmation !== null) alert('Penghapusan dibatalkan. Kata konfirmasi tidak cocok.');
      return;
    }

    try {
      const res = await axios.delete(`${API_URL}/admin/contacts/clear-all`, {
        data: { force: true }
      });
      alert(res.data?.message || 'Seluruh data master kontak berhasil dihapus bersih');
      setShowImportContactsModal(false);
      handleSearchContacts('');
      loadTickets();
      setActiveTicket(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal menghapus data master kontak');
    }
  };

  // Handler Import Master Data Kontak (Excel / CSV)
  const handleImportContactsSubmit = async (e) => {
    e.preventDefault();
    if (!importContactFile) return alert('Pilih file Excel (.xlsx/.xls) atau CSV terlebih dahulu!');

    const formData = new FormData();
    formData.append('file', importContactFile);

    setIsImportingContacts(true);
    setImportStatsResult(null);
    try {
      const res = await axios.post(`${API_URL}/admin/contacts/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert(res.data?.message || 'Kontak berhasil diimpor!');
      setImportStatsResult(res.data?.stats);
      setImportContactFile(null);
      loadTickets();
      // Segarkan daftar kontak di modal chat baru jika sedang terbuka
      handleSearchContacts('');
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal mengimpor file kontak');
    } finally {
      setIsImportingContacts(false);
    }
  };

  const handleSelectContact = (contact) => {
    setNewChatWaNumber(contact.waNumber);
    setNewChatName(contact.name);
    if (contact.skpdName) setNewChatSkpd(contact.skpdName);
    setNewChatSearchContact('');
  };

  const handleOpenNewChatModal = () => {
    setNewChatSearchContact('');
    handleSearchContacts(''); // Langsung muat seluruh daftar kontak yang tersedia
    setNewChatWaNumber('');
    setNewChatName('');
    setNewChatSkpd('');
    setNewChatInitialMsg('Selamat Pagi/Siang/Malam Bapak/Ibu, Saat ini dengan Helpdesk Data Center Provinsi Jawa Tengah.');
    setNewChatSendInitial(true);
    setNewChatIsAduan(false);
    setShowNewChatModal(true);
  };

  const handleStartNewChatSubmit = async (e) => {
    e.preventDefault();
    if (!newChatWaNumber.trim()) {
      return alert('Nomor WhatsApp tujuan wajib diisi!');
    }
    if (newChatSendInitial && !newChatInitialMsg.trim()) {
      return alert('Pesan pembuka wajib diisi jika opsi kirim pesan aktif!');
    }
    setIsStartingNewChat(true);
    try {
      const res = await axios.post(`${API_URL}/chat/start-new-chat`, {
        waNumber: newChatWaNumber.trim(),
        name: newChatName.trim(),
        skpdName: newChatSkpd.trim(),
        initialMessage: newChatSendInitial ? newChatInitialMsg.trim() : null,
        sendInitialMessage: newChatSendInitial,
        isAduan: newChatIsAduan
      });
      alert(res.data?.message || 'Chat baru berhasil dimulai!');
      setShowNewChatModal(false);
      loadTickets();
      if (res.data?.ticket) {
        setActiveTicket(res.data.ticket);
        loadMessages(res.data.ticket.id);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal memulai chat baru');
    } finally {
      setIsStartingNewChat(false);
    }
  };

  // Handler Mengaktifkan Kembali Tiket yang Telah Selesai (Re-Open Ticket)
  const handleReopenTicket = async () => {
    if (!activeTicket) return;
    const reason = window.prompt(`Aktifkan kembali tiket #${activeTicket.id} (${activeTicket.customer?.name})?\n\nMasukkan alasan pembukaan kembali (opsional):`, 'Ada pertanyaan / kendala lanjutan dari pelanggan');
    if (reason === null) return; // Dibatalkan pengguna

    try {
      const res = await axios.post(`${API_URL}/chat/tickets/${activeTicket.id}/reopen`, {
        reason: reason.trim()
      });
      alert(res.data?.message || 'Tiket berhasil diaktifkan kembali!');
      loadTickets();
      if (res.data?.ticket) {
        setActiveTicket(res.data.ticket);
        loadMessages(res.data.ticket.id);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal mengaktifkan kembali tiket');
    }
  };

  // Handler Lepas Tautan Tiket HTS
  const handleUnlinkHtsTicket = async (htsTicketId, htsNo) => {
    if (!activeTicket) return;
    if (!window.confirm(`Lepas tautan nomor aduan HTS #${htsNo} dari percakapan ini?`)) return;

    try {
      const res = await axios.delete(`${API_URL}/chat/tickets/${activeTicket.id}/hts/${htsTicketId}/unlink`);
      alert(res.data?.message || 'Tautan tiket HTS berhasil dilepas');
      loadTickets();
      if (res.data?.ticket) {
        setActiveTicket(res.data.ticket);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal melepas tautan tiket HTS');
    }
  };

  // Handler Tautkan Nomor Aduan HTS Manual (Fase 7 Disaster Recovery)
  const handleLinkHtsTicket = async (force = false) => {
    const target = syncTargetTicket || activeTicket;
    if (!target) {
      alert('Sesi tiket tidak valid. Silakan pilih kembali tiket aduan dari daftar antrean.');
      return;
    }
    if (!linkHtsNo.trim()) {
      return alert('Nomor aduan HTS wajib diisi!');
    }
    setIsLinkingHts(true);
    setSyncHtsError('');
    try {
      const res = await axios.post(`${API_URL}/chat/tickets/${target.id}/link-hts`, {
        hts_ticket_no: linkHtsNo.trim(),
        category_id: linkHtsCategoryId ? parseInt(linkHtsCategoryId) : null,
        force: force
      });
      alert(res.data?.message || 'Nomor tiket HTS berhasil ditautkan!');
      setShowSyncHtsModal(false);
      setSyncTargetTicket(null);
      setLinkHtsNo('');
      setLinkHtsCategoryId('');
      loadTickets();
      if (res.data?.ticket) setActiveTicket(res.data.ticket);
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.requires_confirmation) {
        if (window.confirm(`${err.response.data.message}

Tetap tautkan tiket ini?`)) {
          return handleLinkHtsTicket(true);
        }
      } else {
        const errorMsg = err.response?.data?.error || err.message || 'Gagal menautkan nomor tiket HTS';
        setSyncHtsError(errorMsg);
        alert(errorMsg);
      }
    } finally {
      setIsLinkingHts(false);
    }
  };

  // Handler Hapus Template Balasan Cepat
  const handleDeleteQuickReply = async (id) => {
    if (!window.confirm('Hapus template balasan cepat ini?')) return;
    try {
      await axios.delete(`${API_URL}/chat/quick-replies/${id}`);
      loadQuickReplies();
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal menghapus template');
    }
  };
  // Helper Waktu & Tanggal Lokal
  const getTodayDate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getCurrentTime = () => {
    const d = new Date();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Helper penyaring dan pengurut PIC: yang tercentang selalu di urutan atas
  const getSortedPics = (pics, selectedIds, searchTerm) => {
    if (!pics || !Array.isArray(pics)) return [];
    const query = (searchTerm || '').trim().toLowerCase();
    const selected = [];
    const unselected = [];
    pics.forEach(p => {
      const isSelected = (selectedIds || []).includes(String(p.id));
      const match = !query || (p.name && p.name.toLowerCase().includes(query));
      if (isSelected) {
        selected.push(p);
      } else if (match) {
        unselected.push(p);
      }
    });
    return [...selected, ...unselected];
  };

  // Helper ekstrak PIC awal yang tersimpan pada tiket
  const getTicketInitialPicIds = (ticket) => {
    if (!ticket || !ticket.hts_pic_ids) return [];
    try {
      const parsed = JSON.parse(ticket.hts_pic_ids);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch (e) {}
    if (typeof ticket.hts_pic_ids === 'string') {
      return ticket.hts_pic_ids.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  };

  // State Close Ticket & Categories
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [categories, setCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [assignCategoryIds, setAssignCategoryIds] = useState([]);
  const [assignServiceType, setAssignServiceType] = useState('TROUBLESHOOTING');

  // State Dual-Close HTS (Fase 3 & 4 + Revisi Spec)
  const [closeHtsTicket, setCloseHtsTicket] = useState(true);
  const [closeHtsPicId, setCloseHtsPicId] = useState('');
  const [closeHtsPicIds, setCloseHtsPicIds] = useState([]);
  const [closeHtsPicSearch, setCloseHtsPicSearch] = useState('');
  const [closeHtsSolution, setCloseHtsSolution] = useState('');
  const [closeHtsTanggal, setCloseHtsTanggal] = useState(getTodayDate());
  const [closeHtsJam, setCloseHtsJam] = useState(getCurrentTime());
  const [closeHtsFile, setCloseHtsFile] = useState(null);
  const [closeHtsUseChatImage, setCloseHtsUseChatImage] = useState(false);
  const [closeHtsChatImagePreview, setCloseHtsChatImagePreview] = useState(null);
  const [closeHtsSelectedInternalUrl, setCloseHtsSelectedInternalUrl] = useState(null);
  const [closeHtsSelectedInternalUrls, setCloseHtsSelectedInternalUrls] = useState([]);
  const [closeHtsTabActive, setCloseHtsTabActive] = useState(null);
  const [closeHtsFormData, setCloseHtsFormData] = useState({});
  const [isClosingTicket, setIsClosingTicket] = useState(false);

  // State Penyelesaian Mandiri Per-HTS di Panel Kanan (V4.3)
  const [showSolveSingleHtsModal, setShowSolveSingleHtsModal] = useState(false);
  const [selectedHtsToSolve, setSelectedHtsToSolve] = useState(null);
  const [singleHtsSolution, setSingleHtsSolution] = useState('');
  const [singleHtsPicIds, setSingleHtsPicIds] = useState([]);
  const [singleHtsPicSearch, setSingleHtsPicSearch] = useState('');
  const [singleHtsTanggal, setSingleHtsTanggal] = useState(getTodayDate());
  const [singleHtsJam, setSingleHtsJam] = useState(getCurrentTime());
  const [singleHtsFiles, setSingleHtsFiles] = useState([]);
  const [singleHtsFile, setSingleHtsFile] = useState(null);
  const [singleHtsUseChatImage, setSingleHtsUseChatImage] = useState(false);
  const [singleHtsSelectedInternalUrls, setSingleHtsSelectedInternalUrls] = useState([]);
  const [isSolvingSingleHts, setIsSolvingSingleHts] = useState(false);

  // State Modal Detail Solusi HTS (V4.3)
  const [showDetailHtsModal, setShowDetailHtsModal] = useState(false);
  const [selectedHtsDetail, setSelectedHtsDetail] = useState(null);
  const [copiedHtsNo, setCopiedHtsNo] = useState(null);

  const handleCopyHtsTicketNo = (ticketNo) => {
    if (!ticketNo) return;
    navigator.clipboard?.writeText(ticketNo);
    setCopiedHtsNo(ticketNo);
    setTimeout(() => setCopiedHtsNo(null), 2000);
  };

  const handleOpenSolveSingleHts = (ht) => {
    setSelectedHtsToSolve(ht);
    const initialPics = getTicketInitialPicIds(ht);
    const fallbackPic = initialPics.length > 0 
      ? initialPics 
      : (activeTicket?.hts_pic_ids ? getTicketInitialPicIds(activeTicket) : ['14']);
    setSingleHtsPicIds(fallbackPic);
    setSingleHtsPicSearch('');
    setSingleHtsTanggal(getTodayDate());
    setSingleHtsJam(getCurrentTime());
    
    // Draf solusi dari L2 jika kategori cocok
    let draftSolution = ht.solution || '';
    if (!draftSolution && ht.category_id && activeTicket?.categories) {
      const catMatch = activeTicket.categories.find(c => c.category_id === ht.category_id);
      if (catMatch?.solution) draftSolution = catMatch.solution;
    }
    setSingleHtsSolution(draftSolution);
    setSingleHtsFiles([]);
    setSingleHtsFile(null);
    setSingleHtsSelectedInternalUrls([]);
    setSingleHtsUseChatImage(false);
    setShowSolveSingleHtsModal(true);
  };

  const handleOpenDetailHts = (ht) => {
    setSelectedHtsDetail(ht);
    setShowDetailHtsModal(true);
  };

  const handleSubmitSolveSingleHts = async (e) => {
    if (e) e.preventDefault();
    if (!singleHtsSolution || singleHtsSolution.trim().length < 10) {
      return alert('Solusi teknis penanganan wajib diisi minimal 10 karakter!');
    }
    if (singleHtsPicIds.length === 0) {
      return alert('Pilih minimal 1 PIC Penanganan Teknis!');
    }
    setIsSolvingSingleHts(true);
    try {
      const formData = new FormData();
      formData.append('solution', singleHtsSolution.trim());
      formData.append('picId', singleHtsPicIds[0]);
      singleHtsPicIds.forEach(pid => formData.append('picIds', pid));
      formData.append('tglteknis', singleHtsTanggal);
      formData.append('jam_problem', singleHtsJam);

      if (singleHtsFiles && singleHtsFiles.length > 0) {
        singleHtsFiles.forEach(f => formData.append('attachment', f));
      } else if (singleHtsFile) {
        formData.append('attachment', singleHtsFile);
      }

      if (singleHtsSelectedInternalUrls && singleHtsSelectedInternalUrls.length > 0) {
        formData.append('selectedAttachmentUrls', JSON.stringify(singleHtsSelectedInternalUrls));
      }

      if (singleHtsUseChatImage) {
        formData.append('useChatImage', 'true');
      }

      const res = await axios.post(
        `${API_URL}/chat/tickets/${activeTicket.id}/hts/${selectedHtsToSolve.id}/solve`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      alert(res.data?.message || 'Tiket HTS berhasil diselesaikan di portal HTS!');
      setShowSolveSingleHtsModal(false);
      setSelectedHtsToSolve(null);
      await loadTickets();
      if (activeTicket?.id) {
        loadMessages(activeTicket.id);
      }
    } catch (err) {
      console.error('Error solve single HTS:', err);
      alert(err.response?.data?.error || 'Gagal menyelesaikan tiket HTS');
    } finally {
      setIsSolvingSingleHts(false);
    }
  };

  // State L2 Tandai Selesai Modal (Fase 3 & 4)
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveSolutionText, setResolveSolutionText] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  // State Reporting
  const [reportTickets, setReportTickets] = useState([]);
  const [selectedReportIds, setSelectedReportIds] = useState([]);

  // State Auto-Reply Bot (Khusus L1)
  const [botMessage, setBotMessage] = useState('');
  const [botIsActive, setBotIsActive] = useState(true);
  const [isSavingBot, setIsSavingBot] = useState(false);

  // State Multi-Kontak Tim L2 (Khusus Admin)
  const [teamCategories, setTeamCategories] = useState([]);
  const [newContactInputs, setNewContactInputs] = useState({});
  const [editingContactId, setEditingContactId] = useState(null);
  const [editContactData, setEditContactData] = useState({ name: '', wa_target: '' });

  // State Edit Identitas Pelapor (Nama, Instansi/SKPD, & Nomor WA) (FIX-05)
  const [showEditCustomerModal, setShowEditCustomerModal] = useState(false);
  const [editCustomerData, setEditCustomerData] = useState({ name: '', skpd_name: '', wa_number: '' });
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  const handleOpenEditCustomerModal = () => {
    if (!activeTicket?.customer) return;
    setEditCustomerData({
      name: activeTicket.customer.name || '',
      skpd_name: activeTicket.customer.skpd_name || '',
      wa_number: activeTicket.customer.wa_number || ''
    });
    setShowEditCustomerModal(true);
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!editCustomerData.name?.trim()) {
      return alert('Nama pelapor tidak boleh kosong!');
    }
    setIsSavingCustomer(true);
    try {
      const res = await axios.put(`${API_URL}/chat/customers/${activeTicket.customer.id}`, {
        name: editCustomerData.name.trim(),
        skpd_name: editCustomerData.skpd_name.trim(),
        wa_number: editCustomerData.wa_number.trim()
      });
      const updatedCustomer = res.data.customer;
      
      setActiveTicket(prev => prev ? {
        ...prev,
        customer: updatedCustomer
      } : null);

      setTickets(prev => prev.map(t => {
        if (t.customer_id === updatedCustomer.id || t.customer?.id === updatedCustomer.id) {
          return { ...t, customer: updatedCustomer };
        }
        return t;
      }));

      setShowEditCustomerModal(false);
      alert('Identitas pelapor berhasil diperbarui.');
      if (activeTicket) loadMessages(activeTicket.id);
    } catch (error) {
      alert(error.response?.data?.error || 'Gagal memperbarui identitas pelapor');
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const activeTicketRef = useRef(activeTicket);
  useEffect(() => {
    activeTicketRef.current = activeTicket;
  }, [activeTicket]);

  // State Integrasi Portal HTS Diskomdigi (Fase 1 V3)
  const [htsStatus, setHtsStatus] = useState({ isLoggedIn: false, email: '' });
  const [showHtsModal, setShowHtsModal] = useState(false);
  const [htsCaptchaImg, setHtsCaptchaImg] = useState('');
  const [htsEmailInput, setHtsEmailInput] = useState('');
  const [htsPasswordInput, setHtsPasswordInput] = useState('');
  const [htsCaptchaInput, setHtsCaptchaInput] = useState('');
  const [isLoadingCaptcha, setIsLoadingCaptcha] = useState(false);
  const [isSubmittingHtsLogin, setIsSubmittingHtsLogin] = useState(false);
  const [htsLoginError, setHtsLoginError] = useState('');

  // State Master Data HTS & Assign Hybrid (Fase 2 V3)
  const [htsMasterData, setHtsMasterData] = useState({
    indukOpd: [],
    kategori: [],
    subKategori: [],
    pics: []
  });
  const [createHtsTicket, setCreateHtsTicket] = useState(false);
  const [autoOpenHtsAfterAssign, setAutoOpenHtsAfterAssign] = useState(false);
  const [assignHtsCust, setAssignHtsCust] = useState('');
  const [assignHtsOpd, setAssignHtsOpd] = useState('');
  const [assignIndukOpdId, setAssignIndukOpdId] = useState('');
  const [assignHtsTanggal, setAssignHtsTanggal] = useState(getTodayDate());
  const [assignHtsJam, setAssignHtsJam] = useState(getCurrentTime());
  const [assignHtsKategori, setAssignHtsKategori] = useState('troubleshoot');
  const [assignHtsSubKategori, setAssignHtsSubKategori] = useState('DISTRIBUTION NETWORK');
  const [assignHtsDetil, setAssignHtsDetil] = useState('');
  const [assignHtsPicId, setAssignHtsPicId] = useState('');
  const [assignHtsPicIds, setAssignHtsPicIds] = useState([]);
  const [assignHtsPicSearch, setAssignHtsPicSearch] = useState('');
  const [assignHtsFile, setAssignHtsFile] = useState(null);
  const [assignHtsUseChatImage, setAssignHtsUseChatImage] = useState(false);
  const [assignHtsChatImagePreview, setAssignHtsChatImagePreview] = useState(null);
  const [opdSearchTerm, setOpdSearchTerm] = useState('');
  const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);

  // State Standalone Sync Modal HTS (Fase 2 V3 + Revisi Spec)
  // State Modal Import Master Data Kontak (Admin Only)
  const [showImportContactsModal, setShowImportContactsModal] = useState(false);
  const [importContactFile, setImportContactFile] = useState(null);
  const [isImportingContacts, setIsImportingContacts] = useState(false);
  const [importStatsResult, setImportStatsResult] = useState(null);

  // State Modal Mulai Chat Baru (Start New Chat Outbound)
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatSearchContact, setNewChatSearchContact] = useState('');
  const [newChatContactsList, setNewChatContactsList] = useState([]);
  const [isSearchingContacts, setIsSearchingContacts] = useState(false);
  // State paginasi direktori kontak (Opsi B: tombol Muat Lebih)
  const [contactsTotal, setContactsTotal] = useState(0);
  const [contactsHasMore, setContactsHasMore] = useState(false);
  const [contactsOffset, setContactsOffset] = useState(0);
  const [isLoadingMoreContacts, setIsLoadingMoreContacts] = useState(false);
  const CONTACTS_PAGE_SIZE = 30;
  const [newChatWaNumber, setNewChatWaNumber] = useState('');
  const [newChatName, setNewChatName] = useState('');
  const [newChatSkpd, setNewChatSkpd] = useState('');
  const [newChatInitialMsg, setNewChatInitialMsg] = useState('');
  const [newChatSendInitial, setNewChatSendInitial] = useState(true);
  const [newChatIsAduan, setNewChatIsAduan] = useState(false);
  const [isStartingNewChat, setIsStartingNewChat] = useState(false);

  const [showSyncHtsModal, setShowSyncHtsModal] = useState(false);
  const [syncTargetTicket, setSyncTargetTicket] = useState(null);
  const [syncHtsTab, setSyncHtsTab] = useState('create'); // 'create' | 'link'
  const [linkHtsNo, setLinkHtsNo] = useState('');
  const [linkHtsCategoryId, setLinkHtsCategoryId] = useState('');
  const [isLinkingHts, setIsLinkingHts] = useState(false);
  const [syncHtsFiles, setSyncHtsFiles] = useState([]); // Multiple files
  const [closeHtsFiles, setCloseHtsFiles] = useState([]); // Multiple files saat close

  // State Edit Quick Reply
  const [editingQuickReplyId, setEditingQuickReplyId] = useState(null);
  const [editingQuickReply, setEditingQuickReply] = useState({ shortcut: '', title: '', content: '' });
  const [syncHtsCust, setSyncHtsCust] = useState('');
  const [syncHtsWa, setSyncHtsWa] = useState('');
  const [syncHtsOpd, setSyncHtsOpd] = useState('');
  const [syncIndukOpdId, setSyncIndukOpdId] = useState('');
  const [syncHtsTanggal, setSyncHtsTanggal] = useState(getTodayDate());
  const [syncHtsJam, setSyncHtsJam] = useState(getCurrentTime());
  const [syncHtsKategori, setSyncHtsKategori] = useState('troubleshoot');
  const [syncHtsSubKategori, setSyncHtsSubKategori] = useState('DISTRIBUTION NETWORK');
  const [syncHtsDetil, setSyncHtsDetil] = useState('');
  const [syncHtsPicId, setSyncHtsPicId] = useState('');
  const [syncHtsPicIds, setSyncHtsPicIds] = useState([]);
  const [syncHtsPicSearch, setSyncHtsPicSearch] = useState('');
  const [syncHtsFile, setSyncHtsFile] = useState(null);
  const [syncHtsUseChatImage, setSyncHtsUseChatImage] = useState(false);
  const [syncHtsChatImagePreview, setSyncHtsChatImagePreview] = useState(null);
  const [syncOpdSearchTerm, setSyncOpdSearchTerm] = useState('');
  const [isSubmittingSyncHts, setIsSubmittingSyncHts] = useState(false);
  const [syncHtsError, setSyncHtsError] = useState('');

  const fetchHtsStatus = async () => {
    try {
      const res = await axios.get(`${API_URL}/hts/status`);
      setHtsStatus(res.data || { isLoggedIn: false });
    } catch (e) {
      console.warn('Gagal cek status HTS:', e.message);
    }
  };

  const fetchHtsMasterData = async () => {
    try {
      const res = await axios.get(`${API_URL}/hts/master-data`);
      if (res.data) {
        setHtsMasterData(res.data);
      }
    } catch (err) {
      console.warn('Gagal memuat master data HTS:', err.message);
    }
  };

  const handleAssignOpdSearch = (term) => {
    setOpdSearchTerm(term);
    if (!term.trim()) {
      setAssignIndukOpdId('');
      return;
    }
    const filtered = (htsMasterData.indukOpd || []).filter(o => 
      o.name.toLowerCase().includes(term.toLowerCase())
    );
    if (filtered.length > 0) {
      const alreadyInFiltered = filtered.some(o => String(o.id) === String(assignIndukOpdId));
      if (!alreadyInFiltered) {
        setAssignIndukOpdId(String(filtered[0].id));
      }
    } else {
      setAssignIndukOpdId('');
    }
  };

  const handleSyncOpdSearch = (term) => {
    setSyncOpdSearchTerm(term);
    if (!term.trim()) {
      setSyncIndukOpdId('');
      return;
    }
    const filtered = (htsMasterData.indukOpd || []).filter(o => 
      o.name.toLowerCase().includes(term.toLowerCase())
    );
    if (filtered.length > 0) {
      const alreadyInFiltered = filtered.some(o => String(o.id) === String(syncIndukOpdId));
      if (!alreadyInFiltered) {
        setSyncIndukOpdId(String(filtered[0].id));
      }
    } else {
      setSyncIndukOpdId('');
    }
  };

  const fetchHtsCaptcha = async () => {
    setIsLoadingCaptcha(true);
    setHtsLoginError('');
    try {
      const res = await axios.get(`${API_URL}/hts/captcha`);
      if (res.data?.captchaImage) {
        setHtsCaptchaImg(res.data.captchaImage);
      }
    } catch (e) {
      setHtsLoginError(e.response?.data?.error || 'Gagal memuat CAPTCHA dari HTS Diskomdigi');
    } finally {
      setIsLoadingCaptcha(false);
    }
  };

  const handleOpenHtsModal = () => {
    setShowHtsModal(true);
    setHtsCaptchaInput('');
    setHtsLoginError('');
    if (!htsEmailInput && (currentUser?.hts_email || htsStatus?.email)) {
      setHtsEmailInput(currentUser?.hts_email || htsStatus?.email);
    }
    fetchHtsCaptcha();
  };

  const handleHtsLogin = async (e) => {
    e.preventDefault();
    if (!htsEmailInput || !htsPasswordInput || !htsCaptchaInput) {
      setHtsLoginError('Email, password, dan kode captcha wajib diisi');
      return;
    }

    setIsSubmittingHtsLogin(true);
    setHtsLoginError('');
    try {
      const res = await axios.post(`${API_URL}/hts/login`, {
        email: htsEmailInput,
        password: htsPasswordInput,
        captcha_code: htsCaptchaInput
      });

      alert(res.data?.message || 'Berhasil terhubung ke portal HTS!');
      setShowHtsModal(false);
      setHtsPasswordInput('');
      setHtsCaptchaInput('');
      fetchHtsStatus();
    } catch (err) {
      setHtsLoginError(err.response?.data?.error || 'Gagal login ke portal HTS. Silakan coba lagi.');
      fetchHtsCaptcha();
    } finally {
      setIsSubmittingHtsLogin(false);
    }
  };

  const handleHtsLogout = async () => {
    if (!window.confirm('Apakah Anda yakin ingin memutuskan sambungan sesi akun HTS?')) return;
    try {
      await axios.post(`${API_URL}/hts/logout`);
      setHtsStatus({ isLoggedIn: false, email: '' });
      alert('Koneksi portal HTS berhasil diputus.');
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal memutuskan koneksi HTS');
    }
  };

  const handleServiceTypeChange = (newType) => {
    setAssignServiceType(newType);
    if (newType === 'TROUBLESHOOTING') setAssignHtsKategori('troubleshoot');
    else if (newType === 'REQUEST_LAYANAN') setAssignHtsKategori('request');
    else if (newType === 'MONITORING') setAssignHtsKategori('monitoring');
  };

  const handleAssignHtsKategoriChange = (newCat) => {
    setAssignHtsKategori(newCat);
    if (newCat === 'troubleshoot') setAssignServiceType('TROUBLESHOOTING');
    else if (newCat === 'request') setAssignServiceType('REQUEST_LAYANAN');
    else if (newCat === 'monitoring') setAssignServiceType('MONITORING');
  };

  const handleOpenAssignModal = () => {
    if (!activeTicket) return;
    const currentCatIds = activeTicket.categories?.map(tc => tc.category_id || tc.category?.id).filter(Boolean) || [];
    setAssignCategoryIds(currentCatIds);
    setAssignServiceType(activeTicket.service_type && activeTicket.service_type !== 'GENERAL_CHAT' ? activeTicket.service_type : 'TROUBLESHOOTING');
    setAutoOpenHtsAfterAssign(false);
    setShowAssignModal(true);
  };

  const handleOpenCloseModal = () => {
    if (!activeTicket) return;
    const assignedCatIds = activeTicket.categories?.map(tc => tc.category_id || tc.category?.id).filter(Boolean) || [];
    const htsCatIds = activeTicket.hts_tickets?.map(ht => ht.category_id).filter(Boolean) || [];
    const mergedCatIds = Array.from(new Set([...assignedCatIds, ...htsCatIds]));
    setSelectedCategories(mergedCatIds);

    // Ambil solusi teknis dari catatan L2 jika sudah ada
    const l2Solutions = activeTicket.categories
      ?.filter(tc => tc.solution)
      ?.map(tc => `${tc.category?.name ? `[${tc.category.name}] ` : ''}${tc.solution}`)
      .join('\n\n') || '';

    setSummaryText(l2Solutions || '');
    setCloseHtsSolution(l2Solutions || '');

    const htsRowsFE = (activeTicket.hts_tickets && activeTicket.hts_tickets.length > 0)
      ? activeTicket.hts_tickets
      : (activeTicket.hts_ticket_no ? [{ id: 0, hts_ticket_no: activeTicket.hts_ticket_no, hts_ticket_status: activeTicket.hts_ticket_status }] : []);
    const pendingHts = htsRowsFE.filter(h => h.hts_ticket_status !== 'SOLVED');
    const isAlreadySolved = htsRowsFE.length > 0
      ? pendingHts.length === 0
      : activeTicket.hts_ticket_status === 'SOLVED';
    setCloseHtsTicket(Boolean(activeTicket.hts_ticket_no && !isAlreadySolved));

    // Multi PIC Penyelesaian & Waktu Teknis
    const defaultPicAwal = getTicketInitialPicIds(activeTicket);
    const fallbackPic = defaultPicAwal.length > 0 ? defaultPicAwal : (activeTicket.hts_ticket_no ? ['14'] : []);

    // Bangun form data per-HTS untuk multi-HTS (V4.3)
    const initialForms = {};
    htsRowsFE.forEach(ht => {
      const htPics = getTicketInitialPicIds(ht);
      const picList = htPics.length > 0 ? htPics : fallbackPic;

      let dSol = ht.solution || '';
      if (!dSol && ht.category_id && activeTicket.categories) {
        const catMatch = activeTicket.categories.find(c => c.category_id === ht.category_id);
        if (catMatch?.solution) dSol = catMatch.solution;
      }
      if (!dSol) dSol = l2Solutions;

      initialForms[ht.id] = {
        htsId: ht.id,
        htsTicketNo: ht.hts_ticket_no,
        solution: dSol || '',
        picIds: picList,
        picSearch: '',
        tglteknis: getTodayDate(),
        jam_problem: getCurrentTime(),
        files: [],
        selectedInternalUrls: [],
        useChatImage: false
      };
    });

    setCloseHtsFormData(initialForms);
    if (pendingHts.length > 0) {
      setCloseHtsTabActive(pendingHts[0].id);
    } else if (htsRowsFE.length > 0) {
      setCloseHtsTabActive(htsRowsFE[0].id);
    } else {
      setCloseHtsTabActive(null);
    }

    setCloseHtsPicId(fallbackPic[0] || '');
    setCloseHtsPicIds(fallbackPic);
    setCloseHtsPicSearch('');
    setCloseHtsTanggal(getTodayDate());
    setCloseHtsJam(getCurrentTime());
    setCloseHtsSelectedInternalUrl(null);
    setCloseHtsSelectedInternalUrls([]);
    setCloseHtsFile(null);
    setCloseHtsFiles([]);

    const imgMsg = messages.slice().reverse().find(m => m.attachment_url);
    if (imgMsg) {
      const fullImgUrl = imgMsg.attachment_url.startsWith('http') ? imgMsg.attachment_url : `${BASE_URL}${imgMsg.attachment_url}`;
      setCloseHtsChatImagePreview(fullImgUrl);
      setCloseHtsUseChatImage(true);
    } else {
      setCloseHtsChatImagePreview(null);
      setCloseHtsUseChatImage(false);
    }

    setShowCloseModal(true);
  };

  const handleAssignTicket = async () => {
    if (assignCategoryIds.length === 0) return alert('Pilih minimal 1 Tim L2 tujuan terlebih dahulu');

    // Cek apakah ada tim yang sebelumnya ditugaskan kemudian di-uncheck
    const currentCatIds = activeTicket?.categories?.map(tc => tc.category_id || tc.category?.id).filter(Boolean) || [];
    const removedTeamIds = currentCatIds.filter(id => !assignCategoryIds.includes(id));
    if (removedTeamIds.length > 0) {
      const removedNames = categories.filter(c => removedTeamIds.includes(c.id)).map(c => c.name).join(', ');
      const confirmRemove = window.confirm(`Peringatan: Tim ${removedNames} akan dilepas dari penugasan tiket ini.\n\nApakah Anda yakin ingin memperbarui penugasan?`);
      if (!confirmRemove) return;
    }

    setIsSubmittingAssign(true);
    try {
      const formData = new FormData();
      assignCategoryIds.forEach(id => formData.append('categoryIds', id));
      if (assignCategoryIds.length > 0) {
        formData.append('categoryId', assignCategoryIds[0]);
      }
      formData.append('serviceType', assignServiceType);
      formData.append('createHtsTicket', 'false');

      const res = await axios.post(`${API_URL}/chat/tickets/${activeTicket.id}/assign`, formData);
      setShowAssignModal(false);
      alert(res.data?.message || 'Penugasan tiket berhasil disimpan.');
      
      const updatedTicketData = res.data?.ticket || activeTicket;
      if (res.data?.ticket) {
        setActiveTicket(res.data.ticket);
      }
      await loadTickets();
      if (updatedTicketData?.id) loadMessages(updatedTicketData.id);

      // Jembatan UX: Jika operator memilih untuk langsung membuka form HTS
      if (autoOpenHtsAfterAssign) {
        setTimeout(() => {
          handleOpenSyncHtsModal(updatedTicketData);
        }, 150);
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Gagal meng-assign tiket');
    } finally {
      setIsSubmittingAssign(false);
    }
  };

  const handleOpenSyncHtsModal = (targetTicket = null) => {
    const target = (targetTicket && targetTicket.id) ? targetTicket : activeTicket;
    if (!target) {
      alert('Sesi tiket tidak valid. Silakan pilih kembali tiket aduan dari daftar antrean.');
      return;
    }
    if (!htsStatus?.isLoggedIn) {
      alert('Silakan hubungkan akun HTS Diskomdigi Anda terlebih dahulu di panel kanan.');
      setShowHtsModal(true);
      return;
    }
    setSyncTargetTicket(target);

    const custSkpd = (target.customer?.skpd_name || '').toLowerCase();
    const matchedOpd = custSkpd ? htsMasterData.indukOpd?.find(o => 
      o.name.toLowerCase().includes(custSkpd) || custSkpd.includes(o.name.toLowerCase())
    ) : null;
    setSyncIndukOpdId(matchedOpd ? matchedOpd.id : '');
    setSyncHtsCust(target.customer?.name || '');
    setSyncHtsWa(target.customer?.wa_number || '');
    setSyncHtsOpd(target.customer?.skpd_name || 'Dinas Komunikasi dan Informatika Provinsi Jawa Tengah');
    setSyncHtsTanggal(getTodayDate());
    setSyncHtsJam(getCurrentTime());

    const firstCustMsg = messages.find(m => m.sender_type === 'CUSTOMER')?.message_text || '';
    setSyncHtsDetil(firstCustMsg);
    setSyncHtsKategori(target.service_type === 'REQUEST_LAYANAN' ? 'request' : target.service_type === 'MONITORING' ? 'monitoring' : 'troubleshoot');
    setSyncHtsSubKategori('DISTRIBUTION NETWORK');
    
    // PIC (Multi-PIC - default tidak auto ceklist)
    setSyncHtsPicId('');
    setSyncHtsPicIds([]);
    setSyncHtsPicSearch('');

    const imgMsg = messages.slice().reverse().find(m => m.attachment_url);
    if (imgMsg) {
      const fullImgUrl = imgMsg.attachment_url.startsWith('http') ? imgMsg.attachment_url : `${BASE_URL}${imgMsg.attachment_url}`;
      setSyncHtsChatImagePreview(fullImgUrl);
      setSyncHtsUseChatImage(true);
    } else {
      setSyncHtsChatImagePreview(null);
      setSyncHtsUseChatImage(false);
    }
    setSyncHtsFile(null);
    setSyncHtsFiles([]);
    setSyncHtsTab('create');
    setLinkHtsNo('');
    setLinkHtsCategoryId('');

    setSyncOpdSearchTerm('');
    setSyncHtsError('');
    setShowSyncHtsModal(true);
  };

  const handleSyncTicketToHts = async (e) => {
    e.preventDefault();
    const target = syncTargetTicket || activeTicket;
    if (!target) {
      alert('Sesi tiket tidak valid. Silakan pilih kembali tiket aduan dari daftar antrean.');
      return;
    }

    if (syncHtsPicIds.length === 0) {
      setSyncHtsError('Pilih minimal 1 PIC Penerima/Penanganan untuk portal HTS!');
      return;
    }

    if (!syncHtsDetil || syncHtsDetil.trim().length < 10) {
      setSyncHtsError(`Detil Permasalahan wajib diisi minimal 10 karakter untuk portal HTS! (Saat ini: ${syncHtsDetil ? syncHtsDetil.trim().length : 0} karakter)`);
      return;
    }

    setIsSubmittingSyncHts(true);
    setSyncHtsError('');
    try {
      const formData = new FormData();
      formData.append('hts_cust', syncHtsCust);
      formData.append('hts_wa', syncHtsWa);
      formData.append('hts_opd', syncHtsOpd);
      formData.append('induk_opd_id', syncIndukOpdId);
      formData.append('hts_tgltshoot', syncHtsTanggal);
      formData.append('hts_jam_problem', syncHtsJam);
      formData.append('hts_kategori', syncHtsKategori);
      formData.append('hts_sub_kategori', syncHtsSubKategori);
      formData.append('hts_detil', syncHtsDetil);
      formData.append('hts_pic_id', syncHtsPicIds[0] || '14');
      syncHtsPicIds.forEach(pid => formData.append('hts_pic_ids', pid));
      if (syncHtsFiles && syncHtsFiles.length > 0) {
        for (let i = 0; i < syncHtsFiles.length; i++) {
          formData.append('attachment', syncHtsFiles[i]);
        }
      } else if (syncHtsFile) {
        formData.append('attachment', syncHtsFile);
      }
      if (syncHtsUseChatImage) {
        formData.append('useChatImage', 'true');
      }

      // Kirim categoryId jika tiket sudah memiliki kategori tim internal
      if (target.categories && target.categories.length > 0) {
        const catId = target.categories[0].category_id || target.categories[0].category?.id;
        if (catId) formData.append('categoryId', catId);
      }

      // Endpoint V4 Multi-HTS (createTicketHts)
      const res = await axios.post(`${API_URL}/chat/tickets/${target.id}/hts`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      alert(res.data?.message || 'Tiket berhasil disinkronkan ke portal HTS!');
      setShowSyncHtsModal(false);
      setSyncTargetTicket(null);
      await loadTickets();
      if (target?.id) {
        loadMessages(target.id);
        if (res.data?.ticket) {
          setActiveTicket(res.data.ticket);
        }
      }
    } catch (err) {
      setSyncHtsError(err.response?.data?.error || 'Gagal menyinkronkan tiket ke portal HTS');
    } finally {
      setIsSubmittingSyncHts(false);
    }
  };

  const [isSyncingSolveHts, setIsSyncingSolveHts] = useState(false);

  const handleSyncSolveHts = async () => {
    if (!activeTicket || !activeTicket.hts_ticket_no) return;
    if (!htsStatus?.isLoggedIn) {
      alert('Silakan hubungkan akun HTS Diskomdigi Anda terlebih dahulu di panel kanan.');
      setShowHtsModal(true);
      return;
    }

    const confirmSolve = window.confirm(`Apakah Anda yakin ingin menyelesaikan status tiket #${activeTicket.hts_ticket_no} di portal HTS?`);
    if (!confirmSolve) return;

    setIsSyncingSolveHts(true);
    try {
      const res = await axios.post(`${API_URL}/chat/tickets/${activeTicket.id}/sync-solve-hts`, {
        solution: activeTicket.summary || ''
      });

      alert(res.data?.message || 'Tiket berhasil diselesaikan di portal HTS!');
      loadTickets();
      if (activeTicket) loadMessages(activeTicket.id);
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal menyelesaikan tiket di portal HTS');
    } finally {
      setIsSyncingSolveHts(false);
    }
  };
  // Authentication Check
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (!token || !userStr) {
      navigate('/login');
    } else {
      setCurrentUser(JSON.parse(userStr));
    }
  }, [navigate]);

  const loadTickets = async () => {
    try {
      const res = await axios.get(`${API_URL}/chat/tickets`);
      setTickets(res.data);
      if (activeTicketRef.current) {
        const updatedActive = res.data.find(t => t.id === activeTicketRef.current.id);
        if (updatedActive) {
          setActiveTicket(updatedActive);
        }
      }
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) navigate('/login');
    }
  };

  const loadMessages = async (ticketId) => {
    try {
      const res = await axios.get(`${API_URL}/chat/tickets/${ticketId}/messages`);
      setMessages(res.data);
    } catch (error) {
      console.error('Failed to load messages');
    }
  };

  const loadCategories = async () => {
    try {
      const res = await axios.get(`${API_URL}/chat/categories`);
      setCategories(res.data);
    } catch (error) {
      console.error('Failed to load categories');
    }
  };

  const loadReports = async () => {
    try {
      const res = await axios.get(`${API_URL}/reports/tickets`);
      setReportTickets(res.data);
    } catch (error) {
      console.error('Failed to load reports');
    }
  };

  // --- HANDLER FASE 3 V4: RIWAYAT TIKET LAMPAU & LAZY-LOAD WA ---
  const loadCustomerHistory = async (ticket) => {
    if (!ticket) {
      setPastTickets([]);
      return;
    }
    const custId = ticket.customer_id || ticket.customer?.id;
    if (!custId) return;
    setIsLoadingHistory(true);
    try {
      const res = await axios.get(`${API_URL}/chat/customers/${custId}/history-messages?excludeTicketId=${ticket.id}`);
      setPastTickets(res.data || []);
    } catch (err) {
      console.warn('Gagal memuat riwayat tiket lampau customer:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleFetchWaHistory = async () => {
    if (!activeTicket) return;
    const custId = activeTicket.customer_id || activeTicket.customer?.id;
    if (!custId) return;
    setIsFetchingWaHistory(true);
    try {
      const res = await axios.post(`${API_URL}/chat/customers/${custId}/fetch-wa-history`, { limit: 20 });
      const fetched = res.data?.messages || [];
      setWaArchivedMessages(fetched);
      setShowPastHistory(true);
      if (fetched.length === 0) {
        alert('Tidak ada riwayat pesan lama tambahan yang ditemukan di WhatsApp.');
      } else {
        alert(`Berhasil menarik ${fetched.length} pesan riwayat lama langsung dari WhatsApp!`);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal menarik riwayat pesan dari WhatsApp');
    } finally {
      setIsFetchingWaHistory(false);
    }
  };

  // --- HANDLER FASE 4 V4: TOGGLE STATUS ADUAN & CLOSE GENERAL CHAT ---
  const handleToggleAduan = async () => {
    if (!activeTicket) return;
    const newStatus = !activeTicket.is_aduan;
    const confirmMsg = newStatus 
      ? 'Ubah percakapan ini menjadi ADUAN TEKNIS?\n\nObrolan akan dapat ditugaskan ke tim L2 dan dihitung dalam metrik SLA MTTR.'
      : 'Ubah tiket ini menjadi PERCAKAPAN BIASA?\n\n(Hanya bisa diubah jika belum memiliki nomor tiket di portal resmi HTS)';
    if (!window.confirm(confirmMsg)) return;

    setIsTogglingAduan(true);
    try {
      const res = await axios.patch(`${API_URL}/chat/tickets/${activeTicket.id}/toggle-aduan`, {
        is_aduan: newStatus
      });
      const updated = res.data.ticket;
      setActiveTicket(updated);
      setTickets(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
      alert(res.data.message || 'Status tiket berhasil diperbarui');
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal mengubah status aduan');
    } finally {
      setIsTogglingAduan(false);
    }
  };

  const handleCloseGeneralChat = async () => {
    if (!activeTicket) return;
    if (!window.confirm(`Selesaikan percakapan biasa dengan ${activeTicket.customer?.name}?\n\nTiket akan ditutup resmi tanpa memerlukan formulir portal HTS.`)) return;

    setIsClosingGeneral(true);
    try {
      const res = await axios.post(`${API_URL}/chat/tickets/${activeTicket.id}/close-general`, {
        summary: 'Percakapan biasa diselesaikan via antarmuka Helpdesk'
      });
      alert(res.data?.message || 'Percakapan biasa berhasil diselesaikan');
      setActiveTicket(null);
      loadTickets();
    } catch (err) {
      console.error('[Close General Chat Error]', err);
      const errorMsg = err.response?.data?.error || err.response?.data?.message || `HTTP ${err.response?.status || 'ERR'}: ${err.message}`;
      alert(`Gagal menyelesaikan percakapan biasa: ${errorMsg}`);
    } finally {
      setIsClosingGeneral(false);
    }
  };

  // --- HANDLER FITUR 1: AUTO-REPLY BOT (KHUSUS L1) ---
  const loadBotSetting = async () => {
    try {
      const res = await axios.get(`${API_URL}/settings/autoreply`);
      setBotMessage(res.data.message || '');
      setBotIsActive(res.data.isActive !== undefined ? res.data.isActive : true);
    } catch (error) {
      console.error('Failed to load bot setting', error);
    }
  };

  const handleSaveBotSetting = async (e) => {
    e.preventDefault();
    if (!botMessage.trim()) return alert('Pesan template bot tidak boleh kosong');
    setIsSavingBot(true);
    try {
      const res = await axios.put(`${API_URL}/settings/autoreply`, {
        message: botMessage,
        isActive: botIsActive
      });
      alert('Pengaturan Auto-Reply Bot berhasil disimpan!');
      setBotMessage(res.data.message);
      setBotIsActive(res.data.isActive);
    } catch (error) {
      alert(error.response?.data?.error || 'Gagal menyimpan pengaturan bot');
    } finally {
      setIsSavingBot(false);
    }
  };

  // --- HANDLER FITUR 2: HAPUS REKAP (KHUSUS ADMIN) ---
  const handleDeleteSelectedReports = async () => {
    if (selectedReportIds.length === 0) return alert('Pilih minimal 1 tiket untuk dihapus');
    if (!window.confirm(`Yakin ingin menghapus ${selectedReportIds.length} data aduan terpilih?`)) return;
    try {
      const res = await axios.delete(`${API_URL}/reports/tickets`, {
        data: { ids: selectedReportIds }
      });
      alert(res.data?.message || 'Data aduan terpilih berhasil dihapus');
      setSelectedReportIds([]);
      loadReports();
    } catch (error) {
      alert(error.response?.data?.error || 'Gagal menghapus tiket');
    }
  };

  const handleDeleteAllReports = async () => {
    const confirmation = prompt('PERINGATAN: Tindakan ini akan MENGHAPUS SEMUA DATA aduan, riwayat obrolan, lampiran, dan data pelanggan testing secara permanen.\n\nKetik "HAPUS" untuk melanjutkan:');
    if (confirmation !== 'HAPUS') {
      if (confirmation !== null) alert('Penghapusan dibatalkan. Kata konfirmasi tidak cocok.');
      return;
    }
    try {
      const res = await axios.delete(`${API_URL}/reports/tickets`, {
        data: { all: true }
      });
      alert(res.data?.message || 'Seluruh data berhasil dihapus bersih');
      setSelectedReportIds([]);
      loadReports();
      loadTickets();
      setActiveTicket(null);
    } catch (error) {
      alert(error.response?.data?.error || 'Gagal mengosongkan data');
    }
  };

  // --- HANDLER FITUR 3: PENGATURAN TIM & KONTAK L2 (KHUSUS ADMIN) ---
  const loadTeamCategories = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/categories/contacts`);
      setTeamCategories(res.data);
    } catch (error) {
      console.error('Failed to load team categories', error);
    }
  };

  const handleAddContact = async (categoryId) => {
    const input = newContactInputs[categoryId] || {};
    if (!input.name?.trim() || !input.wa_target?.trim()) {
      return alert('Nama dan Nomor WA / ID Grup wajib diisi!');
    }
    try {
      await axios.post(`${API_URL}/admin/categories/${categoryId}/contacts`, {
        name: input.name,
        wa_target: input.wa_target
      });
      setNewContactInputs(prev => ({
        ...prev,
        [categoryId]: { name: '', wa_target: '' }
      }));
      loadTeamCategories();
    } catch (error) {
      alert(error.response?.data?.error || 'Gagal menambahkan kontak');
    }
  };

  const handleDeleteContact = async (contactId) => {
    if (!window.confirm('Yakin ingin menghapus kontak ini dari target blast?')) return;
    try {
      await axios.delete(`${API_URL}/admin/categories/contacts/${contactId}`);
      loadTeamCategories();
    } catch (error) {
      alert(error.response?.data?.error || 'Gagal menghapus kontak');
    }
  };

  const handleStartEditContact = (contact) => {
    setEditingContactId(contact.id);
    setEditContactData({ name: contact.name, wa_target: contact.wa_target });
  };

  const handleCancelEditContact = () => {
    setEditingContactId(null);
    setEditContactData({ name: '', wa_target: '' });
  };

  const handleSaveEditContact = async (contactId) => {
    if (!editContactData.name?.trim() || !editContactData.wa_target?.trim()) {
      return alert('Nama dan Nomor WA / ID Grup wajib diisi!');
    }
    try {
      await axios.put(`${API_URL}/admin/categories/contacts/${contactId}`, {
        name: editContactData.name,
        wa_target: editContactData.wa_target
      });
      setEditingContactId(null);
      setEditContactData({ name: '', wa_target: '' });
      loadTeamCategories();
    } catch (error) {
      alert(error.response?.data?.error || 'Gagal memperbarui kontak');
    }
  };

  const currentTabRef = useRef(currentTab);
  useEffect(() => {
    currentTabRef.current = currentTab;
  }, [currentTab]);

  useEffect(() => {
    if (!currentUser) return;

    loadTickets();
    loadCategories();
    loadQuickReplies(); // Fase 5: Muat template balasan cepat
    if (currentUser?.role === 'L1' || currentUser?.role === 'ADMIN') {
      fetchHtsStatus();
      fetchHtsMasterData();
    }

    const handleNewMessage = (data) => {
      loadTickets();

      // Fase 5: Notifikasi Suara Web Audio & Desktop Alert jika pesan dari Pelanggan
      if (data.senderType === 'CUSTOMER') {
        playNotificationChime();
        triggerDesktopNotification(
          `Pesan Baru: ${data.senderName || 'Pelanggan'}`,
          data.text || (data.attachmentUrl ? 'Mengirimkan lampiran gambar' : 'Mengirimkan pesan di WhatsApp'),
          data.ticketId
        );
      }

      if (activeTicketRef.current && data.ticketId === activeTicketRef.current.id) {
        setMessages((prev) => [
          ...prev, 
          {
            id: Date.now(),
            sender_type: data.senderType || 'CUSTOMER',
            message_text: data.text,
            attachment_url: data.attachmentUrl, // Fase 3
            is_internal: data.isInternal || false, // Fase 1 V2
            sender: data.sender || null,
            created_at: data.createdAt || new Date().toISOString()
          }
        ]);
      }
    };

    const handleTicketAssigned = (data) => {
      loadTickets();
      playNotificationChime();
      triggerDesktopNotification(
        'Penugasan Tiket Baru',
        `Tiket baru telah ditugaskan untuk penanganan teknis.`,
        data?.ticketId
      );
    };

    const handleTicketUpdated = (data) => {
      loadTickets();
      if (currentTabRef.current === 'report') loadReports();

      if (activeTicketRef.current && data?.ticketId === activeTicketRef.current.id) {
        if (data.ticket) {
          setActiveTicket(data.ticket);
        }
      }
    };

    const handleTicketClosed = (data) => {
      loadTickets(); 
      if (currentTabRef.current === 'report') loadReports();
      
      if (activeTicketRef.current && (data.ticketId === activeTicketRef.current.id || data.ticketId === 'all' || data.ticketId === 'batch')) {
        // Jangan reset activeTicket jika data ticket jelas-jelas masih berstatus bukan CLOSED
        if (data.ticket && data.ticket.status !== 'CLOSED') {
          setActiveTicket(data.ticket);
          return;
        }
        setActiveTicket(null);
        alert('Tiket ini telah ditutup.');
      }
    };

    const handleCustomerUpdated = (data) => {
      setTickets((prev) => prev.map(t => {
        if (t.customer_id === data.customerId || t.customer?.id === data.customerId) {
          return {
            ...t,
            customer: {
              ...t.customer,
              name: data.name,
              skpd_name: data.skpd_name,
              is_custom_name: data.is_custom_name
            }
          };
        }
        return t;
      }));

      setActiveTicket((prev) => {
        if (prev && (prev.customer_id === data.customerId || prev.customer?.id === data.customerId)) {
          return {
            ...prev,
            customer: {
              ...prev.customer,
              name: data.name,
              skpd_name: data.skpd_name,
              is_custom_name: data.is_custom_name
            }
          };
        }
        return prev;
      });

      setReportTickets((prev) => prev.map(r => {
        if (r.customerId === data.customerId) {
          return { ...r, customerName: data.name, skpdName: data.skpd_name || '-' };
        }
        return r;
      }));
    };

    const handleHtsEvent = () => {
      loadTickets();
    };

    socket.on('new_message', handleNewMessage);
    socket.on('ticket_assigned', handleTicketAssigned);
    socket.on('ticket_updated', handleTicketUpdated);
    socket.on('ticket_closed', handleTicketClosed);
    socket.on('customer_updated', handleCustomerUpdated);
    socket.on('hts_ticket_created', handleHtsEvent);
    socket.on('hts_ticket_updated', handleHtsEvent);
    socket.on('hts_ticket_deleted', handleHtsEvent);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('ticket_assigned', handleTicketAssigned);
      socket.off('ticket_updated', handleTicketUpdated);
      socket.off('ticket_closed', handleTicketClosed);
      socket.off('customer_updated', handleCustomerUpdated);
      socket.off('hts_ticket_created', handleHtsEvent);
      socket.off('hts_ticket_updated', handleHtsEvent);
      socket.off('hts_ticket_deleted', handleHtsEvent);
    };
  }, [currentUser]); 

  useEffect(() => {
    if (activeTicket) {
      loadMessages(activeTicket.id);
      loadCustomerHistory(activeTicket);
      setWaArchivedMessages([]);
      setShowPastHistory(false);
    } else {
      setPastTickets([]);
      setWaArchivedMessages([]);
      setShowPastHistory(false);
    }
  }, [activeTicket]);

  useEffect(() => {
    if (currentTab === 'report') loadReports();
    if (currentTab === 'users' && isAdmin) loadAdminUsers();
    if (currentTab === 'teams' && isAdmin) loadTeamCategories();
    if (currentTab === 'bot' && currentUser?.role === 'L1') loadBotSetting();
  }, [currentTab, currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    socket.disconnect();
    navigate('/login');
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!replyText.trim() && !selectedFile) return;
    if (!activeTicket) return;

    try {
      // Fase 3: Kirim Media
      if (selectedFile) {
        const formData = new FormData();
        formData.append('ticketId', activeTicket.id);
        formData.append('caption', replyText);
        formData.append('media', selectedFile);
        
        await axios.post(`${API_URL}/chat/sendMedia`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        // Kirim Teks biasa
        await axios.post(`${API_URL}/chat/send`, {
          ticketId: activeTicket.id,
          text: replyText
        });
      }
      setReplyText(''); 
    } catch (error) {
      alert('Gagal mengirim pesan');
    }
  };

  // Kirim Catatan Internal (Teks atau Gambar/Media) - 100% Rahasia (Fase 2 V4)
  const handleSendInternalNote = async (e) => {
    e.preventDefault();
    if (!internalNoteText.trim() && !selectedInternalFile) return;
    try {
      if (selectedInternalFile) {
        const formData = new FormData();
        formData.append('media', selectedInternalFile);
        if (internalNoteText.trim()) {
          formData.append('text', internalNoteText.trim());
        }
        await axios.post(`${API_URL}/chat/tickets/${activeTicket.id}/internal-media`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setSelectedInternalFile(null);
        if (internalFileInputRef.current) internalFileInputRef.current.value = '';
      } else {
        await axios.post(`${API_URL}/chat/tickets/${activeTicket.id}/internal-note`, { text: internalNoteText });
      }
      setInternalNoteText('');
    } catch (error) {
      console.error('Error sending internal note:', error);
      alert('Gagal mengirim catatan internal');
    }
  };

  // L2 membuka modal penanganan selesai
  const handleOpenResolveModal = () => {
    setResolveSolutionText('');
    setShowResolveModal(true);
  };

  // L2 submit konfirmasi selesai & solusi teknis
  const handleConfirmResolve = async (e) => {
    if (e) e.preventDefault();
    if (!resolveSolutionText.trim()) {
      alert('Mohon tuliskan catatan solusi / penanganan teknis yang telah dikerjakan!');
      return;
    }
    setIsResolving(true);
    try {
      const res = await axios.post(`${API_URL}/chat/tickets/${activeTicket.id}/resolve`, {
        solution: resolveSolutionText.trim()
      });
      alert(res.data?.message || 'Berhasil menandai tiket selesai');
      setShowResolveModal(false);
      setResolveSolutionText('');
      loadTickets();
      if (activeTicket) loadMessages(activeTicket.id);
    } catch (error) {
      console.error('Error resolving ticket:', error);
      alert(error.response?.data?.error || 'Gagal menandai tiket selesai');
    } finally {
      setIsResolving(false);
    }
  };

  // L2 mengembalikan tiket / melepas penugasan
  const handleReturnTicket = async () => {
    const reason = prompt('Masukkan alasan pelepasan penugasan / pengembalian ke L1:', 'Tidak ada kendala pada tim ini / Salah penugasan');
    if (reason === null) return;
    try {
      const res = await axios.post(`${API_URL}/chat/tickets/${activeTicket.id}/return`, { reason });
      alert(res.data?.message || 'Penugasan berhasil dikembalikan ke L1.');
      loadTickets();
      setActiveTicket(null);
    } catch (error) {
      alert(error.response?.data?.error || 'Gagal mengembalikan tiket');
    }
  };

  // L1 menutup tiket & Multi-HTS Dual-Close (V4.3)
  const handleCloseTicket = async () => {
    if (summaryText.trim().length < 10) {
      alert('Kesimpulan untuk pelanggan wajib diisi minimal 10 karakter!');
      return;
    }

    const htsRowsFE = (activeTicket?.hts_tickets && activeTicket.hts_tickets.length > 0)
      ? activeTicket.hts_tickets
      : (activeTicket?.hts_ticket_no ? [{ id: 0, hts_ticket_no: activeTicket.hts_ticket_no, hts_ticket_status: activeTicket.hts_ticket_status }] : []);
    const pendingHts = htsRowsFE.filter(h => h.hts_ticket_status !== 'SOLVED');

    // Validasi aturan bisnis mutlak: seluruh tiket HTS pending wajib diisi lengkap
    if (pendingHts.length > 0) {
      for (const ht of pendingHts) {
        const item = closeHtsFormData[ht.id];
        if (!item || !item.solution || item.solution.trim().length < 10) {
          setCloseHtsTabActive(ht.id);
          return alert(`Solusi teknis untuk tiket HTS #${ht.hts_ticket_no} wajib diisi minimal 10 karakter!`);
        }
        if (!item.picIds || item.picIds.length === 0) {
          setCloseHtsTabActive(ht.id);
          return alert(`Pilih minimal 1 PIC Penyelesaian Teknis untuk tiket HTS #${ht.hts_ticket_no}!`);
        }
      }
    } else if (activeTicket?.hts_ticket_no && activeTicket?.hts_ticket_status !== 'SOLVED' && htsRowsFE.length === 0) {
      // Fallback tiket legacy (belum punya record di TicketHts)
      if (closeHtsPicIds.length === 0) {
        return alert('Pilih minimal 1 PIC Penyelesaian Teknis untuk portal HTS!');
      }
    }

    setIsClosingTicket(true);
    try {
      const formData = new FormData();
      formData.append('summary', summaryText.trim());
      selectedCategories.forEach(cid => formData.append('categoryIds', cid));

      const willCloseHts = Boolean(activeTicket?.hts_ticket_no && (pendingHts.length > 0 || activeTicket.hts_ticket_status !== 'SOLVED'));
      formData.append('closeHtsTicket', willCloseHts);

      if (pendingHts.length > 0) {
        const htsResolutions = [];
        pendingHts.forEach(ht => {
          const item = closeHtsFormData[ht.id] || {};
          htsResolutions.push({
            htsId: ht.id,
            htsTicketNo: ht.hts_ticket_no,
            solution: item.solution ? item.solution.trim() : summaryText.trim(),
            picIds: item.picIds || ['14'],
            tglteknis: item.tglteknis || getTodayDate(),
            jam_problem: item.jam_problem || getCurrentTime(),
            selectedAttachmentUrls: item.selectedInternalUrls || [],
            useChatImage: Boolean(item.useChatImage)
          });

          // Lampirkan berkas komputer lokal khusus tiket ini
          if (item.files && item.files.length > 0) {
            item.files.forEach(f => {
              formData.append(`attachment_${ht.id}`, f);
            });
          }
        });

        formData.append('htsResolutions', JSON.stringify(htsResolutions));
      } else if (willCloseHts) {
        // Fallback kompatibilitas tiket legacy
        formData.append('htsPicId', closeHtsPicIds[0] || '14');
        closeHtsPicIds.forEach(pid => formData.append('htsPicIds', pid));
        formData.append('htsSolution', closeHtsSolution || summaryText.trim());
        formData.append('htsTglTeknis', closeHtsTanggal);
        formData.append('htsJamTeknis', closeHtsJam);
        if (closeHtsFiles && closeHtsFiles.length > 0) {
          for (let i = 0; i < closeHtsFiles.length; i++) {
            formData.append('attachment', closeHtsFiles[i]);
          }
        } else if (closeHtsFile) {
          formData.append('attachment', closeHtsFile);
        }
        if (closeHtsSelectedInternalUrls && closeHtsSelectedInternalUrls.length > 0) {
          formData.append('selectedAttachmentUrls', JSON.stringify(closeHtsSelectedInternalUrls));
        } else if (closeHtsUseChatImage && closeHtsFiles.length === 0 && !closeHtsFile) {
          formData.append('useChatImage', 'true');
        }
      }

      await axios.post(`${API_URL}/chat/tickets/${activeTicket.id}/close`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setShowCloseModal(false);
      setSummaryText('');
      setSelectedCategories([]);
      setActiveTicket(null);
      loadTickets();
    } catch (error) {
      console.error('Error closing ticket:', error);
      alert(error.response?.data?.error || 'Gagal menutup tiket');
    } finally {
      setIsClosingTicket(false);
    }
  };

  const exportToCSV = () => {
    if (reportTickets.length === 0) return alert('Tidak ada data');
    const headers = ['ID Tiket', 'Klasifikasi', 'Jenis Layanan', 'No. Tiket Portal HTS', 'Status HTS', 'Nama Pelapor', 'Instansi / SKPD', 'Nomor WA', 'Status', 'Waktu Masuk', 'Respon Pertama (FRT)', 'Waktu Selesai', 'Durasi (MTTR)', 'Tim Terkait', 'Kesimpulan'];
    const csvRows = [headers.join(',')];
    reportTickets.forEach(ticket => {
      const row = [
        ticket.id, 
        `"${ticket.isAduan ? 'Aduan Teknis' : 'Percakapan Biasa'}"`,
        `"${ticket.serviceType || '-'}"`,
        `"${ticket.htsTicketNo ? `#${ticket.htsTicketNo}` : '-'}"`,
        `"${ticket.htsTicketStatus || '-'}"`,
        `"${ticket.customerName}"`, 
        `"${ticket.skpdName || '-'}"`,
        `"${ticket.waNumber}"`, 
        ticket.status,
        `"${format(new Date(ticket.createdAt), 'yyyy-MM-dd HH:mm:ss')}"`,
        `"${ticket.frt || '-'}"`,
        ticket.closedAt ? `"${format(new Date(ticket.closedAt), 'yyyy-MM-dd HH:mm:ss')}"` : '-',
        `"${ticket.duration}"`, 
        `"${ticket.categories || '-'}"`, 
        `"${(ticket.summary || '-').replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `Rekap_Laporan_SLA_HTS_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isAdmin = currentUser?.role === 'ADMIN';
  // --- STATE ADMIN: USER MANAGEMENT ---
  const [adminUsers, setAdminUsers] = useState([]);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'L1', category_id: '' });
  const [editingUser, setEditingUser] = useState(null);
  const [editUserData, setEditUserData] = useState({ name: '', email: '', password: '', role: 'L1', category_id: '' });
  const [isSavingUser, setIsSavingUser] = useState(false);

  const loadAdminUsers = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/users`);
      setAdminUsers(res.data);
    } catch (error) {
      console.error('Failed to load admin users', error);
    }
  };

  useEffect(() => {
    if (currentTab === 'users' && isAdmin) loadAdminUsers();
  }, [currentTab, isAdmin]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/admin/users`, newUser);
      alert('User berhasil dibuat');
      setNewUser({ name: '', email: '', password: '', role: 'L1', category_id: '' });
      loadAdminUsers();
    } catch (error) {
      alert(error.response?.data?.error || 'Gagal membuat user');
    }
  };

  const handleStartEditUser = (user) => {
    setEditingUser(user);
    setEditUserData({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'L1',
      category_id: user.category_id || user.category?.id || ''
    });
  };

  const handleSaveEditUser = async (e) => {
    e.preventDefault();
    if (!editUserData.name?.trim() || !editUserData.email?.trim()) {
      return alert('Nama dan Email wajib diisi!');
    }
    if (editUserData.role === 'L2' && !editUserData.category_id) {
      return alert('Kategori wajib dipilih untuk pengguna peran L2!');
    }

    setIsSavingUser(true);
    try {
      await axios.put(`${API_URL}/admin/users/${editingUser.id}`, {
        name: editUserData.name.trim(),
        email: editUserData.email.trim(),
        password: editUserData.password ? editUserData.password.trim() : undefined,
        role: editUserData.role,
        category_id: editUserData.category_id ? parseInt(editUserData.category_id) : null
      });

      alert('Akun pengguna berhasil diperbarui!');
      setEditingUser(null);
      loadAdminUsers();

      if (editingUser.id === currentUser.id) {
        const updatedLocalUser = {
          ...currentUser,
          name: editUserData.name.trim(),
          email: editUserData.email.trim(),
          role: editUserData.role
        };
        localStorage.setItem('user', JSON.stringify(updatedLocalUser));
        setCurrentUser(updatedLocalUser);
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Gagal memperbarui akun pengguna');
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Yakin hapus user ini?')) return;
    try {
      await axios.delete(`${API_URL}/admin/users/${id}`);
      loadAdminUsers();
    } catch (error) {
      alert(error.response?.data?.error || 'Gagal menghapus user');
    }
  };

  if (!currentUser) return null;

  
  const isL1 = isAdmin || currentUser.role === 'L1' || currentUser.role === 'SPV';
  const isL2 = isAdmin || currentUser.role === 'L2';



  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      
      {/* NAVIGASI UTAMA (KIRI) */}
      <div className="w-16 bg-blue-900 flex flex-col items-center py-6 space-y-8 z-20 shadow-lg justify-between">
        <div className="flex flex-col items-center space-y-8 w-full px-2">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-bold text-blue-900 text-xl shadow-sm">
            H
          </div>
          <div className="flex flex-col space-y-4 w-full">
            <button 
              onClick={() => setCurrentTab('chat')}
              className={`w-full p-3 rounded-xl flex items-center justify-center transition-all ${currentTab === 'chat' ? 'bg-blue-800 text-white shadow-inner' : 'text-blue-300 hover:bg-blue-800 hover:text-white'}`}
              title="Live Chat"
            >
              <MessageSquare className="w-6 h-6" />
            </button>
            <button 
              onClick={() => setCurrentTab('report')}
              className={`w-full p-3 rounded-xl flex items-center justify-center transition-all ${currentTab === 'report' ? 'bg-blue-800 text-white shadow-inner' : 'text-blue-300 hover:bg-blue-800 hover:text-white'}`}
              title="Laporan & Rekap"
            >
              <FileText className="w-6 h-6" />
            </button>
            {isAdmin && (
              <button 
                onClick={() => setCurrentTab('users')}
                className={`w-full p-3 rounded-xl flex items-center justify-center transition-all ${currentTab === 'users' ? 'bg-blue-800 text-white shadow-inner' : 'text-blue-300 hover:bg-blue-800 hover:text-white'}`}
                title="Manajemen Pengguna"
              >
                <Users className="w-6 h-6" />
              </button>
            )}
            {isAdmin && (
              <button 
                onClick={() => setCurrentTab('teams')}
                className={`w-full p-3 rounded-xl flex items-center justify-center transition-all ${currentTab === 'teams' ? 'bg-blue-800 text-white shadow-inner' : 'text-blue-300 hover:bg-blue-800 hover:text-white'}`}
                title="Pengaturan Kontak Tim L2"
              >
                <PhoneCall className="w-6 h-6" />
              </button>
            )}
            {currentUser?.role === 'L1' && (
              <button 
                onClick={() => setCurrentTab('bot')}
                className={`w-full p-3 rounded-xl flex items-center justify-center transition-all ${currentTab === 'bot' ? 'bg-blue-800 text-white shadow-inner' : 'text-blue-300 hover:bg-blue-800 hover:text-white'}`}
                title="Pengaturan Auto-Reply Bot"
              >
                <Bot className="w-6 h-6" />
              </button>
            )}

            {/* Tombol Manajemen Template Balasan Cepat (Fase 5) */}
            {(isL1 || isAdmin) && (
              <button 
                onClick={() => setShowQuickRepliesModal(true)}
                className="w-full p-3 rounded-xl flex items-center justify-center text-amber-300 hover:bg-blue-800 hover:text-amber-200 transition-all"
                title="Kelola Template Balasan Cepat (Quick Replies)"
              >
                <Zap className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>

        {/* Kontrol Notifikasi Audio & Desktop Browser (Fase 5) */}
        <div className="flex flex-col items-center space-y-3 w-full px-2">
          <button 
            type="button"
            onClick={() => {
              setIsAudioMuted(!isAudioMuted);
              if (isAudioMuted) playNotificationChime();
            }}
            className={`p-2.5 rounded-xl transition-all ${
              isAudioMuted ? 'text-gray-400 hover:text-white hover:bg-blue-800' : 'text-emerald-300 hover:bg-blue-800'
            }`}
            title={isAudioMuted ? 'Suara Notifikasi: Nonaktif (Klik untuk bunyikan)' : 'Suara Notifikasi: Aktif (Klik untuk matikan)'}
          >
            {isAudioMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          <button 
            type="button"
            onClick={requestDesktopNotificationPermission}
            className={`p-2.5 rounded-xl transition-all relative ${
              desktopNotifPermission === 'granted' 
                ? 'text-emerald-300 hover:bg-blue-800' 
                : 'text-amber-300 hover:bg-blue-800 animate-pulse'
            }`}
            title={
              desktopNotifPermission === 'granted' 
                ? 'Notifikasi Desktop Browser Aktif' 
                : 'Klik untuk mengizinkan popup notifikasi desktop browser'
            }
          >
            {desktopNotifPermission === 'granted' ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
            {desktopNotifPermission !== 'granted' && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-amber-400 rounded-full"></span>
            )}
          </button>

          <button onClick={handleLogout} className="p-3 text-red-300 hover:bg-red-800 hover:text-white rounded-xl transition-all" title="Logout">
            <LogOut className="w-6 h-6" />
          </button>
        </div>
      </div>

      {currentTab === 'chat' && (
        <>
          {/* PANEL KIRI: Antrean */}
          <div className="w-[30%] bg-white border-r border-gray-200 flex flex-col">
            <div className="p-4 bg-gray-50 border-b border-gray-200 space-y-2.5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-gray-800">Antrean Percakapan</h1>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                    {tickets.length}
                  </span>
                </div>
                {isL1 && (
                  <button
                    type="button"
                    onClick={handleOpenNewChatModal}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition flex items-center gap-1"
                    title="Mulai obrolan WhatsApp baru ke kontak"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Chat Baru</span>
                  </button>
                )}
              </div>

              {/* Input Pencarian */}
              <div className="relative">
                <input 
                  type="text" 
                  value={searchTicketQuery}
                  onChange={e => setSearchTicketQuery(e.target.value)}
                  placeholder="Cari nama, OPD, nomor WA, HTS..." 
                  className="w-full pl-9 pr-7 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white" 
                />
                <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-2" />
                {searchTicketQuery && (
                  <button 
                    onClick={() => setSearchTicketQuery('')}
                    className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Tab Filter Pills (Fase 4 V4) */}
              <div className="flex gap-1 overflow-x-auto pb-1 text-[11px] no-scrollbar">
                {[
                  { id: 'all', label: 'Aktif', count: tickets.filter(t => t.status !== 'CLOSED').length },
                  { id: 'aduan', label: '🚨 Aduan', count: tickets.filter(t => t.is_aduan && t.status !== 'CLOSED').length },
                  { id: 'biasa', label: '💬 Biasa', count: tickets.filter(t => !t.is_aduan && t.status !== 'CLOSED').length },
                  { id: 'pending_hts', label: '⏳ Belum HTS', count: tickets.filter(t => t.is_aduan && !t.hts_ticket_no && t.status !== 'CLOSED').length },
                  { id: 'closed', label: '✓ Selesai', count: tickets.filter(t => t.status === 'CLOSED').length }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTicketFilterTab(tab.id)}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition flex items-center gap-1 shrink-0 ${
                      ticketFilterTab === tab.id
                        ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                        : 'bg-white hover:bg-gray-100 text-gray-600 border border-gray-200'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`text-[9px] px-1 py-0.2 rounded-full ${
                      ticketFilterTab === tab.id ? 'bg-blue-800 text-blue-100' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {tickets
                .filter(ticket => {
                  const q = searchTicketQuery.trim().toLowerCase();
                  const matchSearch = !q || 
                    (ticket.customer?.name && ticket.customer.name.toLowerCase().includes(q)) ||
                    (ticket.customer?.skpd_name && ticket.customer.skpd_name.toLowerCase().includes(q)) ||
                    (ticket.customer?.wa_number && ticket.customer.wa_number.includes(q)) ||
                    (ticket.hts_ticket_no && String(ticket.hts_ticket_no).includes(q));
                  if (!matchSearch) return false;

                  if (ticketFilterTab === 'closed') return ticket.status === 'CLOSED';
                  if (ticketFilterTab === 'aduan') return ticket.is_aduan && ticket.status !== 'CLOSED';
                  if (ticketFilterTab === 'biasa') return !ticket.is_aduan && ticket.status !== 'CLOSED';
                  if (ticketFilterTab === 'pending_hts') return ticket.is_aduan && !ticket.hts_ticket_no && ticket.status !== 'CLOSED';
                  return ticket.status !== 'CLOSED';
                })
                .sort((a, b) => {
                  const timeA = new Date(a.messages?.[0]?.created_at || a.created_at).getTime();
                  const timeB = new Date(b.messages?.[0]?.created_at || b.created_at).getTime();
                  return timeB - timeA;
                })
                .map(ticket => {
                  const lastMsg = ticket.messages?.[0];
                  return (
                    <div 
                      key={ticket.id} 
                      onClick={() => setActiveTicket(ticket)} 
                      className={`p-3.5 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                        activeTicket?.id === ticket.id ? 'bg-blue-50 border-l-4 border-blue-500 shadow-2xs' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-semibold text-gray-800 text-xs sm:text-sm truncate">
                          {ticket.customer?.name}
                          {ticket.customer?.skpd_name && (
                            <span className="text-[10px] text-blue-600 font-normal ml-1.5 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                              {ticket.customer.skpd_name}
                            </span>
                          )}
                        </h3>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">
                          {ticket.created_at ? format(new Date(ticket.created_at), 'HH:mm') : ''}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs mb-1.5">
                        <p className="text-gray-500 truncate pr-2 text-[11px]">
                          {lastMsg ? (lastMsg.attachment_url ? '[Gambar]' : lastMsg.message_text) : 'Belum ada pesan'}
                        </p>
                      </div>
                      
                      {/* Badge Klasifikasi & Status Tim */}
                      <div className="flex justify-between items-center mt-1 gap-1">
                        <div className="flex flex-wrap items-center gap-1 max-w-[200px]">
                          {/* Badge Jenis Obrolan: Aduan vs Biasa */}
                          <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-md border flex items-center gap-0.5 ${
                            ticket.is_aduan 
                              ? 'bg-amber-50 text-amber-800 border-amber-300' 
                              : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}>
                            {ticket.is_aduan ? '🚨 Aduan' : '💬 Biasa'}
                          </span>

                          {/* Badge Multi-HTS di Kolom Kiri */}
                          {ticket.hts_tickets && ticket.hts_tickets.length > 0 ? (
                            ticket.hts_tickets.map(ht => (
                              <span key={ht.id} className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-blue-50 text-blue-800 border border-blue-300" title={`Portal HTS #${ht.hts_ticket_no} (${ht.hts_ticket_status})`}>
                                #{ht.hts_ticket_no}
                              </span>
                            ))
                          ) : ticket.hts_ticket_no ? (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-blue-50 text-blue-800 border border-blue-300" title={`No. Tiket Portal HTS #${ticket.hts_ticket_no}`}>
                              #{ticket.hts_ticket_no}
                            </span>
                          ) : null}

                          {/* Badge Tim Penugasan */}
                          {ticket.categories && ticket.categories.length > 0 ? (
                            ticket.categories.map(tc => (
                              <span key={tc.category_id} className={`px-1.5 py-0.5 text-[9px] font-bold rounded truncate ${
                                tc.is_resolved 
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                  : 'bg-orange-100 text-orange-800 border border-orange-200'
                              }`} title={tc.category?.name}>
                                {tc.is_resolved ? '✓ ' : ''}{tc.category?.name}
                              </span>
                            ))
                          ) : (
                            ticket.is_aduan && (
                              <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-gray-100 text-gray-500">
                                [Belum Ditugaskan]
                              </span>
                            )
                          )}
                        </div>
                        
                        <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full whitespace-nowrap ${
                          ticket.status === 'OPEN' ? 'bg-green-100 text-green-700' : ticket.status === 'RESOLVED' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {ticket.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              {tickets.length === 0 && (
                <div className="p-6 text-center text-xs text-gray-400">
                  Belum ada antrean percakapan
                </div>
              )}
            </div>
          </div>

          {/* PANEL TENGAH: Chat Room */}
          <div className="flex-1 flex flex-col bg-slate-50 relative">
            {activeTicket ? (
              <>
                {/* Header Chat */}
                <div className="p-4 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-10">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold mr-3">
                      {activeTicket.customer?.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                        <span>{activeTicket.customer?.name}</span>
                        {activeTicket.customer?.skpd_name && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-md border border-blue-200">
                            {activeTicket.customer.skpd_name}
                          </span>
                        )}
                        {isL1 && (
                          <button
                            onClick={handleOpenEditCustomerModal}
                            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Ubah Identitas Pelapor / Instansi"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {activeTicket.service_type && (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-600 rounded-full border border-blue-200 uppercase">
                            {activeTicket.service_type.replace('_', ' ')}
                          </span>
                        )}
                        {/* Badges Multi-HTS di Header */}
                        {activeTicket.hts_tickets && activeTicket.hts_tickets.length > 0 ? (
                          activeTicket.hts_tickets.map(ht => (
                            <span key={ht.id} className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-800 rounded-full border border-blue-300 flex items-center gap-1 shadow-sm" title={`Portal HTS Diskomdigi: #${ht.hts_ticket_no} (${ht.hts_ticket_status})`}>
                              <Globe className="w-3 h-3 text-blue-600" /> #{ht.hts_ticket_no}
                            </span>
                          ))
                        ) : activeTicket.hts_ticket_no ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-800 rounded-full border border-blue-300 flex items-center gap-1 shadow-sm" title={`Portal HTS Diskomdigi: #${activeTicket.hts_ticket_no}`}>
                            <Globe className="w-3 h-3 text-blue-600" /> #{activeTicket.hts_ticket_no}
                          </span>
                        ) : null}
                      </h2>
                      <p className="text-xs text-gray-500">+{activeTicket.customer?.wa_number}</p>

                      {/* Status Progress Tim Penugasan (Multi-Assign) */}
                      {activeTicket.categories && activeTicket.categories.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {activeTicket.categories.map(tc => (
                            <span key={tc.category_id} className={`px-2 py-0.5 text-[10px] font-bold rounded-full flex items-center gap-1 ${
                              tc.is_resolved 
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}>
                              {tc.is_resolved ? '✓' : '⏳'} {tc.category?.name || 'Tim'}: {tc.is_resolved ? 'Selesai' : 'Sedang Ditangani'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* RBAC: L1 Action Buttons dengan Toggle Klasifikasi */}
                  {isL1 && (
                    <div className="flex items-center space-x-2">
                      {activeTicket.status === 'CLOSED' && (
                        <button
                          type="button"
                          onClick={handleReopenTicket}
                          className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                          title="Aktifkan kembali tiket ini agar dapat mengirim dan menerima pesan lanjutan"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Aktifkan Kembali Tiket</span>
                        </button>
                      )}
                      {/* Toggle Sakelar Percakapan Biasa <-> Aduan Teknis */}
                      <button
                        type="button"
                        onClick={handleToggleAduan}
                        disabled={isTogglingAduan || !!activeTicket.hts_ticket_no}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border shadow-2xs ${
                          activeTicket.is_aduan
                            ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                        }`}
                        title={activeTicket.hts_ticket_no ? 'Tiket sudah tersambung ke portal HTS' : 'Klik untuk beralih antara Percakapan Biasa dan Aduan Teknis'}
                      >
                        <span>{activeTicket.is_aduan ? '🚨 Aduan Teknis' : '💬 Percakapan Biasa'}</span>
                      </button>

                      {/* Tombol aksi sesuai klasifikasi */}
                      {!activeTicket.is_aduan ? (
                        <button 
                          type="button"
                          onClick={handleCloseGeneralChat}
                          disabled={isClosingGeneral}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                          title="Selesaikan percakapan biasa tanpa formulir HTS"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isClosingGeneral ? 'Menyelesaikan...' : 'Selesaikan Percakapan'}</span>
                        </button>
                      ) : (
                        <>
                          <button 
                            onClick={handleOpenAssignModal} 
                            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition flex items-center gap-1 ${
                              activeTicket.categories && activeTicket.categories.length > 0
                                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                                : 'bg-blue-50 hover:bg-blue-100 text-blue-700'
                            }`}
                          >
                            {activeTicket.categories && activeTicket.categories.length > 0 ? 'Ubah / Tambah Tim L2' : 'Assign ke L2'}
                          </button>
                          <button onClick={handleOpenCloseModal} className="px-3 py-1.5 bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-700 text-xs rounded-lg font-medium transition">
                            Selesaikan
                          </button>
                        </>
                      )}

                      {/* Tombol Fold/Unfold Panel Kanan (Laptop 1366x768) */}
                      <button
                        type="button"
                        onClick={() => setIsRightPanelCollapsed(prev => !prev)}
                        className={`p-1.5 rounded-lg border transition ${
                          isRightPanelCollapsed 
                            ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-2xs' 
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 border-transparent'
                        }`}
                        title={isRightPanelCollapsed ? "Buka Panel Informasi Kanan" : "Sembunyikan Panel Kanan"}
                      >
                        <Sliders className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {isL2 && (() => {
                    const myCatRelation = activeTicket.categories?.find(tc => 
                      tc.category_id === currentUser.category_id || 
                      tc.category?.id === currentUser.category_id ||
                      tc.category?.name === currentUser.category ||
                      (typeof currentUser.category === 'object' && (tc.category_id === currentUser.category?.id || tc.category?.name === currentUser.category?.name))
                    );
                    const isMyTeamResolved = myCatRelation?.is_resolved;

                    return (
                      <div className="flex items-center space-x-2">
                        {myCatRelation ? (
                          <>
                            <button onClick={handleReturnTicket} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm rounded-lg font-medium transition">
                              Kembalikan / Lepas
                            </button>
                            {isMyTeamResolved ? (
                              <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 text-sm rounded-lg font-semibold flex items-center border border-emerald-200">
                                <CheckCircle className="w-4 h-4 mr-1 text-emerald-600"/> Bagian Anda Selesai
                              </span>
                            ) : (
                              <button onClick={handleOpenResolveModal} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium transition flex items-center shadow-sm">
                                <CheckCircle className="w-4 h-4 mr-1"/> Tandai Selesai
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="px-2.5 py-1 text-xs text-amber-700 bg-amber-50 rounded-lg border border-amber-200 font-medium">
                            Bukan Bagian Tim Anda
                          </span>
                        )}

                        {/* Tombol Fold/Unfold Panel Kanan (L2) */}
                        <button
                          type="button"
                          onClick={() => setIsRightPanelCollapsed(prev => !prev)}
                          className={`p-1.5 rounded-lg border transition ${
                            isRightPanelCollapsed 
                              ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-2xs' 
                              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 border-transparent'
                          }`}
                          title={isRightPanelCollapsed ? "Buka Panel Informasi Kanan" : "Sembunyikan Panel Kanan"}
                        >
                          <Sliders className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* Bubble Chat Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  
                  {/* FASE 3 V4: BILAH KONTROL TIMELINE RIWAYAT LAMPAU & LAZY-LOAD WA */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between bg-slate-100/90 border border-slate-200/90 rounded-xl px-3 py-2 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setShowPastHistory(prev => !prev)}
                        className="flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-slate-900 transition"
                      >
                        <History className="w-4 h-4 text-blue-600" />
                        <span>
                          {showPastHistory ? 'Sembunyikan Riwayat Lampau' : (
                            pastTickets.length > 0 
                              ? `Lihat ${pastTickets.length} Tiket Lampau Pelanggan Ini`
                              : (waArchivedMessages.length > 0 ? 'Lihat Arsip WhatsApp' : 'Riwayat Percakapan Lampau')
                          )}
                        </span>
                        {pastTickets.length > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold border border-blue-200">
                            {pastTickets.length} Tiket Selesai
                          </span>
                        )}
                        {showPastHistory ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                      </button>

                      <div className="flex items-center gap-2">
                        {isL1 && (
                          <button
                            type="button"
                            onClick={handleFetchWaHistory}
                            disabled={isFetchingWaHistory}
                            className="px-2.5 py-1 text-xs bg-white hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800 border border-emerald-300 rounded-lg font-medium transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                            title="Tarik 20 pesan riwayat lama langsung dari WhatsApp via Evolution API"
                          >
                            <Download className="w-3.5 h-3.5" />
                            {isFetchingWaHistory ? 'Menarik...' : 'Tarik Arsip WA'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* KONTEN ACCORDION: Pesan Riwayat Lampau (Dimmed / Semi-Transparan) */}
                    {showPastHistory && (
                      <div className="mt-3 space-y-4 p-3.5 bg-slate-50/80 border border-dashed border-slate-300 rounded-2xl animate-in fade-in duration-150">
                        {isLoadingHistory && (
                          <div className="p-3 text-center text-xs text-slate-500">
                            Memuat riwayat tiket lampau...
                          </div>
                        )}

                        {!isLoadingHistory && pastTickets.length === 0 && waArchivedMessages.length === 0 && (
                          <div className="p-3 text-center text-xs text-slate-500 bg-white/70 rounded-xl border border-slate-200">
                            Pelanggan ini belum memiliki riwayat tiket yang telah ditutup sebelumnya.
                          </div>
                        )}

                        {/* 1. Arsip WhatsApp Lama dari Evolution API (jika ada) */}
                        {waArchivedMessages.length > 0 && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 my-2 text-emerald-600">
                              <div className="flex-1 h-px bg-emerald-200"></div>
                              <span className="text-[10px] font-bold px-2.5 py-0.5 bg-emerald-50 text-emerald-800 rounded-full border border-emerald-300 flex items-center gap-1">
                                📥 Arsip WhatsApp Lama ({waArchivedMessages.length} Pesan)
                              </span>
                              <div className="flex-1 h-px bg-emerald-200"></div>
                            </div>

                            {waArchivedMessages.map((msg, midx) => {
                              const isFromCustomer = msg.sender_type === 'CUSTOMER';
                              return (
                                <div key={`wa-${midx}`} className={`flex ${isFromCustomer ? 'justify-start' : 'justify-end'} opacity-75 hover:opacity-100 transition-opacity`}>
                                  <div className={`p-3 rounded-2xl text-xs max-w-[75%] border shadow-2xs ${
                                    isFromCustomer ? 'bg-white text-gray-800 border-gray-200' : 'bg-emerald-600 text-white border-emerald-600'
                                  }`}>
                                    <div className="flex justify-between items-center text-[10px] mb-1 gap-2">
                                      <span className="font-semibold uppercase tracking-wider">
                                        {isFromCustomer ? (activeTicket.customer?.name || 'Pelapor') : 'Agen WA'}
                                      </span>
                                      <span className={isFromCustomer ? 'text-gray-400' : 'text-emerald-100'}>
                                        {msg.created_at ? format(new Date(msg.created_at), 'dd/MM HH:mm') : ''}
                                      </span>
                                    </div>
                                    <p className="whitespace-pre-wrap">{msg.message_text}</p>
                                    <span className="text-[9px] mt-1 block italic opacity-75">
                                      (Arsip pesan WhatsApp lama)
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* 2. Daftar Tiket Lampau Lokal (Closed Tickets) */}
                        {pastTickets.map((t) => (
                          <div key={`past-t-${t.id}`} className="space-y-3 pt-2">
                            {/* Garis Pembatas Tiket Lampau */}
                            <div className="flex items-center gap-2 my-2">
                              <div className="flex-1 h-px bg-slate-300"></div>
                              <div className="text-[10px] font-bold text-slate-700 px-3 py-1 bg-white rounded-full border border-slate-300 flex items-center gap-1.5 shadow-2xs">
                                <Lock className="w-3 h-3 text-slate-500" />
                                <span>TIKET LALU #{t.id}</span>
                                <span className="text-slate-400">•</span>
                                <span className={t.is_aduan ? 'text-amber-700' : 'text-blue-700'}>
                                  {t.is_aduan ? '🚨 Aduan Teknis' : '💬 Percakapan Biasa'}
                                </span>
                                {t.closed_at && (
                                  <>
                                    <span className="text-slate-400">•</span>
                                    <span className="text-slate-500 font-normal">
                                      Selesai {format(new Date(t.closed_at), 'dd/MM/yyyy HH:mm')}
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="flex-1 h-px bg-slate-300"></div>
                            </div>

                            {/* Info Solusi Penutupan Lampau */}
                            {t.summary && (
                              <div className="mx-auto max-w-[85%] p-2.5 bg-white/90 border border-slate-200 rounded-xl text-xs text-slate-600 shadow-2xs">
                                <span className="font-semibold text-slate-800 block text-[10px] uppercase tracking-wider mb-0.5">
                                  📋 Kesimpulan Penanganan #{t.id}:
                                </span>
                                <p className="italic">{t.summary}</p>
                              </div>
                            )}

                            {/* Gelembung Pesan Tiket Lampau (Dimmed / Semi-Transparan) */}
                            {t.messages && t.messages.map((pmsg, pidx) => {
                              const isCust = pmsg.sender_type === 'CUSTOMER';
                              return (
                                <div key={`pmsg-${pidx}`} className={`flex ${isCust ? 'justify-start' : 'justify-end'} opacity-75 hover:opacity-100 transition-opacity`}>
                                  <div className={`p-3 rounded-2xl text-xs max-w-[75%] border shadow-2xs ${
                                    isCust 
                                      ? 'bg-white text-gray-800 border-gray-200' 
                                      : (pmsg.is_internal ? 'bg-amber-50 text-amber-900 border-amber-300' : 'bg-blue-600 text-white border-blue-600')
                                  }`}>
                                    <div className="flex justify-between items-center text-[10px] mb-1 gap-2">
                                      <span className="font-semibold uppercase tracking-wider">
                                        {isCust 
                                          ? (activeTicket.customer?.name || 'Pelapor') 
                                          : (pmsg.is_internal ? '🏷️ Catatan Internal' : (pmsg.sender?.name || 'Dispatcher L1'))}
                                      </span>
                                      <span className={isCust || pmsg.is_internal ? 'text-gray-400' : 'text-blue-100'}>
                                        {pmsg.created_at ? format(new Date(pmsg.created_at), 'dd/MM HH:mm') : ''}
                                      </span>
                                    </div>
                                    {pmsg.attachment_url && (
                                      <div className="mb-2">
                                        <img 
                                          src={pmsg.attachment_url.startsWith('http') ? pmsg.attachment_url : `${BASE_URL}${pmsg.attachment_url}`} 
                                          alt="Lampiran Lampau" 
                                          className="max-w-[200px] max-h-[140px] object-cover rounded-lg border border-black/10 cursor-pointer"
                                          onClick={() => setPreviewImageUrl(pmsg.attachment_url)}
                                        />
                                      </div>
                                    )}
                                    {pmsg.message_text && <p className="whitespace-pre-wrap">{pmsg.message_text}</p>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ))}

                        {/* Garis Pemisah Percakapan Aktif */}
                        <div className="flex items-center gap-2 pt-3 my-2 text-emerald-600">
                          <div className="flex-1 h-0.5 bg-emerald-400"></div>
                          <span className="text-[11px] font-bold px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-300 flex items-center gap-1.5 shadow-2xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            PERCAKAPAN AKTIF SAAT INI (Tiket #{activeTicket.id})
                          </span>
                          <div className="flex-1 h-0.5 bg-emerald-400"></div>
                        </div>
                      </div>
                    )}
                  </div>

                  {messages.map((msg, idx) => {
                    const isCustomer = msg.sender_type === 'CUSTOMER';
                    const isBot = msg.sender_type === 'BOT'; 
                    // Fase 1 V2: Highlight jika ini internal note
                    if (msg.is_internal) {
                      const isSystem = msg.message_text?.startsWith('[SISTEM]');
                      const senderCat = msg.sender?.category?.name;
                      const senderName = msg.sender?.name;

                      let badgeTitle = 'Catatan Internal';
                      if (isSystem) {
                        badgeTitle = 'Notifikasi Sistem';
                      } else if (msg.sender?.role === 'L1') {
                        badgeTitle = `Catatan Internal - Dispatcher L1${senderName ? ` (${senderName})` : ''}`;
                      } else if (msg.sender?.role === 'ADMIN') {
                        badgeTitle = `Catatan Internal - Administrator${senderName ? ` (${senderName})` : ''}`;
                      } else if (senderCat) {
                        badgeTitle = `Catatan Internal - Tim ${senderCat}${senderName ? ` (${senderName})` : ''}`;
                      } else if (senderName) {
                        badgeTitle = `Catatan Internal - ${senderName}`;
                      }

                      return (
                        <div key={idx} className="flex justify-center my-4">
                          <div className={`px-4 py-2.5 rounded-xl text-sm max-w-[85%] border shadow-sm text-left ${
                            isSystem
                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                              : 'bg-yellow-50 text-yellow-900 border-yellow-300'
                          }`}>
                            <div className="flex items-center justify-between gap-3 mb-1 pb-1 border-b border-yellow-200/60">
                              <span className="font-bold text-xs flex items-center gap-1.5 text-yellow-800">
                                🏷️ {badgeTitle}
                              </span>
                              <span className="text-[10px] text-yellow-600 font-mono">
                                {msg.created_at ? format(new Date(msg.created_at), 'HH:mm') : ''}
                              </span>
                            </div>
                            {msg.attachment_url && (
                              <div className="my-2">
                                <img
                                  src={`${BASE_URL}${msg.attachment_url}`}
                                  alt="Lampiran Internal"
                                  onClick={() => setPreviewImageUrl(`${BASE_URL}${msg.attachment_url}`)}
                                  className="max-h-60 rounded-lg cursor-pointer hover:opacity-90 border border-yellow-300 shadow-sm transition-all object-contain bg-white/80"
                                />
                                <span className="text-[10px] text-yellow-700 mt-0.5 block italic">
                                  🔍 Klik foto untuk memperbesar
                                </span>
                              </div>
                            )}
                            {msg.message_text && (
                              <p className="whitespace-pre-wrap leading-relaxed text-xs sm:text-sm">
                                {msg.message_text}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={idx} className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[70%] rounded-lg p-3 shadow-sm ${
                          isCustomer ? 'bg-white border border-gray-200 text-gray-800' 
                          : isBot ? 'bg-slate-700 text-white' 
                          : 'bg-blue-600 text-white'
                        }`}>
                          {/* Render Attachment Fase 3 */}
                          {msg.attachment_url && (
                            <img src={`${BASE_URL}${msg.attachment_url}`} alt="Attachment" className="max-w-full rounded-md mb-2 object-contain bg-white" style={{maxHeight: '200px'}} />
                          )}
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.message_text}</p>
                          <span className={`text-[10px] mt-1 block text-right ${isCustomer ? 'text-gray-400' : 'text-blue-200'}`}>
                            {format(new Date(msg.created_at), 'HH:mm')} {isBot && ' (Auto-Reply)'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Kotak Ketik Balasan (RBAC) */}
                {isL1 ? (
                  <div className="bg-white border-t border-gray-200">
                    {/* Tab Switcher: Mode Kirim */}
                    <div className="flex border-b border-gray-100 px-4 pt-2 gap-2 bg-gray-50/70">
                      <button
                        type="button"
                        onClick={() => setChatMode('public')}
                        className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
                          chatMode === 'public'
                            ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg shadow-sm'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Balas Pelanggan (WhatsApp)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatMode('internal')}
                        className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
                          chatMode === 'internal'
                            ? 'border-amber-500 text-amber-700 bg-amber-50 rounded-t-lg shadow-sm'
                            : 'border-transparent text-gray-500 hover:text-amber-700'
                        }`}
                      >
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Catatan Internal (Tim L1 & L2)</span>
                        <span className="text-[10px] bg-amber-200/70 text-amber-800 px-1.5 py-0.2 rounded-full font-bold">
                          Rahasia
                        </span>
                      </button>
                    </div>

                    {/* Mode 1: Balas WhatsApp Pelanggan */}
                    {chatMode === 'public' ? (
                      <div className="p-3.5 flex flex-col relative">
                        {/* Floating Suggestions Quick Replies (Fase 5) */}
                        {showQuickRepliesPopup && filteredQuickReplies.length > 0 && (
                          <div className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden z-30 animate-in fade-in slide-in-from-bottom-2 duration-150 max-h-64 flex flex-col">
                            <div className="p-2.5 px-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 flex items-center justify-between text-xs">
                              <span className="font-bold text-amber-900 flex items-center gap-1.5">
                                <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                                <span>Balasan Cepat: Gunakan ↑↓ lalu Enter untuk memilih</span>
                              </span>
                              <span className="text-[10px] text-amber-700/80 font-medium">Esc untuk tutup</span>
                            </div>
                            <div className="overflow-y-auto divide-y divide-gray-100 p-1">
                              {filteredQuickReplies.map((qr, idx) => (
                                <button
                                  key={qr.id}
                                  type="button"
                                  onClick={() => insertQuickReply(qr)}
                                  className={`w-full text-left p-2.5 px-3 rounded-xl transition flex items-center justify-between group ${
                                    idx === quickReplySelectedIndex 
                                      ? 'bg-blue-50 text-blue-900 font-semibold' 
                                      : 'hover:bg-gray-50 text-gray-700'
                                  }`}
                                >
                                  <div className="flex-1 min-w-0 pr-3">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-200">
                                        /{qr.shortcut}
                                      </span>
                                      <span className="text-xs font-bold text-gray-800 truncate">{qr.title}</span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 truncate">{qr.content}</p>
                                  </div>
                                  <span className="text-[10px] text-gray-400 group-hover:text-blue-600 font-medium">Pilih ↵</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <form onSubmit={handleSend} className="flex items-center space-x-2 w-full">
                          {/* Tombol Cepat Buka Picker Template */}
                          <button
                            type="button"
                            onClick={() => {
                              setQuickReplyFilter('');
                              setShowQuickRepliesPopup(!showQuickRepliesPopup);
                            }}
                            className="p-2 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-full transition-colors"
                            title="Pilih Balasan Cepat (Shortcut /)"
                          >
                            <Zap className="w-5 h-5 fill-amber-400" />
                          </button>

                          <button 
                            type="button" 
                            onClick={() => fileInputRef.current?.click()} 
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors relative"
                            title="Lampirkan Gambar"
                          >
                            <Paperclip className="w-5 h-5" />
                            {selectedFile && <span className="absolute top-0 right-0 w-2 h-2 bg-green-500 rounded-full"></span>}
                          </button>
                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            onChange={(e) => setSelectedFile(e.target.files[0])}
                            accept="image/*"
                          />
                          <input 
                            type="text" 
                            value={replyText}
                            onChange={(e) => handleReplyInputChange(e.target.value)}
                            onKeyDown={handleReplyInputKeyDown}
                            placeholder={selectedFile ? `Kirim gambar ${selectedFile.name}...` : "Ketik balasan (ketik / untuk balasan cepat)..."}
                            className="flex-1 py-2.5 px-4 border border-gray-300 rounded-full focus:outline-none focus:border-blue-500 bg-gray-50 text-sm"
                          />
                          <button 
                            type="submit" 
                            disabled={!replyText.trim() && !selectedFile} 
                            className="px-4 py-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md flex items-center gap-1.5 text-sm font-semibold"
                          >
                            <span>Kirim</span>
                            <Send className="w-4 h-4" />
                          </button>
                        </form>
                      </div>
                    ) : (
                      /* Mode 2: Catatan Internal L1 ke Tim L2 */
                      <div className="p-3.5 bg-amber-50/70 border-t border-amber-200/50">
                        <div className="flex items-center justify-between mb-1.5 text-[11px] text-amber-800">
                          <span className="font-semibold flex items-center gap-1">
                            <Lock className="w-3 h-3 text-amber-600" /> Mode Catatan Internal Dispatcher
                          </span>
                          <span className="text-amber-700/80 italic text-[10px]">
                            Hanya dibaca tim L1, L2, & Admin. TIDAK terkirim ke WhatsApp pelapor.
                          </span>
                        </div>

                        {/* Preview file internal terpilih */}
                        {selectedInternalFile && (
                          <div className="mb-2 flex items-center gap-2 bg-amber-100 text-amber-900 px-3 py-1 rounded-lg text-xs w-fit border border-amber-300 shadow-xs">
                            <ImageIcon className="w-3.5 h-3.5 text-amber-700" />
                            <span className="truncate max-w-[220px] font-medium">{selectedInternalFile.name}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedInternalFile(null);
                                if (internalFileInputRef.current) internalFileInputRef.current.value = '';
                              }}
                              className="text-amber-700 hover:text-amber-900 ml-1 p-0.5 rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <form onSubmit={handleSendInternalNote} className="flex items-center space-x-2 w-full">
                          <button
                            type="button"
                            onClick={() => internalFileInputRef.current?.click()}
                            className="p-2 text-amber-700 hover:text-amber-900 hover:bg-amber-100 rounded-full transition-colors relative"
                            title="Lampirkan Foto Lapangan / Gambar Internal (Rahasia)"
                          >
                            <Paperclip className="w-5 h-5" />
                            {selectedInternalFile && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-amber-600 rounded-full ring-2 ring-white"></span>}
                          </button>
                          <input
                            type="file"
                            ref={internalFileInputRef}
                            className="hidden"
                            onChange={e => setSelectedInternalFile(e.target.files?.[0] || null)}
                            accept="image/*"
                          />
                          <input 
                            type="text" 
                            value={internalNoteText}
                            onChange={e => setInternalNoteText(e.target.value)}
                            placeholder={selectedInternalFile ? `Kirim foto ${selectedInternalFile.name}...` : "Ketik catatan atau instruksi internal untuk teknisi L2..."}
                            className="flex-1 py-2.5 px-4 border border-amber-300 rounded-full focus:outline-none focus:border-amber-500 bg-white text-sm"
                          />
                          <button 
                            type="submit" 
                            disabled={!internalNoteText.trim() && !selectedInternalFile} 
                            className="px-4 py-2.5 bg-amber-600 text-white rounded-full hover:bg-amber-700 disabled:opacity-50 transition-colors shadow-sm text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>Kirim Catatan</span>
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-yellow-50 border-t border-yellow-200 flex flex-col">
                    <label className="text-xs font-bold text-yellow-800 mb-1 flex items-center gap-1.5">
                      <span>🏷️ Catatan Internal {currentUser.category ? `Tim ${typeof currentUser.category === 'object' ? currentUser.category?.name : currentUser.category}` : 'L2'}</span>
                      <span className="text-[10px] font-normal text-yellow-700">(Hanya dibaca L1 & Tim Lapangan, 100% Rahasia)</span>
                    </label>

                    {/* Preview file internal terpilih untuk L2 */}
                    {selectedInternalFile && (
                      <div className="mb-2 flex items-center gap-2 bg-yellow-100 text-yellow-900 px-3 py-1 rounded-lg text-xs w-fit border border-yellow-300 shadow-xs">
                        <ImageIcon className="w-3.5 h-3.5 text-yellow-700" />
                        <span className="truncate max-w-[220px] font-medium">{selectedInternalFile.name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedInternalFile(null);
                            if (internalFileInputRef.current) internalFileInputRef.current.value = '';
                          }}
                          className="text-yellow-700 hover:text-yellow-900 ml-1 p-0.5 rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <form onSubmit={handleSendInternalNote} className="flex items-center space-x-2 w-full">
                      <button
                        type="button"
                        onClick={() => internalFileInputRef.current?.click()}
                        className="p-2 text-yellow-700 hover:text-yellow-900 hover:bg-yellow-100 rounded-full transition-colors relative"
                        title="Lampirkan Foto Lapangan (Kamera / Gambar)"
                      >
                        <Paperclip className="w-5 h-5" />
                        {selectedInternalFile && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-yellow-600 rounded-full ring-2 ring-white"></span>}
                      </button>
                      <input
                        type="file"
                        ref={internalFileInputRef}
                        className="hidden"
                        onChange={e => setSelectedInternalFile(e.target.files?.[0] || null)}
                        accept="image/*"
                      />
                      <input 
                        type="text" 
                        value={internalNoteText}
                        onChange={e => setInternalNoteText(e.target.value)}
                        placeholder={selectedInternalFile ? `Kirim foto ${selectedInternalFile.name}...` : `Ketik progres penanganan ${currentUser.category ? `(Tim ${typeof currentUser.category === 'object' ? currentUser.category?.name : currentUser.category})` : ''}...`}
                        className="flex-1 py-2.5 px-4 border border-yellow-300 rounded-full focus:outline-none focus:border-yellow-500 bg-white text-sm"
                      />
                      <button type="submit" disabled={!internalNoteText.trim() && !selectedInternalFile} className="px-4 py-2.5 bg-yellow-600 text-white rounded-full hover:bg-yellow-700 disabled:opacity-50 transition-colors shadow-sm text-sm font-semibold whitespace-nowrap">
                        Simpan Catatan
                      </button>
                    </form>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Phone className="w-12 h-12 text-gray-300" />
                </div>
                <p className="text-lg font-medium text-gray-500">Pilih salah satu tiket untuk menangani</p>
              </div>
            )}
          </div>

          {/* PANEL KANAN: Pusat Kendali Adaptif (Bisa Di-collapse untuk Laptop 1366x768) */}
          {!isRightPanelCollapsed && (
            <div className="w-[24%] 2xl:w-[20%] bg-white border-l border-gray-200 p-4 overflow-y-auto animate-in fade-in duration-150">
              <div className="flex justify-between items-center mb-3 pb-2 border-b">
                <h3 className="font-bold text-gray-800 text-sm">Pusat Kendali</h3>
                <button
                  type="button"
                  onClick={() => setIsRightPanelCollapsed(true)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  title="Sembunyikan panel kanan"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* DETAIL USER LOGIN */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-5">
                <div className="font-bold text-blue-900 text-xs sm:text-sm">{currentUser.name}</div>
                <div className="text-[11px] text-gray-500 mb-2 truncate">{currentUser.email}</div>
                <div className="flex items-center space-x-2">
                  <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">ROLE: {currentUser.role}</span>
                  {currentUser.category && (
                     <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold truncate max-w-[100px]">
                       {typeof currentUser.category === 'object' ? currentUser.category?.name : currentUser.category}
                     </span>
                  )}
                </div>
              </div>

              {/* KONEKSI PORTAL HTS DISKOMDIGI (L1 & ADMIN) */}
              {(isL1 || isAdmin) && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-5 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                      <Globe className="w-4 h-4 text-blue-600" /> Portal HTS
                    </div>
                    {htsStatus.isLoggedIn ? (
                      <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Terhubung
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                        <AlertCircle className="w-3 h-3 text-amber-600" /> Belum Login
                      </span>
                    )}
                  </div>

                  {htsStatus.isLoggedIn ? (
                    <div>
                      <p className="text-[11px] text-gray-600 truncate mb-2">Akun: <strong className="text-gray-800">{htsStatus.email}</strong></p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleOpenHtsModal}
                          className="flex-1 text-[11px] py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium rounded border border-blue-200 transition"
                        >
                          Ganti Sesi
                        </button>
                        <button
                          onClick={handleHtsLogout}
                          className="text-[11px] py-1 px-2 bg-red-50 hover:bg-red-100 text-red-700 font-medium rounded border border-red-200 transition"
                          title="Putus Koneksi"
                        >
                          Putus
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[11px] text-gray-500 mb-2 leading-tight">Hubungkan akun portal HTS Anda untuk sinkronisasi tiket resmi.</p>
                      <button
                        onClick={handleOpenHtsModal}
                        className="w-full text-xs py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition flex items-center justify-center gap-1.5"
                      >
                        <Key className="w-3.5 h-3.5" /> Hubungkan Akun HTS
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeTicket && (
                <>
                  <h3 className="font-bold text-gray-800 mb-3 border-b pb-1.5 text-xs uppercase tracking-wider text-gray-500">
                    Informasi Obrolan
                  </h3>
                  
                  <div className="space-y-4">
                    {/* Identitas Pelapor */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] uppercase font-bold text-gray-400 block">Nama Pelapor</label>
                        {isL1 && (
                          <button
                            onClick={handleOpenEditCustomerModal}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
                            title="Ubah identitas pelapor"
                          >
                            <Edit2 className="w-3 h-3" /> Edit
                          </button>
                        )}
                      </div>
                      <div className="flex items-center text-xs font-semibold text-gray-800">
                        <User className="w-4 h-4 mr-2 text-gray-400" />
                        <span className="flex-1 truncate">{activeTicket.customer?.name}</span>
                        {activeTicket.customer?.is_imported_contact && (
                          <span className="ml-1.5 px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded text-[9px] font-bold border border-amber-300">
                            Master Data
                          </span>
                        )}
                      </div>
                      {activeTicket.customer?.skpd_name && (
                        <div className="text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded mt-1.5 ml-6 inline-block font-medium border border-blue-200">
                          Instansi: {activeTicket.customer.skpd_name}
                        </div>
                      )}
                      {/* Data Pembanding: Profil Asli WhatsApp vs Nama Master Data */}
                      {activeTicket.customer?.wa_push_name && activeTicket.customer.wa_push_name !== activeTicket.customer.name && (
                        <div className="text-[10px] text-gray-500 bg-gray-50 px-2 py-1 rounded mt-1.5 ml-6 border border-gray-200">
                          <span className="text-gray-400 block text-[9px] uppercase font-semibold">Nama Profil WhatsApp:</span>
                          <span className="italic font-medium text-gray-600">"{activeTicket.customer.wa_push_name}"</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Nomor WhatsApp</label>
                      <div className="flex items-center text-xs text-gray-800">
                        <Phone className="w-3.5 h-3.5 mr-2 text-gray-400" />+{activeTicket.customer?.wa_number}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Waktu Masuk</label>
                      <div className="flex items-center text-xs text-gray-800">
                        <Clock className="w-3.5 h-3.5 mr-2 text-gray-400" />{format(new Date(activeTicket.created_at), 'dd MMM yyyy, HH:mm')}
                      </div>
                    </div>

                    {/* KONDISI 1: PERCAKAPAN BIASA (KARTU ADAPTIF) */}
                    {!activeTicket.is_aduan ? (
                      <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2.5 shadow-2xs">
                        <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
                          <MessageSquare className="w-4 h-4 text-blue-600" />
                          <span>Mode: Percakapan Biasa</span>
                        </div>
                        <p className="text-[11px] text-blue-700 leading-relaxed">
                          Obrolan ini berstatus percakapan umum. Tidak masuk ke antrean teknisi L2 dan dikecualikan dari metrik SLA (MTTR).
                        </p>
                        {isL1 && (
                          <div className="space-y-1.5 pt-1">
                            <button
                              type="button"
                              onClick={handleCloseGeneralChat}
                              disabled={isClosingGeneral}
                              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Selesaikan Percakapan
                            </button>
                            <button
                              type="button"
                              onClick={handleToggleAduan}
                              disabled={isTogglingAduan}
                              className="w-full py-1.5 bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1"
                            >
                              🚨 Ubah Jadi Aduan Teknis
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* KONDISI 2: ADUAN TEKNIS (STATUS HTS & TIM L2) */
                      <>
                        {/* Status Portal HTS Diskomdigi (Multi-HTS Support V4.2 SSOT) */}
                        {(() => {
                          const displayedHtsTickets = (activeTicket.hts_tickets && activeTicket.hts_tickets.length > 0)
                            ? activeTicket.hts_tickets
                            : (activeTicket.hts_ticket_no ? [{
                                id: activeTicket.hts_ticket_id || 'legacy',
                                hts_ticket_no: activeTicket.hts_ticket_no,
                                hts_ticket_status: activeTicket.hts_ticket_status || 'PENDING',
                                is_legacy: true
                              }] : []);

                          return (
                            <div className="p-3 rounded-xl border bg-gray-50/70 border-gray-200 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                                  <Globe className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Portal HTS Diskomdigi</span>
                                  {displayedHtsTickets.length > 1 && (
                                    <span className="text-[10px] px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded-full font-bold">
                                      {displayedHtsTickets.length} Tiket
                                    </span>
                                  )}
                                </div>
                                {displayedHtsTickets.length === 0 && (
                                  <span className="text-[10px] font-medium px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full">
                                    Belum Terhubung
                                  </span>
                                )}
                              </div>

                              {/* Daftar Tiket HTS (SSOT Unifikasi V4.2) */}
                              {displayedHtsTickets.length > 0 ? (
                                <div className="space-y-2">
                                  {displayedHtsTickets.map((ht) => {
                                    const isSolved = ht.hts_ticket_status === 'SOLVED';
                                    const cardPicIds = getTicketInitialPicIds(ht);
                                    const cardPicNames = cardPicIds.map(id => htsMasterData.pics?.find(p => String(p.id) === String(id))?.name?.split(',')[0] || `PIC #${id}`).join(', ');

                                    return (
                                      <div key={ht.id || ht.hts_ticket_no} className="p-2.5 bg-white rounded-lg border border-gray-200 shadow-2xs space-y-2">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-mono font-bold text-xs text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                              #{ht.hts_ticket_no}
                                            </span>
                                            {ht.category?.name && (
                                              <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.2 rounded">
                                                {ht.category.name}
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                                              isSolved
                                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                : 'bg-amber-100 text-amber-800 border-amber-300'
                                            }`}>
                                              {ht.hts_ticket_status || 'PENDING'}
                                            </span>
                                            {isL1 && (
                                              <button
                                                type="button"
                                                onClick={() => handleUnlinkHtsTicket(ht.id || ht.hts_ticket_id, ht.hts_ticket_no)}
                                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-rose-50 rounded transition"
                                                title="Lepas tautan tiket HTS dari percakapan ini"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                          </div>
                                        </div>

                                        {/* Info Tambahan PIC / Waktu Selesai */}
                                        <div className="text-[10.5px] text-gray-600 bg-gray-50 p-1.5 rounded-md border border-gray-150 space-y-0.5 leading-snug">
                                          {isSolved ? (
                                            <>
                                              <div className="flex items-center justify-between text-emerald-800 font-semibold text-[10px]">
                                                <span>✓ Selesai: {ht.solved_at ? format(new Date(ht.solved_at), 'dd/MM/yyyy HH:mm') : 'SOLVED'}</span>
                                              </div>
                                              {ht.solution && (
                                                <p className="text-gray-700 italic text-[10px] line-clamp-2">
                                                  "{ht.solution}"
                                                </p>
                                              )}
                                            </>
                                          ) : (
                                            <div className="flex items-center gap-1 text-gray-600 text-[10px]">
                                              <span className="font-semibold text-gray-500">PIC:</span>
                                              <span className="truncate">{cardPicNames || 'Helpdesk - Ori'}</span>
                                            </div>
                                          )}
                                        </div>

                                        {/* Tombol Aksi Mandiri */}
                                        <div className="flex items-center justify-between gap-1.5 pt-0.5">
                                          {!isSolved ? (
                                            <button
                                              type="button"
                                              onClick={() => handleOpenSolveSingleHts(ht)}
                                              className="flex-1 py-1 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10.5px] rounded-md transition shadow-2xs flex items-center justify-center gap-1"
                                            >
                                              <Check className="w-3 h-3" /> Selesaikan HTS
                                            </button>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => handleOpenDetailHts(ht)}
                                              className="flex-1 py-1 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold text-[10.5px] rounded-md transition flex items-center justify-center gap-1"
                                            >
                                              <Eye className="w-3 h-3" /> Lihat Detail Solusi
                                            </button>
                                          )}

                                          <button
                                            type="button"
                                            onClick={() => handleCopyHtsTicketNo(ht.hts_ticket_no)}
                                            className="py-1 px-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-[10.5px] font-medium transition flex items-center gap-1 shrink-0"
                                            title="Salin nomor tiket HTS"
                                          >
                                            {copiedHtsNo === ht.hts_ticket_no ? (
                                              <>
                                                <Check className="w-3 h-3 text-emerald-600" />
                                                <span className="text-emerald-700 text-[9.5px] font-bold">Disalin</span>
                                              </>
                                            ) : (
                                              <>
                                                <Copy className="w-3 h-3 text-gray-500" />
                                                <span className="text-[9.5px]">Salin</span>
                                              </>
                                            )}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {/* Tombol Tambah Tautan / Tiket HTS Lain */}
                                  {isL1 && (
                                    <button
                                      type="button"
                                      onClick={handleOpenSyncHtsModal}
                                      className="w-full mt-1.5 py-1.5 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg border border-dashed border-blue-300 font-medium transition flex items-center justify-center gap-1"
                                    >
                                      <Plus className="w-3.5 h-3.5" /> Tautkan / Terbitkan Tiket HTS Lain
                                    </button>
                                  )}
                                </div>
                              ) : (
                                /* Belum ada tiket HTS sama sekali */
                                <div className="mt-2">
                                  <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">
                                    Tiket ini belum diterbitkan atau ditautkan ke portal resmi HTS Diskomdigi.
                                  </p>
                                  {isL1 && (
                                    <button
                                      type="button"
                                      onClick={handleOpenSyncHtsModal}
                                      className="w-full text-xs py-1.5 px-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition flex items-center justify-center gap-1.5"
                                    >
                                      <Globe className="w-3.5 h-3.5" /> Sinkronkan / Tautkan ke Portal HTS
                                    </button>
                                  )}
                                </div>
                              )}

                              {activeTicket.hts_ticket_no && (
                                <a
                                  href="https://hts.diskomdigi.jatengprov.go.id/tshoot"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="pt-1 text-[11px] text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1 font-medium hover:underline border-t border-gray-100"
                                >
                                  Buka Portal HTS <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          );
                        })()}

                        {/* Status Tim Penanganan L2 */}
                        {activeTicket.categories && activeTicket.categories.length > 0 && (
                          <div className="p-3 rounded-xl border bg-gray-50/70 border-gray-200">
                            <label className="text-[10px] uppercase font-bold text-gray-500 block mb-2 flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-blue-600" /> Tim Teknisi L2
                            </label>
                            <div className="space-y-2">
                              {activeTicket.categories.map(tc => (
                                <div key={tc.category_id} className="text-xs bg-white p-2.5 rounded-lg border border-gray-200/80 shadow-xs">
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-gray-800">{tc.category?.name || 'Tim'}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                      tc.is_resolved 
                                        ? 'bg-emerald-100 text-emerald-800' 
                                        : 'bg-amber-100 text-amber-800'
                                    }`}>
                                      {tc.is_resolved ? '✓ Selesai' : '⏳ Proses'}
                                    </span>
                                  </div>
                                  {tc.solution && (
                                    <div className="mt-1.5 pt-1.5 border-t border-gray-100 text-[11px] text-gray-600 leading-relaxed bg-gray-50/80 p-1.5 rounded">
                                      <span className="font-medium text-gray-700 block text-[10px] uppercase text-gray-400">Solusi Teknis:</span>
                                      {tc.solution}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* HALAMAN REPORTING & METRIK SLA (FASE 5) */}
      {currentTab === 'report' && (() => {
        const totalAduan = reportTickets.filter(t => t.isAduan).length;
        const totalBiasa = reportTickets.filter(t => !t.isAduan).length;

        // Hitung FRT (First Response Time)
        const frtList = reportTickets.filter(t => t.frtMins !== null && t.frtMins !== undefined);
        const avgFrtMins = frtList.length > 0 
          ? Math.round(frtList.reduce((acc, t) => acc + t.frtMins, 0) / frtList.length) 
          : null;
        const avgFrtStr = avgFrtMins !== null 
          ? (avgFrtMins < 60 ? `${avgFrtMins} Menit` : `${Math.floor(avgFrtMins / 60)} Jam ${avgFrtMins % 60} Menit`) 
          : '-';

        // Hitung MTTR (Mean Time to Resolve) - Khusus Tiket Aduan Teknis yang Selesai
        const mttrList = reportTickets.filter(t => t.isAduan && t.durationMins !== null && t.durationMins !== undefined);
        const avgMttrMins = mttrList.length > 0 
          ? Math.round(mttrList.reduce((acc, t) => acc + t.durationMins, 0) / mttrList.length) 
          : null;
        const avgMttrStr = avgMttrMins !== null 
          ? (avgMttrMins < 60 ? `${avgMttrMins} Menit` : `${Math.floor(avgMttrMins / 60)} Jam ${avgMttrMins % 60} Menit`) 
          : '-';

        // Saring baris berdasarkan filter tipe tiket
        const displayedReports = reportTickets.filter(row => {
          if (reportFilterType === 'aduan') return row.isAduan;
          if (reportFilterType === 'biasa') return !row.isAduan;
          return true;
        });

        return (
          <div className="flex-1 bg-gray-50 flex flex-col p-6 overflow-hidden">
            {/* Header Laporan */}
            <div className="flex justify-between items-center mb-5">
              <div>
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <FileText className="w-6 h-6 text-blue-600" />
                  <span>Rekap Layanan & Metrik SLA SPBE</span>
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  Evaluasi kecepatan respon pertama (FRT), durasi penanganan aduan (MTTR), dan arsip riwayat tiket
                </p>
              </div>
              <div className="flex items-center space-x-2.5">
                {isAdmin && (
                  <>
                    <button 
                      onClick={handleDeleteSelectedReports} 
                      disabled={selectedReportIds.length === 0}
                      className="flex items-center bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-3.5 py-2 rounded-xl font-medium shadow-2xs transition disabled:opacity-40 disabled:cursor-not-allowed text-xs"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" /> Hapus Terpilih ({selectedReportIds.length})
                    </button>
                    <button 
                      onClick={handleDeleteAllReports} 
                      className="flex items-center bg-red-600 hover:bg-red-700 text-white px-3.5 py-2 rounded-xl font-medium shadow-2xs transition text-xs"
                    >
                      <AlertCircle className="w-4 h-4 mr-1.5" /> Hapus Semua
                    </button>
                  </>
                )}
                <button 
                  onClick={exportToCSV} 
                  className="flex items-center bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl font-semibold shadow-xs transition text-xs"
                >
                  <Download className="w-4 h-4 mr-1.5" /> Export CSV (SLA)
                </button>
              </div>
            </div>

            {/* 4 Kartu Metrik KPI SLA (Fase 5) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
              {/* Kartu 1: Total Aduan Teknis */}
              <div className="bg-white p-4 rounded-2xl border border-red-100 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-red-600">Aduan Teknis</span>
                  <div className="text-2xl font-black text-gray-800 mt-0.5">{totalAduan} <span className="text-xs font-semibold text-gray-400">Tiket</span></div>
                  <p className="text-[10px] text-gray-500 mt-0.5">Dikoordinasikan ke Tim L2 & HTS</p>
                </div>
                <div className="w-11 h-11 bg-red-50 text-red-600 rounded-xl flex items-center justify-center font-bold">
                  <AlertCircle className="w-6 h-6" />
                </div>
              </div>

              {/* Kartu 2: Total Percakapan Biasa */}
              <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Percakapan Biasa</span>
                  <div className="text-2xl font-black text-gray-800 mt-0.5">{totalBiasa} <span className="text-xs font-semibold text-gray-400">Sesi</span></div>
                  <p className="text-[10px] text-gray-500 mt-0.5">100% Bebas dari Beban SLA Teknis</p>
                </div>
                <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
                  <MessageSquare className="w-6 h-6" />
                </div>
              </div>

              {/* Kartu 3: Rata-Rata Waktu Respon Pertama (FRT) */}
              <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Rata-Rata Respon (FRT)</span>
                  <div className="text-2xl font-black text-gray-800 mt-0.5">{avgFrtStr}</div>
                  <p className="text-[10px] text-gray-500 mt-0.5">Kecepatan petugas L1 membalas</p>
                </div>
                <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold">
                  <Clock className="w-6 h-6" />
                </div>
              </div>

              {/* Kartu 4: Rata-Rata Penyelesaian Aduan (MTTR) */}
              <div className="bg-white p-4 rounded-2xl border border-indigo-100 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Rata-Rata Selesai (MTTR)</span>
                  <div className="text-2xl font-black text-gray-800 mt-0.5">{avgMttrStr}</div>
                  <p className="text-[10px] text-gray-500 mt-0.5">Khusus tiket aduan yang ditutup</p>
                </div>
                <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold">
                  <CheckCircle className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Filter Bar Tipe Tiket */}
            <div className="bg-white p-2.5 px-4 rounded-xl border border-gray-200 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-gray-500 mr-2">Filter Klasifikasi:</span>
                <button
                  type="button"
                  onClick={() => setReportFilterType('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    reportFilterType === 'all' 
                      ? 'bg-blue-600 text-white shadow-2xs' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Semua ({reportTickets.length})
                </button>
                <button
                  type="button"
                  onClick={() => setReportFilterType('aduan')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                    reportFilterType === 'aduan' 
                      ? 'bg-red-600 text-white shadow-2xs' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  🚨 Aduan Teknis ({totalAduan})
                </button>
                <button
                  type="button"
                  onClick={() => setReportFilterType('biasa')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                    reportFilterType === 'biasa' 
                      ? 'bg-blue-600 text-white shadow-2xs' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  💬 Percakapan Biasa ({totalBiasa})
                </button>
              </div>

              <span className="text-xs text-gray-400">
                Menampilkan <strong>{displayedReports.length}</strong> dari {reportTickets.length} data
              </span>
            </div>

            {/* Tabel Laporan & Rekapitulasi */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 overflow-hidden flex flex-col">
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left text-sm text-gray-600">
                  <thead className="bg-gray-50/90 border-b border-gray-200 text-gray-700 uppercase text-[11px] sticky top-0 z-10">
                    <tr>
                      {isAdmin && (
                        <th className="px-3 py-3.5 w-10 text-center">
                          <input 
                            type="checkbox" 
                            checked={displayedReports.length > 0 && selectedReportIds.length === displayedReports.length}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedReportIds(displayedReports.map(t => t.id));
                              else setSelectedReportIds([]);
                            }}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                          />
                        </th>
                      )}
                      <th className="px-4 py-3.5 font-semibold">ID</th>
                      <th className="px-5 py-3.5 font-semibold">Pelapor (WA)</th>
                      <th className="px-4 py-3.5 font-semibold">Tipe Tiket</th>
                      <th className="px-5 py-3.5 font-semibold">No. Tiket HTS</th>
                      <th className="px-4 py-3.5 font-semibold">Status</th>
                      <th className="px-4 py-3.5 font-semibold">Respon (FRT)</th>
                      <th className="px-4 py-3.5 font-semibold">Durasi (MTTR)</th>
                      <th className="px-4 py-3.5 font-semibold">Tim Terkait</th>
                      <th className="px-4 py-3.5 font-semibold">Waktu Masuk</th>
                      <th className="px-5 py-3.5 font-semibold min-w-[200px]">Kesimpulan Penanganan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {displayedReports.length === 0 ? (
                      <tr>
                        <td colSpan="11" className="px-6 py-12 text-center text-gray-400">
                          Tidak ada data tiket untuk filter ini.
                        </td>
                      </tr>
                    ) : (
                      displayedReports.map(row => (
                        <tr key={row.id} className="hover:bg-gray-50/70 transition-colors">
                          {isAdmin && (
                            <td className="px-3 py-3.5 text-center">
                              <input 
                                type="checkbox" 
                                checked={selectedReportIds.includes(row.id)}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedReportIds([...selectedReportIds, row.id]);
                                  else setSelectedReportIds(selectedReportIds.filter(id => id !== row.id));
                                }}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                          )}
                          <td className="px-4 py-3.5 font-mono text-xs font-bold text-gray-700">#{row.id}</td>
                          <td className="px-5 py-3.5">
                            <div className="font-semibold text-gray-800 text-xs">{row.customerName}</div>
                            {row.skpdName && row.skpdName !== '-' && (
                              <div className="text-[11px] text-blue-600 font-medium">{row.skpdName}</div>
                            )}
                            <div className="text-[11px] text-gray-400">+{row.waNumber}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              row.isAduan 
                                ? 'bg-amber-50 text-amber-800 border-amber-300' 
                                : 'bg-blue-50 text-blue-800 border-blue-200'
                            }`}>
                              {row.isAduan ? '🚨 Aduan' : '💬 Biasa'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            {row.htsTicketNo ? (
                              <div>
                                <div className="font-mono text-[11px] font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-flex items-center gap-1">
                                  <Globe className="w-3 h-3 text-blue-600" /> #{row.htsTicketNo}
                                </div>
                                {row.htsTicketStatus && (
                                  <span className={`block text-[10px] font-bold mt-0.5 uppercase ${
                                    row.htsTicketStatus === 'SOLVED' ? 'text-emerald-700' : 'text-blue-700'
                                  }`}>
                                    {row.htsTicketStatus}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              row.status === 'CLOSED' ? 'bg-gray-100 text-gray-700' :
                              row.status === 'RESOLVED' ? 'bg-blue-100 text-blue-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
                            {row.frt || '-'}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-medium text-gray-700 whitespace-nowrap">
                            {!row.isAduan ? (
                              <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                                N/A (Biasa)
                              </span>
                            ) : (
                              <span className="font-semibold text-gray-800">{row.duration}</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-semibold text-orange-700">
                            {row.categories || '-'}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                            {row.createdAt ? format(new Date(row.createdAt), 'dd MMM yyyy, HH:mm') : '-'}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-600">
                            {row.summary || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* HALAMAN MANAJEMEN PENGGUNA */}
      {currentTab === 'users' && isAdmin && (
        <div className="flex-1 bg-gray-50 flex flex-col p-6 overflow-y-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-800">Manajemen Pengguna</h1>
            <p className="text-sm text-gray-500 mt-1">Tambah, edit, atau hapus akun tim (L1/L2)</p>
          </div>
          
          <div className="flex space-x-6 items-start">
            {/* Form Tambah User */}
            <div className="w-[35%] bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="font-bold text-gray-800 mb-4 pb-2 border-b">Buat Akun Baru</h2>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Nama Lengkap</label>
                  <input type="text" required value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Email</label>
                  <input type="email" required value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Password</label>
                  <input type="password" required value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Role / Peran</label>
                  <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white">
                    <option value="L1">L1 (Dispatcher)</option>
                    <option value="L2">L2 (Teknisi)</option>
                    <option value="SPV">SPV (Supervisor)</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>
                {newUser.role === 'L2' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Kategori Khusus (Wajib L2)</label>
                    <select required value={newUser.category_id} onChange={e => setNewUser({...newUser, category_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white">
                      <option value="">-- Pilih Kategori --</option>
                      {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                  </div>
                )}
                <button type="submit" className="w-full mt-2 bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 transition">
                  Simpan Akun
                </button>
              </form>
            </div>

            {/* Tabel User */}
            <div className="flex-1 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="font-bold text-gray-800 mb-4 pb-2 border-b">Daftar Akun Terdaftar</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-600">
                  <thead className="bg-gray-50 text-gray-700 uppercase text-xs border-y">
                    <tr>
                      <th className="px-4 py-3">Nama</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Kategori (L2)</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map(user => (
                      <tr key={user.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                        <td className="px-4 py-3">{user.email}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${user.role === 'ADMIN' ? 'bg-red-100 text-red-700' : user.role === 'L1' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">{user.category?.name || '-'}</td>
                        <td className="px-4 py-3 text-right space-x-3">
                          <button 
                            onClick={() => handleStartEditUser(user)} 
                            className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1"
                            title="Ubah data pengguna"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(user.id)} 
                            className="text-red-600 hover:text-red-800 font-medium"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HALAMAN PENGATURAN TIM & KONTAK L2 (KHUSUS ADMIN) */}
      {currentTab === 'teams' && isAdmin && (
        <div className="flex-1 bg-gray-50 flex flex-col p-6 overflow-y-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <PhoneCall className="w-7 h-7 text-blue-600" /> Kontak & Target WhatsApp Blast L2
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Atur nomor WhatsApp personil teknisi atau ID Grup WhatsApp yang akan menerima notifikasi blast otomatis saat tiket di-assign.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {teamCategories.map(cat => {
              const inputState = newContactInputs[cat.id] || { name: '', wa_target: '' };

              return (
                <div key={cat.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
                  <div className="p-5 bg-gradient-to-r from-blue-900 to-blue-800 text-white">
                    <span className="text-xs uppercase tracking-wider text-blue-200 font-bold">Tim Lapangan</span>
                    <h3 className="text-lg font-bold mt-0.5">{cat.name}</h3>
                    <p className="text-xs text-blue-300 mt-1">
                      {cat.contacts?.length || 0} Kontak Terdaftar
                    </p>
                  </div>

                  {/* List Kontak */}
                  <div className="p-4 flex-1 overflow-y-auto space-y-3 min-h-[160px] max-h-[260px]">
                    {(!cat.contacts || cat.contacts.length === 0) ? (
                      <div className="text-center py-8 text-gray-400 text-xs">
                        Belum ada nomor kontak terdaftar.
                      </div>
                    ) : (
                      cat.contacts.map(contact => {
                        const isGroup = contact.wa_target?.includes('@g.us');
                        const isEditing = editingContactId === contact.id;

                        if (isEditing) {
                          return (
                            <div key={contact.id} className="p-2.5 bg-blue-50/70 rounded-xl border border-blue-300 shadow-sm space-y-2">
                              <div>
                                <input
                                  type="text"
                                  placeholder="Nama"
                                  value={editContactData.name}
                                  onChange={(e) => setEditContactData(prev => ({ ...prev, name: e.target.value }))}
                                  className="w-full text-xs px-2.5 py-1.5 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                                  autoFocus
                                />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  placeholder="No WA (08xx) / ID Grup"
                                  value={editContactData.wa_target}
                                  onChange={(e) => setEditContactData(prev => ({ ...prev, wa_target: e.target.value }))}
                                  className="flex-1 text-xs px-2.5 py-1.5 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-mono"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveEditContact(contact.id)}
                                  className="bg-green-600 hover:bg-green-700 text-white p-1.5 rounded-lg transition"
                                  title="Simpan Perubahan"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEditContact}
                                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 p-1.5 rounded-lg transition"
                                  title="Batal"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={contact.id} className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 transition">
                            <div className="truncate pr-2">
                              <div className="font-semibold text-gray-800 text-xs truncate flex items-center gap-1.5">
                                {contact.name}
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${isGroup ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                                  {isGroup ? 'Grup WA' : 'Personil'}
                                </span>
                              </div>
                              <div className="text-[11px] text-gray-500 font-mono mt-0.5 truncate">
                                {contact.wa_target}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleStartEditContact(contact)}
                                className="text-blue-600 hover:text-blue-800 p-1.5 rounded-lg hover:bg-blue-50 transition"
                                title="Edit Kontak"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteContact(contact.id)}
                                className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition"
                                title="Hapus Kontak"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Form Tambah Kontak */}
                  <div className="p-4 bg-gray-50 border-t border-gray-200 space-y-2.5">
                    <span className="text-xs font-bold text-gray-700 block">Tambah Kontak / Grup Baru</span>
                    <input
                      type="text"
                      placeholder="Nama (misal: Budi / Grup WA)"
                      value={inputState.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewContactInputs(prev => ({
                          ...prev,
                          [cat.id]: { ...(prev[cat.id] || {}), name: val }
                        }));
                      }}
                      className="w-full text-xs px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                    <input
                      type="text"
                      placeholder="No WA (08xx) atau ID Grup (xxx@g.us)"
                      value={inputState.wa_target}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewContactInputs(prev => ({
                          ...prev,
                          [cat.id]: { ...(prev[cat.id] || {}), wa_target: val }
                        }));
                      }}
                      className="w-full text-xs px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddContact(cat.id)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-xs transition flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah ke Tim {cat.name}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* HALAMAN PENGATURAN AUTO-REPLY BOT (KHUSUS L1) */}
      {currentTab === 'bot' && currentUser?.role === 'L1' && (
        <div className="flex-1 bg-gray-50 flex flex-col p-8 overflow-y-auto">
          <div className="max-w-3xl w-full mx-auto">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Bot className="w-7 h-7 text-blue-600" /> Pengaturan Auto-Reply Bot
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Kelola status aktif dan teks pesan sambutan yang dikirim otomatis saat pelanggan pertama kali menghubungi WhatsApp Helpdesk.
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
              {/* Sakelar Toggle ON / OFF */}
              <div className="flex items-center justify-between pb-6 border-b border-gray-100">
                <div>
                  <h3 className="font-semibold text-gray-800 text-base">Status Balasan Otomatis</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {botIsActive ? '🟢 Bot aktif membalas setiap aduan masuk baru secara otomatis.' : '⚪ Bot dinonaktifkan sementara. Tidak ada pesan balasan otomatis yang dikirim.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBotIsActive(!botIsActive)}
                  className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none ${
                    botIsActive ? 'bg-green-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      botIsActive ? 'translate-x-8' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Form Template Pesan */}
              <form onSubmit={handleSaveBotSetting} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Template Pesan Sambutan WhatsApp
                  </label>
                  <textarea
                    rows={4}
                    value={botMessage}
                    onChange={(e) => setBotMessage(e.target.value)}
                    placeholder="Ketik template pesan sambutan bot..."
                    className="w-full border border-gray-300 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 text-sm leading-relaxed"
                    required
                  />
                  <span className="text-xs text-gray-400 mt-1 block text-right">
                    {botMessage.length} karakter
                  </span>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3 text-xs text-blue-800">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 text-blue-600 mt-0.5" />
                  <div>
                    <span className="font-bold">Informasi:</span> Pesan ini hanya dikirimkan 1 kali ke pelanggan saat tiket baru pertama kali dibuat. Pesan susulan dari pelanggan tidak akan memicu pesan sambutan bot berulang kali.
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSavingBot}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition disabled:opacity-50"
                  >
                    {isSavingBot ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KELOLA BALASAN CEPAT (QUICK REPLIES) - FASE 5 */}
      {showQuickRepliesModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs flex justify-end z-50 overflow-hidden animate-in fade-in duration-150">
          <div className="bg-white shadow-2xl w-full max-w-lg h-full flex flex-col animate-in slide-in-from-right duration-200">
            {/* Header Sticky */}
            <div className="p-4 px-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/90 backdrop-blur-xs sticky top-0 z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Zap className="w-4 h-4 fill-amber-500" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-sm">Template Balasan Cepat</h3>
                  <p className="text-[11px] text-gray-500">Ketik slash (/) di chat untuk memanggil template ini</p>
                </div>
              </div>
              <button 
                onClick={() => setShowQuickRepliesModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 p-5 overflow-y-auto space-y-5">
              {/* Form Tambah Template Baru */}
              <div className="p-4 bg-amber-50/60 border border-amber-200/70 rounded-2xl">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 mb-2.5 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Tambah Template Baru
                </h4>
                <form onSubmit={handleSaveQuickReply} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        Shortcut (Ketik /...) *
                      </label>
                      <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden focus-within:ring-2 focus-within:ring-amber-500">
                        <span className="px-2 text-xs font-bold text-gray-400 bg-gray-50">/</span>
                        <input
                          type="text"
                          required
                          value={newQuickReply.shortcut}
                          onChange={e => setNewQuickReply({ ...newQuickReply, shortcut: e.target.value.replace(/^\/+/, '').toLowerCase() })}
                          placeholder="misal: kendala"
                          className="w-full text-xs p-2 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        Judul Template *
                      </label>
                      <input
                        type="text"
                        required
                        value={newQuickReply.title}
                        onChange={e => setNewQuickReply({ ...newQuickReply, title: e.target.value })}
                        placeholder="misal: Estimasi Penanganan"
                        className="w-full text-xs border border-gray-200 rounded-lg p-2 outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                      Isi Pesan Balasan *
                    </label>
                    <textarea
                      required
                      rows="3"
                      value={newQuickReply.content}
                      onChange={e => setNewQuickReply({ ...newQuickReply, content: e.target.value })}
                      placeholder="Tulis kalimat balasan yang akan otomatis dikirimkan ke pelanggan..."
                      className="w-full text-xs border border-gray-200 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-amber-500 bg-white resize-none"
                    ></textarea>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSavingQuickReply}
                      className="px-4 py-2 bg-amber-600 text-white text-xs font-semibold rounded-xl hover:bg-amber-700 transition shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isSavingQuickReply ? 'Menyimpan...' : 'Simpan Template'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Daftar Template yang Tersedia */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Daftar Template Aktif ({quickReplies.length})
                  </h4>
                </div>
                <div className="space-y-2.5">
                  {quickReplies.map((t) => (
                    <div key={t.id} className="p-3.5 bg-gray-50/80 hover:bg-gray-50 border border-gray-200/80 rounded-xl transition">
                      {editingQuickReplyId === t.id ? (
                        /* Form Edit Inline */
                        <form onSubmit={handleUpdateQuickReply} className="space-y-2.5 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-amber-800 flex items-center gap-1">
                              <Edit2 className="w-3.5 h-3.5 text-amber-600" /> Edit Template
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingQuickReplyId(null)}
                              className="text-gray-400 hover:text-gray-600 p-1"
                              title="Batal edit"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Shortcut</label>
                              <div className="flex items-center border border-gray-300 rounded-lg bg-white overflow-hidden">
                                <span className="px-1.5 text-xs font-bold text-gray-400 bg-gray-50">/</span>
                                <input
                                  type="text"
                                  required
                                  value={editingQuickReply.shortcut}
                                  onChange={e => setEditingQuickReply({ ...editingQuickReply, shortcut: e.target.value.replace(/^\/+/, '').toLowerCase() })}
                                  className="w-full text-xs p-1.5 outline-none"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Judul</label>
                              <input
                                type="text"
                                required
                                value={editingQuickReply.title}
                                onChange={e => setEditingQuickReply({ ...editingQuickReply, title: e.target.value })}
                                className="w-full text-xs border border-gray-300 rounded-lg p-1.5 outline-none bg-white"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Isi Balasan</label>
                            <textarea
                              required
                              rows="3"
                              value={editingQuickReply.content}
                              onChange={e => setEditingQuickReply({ ...editingQuickReply, content: e.target.value })}
                              className="w-full text-xs border border-gray-300 rounded-lg p-2 outline-none bg-white resize-none"
                            ></textarea>
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingQuickReplyId(null)}
                              className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded-lg transition"
                            >
                              Batal
                            </button>
                            <button
                              type="submit"
                              disabled={isSavingQuickReply}
                              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition shadow-xs disabled:opacity-50"
                            >
                              {isSavingQuickReply ? 'Menyimpan...' : 'Simpan Perubahan'}
                            </button>
                          </div>
                        </form>
                      ) : (
                        /* Tampilan Normal Card Template */
                        <>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                                /{t.shortcut}
                              </span>
                              <span className="text-xs font-bold text-gray-800">{t.title}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {activeTicket && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    insertQuickReply(t);
                                    setShowQuickRepliesModal(false);
                                  }}
                                  className="px-2.5 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition"
                                >
                                  Gunakan
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingQuickReplyId(t.id);
                                  setEditingQuickReply({ shortcut: t.shortcut, title: t.title, content: t.content });
                                }}
                                className="p-1 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                                title="Edit template"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteQuickReply(t.id)}
                                className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition"
                                title="Hapus template"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 whitespace-pre-wrap">{t.content}</p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Sticky */}
            <div className="p-3.5 px-5 border-t border-gray-200 flex justify-end bg-white sticky bottom-0 z-10 shadow-sm">
              <button
                type="button"
                onClick={() => setShowQuickRepliesModal(false)}
                className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ASSIGN L2 & INTEGRASI HTS DISKOMDIGI (HYBRID) - SLIDE-OVER DRAWER */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs flex justify-end z-50 overflow-hidden animate-in fade-in duration-150">
          <div className="bg-white shadow-2xl w-full max-w-xl h-full flex flex-col animate-in slide-in-from-right duration-200">
            {/* Header Sticky */}
            <div className="p-4 px-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/90 backdrop-blur-xs sticky top-0 z-10">
              <div>
                <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-blue-600" />
                  {activeTicket?.categories?.length > 0 ? 'Kelola / Ubah Tim L2' : 'Assign ke Teknisi L2'}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Tugaskan tim teknisi internal dan atur jenis layanan helpdesk
                </p>
              </div>
              <button 
                onClick={() => setShowAssignModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 p-5 overflow-y-auto space-y-5">
              {/* Bagian 1: Tim L2 Internal */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                  1. Pilih Tim L2 Tujuan (Multi-Assign) *
                </label>
                <div className="space-y-2">
                  {categories.map(cat => {
                    const isCurrentlyAssigned = activeTicket?.categories?.some(tc => (tc.category_id || tc.category?.id) === cat.id);
                    return (
                      <label key={cat.id} className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer transition-all ${
                        assignCategoryIds.includes(cat.id) ? 'bg-blue-50/80 border-blue-500 text-blue-900 font-semibold shadow-sm' : 'bg-gray-50/60 border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}>
                        <div className="flex items-center">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 text-blue-600 rounded mr-3 focus:ring-blue-500"
                            checked={assignCategoryIds.includes(cat.id)}
                            onChange={(e) => {
                              if (e.target.checked) setAssignCategoryIds([...assignCategoryIds, cat.id]);
                              else setAssignCategoryIds(assignCategoryIds.filter(id => id !== cat.id));
                            }}
                          />
                          <span className="text-sm">{cat.name}</span>
                        </div>
                        {isCurrentlyAssigned && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                            Sedang Ditugaskan
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Bagian 2: Jenis Layanan */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  2. Jenis Layanan
                </label>
                <select 
                  value={assignServiceType} 
                  onChange={e => handleServiceTypeChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="TROUBLESHOOTING">Troubleshooting (Gangguan Teknis)</option>
                  <option value="REQUEST_LAYANAN">Request Layanan (Permintaan Fasilitas/Akses)</option>
                  <option value="MONITORING">Monitoring (Pengawasan/Cek Rutin)</option>
                </select>
              </div>

              {/* Bagian 3: Integrasi Portal HTS Diskomdigi (Separation of Concerns - Opsi B) */}
              <div className="pt-3 border-t border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                      3. Integrasi Portal HTS Diskomdigi
                    </span>
                  </div>
                </div>

                {/* Kondisi 1: Sudah ada tiket HTS terhubung */}
                {(activeTicket?.hts_tickets?.length > 0 || activeTicket?.hts_ticket_no) ? (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-2">
                    <div className="font-bold flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <span>Terhubung ke Portal HTS Diskomdigi ({(activeTicket.hts_tickets && activeTicket.hts_tickets.length > 0) ? activeTicket.hts_tickets.length : 1} Tiket)</span>
                      </div>
                    </div>
                    <div className="space-y-1.5 pt-1">
                      {(activeTicket.hts_tickets?.length > 0 ? activeTicket.hts_tickets : [{ id: 0, hts_ticket_no: activeTicket.hts_ticket_no, hts_ticket_status: activeTicket.hts_ticket_status }]).map((h) => (
                        <div key={h.id || h.hts_ticket_no} className="flex items-center justify-between bg-white p-2 rounded-lg border border-emerald-200/80">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-emerald-950">#{h.hts_ticket_no}</span>
                            {h.category?.name && (
                              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded font-medium">
                                {h.category.name}
                              </span>
                            )}
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                            h.hts_ticket_status === 'SOLVED'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-amber-100 text-amber-800 border-amber-300'
                          }`}>
                            {h.hts_ticket_status || 'PROSES'}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-emerald-700 pt-1">
                      Untuk menambah, menautkan, atau melepas tiket HTS, gunakan menu di <strong>Pusat Kendali (Panel Kanan)</strong>.
                    </p>
                  </div>
                ) : (
                  /* Kondisi 2: Belum ada tiket HTS */
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
                    <p className="text-xs text-blue-900 font-semibold flex items-center gap-1.5">
                      <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                      Penerbitan Tiket Resmi HTS
                    </p>
                    <p className="text-[11px] text-blue-700 leading-relaxed">
                      Formulir penerbitan tiket resmi, pemilihan OPD, PIC teknis, serta multi-lampiran bukti kendala dipusatkan di <strong>Pusat Kendali (Panel Kanan)</strong>.
                    </p>
                    <label className="flex items-center gap-2.5 pt-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoOpenHtsAfterAssign}
                        onChange={e => setAutoOpenHtsAfterAssign(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-xs font-semibold text-blue-900">
                        Langsung buka formulir Portal HTS setelah menyimpan penugasan
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons Sticky */}
            <div className="p-3.5 px-5 border-t border-gray-200 flex justify-end space-x-2.5 bg-white sticky bottom-0 z-10 shadow-sm">
              <button 
                type="button"
                onClick={() => setShowAssignModal(false)} 
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition text-xs"
              >
                Batal
              </button>
              <button 
                type="button"
                onClick={handleAssignTicket} 
                disabled={assignCategoryIds.length === 0 || isSubmittingAssign} 
                className="px-5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-semibold transition text-xs shadow-sm flex items-center gap-1.5"
              >
                {isSubmittingAssign ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Menyimpan Penugasan...
                  </>
                ) : (
                  <>
                    {activeTicket?.categories?.length > 0 ? 'Simpan Penugasan Tim' : 'Tugaskan ke Tim L2'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MULAI CHAT BARU OUTBOUND KE KONTAK */}
      {showNewChatModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-150 flex flex-col max-h-[90vh]">
            <div className="p-4 px-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <PhoneCall className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-sm">Mulai Chat WhatsApp Baru</h3>
                  <p className="text-[11px] text-gray-500">Hubungi kontak WhatsApp atau ketik nomor tujuan</p>
                </div>
              </div>
              <button 
                onClick={() => setShowNewChatModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleStartNewChatSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-5 space-y-4 overflow-y-auto">
                {/* 1. Direktori Lengkap & Pencarian Kontak */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-600" /> Pilih dari Buku Kontak ({newChatContactsList.length})
                    </label>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setShowImportContactsModal(true)}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> Import Master Data Kontak
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={newChatSearchContact}
                      onChange={e => handleSearchContacts(e.target.value)}
                      placeholder="Cari nama kontak HP, OPD/SKPD, atau nomor WA..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    />
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                    {isSearchingContacts && (
                      <span className="w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin absolute right-2.5 top-2.5"></span>
                    )}
                  </div>

                  {/* Daftar Seluruh Kontak (Directory List) */}
                  <div className="mt-1 bg-white border border-gray-200 rounded-lg shadow-2xs max-h-44 overflow-y-auto divide-y divide-gray-100">
                    {newChatContactsList.length > 0 ? (
                      newChatContactsList.map((contact, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleSelectContact(contact)}
                          className="p-2 hover:bg-emerald-50/80 cursor-pointer flex items-center justify-between text-xs transition"
                        >
                          <div className="flex items-center gap-2">
                            {contact.profilePicUrl ? (
                              <img src={contact.profilePicUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                            ) : (
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                                contact.isImported ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {contact.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-gray-800">{contact.name}</span>
                                {contact.isImported && (
                                  <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-bold border border-amber-200">
                                    Official
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                <span className="font-mono">+{contact.waNumber}</span>
                                {contact.skpdName && (
                                  <span className="truncate max-w-[180px] text-gray-500">• {contact.skpdName}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-2 py-0.5 rounded font-medium shrink-0">
                            Pilih
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-xs text-gray-400">
                        {isSearchingContacts ? 'Mencari kontak...' : 'Tidak ada kontak yang cocok.'}
                      </div>
                    )}

                    {/* Pagination: tombol Muat Lebih (Opsi B) */}
                    {newChatContactsList.length > 0 && (
                      contactsHasMore ? (
                        <button
                          type="button"
                          onClick={handleLoadMoreContacts}
                          disabled={isLoadingMoreContacts}
                          className="w-full py-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 border-t border-gray-100 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {isLoadingMoreContacts ? (
                            <>
                              <span className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                              Memuat kontak lain...
                            </>
                          ) : (
                            <>
                              ↓ Muat lebih banyak ({contactsTotal - newChatContactsList.length} tersisa)
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="py-2 text-center text-[10px] text-gray-400 border-t border-gray-100 bg-gray-50">
                          ✓ Semua kontak dimuat ({contactsTotal} total)
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* 2. Nomor WhatsApp Tujuan */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Nomor WhatsApp Tujuan *
                    </label>
                    <input
                      type="text"
                      required
                      value={newChatWaNumber}
                      onChange={e => setNewChatWaNumber(e.target.value)}
                      placeholder="Contoh: 08123456789 atau 628..."
                      className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Nama Kontak / Pelapor
                    </label>
                    <input
                      type="text"
                      value={newChatName}
                      onChange={e => setNewChatName(e.target.value)}
                      placeholder="Nama lengkap kontak..."
                      className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* 3. Instansi / OPD */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Instansi / OPD (Opsional)
                  </label>
                  <input
                    type="text"
                    value={newChatSkpd}
                    onChange={e => setNewChatSkpd(e.target.value)}
                    placeholder="Contoh: Dinas Komunikasi dan Informatika Provinsi Jawa Tengah"
                    className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* 4. Opsi & Pesan Pembuka */}
                <div className="space-y-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5 text-emerald-600" /> Langsung kirim pesan pembuka ke WhatsApp sekarang
                    </span>
                    <input
                      type="checkbox"
                      checked={newChatSendInitial}
                      onChange={e => setNewChatSendInitial(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                  </label>

                  {newChatSendInitial ? (
                    <div>
                      <p className="text-[11px] text-gray-500 mb-1.5">
                        Pesan di bawah ini akan langsung terkirim ke WhatsApp penerima:
                      </p>
                      <textarea
                        required={newChatSendInitial}
                        rows="3"
                        value={newChatInitialMsg}
                        onChange={e => setNewChatInitialMsg(e.target.value)}
                        placeholder="Tulis pesan pertama yang akan dikirimkan ke WhatsApp pelanggan..."
                        className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white resize-none"
                      ></textarea>
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                      ℹ️ <strong>Mode Tiket Kosong:</strong> Sistem hanya akan membuat tiket dan membuka ruang obrolan di web. Tidak ada pesan yang dikirim ke nomor WhatsApp tersebut sampai Anda mengetik dan mengirim pesan secara manual nanti.
                    </p>
                  )}
                </div>

                {/* 5. Klasifikasi Awal */}
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newChatIsAduan}
                      onChange={e => setNewChatIsAduan(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span>Tandai langsung sebagai <strong>🚨 Aduan Teknis Resmi</strong> (Bukan percakapan biasa)</span>
                  </label>
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="p-3.5 px-5 border-t border-gray-200 flex justify-end gap-2.5 bg-gray-50/50 sticky bottom-0">
                <button
                  type="button"
                  onClick={() => setShowNewChatModal(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isStartingNewChat || !newChatWaNumber.trim() || (newChatSendInitial && !newChatInitialMsg.trim())}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isStartingNewChat ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      {newChatSendInitial ? 'Mengirim Pesan...' : 'Membuka Tiket...'}
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      {newChatSendInitial ? 'Kirim Pesan & Buka Chat' : 'Buka Tiket Percakapan Saja'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL IMPORT MASTER DATA KONTAK (KHUSUS ADMIN) */}
      {showImportContactsModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-150 flex flex-col">
            <div className="p-4 px-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-sm">Import Master Data Kontak</h3>
                  <p className="text-[11px] text-gray-500">Unggah berkas Excel (.xlsx), CSV, atau VCF (Google Contacts)</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowImportContactsModal(false);
                  setImportStatsResult(null);
                }}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleImportContactsSubmit} className="p-5 space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1.5">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" /> Prioritas Master Data Resmi
                </p>
                <p className="text-[11px] text-blue-700 leading-relaxed">
                  Kontak hasil import ini akan dijadikan <strong>Prioritas Utama</strong> dan tidak akan pernah tertimpa oleh nama profil WhatsApp pengguna.
                </p>
                <p className="text-[10px] text-blue-600 font-mono pt-1">
                  Format Kolom: nama, nomor_wa, instansi
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Pilih Berkas Excel / CSV / VCF *
                </label>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv, .vcf"
                  required
                  onChange={e => setImportContactFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-gray-300 rounded-xl p-1.5"
                />
              </div>

              {/* Tampilan Statistik Hasil Import */}
              {importStatsResult && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
                  <p className="font-bold flex items-center gap-1 text-emerald-800">
                    <CheckCircle className="w-3.5 h-3.5" /> Hasil Import:
                  </p>
                  <p className="text-[11px]">
                    Total Baris: {importStatsResult.totalRows} • Kontak Baru: {importStatsResult.importedCount} • Diperbarui: {importStatsResult.updatedCount}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleClearAllCustomerContacts}
                  className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-xl font-medium transition flex items-center gap-1 border border-red-200"
                  title="Hapus seluruh master data kontak pelanggan yang pernah diimpor"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Semua Kontak</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowImportContactsModal(false);
                      setImportStatsResult(null);
                    }}
                    className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition"
                  >
                    Tutup
                  </button>
                  <button
                    type="submit"
                    disabled={isImportingContacts || !importContactFile}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                  >
                  {isImportingContacts ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Mengimpor Data...
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      Mulai Import
                    </>
                  )}
                </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL SINKRONISASI MANUAL KE PORTAL HTS - SLIDE-OVER DRAWER */}
      {showSyncHtsModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs flex justify-end z-50 overflow-hidden animate-in fade-in duration-150">
          <div className="bg-white shadow-2xl w-full max-w-lg h-full flex flex-col animate-in slide-in-from-right duration-200">
            {/* Header Sticky */}
            <div className="p-4 px-5 border-b border-gray-100 bg-gray-50/90 backdrop-blur-xs sticky top-0 z-10">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 text-sm">Integrasi Portal HTS Diskomdigi</h3>
                    <p className="text-[11px] text-gray-500">Terbitkan baru atau tautkan nomor aduan resmi</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowSyncHtsModal(false);
                    setSyncTargetTicket(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tab Switcher: Terbitkan Baru vs Tautkan yang Sudah Ada */}
              <div className="flex rounded-xl bg-gray-200/70 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setSyncHtsTab('create')}
                  className={`flex-1 py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 ${
                    syncHtsTab === 'create'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Terbitkan Baru</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSyncHtsTab('link')}
                  className={`flex-1 py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 ${
                    syncHtsTab === 'link'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>Tautkan yang Sudah Ada</span>
                </button>
              </div>
            </div>

            {syncHtsTab === 'link' ? (
              /* TAB 2: TAUTKAN NOMOR TIKET HTS YANG SUDAH ADA */
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 p-5 overflow-y-auto space-y-4">
                  {syncHtsError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{syncHtsError}</span>
                    </div>
                  )}

                  <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <LinkIcon className="w-3.5 h-3.5 text-blue-600" /> Penautan Nomor Aduan Resmi
                    </p>
                    <p className="text-[11px] leading-relaxed text-blue-700">
                      Gunakan fitur ini jika tiket aduan telah dibuat langsung di portal HTS Diskomdigi Jawa Tengah, dan Anda ingin menyambungkannya dengan percakapan WhatsApp ini.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Nomor Aduan Resmi HTS *
                    </label>
                    <input
                      type="text"
                      value={linkHtsNo}
                      onChange={e => setLinkHtsNo(e.target.value)}
                      placeholder="Contoh: 2038-TShoot-2026-jateng-10"
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      required
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                      Sistem akan memverifikasi nomor ini secara live ke server portal HTS.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Tautkan ke Divisi Tim Teknis (Opsional)
                    </label>
                    <select
                      value={linkHtsCategoryId}
                      onChange={e => setLinkHtsCategoryId(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">-- Pilih Divisi Tim (Sesuai Kategori HTS) --</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Sticky Footer Tab Link */}
                <div className="p-3.5 px-5 border-t border-gray-200 flex justify-end gap-2.5 bg-white sticky bottom-0 z-10 shadow-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSyncHtsModal(false);
                      setSyncTargetTicket(null);
                    }}
                    className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLinkHtsTicket(false)}
                    disabled={isLinkingHts || !linkHtsNo.trim()}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isLinkingHts ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        Memverifikasi ke HTS...
                      </>
                    ) : (
                      <>
                        <LinkIcon className="w-3.5 h-3.5" />
                        Verifikasi & Tautkan Tiket
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* TAB 1: TERBITKAN TIKET BARU KE PORTAL HTS */
            <form onSubmit={handleSyncTicketToHts} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 p-5 overflow-y-auto space-y-3.5">
              {syncHtsError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{syncHtsError}</span>
                </div>
              )}

              {/* 1. Nama Pemohon */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nama Pemohon *</label>
                <input 
                  type="text" 
                  value={syncHtsCust}
                  onChange={(e) => setSyncHtsCust(e.target.value)}
                  placeholder="Nama pemohon / pelapor..."
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  required
                />
              </div>

              {/* 1b. Nomor WhatsApp Pemohon (FIX-05) */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-gray-500" />
                  Nomor WhatsApp Pemohon *
                </label>
                <input 
                  type="text" 
                  value={syncHtsWa}
                  onChange={(e) => setSyncHtsWa(e.target.value)}
                  placeholder="Contoh: 08123456789 atau 628123456789"
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-mono"
                  required
                />
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Dapat disesuaikan jika pelapor menggunakan nomor perantara atau salah sambung.
                </p>
              </div>

              {/* 2. Instansi Pelapor & OPD Induk */}
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Instansi / Unit Kerja Pelapor *</label>
                  <input 
                    type="text" 
                    value={syncHtsOpd}
                    onChange={(e) => setSyncHtsOpd(e.target.value)}
                    placeholder="Nama instansi/unit kerja pemohon..."
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    OPD Induk (Klasifikasi HTS) <span className="text-gray-400 font-normal">(Opsional)</span>
                  </label>
                  <div className="relative mb-1.5">
                    <input 
                      type="text" 
                      placeholder="Cari nama OPD Induk..."
                      value={syncOpdSearchTerm}
                      onChange={(e) => handleSyncOpdSearch(e.target.value)}
                      className="w-full pl-2.5 pr-7 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    />
                    {syncOpdSearchTerm && (
                      <button
                        type="button"
                        onClick={() => handleSyncOpdSearch('')}
                        className="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600"
                        title="Reset / Kosongkan pencarian"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <select
                    value={syncIndukOpdId}
                    onChange={(e) => setSyncIndukOpdId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {!syncOpdSearchTerm && (
                      <option value="">-- Tanpa OPD Induk (Kosongkan) --</option>
                    )}
                    {htsMasterData.indukOpd
                      ?.filter(o => !syncOpdSearchTerm || o.name.toLowerCase().includes(syncOpdSearchTerm.toLowerCase()))
                      ?.map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))
                    }
                    {syncOpdSearchTerm && htsMasterData.indukOpd?.filter(o => o.name.toLowerCase().includes(syncOpdSearchTerm.toLowerCase())).length === 0 && (
                      <option value="" disabled>-- Tidak ada OPD yang cocok --</option>
                    )}
                  </select>
                </div>
              </div>

              {/* 3. Tanggal & Jam Problem */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-gray-500" />
                    Tanggal Problem *
                  </label>
                  <input
                    type="date"
                    value={syncHtsTanggal}
                    onChange={e => setSyncHtsTanggal(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-gray-500" />
                    Jam Problem *
                  </label>
                  <input
                    type="time"
                    value={syncHtsJam}
                    onChange={e => setSyncHtsJam(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    required
                  />
                </div>
              </div>

              {/* 4. Kategori & Sub-Kategori Layanan */}
              <div className={`grid ${syncHtsKategori === 'troubleshoot' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'} gap-2`}>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Kategori Layanan *</label>
                  <select
                    value={syncHtsKategori}
                    onChange={(e) => setSyncHtsKategori(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {htsMasterData.kategori?.map(k => (
                      <option key={k.id} value={k.id}>{k.name}</option>
                    ))}
                  </select>
                </div>

                {syncHtsKategori === 'troubleshoot' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Sub-Kategori Layanan *</label>
                    <select
                      value={syncHtsSubKategori}
                      onChange={(e) => setSyncHtsSubKategori(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      required
                    >
                      {htsMasterData.subKategori?.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.team})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Detil Aduan */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Detil Aduan / Permasalahan *
                  </label>
                  <span className={`text-[10px] font-medium ${syncHtsDetil.trim().length < 10 ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                    {syncHtsDetil.trim().length < 10 
                      ? `Minimal 10 karakter (${syncHtsDetil.trim().length}/10)` 
                      : `${syncHtsDetil.trim().length} karakter`}
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={syncHtsDetil}
                  onChange={(e) => setSyncHtsDetil(e.target.value)}
                  placeholder="Ketik detail keluhan teknis untuk dicatat di portal HTS (minimal 10 karakter)..."
                  className={`w-full px-2.5 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 bg-white ${syncHtsDetil.trim().length > 0 && syncHtsDetil.trim().length < 10 ? 'border-red-300 focus:ring-red-400' : 'border-gray-300 focus:ring-blue-500'}`}
                  minLength={10}
                  required
                />
              </div>

              {/* 5. PIC Helpdesk Penerima (Multi-PIC + Search + Checked di Atas) */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold text-gray-700">
                    PIC Penerima / Penanganan *
                  </label>
                  <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    {syncHtsPicIds.length} PIC Terpilih
                  </span>
                </div>

                {/* Kotak Pencarian PIC */}
                <div className="relative mb-1.5">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={syncHtsPicSearch}
                    onChange={e => setSyncHtsPicSearch(e.target.value)}
                    placeholder="Cari nama petugas PIC..."
                    className="w-full pl-8 pr-7 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  />
                  {syncHtsPicSearch && (
                    <button
                      type="button"
                      onClick={() => setSyncHtsPicSearch('')}
                      className="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* List PIC (Terpilih Selalu di Atas) */}
                <div className="max-h-36 overflow-y-auto border border-gray-300 rounded-lg p-1 bg-white divide-y divide-gray-100">
                  {getSortedPics(htsMasterData.pics, syncHtsPicIds, syncHtsPicSearch).map(p => {
                    const isChecked = syncHtsPicIds.includes(String(p.id));
                    return (
                      <label key={p.id} className={`flex items-center justify-between py-1.5 px-2 rounded cursor-pointer text-xs transition ${isChecked ? 'bg-blue-50 font-semibold text-blue-900' : 'text-gray-700 hover:bg-gray-50'}`}>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 text-blue-600 rounded focus:ring-blue-500"
                            checked={isChecked}
                            onChange={(e) => {
                              const strId = String(p.id);
                              if (e.target.checked) {
                                setSyncHtsPicIds([...syncHtsPicIds, strId]);
                              } else {
                                setSyncHtsPicIds(syncHtsPicIds.filter(id => id !== strId));
                              }
                            }}
                          />
                          <span className="truncate">{p.name}</span>
                        </div>
                        {isChecked && (
                          <span className="text-[9px] bg-blue-200 text-blue-800 px-1.5 py-0.2 rounded font-bold ml-2">
                            Terpilih
                          </span>
                        )}
                      </label>
                    );
                  })}
                  {getSortedPics(htsMasterData.pics, syncHtsPicIds, syncHtsPicSearch).length === 0 && (
                    <div className="p-3 text-center text-xs text-gray-400">
                      Tidak ada petugas PIC yang cocok
                    </div>
                  )}
                </div>
              </div>

              {/* 6. Lampiran Gambar Bukti */}
              <div className="space-y-1.5 pt-2 border-t border-gray-200">
                <label className="block text-xs font-semibold text-gray-700">
                  Lampiran Bukti / Gambar (Opsional)
                </label>
                {syncHtsChatImagePreview && (
                  <label className="flex items-center gap-2.5 p-2 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncHtsUseChatImage}
                      onChange={e => setSyncHtsUseChatImage(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <img src={syncHtsChatImagePreview} alt="Bukti WA" className="w-8 h-8 object-cover rounded border border-blue-300" />
                    <div className="text-[11px] leading-tight">
                      <span className="font-semibold text-blue-900 block">Gunakan foto dari chat WhatsApp</span>
                      <span className="text-blue-700 text-[10px]">Lampirkan gambar kendala yang dikirim pelapor</span>
                    </div>
                  </label>
                )}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label className="flex-1 border border-dashed border-gray-300 hover:border-blue-400 rounded-lg p-2 text-center cursor-pointer bg-white transition flex items-center justify-center gap-2 text-xs text-gray-600">
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        multiple
                        className="hidden"
                        onChange={e => {
                          if (e.target.files && e.target.files.length > 0) {
                            const newFiles = Array.from(e.target.files);
                            setSyncHtsFiles(prev => [...prev, ...newFiles].slice(0, 5));
                            setSyncHtsFile(newFiles[0]);
                          }
                        }}
                      />
                      <Paperclip className="w-3.5 h-3.5 text-gray-500" />
                      <span>Upload foto/berkas dari komputer (Maksimal 5 berkas: Gambar / PDF)</span>
                    </label>
                  </div>
                  {syncHtsFiles.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="text-[10px] text-gray-500 font-medium">
                        Berkas terpilih ({syncHtsFiles.length}/5):
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {syncHtsFiles.map((file, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] border border-blue-200">
                            <span className="truncate max-w-[140px]">{file.name}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = syncHtsFiles.filter((_, i) => i !== idx);
                                setSyncHtsFiles(updated);
                                setSyncHtsFile(updated[0] || null);
                              }}
                              className="text-blue-500 hover:text-red-500 p-0.5"
                              title="Hapus berkas"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              </div>

              {/* Sticky Footer */}
              <div className="p-3.5 px-5 border-t border-gray-200 flex justify-end gap-2.5 bg-white sticky bottom-0 z-10 shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    setShowSyncHtsModal(false);
                    setSyncTargetTicket(null);
                  }}
                  className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSyncHts}
                  className="px-5 py-2 text-xs font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmittingSyncHts ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Menerbitkan ke HTS...
                    </>
                  ) : (
                    <>
                      <Globe className="w-3.5 h-3.5" /> Terbitkan ke Portal HTS
                    </>
                  )}
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL SELESAIKAN TIKET HTS MANDIRI (V4.3) */}
      {showSolveSingleHtsModal && selectedHtsToSolve && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="p-4 px-5 border-b border-gray-100 flex justify-between items-start bg-gray-50/70">
              <div>
                <h2 className="text-base font-bold text-gray-800 flex items-center gap-1.5">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  Selesaikan Tiket Portal HTS
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Penutupan resmi aduan teknis di portal HTS Diskomdigi</p>
              </div>
              <button 
                type="button"
                onClick={() => setShowSolveSingleHtsModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitSolveSingleHts} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Target Aduan Info Box */}
              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-xs text-blue-950 bg-blue-100 px-2 py-0.5 rounded border border-blue-300">
                    #{selectedHtsToSolve.hts_ticket_no}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    {selectedHtsToSolve.hts_ticket_status || 'PENDING'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-gray-700">
                  <div>
                    <span className="text-gray-500 block">Kategori Tim:</span>
                    <span className="font-semibold text-gray-800">{selectedHtsToSolve.category?.name || selectedHtsToSolve.hts_kategori || 'Troubleshoot'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Pelapor / SKPD:</span>
                    <span className="font-semibold text-gray-800 truncate block">
                      {activeTicket?.customer?.name || '-'} {activeTicket?.customer?.skpd_name ? `(${activeTicket.customer.skpd_name})` : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tanggal & Jam Penanganan Teknis */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" /> Tanggal Penanganan *
                  </label>
                  <input
                    type="date"
                    value={singleHtsTanggal}
                    onChange={e => setSingleHtsTanggal(e.target.value)}
                    required
                    className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-blue-600" /> Jam Penanganan *
                  </label>
                  <input
                    type="time"
                    value={singleHtsJam}
                    onChange={e => setSingleHtsJam(e.target.value)}
                    required
                    className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* PIC Penanganan Teknis */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-semibold text-gray-700">
                    PIC Penanganan Teknis HTS *
                  </label>
                  <span className="text-[10px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    {singleHtsPicIds.length} PIC Terpilih
                  </span>
                </div>
                
                {/* Search Box */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={singleHtsPicSearch}
                    onChange={e => setSingleHtsPicSearch(e.target.value)}
                    placeholder="Cari nama teknisi PIC..."
                    className="w-full pl-8 pr-7 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  />
                  {singleHtsPicSearch && (
                    <button
                      type="button"
                      onClick={() => setSingleHtsPicSearch('')}
                      className="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* PIC List */}
                <div className="max-h-28 overflow-y-auto border border-gray-200 rounded-lg p-1 bg-white divide-y divide-gray-100">
                  {getSortedPics(htsMasterData.pics, singleHtsPicIds, singleHtsPicSearch).map(p => {
                    const isChecked = singleHtsPicIds.includes(String(p.id));
                    const initialPics = getTicketInitialPicIds(selectedHtsToSolve);
                    const isInitialPic = initialPics.length > 0 
                      ? initialPics.includes(String(p.id))
                      : String(p.id) === '14';
                    return (
                      <label key={p.id} className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer text-xs transition ${isChecked ? 'bg-blue-50 font-semibold text-blue-900' : 'text-gray-700 hover:bg-gray-50'}`}>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 text-blue-600 rounded focus:ring-blue-500"
                            checked={isChecked}
                            onChange={(e) => {
                              const strId = String(p.id);
                              if (e.target.checked) {
                                setSingleHtsPicIds([...singleHtsPicIds, strId]);
                              } else {
                                setSingleHtsPicIds(singleHtsPicIds.filter(id => id !== strId));
                              }
                            }}
                          />
                          <span className="truncate">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {isChecked && isInitialPic && (
                            <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.2 rounded font-bold ml-2">
                              PIC Penerima
                            </span>
                          )}
                          {isChecked && !isInitialPic && (
                            <span className="text-[9px] bg-blue-100 text-blue-800 border border-blue-200 px-1.5 py-0.2 rounded font-bold ml-2">
                              PIC Penanganan
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                  {getSortedPics(htsMasterData.pics, singleHtsPicIds, singleHtsPicSearch).length === 0 && (
                    <div className="p-2 text-center text-xs text-gray-400">Tidak ada teknisi PIC yang cocok</div>
                  )}
                </div>
              </div>

              {/* Lampiran Bukti Penyelesaian */}
              <div className="space-y-2 pt-1 border-t border-gray-200">
                <label className="block text-[11px] font-semibold text-gray-700">
                  Bukti Lampiran Selesai / Foto Tindakan (Opsional)
                </label>

                {/* 1. Galeri Catatan Internal */}
                {messages.some(m => m.is_internal && m.attachment_url) && (
                  <div className="p-2 bg-amber-50/80 border border-amber-200 rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10.5px] font-bold text-amber-900 flex items-center gap-1">
                        📸 Dari Catatan Internal Teknisi:
                      </span>
                      {singleHtsSelectedInternalUrls.length > 0 && (
                        <span className="text-[9px] bg-amber-200 text-amber-900 font-bold px-1.5 py-0.2 rounded">
                          {singleHtsSelectedInternalUrls.length} Foto Terpilih
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 overflow-x-auto py-1">
                      {messages.filter(m => m.is_internal && m.attachment_url).map(m => {
                        const fullUrl = m.attachment_url.startsWith('http') ? m.attachment_url : `${BASE_URL}${m.attachment_url}`;
                        const isSelected = singleHtsSelectedInternalUrls.includes(m.attachment_url);
                        return (
                          <div
                            key={m.id}
                            onClick={() => {
                              if (isSelected) {
                                setSingleHtsSelectedInternalUrls(singleHtsSelectedInternalUrls.filter(u => u !== m.attachment_url));
                              } else {
                                setSingleHtsSelectedInternalUrls([...singleHtsSelectedInternalUrls, m.attachment_url]);
                              }
                            }}
                            className={`relative rounded-lg border-2 cursor-pointer transition p-0.5 shrink-0 ${
                              isSelected ? 'border-amber-600 ring-2 ring-amber-300' : 'border-amber-200 hover:border-amber-400 bg-white'
                            }`}
                          >
                            <img src={fullUrl} alt="Internal Media" className="w-12 h-12 object-cover rounded-md" />
                            {isSelected && (
                              <span className="absolute top-1 right-1 bg-amber-600 text-white rounded-full p-0.5">
                                <Check className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Upload dari Komputer */}
                <div className="space-y-1.5">
                  <label className="border border-dashed border-gray-300 hover:border-blue-500 rounded-lg p-2 text-center cursor-pointer bg-white transition flex items-center justify-center gap-2 text-xs text-gray-600">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={e => {
                        if (e.target.files && e.target.files.length > 0) {
                          const newFiles = Array.from(e.target.files);
                          setSingleHtsFiles(prev => [...prev, ...newFiles]);
                        }
                      }}
                    />
                    <Paperclip className="w-3.5 h-3.5 text-gray-500" />
                    <span>Upload foto dari komputer (bisa pilih multiple)</span>
                  </label>
                  {singleHtsFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {singleHtsFiles.map((file, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10.5px] border border-blue-200">
                          <span className="truncate max-w-[130px]">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => setSingleHtsFiles(singleHtsFiles.filter((_, i) => i !== idx))}
                            className="text-blue-500 hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Solusi Teknis */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] font-semibold text-gray-700">
                    Solusi / Catatan Penanganan Teknis *
                  </label>
                  <span className={`text-[10px] ${singleHtsSolution.trim().length >= 10 ? 'text-emerald-600 font-bold' : 'text-gray-400'}`}>
                    {singleHtsSolution.trim().length}/10 min. karakter
                  </span>
                </div>
                <textarea
                  value={singleHtsSolution}
                  onChange={e => setSingleHtsSolution(e.target.value)}
                  placeholder="Jelaskan tindakan teknis atau perbaikan yang telah dilakukan..."
                  rows={3}
                  required
                  className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-xs text-gray-800 focus:ring-1 focus:ring-blue-500 outline-none leading-relaxed"
                />
              </div>

              {/* Sticky Footer */}
              <div className="pt-2 border-t border-gray-200 flex justify-end gap-2 bg-white sticky bottom-0">
                <button
                  type="button"
                  onClick={() => setShowSolveSingleHtsModal(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSolvingSingleHts || singleHtsSolution.trim().length < 10 || singleHtsPicIds.length === 0}
                  className="px-5 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSolvingSingleHts ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Menyelesaikan HTS...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" /> Selesaikan di Portal HTS
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL LIHAT DETAIL SOLUSI HTS (V4.3) */}
      {showDetailHtsModal && selectedHtsDetail && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="p-4 px-5 border-b border-gray-100 flex justify-between items-start bg-gray-50/70">
              <div>
                <h2 className="text-base font-bold text-gray-800 flex items-center gap-1.5">
                  <Globe className="w-5 h-5 text-blue-600" />
                  Detail Solusi Tiket HTS
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Rekaman penanganan teknis resmi di portal HTS Diskomdigi</p>
              </div>
              <button 
                type="button"
                onClick={() => setShowDetailHtsModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Header Box */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold text-sm text-emerald-950">#{selectedHtsDetail.hts_ticket_no}</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {selectedHtsDetail.category?.name && (
                      <span className="text-[10px] bg-white text-emerald-800 px-1.5 py-0.2 rounded border border-emerald-200 font-semibold">
                        {selectedHtsDetail.category.name}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-500">
                      ID: {selectedHtsDetail.hts_ticket_id || selectedHtsDetail.id}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> SOLVED
                </span>
              </div>

              {/* Grid Waktu Selesai & PIC Penangan */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <span className="text-[10.5px] font-semibold text-gray-500 block mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-gray-400" /> Waktu Penyelesaian:
                  </span>
                  <span className="font-medium text-gray-800 text-xs">
                    {selectedHtsDetail.solved_at ? format(new Date(selectedHtsDetail.solved_at), 'dd/MM/yyyy HH:mm') + ' WIB' : 'Terkonfirmasi Selesai'}
                  </span>
                </div>

                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <span className="text-[10.5px] font-semibold text-gray-500 block mb-1 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-gray-400" /> Teknisi PIC Penangan:
                  </span>
                  <div className="font-medium text-gray-800 text-xs truncate">
                    {(() => {
                      const picIds = getTicketInitialPicIds(selectedHtsDetail);
                      if (picIds.length === 0) return 'Helpdesk - Ori';
                      return picIds.map(id => htsMasterData.pics?.find(p => String(p.id) === String(id))?.name?.split(',')[0] || `PIC #${id}`).join(', ');
                    })()}
                  </div>
                </div>
              </div>

              {/* Deskripsi Solusi */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-gray-700 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-blue-600" /> Solusi / Tindakan Teknis:
                </label>
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-gray-800 text-xs whitespace-pre-wrap leading-relaxed">
                  {selectedHtsDetail.solution || 'Permasalahan telah selesai ditangani secara teknis.'}
                </div>
              </div>

              {/* Galeri Foto Bukti Lampiran */}
              <div className="space-y-1.5 pt-1 border-t border-gray-200">
                <label className="text-[11px] font-semibold text-gray-700 flex items-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5 text-blue-600" /> Foto Bukti Penanganan Teknis:
                </label>
                {(() => {
                  let urls = [];
                  if (selectedHtsDetail.attachment_urls) {
                    try {
                      urls = typeof selectedHtsDetail.attachment_urls === 'string'
                        ? JSON.parse(selectedHtsDetail.attachment_urls)
                        : selectedHtsDetail.attachment_urls;
                    } catch (e) {
                      urls = [selectedHtsDetail.attachment_urls];
                    }
                  }
                  if (!Array.isArray(urls)) urls = urls ? [urls] : [];

                  if (urls.length === 0) {
                    return (
                      <p className="text-[11px] text-gray-400 italic bg-gray-50 p-2.5 rounded-lg border border-dashed border-gray-200 text-center">
                        Tidak ada berkas foto bukti penanganan yang tersimpan.
                      </p>
                    );
                  }

                  return (
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {urls.map((url, idx) => {
                        const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
                        return (
                          <div
                            key={idx}
                            onClick={() => setPreviewImageUrl(fullUrl)}
                            className="group relative rounded-xl overflow-hidden border border-gray-200 hover:border-blue-400 cursor-pointer shadow-2xs transition"
                            title="Klik untuk memperbesar gambar"
                          >
                            <img src={fullUrl} alt={`Bukti ${idx + 1}`} className="w-full h-20 object-cover group-hover:scale-105 transition duration-150" />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                              <Eye className="w-4 h-4" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3.5 px-5 border-t border-gray-100 flex justify-end bg-gray-50/50">
              <button
                type="button"
                onClick={() => setShowDetailHtsModal(false)}
                className="px-5 py-2 text-xs font-semibold bg-gray-800 text-white rounded-xl hover:bg-gray-900 transition shadow-sm"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TUTUP TIKET & DUAL-CLOSE HTS */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Selesaikan Tiket</h2>
                <p className="text-xs text-gray-500 mt-0.5">Penutupan resmi tiket aduan pelanggan oleh Helpdesk (L1)</p>
              </div>
              <button 
                onClick={() => setShowCloseModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 p-5 overflow-y-auto space-y-4">

            {/* Hitung Data HTS Multi-Tiket */}
            {(() => {
              const htsList = (activeTicket?.hts_tickets && activeTicket.hts_tickets.length > 0)
                ? activeTicket.hts_tickets
                : (activeTicket?.hts_ticket_no ? [{ id: 0, hts_ticket_no: activeTicket.hts_ticket_no, hts_ticket_status: activeTicket.hts_ticket_status }] : []);
              const hasHts = htsList.length > 0;
              const pendingHts = htsList.filter(h => h.hts_ticket_status !== 'SOLVED');
              const allHtsSolved = hasHts && pendingHts.length === 0;

              if (!hasHts) return null;

              if (allHtsSolved) {
                return (
                  <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-2">
                    <div className="flex items-center justify-between font-bold">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <span>Seluruh Tiket HTS Terkait ({htsList.length}) Sudah SOLVED</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        ✓ Siap Tutup Tiket
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-700 leading-relaxed">
                      Seluruh penanganan teknis di portal HTS telah diselesaikan sebelumnya. Anda dapat langsung mengonfirmasi kategori dan kesimpulan penanganan di bawah ini untuk menutup sesi chat pelanggan.
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {htsList.map(h => (
                        <div key={h.id || h.hts_ticket_no} className="flex items-center gap-1.5 bg-white/90 px-2.5 py-1 rounded-lg border border-emerald-200 text-xs">
                          <span className="font-mono font-bold text-gray-800">#{h.hts_ticket_no}</span>
                          {h.category?.name && (
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                              {h.category.name}
                            </span>
                          )}
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            SOLVED
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              return (
                <div className="mb-4 p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-3">
                  <div className="flex items-center justify-between font-bold pb-2 border-b border-blue-200/80">
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-4 h-4 text-blue-600" />
                      <span>Penyelesaian Tiket HTS Terkait ({htsList.length})</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Wajib Selesaikan {pendingHts.length} HTS PENDING
                    </span>
                  </div>

                  <p className="text-[11px] text-blue-800 leading-snug">
                    Sesuai SOP, <b>seluruh tiket HTS wajib diselesaikan</b> sebelum chat pelanggan dapat ditutup resmi. Lengkapi solusi dan teknisi PIC untuk masing-masing tab tiket di bawah:
                  </p>

                  {/* Tab Navigation per Tiket HTS */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 pt-0.5 border-b border-blue-200">
                    {htsList.map((h) => {
                      const isSelected = (closeHtsTabActive ?? pendingHts[0]?.id ?? htsList[0]?.id) === h.id;
                      const isSolved = h.hts_ticket_status === 'SOLVED';
                      const fState = closeHtsFormData[h.id] || {};
                      const isFormReady = (fState.solution?.trim()?.length >= 10) && (fState.picIds?.length > 0);

                      return (
                        <button
                          key={h.id || h.hts_ticket_no}
                          type="button"
                          onClick={() => setCloseHtsTabActive(h.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-white text-gray-700 hover:bg-blue-100/60 border border-blue-200'
                          }`}
                        >
                          <span className="font-mono">#{h.hts_ticket_no}</span>
                          {h.category?.name && (
                            <span className={`text-[10px] px-1 rounded ${isSelected ? 'bg-blue-500 text-blue-100' : 'bg-gray-100 text-gray-600'}`}>
                              {h.category.name}
                            </span>
                          )}
                          {isSolved ? (
                            <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${isSelected ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                              ✓ SOLVED
                            </span>
                          ) : isFormReady ? (
                            <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${isSelected ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                              ✓ Siap
                            </span>
                          ) : (
                            <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${isSelected ? 'bg-amber-400 text-blue-950' : 'bg-amber-100 text-amber-800'}`}>
                              ⚠️ Belum
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Konten Form Tab Aktif */}
                  {(() => {
                    const curActiveId = closeHtsTabActive ?? pendingHts[0]?.id ?? htsList[0]?.id;
                    const activeHt = htsList.find(h => h.id === curActiveId) || htsList[0];
                    if (!activeHt) return null;

                    if (activeHt.hts_ticket_status === 'SOLVED') {
                      return (
                        <div className="bg-white/90 p-3 rounded-xl border border-emerald-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                              <CheckCircle className="w-4 h-4 text-emerald-600" />
                              Tiket HTS #{activeHt.hts_ticket_no} sudah SOLVED
                            </span>
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-medium border border-emerald-200">
                              Selesai Mandiri
                            </span>
                          </div>
                          {activeHt.solution && (
                            <div className="text-xs text-gray-700 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                              <span className="font-semibold text-gray-500 text-[10px] block mb-0.5">Solusi Tercatat:</span>
                              {activeHt.solution}
                            </div>
                          )}
                        </div>
                      );
                    }

                    const curForm = closeHtsFormData[activeHt.id] || {
                      picIds: [],
                      picSearch: '',
                      solution: '',
                      tglteknis: getTodayDate(),
                      jam_problem: getCurrentTime(),
                      files: [],
                      selectedInternalUrls: [],
                      useChatImage: false
                    };

                    const updateForm = (field, val) => {
                      setCloseHtsFormData(prev => ({
                        ...prev,
                        [activeHt.id]: {
                          ...(prev[activeHt.id] || curForm),
                          [field]: val
                        }
                      }));
                    };

                    return (
                      <div className="space-y-3 pt-1">
                        {/* Header Tab Aktif */}
                        <div className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-blue-100">
                          <div>
                            <span className="font-bold text-blue-950">Form Penyelesaian #{activeHt.hts_ticket_no}</span>
                            {activeHt.category?.name && (
                              <span className="text-[11px] text-gray-500 ml-1.5">({activeHt.category.name})</span>
                            )}
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                            PENDING (Wajib Dilengkapi)
                          </span>
                        </div>

                        {/* Tanggal & Jam Penanganan */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-semibold text-blue-800 mb-1 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-blue-600" />
                              Tanggal Penanganan *
                            </label>
                            <input
                              type="date"
                              value={curForm.tglteknis || getTodayDate()}
                              onChange={e => updateForm('tglteknis', e.target.value)}
                              className="w-full bg-white border border-blue-300 rounded-lg px-2.5 py-1 text-xs text-gray-800 outline-none"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-blue-800 mb-1 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-blue-600" />
                              Jam Penanganan *
                            </label>
                            <input
                              type="time"
                              value={curForm.jam_problem || getCurrentTime()}
                              onChange={e => updateForm('jam_problem', e.target.value)}
                              className="w-full bg-white border border-blue-300 rounded-lg px-2.5 py-1 text-xs text-gray-800 outline-none"
                              required
                            />
                          </div>
                        </div>

                        {/* Multi PIC Penyelesaian */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[11px] font-semibold text-blue-800">
                              PIC Penyelesaian Teknis HTS *
                            </label>
                            <span className="text-[10px] text-blue-700 font-bold bg-white px-2 py-0.5 rounded-full border border-blue-200">
                              {(curForm.picIds || []).length} PIC Terpilih
                            </span>
                          </div>

                          {/* Kotak Pencarian PIC */}
                          <div className="relative mb-1.5">
                            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2" />
                            <input
                              type="text"
                              value={curForm.picSearch || ''}
                              onChange={e => updateForm('picSearch', e.target.value)}
                              placeholder="Cari nama teknisi PIC..."
                              className="w-full pl-8 pr-7 py-1 text-xs border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                            />
                            {curForm.picSearch && (
                              <button
                                type="button"
                                onClick={() => updateForm('picSearch', '')}
                                className="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* List PIC (Terpilih Selalu di Atas) */}
                          <div className="max-h-28 overflow-y-auto border border-blue-200 rounded-lg p-1 bg-white divide-y divide-gray-100">
                            {getSortedPics(htsMasterData.pics, curForm.picIds || [], curForm.picSearch || '').map(p => {
                              const isChecked = (curForm.picIds || []).includes(String(p.id));
                              const initialPics = getTicketInitialPicIds(activeHt);
                              const isInitialPic = initialPics.length > 0
                                ? initialPics.includes(String(p.id))
                                : String(p.id) === '14';
                              return (
                                <label key={p.id} className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer text-xs transition ${isChecked ? 'bg-blue-50 font-semibold text-blue-900' : 'text-gray-700 hover:bg-gray-50'}`}>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      className="w-3.5 h-3.5 text-blue-600 rounded focus:ring-blue-500"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        const strId = String(p.id);
                                        const next = e.target.checked
                                          ? [...(curForm.picIds || []), strId]
                                          : (curForm.picIds || []).filter(id => id !== strId);
                                        updateForm('picIds', next);
                                      }}
                                    />
                                    <span className="truncate">{p.name}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {isChecked && isInitialPic && (
                                      <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.2 rounded font-bold ml-2">
                                        PIC Penerima
                                      </span>
                                    )}
                                    {isChecked && !isInitialPic && (
                                      <span className="text-[9px] bg-blue-100 text-blue-800 border border-blue-200 px-1.5 py-0.2 rounded font-bold ml-2">
                                        PIC Penanganan
                                      </span>
                                    )}
                                  </div>
                                </label>
                              );
                            })}
                            {getSortedPics(htsMasterData.pics, curForm.picIds || [], curForm.picSearch || '').length === 0 && (
                              <div className="p-2 text-center text-xs text-gray-400">
                                Tidak ada teknisi PIC yang cocok
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Solusi Teknis Khusus HTS Ini */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[11px] font-semibold text-blue-800">
                              Solusi Teknis HTS #{activeHt.hts_ticket_no} * (Min. 10 karakter)
                            </label>
                            <span className={`text-[10px] font-medium ${(curForm.solution?.trim().length || 0) >= 10 ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {curForm.solution?.trim().length || 0}/10 karakter
                            </span>
                          </div>
                          <textarea
                            rows="3"
                            value={curForm.solution || ''}
                            onChange={e => updateForm('solution', e.target.value)}
                            placeholder={`Tulis tindakan teknis penanganan khusus tiket #${activeHt.hts_ticket_no}...`}
                            className="w-full bg-white border border-blue-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none text-gray-800"
                          ></textarea>
                        </div>

                        {/* Lampiran Bukti Penyelesaian */}
                        <div className="space-y-2 pt-2 border-t border-blue-200">
                          <label className="block text-[11px] font-semibold text-blue-800">
                            Bukti Lampiran Selesai / Foto Tindakan #{activeHt.hts_ticket_no} (Opsional)
                          </label>

                          {/* 1. Opsi Galeri Foto dari Catatan Internal Teknisi Lapangan (L2) */}
                          {messages.some(m => m.is_internal && m.attachment_url) && (
                            <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                                  📸 Foto dari Catatan Internal Teknisi
                                </span>
                                {(curForm.selectedInternalUrls || []).length > 0 && (
                                  <span className="text-[9px] bg-amber-200 text-amber-900 font-bold px-1.5 py-0.5 rounded">
                                    {curForm.selectedInternalUrls.length} Foto Terpilih
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-amber-700 leading-tight">
                                Klik foto hasil perbaikan teknisi sebagai bukti penyelesaian tiket HTS ini:
                              </p>
                              <div className="flex gap-2 overflow-x-auto py-1">
                                {messages.filter(m => m.is_internal && m.attachment_url).map(m => {
                                  const fullUrl = m.attachment_url.startsWith('http') ? m.attachment_url : `${BASE_URL}${m.attachment_url}`;
                                  const isSelected = (curForm.selectedInternalUrls || []).includes(m.attachment_url);
                                  return (
                                    <div
                                      key={m.id}
                                      onClick={() => {
                                        const prevUrls = curForm.selectedInternalUrls || [];
                                        const nextUrls = isSelected
                                          ? prevUrls.filter(u => u !== m.attachment_url)
                                          : [...prevUrls, m.attachment_url];
                                        updateForm('selectedInternalUrls', nextUrls);
                                      }}
                                      className={`relative rounded-lg border-2 cursor-pointer transition p-0.5 shrink-0 ${
                                        isSelected
                                          ? 'border-amber-600 ring-2 ring-amber-300 shadow-xs'
                                          : 'border-amber-200 hover:border-amber-400 bg-white'
                                      }`}
                                      title="Klik untuk memilih foto ini"
                                    >
                                      <img src={fullUrl} alt="Internal Media" className="w-14 h-14 object-cover rounded-md" />
                                      {isSelected && (
                                        <span className="absolute top-1 right-1 bg-amber-600 text-white rounded-full p-0.5 shadow-xs">
                                          <Check className="w-3 h-3" />
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 2. Opsi Foto dari Chat WhatsApp Pelapor */}
                          {closeHtsChatImagePreview && (
                            <label className={`flex items-center gap-2.5 p-2 bg-white border rounded-lg cursor-pointer transition ${
                              curForm.useChatImage ? 'border-blue-400 bg-blue-50/50' : 'border-blue-200 hover:border-blue-300'
                            }`}>
                              <input
                                type="checkbox"
                                checked={Boolean(curForm.useChatImage)}
                                onChange={e => updateForm('useChatImage', e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded"
                              />
                              <img src={closeHtsChatImagePreview} alt="Bukti WA" className="w-8 h-8 object-cover rounded border border-blue-300" />
                              <div className="text-[11px] leading-tight">
                                <span className="font-semibold text-blue-900 block">Gunakan foto dari chat WhatsApp</span>
                                <span className="text-blue-700 text-[10px]">Foto kendala awal dari pelapor</span>
                              </div>
                            </label>
                          )}

                          {/* 3. Upload File Baru dari Komputer */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <label className="flex-1 border border-dashed border-blue-300 hover:border-blue-500 rounded-lg p-2 text-center cursor-pointer bg-white transition flex items-center justify-center gap-2 text-xs text-gray-600">
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={e => {
                                    if (e.target.files && e.target.files.length > 0) {
                                      const newFiles = Array.from(e.target.files);
                                      updateForm('files', [...(curForm.files || []), ...newFiles]);
                                    }
                                  }}
                                />
                                <Paperclip className="w-3.5 h-3.5 text-gray-500" />
                                <span>Upload foto dari komputer (Bisa pilih multi-foto)</span>
                              </label>
                            </div>
                            {(curForm.files || []).length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {curForm.files.map((file, idx) => (
                                  <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] border border-blue-200">
                                    <span className="truncate max-w-[130px]">{file.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextFiles = curForm.files.filter((_, i) => i !== idx);
                                        updateForm('files', nextFiles);
                                      }}
                                      className="text-blue-500 hover:text-red-500"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Tag Kategori Tim</label>
              <p className="text-[11px] text-gray-500 mb-2">
                Otomatis tercentang sesuai penugasan Tim L2.
              </p>
              <div className="flex flex-wrap gap-2">
                {categories?.map(cat => {
                  const isAssigned = activeTicket?.categories?.some(tc => (tc.category_id || tc.category?.id) === cat.id);
                  const isChecked = selectedCategories.includes(cat.id);
                  return (
                    <label key={cat.id} className={`inline-flex items-center px-3 py-1.5 rounded-full cursor-pointer transition border text-xs ${
                      isChecked 
                        ? 'bg-blue-50 border-blue-400 text-blue-900 font-medium' 
                        : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
                    }`}>
                      <input 
                        type="checkbox" 
                        className="rounded text-blue-600 focus:ring-blue-500 mr-1.5"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedCategories([...selectedCategories, cat.id]);
                          else setSelectedCategories(selectedCategories.filter(id => id !== cat.id));
                        }}
                      />
                      <span>{cat.name}</span>
                      {isAssigned && (
                        <span className="text-[9px] bg-blue-200 text-blue-800 px-1 py-0.2 rounded font-bold ml-1">
                          L2
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mb-6">
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Kesimpulan Penanganan Chat Pelanggan (Min. 10 karakter) *</label>
                {activeTicket?.categories?.some(tc => tc.solution) && (
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-medium">
                    ✓ Catatan L2 Terisi Otomatis
                  </span>
                )}
              </div>
              <textarea 
                rows="4" 
                value={summaryText}
                onChange={e => {
                  const newVal = e.target.value;
                  setSummaryText(newVal);
                  // Sinkronisasi otomatis ke solusi tab HTS yang masih kosong
                  const htsList = (activeTicket?.hts_tickets && activeTicket.hts_tickets.length > 0)
                    ? activeTicket.hts_tickets
                    : (activeTicket?.hts_ticket_no ? [{ id: 0, hts_ticket_no: activeTicket.hts_ticket_no, hts_ticket_status: activeTicket.hts_ticket_status }] : []);
                  const pendingHts = htsList.filter(h => h.hts_ticket_status !== 'SOLVED');
                  if (pendingHts.length > 0) {
                    setCloseHtsFormData(prev => {
                      const updated = { ...prev };
                      let changed = false;
                      pendingHts.forEach(h => {
                        if (!updated[h.id] || !updated[h.id].solution) {
                          updated[h.id] = {
                            ...(updated[h.id] || {}),
                            solution: newVal
                          };
                          changed = true;
                        }
                      });
                      return changed ? updated : prev;
                    });
                  }
                  if (closeHtsTicket) setCloseHtsSolution(newVal);
                }}
                placeholder="Rangkum hasil penyelesaian kendala untuk diinformasikan ke pelanggan..."
                className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              ></textarea>
            </div>
          </div>

          {/* Validasi & Submit Footer */}
          {(() => {
            const htsList = (activeTicket?.hts_tickets && activeTicket.hts_tickets.length > 0)
              ? activeTicket.hts_tickets
              : (activeTicket?.hts_ticket_no ? [{ id: 0, hts_ticket_no: activeTicket.hts_ticket_no, hts_ticket_status: activeTicket.hts_ticket_status }] : []);
            const pendingHts = htsList.filter(h => h.hts_ticket_status !== 'SOLVED');
            const isAnyPendingHtsIncomplete = pendingHts.some(ht => {
              const form = closeHtsFormData[ht.id];
              return !form || !form.solution || form.solution.trim().length < 10 || !form.picIds || form.picIds.length === 0;
            });
            const isSubmitDisabled = summaryText.trim().length < 10 || isClosingTicket || isAnyPendingHtsIncomplete;

            return (
              <div className="p-3.5 px-5 border-t border-gray-100 flex justify-between items-center bg-white sticky bottom-0 z-10 shadow-sm">
                <div className="text-[11px]">
                  {isAnyPendingHtsIncomplete && (
                    <span className="text-amber-600 font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Lengkapi seluruh tab tiket HTS yang PENDING
                    </span>
                  )}
                </div>
                <div className="flex space-x-2.5">
                  <button 
                    onClick={() => setShowCloseModal(false)} 
                    disabled={isClosingTicket}
                    className="px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition-colors"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={handleCloseTicket} 
                    disabled={isSubmitDisabled} 
                    className="px-5 py-2 text-xs bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-semibold transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    {isClosingTicket 
                      ? 'Memproses...' 
                      : (pendingHts.length > 0 ? 'Selesaikan Semua HTS & Tutup Tiket' : 'Tutup Tiket Selesai')}
                  </button>
                </div>
              </div>
            );
          })()}
          </div>
        </div>
      )}

      {/* MODAL L2 TANDAI SELESAI & INPUT SOLUSI */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-start mb-4 pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-green-100 text-green-700 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Tandai Selesai Penanganan</h2>
                  <p className="text-xs text-gray-500">
                    {currentUser.category ? `Tim ${typeof currentUser.category === 'object' ? currentUser.category?.name : currentUser.category}` : 'Teknisi L2'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowResolveModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmResolve}>
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Catatan Solusi / Rincian Penanganan Teknis <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Tuliskan tindakan teknis yang telah dikerjakan di lapangan atau lab. Catatan ini akan otomatis masuk ke Catatan Internal dan dijadikan rujukan oleh L1 saat menutup tiket di portal HTS.
                </p>
                <textarea
                  rows="4"
                  required
                  value={resolveSolutionText}
                  onChange={e => setResolveSolutionText(e.target.value)}
                  placeholder="Contoh: Kabel LAN diganti dengan Cat6 baru di port 3, tes ping stabil 1ms, akses intranet OPD kembali normal..."
                  className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  disabled={isResolving}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isResolving || !resolveSolutionText.trim()}
                  className="px-5 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  {isResolving ? 'Menyimpan...' : 'Konfirmasi Selesai'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDIT IDENTITAS PELAPOR (L1 & ADMIN) */}
      {showEditCustomerModal && activeTicket?.customer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-base">Ubah Identitas Pelapor</h3>
                  <p className="text-xs text-gray-500">Nomor WA: +{activeTicket.customer.wa_number}</p>
                </div>
              </div>
              <button 
                onClick={() => setShowEditCustomerModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Nama Pelapor / Kontak <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editCustomerData.name}
                  onChange={e => setEditCustomerData({ ...editCustomerData, name: e.target.value })}
                  placeholder="Contoh: Pak Budi Santoso"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Instansi / Unit Kerja / SKPD (Opsional)
                </label>
                <input
                  type="text"
                  value={editCustomerData.skpd_name}
                  onChange={e => setEditCustomerData({ ...editCustomerData, skpd_name: e.target.value })}
                  placeholder="Contoh: Diskominfo / Bagian Umum"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Nomor WhatsApp Pelapor
                </label>
                <input
                  type="text"
                  value={editCustomerData.wa_number}
                  onChange={e => setEditCustomerData({ ...editCustomerData, wa_number: e.target.value })}
                  placeholder="Contoh: 628123456789 atau 08123456789"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition font-mono"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Format otomatis dinormalisasi ke standar internasional (628...).
                </p>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowEditCustomerModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingCustomer || !editCustomerData.name?.trim()}
                  className="px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition shadow-sm disabled:opacity-50"
                >
                  {isSavingCustomer ? 'Menyimpan...' : 'Simpan Identitas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL LOGIN HTS DISKOMDIGI (L1 & ADMIN) */}
      {showHtsModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-sm">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-base">Hubungkan Akun Portal HTS</h3>
                  <p className="text-[11px] text-gray-500">hts.diskomdigi.jatengprov.go.id</p>
                </div>
              </div>
              <button 
                onClick={() => setShowHtsModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {htsLoginError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{htsLoginError}</span>
              </div>
            )}

            <form onSubmit={handleHtsLogin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Email Petugas HTS *</label>
                <input 
                  type="email" 
                  placeholder="email@jatengprov.go.id atau nexa.net.id"
                  value={htsEmailInput}
                  onChange={(e) => setHtsEmailInput(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Password HTS *</label>
                <input 
                  type="password" 
                  placeholder="Password akun portal HTS Anda"
                  value={htsPasswordInput}
                  onChange={(e) => setHtsPasswordInput(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold text-gray-700">Kode Keamanan (CAPTCHA) *</label>
                  <button 
                    type="button" 
                    onClick={fetchHtsCaptcha} 
                    disabled={isLoadingCaptcha}
                    className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingCaptcha ? 'animate-spin' : ''}`} /> Perbarui Gambar
                  </button>
                </div>
                
                <div className="flex items-center gap-3 bg-gray-50 p-2.5 rounded-xl border border-gray-200 mb-2">
                  {isLoadingCaptcha ? (
                    <div className="w-36 h-12 bg-gray-200 animate-pulse rounded-lg flex items-center justify-center text-xs text-gray-400">
                      Memuat...
                    </div>
                  ) : htsCaptchaImg ? (
                    <img 
                      src={htsCaptchaImg} 
                      alt="Captcha HTS" 
                      className="h-12 border border-gray-300 rounded-lg bg-white px-2 py-1 shadow-sm object-contain"
                    />
                  ) : (
                    <div className="text-xs text-red-500">Gagal memuat CAPTCHA</div>
                  )}
                  <p className="text-[11px] text-gray-500 leading-tight">
                    Ketik karakter yang terlihat pada gambar di samping
                  </p>
                </div>

                <input 
                  type="text" 
                  placeholder="Ketik kode captcha"
                  value={htsCaptchaInput}
                  onChange={(e) => setHtsCaptchaInput(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  autoComplete="off"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowHtsModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingHtsLogin}
                  className="px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmittingHtsLogin ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Menghubungkan...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" /> Hubungkan Akun HTS
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDIT PENGGUNA (KHUSUS ADMIN) */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-base">Ubah Data Pengguna</h3>
                  <p className="text-xs text-gray-500">ID Akun: #{editingUser.id}</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingUser(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Nama Lengkap <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editUserData.name}
                  onChange={e => setEditUserData({ ...editUserData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={editUserData.email}
                  onChange={e => setEditUserData({ ...editUserData, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Password Baru (Opsional)
                </label>
                <input
                  type="password"
                  value={editUserData.password}
                  onChange={e => setEditUserData({ ...editUserData, password: e.target.value })}
                  placeholder="Kosongkan jika tidak ingin mengubah password"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Biarkan kosong jika tetap menggunakan password lama.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Role / Peran <span className="text-red-500">*</span>
                </label>
                <select
                  value={editUserData.role}
                  onChange={e => setEditUserData({ ...editUserData, role: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                >
                  <option value="L1">L1 (Dispatcher)</option>
                  <option value="L2">L2 (Teknisi)</option>
                  <option value="SPV">SPV (Supervisor)</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>

              {editUserData.role === 'L2' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Kategori Khusus (Wajib L2) <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={editUserData.category_id}
                    onChange={e => setEditUserData({ ...editUserData, category_id: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                  >
                    <option value="">-- Pilih Kategori --</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition shadow-sm disabled:opacity-50"
                >
                  {isSavingUser ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal untuk Preview Foto / Media Catatan Internal */}
      {previewImageUrl && (
        <div 
          className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-200 animate-in fade-in"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div 
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute -top-10 right-0 flex items-center gap-3">
              <a 
                href={previewImageUrl.startsWith('http') ? previewImageUrl : `${BASE_URL}${previewImageUrl}`} 
                target="_blank" 
                rel="noreferrer"
                className="text-white/90 hover:text-white bg-black/50 hover:bg-black/70 px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5 transition border border-white/20"
                title="Buka gambar di tab baru"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Buka Tab Baru
              </a>
              <button 
                onClick={() => setPreviewImageUrl(null)}
                className="text-white/90 hover:text-white bg-black/50 hover:bg-black/70 p-1.5 rounded-lg transition border border-white/20"
                title="Tutup Preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img 
              src={previewImageUrl.startsWith('http') ? previewImageUrl : `${BASE_URL}${previewImageUrl}`} 
              alt="Preview Catatan Internal" 
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-white/10"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// ROOT ROUTING COMPONENT
// ==========================================
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
