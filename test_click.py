import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))

        await page.goto("http://localhost:8001")
        print("Page loaded.")

        # Click the "Chord Pitch" button to go to the chord screen
        print("Clicking Chord Pitch button...")
        await page.click("button.btn-primary[data-mode='chord']")
        await page.wait_for_timeout(1000)

        # Print all buttons with their texts
        print("Buttons on page:")
        buttons = await page.locator("button").all()
        for b in buttons:
            text = await b.text_content()
            id_val = await b.get_attribute("id")
            print(f"  - Button ID: {id_val}, Text: {repr(text)}")

        # Click the "Pro" button
        print("Clicking Pro button...")
        try:
            await page.click("#btn-level-pro-chord")
            print("Successfully clicked Pro button.")
        except Exception as e:
            print("Failed to click Pro button:", e)

        await page.wait_for_timeout(1000)

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
