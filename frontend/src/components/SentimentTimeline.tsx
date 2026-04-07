import React, { useEffect, useState, useCallback } from 'react';
import { getSentimentAnalysis, analyseSentiment } from '../api/client';

// ─── Types ─────────────────────────────────────────────────────────────────
interface TimelineSegment {
  id: number;
  time: string;
  emoji: string;
  sentiment_label: string;
  sentiment_score: number | null;
  text_preview: string;
  bg: string;
  height: string; // 'tall' | 'medium' | 'short'
}

interface SpeakerTimeline {
  name: string;
  short_name: string;
  role: string;
  segments: TimelineSegment[];
}

interface EngagementEntry {
  name: string;
  short_name: string;
  talk_time_pct: number;
  positive_pct: number;
  negative_pct: number;
  sentiment_shift: number;
}

interface LegendEntry {
  emoji: string;
  label: string;
  color_class: string;
  quote: string;
  found: boolean;
}

interface SentimentData {
  status: 'not_started' | 'pending' | 'running' | 'done' | 'error';
  speakers: SpeakerTimeline[];
  engagement: EngagementEntry[];
  legend: LegendEntry[];
  error?: string;
}

// ─── Avatar Helper ──────────────────────────────────────────────────────────
const SpeakerAvatar: React.FC<{ name: string }> = ({ name }) => {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const colors = [
    ['#6c9fff', '#00214f'], ['#006c49', '#e1ffec'], ['#f8a010', '#2a1700'],
    ['#85adff', '#002c65'], ['#ff716c', '#490006'],
  ];
  const idx = (name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % colors.length;
  const [bg, fg] = colors[idx];
  return (
    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
      style={{ backgroundColor: bg, color: fg }}>
      {initials}
    </div>
  );
};

// ─── Legend color mapping ───────────────────────────────────────────────────
const legendColorMap: Record<string, string> = {
  'secondary': '#69f6b8',
  'on-surface': '#ffffff',
  'tertiary': '#ffb148',
  'error': '#ff716c',
  'on-surface-variant': '#adaaaa',
  'primary': '#85adff',
};

// ─── Popover Component ──────────────────────────────────────────────────────
const SegmentPopover: React.FC<{
  segment: TimelineSegment;
  speaker: string;
  position: { x: number; y: number };
  onClose: () => void;
}> = ({ segment, speaker, position, onClose }) => {
  const labelMap: Record<string, { badge: string; badgeBg: string; badgeText: string }> = {
    enthusiasm: { badge: 'HIGH ENTHUSIASM', badgeBg: '#006c49', badgeText: '#69f6b8' },
    positive: { badge: 'POSITIVE', badgeBg: '#006c49', badgeText: '#e1ffec' },
    neutral: { badge: 'NEUTRAL', badgeBg: '#262626', badgeText: '#adaaaa' },
    skepticism: { badge: 'SKEPTICISM', badgeBg: '#f8a010', badgeText: '#2a1700' },
    critical_concern: { badge: 'CRITICAL CONCERN', badgeBg: '#9f0519', badgeText: '#ffa8a3' },
    agreement: { badge: 'AGREEMENT', badgeBg: '#006c49', badgeText: '#69f6b8' },
    launch_ready: { badge: 'LAUNCH READY', badgeBg: '#85adff', badgeText: '#00214f' },
  };
  const info = labelMap[segment.sentiment_label] || labelMap.neutral;

  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      <div
        className="absolute z-[101] w-[350px] rounded-2xl border border-white/10 shadow-2xl p-6"
        style={{
          background: 'rgba(38, 38, 38, 0.95)',
          backdropFilter: 'blur(20px)',
          left: Math.min(position.x, window.innerWidth - 380),
          top: Math.min(position.y - 20, window.innerHeight - 280),
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-8 rounded-full" style={{ backgroundColor: info.badgeBg === '#006c49' ? '#69f6b8' : info.badgeText }} />
          <div>
            <h4 className="text-sm font-bold text-white">Transcript Fragment: {segment.time}</h4>
            <p className="text-xs text-[#adaaaa]">Speaker: {speaker}</p>
          </div>
        </div>
        <p className="text-sm text-white italic leading-relaxed"
          style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px' }}>
          "{segment.text_preview}"
        </p>
        <div className="mt-4 flex gap-2">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold"
            style={{ backgroundColor: info.badgeBg, color: info.badgeText }}>
            {info.badge}
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#262626] text-white">
            Score: {(segment.sentiment_score ?? 0).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────
const SentimentTimeline: React.FC<{ meetingId: number }> = ({ meetingId }) => {
  const [data, setData] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [popover, setPopover] = useState<{ segment: TimelineSegment; speaker: string; position: { x: number; y: number } } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await getSentimentAnalysis(meetingId);
      setData(res.data);
      if (res.data.status === 'running' || res.data.status === 'pending') {
        // Continue polling
        setTimeout(fetchData, 3000);
      } else {
        setLoading(false);
        setAnalyzing(false);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
      setAnalyzing(false);
    }
  }, [meetingId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRunAnalysis = async () => {
    setAnalyzing(true);
    try {
      await analyseSentiment(meetingId);
      fetchData();
    } catch (err) {
      console.error(err);
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-12 h-12 rounded-full border-4 border-[#85adff] border-t-transparent animate-spin" />
        <span className="ml-4 text-lg font-medium text-[#adaaaa]">Loading Intelligence...</span>
      </div>
    );
  }

  // Filter out system labels from the speakers list (Strictly members only)
  const isRealSpeaker = (name: string) => {
    const nameLow = name.toLowerCase().trim();
    const excludeKeywords = [
        'meeting:', 'date:', 'unknown', 'participant:', 'time:', 
        'location:', 'agenda:', 'summary:', 'participants:'
    ];
    if (excludeKeywords.some(x => nameLow.includes(x))) return false;
    if (/^\d{1,2}:\d{2}/.test(nameLow)) return false;
    if (nameLow.length < 2) return false;
    return true;
  };

  const filteredSpeakers = data?.speakers.filter(s => isRealSpeaker(s.name)) || [];
  const filteredEngagement = data?.engagement.filter(e => isRealSpeaker(e.name)) || [];

  if (!data || data.status === 'not_started') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center border border-white/5 bg-[#1a1919] rounded-2xl">
        <span className="material-symbols-outlined text-6xl text-[#adaaaa] mb-4 opacity-50">analytics</span>
        <h3 className="text-xl font-bold text-white mb-2">Sentiment Analysis Not Started</h3>
        <p className="text-[#adaaaa] text-sm mb-8 max-w-md">Get deep insights into speaker emotions, talk-time, and sentiment shifts using Gemini 1.5 Flash.</p>
        <button 
          onClick={handleRunAnalysis}
          disabled={analyzing}
          className="px-8 py-3 bg-[#85adff] text-[#00214f] rounded-xl font-bold hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100 flex items-center gap-2"
        >
          {analyzing ? <div className="w-4 h-4 border-2 border-current border-t-transparent animate-spin rounded-full" /> : <span className="material-symbols-outlined text-sm">rocket_launch</span>}
          {analyzing ? 'Initializing...' : 'Run Analysis'}
        </button>
      </div>
    );
  }

  if (data.status === 'running' || data.status === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="relative mb-8">
            <div className="w-24 h-24 rounded-full border-4 border-white/5 border-t-[#85adff] animate-spin" />
            <span className="material-symbols-outlined text-3xl text-[#85adff] absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">psychology</span>
        </div>
        <h3 className="text-xl font-bold text-white mb-2">AI is Processing...</h3>
        <p className="text-[#adaaaa] text-sm italic">"Analyzing speaker turns and emotional shifts using Gemini 1.5 Flash"</p>
        <div className="mt-8 w-64 h-1 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-[#85adff] animate-pulse w-full" />
        </div>
      </div>
    );
  }

  const handleSegmentClick = (seg: TimelineSegment, speaker: string, e: React.MouseEvent) => {
    setPopover({ segment: seg, speaker, position: { x: e.clientX, y: e.clientY } });
  };

  const getBarBg = (label: string) => {
    switch (label) {
      case 'enthusiasm': return 'bg-[#34c98a]'; // Teal/Green in image
      case 'positive': return 'bg-[#34c98a]';
      case 'critical_concern': return 'bg-[#ff716c]'; // Red
      case 'skepticism': return 'bg-[#f5c518]'; // Yellow
      case 'agreement': return 'bg-[#34c98a]';
      case 'launch_ready': return 'bg-[#34c98a]';
      default: return 'bg-[#6b7280]';
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Sentiment Timeline ────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white uppercase tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Sentiment Timeline
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-[#adaaaa]">Click segments for transcript context</span>
          </div>
        </div>

        <div className="bg-[#111111] border border-white/5 rounded-2xl p-8 space-y-12 relative overflow-x-auto shadow-2xl" 
            style={{ 
                scrollbarWidth: 'thin', 
                scrollbarColor: 'rgba(133,173,255,0.2) transparent',
            }}>
          <div className="min-w-[900px] relative space-y-14">
            {filteredSpeakers.map((speaker, si) => (
              <div key={si} className="relative flex items-center gap-12 min-h-[4rem]">
                {/* Speaker label */}
                <div className="w-32 text-right shrink-0">
                  <span className="text-md font-extrabold text-white block truncate tracking-tight">{speaker.name}</span>
                  {speaker.role && (
                    <p className="text-[10px] text-[#adaaaa] uppercase tracking-widest font-bold mt-0.5">{speaker.role}</p>
                  )}
                </div>

                {/* Timeline Swimlane Lane Base */}
                <div className="absolute left-44 right-0 h-[1.5px] bg-white/[0.03] transform -translate-y-1/2 top-1/2" />

                {/* Timeline content */}
                <div className="flex-grow flex gap-8 items-center relative z-10">
                  {speaker.segments.map((seg, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-3 group">
                      {/* Pill Shape for sentiment */}
                      <div
                        className={`w-16 h-8 ${getBarBg(seg.sentiment_label)} rounded-full opacity-90 cursor-pointer hover:opacity-100 transition-all flex items-center justify-center text-lg shadow-xl shadow-black/40 hover:scale-110 active:scale-95`}
                        onClick={(e) => handleSegmentClick(seg, speaker.name, e)}
                      >
                        <span className="transform group-hover:scale-125 transition-transform">{seg.emoji}</span>
                      </div>
                      {/* Timestamp below */}
                      <span className="text-[10px] text-[#adaaaa] font-bold tracking-wider opacity-80 group-hover:opacity-100 transition-opacity">
                        {seg.time}
                      </span>
                    </div>
                  ))}
                  <div className="flex-grow" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Engagement Matrix + Sentiment Legend Grid ─────────────────────── */}
      <div className="grid grid-cols-12 gap-6">
        {/* Active Engagement Matrix */}
        <div className="col-span-12 lg:col-span-8 bg-[#111111] border border-white/5 rounded-2xl p-8 shadow-xl">
          <h2 className="text-lg font-extrabold text-white uppercase tracking-tight mb-8" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Active Engagement Matrix
          </h2>
          <div className="space-y-10">
            {filteredEngagement.map((eng, i) => (
              <div key={i} className="flex items-center gap-6 group">
                <div className="relative">
                    <SpeakerAvatar name={eng.name} />
                </div>
                
                <div className="flex-grow">
                  <div className="flex justify-between items-end mb-3">
                    <div>
                        <span className="text-white font-black text-sm tracking-tight">{eng.name}</span>
                        <p className="text-[10px] text-[#adaaaa] font-bold uppercase tracking-widest">{eng.talk_time_pct.toFixed(0)}% TOTAL TALK-TIME</p>
                    </div>
                    <div className="text-right">
                        <span className={`text-md font-black ${eng.sentiment_shift >= 0 ? 'text-[#69f6b8]' : 'text-[#ff716c]'}`}>
                            {eng.sentiment_shift >= 0 ? '+' : ''}{eng.sentiment_shift.toFixed(1)}%
                        </span>
                        <p className="text-[9px] text-[#adaaaa] font-bold uppercase tracking-widest">SENTIMENT SHIFT</p>
                    </div>
                  </div>
                  
                  {/* DUAL COLOR PROGRESS BAR */}
                  <div className="h-2.5 w-full bg-[#1e1e1e] rounded-full overflow-hidden flex shadow-inner border border-white/[0.02]">
                    <div
                      className="h-full bg-[#34c98a] transition-all duration-1000 ease-out"
                      style={{ width: `${eng.positive_pct}%` }}
                    />
                    <div
                      className="h-full bg-[#ff716c] transition-all duration-1000 ease-out"
                      style={{ width: `${eng.negative_pct}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sentiment Legend */}
        <div className="col-span-12 lg:col-span-4 bg-[#111111] border border-white/5 rounded-2xl p-8 shadow-xl">
          <h3 className="text-[10px] font-black text-[#adaaaa] uppercase tracking-[0.3em] mb-8 border-b border-white/5 pb-4">
            SENTIMENT LEGEND
          </h3>
          <div className="space-y-8 overflow-y-auto pr-2">
            {data.legend.map((entry, i) => (
              <div key={i} className={`flex items-start gap-5 transition-all ${entry.found ? 'opacity-100' : 'opacity-30'}`}>
                <span className="text-2xl p-1 bg-white/[0.03] rounded-lg shadow-sm">{entry.emoji}</span>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider mb-1"
                    style={{ color: legendColorMap[entry.color_class] || '#ffffff' }}>
                    {entry.label}
                  </h4>
                  <p className="text-[11px] text-[#adaaaa] font-medium leading-relaxed italic line-clamp-2">
                    {entry.quote}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Popover */}
      {popover && (
        <SegmentPopover
          segment={popover.segment}
          speaker={popover.speaker}
          position={popover.position}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
};

export default SentimentTimeline;
