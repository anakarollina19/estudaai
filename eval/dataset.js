// Conjunto de avaliação do RAG: 8 aulas de matérias diferentes e 30 perguntas.
// Cada pergunta diz em qual aula está a resposta (`lesson`) e um trecho que o pedaço
// recuperado precisa conter (`contains`), o que identifica o tópico certo dentro da aula.
//
// Tipos de pergunta:
//   literal    usa as mesmas palavras da aula ("fases da mitose")
//   parafrase  mesma ideia com outras palavras ("como uma célula vira duas iguais?")
// As paráfrases são onde a busca por palavras (BM25) costuma falhar.

const lesson = (id, title, notes) => ({ id, title, notes, images: [] });

export const FOLDERS = [
  {
    name: 'Biologia',
    lessons: [
      lesson('bio-divisao', 'Divisão celular', `# Mitose
Na mitose uma célula se divide em duas células filhas idênticas, com o mesmo número de cromossomos.
As fases são prófase, metáfase, anáfase e telófase.

# Meiose
A meiose gera gametas com metade dos cromossomos, ou seja, células haploides.
Acontece em duas divisões seguidas e aumenta a variabilidade genética pelo crossing-over.`),
      lesson('bio-foto', 'Fotossíntese', `# Fotossíntese
As plantas usam luz solar, água e gás carbônico para produzir glicose e liberar oxigênio.
O processo acontece nos cloroplastos, que contêm clorofila, o pigmento verde que absorve a luz.

# Respiração celular
A respiração celular quebra a glicose nas mitocôndrias e libera energia na forma de ATP.`),
    ],
  },
  {
    name: 'Química',
    lessons: [
      lesson('qui-ligacoes', 'Ligações químicas', `# Ligação iônica
Ocorre entre um metal e um ametal, com transferência de elétrons. Exemplo: NaCl, o sal de cozinha.

# Ligação covalente
Ocorre entre ametais, que compartilham pares de elétrons. Exemplo: a molécula de água.

# Ligação metálica
Os elétrons livres formam um mar de elétrons, o que explica a condução elétrica dos metais.`),
      lesson('qui-ph', 'Ácidos e bases', `# Escala de pH
O pH mede a acidez de uma solução, de 0 a 14. Abaixo de 7 é ácido, 7 é neutro e acima de 7 é básico.

# Neutralização
Quando um ácido reage com uma base, formam-se sal e água. O suco gástrico do estômago é bem ácido.`),
    ],
  },
  {
    name: 'História',
    lessons: [
      lesson('his-industrial', 'Revolução Industrial', `# Contexto
Começou na Inglaterra no século XVIII, com a máquina a vapor e a produção têxtil mecanizada.

# Consequências
Êxodo rural, crescimento das cidades e surgimento da classe operária.
Jornadas de trabalho longas levaram aos primeiros movimentos sindicais.`),
      lesson('his-francesa', 'Revolução Francesa', `# Causas
A França vivia crise econômica, fome e privilégios do clero e da nobreza, enquanto o terceiro estado pagava os impostos.

# Queda da Bastilha
Em 14 de julho de 1789 o povo de Paris tomou a Bastilha, prisão que simbolizava o poder absoluto do rei.
O lema da revolução era liberdade, igualdade e fraternidade.`),
    ],
  },
  {
    name: 'Física',
    lessons: [
      lesson('fis-newton', 'Leis de Newton', `# Primeira lei
Pela inércia, um corpo continua parado ou em movimento retilíneo uniforme se nenhuma força agir sobre ele.

# Segunda lei
A força resultante é igual à massa vezes a aceleração: F = m · a.

# Terceira lei
A toda ação corresponde uma reação de mesma intensidade e sentido oposto.`),
      lesson('fis-energia', 'Energia', `# Energia cinética
É a energia do movimento e depende da massa e da velocidade do corpo.

# Energia potencial
A energia potencial gravitacional depende da altura em relação ao solo.

# Conservação
A energia não é criada nem destruída, apenas transformada de uma forma em outra.`),
    ],
  },
];

const q = (question, lesson, contains, kind) => ({ question, lesson, contains, kind });

export const QUESTIONS = [
  // ----- literais -----
  q('Quais são as fases da mitose?', 'bio-divisao', 'prófase', 'literal'),
  q('O que a meiose gera?', 'bio-divisao', 'gametas', 'literal'),
  q('Onde acontece a fotossíntese?', 'bio-foto', 'cloroplastos', 'literal'),
  q('O que é a clorofila?', 'bio-foto', 'clorofila', 'literal'),
  q('Onde ocorre a respiração celular?', 'bio-foto', 'mitocôndrias', 'literal'),
  q('O que é uma ligação iônica?', 'qui-ligacoes', 'transferência', 'literal'),
  q('Como funciona a ligação covalente?', 'qui-ligacoes', 'compartilham', 'literal'),
  q('O que mede o pH?', 'qui-ph', 'acidez', 'literal'),
  q('O que forma a neutralização de um ácido com uma base?', 'qui-ph', 'sal e água', 'literal'),
  q('Onde começou a Revolução Industrial?', 'his-industrial', 'Inglaterra', 'literal'),
  q('Quais foram as consequências da Revolução Industrial?', 'his-industrial', 'Êxodo rural', 'literal'),
  q('Quando foi a queda da Bastilha?', 'his-francesa', '1789', 'literal'),
  q('Qual era o lema da Revolução Francesa?', 'his-francesa', 'fraternidade', 'literal'),
  q('O que diz a segunda lei de Newton?', 'fis-newton', 'massa vezes a aceleração', 'literal'),
  q('O que é energia cinética?', 'fis-energia', 'movimento', 'literal'),
  q('Do que depende a energia potencial gravitacional?', 'fis-energia', 'altura', 'literal'),
  // ----- paráfrases -----
  q('Como uma célula vira duas iguais?', 'bio-divisao', 'idênticas', 'parafrase'),
  q('Como se formam os espermatozoides e óvulos?', 'bio-divisao', 'gametas', 'parafrase'),
  q('Como as plantas fazem comida usando o sol?', 'bio-foto', 'luz solar', 'parafrase'),
  q('Como o corpo tira energia do açúcar?', 'bio-foto', 'ATP', 'parafrase'),
  q('Por que o sal de cozinha se forma?', 'qui-ligacoes', 'NaCl', 'parafrase'),
  q('Por que os metais conduzem eletricidade?', 'qui-ligacoes', 'mar de elétrons', 'parafrase'),
  q('O estômago é ácido ou básico?', 'qui-ph', 'suco gástrico', 'parafrase'),
  q('Por que as pessoas saíram do campo para as cidades?', 'his-industrial', 'Êxodo rural', 'parafrase'),
  q('Como surgiram os sindicatos?', 'his-industrial', 'sindicais', 'parafrase'),
  q('Por que o povo francês estava revoltado com o rei?', 'his-francesa', 'privilégios', 'parafrase'),
  q('Por que um passageiro é jogado para frente quando o ônibus freia?', 'fis-newton', 'inércia', 'parafrase'),
  q('O que acontece quando empurro uma parede?', 'fis-newton', 'reação', 'parafrase'),
  q('Um carro mais rápido tem mais energia?', 'fis-energia', 'velocidade', 'parafrase'),
  q('A energia pode acabar ou sumir?', 'fis-energia', 'não é criada nem destruída', 'parafrase'),
];
