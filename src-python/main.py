from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Literal, Optional

app = FastAPI(title="AI Content & Scraping Tool API", version="2.5.0")

# Allow requests from the Vite dev server (localhost:1420 is Tauri default)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420", "http://127.0.0.1:1420", "http://localhost:5173", "tauri://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    url: str
    mode: Literal["creator", "ecom"]


@app.get("/")
def root():
    return {"message": "AI Content & Scraping Tool API is running 🚀 (v2.5)"}


import services.tiktok_service as tiktok_service


def _is_channel_url(url: str) -> bool:
    """
    Phân biệt link kênh vs link video.
    Link video TikTok chứa /video/ trong đường dẫn.
    Link kênh TikTok chứa @ nhưng KHÔNG có /video/.
    """
    has_video_path = "/video/" in url
    has_profile = "@" in url
    # YouTube channel: /channel/ hoặc /@username nhưng không có /watch?
    is_youtube_watch = "watch?v=" in url or "/shorts/" in url
    if is_youtube_watch:
        return False
    if has_video_path:
        return False
    if has_profile:
        return True
    return False


@app.post("/api/analyze")
def analyze(body: AnalyzeRequest):
    """
    Phase 2.5 — Dual-Mode Analyze.
    - Link Video  → Chế độ Bán Hàng  (download + Whisper)
    - Link Kênh   → Chế độ Xây Kênh  (get top-3 videos + Whisper x3 + GPT analysis)
    """
    url = body.url.strip()

    # ─── TRƯỜNG HỢP 2: Link Kênh – Chế độ Xây Kênh ─────────────────────────
    if _is_channel_url(url):
        # Bước 2a: Lấy danh sách 30 video, chọn Top 3 nhiều view nhất
        channel_result = tiktok_service.get_channel_videos(url, max_videos=30)

        if channel_result.get("status") == "error":
            return {
                "status": "error",
                "message": f"Lỗi quét kênh: {channel_result.get('message')}"
            }

        videos = channel_result.get("videos", [])
        if not videos:
            return {
                "status": "error",
                "message": "Không tìm thấy video nào trên kênh này."
            }

        # Lấy top 3 (đã được sort giảm dần theo view trong service)
        top_videos = videos[:3]

        # Bước 2b: Vòng lặp bóc băng Top 3 video
        transcripts = []
        video_details = []

        for video in top_videos:
            video_url = video.get("url")
            if not video_url:
                continue

            # Tải audio
            dl_result = tiktok_service.download_tiktok_audio(video_url)
            if dl_result.get("status") == "error":
                # Bỏ qua video lỗi, không dừng toàn bộ pipeline
                video_details.append({
                    "url": video_url,
                    "title": video.get("title", ""),
                    "view_count": video.get("view_count", 0),
                    "transcript": f"[Lỗi tải: {dl_result.get('message')}]"
                })
                continue

            # Bóc băng Whisper
            ts_result = tiktok_service.transcribe_audio(dl_result["file_path"])
            transcript_text = (
                ts_result.get("transcript", "")
                if ts_result.get("status") == "success"
                else f"[Lỗi bóc băng: {ts_result.get('message')}]"
            )

            transcripts.append(transcript_text)
            video_details.append({
                "url": video_url,
                "title": video.get("title", dl_result.get("title", "")),
                "view_count": video.get("view_count", dl_result.get("view_count", 0)),
                "transcript": transcript_text
            })

        # Bước 2c: Gộp transcript và phân tích bằng GPT
        combined_transcripts = "\n\n---\n\n".join(
            [f"VIDEO {i+1} ({vd['view_count']:,} views) - {vd['title']}:\n{vd['transcript']}"
             for i, vd in enumerate(video_details)]
        )

        gpt_result = tiktok_service.analyze_channel_prompt(combined_transcripts)

        if gpt_result.get("status") == "error":
            return {
                "status": "error",
                "message": f"Lỗi phân tích GPT: {gpt_result.get('message')}"
            }

        # Bước 2d: Trả kết quả cho Frontend
        return {
            "status": "success",
            "mode": "creator",
            "analyzed_url": url,
            "channel_mode": True,
            "total_scanned": len(videos),
            "video_details": video_details,
            "hook_ideas": gpt_result.get("hook_ideas", []),
            "pain_points": gpt_result.get("pain_points", []),
        }

    # ─── TRƯỜNG HỢP 1: Link Video – Chế độ Bán Hàng ────────────────────────
    else:
        # 1. Download audio và lấy metadata
        dl_result = tiktok_service.download_tiktok_audio(url)

        if dl_result.get("status") == "error":
            return {
                "status": "error",
                "message": f"Lỗi tải video: {dl_result.get('message')}"
            }

        file_path = dl_result["file_path"]
        title = dl_result.get("title", "")
        view_count = dl_result.get("view_count", 0)

        # 2. Bóc băng Whisper
        ts_result = tiktok_service.transcribe_audio(file_path)

        if ts_result.get("status") == "error":
            return {
                "status": "error",
                "message": f"Lỗi bóc băng: {ts_result.get('message')}"
            }

        transcript = ts_result.get("transcript", "")

        return {
            "status": "success",
            "mode": "ecom",
            "analyzed_url": url,
            "channel_mode": False,
            "title": title,
            "view_count": view_count,
            "transcript": transcript,
            # Placeholder cho Phase 3 (AI content generation)
            "hook_ideas": ["(Sẽ có ở Giai đoạn 3)"],
            "pain_points": ["(Sẽ có ở Giai đoạn 3)"]
        }
