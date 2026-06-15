// Default stock list
const DEFAULT_STOCKS = [
    {"ticker": "EGEEN.IS", "name": "Ege Endüstri"},
    {"ticker": "FROTO.IS", "name": "Ford Otosan"},
    {"ticker": "OTKAR.IS", "name": "Otokar"},
    {"ticker": "PGSUS.IS", "name": "Pegasus Hava Taş."},
    {"ticker": "BRSAN.IS", "name": "Borusan Boru Sanayi"},
    {"ticker": "CLEBI.IS", "name": "Çelebi Hava Servisi"},
    {"ticker": "ISMEN.IS", "name": "İş Yatırım Menkul Değ."},
    {"ticker": "ANSGR.IS", "name": "Anadolu Sigorta"},
    {"ticker": "LOGO.IS", "name": "Logo Yazılım"},
    {"ticker": "SODSN.IS", "name": "Sodaş Sodyum Sanayi"},
    {"ticker": "LKMNH.IS", "name": "Lokman Hekim"},
    {"ticker": "ALKA.IS", "name": "Alkim Kağıt"},
    {"ticker": "ALTNY.IS", "name": "Altınay Savunma"},
    {"ticker": "CCOLA.IS", "name": "Coca-Cola İçecek"}
];

// App global state
const appState = {
    stocks: [],
    // format: { TICKER: { priceChart, rsiChart, candleSeries, volumeSeries, rsiSeries, ema8Series... } }
    charts: {}, 
    usdTryRate: 1.0,
    theme: 'dark' // 'dark' or 'light'
};

// DOM Elements
const stocksGrid = document.getElementById('stocks-grid');
const updateAllBtn = document.getElementById('update-all-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const addStockBtn = document.getElementById('add-stock-btn');
const addStockModal = document.getElementById('add-stock-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');
const saveStockBtn = document.getElementById('save-stock-btn');

const stockTickerInput = document.getElementById('stock-ticker-input');
const stockNameInput = document.getElementById('stock-name-input');
const modalErrorMsg = document.getElementById('modal-error-msg');
const usdtryValue = document.getElementById('usdtry-value');
const usdtryTime = document.getElementById('usdtry-time');

// Portfolio backup elements
const importPortfolioBtn = document.getElementById('import-portfolio-btn');
const downloadPortfolioBtn = document.getElementById('download-portfolio-btn');
const portfolioFileInput = document.getElementById('portfolio-file-input');
const totalStocksCount = document.getElementById('total-stocks-count');

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        initTheme();
        initStocksList();
        
        // 1. Render card skeletons and UI structure immediately to prevent lock-ups
        initDashboardStructure();
        
        // 2. Load USDTRY rate in background
        await updateUSDTRY();
        
        // 3. Load all charts waterfall style
        await updateAllCharts();
    } catch (error) {
        console.error('Sistem yüklenirken hata oluştu:', error);
        const initialLoader = document.getElementById('initial-loader');
        if (initialLoader) {
            initialLoader.innerHTML = `
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 3rem; color: var(--color-red);"></i>
                <p style="color: var(--color-red); margin-top: 1rem;">Sistem başlatılırken hata oluştu. Hata detayları: ${error.message}</p>
            `;
        }
    }

    // Event Listeners for actions
    updateAllBtn.addEventListener('click', updateAllCharts);
    themeToggleBtn.addEventListener('click', toggleTheme);
    addStockBtn.addEventListener('click', showModal);
    closeModalBtn.addEventListener('click', hideModal);
    cancelModalBtn.addEventListener('click', hideModal);
    addStockModal.addEventListener('click', (e) => {
        if (e.target === addStockModal) hideModal();
    });
    saveStockBtn.addEventListener('click', handleAddStock);

    // Portfolio backup listeners
    importPortfolioBtn.addEventListener('click', () => portfolioFileInput.click());
    portfolioFileInput.addEventListener('change', handleImportPortfolioFile);
    downloadPortfolioBtn.addEventListener('click', handleDownloadPortfolio);
});

function initStocksList() {
    const saved = localStorage.getItem('hisse_dashboard_stocks');
    if (saved) {
        try {
            appState.stocks = JSON.parse(saved);
        } catch (e) {
            console.error('Error parsing stocks, restoring defaults', e);
            appState.stocks = [...DEFAULT_STOCKS];
        }
    } else {
        appState.stocks = [...DEFAULT_STOCKS];
        localStorage.setItem('hisse_dashboard_stocks', JSON.stringify(appState.stocks));
    }
    totalStocksCount.textContent = appState.stocks.length;
}

function initTheme() {
    const savedTheme = localStorage.getItem('hisse_dashboard_theme');
    appState.theme = savedTheme === 'light' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', appState.theme);
    updateThemeIcon();
}

function toggleTheme() {
    appState.theme = appState.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('hisse_dashboard_theme', appState.theme);
    document.body.setAttribute('data-theme', appState.theme);
    updateThemeIcon();
    
    const isLight = appState.theme === 'light';
    const chartTheme = {
        layout: {
            background: { type: 'solid', color: isLight ? '#ffffff' : '#121824' },
            textColor: isLight ? '#4b5563' : '#8b949e',
        },
        grid: {
            vertLines: { color: isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.03)' },
            horzLines: { color: isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.03)' },
        }
    };
    
    Object.keys(appState.charts).forEach(ticker => {
        appState.charts[ticker].priceChart.applyOptions(chartTheme);
        appState.charts[ticker].rsiChart.applyOptions(chartTheme);
    });
}

function updateThemeIcon() {
    if (appState.theme === 'light') {
        themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun" style="color: #ffb300;"></i>';
    } else {
        themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
}

// ==========================================================================
// YAHOO FINANCE DATA API (SERVERLESS - DYNAMIC PROXY ROTATION & RETRIES)
// ==========================================================================
// Set your Cloudflare Worker URL here to get maximum speed and bypass public proxy limits.
// Example: 'https://my-cors-proxy.my-subdomain.workers.dev'
// Leave empty '' to use public fallback proxies.
const CLOUDFLARE_WORKER_URL = 'https://hisse-cors-proxy.enesla6352.workers.dev';

async function fetchYahooChart(ticker, interval, range, retryCount = 0) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}`;
    
    let proxyUrl = '';
    
    // Use Cloudflare Worker as primary if configured and this is the first attempt
    if (CLOUDFLARE_WORKER_URL && retryCount === 0) {
        const cleanBase = CLOUDFLARE_WORKER_URL.endsWith('/') ? CLOUDFLARE_WORKER_URL.slice(0, -1) : CLOUDFLARE_WORKER_URL;
        proxyUrl = `${cleanBase}?url=${encodeURIComponent(url)}`;
    } else {
        // Rotating Public Proxy List
        const proxies = [
            (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
            (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
        ];
        
        // Adjust index calculations if Cloudflare Worker was tried first
        const adjustedRetry = CLOUDFLARE_WORKER_URL ? retryCount - 1 : retryCount;
        const proxyIndex = Math.max(0, adjustedRetry) % proxies.length;
        proxyUrl = proxies[proxyIndex](url);
    }
    
    // Create AbortController for 6-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    
    try {
        const response = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId); // clear timeout on success
        
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        
        const data = await response.json();
        const chart = data.get ? data.get('chart') : data.chart;
        if (chart && chart.result && chart.result.length > 0) {
            return chart.result[0];
        }
        throw new Error("Veri formatı uyuşmuyor.");
    } catch (error) {
        clearTimeout(timeoutId); // clear timeout on error
        
        const isAbort = error.name === 'AbortError';
        const errMsg = isAbort ? 'İstek Zaman Aşımı (6s)' : error.message;
        console.warn(`${ticker} için bağlantı hatası (Deneme ${retryCount + 1}):`, errMsg);
        
        if (retryCount < 3) {
            // Wait and retry
            await new Promise(resolve => setTimeout(resolve, 500 + retryCount * 500));
            return fetchYahooChart(ticker, interval, range, retryCount + 1);
        }
        throw new Error(errMsg);
    }
}

async function updateUSDTRY() {
    try {
        const result = await fetchYahooChart('USDTRY=X', '1d', '5d');
        if (result && result.indicators && result.indicators.quote) {
            const closes = result.indicators.quote[0].close || [];
            const validCloses = closes.filter(c => c !== null);
            if (validCloses.length > 0) {
                const rate = validCloses[validCloses.length - 1];
                appState.usdTryRate = rate;
                usdtryValue.textContent = `₺${rate.toFixed(4)}`;
                usdtryTime.textContent = `Son Güncelleme: ${new Date().toLocaleTimeString('tr-TR')}`;
                return;
            }
        }
    } catch (e) {
        console.error('USDTRY çekme hatası:', e);
        usdtryValue.textContent = 'Hata';
    }
}

// ==========================================================================
// TECHNICAL INDICATORS CALCULATORS (RSI & EMA)
// ==========================================================================

// RSI (Relative Strength Index)
function calculateRSI(prices, period = 14) {
    if (prices.length <= period) {
        return Array(prices.length).fill(0.0);
    }
    const rsiValues = Array(prices.length).fill(0.0);
    const gains = [];
    const losses = [];
    
    for (let i = 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        gains.push(change > 0 ? change : 0.0);
        losses.push(change < 0 ? -change : 0.0);
    }
    
    let avgGain = gains.slice(0, period).reduce((sum, g) => sum + g, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((sum, l) => sum + l, 0) / period;
    
    rsiValues[period] = avgLoss === 0 ? 100.0 : 100.0 - (100.0 / (1.0 + (avgGain / avgLoss)));
    
    for (let i = period + 1; i < prices.length; i++) {
        const gain = gains[i - 1];
        const loss = losses[i - 1];
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        rsiValues[i] = avgLoss === 0 ? 100.0 : 100.0 - (100.0 / (1.0 + (avgGain / avgLoss)));
    }
    return rsiValues;
}

// EMA (Exponential Moving Average)
function calculateEMA(prices, period) {
    if (prices.length < period) {
        return Array(prices.length).fill(null);
    }
    const ema = Array(prices.length).fill(null);
    const k = 2 / (period + 1);
    
    // SMA for the first period
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += prices[i];
    }
    ema[period - 1] = sum / period;
    
    // EMA calculations
    for (let i = period; i < prices.length; i++) {
        ema[i] = (prices[i] * k) + (ema[i - 1] * (1 - k));
    }
    return ema;
}

// Align BIST stocks with USDTRY date-by-date
async function getUSDAlignedChartData(ticker, period) {
    let interval = '1d';
    let range = '250d'; // Increased range to have enough room for EMA 200 calculations
    
    if (period === 'weekly') {
        interval = '1wk';
        range = '4y'; // Increased for EMA 200 on weekly
    } else if (period === 'monthly') {
        interval = '1mo';
        range = '20y'; // Increased for EMA 200 on monthly
    }
    
    const stockPromise = fetchYahooChart(ticker, interval, range);
    const usdtryPromise = ticker.endsWith('.IS') ? fetchYahooChart('USDTRY=X', interval, range) : Promise.resolve(null);
    
    const [stockChart, usdtryChart] = await Promise.all([stockPromise, usdtryPromise]);
    
    if (!stockChart) return null;
    
    const stockTs = stockChart.timestamp || [];
    const stockQuotes = stockChart.indicators.quote[0] || {};
    const stockOpen = stockQuotes.open || [];
    const stockHigh = stockQuotes.high || [];
    const stockLow = stockQuotes.low || [];
    const stockClose = stockQuotes.close || [];
    const stockVolume = stockQuotes.volume || [];
    
    const usdtryRates = {};
    if (usdtryChart) {
        const uTs = usdtryChart.timestamp || [];
        const uClose = usdtryChart.indicators.quote[0].close || [];
        for (let i = 0; i < uTs.length; i++) {
            const t = uTs[i];
            const val = uClose[i];
            if (t && val) {
                const dtStr = new Date(t * 1000).toISOString().split('T')[0];
                usdtryRates[dtStr] = val;
            }
        }
    }
    
    const sortedUsdtryDates = Object.keys(usdtryRates).sort();
    const alignedData = [];
    
    for (let i = 0; i < stockTs.length; i++) {
        const t = stockTs[i];
        const o = stockOpen[i];
        const h = stockHigh[i];
        const l = stockLow[i];
        const c = stockClose[i];
        const v = stockVolume[i] || 0;
        
        if (t === null || o === null || h === null || l === null || c === null) {
            continue;
        }
        
        const dtStr = new Date(t * 1000).toISOString().split('T')[0];
        
        let rate = 1.0;
        if (ticker.endsWith('.IS')) {
            rate = usdtryRates[dtStr];
            if (!rate) {
                let closestRate = null;
                if (sortedUsdtryDates.length > 0) {
                    for (let j = sortedUsdtryDates.length - 1; j >= 0; j--) {
                        if (sortedUsdtryDates[j] <= dtStr) {
                            closestRate = usdtryRates[sortedUsdtryDates[j]];
                            break;
                        }
                    }
                    if (!closestRate) closestRate = usdtryRates[sortedUsdtryDates[0]];
                }
                rate = closestRate || 1.0;
            }
        }
        
        alignedData.push({
            time: dtStr,
            open: o / rate,
            high: h / rate,
            low: l / rate,
            close: c / rate,
            volume: v,
            rate: rate
        });
    }
    
    if (alignedData.length === 0) return null;
    
    // Extract closes
    const closes = alignedData.map(item => item.close);
    
    // Calculate Indicators
    const rsiVals = calculateRSI(closes, 14);
    const ema8Vals = calculateEMA(closes, 8);
    const ema20Vals = calculateEMA(closes, 20);
    const ema50Vals = calculateEMA(closes, 50);
    const ema100Vals = calculateEMA(closes, 100);
    const ema200Vals = calculateEMA(closes, 200);
    
    alignedData.forEach((item, index) => {
        item.rsi = rsiVals[index];
        item.ema8 = ema8Vals[index];
        item.ema20 = ema20Vals[index];
        item.ema50 = ema50Vals[index];
        item.ema100 = ema100Vals[index];
        item.ema200 = ema200Vals[index];
    });
    
    const currentPrice = alignedData[alignedData.length - 1].close;
    const prevPrice = alignedData.length > 1 ? alignedData[alignedData.length - 2].close : currentPrice;
    const change = currentPrice - prevPrice;
    const changePercent = prevPrice !== 0 ? (change / prevPrice) * 100 : 0;
    
    const slicedFor52w = alignedData.slice(-252);
    const highs = slicedFor52w.map(item => item.high);
    const lows = slicedFor52w.map(item => item.low);
    const high52w = Math.max(...highs);
    const low52w = Math.min(...lows);
    
    return {
        ticker: ticker,
        name: appState.stocks.find(s => s.ticker === ticker)?.name || ticker.split('.')[0],
        period: period,
        data: alignedData,
        summary: {
            current_price: currentPrice,
            change: change,
            change_percent: changePercent,
            high_52w: high52w,
            low_52w: low52w,
            last_updated: new Date().toLocaleTimeString('tr-TR')
        }
    };
}

// ==========================================================================
// DASHBOARD & CARDS INITIALIZATION
// ==========================================================================
function initDashboardStructure() {
    const initialLoader = document.getElementById('initial-loader');
    if (initialLoader) initialLoader.remove();
    
    if (appState.stocks.length === 0) {
        stocksGrid.innerHTML = `
            <div class="loader-container">
                <i class="fa-solid fa-circle-info" style="font-size: 3rem; color: var(--accent-blue);"></i>
                <p>Listeniz boş. Lütfen "Hisse Ekle" butonu ile hisse ekleyin.</p>
            </div>
        `;
        return;
    }
    
    appState.stocks.forEach(stock => {
        createStockCard(stock);
    });
}

function createStockCard(stock) {
    const card = document.createElement('div');
    const safeId = stock.ticker.replace('.', '_');
    card.className = 'stock-card';
    card.id = `card-${safeId}`;
    
    card.innerHTML = `
        <!-- Card Loader -->
        <div class="card-loader" id="loader-${safeId}">
            <div class="spinner"></div>
            <p style="font-size: 0.75rem; color: var(--text-secondary);">Veriler Yükleniyor...</p>
        </div>

        <!-- Header Info -->
        <div class="card-header">
            <div class="company-info">
                <div class="stock-ticker">${stock.ticker.split('.')[0]}</div>
                <div class="stock-name">${stock.name}</div>
            </div>
            <div class="price-info">
                <div class="stock-price" id="price-${safeId}">$--.--</div>
                <div class="price-change" id="change-${safeId}">--%</div>
            </div>
        </div>

        <!-- Controls (Period & Update) -->
        <div class="card-controls">
            <div class="period-toggle">
                <button class="toggle-btn active" data-period="daily">G</button>
                <button class="toggle-btn" data-period="weekly">H</button>
                <button class="toggle-btn" data-period="monthly">A</button>
            </div>
            <div class="card-actions">
                <span class="meta-info" id="time-${safeId}">--:--:--</span>
                <button class="btn-icon-refresh" id="refresh-${safeId}" title="Grafiği Güncelle">
                    <i class="fa-solid fa-arrows-rotate"></i>
                </button>
                <button class="btn-icon-delete" id="delete-${safeId}" title="Hisseyi Kaldır">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </div>

        <!-- Chart Containers -->
        <div class="chart-container-wrapper">
            <!-- Floating Legend -->
            <div class="chart-legend" id="legend-${safeId}">
                <div class="legend-row">
                    <div class="legend-item"><span>A:</span><strong id="leg-open-${safeId}">--</strong></div>
                    <div class="legend-item"><span>Y:</span><strong id="leg-high-${safeId}">--</strong></div>
                    <div class="legend-item"><span>D:</span><strong id="leg-low-${safeId}">--</strong></div>
                    <div class="legend-item"><span>K:</span><strong id="leg-close-${safeId}">--</strong></div>
                    <div class="legend-item"><span>RSI:</span><strong id="leg-rsi-${safeId}" style="color: var(--color-rsi);">--</strong></div>
                </div>
                <div class="legend-row" style="margin-top: 3px; font-size: 0.65rem; opacity: 0.85;">
                    <div class="legend-item"><span style="color: #29b6f6;">EMA8:</span><strong id="leg-ema8-${safeId}">--</strong></div>
                    <div class="legend-item"><span style="color: #ffca28;">EMA20:</span><strong id="leg-ema20-${safeId}">--</strong></div>
                    <div class="legend-item"><span style="color: #ff7043;">EMA50:</span><strong id="leg-ema50-${safeId}">--</strong></div>
                    <div class="legend-item"><span style="color: #ab47bc;">EMA100:</span><strong id="leg-ema100-${safeId}">--</strong></div>
                    <div class="legend-item"><span style="color: #ec407a;">EMA200:</span><strong id="leg-ema200-${safeId}">--</strong></div>
                </div>
            </div>
            
            <div class="chart-main" id="chart-main-${safeId}"></div>
            
            <div class="chart-rsi" id="chart-rsi-${safeId}">
                <div class="rsi-indicator-tag">RSI (14)</div>
            </div>
        </div>

        <!-- 52 Week High/Low Stats bar -->
        <div class="hl-stats-bar">
            <div>52 H. En Düşük: <strong id="low52-${safeId}">$--.--</strong></div>
            <div>52 H. En Yüksek: <strong id="high52-${safeId}">$--.--</strong></div>
        </div>
    `;
    
    stocksGrid.appendChild(card);
    
    // Init charts
    initChartsForStock(stock.ticker);
    
    // Setup listeners
    setupCardEventListeners(stock.ticker);
}

function getChartHeights(ticker) {
    if (ticker) {
        const safeId = ticker.replace('.', '_');
        const mainContainer = document.getElementById(`chart-main-${safeId}`);
        const rsiContainer = document.getElementById(`chart-rsi-${safeId}`);
        if (mainContainer && rsiContainer && mainContainer.clientHeight > 0 && rsiContainer.clientHeight > 0) {
            return {
                price: mainContainer.clientHeight,
                rsi: rsiContainer.clientHeight
            };
        }
    }
    
    // Fallback based on CSS media queries
    const isLandscape = window.innerHeight < 550;
    if (isLandscape) {
        return { price: 180, rsi: 70 };
    }
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
        return { price: 260, rsi: 90 };
    }
    return { price: 350, rsi: 110 };
}

function initChartsForStock(ticker) {
    const safeId = ticker.replace('.', '_');
    const mainContainer = document.getElementById(`chart-main-${safeId}`);
    const rsiContainer = document.getElementById(`chart-rsi-${safeId}`);
    
    const isLight = appState.theme === 'light';
    const chartOptions = {
        layout: {
            background: { type: 'solid', color: isLight ? '#ffffff' : '#121824' },
            textColor: isLight ? '#4b5563' : '#8b949e',
            fontSize: 10,
            fontFamily: 'Inter, sans-serif',
        },
        grid: {
            vertLines: { color: isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.03)' },
            horzLines: { color: isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.03)' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: {
                color: isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.25)',
                width: 1,
                style: 3,
                labelBackgroundColor: isLight ? '#e2e8f0' : '#1f2937',
            },
            horzLine: {
                color: isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.25)',
                width: 1,
                style: 3,
                labelBackgroundColor: isLight ? '#e2e8f0' : '#1f2937',
            }
        },
        timeScale: {
            borderColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)',
            timeVisible: false,
        },
        rightPriceScale: {
            borderColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)',
            minimumWidth: 75,
        }
    };

    const heights = getChartHeights(ticker);
    const priceChart = LightweightCharts.createChart(mainContainer, {
        ...chartOptions,
        height: heights.price
    });
    
    // Main Candlestick Series
    const candleSeries = priceChart.addCandlestickSeries({
        upColor: '#00c853',
        downColor: '#d50000',
        borderUpColor: '#00c853',
        borderDownColor: '#d50000',
        wickUpColor: '#00c853',
        wickDownColor: '#d50000',
    });
    
    // Volume Series overlay
    const volumeSeries = priceChart.addHistogramSeries({
        color: 'rgba(0, 176, 255, 0.12)',
        priceFormat: { type: 'volume' },
        priceScaleId: '', 
    });
    
    priceChart.priceScale('').applyOptions({
        scaleMargins: {
            top: 0.8,
            bottom: 0,
        },
    });

    // 5 EMA Line Series
    const ema8Series = priceChart.addLineSeries({ color: '#29b6f6', lineWidth: 1.0, title: 'EMA 8', lastValueVisible: false, priceLineVisible: false });
    const ema20Series = priceChart.addLineSeries({ color: '#ffca28', lineWidth: 1.0, title: 'EMA 20', lastValueVisible: false, priceLineVisible: false });
    const ema50Series = priceChart.addLineSeries({ color: '#ff7043', lineWidth: 1.0, title: 'EMA 50', lastValueVisible: false, priceLineVisible: false });
    const ema100Series = priceChart.addLineSeries({ color: '#ab47bc', lineWidth: 1.0, title: 'EMA 100', lastValueVisible: false, priceLineVisible: false });
    const ema200Series = priceChart.addLineSeries({ color: '#ec407a', lineWidth: 1.0, title: 'EMA 200', lastValueVisible: false, priceLineVisible: false });

    // RSI Chart
    const rsiChart = LightweightCharts.createChart(rsiContainer, {
        ...chartOptions,
        height: heights.rsi,
        rightPriceScale: {
            borderColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)',
            visible: true,
            autoScale: true,
            minimumWidth: 75,
        },
        timeScale: {
            ...chartOptions.timeScale,
            visible: true,
        }
    });
    
    priceChart.timeScale().applyOptions({ visible: false });

    const rsiSeries = rsiChart.addLineSeries({
        color: isLight ? '#6200ea' : '#b388ff',
        lineWidth: 2.0,
    });
    
    // RSI thresholds
    rsiSeries.createPriceLine({
        price: 70,
        color: 'rgba(213, 0, 0, 0.4)',
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: true,
        title: '70',
    });
    
    rsiSeries.createPriceLine({
        price: 30,
        color: 'rgba(0, 200, 83, 0.4)',
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: true,
        title: '30',
    });

    // Sync zoom/scroll & axis alignment
    let isReflecting = false;
    const priceScale = priceChart.priceScale('right');
    const rsiScale = rsiChart.priceScale('right');

    function syncPriceScaleWidths() {
        const w1 = priceScale.width();
        const w2 = rsiScale.width();
        if (w1 > 0 && w2 > 0 && w1 !== w2) {
            const maxWidth = Math.max(w1, w2);
            priceScale.applyOptions({ minimumWidth: maxWidth });
            rsiScale.applyOptions({ minimumWidth: maxWidth });
        }
    }

    priceChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (isReflecting) return;
        isReflecting = true;
        rsiChart.timeScale().setVisibleLogicalRange(range);
        isReflecting = false;
        syncPriceScaleWidths();
    });

    rsiChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (isReflecting) return;
        isReflecting = true;
        priceChart.timeScale().setVisibleLogicalRange(range);
        isReflecting = false;
        syncPriceScaleWidths();
    });

    // Crosshair hover and Legend sync
    setupCrosshairSync(priceChart, rsiChart, candleSeries, volumeSeries, rsiSeries, ema8Series, ema20Series, ema50Series, ema100Series, ema200Series, ticker);

    appState.charts[ticker] = {
        priceChart,
        rsiChart,
        candleSeries,
        volumeSeries,
        rsiSeries,
        ema8Series,
        ema20Series,
        ema50Series,
        ema100Series,
        ema200Series,
        period: 'daily',
        lastData: [],
        syncPriceScaleWidths: syncPriceScaleWidths
    };
    
    // Resize observer
    const resizeObserver = new ResizeObserver(entries => {
        if (entries.length === 0) return;
        const { width } = entries[0].contentRect;
        const currentHeights = getChartHeights(ticker);
        priceChart.resize(width, currentHeights.price);
        rsiChart.resize(width, currentHeights.rsi);
        requestAnimationFrame(syncPriceScaleWidths);
    });
    resizeObserver.observe(mainContainer);
}

function setupCrosshairSync(priceChart, rsiChart, candleSeries, volumeSeries, rsiSeries, ema8Series, ema20Series, ema50Series, ema100Series, ema200Series, ticker) {
    const safeId = ticker.replace('.', '_');
    
    const elements = {
        open: document.getElementById(`leg-open-${safeId}`),
        high: document.getElementById(`leg-high-${safeId}`),
        low: document.getElementById(`leg-low-${safeId}`),
        close: document.getElementById(`leg-close-${safeId}`),
        rsi: document.getElementById(`leg-rsi-${safeId}`),
        ema8: document.getElementById(`leg-ema8-${safeId}`),
        ema20: document.getElementById(`leg-ema20-${safeId}`),
        ema50: document.getElementById(`leg-ema50-${safeId}`),
        ema100: document.getElementById(`leg-ema100-${safeId}`),
        ema200: document.getElementById(`leg-ema200-${safeId}`)
    };

    function updateLegend(hoverData) {
        if (hoverData) {
            elements.open.textContent = `$${hoverData.open.toFixed(2)}`;
            elements.high.textContent = `$${hoverData.high.toFixed(2)}`;
            elements.low.textContent = `$${hoverData.low.toFixed(2)}`;
            elements.close.textContent = `$${hoverData.close.toFixed(2)}`;
            elements.rsi.textContent = hoverData.rsi ? hoverData.rsi.toFixed(2) : '--';
            
            // RSI colors
            if (hoverData.rsi) {
                if (hoverData.rsi >= 70) elements.rsi.style.color = 'var(--color-red)';
                else if (hoverData.rsi <= 30) elements.rsi.style.color = 'var(--color-green)';
                else elements.rsi.style.color = 'var(--color-rsi)';
            } else {
                elements.rsi.style.color = 'var(--color-rsi)';
            }
            
            // EMAs
            elements.ema8.textContent = hoverData.ema8 ? `$${hoverData.ema8.toFixed(2)}` : '--';
            elements.ema20.textContent = hoverData.ema20 ? `$${hoverData.ema20.toFixed(2)}` : '--';
            elements.ema50.textContent = hoverData.ema50 ? `$${hoverData.ema50.toFixed(2)}` : '--';
            elements.ema100.textContent = hoverData.ema100 ? `$${hoverData.ema100.toFixed(2)}` : '--';
            elements.ema200.textContent = hoverData.ema200 ? `$${hoverData.ema200.toFixed(2)}` : '--';
        } else {
            elements.open.textContent = '--';
            elements.high.textContent = '--';
            elements.low.textContent = '--';
            elements.close.textContent = '--';
            elements.rsi.textContent = '--';
            elements.rsi.style.color = 'var(--color-rsi)';
            elements.ema8.textContent = '--';
            elements.ema20.textContent = '--';
            elements.ema50.textContent = '--';
            elements.ema100.textContent = '--';
            elements.ema200.textContent = '--';
        }
    }

    priceChart.subscribeCrosshairMove(param => {
        if (appState.charts[ticker] && appState.charts[ticker].syncPriceScaleWidths) {
            appState.charts[ticker].syncPriceScaleWidths();
        }
        if (param.time === undefined || param.point === undefined) {
            const stockData = appState.charts[ticker].lastData;
            if (stockData && stockData.length > 0) {
                const latest = stockData[stockData.length - 1];
                updateLegend(latest);
            }
            rsiChart.clearCrosshairPosition();
            return;
        }

        rsiChart.setCrosshairPosition(null, param.time, rsiSeries);
        const hoverItem = (appState.charts[ticker].lastData || []).find(d => d.time === param.time);
        if (hoverItem) updateLegend(hoverItem);
    });

    rsiChart.subscribeCrosshairMove(param => {
        if (appState.charts[ticker] && appState.charts[ticker].syncPriceScaleWidths) {
            appState.charts[ticker].syncPriceScaleWidths();
        }
        if (param.time === undefined || param.point === undefined) {
            const stockData = appState.charts[ticker].lastData;
            if (stockData && stockData.length > 0) {
                const latest = stockData[stockData.length - 1];
                updateLegend(latest);
            }
            priceChart.clearCrosshairPosition();
            return;
        }

        priceChart.setCrosshairPosition(null, param.time, candleSeries);
        const hoverItem = (appState.charts[ticker].lastData || []).find(d => d.time === param.time);
        if (hoverItem) updateLegend(hoverItem);
    });
}

function setupCardEventListeners(ticker) {
    const safeId = ticker.replace('.', '_');
    const cardEl = document.getElementById(`card-${safeId}`);
    
    // Period selection
    const periodButtons = cardEl.querySelectorAll('.toggle-btn');
    periodButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            if (btn.classList.contains('active')) return;
            
            periodButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const period = btn.getAttribute('data-period');
            appState.charts[ticker].period = period;
            await fetchAndDrawChart(ticker);
        });
    });
    
    // Refresh Button
    const refreshBtn = document.getElementById(`refresh-${safeId}`);
    refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('spinning');
        await fetchAndDrawChart(ticker);
        setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
    });

    // Delete Button
    const deleteBtn = document.getElementById(`delete-${safeId}`);
    deleteBtn.addEventListener('click', async () => {
        const confirmDelete = confirm(`${ticker.split('.')[0]} hissesini listeden kaldırmak istediğinize emin misiniz?`);
        if (!confirmDelete) return;
        
        const loader = document.getElementById(`loader-${safeId}`);
        if (loader) loader.style.display = 'flex';
        
        try {
            appState.stocks = appState.stocks.filter(s => s.ticker !== ticker);
            localStorage.setItem('hisse_dashboard_stocks', JSON.stringify(appState.stocks));
            totalStocksCount.textContent = appState.stocks.length;
            
            if (appState.charts[ticker]) {
                appState.charts[ticker].priceChart.remove();
                appState.charts[ticker].rsiChart.remove();
                delete appState.charts[ticker];
            }
            
            cardEl.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            cardEl.style.opacity = '0';
            cardEl.style.transform = 'scale(0.9)';
            setTimeout(() => {
                cardEl.remove();
                if (appState.stocks.length === 0) {
                    stocksGrid.innerHTML = `
                        <div class="loader-container">
                            <i class="fa-solid fa-circle-info" style="font-size: 3rem; color: var(--accent-blue);"></i>
                            <p>Listeniz boş. Lütfen "Hisse Ekle" butonu ile hisse ekleyin.</p>
                        </div>
                    `;
                }
            }, 400);
            
        } catch (error) {
            alert(`Hata: ${error.message}`);
            if (loader) loader.style.display = 'none';
        }
    });
}

// Fetch single stock chart data and render it
async function fetchAndDrawChart(ticker) {
    const safeId = ticker.replace('.', '_');
    const loader = document.getElementById(`loader-${safeId}`);
    const chartState = appState.charts[ticker];
    
    if (loader) loader.style.display = 'flex';
    
    try {
        const resData = await getUSDAlignedChartData(ticker, chartState.period);
        if (!resData) throw new Error('Veriler çekilemedi.');
        
        const rawPoints = resData.data;
        chartState.lastData = rawPoints;
        
        const candles = [];
        const volume = [];
        const rsi = [];
        
        const ema8 = [];
        const ema20 = [];
        const ema50 = [];
        const ema100 = [];
        const ema200 = [];
        
        rawPoints.forEach(p => {
            candles.push({
                time: p.time,
                open: p.open,
                high: p.high,
                low: p.low,
                close: p.close
            });
            
            const isUp = p.close >= p.open;
            volume.push({
                time: p.time,
                value: p.volume,
                color: isUp ? 'rgba(0, 200, 83, 0.12)' : 'rgba(213, 0, 0, 0.12)'
            });
            
            if (p.rsi !== 0.0) {
                rsi.push({ time: p.time, value: p.rsi });
            }
            
            if (p.ema8 !== null) ema8.push({ time: p.time, value: p.ema8 });
            if (p.ema20 !== null) ema20.push({ time: p.time, value: p.ema20 });
            if (p.ema50 !== null) ema50.push({ time: p.time, value: p.ema50 });
            if (p.ema100 !== null) ema100.push({ time: p.time, value: p.ema100 });
            if (p.ema200 !== null) ema200.push({ time: p.time, value: p.ema200 });
        });
        
        chartState.candleSeries.setData(candles);
        chartState.volumeSeries.setData(volume);
        chartState.rsiSeries.setData(rsi);
        
        chartState.ema8Series.setData(ema8);
        chartState.ema20Series.setData(ema20);
        chartState.ema50Series.setData(ema50);
        chartState.ema100Series.setData(ema100);
        chartState.ema200Series.setData(ema200);
        
        chartState.priceChart.timeScale().fitContent();
        
        // Perfect vertical axis alignment sync on data load
        if (chartState.syncPriceScaleWidths) {
            chartState.syncPriceScaleWidths();
        }
        setTimeout(() => {
            if (chartState.syncPriceScaleWidths) {
                chartState.syncPriceScaleWidths();
            }
        }, 100);
        
        // Update Card UI Header
        const summary = resData.summary;
        const priceEl = document.getElementById(`price-${safeId}`);
        const changeEl = document.getElementById(`change-${safeId}`);
        const timeEl = document.getElementById(`time-${safeId}`);
        const low52El = document.getElementById(`low52-${safeId}`);
        const high52El = document.getElementById(`high52-${safeId}`);
        
        priceEl.textContent = `$${summary.current_price.toFixed(2)}`;
        const changeSign = summary.change >= 0 ? '+' : '';
        changeEl.textContent = `${changeSign}${summary.change_percent.toFixed(2)}%`;
        changeEl.className = 'price-change ' + (summary.change >= 0 ? 'up' : 'down');
        
        low52El.textContent = `$${summary.low_52w.toFixed(2)}`;
        high52El.textContent = `$${summary.high_52w.toFixed(2)}`;
        timeEl.textContent = `${summary.last_updated}`;
        
        // Update Legend with latest point
        const latestPoint = rawPoints[rawPoints.length - 1];
        
        const openLeg = document.getElementById(`leg-open-${safeId}`);
        const highLeg = document.getElementById(`leg-high-${safeId}`);
        const lowLeg = document.getElementById(`leg-low-${safeId}`);
        const closeLeg = document.getElementById(`leg-close-${safeId}`);
        const rsiLeg = document.getElementById(`leg-rsi-${safeId}`);
        
        const ema8Leg = document.getElementById(`leg-ema8-${safeId}`);
        const ema20Leg = document.getElementById(`leg-ema20-${safeId}`);
        const ema50Leg = document.getElementById(`leg-ema50-${safeId}`);
        const ema100Leg = document.getElementById(`leg-ema100-${safeId}`);
        const ema200Leg = document.getElementById(`leg-ema200-${safeId}`);
        
        openLeg.textContent = `$${latestPoint.open.toFixed(2)}`;
        highLeg.textContent = `$${latestPoint.high.toFixed(2)}`;
        lowLeg.textContent = `$${latestPoint.low.toFixed(2)}`;
        closeLeg.textContent = `$${latestPoint.close.toFixed(2)}`;
        rsiLeg.textContent = latestPoint.rsi ? latestPoint.rsi.toFixed(2) : '--';
        
        if (latestPoint.rsi) {
            if (latestPoint.rsi >= 70) rsiLeg.style.color = 'var(--color-red)';
            else if (latestPoint.rsi <= 30) rsiLeg.style.color = 'var(--color-green)';
            else rsiLeg.style.color = 'var(--color-rsi)';
        }
        
        ema8Leg.textContent = latestPoint.ema8 ? `$${latestPoint.ema8.toFixed(2)}` : '--';
        ema20Leg.textContent = latestPoint.ema20 ? `$${latestPoint.ema20.toFixed(2)}` : '--';
        ema50Leg.textContent = latestPoint.ema50 ? `$${latestPoint.ema50.toFixed(2)}` : '--';
        ema100Leg.textContent = latestPoint.ema100 ? `$${latestPoint.ema100.toFixed(2)}` : '--';
        ema200Leg.textContent = latestPoint.ema200 ? `$${latestPoint.ema200.toFixed(2)}` : '--';
        
    } catch (error) {
        console.error(`${ticker} grafiği çizilirken hata oluştu:`, error);
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

// Update all charts (using cascading stagger triggers to avoid rate limits)
async function updateAllCharts() {
    updateAllBtn.disabled = true;
    updateAllBtn.innerHTML = '<i class="fa-solid fa-rotate fa-spin"></i> Güncelleniyor...';
    
    await updateUSDTRY();
    
    // Stagger loading with a 150ms delay between each stock request to ensure 100% success and bypass rate limits
    const promises = appState.stocks.map((stock, index) => {
        return new Promise(resolve => {
            setTimeout(async () => {
                await fetchAndDrawChart(stock.ticker);
                resolve();
            }, index * 200); // Cascading waterfall load effect (200ms increments)
        });
    });
    
    await Promise.all(promises);
    
    updateAllBtn.disabled = false;
    updateAllBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Tümünü Güncelle';
}

// ==========================================================================
// ADD STOCK MODAL LOGIC (SERVERLESS CHECK VIA ROTATED PROXIES)
// ==========================================================================
function showModal() {
    modalErrorMsg.style.display = 'none';
    stockTickerInput.value = '';
    stockNameInput.value = '';
    addStockModal.style.display = 'flex';
    stockTickerInput.focus();
}

function hideModal() {
    addStockModal.style.display = 'none';
}

async function handleAddStock() {
    const ticker = stockTickerInput.value.trim().toUpperCase();
    const name = stockNameInput.value.trim();
    
    if (!ticker || !name) {
        showModalError('Sembol ve Şirket Adı alanları zorunludur.');
        return;
    }
    
    if (appState.stocks.some(s => s.ticker === ticker)) {
        showModalError('Bu sembol zaten ekli.');
        return;
    }
    
    setModalLoading(true);
    
    try {
        const testResult = await fetchYahooChart(ticker, '1d', '5d');
        if (!testResult) {
            throw new Error('Sembol doğrulanamadı. (BIST hisseleri sonuna .IS almalıdır. Örn: THYAO.IS)');
        }
        
        appState.stocks.push({ ticker, name });
        localStorage.setItem('hisse_dashboard_stocks', JSON.stringify(appState.stocks));
        totalStocksCount.textContent = appState.stocks.length;
        
        if (appState.stocks.length === 1) {
            stocksGrid.innerHTML = '';
        }
        createStockCard({ ticker, name });
        await fetchAndDrawChart(ticker);
        
        hideModal();
    } catch (e) {
        showModalError(e.message);
    } finally {
        setModalLoading(false);
    }
}

function showModalError(msg) {
    modalErrorMsg.textContent = msg;
    modalErrorMsg.style.display = 'block';
}

function setModalLoading(isLoading) {
    stockTickerInput.disabled = isLoading;
    stockNameInput.disabled = isLoading;
    cancelModalBtn.disabled = isLoading;
    saveStockBtn.disabled = isLoading;
    
    if (isLoading) {
        saveStockBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Ekleniyor...';
    } else {
        saveStockBtn.innerHTML = 'Ekle';
    }
}

// ==========================================================================
// PORTFOLIO BACKUP & RESTORE LOGIC (JSON FILE DOWNLOAD / UPLOAD)
// ==========================================================================
function handleDownloadPortfolio() {
    try {
        const dataStr = JSON.stringify(appState.stocks, null, 4);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'urla_portfoy.json';
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        alert('Portföy indirilirken hata oluştu: ' + err.message);
    }
}

function handleImportPortfolioFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!Array.isArray(parsed)) {
                throw new Error('Geçersiz format: Veri bir dizi (array) olmalıdır.');
            }
            
            // Basic validation
            for (const item of parsed) {
                if (!item.ticker || !item.name) {
                    throw new Error('Geçersiz format: Her hissenin "ticker" ve "name" alanı olmalıdır.');
                }
            }
            
            const confirmImport = confirm('Yeni portföyü içe aktarmak istediğinize emin misiniz? Mevcut hisse listenizin üzerine yazılacaktır.');
            if (!confirmImport) {
                portfolioFileInput.value = '';
                return;
            }
            
            // Save & re-render
            appState.stocks = parsed;
            localStorage.setItem('hisse_dashboard_stocks', JSON.stringify(appState.stocks));
            
            // Update total count
            const totalStocksCount = document.getElementById('total-stocks-count');
            if (totalStocksCount) totalStocksCount.textContent = appState.stocks.length;
            
            stocksGrid.innerHTML = '';
            initDashboardStructure();
            await updateAllCharts();
            
            alert('Portföy başarıyla içe aktarıldı!');
        } catch (err) {
            alert('İçe aktarma hatası: ' + err.message);
        } finally {
            portfolioFileInput.value = ''; // Reset input to allow selecting same file again
        }
    };
    reader.readAsText(file);
}

