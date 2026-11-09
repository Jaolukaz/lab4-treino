# Lab-4 Planejamento Individual de Treino (versão 2.0)

Aplicação da Lab-4 Performance para montar o planejamento individual de treino de cada atleta, no celular (iPhone e Android) e no computador, com relatório A4 em PDF vetorial nas cores do clube. Funciona sem internet depois da primeira abertura, e os dados ficam somente no aparelho de quem planeja.

É a evolução da versão 1 (arquivo `treino.html` único), com o mesmo formulário, o mesmo relatório e a mesma arquitetura da Avaliação Funcional v2.

## Como a equipe usa

O compartilhamento entre profissionais é feito por **link**, e não por arquivo. Quem recebe o link pelo WhatsApp abre no navegador e instala o app na tela de início:

- **iPhone:** abrir o link no Safari, tocar em Compartilhar e depois em "Adicionar à Tela de Início".
- **Android:** abrir no Chrome e tocar em "Instalar" no aviso da própria aplicação, ou no menu do navegador.

A instalação é importante no iPhone. O Safari apaga dados de sites após sete dias sem uso, mas apps instalados na tela de início ficam isentos dessa limpeza. Um arquivo `.html` recebido pelo WhatsApp não serve no iPhone: o sistema o abre no Quick Look, que não executa JavaScript.

No computador, a barra superior segue a da Avaliação Funcional: o seletor **Formulário | Pré-visualização A4**, o estado de salvamento e os botões **Planejamentos**, **Novo**, **Exportar**, **Importar** e **Gerar PDF**. No modo Formulário, o relatório continua visível ao lado, atualizado a cada alteração; o modo Pré-visualização A4 mostra só as páginas, em tamanho maior. No celular, o mesmo seletor fica na barra inferior, e os demais comandos, no menu.

O relatório é gerado pelo botão **Gerar PDF**. No celular, o botão **Compartilhar** abre a folha nativa do aparelho, de onde o PDF vai direto para o WhatsApp, o e-mail ou o app Arquivos.

## Publicar no GitHub Pages

1. Crie o repositório (sugestão: `lab4-treino`) e envie o conteúdo desta pasta para a branch `main`.
2. Em **Settings > Pages**, escolha **Source: GitHub Actions**.
3. A cada push, o workflow `.github/workflows/deploy.yml` roda os testes, compila e publica. O endereço fica no formato `https://<usuario>.github.io/lab4-treino/`.

A versão de computador (arquivo único) fica disponível para download na página de cada execução do workflow, com o nome `versao-desktop`.

A Avaliação Funcional e o Treino ficam na mesma origem (`<usuario>.github.io`), mas não se misturam: cada app tem o próprio banco de dados (`lab4-avaliacao` e `lab4-treino`), o próprio escopo de instalação e um ícone diferente (o Treino usa o logo preto sobre fundo branco).

## Desenvolvimento

É necessário Node.js 20 ou superior.

```bash
npm install
npm run dev          # servidor local com recarga automática
npm test             # testes do motor de relatório (Node, sem navegador)
npm run build        # gera dist/ (PWA) e dist-single/index.html (arquivo único)
npm run preview      # serve dist/ localmente para testar o PWA
```

Para testar no celular durante o desenvolvimento, rode `npx vite --host` e abra o endereço de rede no aparelho, na mesma rede Wi-Fi. Service worker e compartilhamento de arquivos só funcionam por HTTPS ou em `localhost`, então essa parte deve ser validada no endereço publicado.

## Arquitetura

```
src/
  core/config.js      clubes, características, frases rápidas, limites (fonte única)
  core/model.js       estado, migração da versão 1, datas, categoria, período, exemplo
  core/theme.js       cores derivadas do clube (contraste, tons, faixa)
  report/layout.js    motor de layout A4 com paginação: estado → lista de desenho em mm
  report/pdf.js       lista de desenho → PDF vetorial (pdf-lib, fontes em subconjunto)
  report/svg.js       lista de desenho → SVG da pré-visualização
  report/engine.js    carga sob demanda do motor e dos escudos no navegador
  storage/db.js       IndexedDB, com alternativa em memória
  storage/repo.js     planejamentos, imagens, exportação/importação e migração da v1
  ui/editor.js        formulário e construtor de sessões
  ui/*                imagens, diálogos, compartilhamento e PWA
  app.js              controlador (estado, autosalvamento, comandos)
  assets/crests/      escudos oficiais (PNG), reaproveitados do Scouting Gerações Série A
tests/                testes automatizados do motor (node:test)
```

A decisão central é o **motor de layout único**. A pré-visualização e o PDF são desenhados a partir da mesma lista de elementos, com as mesmas coordenadas e as mesmas quebras de linha. O que aparece na tela é exatamente o que sai no arquivo. A largura do texto é medida com as próprias fontes Barlow, e não com o navegador, o que torna o PDF idêntico em qualquer aparelho.

A versão 1 gerava o PDF com html2canvas, fotografando cada página. Esse caminho foi substituído porque depende da renderização de cada navegador, gera imagens pesadas e esbarra nos limites de memória de canvas do Safari no iPhone. O PDF vetorial tem texto selecionável e fica em torno de 180 KB para 6 páginas, contra cerca de 1,9 MB da versão anterior com o mesmo conteúdo.

As medidas do relatório foram convertidas diretamente do CSS da versão 1 (páginas de 794 × 1123 px), com `px(v) = v × 25,4 / 96` mm e corpos de fonte `v × 0,75` pt. Para ajustar o desenho, altere `src/report/layout.js`; a pré-visualização e o PDF acompanham juntos.

### Paginação

Cada bloco é medido antes de ser desenhado. Um cartão de sessão nunca é partido se couber inteiro numa página. Se for maior que uma página inteira, é dividido entre dois exercícios, nunca no meio de um, com a nota "Continua na próxima página" e o cabeçalho "(continuação)". Um único exercício maior que a folha é sinalizado em vermelho na prévia e no aviso antes de gerar o PDF.

### Testes

Os testes em `tests/report.test.mjs` verificam:

- o exemplo gera 6 páginas A4 exatas, sem excesso e dentro das margens;
- o planejamento vazio gera 1 página, e o aviso da prévia não entra no PDF;
- a divisão de sessões longas acontece entre exercícios, sem perder nenhum;
- o excesso de um exercício gigante é detectado;
- todos os 21 clubes geram o relatório, com escudo oficial ou monograma;
- as cores derivadas têm contraste legível para todos os clubes e para cores personalizadas;
- arquivos da versão 1 são convertidos sem perda;
- o PDF sem foto fica abaixo de 200 KB;
- o logo da Lab-4 sai como vetor, e só escudo e foto entram como imagem;
- altura e peso aceitam vírgula ou ponto, não geram unidade isolada e são lidos de arquivos antigos sem erro;
- a capa mostra os cinco campos sem invadir a foto, o escudo ou a faixa, com Altura e Peso sempre juntos;
- o atalho "Técnica de Desaceleração" usa uma categoria existente e chega ao PDF.

Qualquer alteração de layout deve manter esses testes passando.

## Manutenção comum

- **Novo clube:** acrescente a entrada em `src/core/config.js`. Com escudo oficial, salve o PNG em `src/assets/crests/<chave>.png` e use `crest: 'png'`; sem escudo, use `crest: 'mono'` e um `mono` de até 3 letras.
- **Novas características, frases rápidas ou sugestões de foco:** listas `TAGS`, `CONTEXT_QUICK`, `PREP_QUICK` e `FOCUS_SUGGEST` no mesmo arquivo.
- **Textos do relatório:** todos estão em `src/report/layout.js`.
- **Versão:** atualize `APP_VERSION` em `src/core/config.js` e `version` em `package.json`. Os aparelhos com o app instalado recebem o aviso "Há uma nova versão da aplicação" na próxima abertura com internet.

## Resolução do PDF

O PDF é vetorial. Textos, linhas, cartões, ícones e o logo da Lab-4 são desenhados como formas, e não como imagem, então ficam nítidos em qualquer zoom e na impressão. O logo é gravado uma única vez no arquivo e reaproveitado em todas as páginas (Form XObject), o que mantém o PDF leve.

Só três elementos continuam sendo imagens, por natureza: a foto do atleta (recortada em 1000 px, cerca de 590 ppi no círculo da capa), o escudo enviado pelo usuário (até 800 px) e os escudos oficiais da pasta `src/assets/crests/`. Estes vieram do Scouting com 200 px, o que dá cerca de 260 ppi na capa: bom para tela e impressão, mas visivelmente suave sob zoom forte. Para melhorar um clube, basta substituir o PNG pelo de maior resolução com o mesmo nome (de preferência 600 px ou mais, fundo transparente), sem alterar código.

## Atualizações nos aparelhos

Cada commit na `main` publica uma nova versão. Os apps instalados verificam se há versão nova ao abrir, ao voltar para a tela e a cada hora com o app aberto, sempre que houver internet. Quando encontram, mostram o aviso "Há uma nova versão da aplicação" com o botão **Atualizar**, que recarrega o app já na versão nova. Os dados salvos no aparelho não são afetados. O GitHub Pages pode levar até cerca de 10 minutos para servir os arquivos novos depois que o workflow termina.

## Histórico de versões

- **2.1.0:** campos opcionais **Altura (cm)** e **Peso (kg)** no cadastro do atleta, exibidos na capa do PDF ao lado de Categoria, Nascimento e Clube; novo atalho **+ Técnica de Desaceleração** na Fase de Preparação (categoria "Outro", a mesma do "+ Item livre"). Planejamentos e arquivos .json anteriores continuam válidos, sem migração: as medidas são propriedades opcionais e o esquema de dados segue na versão 2. Sem altura e peso, o PDF é idêntico ao da 2.0.1.
- **2.0.1:** logo da Lab-4 vetorial no PDF e na prévia (antes era imagem de 480 px); foto do atleta processada em 1000 px e escudo enviado em até 800 px; verificação de atualização também com o app aberto. O PDF do exemplo caiu de cerca de 180 KB para 130 KB.
- **2.0.0:** versão para smartphone (PWA), com PDF vetorial gerado por pdf-lib no lugar das capturas de tela da versão 1.

## Capa do PDF: distribuição dos campos

Abaixo do nome ficam Categoria, Nascimento e Clube, seguidos de Altura e Peso quando informados. Se todos cabem numa linha com o espaço entre campos reduzido de 22 px até no mínimo 14 px, ficam numa linha só. Se não cabem (clubes de nome longo), a primeira linha repete a da versão aprovada e Altura e Peso ficam juntos na linha de baixo; um clube de nome muito longo, que ocuparia uma linha sozinho, passa para o fim. O nome do atleta usa o maior corpo que o mantém em até duas linhas dentro da faixa colorida; com uma linha de campos, é o mesmo da versão aprovada.

## Dados e privacidade

Os dados ficam no IndexedDB do aparelho. A foto do atleta é recortada em quadrado e comprimida no próprio celular (até 1000 px, JPEG); escudos enviados são reduzidos a no máximo 800 px em PNG, preservando a transparência. Rascunhos da versão 1 salvos no mesmo endereço são migrados automaticamente.

O botão **Exportar** gera um `.json` com todos os campos, a foto e os escudos enviados. O formato é o mesmo da versão 1: uma cópia exportada aqui abre na versão 1 e vice-versa.

O relatório contém nome, foto e data de nascimento de atletas, em muitos casos menores de idade. Vale definir internamente quem pode receber os PDFs e por quanto tempo eles são guardados.

## Roteiro de testes em aparelhos

Validado em Chromium com emulação de iPhone 13 (tela, toque e agente de usuário) e com a Web Share API simulada. Ainda precisa ser confirmado em aparelhos reais, idealmente num iPhone com iOS 16 ou superior e num Android com Chrome recente:

- [ ] Abrir o link recebido pelo WhatsApp e instalar na tela de início.
- [ ] Fechar o app, colocar o aparelho em modo avião e reabrir: deve funcionar normalmente.
- [ ] Tirar a foto do atleta pela opção **Câmera** e escolher outra pela **Galeria** (no iPhone, conferir fotos HEIC).
- [ ] Trocar o clube e conferir a mudança de cores no formulário e na prévia.
- [ ] Preencher um planejamento com 8 ou mais sessões, fechar o app e reabrir: tudo deve estar lá.
- [ ] Gerar o PDF, tocar em **Compartilhar** e enviar pelo WhatsApp; abrir o PDF recebido em outro aparelho.
- [ ] Imprimir o PDF numa impressora A4 e conferir margens e cortes.
- [ ] Criar um segundo planejamento, alternar entre eles em **Planejamentos** e excluir um.
- [ ] Exportar no celular e importar no computador (arquivo único), e o caminho inverso.
- [ ] Instalar a Avaliação Funcional no mesmo aparelho e confirmar que os dois apps ficam separados.
- [ ] Testar em tela pequena (iPhone SE ou similar) e com o texto do sistema ampliado.
