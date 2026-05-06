"""Quick test: Playwright → TikTok search → extract video links."""
import asyncio
from playwright.async_api import async_playwright

async def test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=['--disable-blink-features=AutomationControlled']
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1920, "height": 1080},
            locale="vi-VN",
            timezone_id="Asia/Ho_Chi_Minh",
        )
        page = await context.new_page()
        
        print("[TEST] Navigating to TikTok search...")
        try:
            await page.goto(
                "https://www.tiktok.com/search?q=trending",
                wait_until="domcontentloaded",
                timeout=15000
            )
            print(f"[TEST] Page loaded. Title: {await page.title()}")
        except Exception as e:
            print(f"[TEST] Goto error: {e}")
        
        # Wait for JS render
        await page.wait_for_timeout(3000)
        
        # Scroll 3 times
        for i in range(3):
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await page.wait_for_timeout(2000)
            print(f"[TEST] Scroll {i+1}/3 done")
        
        # Count video links
        link_count = await page.evaluate("document.querySelectorAll('a[href*=\"/video/\"]').length")
        print(f"[TEST] Found {link_count} video links in DOM")
        
        await browser.close()
        print("[TEST] Browser closed OK")

if __name__ == "__main__":
    asyncio.run(test())
