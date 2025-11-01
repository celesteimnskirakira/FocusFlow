document.addEventListener('DOMContentLoaded', function () {

    const topicInput = document.getElementById('PurposeInput');
    const submitBtn = document.getElementById('submit-btn');
    const confirmBtn = document.getElementById('confirm-btn');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const keywordSection = document.getElementById('keywordSection');
    const keywordBubbles = document.getElementById('keywordBubbles');

    let selectedKeywords = [];
    let allKeywords = [];

    if (topicInput && submitBtn) {
        console.log("The HTML element has been successfully retrieved.");

        // Handle initial Start button click
        submitBtn.addEventListener('click', function (event) {
            event.preventDefault();
            const topic = topicInput.value.trim();

            if (topic) {
                loadingSpinner.style.display = 'block';
                submitBtn.disabled = true;
                console.log('The topic the user wants to learn:', topic);
                topicInput.style.borderColor = '#ccc';

                // Send message to service worker to get keywords
                chrome.runtime.sendMessage({ action: 'getKeywords', topic: topic }, (response) => {
                    loadingSpinner.style.display = 'none';
                    submitBtn.disabled = false;

                    if (response && response.success) {
                        console.log('Keywords received:', response.keywords);
                        displayKeywords(response.keywords);
                    } else {
                        console.error('Failed to get keywords:', response?.error);
                        // Fallback: use original topic as single keyword
                        displayKeywords([topic]);
                    }
                });
            } else {
                console.log('The user did not enter a subject.');
                topicInput.style.borderColor = 'red';
                setTimeout(() => {
                    topicInput.style.borderColor = '#ccc';
                }, 1000);
            }
        });

        // Handle Confirm button click
        if (confirmBtn) {
            confirmBtn.addEventListener('click', function () {
                confirmKeywordSelection();
            });
        }

        // Add Enter key listener for keyword section
        document.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && keywordSection.style.display !== 'none') {
                confirmKeywordSelection();
            }
        });
    } else {
        console.error("Error: The #PurposeInput or #submit-btn element could not be found.");
    }

    // Function to display keyword bubbles
    function displayKeywords(keywords) {
        allKeywords = keywords;
        selectedKeywords = []; // Reset selection
        keywordBubbles.innerHTML = ''; // Clear previous bubbles

        keywords.forEach((keyword, index) => {
            const bubble = document.createElement('div');
            bubble.className = 'keyword-bubble';
            bubble.textContent = keyword;
            bubble.dataset.keyword = keyword;

            bubble.addEventListener('click', function () {
                toggleKeywordSelection(bubble, keyword);
            });

            keywordBubbles.appendChild(bubble);
        });

        // Show keyword section, hide input section
        topicInput.style.display = 'none';
        submitBtn.style.display = 'none';
        keywordSection.style.display = 'block';
    }

    // Toggle keyword selection
    function toggleKeywordSelection(bubble, keyword) {
        if (bubble.classList.contains('selected')) {
            // Deselect
            bubble.classList.remove('selected');
            selectedKeywords = selectedKeywords.filter(k => k !== keyword);
        } else {
            // Select
            bubble.classList.add('selected');
            selectedKeywords.push(keyword);
        }

        console.log('Selected keywords:', selectedKeywords);
    }

    // Confirm keyword selection and open YouTube
    function confirmKeywordSelection() {
        if (selectedKeywords.length === 0) {
            alert('Please select at least one keyword');
            return;
        }

        // Build search query from selected keywords
        const searchQuery = selectedKeywords.join(' ');
        console.log('User confirmed keywords:', selectedKeywords);

        // Send to service worker to open YouTube
        chrome.runtime.sendMessage({
            action: 'openYouTube',
            searchQuery: searchQuery
        }, (response) => {
            console.log('YouTube tab opened:', response.message);
            window.close(); // Close the popup
        });
    }
});