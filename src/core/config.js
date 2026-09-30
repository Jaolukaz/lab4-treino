/**
 * Configuração de domínio do Planejamento Individual de Treino (Lab-4).
 * Clubes, rótulos, frases rápidas e limites ficam aqui, para que formulário,
 * pré-visualização e PDF leiam da mesma fonte.
 */

export const APP_VERSION = '2.0.0';
export const APP_ID = 'lab4-planejamento-treino';

/** Dimensões das imagens após compressão no aparelho. */
export const PHOTO_SIZE = 600; // foto do atleta: recorte quadrado, em px
export const PHOTO_JPEG_QUALITY = 0.86;
export const CREST_MAX = 320; // escudo enviado pelo usuário: maior lado, em px (PNG, preserva transparência)

/**
 * Clubes. `crest: 'png'` usa o escudo oficial em src/assets/crests/<chave>.png
 * (reaproveitado do Scouting Gerações Série A). Clubes sem escudo no arquivo de origem
 * recebem um monograma vetorial provisório, que pode ser trocado por upload.
 */
export const CLUBS = {
  america: { name: 'América-MG', primary: '#006437', secondary: '#FFFFFF', accent: '#000000', crest: 'png' },
  athletico: { name: 'Athletico-PR', primary: '#E2001A', secondary: '#FFFFFF', accent: '#000000', crest: 'png' },
  atletico: { name: 'Atlético-MG', primary: '#000000', secondary: '#FFFFFF', accent: '#C0C0C0', crest: 'png' },
  bahia: { name: 'Bahia', primary: '#0057A8', secondary: '#FFFFFF', accent: '#E3141B', crest: 'mono', mono: 'ECB' },
  botafogo: { name: 'Botafogo', primary: '#000000', secondary: '#FFFFFF', accent: '#FFFFFF', crest: 'png' },
  bragantino: { name: 'Red Bull Bragantino', primary: '#1A2B5E', secondary: '#FFFFFF', accent: '#E2001A', crest: 'png' },
  chapecoense: { name: 'Chapecoense', primary: '#00843D', secondary: '#FFFFFF', accent: '#FFFFFF', crest: 'mono', mono: 'ACF' },
  corinthians: { name: 'Corinthians', primary: '#000000', secondary: '#FFFFFF', accent: '#E2001A', crest: 'png' },
  coritiba: { name: 'Coritiba', primary: '#00544D', secondary: '#FFFFFF', accent: '#FFFFFF', crest: 'mono', mono: 'CFC' },
  cruzeiro: { name: 'Cruzeiro', primary: '#003DA5', secondary: '#FFFFFF', accent: '#C4A84A', crest: 'png' },
  flamengo: { name: 'Flamengo', primary: '#C52613', secondary: '#FFFFFF', accent: '#000000', crest: 'png' },
  fluminense: { name: 'Fluminense', primary: '#870A28', secondary: '#FFFFFF', accent: '#1A5336', crest: 'png' },
  gremio: { name: 'Grêmio', primary: '#0D80BF', secondary: '#FFFFFF', accent: '#000000', crest: 'png' },
  internacional: { name: 'Internacional', primary: '#E30613', secondary: '#FFFFFF', accent: '#FFFFFF', crest: 'png' },
  mirassol: { name: 'Mirassol', primary: '#1A7A34', secondary: '#FFFF00', accent: '#FFD700', crest: 'png' },
  palmeiras: { name: 'Palmeiras', primary: '#006437', secondary: '#FFFFFF', accent: '#FFFFFF', crest: 'png' },
  remo: { name: 'Remo', primary: '#0B1F4B', secondary: '#FFFFFF', accent: '#FFFFFF', crest: 'mono', mono: 'CR' },
  santos: { name: 'Santos', primary: '#000000', secondary: '#FFFFFF', accent: '#FFFFFF', crest: 'png' },
  saopaulo: { name: 'São Paulo', primary: '#E2001A', secondary: '#FFFFFF', accent: '#000000', crest: 'png' },
  vasco: { name: 'Vasco da Gama', primary: '#000000', secondary: '#FFFFFF', accent: '#E2001A', crest: 'png' },
  vitoria: { name: 'Vitória', primary: '#D9131B', secondary: '#000000', accent: '#000000', crest: 'mono', mono: 'ECV' },
};
export const BH_CLUBS = ['america', 'atletico', 'cruzeiro'];
export const OTHER = 'outro';

export const TAGS = ['Técnico', 'Preventivo', 'Lúdico', 'Competitivo', 'Recuperativo', 'Força', 'Potência', 'Coordenativo'];
export const PREP_TYPES = ['Mobilidade', 'Flexibilidade', 'Ativação', 'Ativação neural', 'Core', 'Estabilidade', 'Outro'];
export const PREP_QUICK = [
  ['Mobilidade', 'Mobilidade de quadril e flexibilidade'],
  ['Mobilidade', 'Mobilidade de tornozelo, quadril e flexibilidade'],
  ['Ativação', 'Ativação com mini band'],
  ['Ativação', 'Ativação neuromuscular'],
  ['Ativação neural', ''],
  ['Core', ''],
  ['Estabilidade', ''],
];
export const CONTEXT_QUICK = [
  'Atleta em disputa de campeonato', 'Jogo no mesmo dia da sessão', 'Jogo no dia anterior',
  'Retorno de lesão', 'Semana de avaliações', 'Necessária intervenção mais lúdica',
];
export const FOCUS_SUGGEST = [
  'Força e agilidade', 'Força e coordenação', 'Estabilidade e coordenação', 'Mobilidade e ativação', 'Força e desaceleração',
  'Estabilidade e força unipodal', 'Força reativa e aceleração', 'Preventivos e estabilidade', 'Potência e velocidade', 'Recuperação ativa',
];
export const CATEGORIES = ['Sub-7', 'Sub-8', 'Sub-9', 'Sub-10', 'Sub-11', 'Sub-12', 'Sub-13', 'Sub-14', 'Sub-15', 'Sub-16', 'Sub-17', 'Sub-18', 'Sub-20', 'Sub-23', 'Profissional'];

export const MON = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MON_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const WD_FULL = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
