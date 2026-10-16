#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
IMPORTACAO DOS DADOS REAIS - Modulo Disponibilidade (Fase 4)
============================================================
Le os excels "AVAILABILITY OF MACHINES" (2022 a 2026) e alimenta:
  1. equipment      -> maquinas do historico que nao existem na base, criadas
                       como INATIVAS (autorizado pelo Filomeno)
  2. disp_dias      -> grelha diaria: ESTADO FISICO do dia + horas
                       disponiveis (0-24), lidos da sub-coluna do estado
                       na aba mensal (A/PM/TY/AC/BD/SP -> nomes PT)
  3. disp_mensal    -> agregado mensal por estado em horas (aba SUMMARY)
  4. disp_horometro -> leituras mensais INITIAL/END/W.H. (aba WORKED HOURS)
  5. disp_transicoes-> segmentos derivados dos estados diarios de 2026

Requisitos: pip install openpyxl requests
Correr:     python3 scripts/import_disponibilidade.py
NOTA: corre SEMPRE que precisar (usa upsert, nunca duplica).
"""
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

import openpyxl
import requests

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
PASTA = os.path.join(RAIZ, "AVAILABILITY OF MACHINES")
TZ_MAPUTO = timezone(timedelta(hours=2))

FICHEIROS = {
    2022: "AVAILABILITY OF MACHINES 2022 OUT - Copy.xlsx",
    2023: "AVAILABILITY OF MACHINES 2023.xlsx",
    2024: "AVAILABILITY OF MACHINES 2024.xlsx",
    2025: "AVAILABILITY OF MACHINES 2025.xlsx",
    2026: "AVAILABILITY OF MACHINES 2026 - A trabalhar.xlsx",
}
ABA_RESUMO = {2022: "SUMMARY (5)", 2023: "SUMMARY (2)", 2024: "SUMMARY (2)", 2025: "SUMMARY (2)"}
MESES_ABA = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

# codigos do excel -> nomes de estado da base (ordens_servico.status_fisico)
ESTADO_PT = {
    "A": "Disponível",
    "PM": "Revisão/Manutenção",
    "TY": "Pneumático",
    "AC": "Acidentada",
    "BD": "Avariada",
    "SP": "Aguarda Acessório",
}
# sub-colunas de cada dia na aba mensal, pela ordem (a hora do dia vai na
# coluna do estado: A = disponivel, PM/TY/AC/BD/SP = horas paradas nesse estado)
SUB_COLUNAS = ["A", "PM", "TY", "AC", "BD", "SP"]

# grupo do excel -> grupo da base (casos claros; o resto vai por votacao)
GRUPO_FIXO = {
    "FORKLIFT 2.5 TONNES": "FKL 2.5T",
    "FORKLIFT 3 TONNES": "FKL 3T",
    "FORKLIFT 5 TONNES": "FKL 5T",
    "FORKLIFT 13 TONNES": "FKL 13T",
    "FORKLIFT 16 TONNES": "FKL 16T",
    "FORKLIFT 30 TONNES": "FKL 30T",
    "FORKLIFT 46 TONNES": "FKL 46T",
    "FORKLIFT 50 TONNES": "FKL 50T",
    "REACHSTACKERS 45 TONNES": "RST 45T",
    "TERMINAL TRACTORS 60 TONNES": "TT 60T",
    "TERMINAL TRACTORS 70 TONNES": "TT 70T",
    "CONTENTOR VAZIO 9 TONNES": "CV 9T",
    "EMPILHADORA TELESCOPICA": "JCB",
    "MANUSEADOR DE MATERIAL": "M.H.",
    "BOBCAT": "BBC",
    "BOMBEIRO": "Bombeiro",
    "VIATURA BASCULANTE": "Basculante",
    "CISTERNA DE COMBUSTIVEL": "Cisterna",
    "CISTERNA DE AGUA": "Cisterna",
    "GRUA DE ELEVAÇÃO": "Grua",
    "MÁQUINA DE VARER": "Limpeza",
    "TRACTOR DE REBOQUE": "Reboque",
}
TIPO_FROTA = {
    "FKL": "Forklift", "RST": "Reachstacker", "TT": "Trator de Terminal",
    "SLT": "Plataforma", "R.R": "Plataforma", "PLY": "Pá Mecânica",
    "ESC": "Escavadora", "JCB": "Empilhadora Telescópica",
    "M.H.": "Manuseador de Material", "BBC": "Bobcat",
    "Basculante": "Viatura Basculante", "Bombeiro": "Viatura de Bombeiro",
    "Cisterna": "Cisterna", "Grua": "Grua", "Limpeza": "Máquina de Varer",
    "Reboque": "Tractor de Reboque", "CV 9T": "Contentor Vazio",
}

# ---------------------------------------------------------------- infra
def env():
    vals = {}
    with open(os.path.join(RAIZ, ".env.local"), encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if "=" in linha and not linha.startswith("#"):
                k, v = linha.split("=", 1)
                vals[k] = v
    return vals["SUPABASE_URL"], vals["SUPABASE_KEY"]

URL, KEY = env()
H = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json",
     "Prefer": "resolution=merge-duplicates,return=minimal"}

def tabela(nome, params=""):
    r = requests.get(URL + "/rest/v1/" + nome + (params and "?" + params), headers=H, timeout=60)
    r.raise_for_status()
    return r.json()

def upsert(nome, linhas, conflito, passo=1000):
    total = 0
    for i in range(0, len(linhas), passo):
        bloco = linhas[i:i + passo]
        r = requests.post(URL + "/rest/v1/" + nome + "?on_conflict=" + conflito,
                          headers=H, data=json.dumps(bloco), timeout=120)
        if not r.ok:
            print("ERRO upsert %s bloco %d: %s %s" % (nome, i, r.status_code, r.text[:300]))
            sys.exit(1)
        total += len(bloco)
    return total

def inserir(nome, linhas, passo=1000):
    total = 0
    for i in range(0, len(linhas), passo):
        bloco = linhas[i:i + passo]
        r = requests.post(URL + "/rest/v1/" + nome, headers=H, data=json.dumps(bloco), timeout=120)
        if not r.ok:
            print("ERRO insert %s bloco %d: %s %s" % (nome, i, r.status_code, r.text[:300]))
            sys.exit(1)
        total += len(bloco)
    return total

def num(v):
    if v is None: return None
    if isinstance(v, (int, float)): return float(v)
    s = str(v).strip().replace(" ", "").replace(",", ".")
    if not s: return None
    try: return float(s)
    except ValueError: return None

def txt(v):
    return str(v).strip() if v is not None else ""

# ---------------------------------------------------------------- leitura excel
def achar_cabecalho(ws):
    """Devolve (linha_cabecalho, col_ref, col_grupo, col_dia1) da aba mensal."""
    for i, row in enumerate(ws.iter_rows(min_row=1, max_row=12, values_only=True), start=1):
        celulas = [txt(v).upper() for v in row]
        if "REF." in celulas:
            col_ref = celulas.index("REF.")
            col_grupo = celulas.index("GROUP") if "GROUP" in celulas else None
            col_dia1 = None
            for j in range((col_grupo or col_ref) + 1, len(celulas)):
                if celulas[j] == "1":
                    col_dia1 = j
                    break
            return i, col_ref, col_grupo, col_dia1
    return None, None, None, None

def ler_dias_aba(ws):
    """Le a aba mensal: devolve lista (ref, dia, estado, horas_disponiveis).

    Cada dia tem 6 sub-colunas (A, PM, TY, AC, BD, SP) e o numero de horas
    vai na coluna do estado: A = horas disponiveis do dia, as restantes =
    horas paradas nesse estado (A + paradas da 24). O estado do dia e a
    paragem com mais horas quando houver mais do que uma (caso raro).
    Celulas de texto com codigo (A/PM/TY/AC/BD/SP) tambem sao aceites.
    """
    linhas = list(ws.iter_rows(values_only=True))
    cab, col_ref, col_grupo, col_dia1 = achar_cabecalho(ws)
    if cab is None or col_dia1 is None:
        return []
    sub = cab
    for k in range(cab - 1, min(cab + 3, len(linhas))):
        r = linhas[k]
        if col_dia1 < len(r) and txt(r[col_dia1]).upper() == "A" and \
           col_dia1 + 1 < len(r) and txt(r[col_dia1 + 1]).upper() == "PM":
            sub = k
            break
    saida = []
    for r in linhas[sub:]:
        ref = txt(r[col_ref]) if col_ref < len(r) else ""
        if not ref or ref.upper() in ("REF.", "TOTAL"):
            continue
        for d in range(31):
            col = col_dia1 + d * 6
            if col >= len(r):
                break
            horas_a = None
            paragens = []
            codigo = None
            for k in range(6):
                v = r[col + k] if col + k < len(r) else None
                if v is None or txt(v) == "":
                    continue
                horas = num(v)
                if horas is not None:
                    if k == 0:
                        horas_a = round(horas, 2)
                    else:
                        paragens.append((SUB_COLUNAS[k], horas))
                else:
                    cod = txt(v).upper()[:2]
                    if cod in ESTADO_PT:
                        codigo = cod
            if codigo:
                estado = ESTADO_PT[codigo]
                horas_dia = horas_a if horas_a is not None else (24.0 if estado == "Disponível" else 0.0)
            elif paragens:
                estado = ESTADO_PT[max(paragens, key=lambda x: x[1])[0]]
                horas_dia = horas_a if horas_a is not None else 0.0
            elif horas_a is not None:
                estado = "Disponível"
                horas_dia = horas_a
            else:
                continue
            saida.append((ref, d + 1, estado, horas_dia))
    return saida

def ler_resumo(wb, aba):
    """Le a tabela plana do SUMMARY: (ref, mes, {A,PM,TY,AC,BD,SP})."""
    if aba not in wb.sheetnames:
        return []
    ws = wb[aba]
    cab = None
    cols = {}
    for i, row in enumerate(ws.iter_rows(min_row=1, max_row=8, values_only=True), start=1):
        c = [txt(v).upper() for v in row]
        if "REF." in c:
            cab = i
            cols = {k: c.index(k) for k in ("REF.", "A", "PM", "TY", "AC", "BD", "SP") if k in c}
            cols["MES"] = next((j for j, v in enumerate(c) if v in ("MESES", "MES")), None)
            break
    if cab is None or cols.get("MES") is None or len(cols) < 8:
        return []
    saida = []
    for row in ws.iter_rows(min_row=cab + 1, values_only=True):
        ref = txt(row[cols["REF."]])
        mes_v = row[cols["MES"]]
        if not ref or not isinstance(mes_v, (datetime, date)):
            continue
        vals = {k: (num(row[cols[k]]) or 0.0) if k in cols else 0.0 for k in ("A", "PM", "TY", "AC", "BD", "SP")}
        saida.append((ref, mes_v.month, vals))
    return saida

def ler_horometro(wb):
    """Le a aba WORKED HOURS: (ref, mes, inicial, final).

    Layout real (igual em 2022 a 2026):
      4 linhas de titulo (HOURMETER INITIAL / HOURMETER FINAL / WORKED HOURS)
      depois: MÁQUINA / EQUIPAMENTO + nomes dos meses (celulas fundidas sobre
      os trios INITIAL / END / W.H.) e a linha ITEM | CODE | NAME | GROUP |
      INITIAL | END | W.H. | ...; os dados vem a seguir.
    """
    if "WORKED HOURS" not in wb.sheetnames:
        return []
    ws = wb["WORKED HOURS"]
    linhas = list(ws.iter_rows(values_only=True))
    # a linha de sub-cabecalho e a que tem ITEM e CODE
    sub = None
    for i, row in enumerate(linhas[:20]):
        vals = [txt(v).upper() for v in row]
        if "ITEM" in vals and "CODE" in vals:
            sub = i
            break
    if sub is None:
        return []
    cab_sub = linhas[sub]
    col_ref = next((j for j, v in enumerate(cab_sub) if txt(v).upper() == "CODE"), None)
    if col_ref is None:
        return []
    nomes_mes = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY",
                 "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"]
    # os meses vao na linha de CIMA, fundidos sobre cada trio; guardamos o
    # mes corrente e ligamos cada coluna INITIAL do sub-cabecalho a esse mes
    meses = {}
    mes_actual = None
    if sub >= 1:
        for j in range(len(cab_sub)):
            v = linhas[sub - 1][j] if j < len(linhas[sub - 1]) else None
            t = txt(v).upper()
            if t in nomes_mes:
                mes_actual = nomes_mes.index(t) + 1
            if mes_actual and txt(cab_sub[j]).upper() == "INITIAL":
                meses[j] = mes_actual
    if not meses:
        return []
    saida = []
    for row in linhas[sub + 1:]:
        ref = txt(row[col_ref]) if col_ref < len(row) else ""
        if not ref or ref.upper() in ("CODE", "TOTAL"):
            continue
        for j, mes in meses.items():
            ini = num(row[j]) if j < len(row) else None
            fim = num(row[j + 1]) if j + 1 < len(row) else None
            if ini is None and fim is None:
                continue
            saida.append((ref, mes, ini, fim))
    return saida

def ler_data_base(wb):
    """Le a aba DATA BASE: (ref, fabricante, grupo, ano, modelo)."""
    ws = wb["DATA BASE"]
    saida = []
    for row in ws.iter_rows(min_row=4, values_only=True):
        ref = txt(row[2])
        if not ref or ref.upper() == "CODE":
            continue
        ano_v = num(row[8]) if len(row) > 8 else None
        ano = int(ano_v) if ano_v and 1990 < ano_v < 2100 else None
        modelo = txt(row[9]) if len(row) > 9 else ""
        saida.append((ref, txt(row[3]), txt(row[4]), ano, modelo))
    return saida

# ---------------------------------------------------------------- grupos
def construir_mapa_grupos(data_bases, base):
    """Votacao: para cada grupo do excel, o grupo da base mais comum entre os
    codigos desse grupo que ja existem na base."""
    votos = defaultdict(Counter)
    for lista in data_bases.values():
        for ref, fab, grupo, ano_aq, modelo in lista:
            if grupo and ref in base:
                votos[grupo][base[ref]["group_name"]] += 1
    mapa = dict(GRUPO_FIXO)
    for grupo, c in votos.items():
        if grupo not in mapa and c:
            mapa[grupo] = c.most_common(1)[0][0]
    return mapa

def tipo_de_grupo(g):
    prefixo = g.split(" ")[0] if g else ""
    if prefixo in TIPO_FROTA:
        return TIPO_FROTA[prefixo]
    for k, v in TIPO_FROTA.items():
        if g.startswith(k):
            return v
    return "Outros"

# ---------------------------------------------------------------- principal
def main():
    print("=" * 70)
    print("IMPORTACAO DISPONIBILIDADE - dados reais 2022 a 2026")
    print("=" * 70)

    base_rows = tabela("equipment", "select=id,code,name,group_name,active&order=id.asc")
    base = {r["code"]: r for r in base_rows if r.get("code")}
    print("Base: %d equipamentos carregados" % len(base))

    data_bases = {}
    for ano, fich in FICHEIROS.items():
        wb = openpyxl.load_workbook(os.path.join(PASTA, fich), read_only=True, data_only=True)
        data_bases[ano] = ler_data_base(wb)
        wb.close()
        print("DATA BASE %d: %d maquinas" % (ano, len(data_bases[ano])))

    mapa_grupos = construir_mapa_grupos(data_bases, base)
    print("Mapa de grupos: %d grupos mapeados" % len(mapa_grupos))

    info_por_codigo = {}
    for ano in sorted(data_bases):
        for ref, fab, grupo, ano_aq, modelo in data_bases[ano]:
            info_por_codigo[ref] = {"fab": fab, "grupo": grupo, "ano": ano_aq, "modelo": modelo}

    faltam = [c for c in info_por_codigo if c not in base]
    if faltam:
        novas = []
        for ref in sorted(faltam):
            info = info_por_codigo[ref]
            grupo = mapa_grupos.get(info["grupo"], "Outros")
            novas.append({
                "code": ref,
                "name": info["fab"] or info["grupo"],
                "model": info["modelo"] or None,
                "fleet_type": tipo_de_grupo(grupo),
                "group_name": grupo,
                "year_acquired": info["ano"],
                "active": False,
            })
        criadas = inserir("equipment", novas)
        print("NOVAS maquinas criadas como inactivas: %d" % criadas)
        base_rows = tabela("equipment", "select=id,code,name,group_name,active&order=id.asc")
        base = {r["code"]: r for r in base_rows if r.get("code")}
    else:
        print("Nenhuma maquina nova a criar")

    sem_id = [c for c in info_por_codigo if c not in base]
    if sem_id:
        print("AVISO: %d codigos sem id na base (ficam de fora): %s" % (len(sem_id), sem_id[:10]))

    total_dias = 0
    for ano, fich in FICHEIROS.items():
        wb = openpyxl.load_workbook(os.path.join(PASTA, fich), read_only=True, data_only=True)
        linhas = []
        for m, aba in enumerate(MESES_ABA, start=1):
            if aba not in wb.sheetnames:
                continue
            for ref, dia, estado, horas_dia in ler_dias_aba(wb[aba]):
                if ref not in base:
                    continue
                try:
                    dt = date(ano, m, dia)
                except ValueError:
                    continue
                linhas.append({
                    "equipment_id": base[ref]["id"], "data": dt.isoformat(),
                    "estado": estado,
                    "horas_disponiveis": horas_dia,
                    "origem": "import_%d" % ano,
                })
        wb.close()
        vistos = {}
        for l in linhas:
            vistos[(l["equipment_id"], l["data"])] = l
        linhas = list(vistos.values())
        n = upsert("disp_dias", linhas, "equipment_id,data")
        total_dias += n
        print("disp_dias %d: %d linhas" % (ano, n))
    print("TOTAL disp_dias: %d" % total_dias)

    total_mensal = 0
    for ano, aba in ABA_RESUMO.items():
        wb = openpyxl.load_workbook(os.path.join(PASTA, FICHEIROS[ano]), read_only=True, data_only=True)
        dados = ler_resumo(wb, aba)
        wb.close()
        linhas = []
        for ref, mes, v in dados:
            if ref not in base:
                continue
            proximo = date(ano + (1 if mes == 12 else 0), 1 if mes == 12 else mes + 1, 1)
            dias_mes = (proximo - date(ano, mes, 1)).days
            linhas.append({
                "equipment_id": base[ref]["id"], "ano": ano, "mes": mes,
                "horas_a": v["A"], "horas_pm": v["PM"], "horas_ty": v["TY"],
                "horas_ac": v["AC"], "horas_bd": v["BD"], "horas_sp": v["SP"],
                "horas_total": dias_mes * 24.0,
                "origem": "import_%d" % ano,
            })
        vistos = {(l["equipment_id"], l["ano"], l["mes"]): l for l in linhas}
        n = upsert("disp_mensal", list(vistos.values()), "equipment_id,ano,mes")
        total_mensal += n
        print("disp_mensal %d: %d linhas" % (ano, n))
    print("TOTAL disp_mensal: %d" % total_mensal)

    total_hor = 0
    for ano, fich in FICHEIROS.items():
        wb = openpyxl.load_workbook(os.path.join(PASTA, fich), read_only=True, data_only=True)
        dados = ler_horometro(wb)
        wb.close()
        linhas = []
        for ref, mes, ini, fim in dados:
            if ref not in base:
                continue
            wh = round(fim - ini, 2) if (ini is not None and fim is not None) else None
            linhas.append({
                "equipment_id": base[ref]["id"], "ano": ano, "mes": mes,
                "leitura_inicial": ini, "leitura_final": fim,
                "horas_trabalhadas": wh,
                "lancado_por": "importacao",
                "observacao": "importado do excel %d" % ano,
            })
        vistos = {(l["equipment_id"], l["ano"], l["mes"]): l for l in linhas}
        n = upsert("disp_horometro", list(vistos.values()), "equipment_id,ano,mes")
        total_hor += n
        print("disp_horometro %d: %d leituras" % (ano, n))
    print("TOTAL disp_horometro: %d" % total_hor)

    existentes = tabela("disp_transicoes", "select=id&limit=1")
    if existentes:
        print("disp_transicoes ja tem dados - derivacao de 2026 saltada (nao duplicar)")
    else:
        dias_2026 = tabela("disp_dias",
                           "select=equipment_id,data,estado&estado=not.is.null&estado=neq.Disponível&order=equipment_id.asc,data.asc")
        por_eq = defaultdict(list)
        for d in dias_2026:
            por_eq[d["equipment_id"]].append(d)
        agora = datetime.now(TZ_MAPUTO)
        segmentos = []
        for eq, lista in sorted(por_eq.items()):
            seg = None
            fechos = []
            for d in lista:
                dt = date.fromisoformat(d["data"][:10])
                if seg and seg["estado"] == d["estado"] and dt == seg["ultimo"] + timedelta(days=1):
                    seg["ultimo"] = dt
                else:
                    if seg:
                        fechos.append(seg)
                    seg = {"estado": d["estado"], "primeiro": dt, "ultimo": dt}
            if seg:
                fechos.append(seg)
            for s in fechos:
                inicio = datetime(s["primeiro"].year, s["primeiro"].month, s["primeiro"].day, tzinfo=TZ_MAPUTO)
                fim_previsto = datetime(s["ultimo"].year, s["ultimo"].month, s["ultimo"].day, tzinfo=TZ_MAPUTO) + timedelta(days=1)
                aberto = fim_previsto > agora
                segmentos.append({
                    "equipment_id": eq, "estado": s["estado"],
                    "inicio": inicio.isoformat(),
                    "fim": None if aberto else fim_previsto.isoformat(),
                    "observacao": "derivado dos dias de 2026",
                    "criado_por": "importacao",
                })
        if segmentos:
            print("disp_transicoes: %d segmentos derivados" % inserir("disp_transicoes", segmentos))
        else:
            print("disp_transicoes: nenhum segmento para derivar (2026 quase sem marcas, normal)")

    print("=" * 70)
    print("CONCLUIDO.")
    print("=" * 70)

if __name__ == "__main__":
    main()
