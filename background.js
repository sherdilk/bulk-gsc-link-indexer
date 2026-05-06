chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START') {
        chrome.storage.local.set({ isRunning: true, currentDelay: message.delay }, () => {
            processNext();
        });
    } else if (message.type === 'STOP') {
        chrome.storage.local.set({ isRunning: false });
    } else if (message.type === 'NEXT') {
        chrome.storage.local.get(['isRunning', 'currentIndex', 'urls', 'currentDelay'], (res) => {
            if (res.isRunning) {
                let nextIndex = (res.currentIndex || 0) + 1;
                chrome.storage.local.set({ currentIndex: nextIndex }, () => {
                    chrome.runtime.sendMessage({ type: 'PROGRESS', currentIndex: nextIndex, total: res.urls.length });
                    
                    if (nextIndex < res.urls.length) {
                        sendLog(`Waiting ${res.currentDelay || 15} seconds before next URL...`, 'info');
                        setTimeout(processNext, (res.currentDelay || 15) * 1000);
                    } else {
                        finishProcess();
                    }
                });
            }
        });
    } else if (message.type === 'CONTENT_LOG') {
        sendLog(message.message, message.level);
    }
});

async function processNext() {
    chrome.storage.local.get(['isRunning', 'urls', 'currentIndex'], async (res) => {
        if (!res.isRunning) return;

        const urls = res.urls || [];
        const index = res.currentIndex || 0;

        if (index >= urls.length) {
            finishProcess();
            return;
        }

        const url = urls[index];
        sendLog(`Processing: ${url}`, 'info');

        const tabs = await chrome.tabs.query({ url: "*://search.google.com/*" });
        if (tabs.length === 0) {
            sendLog('No Google Search Console tab found. Please open one.', 'error');
            chrome.storage.local.set({ isRunning: false });
            chrome.runtime.sendMessage({ type: 'FINISHED' }); // Stop UI
            return;
        }

        const tab = tabs[0];
        // Focus the tab
        chrome.tabs.update(tab.id, { active: true });

        // Send message to content script
        chrome.tabs.sendMessage(tab.id, { type: 'PROCESS_URL', url }, async (response) => {
            if (chrome.runtime.lastError) {
                 sendLog('Content script not detected. Injecting it now...', 'info');
                 try {
                     await chrome.scripting.executeScript({
                         target: { tabId: tab.id },
                         files: ['content.js']
                     });
                     
                     setTimeout(() => {
                         chrome.tabs.sendMessage(tab.id, { type: 'PROCESS_URL', url }, (res) => {
                             if (chrome.runtime.lastError) {
                                 sendLog('Communication failed. Please manually refresh the GSC tab.', 'error');
                                 chrome.storage.local.set({ isRunning: false });
                                 chrome.runtime.sendMessage({ type: 'FINISHED' });
                             }
                         });
                     }, 500);
                 } catch (err) {
                     sendLog('Failed to inject script into GSC tab.', 'error');
                     chrome.storage.local.set({ isRunning: false });
                     chrome.runtime.sendMessage({ type: 'FINISHED' });
                 }
            }
        });
    });
}

function finishProcess() {
    chrome.storage.local.set({ isRunning: false });
    chrome.runtime.sendMessage({ type: 'FINISHED' });
}

function sendLog(message, level) {
    chrome.runtime.sendMessage({ type: 'LOG', message, level });
}
