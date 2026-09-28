import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Search, Send, User, Clock, Phone, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

const socket = io(SOCKET_URL);

function App() {
  const [tickets, setTickets] = useState([]);
  const [activeTicket, setActiveTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  
  // State untuk Fase 4 (Penutupan & Divisi)
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [divisions, setDivisions] = useState([]);
  const [selectedDivisions, setSelectedDivisions] = useState([]);

  const messagesEndRef = useRef(null);

  // Load antrean tiket aktif
  const loadTickets = async () => {
    try {
      const res = await axios.get(`${API_URL}/chat/tickets`);
      setTickets(res.data);
    } catch (error) {
      console.error('Failed to load tickets', error);
    }
  };

  // Load pesan untuk tiket yang dipilih
  const loadMessages = async (ticketId) => {
    try {
      const res = await axios.get(`${API_URL}/chat/tickets/${ticketId}/messages`);
      setMessages(res.data);
    } catch (error) {
      console.error('Failed to load messages', error);
    }
  };

  // Load divisi untuk tagging
  const loadDivisions = async () => {
    try {
      const res = await axios.get(`${API_URL}/chat/divisions`);
      setDivisions(res.data);
    } catch (error) {
      console.error('Failed to load divisions', error);
    }
  };

  useEffect(() => {
    loadTickets();
    loadDivisions();

    // Listener realtime dari Socket.io
    socket.on('new_message', (data) => {
      // Refresh antrean agar cuplikan pesan terakhir terupdate
      loadTickets();

      // Jika pesan yang masuk adalah untuk tiket yang sedang kita buka
      setMessages((prev) => {
        if (activeTicket && data.ticketId === activeTicket.id) {
          return [...prev, {
            id: Date.now(), // ID sementara untuk UI render
            sender_type: data.senderType || 'CUSTOMER',
            message_text: data.text,
            created_at: data.createdAt || new Date().toISOString()
          }];
        }
        return prev;
      });
    });

    socket.on('ticket_closed', (data) => {
      loadTickets(); // Refresh antrean untuk menghilangkan tiket yg closed
      if (activeTicket && data.ticketId === activeTicket.id) {
        setActiveTicket(null); // Tutup obrolan jika tiket ini yang diclose
        alert('Tiket ini baru saja diselesaikan oleh agen lain.');
      }
    });

    return () => {
      socket.off('new_message');
      socket.off('ticket_closed');
    };
  }, [activeTicket]); // Dependensi activeTicket agar state di dalam event tidak stale

  // Setiap tiket pindah, fetch riwayat pesannya
  useEffect(() => {
    if (activeTicket) {
      loadMessages(activeTicket.id);
    }
  }, [activeTicket]);

  // Auto-scroll ke pesan paling bawah
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !activeTicket) return;

    const textToSend = replyText;
    setReplyText(''); // Kosongkan input agar user bisa ngetik lagi

    try {
      await axios.post(`${API_URL}/chat/send`, {
        ticketId: activeTicket.id,
        text: textToSend
      });
      // Tidak perlu nambahin ke state messages secara manual, 
      // karena socket.io akan menangkap eventnya dan menambahkannya untuk kita!
    } catch (error) {
      console.error('Failed to send message', error);
      alert('Gagal mengirim pesan');
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
        divisionIds: selectedDivisions
      });
      
      // Reset Modal & State
      setShowCloseModal(false);
      setSummaryText('');
      setSelectedDivisions([]);
      setActiveTicket(null);
      loadTickets();
    } catch (error) {
      console.error('Failed to close ticket', error);
      alert('Gagal menutup tiket');
    }
  };


  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      
      {/* PANEL KIRI: Daftar Tiket / Antrean */}
      <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-800">Antrean Aduan</h1>
          <div className="mt-2 relative">
            <input 
              type="text" 
              placeholder="Cari pelapor..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {tickets.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm mt-4">Tidak ada aduan masuk</div>
          )}
          {tickets.map(ticket => {
            const lastMsg = ticket.messages?.[0];
            return (
              <div 
                key={ticket.id} 
                onClick={() => setActiveTicket(ticket)}
                className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${activeTicket?.id === ticket.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-semibold text-gray-800 truncate">{ticket.customer.name}</h3>
                  <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                    {ticket.created_at ? format(new Date(ticket.created_at), 'HH:mm') : ''}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <p className="text-gray-500 truncate pr-4 text-xs">
                    {lastMsg ? lastMsg.message_text : 'Belum ada pesan'}
                  </p>
                  {ticket.status === 'OPEN' && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">OPEN</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* PANEL TENGAH: Chat Room */}
      <div className="w-1/2 flex flex-col bg-slate-50">
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
              <button 
                onClick={() => setShowCloseModal(true)}
                className="px-3 py-1.5 bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-700 text-sm rounded-lg transition-colors font-medium"
              >
                Selesaikan
              </button>
            </div>

            {/* Bubble Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, idx) => {
                const isCustomer = msg.sender_type === 'CUSTOMER';
                // Jika dari bot, kita beri warna agak beda sedikit
                const isBot = msg.sender_type === 'BOT'; 

                return (
                  <div key={idx} className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}>
                    <div 
                      className={`max-w-[70%] rounded-lg p-3 shadow-sm ${
                        isCustomer 
                          ? 'bg-white border border-gray-200 text-gray-800' 
                          : isBot 
                            ? 'bg-slate-700 text-white' 
                            : 'bg-blue-600 text-white'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.message_text}</p>
                      <span className={`text-[10px] mt-1 block text-right ${isCustomer ? 'text-gray-400' : 'text-blue-200'}`}>
                        {format(new Date(msg.created_at), 'HH:mm')} 
                        {isBot && ' (Auto-Reply)'}
                      </span>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Kotak Ketik Balasan */}
            <div className="p-4 bg-white border-t border-gray-200">
              <form onSubmit={handleSend} className="flex items-center space-x-2">
                <input 
                  type="text" 
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Ketik balasan pesan ke pelapor..." 
                  className="flex-1 py-2.5 px-4 border border-gray-300 rounded-full focus:outline-none focus:border-blue-500 bg-gray-50 text-sm"
                />
                <button 
                  type="submit" 
                  disabled={!replyText.trim()}
                  className="p-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Phone className="w-12 h-12 text-gray-300" />
            </div>
            <p className="text-lg font-medium text-gray-500">Pilih salah satu chat untuk mulai membalas</p>
          </div>
        )}
      </div>

      {/* PANEL KANAN: Informasi Pelanggan / Detail Tiket */}
      <div className="w-1/6 bg-white border-l border-gray-200 p-4">
        <h3 className="font-bold text-gray-800 mb-4 border-b pb-2">Detail Tiket</h3>
        {activeTicket ? (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Nama Pelapor</label>
              <div className="flex items-center text-sm font-medium text-gray-800">
                <User className="w-4 h-4 mr-2 text-gray-400" />
                {activeTicket.customer.name}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Nomor WA</label>
              <div className="flex items-center text-sm text-gray-800">
                <Phone className="w-4 h-4 mr-2 text-gray-400" />
                +{activeTicket.customer.wa_number}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Waktu Masuk</label>
              <div className="flex items-center text-sm text-gray-800">
                <Clock className="w-4 h-4 mr-2 text-gray-400" />
                {format(new Date(activeTicket.created_at), 'dd MMM yyyy, HH:mm')}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Status</label>
              <div className="flex items-center text-sm text-gray-800 mt-1">
                <AlertCircle className="w-4 h-4 mr-2 text-green-500" />
                <span className="bg-green-100 text-green-700 px-2.5 py-0.5 rounded text-xs font-bold">
                  {activeTicket.status}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-center text-gray-400 mt-10">
            Pilih tiket untuk melihat detail
          </div>
        )}
      </div>

      {/* Modal Penutupan Tiket (Fase 4) */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-[500px] p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Selesaikan Tiket</h2>
            <p className="text-sm text-gray-600 mb-4">
              Silakan isi kesimpulan penanganan (wajib) dan tag divisi terkait untuk keperluan pelaporan.
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Tag Divisi Terkait (Opsional)</label>
              <div className="flex flex-wrap gap-2">
                {divisions.map(div => (
                  <label key={div.id} className="inline-flex items-center bg-gray-100 px-3 py-1.5 rounded-full cursor-pointer hover:bg-gray-200">
                    <input 
                      type="checkbox" 
                      className="rounded text-blue-600 focus:ring-blue-500 mr-2"
                      checked={selectedDivisions.includes(div.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedDivisions([...selectedDivisions, div.id]);
                        else setSelectedDivisions(selectedDivisions.filter(id => id !== div.id));
                      }}
                    />
                    <span className="text-sm text-gray-700">{div.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Kesimpulan & Tindakan (Min. 10 karakter)</label>
              <textarea 
                rows="4" 
                value={summaryText}
                onChange={e => setSummaryText(e.target.value)}
                placeholder="Jelaskan tindakan yang telah diambil untuk menyelesaikan masalah ini..."
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              ></textarea>
            </div>

            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setShowCloseModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
              >
                Batal
              </button>
              <button 
                onClick={handleCloseTicket}
                disabled={summaryText.trim().length < 10}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
              >
                Tutup Tiket
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
