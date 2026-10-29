"""Agente da Rotina 750: marca no GESTÃO TI as faturas cuja nota já foi lançada no WinThor.

O que faz, a cada rodada:
  1. pega no GESTÃO TI os CNPJs dos fornecedores ativos;
  2. lê no WinThor (PCLANC, contas a pagar) os lançamentos desses CNPJs dos últimos
     90 dias — é a tabela que a Rotina 750 consulta;
  3. manda tudo para a função registrar_lancamentos_winthor() do banco, que acha a
     fatura de cada lançamento (número da nota; ou vencimento + valor) e a marca
     como "Lançada no WinThor";
  4. registra a rodada em robo_execucoes, que aparece na tela Robô do painel.

Só LÊ o WinThor. No GESTÃO TI só escreve pela função do banco e pelo registro da
rodada. Rodar de novo não duplica nada: lançamento já registrado é reconhecido.

Credenciais no arquivo ENV desta pasta (modelo em ENV.example), preenchido pelo
Júlio. Também podem vir das variáveis de ambiente, que têm prioridade.

Uso:
    python sync_winthor_750.py            # rodada normal
    python sync_winthor_750.py --simular  # lê tudo e mostra o que faria, sem gravar
"""

import datetime as dt
import json
import logging
import os
import re
import sys
import urllib.error
import urllib.request
from logging.handlers import RotatingFileHandler

PASTA = os.path.dirname(os.path.abspath(sys.argv[0] if sys.argv[0].endswith(".py") else __file__))
DIAS = 90

# Lançamento cancelado, valor zerado/negativo e linha de estorno de borderô ficam de fora:
# não são a nota da fatura.
SQL_LANCAMENTOS = """
 select l.recnum, regexp_replace(f.cgc, '[^0-9]', '') cnpj, l.numnota, l.dtlanc, l.dtvenc, l.valor,
        f.fornecedor, substr(l.historico, 1, 80) historico
   from pclanc l
   join pcfornec f on f.codfornec = l.codfornec
  where regexp_replace(f.cgc, '[^0-9]', '') in ({marcadores})
    and l.dtlanc >= trunc(sysdate) - :dias
    and l.valor > 0
    and l.dtcancel is null
    and upper(nvl(l.historico, ' ')) not like '%ESTORN%'
  order by l.dtlanc
"""


# ---------------------------------------------------------------- configuração
def carregar_config() -> dict:
    cfg = {}
    caminho = os.path.join(PASTA, "ENV")
    if os.path.isfile(caminho):
        with open(caminho, encoding="utf-8") as arq:
            for linha in arq:
                linha = linha.strip()
                if linha and not linha.startswith("#") and "=" in linha:
                    k, v = linha.split("=", 1)
                    cfg[k.strip()] = v.strip().strip('"')
    for k in ("ORACLE_HOST", "ORACLE_PORT", "ORACLE_SERVICE_NAME", "ORACLE_USER", "ORACLE_PASSWORD",
              "GESTAO_TI_SUPABASE_URL", "GESTAO_TI_SERVICE_ROLE_KEY"):
        if os.environ.get(k):
            cfg[k] = os.environ[k]
    faltando = [k for k in ("ORACLE_HOST", "ORACLE_SERVICE_NAME", "ORACLE_USER", "ORACLE_PASSWORD",
                            "GESTAO_TI_SUPABASE_URL", "GESTAO_TI_SERVICE_ROLE_KEY") if not cfg.get(k)]
    if faltando:
        raise RuntimeError("Faltam no ENV: " + ", ".join(faltando))
    return cfg


def configurar_log() -> logging.Logger:
    # sem console (pythonw), stdout/stderr são None e o primeiro print derruba o script
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w", encoding="utf-8")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w", encoding="utf-8")
    log = logging.getLogger("winthor_750")
    log.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%d/%m/%Y %H:%M:%S")
    arq = RotatingFileHandler(os.path.join(PASTA, "sync_winthor_750.log"), maxBytes=1_000_000,
                              backupCount=3, encoding="utf-8")
    arq.setFormatter(fmt)
    tela = logging.StreamHandler(sys.stdout)
    tela.setFormatter(fmt)
    log.addHandler(arq)
    log.addHandler(tela)
    return log


# ---------------------------------------------------------------- Supabase (REST)
class GestaoTI:
    """Fala com o banco do GESTÃO TI pela API REST do Supabase, com a service_role."""

    def __init__(self, url: str, chave: str):
        self.base = url.rstrip("/") + "/rest/v1"
        self.cab = {"apikey": chave, "Authorization": "Bearer " + chave, "Content-Type": "application/json"}

    def _chamar(self, metodo: str, caminho: str, corpo=None, extra=None):
        dados = None if corpo is None else json.dumps(corpo, default=str).encode("utf-8")
        req = urllib.request.Request(self.base + caminho, data=dados, method=metodo,
                                     headers={**self.cab, **(extra or {})})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                texto = r.read().decode("utf-8")
                return json.loads(texto) if texto else None
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Supabase {metodo} {caminho}: {e.code} {e.read().decode('utf-8', 'replace')[:300]}")

    def cnpjs_dos_fornecedores(self) -> list:
        linhas = self._chamar("GET", "/fornecedores?select=nome,cnpj&ativo=eq.true&cnpj=not.is.null")
        cnpjs = set()
        for l in linhas or []:
            # o campo pode ter mais de um CNPJ, separados por vírgula (Mais Dados / INTELI+)
            for parte in re.split(r"[^0-9]+", re.sub(r"[.\-/]", "", l["cnpj"] or "")):
                if len(parte) == 14:
                    cnpjs.add(parte)
        return sorted(cnpjs)

    def abrir_rodada(self) -> str:
        r = self._chamar("POST", "/robo_execucoes", {"tipo": "winthor_750"}, {"Prefer": "return=representation"})
        return r[0]["id"]

    def fechar_rodada(self, rodada: str, **campos) -> None:
        campos["finalizado_em"] = dt.datetime.now(dt.timezone.utc).isoformat()
        self._chamar("PATCH", f"/robo_execucoes?id=eq.{rodada}", campos)

    def registrar(self, lancamentos: list) -> list:
        return self._chamar("POST", "/rpc/registrar_lancamentos_winthor", {"p_lancamentos": lancamentos}) or []


# ---------------------------------------------------------------- WinThor
def ler_lancamentos(cfg: dict, cnpjs: list) -> list:
    import oracledb  # só aqui: o --simular de quem não tem a biblioteca ainda mostra o erro claro

    con = oracledb.connect(user=cfg["ORACLE_USER"], password=cfg["ORACLE_PASSWORD"],
                           dsn=f'{cfg["ORACLE_HOST"]}:{cfg.get("ORACLE_PORT", "1521")}/{cfg["ORACLE_SERVICE_NAME"]}')
    try:
        cur = con.cursor()
        binds = {f"c{i}": c for i, c in enumerate(cnpjs)}
        cur.execute(SQL_LANCAMENTOS.format(marcadores=",".join(":" + k for k in binds)), {**binds, "dias": DIAS})
        saida = []
        for recnum, cnpj, numnota, dtlanc, dtvenc, valor, fornecedor, historico in cur:
            saida.append({
                "recnum": int(recnum),
                "cnpj": cnpj,
                "numnota": "" if numnota is None else str(numnota),
                "dtlanc": dtlanc.date().isoformat() if dtlanc else None,
                "dtvenc": dtvenc.date().isoformat() if dtvenc else None,
                "valor": float(valor),
                "fornecedor": fornecedor,
                "historico": historico,
            })
        return saida
    finally:
        con.close()


# ---------------------------------------------------------------- rodada
def main() -> int:
    simular = "--simular" in sys.argv
    log = configurar_log()
    cfg = carregar_config()
    ti = GestaoTI(cfg["GESTAO_TI_SUPABASE_URL"], cfg["GESTAO_TI_SERVICE_ROLE_KEY"])

    rodada = None if simular else ti.abrir_rodada()
    try:
        cnpjs = ti.cnpjs_dos_fornecedores()
        log.info("%d CNPJ(s) de fornecedor no GESTÃO TI", len(cnpjs))
        lancamentos = ler_lancamentos(cfg, cnpjs) if cnpjs else []
        log.info("%d lançamento(s) no WinThor nos últimos %d dias", len(lancamentos), DIAS)

        if simular:
            for l in lancamentos:
                log.info("  %s  NF %-8s  %s  vence %s  R$ %10.2f  %s", l["dtlanc"], l["numnota"],
                         l["fornecedor"][:30], l["dtvenc"], l["valor"], l["historico"])
            log.info("--simular: nada foi gravado")
            return 0

        por_recnum = {l["recnum"]: l for l in lancamentos}
        envio = [{k: l[k] for k in ("recnum", "cnpj", "numnota", "dtlanc", "dtvenc", "valor")} for l in lancamentos]
        resultado = ti.registrar(envio) if envio else []

        lancadas = [r for r in resultado if r["resultado"] == "lancada"]
        sem_fatura = [r for r in resultado if r["resultado"] == "sem_fatura"]
        # Lançamento sem fatura se repete a cada rodada (compra de equipamento, mês antigo):
        # na lista da tela entram só os dos últimos 10 dias, para não virar ruído.
        recente = (dt.date.today() - dt.timedelta(days=10)).isoformat()
        sem_fatura_recente = [r for r in sem_fatura if (por_recnum.get(r["recnum"], {}).get("dtlanc") or "") >= recente]
        itens = []
        for r in lancadas + sem_fatura_recente:
            l = por_recnum.get(r["recnum"], {})
            ok = r["resultado"] == "lancada"
            itens.append({
                "ok": ok,
                "resultado": ("✓ lançada no WinThor — " if ok else "sem fatura no painel — ")
                + f'{l.get("fornecedor", "?")} · NF {l.get("numnota") or "—"} · R$ {l.get("valor", 0):,.2f}'
                .replace(",", "X").replace(".", ",").replace("X", "."),
                "assunto": f'lançada em {l.get("dtlanc")}, vence {l.get("dtvenc")}',
            })
        log.info("%d fatura(s) marcada(s) como lançada(s); %d já estavam; %d lançamento(s) sem fatura no painel",
                 len(lancadas), len(resultado) - len(lancadas) - len(sem_fatura), len(sem_fatura))

        ti.fechar_rodada(rodada, sucesso=True, documentos_vinculados=len(lancadas), detalhes={
            "lidos": len(lancamentos),
            "lancadas": len(lancadas),
            "ja_registrados": len(resultado) - len(lancadas) - len(sem_fatura),
            "sem_fatura": len(sem_fatura),
            "itens": itens[:60],
        })
        return 0
    except Exception as e:
        log.exception("rodada falhou")
        if rodada:
            try:
                ti.fechar_rodada(rodada, sucesso=False, erro=str(e)[:500])
            except Exception:
                log.exception("não consegui registrar a falha da rodada")
        return 1


if __name__ == "__main__":
    sys.exit(main())
