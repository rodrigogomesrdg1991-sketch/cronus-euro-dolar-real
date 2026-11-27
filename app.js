const AUTO_REFRESH_MS = 30000; // 30 segundos

let exchangeRatesCurrent = {
    USD: { BRL: 5.50, EUR: 0.90, BTC: 0.0000132, USD: 1.0 },
    EUR: { BRL: 6.14, USD: 1.11, BTC: 0.0000147, EUR: 1.0 },
    BRL: { USD: 0.182, EUR: 0.163, BTC: 0.0000024, BRL: 1.0 },
    BTC: { BRL: 416916.0, USD: 75802.0, EUR: 67894.0, BTC: 1.0 }
};

let chartInstance = null;
let currentChartMode = 'fiat'; // 'fiat' (USD/EUR) ou 'crypto' (Bitcoin)
let currentChartPeriod = 'all'; // 'all' ou 'recent'
let isFetchingRates = false;
let autoRefreshTimer = null;

const chartDataFull = {
    labels: ['Jul', 'Ago', 'Set', 'Out (S1)', 'Out (S2)', 'Out (S3)', 'Out (S4)', 'Nov (S1)'],
    usd: [5.40, 5.45, 5.38, 5.42, 5.46, 5.48, 5.49, 5.50],
    eur: [6.00, 6.05, 5.98, 6.02, 6.08, 6.10, 6.12, 6.14],
    btc: [345000, 358200, 351400, 372000, 386500, 398100, 408900, 416916]
};

const chartDataRecent = {
    labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Hoje'],
    usd: [5.45, 5.47, 5.46, 5.49, 5.495, 5.50],
    eur: [6.08, 6.10, 6.09, 6.12, 6.13, 6.14],
    btc: [401200, 405800, 403100, 410400, 413500, 416916]
};

function formatBrl(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatBrlCompact(value) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0
    });
}

function formatPct(pct) {
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

function getMidRate(pairData) {
    const bid = parseFloat(pairData?.bid);
    const ask = parseFloat(pairData?.ask);
    if (!Number.isNaN(bid) && !Number.isNaN(ask)) {
        return (bid + ask) / 2;
    }
    return bid;
}

function updateMarketIndicators(usdRate, eurRate, btcRate, usdPct, eurPct, btcPct) {
    const usdFormatted = formatBrl(usdRate);
    const eurFormatted = formatBrl(eurRate);
    const btcFormatted = formatBrl(btcRate);

    const cardUsdValue = document.getElementById('cardUsdValue');
    const cardEurValue = document.getElementById('cardEurValue');
    const cardBtcValue = document.getElementById('cardBtcValue');
    const heroUsdValue = document.getElementById('heroUsdValue');
    const heroBtcValue = document.getElementById('heroBtcValue');
    const heroSummaryText = document.getElementById('heroSummaryText');
    const cardUsdVar = document.getElementById('cardUsdVar');
    const cardEurVar = document.getElementById('cardEurVar');
    const cardBtcVar = document.getElementById('cardBtcVar');
    const lastUpdateBadge = document.getElementById('lastUpdateBadge');

    if (cardUsdValue) cardUsdValue.innerText = usdFormatted;
    if (cardEurValue) cardEurValue.innerText = eurFormatted;
    if (cardBtcValue) cardBtcValue.innerText = btcFormatted;
    if (heroUsdValue) heroUsdValue.innerText = usdFormatted;
    if (heroBtcValue) heroBtcValue.innerText = formatBrlCompact(btcRate);

    if (heroSummaryText) {
        heroSummaryText.innerText = `Acompanhamento cambial e cripto em tempo real. Dólar a ${usdFormatted}, Euro a ${eurFormatted} e Bitcoin a ${btcFormatted} refletem liquidez global e juros.`;
    }

    if (cardUsdVar && !Number.isNaN(usdPct)) {
        const isPos = usdPct >= 0;
        cardUsdVar.className = `${isPos ? 'text-emerald-400' : 'text-rose-400'} font-semibold flex items-center`;
        cardUsdVar.innerHTML = `<i data-lucide="${isPos ? 'trending-up' : 'trending-down'}" class="w-3 h-3 mr-1"></i> ${formatPct(usdPct)}`;
    }

    if (cardEurVar && !Number.isNaN(eurPct)) {
        const isPos = eurPct >= 0;
        cardEurVar.className = `${isPos ? 'text-emerald-400' : 'text-rose-400'} font-semibold flex items-center`;
        cardEurVar.innerHTML = `<i data-lucide="${isPos ? 'trending-up' : 'trending-down'}" class="w-3 h-3 mr-1"></i> ${formatPct(eurPct)}`;
    }

    if (cardBtcVar && !Number.isNaN(btcPct)) {
        const isPos = btcPct >= 0;
        cardBtcVar.className = `${isPos ? 'text-emerald-400' : 'text-rose-400'} font-semibold flex items-center`;
        cardBtcVar.innerHTML = `<i data-lucide="${isPos ? 'trending-up' : 'trending-down'}" class="w-3 h-3 mr-1"></i> ${formatPct(btcPct)}`;
    }

    if (lastUpdateBadge) {
        const horaAtual = new Date().toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        lastUpdateBadge.innerHTML = `Cotação Atualizada: <strong>${horaAtual}</strong>`;
    }

    if (window.lucide) lucide.createIcons();
}

function syncChartSeriesWithLiveRates(usdRate, eurRate, btcRate) {
    const lastFull = chartDataFull.labels.length - 1;
    const lastRecent = chartDataRecent.labels.length - 1;

    chartDataFull.usd[lastFull] = usdRate;
    chartDataFull.eur[lastFull] = eurRate;
    chartDataFull.btc[lastFull] = btcRate;

    chartDataRecent.usd[lastRecent] = usdRate;
    chartDataRecent.eur[lastRecent] = eurRate;
    chartDataRecent.btc[lastRecent] = btcRate;

    if (chartInstance) {
        const source = currentChartPeriod === 'all' ? chartDataFull : chartDataRecent;
        if (currentChartMode === 'crypto') {
            chartInstance.data.datasets[0].data = [...source.btc];
        } else {
            chartInstance.data.datasets[0].data = [...source.usd];
            chartInstance.data.datasets[1].data = [...source.eur];
        }
        chartInstance.update('none');
    } else {
        renderChart();
    }
}

async function fetchAwesomeRates() {
    const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL', {
        cache: 'no-store'
    });
    if (!response.ok) throw new Error(`AwesomeAPI HTTP ${response.status}`);
    return response.json();
}

async function fetchBinanceBtcRate() {
    const response = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCBRL', {
        cache: 'no-store'
    });
    if (!response.ok) throw new Error(`Binance HTTP ${response.status}`);
    return response.json();
}

async function fetchRealTimeRates() {
    if (isFetchingRates) return;
    isFetchingRates = true;

    try {
        const [awesomeResult, binanceResult] = await Promise.allSettled([
            fetchAwesomeRates(),
            fetchBinanceBtcRate()
        ]);

        let usdRate = exchangeRatesCurrent.USD.BRL;
        let eurRate = exchangeRatesCurrent.EUR.BRL;
        let btcRate = exchangeRatesCurrent.BTC.BRL;

        let usdPct = NaN;
        let eurPct = NaN;
        let btcPct = NaN;

        if (awesomeResult.status === 'fulfilled') {
            const data = awesomeResult.value;
            const parsedUsd = getMidRate(data.USDBRL);
            const parsedEur = getMidRate(data.EURBRL);
            const parsedBtcFallback = getMidRate(data.BTCBRL);

            if (!Number.isNaN(parsedUsd)) usdRate = parsedUsd;
            if (!Number.isNaN(parsedEur)) eurRate = parsedEur;
            if (!Number.isNaN(parsedBtcFallback)) btcRate = parsedBtcFallback;

            usdPct = parseFloat(data.USDBRL?.pctChange);
            eurPct = parseFloat(data.EURBRL?.pctChange);
            btcPct = parseFloat(data.BTCBRL?.pctChange);
        } else {
            console.warn('Falha na AwesomeAPI:', awesomeResult.reason);
        }

        // Prioriza a cotação do Bitcoin vinda da Binance (maior liquidez em BTC/BRL)
        if (binanceResult.status === 'fulfilled') {
            const binanceData = binanceResult.value;
            const parsedBinanceBtc = parseFloat(binanceData?.lastPrice);
            const parsedBinancePct = parseFloat(binanceData?.priceChangePercent);

            if (!Number.isNaN(parsedBinanceBtc)) btcRate = parsedBinanceBtc;
            if (!Number.isNaN(parsedBinancePct)) btcPct = parsedBinancePct;
        } else {
            console.warn('Falha na Binance, usando fallback da AwesomeAPI para BTC:', binanceResult.reason);
        }

        exchangeRatesCurrent.USD.BRL = usdRate;
        exchangeRatesCurrent.EUR.BRL = eurRate;
        exchangeRatesCurrent.BTC.BRL = btcRate;

        exchangeRatesCurrent.USD.EUR = usdRate / eurRate;
        exchangeRatesCurrent.USD.BTC = usdRate / btcRate;

        exchangeRatesCurrent.EUR.USD = eurRate / usdRate;
        exchangeRatesCurrent.EUR.BTC = eurRate / btcRate;

        exchangeRatesCurrent.BRL.USD = 1 / usdRate;
        exchangeRatesCurrent.BRL.EUR = 1 / eurRate;
        exchangeRatesCurrent.BRL.BTC = 1 / btcRate;

        exchangeRatesCurrent.BTC.USD = btcRate / usdRate;
        exchangeRatesCurrent.BTC.EUR = btcRate / eurRate;

        updateMarketIndicators(usdRate, eurRate, btcRate, usdPct, eurPct, btcPct);
        syncChartSeriesWithLiveRates(usdRate, eurRate, btcRate);
        calculateConversion();
    } catch (error) {
        console.error('Erro ao buscar cotações ao vivo:', error);
    } finally {
        isFetchingRates = false;
    }
}

function buildChartConfig() {
    const ctx = document.getElementById('currencyChart').getContext('2d');
    const source = currentChartPeriod === 'all' ? chartDataFull : chartDataRecent;
    const isCrypto = currentChartMode === 'crypto';

    const titleEl = document.getElementById('chartTitle');
    const subtitleEl = document.getElementById('chartSubtitle');

    if (isCrypto) {
        if (titleEl) {
            titleEl.innerHTML = `<i data-lucide="bitcoin" class="w-5 h-5 text-orange-400"></i> Gráfico Cripto — Bitcoin (BTC / BRL)`;
        }
        if (subtitleEl) {
            subtitleEl.innerText = 'Curva de preço do Bitcoin (Binance BTC/BRL) com atualização automática a cada 30s';
        }

        const btcGradient = ctx.createLinearGradient(0, 0, 0, 320);
        btcGradient.addColorStop(0, 'rgba(249, 115, 22, 0.42)');
        btcGradient.addColorStop(1, 'rgba(249, 115, 22, 0.0)');

        return {
            type: 'line',
            data: {
                labels: [...source.labels],
                datasets: [
                    {
                        label: 'Bitcoin (BTC / BRL)',
                        data: [...source.btc],
                        borderColor: '#f97316',
                        backgroundColor: btcGradient,
                        borderWidth: 3,
                        fill: true,
                        tension: 0.35,
                        pointBackgroundColor: '#fb923c',
                        pointBorderColor: '#0f172a',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 7
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#cbd5e1', font: { family: 'Inter', size: 12, weight: '600' }, usePointStyle: true }
                    },
                    tooltip: {
                        backgroundColor: '#0f172a',
                        titleColor: '#f8fafc',
                        bodyColor: '#fed7aa',
                        borderColor: '#334155',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: function(context) {
                                return `BTC/BRL: ${formatBrl(context.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b' } },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#64748b',
                            callback: function(value) {
                                return 'R$ ' + Number(value).toLocaleString('pt-BR');
                            }
                        }
                    }
                }
            }
        };
    }

    if (titleEl) {
        titleEl.innerHTML = `<i data-lucide="line-chart" class="w-5 h-5 text-indigo-400"></i> Trajetória do Câmbio (USD &amp; EUR)`;
    }
    if (subtitleEl) {
        subtitleEl.innerText = 'Comparativo de valorização em relação ao Real Brasileiro (BRL) com atualização a cada 30s';
    }

    const usdGradient = ctx.createLinearGradient(0, 0, 0, 300);
    usdGradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
    usdGradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

    const eurGradient = ctx.createLinearGradient(0, 0, 0, 300);
    eurGradient.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
    eurGradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

    return {
        type: 'line',
        data: {
            labels: [...source.labels],
            datasets: [
                {
                    label: 'Dólar (USD / BRL)',
                    data: [...source.usd],
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
                    data: [...source.eur],
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
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#64748b',
                        callback: function(value) {
                            return 'R$ ' + Number(value).toFixed(2);
                        }
                    }
                }
            }
        }
    };
}

function updateToggleButtonsUI() {
    const btnFiat = document.getElementById('btn-mode-fiat');
    const btnCrypto = document.getElementById('btn-mode-crypto');
    const btnAll = document.getElementById('btn-period-all');
    const btnRecent = document.getElementById('btn-period-recent');

    if (btnFiat && btnCrypto) {
        if (currentChartMode === 'fiat') {
            btnFiat.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white transition flex items-center gap-1.5';
            btnCrypto.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition flex items-center gap-1.5';
        } else {
            btnCrypto.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold bg-orange-500 text-white transition flex items-center gap-1.5';
            btnFiat.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition flex items-center gap-1.5';
        }
    }

    if (btnAll && btnRecent) {
        if (currentChartPeriod === 'all') {
            btnAll.className = 'px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 text-white transition';
            btnRecent.className = 'px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition';
        } else {
            btnRecent.className = 'px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 text-white transition';
            btnAll.className = 'px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition';
        }
    }
}

function renderChart() {
    const canvas = document.getElementById('currencyChart');
    if (!canvas) return;

    if (chartInstance) {
        chartInstance.destroy();
    }

    updateToggleButtonsUI();
    chartInstance = new Chart(canvas.getContext('2d'), buildChartConfig());
    if (window.lucide) lucide.createIcons();
}

function switchChartMode(mode) {
    currentChartMode = mode;
    renderChart();
}

function updateChartPeriod(period) {
    currentChartPeriod = period;
    renderChart();
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

    const rate = exchangeRatesCurrent[from]?.[to] ?? 1;
    const total = amount * rate;

    let formattedTotal = '';
    if (to === 'BRL') formattedTotal = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    else if (to === 'USD') formattedTotal = total.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    else if (to === 'EUR') formattedTotal = total.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    else if (to === 'BTC') formattedTotal = '₿ ' + total.toFixed(6);

    const resultEl = document.getElementById('conversionResult');
    const detailEl = document.getElementById('conversionRateDetail');

    if (resultEl) resultEl.innerText = formattedTotal;
    if (detailEl) {
        const rateFormatted = rate >= 100
            ? rate.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : (rate < 0.01 ? rate.toFixed(7) : rate.toFixed(2));
        detailEl.innerText = `1 ${from} = ${rateFormatted} ${to} (Cotação ao Vivo)`;
    }
}

function showToast(title, message) {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    document.getElementById('toastTitle').innerText = title;
    document.getElementById('toastMessage').innerText = message;

    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 4000);
}

function executarPixSimulado() {
    const amount = parseFloat(document.getElementById('convertAmount')?.value) || 0;
    const from = document.getElementById('fromCurrency')?.value || 'USD';
    const resultText = document.getElementById('conversionResult')?.innerText || '';
    showToast("PIX Simulado", `Ordem de conversão de ${amount} ${from} para ${resultText} executada com sucesso.`);
}

function simularAtualizacao() {
    const btn = document.getElementById('refreshBtn');
    if (btn) btn.classList.add('animate-spin');
    fetchRealTimeRates().then(() => {
        if (btn) btn.classList.remove('animate-spin');
        showToast("Dados Sincronizados", "Câmbio (AwesomeAPI) e Bitcoin (Binance) atualizados.");
    });
}

function startAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(() => {
        if (!document.hidden) {
            fetchRealTimeRates();
        }
    }, AUTO_REFRESH_MS);
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        fetchRealTimeRates();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) lucide.createIcons();
    renderChart();
    fetchRealTimeRates();
    startAutoRefresh();
});

// Expondo globalmente para os eventos inline do HTML
window.simularAtualizacao = simularAtualizacao;
window.calculateConversion = calculateConversion;
window.executarPixSimulado = executarPixSimulado;
window.switchChartMode = switchChartMode;
window.updateChartPeriod = updateChartPeriod;
