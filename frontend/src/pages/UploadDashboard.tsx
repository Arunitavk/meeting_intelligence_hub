import React, { useState, useRef, useEffect } from 'react';
import { uploadTranscripts, createChatSession, streamChatMessage, apiClient, getMeetings } from '../api/client';
import { useNavigate } from 'react-router-dom';

type FileStatus = 'Ready' | 'Format Error' | 'Processing';

interface UploadedFile {
  name: string;
  progress: number;
  status: FileStatus;
  meeting_id?: number;
}

interface ChatMessage {
  role: 'assistant' | 'user' | 'bot'; // Added 'assistant' to match backend role names
  text: string;
  time: string;
}

const UploadDashboard: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const [dragActive, setDragActive] = useState(false);
  const [recentFiles, setRecentFiles] = useState<UploadedFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'bot', text: 'System initialized. I have indexed your recent meeting uploads. How can I assist you with your intelligence mapping today?', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const initSession = async () => {
      try {
        const res = await createChatSession();
        const sid = res.data.session_id;
        setSessionId(sid);
        
        // Fetch existing history for this session if any (for persistence)
        const historyRes = await apiClient.get(`/chat/session/${sid}/history`);
        if (historyRes.data && historyRes.data.length > 0) {
          const formattedHistory = historyRes.data.map((m: any) => ({
            role: m.role,
            text: m.content,
            time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }));
          setChatMessages(formattedHistory);
        }
      } catch (err) {
        console.error('Failed to init chat session', err);
      }
    };
    const loadHistoryFiles = async () => {
      try {
        const meetingsRes = await getMeetings();
        if (meetingsRes.data && meetingsRes.data.length > 0) {
          // Use a map to keep only the latest (highest ID or later in list) meeting per unique title
          const dedupedMap = new Map<string, UploadedFile>();
          meetingsRes.data.forEach((m: any) => {
            const key = m.title.toLowerCase();
            // If already seen, we can replace if this one is newer (ID is usually incrementing)
            if (!dedupedMap.has(key) || m.id > (dedupedMap.get(key)?.meeting_id || 0)) {
               dedupedMap.set(key, {
                 name: m.title,
                 progress: 100,
                 status: 'Ready' as FileStatus,
                 meeting_id: m.id
               });
            }
          });
          setRecentFiles(Array.from(dedupedMap.values()));
        }
      } catch (err) {
        console.error('Failed to load past meetings', err);
      }
    };
    initSession();
    loadHistoryFiles();
  }, []);
  const [highlightAI, setHighlightAI] = useState(false);
  const triggerHighlightAI = () => {
    setHighlightAI(true);
    document.getElementById('luminary-ai')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setHighlightAI(false), 2000);
  };
  const scrollToUploads = () => {
    document.getElementById('recently-uploaded')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
  };

  const processFiles = async (files: File[]) => {
    const validFiles = files.filter(f => {
      const lowerReq = f.name.toLowerCase();
      return lowerReq.endsWith('.txt') || lowerReq.endsWith('.vtt') || lowerReq.endsWith('.pdf');
    });
    const invalidFiles = files.filter(f => !validFiles.includes(f));

    // For each file: if it's already in the list, UPDATE it in-place (set to Processing).
    // Only prepend genuinely new files. This prevents a second entry appearing.
    setRecentFiles(prev => {
      const existingNames = new Set(prev.map(f => f.name.toLowerCase()));

      // Update existing entries for valid files to Processing
      const updated = prev.map(fp => {
        if (validFiles.some(vf => vf.name.toLowerCase() === fp.name.toLowerCase())) {
          return { ...fp, progress: 0, status: 'Processing' as FileStatus, meeting_id: undefined };
        }
        if (invalidFiles.some(iv => iv.name.toLowerCase() === fp.name.toLowerCase())) {
          return { ...fp, progress: 100, status: 'Format Error' as FileStatus };
        }
        return fp;
      });

      // Prepend files that are brand new (not already in list)
      const newValid = validFiles
        .filter(f => !existingNames.has(f.name.toLowerCase()))
        .map(f => ({ name: f.name, progress: 0, status: 'Processing' as FileStatus }));
      const newInvalid = invalidFiles
        .filter(f => !existingNames.has(f.name.toLowerCase()))
        .map(f => ({ name: f.name, progress: 100, status: 'Format Error' as FileStatus }));

      return [...newValid, ...newInvalid, ...updated];
    });

    if (validFiles.length > 0) {
      try {
        const res = await uploadTranscripts(validFiles, undefined, 'Dashboard Uploads');
        const serverUploads: Array<{ filename: string; status: string; meeting_id?: number }> = res.data.uploads || [];

        // Update each matched entry in-place — never add new rows
        setRecentFiles(prev =>
          prev.map(fp => {
            const match = serverUploads.find(u => u.filename.toLowerCase() === fp.name.toLowerCase());
            if (match) {
              return {
                ...fp,
                progress: 100,
                status: (match.status === 'error' ? 'Format Error' : 'Ready') as FileStatus,
                meeting_id: match.meeting_id
              };
            }
            return fp;
          })
        );
      } catch (err) {
        console.error('Upload failed', err);
        setRecentFiles(prev => prev.map(fp => {
          if (validFiles.some(vf => vf.name.toLowerCase() === fp.name.toLowerCase()) && fp.status === 'Processing') {
            return { ...fp, progress: 0, status: 'Format Error' };
          }
          return fp;
        }));
      }
    }
  };

  const handleChatSend = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setChatMessages(prev => [...prev, { role: 'user', text: userMsg, time: timeNow }]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        const sessionRes = await createChatSession();
        currentSessionId = sessionRes.data.session_id;
        setSessionId(currentSessionId);
      }

      const assistantMessageIndex = chatMessages.length + 1;
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        text: '',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);

      await streamChatMessage(
        currentSessionId!,
        userMsg,
        (chunk) => {
          setChatMessages(prev => {
            const next = [...prev];
            const msg = { ...next[assistantMessageIndex] };
            if (chunk.type === 'delta') {
              msg.text += chunk.text;
            } else if (chunk.type === 'error') {
              msg.text = `Error: ${chunk.message}`;
            }
            next[assistantMessageIndex] = msg;
            return next;
          });
        }
      );
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, {
        role: 'bot',
        text: 'Error connecting to Luminary AI.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#0e0e0e] font-body text-white font-[Inter] overflow-hidden">
      {/* SideNavBar */}
      <aside className="hidden md:flex flex-col h-screen py-6 px-4 gap-4 bg-[#1a1919] w-64 border-r border-[#ffffff0a] shrink-0">
        <div className="flex flex-col gap-1 px-2 mb-6">
          <h1 className="text-xl font-bold tracking-tight">Command Center</h1>
          <p className="text-[10px] text-[#adaaaa] uppercase tracking-widest font-bold">Meeting Intelligence</p>
        </div>
        <nav className="flex flex-col gap-1">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-3 px-4 py-3 text-[#85adff] bg-[#262626] rounded-lg transition-all duration-300 ease-in-out text-sm font-medium w-full text-left">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>dashboard</span>
            Dashboard
          </button>
          <button onClick={triggerHighlightAI} className="flex items-center gap-3 px-4 py-3 text-[#adaaaa] hover:bg-[#262626] hover:text-[#85adff] transition-all duration-300 ease-in-out text-sm font-medium w-full text-left">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>smart_toy</span>
            AI Assistant
          </button>
          <button onClick={scrollToUploads} className="flex items-center gap-3 px-4 py-3 text-[#adaaaa] hover:bg-[#262626] hover:text-[#85adff] transition-all duration-300 ease-in-out text-sm font-medium w-full text-left">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>cloud_upload</span>
            Uploads
          </button>
          <a className="flex items-center gap-3 px-4 py-3 text-[#adaaaa] hover:bg-[#262626] hover:text-[#85adff] transition-all duration-300 ease-in-out text-sm font-medium w-full text-left" href="#">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>settings</span>
            Settings
          </a>
        </nav>
        <div className="mt-auto pt-6 flex flex-col gap-1">
          <a className="flex items-center gap-3 px-4 py-2 text-[#adaaaa] hover:bg-[#262626] hover:text-[#85adff] transition-all duration-300 ease-in-out text-sm font-medium w-full text-left" href="#">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>help</span>
            Help
          </a>
          <a className="flex items-center gap-3 px-4 py-2 text-[#adaaaa] hover:bg-[#262626] hover:text-[#85adff] transition-all duration-300 ease-in-out text-sm font-medium w-full text-left" href="#">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>forum</span>
            Feedback
          </a>
          <div className="mt-4 p-4 rounded-xl bg-surface-container-high flex items-center gap-3" style={{ backgroundColor: '#201f1f' }}>
            <div className="w-10 h-10 rounded-full bg-surface-container-highest overflow-hidden shrink-0">
              <img alt="User Workspace Avatar" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCoah5upTzhYAatlqWjnRgyy-CcIkxxakOesty4MQr1ff_pVrduSrgA9pb5RTm4eXD37QzpnHjl-8f9HK8iLbGk_1kFsxakcitrwNLUdmJQzVIa8cGsJ0M4fCBRIctENVak_yguKqgtswjzvEUwzANPv4uvBfT1CoJUGLKuCEjIFBVrmYFDGv3MYXJwA2hlGorF1gdByLgbVEpf2KR1Hv01zhCvPVOeHjPefo9Hf1_-17gygDxrR4fo6xLGr1EwGM3GePyQpn0MOw" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-white">Intelligence Unit</span>
              <span className="text-[10px] text-on-surface-variant text-[#adaaaa]">Admin Access</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-row h-screen overflow-hidden bg-background">
        <div className="flex-1 flex flex-col h-screen overflow-y-auto no-scrollbar">
          {/* TopNavBar */}
          <header className="flex justify-between items-center w-full px-8 h-16 bg-[#0e0e0e] dark:bg-[#0e0e0e] shrink-0 sticky top-0 z-30 border-b border-white/5">
            <div className="flex items-center gap-8">
              <span className="text-2xl font-bold text-[#85adff] tracking-tight font-manrope">The Intelligence Hub</span>
              <div className="hidden lg:flex items-center bg-[#1a1919] px-4 py-1.5 rounded-lg">
                <span className="material-symbols-outlined text-[#adaaaa] text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>search</span>
                <input 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none text-sm text-on-surface-variant focus:ring-0 w-64 placeholder-[#adaaaa] outline-none" 
                  placeholder="Search transcripts..." 
                  type="text" 
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button className="p-2 rounded-full text-[#adaaaa] hover:bg-[#262626] transition-colors">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>notifications</span>
              </button>
              <button className="p-2 rounded-full text-[#adaaaa] hover:bg-[#262626] transition-colors">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>account_circle</span>
              </button>
            </div>
          </header>

          {/* Content Area */}
          <section className="p-8 no-scrollbar bg-background">
            <div className="max-w-6xl mx-auto space-y-12">

              {/* Page Title Editorial */}
              <div className="flex flex-col gap-2">
                <span className="font-manrope text-[3.5rem] leading-none font-bold text-white tracking-tighter">Transcript Ingestion</span>
                <p className="text-on-surface-variant font-medium tracking-wide">Aggregate disparate meeting data into a centralized intelligence stream.</p>
              </div>

              {/* Bento Grid Layout - Now focused on upload */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

                {/* Drag and Drop (Primary Focus) - Full width of content area now */}
                <div
                  onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                  className={`lg:col-span-12 group relative flex flex-col items-center justify-center border-2 border-dashed ${dragActive ? 'border-primary bg-surface-container-high' : 'border-outline-variant/30 bg-surface-container'} rounded-xl p-12 hover:bg-surface-container-high transition-all duration-300 min-h-[400px]`}>
                  <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl"></div>
                  <div className="relative z-10 flex flex-col items-center gap-6 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-surface-container-highest flex items-center justify-center shadow-2xl">
                      <span className="material-symbols-outlined text-4xl text-primary" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>cloud_upload</span>
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-manrope text-2xl font-semibold text-white">Drag-and-Drop Transcripts</h3>
                      <p className="text-on-surface-variant max-w-sm">Securely upload your session recordings or text logs to begin high-stakes AI extraction.</p>
                    </div>
                    <div className="flex gap-4 mt-2">
                      <span className="px-3 py-1 rounded-full bg-surface-container-highest text-[10px] font-bold text-primary tracking-widest uppercase">Supported formats: .txt, .vtt, .pdf</span>
                    </div>

                    <input type="file" multiple accept=".txt,.vtt,.pdf" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-4 px-8 py-3 rounded-lg primary-gradient text-on-primary-fixed font-bold text-sm tracking-tight shadow-lg shadow-primary/20 active:scale-95 transition-transform"
                      style={{ background: 'linear-gradient(135deg, #85adff 0%, #6c9fff 100%)' }}>
                      Browse File System
                    </button>
                  </div>
                </div>

              </div>

              {/* Recently Uploaded List */}
              <div id="recently-uploaded" className="space-y-6 pt-4 pb-20">
                <div className="flex justify-between items-center">
                  <h2 className="font-manrope text-2xl font-bold text-white">Recently Uploaded</h2>
                </div>
                <div className="space-y-3">
                  {recentFiles
                    .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((file, i) => {
                    const isError = file.status === 'Format Error';
                    const isProcessing = file.status === 'Processing';
                    const isReady = file.status === 'Ready';

                    let iconName = 'description';
                    let iconColor = 'text-primary';
                    let progressColorClass = 'bg-secondary';
                    let statusColorClass = 'text-secondary';
                    let statusIcon = 'check_circle';

                    if (isError) {
                      iconName = 'error';
                      iconColor = 'text-error';
                      progressColorClass = 'bg-error';
                      statusColorClass = 'text-error';
                      statusIcon = 'cancel';
                    } else if (isProcessing) {
                      iconName = 'sync';
                      iconColor = 'text-tertiary';
                      progressColorClass = 'bg-tertiary';
                      statusColorClass = 'text-tertiary';
                      statusIcon = 'pending';
                    }

                    return (
                      <div key={i} className="group flex items-center justify-between p-5 bg-surface-container-low rounded-xl hover:bg-surface-container transition-colors">
                        <div className="flex items-center gap-5 flex-1">
                          <div className="w-12 h-12 rounded-lg bg-surface-container-highest flex items-center justify-center">
                            <span className={`material-symbols-outlined ${iconColor}`} style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>{iconName}</span>
                          </div>
                          <div className="flex flex-col gap-1 w-full max-w-sm">
                            <span className="text-white font-medium text-sm truncate">{file.name}</span>
                            <div className="flex items-center gap-3">
                              <div className="w-32 h-1 bg-surface-container-highest rounded-full overflow-hidden">
                                <div className={`h-full ${progressColorClass}`} style={{ width: `${file.progress}%` }}></div>
                              </div>
                              <span className={`text-[10px] ${statusColorClass} font-bold`}>{file.progress}% {isError ? 'Failed' : isReady ? 'Complete' : 'Processing'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-8">
                          <div className={`flex items-center gap-2 ${statusColorClass}`}>
                            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>{statusIcon}</span>
                            <span className="text-xs font-medium">{file.status}</span>
                          </div>
                          <button 
                            onClick={() => file.meeting_id && navigate(`/meeting/${file.meeting_id}`)}
                            disabled={!file.meeting_id}
                            className="px-4 py-2 rounded-lg text-primary text-xs font-bold bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50">
                            Details
                          </button>
                        </div>
                      </div>
                    );
                  })}

                </div>
              </div>

            </div>
          </section>
        </div>

        {/* Persistent Right Sidebar: Luminary AI Chat */}
        <aside id="luminary-ai" className={`hidden lg:flex flex-col w-[380px] bg-[#1a1919] border-l border-white/5 h-screen sticky top-0 shrink-0 transition-all duration-500 ease-out ${highlightAI ? 'ring-inset ring-2 ring-primary' : ''}`}>
          <div className="p-5 flex items-center justify-between border-b border-white/10 bg-surface-container-high/30 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center bg-primary/10">
                <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>psychology</span>
              </div>
              <span className="font-manrope font-bold text-base text-white">Luminary AI</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-secondary/10 text-secondary text-[9px] font-bold uppercase tracking-wider">Online</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex flex-col gap-2 max-w-[90%] ${msg.role === 'user' ? 'items-end ml-auto' : ''}`}>
                <div className={`p-4 text-xs leading-relaxed ${msg.role === 'user' ? 'primary-gradient rounded-2xl rounded-tr-none text-on-primary-fixed shadow-lg' : 'bg-[#262626] rounded-2xl rounded-tl-none border border-white/5 text-on-surface shadow-md'}`} style={msg.role === 'user' ? { background: 'linear-gradient(135deg, #85adff 0%, #6c9fff 100%)' } : {}}>
                  <div>
                    {msg.text.split(/(\[Meeting:.*?\])/g).map((part, idx) => {
                      if (part.startsWith('[Meeting:')) {
                        return (
                          <span key={idx} className="inline-block mt-2 px-2 py-1 bg-primary/20 border border-primary/30 rounded text-[9px] font-bold text-primary-fixed uppercase tracking-wider italic">
                            {part}
                          </span>
                        );
                      }
                      return <p key={idx} className="inline">{part}</p>;
                    })}
                  </div>
                </div>
                {msg.role !== 'user' && (
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse"></div>
                    <span className="text-[10px] text-[#adaaaa] font-bold uppercase tracking-tighter">AI Synthesis</span>
                  </div>
                )}
              </div>
            ))}
            {isChatLoading && (
              <div className="flex flex-col gap-2 max-w-[90%]">
                <div className="bg-[#262626] p-4 rounded-2xl rounded-tl-none border border-white/5 shadow-md">
                  <p className="text-xs text-[#adaaaa] leading-relaxed animate-pulse">Synthesizing intelligence...</p>
                </div>
              </div>
            )}
            <div id="chat-bottom-anchor"></div>
          </div>

          <div className="p-5 border-t border-white/5 bg-background">
            <div className="relative group">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleChatSend()}
                className="w-full bg-[#1a1919] border border-white/10 rounded-xl py-3.5 pl-5 pr-14 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder-[#adaaaa]/40"
                placeholder="Ask your assistant..."
                type="text"
              />
              <button 
                onClick={handleChatSend} 
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-black transition-all duration-300">
                <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>send</span>
              </button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default UploadDashboard;
