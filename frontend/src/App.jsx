import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Search, Send, User, Clock, Phone, AlertCircle, MessageSquare, FileText, Download, Lock, LogOut, Paperclip, CheckCircle, Users } from 'lucide-react';
import { format } from 'date-fns';

const BASE_URL = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : 'http://localhost:3000';
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
  const [selectedFile, setSelectedFile] = useState(null);
  
  // State Close Ticket & Categories
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [categories, setCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [assignCategoryId, setAssignCategoryId] = useState('');

  // State Reporting
  const [reportTickets, setReportTickets] = useState([]);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleAssignTicket = async () => {
    if (!assignCategoryId) return alert('Pilih kategori L2 terlebih dahulu');
    try {
      await axios.post(`${API_URL}/chat/tickets/${activeTicket.id}/assign`, {
        categoryId: assignCategoryId
      });
      setShowAssignModal(false);
      setAssignCategoryId('');
      alert('Tiket berhasil di-assign. Notifikasi WA otomatis dikirim ke Teknisi L2.');
      loadTickets();
    } catch (error) {
      alert(error.response?.data?.error || 'Gagal meng-assign tiket');
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

  useEffect(() => {
    if (!currentUser) return;

    loadTickets();
    loadCategories();

    socket.on('new_message', (data) => {
      loadTickets();
      setMessages((prev) => {
        if (activeTicket && data.ticketId === activeTicket.id) {
          return [...prev, {
            id: Date.now(),
            sender_type: data.senderType || 'CUSTOMER',
            message_text: data.text,
            attachment_url: data.attachmentUrl, // Fase 3
            is_internal: data.isInternal || false, // Fase 1 V2
            created_at: data.createdAt || new Date().toISOString()
          }];
        }
        return prev;
      });
    });

    socket.on('ticket_closed', (data) => {
      loadTickets(); 
      if (currentTab === 'report') loadReports();
      
      if (activeTicket && data.ticketId === activeTicket.id) {
        setActiveTicket(null);
        alert('Tiket ini baru saja diupdate statusnya.');
      }
    });

    return () => {
      socket.off('new_message');
      socket.off('ticket_closed');
    };
  }, [activeTicket, currentTab, currentUser]); 

  useEffect(() => {
    if (activeTicket) loadMessages(activeTicket.id);
  }, [activeTicket]);

  useEffect(() => {
    if (currentTab === 'report') loadReports();
  }, [currentTab]);

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

  // L2 menandai selesai
  const handleMarkResolved = async () => {
    if(window.confirm('Tandai pekerjaan ini telah selesai? Tiket akan dikembalikan ke L1.')){
      // Simulasi API call (Di Fase 6 akan dibuat detailnya)
      alert('Tiket ditandai selesai! Menunggu penutupan resmi oleh L1.');
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
    const headers = ['ID Tiket', 'Nama Pelapor', 'Nomor WA', 'Status', 'Waktu Masuk', 'Waktu Selesai', 'Durasi', 'Divisi Terkait', 'Kesimpulan'];
    const csvRows = [headers.join(',')];
    reportTickets.forEach(ticket => {
      const row = [
        ticket.id, `"${ticket.customerName}"`, `"${ticket.waNumber}"`, ticket.status,
        `"${format(new Date(ticket.createdAt), 'yyyy-MM-dd HH:mm:ss')}"`,
        ticket.closedAt ? `"${format(new Date(ticket.closedAt), 'yyyy-MM-dd HH:mm:ss')}"` : '-',
        `"${ticket.duration}"`, `"${ticket.categories}"`, `"${ticket.summary.replace(/"/g, '""')}"`
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

  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'ADMIN';
  const isL1 = isAdmin || currentUser.role === 'L1' || currentUser.role === 'SPV';
  const isL2 = isAdmin || currentUser.role === 'L2';

  // --- STATE ADMIN ---
  const [adminUsers, setAdminUsers] = useState([]);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'L1', category_id: '' });

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

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Yakin hapus user ini?')) return;
    try {
      await axios.delete(`${API_URL}/admin/users/${id}`);
      loadAdminUsers();
    } catch (error) {
      alert(error.response?.data?.error || 'Gagal menghapus user');
    }
  };

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
                      <h3 className="font-semibold text-gray-800 truncate">{ticket.customer.name}</h3>
                      <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                        {ticket.created_at ? format(new Date(ticket.created_at), 'HH:mm') : ''}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <p className="text-gray-500 truncate pr-4 text-xs">
                        {lastMsg ? (lastMsg.attachment_url ? '[Gambar]' : lastMsg.message_text) : 'Belum ada pesan'}
                      </p>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${ticket.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
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
                      {activeTicket.customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-800">{activeTicket.customer.name}</h2>
                      <p className="text-xs text-gray-500">+{activeTicket.customer.wa_number}</p>
                    </div>
                  </div>
                  
                  {/* RBAC: L1 bisa Tutup, L2 bisa Tandai Selesai */}
                  {isL1 && (
                    <div className="flex space-x-2">
                      <button onClick={() => setShowAssignModal(true)} className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm rounded-lg font-medium transition">
                        Assign ke L2
                      </button>
                      <button onClick={() => setShowCloseModal(true)} className="px-3 py-1.5 bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-700 text-sm rounded-lg font-medium transition">
                        Selesaikan
                      </button>
                    </div>
                  )}
                  {isL2 && (
                    <button onClick={handleMarkResolved} className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg font-medium transition flex items-center">
                      <CheckCircle className="w-4 h-4 mr-1"/> Tandai Selesai
                    </button>
                  )}
                </div>

                {/* Bubble Chat Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((msg, idx) => {
                    const isCustomer = msg.sender_type === 'CUSTOMER';
                    const isBot = msg.sender_type === 'BOT'; 
                    // Fase 1 V2: Highlight jika ini internal note
                    if(msg.is_internal) {
                      return (
                        <div key={idx} className="flex justify-center my-4">
                          <div className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-lg text-sm max-w-[80%] border border-yellow-200 shadow-sm text-center">
                            <span className="font-bold text-xs block mb-1">Catatan Internal L2</span>
                            {msg.message_text}
                          </div>
                        </div>
                      )
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
                  <div className="p-4 bg-white border-t border-gray-200 flex items-center">
                    <form onSubmit={handleSend} className="flex items-center space-x-2 w-full">
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors relative">
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
                        placeholder={selectedFile ? `Kirim gambar ${selectedFile.name}...` : "Ketik balasan ke pelapor..."}
                        className="flex-1 py-2.5 px-4 border border-gray-300 rounded-full focus:outline-none focus:border-blue-500 bg-gray-50 text-sm"
                      />
                      <button type="submit" disabled={!replyText.trim() && !selectedFile} className="p-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md">
                        <Send className="w-5 h-5" />
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="p-4 bg-yellow-50 border-t border-yellow-200 flex flex-col">
                    <label className="text-xs font-bold text-yellow-800 mb-1">Catatan Internal (Hanya dibaca L1)</label>
                    <div className="flex items-center space-x-2 w-full">
                      <input 
                        type="text" 
                        placeholder="Ketik progres pengerjaan lapangan..."
                        className="flex-1 py-2.5 px-4 border border-yellow-300 rounded-full focus:outline-none focus:border-yellow-500 bg-white text-sm"
                      />
                      <button className="px-4 py-2.5 bg-yellow-600 text-white rounded-full hover:bg-yellow-700 transition-colors shadow-sm text-sm font-semibold">
                        Simpan Catatan
                      </button>
                    </div>
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
                   <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold truncate max-w-[100px]">{currentUser.category}</span>
                )}
              </div>
            </div>

            {activeTicket && (
              <>
                <h3 className="font-bold text-gray-800 mb-4 border-b pb-2">Detail Tiket</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Nama Pelapor</label>
                    <div className="flex items-center text-sm font-medium text-gray-800"><User className="w-4 h-4 mr-2 text-gray-400" />{activeTicket.customer.name}</div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Nomor WA</label>
                    <div className="flex items-center text-sm text-gray-800"><Phone className="w-4 h-4 mr-2 text-gray-400" />+{activeTicket.customer.wa_number}</div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Waktu Masuk</label>
                    <div className="flex items-center text-sm text-gray-800"><Clock className="w-4 h-4 mr-2 text-gray-400" />{format(new Date(activeTicket.created_at), 'dd MMM yyyy, HH:mm')}</div>
                  </div>
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
            <button onClick={exportToCSV} className="flex items-center bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors">
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </button>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 overflow-hidden flex flex-col">
             <div className="overflow-x-auto p-4">... Area Tabel Rekap (Data disembunyikan untuk ringkas) ...</div>
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
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => handleDeleteUser(user.id)} className="text-red-600 hover:text-red-800 font-medium">Hapus</button>
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

      {/* MODAL ASSIGN L2 */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-[400px] p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-2">Assign ke Teknisi L2</h2>
            <p className="text-sm text-gray-500 mb-4">Tiket ini akan dilempar ke antrean L2 dan sistem akan mengirim notifikasi WhatsApp ke tim terkait.</p>
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Pilih Kategori Masalah</label>
              <select 
                value={assignCategoryId} 
                onChange={e => setAssignCategoryId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">-- Pilih Kategori --</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setShowAssignModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">Batal</button>
              <button onClick={handleAssignTicket} disabled={!assignCategoryId} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors">Tugaskan L2</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TUTUP TIKET */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-[500px] p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Selesaikan Tiket</h2>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Tag Kategori Masalah (Penting untuk Report)</label>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <label key={cat.id} className="inline-flex items-center bg-gray-100 px-3 py-1.5 rounded-full cursor-pointer hover:bg-gray-200">
                    <input 
                      type="checkbox" 
                      className="rounded text-blue-600 focus:ring-blue-500 mr-2"
                      checked={selectedCategories.includes(cat.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedCategories([...selectedCategories, cat.id]);
                        else setSelectedCategories(selectedCategories.filter(id => id !== cat.id));
                      }}
                    />
                    <span className="text-sm text-gray-700">{cat.name}</span>
                  </label>
                ))}
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
