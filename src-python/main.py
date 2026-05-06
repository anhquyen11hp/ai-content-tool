import sys
import io

# Fix Windows cp1252 encoding crash — force UTF-8 for all print() output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import asyncio
import json
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Literal, Optional

import services.tiktok_service as tiktok_service
import services.ai_service as ai_service

app = FastAPI(title="AI Content & Scraping Tool API", version="4.0.0")

# ─── Thread Pool cho các tác vụ blocking (yt-dlp, ffmpeg, Whisper) ────────────
# max_workers=5 cho phép xử lý tối đa 5 video cùng lúc
executor = ThreadPoolExecutor(max_workers=5)

# ─── MOCK CREDIT SYSTEM ──────────────────────────────────────────────────────
# Biến giả lập số Xu của user (sẽ thay bằng DB thật sau)
user_credits = 100

def calculate_cost(mode: str, analyze_limit: int = 3, input_type: str = "video") -> int:
    """Tính chi phí Xu cho mỗi lần phân tích."""
    if mode == "creator" or (mode == "ecom" and input_type == "keyword"):
        return 10 + (analyze_limit * 5)
    else:  # ecom with single video
        return 15  # Flat cost cho bán hàng

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
    input_type: Optional[str] = None  # "channel", "video", "keyword" — gửi từ frontend
    scan_limit: Optional[int] = 30
    analyze_limit: Optional[int] = 3


@app.get("/")
def root():
    return {"message": "AI Content & Scraping Tool API is running (v4.0 - Async)"}


@app.get("/api/credits")
def get_credits():
    """Trả về số Xu hiện tại của user."""
    return {"credits": user_credits}


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


def _detect_input_type(url: str) -> str:
    """
    Fallback: Tự nhận diện loại input nếu frontend không gửi input_type.
    """
    trimmed = url.strip()
    if trimmed.startswith("http://") or trimmed.startswith("https://") or trimmed.startswith("www."):
        if "/video/" in trimmed or "watch?v=" in trimmed or "/shorts/" in trimmed:
            return "video"
        if "@" in trimmed:
            return "channel"
        return "video"
    return "keyword"


# ─────────────────────────────────────────────────────────────────────────────
# HÀM XỬ LÝ SONG SONG CHO 1 VIDEO (download → transcribe)
# ─────────────────────────────────────────────────────────────────────────────

def _process_single_video(video: dict) -> dict:
    """
    Pipeline xử lý 1 video: Download audio → Transcribe.
    Hàm blocking, sẽ được chạy trong ThreadPool.
    """
    video_url = video.get("url")
    if not video_url:
        return {
            "url": "",
            "title": video.get("title", ""),
            "view_count": video.get("view_count", 0),
            "transcript": "[Khong co URL]",
            "success": False
        }

    print(f"  [PARALLEL] Bat dau xu ly: {video_url[:60]}...")

    # Bước 1: Tải audio
    dl_result = tiktok_service.download_tiktok_audio(video_url)
    if dl_result.get("status") == "error":
        print(f"  [PARALLEL] LOI tai: {dl_result.get('message', '')[:80]}")
        return {
            "url": video_url,
            "title": video.get("title", ""),
            "view_count": video.get("view_count", 0),
            "transcript": f"[Loi tai: {dl_result.get('message')}]",
            "success": False
        }

    # Bước 2: Bóc băng Whisper
    ts_result = tiktok_service.transcribe_audio(dl_result["file_path"])
    if ts_result.get("status") == "success":
        transcript_text = ts_result.get("transcript", "")
        print(f"  [PARALLEL] XONG: {video_url[:60]} ({len(transcript_text)} ky tu)")
    else:
        transcript_text = f"[Loi boc bang: {ts_result.get('message')}]"
        print(f"  [PARALLEL] LOI boc bang: {ts_result.get('message', '')[:80]}")

    return {
        "url": video_url,
        "title": video.get("title", dl_result.get("title", "")),
        "view_count": video.get("view_count", dl_result.get("view_count", 0)),
        "transcript": transcript_text,
        "success": ts_result.get("status") == "success"
    }

def _process_single_video_ecom(video: dict) -> dict:
    """
    Pipeline xử lý 1 video Ecom: Download audio -> Lấy comments -> Transcribe.
    """
    video_url = video.get("url")
    if not video_url:
        return {"success": False}

    print(f"  [PARALLEL-ECOM] Bat dau xu ly: {video_url[:60]}...")

    # Bước 1: Tải audio
    dl_result = tiktok_service.download_tiktok_audio(video_url)
    if dl_result.get("status") == "error":
        return {"success": False}

    # Bước 2: Lấy bình luận
    comments_result = tiktok_service.fetch_video_comments(video_url)
    comments_data = comments_result.get("comments_text", "")
    comment_count = comments_result.get("comment_count", 0)

    # Bước 3: Bóc băng Whisper
    ts_result = tiktok_service.transcribe_audio(dl_result["file_path"])
    transcript_text = ts_result.get("transcript", "") if ts_result.get("status") == "success" else ""

    return {
        "url": video_url,
        "title": video.get("title", dl_result.get("title", "")),
        "view_count": video.get("view_count", 0),
        "transcript": transcript_text,
        "comments": comments_data,
        "comment_count": comment_count,
        "success": ts_result.get("status") == "success"
    }


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT CHÍNH (ASYNC)
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/analyze")
async def analyze(body: AnalyzeRequest):
    """
    Phase 4.0 — Async Parallel Pipeline (Dual-Mode) với Credit System.

    CHẾ ĐỘ XÂY KÊNH  (Creator / Link Kênh):
        1. Lấy [scan_limit] video mới nhất từ kênh → Sort top [analyze_limit] theo view
        2. Tải audio + Whisper ĐỒNG THỜI (asyncio + ThreadPool)
        3. GPT phân tích → hook_analysis, content_structure, new_hook_ideas, pain_points

    CHẾ ĐỘ BÁN HÀNG (E-Com / Link Video):
        1. Tải audio 1 video → Whisper
        2. GPT phân tích → selling_points, customer_pain_points_addressed,
                           sales_script_ideas, hook_ideas
    """
    global user_credits

    url = body.url.strip()
    mode = body.mode
    scan_limit = body.scan_limit or 30
    analyze_limit = body.analyze_limit or 3

    # Clamp giá trị hợp lệ
    scan_limit = max(1, min(scan_limit, 100))
    analyze_limit = max(1, min(analyze_limit, scan_limit))

    # ── Tính chi phí Xu ──────────────────────────────────────────────────────
    input_type = body.input_type or _detect_input_type(url)
    cost = calculate_cost(mode, analyze_limit, input_type)
    credits_before = user_credits

    if user_credits < cost:
        return {
            "status": "error",
            "message": f"Khong du Xu! Can {cost} Xu nhung chi con {user_credits} Xu."
        }

    # Trừ xu
    user_credits -= cost
    print(f"\n{'='*60}")
    print(f"[CREDIT] CREDIT LOG")
    print(f"   Yeu cau quet {scan_limit}, phan tich {analyze_limit}.")
    print(f"   Chi phi: {cost} Xu.")
    print(f"   So du truoc: {credits_before}, So du sau: {user_credits}")
    print(f"{'='*60}\n")

    # ── TRƯỜNG HỢP 1: Chế độ Xây Kênh (Yêu cầu Link Kênh) ──────────────────
    if mode == "creator":
        if not _is_channel_url(url):
            # Hoàn xu vì chưa thực hiện
            user_credits += cost
            return {"status": "error", "message": "Vui long nhap link Kenh (co chua @) cho Che do Xay Kenh."}

        # Bước 1: Lấy danh sách video (blocking, chạy trong thread)
        loop = asyncio.get_event_loop()
        channel_result = await loop.run_in_executor(
            executor,
            tiktok_service.get_channel_videos,
            url,
            scan_limit
        )

        if channel_result.get("status") == "error":
            user_credits += cost  # Hoàn xu
            return {"status": "error", "message": f"Loi quet kenh: {channel_result.get('message')}"}

        videos = channel_result.get("videos", [])
        if not videos:
            user_credits += cost  # Hoàn xu
            return {"status": "error", "message": "Khong tim thay video nao tren kenh nay."}

        # Bước 2: Bóc băng Top N SONG SONG (asyncio.gather + ThreadPool)
        actual_analyze = min(analyze_limit, len(videos))
        top_videos = videos[:actual_analyze]

        print(f"\n[ASYNC] Bat dau xu ly SONG SONG {actual_analyze} video...")

        # Tạo danh sách coroutine, mỗi video chạy trong thread riêng
        tasks = [
            loop.run_in_executor(executor, _process_single_video, video)
            for video in top_videos
        ]

        # Chạy tất cả cùng lúc, chờ toàn bộ xong
        results = await asyncio.gather(*tasks)

        print(f"[ASYNC] XONG tat ca {len(results)} video!\n")

        # Gom kết quả
        transcripts = []
        video_details = []

        for r in results:
            if r.get("success"):
                transcripts.append(r["transcript"])
            video_details.append({
                "url": r["url"],
                "title": r["title"],
                "view_count": r["view_count"],
                "transcript": r["transcript"]
            })

        # Bước 3: GPT phân tích (blocking → thread)
        ai_result = await loop.run_in_executor(
            executor,
            ai_service.analyze_content,
            transcripts,
            mode
        )
        if ai_result.get("status") == "error":
            return {"status": "error", "message": f"Loi phan tich AI: {ai_result.get('message')}"}

        data = ai_result.get("data", {})

        return {
            "status": "success",
            "mode": mode,
            "analyzed_url": url,
            "total_scanned": len(videos),
            "total_analyzed": len(video_details),
            "credits_used": cost,
            "credits_remaining": user_credits,
            "video_details": video_details,
            # Creator-specific fields
            "hook_analysis": data.get("hook_analysis", ""),
            "content_structure": data.get("content_structure", ""),
            "new_hook_ideas": data.get("new_hook_ideas", []),
            "pain_points": data.get("pain_points", []),
        }

    # ── TRƯỜNG HỢP 2: Chế độ Bán Hàng ───────────────────────────────────────
    elif mode == "ecom":
        # Xác định loại input
        input_type = body.input_type or _detect_input_type(url)
        print(f"\n[ECOM] Input type: {input_type}, Value: {url[:80]}")

        # ── 2A: Input là KEYWORD / HASHTAG ────────────────────────────────────
        if input_type == "keyword":
            print(f"--- Đang xử lý từ khóa: {url} ---")

            loop = asyncio.get_event_loop()

            # ── Bước 1: Playwright tìm kiếm → danh sách 20-30 URL ───────────
            # Hàm SYNC (blocking) → chạy trong thread pool để không chặn event loop
            search_result = await loop.run_in_executor(
                executor,
                tiktok_service.search_videos_by_keyword,
                url, scan_limit
            )

            if search_result.get("status") == "error" or not search_result.get("videos"):
                user_credits += cost  # Hoàn xu
                return {
                    "status": "error",
                    "message": search_result.get("message", "Không tìm thấy video nào cho từ khóa này.")
                }

            found_videos = search_result["videos"]
            print(f"[ECOM-KW] Playwright tra ve {len(found_videos)} video URLs.")

            # ── Bước 2: Dùng yt-dlp lấy Metadata chính xác (SONG SONG) ──────
            # Lấy toàn bộ scan_limit từ Playwright → fetch metadata
            candidates = found_videos[:scan_limit]
            print(f"[ECOM-KW] Dang lay metadata cho {len(candidates)} video bang yt-dlp...")

            meta_tasks = [
                loop.run_in_executor(
                    executor,
                    tiktok_service.get_video_metadata,
                    v["url"]
                )
                for v in candidates
            ]
            meta_results = await asyncio.gather(*meta_tasks)

            # Gom video có metadata thành công
            enriched_videos = []
            for meta in meta_results:
                if meta.get("view_count", 0) > 0 or meta.get("status") == "success":
                    vc = meta.get("view_count", 0)
                    lc = meta.get("like_count", 0)
                    cc = meta.get("comment_count", 0)
                    
                    # Viral Score = View Đột biến x Tỷ lệ Tương tác
                    viral_score = vc * (1 + (lc + cc * 2) / max(vc, 1))

                    enriched_videos.append({
                        "url": meta["url"],
                        "title": meta.get("title", "TikTok Video"),
                        "view_count": vc,
                        "viral_score": viral_score
                    })

            # Fallback: nếu yt-dlp metadata thất bại hết, dùng data từ Playwright
            if not enriched_videos:
                print(f"[ECOM-KW] yt-dlp metadata that bai, dung data tu Playwright.")
                enriched_videos = candidates
                for v in enriched_videos:
                    v['viral_score'] = v.get('view_count', 0)

            # ── Bước 3: Sắp xếp theo Viral Score → Chọn top analyze_limit ────────
            enriched_videos.sort(key=lambda x: x.get('viral_score', 0), reverse=True)
            top_n = min(analyze_limit, len(enriched_videos))
            top_videos = enriched_videos[:top_n]

            print(f"[ECOM-KW] Top {top_n} video theo Viral Score:")
            for i, v in enumerate(top_videos):
                print(f"  {i+1}. {v['view_count']:,} views - Viral Score: {v.get('viral_score',0):.1f}")

            # ── Bước 4: Download Audio + Comments + Whisper SONG SONG ───────────────────
            print(f"[ECOM-KW] Bat dau xu ly SONG SONG {top_n} video (download + comments + transcribe)...")
            tasks = [
                loop.run_in_executor(executor, _process_single_video_ecom, video)
                for video in top_videos
            ]
            results = await asyncio.gather(*tasks)
            print(f"[ECOM-KW] XONG xu ly {len(results)} video!")

            # Gom transcript và comments
            transcripts = []
            all_comments = []
            video_details = []
            total_comment_count = 0

            for r in results:
                if r.get("success"):
                    transcripts.append(r["transcript"])
                    if r.get("comments"):
                        all_comments.append(r["comments"])
                    total_comment_count += r.get("comment_count", 0)
                video_details.append({
                    "url": r["url"],
                    "title": r["title"],
                    "view_count": r["view_count"],
                    "transcript": r.get("transcript", "")
                })

            if not transcripts:
                user_credits += cost  # Hoàn xu
                return {
                    "status": "error",
                    "message": "Không thể tải và bóc băng video nào. Vui lòng thử lại hoặc nhập link video trực tiếp."
                }

            # ── Bước 5: GPT phân tích ────────────────────────────────────────
            combined_comments = " | ".join(all_comments)
            
            ai_result = await loop.run_in_executor(
                executor,
                ai_service.analyze_content,
                transcripts,
                mode,
                combined_comments
            )
            if ai_result.get("status") == "error":
                return {"status": "error", "message": f"Loi phan tich AI: {ai_result.get('message')}"}

            data = ai_result.get("data", {})

            return {
                "status": "success",
                "mode": mode,
                "analyzed_url": url,
                "title": f"Kết quả tìm kiếm: {url}",
                "view_count": sum(v.get("view_count", 0) for v in top_videos),
                "transcript": " | ".join(transcripts),
                "comment_count": total_comment_count,
                "credits_used": cost,
                "credits_remaining": user_credits,
                "video_details": video_details,
                "total_found": len(found_videos),
                "total_analyzed": len(transcripts),
                # E-com specific fields
                "competitor_angle": data.get("competitor_angle", ""),
                "customer_objections": data.get("customer_objections", []),
                "faq_from_comments": data.get("faq_from_comments", []),
                "winning_script_ideas": data.get("winning_script_ideas", []),
            }

        # ── 2B: Input là LINK VIDEO (luồng cũ) ──────────────────────────────
        if _is_channel_url(url):
            user_credits += cost  # Hoàn xu
            return {"status": "error", "message": "Vui long nhap link Video don le cho Che do Ban Hang."}

        loop = asyncio.get_event_loop()

        # Bước 1: Tải audio + Cào bình luận SONG SONG
        print(f"\n[ECOM] Bat dau tai audio + cao binh luan SONG SONG...")

        task_download = loop.run_in_executor(
            executor, tiktok_service.download_tiktok_audio, url
        )
        task_comments = loop.run_in_executor(
            executor, tiktok_service.fetch_video_comments, url
        )

        dl_result, comments_result = await asyncio.gather(task_download, task_comments)

        if dl_result.get("status") == "error":
            return {"status": "error", "message": f"Loi tai video: {dl_result.get('message')}"}

        # Lấy comments text (nếu lỗi vẫn trả chuỗi rỗng, không chặn pipeline)
        comments_data = comments_result.get("comments_text", "")
        comment_count = comments_result.get("comment_count", 0)
        print(f"[ECOM] Da cao {comment_count} binh luan hop le.")

        # Bước 2: Bóc băng Whisper (blocking → thread)
        ts_result = await loop.run_in_executor(
            executor, tiktok_service.transcribe_audio, dl_result["file_path"]
        )
        if ts_result.get("status") == "error":
            return {"status": "error", "message": f"Loi boc bang: {ts_result.get('message')}"}

        transcript = ts_result.get("transcript", "")

        # Bước 3: GPT phân tích (transcript + comments → AI)
        ai_result = await loop.run_in_executor(
            executor,
            ai_service.analyze_content,
            [transcript],
            mode,
            comments_data
        )
        if ai_result.get("status") == "error":
            return {"status": "error", "message": f"Loi phan tich AI: {ai_result.get('message')}"}

        data = ai_result.get("data", {})

        return {
            "status": "success",
            "mode": mode,
            "analyzed_url": url,
            "title": dl_result.get("title", ""),
            "view_count": dl_result.get("view_count", 0),
            "transcript": transcript,
            "comment_count": comment_count,
            "credits_used": cost,
            "credits_remaining": user_credits,
            # E-com specific fields (new insight format)
            "competitor_angle": data.get("competitor_angle", ""),
            "customer_objections": data.get("customer_objections", []),
            "faq_from_comments": data.get("faq_from_comments", []),
            "winning_script_ideas": data.get("winning_script_ideas", []),
        }
        
    else:
        user_credits += cost  # Hoàn xu
        return {"status": "error", "message": "Che do (mode) khong hop le."}


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT TẠO KỊCH BẢN QUAY (GENERATE SCRIPT)
# ─────────────────────────────────────────────────────────────────────────────

class ScriptRequest(BaseModel):
    product_name: str
    usp: str
    competitor_analysis: dict


@app.post("/api/generate-script")
async def generate_script(body: ScriptRequest):
    """
    Nhận thông tin sản phẩm + kết quả phân tích đối thủ,
    gọi AI tạo kịch bản quay chi tiết từng giây.
    """
    global user_credits

    product_name = body.product_name.strip()
    usp = body.usp.strip()
    analysis_context = json.dumps(body.competitor_analysis, ensure_ascii=False)

    if not product_name or not usp:
        return {"status": "error", "message": "Vui long nhap day du ten san pham va USP."}

    # Tính chi phí (5 Xu cho mỗi lần tạo kịch bản)
    cost = 5
    if user_credits < cost:
        return {
            "status": "error",
            "message": f"Khong du Xu! Can {cost} Xu nhung chi con {user_credits} Xu."
        }

    user_credits -= cost
    print(f"\n{'='*60}")
    print(f"[SCRIPT] GENERATE SCRIPT REQUEST")
    print(f"   San pham: {product_name}")
    print(f"   USP: {usp}")
    print(f"   Chi phi: {cost} Xu, So du con lai: {user_credits}")
    print(f"{'='*60}\n")

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        executor,
        ai_service.generate_shooting_script,
        product_name,
        usp,
        analysis_context
    )

    if result.get("status") == "error":
        user_credits += cost  # Hoàn xu nếu lỗi
        return {"status": "error", "message": f"Loi tao kich ban: {result.get('message')}"}

    return {
        "status": "success",
        "credits_used": cost,
        "credits_remaining": user_credits,
        "script": result.get("data", {})
    }
