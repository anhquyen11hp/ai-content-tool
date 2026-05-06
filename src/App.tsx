import { useState, useEffect, useRef, useMemo } from "react";
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
  comment_count: number;
  competitor_angle: string;
  customer_objections: string[];
  faq_from_comments: string[];
  winning_script_ideas: string[];
  video_details?: VideoDetail[];
}

type AnalyzeResult = CreatorResult | EcomResult;

// Script Generator types
interface ScriptScene {
  time: string;
  visual: string;
  audio: string;
}

interface ScriptResult {
  video_title: string;
  script_scenes: ScriptScene[];
  director_tips: string[];
}

const API_BASE = "http://127.0.0.1:8000";

const SCAN_OPTIONS = [30, 50, 80];
const ANALYZE_OPTIONS = [3, 5, 8];

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
  { icon: "💬", text: "Đang tải lời thoại và quét bình luận..." },
  { icon: "🤖", text: "Whisper AI đang bóc băng lời thoại..." },
  { icon: "🔍", text: "Đang phân tích bình luận khách hàng..." },
  { icon: "✨", text: "GPT đang bóc tách insight thị trường..." },
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
  // Split content by video markers like "Video 1:", "Video 2:", "--- Video", etc.
  const sections = content.split(/(?=(?:Video|VIDEO)\s*\d)/gi).filter(s => s.trim());
  const hasMultipleSections = sections.length > 1;

  return (
    <div className="glass-card p-5 space-y-3 fade-in-up">
      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: accentColor }}>
        {label}
      </div>
      {hasMultipleSections ? (
        <div className="space-y-3">
          {sections.map((section, i) => (
            <div
              key={i}
              className="p-3 rounded-xl text-sm leading-relaxed whitespace-pre-line"
              style={{
                background: "rgba(255,255,255,0.03)",
                borderLeft: `3px solid ${accentColor}`,
                color: "var(--text-primary)",
              }}
            >
              {section.trim()}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "var(--text-primary)" }}>
          {content}
        </p>
      )}
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

// ─── Script Generator Component ──────────────────────────────────────────────

function ScriptGenerator({
  analysisResult,
  accentColor,
}: {
  analysisResult: AnalyzeResult;
  accentColor: string;
}) {
  const [productName, setProductName] = useState("");
  const [usp, setUsp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [script, setScript] = useState<ScriptResult | null>(null);

  async function handleGenerate() {
    if (!productName.trim() || !usp.trim()) {
      setError("⚠️ Vui lòng nhập đầy đủ Tên sản phẩm và Điểm khác biệt (USP).");
      return;
    }

    setError(null);
    setScript(null);
    setLoading(true);

    try {
      // Build the competitor_analysis object from current analysis result
      const competitorAnalysis: Record<string, unknown> = {};
      if (analysisResult.mode === "creator") {
        const cr = analysisResult as CreatorResult;
        competitorAnalysis.hook_analysis = cr.hook_analysis;
        competitorAnalysis.content_structure = cr.content_structure;
        competitorAnalysis.new_hook_ideas = cr.new_hook_ideas;
        competitorAnalysis.pain_points = cr.pain_points;
      } else {
        const er = analysisResult as EcomResult;
        competitorAnalysis.competitor_angle = er.competitor_angle;
        competitorAnalysis.customer_objections = er.customer_objections;
        competitorAnalysis.faq_from_comments = er.faq_from_comments;
        competitorAnalysis.winning_script_ideas = er.winning_script_ideas;
      }

      const res = await fetch(`${API_BASE}/api/generate-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: productName.trim(),
          usp: usp.trim(),
          competitor_analysis: competitorAnalysis,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.status === "error") {
        throw new Error(data.message || `Lỗi server: ${res.status}`);
      }

      setScript(data.script as ScriptResult);
    } catch (err) {
      setError(
        err instanceof Error
          ? `❌ ${err.message}`
          : "❌ Không thể tạo kịch bản. Vui lòng thử lại."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="script-generator-section fade-in-up">
      {/* Section Header */}
      <div className="script-section-header">
        <div className="script-section-icon">🎬</div>
        <div>
          <h2 className="script-section-title">Hành Động: Biến Phân Tích Thành Kịch Bản</h2>
          <p className="script-section-subtitle">
            Nhập thông tin sản phẩm của bạn → AI sẽ kết hợp với báo cáo phân tích đối thủ ở trên để tạo kịch bản quay chi tiết từng giây.
          </p>
        </div>
      </div>

      {/* Input Form */}
      <div className="script-form">
        <div className="script-input-group">
          <label className="script-label" htmlFor="product-name-input">
            🏷️ Tên sản phẩm / Dịch vụ của bạn
          </label>
          <input
            id="product-name-input"
            type="text"
            value={productName}
            disabled={loading}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="Ví dụ: Kem chống nắng La Roche-Posay"
            className="script-input"
          />
        </div>

        <div className="script-input-group">
          <label className="script-label" htmlFor="usp-input">
            ⭐ Điểm khác biệt / Lợi ích lớn nhất (USP)
          </label>
          <input
            id="usp-input"
            type="text"
            value={usp}
            disabled={loading}
            onChange={(e) => setUsp(e.target.value)}
            placeholder="Ví dụ: Không bết rít, kiềm dầu 8 tiếng"
            className="script-input"
          />
        </div>

        <button
          id="btn-generate-script"
          onClick={handleGenerate}
          disabled={loading || !productName.trim() || !usp.trim()}
          className="script-generate-btn"
          style={{
            background: loading
              ? "rgba(255,255,255,0.05)"
              : `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`,
            borderColor: accentColor,
          }}
        >
          {loading ? (
            <>
              <span className="script-btn-spinner" style={{ borderTopColor: accentColor }} />
              <span>Đang tạo kịch bản...</span>
            </>
          ) : (
            <>
              <span>🔥</span>
              <span>Tạo Kịch Bản Quay Chi Tiết</span>
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="glass-card p-4 text-sm fade-in-up"
             style={{ borderColor: "rgba(239,68,68,0.3)", color: "#fca5a5" }}>
          {error}
        </div>
      )}

      {/* Script Result */}
      {script && (
        <div className="script-result fade-in-up">
          {/* Video Title */}
          <div className="script-title-card" style={{ borderLeftColor: accentColor }}>
            <div className="script-title-badge" style={{ background: `${accentColor}20`, color: accentColor }}>
              🎬 Tiêu đề Video
            </div>
            <h3 className="script-video-title">{script.video_title}</h3>
          </div>

          {/* Script Scenes Table */}
          <div className="script-table-wrapper">
            <table className="script-table">
              <thead>
                <tr>
                  <th style={{ width: "100px" }}>
                    <span className="script-th-icon">⏱️</span> Thời gian
                  </th>
                  <th>
                    <span className="script-th-icon">📸</span> Hình ảnh / Hành động
                  </th>
                  <th>
                    <span className="script-th-icon">🎙️</span> Lời thoại
                  </th>
                </tr>
              </thead>
              <tbody>
                {script.script_scenes.map((scene, i) => (
                  <tr key={i} className="script-table-row" style={{ animationDelay: `${i * 100}ms` }}>
                    <td className="script-time-cell">
                      <span className="script-time-badge" style={{ background: `${accentColor}18`, color: accentColor, borderColor: `${accentColor}40` }}>
                        {scene.time}
                      </span>
                    </td>
                    <td className="script-visual-cell">{scene.visual}</td>
                    <td className="script-audio-cell">{scene.audio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Director Tips */}
          {script.director_tips && script.director_tips.length > 0 && (
            <div className="script-tips-card">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🎯</span>
                <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#fbbf24" }}>
                  Mẹo từ Đạo diễn AI
                </h4>
              </div>
              <div className="script-tips-grid">
                {script.director_tips.map((tip, i) => (
                  <div key={i} className="script-tip-item fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
                    <span className="script-tip-number" style={{ background: `${accentColor}22`, color: accentColor }}>
                      {i + 1}
                    </span>
                    <span className="script-tip-text">{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
           📹 Đã quét {result.total_scanned} video · Phân tích Top {result.video_details?.length || 0}
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

      {/* Script Generator Section */}
      <ScriptGenerator analysisResult={result} accentColor="var(--accent-creator)" />
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
        {result.comment_count > 0 && (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
            style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}
          >
            💬 {result.comment_count} bình luận đã phân tích
          </div>
        )}
      </div>

      {/* Video title or Search Results */}
      <div className="glass-card p-4 border-l-4" style={{ borderLeftColor: "var(--accent-ecom)" }}>
        <p className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
          {result.title || "Video không có tiêu đề"}
        </p>

        {result.video_details && result.video_details.length > 0 ? (
          <div className="mt-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
              📹 Top {result.video_details.length} video đã trích xuất
            </h3>
            {result.video_details.map((v, i) => (
              <VideoCard key={i} video={v} index={i} />
            ))}
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Competitor Angle — premium highlight card */}
      {result.competitor_angle && (
        <div className="glass-card p-5 fade-in-up" style={{ borderLeft: "4px solid var(--accent-ecom)" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🎯</span>
            <h3
              className="font-semibold text-sm tracking-wide uppercase"
              style={{ color: "var(--accent-ecom)" }}
            >
              Góc bán hàng của đối thủ
            </h3>
          </div>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--text-primary)" }}
          >
            {result.competitor_angle}
          </p>
        </div>
      )}

      {/* Customer Objections + FAQ from Comments — two premium columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Customer Objections */}
        <div
          className="glass-card p-5 fade-in-up h-full"
          style={{
            borderTop: "3px solid #f87171",
            background: "linear-gradient(180deg, rgba(248,113,113,0.06) 0%, rgba(255,255,255,0.02) 100%)",
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
              style={{ background: "rgba(248,113,113,0.15)" }}
            >
              🚫
            </span>
            <div>
              <h3 className="font-semibold text-sm" style={{ color: "#fca5a5" }}>
                Cản trở mua hàng
              </h3>
              <p className="text-xs" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
                Từ bình luận khách hàng
              </p>
            </div>
            <span
              className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(248,113,113,0.15)", color: "#f87171" }}
            >
              {result.customer_objections?.length || 0}
            </span>
          </div>
          <ul className="space-y-2">
            {(result.customer_objections || []).map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm p-3 rounded-xl"
                style={{ background: "rgba(248,113,113,0.05)" }}
              >
                <span
                  className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                  style={{ background: "rgba(248,113,113,0.2)", color: "#f87171" }}
                >
                  {i + 1}
                </span>
                <span style={{ color: "var(--text-primary)" }}>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* FAQ from Comments */}
        <div
          className="glass-card p-5 fade-in-up h-full"
          style={{
            animationDelay: "80ms",
            borderTop: "3px solid #38bdf8",
            background: "linear-gradient(180deg, rgba(56,189,248,0.06) 0%, rgba(255,255,255,0.02) 100%)",
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
              style={{ background: "rgba(56,189,248,0.15)" }}
            >
              ❓
            </span>
            <div>
              <h3 className="font-semibold text-sm" style={{ color: "#7dd3fc" }}>
                Câu hỏi thường gặp
              </h3>
              <p className="text-xs" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
                Khách hàng hay hỏi gì?
              </p>
            </div>
            <span
              className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(56,189,248,0.15)", color: "#38bdf8" }}
            >
              {result.faq_from_comments?.length || 0}
            </span>
          </div>
          <ul className="space-y-2">
            {(result.faq_from_comments || []).map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm p-3 rounded-xl"
                style={{ background: "rgba(56,189,248,0.05)" }}
              >
                <span
                  className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                  style={{ background: "rgba(56,189,248,0.2)", color: "#38bdf8" }}
                >
                  {i + 1}
                </span>
                <span style={{ color: "var(--text-primary)" }}>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Winning Script Ideas */}
      <ListCard
        title="Ý tưởng kịch bản chiến thắng"
        icon="🏆"
        items={result.winning_script_ideas || []}
        accentColor="#fbbf24"
      />

      {/* Script Generator Section */}
      <ScriptGenerator analysisResult={result} accentColor="var(--accent-ecom)" />
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
  const [scanLimit, setScanLimit] = useState(30);
  const [analyzeLimit, setAnalyzeLimit] = useState(3);
  const [userCredits, setUserCredits] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch credits on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/credits`)
      .then(r => r.json())
      .then(d => setUserCredits(d.credits))
      .catch(() => setUserCredits(null));
  }, []);

  // Detect input type: channel URL, video URL, or keyword/hashtag
  function detectInputType(value: string): "channel" | "video" | "keyword" {
    const trimmed = value.trim();
    if (!trimmed) return "keyword"; // default empty to keyword so panel shows
    // Check if it looks like a URL
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("www.")) {
      if (trimmed.includes("/video/") || trimmed.includes("watch?v=") || trimmed.includes("/shorts/")) {
        return "video";
      }
      if (trimmed.includes("@")) {
        return "channel";
      }
      return "video"; // Default URL → video
    }
    // Not a URL → keyword or hashtag
    return "keyword";
  }

  const currentInputType = detectInputType(url);
  const isKeyword = currentInputType === "keyword";
  const isChannel = currentInputType === "channel";
  const showConfigPanel = isKeyword || isChannel;

  const configColorHex = isKeyword ? "14,165,233" : "124,58,237"; // blue vs purple
  const configColorText = isKeyword ? "#7dd3fc" : "#c4b5fd";

  const configTitle = isKeyword ? "Tùy chỉnh tìm kiếm từ khóa" : "Tùy chỉnh quét kênh";

  // Credit cost calculator
  const estimatedCost = useMemo(() => {
    if (isKeyword || activeMode === "creator" || isChannel) {
      return 10 + (analyzeLimit * 5);
    }
    return 15;
  }, [analyzeLimit, isKeyword, activeMode, isChannel]);

  // Ensure analyzeLimit never exceeds scanLimit
  useEffect(() => {
    if (analyzeLimit > scanLimit) {
      // pick the largest ANALYZE_OPTIONS value that fits
      const valid = ANALYZE_OPTIONS.filter(v => v <= scanLimit);
      setAnalyzeLimit(valid.length > 0 ? valid[valid.length - 1] : ANALYZE_OPTIONS[0]);
    }
  }, [scanLimit, analyzeLimit]);



  async function handleAnalyze(mode: Mode) {
    if (!url.trim()) {
      setError("⚠️ Vui lòng nhập link kênh, video, hoặc từ khóa/hashtag trước khi phân tích.");
      inputRef.current?.focus();
      return;
    }

    const value = url.trim();
    const input_type = detectInputType(value);
    console.log("Input Type detected:", input_type, "Value:", value);

    setError(null);
    setResult(null);
    setActiveMode(mode);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: value,
          mode,
          input_type,
          scan_limit: (mode === "creator" || (mode === "ecom" && input_type === "keyword")) ? scanLimit : undefined,
          analyze_limit: (mode === "creator" || (mode === "ecom" && input_type === "keyword")) ? analyzeLimit : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.status === "error") {
        throw new Error(data.message || `Lỗi server: ${res.status}`);
      }

      setResult(data as AnalyzeResult);

      // Update credit balance from response
      if (data.credits_remaining !== undefined) {
        setUserCredits(data.credits_remaining);
      }
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
          <div className="ml-auto flex items-center gap-3">
            {/* Credit badge */}
            {userCredits !== null && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                style={{
                  background: userCredits > 20 ? "rgba(52,211,153,0.12)" : "rgba(239,68,68,0.15)",
                  color: userCredits > 20 ? "#6ee7b7" : "#fca5a5",
                  border: `1px solid ${userCredits > 20 ? "rgba(52,211,153,0.3)" : "rgba(239,68,68,0.3)"}`,
                }}
              >
                💰 {userCredits} Xu
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>v3.1 · API Ready</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8 space-y-6">

        {/* Input section */}
        <div className="glass-card p-6 space-y-5">
          <div>
            <label htmlFor="url-input" className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              🔗 Link kênh / Video / Từ khóa / Hashtag
            </label>
            <input
              id="url-input"
              ref={inputRef}
              type="text"
              value={url}
              disabled={loading}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://tiktok.com/@kênh  ·  link /video/  ·  #xuhuong  ·  máy hút bụi"
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
              Tip: <strong>@kênh</strong> → Xây Kênh &nbsp;|&nbsp; <strong>/video/</strong> → Bán Hàng &nbsp;|&nbsp; <strong>#hashtag</strong> hoặc <strong>từ khóa</strong> → Bán Hàng (tìm kiếm)
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

          {/* ── Config Panel ── */}
          {showConfigPanel && (
          <div
            className="rounded-xl p-5 space-y-4 transition-all duration-300"
            style={{
              background: `rgba(${configColorHex},0.06)`,
              border: `1px solid rgba(${configColorHex},0.2)`,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">⚙️</span>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: configColorText }}>
                {configTitle}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Scan Limit */}
              <div className="space-y-2">
                <label className="block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  📡 Số video lướt qua (Quét bề mặt)
                </label>
                <div className="flex gap-2">
                  {SCAN_OPTIONS.map((val) => (
                    <button
                      key={val}
                      onClick={() => setScanLimit(val)}
                      disabled={loading}
                      className="flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-200 disabled:opacity-40"
                      style={{
                        background: scanLimit === val ? `rgba(${configColorHex},0.35)` : "rgba(255,255,255,0.04)",
                        border: scanLimit === val ? `1px solid rgba(${configColorHex},0.6)` : "1px solid var(--border)",
                        color: scanLimit === val ? configColorText : "var(--text-secondary)",
                        boxShadow: scanLimit === val ? `0 0 12px rgba(${configColorHex},0.2)` : "none",
                      }}
                    >
                      {val} video
                    </button>
                  ))}
                </div>
              </div>

              {/* Analyze Limit */}
              <div className="space-y-2">
                <label className="block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  🔬 Số video mổ xẻ (Bóc băng & AI)
                </label>
                <div className="flex gap-2">
                  {ANALYZE_OPTIONS.map((val) => {
                    const disabled = loading || val > scanLimit;
                    return (
                      <button
                        key={val}
                        onClick={() => !disabled && setAnalyzeLimit(val)}
                        disabled={disabled}
                        className="flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-200 disabled:opacity-25 disabled:cursor-not-allowed"
                        style={{
                          background: analyzeLimit === val ? `rgba(${configColorHex},0.35)` : "rgba(255,255,255,0.04)",
                          border: analyzeLimit === val ? `1px solid rgba(${configColorHex},0.6)` : "1px solid var(--border)",
                          color: analyzeLimit === val ? configColorText : "var(--text-secondary)",
                          boxShadow: analyzeLimit === val ? `0 0 12px rgba(${configColorHex},0.2)` : "none",
                        }}
                      >
                        Top {val}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Cost display */}
            <div
              className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{
                background: `linear-gradient(135deg, rgba(${configColorHex},0.12), rgba(${configColorHex},0.04))`,
                border: `1px solid rgba(${configColorHex},0.2)`,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">💰</span>
                <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Chi phí dự kiến
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="text-lg font-extrabold tracking-tight"
                  style={{ color: "#fbbf24" }}
                >
                  {estimatedCost} Xu
                </span>
                <span className="text-xs" style={{ color: "var(--text-secondary)", opacity: 0.6 }}>
                  = 10 + ({analyzeLimit} × 5)
                </span>
              </div>
            </div>
          </div>
          )}
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
        AI Content & Scraping Tool · Phase 3.1 · GPT-4o-mini + Whisper · Backend:{" "}
        <code className="font-mono">localhost:8000</code>
      </footer>
    </div>
  );
}
