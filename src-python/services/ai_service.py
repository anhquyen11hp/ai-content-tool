import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

try:
    client = OpenAI()
except Exception:
    client = None

# ─── System Prompts theo từng chế độ ──────────────────────────────────────────

CREATOR_SYSTEM_PROMPT = """Bạn là một Đạo diễn Nội dung TikTok và Chuyên gia Copywriter thực chiến hàng đầu. Dưới đây là lời thoại (transcript) của 3 video viral nhất từ một kênh đối thủ. Nhiệm vụ của bạn là 'mổ xẻ' chiến lược của họ để tôi có thể làm theo.

QUY TẮC NGHIÊM NGẶT:

- KHÔNG dùng những từ sáo rỗng chung chung như: 'mở đầu hấp dẫn', 'thu hút sự chú ý', 'nội dung thú vị'.
- BẮT BUỘC phải trích dẫn (quote) một vài câu nói chính xác từ transcript để làm ví dụ chứng minh.
- Các ý tưởng Hook mới phải mang văn phong TikTok hiện đại (Gen Z, KOC review, giật gân, nói thẳng vào vấn đề), tuyệt đối không viết văn quảng cáo truyền hình.

Hãy phân tích và trả về ĐÚNG định dạng JSON sau, không thêm bất kỳ text nào bên ngoài:
{
  "hook_analysis": "Chỉ ra CHÍNH XÁC thủ thuật tâm lý họ dùng ở 3 giây đầu (VD: Đe dọa, Bóc phốt, Flexing, Câu hỏi ngược). Trích dẫn nguyên văn 1 câu Hook của họ để làm ví dụ.",
  "content_structure": "Trình bày cấu trúc kịch bản theo công thức cụ thể (VD: Hook đe dọa -> Xoáy sâu nỗi đau -> Đưa giải pháp bất ngờ -> Call to Action). Ghi rõ mỗi phần họ nói cái gì.",
  "new_hook_ideas": [
    "Ý tưởng hook 1 (Ngôn từ mộc mạc, giật gân, độ dài dưới 15 chữ)",
    "Ý tưởng hook 2 (Dùng con số hoặc định kiến để gây tranh cãi)",
    "Ý tưởng hook 3",
    "Ý tưởng hook 4",
    "Ý tưởng hook 5"
  ],
  "pain_points": [
    "Insight/Nỗi đau 1 cực kỳ cụ thể của tệp khách hàng này",
    "Insight 2",
    "Insight 3"
  ]
}"""

ECOM_SYSTEM_PROMPT = """Bạn là một Chuyên gia Nghiên cứu Thị trường & Copywriter. Dữ liệu của bạn gồm Lời thoại Video (Transcript) và Bình luận của khách hàng (Comments) từ các video đối thủ.

NHIỆM VỤ:

1. Phân tích lời thoại để xem đối thủ đang bán hàng bằng góc độ nào.
2. Phân tích BÌNH LUẬN để tìm ra: Khách hàng đang thắc mắc điều gì? Họ chê bai điều gì (giá cả, chất lượng)? Lời từ chối ngầm của họ là gì?

Trả về ĐÚNG định dạng JSON sau, không thêm bất kỳ text nào bên ngoài:
{
  "competitor_angle": "Góc bán hàng của đối thủ (Họ dùng điểm mạnh nào để chốt sale?)",
  "customer_objections": ["Kháng cự 1 từ bình luận (VD: Khách chê giá đắt)", "Kháng cự 2 (VD: Khách sợ bết rít)"],
  "faq_from_comments": ["Câu hỏi 1 khách hay hỏi", "Câu hỏi 2 khách hay hỏi"],
  "winning_script_ideas": [
    "Ý tưởng 1: Đi thẳng vào giải quyết Kháng cự 1 ngay từ đầu video",
    "Ý tưởng 2: Video dạng Q&A trả lời các câu hỏi thường gặp",
    "Ý tưởng 3: Bán hàng bằng góc độ mà đối thủ chưa nhắc tới"
  ]
}"""


def analyze_content(transcripts_list: list, mode: str, comments_data: str = "") -> dict:
    """
    Gộp danh sách transcripts và phân tích bằng GPT-4o-mini
    tùy theo chế độ creator hoặc ecom.
    Với mode ecom, comments_data sẽ được đính kèm để AI phân tích insight khách hàng.
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

    # Xây dựng user message — ecom mode gồm cả transcript + comments
    if mode == "ecom" and comments_data:
        user_content = (
            f"=== LỜI THOẠI VIDEO (TRANSCRIPT) ===\n\n{combined}\n\n"
            f"=== BÌNH LUẬN KHÁCH HÀNG (COMMENTS) ===\n\n{comments_data}"
        )
    else:
        user_content = f"Đây là kịch bản (transcript) của các video cần phân tích:\n\n{combined}"

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": user_content
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
        )

        result = json.loads(response.choices[0].message.content)
        return {"status": "success", "data": result}

    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─── System Prompt cho Đạo diễn Kịch bản ──────────────────────────────────────

SCRIPT_DIRECTOR_SYSTEM_PROMPT = """Bạn là một Đạo diễn Video ngắn (TikTok/Reels) xuất chúng.
Dữ liệu đầu vào của bạn gồm:

1. Báo cáo cấu trúc video viral của đối thủ: {analysis_context}
2. Sản phẩm của người dùng: {product_name}
3. Điểm nổi bật của sản phẩm (USP): {usp}

NHIỆM VỤ: Hãy áp dụng ĐÚNG cấu trúc tâm lý và kỹ thuật kịch bản của đối thủ (Hook → Nỗi đau → Giải pháp → CTA), nhưng tùy chỉnh hoàn toàn cho SẢN PHẨM CỦA NGƯỜI DÙNG để viết ra một kịch bản bấm máy chi tiết từng giây.

QUY TẮC:
- Câu thoại phải mang phong cách TikTok Việt Nam hiện đại (Gen Z, KOC review, nói thẳng vào vấn đề).
- Mô tả Visual phải CỤ THỂ: góc quay (cận mặt, toàn thân, POV), hành động tay/mắt, props trên bàn...
- KHÔNG viết văn quảng cáo truyền hình. Viết như đang nói chuyện với bạn bè.
- Phải có ít nhất 4 scene (cảnh) trở lên, chia nhỏ thời gian hợp lý cho video 30-60 giây.
- director_tips phải cực kỳ thực tế và actionable.

Trả về ĐÚNG định dạng JSON sau, không thêm bất kỳ text nào bên ngoài:
{{
  "video_title": "Tên giật tít cho video (kiểu TikTok, dưới 20 chữ)",
  "script_scenes": [
    {{"time": "0-3s", "visual": "Góc quay, hành động cụ thể (VD: Cận mặt, chỉ tay vào màn hình)", "audio": "Câu Hook sắc bén"}},
    {{"time": "3-10s", "visual": "Mô tả hình ảnh tiếp theo", "audio": "Xoáy sâu nỗi đau"}},
    {{"time": "10-25s", "visual": "Cách show sản phẩm", "audio": "Giải quyết vấn đề bằng USP"}},
    {{"time": "25-35s", "visual": "Hành động chốt", "audio": "Call To Action (Kêu gọi mua/click)"}}
  ],
  "director_tips": ["Mẹo trang phục", "Mẹo chọn nhạc nền", "Mẹo biểu cảm khuôn mặt"]
}}"""


def generate_shooting_script(product: str, usp: str, analysis_context: str) -> dict:
    """
    Tạo kịch bản quay chi tiết từng giây dựa trên:
    - Phân tích đối thủ (analysis_context)
    - Sản phẩm của người dùng (product)
    - Điểm nổi bật USP (usp)
    """
    if not client:
        return {"status": "error", "message": "Chưa cấu hình OPENAI_API_KEY"}

    if not product or not usp:
        return {"status": "error", "message": "Vui lòng nhập đầy đủ tên sản phẩm và USP."}

    # Inject dữ liệu vào system prompt
    system_prompt = SCRIPT_DIRECTOR_SYSTEM_PROMPT.format(
        analysis_context=analysis_context,
        product_name=product,
        usp=usp
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": (
                        f"Hãy viết kịch bản quay chi tiết cho sản phẩm: \"{product}\".\n"
                        f"USP: \"{usp}\".\n\n"
                        f"Dựa trên báo cáo phân tích đối thủ ở trên, hãy áp dụng ĐÚNG "
                        f"cấu trúc tâm lý viral của họ nhưng điều chỉnh cho sản phẩm của tôi."
                    )
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.8,
        )

        result = json.loads(response.choices[0].message.content)
        return {"status": "success", "data": result}

    except Exception as e:
        return {"status": "error", "message": str(e)}
