// 0.Listen for when the extension is first installed or updated
chrome.runtime.onInstalled.addListener((details) => {
    // Check if the reason for this event is the 'install' of the extension
    if (details.reason === 'install') {
        console.log('Extension successfully installed!');

        // Set default settings in chrome.storage
        chrome.storage.sync.set({
            theme: 'red',
            language: 'en',
            blurLevel: 'strong'
        }).then(() => {
            console.log('Default settings have been saved.');
        });

        // (可选) 可以在这里打开一个欢迎页面
        // chrome.tabs.create({ url: 'welcome.html' });
    }
});