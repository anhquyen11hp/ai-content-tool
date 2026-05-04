import os
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

TEMP_DIR = "temp"

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
        output_template = os.path.join(TEMP_DIR, f"{file_id}.%(ext)s")
        
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
            
            if 'entries' not in info:
                # Nếu là single video, nó có thể không có entries
                return {"status": "error", "message": "Không tìm thấy danh sách video (Có thể đây không phải link kênh)."}
                
            videos = []
            for entry in info['entries']:
                if entry:
                    videos.append({
                        "url": entry.get('url'),
                        "title": entry.get('title', 'Unknown Title'),
                        "view_count": entry.get('view_count', 0) or 0
                    })
                    
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

def analyze_channel_prompt(transcripts_text: str):
    """
    Sử dụng GPT để phân tích công thức Hook và phong cách từ các transcripts.
    """
    if not client:
        return {"status": "error", "message": "Chưa cấu hình OPENAI_API_KEY"}

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "Bạn là chuyên gia phân tích nội dung viral trên mạng xã hội. Trả về kết quả dưới định dạng JSON với 2 keys: 'hook_ideas' (mảng các chuỗi) và 'pain_points' (mảng các chuỗi)."
                },
                {
                    "role": "user",
                    "content": f"Đây là kịch bản các video viral nhất của kênh này. Hãy bóc tách 'Công thức Hook' (câu mở đầu) và phong cách làm nội dung của họ (vấn đề/pain points họ giải quyết).\n\nKỊCH BẢN:\n{transcripts_text}"
                }
            ],
            response_format={"type": "json_object"}
        )
        
        import json
        result = json.loads(response.choices[0].message.content)
        return {
            "status": "success",
            "hook_ideas": result.get("hook_ideas", []),
            "pain_points": result.get("pain_points", [])
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }
