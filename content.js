chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PROCESS_URL') {
        processUrl(message.url);
        sendResponse({ started: true });
    }
});

function logInfo(message, level = 'info') {
    chrome.runtime.sendMessage({ type: 'CONTENT_LOG', message, level });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function processUrl(url) {
    try {
        logInfo(`[Content] Starting automation for ${url}`);

        // 1. Find the search bar
        // First try finding by aria-label
        const inputs = Array.from(document.querySelectorAll('input'));
        let searchInput = inputs.find(i => {
            const aria = i.getAttribute('aria-label');
            return aria && aria.toLowerCase().includes('inspect any url');
        });

        // Fallback to role="combobox" or common class
        if (!searchInput) {
            searchInput = document.querySelector('input[role="combobox"], input[jsname="YPqjbf"]');
        }

        if (!searchInput) {
            throw new Error("Could not find the URL inspection search bar.");
        }

        searchInput.focus();
        searchInput.value = url;
        
        // Dispatch events to trigger JS frameworks
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));

        // Dispatch Enter key
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true
        });
        searchInput.dispatchEvent(enterEvent);

        logInfo('[Content] Submitted URL. Waiting for results to load...');

        // 2. Wait for results & REQUEST INDEXING button
        let requestBtn = null;
        for (let i = 0; i < 45; i++) { // wait up to 45 seconds
            await sleep(1000);
            
            // Check for error dialogs first
            const errorText = document.body.innerText || "";
            if (errorText.includes('URL is not in property') || errorText.includes('Something went wrong')) {
                logInfo('[Content] Found an error on the page (URL not in property?). Skipping.', 'error');
                
                // Try to dismiss error
                const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
                const closeBtn = buttons.find(b => b.innerText && (b.innerText.includes('DISMISS') || b.innerText.includes('CLOSE') || b.innerText.includes('OK')));
                if (closeBtn) closeBtn.click();
                
                chrome.runtime.sendMessage({ type: 'NEXT' });
                return;
            }

            // Look for the Request Indexing button
            const elements = Array.from(document.querySelectorAll('div[role="button"], span[role="button"]'));
            requestBtn = elements.find(el => el.innerText && el.innerText.trim() === 'REQUEST INDEXING');
            
            if (requestBtn) {
                // check if disabled
                const isDisabled = requestBtn.disabled || requestBtn.getAttribute('aria-disabled') === 'true';
                if (!isDisabled) {
                    break; // Found and enabled!
                }
            }
        }

        if (!requestBtn) {
            throw new Error("Timeout waiting for 'REQUEST INDEXING' button. It might already be requested or page took too long.");
        }

        logInfo('[Content] Clicking REQUEST INDEXING...');
        requestBtn.click();

        // 3. Wait for "Indexing requested" success message
        logInfo('[Content] Waiting for indexing to complete (this can take 1-2 minutes)...');

        let successDialog = false;
        for (let i = 0; i < 180; i++) { // wait up to 180 seconds
            await sleep(1000);
            
            const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
            const dialogText = dialogs.map(d => d.innerText || "").join(" ");
            
            if (dialogText.includes('Indexing requested')) {
                successDialog = true;
                logInfo('[Content] Success dialog found!', 'success');
                
                // Click the GOT IT button to close it
                const allButtons = Array.from(document.querySelectorAll('div[role="button"]'));
                const gotItBtn = allButtons.find(b => b.innerText && b.innerText.includes('GOT IT'));
                if (gotItBtn) {
                    gotItBtn.click();
                }
                break;
            }
            
            // Check for Captchas or Quota errors in dialogs
            if (dialogText.toLowerCase().includes('captcha')) {
                throw new Error("CAPTCHA detected. Please solve it manually and restart.");
            }
            if (dialogText.includes('Quota exceeded')) {
                throw new Error("Quota exceeded for today.");
            }
            if (dialogText.includes('Something went wrong')) {
                throw new Error("Google reported 'Something went wrong' during request.");
            }
        }

        if (!successDialog) {
             throw new Error("Timeout waiting for 'Indexing requested' success dialog.");
        }

        chrome.runtime.sendMessage({ type: 'NEXT' });

    } catch (e) {
        logInfo(`[Content] Error: ${e.message}`, 'error');
        // Proceed to next after error so queue continues
        chrome.runtime.sendMessage({ type: 'NEXT' });
    }
}
