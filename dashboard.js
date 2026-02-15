// Dashboard State
let dashboardData = {
    trades: [],
    signals: [],
    wallet: null,
    tasks: [],
    dailyReports: [],
    filteredTrades: []
};

let signalChart = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🤖 Clawdia Dashboard starting...');
    
    // Set default date range (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    document.getElementById('date-from').value = formatDateForInput(thirtyDaysAgo);
    document.getElementById('date-to').value = formatDateForInput(today);
    
    // Load data and update UI
    await loadAllData();
    
    // Setup event listeners
    setupEventListeners();
    
    console.log('✅ Dashboard initialized');
});

// Data loading functions
async function loadAllData() {
    updateStatusIndicator('loading', 'データ読み込み中...');
    
    try {
        // Load all data sources
        await Promise.all([
            loadWalletData(),
            loadTradesData(),
            loadSignalsData(),
            loadTasksData(),
            loadDailyReportsData()
        ]);
        
        // Update UI with loaded data
        updatePortfolioSection();
        updateTasksSection();
        updateDailyReportsSection();
        updatePnLSummary();
        applyFilters();
        updateSignalStatus();
        setupSignalChart();
        
        updateStatusIndicator('online', '接続中');
        
    } catch (error) {
        console.error('Data loading error:', error);
        updateStatusIndicator('offline', 'データ読み込みエラー');
        showError('trade-table-body', 'データの読み込みに失敗しました');
    }
}

async function loadWalletData() {
    try {
        const response = await fetch('./data/wallet.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        dashboardData.wallet = await response.json();
        console.log('✅ Wallet data loaded:', dashboardData.wallet);
    } catch (error) {
        console.error('Failed to load wallet data:', error);
        dashboardData.wallet = null;
    }
}

async function loadTradesData() {
    try {
        const response = await fetch('./data/trades.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        dashboardData.trades = await response.json();
        console.log(`✅ ${dashboardData.trades.length} trades loaded`);
        
        // Populate token filter dropdown
        populateTokenFilter();
        
    } catch (error) {
        console.error('Failed to load trades data:', error);
        dashboardData.trades = [];
    }
}

async function loadSignalsData() {
    try {
        const response = await fetch('./data/signals.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        dashboardData.signals = await response.json();
        console.log(`✅ ${dashboardData.signals.length} signals loaded`);
    } catch (error) {
        console.error('Failed to load signals data:', error);
        dashboardData.signals = [];
    }
}

async function loadTasksData() {
    try {
        const response = await fetch('./data/tasks.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        dashboardData.tasks = await response.json();
        console.log(`✅ ${dashboardData.tasks.length} tasks loaded`);
    } catch (error) {
        console.error('Failed to load tasks data:', error);
        dashboardData.tasks = [];
    }
}

async function loadDailyReportsData() {
    try {
        const response = await fetch('./data/daily_reports.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        dashboardData.dailyReports = await response.json();
        console.log(`✅ ${dashboardData.dailyReports.length} daily reports loaded`);
    } catch (error) {
        console.error('Failed to load daily reports data:', error);
        dashboardData.dailyReports = [];
    }
}

// UI Update functions
function updatePortfolioSection() {
    if (!dashboardData.wallet) return;
    
    const wallet = dashboardData.wallet;
    
    document.getElementById('total-balance').textContent = formatCurrency(wallet.total_usd || 0);
    document.getElementById('sol-balance').textContent = `${(wallet.sol_balance || 0).toFixed(4)} SOL`;
    document.getElementById('usdc-balance').textContent = formatCurrency(wallet.usdc_balance || 0);
    document.getElementById('wbtc-balance').textContent = `${(wallet.wbtc_balance || 0).toFixed(8)} WBTC ($${(wallet.wbtc_value_usd || 0).toFixed(2)})`;
    // Hide BNB balance if 0
    const bnbBalanceElement = document.getElementById('bnb-balance');
    const bnbBalance = wallet.bnb_balance || 0;
    if (bnbBalance > 0) {
        bnbBalanceElement.textContent = `${bnbBalance.toFixed(6)} BNB ($${(wallet.bnb_value_usd || 0).toFixed(2)})`;
        bnbBalanceElement.parentElement.style.display = 'block';
    } else {
        bnbBalanceElement.parentElement.style.display = 'none';
    }
    document.getElementById('sol-price').textContent = formatCurrency(wallet.sol_price_usd || 0);
    
    if (wallet.timestamp) {
        document.getElementById('last-updated').textContent = 
            `最終更新: ${formatDateTime(wallet.timestamp)}`;
    }
}

function updatePnLSummary() {
    const trades = dashboardData.filteredTrades.length > 0 ? dashboardData.filteredTrades : dashboardData.trades;
    const totalTrades = trades.length;
    const successfulTrades = trades.filter(t => t.status === 'Success').length;
    const successRate = totalTrades > 0 ? (successfulTrades / totalTrades * 100).toFixed(1) : '0';
    const totalFees = trades.reduce((sum, t) => sum + (parseFloat(t.fee_sol) || 0), 0);
    
    document.getElementById('total-trades').textContent = totalTrades.toLocaleString();
    document.getElementById('successful-trades').textContent = successfulTrades.toLocaleString();
    document.getElementById('success-rate').textContent = `${successRate}%`;
    document.getElementById('total-fees').textContent = `${totalFees.toFixed(4)} SOL`;
}

function updateTradeTable() {
    const tbody = document.getElementById('trade-table-body');
    const trades = dashboardData.filteredTrades.length > 0 ? dashboardData.filteredTrades : dashboardData.trades;
    
    if (trades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">トレードデータがありません</td></tr>';
        return;
    }
    
    // Sort by timestamp (newest first)
    const sortedTrades = [...trades].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    tbody.innerHTML = sortedTrades.map(trade => {
        const pair = `${trade.input_token || 'SOL'} → ${trade.output_token || 'USDC'}`;
        const amount = trade.input_amount ? `${parseFloat(trade.input_amount).toFixed(4)}` : '-';
        
        // Calculate P&L if possible
        let pnlInfo = '';
        if (dashboardData.wallet && trade.output_token === 'WBTC' && trade.output_amount) {
            const currentWBTCValue = parseFloat(trade.output_amount) * dashboardData.wallet.btc_price_usd;
            const originalUSDCValue = parseFloat(trade.input_amount) || 0;
            const pnl = currentWBTCValue - originalUSDCValue;
            const pnlPercent = originalUSDCValue > 0 ? ((pnl / originalUSDCValue) * 100).toFixed(2) : 0;
            const pnlClass = pnl >= 0 ? 'positive' : 'negative';
            pnlInfo = `<br><small class="pnl ${pnlClass}">P&L: ${formatCurrency(pnl)} (${pnlPercent}%)</small>`;
        }
        
        return `
            <tr>
                <td>${formatDateTime(trade.timestamp)}</td>
                <td><span class="token-pair">${pair}</span></td>
                <td><span class="trade-type">${trade.swap_type || 'swap'}</span></td>
                <td>${amount}${pnlInfo}</td>
                <td><span class="trade-status ${trade.status || 'unknown'}">${getTradeStatusText(trade.status)}</span></td>
            </tr>
        `;
    }).join('');
}

function updateSignalStatus() {
    const container = document.getElementById('signal-status');
    
    if (dashboardData.signals.length === 0) {
        container.innerHTML = '<div class="loading">シグナルデータがありません</div>';
        return;
    }
    
    // Get latest signal
    const latestSignal = dashboardData.signals
        .sort((a, b) => new Date(b.checked_at) - new Date(a.checked_at))[0];
    
    if (!latestSignal) {
        container.innerHTML = '<div class="loading">最新のシグナルがありません</div>';
        return;
    }
    
    // Use wallet BTC price instead of signal btc_price (which might be incorrect)
    const btcPrice = dashboardData.wallet ? dashboardData.wallet.btc_price_usd : (latestSignal.btc_price || 0);
    
    // Check if in position based on WBTC balance
    const inPosition = dashboardData.wallet && dashboardData.wallet.wbtc_balance > 0;
    
    container.innerHTML = `
        <div class="signal-item">
            <span class="signal-label">BTC価格</span>
            <span class="signal-value">${formatCurrency(btcPrice)}</span>
        </div>
        <div class="signal-item">
            <span class="signal-label">CCI値</span>
            <span class="signal-value ${getCciClass(latestSignal.cci)}">${(latestSignal.cci || 0).toFixed(2)}</span>
        </div>
        <div class="signal-item">
            <span class="signal-label">ポジション</span>
            <span class="signal-value ${inPosition ? 'positive' : 'neutral'}">${inPosition ? 'IN' : 'OUT'}</span>
        </div>
        <div class="signal-item">
            <span class="signal-label">最新アクション</span>
            <span class="signal-value">${latestSignal.action || '-'}</span>
        </div>
        <div class="signal-item">
            <span class="signal-label">最終確認</span>
            <span class="signal-value">${formatDateTime(latestSignal.checked_at)}</span>
        </div>
    `;
}

function updateTasksSection() {
    const container = document.getElementById('tasks-container');
    
    if (dashboardData.tasks.length === 0) {
        container.innerHTML = '<div class="loading">タスクデータがありません</div>';
        return;
    }
    
    // Group by assignee
    const tasksByAssignee = dashboardData.tasks.reduce((groups, task) => {
        const assignee = task.assignee || 'unknown';
        if (!groups[assignee]) groups[assignee] = [];
        groups[assignee].push(task);
        return groups;
    }, {});
    
    // Calculate overall progress
    const completedTasks = dashboardData.tasks.filter(t => t.status === 'completed').length;
    const totalTasks = dashboardData.tasks.length;
    const progressPercent = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : 0;
    
    let html = `
        <div class="progress-overview">
            <div class="progress-bar-container">
                <div class="progress-bar" style="width: ${progressPercent}%"></div>
                <span class="progress-text">${completedTasks}/${totalTasks} 完了 (${progressPercent}%)</span>
            </div>
        </div>
    `;
    
    // Assignee emojis
    const assigneeEmojis = {
        'clawdia': '🩶',
        'talon': '🦅', 
        'velvet': '🌙'
    };
    
    Object.keys(tasksByAssignee).forEach(assignee => {
        const emoji = assigneeEmojis[assignee] || '👤';
        const tasks = tasksByAssignee[assignee];
        
        html += `
            <div class="assignee-group">
                <h4 class="assignee-title">${assignee.charAt(0).toUpperCase() + assignee.slice(1)} ${emoji}</h4>
                <div class="tasks-grid">
        `;
        
        tasks.forEach(task => {
            const statusClass = getStatusClass(task.status);
            const priorityClass = getPriorityClass(task.priority);
            const estimatedHours = task.estimated_hours ? `見積: ${task.estimated_hours}h` : '見積: -';
            const actualHours = task.actual_hours ? `実績: ${task.actual_hours}h` : '';
            
            html += `
                <div class="task-card">
                    <div class="task-header">
                        <h5 class="task-title">${task.title}</h5>
                        <div class="task-badges">
                            <span class="status-badge ${statusClass}">${getStatusText(task.status)}</span>
                            <span class="priority-badge ${priorityClass}">${task.priority}</span>
                        </div>
                    </div>
                    <p class="task-description">${task.description || ''}</p>
                    <div class="task-meta">
                        <small class="task-hours">${estimatedHours} ${actualHours}</small>
                        <small class="task-date">${formatDate(task.created_at)}</small>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function updateDailyReportsSection() {
    const container = document.getElementById('daily-reports-container');
    
    if (dashboardData.dailyReports.length === 0) {
        container.innerHTML = '<div class="loading">日報データがありません</div>';
        return;
    }
    
    // Sort by date (newest first)
    const sortedReports = [...dashboardData.dailyReports].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    let html = '';
    sortedReports.forEach((report, index) => {
        const isExpanded = index === 0; // Latest report is expanded by default
        
        html += `
            <div class="report-accordion">
                <div class="report-header" onclick="toggleReport('report-${index}')">
                    <h4>${formatDate(report.date)}</h4>
                    <span class="expand-icon ${isExpanded ? 'expanded' : ''}">${isExpanded ? '−' : '+'}</span>
                </div>
                <div class="report-content ${isExpanded ? 'expanded' : ''}" id="report-${index}">
                    ${markdownToHtml(report.content)}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function setupSignalChart() {
    if (!dashboardData.signals.length) return;
    
    const ctx = document.getElementById('signalChart').getContext('2d');
    
    // Get data for the last 7 days by default
    const chartData = getSignalChartData(7);
    
    if (signalChart) {
        signalChart.destroy();
    }
    
    signalChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [
                {
                    label: 'CCI',
                    data: chartData.cci,
                    borderColor: '#4488ff',
                    backgroundColor: 'rgba(68, 136, 255, 0.1)',
                    tension: 0.1,
                    yAxisID: 'y'
                },
                {
                    label: 'BTC Price',
                    data: chartData.btc,
                    borderColor: '#ffaa00',
                    backgroundColor: 'rgba(255, 170, 0, 0.1)',
                    tension: 0.1,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#cccccc'
                    }
                }
            },
            scales: {
                x: {
                    ticks: { 
                        color: '#888888',
                        maxTicksLimit: 10,
                        maxRotation: 45
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    ticks: { color: '#4488ff' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    ticks: { color: '#ffaa00' },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

// Event handlers
function setupEventListeners() {
    // Filter buttons
    document.getElementById('apply-filter').addEventListener('click', applyFilters);
    document.getElementById('reset-filter').addEventListener('click', resetFilters);
    document.getElementById('export-csv').addEventListener('click', exportToCSV);
    
    // Chart period buttons
    document.getElementById('chart-1d').addEventListener('click', () => updateSignalChart(1));
    document.getElementById('chart-7d').addEventListener('click', () => updateSignalChart(7));
    document.getElementById('chart-30d').addEventListener('click', () => updateSignalChart(30));
}

function applyFilters() {
    const dateFrom = document.getElementById('date-from').value;
    const dateTo = document.getElementById('date-to').value;
    const tokenFilter = document.getElementById('token-filter').value;
    const statusFilter = document.getElementById('status-filter').value;
    
    let filtered = [...dashboardData.trades];
    
    // Date filter
    if (dateFrom) {
        filtered = filtered.filter(trade => new Date(trade.timestamp) >= new Date(dateFrom));
    }
    if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999); // End of day
        filtered = filtered.filter(trade => new Date(trade.timestamp) <= toDate);
    }
    
    // Token filter
    if (tokenFilter) {
        filtered = filtered.filter(trade => 
            trade.input_token === tokenFilter || trade.output_token === tokenFilter
        );
    }
    
    // Status filter
    if (statusFilter) {
        filtered = filtered.filter(trade => trade.status === statusFilter);
    }
    
    dashboardData.filteredTrades = filtered;
    updateTradeTable();
    updatePnLSummary();
    
    console.log(`Filtered ${filtered.length} trades from ${dashboardData.trades.length} total`);
}

function resetFilters() {
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    document.getElementById('token-filter').value = '';
    document.getElementById('status-filter').value = '';
    
    dashboardData.filteredTrades = [];
    updateTradeTable();
    updatePnLSummary();
}

function exportToCSV() {
    const trades = dashboardData.filteredTrades.length > 0 ? dashboardData.filteredTrades : dashboardData.trades;
    
    if (trades.length === 0) {
        alert('エクスポートするデータがありません');
        return;
    }
    
    const headers = ['日時', 'シグネチャ', 'ステータス', 'インプットトークン', 'アウトプットトークン', 'インプット量', 'アウトプット量', '手数料(SOL)', 'スワップタイプ', 'エラー'];
    
    const csvContent = [
        headers.join(','),
        ...trades.map(trade => [
            `"${formatDateTime(trade.timestamp)}"`,
            `"${trade.signature || ''}"`,
            `"${trade.status || ''}"`,
            `"${trade.input_token || ''}"`,
            `"${trade.output_token || ''}"`,
            trade.input_amount || 0,
            trade.output_amount || 0,
            trade.fee_sol || 0,
            `"${trade.swap_type || ''}"`,
            `"${trade.error || ''}"`
        ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `clawdia_trades_${formatDateForFilename(new Date())}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

function updateSignalChart(days) {
    if (!signalChart) return;
    
    // Update active button
    document.querySelectorAll('.chart-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`chart-${days}d`).classList.add('active');
    
    const chartData = getSignalChartData(days);
    signalChart.data.labels = chartData.labels;
    signalChart.data.datasets[0].data = chartData.cci;
    signalChart.data.datasets[1].data = chartData.btc;
    signalChart.update();
}

// New utility functions for tasks and reports
function getStatusClass(status) {
    const statusMap = {
        'pending': 'status-pending',
        'in_progress': 'status-in-progress', 
        'completed': 'status-completed',
        'blocked': 'status-blocked'
    };
    return statusMap[status] || 'status-unknown';
}

function getPriorityClass(priority) {
    const priorityMap = {
        'high': 'priority-high',
        'medium': 'priority-medium',
        'low': 'priority-low'
    };
    return priorityMap[priority] || 'priority-unknown';
}

function getStatusText(status) {
    const statusMap = {
        'pending': '保留',
        'in_progress': '進行中',
        'completed': '完了',
        'blocked': '待機'
    };
    return statusMap[status] || status || '不明';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    
    return date.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function markdownToHtml(markdown) {
    if (!markdown) return '';
    
    return markdown
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Lists
        .replace(/^\- (.*$)/gim, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
        // Line breaks
        .replace(/\n/g, '<br>');
}

function toggleReport(reportId) {
    const content = document.getElementById(reportId);
    const icon = content.previousElementSibling.querySelector('.expand-icon');
    
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        icon.classList.remove('expanded');
        icon.textContent = '+';
    } else {
        content.classList.add('expanded');
        icon.classList.add('expanded');
        icon.textContent = '−';
    }
}

// Utility functions
function getSignalChartData(days) {
    const cutoff = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
    const filtered = dashboardData.signals
        .filter(signal => new Date(signal.checked_at) >= cutoff)
        .sort((a, b) => new Date(a.checked_at) - new Date(b.checked_at));
    
    return {
        labels: filtered.map(s => formatTimeForChart(s.checked_at)),
        cci: filtered.map(s => s.cci || 0),
        btc: filtered.map(s => s.btc_price || 0)
    };
}

function populateTokenFilter() {
    const tokenSet = new Set();
    dashboardData.trades.forEach(trade => {
        if (trade.input_token) tokenSet.add(trade.input_token);
        if (trade.output_token) tokenSet.add(trade.output_token);
    });
    
    const select = document.getElementById('token-filter');
    const currentValue = select.value;
    
    // Clear existing options except "All"
    select.innerHTML = '<option value="">全て</option>';
    
    // Add token options
    Array.from(tokenSet).sort().forEach(token => {
        const option = document.createElement('option');
        option.value = token;
        option.textContent = token;
        select.appendChild(option);
    });
    
    // Restore selection
    select.value = currentValue;
}

function updateStatusIndicator(status, text) {
    const indicator = document.querySelector('.status-dot');
    const textElement = document.getElementById('status-text');
    
    indicator.className = `status-dot ${status}`;
    textElement.textContent = text;
}

function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `<tr><td colspan="5" class="error">${message}</td></tr>`;
    }
}

// Formatting functions
function formatCurrency(amount, currency = 'USD') {
    if (typeof amount !== 'number') return '$0.00';
    
    if (currency === 'USD') {
        return '$' + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return amount.toFixed(2);
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    
    return date.toLocaleDateString('ja-JP', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTimeForChart(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    
    return date.toLocaleDateString('ja-JP', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit'
    });
}

function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

function formatDateForFilename(date) {
    return date.toISOString().split('T')[0].replace(/-/g, '');
}

function getStatusText(status) {
    const statusMap = {
        'success': '成功',
        'failed': '失敗',
        'error': 'エラー',
        'pending': '処理中'
    };
    return statusMap[status] || status || '不明';
}

function getTradeStatusText(status) {
    const statusMap = {
        'Success': '成功',
        'Failed': '失敗',
        'Error': 'エラー',
        'Pending': '処理中'
    };
    return statusMap[status] || status || '不明';
}

function getCciClass(cci) {
    if (cci > 100) return 'positive';
    if (cci < -100) return 'negative';
    return 'neutral';
}