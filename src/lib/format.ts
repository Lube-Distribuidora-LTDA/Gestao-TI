/** Formatações padrão pt-BR usadas em todo o sistema. */

export function moeda(valor: number | null | undefined): string {
  return (valor ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function moedaCurta(valor: number | null | undefined): string {
  const v = valor ?? 0;
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(1).replace(".", ",")}k`;
  return moeda(v);
}

/** Aceita "2026-09-15" ou Date e devolve 15/09/2026, sem susto de fuso. */
export function data(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  if (typeof valor === "string") {
    const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = new Date(valor);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

export function dataHora(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const d = new Date(valor);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** "2026-09-01" -> "Set/26" */
export function competenciaLabel(valor: string | null | undefined): string {
  if (!valor) return "—";
  const m = valor.match(/^(\d{4})-(\d{2})/);
  if (!m) return "—";
  return `${MESES[parseInt(m[2], 10) - 1]}/${m[1].slice(2)}`;
}

/** "2026-09-01" -> "Setembro de 2026" */
export function competenciaExtenso(valor: string | null | undefined): string {
  if (!valor) return "—";
  const m = valor.match(/^(\d{4})-(\d{2})/);
  if (!m) return "—";
  const nomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${nomes[parseInt(m[2], 10) - 1]} de ${m[1]}`;
}

/** Primeiro dia do mês corrente em ISO (YYYY-MM-01), em horário local. */
export function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Desloca uma competência em N meses. */
export function deslocarCompetencia(competencia: string, meses: number): string {
  const [a, m] = competencia.split("-").map(Number);
  const d = new Date(a, m - 1 + meses, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function cnpjFmt(v: string | null | undefined): string {
  if (!v) return "—";
  const n = v.replace(/\D/g, "");
  if (n.length !== 14) return v;
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

export function tamanhoArquivo(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "há 3 dias", "em 2 dias", "hoje" */
export function tempoRelativo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diff = Math.round((d.getTime() - Date.now()) / 86400000);
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  if (diff === -1) return "ontem";
  return diff > 0 ? `em ${diff} dias` : `há ${Math.abs(diff)} dias`;
}

export function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Número de WhatsApp em formato legível: (27) 99999-9999.
 *
 * Guardamos só dígitos; a máscara é aplicada na hora de mostrar.
 */
export function telFmt(v: string | null | undefined): string {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  return v ?? "";
}

/**
 * Monta o link do WhatsApp com a mensagem de cobrança já escrita.
 *
 * O wa.me exige o número com código do país. Quem digita no painel escreve o
 * número como fala — "(27) 99999-9999" — então o 55 é acrescentado quando o
 * número tem cara de brasileiro (10 ou 11 dígitos). Número maior já veio com
 * código de país e é respeitado como está.
 */
export function linkWhatsApp(numero: string | null | undefined, mensagem?: string): string | null {
  const d = (numero ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;

  const completo = d.length <= 11 ? `55${d}` : d;
  const texto = mensagem ? `?text=${encodeURIComponent(mensagem)}` : "";
  return `https://wa.me/${completo}${texto}`;
}
