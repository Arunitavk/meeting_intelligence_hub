import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMeeting, getMeetingDecisions, getMeetingActionItems, createChatSession, streamChatMessage, getChatHistory } from '../api/client';
import SentimentTimeline from '../components/SentimentTimeline';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Types ─────────────────────────────────────────────────────────────────
interface Meeting { id: number; title: string; date: string | null; overall_sentiment: number | null; project_id: number | null; }
interface ActionItem { id: number; assignee: string | null; task_description: string; due_date: string | null; status: string; }
interface Decision { id: number; summary: string; rationale: string | null; time_reference: string | null; speakers: string | null; }
interface ChatMsg { role: 'user' | 'assistant'; content: string; citations?: any[]; mode?: string; }

// ─── Status Badge ───────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = (status || '').toLowerCase();
  let cls = 'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ';
  if (s.includes('progress') || s.includes('in progress'))
    cls += 'bg-[#006c49] text-[#69f6b8]';
  else if (s.includes('pending') || s.includes('review'))
    cls += 'bg-[#f8a010] text-[#2a1700]';
  else if (s.includes('complete') || s.includes('completed'))
    cls += 'bg-[#6c9fff] text-[#00214f]';
  else if (s.includes('not started'))
    cls += 'bg-[#262626] text-[#adaaaa]';
  else
    cls += 'bg-[#262626] text-[#adaaaa]';
  return <span className={cls}>{status || 'Unknown'}</span>;
};

// ─── Assignee Avatar ────────────────────────────────────────────────────────
const AssigneeAvatar: React.FC<{ name: string | null }> = ({ name }) => {
  const initials = name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '??';
  const colors = [
    ['#6c9fff', '#00214f'], ['#006c49', '#e1ffec'], ['#f8a010', '#2a1700'],
    ['#262626', '#adaaaa'], ['#85adff', '#002c65'],
  ];
  const idx = (name?.charCodeAt(0) ?? 0) % colors.length;
  const [bg, fg] = colors[idx];
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
      style={{ backgroundColor: bg, color: fg }}>
      {initials}
    </div>
  );
};

// ─── Sidebar ────────────────────────────────────────────────────────────────
const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  return (
    <aside className="hidden md:flex flex-col h-screen py-6 px-4 gap-4 bg-[#1a1919] w-64 fixed left-0 top-0 z-50">
      <div className="px-2 mb-4">
        <h1 className="text-xl font-bold text-white font-manrope">Command Center</h1>
        <p className="text-xs text-[#adaaaa]">Meeting Intelligence</p>
      </div>
      <nav className="flex-1 flex flex-col gap-1">
        <button onClick={() => navigate('/')}
          className="flex items-center gap-3 px-4 py-3 text-[#adaaaa] hover:bg-[#262626] hover:text-[#85adff] rounded-lg transition-all w-full text-left">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>dashboard</span>
          <span className="text-sm font-medium">Dashboard</span>
        </button>
        <button className="flex items-center gap-3 px-4 py-3 text-[#adaaaa] hover:bg-[#262626] hover:text-[#85adff] rounded-lg transition-all w-full text-left">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>auto_awesome</span>
          <span className="text-sm font-medium">AI Assistant</span>
        </button>
        <button onClick={() => navigate('/')}
          className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-[#85adff] bg-[#262626] w-full text-left">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>cloud_upload</span>
          <span className="text-sm font-medium">Uploads</span>
        </button>
        <button className="flex items-center gap-3 px-4 py-3 text-[#adaaaa] hover:bg-[#262626] hover:text-[#85adff] rounded-lg transition-all w-full text-left">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>settings</span>
          <span className="text-sm font-medium">Settings</span>
        </button>
      </nav>
      <div className="mt-auto flex flex-col gap-1 pt-4 border-t border-white/5">
        <button className="flex items-center gap-3 px-4 py-2 text-[#adaaaa] hover:text-[#85adff] transition-all text-left">
          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>help</span>
          <span className="text-xs">Help</span>
        </button>
        <button className="flex items-center gap-3 px-4 py-2 text-[#adaaaa] hover:text-[#85adff] transition-all text-left">
          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>forum</span>
          <span className="text-xs">Feedback</span>
        </button>
      </div>
    </aside>
  );
};

// ─── Chatbot Panel ──────────────────────────────────────────────────────────
const LuminaryChat: React.FC<{ meetingId: number }> = ({ meetingId }) => {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      const storageKey = `chat_session_meeting_${meetingId}`;
      try {
        const existing = localStorage.getItem(storageKey);
        if (existing) {
          setSessionId(existing);
          try {
            const h = await getChatHistory(existing);
            if (h.data?.length > 0) {
              setMessages(h.data.map((m: any) => ({ role: m.role, content: m.content })));
            }
          } catch (e) {
            console.warn("Session in storage but not in DB, recreating...", e);
            localStorage.removeItem(storageKey);
            const res = await createChatSession(undefined, meetingId);
            setSessionId(res.data.session_id);
            localStorage.setItem(storageKey, res.data.session_id);
          }
        } else {
          const res = await createChatSession(undefined, meetingId);
          setSessionId(res.data.session_id);
          localStorage.setItem(storageKey, res.data.session_id);
        }
      } catch (e) { 
        console.error("Critical chat init error:", e); 
      }
    };
    init();
  }, [meetingId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const send = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg) return;
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setLoading(true);
    try {
      let sid = sessionId;
      if (!sid) {
        const res = await createChatSession(undefined, meetingId);
        sid = res.data.session_id;
        setSessionId(sid);
        localStorage.setItem(`chat_session_meeting_${meetingId}`, sid!);
      }

      // Add a placeholder assistant message and track its index
      setMessages(prev => [...prev, { role: 'assistant', content: '', citations: [], mode: 'gemini' }]);

      await streamChatMessage(
        sid!,
        msg,
        (chunk) => {
          setMessages(prev => {
            const next = [...prev];
            const lastIdx = next.length - 1;
            const assistantMsg = { ...next[lastIdx] };
            
            if (chunk.type === 'metadata') {
              assistantMsg.citations = chunk.citations;
              assistantMsg.mode = chunk.mode;
            } else if (chunk.type === 'delta') {
              assistantMsg.content += chunk.text;
            } else if (chunk.type === 'error') {
              assistantMsg.content = `Error: ${chunk.message}`;
              // If session not found, clear it so next send works
              if (chunk.message.includes("Session not found")) {
                localStorage.removeItem(`chat_session_meeting_${meetingId}`);
                setSessionId(null);
              }
            }
            next[lastIdx] = assistantMsg;
            return next;
          });
        },
        undefined,
        [meetingId]
      );
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error.' }]);
    } finally { setLoading(false); }
  };

  const quickPrompts = ['Summarize action items', 'Key decisions list'];

  return (
    <aside id="luminary-ai" className="hidden lg:flex flex-col w-[380px] bg-[#1a1919] border-l border-white/5 h-screen sticky top-0 shrink-0">
      {/* Header */}
      <div className="p-5 flex items-center justify-between border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#85adff,#6c9fff)' }}>
            <span className="material-symbols-outlined text-black text-lg" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>psychology</span>
          </div>
          <h2 className="text-base font-bold font-manrope text-white">Luminary AI</h2>
        </div>
        <span className="text-[9px] bg-[#006c49] text-[#e1ffec] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">v4.2 AI</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5" style={{ scrollbarWidth: 'none' }}>
        {messages.length === 0 && (
          <div className="text-center py-8">
            <span className="material-symbols-outlined text-4xl text-[#adaaaa] block mb-2" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>psychology</span>
            <p className="text-xs text-[#adaaaa]">Ask anything about this meeting</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`space-y-1 ${msg.role === 'user' ? '' : ''}`}>
            {msg.role === 'user' ? (
              <>
                <div className="bg-[#262626] rounded-2xl rounded-tl-none p-4 text-sm text-white leading-relaxed">
                  "{msg.content}"
                </div>
                <div className="text-[10px] text-[#adaaaa] ml-2 font-medium uppercase tracking-wider">Sent by you</div>
              </>
            ) : (
              <>
                <div className="rounded-2xl rounded-tr-none p-4 text-sm text-white leading-relaxed border border-[#85adff]/10 shadow-xl"
                  style={{ background: 'rgba(38,38,38,0.6)', backdropFilter: 'blur(20px)' }}>
                  <p>{msg.content}</p>
                  {msg.mode === 'offline_fallback' && (
                    <span className="mt-2 inline-block text-[9px] bg-yellow-800 text-yellow-200 px-2 py-0.5 rounded-full font-bold uppercase">Offline Fallback</span>
                  )}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/5">
                      <div className="text-[10px] font-bold text-[#adaaaa] uppercase tracking-widest mb-2">Evidence & Citations</div>
                      <div className="flex flex-col gap-2">
                        {msg.citations.map((c, ci) => (
                          <div key={ci} className="flex items-center gap-2 bg-black/30 p-2 rounded-lg">
                            <span className="material-symbols-outlined text-xs text-[#69f6b8]" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>play_circle</span>
                            <span className="text-[11px] font-medium text-[#adaaaa]">
                              {c.timestamp ? `[${c.timestamp}]` : ''} {c.speaker ? `${c.speaker}: ` : ''}{c.text_snippet?.slice(0, 60)}...
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-[#adaaaa] text-right mr-2 font-medium uppercase tracking-wider">Intelligence Engine</div>
              </>
            )}
          </div>
        ))}
        {loading && (
          <div className="rounded-2xl rounded-tr-none p-4 text-sm text-[#adaaaa] border border-[#85adff]/10"
            style={{ background: 'rgba(38,38,38,0.6)', backdropFilter: 'blur(20px)' }}>
            <span className="animate-pulse">Analyzing meeting context...</span>
          </div>
        )}
        {messages.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {quickPrompts.map(p => (
              <button key={p} onClick={() => send(p)}
                className="bg-[#131313] hover:bg-[#262626] transition-colors px-3 py-1.5 rounded-full text-[11px] text-[#85adff] font-medium border border-white/5">
                {p}
              </button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-5 bg-[#131313]/50 border-t border-white/5 shrink-0">
        <div className="relative">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Query meeting context..."
            rows={3}
            className="w-full rounded-xl p-4 pr-12 text-sm text-white placeholder-[#adaaaa] resize-none focus:outline-none focus:ring-1 focus:ring-[#85adff] border-none"
            style={{ background: 'rgba(38,38,38,0.4)' }}
          />
          <button onClick={() => send()}
            className="absolute bottom-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
            style={{ background: 'linear-gradient(135deg,#85adff,#6c9fff)' }}>
            <span className="material-symbols-outlined text-black text-lg" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>arrow_upward</span>
          </button>
        </div>
        <div className="mt-3 flex justify-between items-center px-1">
          <div className="flex gap-3">
            <button className="text-[#adaaaa] hover:text-[#85adff] transition-colors">
              <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>mic</span>
            </button>
            <button className="text-[#adaaaa] hover:text-[#85adff] transition-colors">
              <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>attach_file</span>
            </button>
          </div>
          <span className="text-[10px] text-[#adaaaa]">Enter to send</span>
        </div>
      </div>
    </aside>
  );
};

// ─── Main Page ──────────────────────────────────────────────────────────────
const MeetingDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [tab, setTab] = useState<'actions' | 'decisions' | 'sentiment'>('actions');
  const [filterAssignee, setFilterAssignee] = useState<string>('All Assignees');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    const mid = parseInt(id);
    
    // Reset data states when meeting ID changes to prevent showing old data
    setMeeting(null);
    setDecisions([]);
    setActions([]);
    
    const fetchData = async () => {
      try {
        const [mRes, dRes, aRes] = await Promise.all([
          getMeeting(mid),
          getMeetingDecisions(mid),
          getMeetingActionItems(mid)
        ]);
        setMeeting(mRes.data);
        setDecisions(dRes.data);
        setActions(aRes.data);
        return { decisions: dRes.data.length, actions: aRes.data.length };
      } catch (e) {
        console.error(e);
        return { decisions: 0, actions: 0 };
      }
    };

    fetchData();

    // Polling logic: If data is empty, poll every 3 seconds for 1 minute
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      const counts = await fetchData();
      if ((counts.decisions > 0 || counts.actions > 0) || attempts > 20) {
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [id]);

  // Close export dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const exportCSV = () => {
    if (!meeting) return;
    setExportMenuOpen(false);
    let csv = 'data:text/csv;charset=utf-8,Type,Item,Assignee/Speakers,Date/Time,Status\n';
    actions.forEach(a => { csv += `Action Item,"${a.task_description}","${a.assignee || 'Unassigned'}","${a.due_date || '-'}","${a.status}"\n`; });
    decisions.forEach(d => { csv += `Decision,"${d.summary}","${d.speakers || 'Team'}","${d.time_reference || '-'}","-"\n`; });
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csv));
    link.setAttribute('download', `meeting_${meeting.id}_export.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const exportPDF = () => {
    if (!meeting) return;
    setExportMenuOpen(false);
    const doc = new jsPDF();
    doc.text(`Meeting Intelligence: ${meeting.title}`, 14, 15);
    autoTable(doc, {
      startY: 25,
      head: [['Type', 'Description', 'Assignee', 'Details']],
      body: [
        ...actions.map(a => ['Action Item', a.task_description, a.assignee || 'Unassigned', `Due: ${a.due_date || '-'} | ${a.status}`]),
        ...decisions.map(d => ['Decision', d.summary, d.speakers || 'Team', d.rationale || '-']),
      ],
      theme: 'grid',
      headStyles: { fillColor: [133, 173, 255] },
    });
    doc.save(`meeting_${meeting.id}_export.pdf`);
  };

  if (!meeting) return (
    <div className="flex min-h-screen bg-[#0e0e0e] text-white items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-[#85adff] border-t-transparent animate-spin" />
        <p className="text-[#adaaaa] text-sm">Loading meeting details...</p>
      </div>
    </div>
  );

  const meetingDate = meeting.date ? new Date(meeting.date) : null;
  const assignees = ['All Assignees', ...Array.from(new Set(actions.map(a => a.assignee).filter(Boolean) as string[]))];
  const filteredActions = filterAssignee === 'All Assignees' ? actions : actions.filter(a => a.assignee === filterAssignee);

  return (
    <div className="flex h-screen bg-[#0e0e0e] text-white overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>
      <Sidebar />

      {/* Main area */}
      <main className="flex-1 md:ml-64 flex flex-row h-screen overflow-hidden">
        <div className="flex-1 flex flex-col h-screen overflow-y-auto min-w-0 no-scrollbar">

          {/* Top Nav */}
          <header className="flex justify-between items-center w-full px-8 h-16 bg-[#0e0e0e] sticky top-0 z-40 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-4">
              <span className="text-2xl font-bold text-[#85adff] tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>The Intelligence Hub</span>
              <div className="h-6 w-px bg-white/10 hidden md:block" />
              <div className="hidden md:flex items-center bg-[#1a1919] px-3 py-1.5 rounded-lg gap-2">
                <span className="material-symbols-outlined text-[#adaaaa] text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>search</span>
                <input className="bg-transparent border-none text-sm text-[#adaaaa] focus:outline-none w-48 placeholder-[#adaaaa]" placeholder="Search insights..." />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 text-[#adaaaa] hover:bg-[#262626] hover:text-white rounded-full transition-colors">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>notifications</span>
              </button>
              <button className="p-2 text-[#adaaaa] hover:bg-[#262626] hover:text-white rounded-full transition-colors">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>account_circle</span>
              </button>
            </div>
          </header>

          {/* Content */}
          <div className="p-8 max-w-5xl mx-auto w-full space-y-8 flex-1 flex flex-col">

            {/* Page Header */}
            <section className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-white/5">
              <div className="space-y-3">
                <nav className="flex items-center gap-1 text-xs font-medium text-[#adaaaa] uppercase tracking-wider">
                  <button onClick={() => navigate('/')} className="hover:text-white transition-colors">Projects</button>
                  <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24", fontSize: '12px' }}>chevron_right</span>
                  <span className="text-[#85adff]">{meeting.title.slice(0, 20)}</span>
                </nav>
                <h2 className="text-4xl font-bold text-white tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>{meeting.title}</h2>
                <div className="flex items-center gap-4 text-[#adaaaa]">
                  {meetingDate && (
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>calendar_today</span>
                      <span className="text-sm font-medium">{meetingDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                  )}
                  {meeting.overall_sentiment !== null && (
                    <>
                      <div className="h-4 w-px bg-white/10" />
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>sentiment_satisfied</span>
                        <span className="text-sm font-medium">Sentiment: {meeting.overall_sentiment.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div ref={exportRef} className="relative">
                <button onClick={() => setExportMenuOpen(v => !v)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm text-black hover:opacity-90 transition-opacity"
                  style={{ background: 'linear-gradient(135deg,#85adff,#6c9fff)' }}>
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>download</span>
                  Export to CSV/PDF
                </button>
                {exportMenuOpen && (
                  <div className="absolute right-0 top-12 bg-[#1a1919] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 min-w-[160px]">
                    <button onClick={exportCSV} className="w-full text-left px-4 py-3 text-sm text-white hover:bg-[#262626] transition-colors flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>table_chart</span>
                      Export as CSV
                    </button>
                    <button onClick={exportPDF} className="w-full text-left px-4 py-3 text-sm text-white hover:bg-[#262626] transition-colors flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>picture_as_pdf</span>
                      Export as PDF
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* Tab Navigation */}
            <div className="flex gap-8 border-b border-white/5">
              {(['actions', 'decisions', 'sentiment'] as const).map(t => {
                const labels: Record<string, string> = { actions: 'Action Items', decisions: 'Critical Decisions', sentiment: 'Sentiment Analysis' };
                return (
                  <button key={t} onClick={() => setTab(t)}
                    className={`pb-4 font-medium text-sm transition-all border-b-2 ${tab === t ? 'text-[#85adff] border-[#85adff] font-bold' : 'text-[#adaaaa] border-transparent hover:text-white'}`}>
                    {labels[t]}
                  </button>
                );
              })}
            </div>

            {/* ── Action Items Tab ── */}
            {tab === 'actions' && (
              <div className="space-y-6 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>Action Plans</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#adaaaa]">Filter by:</span>
                    <div className="relative">
                      <select
                        value={filterAssignee}
                        onChange={e => setFilterAssignee(e.target.value)}
                        className="appearance-none bg-[#1a1919] text-xs text-white border border-white/10 rounded-full px-4 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#85adff] pr-8 cursor-pointer">
                        {assignees.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                      <span className="material-symbols-outlined text-[#adaaaa] text-sm absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>expand_more</span>
                    </div>
                  </div>
                </div>

                {filteredActions.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
                    <span className="material-symbols-outlined text-4xl text-[#adaaaa] mb-3" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>task_alt</span>
                    <p className="text-[#adaaaa] text-sm">No action items found for this meeting yet.</p>
                    <p className="text-[#adaaaa]/60 text-xs mt-1">They will appear here once the transcript is processed.</p>
                  </div>
                ) : (
                  <div className="bg-[#1a1919] rounded-xl overflow-hidden border border-white/5">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#201f1f]">
                          <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">Assignee</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">Task Description</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#adaaaa] text-center">Due Date</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#adaaaa] text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredActions.map((act) => (
                          <tr key={act.id} className="hover:bg-[#262626] transition-colors group">
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <AssigneeAvatar name={act.assignee} />
                                <span className="text-sm font-medium text-white">{act.assignee || 'Unassigned'}</span>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <p className="text-sm text-[#e0e0e0] leading-relaxed">{act.task_description}</p>
                            </td>
                            <td className="px-6 py-5 text-center">
                              <span className="text-xs text-[#adaaaa]" style={{ fontFamily: 'Manrope, sans-serif' }}>
                                {act.due_date || '—'}
                              </span>
                            </td>
                            <td className="px-6 py-5 text-right">
                              <StatusBadge status={act.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Decisions Tab ── */}
            {tab === 'decisions' && (
              <div className="space-y-6 flex-1 flex flex-col min-h-0">
                <h3 className="text-xl font-semibold text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>Critical Decisions</h3>
                {decisions.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
                    <span className="material-symbols-outlined text-4xl text-[#adaaaa] mb-3" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>gavel</span>
                    <p className="text-[#adaaaa] text-sm">No decisions extracted yet.</p>
                  </div>
                ) : (
                  <div className="bg-[#1a1919] rounded-xl overflow-hidden border border-white/5">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#201f1f]">
                          <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">Decision Summary</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#adaaaa]">Rationale</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#adaaaa] text-center">Time</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#adaaaa] text-right">Speakers</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {decisions.map((dec) => (
                          <tr key={dec.id} className="hover:bg-[#262626] transition-colors">
                            <td className="px-6 py-5">
                              <p className="text-sm font-semibold text-[#85adff] leading-relaxed">{dec.summary}</p>
                            </td>
                            <td className="px-6 py-5">
                              <p className="text-sm text-[#adaaaa] leading-relaxed">{dec.rationale || '—'}</p>
                            </td>
                            <td className="px-6 py-5 text-center">
                              <span className="text-xs text-[#adaaaa]">{dec.time_reference || '—'}</span>
                            </td>
                            <td className="px-6 py-5 text-right">
                              <span className="px-3 py-1 rounded-full border border-white/10 text-[10px] font-bold text-[#adaaaa] uppercase tracking-wider">
                                {dec.speakers || 'Team'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Sentiment Tab ── */}
            {tab === 'sentiment' && (
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-white mb-6" style={{ fontFamily: 'Manrope, sans-serif' }}>Sentiment & Timeline</h3>
                <SentimentTimeline meetingId={meeting.id} />
              </div>
            )}

            {/* Footer */}
            <footer className="mt-auto pt-8 pb-2 text-center border-t border-white/5">
              <p className="text-xs text-[#adaaaa] font-medium">Powered by The Intelligence Hub • AI Synthesis v4.2.0</p>
            </footer>
          </div>
        </div>

        {/* Right: Luminary AI Chat */}
        <LuminaryChat meetingId={meeting.id} />
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#201f1f] border-t border-white/5 px-6 py-3 flex justify-between items-center z-50">
        {[
          { icon: 'dashboard', label: 'Dashboard', action: () => navigate('/') },
          { icon: 'auto_awesome', label: 'AI', action: () => {} },
          { icon: 'cloud_upload', label: 'Uploads', action: () => navigate('/') },
          { icon: 'settings', label: 'Settings', action: () => {} },
        ].map(item => (
          <button key={item.label} onClick={item.action} className="flex flex-col items-center gap-1 text-[#adaaaa]">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>{item.icon}</span>
            <span className="text-[10px]">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default MeetingDetail;
