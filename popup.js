document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('btn-start');
    const stopBtn = document.getElementById('btn-stop');
    const urlListArea = document.getElementById('url-list');
    const delayInput = document.getElementById('delay-sec');
    const logsContainer = document.getElementById('logs');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const statusBadge = document.getElementById('status-badge');

    // Load initial state
    chrome.storage.local.get(['isRunning', 'urls', 'currentIndex', 'logs'], (res) => {
        if (res.urls) urlListArea.value = res.urls.join('\n');
        if (res.isRunning) {
            setRunningUI(true);
        }
        if (res.logs) {
            res.logs.forEach(log => appendLog(log.message, log.type));
        }
        updateProgress(res.currentIndex || 0, res.urls ? res.urls.length : 0);
    });

    startBtn.addEventListener('click', () => {
        const urls = urlListArea.value.split('\n').map(u => u.trim()).filter(u => u.length > 0);
        if (urls.length === 0) {
            appendLog('Please enter at least one URL.', 'error');
            return;
        }

        const delay = parseInt(delayInput.value, 10) || 15;
        
        chrome.storage.local.set({ urls, currentIndex: 0, isRunning: true, logs: [] }, () => {
            setRunningUI(true);
            logsContainer.innerHTML = ''; // clear logs
            appendLog('Started indexing process...', 'info');
            chrome.runtime.sendMessage({ type: 'START', delay });
            updateProgress(0, urls.length);
        });
    });

    stopBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'STOP' });
        setRunningUI(false);
        appendLog('Process stopped by user.', 'error');
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'LOG') {
            appendLog(message.message, message.level);
        } else if (message.type === 'PROGRESS') {
            updateProgress(message.currentIndex, message.total);
        } else if (message.type === 'FINISHED') {
            setRunningUI(false);
            appendLog('Finished processing all URLs.', 'success');
        }
    });

    function setRunningUI(isRunning) {
        startBtn.disabled = isRunning;
        stopBtn.disabled = !isRunning;
        urlListArea.disabled = isRunning;
        statusBadge.textContent = isRunning ? 'Running' : 'Idle';
        statusBadge.className = isRunning ? 'status-badge active' : 'status-badge';
    }

    function updateProgress(current, total) {
        progressText.textContent = `${current} / ${total}`;
        const percent = total === 0 ? 0 : Math.round((current / total) * 100);
        progressBar.style.width = `${percent}%`;
    }

    function appendLog(message, type = 'info') {
        const el = document.createElement('div');
        el.className = `log-entry ${type}`;
        el.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logsContainer.appendChild(el);
        logsContainer.scrollTop = logsContainer.scrollHeight;

        // save to storage
        chrome.storage.local.get(['logs'], (res) => {
            const logs = res.logs || [];
            logs.push({ message, type });
            if (logs.length > 50) logs.shift(); // keep last 50
            chrome.storage.local.set({ logs });
        });
    }
});
