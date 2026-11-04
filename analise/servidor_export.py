"""Servidor local para gerar os embeddings da avaliação com o MESMO modelo do app.

Uso:
    python analise/servidor_export.py
    abra http://localhost:8090/analise/exportar_embeddings.html  (gera e salva sozinho)

Serve os arquivos do projeto e aceita POST /salvar, que grava eval/dados/embeddings.json.
Só escuta em localhost.
"""

import http.server
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "eval" / "dados" / "embeddings.json"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(RAIZ), **kwargs)

    def do_POST(self):
        if self.path != "/salvar":
            self.send_error(404)
            return
        corpo = self.rfile.read(int(self.headers["Content-Length"]))
        dados = json.loads(corpo)
        DESTINO.write_text(json.dumps(dados, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        self.send_response(200)
        self.end_headers()
        self.wfile.write(f"salvo: {len(dados['vetores'])} vetores".encode())
        print(f"✅ {DESTINO} ({len(dados['vetores'])} vetores)")


if __name__ == "__main__":
    print("Abra http://localhost:8090/analise/exportar_embeddings.html")
    http.server.ThreadingHTTPServer(("127.0.0.1", 8090), Handler).serve_forever()
