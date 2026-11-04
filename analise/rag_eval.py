"""Avaliação da recuperação do RAG do EstudaAI.

Porta fiel, em Python, da busca que roda no app (src/text/nlp.js e src/rag/search.js),
para medir exatamente o que o estudante usa. Inclui:
  * chunking, BM25, embeddings e busca híbrida (RRF);
  * métricas (Hit@k, MRR) e reamostragem bootstrap;
  * testes pareados (McNemar exato e permutação) para comparar métodos.
"""

from __future__ import annotations

import csv
import json
import math
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from scipy import stats

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "eval" / "dados"

# ---------------------------------------------------------------- texto (igual ao app)

STOPWORDS_APP = set((
    "a o as os de da do das dos e é em um uma uns umas para por com que no na nos nas se ao aos como "
    "mais mas foi são ser tem têm isso esse essa este esta isto também entre sobre muito pelo pela já "
    "ou quando seu sua seus suas ele ela eles elas qual quais onde porque pois sem até foram era está "
    "the of and to in is it"
).split(" "))


def normalize(text: str) -> str:
    """Minúsculas e sem acentos, como `normalize` do app."""
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in decomposed if not ("̀" <= ch <= "ͯ"))


# No app as stopwords com acento ("são", "também") nunca casam, porque o texto já perdeu o acento.
# A versão corrigida normaliza também a lista; o notebook mede o efeito dessa correção.
STOPWORDS_CORRIGIDAS = {normalize(w) for w in STOPWORDS_APP}


def tokenize(text: str, stopwords: set[str] = STOPWORDS_APP) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9]{3,}", normalize(text)) if w not in stopwords]


# ---------------------------------------------------------------- dados

@dataclass
class Chunk:
    lesson_id: str
    lesson: str
    folder: str
    text: str


@dataclass
class Pergunta:
    id: int
    tipo: str            # literal | parafrase | sem_resposta
    pergunta: str
    gabarito: list[tuple[str, str]] = field(default_factory=list)  # (aula, trecho que precisa aparecer)

    @property
    def respondivel(self) -> bool:
        return bool(self.gabarito)


def carregar_corpus(caminho: Path = DADOS / "corpus.json") -> list[dict]:
    return json.loads(caminho.read_text(encoding="utf-8"))["pastas"]


def carregar_perguntas(caminho: Path = DADOS / "perguntas.csv") -> list[Pergunta]:
    perguntas = []
    with caminho.open(encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter=";"):
            gabarito = []
            for parte in filter(None, (p.strip() for p in row["gabarito"].split("|"))):
                aula, trecho = parte.split(":", 1)
                gabarito.append((aula.strip(), trecho.strip()))
            perguntas.append(Pergunta(int(row["id"]), row["tipo"], row["pergunta"], gabarito))
    return perguntas


def build_chunks(pastas: list[dict], modo: str = "secao", size: int = 700, step: int = 600) -> list[Chunk]:
    """Divide as aulas em trechos.

    modo="secao": igual ao app (cada tópico "# ..." ou parágrafo, cortado em `size` caracteres).
    modo="aula":  a aula inteira é um trecho só.
    modo="frase": cada frase é um trecho.
    """
    chunks = []
    for pasta in pastas:
        for aula in pasta["aulas"]:
            if modo == "aula":
                partes = [aula["notas"].strip()]
            else:
                secoes = [s.strip() for s in re.split(r"\n(?=#)|\n\s*\n", aula["notas"])]
                secoes = [s for s in secoes if len(s) > 20]
                if modo == "secao":
                    partes = [s[i:i + size] for s in secoes for i in range(0, len(s), step)]
                else:
                    partes = [f.strip() for s in secoes for f in re.split(r"(?<=[.!?])\s+|\n", s)]
                    partes = [f for f in partes if len(f) > 20 and not f.startswith("#")]
            chunks += [Chunk(aula["id"], aula["titulo"], pasta["nome"], p) for p in partes]
    return chunks


# ---------------------------------------------------------------- recuperação

class BM25:
    """BM25 idêntico ao do app (o título da aula entra no texto indexado)."""

    def __init__(self, chunks: list[Chunk], k1: float = 1.2, b: float = 0.75, stopwords=STOPWORDS_APP):
        self.chunks, self.k1, self.b, self.stopwords = chunks, k1, b, stopwords
        self.docs = [tokenize(c.text + " " + c.lesson, stopwords) for c in chunks]
        self.N = len(self.docs)
        self.avg = sum(map(len, self.docs)) / self.N
        self.df: dict[str, int] = {}
        for d in self.docs:
            for t in set(d):
                self.df[t] = self.df.get(t, 0) + 1
        self.tf = [{t: d.count(t) for t in set(d)} for d in self.docs]

    def scores(self, query: str) -> np.ndarray:
        terms = list(dict.fromkeys(tokenize(query, self.stopwords)))
        out = np.zeros(self.N)
        for i, tf in enumerate(self.tf):
            s = 0.0
            for t in terms:
                f = tf.get(t)
                if not f:
                    continue
                idf = math.log(1 + (self.N - self.df[t] + 0.5) / (self.df[t] + 0.5))
                s += idf * (f * (self.k1 + 1)) / (f + self.k1 * (1 - self.b + self.b * len(self.docs[i]) / self.avg))
            out[i] = s
        return out

    def search(self, query: str, k: int = 5) -> list[int]:
        """Índices dos trechos, do melhor para o pior (só score > 0, desempate pela ordem original)."""
        s = self.scores(query)
        order = sorted((i for i in range(self.N) if s[i] > 0), key=lambda i: -s[i])
        return order[:k]


def carregar_vetores(caminho: Path = DADOS / "embeddings.json") -> dict:
    """Embeddings gerados pelo próprio app (Transformers.js) com analise/exportar_embeddings.html."""
    return json.loads(caminho.read_text(encoding="utf-8"))


class Embeddings:
    """Busca por significado com os vetores do MESMO modelo e biblioteca do app.

    Os vetores vêm prontos de eval/dados/embeddings.json (gerados no navegador), assim a
    avaliação mede exatamente o modelo quantizado que o estudante usa.
    """

    def __init__(self, chunks: list[Chunk], vetores: dict):
        self.vetores = vetores["vetores"]
        self.chunks = chunks
        self.matrix = self.encode([f"{c.lesson}. {c.text}" for c in chunks])

    def encode(self, texts: list[str]) -> np.ndarray:
        faltando = [t for t in texts if t not in self.vetores]
        if faltando:
            raise KeyError(f"{len(faltando)} textos sem vetor; gere de novo o embeddings.json. Ex.: {faltando[0][:60]!r}")
        m = np.array([self.vetores[t] for t in texts], dtype=float)
        return m / np.linalg.norm(m, axis=1, keepdims=True)  # renormaliza (os valores foram arredondados)

    def scores(self, query: str) -> np.ndarray:
        return self.matrix @ self.encode([query])[0]

    def search(self, query: str, k: int = 5) -> list[int]:
        return list(np.argsort(-self.scores(query), kind="stable")[:k])


def rrf(rankings: list[list[int]], k: int = 5, c: int = 60) -> list[int]:
    """Reciprocal Rank Fusion, como `fuseRankings` do app."""
    fused: dict[int, float] = {}
    for ranking in rankings:
        for pos, idx in enumerate(ranking):
            fused[idx] = fused.get(idx, 0.0) + 1 / (c + pos + 1)
    return sorted(fused, key=lambda i: -fused[i])[:k]


class Hibrida:
    def __init__(self, bm25: BM25, emb: Embeddings, c: int = 60):
        self.bm25, self.emb, self.c = bm25, emb, c

    def search(self, query: str, k: int = 5) -> list[int]:
        depth = max(10, k * 2)
        return rrf([self.bm25.search(query, depth), self.emb.search(query, depth)], k, self.c)


# ---------------------------------------------------------------- métricas

def relevante(chunk: Chunk, p: Pergunta) -> bool:
    return any(chunk.lesson_id == aula and trecho in chunk.text for aula, trecho in p.gabarito)


def posicao(resultados: list[int], chunks: list[Chunk], p: Pergunta) -> int | None:
    """Posição (1, 2, ...) do primeiro trecho relevante, ou None se não veio."""
    for pos, idx in enumerate(resultados, start=1):
        if relevante(chunks[idx], p):
            return pos
    return None


def hit_at(ranks: np.ndarray, k: int) -> np.ndarray:
    """1 se a resposta veio no top-k, 0 senão (ranks com np.nan = não veio)."""
    return np.where(np.isnan(ranks), 0.0, (ranks <= k).astype(float))


def reciprocal(ranks: np.ndarray) -> np.ndarray:
    return np.where(np.isnan(ranks), 0.0, 1.0 / np.nan_to_num(ranks, nan=1.0))


def bootstrap_ci(valores: np.ndarray, n: int = 10_000, alpha: float = 0.05, seed: int = 42) -> tuple[float, float, float]:
    """Média e intervalo de confiança percentil por bootstrap."""
    rng = np.random.default_rng(seed)
    amostras = rng.choice(valores, size=(n, len(valores)), replace=True).mean(axis=1)
    lo, hi = np.quantile(amostras, [alpha / 2, 1 - alpha / 2])
    return float(valores.mean()), float(lo), float(hi)


def mcnemar_exato(a: np.ndarray, b: np.ndarray) -> tuple[int, int, float]:
    """Teste de McNemar exato para acertos pareados (0/1). Devolve (só A acertou, só B acertou, p)."""
    so_a = int(((a == 1) & (b == 0)).sum())
    so_b = int(((a == 0) & (b == 1)).sum())
    n = so_a + so_b
    p = 1.0 if n == 0 else float(stats.binomtest(min(so_a, so_b), n, 0.5).pvalue)
    return so_a, so_b, p


def permutacao_pareada(a: np.ndarray, b: np.ndarray, n: int = 20_000, seed: int = 42) -> tuple[float, float]:
    """Diferença média (a - b) e p-valor bicaudal por troca aleatória de sinais."""
    rng = np.random.default_rng(seed)
    d = a - b
    obs = d.mean()
    sinais = rng.choice([-1, 1], size=(n, len(d)))
    perm = (sinais * d).mean(axis=1)
    return float(obs), float((np.abs(perm) >= abs(obs) - 1e-12).mean())


def holm(pvalores: list[float]) -> list[float]:
    """Correção de Holm-Bonferroni para várias comparações."""
    m = len(pvalores)
    ordem = np.argsort(pvalores)
    ajustados = np.empty(m)
    atual = 0.0
    for i, idx in enumerate(ordem):
        atual = max(atual, min(1.0, (m - i) * pvalores[idx]))
        ajustados[idx] = atual
    return list(ajustados)
