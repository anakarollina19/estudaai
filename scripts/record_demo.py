"""Grava o GIF da interface (docs/demo.gif) e tira prints das telas (docs/telas/*.png) para o README.

Pré-requisitos:
    pip install playwright pillow && python -m playwright install chromium
    python -m http.server 8080      # em outro terminal, na pasta do projeto

Uso:
    python scripts/record_demo.py
"""
import io
import os
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

URL = os.environ.get("DEMO_URL", "http://localhost:8080/")
OUT = "docs/demo.gif"
TELAS = "docs/telas"
WIDTH, HEIGHT = 1280, 800
GIF_WIDTH = 960
NOTA = "# Citocinese\nA citocinese divide o citoplasma no fim da mitose.\nCada célula filha recebe metade das organelas."
PERGUNTA = "quais são as fases da mitose?"


def main(executable_path: str | None = None):
    frames: list[tuple[Image.Image, int]] = []  # (imagem, duração em ms)
    os.makedirs(TELAS, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=executable_path)
        page = browser.new_page(viewport={"width": WIDTH, "height": HEIGHT}, color_scheme="light", device_scale_factor=1)

        def snap(ms: int):
            page.wait_for_timeout(150)
            frames.append((Image.open(io.BytesIO(page.screenshot())).convert("RGB"), ms))

        def tela(nome: str):
            """Print em alta resolução para o README."""
            page.screenshot(path=f"{TELAS}/{nome}.png")

        def digitar(selector: str, text: str, step: int = 6):
            box = page.locator(selector)
            box.click()
            for i in range(0, len(text), step):  # "digita" aos poucos
                box.fill(text[: i + step])
                snap(90)
            box.dispatch_event("input")

        def topo():
            page.evaluate("document.querySelector('main').scrollTo(0, 0)")

        # Banner do topo do README (scripts/banner.html, com as fontes e a ilustração do app)
        banner = browser.new_page(viewport={"width": 1320, "height": 460}, device_scale_factor=2)
        banner.goto(URL + "scripts/banner.html")
        banner.wait_for_timeout(1500)  # fontes do Google
        banner.locator("#banner").screenshot(path="docs/banner.png", omit_background=True)
        banner.close()

        page.goto(URL)  # navegador do Playwright é um perfil novo: começa sem login nem aulas
        page.wait_for_timeout(1200)
        tela("login")
        snap(2200)

        # 1. Aulas de exemplo → tela Início
        page.get_by_text("Experimentar com aulas de exemplo").click()
        page.wait_for_timeout(1200)
        tela("inicio")
        snap(2800)

        # 2. Continuar estudando → anotações em folha de caderno
        page.locator('[data-action="home.continue"]').click()
        page.wait_for_timeout(700)
        page.locator('[data-action="page.add"]').click()
        page.locator("#dlgIn").fill("Citocinese")
        snap(1000)
        page.locator("#dlgOk").click()
        page.locator("#pagePaper").select_option("caderno")
        page.wait_for_timeout(300)
        digitar("#notes", NOTA, step=9)
        snap(1600)
        tela("anotacoes")

        # 3. Mapa mental e flashcards (modo offline, sem chave)
        page.locator('#captureBar [data-action="summary.mindmap"]').click()
        page.wait_for_timeout(600)
        topo()
        snap(3000)
        page.locator('#captureBar [data-action="summary.flashcards"]').click()
        page.wait_for_timeout(700)
        page.locator(".fc").scroll_into_view_if_needed()
        snap(1400)
        page.locator(".fc").click()  # vira o cartão em 3D
        page.wait_for_timeout(700)
        snap(1600)
        tela("flashcards")
        page.locator('[data-action="flash.rate"][data-arg="1"]').click()  # "Sabia!" dá XP
        snap(1300)

        # 4. Slides interativos
        page.locator('#captureBar [data-action="slides.build"]').click()
        page.wait_for_timeout(2500)
        page.locator("#slideStage").scroll_into_view_if_needed()
        page.locator('[data-action="slides.nextSlide"]').click()
        snap(1400)
        # revela os tópicos um a um, sem passar para o próximo slide
        while page.evaluate("document.querySelectorAll('#slideStage li:not(.show)').length") > 0:
            page.locator("#slideStage").click()
            snap(650)
        snap(1600)
        tela("slides")

        # 5. Pergunte às aulas (RAG com BM25, offline)
        page.locator('[data-action="tab.show"][data-arg="perguntar"]').click()
        topo()
        digitar("#ragQ", PERGUNTA)
        page.locator('[data-action="rag.ask"]').first.click()
        page.wait_for_timeout(800)
        snap(3200)
        tela("perguntar")

        # 6. Agente: demonstração gravada, executando as ferramentas de verdade
        page.locator('[data-action="tab.show"][data-arg="agente"]').click()
        topo()
        page.locator('[data-action="agent.demo"]').click()
        for _ in range(8):
            page.wait_for_timeout(900)
            page.locator("#agentLog > :last-child").scroll_into_view_if_needed()  # acompanha a conversa
            snap(650)
        snap(3200)
        tela("agente")

        # 7. De volta ao Início: a meta do dia andou
        page.locator('[data-action="tab.show"][data-arg="inicio"]').click()
        page.wait_for_timeout(600)
        topo()
        snap(2800)
        browser.close()

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    scale = GIF_WIDTH / WIDTH
    images = [img.resize((GIF_WIDTH, int(img.height * scale)), Image.LANCZOS)
              .quantize(colors=160, method=Image.Quantize.MEDIANCUT) for img, _ in frames]
    images[0].save(OUT, save_all=True, append_images=images[1:],
                   duration=[ms for _, ms in frames], loop=0, optimize=True)
    print(f"GIF salvo em {OUT} ({len(images)} quadros, {os.path.getsize(OUT) / 1e6:.1f} MB)")
    print(f"Prints em {TELAS}/: {', '.join(sorted(os.listdir(TELAS)))}")


if __name__ == "__main__":
    # Opcional: caminho de um Chromium já instalado (ex.: /opt/pw-browsers/chromium)
    main(sys.argv[1] if len(sys.argv) > 1 else None)
