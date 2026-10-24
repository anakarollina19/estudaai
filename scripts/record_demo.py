"""Grava o GIF da interface usado no README (docs/demo.gif).

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
WIDTH, HEIGHT = 1280, 800
GIF_WIDTH = 900
NEW_NOTE = "A citocinese divide o citoplasma no fim da mitose.\nCada célula filha recebe metade das organelas."
QUESTION = "quais são as fases da mitose?"


def main(executable_path: str | None = None):
    frames: list[tuple[Image.Image, int]] = []  # (imagem, duração em ms)

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=executable_path)
        page = browser.new_page(viewport={"width": WIDTH, "height": HEIGHT}, color_scheme="dark")

        def snap(ms: int):
            page.wait_for_timeout(150)
            frames.append((Image.open(io.BytesIO(page.screenshot())).convert("RGB"), ms))

        def type_into(selector: str, text: str, step: int = 5):
            box = page.locator(selector)
            box.click()
            for i in range(0, len(text), step):  # "digita" aos poucos
                box.fill(text[: i + step])
                snap(110)

        page.goto(URL)
        page.wait_for_timeout(800)
        snap(1800)  # tela de login

        # 1. Aulas de exemplo e várias anotações por aula
        page.get_by_text("Experimentar com aulas de exemplo").click()
        page.wait_for_timeout(800)
        snap(2500)

        page.locator('[data-action="page.add"]').click()
        page.locator("#dlgIn").fill("Citocinese")
        snap(1200)
        page.locator("#dlgOk").click()
        type_into("#notes", NEW_NOTE, step=8)
        page.locator("#notes").dispatch_event("input")
        snap(1500)

        # 2. Mapa mental e flashcards gerados das anotações (modo offline, sem chave)
        page.locator('[data-action="summary.mindmap"]').click()
        page.wait_for_timeout(500)
        snap(3500)
        page.locator('[data-action="summary.flashcards"]').click()
        page.wait_for_timeout(700)
        page.locator(".fc").scroll_into_view_if_needed()
        snap(1500)
        page.locator(".fc").click()  # vira o cartão em 3D
        page.wait_for_timeout(700)
        snap(1800)
        page.locator('[data-action="flash.rate"][data-arg="1"]').click()  # "Sabia!" dá XP
        snap(1500)

        # 3. Slides interativos
        page.locator('.gen-bar [data-action="slides.build"]').click()
        page.wait_for_timeout(2600)  # espera o aviso "Gerando slides..." sumir
        page.locator("#slideStage").scroll_into_view_if_needed()
        page.locator('[data-action="slides.next"]').click()
        snap(2000)
        for _ in range(3):
            page.locator('[data-action="slides.next"]').click()
            snap(700)
        snap(1200)

        # 4. Pergunte às aulas (RAG com BM25, offline)
        page.locator('[data-action="tab.show"][data-arg="perguntar"]').click()
        type_into("#ragQ", QUESTION)
        page.locator('[data-action="rag.ask"]').first.click()
        page.wait_for_timeout(800)
        snap(3500)

        # 5. Agente: demonstração gravada, executando as ferramentas de verdade
        page.locator('[data-action="tab.show"][data-arg="agente"]').click()
        page.locator('[data-action="agent.demo"]').click()
        for _ in range(8):
            page.wait_for_timeout(900)
            snap(700)
        snap(3500)
        browser.close()

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    scale = GIF_WIDTH / WIDTH
    images = [img.resize((GIF_WIDTH, int(img.height * scale)), Image.LANCZOS)
              .quantize(colors=128, method=Image.Quantize.MEDIANCUT) for img, _ in frames]
    images[0].save(OUT, save_all=True, append_images=images[1:],
                   duration=[ms for _, ms in frames], loop=0, optimize=True)
    print(f"GIF salvo em {OUT} ({len(images)} quadros, {os.path.getsize(OUT) / 1e6:.1f} MB)")


if __name__ == "__main__":
    # Opcional: caminho de um Chromium já instalado (ex.: /opt/pw-browsers/chromium)
    main(sys.argv[1] if len(sys.argv) > 1 else None)
