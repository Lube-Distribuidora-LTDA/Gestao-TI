"use client";

import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip, Cell, LabelList,
} from "recharts";
import { moeda, moedaCurta } from "@/lib/format";

/**
 * Paleta categórica validada para o fundo escuro do painel:
 * banda de luminosidade, piso de croma, separação para daltonismo (ΔE 8,4),
 * piso de visão normal (19,3) e contraste ≥ 3:1 — todos aprovados.
 * A ordem é fixa: uma categoria nunca troca de cor quando outra some do filtro.
 */
export const PALETA = [
  "#3987e5", "#d95926", "#199e70", "#c98500",
  "#d55181", "#008300", "#9085e9", "#e66767",
] as const;

// Cores do padrão dos sistemas (globals.css): eixo em t3, grade na linha, contorno no fundo do card.
// Ficam em hex porque o SVG do recharts recebe o valor, não a classe.
const EIXO = { fill: "#7c92be", fontSize: 11, fontWeight: 600, fontFamily: "var(--f-txt)" };
const GRADE = "rgba(42,66,117,.55)";
const SUPERFICIE = "#0d1830";

/*
 * Rótulo de valor desenhado aqui, e não pelo LabelList padrão: o do recharts limita o texto
 * à largura da barra e quebrava "R$ 9,6k" em duas linhas nas barras curtas.
 */
function rotulo(lado: "direita" | "topo", formatar: (v: number) => string = moedaCurta) {
  return function Rotulo(props: {
    x?: number | string; y?: number | string; width?: number | string; height?: number | string;
    value?: number | string;
  }) {
    const x = Number(props.x ?? 0), y = Number(props.y ?? 0);
    const w = Number(props.width ?? 0), h = Number(props.height ?? 0);
    const v = Number(props.value ?? 0);
    return lado === "direita" ? (
      <text x={x + w + 10} y={y + h / 2} dy="0.35em" fill="#aec0e2" fontSize={11} fontWeight={700}
        fontFamily="var(--f-num)">
        {formatar(v)}
      </text>
    ) : (
      <text x={x + w / 2} y={y - 8} textAnchor="middle" fill="#aec0e2" fontSize={12} fontWeight={800}
        fontFamily="var(--f-num)">
        {formatar(v)}
      </text>
    );
  };
}

/* ---------------- Tooltip compartilhado ---------------- */
function CaixaTooltip({
  titulo,
  linhas,
}: {
  titulo: string;
  linhas: Array<{ cor?: string; rotulo: string; valor: string }>;
}) {
  return (
    <div
      className="rounded-xl border px-3.5 py-2.5 shadow-2xl"
      style={{
        borderColor: "var(--ouro-linha)",
        background: "var(--s-sobe)",
      }}
    >
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-t3">
        {titulo}
      </div>
      {linhas.map((l, i) => (
        <div key={i} className="flex items-center gap-2.5 py-0.5">
          {l.cor && (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: l.cor, outline: `2px solid ${SUPERFICIE}` }}
            />
          )}
          <span className="text-xs text-t2">{l.rotulo}</span>
          <span className="num ml-auto text-sm font-bold text-t1">{l.valor}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   EVOLUÇÃO DO CUSTO MENSAL — série única ao longo do tempo
   Forma: área com linha de 2px. Sem legenda (o título nomeia a série).
   ============================================================ */
export function GraficoEvolucao({
  dados,
}: {
  dados: Array<{ mes: string; total: number; pago: number }>;
}) {
  if (dados.length === 0) return <SemDados />;

  return (
    <ResponsiveContainer width="100%" height={270}>
      <AreaChart data={dados} margin={{ top: 12, right: 10, left: 4, bottom: 4 }}>
        <defs>
          <linearGradient id="grad-custo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3987e5" stopOpacity={0.42} />
            <stop offset="100%" stopColor="#3987e5" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid stroke={GRADE} vertical={false} />
        <XAxis dataKey="mes" tick={EIXO} axisLine={false} tickLine={false} dy={6} />
        <YAxis
          tick={EIXO}
          axisLine={false}
          tickLine={false}
          width={62}
          tickFormatter={(v) => moedaCurta(v)}
        />
        <Tooltip
          cursor={{ stroke: "#e9c877", strokeWidth: 1, strokeDasharray: "4 4" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <CaixaTooltip
                titulo={String(label)}
                linhas={[
                  { cor: "#3987e5", rotulo: "Custo total", valor: moeda(Number(payload[0].value)) },
                  {
                    cor: "#199e70",
                    rotulo: "Já pago",
                    valor: moeda(Number(payload[0].payload.pago ?? 0)),
                  },
                ]}
              />
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke="#3987e5"
          strokeWidth={2}
          fill="url(#grad-custo)"
          dot={{ r: 3, fill: "#3987e5", stroke: SUPERFICIE, strokeWidth: 2 }}
          activeDot={{ r: 5.5, fill: "#3987e5", stroke: SUPERFICIE, strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ============================================================
   CUSTO POR CATEGORIA — magnitude comparada entre categorias
   Forma: barras horizontais (os nomes são longos) com rótulo direto.
   ============================================================ */
export function GraficoCategorias({
  dados,
}: {
  dados: Array<{ nome: string; total: number; cor: string }>;
}) {
  if (dados.length === 0) return <SemDados />;

  const altura = Math.max(200, dados.length * 42 + 30);

  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart
        data={dados}
        layout="vertical"
        margin={{ top: 4, right: 74, left: 4, bottom: 4 }}
        barCategoryGap={8}
      >
        <CartesianGrid stroke={GRADE} horizontal={false} />
        <XAxis type="number" tick={EIXO} axisLine={false} tickLine={false} tickFormatter={(v) => moedaCurta(v)} />
        <YAxis
          type="category"
          dataKey="nome"
          tick={{ ...EIXO, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={148}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,.05)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <CaixaTooltip
                titulo={String(payload[0].payload.nome)}
                linhas={[
                  {
                    cor: payload[0].payload.cor,
                    rotulo: "Custo no período",
                    valor: moeda(Number(payload[0].value)),
                  },
                ]}
              />
            ) : null
          }
        />
        {/* raio nas pontas de dados; o lado da baseline fica reto */}
        <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={26}>
          {dados.map((d, i) => (
            <Cell key={i} fill={d.cor} stroke={SUPERFICIE} strokeWidth={2} />
          ))}
          <LabelList dataKey="total" content={rotulo("direita")} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ============================================================
   TOP FORNECEDORES
   ============================================================ */
export function GraficoFornecedores({
  dados,
}: {
  dados: Array<{ nome: string; total: number }>;
}) {
  if (dados.length === 0) return <SemDados />;

  const altura = Math.max(200, dados.length * 40 + 30);

  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart
        data={dados}
        layout="vertical"
        margin={{ top: 4, right: 74, left: 4, bottom: 4 }}
        barCategoryGap={8}
      >
        <CartesianGrid stroke={GRADE} horizontal={false} />
        <XAxis type="number" tick={EIXO} axisLine={false} tickLine={false} tickFormatter={(v) => moedaCurta(v)} />
        <YAxis
          type="category"
          dataKey="nome"
          tick={{ ...EIXO, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={148}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,.05)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <CaixaTooltip
                titulo={String(payload[0].payload.nome)}
                linhas={[
                  { cor: "#9085e9", rotulo: "Total no período", valor: moeda(Number(payload[0].value)) },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={24} fill="#9085e9" stroke={SUPERFICIE} strokeWidth={2}>
          <LabelList dataKey="total" content={rotulo("direita")} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ============================================================
   CHAMADOS POR STATUS — cores de estado (reservadas, não categóricas)
   ============================================================ */
export function GraficoChamados({
  dados,
}: {
  dados: Array<{ status: string; qtd: number; cor: string }>;
}) {
  if (dados.length === 0) return <SemDados />;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={dados} margin={{ top: 22, right: 10, left: 4, bottom: 4 }} barCategoryGap={14}>
        <CartesianGrid stroke={GRADE} vertical={false} />
        <XAxis dataKey="status" tick={{ ...EIXO, fontSize: 10.5 }} axisLine={false} tickLine={false} dy={6} />
        <YAxis tick={EIXO} axisLine={false} tickLine={false} width={34} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,.05)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <CaixaTooltip
                titulo={String(payload[0].payload.status)}
                linhas={[
                  {
                    cor: payload[0].payload.cor,
                    rotulo: "Chamados",
                    valor: String(payload[0].value),
                  },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="qtd" radius={[4, 4, 0, 0]} maxBarSize={52}>
          {dados.map((d, i) => (
            <Cell key={i} fill={d.cor} stroke={SUPERFICIE} strokeWidth={2} />
          ))}
          <LabelList dataKey="qtd" content={rotulo("topo", String)} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function SemDados() {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-t3">
      Ainda não há dados suficientes para este gráfico.
    </div>
  );
}
