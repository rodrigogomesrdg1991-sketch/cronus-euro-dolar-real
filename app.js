import { signUp, signIn, signOut, getCurrentUser, saveSimulation } from './authService.js';

lucide.createIcons();

let exchangeRatesCurrent = {
    USD: { BRL: 5.50, EUR: 0.90, BTC: 0.0000132, USD: 1.0 },
    EUR: { BRL: 6.14, USD: 1.11, BTC: 0.0000147, EUR: 1.0 },
    BRL: { USD: 0.182, EUR: 0.163, BTC: 0.0000024, BRL: 1.0 },
    BTC: { BRL: 416916.0, USD: 75802.0, EUR: 67894.0, BTC: 1.0 }
};

let chartInstance = null;

const chartDataFull = {
    labels: ['Jul', 'Ago', 'Set', 'Out (S1)', 'Out (S2)', 'Out (S3)', 'Out (S4)', 'Nov (S1)'],
    usd: [5.40, 5.45, 5.38, 5.42, 5.46, 5.48, 5.49, 5.50],
    eur: [6.00, 6.05, 5.98, 6.02, 6.08, 6.10, 6.12, 6.14]
};

const chartDataRecent = {
    labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Hoje'],
    usd: [5.45, 5.47, 5.46, 5.49, 5.495, 5.50],
    eur: [6.08, 6.10, 6.09, 6.12, 6.13, 6.14]
};

async function fetchRealTimeRates() {
    try {
        const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL');
        const data = await response.json();
        
        const usdRate = parseFloat(data.USDBRL.bid);
        const eurRate = parseFloat(data.EURBRL.bid);
        const btcRate = parseFloat(data.BTCBRL.bid);

        exchangeRatesCurrent.USD.BRL = usdRate;
        exchangeRatesCurrent.EUR.BRL = eurRate;
        exchangeRatesCurrent.BTC.BRL = btcRate;
        
        exchangeRatesCurrent.USD.EUR = usdRate / eurRate;
        exchangeRatesCurrent.EUR.USD = eurRate / usdRate;
        exchangeRatesCurrent.BRL.USD = 1 / usdRate;
        exchangeRatesCurrent.BRL.EUR = 1 / eurRate;

        calculateConversion();
    } catch (error) {
        console.error('Erro ao buscar cotações ao vivo, usando valores padrão:', error);
    }
}

function initChart() {
    const ctx = document.getElementById('currencyChart').getContext('2d');
    
    const usdGradient = ctx.createLinearGradient(0, 0, 0, 300);
    usdGradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
    usdGradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

    const eurGradient = ctx.createLinearGradient(0, 0, 0, 300);
    eurGradient.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
    eurGradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartDataFull.labels,
            datasets: [
                {
                    label: 'Dólar (USD / BRL)',
                    data: chartDataFull.usd,
                    borderColor: '#10b981',
                    backgroundColor: usdGradient,
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#10b981',
                    pointHoverRadius: 7
                },
                {
                    label: 'Euro (EUR / BRL)',
                    data: chartDataFull.eur,
                    borderColor: '#ef4444',
                    backgroundColor: eurGradient,
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#ef4444',
                    pointHoverRadius: 7
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#94a3b8', font: { family: 'Inter', size: 12, weight: '600' }, usePointStyle: true }
                },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: R$ ${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b' } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b', callback: function(value) { return 'R$ ' + value.toFixed(2); } } }
            }
        }
    });
}

function updateChartPeriod(period) {
    const btnAll = document.getElementById('btn-period-all');
    const btnRecent = document.getElementById('btn-period-recent');

    if (period === 'all') {
        btnAll.className = 'px-3 py-1.5 rounded-xl text-xs font-medium bg-indigo-600 text-white transition';
        btnRecent.className = 'px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition';
        chartInstance.data.labels = chartDataFull.labels;
        chartInstance.data.datasets[0].data = chartDataFull.usd;
        chartInstance.data.datasets[1].data = chartDataFull.eur;
    } else {
        btnRecent.className = 'px-3 py-1.5 rounded-xl text-xs font-medium bg-indigo-600 text-white transition';
        btnAll.className = 'px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition';
        chartInstance.data.labels = chartDataRecent.labels;
        chartInstance.data.datasets[0].data = chartDataRecent.usd;
        chartInstance.data.datasets[1].data = chartDataRecent.eur;
    }
    chartInstance.update();
}

function calculateConversion() {
    const amountInput = document.getElementById('convertAmount');
    const fromSelect = document.getElementById('fromCurrency');
    const toSelect = document.getElementById('toCurrency');

    if (!amountInput || !fromSelect || !toSelect) return;

    const amount = parseFloat(amountInput.value) || 0;
    const from = fromSelect.value;
    const to = toSelect.value;

    const fromLabel = document.getElementById('fromCurrencyLabel');
    if (fromLabel) fromLabel.innerText = from;

    let rate = exchangeRatesCurrent[from]?.[to] ?? 1;
    const total = amount * rate;

    let formattedTotal = '';
    if (to === 'BRL') formattedTotal = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    else if (to === 'USD') formattedTotal = total.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    else if (to === 'EUR') formattedTotal = total.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    else if (to === 'BTC') formattedTotal = '₿ ' + total.toFixed(6);

    const resultEl = document.getElementById('conversionResult');
    const detailEl = document.getElementById('conversionRateDetail');

    if (resultEl) resultEl.innerText = formattedTotal;
    if (detailEl) detailEl.innerText = `1 ${from} = ${rate < 0.01 ? rate.toFixed(7) : rate.toFixed(2)} ${to} (Cotação ao Vivo)`;
}

function showToast(title, message) {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    document.getElementById('toastTitle').innerText = title;
    document.getElementById('toastMessage').innerText = message;
    
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 4000);
}

// Funções ligadas diretamente aos botões do index.html
function toggleAuthModal(show) {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    if (show) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } else {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

async function handleRegister() {
    const email = document.getElementById('authEmail')?.value;
    const password = document.getElementById('authPassword')?.value;
    if (!email || !password) {
        showToast("Atenção", "Preencha o e-mail e a senha.");
        return;
    }
    try {
        await signUp(email, password);
        showToast("Conta Criada!", "Verifique seu e-mail ou faça login.");
        toggleAuthModal(false);
    } catch (error) {
        showToast("Erro no Registo", error.message);
    }
}

async function handleLogin() {
    const email = document.getElementById('authEmail')?.value;
    const password = document.getElementById('authPassword')?.value;
    if (!email || !password) {
        showToast("Atenção", "Preencha o e-mail e a senha.");
        return;
    }
    try {
        await signIn(email, password);
        showToast("Login com Sucesso", "Sessão iniciada no Supabase.");
        toggleAuthModal(false);
        checkActiveSession();
    } catch (error) {
        showToast("Erro no Login", error.message);
    }
}

async function handleLogout() {
    try {
        await signOut();
        showToast("Sessão Terminada", "Você saiu da sua conta.");
        checkActiveSession();
    } catch (error) {
        showToast("Erro", error.message);
    }
}

async function checkActiveSession() {
    try {
        const user = await getCurrentUser();
        const btnOpenAuth = document.getElementById('btnOpenAuth');
        const userMenu = document.getElementById('userMenu');
        const userEmailDisplay = document.getElementById('userEmailDisplay');

        if (user) {
            if (btnOpenAuth) btnOpenAuth.classList.add('hidden');
            if (userMenu) userMenu.classList.remove('hidden');
            if (userEmailDisplay) userEmailDisplay.innerText = user.email;
        } else {
            if (btnOpenAuth) btnOpenAuth.classList.remove('hidden');
            if (userMenu) userMenu.classList.add('hidden');
        }
    } catch (e) {
        console.error(e);
    }
}

async function executarPixSimulado() {
    try {
        const amount = parseFloat(document.getElementById('convertAmount')?.value) || 0;
        const from = document.getElementById('fromCurrency')?.value || 'USD';
        const to = document.getElementById('toCurrency')?.value || 'BRL';
        const rate = exchangeRatesCurrent[from]?.[to] ?? 1;
        const result = amount * rate;

        const user = await getCurrentUser();
        if (user) {
            await saveSimulation({ from, to, amount, result, rate });
            showToast("PIX & Supabase", "Simulação executada e salva com sucesso no banco de dados!");
        } else {
            showToast("PIX Realizado", "Simulação executada. Faça login para salvar no histórico do Supabase.");
        }
    } catch (error) {
        showToast("Erro", "Falha ao gravar simulação: " + error.message);
    }
}

function simularAtualizacao() {
    const btn = document.getElementById('refreshBtn');
    if (btn) btn.classList.add('animate-spin');
    fetchRealTimeRates().then(() => {
        if (btn) btn.classList.remove('animate-spin');
        showToast("Dados Sincronizados", "Taxas atualizadas via API.");
    });
}

window.onload = function() {
    initChart();
    fetchRealTimeRates();
    checkActiveSession();
};

// Expondo globalmente para o HTML
window.toggleAuthModal = toggleAuthModal;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;
window.simularAtualizacao = simularAtualizacao;
window.calculateConversion = calculateConversion;
window.executarPixSimulado = executarPixSimulado;
window.updateChartPeriod = updateChartPeriod;