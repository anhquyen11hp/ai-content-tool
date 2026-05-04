import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

try:
    client = OpenAI()
except Exception:
    client = None

# ─── System Prompts theo từng chế độ ──────────────────────────────────────────

CREATOR_SYSTEM_PROMPT = """Bạn là chuyên gia phân tích nội dung TikTok hàng đầu Việt Nam.
Dưới đây là lời thoại của các video viral nhất từ kênh đối thủ.
Hãy phân tích sâu và trả về ĐÚNG định dạng JSON sau, không thêm bất kỳ text nào bên ngoài:

{
  "hook_analysis": "Phân tích chi tiết cách họ mở đầu video để thu hút ngay từ giây đầu",
  "content_structure": "Công thức cấu trúc nội dung chung của các video (VD: Nêu vấn đề → Giải quyết → Kêu gọi hành động)",
  "new_hook_ideas": [
    "Ý tưởng câu hook sáng tạo 1 áp dụng được cho kênh mới",
    "Ý tưởng câu hook sáng tạo 2",
    "Ý tưởng câu hook sáng tạo 3",
    "Ý tưởng câu hook sáng tạo 4",
    "Ý tưởng câu hook sáng tạo 5"
  ],
  "pain_points": [
    "Nỗi đau/vấn đề của khán giả mà kênh này đang khai thác 1",
    "Nỗi đau/vấn đề 2",
    "Nỗi đau/vấn đề 3"
  ]
}"""

ECOM_SYSTEM_PROMPT = """Bạn là chuyên gia Copywriter và chốt sale hàng đầu Việt Nam.
Dưới đây là lời thoại của các video bán hàng xuất sắc nhất.
Hãy phân tích sâu và trả về ĐÚNG định dạng JSON sau, không thêm bất kỳ text nào bên ngoài:

{
  "selling_points": [
    "Điểm bán hàng nổi bật 1 mà họ nhấn mạnh",
    "Điểm bán hàng nổi bật 2",
    "Điểm bán hàng nổi bật 3"
  ],
  "customer_pain_points_addressed": [
    "Nỗi đau/vấn đề của khách hàng mà họ đã giải quyết 1",
    "Nỗi đau/vấn đề 2",
    "Nỗi đau/vấn đề 3"
  ],
  "sales_script_ideas": [
    "Ý tưởng kịch bản bán hàng sáng tạo 1 dựa trên phong cách của họ",
    "Ý tưởng kịch bản bán hàng 2",
    "Ý tưởng kịch bản bán hàng 3"
  ],
  "hook_ideas": [
    "Câu hook mở đầu video bán hàng hiệu quả 1",
    "Câu hook 2",
    "Câu hook 3"
  ]
}"""


def analyze_content(transcripts_list: list, mode: str) -> dict:
    """
    Gộp danh sách transcripts và phân tích bằng GPT-4o-mini
    tùy theo chế độ creator hoặc ecom.
    """
    if not client:
        return {"status": "error", "message": "Chưa cấu hình OPENAI_API_KEY"}

    if not transcripts_list:
        return {"status": "error", "message": "Không có transcript nào để phân tích."}

    # Gộp mảng transcripts thành một chuỗi lớn
    combined = "\n\n---VIDEO TIẾP THEO---\n\n".join(
        [f"[Video {i+1}]\n{t}" for i, t in enumerate(transcripts_list) if t]
    )

    system_prompt = CREATOR_SYSTEM_PROMPT if mode == "creator" else ECOM_SYSTEM_PROMPT

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"Đây là kịch bản (transcript) của các video cần phân tích:\n\n{combined}"
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
        )

        result = json.loads(response.choices[0].message.content)
        return {"status": "success", "data": result}

    except Exception as e:
        return {"status": "error", "message": str(e)}
