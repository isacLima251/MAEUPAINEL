const API_BASE_URL = 'http://localhost:3001/api';

let listaAtendentes = [];
let funilChartInstance = null;
let composicaoChartInstance = null;
let summaryFilterButtons = [];
let summaryAttendantSelect = null;
let salesTableBody = null;
let salesCountEl = null;
let salesTotalValueEl = null;
let modal = null;
let modalCloseButton = null;
let modalCliente = null;
let modalEmail = null;
let modalTelefone = null;
let modalCpf = null;
let modalProduto = null;
let modalValor = null;
let modalStatusContainer = null;
let modalData = null;
let modalHistorico = null;
let modalAtendenteDisplay = null;
let modalAtendenteSelect = null;
let manualStatusButtons = [];
let modalCurrentTransactionIdInput = null;
let attendantsTableBodyEl = null;
let attendantsTableData = [];

const periodButtonMap = {
    'este mês': 'this_month',
    'mês passado': 'last_month',
    'este ano': 'this_year'
};

document.addEventListener('DOMContentLoaded', () => {
    cacheDomElements();
    setupNavigation();
    setupFilterButtons();
    setupCopyButton();
    setupModal();
    setupEventListeners();
    initializeCharts();

    initData().catch((error) => {
        console.error('Erro ao carregar dados iniciais:', error);
        alert('Não foi possível carregar os dados iniciais. Verifique sua conexão com a API.');
    });
});

function cacheDomElements() {
    summaryFilterButtons = Array.from(document.querySelectorAll('.filter-btn'));
    summaryAttendantSelect = document.getElementById('summary-attendant-select');
    salesTableBody = document.querySelector('#page-vendas tbody');
    salesCountEl = document.getElementById('sales-count');
    salesTotalValueEl = document.getElementById('sales-total-value');

    modal = document.getElementById('modal-detalhes');
    modalCloseButton = document.getElementById('modal-close');
    modalCliente = document.getElementById('modal-cliente');
    modalEmail = document.getElementById('modal-email');
    modalTelefone = document.getElementById('modal-telefone');
    modalCpf = document.getElementById('modal-cpf');
    modalProduto = document.getElementById('modal-produto');
    modalValor = document.getElementById('modal-valor');
    modalStatusContainer = document.getElementById('modal-status-container');
    modalData = document.getElementById('modal-data');
    modalHistorico = document.getElementById('modal-historico');
    modalAtendenteDisplay = document.getElementById('modal-atendente-display');
    modalAtendenteSelect = document.getElementById('modal-atendente-select');
    manualStatusButtons = Array.from(document.querySelectorAll('.manual-status-btn'));
    modalCurrentTransactionIdInput = document.getElementById('modal-current-transaction-id');
    attendantsTableBodyEl = document.getElementById('attendants-table-body');

    bindManualStatusButtons();
}

async function initData() {
    await loadAttendants();
    await Promise.all([
        loadSettingsData(),
        loadPostbackUrl(),
        loadAttendantsTable()
    ]);
    await updateSummaryData();
    await loadSalesData();
}

function setupNavigation() {
    const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
    const menuLinks = document.querySelectorAll('.sidebar-menu a');
    const pages = document.querySelectorAll('.content-area .page');
    const mainTitle = document.getElementById('main-page-title');

    menuLinks.forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();

            const targetPageId = link.dataset.target;
            const targetTitle = link.dataset.title;
            const targetMenuItem = link.closest('.menu-item');

            pages.forEach((page) => page.classList.remove('active'));
            menuItems.forEach((item) => item.classList.remove('active'));

            if (targetMenuItem) {
                targetMenuItem.classList.add('active');
            }

            const targetPage = document.getElementById(targetPageId);
            if (targetPage) {
                targetPage.classList.add('active');
            }

            if (mainTitle) {
                mainTitle.textContent = targetTitle || mainTitle.textContent;
            }
        });
    });
}

function setupFilterButtons() {
    summaryFilterButtons.forEach((button) => {
        const label = button.textContent.trim().toLowerCase();
        if (!button.dataset.period && periodButtonMap[label]) {
            button.dataset.period = periodButtonMap[label];
        }

        button.addEventListener('click', () => {
            summaryFilterButtons.forEach((btn) => btn.classList.remove('active'));
            button.classList.add('active');
            updateSummaryData();
        });
    });
}

function setupCopyButton() {
    const copyUrlButton = document.getElementById('copy-url-btn');
    const postbackUrlInput = document.getElementById('postback-url');

    if (!copyUrlButton || !postbackUrlInput) {
        return;
    }

    copyUrlButton.addEventListener('click', async () => {
        postbackUrlInput.select();
        try {
            document.execCommand('copy');
            copyUrlButton.innerHTML = '<i class="fas fa-check"></i> Copiado!';
            copyUrlButton.style.backgroundColor = '#00d285';
            setTimeout(() => {
                copyUrlButton.innerHTML = '<i class="fas fa-copy"></i> Copiar';
                copyUrlButton.style.backgroundColor = '#5d5fef';
            }, 2000);
        } catch (error) {
            console.error('Falha ao copiar URL:', error);
            alert('Erro ao copiar o URL. Por favor, copie manualmente.');
        }
    });
}

function setupModal() {
    if (!modal) {
        return;
    }

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            fecharModal();
        }
    });

    if (modalCloseButton) {
        modalCloseButton.addEventListener('click', fecharModal);
    }
}

function bindManualStatusButtons() {
    if (!manualStatusButtons || manualStatusButtons.length === 0) {
        manualStatusButtons = Array.from(document.querySelectorAll('.manual-status-btn'));
    }

    manualStatusButtons.forEach((button) => {
        button.removeEventListener('click', handleManualStatusUpdate);
        button.addEventListener('click', handleManualStatusUpdate);
    });
}

function setupEventListeners() {
    const salesSearchInput = document.getElementById('sales-search');
    const salesStatusSelect = document.getElementById('salesStatusSelect') || document.getElementById('status-select');
    const salesAttendantSelect = document.getElementById('sales-attendant-select') || document.getElementById('attendant-select');
    const addAttendantBtn = document.getElementById('add-attendant-btn');
    const saveSettingsButton = document.getElementById('saveSettingsButton') || document.querySelector('.save-btn');
    const attendantsTableBody = attendantsTableBodyEl;

    if (summaryAttendantSelect) {
        summaryAttendantSelect.addEventListener('change', updateSummaryData);
    }

    if (modalAtendenteSelect) {
        modalAtendenteSelect.addEventListener('change', handleAttendantChange);
    }

    if (salesSearchInput) {
        salesSearchInput.addEventListener('keyup', filterSalesTable);
    }

    if (salesStatusSelect) {
        salesStatusSelect.addEventListener('change', filterSalesTable);
    }

    if (salesAttendantSelect) {
        salesAttendantSelect.addEventListener('change', filterSalesTable);
    }

    if (addAttendantBtn) {
        addAttendantBtn.addEventListener('click', addAttendantToTable);
    }

    if (saveSettingsButton) {
        saveSettingsButton.addEventListener('click', saveSettings);
    }

    if (attendantsTableBody) {
        attendantsTableBody.addEventListener('click', handleAttendantTableClick);
    }
}

function initializeCharts() {
    const corAzul = '#5d5fef';
    const corVerde = '#00d285';
    const corAmarela = '#ffb822';
    const corVermelha = '#ff5b5b';
    const corTexto = '#e0e0e0';

    const ctxFunil = document.getElementById('funilChart');
    if (ctxFunil) {
        funilChartInstance = new Chart(ctxFunil, {
            type: 'bar',
            data: {
                labels: ['Agendado', 'Pago', 'A Receber', 'Frustrado'],
                datasets: [
                    {
                        label: 'Valores (R$)',
                        data: [0, 0, 0, 0],
                        backgroundColor: [corAzul, corVerde, corAmarela, corVermelha],
                        borderRadius: 5
                    }
                ]
            },
            options: {
                maintainAspectRatio: false,
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

    const ctxComposicao = document.getElementById('composicaoChart');
    if (ctxComposicao) {
        composicaoChartInstance = new Chart(ctxComposicao, {
            type: 'doughnut',
            data: {
                labels: ['Pago', 'A Receber', 'Frustrado'],
                datasets: [
                    {
                        label: 'Composição do Agendado (R$)',
                        data: [0, 0, 0],
                        backgroundColor: [corVerde, corAmarela, corVermelha],
                        borderColor: '#27293d',
                        borderWidth: 5
                    }
                ]
            },
            options: {
                maintainAspectRatio: false,
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
}

async function loadAttendants() {
    try {
        const attendants = await fetchJson('/attendants');
        if (Array.isArray(attendants)) {
            const sanitizedAttendants = attendants
                .filter((attendant) => attendant && attendant.code && attendant.name)
                .map((attendant) => ({
                    code: String(attendant.code),
                    name: String(attendant.name),
                    monthlyCost: Number(attendant.monthlyCost ?? attendant.monthly_cost ?? 0) || 0
                }));

            const hasDefault = sanitizedAttendants.some(
                (attendant) => attendant.code === 'nao_definido'
            );

            if (!hasDefault) {
                sanitizedAttendants.unshift({ code: 'nao_definido', name: 'Não Definido', monthlyCost: 0 });
            }

            listaAtendentes = sanitizedAttendants;
            populateAttendantDropdowns();
        } else {
            throw new Error('Formato inválido de atendentes.');
        }
    } catch (error) {
        console.error('Erro ao carregar atendentes:', error);
        alert('Não foi possível carregar a lista de atendentes.');
        listaAtendentes = [{ code: 'nao_definido', name: 'Não Definido', monthlyCost: 0 }];
        populateAttendantDropdowns();
    }
}

function populateAttendantDropdowns() {
    const summarySelect = summaryAttendantSelect;
    const salesSelect = document.getElementById('sales-attendant-select') || document.getElementById('attendant-select');
    const modalSelect = modalAtendenteSelect;

    if (summarySelect) {
        summarySelect.innerHTML = '';
        addOption(summarySelect, 'todos', 'Todos');
    }

    if (salesSelect) {
        salesSelect.innerHTML = '';
        addOption(salesSelect, 'todos', 'Todos');
    }

    if (modalSelect) {
        modalSelect.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '-- Atribuir --';
        defaultOption.disabled = true;
        defaultOption.selected = true;
        modalSelect.appendChild(defaultOption);
    }

    listaAtendentes.forEach((attendant) => {
        const value = attendant.code || attendant.id || '';
        const label = attendant.name || attendant.nome || value;
        if (summarySelect) {
            addOption(summarySelect, value, label);
        }
        if (salesSelect) {
            addOption(salesSelect, value, label);
        }
        if (modalSelect) {
            addOption(modalSelect, value, label);
        }
    });

    if (modalSelect) {
        modalSelect.value = '';
    }
}

function addOption(select, value, label) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
}

async function loadSettingsData() {
    try {
        const settings = await fetchJson('/settings');
        displaySettings(settings);
    } catch (error) {
        console.error('Erro ao carregar configurações:', error);
        alert('Não foi possível carregar as configurações.');
    }
}

function displaySettings(settings) {
    if (!settings) {
        return;
    }
    const nomeInput = document.getElementById('config-nome');
    const emailInput = document.getElementById('config-email');
    const investimentoInput = document.getElementById('config-investimento');

    const nome = settings.name ?? settings.nome ?? settings.userName ?? '';
    const email = settings.email ?? settings.userEmail ?? '';
    const investimento =
        settings.investment ??
        settings.monthlyInvestment ??
        settings.investimento ??
        0;

    if (nomeInput) {
        nomeInput.value = nome;
    }
    if (emailInput) {
        emailInput.value = email;
    }
    if (investimentoInput) {
        investimentoInput.value = investimento;
    }
}

async function loadPostbackUrl() {
    try {
        const data = await fetchJson('/postback-url');
        displayPostbackUrl(data);
    } catch (error) {
        console.error('Erro ao carregar URL de postback:', error);
        alert('Não foi possível carregar o URL de postback.');
    }
}

function displayPostbackUrl(data) {
    const postbackUrlInput = document.getElementById('postback-url');
    if (!postbackUrlInput) {
        return;
    }

    if (data && typeof data === 'object') {
        postbackUrlInput.value = data.url || data.postbackUrl || '';
    } else if (typeof data === 'string') {
        postbackUrlInput.value = data;
    }
}

async function loadAttendantsTable() {
    try {
        const attendants = await fetchJson('/attendants');
        if (!attendantsTableBodyEl) {
            return;
        }
        attendantsTableBodyEl.innerHTML = '';

        const sanitizedAttendants = Array.isArray(attendants)
            ? attendants
                  .filter((attendant) => attendant && attendant.code && attendant.name)
                  .map((attendant) => ({
                      code: String(attendant.code),
                      name: String(attendant.name),
                      monthlyCost: Number(attendant.monthlyCost ?? attendant.monthly_cost ?? 0) || 0
                  }))
            : [];

        attendantsTableData = sanitizedAttendants;

        sanitizedAttendants.forEach((attendant) => {
            const row = document.createElement('tr');

            const nameCell = document.createElement('td');
            nameCell.textContent = attendant.name;

            const codeCell = document.createElement('td');
            codeCell.textContent = attendant.code;

            const costCell = document.createElement('td');
            costCell.textContent = formatCurrencyBRL(attendant.monthlyCost);

            const actionsCell = document.createElement('td');
            actionsCell.classList.add('attendant-actions-cell');

            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'table-icon-button edit-attendant-btn';
            editButton.dataset.code = attendant.code;
            editButton.title = 'Editar atendente';
            editButton.innerHTML = '<i class="fas fa-edit"></i>';

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'table-icon-button delete-attendant-btn';
            deleteButton.dataset.code = attendant.code;
            deleteButton.title = 'Excluir atendente';
            deleteButton.innerHTML = '<i class="fas fa-trash-alt"></i>';

            actionsCell.appendChild(editButton);
            actionsCell.appendChild(deleteButton);

            row.appendChild(nameCell);
            row.appendChild(codeCell);
            row.appendChild(costCell);
            row.appendChild(actionsCell);

            attendantsTableBodyEl.appendChild(row);
        });
    } catch (error) {
        console.error('Erro ao carregar tabela de atendentes:', error);
        alert('Não foi possível carregar a tabela de atendentes.');
        attendantsTableData = [];
    }
}

async function updateSummaryData() {
    const activeButton = summaryFilterButtons.find((button) => button.classList.contains('active'));
    const period = activeButton ? activeButton.dataset.period : undefined;
    const attendant = summaryAttendantSelect ? summaryAttendantSelect.value : undefined;

    const params = new URLSearchParams();
    if (period) {
        params.append('period', period);
    }
    if (attendant !== undefined && attendant !== null && attendant !== '') {
        params.append('attendant', attendant);
    }

    try {
        const summary = await fetchJson(`/summary${params.toString() ? `?${params.toString()}` : ''}`);
        applySummaryToCards(summary);
        updateSummaryCharts(summary);
    } catch (error) {
        console.error('Erro ao carregar dados de resumo:', error);
        alert('Não foi possível carregar os dados do resumo.');
    }
}

function applySummaryToCards(summary) {
    if (!summary) {
        return;
    }

    const cardValues = document.querySelectorAll('#page-resumo .card .card-value');
    const {
        agendado = 0,
        pago = 0,
        aReceber = 0,
        frustrado = 0,
        vendasDiretas = 0,
        investimento = 0,
        lucro = 0,
        roi = 0
    } = summary;

    const formattedValues = [
        formatCurrency(agendado),
        formatCurrency(pago),
        formatCurrency(aReceber),
        formatCurrency(frustrado),
        formatCurrency(vendasDiretas),
        formatCurrency(investimento),
        formatCurrency(lucro),
        formatPercentage(roi)
    ];

    cardValues.forEach((card, index) => {
        if (formattedValues[index] !== undefined) {
            card.textContent = formattedValues[index];
        }
    });
}

function updateSummaryCharts(summary) {
    if (!summary) {
        return;
    }

    if (funilChartInstance && Array.isArray(summary.graficoFunil)) {
        funilChartInstance.data.datasets[0].data = summary.graficoFunil;
        funilChartInstance.update();
    }

    if (composicaoChartInstance && Array.isArray(summary.graficoComposicao)) {
        composicaoChartInstance.data.datasets[0].data = summary.graficoComposicao;
        composicaoChartInstance.update();
    }
}

async function loadSalesData(filters = {}) {
    const params = new URLSearchParams();
    if (filters.search) {
        params.append('search', filters.search);
    }
    if (filters.status && filters.status !== 'todos') {
        params.append('status', filters.status);
    }
    if (filters.attendant && filters.attendant !== 'todos') {
        params.append('attendant', filters.attendant);
    }

    const query = params.toString();

    try {
        const salesData = await fetchJson(`/sales${query ? `?${query}` : ''}`);
        if (!salesTableBody) {
            return;
        }
        salesTableBody.innerHTML = '';

        if (!Array.isArray(salesData) || salesData.length === 0) {
            updateSalesSummary([]);
            rebindModalButtons();
            return;
        }

        salesData.forEach((sale) => {
            const row = document.createElement('tr');
            const transactionId = sale.transaction_id || sale.id || '';
            const cliente = sale.client_name || sale.cliente || sale.customer_name || '';
            const email = sale.client_email || sale.email || sale.customer_email || '';
            const telefone = sale.client_phone || sale.telefone || sale.phone || '';
            const cpf = sale.client_cpf || sale.cpf || sale.document || '';
            const produto = sale.product_name || sale.produto || '';
            const valorNumerico = getSaleNumericValue(sale);
            const valorFormatado = sale.valor_formatado || formatCurrency(valorNumerico);
            const status = sale.status || '';
            const statusTexto = sale.status_texto || sale.status_text || status;
            const statusCssClass = sale.status_css_class || status;
            const dataOriginal = sale.created_at || sale.updated_at || sale.data_agendada || sale.scheduled_at || '';
            const dataAgendada = sale.data_formatada || formatDate(dataOriginal);
            const historico = Array.isArray(sale.historico)
                ? sale.historico.map((item) => `<li>${item}</li>`).join('')
                : sale.historico || '';
            const atendenteCodigo = sale.atendente || sale.attendant_code || '';
            const atendenteNome = sale.atendente_nome || sale.attendant_name || '';

            row.dataset.id = transactionId;
            row.dataset.cliente = cliente;
            row.dataset.email = email;
            row.dataset.telefone = telefone;
            row.dataset.cpf = cpf;
            row.dataset.produto = produto;
            row.dataset.valor = valorFormatado;
            row.dataset.valorNumerico = valorNumerico;
            row.dataset.status = status;
            row.dataset.statusTexto = statusTexto;
            row.dataset.statusCssClass = statusCssClass;
            row.dataset.data = dataOriginal;
            row.dataset.historico = historico;
            row.dataset.atendente = atendenteCodigo || 'nao_definido';
            row.dataset.atendenteNome = atendenteNome;

            const clienteTd = document.createElement('td');
            clienteTd.textContent = cliente;

            const produtoTd = document.createElement('td');
            produtoTd.textContent = produto;

            const atendenteTd = document.createElement('td');
            atendenteTd.textContent = atendenteNome || obterNomeAtendente(atendenteCodigo) || 'Não Definido';

            const dataTd = document.createElement('td');
            dataTd.textContent = dataAgendada;

            const valorTd = document.createElement('td');
            valorTd.textContent = valorFormatado;

            const statusTd = document.createElement('td');
            statusTd.innerHTML = `<span class="status ${statusCssClass}">${statusTexto}</span>`;

            const actionTd = document.createElement('td');
            const actionButton = document.createElement('button');
            actionButton.classList.add('action-button');
            actionButton.textContent = 'Ver';
            actionTd.appendChild(actionButton);

            row.appendChild(clienteTd);
            row.appendChild(produtoTd);
            row.appendChild(atendenteTd);
            row.appendChild(dataTd);
            row.appendChild(valorTd);
            row.appendChild(statusTd);
            row.appendChild(actionTd);

            salesTableBody.appendChild(row);
        });

        updateSalesSummary(salesData);
        rebindModalButtons();
    } catch (error) {
        console.error('Erro ao carregar vendas:', error);
        alert('Não foi possível carregar as vendas.');
    }
}

function updateSalesSummary(salesData) {
    if (salesCountEl) {
        salesCountEl.textContent = salesData.length;
    }

    if (salesTotalValueEl) {
        const total = salesData.reduce((acc, sale) => acc + getSaleNumericValue(sale), 0);
        salesTotalValueEl.textContent = formatCurrency(total);
    }
}

function rebindModalButtons() {
    if (!salesTableBody) {
        return;
    }
    const openModalButtons = salesTableBody.querySelectorAll('.action-button');
    openModalButtons.forEach((button) => {
        button.removeEventListener('click', abrirModal);
        button.addEventListener('click', abrirModal);
    });
}

function abrirModal(event) {
    if (!modal) {
        return;
    }

    const button = event.currentTarget;
    const linhaTabela = button.closest('tr');
    if (!linhaTabela) {
        return;
    }

    const cliente = linhaTabela.dataset.cliente || '';
    const email = linhaTabela.dataset.email || '';
    const telefone = linhaTabela.dataset.telefone || '';
    const cpf = linhaTabela.dataset.cpf || '';
    const produto = linhaTabela.dataset.produto || '';
    const valor = linhaTabela.dataset.valor || formatCurrency(Number(linhaTabela.dataset.valorNumerico || 0));
    const status = linhaTabela.dataset.statusCssClass || linhaTabela.dataset.status || '';
    const statusTexto = linhaTabela.dataset.statusTexto || linhaTabela.dataset.status || '';
    const data = linhaTabela.dataset.data || '';
    const historico = linhaTabela.dataset.historico || '';
    const atendenteCodigo = linhaTabela.dataset.atendente || '';
    const atendenteNome = linhaTabela.dataset.atendenteNome || obterNomeAtendente(atendenteCodigo) || '';
    const transactionId = linhaTabela.dataset.id || '';

    if (modalCurrentTransactionIdInput) {
        modalCurrentTransactionIdInput.value = transactionId;
    }

    bindManualStatusButtons();

    if (modalCliente) modalCliente.textContent = cliente;
    if (modalEmail) modalEmail.textContent = email;
    if (modalTelefone) modalTelefone.textContent = telefone;
    if (modalCpf) modalCpf.textContent = cpf;
    if (modalProduto) modalProduto.textContent = produto;
    if (modalValor) modalValor.textContent = valor;
    if (modalData) modalData.textContent = formatDate(data);
    if (modalStatusContainer) {
        modalStatusContainer.innerHTML = `<span class="status ${status}">${statusTexto}</span>`;
    }
    if (modalHistorico) {
        modalHistorico.innerHTML = historico;
    }

    if (modalAtendenteDisplay && modalAtendenteSelect) {
        modalAtendenteSelect.dataset.transactionId = transactionId;
        modalAtendenteSelect.dataset.rowId = linhaTabela.rowIndex;
        if (!atendenteCodigo || atendenteCodigo === 'nao_definido') {
            modalAtendenteDisplay.style.display = 'none';
            modalAtendenteSelect.style.display = '';
            modalAtendenteSelect.value = '';
        } else {
            modalAtendenteDisplay.textContent = atendenteNome || obterNomeAtendente(atendenteCodigo);
            modalAtendenteDisplay.style.display = '';
            modalAtendenteSelect.style.display = 'none';
        }
    }

    modal.classList.add('active');
}

function fecharModal() {
    if (modal) {
        modal.classList.remove('active');
    }
}

async function handleAttendantChange(event) {
    const select = event.currentTarget;
    const novoAtendente = select.value;
    const transactionId = select.dataset.transactionId;
    const nomeAtendente = select.options[select.selectedIndex]?.text || obterNomeAtendente(novoAtendente);

    if (!transactionId || !novoAtendente) {
        alert('Selecione um atendente válido.');
        return;
    }

    try {
        await fetchJson(`/sales/${transactionId}/attendant`, {
            method: 'PUT',
            body: { attendant_code: novoAtendente }
        });

        const linhaParaAtualizar = salesTableBody
            ? Array.from(salesTableBody.querySelectorAll('tr')).find((row) => row.dataset.id === transactionId)
            : null;

        if (linhaParaAtualizar) {
            linhaParaAtualizar.dataset.atendente = novoAtendente;
            linhaParaAtualizar.dataset.atendenteNome = nomeAtendente;
            const celulaAtendente = linhaParaAtualizar.cells[2];
            if (celulaAtendente) {
                celulaAtendente.textContent = nomeAtendente || 'Não Definido';
            }
        }

        alert('Atendente atualizado com sucesso!');
        fecharModal();
        filterSalesTable();
    } catch (error) {
        console.error('Erro ao atualizar atendente da venda:', error);
        alert('Não foi possível atualizar o atendente.');
    }
}

async function handleManualStatusUpdate(event) {
    event.preventDefault();

    const button = event.currentTarget;
    const novoStatus = button?.dataset?.status;
    const transactionId = modalCurrentTransactionIdInput ? modalCurrentTransactionIdInput.value : '';

    if (!novoStatus) {
        alert('Selecione um status válido.');
        return;
    }

    if (!transactionId) {
        alert('Venda não encontrada.');
        return;
    }

    try {
        await fetchJson(`/sales/${transactionId}/status`, {
            method: 'PUT',
            body: { status: novoStatus }
        });

        alert('Status atualizado com sucesso!');
        fecharModal();

        const currentFilters = getCurrentSalesFilters();
        await loadSalesData(currentFilters);
        await updateSummaryData();
    } catch (error) {
        console.error('Erro ao atualizar status da venda:', error);
        alert('Não foi possível atualizar o status da venda.');
    }
}

async function addAttendantToTable(event) {
    event.preventDefault();

    const attendantNameInput = document.getElementById('add-attendant-name');
    const attendantCodeInput = document.getElementById('add-attendant-code');
    const attendantCostInput = document.getElementById('add-attendant-cost');

    if (!attendantNameInput || !attendantCodeInput || !attendantCostInput) {
        return;
    }

    const name = attendantNameInput.value.trim();
    const code = attendantCodeInput.value.trim();
    const monthlyCostValue = Number(attendantCostInput.value || 0);

    if (!name || !code) {
        alert('Por favor, preencha o Nome e o Código do atendente.');
        return;
    }

    if (code.length !== 4) {
        alert('O Código deve ter exatamente 4 caracteres.');
        return;
    }

    try {
        await fetchJson('/attendants', {
            method: 'POST',
            body: { name, code, monthlyCost: Number.isFinite(monthlyCostValue) ? monthlyCostValue : 0 }
        });

        attendantNameInput.value = '';
        attendantCodeInput.value = '';
        attendantCostInput.value = '0';
        await loadAttendants();
        await loadAttendantsTable();
        alert('Atendente adicionado com sucesso!');
    } catch (error) {
        console.error('Erro ao adicionar atendente:', error);
        alert('Não foi possível adicionar o atendente.');
    }
}

async function saveSettings(event) {
    event.preventDefault();

    const nomeInput = document.getElementById('config-nome');
    const emailInput = document.getElementById('config-email');
    const investimentoInput = document.getElementById('config-investimento');

    const body = {
        investment: investimentoInput ? Number(investimentoInput.value || 0) : 0
    };

    if (nomeInput) {
        body.name = nomeInput.value;
    }

    if (emailInput) {
        body.email = emailInput.value;
    }

    try {
        await fetchJson('/settings', {
            method: 'PUT',
            body
        });
        alert('Configurações salvas com sucesso!');
        await updateSummaryData();
    } catch (error) {
        console.error('Erro ao salvar configurações:', error);
        alert('Não foi possível salvar as configurações.');
    }
}

async function filterSalesTable() {
    const filters = getCurrentSalesFilters();
    await loadSalesData(filters);
}

async function handleAttendantTableClick(event) {
    const targetButton = event.target.closest('.edit-attendant-btn, .delete-attendant-btn');
    if (!targetButton) {
        return;
    }

    event.preventDefault();

    const attendantCode = targetButton.dataset.code;
    if (!attendantCode) {
        return;
    }

    if (targetButton.classList.contains('edit-attendant-btn')) {
        await handleEditAttendant(attendantCode);
        return;
    }

    if (targetButton.classList.contains('delete-attendant-btn')) {
        await handleDeleteAttendant(attendantCode);
    }
}

async function handleEditAttendant(attendantCode) {
    const attendant =
        attendantsTableData.find((item) => item.code === attendantCode) ||
        listaAtendentes.find((item) => item.code === attendantCode);

    if (!attendant) {
        alert('Não foi possível localizar o atendente selecionado.');
        return;
    }

    const newNameInput = prompt('Nome do atendente:', attendant.name);
    if (newNameInput === null) {
        return;
    }
    const trimmedName = newNameInput.trim();
    if (!trimmedName) {
        alert('O nome do atendente não pode ficar vazio.');
        return;
    }

    const newCodeInput = prompt('Código do atendente (4 caracteres):', attendant.code);
    if (newCodeInput === null) {
        return;
    }
    const preparedCode = newCodeInput.trim();
    if (preparedCode.length !== 4) {
        alert('O código deve ter exatamente 4 caracteres.');
        return;
    }

    const newMonthlyCostInput = prompt('Gasto mensal (R$):', String(attendant.monthlyCost ?? 0));
    if (newMonthlyCostInput === null) {
        return;
    }

    const monthlyCostValue = toNumericValue(newMonthlyCostInput);

    try {
        await fetchJson(`/attendants/${encodeURIComponent(attendantCode)}`, {
            method: 'PUT',
            body: {
                name: trimmedName,
                newCode: preparedCode,
                monthlyCost: Number.isFinite(monthlyCostValue) ? monthlyCostValue : 0
            }
        });

        await loadAttendants();
        await loadAttendantsTable();
        alert('Atendente atualizado com sucesso!');
    } catch (error) {
        console.error('Erro ao atualizar atendente:', error);
        alert('Não foi possível atualizar o atendente.');
    }
}

async function handleDeleteAttendant(attendantCode) {
    if (!confirm('Tem certeza de que deseja excluir este atendente?')) {
        return;
    }

    try {
        await fetchJson(`/attendants/${encodeURIComponent(attendantCode)}`, {
            method: 'DELETE'
        });

        await loadAttendants();
        await loadAttendantsTable();
        alert('Atendente removido com sucesso!');
    } catch (error) {
        console.error('Erro ao remover atendente:', error);
        alert('Não foi possível remover o atendente.');
    }
}

function obterNomeAtendente(codigo) {
    if (!codigo) {
        return '';
    }
    const atendente = listaAtendentes.find((item) => item.code === codigo || item.id === codigo);
    return atendente ? atendente.name || atendente.nome : '';
}

function formatCurrency(value) {
    const numericValue = Number(value) || 0;
    return numericValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercentage(value) {
    const numericValue = Number(value) || 0;
    return `${numericValue.toFixed(1).replace('.', ',')}%`;
}

function formatDate(value) {
    if (!value) {
        return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleDateString('pt-BR');
}

function getCurrentSalesFilters() {
    const salesSearchInput = document.getElementById('sales-search');
    const salesStatusSelect = document.getElementById('salesStatusSelect') || document.getElementById('status-select');
    const salesAttendantSelect = document.getElementById('sales-attendant-select') || document.getElementById('attendant-select');

    return {
        search: salesSearchInput ? salesSearchInput.value.trim() : '',
        status: salesStatusSelect ? salesStatusSelect.value : 'todos',
        attendant: salesAttendantSelect ? salesAttendantSelect.value : 'todos'
    };
}

function toNumericValue(value) {
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string') {
        const normalized = value
            .replace(/[^0-9,.-]/g, '')
            .replace(/\.(?=.*\.)/g, '')
            .replace(',', '.');
        const parsed = Number(normalized);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
}

function getSaleNumericValue(sale = {}) {
    if (typeof sale.total_value_cents === 'number') {
        return sale.total_value_cents / 100;
    }

    if (typeof sale.valor_numerico === 'number') {
        return sale.valor_numerico;
    }

    if (typeof sale.total_value === 'number') {
        return sale.total_value;
    }

    if (sale.valor !== undefined) {
        return toNumericValue(sale.valor);
    }

    return 0;
}

function formatCurrencyBRL(value) {
    const numeric = Number(value);
    const safeValue = Number.isFinite(numeric) ? numeric : 0;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(safeValue);
}

async function fetchJson(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const fetchOptions = {
        method: options.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    };

    if (options.body !== undefined) {
        fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Erro ${response.status}`);
    }

    if (response.status === 204) {
        return null;
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return response.json();
    }

    return response.text();
}
