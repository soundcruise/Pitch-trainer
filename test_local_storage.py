from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        # Listen for all console logs
        page.on("console", lambda msg: print(f"Browser console ({msg.type}): {msg.text}"))
        page.on("pageerror", lambda err: print(f"Browser error: {err}"))
        
        page.goto("http://localhost:8080")
        
        # Click the pro chords button to trigger rendering
        # Ensure DOM is loaded
        page.wait_for_selector("#btn-level-pro-chord", timeout=2000)
        page.click("#btn-level-pro-chord")
        
        # Evaluate local storage state
        ls = page.evaluate("() => localStorage.getItem('pitchTrainerProData')")
        print(f"LocalStorage state: {ls}")
        
        # print counts
        chord_count = page.evaluate("() => document.getElementById('pro-custom-chord-count').textContent")
        prog_count = page.evaluate("() => document.getElementById('pro-custom-progression-count').textContent")
        print(f"Chord count: {chord_count}, Prog count: {prog_count}")

        browser.close()

if __name__ == "__main__":
    run()
