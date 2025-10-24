# Painel de Afiliado (Frontend)

## Visão Geral
Este repositório contém o Frontend do Painel de Afiliado focado na gestão de vendas da plataforma Braip no modelo **After Pay**. A interface foi construída com HTML, CSS e JavaScript puro, utilizando dados de exemplo e simulações visuais. O objetivo final é integrar este Frontend a um Backend que processe os dados reais provenientes da Braip.

## Tecnologias Utilizadas
- **HTML5** para a estrutura semântica das páginas.
- **CSS3** para estilização, layout utilizando Flexbox e um tema escuro.
- **JavaScript (ES6+)** para a lógica de interatividade, navegação, filtros, gráficos e utilidades.
- **Chart.js** para geração dos gráficos na página "Resumo".
- **Font Awesome** para os ícones utilizados na interface.

## Estrutura de Arquivos
O projeto é composto pelos seguintes arquivos principais:

| Arquivo      | Descrição |
|--------------|-----------|
| `index.html` | Estrutura principal da aplicação, incluindo layout geral, menu lateral, cabeçalho, conteúdo das quatro páginas (em divs) e a modal de detalhes. Implementa o conceito de SPA simples escondendo/mostrando seções. |
| `style.css`  | Responsável pela aparência visual, tema escuro, layout responsivo e estilos de componentes como cards, tabelas, gráficos, modal e formulários. |
| `script.js`  | Contém toda a lógica de interatividade: navegação, filtros, atualização dinâmica de valores, gráficos, modal de detalhes, cópia de URL e manipulação visual de atendentes. |

## Descrição das Páginas e Funcionalidades
### Navegação (SPA)
- O menu lateral alterna entre as seções **Resumo**, **Vendas**, **Integração** e **Configuração**.
- A função `handleMenuClick` (em `script.js`) controla a visibilidade das páginas e atualiza o item ativo do menu.

### Página Resumo (`#page-resumo`)
- Filtros visuais para período (mês atual, mês passado, ano) e seleção de intervalo personalizado.
- Filtro adicional por atendente, simulando dados diferentes conforme o atendente escolhido.
- Oito cards exibem métricas principais (Agendado, Pago, A Receber, Frustrado, Vendas Diretas, Investimento, Lucro e ROI).
- Dois gráficos gerados com Chart.js: um gráfico de barras para funil agendado e um gráfico donut para composição de status de pagamento.

### Página Vendas (`#page-vendas`)
- Filtros por busca textual (nome, e-mail, CPF), por status e por atendente.
- Mini cards exibem quantidade de vendas visíveis e valor total filtrado em tempo real.
- Tabela com informações das vendas. Cada linha possui atributos `data-*` contendo os detalhes usados na modal e nos filtros.
- Botão "Ver" abre a modal de detalhes com as informações completas da venda.

### Modal de Detalhes (`#modal-detalhes`)
- Exibe dados completos da venda com base nos atributos `data-*` da linha selecionada.
- Quando a venda está sem atendente (`data-atendente="nao_definido"`), um `select` permite atribuir visualmente um atendente.
- A função `handleAttendantChange` atualiza temporariamente a linha da tabela até que a página seja recarregada.

### Página Integração (`#page-integracao`)
- Exibe um URL de postback de exemplo e um botão para copiar o valor para a área de transferência.
- Inclui instruções passo a passo para configurar o postback na Braip, com destaque para eventos relevantes (Pagamento Aprovado, Agendado, Frustrada etc.).

### Página Configuração (`#page-configuracao`)
- Formulário visual para Nome, E-mail e Investimento Mensal com botão "Salvar" (simulado).
- Seção para gerenciar atendentes com formulário de cadastro (Nome e Código) e tabela listando atendentes existentes.
- A função `addAttendantToTable` adiciona visualmente um novo atendente à tabela (alteração temporária).

## Integração Necessária com o Backend
Para transformar a interface em um sistema funcional, o Backend deverá fornecer e receber dados reais. Abaixo estão os principais pontos de integração:

### Endpoints para Consulta
- `GET /api/sales`: lista de vendas com suporte a filtros via query string (`search`, `status`, `attendant`, `startDate`, `endDate`). Deve retornar todos os campos hoje mapeados nos atributos `data-*` das linhas da tabela.
- `GET /api/summary`: retorna dados agregados para os cards e gráficos, com filtros por período e atendente (`period`, `attendant`).
- `GET /api/attendants`: lista de atendentes cadastrados, utilizada para popular dropdowns e formulários.
- `GET /api/settings`: dados de configuração do usuário (Nome, E-mail, Investimento Mensal).
- `GET /api/postback-url`: URL real do postback para exibição na página Integração.

### Endpoints para Atualização
- `POST /api/sales/{sale_id}/assign-attendant`: salva a atribuição de um atendente para uma venda.
- `POST /api/attendants`: cadastra um novo atendente.
- `PUT /api/settings`: persiste alterações nas configurações do usuário.

### Endpoint de Postback
- O Backend deve expor um endpoint para receber as notificações POST da Braip.
- Este endpoint precisa processar os dados (incluindo e-mail do cliente), extrair os quatro primeiros caracteres do e-mail para identificar o código do atendente, associar a venda ao atendente correspondente ou marcá-la como "Não Definido" e salvar/atualizar a venda no banco de dados.

## Próximos Passos (Backend)
- Implementar a aplicação de servidor (Node.js, PHP, Python ou outra tecnologia).
- Configurar e gerenciar o banco de dados (MySQL, PostgreSQL, MongoDB etc.).
- Implementar o endpoint para receber o postback da Braip.
- Disponibilizar toda a API necessária para o Frontend.
- (Opcional, recomendado) Adicionar autenticação de usuário.
- Providenciar infraestrutura de hospedagem para o Backend e banco de dados.

## Como Executar o Frontend
Nenhuma configuração especial é necessária. Basta abrir o arquivo `index.html` em um navegador moderno para visualizar a interface. Como os dados são simulados no Frontend, não é necessário servidor local enquanto o Backend não estiver implementado.

