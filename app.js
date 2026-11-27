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
let resizeObserver = null;

let currentChartAsset = 'USD'; // 'USD', 'EUR', 'BTC'
let currentChartPeriod = '1M'; // '1D', '7D', '1M', '6M', '1A'
let currentCandles = [];
let isFetchingRates = false;
let chartRequestId = 0;
let autoRefreshTimer = null;

const ASSET_CONFIG = {
    USD: {
        title: 'Dólar Comercial (USD / BRL)',
        subtitle: 'Velas OHLC em tempo real — AwesomeAPI',
        awesomePair: 'USD-BRL',
        precision: 4,
        minMove: 0.0001,
        icon: 'dollar-sign',
        iconColor: 'text-emerald-400',
        activeBtnClass: 'bg-emerald-600 text-white'
    },
    EUR: {
        title: 'Euro Zona (EUR / BRL)',
        subtitle: 'Velas OHLC em tempo real — AwesomeAPI',
        awesomePair: 'EUR-BRL',
        precision: 4,
        minMove: 0.0001,
        icon: 'euro',
        iconColor: 'text-rose-400',
        activeBtnClass: 'bg-rose-600 text-white'
    },
    BTC: {
        title: 'Bitcoin (BTC / BRL)',
        subtitle: 'Velas OHLC & Volume em tempo real — Binance',
        awesomePair: 'BTC-BRL',
        binanceSymbol: 'BTCBRL',
        precision: 2,
        minMove: 0.01,
        icon: 'bitcoin',
        iconColor: 'text-orange-400',
        activeBtnClass: 'bg-orange-500 text-white'
    }
};

const BINANCE_PERIOD_MAP = {
    '1D': { interval: '15m', limit: 96 },
    '7D': { interval: '1h', limit: 168 },
    '1M': { interval: '4h', limit: 180 },
    '6M': { interval: '1d', limit: 180 },
    '1A': { interval: '1d', limit: 365 }
};

const AWESOME_DAILY_MAP = {
    '7D': 10,
    '1M': 30,
    '6M': 180,
    '1A': 360
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

function formatChartPrice(value, asset = currentChartAsset) {
    const decimals = asset === 'BTC' ? 2 : 4;
    return formatBrl(value, decimals);
}

function formatPct(pct) {
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

function normalizeTimestampSec(ts) {
    const num = Number(ts);
    if (Number.isNaN(num) || num <= 0) return 0;
    return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num);
}

function getMidRate(pairData) {
    const bid = parseFloat(pairData?.bid);
    const ask = parseFloat(pairData?.ask);
    if (!Number.isNaN(bid) && !Number.isNaN(ask)) {
        return (bid + ask) / 2;
    }
    return bid;
}

function formatTimestampLabel(tsSec) {
    const date = new Date(tsSec * 1000);
    if (currentChartPeriod === '1D' || currentChartPeriod === '7D' || currentChartPeriod === '1M') {
        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }}
