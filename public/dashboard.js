// Global state
let tasksData = null;
let walletData = null;
let currentFilters = {
    status: 'all',
    assignee: 'all',
    completedOnly: false,
    reviewPending: false
};
let portfolioChart = null;

// Member emoji mapping
const MEMBER_EMOJIS = {
    'hikarimaru': '👑',
    'clawdia': '🩶',
    'talon': '🦅',
    'velvet': '🌙'
};

// Utility functions
function formatCurrency(amount, currency = 'USD') {
    if (currency === 'USD') {
        return '$' + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else if (currency === 'SOL') {
        return amount.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' SOL';
    } else if (currency === 'WBTC') {
        return amount.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 }) + ' WBTC';
    } else if (currency === 'BNB') {
        return amount.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' BNB';
    }
    return amount.toString();
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
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

// Tab switching functionality
function initTabSystem() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            // Update buttons
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Update content
            tabContents.forEach(content => content.classList.remove('active'));
            document.getElementById(`${targetTab}-tab`).classList.add('active');

            // Load data for specific tabs
            if (targetTab === 'tasks' && !tasksData) {
                loadTasksData();
            }
        });
    });
}

// Data loading functions
async function loadWalletData() {
    try {
        const response = await fetch('./data/wallet.json');
        if (!response.ok) throw new Error('Failed to load wallet data');
        walletData = await response.json();
        updateOverviewTab();
    } catch (error) {
        console.error('Wallet data error:', error);
        showError('total-balance', '残高データの取得に失敗しました');
    }
}

async function loadTasksData() {
    try {
        const response = await fetch('./data/tasks.json');
        if (!response.ok) throw new Error('Failed to load tasks data');
        tasksData = await response.json();
        updateTasksTab();
    } catch (error) {
        console.error('Tasks data error:', error);
        showError('projects-container', 'タスクデータの取得に失敗しました');
    }
}

async function loadTradingHistory() {
    try {
        const response = await fetch('./data/trades.json');
        if (!response.ok) {
            // Fallback to mock data if file doesn't exist
            createMockTrades();
            return;
        }
        const tradesData = await response.json();
        updateTradesTab(tradesData);
    } catch (error) {
        console.error('Trading history error:', error);
        createMockTrades();
    }
}

async function loadDailyReport() {
    try {
        const response = await fetch('./data/daily_reports.json');
        if (!response.ok) {
            document.getElementById('daily-report').innerHTML = '<div class="error">日報データがありません</div>';
            return;
        }
        const reportData = await response.json();
        updateReportsTab(reportData);
    } catch (error) {
        console.error('Daily report error:', error);
        showError('daily-report', '日報の取得に失敗しました');
    }
}

// Overview tab functions
function updateOverviewTab() {
    if (!walletData) return;

    // Update balances
    document.getElementById('sol-balance').textContent = formatCurrency(walletData.sol_balance, 'SOL');
    document.getElementById('usdc-balance').textContent = formatCurrency(walletData.usdc_balance);
    document.getElementById('total-balance').textContent = formatCurrency(walletData.total_usd);
    
    // WBTC balance
    document.getElementById('wbtc-balance').textContent = formatCurrency(walletData.wbtc_balance, 'WBTC');
    
    // BNB balance - hide if zero
    const bnbItem = document.getElementById('bnb-item');
    if (walletData.bnb_balance && walletData.bnb_balance > 0) {
        document.getElementById('bnb-balance').textContent = formatCurrency(walletData.bnb_balance, 'BNB');
        bnbItem.style.display = 'block';
    } else {
        bnbItem.style.display = 'none';
    }

    // BTC price
    document.getElementById('btc-price').textContent = formatCurrency(walletData.btc_price_usd);
    
    // Position status
    const positionElement = document.getElementById('position-status');
    if (walletData.wbtc_balance && walletData.wbtc_balance > 0) {
        positionElement.className = 'position-status in';
        positionElement.querySelector('.value').textContent = `IN (${formatCurrency(walletData.wbtc_balance, 'WBTC')})`;
    } else {
        positionElement.className = 'position-status out';
        positionElement.querySelector('.value').textContent = 'OUT';
    }

    // Mock P&L calculation
    const pnl = walletData.total_usd * 0.05; // 5% gain example
    const pnlElement = document.getElementById('total-pnl');
    pnlElement.textContent = formatCurrency(pnl);
    pnlElement.className = `value ${pnl >= 0 ? 'positive' : 'negative'}`;

    // Update portfolio chart
    updatePortfolioChart();
    
    updateStatus('connected', 'オンライン');
}

function updatePortfolioChart() {
    if (!walletData) return;
    
    const ctx = document.getElementById('portfolioChart').getContext('2d');
    
    if (portfolioChart) {
        portfolioChart.destroy();
    }
    
    const chartData = [];
    const chartLabels = [];
    const chartColors = [];
    
    if (walletData.sol_value_usd > 0) {
        chartData.push(walletData.sol_value_usd);
        chartLabels.push('SOL');
        chartColors.push('#4488ff');
    }
    
    if (walletData.usdc_balance > 0) {
        chartData.push(walletData.usdc_balance);
        chartLabels.push('USDC');
        chartColors.push('#00ff88');
    }
    
    if (walletData.wbtc_value_usd > 0) {
        chartData.push(walletData.wbtc_value_usd);
        chartLabels.push('WBTC');
        chartColors.push('#ffaa00');
    }
    
    if (walletData.bnb_value_usd > 0) {
        chartData.push(walletData.bnb_value_usd);
        chartLabels.push('BNB');
        chartColors.push('#ff4444');
    }
    
    portfolioChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: chartLabels,
            datasets: [{
                data: chartData,
                backgroundColor: chartColors,
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

// Tasks tab functions
function updateTasksTab() {
    if (!tasksData) return;

    updateTasksStatistics();
    renderProjects();
    initTaskFilters();
}

function updateTasksStatistics() {
    const stats = tasksData.statistics;
    
    document.getElementById('total-tasks-count').textContent = stats.total_tasks;
    document.getElementById('completed-tasks-count').textContent = stats.completed_tasks;
    
    // Calculate overall progress
    const progressPercent = (stats.completed_tasks / stats.total_tasks) * 100;
    document.getElementById('overall-progress-fill').style.width = `${progressPercent}%`;
    document.getElementById('overall-progress-text').textContent = `${Math.round(progressPercent)}%`;
    
    // Count pending reviews (hikarimaru assigned + pending status)
    let pendingReviewCount = 0;
    let todayCompletedCount = 0;
    const today = new Date().toISOString().split('T')[0];
    
    function countTasksRecursive(tasks) {
        tasks.forEach(task => {
            if (task.assignee === 'hikarimaru' && task.status === 'pending') {
                pendingReviewCount++;
            }
            if (task.completed_at && task.completed_at.startsWith(today)) {
                todayCompletedCount++;
            }
            if (task.subtasks) {
                countTasksRecursive(task.subtasks);
            }
        });
    }
    
    tasksData.projects.forEach(project => {
        countTasksRecursive(project.tasks);
    });
    
    document.getElementById('pending-review-count').textContent = pendingReviewCount;
    document.getElementById('today-completed-count').textContent = todayCompletedCount;
}

function renderProjects() {
    const container = document.getElementById('projects-container');
    const filteredProjects = tasksData.projects.filter(project => 
        project.tasks.some(task => taskMatchesFilters(task))
    );
    
    container.innerHTML = filteredProjects.map(project => `
        <div class="project-accordion expanded">
            <div class="project-header" onclick="toggleProject(this)">
                <div class="project-title">${project.name}</div>
                <div class="project-progress">
                    <div class="project-progress-bar">
                        <div class="project-progress-fill" style="width: ${getProjectProgress(project)}%"></div>
                    </div>
                    <div class="project-progress-text">
                        ${getProjectCompletedCount(project)}/${getProjectTotalCount(project)}
                    </div>
                </div>
                <div class="project-expand-icon">▼</div>
            </div>
            <div class="project-content">
                <div class="task-list">
                    ${renderTasks(project.tasks)}
                </div>
            </div>
        </div>
    `).join('');
}

function renderTasks(tasks) {
    return tasks.filter(task => taskMatchesFilters(task)).map(task => {
        const isReviewPending = task.assignee === 'hikarimaru' && task.status === 'pending';
        return `
            <div class="task-card ${isReviewPending ? 'review-pending' : ''}" onclick="showTaskDetail('${task.id}')">
                <div class="task-header">
                    <div class="task-status-badge ${task.status}">${getStatusText(task.status)}</div>
                    <div class="task-priority-dot ${task.priority || 'medium'}"></div>
                    <div class="task-title">${task.title}</div>
                    <div class="task-assignee">${MEMBER_EMOJIS[task.assignee] || '❓'}</div>
                    ${task.subtasks && task.subtasks.length > 0 ? '<div class="task-expand-icon">▶</div>' : ''}
                </div>
                ${task.subtasks && task.subtasks.length > 0 ? `
                    <div class="subtasks-container">
                        ${renderSubtasks(task.subtasks, 1)}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function renderSubtasks(subtasks, level) {
    return subtasks.map(subtask => {
        const isReviewPending = subtask.assignee === 'hikarimaru' && subtask.status === 'pending';
        return `
            <div class="subtask-item ${isReviewPending ? 'review-pending' : ''}" style="margin-left: ${level * 20}px;">
                <div class="task-status-badge ${subtask.status}">${getStatusText(subtask.status)}</div>
                <div class="task-title">${subtask.title}</div>
                <div class="task-assignee">${MEMBER_EMOJIS[subtask.assignee] || '❓'}</div>
                ${subtask.subtasks && subtask.subtasks.length > 0 ? 
                    renderSubtasks(subtask.subtasks, level + 1) : ''}
            </div>
        `;
    }).join('');
}

function taskMatchesFilters(task) {
    // Check main task
    if (matchesIndividualFilters(task)) {
        return true;
    }
    
    // Check subtasks recursively
    if (task.subtasks) {
        return task.subtasks.some(subtask => 
            matchesIndividualFilters(subtask) || 
            (subtask.subtasks && taskMatchesFilters(subtask))
        );
    }
    
    return false;
}

function matchesIndividualFilters(task) {
    if (currentFilters.status !== 'all' && task.status !== currentFilters.status) {
        return false;
    }
    
    if (currentFilters.assignee !== 'all' && task.assignee !== currentFilters.assignee) {
        return false;
    }
    
    if (currentFilters.completedOnly && task.status !== 'completed') {
        return false;
    }
    
    if (currentFilters.reviewPending) {
        return task.assignee === 'hikarimaru' && task.status === 'pending';
    }
    
    return true;
}

function getProjectProgress(project) {
    const projectStat = tasksData.statistics.projects.find(p => p.id === project.id);
    return projectStat ? Math.round(projectStat.progress_percentage) : 0;
}

function getProjectCompletedCount(project) {
    const projectStat = tasksData.statistics.projects.find(p => p.id === project.id);
    return projectStat ? projectStat.completed_tasks : 0;
}

function getProjectTotalCount(project) {
    const projectStat = tasksData.statistics.projects.find(p => p.id === project.id);
    return projectStat ? projectStat.total_tasks : 0;
}

function getStatusText(status) {
    const statusMap = {
        'pending': '未着手',
        'in_progress': '進行中',
        'completed': '完了',
        'blocked': 'ブロック'
    };
    return statusMap[status] || status;
}

function initTaskFilters() {
    document.getElementById('status-filter').addEventListener('change', (e) => {
        currentFilters.status = e.target.value;
        currentFilters.reviewPending = false;
        renderProjects();
    });
    
    document.getElementById('assignee-filter').addEventListener('change', (e) => {
        currentFilters.assignee = e.target.value;
        currentFilters.reviewPending = false;
        renderProjects();
    });
    
    document.getElementById('completed-only-toggle').addEventListener('change', (e) => {
        currentFilters.completedOnly = e.target.checked;
        currentFilters.reviewPending = false;
        renderProjects();
    });
    
    document.getElementById('review-pending-filter').addEventListener('click', () => {
        currentFilters.reviewPending = true;
        currentFilters.status = 'all';
        currentFilters.assignee = 'all';
        currentFilters.completedOnly = false;
        
        // Reset form controls
        document.getElementById('status-filter').value = 'all';
        document.getElementById('assignee-filter').value = 'all';
        document.getElementById('completed-only-toggle').checked = false;
        
        renderProjects();
    });
}

function toggleProject(header) {
    const accordion = header.closest('.project-accordion');
    accordion.classList.toggle('expanded');
}

function showTaskDetail(taskId) {
    const task = findTaskById(taskId);
    if (!task) return;
    
    const modal = document.getElementById('task-modal');
    const modalTitle = document.getElementById('modal-task-title');
    const modalBody = document.getElementById('modal-task-body');
    
    modalTitle.textContent = task.title;
    modalBody.innerHTML = generateTaskDetailHTML(task);
    
    modal.classList.add('show');
}

function findTaskById(taskId) {
    for (const project of tasksData.projects) {
        for (const task of project.tasks) {
            if (task.id === taskId) return task;
            if (task.subtasks) {
                const found = findTaskInSubtasks(task.subtasks, taskId);
                if (found) return found;
            }
        }
    }
    return null;
}

function findTaskInSubtasks(subtasks, taskId) {
    for (const subtask of subtasks) {
        if (subtask.id === taskId) return subtask;
        if (subtask.subtasks) {
            const found = findTaskInSubtasks(subtask.subtasks, taskId);
            if (found) return found;
        }
    }
    return null;
}

function generateTaskDetailHTML(task) {
    const estimatedHours = task.estimated_hours || 0;
    const actualHours = task.actual_hours || 0;
    const hoursProgress = estimatedHours > 0 ? Math.min((actualHours / estimatedHours) * 100, 100) : 0;
    
    return `
        <div class="task-detail-section">
            <h4>基本情報</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 14px;">
                <div>ステータス: <span class="task-status-badge ${task.status}">${getStatusText(task.status)}</span></div>
                <div>担当者: ${MEMBER_EMOJIS[task.assignee] || '❓'} ${task.assignee}</div>
                <div>優先度: <span class="task-priority-dot ${task.priority || 'medium'}"></span> ${task.priority || 'medium'}</div>
                <div>見積時間: ${estimatedHours}h</div>
            </div>
        </div>
        
        ${task.description ? `
        <div class="task-detail-section">
            <h4>説明</h4>
            <p style="color: var(--text-secondary); line-height: 1.5;">${task.description}</p>
        </div>
        ` : ''}
        
        <div class="task-detail-section">
            <h4>タイムライン</h4>
            <div class="task-timeline">
                <div class="timeline-item">
                    <div class="timeline-dot completed"></div>
                    <span>作成: ${formatDate(task.created_at)}</span>
                </div>
                <div class="timeline-item">
                    <div class="timeline-dot ${task.started_at ? 'completed' : ''}"></div>
                    <span>開始: ${formatDate(task.started_at)}</span>
                </div>
                <div class="timeline-item">
                    <div class="timeline-dot ${task.completed_at ? 'completed' : ''}"></div>
                    <span>完了: ${formatDate(task.completed_at)}</span>
                </div>
            </div>
        </div>
        
        ${estimatedHours > 0 || actualHours > 0 ? `
        <div class="task-detail-section">
            <h4>工数</h4>
            <div class="task-hours-bar">
                <div class="hours-progress">
                    <div class="hours-progress-fill" style="width: ${hoursProgress}%"></div>
                </div>
                <span style="font-size: 13px; color: var(--text-secondary);">
                    ${actualHours}h / ${estimatedHours}h (${Math.round(hoursProgress)}%)
                </span>
            </div>
        </div>
        ` : ''}
        
        ${task.notes && task.notes.length > 0 ? `
        <div class="task-detail-section">
            <h4>作業ノート</h4>
            <div class="task-notes">
                ${task.notes.map(note => `
                    <div class="note-item">
                        <div class="note-timestamp">${formatDate(note.timestamp)}</div>
                        <div>${note.text}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}
        
        ${task.tags && task.tags.length > 0 ? `
        <div class="task-detail-section">
            <h4>タグ</h4>
            <div class="task-tags">
                ${task.tags.map(tag => `<span class="tag-pill">${tag}</span>`).join('')}
            </div>
        </div>
        ` : ''}
        
        ${task.depends_on && task.depends_on.length > 0 ? `
        <div class="task-detail-section">
            <h4>依存関係</h4>
            <div class="depends-on-list">
                依存先: ${task.depends_on.join(', ')}
            </div>
        </div>
        ` : ''}
        
        ${task.subtasks && task.subtasks.length > 0 ? `
        <div class="task-detail-section">
            <h4>サブタスク (${task.subtasks.length}件)</h4>
            <div style="margin-left: 0;">
                ${renderSubtasks(task.subtasks, 0)}
            </div>
        </div>
        ` : ''}
    `;
}

// Trades tab functions
function createMockTrades() {
    const mockTrades = [
        { symbol: 'WBTC/USDC', side: 'BUY', pnl: 2.45, date: '2026-02-15T10:44:00', price: 69500 },
        { symbol: 'BNB/USDC', side: 'SELL', pnl: -0.87, date: '2026-02-14T16:32:00', price: 630 },
        { symbol: 'SOL/USDC', side: 'BUY', pnl: 5.23, date: '2026-02-14T14:21:00', price: 88 },
        { symbol: 'WBTC/USDC', side: 'SELL', pnl: -1.12, date: '2026-02-14T11:15:00', price: 69200 }
    ];
    
    updateTradesTab({ trades: mockTrades });
}

function updateTradesTab(tradesData) {
    const tradeList = document.getElementById('trade-list');
    const trades = tradesData.trades || [];
    
    if (trades.length === 0) {
        tradeList.innerHTML = '<div class="error">取引データがありません</div>';
        return;
    }
    
    tradeList.innerHTML = trades.slice(0, 10).map(trade => `
        <div class="trade-item">
            <div>
                <div class="trade-symbol">${trade.symbol}</div>
                <div class="trade-side ${trade.side.toLowerCase()}">${trade.side}</div>
            </div>
            <div>
                <div class="trade-pnl ${trade.pnl >= 0 ? 'positive' : 'negative'}">${formatCurrency(trade.pnl)}</div>
                <div style="font-size: 12px; color: var(--text-muted)">${formatDate(trade.date)}</div>
            </div>
        </div>
    `).join('');
    
    // Load backtest results
    loadBacktestResults();
}

function loadBacktestResults() {
    // Mock backtest data
    const mockResults = [
        { strategy: 'CCI(14) + EMA200', return: 15.2, winrate: 68, tests: 450 },
        { strategy: 'RSI Scalping', return: 8.7, winrate: 45, tests: 230 },
        { strategy: 'Bollinger Bands', return: -2.1, winrate: 38, tests: 180 },
        { strategy: 'MACD Signal', return: 12.4, winrate: 52, tests: 320 }
    ];
    
    const backtestGrid = document.getElementById('backtest-grid');
    backtestGrid.innerHTML = mockResults.map(result => `
        <div class="backtest-item">
            <div class="backtest-strategy">${result.strategy}</div>
            <div class="backtest-return ${result.return >= 0 ? 'positive' : 'negative'}">
                ${result.return >= 0 ? '+' : ''}${result.return}%
            </div>
            <div class="backtest-winrate">勝率: ${result.winrate}% (${result.tests}回)</div>
        </div>
    `).join('');
}

// Reports tab functions
function updateReportsTab(reportData) {
    const dailyReport = document.getElementById('daily-report');
    
    if (reportData.reports && reportData.reports.length > 0) {
        const latestReport = reportData.reports[0];
        dailyReport.innerHTML = `
            <div style="margin-bottom: 12px;">
                <strong>${formatDate(latestReport.date)}</strong>
            </div>
            <div style="white-space: pre-wrap; line-height: 1.6;">${latestReport.content}</div>
        `;
    } else {
        dailyReport.innerHTML = '<div class="error">日報データがありません</div>';
    }
}

// System status functions
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

function updateSystemStatus() {
    document.getElementById('bot-status').textContent = '稼働中';
    document.getElementById('bot-status').className = 'value positive';
    document.getElementById('scan-progress').textContent = '73/100';
}

// Modal functions
function initModals() {
    const modal = document.getElementById('task-modal');
    const closeBtn = modal.querySelector('.modal-close');
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
}

// Initialize dashboard
async function initDashboard() {
    updateStatus('connecting', '接続中...');
    
    try {
        initTabSystem();
        initModals();
        
        await Promise.allSettled([
            loadWalletData(),
            loadTradingHistory(),
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
    loadWalletData();
    updateSystemStatus();
}, 5 * 60 * 1000);

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initDashboard);