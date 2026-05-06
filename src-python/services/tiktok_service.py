import os
import re
import uuid
import yt_dlp
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# Khởi tạo OpenAI client (yêu cầu biến môi trường OPENAI_API_KEY)
# Nếu chưa có biến môi trường thì client vẫn tạo được nhưng gọi hàm sẽ báo lỗi
try:
    client = OpenAI()
except Exception as e:
    client = None

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_DIR = os.path.join(BASE_DIR, "temp")

# Đảm bảo thư mục temp tồn tại
if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR)

def download_tiktok_audio(url: str):
    """
    Sử dụng yt-dlp để tải audio và lấy metadata (tiêu đề, view)
    """
    try:
        # Tạo tên file ngẫu nhiên để tránh trùng lặp
        file_id = str(uuid.uuid4())
        output_template = os.path.join(TEMP_DIR, f"dl_{file_id}.%(ext)s")
        
        ydl_opts = {
            'format': 'best',
            'outtmpl': output_template,
            'quiet': True,
            'no_warnings': True
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            
            title = info.get('title', 'Unknown Title')
            view_count = info.get('view_count', 0)
            
            # Tên file mp4 đã được tải
            downloaded_file = ydl.prepare_filename(info)
            final_file_path = os.path.join(TEMP_DIR, f"{file_id}.mp3")
            
            # Sử dụng subprocess để chạy ffmpeg trích xuất mp3, bỏ qua lỗi ffprobe
            import subprocess
            try:
                subprocess.run(
                    ["ffmpeg", "-y", "-i", downloaded_file, "-q:a", "0", "-map", "a", final_file_path],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                # Xóa file video gốc
                if os.path.exists(downloaded_file):
                    os.remove(downloaded_file)
            except Exception as e:
                return {"status": "error", "message": f"Lỗi ffmpeg extract: {str(e)}"}
            
            return {
                "status": "success",
                "title": title,
                "view_count": view_count,
                "file_path": final_file_path
            }
            
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

def transcribe_audio(file_path: str):
    """
    Gọi API của OpenAI (whisper-1) để bóc băng file mp3, sau đó xóa file
    """
    if not client:
        if os.path.exists(file_path):
            os.remove(file_path)
        return {"status": "error", "message": "Chưa cấu hình OPENAI_API_KEY"}

    try:
        with open(file_path, "rb") as audio_file:
            transcript = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file
            )
            
        # Xóa file sau khi bóc băng xong
        os.remove(file_path)
        
        return {
            "status": "success",
            "transcript": transcript.text
        }
    except Exception as e:
        # Xóa file nếu có lỗi
        if os.path.exists(file_path):
            os.remove(file_path)
            
        return {
            "status": "error",
            "message": str(e)
        }

def _build_full_url(entry: dict, profile_url: str) -> str:
    """
    Xây dựng URL đầy đủ cho video từ entry của extract_flat.
    Ưu tiên: webpage_url > url đầy đủ > xây từ id
    """
    # 1. Dùng webpage_url nếu có (đây là URL chắc chắn đầy đủ)
    if entry.get('webpage_url'):
        return entry['webpage_url']

    raw_url = entry.get('url', '')

    # 2. Nếu url đã là full http URL thì dùng luôn
    if raw_url.startswith('http'):
        return raw_url

    # 3. Xây URL TikTok từ video id
    video_id = entry.get('id') or raw_url
    if video_id:
        # Lấy username từ profile_url (vd: @tentaikhoan)
        import re
        match = re.search(r'@([\w.]+)', profile_url)
        username = match.group(1) if match else 'user'
        return f'https://www.tiktok.com/@{username}/video/{video_id}'

    return ''


def get_channel_videos(profile_url: str, max_videos: int = 30):
    """
    Sử dụng yt-dlp để lấy danh sách video của kênh, không tải video (extract_flat=True).
    Trả về danh sách video sắp xếp giảm dần theo lượt view.
    """
    try:
        ydl_opts = {
            'extract_flat': True,
            'quiet': True,
            'no_warnings': True,
            'playlistend': max_videos,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(profile_url, download=False)

            # Xử lý cả trường hợp entries là generator hoặc None
            entries = info.get('entries')
            if entries is None:
                return {"status": "error", "message": "Không tìm thấy danh sách video. Hãy kiểm tra link kênh."}

            videos = []
            for entry in entries:
                if not entry:
                    continue
                full_url = _build_full_url(entry, profile_url)
                if not full_url:
                    continue
                videos.append({
                    "url": full_url,
                    "title": entry.get('title', 'Unknown Title'),
                    "view_count": entry.get('view_count', 0) or 0
                })

            if not videos:
                return {"status": "error", "message": "Không trích xuất được video nào từ kênh."}

            # Sắp xếp giảm dần theo view
            videos.sort(key=lambda x: x['view_count'], reverse=True)

            return {
                "status": "success",
                "videos": videos
            }

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }


# ─── HÀM CÀO BÌNH LUẬN TỪ VIDEO ─────────────────────────────────────────────

def _is_junk_comment(text: str) -> bool:
    """
    Kiểm tra bình luận rác:
    - Chỉ chứa emoji/icon (không có chữ cái)
    - Quá ngắn (dưới 3 từ sau khi loại bỏ emoji)
    """
    if not text or not text.strip():
        return True
    # Loại bỏ emoji để đếm chữ
    cleaned = re.sub(
        r'[\U00010000-\U0010ffff\u2600-\u27BF\u2700-\u27BF\uFE00-\uFE0F\u200d]',
        '', text, flags=re.UNICODE
    ).strip()
    if not cleaned:
        return True  # Chỉ có emoji
    words = cleaned.split()
    if len(words) < 3:
        return True  # Quá ngắn
    return False


def fetch_video_comments(video_url: str, max_comments: int = 30) -> dict:
    """
    Sử dụng yt-dlp để cào bình luận từ 1 video TikTok.
    Lấy top `max_comments` bình luận có nhiều like nhất, lọc bỏ rác.
    Trả về chuỗi text gom tất cả bình luận hợp lệ.
    """
    try:
        ydl_opts = {
            'getcomments': True,
            'skip_download': True,
            'extract_flat': False,
            'quiet': True,
            'no_warnings': True,
        }

        print(f"  [COMMENTS] Bat dau cao binh luan tu: {video_url[:60]}...")

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)

            raw_comments = info.get('comments') or []
            print(f"  [COMMENTS] Tim thay {len(raw_comments)} binh luan tho.")

            if not raw_comments:
                return {
                    "status": "success",
                    "comments_text": "",
                    "comment_count": 0,
                    "message": "Video khong co binh luan hoac khong the lay duoc."
                }

            # Sắp xếp theo like_count giảm dần (nhiều like nhất lên đầu)
            sorted_comments = sorted(
                raw_comments,
                key=lambda c: c.get('like_count', 0) or 0,
                reverse=True
            )

            # Lọc bỏ bình luận rác và giới hạn số lượng
            valid_comments = []
            for comment in sorted_comments:
                text = comment.get('text', '').strip()
                if _is_junk_comment(text):
                    continue
                like_count = comment.get('like_count', 0) or 0
                valid_comments.append({
                    "text": text,
                    "likes": like_count
                })
                if len(valid_comments) >= max_comments:
                    break

            print(f"  [COMMENTS] Sau loc rac: {len(valid_comments)} binh luan hop le.")

            # Gom thành chuỗi text
            comments_text = " | ".join(
                [f"Comment {i+1} ({c['likes']} likes): {c['text']}"
                 for i, c in enumerate(valid_comments)]
            )

            return {
                "status": "success",
                "comments_text": comments_text,
                "comment_count": len(valid_comments)
            }

    except Exception as e:
        print(f"  [COMMENTS] LOI khi cao binh luan: {str(e)[:100]}")
        return {
            "status": "success",  # Không để lỗi comments chặn pipeline chính
            "comments_text": "",
            "comment_count": 0,
            "message": f"Khong the lay binh luan: {str(e)}"
        }


# ─── HÀM LẤY METADATA VIDEO BẰNG YT-DLP (KHÔNG TẢI) ────────────────────────

def get_video_metadata(video_url: str) -> dict:
    """
    Dùng yt-dlp để lấy metadata chính xác (title, view_count) của 1 video
    mà không tải file về. Dùng sau khi Playwright trả về danh sách URL.
    """
    try:
        ydl_opts = {
            'skip_download': True,
            'quiet': True,
            'no_warnings': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)
            return {
                "status": "success",
                "url": video_url,
                "title": info.get('title', 'Unknown Title'),
                "view_count": info.get('view_count', 0) or 0,
                "like_count": info.get('like_count', 0) or 0,
                "comment_count": info.get('comment_count', 0) or 0,
            }
    except Exception as e:
        print(f"  [META] Loi lay metadata {video_url[:50]}: {str(e)[:80]}")
        return {
            "status": "error",
            "url": video_url,
            "title": "Unknown",
            "view_count": 0,
            "like_count": 0,
            "comment_count": 0,
        }


# ─── HÀM TÌM KIẾM VIDEO BẰNG PLAYWRIGHT (THAY THẾ YT-DLP SEARCH) ──────────
# FIX Windows: Dùng sync_api thay vì async_api để tránh lỗi NotImplementedError
# trên ProactorEventLoop (Windows) khi Playwright spawn subprocess Chromium.
# Hàm này BLOCKING → gọi qua run_in_executor() từ async endpoint.

def search_videos_by_keyword(keyword: str, scan_limit: int = 30) -> dict:
    """
    Tìm kiếm video TikTok bằng Playwright (thay thế yt-dlp bị chặn anti-bot).
    Mở Chromium → truy cập trang search → scroll load thêm → bóc tách URL + view.

    Trả về danh sách URL video (20-30 link). Sau đó backend sẽ dùng yt-dlp
    để lấy metadata chính xác, chấm điểm Viral Score, chọn top 3.

    LƯU Ý: Hàm SYNC (blocking) — phải gọi qua run_in_executor().
    """
    from urllib.parse import quote
    from playwright.sync_api import sync_playwright

    cleaned = keyword.strip()
    print(f"\n{'='*60}")
    print(f"[PLAYWRIGHT] Bat dau tim kiem tu khoa: {cleaned}")
    print(f"{'='*60}")

    if not cleaned:
        return {"status": "error", "message": "Từ khóa không được để trống."}

    # Xác định URL tìm kiếm
    is_hashtag = cleaned.startswith('#')
    if is_hashtag:
        tag = cleaned.lstrip('#').strip()
        if not tag:
            return {"status": "error", "message": "Hashtag không hợp lệ."}
        search_url = f"https://www.tiktok.com/tag/{quote(tag)}"
        print(f"  [PLAYWRIGHT] Mode: HASHTAG -> /tag/{tag}")
    else:
        search_url = f"https://www.tiktok.com/search?q={quote(cleaned)}"
        print(f"  [PLAYWRIGHT] Mode: KEYWORD -> search?q={cleaned}")

    with sync_playwright() as p:
        browser = None
        try:
            # Anti-detection — tắt cờ automation
            browser = p.chromium.launch(
                headless=False,  # Bắt buộc hiển thị để user thấy Captcha
                args=['--disable-blink-features=AutomationControlled']
            )

            # Giả lập trình duyệt Windows bình thường
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/125.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1920, "height": 1080},
                locale="vi-VN",
                timezone_id="Asia/Ho_Chi_Minh",
            )

            page = context.new_page()
            print(f"  [PLAYWRIGHT] Dang truy cap: {search_url}")

            # Timeout thông minh — không chờ element cụ thể
            page.goto(
                search_url,
                wait_until="domcontentloaded",
                timeout=15000
            )
            print(f"  [PLAYWRIGHT] Trang da load (domcontentloaded).")

            # Đợi thêm 2s cho JS render nội dung động
            page.wait_for_timeout(2000)

            # Cuộn trang thông minh (Smart Scroll)
            last_height = page.evaluate("document.body.scrollHeight")
            video_count = 0
            max_scroll_attempts = 30
            attempts = 0
            
            while video_count < scan_limit and attempts < max_scroll_attempts:
                video_count = page.evaluate("""
                    () => {
                        const links = document.querySelectorAll('a[href*="/video/"]');
                        const seen = new Set();
                        for (const link of links) {
                            const match = link.href.match(/(https:\\/\\/www\\.tiktok\\.com\\/@[\\w.]+\\/video\\/\\d+)/);
                            if (match) seen.add(match[1]);
                        }
                        return seen.size;
                    }
                """)
                
                print(f"  [PLAYWRIGHT] Đã tìm thấy {video_count}/{scan_limit} video. (Cuộn lần {attempts+1})")
                
                if video_count >= scan_limit:
                    break
                    
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                page.wait_for_timeout(2000)
                
                new_height = page.evaluate("document.body.scrollHeight")
                if new_height == last_height:
                    page.wait_for_timeout(2000)
                    new_height_2 = page.evaluate("document.body.scrollHeight")
                    if new_height_2 == last_height:
                        print("  [PLAYWRIGHT] Không thể cuộn thêm (hết kết quả).")
                        break
                    last_height = new_height_2
                else:
                    last_height = new_height
                
                attempts += 1

            # Bóc tách trong try/except — không crash backend
            try:
                videos = page.evaluate("""
                    () => {
                        const results = [];
                        const seen = new Set();

                        const links = document.querySelectorAll('a[href*="/video/"]');

                        for (const link of links) {
                            const href = link.href;
                            if (!href) continue;

                            const match = href.match(
                                /(https:\\/\\/www\\.tiktok\\.com\\/@[\\w.]+\\/video\\/\\d+)/
                            );
                            if (!match) continue;

                            const videoUrl = match[1];
                            if (seen.has(videoUrl)) continue;
                            seen.add(videoUrl);

                            // Thử lấy view count từ giao diện
                            let viewCount = 0;
                            const card = link.closest('[class*="Card"]')
                                      || link.closest('[class*="item"]')
                                      || link.closest('[class*="video"]')
                                      || link.parentElement;
                            if (card) {
                                const viewEl = card.querySelector(
                                    'strong[data-e2e="video-views"]'
                                );
                                if (viewEl) {
                                    viewCount = _parseViews(viewEl.textContent);
                                }
                            }

                            // Fallback: tìm strong bất kỳ trong link
                            if (viewCount === 0) {
                                const strongs = link.querySelectorAll('strong');
                                for (const s of strongs) {
                                    const t = s.textContent.trim();
                                    if (/^[\\d.]+[KMBkmb]?$/.test(t)) {
                                        viewCount = _parseViews(t);
                                        if (viewCount > 0) break;
                                    }
                                }
                            }

                            const title = link.getAttribute('title')
                                       || link.getAttribute('aria-label')
                                       || 'TikTok Video';

                            results.push({
                                url: videoUrl,
                                title: title,
                                view_count: viewCount
                            });
                        }

                        function _parseViews(text) {
                            if (!text) return 0;
                            text = text.toUpperCase().trim();
                            let mul = 1;
                            if (text.endsWith('B')) { mul = 1e9;  text = text.slice(0,-1); }
                            else if (text.endsWith('M')) { mul = 1e6;  text = text.slice(0,-1); }
                            else if (text.endsWith('K')) { mul = 1e3;  text = text.slice(0,-1); }
                            const n = parseFloat(text.replace(/,/g, ''));
                            return isNaN(n) ? 0 : Math.round(n * mul);
                        }

                        return results;
                    }
                """)
            except Exception as extract_err:
                print(f"  [PLAYWRIGHT] Loi Playwright: Timeout hoac bi chan Captcha")
                print(f"  [PLAYWRIGHT] Chi tiet: {str(extract_err)[:150]}")
                videos = []

            print(f"  [PLAYWRIGHT] Boc tach duoc {len(videos)} video URLs tu DOM.")

            # ── Trả kết quả ─────────────────────────────────────────────────
            if not videos:
                print(f"  [PLAYWRIGHT] THAT BAI: Khong tim thay video nao.")
                return {
                    "status": "error",
                    "message": (
                        "Playwright không tìm thấy video nào cho từ khóa này. "
                        "TikTok có thể yêu cầu đăng nhập hoặc hiện CAPTCHA."
                    )
                }

            # Giới hạn kết quả
            videos = videos[:scan_limit]

            # Sắp xếp sơ bộ theo view (từ giao diện, chưa chính xác)
            videos.sort(key=lambda x: x['view_count'], reverse=True)

            print(f"  [PLAYWRIGHT] THANH CONG: Tra ve {len(videos)} video.")
            return {
                "status": "success",
                "keyword": cleaned,
                "total_found": len(videos),
                "videos": videos
            }

        except Exception as e:
            print(f"  [PLAYWRIGHT] Loi Playwright: Timeout hoac bi chan Captcha")
            print(f"  [PLAYWRIGHT] Chi tiet: {str(e)[:200]}")
            return {
                "status": "error",
                "message": f"Lỗi Playwright: Timeout hoặc bị chặn Captcha. Chi tiết: {str(e)[:100]}"
            }

        finally:
            # ── Đảm bảo LUÔN đóng browser dù có lỗi → tránh treo RAM ────────
            if browser:
                try:
                    browser.close()
                    print(f"  [PLAYWRIGHT] Browser da dong an toan.")
                except Exception:
                    pass
