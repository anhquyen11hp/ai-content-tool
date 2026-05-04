import { useState, useEffect, useRef } from "react";
import "./index.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "creator" | "ecom";

interface VideoDetail {
  url: string;
  title: string;
  view_count: number;
  transcript: string;
}

// Creator mode response
interface CreatorResult {
  status: "success";
  mode: "creator";
  analyzed_url: string;
  total_scanned: number;
  video_details: VideoDetail[];
  hook_analysis: string;
  content_structure: string;
  new_hook_ideas: string[];
  pain_points: string[];
}

// E-com mode response
interface EcomResult {
  status: "success";
  mode: "ecom";
  analyzed_url: string;
  title: string;
  view_count: number;
  transcript: string;
  selling_points: string[];
  customer_pain_points_addressed: string[];
  sales_script_ideas: string[];
  hook_ideas: string[];
}

type AnalyzeResult = CreatorResult | EcomResult;

const API_BASE = "http://127.0.0.1:8000";

// ─── Loading Steps ────────────────────────────────────────────────────────────

const CREATOR_STEPS = [
  { icon: "🔍", text: "Đang quét kênh đối thủ..." },
  { icon: "📊", text: "Đang tìm các video triệu view..." },
  { icon: "🎵", text: "Đang tải âm thanh Top 3 video..." },
  { icon: "🤖", text: "Whisper AI đang bóc tách lời thoại..." },
  { icon: "✨", text: "Đang bóc tách công thức viral..." },
];

const ECOM_STEPS = [
  { icon: "📥", text: "Đang tải video..." },
  { icon: "🎵", text: "Đang trích xuất âm thanh..." },
  { icon: "🤖", text: "Whisper AI đang bóc băng lời thoại..." },
  { icon: "✨", text: "GPT đang phân tích chiến lược bán hàng..." },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingState({ mode }: { mode: Mode | null }) {
  const steps = mode === "creator" ? CREATOR_STEPS : ECOM_STEPS;
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIdx((prev) => (prev + 1) % steps.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [steps.length]);

  return (
    <div className="glass-card p-8 flex flex-col items-center justify-center space-y-5 text-center fade-in-up">
      {/* Spinner */}
      <div className="relative w-14 h-14">
        <div
          className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin"
          style={{
            borderColor: "rgba(255,255,255,0.08)",
            borderTopColor: mode === "creator" ? "var(--accent-creator)" : "var(--accent-ecom)",
          }}
        />
        <div className="absolute inset-2 rounded-full flex items-center justify-center text-xl">
          {steps[stepIdx].icon}
        </div>
      </div>

      {/* Step text */}
      <div className="space-y-1">
        <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
          {steps[stepIdx].text}
        </p>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {mode === "creator"
            ? "Quá trình quét kênh có thể mất 1–2 phút. Vui lòng chờ."
            : "Quá trình phân tích có thể mất 15–30 giây. Vui lòng chờ."}
        </p>
      </div>

      {/* Steps progress dots */}
      <div className="flex gap-2">
        {steps.map((_, i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full transition-all duration-500"
            style={{
              background:
                i === stepIdx
                  ? mode === "creator" ? "var(--accent-creator)" : "var(--accent-ecom)"
                  : "rgba(255,255,255,0.1)",
              transform: i === stepIdx ? "scale(1.5)" : "scale(1)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function InfoCard({ label, content, accentColor }: { label: string; content: string; accentColor: string }) {
  return (
    <div className="glass-card p-5 space-y-2 fade-in-up">
      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: accentColor }}>
        {label}
      </div>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
        {content}
      </p>
    </div>
  );
}

function ListCard({
  title,
  icon,
  items,
  accentColor,
  delay = 0,
}: {
  title: string;
  icon: string;
  items: string[];
  accentColor: string;
  delay?: number;
}) {
  return (
    <div className="glass-card p-5 fade-in-up h-full" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{icon}</span>
        <h3 className="font-semibold text-sm tracking-wide uppercase" style={{ color: accentColor }}>
          {title}
        </h3>
        <span
          className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${accentColor}20`, color: accentColor }}
        >
          {items.length}
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-3 text-sm p-3 rounded-xl"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <span
              className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
              style={{ background: `${accentColor}22`, color: accentColor }}
            >
              {i + 1}
            </span>
            <span style={{ color: "var(--text-primary)" }}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VideoCard({ video, index }: { video: VideoDetail; index: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="glass-card p-4 space-y-2 fade-in-up"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            {video.title || "Video không có tiêu đề"}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            👀 {(video.view_count || 0).toLocaleString()} lượt xem
          </p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-xs px-2 py-1 rounded-lg transition-colors"
          style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}
        >
          {expanded ? "Thu gọn ▲" : "Transcript ▼"}
        </button>
      </div>
      {expanded && (
        <div
          className="text-xs leading-relaxed p-3 rounded-xl max-h-40 overflow-y-auto whitespace-pre-line"
          style={{ background: "rgba(255,255,255,0.03)", color: "var(--text-secondary)" }}
        >
          {video.transcript || "Không có transcript."}
        </div>
      )}
    </div>
  );
}

// ─── Creator Dashboard ────────────────────────────────────────────────────────

function CreatorDashboard({ result }: { result: CreatorResult }) {
  return (
    <div className="space-y-5 fade-in-up">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-3">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{ background: "rgba(124,58,237,0.15)", color: "#c4b5fd", border: "1px solid rgba(124,58,237,0.35)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          🎬 Chế độ Xây Kênh
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
          style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        >
          📹 Đã quét {result.total_scanned} video · Phân tích Top 3
        </div>
      </div>

      {/* Analysis insight cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InfoCard
          label="🎯 Phân tích Hook"
          content={result.hook_analysis}
          accentColor="#c4b5fd"
        />
        <InfoCard
          label="📐 Công thức cấu trúc nội dung"
          content={result.content_structure}
          accentColor="#a78bfa"
        />
      </div>

      {/* New hook ideas + pain points */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ListCard
          title="Ý tưởng Hook mới"
          icon="💡"
          items={result.new_hook_ideas}
          accentColor="var(--accent-creator)"
          delay={0}
        />
        <ListCard
          title="Pain Points của khán giả"
          icon="🎯"
          items={result.pain_points}
          accentColor="#f59e0b"
          delay={80}
        />
      </div>

      {/* Top 3 videos details (collapsible) */}
      {result.video_details?.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            📹 Top {result.video_details.length} video đã phân tích
          </h3>
          {result.video_details.map((v, i) => (
            <VideoCard key={i} video={v} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── E-Com Dashboard ──────────────────────────────────────────────────────────

function EcomDashboard({ result }: { result: EcomResult }) {
  const [showTranscript, setShowTranscript] = useState(false);
  return (
    <div className="space-y-5 fade-in-up">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-3">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{ background: "rgba(14,165,233,0.15)", color: "#7dd3fc", border: "1px solid rgba(14,165,233,0.35)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
          🛒 Chế độ Bán Hàng
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
          style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        >
          👀 {(result.view_count || 0).toLocaleString()} lượt xem
        </div>
      </div>

      {/* Video title */}
      <div className="glass-card p-4 border-l-4" style={{ borderLeftColor: "var(--accent-ecom)" }}>
        <p className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
          {result.title || "Video không có tiêu đề"}
        </p>
        <button
          onClick={() => setShowTranscript((v) => !v)}
          className="text-xs mt-2 transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          {showTranscript ? "Ẩn transcript ▲" : "Xem transcript đầy đủ ▼"}
        </button>
        {showTranscript && (
          <div
            className="mt-3 text-xs leading-relaxed p-3 rounded-xl max-h-48 overflow-y-auto whitespace-pre-line"
            style={{ background: "rgba(255,255,255,0.03)", color: "var(--text-secondary)" }}
          >
            {result.transcript || "Không có transcript."}
          </div>
        )}
      </div>

      {/* Hook ideas */}
      <ListCard
        title="Ý tưởng Hook mở đầu"
        icon="🎣"
        items={result.hook_ideas}
        accentColor="var(--accent-ecom)"
      />

      {/* Selling points + pain points */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ListCard
          title="Điểm bán hàng nổi bật"
          icon="⭐"
          items={result.selling_points}
          accentColor="#34d399"
          delay={0}
        />
        <ListCard
          title="Nỗi đau khách hàng"
          icon="💢"
          items={result.customer_pain_points_addressed}
          accentColor="#f87171"
          delay={80}
        />
      </div>

      {/* Sales scripts */}
      <ListCard
        title="Kịch bản bán hàng gợi ý"
        icon="📝"
        items={result.sales_script_ideas}
        accentColor="#fbbf24"
      />
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [activeMode, setActiveMode] = useState<Mode | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleAnalyze(mode: Mode) {
    if (!url.trim()) {
      setError("⚠️ Vui lòng nhập link kênh hoặc video đối thủ trước khi phân tích.");
      inputRef.current?.focus();
      return;
    }

    setError(null);
    setResult(null);
    setActiveMode(mode);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), mode }),
      });

      const data = await res.json();

      if (!res.ok || data.status === "error") {
        throw new Error(data.message || `Lỗi server: ${res.status}`);
      }

      setResult(data as AnalyzeResult);
    } catch (err) {
      setError(
        err instanceof Error
          ? `❌ ${err.message}`
          : "❌ Không thể kết nối đến backend. Hãy đảm bảo FastAPI đang chạy tại cổng 8000."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-primary)" }}>

      {/* ── Header ── */}
      <header className="border-b sticky top-0 z-10 backdrop-blur-md" style={{ borderColor: "var(--border)", background: "rgba(10,10,15,0.85)" }}>
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold"
            style={{ background: "linear-gradient(135deg, #7c3aed, #0ea5e9)" }}
          >
            ✦
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">AI Content & Scraping Tool</h1>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Phân tích đối thủ · Tạo ý tưởng nội dung · Tối ưu bán hàng
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>v3.0 · API Ready</span>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8 space-y-6">

        {/* Input section */}
        <div className="glass-card p-6 space-y-5">
          <div>
            <label htmlFor="url-input" className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              🔗 Link kênh hoặc Video đối thủ
            </label>
            <input
              id="url-input"
              ref={inputRef}
              type="url"
              value={url}
              disabled={loading}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.tiktok.com/@tentaikhoan  hoặc  https://www.tiktok.com/@.../video/..."
              className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all duration-200 disabled:opacity-50"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(124,58,237,0.6)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            />
            <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)", opacity: 0.6 }}>
              Tip: Nhập link <strong>@kênh</strong> → Chế độ Xây Kênh &nbsp;|&nbsp; Nhập link <strong>/video/</strong> → Chế độ Bán Hàng
            </p>
          </div>

          {/* Mode buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              id="btn-creator"
              onClick={() => handleAnalyze("creator")}
              disabled={loading}
              className="relative overflow-hidden flex items-center gap-3 px-5 py-4 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed group"
              style={{
                background: activeMode === "creator" && !loading ? "linear-gradient(135deg, #7c3aed, #6d28d9)" : "rgba(124,58,237,0.1)",
                border: "1px solid rgba(124,58,237,0.4)",
                color: "#c4b5fd",
              }}
            >
              <span className="text-xl">🎬</span>
              <div className="text-left">
                <div className="font-bold">Chế độ Xây Kênh</div>
                <div className="text-xs opacity-70 font-normal">Phân tích toàn bộ kênh</div>
              </div>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                   style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.18), transparent)" }} />
            </button>

            <button
              id="btn-ecom"
              onClick={() => handleAnalyze("ecom")}
              disabled={loading}
              className="relative overflow-hidden flex items-center gap-3 px-5 py-4 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed group"
              style={{
                background: activeMode === "ecom" && !loading ? "linear-gradient(135deg, #0ea5e9, #0284c7)" : "rgba(14,165,233,0.1)",
                border: "1px solid rgba(14,165,233,0.4)",
                color: "#7dd3fc",
              }}
            >
              <span className="text-xl">🛒</span>
              <div className="text-left">
                <div className="font-bold">Chế độ Bán Hàng</div>
                <div className="text-xs opacity-70 font-normal">Phân tích 1 video cụ thể</div>
              </div>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                   style={{ background: "linear-gradient(135deg, rgba(14,165,233,0.18), transparent)" }} />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="glass-card p-4 text-sm fade-in-up"
               style={{ borderColor: "rgba(239,68,68,0.3)", color: "#fca5a5" }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && <LoadingState mode={activeMode} />}

        {/* Result */}
        {result && !loading && (
          result.mode === "creator"
            ? <CreatorDashboard result={result as CreatorResult} />
            : <EcomDashboard result={result as EcomResult} />
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <div className="glass-card p-12 text-center space-y-4">
            <div className="text-5xl">🔍</div>
            <div>
              <p className="font-semibold text-base" style={{ color: "var(--text-secondary)" }}>
                Sẵn sàng phân tích đối thủ
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)", opacity: 0.5 }}>
                Nhập link và chọn chế độ để bắt đầu phân tích bằng AI
              </p>
            </div>
            <div className="flex justify-center gap-4 text-xs" style={{ color: "var(--text-secondary)", opacity: 0.5 }}>
              <span>🎬 Xây kênh</span>
              <span>·</span>
              <span>🛒 Bán hàng</span>
              <span>·</span>
              <span>🤖 GPT-4o-mini</span>
              <span>·</span>
              <span>🎙️ Whisper AI</span>
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t py-3 text-center text-xs"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
        AI Content & Scraping Tool · Phase 3 · GPT-4o-mini + Whisper · Backend:{" "}
        <code className="font-mono">localhost:8000</code>
      </footer>
    </div>
  );
}
