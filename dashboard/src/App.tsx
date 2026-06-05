import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createClient } from '@supabase/supabase-js';
import './App.css';

const supabaseUrl = 'https://afgqbqfcdqhsoawqqffr.supabase.co';
const supabaseAnonKey = 'sb_publishable_hwBHA3d2WJBylkrkpU7Xdw_r1As3B-_';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function App() {
  const [waStatus, setWaStatus] = useState({ connected: false, qr: null });
  const [messages, setMessages] = useState([]);
  const [leads, setLeads] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('chats');

  const checkWhatsAppStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/status`);
      const data = await res.json();
      setWaStatus(data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const fetchMessages = async () => {
    try {
      const res = await fetch(`${API_URL}/api/messages`);
      setMessages(await res.json());
    } catch (err) { console.error(err); }
  };

  const handleLogout = async () => {
    if (!window.confirm('Disconnect this WhatsApp number?')) return;
    setUploading(true);
    try {
      await fetch(`${API_URL}/api/whatsapp/logout`, { method: 'POST' });
      setWaStatus({ connected: false, qr: null });
    } catch (err) { alert('Disconnect failed: ' + err.message); }
    finally { setUploading(false); }
  };

  const fetchLeads = async () => {
    try { setLeads(await (await fetch(`${API_URL}/api/leads`)).json()); } catch (err) { console.error(err); }
  };

  const fetchAppointments = async () => {
    try { setAppointments(await (await fetch(`${API_URL}/api/appointments`)).json()); } catch (err) { console.error(err); }
  };

  useEffect(() => {
    checkWhatsAppStatus(); fetchMessages(); fetchLeads(); fetchAppointments();
    const si = setInterval(checkWhatsAppStatus, 5000);
    const hi = setInterval(() => { fetchLeads(); fetchAppointments(); }, 10000);
    const sub = supabase.channel('public:messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => fetchMessages())
      .subscribe();
    return () => { clearInterval(si); clearInterval(hi); supabase.removeChannel(sub); };
  }, []);

  const groupedMessages = messages.reduce((acc, msg) => {
    if (!acc[msg.phone_number]) acc[msg.phone_number] = [];
    acc[msg.phone_number].push(msg);
    return acc;
  }, {});

  const totalConversations = Object.keys(groupedMessages).length;
  const totalMessages = messages.length;

  const tabConfig = {
    chats: { icon: '💬', label: 'Live Chats', badge: totalConversations },
    leads: { icon: '👥', label: 'Leads CRM', badge: leads.length },
    appointments: { icon: '📅', label: 'Appointments', badge: appointments.length },
    connection: { icon: '🔗', label: 'WhatsApp', badge: null },
  };

  const pageTitle = {
    chats: ['Live Conversations', 'Real-time WhatsApp messages powered by AI'],
    leads: ['Leads CRM', 'Qualified prospects from Airtable'],
    appointments: ['Appointments', 'Scheduled consultations from Calendly'],
    connection: ['WhatsApp Connection', 'Manage your connected WhatsApp number'],
  };

  return (
    <div className="saas-layout">
      {/* ===== SIDEBAR ===== */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">S</div>
          <div className="brand-text">
            <div className="brand-name">Sanad AI</div>
            <div className="brand-label">Command Center</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Main</div>
          {Object.entries(tabConfig).map(([key, { icon, label, badge }]) => (
            <button
              key={key}
              className={`nav-item ${activeTab === key ? 'active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              <span className="nav-icon">{icon}</span>
              {label}
              {badge > 0 && <span className="nav-badge">{badge}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-status">
          <div className="status-card">
            <div className={`status-dot ${waStatus.connected ? 'online' : 'offline'}`}></div>
            <div className="status-text">
              {waStatus.connected ? 'WhatsApp Online' : 'WhatsApp Offline'}
              <span>{waStatus.connected ? 'Bot is active' : 'Scan QR to connect'}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ===== MAIN ===== */}
      <main className="main-content">
        <div className="topbar">
          <div>
            <div className="topbar-title">{pageTitle[activeTab][0]}</div>
            <div className="topbar-subtitle">{pageTitle[activeTab][1]}</div>
          </div>
          <div className="topbar-actions">
            {activeTab === 'connection' && waStatus.connected && (
              <button className="btn btn-danger" onClick={handleLogout} disabled={uploading}>
                {uploading ? 'Disconnecting...' : '⛔ Disconnect'}
              </button>
            )}
          </div>
        </div>

        <div className="page-content">
          {/* STATS */}
          {activeTab === 'chats' && (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Conversations</div>
                <div className="stat-value">{totalConversations}</div>
                <div className="stat-change positive">Active threads</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Messages</div>
                <div className="stat-value">{totalMessages}</div>
                <div className="stat-change neutral">All time</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Leads Captured</div>
                <div className="stat-value">{leads.length}</div>
                <div className="stat-change positive">From Airtable</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Appointments</div>
                <div className="stat-value">{appointments.length}</div>
                <div className="stat-change positive">From Calendly</div>
              </div>
            </div>
          )}

          {/* ===== CHATS ===== */}
          {activeTab === 'chats' && (
            <div className="content-card">
              <div className="card-header">
                <h3>Recent Threads</h3>
                <span style={{fontSize:12,color:'#94a3b8'}}>{totalConversations} conversations</span>
              </div>
              <div className="card-body">
                {totalConversations === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">💬</div>
                    <h4>No conversations yet</h4>
                    <p>Send a message to your bot to get started</p>
                  </div>
                ) : (
                  <div className="chat-list">
                    {Object.entries(groupedMessages).map(([phone, userMessages]) => (
                      <div key={phone} className="chat-thread">
                        <div className="chat-thread-header">
                          <div style={{display:'flex',alignItems:'center',gap:12}}>
                            <span className="chat-phone">📱 {phone.replace('@c.us','').replace('@lid','')}</span>
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={async () => {
                                await fetch(`${API_URL}/api/quick-action`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ phone, action: 'booking' })
                                });
                                fetchMessages();
                              }}
                            >📅 Send Booking</button>
                          </div>
                          <span style={{fontSize:11,color:'#94a3b8',background:'#f1f5f9',padding:'3px 8px',borderRadius:6}}>{userMessages.length} msgs</span>
                        </div>
                        <div className="chat-msgs-area">
                          {userMessages.map((msg) => (
                            <div key={msg.id} className={`msg-bubble ${msg.direction === 'outgoing' ? 'outgoing' : 'incoming'}`}>
                              {msg.content}
                              <div className="msg-meta">
                                <span className="msg-time">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                {msg.intent && msg.intent !== 'GENERAL' && (
                                  <span className={`intent-badge ${msg.intent === 'BOOKING' ? 'booking' : msg.intent === 'LEAD_QUALIFIED' ? 'lead' : 'portfolio'}`}>
                                    {msg.intent.replace('_', ' ')}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== LEADS ===== */}
          {activeTab === 'leads' && (
            <div className="content-card">
              <div className="card-header">
                <h3>Qualified Leads</h3>
                <span style={{fontSize:12,color:'#94a3b8'}}>Synced from Airtable</span>
              </div>
              {leads.length === 0 ? (
                <div className="card-body">
                  <div className="empty-state">
                    <div className="empty-icon">👥</div>
                    <h4>No leads yet</h4>
                    <p>The AI bot qualifies leads automatically during conversations</p>
                  </div>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Phone</th><th>Industry</th><th>Bottleneck</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead, idx) => (
                      <tr key={idx}>
                        <td style={{fontWeight:600,color:'#0f172a'}}>{lead.name}</td>
                        <td>{lead.phone}</td>
                        <td>{lead.industry}</td>
                        <td>{lead.bottleneck}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ===== APPOINTMENTS ===== */}
          {activeTab === 'appointments' && (
            <div className="content-card">
              <div className="card-header">
                <h3>Scheduled Meetings</h3>
                <span style={{fontSize:12,color:'#94a3b8'}}>Synced from Calendly</span>
              </div>
              <div className="card-body">
                {appointments.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📅</div>
                    <h4>No upcoming appointments</h4>
                    <p>Appointments appear here when clients book via Calendly</p>
                  </div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:12}}>
                    {appointments.map((apt, idx) => (
                      <div key={idx} className="appointment-card">
                        <div>
                          <div style={{fontWeight:700,color:'#0f172a'}}>{apt.name}</div>
                          <div style={{fontSize:13,color:'#64748b',marginTop:2}}>With: {apt.guest_name} ({apt.guest_email})</div>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <div style={{background:'#dbeafe',color:'#1e40af',fontSize:12,fontWeight:600,padding:'4px 10px',borderRadius:8,marginBottom:4}}>
                            {new Date(apt.start_time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                          </div>
                          <div style={{fontSize:11,color:'#64748b',fontWeight:600,textTransform:'uppercase'}}>{apt.status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== CONNECTION ===== */}
          {activeTab === 'connection' && (
            <div className="content-card">
              <div className="card-header">
                <h3>WhatsApp Connection</h3>
              </div>
              <div className="card-body">
                {loading ? (
                  <div className="empty-state"><p>Checking connection...</p></div>
                ) : waStatus.connected ? (
                  <div style={{display:'flex',flexDirection:'column',gap:16}}>
                    <div className="connected-banner">
                      <div className="dot"></div>
                      <div>
                        <div style={{fontWeight:700,color:'#166534',fontSize:16}}>WhatsApp Connected</div>
                        <div style={{fontSize:13,color:'#15803d'}}>Bot is active and responding to messages</div>
                      </div>
                    </div>
                    <button className="btn btn-danger" onClick={handleLogout} disabled={uploading} style={{alignSelf:'flex-start'}}>
                      {uploading ? 'Disconnecting...' : '⛔ Disconnect Number'}
                    </button>
                  </div>
                ) : waStatus.qr ? (
                  <div className="qr-container">
                    <div style={{fontSize:16,fontWeight:600,color:'#1e293b'}}>Scan QR Code to Connect</div>
                    <p style={{fontSize:13,color:'#64748b',marginBottom:8}}>Open WhatsApp → Settings → Linked Devices → Link a Device</p>
                    <div className="qr-wrapper">
                      <QRCodeSVG value={waStatus.qr} size={256} />
                    </div>
                    <button className="btn btn-ghost" onClick={checkWhatsAppStatus}>🔄 Refresh</button>
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">⏳</div>
                    <h4>Starting WhatsApp Engine...</h4>
                    <p>Please wait a moment</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
