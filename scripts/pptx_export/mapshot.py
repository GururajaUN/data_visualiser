import asyncio, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome'); pg=await b.new_page(viewport={'width':1300,'height':1000}, device_scale_factor=3)
        await pg.goto('file:///home/claude/build/app/index.html'); await pg.set_input_files('#folder', sys.argv[1]); await pg.wait_for_selector('body.ready')
        await pg.evaluate("location.hash='#/nom/present'"); await pg.wait_for_timeout(300)
        await pg.evaluate("RC.ui.slide=4; document.querySelectorAll('#deck .slide').forEach((e,i)=>e.classList.toggle('on',i===4)); document.getElementById('deck').style.setProperty('--sc','1')")
        await pg.wait_for_timeout(200)
        el=await pg.query_selector('.slide.on .ms-map svg'); await el.screenshot(path=sys.argv[2], omit_background=True)
        await b.close()
asyncio.run(main())
