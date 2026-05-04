from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Literal

import services.tiktok_service as tiktok_service
import services.ai_service as ai_service

app = FastAPI(title="AI Content & Scraping Tool API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "http://localhost:5173",
        "tauri://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    url: str
    mode: Literal["creator", "ecom"]


@app.get("/")
def root():
    return {"message": "AI Content & Scraping Tool API is running 🚀 (v3.0)"}


def _is_channel_url(url: str) -> bool:
    """
    Phân biệt link kênh vs link video đơn lẻ.
    """
    if "watch?v=" in url or "/shorts/" in url:
        return False
    if "/video/" in url:
        return False
    if "@" in url:
        return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT CHÍNH
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/analyze")
def analyze(body: AnalyzeRequest):
    """
    Phase 3 — Full AI Pipeline (Dual-Mode).

    CHẾ ĐỘ XÂY KÊNH  (Creator / Link Kênh):
        1. Lấy 30 video mới nhất từ kênh → Sort top 3 theo view
        2. Tải audio + Whisper x3 → Gộp transcripts
        3. GPT phân tích → hook_analysis, content_structure, new_hook_ideas, pain_points

    CHẾ ĐỘ BÁN HÀNG (E-Com / Link Video):
        1. Tải audio 1 video → Whisper
        2. GPT phân tích → selling_points, customer_pain_points_addressed,
                           sales_script_ideas, hook_ideas
    """
    url = body.url.strip()
    mode = body.mode

    # ── TRƯỜNG HỢP 1: Link Kênh – Chế độ Xây Kênh ──────────────────────────
    if _is_channel_url(url):

        # Bước 1: Lấy danh sách video
        channel_result = tiktok_service.get_channel_videos(url, max_videos=30)
        if channel_result.get("status") == "error":
            return {"status": "error", "message": f"Lỗi quét kênh: {channel_result.get('message')}"}

        videos = channel_result.get("videos", [])
        if not videos:
            return {"status": "error", "message": "Không tìm thấy video nào trên kênh này."}

        # Bước 2: Bóc băng Top 3
        top_videos = videos[:3]
        transcripts = []
        video_details = []

        for video in top_videos:
            video_url = video.get("url")
            if not video_url:
                continue

            dl_result = tiktok_service.download_tiktok_audio(video_url)
            if dl_result.get("status") == "error":
                video_details.append({
                    "url": video_url,
                    "title": video.get("title", ""),
                    "view_count": video.get("view_count", 0),
                    "transcript": f"[Lỗi tải: {dl_result.get('message')}]"
                })
                continue

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

        # Bước 3: GPT phân tích (mode = "creator")
        ai_result = ai_service.analyze_content(transcripts, mode="creator")
        if ai_result.get("status") == "error":
            return {"status": "error", "message": f"Lỗi phân tích AI: {ai_result.get('message')}"}

        data = ai_result.get("data", {})

        return {
            "status": "success",
            "mode": "creator",
            "analyzed_url": url,
            "total_scanned": len(videos),
            "video_details": video_details,
            # Creator-specific fields
            "hook_analysis": data.get("hook_analysis", ""),
            "content_structure": data.get("content_structure", ""),
            "new_hook_ideas": data.get("new_hook_ideas", []),
            "pain_points": data.get("pain_points", []),
        }

    # ── TRƯỜNG HỢP 2: Link Video – Chế độ Bán Hàng ─────────────────────────
    else:
        # Bước 1: Tải audio
        dl_result = tiktok_service.download_tiktok_audio(url)
        if dl_result.get("status") == "error":
            return {"status": "error", "message": f"Lỗi tải video: {dl_result.get('message')}"}

        # Bước 2: Bóc băng Whisper
        ts_result = tiktok_service.transcribe_audio(dl_result["file_path"])
        if ts_result.get("status") == "error":
            return {"status": "error", "message": f"Lỗi bóc băng: {ts_result.get('message')}"}

        transcript = ts_result.get("transcript", "")

        # Bước 3: GPT phân tích (mode = "ecom")
        ai_result = ai_service.analyze_content([transcript], mode="ecom")
        if ai_result.get("status") == "error":
            return {"status": "error", "message": f"Lỗi phân tích AI: {ai_result.get('message')}"}

        data = ai_result.get("data", {})

        return {
            "status": "success",
            "mode": "ecom",
            "analyzed_url": url,
            "title": dl_result.get("title", ""),
            "view_count": dl_result.get("view_count", 0),
            "transcript": transcript,
            # E-com specific fields
            "selling_points": data.get("selling_points", []),
            "customer_pain_points_addressed": data.get("customer_pain_points_addressed", []),
            "sales_script_ideas": data.get("sales_script_ideas", []),
            "hook_ideas": data.get("hook_ideas", []),
        }
