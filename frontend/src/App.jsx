import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Search, Send, User, Clock, Phone, AlertCircle, MessageSquare, FileText, Download, Lock, LogOut, Paperclip, CheckCircle, Users, Bot, Trash2, Plus, PhoneCall, Radio, Sliders, Edit2, Check, X, Globe, Key, ShieldCheck, RefreshCw, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

const BASE_URL = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : `${window.location.protocol}//${window.location.hostname}:3000`;
const API_URL = `${BASE_URL}/api`;
const SOCKET_URL = BASE_URL;

const socket = io(SOCKET_URL);

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
  const [chatMode, setChatMode] = useState('public'); // 'public' (balas WA pelapor) | 'internal' (catatan internal L1 ke L2)
  
  // State Close Ticket & Categories
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [categories, setCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [assignCategoryIds, setAssignCategoryIds] = useState([]);
  const [assignServiceType, setAssignServiceType] = useState('TROUBLESHOOTING');

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

  // State Edit Identitas Pelapor (Nama & Instansi/SKPD) (Rekomendasi C)
  const [showEditCustomerModal, setShowEditCustomerModal] = useState(false);
  const [editCustomerData, setEditCustomerData] = useState({ name: '', skpd_name: '' });
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  const handleOpenEditCustomerModal = () => {
    if (!activeTicket?.customer) return;
    setEditCustomerData({
      name: activeTicket.customer.name || '',
      skpd_name: activeTicket.customer.skpd_name || ''
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
        skpd_name: editCustomerData.skpd_name.trim()
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
  const [assignIndukOpdId, setAssignIndukOpdId] = useState('57');
  const [assignHtsKategori, setAssignHtsKategori] = useState('troubleshoot');
  const [assignHtsSubKategori, setAssignHtsSubKategori] = useState('DISTRIBUTION NETWORK');
  const [assignHtsDetil, setAssignHtsDetil] = useState('');
  const [assignHtsPicId, setAssignHtsPicId] = useState('14');
  const [opdSearchTerm, setOpdSearchTerm] = useState('');
  const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);

  // State Standalone Sync Modal HTS (Fase 2 V3)
  const [showSyncHtsModal, setShowSyncHtsModal] = useState(false);
  const [syncIndukOpdId, setSyncIndukOpdId] = useState('57');
  const [syncHtsKategori, setSyncHtsKategori] = useState('troubleshoot');
  const [syncHtsSubKategori, setSyncHtsSubKategori] = useState('DISTRIBUTION NETWORK');
  const [syncHtsDetil, setSyncHtsDetil] = useState('');
  const [syncHtsPicId, setSyncHtsPicId] = useState('14');
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

  const handleOpenAssignModal = () => {
    if (!activeTicket) return;
    const currentCatIds = activeTicket.categories?.map(tc => tc.category_id || tc.category?.id).filter(Boolean) || [];
    setAssignCategoryIds(currentCatIds);
    setAssignServiceType(activeTicket.service_type || 'TROUBLESHOOTING');
    
    // Auto setup HTS
    const hasHts = Boolean(activeTicket.hts_ticket_no);
    setCreateHtsTicket(!hasHts && Boolean(htsStatus?.isLoggedIn));

    // Auto match OPD Induk
    const custSkpd = (activeTicket.customer?.skpd_name || '').toLowerCase();
    const matchedOpd = htsMasterData.indukOpd?.find(o => 
      o.name.toLowerCase().includes(custSkpd) || custSkpd.includes(o.name.toLowerCase())
    );
    setAssignIndukOpdId(matchedOpd ? matchedOpd.id : '57');

    // Pre-fill first customer complaint
    const firstCustMsg = messages.find(m => m.sender_type === 'CUSTOMER')?.message_text || '';
    setAssignHtsDetil(firstCustMsg);

    // Pre-fill sub-kategori
    const activeNames = (activeTicket.categories || []).map(c => c.category?.name || '').join(' ').toLowerCase();
    if (activeNames.includes('network')) {
      setAssignHtsSubKategori('DISTRIBUTION NETWORK');
    } else if (activeNames.includes('server')) {
      setAssignHtsSubKategori('SERVER');
    } else {
      setAssignHtsSubKategori('DISTRIBUTION NETWORK');
    }

    setAssignHtsKategori(activeTicket.service_type === 'REQUEST_LAYANAN' ? 'request' : activeTicket.service_type === 'MONITORING' ? 'monitoring' : 'troubleshoot');
    setAssignHtsPicId('14');
    setOpdSearchTerm('');
    setShowAssignModal(true);
  };

  const handleOpenCloseModal = () => {
    if (!activeTicket) return;
    const currentCatIds = activeTicket.categories?.map(tc => tc.category_id || tc.category?.id).filter(Boolean) || [];
    setSelectedCategories(currentCatIds);
    setSummaryText('');
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
      const payload = {
        categoryIds: assignCategoryIds,
        serviceType: assignServiceType,
        createHtsTicket: createHtsTicket && !activeTicket?.hts_ticket_no,
        induk_opd_id: assignIndukOpdId,
        hts_kategori: assignHtsKategori,
        hts_sub_kategori: assignHtsSubKategori,
        hts_detil: assignHtsDetil,
        hts_pic_id: assignHtsPicId
      };

      const res = await axios.post(`${API_URL}/chat/tickets/${activeTicket.id}/assign`, payload);
      setShowAssignModal(false);
      alert(res.data?.message || 'Penugasan tiket berhasil disimpan.');
      loadTickets();
      if (activeTicket) loadMessages(activeTicket.id);
    } catch (error) {
      alert(error.response?.data?.error || 'Gagal meng-assign tiket');
    } finally {
      setIsSubmittingAssign(false);
    }
  };

  const handleOpenSyncHtsModal = () => {
    if (!activeTicket) return;
    if (!htsStatus?.isLoggedIn) {
      alert('Silakan hubungkan akun HTS Diskomdigi Anda terlebih dahulu di panel kanan.');
      setShowHtsModal(true);
      return;
    }
    const custSkpd = (activeTicket.customer?.skpd_name || '').toLowerCase();
    const matchedOpd = htsMasterData.indukOpd?.find(o => 
      o.name.toLowerCase().includes(custSkpd) || custSkpd.includes(o.name.toLowerCase())
    );
    setSyncIndukOpdId(matchedOpd ? matchedOpd.id : '57');
    const firstCustMsg = messages.find(m => m.sender_type === 'CUSTOMER')?.message_text || '';
    setSyncHtsDetil(firstCustMsg);
    setSyncHtsKategori(activeTicket.service_type === 'REQUEST_LAYANAN' ? 'request' : activeTicket.service_type === 'MONITORING' ? 'monitoring' : 'troubleshoot');
    setSyncHtsSubKategori('DISTRIBUTION NETWORK');
    setSyncHtsPicId('14');
    setSyncOpdSearchTerm('');
    setSyncHtsError('');
    setShowSyncHtsModal(true);
  };

  const handleSyncTicketToHts = async (e) => {
    e.preventDefault();
    if (!activeTicket) return;

    setIsSubmittingSyncHts(true);
    setSyncHtsError('');
    try {
      const res = await axios.post(`${API_URL}/chat/tickets/${activeTicket.id}/sync-hts`, {
        induk_opd_id: syncIndukOpdId,
        hts_kategori: syncHtsKategori,
        hts_sub_kategori: syncHtsSubKategori,
        hts_detil: syncHtsDetil,
        hts_pic_id: syncHtsPicId
      });

      alert(res.data?.message || 'Tiket berhasil disinkronkan ke portal HTS!');
      setShowSyncHtsModal(false);
      loadTickets();
      loadMessages(activeTicket.id);
    } catch (err) {
      setSyncHtsError(err.response?.data?.error || 'Gagal menyinkronkan tiket ke portal HTS');
    } finally {
      setIsSubmittingSyncHts(false);
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
    if (currentUser?.role === 'L1' || currentUser?.role === 'ADMIN') {
      fetchHtsStatus();
      fetchHtsMasterData();
    }

    const handleNewMessage = (data) => {
      loadTickets();
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

    const handleTicketClosed = (data) => {
      loadTickets(); 
      if (currentTabRef.current === 'report') loadReports();
      
      if (activeTicketRef.current && data.ticketId === activeTicketRef.current.id) {
        setActiveTicket(null);
        alert('Tiket ini baru saja diupdate statusnya.');
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

    socket.on('new_message', handleNewMessage);
    socket.on('ticket_closed', handleTicketClosed);
    socket.on('customer_updated', handleCustomerUpdated);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('ticket_closed', handleTicketClosed);
      socket.off('customer_updated', handleCustomerUpdated);
    };
  }, [currentUser]); 

  useEffect(() => {
    if (activeTicket) loadMessages(activeTicket.id);
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

  // L2 menandai selesai (Fase 6)
  const handleSendInternalNote = async (e) => {
    e.preventDefault();
    if (!internalNoteText.trim()) return;
    try {
      await axios.post(`${API_URL}/chat/tickets/${activeTicket.id}/internal-note`, { text: internalNoteText });
      setInternalNoteText('');
    } catch (error) {
      alert('Gagal mengirim catatan');
    }
  };

  const handleMarkResolved = async () => {
    if(!window.confirm('Tandai bahwa kendala pada bagian tim Anda telah selesai ditangani?')) return;
    try {
      const res = await axios.post(`${API_URL}/chat/tickets/${activeTicket.id}/resolve`);
      alert(res.data?.message || 'Berhasil menandai selesai');
      loadTickets();
      if (activeTicket) loadMessages(activeTicket.id);
    } catch (error) {
      alert(error.response?.data?.error || 'Gagal menandai tiket selesai');
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

  const handleCloseTicket = async () => {
    if (summaryText.trim().length < 10) {
      alert('Kesimpulan wajib diisi minimal 10 karakter!');
      return;
    }
    try {
      await axios.post(`${API_URL}/chat/tickets/${activeTicket.id}/close`, {
        summary: summaryText,
        categoryIds: selectedCategories
      });
      setShowCloseModal(false);
      setSummaryText('');
      setSelectedCategories([]);
      setActiveTicket(null);
      loadTickets();
    } catch (error) {
      alert('Gagal menutup tiket');
    }
  };

  const exportToCSV = () => {
    if (reportTickets.length === 0) return alert('Tidak ada data');
    const headers = ['ID Tiket', 'No. Tiket Portal HTS', 'Status HTS', 'Nama Pelapor', 'Instansi / SKPD', 'Nomor WA', 'Status', 'Waktu Masuk', 'Waktu Selesai', 'Durasi', 'Tim / Kategori', 'Jenis Layanan', 'Kesimpulan'];
    const csvRows = [headers.join(',')];
    reportTickets.forEach(ticket => {
      const row = [
        ticket.id, 
        `"${ticket.htsTicketNo ? `#${ticket.htsTicketNo}` : '-'}"`,
        `"${ticket.htsTicketStatus || '-'}"`,
        `"${ticket.customerName}"`, 
        `"${ticket.skpdName || '-'}"`,
        `"${ticket.waNumber}"`, 
        ticket.status,
        `"${format(new Date(ticket.createdAt), 'yyyy-MM-dd HH:mm:ss')}"`,
        ticket.closedAt ? `"${format(new Date(ticket.closedAt), 'yyyy-MM-dd HH:mm:ss')}"` : '-',
        `"${ticket.duration}"`, 
        `"${ticket.categories || '-'}"`, 
        `"${ticket.serviceType || '-'}"`, 
        `"${(ticket.summary || '-').replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `Rekap_Aduan_HTS_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
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
          </div>
        </div>
        <button onClick={handleLogout} className="p-3 text-red-300 hover:bg-red-800 hover:text-white rounded-xl transition-all" title="Logout">
          <LogOut className="w-6 h-6" />
        </button>
      </div>

      {currentTab === 'chat' && (
        <>
          {/* PANEL KIRI: Antrean */}
          <div className="w-[30%] bg-white border-r border-gray-200 flex flex-col">
            <div className="p-4 bg-gray-50 border-b border-gray-200">
              <h1 className="text-xl font-bold text-gray-800">Antrean Aduan</h1>
              <div className="mt-2 relative">
                <input type="text" placeholder="Cari pelapor..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500" />
                <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {tickets.map(ticket => {
                const lastMsg = ticket.messages?.[0];
                return (
                  <div key={ticket.id} onClick={() => setActiveTicket(ticket)} className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${activeTicket?.id === ticket.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}>
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-semibold text-gray-800 truncate">
                        {ticket.customer?.name}
                        {ticket.customer?.skpd_name && (
                          <span className="text-[10px] text-blue-600 font-normal ml-1.5 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                            {ticket.customer.skpd_name}
                          </span>
                        )}
                      </h3>
                      <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                        {ticket.created_at ? format(new Date(ticket.created_at), 'HH:mm') : ''}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm mb-1">
                      <p className="text-gray-500 truncate pr-2 text-xs">
                        {lastMsg ? (lastMsg.attachment_url ? '[Gambar]' : lastMsg.message_text) : 'Belum ada pesan'}
                      </p>
                    </div>
                    <div className="flex justify-between items-center mt-1 gap-1">
                      {ticket.categories && ticket.categories.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                          {ticket.categories.map(tc => (
                            <span key={tc.category_id} className={`px-1.5 py-0.5 text-[9px] font-bold rounded truncate ${
                              tc.is_resolved 
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                : 'bg-orange-100 text-orange-800 border border-orange-200'
                            }`} title={tc.category?.name}>
                              {tc.is_resolved ? '✓ ' : ''}{tc.category?.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                          [Belum Ditugaskan]
                        </span>
                      )}
                      
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full whitespace-nowrap ${ticket.status === 'OPEN' ? 'bg-green-100 text-green-700' : ticket.status === 'RESOLVED' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                        {ticket.status}
                      </span>
                    </div>
                  </div>
                )
              })}
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
                        {activeTicket.hts_ticket_no && (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-800 rounded-full border border-blue-300 flex items-center gap-1 shadow-sm" title={`Portal HTS Diskomdigi: #${activeTicket.hts_ticket_no}`}>
                            <Globe className="w-3 h-3 text-blue-600" /> HTS: #{activeTicket.hts_ticket_no}
                          </span>
                        )}
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
                  
                  {/* RBAC: L1 bisa Tutup, L2 bisa Tandai Selesai */}
                  {isL1 && (
                    <div className="flex space-x-2">
                      <button 
                        onClick={handleOpenAssignModal} 
                        className={`px-3 py-1.5 text-sm rounded-lg font-medium transition flex items-center gap-1 ${
                          activeTicket.categories && activeTicket.categories.length > 0
                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                            : 'bg-blue-50 hover:bg-blue-100 text-blue-700'
                        }`}
                      >
                        {activeTicket.categories && activeTicket.categories.length > 0 ? 'Ubah / Tambah Tim L2' : 'Assign ke L2'}
                      </button>
                      <button onClick={handleOpenCloseModal} className="px-3 py-1.5 bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-700 text-sm rounded-lg font-medium transition">
                        Selesaikan
                      </button>
                    </div>
                  )}
                  {isL2 && (() => {
                    const myCatRelation = activeTicket.categories?.find(tc => tc.category_id === currentUser.category_id);
                    const isMyTeamResolved = myCatRelation?.is_resolved;

                    return (
                      <div className="flex items-center space-x-2">
                        <button onClick={handleReturnTicket} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm rounded-lg font-medium transition">
                          Kembalikan / Lepas
                        </button>
                        {isMyTeamResolved ? (
                          <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 text-sm rounded-lg font-semibold flex items-center border border-emerald-200">
                            <CheckCircle className="w-4 h-4 mr-1 text-emerald-600"/> Bagian Anda Selesai
                          </span>
                        ) : (
                          <button onClick={handleMarkResolved} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium transition flex items-center shadow-sm">
                            <CheckCircle className="w-4 h-4 mr-1"/> Tandai Selesai
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Bubble Chat Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                            <p className="whitespace-pre-wrap leading-relaxed text-xs sm:text-sm">
                              {msg.message_text}
                            </p>
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
                      <div className="p-3.5 flex items-center">
                        <form onSubmit={handleSend} className="flex items-center space-x-2 w-full">
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
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder={selectedFile ? `Kirim gambar ${selectedFile.name}...` : "Ketik balasan untuk dikirim ke WhatsApp pelapor..."}
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
                        <form onSubmit={handleSendInternalNote} className="flex items-center space-x-2 w-full">
                          <input 
                            type="text" 
                            value={internalNoteText}
                            onChange={e => setInternalNoteText(e.target.value)}
                            placeholder="Ketik catatan atau instruksi internal untuk teknisi L2..."
                            className="flex-1 py-2.5 px-4 border border-amber-300 rounded-full focus:outline-none focus:border-amber-500 bg-white text-sm"
                          />
                          <button 
                            type="submit" 
                            disabled={!internalNoteText.trim()} 
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
                      <span className="text-[10px] font-normal text-yellow-700">(Hanya dibaca L1 & Tim Lapangan)</span>
                    </label>
                    <form onSubmit={handleSendInternalNote} className="flex items-center space-x-2 w-full">
                      <input 
                        type="text" 
                        value={internalNoteText}
                        onChange={e => setInternalNoteText(e.target.value)}
                        placeholder={`Ketik progres penanganan ${currentUser.category ? `(Tim ${typeof currentUser.category === 'object' ? currentUser.category?.name : currentUser.category})` : ''}...`}
                        className="flex-1 py-2.5 px-4 border border-yellow-300 rounded-full focus:outline-none focus:border-yellow-500 bg-white text-sm"
                      />
                      <button type="submit" disabled={!internalNoteText.trim()} className="px-4 py-2.5 bg-yellow-600 text-white rounded-full hover:bg-yellow-700 disabled:opacity-50 transition-colors shadow-sm text-sm font-semibold">
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

          {/* PANEL KANAN: Informasi */}
          <div className="w-[20%] bg-white border-l border-gray-200 p-4">
            <h3 className="font-bold text-gray-800 mb-4 border-b pb-2">Detail Pengguna Login</h3>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-6">
              <div className="font-bold text-blue-900">{currentUser.name}</div>
              <div className="text-xs text-gray-500 mb-2">{currentUser.email}</div>
              <div className="flex items-center space-x-2">
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">ROLE: {currentUser.role}</span>
                {currentUser.category && (
                   <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold truncate max-w-[100px]">{typeof currentUser.category === 'object' ? currentUser.category?.name : currentUser.category}</span>
                )}
              </div>
            </div>

            {/* KONEKSI PORTAL HTS DISKOMDIGI (L1 & ADMIN) */}
            {(isL1 || isAdmin) && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-6 shadow-sm">
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
                <h3 className="font-bold text-gray-800 mb-4 border-b pb-2">Detail Tiket</h3>
                <div className="space-y-4">
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
                    <div className="flex items-center text-sm font-medium text-gray-800">
                      <User className="w-4 h-4 mr-2 text-gray-400" />
                      {activeTicket.customer?.name}
                    </div>
                    {activeTicket.customer?.skpd_name && (
                      <div className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded mt-1.5 ml-6 inline-block font-medium border border-blue-200">
                        Instansi: {activeTicket.customer.skpd_name}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Nomor WA</label>
                    <div className="flex items-center text-sm text-gray-800"><Phone className="w-4 h-4 mr-2 text-gray-400" />+{activeTicket.customer?.wa_number}</div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Waktu Masuk</label>
                    <div className="flex items-center text-sm text-gray-800"><Clock className="w-4 h-4 mr-2 text-gray-400" />{format(new Date(activeTicket.created_at), 'dd MMM yyyy, HH:mm')}</div>
                  </div>

                  {/* Status Portal HTS Diskomdigi */}
                  <div className="p-3 rounded-xl border bg-gray-50/70 border-gray-200">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                        <Globe className="w-3.5 h-3.5 text-blue-600" />
                        <span>Portal HTS Diskomdigi</span>
                      </div>
                      {activeTicket.hts_ticket_no ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-300">
                          {activeTicket.hts_ticket_status || 'PROSES'}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full">
                          Belum Terhubung
                        </span>
                      )}
                    </div>

                    {activeTicket.hts_ticket_no ? (
                      <div className="space-y-1 mt-2 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 text-[11px]">No. Aduan:</span>
                          <span className="font-mono font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            #{activeTicket.hts_ticket_no}
                          </span>
                        </div>
                        {activeTicket.hts_synced_at && (
                          <div className="flex justify-between items-center text-[11px] text-gray-400">
                            <span>Disinkronkan:</span>
                            <span>{format(new Date(activeTicket.hts_synced_at), 'dd/MM/yyyy HH:mm')}</span>
                          </div>
                        )}
                        <a
                          href="https://hts.diskomdigi.jatengprov.go.id/tshoot"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 text-[11px] text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1 py-1 font-medium hover:underline"
                        >
                          Buka Portal HTS <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">
                          Tiket ini belum diterbitkan ke portal resmi HTS Diskomdigi.
                        </p>
                        {isL1 && (
                          <button
                            type="button"
                            onClick={handleOpenSyncHtsModal}
                            className="w-full text-xs py-1.5 px-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition flex items-center justify-center gap-1.5"
                          >
                            <Globe className="w-3.5 h-3.5" /> Sinkronkan ke Portal HTS
                          </button>
                        )}
                      </div>
                    )}
                  </div>

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
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* HALAMAN REPORTING */}
      {currentTab === 'report' && (
        <div className="flex-1 bg-gray-50 flex flex-col p-6 overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Rekap Hasil Aduan</h1>
              <p className="text-sm text-gray-500 mt-1">Laporan historis tiket dan kesimpulan penanganan</p>
            </div>
            <div className="flex items-center space-x-3">
              {isAdmin && (
                <>
                  <button 
                    onClick={handleDeleteSelectedReports} 
                    disabled={selectedReportIds.length === 0}
                    className="flex items-center bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-3.5 py-2 rounded-lg font-medium shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" /> Hapus Terpilih ({selectedReportIds.length})
                  </button>
                  <button 
                    onClick={handleDeleteAllReports} 
                    className="flex items-center bg-red-600 hover:bg-red-700 text-white px-3.5 py-2 rounded-lg font-medium shadow-sm transition text-sm"
                  >
                    <AlertCircle className="w-4 h-4 mr-1.5" /> Hapus Semua Data
                  </button>
                </>
              )}
              <button onClick={exportToCSV} className="flex items-center bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors text-sm">
                <Download className="w-4 h-4 mr-2" /> Export CSV
              </button>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 overflow-hidden flex flex-col">
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 uppercase text-xs">
                  <tr>
                    {isAdmin && (
                      <th className="px-4 py-4 w-10 text-center">
                        <input 
                          type="checkbox" 
                          checked={reportTickets.length > 0 && selectedReportIds.length === reportTickets.length}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedReportIds(reportTickets.map(t => t.id));
                            else setSelectedReportIds([]);
                          }}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                    )}
                    <th className="px-6 py-4 font-semibold">ID</th>
                    <th className="px-6 py-4 font-semibold">Pelapor (WA)</th>
                    <th className="px-6 py-4 font-semibold">No. Tiket HTS</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold">Jenis Layanan</th>
                    <th className="px-6 py-4 font-semibold">Tim Terkait</th>
                    <th className="px-6 py-4 font-semibold">Waktu Masuk</th>
                    <th className="px-6 py-4 font-semibold">Durasi</th>
                    <th className="px-6 py-4 font-semibold min-w-[200px]">Kesimpulan Penanganan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reportTickets.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="px-6 py-12 text-center text-gray-400">
                        Belum ada data aduan atau tiket yang tercatat.
                      </td>
                    </tr>
                  ) : (
                    reportTickets.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                        {isAdmin && (
                          <td className="px-4 py-4 text-center">
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
                        <td className="px-6 py-4 font-medium text-gray-900">#{row.id}</td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-800">{row.customerName}</div>
                          {row.skpdName && row.skpdName !== '-' && (
                            <div className="text-xs text-blue-600 font-medium">{row.skpdName}</div>
                          )}
                          <div className="text-xs text-gray-500">+{row.waNumber}</div>
                        </td>
                        <td className="px-6 py-4">
                          {row.htsTicketNo ? (
                            <div>
                              <div className="font-mono text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-flex items-center gap-1">
                                <Globe className="w-3 h-3 text-blue-600" /> #{row.htsTicketNo}
                              </div>
                              {row.htsTicketStatus && (
                                <span className={`block text-[10px] font-bold mt-1 uppercase ${
                                  row.htsTicketStatus === 'SOLVED' ? 'text-emerald-700' : 'text-blue-700'
                                }`}>
                                  {row.htsTicketStatus}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Belum terhubung</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            row.status === 'CLOSED' ? 'bg-gray-100 text-gray-700' :
                            row.status === 'RESOLVED' ? 'bg-blue-100 text-blue-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-gray-700">
                          {row.serviceType || '-'}
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-orange-700">
                          {row.categories || '-'}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                          {row.createdAt ? format(new Date(row.createdAt), 'dd MMM yyyy, HH:mm') : '-'}
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-gray-700">
                          {row.duration}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-600">
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
      )}

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

      {/* MODAL ASSIGN L2 & INTEGRASI HTS DISKOMDIGI (HYBRID) */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-gray-800">
                  {activeTicket?.categories?.length > 0 ? 'Kelola / Tambah Tim L2' : 'Assign ke Teknisi L2'}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Tugaskan tim teknisi internal dan sinkronkan dengan Portal Resmi HTS Diskomdigi
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
            <div className="p-5 overflow-y-auto space-y-5">
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
                  onChange={e => setAssignServiceType(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="TROUBLESHOOTING">Troubleshooting (Gangguan Teknis)</option>
                  <option value="REQUEST_LAYANAN">Request Layanan (Permintaan Fasilitas/Akses)</option>
                  <option value="MONITORING">Monitoring (Pengawasan/Cek Rutin)</option>
                </select>
              </div>

              {/* Bagian 3: Integrasi Portal HTS Diskomdigi */}
              <div className="pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                      3. Integrasi Portal HTS Diskomdigi
                    </span>
                  </div>
                </div>

                {/* Kondisi 1: Sudah ada nomor tiket HTS */}
                {activeTicket?.hts_ticket_no ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        Terhubung ke Portal HTS Diskomdigi
                      </div>
                      <div className="text-[11px] text-emerald-700 mt-0.5">
                        No. Aduan: <strong className="font-mono text-emerald-900">#{activeTicket.hts_ticket_no}</strong> ({activeTicket.hts_ticket_status || 'Proses Penanganan'})
                      </div>
                    </div>
                  </div>
                ) : !htsStatus?.isLoggedIn ? (
                  /* Kondisi 2: Belum login HTS */
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-2">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span>Akun Portal HTS Belum Terhubung</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-700">
                      Anda belum terhubung ke portal HTS. Tiket tetap bisa ditugaskan ke Tim L2 secara internal, dan dapat disinkronkan ke portal HTS nanti.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAssignModal(false);
                        handleOpenHtsModal();
                      }}
                      className="text-xs px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition inline-flex items-center gap-1"
                    >
                      <Key className="w-3 h-3" /> Login ke Portal HTS Sekarang
                    </button>
                  </div>
                ) : (
                  /* Kondisi 3: Sudah login HTS & belum terbit tiket HTS */
                  <div className="space-y-3">
                    <label className="flex items-start gap-2.5 p-3 bg-blue-50/70 border border-blue-200 rounded-xl cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={createHtsTicket}
                        onChange={(e) => setCreateHtsTicket(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded mt-0.5 focus:ring-blue-500"
                      />
                      <div className="text-xs">
                        <span className="font-semibold text-blue-900 block">
                          Terbitkan Tiket Resmi di Portal HTS Diskomdigi
                        </span>
                        <span className="text-blue-700 text-[11px] leading-tight block mt-0.5">
                          Otomatis memproses submit aduan, status, dan penugasan PIC di portal hts.diskomdigi.jatengprov.go.id.
                        </span>
                      </div>
                    </label>

                    {createHtsTicket && (
                      <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-3 animate-in fade-in duration-150">
                        {/* Search & Pilih OPD Induk */}
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            OPD Induk Pelapor *
                          </label>
                          <input 
                            type="text" 
                            placeholder="Cari nama OPD..."
                            value={opdSearchTerm}
                            onChange={(e) => setOpdSearchTerm(e.target.value)}
                            className="w-full mb-1.5 px-2.5 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                          />
                          <select
                            value={assignIndukOpdId}
                            onChange={(e) => setAssignIndukOpdId(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          >
                            {htsMasterData.indukOpd
                              ?.filter(o => !opdSearchTerm || o.name.toLowerCase().includes(opdSearchTerm.toLowerCase()))
                              ?.map(o => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                              ))
                            }
                          </select>
                        </div>

                        {/* Sub-Kategori HTS */}
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Sub-Kategori Layanan Portal HTS *
                          </label>
                          <select
                            value={assignHtsSubKategori}
                            onChange={(e) => setAssignHtsSubKategori(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          >
                            {htsMasterData.subKategori?.map(s => (
                              <option key={s.id} value={s.id}>{s.name} ({s.team})</option>
                            ))}
                          </select>
                        </div>

                        {/* Detil Aduan */}
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Detil Aduan / Permasalahan *
                          </label>
                          <textarea
                            rows={3}
                            value={assignHtsDetil}
                            onChange={(e) => setAssignHtsDetil(e.target.value)}
                            placeholder="Ketik detail keluhan teknis untuk dicatat di portal HTS..."
                            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          />
                        </div>

                        {/* PIC Petugas */}
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            PIC Helpdesk Penerima *
                          </label>
                          <select
                            value={assignHtsPicId}
                            onChange={(e) => setAssignHtsPicId(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          >
                            {htsMasterData.pics?.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 border-t border-gray-100 flex justify-end space-x-2.5 bg-gray-50/50">
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
                    Menyimpan & Menerbitkan Tiket...
                  </>
                ) : (
                  <>
                    {createHtsTicket && !activeTicket?.hts_ticket_no ? 'Tugaskan & Terbitkan Tiket HTS' : (activeTicket?.categories?.length > 0 ? 'Simpan Penugasan' : 'Tugaskan L2')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SINKRONISASI MANUAL KE PORTAL HTS */}
      {showSyncHtsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-sm">Sinkronkan ke Portal HTS Diskomdigi</h3>
                  <p className="text-[11px] text-gray-500">Terbitkan nomor aduan resmi untuk tiket ini</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSyncHtsModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSyncTicketToHts} className="p-5 overflow-y-auto space-y-3.5">
              {syncHtsError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{syncHtsError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">OPD Induk Pelapor *</label>
                <input 
                  type="text" 
                  placeholder="Cari nama OPD..."
                  value={syncOpdSearchTerm}
                  onChange={(e) => setSyncOpdSearchTerm(e.target.value)}
                  className="w-full mb-1.5 px-2.5 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                />
                <select
                  value={syncIndukOpdId}
                  onChange={(e) => setSyncIndukOpdId(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  required
                >
                  {htsMasterData.indukOpd
                    ?.filter(o => !syncOpdSearchTerm || o.name.toLowerCase().includes(syncOpdSearchTerm.toLowerCase()))
                    ?.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))
                  }
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Kategori Layanan *</label>
                <select
                  value={syncHtsKategori}
                  onChange={(e) => setSyncHtsKategori(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {htsMasterData.kategori?.map(k => (
                    <option key={k.id} value={k.id}>{k.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Sub-Kategori Layanan *</label>
                <select
                  value={syncHtsSubKategori}
                  onChange={(e) => setSyncHtsSubKategori(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  required
                >
                  {htsMasterData.subKategori?.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.team})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Detil Aduan / Permasalahan *</label>
                <textarea
                  rows={3}
                  value={syncHtsDetil}
                  onChange={(e) => setSyncHtsDetil(e.target.value)}
                  placeholder="Ketik detail keluhan teknis..."
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">PIC Helpdesk Penerima *</label>
                <select
                  value={syncHtsPicId}
                  onChange={(e) => setSyncHtsPicId(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  required
                >
                  {htsMasterData.pics?.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowSyncHtsModal(false)}
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
          </div>
        </div>
      )}

      {/* MODAL TUTUP TIKET */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-[500px] p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Selesaikan Tiket</h2>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Tag Kategori Masalah (Penting untuk Report)</label>
              <p className="text-[11px] text-gray-500 mb-2.5">
                Otomatis tercentang sesuai penugasan Tim L2. Anda dapat menambah atau menyesuaikan jika diperlukan.
              </p>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => {
                  const isAssigned = activeTicket?.categories?.some(tc => (tc.category_id || tc.category?.id) === cat.id);
                  const isChecked = selectedCategories.includes(cat.id);
                  return (
                    <label key={cat.id} className={`inline-flex items-center px-3 py-1.5 rounded-full cursor-pointer transition border text-sm ${
                      isChecked 
                        ? 'bg-blue-50 border-blue-400 text-blue-900 font-medium' 
                        : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
                    }`}>
                      <input 
                        type="checkbox" 
                        className="rounded text-blue-600 focus:ring-blue-500 mr-2"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedCategories([...selectedCategories, cat.id]);
                          else setSelectedCategories(selectedCategories.filter(id => id !== cat.id));
                        }}
                      />
                      <span>{cat.name}</span>
                      {isAssigned && (
                        <span className="text-[9px] bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded font-bold ml-1.5">
                          Penugasan L2
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Kesimpulan Penanganan (Min. 10 karakter)</label>
              <textarea 
                rows="4" 
                value={summaryText}
                onChange={e => setSummaryText(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
              ></textarea>
            </div>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setShowCloseModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">Batal</button>
              <button onClick={handleCloseTicket} disabled={summaryText.trim().length < 10} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors">Tutup Tiket</button>
            </div>
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
                <p className="text-[11px] text-gray-400 mt-1">
                  Nama ini akan tersimpan permanen di database dan muncul pada rekap laporan CSV.
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
