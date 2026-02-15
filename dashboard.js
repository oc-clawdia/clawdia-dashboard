// Configuration
const CONFIG = {
    MATON_API_KEY: 'Z22mQgIRI3XJEBmlW_sknmvU_bu7f9VPYlBQ8jl9fBbxmL1wkbsXqB7-klAfXpA7XjHnRcZMMbsZQvQdaizjh1i7JmA_vE37L2YimutUiA',
    MATON_BASE_URL: 'https://gateway.maton.ai/google-sheets/v4/spreadsheets',
    SOLANA_RPC_URL: 'https://api.mainnet-beta.solana.com',
    WALLET_ADDRESS: 'CdJSUeHX49eFK8hixbfDKNRLTakYcy59MbVEh8pDnn9U',
    USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    TRADING_LOG_SHEET_ID: '1_08wUlbcDSMVdQN_DN6CzCzMYQQhRHhUtxt0N5MRBM4',
    DAILY_REPORT_SHEET_ID: '1Yquzd8icvINBFFLhMbg1YSfo16Yf1_SIasGEx_w0L00'
};

// Global state
let portfolioChart = null;

// Utility functions
function formatCurrency(amount, currency = 'USD') {
    if (currency === 'USD') {
        return '$' + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else if (currency === 'SOL') {
        return amount.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' SOL';
    }
    return amount.toString();
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('ja-JP', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `<div class="error">エラー: ${message}</div>`;
    }
}

// API functions
async function fetchMatonData(sheetId, range) {
    try {
        const url = `${CONFIG.MATON_BASE_URL}/${sheetId}/values/${range}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${CONFIG.MATON_API_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.values || [];
    } catch (error) {
        console.error('Maton API error:', error);
        throw error;
    }
}

async function fetchSolanaBalance() {
    try {
        const response = await fetch(CONFIG.SOLANA_RPC_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getBalance',
                params: [CONFIG.WALLET_ADDRESS]
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        return data.result ? data.result.value / 1000000000 : 0; // Convert lamports to SOL
    } catch (error) {
        console.error('Solana RPC error:', error);
        return 0;
    }
}

async function fetchUSDCBalance() {
    try {
        const response = await fetch(CONFIG.SOLANA_RPC_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenAccountsByOwner',
                params: [
                    CONFIG.WALLET_ADDRESS,
                    { mint: CONFIG.USDC_MINT },
                    { encoding: 'jsonParsed' }
                ]
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        if (data.result && data.result.value.length > 0) {
            const balance = data.result.value[0].account.data.parsed.info.tokenAmount.uiAmount;
            return balance || 0;
        }
        return 0;
    } catch (error) {
        console.error('USDC balance error:', error);
        return 0;
    }
}

// Data loading functions
async function loadPortfolioData() {
    try {
        const [solBalance, usdcBalance] = await Promise.all([
            fetchSolanaBalance(),
            fetchUSDCBalance()
        ]);
        
        // Rough SOL price estimation (in real app, you'd fetch from price API)
        const solPrice = 100; // Placeholder
        const totalBalance = (solBalance * solPrice) + usdcBalance;
        
        document.getElementById('sol-balance').textContent = formatCurrency(solBalance, 'SOL');
        document.getElementById('usdc-balance').textContent = formatCurrency(usdcBalance);
        document.getElementById('total-balance').textContent = formatCurrency(totalBalance);
        
        // Mock P&L calculation
        const pnl = totalBalance * 0.05; // 5% gain example
        document.getElementById('total-pnl').textContent = formatCurrency(pnl);
        document.getElementById('total-pnl').className = `value ${pnl >= 0 ? 'positive' : 'negative'}`;
        
        // Update portfolio chart
        updatePortfolioChart(solBalance * solPrice, usdcBalance);
        
        updateStatus('connected', 'オンライン');
        
    } catch (error) {
        console.error('Portfolio data error:', error);
        showError('total-balance', '残高データの取得に失敗しました');
    }
}

async function loadTradingHistory() {
    try {
        const data = await fetchMatonData(CONFIG.TRADING_LOG_SHEET_ID, 'A1:Z100');
        
        if (data.length < 2) {
            document.getElementById('trade-list').innerHTML = '<div class="error">取引データがありません</div>';
            return;
        }
        
        const headers = data[0];
        const rows = data.slice(1, 11); // Show last 10 trades
        
        const tradeList = document.getElementById('trade-list');
        tradeList.innerHTML = rows.map(row => {
            const symbol = row[0] || 'N/A';
            const side = row[1] || 'N/A';
            const pnl = parseFloat(row[4]) || 0;
            const date = row[2] || '';
            
            return `
                <div class="trade-item">
                    <div>
                        <div class="trade-symbol">${symbol}</div>
                        <div class="trade-side ${side.toLowerCase()}">${side}</div>
                    </div>
                    <div>
                        <div class="trade-pnl ${pnl >= 0 ? 'positive' : 'negative'}">${formatCurrency(pnl)}</div>
                        <div style="font-size: 12px; color: var(--text-muted)">${formatDate(date)}</div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Trading history error:', error);
        showError('trade-list', '取引履歴の取得に失敗しました');
    }
}

async function loadBacktestResults() {
    try {
        // Mock backtest data (in real app, you'd load from bot/data/backtest_results/)
        const mockResults = [
            { strategy: 'RSI Scalping', return: 15.2, winrate: 68 },
            { strategy: 'MA Cross', return: 8.7, winrate: 45 },
            { strategy: 'Bollinger Bands', return: -2.1, winrate: 38 },
            { strategy: 'MACD Signal', return: 12.4, winrate: 52 }
        ];
        
        const backtestGrid = document.getElementById('backtest-grid');
        backtestGrid.innerHTML = mockResults.map(result => `
            <div class="backtest-item">
                <div class="backtest-strategy">${result.strategy}</div>
                <div class="backtest-return ${result.return >= 0 ? 'positive' : 'negative'}">
                    ${result.return >= 0 ? '+' : ''}${result.return}%
                </div>
                <div class="backtest-winrate">勝率: ${result.winrate}%</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Backtest results error:', error);
        showError('backtest-grid', 'バックテスト結果の取得に失敗しました');
    }
}

async function loadDailyReport() {
    try {
        const data = await fetchMatonData(CONFIG.DAILY_REPORT_SHEET_ID, 'A1:Z10');
        
        if (data.length < 2) {
            document.getElementById('daily-report').innerHTML = '<div class="error">日報データがありません</div>';
            return;
        }
        
        // Get the latest report (assuming it's in the second row)
        const latestReport = data[1].join(' ') || '日報データがありません';
        
        document.getElementById('daily-report').innerHTML = `
            <div style="white-space: pre-wrap; line-height: 1.6;">${latestReport}</div>
        `;
        
    } catch (error) {
        console.error('Daily report error:', error);
        showError('daily-report', '日報の取得に失敗しました');
    }
}

// Chart functions
function updatePortfolioChart(solValue, usdcValue) {
    const ctx = document.getElementById('portfolioChart').getContext('2d');
    
    if (portfolioChart) {
        portfolioChart.destroy();
    }
    
    portfolioChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['SOL', 'USDC'],
            datasets: [{
                data: [solValue, usdcValue],
                backgroundColor: [
                    '#4488ff',
                    '#00ff88'
                ],
                borderColor: '#333333',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#cccccc',
                        font: { size: 12 }
                    }
                }
            }
        }
    });
}

// Status functions
function updateStatus(status, text) {
    const indicator = document.querySelector('.status-dot');
    const statusText = document.getElementById('status-text');
    const lastUpdate = document.getElementById('last-update');
    
    indicator.className = status === 'connected' ? 'status-dot connected' : 'status-dot';
    statusText.textContent = text;
    lastUpdate.textContent = new Date().toLocaleTimeString('ja-JP', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

// Mock system status updates
function updateSystemStatus() {
    document.getElementById('bot-status').textContent = '稼働中';
    document.getElementById('bot-status').className = 'value positive';
    document.getElementById('scan-progress').textContent = '73/100';
}

// Initialize dashboard
async function initDashboard() {
    updateStatus('connecting', '接続中...');
    
    try {
        await Promise.allSettled([
            loadPortfolioData(),
            loadTradingHistory(),
            loadBacktestResults(),
            loadDailyReport()
        ]);
        
        updateSystemStatus();
        
    } catch (error) {
        console.error('Dashboard initialization error:', error);
        updateStatus('error', 'エラー');
    }
}

// Auto refresh every 5 minutes
setInterval(() => {
    loadPortfolioData();
    updateSystemStatus();
}, 5 * 60 * 1000);

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initDashboard);