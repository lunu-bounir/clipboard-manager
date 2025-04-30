document.addEventListener('copy', async () => {
  try {
    const body = await navigator.clipboard.readText();
    chrome.runtime.sendMessage({
      method: 'write',
      body
    });
  }
  catch (e) {
    console.log('[Clipboard History Manager]', e);
  }
});
