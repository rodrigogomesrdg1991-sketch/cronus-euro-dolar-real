const AUTO_REFRESH_MS = 30000; // 30 segundos

let exchangeRatesCurrent = {
    USD: { BRL: 5.50, EUR: 0.90, BTC: 0.0000132, USD: 1.0 },
    EUR: { BRL: 6.14, USD: 1.11, BTC: 0.0000147, EUR: 1.0 },
    BRL: { USD: 0.182, EUR: 0.163, BTC: 0.0000024, BRL: 1.0 },
    BTC: { BRL: 416916.0, USD: 75802.0, EUR: 67894.0, BTC: 1.0 }
};

let tvChart = null;
let candleSeries = null;
let volumeSeries = null;
let chartResizeObserver = null;

let currentAsset = 'USD'; // 'USD' | 'EUR' | 'BTC'
let currentTimeframe = '1M'; // '1D' | '7D' | '1M' | '6M' | '1A'
let currentCandles = [];
let isFetchingRates = false;
let autoRefreshTimer = null;
let chartRequestToken = 0;

const TIMEFRAME_CONFIG = {
    '1D': { binanceInterval: '15m', binanceLimit: 96, awesomeDays: 1, showTime: true, label: 'Últimas 24 horas (velas 15m)' },
    '7D': { binanceInterval: '2h', binanceLimit: 84, awesomeDays: 7, showTime: true, label: 'Últimos 7 dias (velas 2h)' },
    '1M': { binanceInterval: '6h', binanceLimit: 120, awesomeDays: 30, showTime: false, label: 'Último mês (velas diárias / 6h)' },
    '6M': { binanceInterval: '1d', binanceLimit: 180, awesomeDays: 180, showTime: false, label: 'Últimos 6 meses (velas diárias)' },
    '1A': { binanceInterval: '1d', binanceLimit: 365, awesomeDays: 360, showTime: false, label: 'Último ano (velas diárias)' }
};

const ASSET_META = {
    USD: {
        name: 'Dólar Comercial (USD / BRL)',
        icon: 'dollar-sign',
        colorClass: 'text-emerald-400',
        activeBg: 'bg-emerald-600 text-white',
        precision: 4,
        minMove: 0.0001
    },
    EUR: {
        name: 'Euro Zona (EUR / BRL)',
        icon: 'euro',
        colorClass: 'text-rose-400',
        activeBg: 'bg-rose-600 text-white',
        precision: 4,
        minMove: 0.0001
    },
    BTC: {
        name: 'Bitcoin (BTC / BRL)',
        icon: 'bitcoin',
        colorClass: 'text-orange-400',
        activeBg: 'bg-orange-500 text-white',
        precision: 2,
        minMove: 0.01
    }
};

function formatBrl(value, decimals = 2) {
    return Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatBrlCompact(value) {
    return Number(value).toLocaleString('pt-BR', {
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

function formatCandleDate(timeValue, includeTime) {
    let dateObj;
    if (typeof timeValue === 'number') {
        dateObj = new Date(timeValue * 1000);
    } else if (typeof timeValue === 'string') {
        const parts = timeValue.split('-').map(Number);
        dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    } else if (timeValue && typeof timeValue === 'object' && timeValue.year) {
        dateObj = new Date(timeValue.year, timeValue.month - 1, timeValue.day);
    } else {
        return '--';
    }

    if (includeTime) {
        return dateObj.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    return dateObj.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function updateOhlcLegend(candle) {
    if (!candle) return;
    const decimals = currentAsset === 'BTC' ? 2 : 4;
    const tfCfg = TIMEFRAME_CONFIG[currentTimeframe];
    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    const pct = open > 0 ? ((close - open) / open) * 100 : 0;
    const isUp = close >= open;

    const dateEl = document.getElementById('ohlcDate');
    const openEl = document.getElementById('ohlcOpen');
    const highEl = document.getElementById('ohlcHigh');
    const lowEl = document.getElementById('ohlcLow');
    const closeEl = document.getElementById('ohlcClose');
    const changeEl = document.getElementById('ohlcChange');

    if (dateEl) dateEl.innerText = formatCandleDate(candle.time, tfCfg.showTime);
    if (openEl) openEl.innerText = formatBrl(open, decimals);
    if (highEl) highEl.innerText = formatBrl(high, decimals);
    if (lowEl) lowEl.innerText = formatBrl(low, decimals);
    if (closeEl) {
        closeEl.innerText = formatBrl(close, decimals);
        closeEl.className = isUp ? 'text-[#0ecb81]' : 'text-[#f6465d]';
    }
    if (changeEl) {
        changeEl.innerText = formatPct(pct);
        changeEl.className = isUp ? 'font-semibold text-[#0ecb81]' : 'font-semibold text-[#f6465d]';
    }
}

function setChartLoading(loading) {
    const loader = document.getElementById('chartLoader');
    if (!loader) return;
    if (loading) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
}

function initTradingViewChart() {
    const container = document.getElementById('candlestickChart');
    if (!container || !window.LightweightCharts) return;

    if (tvChart) {
        tvChart.remove();
        tvChart = null;
    }

    const meta = ASSET_META[currentAsset];
    const tfCfg = TIMEFRAME_CONFIG[currentTimeframe];

    tvChart = LightweightCharts.createChart(container, {
        width: container.clientWidth || 600,
        height: container.clientHeight || 380,
        layout: {
            background: { type: 'solid', color: '#0b0e14' },
            textColor: '#848e9c',
            fontFamily: 'Inter, sans-serif',
            fontSize: 12
        },
        grid: {
            vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
            horzLines: { color: 'rgba(255, 255, 255, 0.04)' }
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: {
                color: 'rgba(148, 163, 184, 0.45)',
                labelBackgroundColor: '#1e293b'
            },
            horzLine: {
                color: 'rgba(148, 163, 184, 0.45)',
                labelBackgroundColor: '#1e293b'
            }
        },
        rightPriceScale: {
            borderColor: 'rgba(255, 255, 255, 0.08)',
            scaleMargins: {
                top: 0.08,
                bottom: 0.22
            }
        },
        timeScale: {
            borderColor: 'rgba(255, 255, 255, 0.08)',
            timeVisible: tfCfg.showTime,
            secondsVisible: false
        },
        localization: {
            locale: 'pt-BR',
            priceFormatter: (price) => formatBrl(price, currentAsset === 'BTC' ? 2 : 3)
        }
    });

    candleSeries = tvChart.addCandlestickSeries({
        upColor: '#0ecb81',
        downColor: '#f6465d',
        borderUpColor: '#0ecb81',
        borderDownColor: '#f6465d',
        wickUpColor: '#0ecb81',
        wickDownColor: '#f6465d',
        priceFormat: {
            type: 'price',
            precision: meta.precision,
            minMove: meta.minMove
        }
    });

    volumeSeries = tvChart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: ''
    });

    volumeSeries.priceScale().applyOptions({
        scaleMargins: {
            top: 0.82,
            bottom: 0
        }
    });

    tvChart.subscribeCrosshairMove((param) => {
        if (!param || !param.time || !param.seriesData) {
            if (currentCandles.length > 0) {
                updateOhlcLegend(currentCandles[currentCandles.length - 1]);
            }
            return;
        }
        const bar = param.seriesData.get(candleSeries);
        if (bar && bar.open !== undefined) {
            updateOhlcLegend({ ...bar, time: param.time });
        }
    });

    if (chartResizeObserver) {
        chartResizeObserver.disconnect();
    }
    chartResizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            if (tvChart && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                tvChart.applyOptions({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
            }
        }
    });
    chartResizeObserver.observe(container);
}

async function fetchBinanceKlines(symbol, interval, limit) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Binance klines HTTP ${response.status}`);
    const rows = await response.json();
    return rows.map((row) => {
        const open = parseFloat(row[1]);
        const high = parseFloat(row[2]);
        const low = parseFloat(row[3]);
        const close = parseFloat(row[4]);
        const volume = parseFloat(row[5]);
        return {
            time: Math.floor(row[0] / 1000),
            open,
            high,
            low,
            close,
            volume
        };
    });
}

async function fetchAwesomeDailyCandles(pair, days) {
    const url = `https://economia.awesomeapi.com.br/json/daily/${pair}/${days}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`AwesomeAPI daily HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('AwesomeAPI retornou lista vazia');
    }

    const sorted = [...rows].sort((a, b) => {
        const ta = Number(a.timestamp) > 1e12 ? Math.floor(Number(a.timestamp) / 1000) : Number(a.timestamp);
        const tb = Number(b.timestamp) > 1e12 ? Math.floor(Number(b.timestamp) / 1000) : Number(b.timestamp);
        return ta - tb;
    });

    // Agrupa por data YYYY-MM-DD (evita timestamps duplicados exigidos pelo Lightweight Charts)
    const byDate = new Map();
    for (const item of sorted) {
        const tsSec = Number(item.timestamp) > 1e12 ? Math.floor(Number(item.timestamp) / 1000) : Number(item.timestamp);
        const d = new Date(tsSec * 1000);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        byDate.set(key, item);
    }

    const entries = Array.from(byDate.entries());
    const candles = [];
    let prevClose = null;

    for (const [dateStr, item] of entries) {
        const close = getMidRate(item);
        const rawHigh = parseFloat(item.high);
        const rawLow = parseFloat(item.low);
        const varBid = parseFloat(item.varBid) || 0;
        const open = prevClose !== null ? prevClose : close - varBid;

        const high = Math.max(open, close, Number.isNaN(rawHigh) ? close : rawHigh);
        const low = Math.min(open, close, Number.isNaN(rawLow) ? close : rawLow);

        candles.push({
            time: dateStr,
            open: Number(open.toFixed(4)),
            high: Number(high.toFixed(4)),
            low: Number(low.toFixed(4)),
            close: Number(close.toFixed(4)),
            volume: Math.abs(high - low) * 10000
        });
        prevClose = close;
    }

    return candles;
}

function alignToLiveSpot(candles, targetLiveRate) {
    if (!candles || candles.length === 0 || !targetLiveRate || Number.isNaN(targetLiveRate)) {
        return candles;
    }
    const lastClose = candles[candles.length - 1].close;
    if (!lastClose || lastClose <= 0) return candles;

    const factor = targetLiveRate / lastClose;
    // Se a diferença for pequena (< 3%), ajusta suavemente para alinhar com a cotação comercial do cartão
    if (Math.abs(factor - 1) > 0.03) return candles;

    return candles.map((c) => ({
        ...c,
        open: Number((c.open * factor).toFixed(4)),
        high: Number((c.high * factor).toFixed(4)),
        low: Number((c.low * factor).toFixed(4)),
        close: Number((c.close * factor).toFixed(4))
    }));
}

async function fetchEurSyntheticKlines(interval, limit) {
    const [eurUsdt, usdtBrl] = await Promise.all([
        fetchBinanceKlines('EURUSDT', interval, limit),
        fetchBinanceKlines('USDTBRL', interval, limit)
    ]);

    const usdtMap = new Map(usdtBrl.map((c) => [c.time, c]));
    const merged = [];

    for (const e of eurUsdt) {
        const u = usdtMap.get(e.time);
        if (!u) continue;
        const open = e.open * u.open;
        const close = e.close * u.close;
        const high = Math.max(e.high * u.high, open, close);
        const low = Math.min(e.low * u.low, open, close);
        merged.push({
            time: e.time,
            open: Number(open.toFixed(4)),
            high: Number(high.toFixed(4)),
            low: Number(low.toFixed(4)),
            close: Number(close.toFixed(4)),
            volume: (e.volume + u.volume) / 2
        });
    }

    return alignToLiveSpot(merged, exchangeRatesCurrent.EUR.BRL);
}

function buildFallbackCandles(asset, timeframe) {
    const baseRate = exchangeRatesCurrent[asset]?.BRL || 5.5;
    const count = timeframe === '1D' ? 48 : timeframe === '7D' ? 56 : timeframe === '1M' ? 30 : timeframe === '6M' ? 90 : 120;
    const stepSec = timeframe === '1D' ? 1800 : timeframe === '7D' ? 10800 : 86400;
    const nowSec = Math.floor(Date.now() / 1000);
    const volatility = asset === 'BTC' ? 0.015 : 0.004;

    const candles = [];
    let price = baseRate * (1 - volatility * 1.5);

    for (let i = count; i >= 0; i--) {
        const t = nowSec - i * stepSec;
        const open = price;
        const drift = i === 0 ? (baseRate - open) : (Math.sin(i * 0.45) * volatility * baseRate * 0.4);
        const close = i === 0 ? baseRate : Math.max(0.01, open + drift);
        const wick = Math.abs(close - open) + baseRate * volatility * 0.25;
        const high = Math.max(open, close) + wick * 0.5;
        const low = Math.max(0.01, Math.min(open, close) - wick * 0.5);

        candles.push({
            time: t,
            open: Number(open.toFixed(asset === 'BTC' ? 2 : 4)),
            high: Number(high.toFixed(asset === 'BTC' ? 2 : 4)),
            low: Number(low.toFixed(asset === 'BTC' ? 2 : 4)),
            close: Number(close.toFixed(asset === 'BTC' ? 2 : 4)),
            volume: 100 + Math.abs(Math.cos(i)) * 250
        });
        price = close;
    }

    return candles;
}

async function fetchCandlesForSelection(asset, timeframe) {
    const cfg = TIMEFRAME_CONFIG[timeframe];

    if (asset === 'BTC') {
        return fetchBinanceKlines('BTCBRL', cfg.binanceInterval, cfg.binanceLimit);
    }

    if (asset === 'USD') {
        if (timeframe === '1D' || timeframe === '7D') {
            try {
                const klines = await fetchBinanceKlines('USDTBRL', cfg.binanceInterval, cfg.binanceLimit);
                return alignToLiveSpot(klines, exchangeRatesCurrent.USD.BRL);
            } catch (err) {
                console.warn('Fallback AwesomeAPI para USD intradiário:', err);
                return fetchAwesomeDailyCandles('USD-BRL', Math.max(cfg.awesomeDays, 15));
            }
        }
        try {
            return await fetchAwesomeDailyCandles('USD-BRL', cfg.awesomeDays);
        } catch (err) {
            console.warn('Fallback Binance USDTBRL para USD:', err);
            const klines = await fetchBinanceKlines('USDTBRL', cfg.binanceInterval, cfg.binanceLimit);
            return alignToLiveSpot(klines, exchangeRatesCurrent.USD.BRL);
        }
    }

    if (asset === 'EUR') {
        if (timeframe === '1D' || timeframe === '7D') {
            try {
                return await fetchEurSyntheticKlines(cfg.binanceInterval, cfg.binanceLimit);
            } catch (err) {
                console.warn('Fallback AwesomeAPI para EUR intradiário:', err);
                return fetchAwesomeDailyCandles('EUR-BRL', Math.max(cfg.awesomeDays, 15));
            }
        }
        try {
            return await fetchAwesomeDailyCandles('EUR-BRL', cfg.awesomeDays);
        } catch (err) {
            console.warn('Fallback Binance sintético para EUR:', err);
            return fetchEurSyntheticKlines(cfg.binanceInterval, cfg.binanceLimit);
        }
    }

    return buildFallbackCandles(asset, timeframe);
}

function updateChartHeaderAndButtons() {
    const meta = ASSET_META[currentAsset];
    const tfCfg = TIMEFRAME_CONFIG[currentTimeframe];

    const titleEl = document.getElementById('chartTitle');
    const subtitleEl = document.getElementById('chartSubtitle');

    if (titleEl) {
        titleEl.innerHTML = `<i data-lucide="candlestick-chart" class="w-5 h-5 ${meta.colorClass}"></i> ${meta.name}`;
    }
    if (subtitleEl) {
        subtitleEl.innerText = `${tfCfg.label} • Velas estilo Binance com atualização a cada 30s`;
    }

    ['USD', 'EUR', 'BTC'].forEach((asset) => {
        const btn = document.getElementById(`btn-asset-${asset}`);
        if (!btn) return;
        if (asset === currentAsset) {
            btn.className = `px-3 py-1.5 rounded-xl text-xs font-semibold ${ASSET_META[asset].activeBg} transition flex items-center gap-1.5`;
        } else {
            btn.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition flex items-center gap-1.5';
        }
    });

    ['1D', '7D', '1M', '6M', '1A'].forEach((tf) => {
        const btn = document.getElementById(`btn-tf-${tf}`);
        if (!btn) return;
        if (tf === currentTimeframe) {
            btn.className = 'px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white transition';
        } else {
            btn.className = 'px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition';
        }
    });

    if (window.lucide) lucide.createIcons();
}

async function loadCandlestickChart() {
    const requestId = ++chartRequestToken;
    updateChartHeaderAndButtons();
    setChartLoading(true);

    try {
        initTradingViewChart();
        let candles = await fetchCandlesForSelection(currentAsset, currentTimeframe);

        if (requestId !== chartRequestToken) return;

        if (!candles || candles.length === 0) {
            candles = buildFallbackCandles(currentAsset, currentTimeframe);
        }

        currentCandles = candles;

        if (candleSeries) {
            candleSeries.setData(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
        }

        if (volumeSeries) {
            volumeSeries.setData(
                candles.map((c) => ({
                    time: c.time,
                    value: c.volume || 0,
                    color: c.close >= c.open ? 'rgba(14, 203, 129, 0.28)' : 'rgba(246, 70, 93, 0.28)'
                }))
            );
        }

        if (tvChart) {
            tvChart.timeScale().fitContent();
        }

        updateOhlcLegend(candles[candles.length - 1]);
    } catch (error) {
        console.error('Erro ao carregar gráfico de velas:', error);
        if (requestId !== chartRequestToken) return;
        const fallback = buildFallbackCandles(currentAsset, currentTimeframe);
        currentCandles = fallback;
        if (candleSeries) {
            candleSeries.setData(fallback.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
            tvChart?.timeScale().fitContent();
            updateOhlcLegend(fallback[fallback.length - 1]);
        }
    } finally {
        if (requestId === chartRequestToken) {
            setChartLoading(false);
        }
    }
}

function updateLiveLastCandle(livePrice) {
    if (!candleSeries || currentCandles.length === 0 || !livePrice || Number.isNaN(livePrice)) return;

    const last = { ...currentCandles[currentCandles.length - 1] };
    const decimals = currentAsset === 'BTC' ? 2 : 4;
    const priceRounded = Number(livePrice.toFixed(decimals));

    last.close = priceRounded;
    last.high = Math.max(last.high, priceRounded);
    last.low = Math.min(last.low, priceRounded);

    currentCandles[currentCandles.length - 1] = last;
    candleSeries.update({
        time: last.time,
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close
    });
    updateOhlcLegend(last);
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
        updateLiveLastCandle(exchangeRatesCurrent[currentAsset]?.BRL);
        calculateConversion();
    } catch (error) {
        console.error('Erro ao buscar cotações ao vivo:', error);
    } finally {
        isFetchingRates = false;
    }
}

function switchChartAsset(asset) {
    if (!ASSET_META[asset]) return;
    currentAsset = asset;
    loadCandlestickChart();
}

function updateChartTimeframe(tf) {
    if (!TIMEFRAME_CONFIG[tf]) return;
    currentTimeframe = tf;
    loadCandlestickChart();
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
    Promise.all([fetchRealTimeRates(), loadCandlestickChart()]).then(() => {
        if (btn) btn.classList.remove('animate-spin');
        showToast("Dados Sincronizados", "Cotações e velas atualizadas com sucesso.");
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

document.addEventListener('DOMContentLoaded', async () => {
    if (window.lucide) lucide.createIcons();
    await fetchRealTimeRates();
    await loadCandlestickChart();
    startAutoRefresh();
});

// Expondo globalmente para os eventos inline do HTML
window.simularAtualizacao = simularAtualizacao;
window.calculateConversion = calculateConversion;
window.executarPixSimulado = executarPixSimulado;
window.switchChartAsset = switchChartAsset;
window.updateChartTimeframe = updateChartTimeframe;
