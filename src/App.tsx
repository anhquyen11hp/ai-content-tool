import { useState, useEffect } from "react";
import "./index.css";

// ─── Types ────────────────────────────────────────────────────────────────────
type Mode = "creator" | "ecom";

interface VideoDetail {
  url: string;
  title: string;
  view_count: number;
  transcript: string;
}

interface AnalyzeResponse {
  status: string;
  mode: Mode;
  analyzed_url: string;
  channel_mode: boolean;
  // Single video mode
  title?: string;
  view_count?: number;
  transcript?: string;
  // Channel mode
  total_scanned?: number;
  video_details?: VideoDetail[];
  // Shared
  hook_ideas: string[];
  pain_points: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const API_BASE = "http://127.0.0.1:8000";

const CHANNEL_LOADING_STEPS = [
  "🔍 Đang quét kênh đối thủ...",
  "📊 Đang tìm các video triệu view...",
  "🎵 Đang tải audio Top 3 video viral...",
  "🤖 Đang bóc băng lời thoại bằng Whisper AI...",
  "✨ Đang bóc tách công thức viral bằng GPT...",
  "🏆 Sắp hoàn thành, vui lòng đợi thêm...",
];

const VIDEO_LOADING_STEPS = [
  "⬇️ Đang tải audio từ TikTok...",
  "🎙️ Đang bóc băng lời thoại bằng Whisper AI...",
  "✅ Đang xử lý kết quả...",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ResultCard({
  title,
  icon,
  items,
  accentColor,
  delay,
}: {
  title: string;
  icon: string;
  items: string[];
  accentColor: string;
  delay: number;
}) {
  return (
    <div
      className="glass-card p-5 fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{icon}</span>
        <h3 className="font-semibold text-sm tracking-wide uppercase"
            style={{ color: accentColor }}>
          {title}
        </h3>
        <span
          className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ background: `${accentColor}20`, color: accentColor }}
        >
          {items.length}
        </span>
      </div>

      {/* Items */}
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-3 text-sm p-3 rounded-xl transition-colors duration-200"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <span
              className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
              style={{ background: `${accentColor}25`, color: accentColor }}
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

function VideoCard({ video, index, accentColor }: { video: VideoDetail; index: number; accentColor: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="glass-card p-4 fade-in-up"
      style={{ animationDelay: `${index * 80}ms`, borderLeft: `3px solid ${accentColor}` }}
    >
      <div className="flex items-start gap-3">
        <span
          className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-sm font-bold"
          style={{ background: `${accentColor}30`, color: accentColor }}
        >
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-white truncate">{video.title || "Video không có tiêu đề"}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            👀 {video.view_count?.toLocaleString() || 0} lượt xem
          </p>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="text-xs px-2.5 py-1 rounded-lg shrink-0 transition-all duration-200"
          style={{
            background: open ? `${accentColor}30` : "rgba(255,255,255,0.05)",
            color: open ? accentColor : "var(--text-secondary)",
            border: `1px solid ${open ? accentColor + "50" : "transparent"}`,
          }}
        >
          {open ? "Thu gọn ▲" : "Xem script ▼"}
        </button>
      </div>

      {open && (
        <div
          className="mt-3 p-3 rounded-xl text-xs leading-relaxed max-h-48 overflow-y-auto whitespace-pre-line fade-in-up"
          style={{ background: "rgba(0,0,0,0.3)", color: "var(--text-primary)" }}
        >
          {video.transcript || "Không có lời thoại."}
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton({ isChannel }: { isChannel: boolean }) {
  const steps = isChannel ? CHANNEL_LOADING_STEPS : VIDEO_LOADING_STEPS;
  const [stepIndex, setStepIndex] = useState(0);
  const accentColor = isChannel ? "var(--accent-creator)" : "var(--accent-ecom)";

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((prev) => {
        if (prev < steps.length - 1) return prev + 1;
        return prev;
      });
    }, isChannel ? 18000 : 5000); // Channel: mỗi 18s (~1:48 total), Video: mỗi 5s
    return () => clearInterval(interval);
  }, [steps.length, isChannel]);

  return (
    <div className="space-y-6 fade-in-up">
      <div className="glass-card p-8 flex flex-col items-center justify-center space-y-5 text-center">
        {/* Spinner */}
        <div className="relative">
          <div
            className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin"
            style={{
              borderColor: "rgba(255,255,255,0.08)",
              borderTopColor: accentColor,
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-lg">
            {isChannel ? "📡" : "🎵"}
          </div>
        </div>

        {/* Status text (animated) */}
        <div className="space-y-2">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {steps[stepIndex]}
          </p>
          {isChannel && (
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Chế độ Xây Kênh cần quét & bóc băng 3 video — dự kiến 1-2 phút
            </p>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-500"
              style={{
                width: i === stepIndex ? "20px" : "6px",
                height: "6px",
                background: i <= stepIndex ? accentColor : "rgba(255,255,255,0.1)",
              }}
            />
          ))}
        </div>
      </div>

      {/* Skeleton cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="glass-card p-5 space-y-3">
            <div className="shimmer h-4 w-32 rounded-lg" />
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="shimmer h-10 w-full rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingIsChannel, setLoadingIsChannel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [activeMode, setActiveMode] = useState<Mode | null>(null);

  function detectIsChannel(inputUrl: string): boolean {
    const hasVideoPath = inputUrl.includes("/video/");
    const hasProfile = inputUrl.includes("@");
    const isYouTubeWatch = inputUrl.includes("watch?v=") || inputUrl.includes("/shorts/");
    if (isYouTubeWatch) return false;
    if (hasVideoPath) return false;
    if (hasProfile) return true;
    return false;
  }

  async function handleAnalyze(mode: Mode) {
    if (!url.trim()) {
      setError("⚠️ Vui lòng nhập link kênh hoặc video đối thủ trước khi phân tích.");
      return;
    }

    const isChannel = detectIsChannel(url.trim());
    setError(null);
    setResult(null);
    setActiveMode(mode);
    setLoadingIsChannel(isChannel);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), mode }),
      });

      if (!res.ok) {
        throw new Error(`Lỗi server: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();

      if (data.status === "error") {
        throw new Error(data.message || "Lỗi không xác định từ server.");
      }

      setResult(data as AnalyzeResponse);
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

  const modeLabel = activeMode === "creator" ? "🎬 Chế độ Xây Kênh" : "🛒 Chế độ Bán Hàng";
  const modeColor = activeMode === "creator" ? "var(--accent-creator)" : "var(--accent-ecom)";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-primary)" }}>

      {/* ── Header ── */}
      <header className="border-b" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
               style={{ background: "linear-gradient(135deg, #7c3aed, #0ea5e9)" }}>
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
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>API Ready</span>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8 space-y-6">

        {/* Input section */}
        <div className="glass-card p-6 space-y-5">
          <div>
            <label
              htmlFor="url-input"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              🔗 Link kênh hoặc Video đối thủ
            </label>
            <input
              id="url-input"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && activeMode && handleAnalyze(activeMode)}
              placeholder="https://www.tiktok.com/@username hoặc https://www.tiktok.com/@.../video/..."
              className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all duration-200"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "rgba(124,58,237,0.6)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--border)")
              }
            />
            {/* URL hint */}
            {url.trim() && (
              <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>
                {detectIsChannel(url.trim())
                  ? "📡 Đã nhận diện: Link kênh → sẽ chạy Chế độ Xây Kênh (quét Top 3 video)"
                  : "🎬 Đã nhận diện: Link video → sẽ chạy Chế độ Bán Hàng (bóc băng 1 video)"}
              </p>
            )}
          </div>

          {/* Mode buttons */}
          <div className="grid grid-cols-2 gap-3">
            {/* Creator Mode */}
            <button
              id="btn-creator"
              onClick={() => handleAnalyze("creator")}
              disabled={loading}
              className="relative overflow-hidden flex items-center justify-center gap-2.5 px-5 py-4 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
              style={{
                background:
                  activeMode === "creator" && !loading
                    ? "linear-gradient(135deg, #7c3aed, #6d28d9)"
                    : "rgba(124,58,237,0.12)",
                border: "1px solid rgba(124,58,237,0.4)",
                color: "#c4b5fd",
              }}
            >
              <span className="text-lg">🎬</span>
              <div className="text-left">
                <div className="font-bold">Chế độ Xây Kênh</div>
                <div className="text-xs opacity-70 font-normal">Creator Mode · Phát triển nội dung</div>
              </div>
              {/* Hover shimmer */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                   style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.15), transparent)" }} />
            </button>

            {/* E-com Mode */}
            <button
              id="btn-ecom"
              onClick={() => handleAnalyze("ecom")}
              disabled={loading}
              className="relative overflow-hidden flex items-center justify-center gap-2.5 px-5 py-4 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
              style={{
                background:
                  activeMode === "ecom" && !loading
                    ? "linear-gradient(135deg, #0ea5e9, #0284c7)"
                    : "rgba(14,165,233,0.12)",
                border: "1px solid rgba(14,165,233,0.4)",
                color: "#7dd3fc",
              }}
            >
              <span className="text-lg">🛒</span>
              <div className="text-left">
                <div className="font-bold">Chế độ Bán Hàng</div>
                <div className="text-xs opacity-70 font-normal">E-Com Mode · Tăng doanh thu</div>
              </div>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                   style={{ background: "linear-gradient(135deg, rgba(14,165,233,0.15), transparent)" }} />
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div
            className="glass-card p-4 text-sm fade-in-up"
            style={{ borderColor: "rgba(239,68,68,0.3)", color: "#fca5a5" }}
          >
            {error}
          </div>
        )}

        {/* Loading skeleton (animated steps) */}
        {loading && <LoadingSkeleton isChannel={loadingIsChannel} />}

        {/* Result Dashboard */}
        {result && !loading && (
          <div className="space-y-4 fade-in-up">
            {/* Result header badge */}
            <div className="flex items-center gap-3">
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: `${modeColor}20`, color: modeColor, border: `1px solid ${modeColor}40` }}
              >
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: modeColor }} />
                {modeLabel}
              </div>
              <span className="text-xs truncate max-w-xs" style={{ color: "var(--text-secondary)" }}>
                {result.analyzed_url}
              </span>
              {result.channel_mode && result.total_scanned && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(124,58,237,0.15)", color: "#c4b5fd" }}>
                  Quét {result.total_scanned} video
                </span>
              )}
            </div>

            {/* ── CHANNEL MODE: Top 3 Video Details ── */}
            {result.channel_mode && result.video_details && result.video_details.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider"
                    style={{ color: "var(--accent-creator)" }}>
                  🏆 Top {result.video_details.length} Video Viral Nhất
                </h2>
                {result.video_details.map((video, i) => (
                  <VideoCard
                    key={i}
                    video={video}
                    index={i}
                    accentColor="var(--accent-creator)"
                  />
                ))}
              </div>
            )}

            {/* ── SINGLE VIDEO MODE: Video Info & Transcript ── */}
            {!result.channel_mode && (
              <div className="glass-card p-6 space-y-4 border-l-4" style={{ borderLeftColor: modeColor }}>
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">{result.title || "Video không có tiêu đề"}</h3>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    👀 {result.view_count?.toLocaleString() || 0} lượt xem
                  </p>
                </div>

                <div className="p-4 rounded-xl text-sm leading-relaxed max-h-60 overflow-y-auto"
                     style={{ background: "rgba(255,255,255,0.03)", color: "var(--text-primary)" }}>
                  <div className="font-semibold mb-2 text-xs uppercase tracking-wider"
                       style={{ color: "var(--text-secondary)" }}>
                    Transcript (Bóc băng lời thoại)
                  </div>
                  <div className="whitespace-pre-line">
                    {result.transcript || "Không có lời thoại nào được bóc băng."}
                  </div>
                </div>
              </div>
            )}

            {/* ── GPT Analysis: Hook Ideas & Pain Points ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ResultCard
                title="Hook Ideas"
                icon="💡"
                items={result.hook_ideas}
                accentColor="var(--accent-creator)"
                delay={0}
              />
              <ResultCard
                title="Pain Points"
                icon="🎯"
                items={result.pain_points}
                accentColor="var(--accent-ecom)"
                delay={80}
              />
            </div>

            {/* Raw JSON toggle — useful for dev */}
            <details className="glass-card p-4 text-xs" style={{ color: "var(--text-secondary)" }}>
              <summary className="cursor-pointer hover:text-white transition-colors font-medium">
                📋 Raw JSON Response
              </summary>
              <pre className="mt-3 overflow-x-auto leading-relaxed">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <div className="glass-card p-10 text-center space-y-3">
            <div className="text-4xl">🔍</div>
            <p className="font-medium" style={{ color: "var(--text-secondary)" }}>
              Nhập link đối thủ và chọn chế độ phân tích để bắt đầu
            </p>
            <p className="text-xs" style={{ color: "var(--text-secondary)", opacity: 0.6 }}>
              Kết quả sẽ hiển thị ở đây sau khi phân tích hoàn tất
            </p>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t py-3 text-center text-xs"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
        AI Content & Scraping Tool · Phase 2.5 · Backend:{" "}
        <code className="font-mono">localhost:8000</code>
      </footer>
    </div>
  );
}
