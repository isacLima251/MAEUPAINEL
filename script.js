/* Espera todo o conteúdo do HTML ser carregado antes de executar o script */
document.addEventListener('DOMContentLoaded', () => {

    /* --- CONTROLO DA MODAL (JANELA POP-UP) --- */

    // 1. "Agarrar" os elementos do HTML que precisamos controlar
    const modal = document.getElementById('modal-detalhes');
    const modalCloseButton = document.getElementById('modal-close');
    const openModalButtons = document.querySelectorAll('.action-button');

    // "Agarrar" os campos de destino dentro da modal
    const modalCliente = document.getElementById('modal-cliente');
    const modalEmail = document.getElementById('modal-email');
    const modalTelefone = document.getElementById('modal-telefone');
    const modalCpf = document.getElementById('modal-cpf');
    const modalProduto = document.getElementById('modal-produto');
    const modalValor = document.getElementById('modal-valor');
    const modalStatusContainer = document.getElementById('modal-status-container');
    const modalData = document.getElementById('modal-data');
    const modalHistorico = document.getElementById('modal-historico');

    
    // 2. Função para ABRIR e PREENCHER a modal
    function abrirModal(event) {
        const button = event.currentTarget;
        const linhaTabela = button.closest('tr');

        // Verifica se linhaTabela existe (evita erro se não encontrar)
        if (!linhaTabela) return; 

        // Lê os dados da linha
        const cliente = linhaTabela.dataset.cliente;
        const email = linhaTabela.dataset.email;
        const telefone = linhaTabela.dataset.telefone;
        const cpf = linhaTabela.dataset.cpf;
        const produto = linhaTabela.dataset.produto;
        const valor = linhaTabela.dataset.valor;
        const status = linhaTabela.dataset.status;
        const statusTexto = linhaTabela.dataset.statusTexto;
        const data = linhaTabela.dataset.data;
        const historico = linhaTabela.dataset.historico;
        const atendente = linhaTabela.dataset.atendente;

        // Preenche os campos da modal
        modalCliente.textContent = cliente;
        modalEmail.textContent = email;
        modalTelefone.textContent = telefone;
        modalCpf.textContent = cpf;
        modalProduto.textContent = produto;
        modalValor.textContent = valor;
        modalData.textContent = data;
        modalStatusContainer.innerHTML = `<span class="status ${status}">${statusTexto}</span>`;
        modalHistorico.innerHTML = historico;
        // Pega os elementos span e select do atendente na modal
        const atendenteDisplay = document.getElementById('modal-atendente-display');
        const atendenteSelect = document.getElementById('modal-atendente-select');

        // Guarda a referência da linha atual para usar depois (IMPORTANTE)
        atendenteSelect.dataset.currentRowId = linhaTabela.rowIndex; // Guarda o índice da linha

        if (atendente === 'nao_definido') {
            // Se não definido, mostra o SELECT e esconde o SPAN
            atendenteDisplay.style.display = 'none';
            atendenteSelect.style.display = ''; // Mostra o select
            atendenteSelect.value = ""; // Reseta para a opção "-- Atribuir --"
        } else {
            // Se JÁ definido, mostra o SPAN e esconde o SELECT
            atendenteDisplay.textContent = atendente; // Mostra o nome (ex: "João")
            atendenteDisplay.style.display = ''; // Mostra o span
            atendenteSelect.style.display = 'none'; // Esconde o select
        }
        // Abre a modal
        modal.classList.add('active');
    }

    // 3. Função para FECHAR a modal
    function fecharModal() {
        modal.classList.remove('active');
    }

    // 4. Adicionar os "Ouvintes de Eventos"
    openModalButtons.forEach(button => {
        button.addEventListener('click', abrirModal); 
    });

    // Adiciona o ouvinte apenas se o botão de fechar existir
    if (modalCloseButton) {
        modalCloseButton.addEventListener('click', fecharModal);
    }

    // Adiciona o ouvinte apenas se a modal existir
    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                fecharModal();
            }
        });
    }


    /* --- CONTROLO DOS BOTÕES DE FILTRO DE DATA --- */

    const filterButtons = document.querySelectorAll('.filter-btn');

    function handleFilterClick(event) {
        filterButtons.forEach(btn => {
            btn.classList.remove('active');
        });
        event.currentTarget.classList.add('active');
    }

    filterButtons.forEach(button => {
        button.addEventListener('click', handleFilterClick);
    });


    /* --- CONTROLO DE NAVEGAÇÃO ENTRE PÁGINAS --- */

    const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
    const menuLinks = document.querySelectorAll('.sidebar-menu a');
    const pages = document.querySelectorAll('.content-area .page');
    const mainTitle = document.getElementById('main-page-title');

    function handleMenuClick(event) {
        event.preventDefault(); 

        const link = event.currentTarget;
        const targetPageId = link.dataset.target;
        const targetTitle = link.dataset.title;
        const targetMenuItem = link.closest('.menu-item');

        pages.forEach(page => {
            page.classList.remove('active');
        });
        menuItems.forEach(item => {
            item.classList.remove('active');
        });

        targetMenuItem.classList.add('active');
        
        const targetPage = document.getElementById(targetPageId);
        if (targetPage) {
            targetPage.classList.add('active');
        }
        
        if (mainTitle) {
            mainTitle.textContent = targetTitle;
        }
    }

    menuLinks.forEach(link => {
        link.addEventListener('click', handleMenuClick);
    });


    /* --- CONTROLO DOS GRÁFICOS (Chart.js) --- (ESTA PARTE FALTAVA) */

    // Cores do tema
    const corAzul = '#5d5fef';
    const corVerde = '#00d285';
    const corAmarela = '#ffb822';
    const corVermelha = '#ff5b5b';
    const corTexto = '#e0e0e0';

    // 1. Gráfico de Barras (Funil)
    const ctxFunil = document.getElementById('funilChart');
    if (ctxFunil) {
        new Chart(ctxFunil, {
            type: 'bar',
            data: {
                labels: ['Agendado', 'Pago', 'A Receber', 'Frustrado'],
                datasets: [{
                    label: 'Valores (R$)',
                    data: [8253, 3662, 4591, 834],
                    backgroundColor: [corAzul, corVerde, corAmarela, corVermelha],
                    borderRadius: 5
                }]
            },
            options: {
                maintainAspectRatio: false, // <-- ADICIONA ESTA LINHA
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: corTexto },
                        grid: { color: '#3a3b52' }
                    },
                    x: {
                        ticks: { color: corTexto },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // 2. Gráfico de Donut (Composição)
    const ctxComposicao = document.getElementById('composicaoChart');
    if (ctxComposicao) {
        new Chart(ctxComposicao, {
            type: 'doughnut',
            data: {
                labels: ['Pago', 'A Receber', 'Frustrado'],
                datasets: [{
                    label: 'Composição do Agendado (R$)',
                    data: [3662, 4591, 834],
                    backgroundColor: [corVerde, corAmarela, corVermelha],
                    borderColor: '#27293d',
                    borderWidth: 5
                }]
            },
            options: {
                maintainAspectRatio: false, // <-- ADICIONA ESTA LINHA
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: corTexto }
                    }
                }
            }
        });
    }

    /* --- CONTROLO DOS FILTROS DA PÁGINA DE VENDAS (ATUALIZADO COM ATENDENTE) --- */

    // 1. "Agarrar" os elementos
    const salesSearchInput = document.getElementById('sales-search');
    const statusSelectInput = document.getElementById('status-select');
    const attendantSelectInput = document.getElementById('attendant-select'); // <-- NOVO
    const salesTableRows = document.querySelectorAll('#page-vendas tbody tr');
    const salesCountEl = document.getElementById('sales-count');
    const salesTotalValueEl = document.getElementById('sales-total-value');

    
    // 2. Função principal que será chamada para filtrar E CALCULAR
    function filterSalesTable() {
        
        // Pega os valores atuais dos filtros
        const searchTerm = (salesSearchInput ? salesSearchInput.value : '').toLowerCase();
        const statusFilter = statusSelectInput ? statusSelectInput.value : 'todos';
        const attendantFilter = attendantSelectInput ? attendantSelectInput.value : 'todos'; // <-- NOVO

        // Variáveis para os nossos cálculos
        let visibleCount = 0;
        let totalValue = 0;

        
        // 3. Percorre cada linha da tabela
        salesTableRows.forEach(row => {

            // Lê os dados guardados em cada linha
            const cliente = (row.dataset.cliente || '').toLowerCase();
            const email = (row.dataset.email || '').toLowerCase();
            const cpf = (row.dataset.cpf || '').toLowerCase();
            const status = row.dataset.status;
            const atendente = row.dataset.atendente; // <-- NOVO

            // 4. Lógica de Verificação
            const matchesSearch = cliente.includes(searchTerm) ||
                                  email.includes(searchTerm) ||
                                  cpf.includes(searchTerm);
            
            const matchesStatus = (statusFilter === 'todos') || (status === statusFilter);
            
            const matchesAttendant = (attendantFilter === 'todos') || (atendente === attendantFilter); // <-- NOVO

            // 5. Decide se mostra ou esconde a linha
            // A linha SÓ é mostrada se bater na PESQUISA E no STATUS E no ATENDENTE
            if (matchesSearch && matchesStatus && matchesAttendant) { // <-- CONDIÇÃO ATUALIZADA
                row.style.display = ''; 
                visibleCount++; 
                const valorNumerico = parseFloat(row.dataset.valorNumerico);
                if (!isNaN(valorNumerico)) {
                    totalValue += valorNumerico;
                }
            } else {
                row.style.display = 'none'; 
            }
        });

        // 7. ATUALIZA OS MINI-CARDS
        if (salesCountEl) {
            salesCountEl.textContent = visibleCount; 
        }
        if (salesTotalValueEl) {
            salesTotalValueEl.textContent = totalValue.toLocaleString('pt-br', { style: 'currency', currency: 'BRL' });
        }
    }

    // 8. Adicionar os "Ouvintes de Eventos"
    if (salesSearchInput) {
        salesSearchInput.addEventListener('keyup', filterSalesTable);
    }
    if (statusSelectInput) {
        statusSelectInput.addEventListener('change', filterSalesTable);
    }
    if (attendantSelectInput) { // <-- NOVO
        attendantSelectInput.addEventListener('change', filterSalesTable);
    }

    // 9. Chama a função uma vez ao carregar a página
    filterSalesTable();

    // 8. Adicionar os "Ouvintes de Eventos"
    if (salesSearchInput) {
        salesSearchInput.addEventListener('keyup', filterSalesTable);
    }
    if (statusSelectInput) {
        statusSelectInput.addEventListener('change', filterSalesTable);
    }

    // 9. Chama a função uma vez ao carregar a página
    // Isto calcula os totais iniciais (quando tudo está visível)
    filterSalesTable();

    // 6. Adicionar os "Ouvintes de Eventos"
    
    // Ouve o evento 'keyup' (quando o utilizador solta uma tecla)
    if (salesSearchInput) {
        salesSearchInput.addEventListener('keyup', filterSalesTable);
    }

    // Ouve o evento 'change' (quando o utilizador muda a opção do select)
    if (statusSelectInput) {
        statusSelectInput.addEventListener('change', filterSalesTable);
    }

    /* --- CONTROLO DA PÁGINA DE INTEGRAÇÃO (Botão Copiar) --- */

    // 1. "Agarrar" os elementos
    const copyUrlButton = document.getElementById('copy-url-btn');
    const postbackUrlInput = document.getElementById('postback-url');

    // 2. Função para copiar o texto
    function copyUrlToClipboard() {
        if (postbackUrlInput) {
            // Seleciona o texto dentro do input
            postbackUrlInput.select();
            // Tenta copiar para a área de transferência (clipboard)
            try {
                document.execCommand('copy');
                
                // Dá um feedback visual ao utilizador
                copyUrlButton.innerHTML = '<i class="fas fa-check"></i> Copiado!';
                copyUrlButton.style.backgroundColor = '#00d285'; // Fica verde
                
                // Volta ao normal depois de 2 segundos
                setTimeout(() => {
                    copyUrlButton.innerHTML = '<i class="fas fa-copy"></i> Copiar';
                    copyUrlButton.style.backgroundColor = '#5d5fef'; // Volta ao azul
                }, 2000);

            } catch (err) {
                alert('Erro ao copiar. Por favor, copie manualmente.');
            }
        }
    }

    // 3. Adicionar o "Ouvinte de Evento"
    if (copyUrlButton) {
        copyUrlButton.addEventListener('click', copyUrlToClipboard);
    }

    /* --- CONTROLO DA ATRIBUIÇÃO DE ATENDENTE NA MODAL --- */

    // 1. "Agarrar" o select da modal
    const modalAttendantSelect = document.getElementById('modal-atendente-select');

    // 2. Função para lidar com a mudança no select
    function handleAttendantChange(event) {
        const select = event.currentTarget;
        const novoAtendente = select.value; // O valor selecionado (ex: "joao")
        const nomeAtendente = select.options[select.selectedIndex].text; // O texto visível (ex: "João")
        
        // Recupera o índice da linha que guardámos quando a modal abriu
        const rowIndex = parseInt(select.dataset.currentRowId); 
        
        // Encontra a linha da tabela correspondente
        // Lembre-se que salesTableRows foi definido na secção de filtros
        const linhaParaAtualizar = salesTableRows[rowIndex - 1]; // -1 porque rowIndex começa em 1, e arrays em 0

        if (linhaParaAtualizar && novoAtendente) {
            // Atualiza o data-atendente na linha <tr>
            linhaParaAtualizar.dataset.atendente = novoAtendente;

            // Atualiza o texto na célula <td> da tabela
            // Assumindo que "Atendente" é a 3ª coluna (índice 2)
            const celulaAtendente = linhaParaAtualizar.cells[2]; 
            if (celulaAtendente) {
                celulaAtendente.textContent = nomeAtendente; 
            }

            // (Opcional) Poderia esconder o select e mostrar o span com o novo nome aqui mesmo.
            // Para simplificar, vamos deixar assim. Na próxima vez que abrir a modal, já mostrará o span.

            // IMPORTANTE: Re-executa a função de filtro para que a tabela e os totais se atualizem!
            filterSalesTable(); 

            alert(`Atendente da linha ${rowIndex} atualizado para ${nomeAtendente} (visualmente). Recarregue a página para reverter.`);
        }
    }

    // 3. Adicionar o "Ouvinte de Evento"
    if (modalAttendantSelect) {
        modalAttendantSelect.addEventListener('change', handleAttendantChange);
    }

    /* --- CONTROLO DO FILTRO DE ATENDENTE NA PÁGINA RESUMO --- */

    // 1. "Agarrar" os elementos
    const summaryAttendantSelect = document.getElementById('summary-attendant-select');
    // Precisamos agarrar os spans dos valores dos cards (vamos pegar só alguns como exemplo)
    const cardAgendadoValor = document.querySelector('#page-resumo .cards-container .card:nth-child(1) .card-value');
    const cardPagoValor = document.querySelector('#page-resumo .cards-container .card:nth-child(2) .card-value');
    const cardAReceberValor = document.querySelector('#page-resumo .cards-container .card:nth-child(3) .card-value');
    const cardFrustradoValor = document.querySelector('#page-resumo .cards-container .card:nth-child(4) .card-value');
    // Adicione mais cards se quiser atualizar todos...

    // Precisamos das instâncias dos gráficos (já criadas na seção de gráficos)
    // Para isso, vamos guardar as instâncias quando as criamos.
    // MODIFICAÇÃO NECESSÁRIA na seção de gráficos:
    let funilChartInstance = null; // Declara a variável fora
    let composicaoChartInstance = null; // Declara a variável fora

    // VOLTA LÁ NA SEÇÃO "CONTROLO DOS GRÁFICOS" E FAZ ESTA MUDANÇA:
    // Antes: new Chart(ctxFunil, {...});
    // Depois: funilChartInstance = new Chart(ctxFunil, {...}); 
    
    // Antes: new Chart(ctxComposicao, {...});
    // Depois: composicaoChartInstance = new Chart(ctxComposicao, {...});

    // 2. Dados de Exemplo (Simulação)
    const summaryData = {
        todos: {
            agendado: 8253, pago: 3662, aReceber: 4591, frustrado: 834, /* ... outros ...*/
            graficoFunil: [8253, 3662, 4591, 834], graficoComp: [3662, 4591, 834]
        },
        joao: {
            agendado: 4000, pago: 2000, aReceber: 1500, frustrado: 500,
            graficoFunil: [4000, 2000, 1500, 500], graficoComp: [2000, 1500, 500]
        },
        maria: {
            agendado: 3000, pago: 1000, aReceber: 1800, frustrado: 200,
            graficoFunil: [3000, 1000, 1800, 200], graficoComp: [1000, 1800, 200]
        },
        // Adicione dados para Pedro, Ana, Nao Definido se quiser...
        pedro: { agendado: 500, pago: 300, aReceber: 200, frustrado: 0, graficoFunil: [500, 300, 200, 0], graficoComp: [300, 200, 0]},
        ana: { agendado: 753, pago: 362, aReceber: 91, frustrado: 134, graficoFunil: [753, 362, 91, 134], graficoComp: [362, 91, 134] },
        nao_definido: { agendado: 0, pago: 0, aReceber: 0, frustrado: 0, graficoFunil: [0, 0, 0, 0], graficoComp: [0, 0, 0] }
    };

    // Função para formatar número como moeda BRL
    function formatCurrency(value) {
        return value.toLocaleString('pt-br', { style: 'currency', currency: 'BRL' });
    }

    // 3. Função para atualizar os dados do Resumo
    function updateSummaryData() {
        const selectedAttendant = summaryAttendantSelect ? summaryAttendantSelect.value : 'todos';
        const data = summaryData[selectedAttendant] || summaryData.todos; // Usa 'todos' se não encontrar

        // Atualiza os CARDS
        if (cardAgendadoValor) cardAgendadoValor.textContent = formatCurrency(data.agendado);
        if (cardPagoValor) cardPagoValor.textContent = formatCurrency(data.pago);
        if (cardAReceberValor) cardAReceberValor.textContent = formatCurrency(data.aReceber);
        if (cardFrustradoValor) cardFrustradoValor.textContent = formatCurrency(data.frustrado);
        // Atualize os outros cards aqui...

        // Atualiza os GRÁFICOS
        if (funilChartInstance) {
            funilChartInstance.data.datasets[0].data = data.graficoFunil;
            funilChartInstance.update(); // Manda o gráfico redesenhar
        }
        if (composicaoChartInstance) {
            composicaoChartInstance.data.datasets[0].data = data.graficoComp;
            composicaoChartInstance.update(); // Manda o gráfico redesenhar
        }
    }

    // 4. Adicionar o "Ouvinte de Evento" para o novo select
    if (summaryAttendantSelect) {
        summaryAttendantSelect.addEventListener('change', updateSummaryData);
    }

    // 5. Chamar a função uma vez no início para carregar os dados de "Todos"
    // (Pode ser necessário garantir que os gráficos já foram inicializados - vamos colocar dentro do DOMContentLoaded)
    // UpdateSummaryData() será chamado após a inicialização dos gráficos agora.

    // --- FIM DO NOVO BLOCO ---

    // IMPORTANTE: Modificação na inicialização dos gráficos
    // Volta à seção /* --- CONTROLO DOS GRÁFICOS (Chart.js) --- */
    // Garante que a atribuição às variáveis `...Instance` é feita
    // E chama `updateSummaryData()` DEPOIS de inicializar AMBOS os gráficos
    /* Exemplo:
    if (ctxFunil) {
        funilChartInstance = new Chart(ctxFunil, { ... }); // Atribui aqui
    }
    if (ctxComposicao) {
        composicaoChartInstance = new Chart(ctxComposicao, { ... }); // Atribui aqui
        
        // Chama a função DEPOIS que os gráficos existirem
        updateSummaryData(); 
    }
    */
   /* --- CONTROLO DA PÁGINA DE CONFIGURAÇÃO (Adicionar Atendente) --- */

    // 1. "Agarrar" os elementos
    const addAttendantBtn = document.getElementById('add-attendant-btn');
    const attendantNameInput = document.getElementById('add-attendant-name');
    const attendantCodeInput = document.getElementById('add-attendant-code');
    const attendantsTableBody = document.getElementById('attendants-table-body');

    // 2. Função para adicionar atendente à tabela (VISUALMENTE)
    function addAttendantToTable() {
        const name = attendantNameInput.value.trim(); // Pega o nome e remove espaços extras
        const code = attendantCodeInput.value.trim(); // Pega o código e remove espaços extras

        // Validação simples
        if (name === '' || code === '') {
            alert('Por favor, preencha o Nome e o Código do atendente.');
            return; // Para a execução se inválido
        }
        if (code.length !== 4) {
             alert('O Código deve ter exatamente 4 caracteres.');
             return; // Para a execução se inválido
        }

        // Cria uma nova linha (<tr>)
        const newRow = document.createElement('tr');
        
        // Cria as células (<td>)
        const nameCell = document.createElement('td');
        nameCell.textContent = name;
        const codeCell = document.createElement('td');
        codeCell.textContent = code;

        // Adiciona as células à linha
        newRow.appendChild(nameCell);
        newRow.appendChild(codeCell);

        // Adiciona a nova linha ao corpo da tabela (tbody)
        if (attendantsTableBody) {
             attendantsTableBody.appendChild(newRow);
        }

        // Limpa os campos do formulário
        attendantNameInput.value = '';
        attendantCodeInput.value = '';

        alert(`Atendente ${name} (${code}) adicionado visualmente à tabela.`);
        // Futuro: Aqui seria feita a chamada ao Backend para salvar permanentemente.
    }

    // 3. Adicionar o "Ouvinte de Evento" para o botão
    if (addAttendantBtn) {
        addAttendantBtn.addEventListener('click', addAttendantToTable);
    }




}); // Esta é a linha final, não adiciones nada depois dela