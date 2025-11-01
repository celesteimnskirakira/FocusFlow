// content-script.js

console.log("FocusFlow content script loaded and running on YouTube!");

// Track processed videos to avoid duplicate requests
const processedVideos = new Set();
// Store full transcripts for each video
const videoTranscripts = new Map();
// Store summaries for each video
const videoSummaries = new Map();

// ===== CONSOLIDATED MESSAGE LISTENER =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle prerequisite knowledge from service worker
    if (message.type === 'prerequisiteKnowledge') {
        injectPrerequisiteCard(message.videoId, message.knowledge);
        sendResponse({ received: true });
        return true;
    }

    // Handle full transcript storage
    if (message.type === 'fullTranscript') {
        videoTranscripts.set(message.videoId, message.transcript);
        console.log(`Stored transcript for video ${message.videoId}`);
        sendResponse({ received: true });
        return true;
    }

    // Handle question answer display
    if (message.type === 'questionAnswer') {
        displayQuestionAnswer(message.videoId, message.answer);
        sendResponse({ received: true });
        return true;
    }

    if (message.type === 'videoSummary') {
        console.log(`Received summary for ${message.videoId}`);
        videoSummaries.set(message.videoId, message.summary);
        displayVideoSummary(message.videoId, message.summary);
        sendResponse({ received: true });
        return true;
    }

    // ===== NEW: Fetch transcript directly from page =====
    if (message.type === 'fetchTranscriptInPage') {
        console.log(`📥 Content script received request for video: ${message.videoId}`);
        fetchTranscriptFromPage(message.videoId)
            .then(transcript => {
                console.log(`✅ Sending ${transcript.length} segments back to service worker`);
                // Send transcript back to service worker
                chrome.runtime.sendMessage({
                    type: 'transcriptData',
                    videoId: message.videoId,
                    transcript: transcript
                });
                sendResponse({ success: true });
            })
            .catch(error => {
                console.error('❌ Error fetching transcript in page:', error);
                chrome.runtime.sendMessage({
                    type: 'transcriptData',
                    videoId: message.videoId,
                    transcript: []
                });
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep channel open for async response
    }

    // Handle full transcript request for questions
    if (message.type === 'fetchFullTranscriptInPage') {
        console.log(`📥 Fetching full transcript for questions: ${message.videoId}`);
        fetchTranscriptFromPage(message.videoId)
            .then(transcript => {
                const fullText = transcript.map(t => t.text).join(' ');
                chrome.runtime.sendMessage({
                    type: 'fullTranscript',
                    videoId: message.videoId,
                    transcript: fullText
                });
                sendResponse({ success: true });
            })
            .catch(error => {
                console.error('❌ Error:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep channel open for async response
    }
});

// ===== FETCH TRANSCRIPT FROM PAGE (UPDATED - Use Python Server) =====
async function fetchTranscriptFromPage(videoId) {
    try {
        console.log(`🔍 [CONTENT] Fetching transcript for: ${videoId}`);
        console.log(`🐍 [CONTENT] Using Python API server...`);

        // Call local Python server - 使用 127.0.0.1 而不是 localhost
        const response = await fetch(`http://127.0.0.1:5000/transcript/${videoId}`);

        console.log(`📥 [CONTENT] Python server response status: ${response.status}`);

        if (!response.ok) {
            throw new Error(`Python server error: ${response.status}`);
        }

        const data = await response.json();
        console.log(`✅ [CONTENT] Received data from Python server:`, data);

        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch transcript');
        }

        const transcript = data.transcript;
        console.log(`✅ [CONTENT] Got ${transcript.length} segments`);
        console.log(`📝 [CONTENT] Language: ${data.language}, Generated: ${data.isGenerated}`);

        // Show first few segments
        console.log(`📝 [CONTENT] First 3 segments:`, transcript.slice(0, 3));

        return transcript;

    } catch (error) {
        console.error('❌ [CONTENT] Error fetching from Python server:', error);

        // Check if it's a connection error
        if (error.message.includes('Failed to fetch')) {
            console.error('⚠️ [CONTENT] Cannot connect to Python server!');
            console.error('⚠️ [CONTENT] Make sure the server is running on http://127.0.0.1:5000');
            throw new Error('Python server not running. Please start transcript_server.py');
        }

        throw error;
    }
}
// === 新增: 获取视频时长的辅助函数 ===
function getVideoDuration(videoElement) {
    // 方法1: 从视频元素的时间标签获取
    const timeStatus = videoElement.querySelector('#time-status .badge-shape-wiz__text, ytd-thumbnail-overlay-time-status-renderer span');
    if (timeStatus) {
        const timeText = timeStatus.textContent.trim();
        return parseDurationToSeconds(timeText);
    }

    // 方法2: 从缩略图overlay获取
    const durationOverlay = videoElement.querySelector('ytd-thumbnail-overlay-time-status-renderer #text');
    if (durationOverlay) {
        const timeText = durationOverlay.textContent.trim();
        return parseDurationToSeconds(timeText);
    }

    // 默认返回10分钟 (如果无法获取)
    return 600;
}

// 将时间字符串 "12:34" 转换为秒数
function parseDurationToSeconds(timeString) {
    const parts = timeString.split(':').map(Number);
    if (parts.length === 2) {
        // MM:SS 格式
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
        // HH:MM:SS 格式
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 600; // 默认10分钟
}

// 计算预估处理时间 (秒)
function estimateSummaryTime(durationSeconds) {
    // 估算公式:
    // - 每分钟视频需要约 3-5 秒处理时间
    // - 最少 5 秒,最多 30 秒
    const minutes = durationSeconds / 60;
    const estimatedSeconds = Math.ceil(minutes * 5); // 每分钟5秒
    return Math.max(5, estimatedSeconds); // 限制在 5-30 秒之间
}

// 格式化显示时间
// 格式化显示时间 - 超过60秒显示分钟
function formatEstimatedTime(seconds) {
    if (seconds < 60) {
        // 小于 60 秒,显示秒数
        if (seconds < 10) {
            return `~${seconds}s`;
        } else {
            return `~${Math.ceil(seconds / 5) * 5}s`; // 四舍五入到5的倍数
        }
    } else {
        // 大于等于 60 秒,显示分钟
        const minutes = Math.ceil(seconds / 60);
        return `~${minutes}min`;
    }
}

// Main function to blur videos and fetch transcripts
function processVideos() {
    const allVideos = document.querySelectorAll(
        'ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ' +
        'ytd-ad-slot-renderer, ytd-promoted-video-renderer, ' +
        'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2'
    );
    console.log(`Found ${allVideos.length} videos on the page.`);


    allVideos.forEach((videoElement, index) => {
        //check if it's an ad
        const isAd = checkIfAd(videoElement);
        //check if it's shorts
        const isShorts = checkIfShorts(videoElement);


        // STEP 1: 根据视频类型应用不同的遮盖
        if (isShorts) {
            // 之前是调用 blurShortsVideo(videoElement);
            // 现在我们直接用 JS 隐藏整个元素
            console.log('This is a Shorts video, hiding element.');
            videoElement.style.display = 'none';
        } else if (isAd) {
            blurThumbnailOnly(videoElement, 'ad'); // 传递 'ad' 类型
        } else {
            blurThumbnailOnly(videoElement, 'normal'); // 传递 'normal' 类型
        }

        // 如果是广告或 Shorts，只遮盖不添加卡片
        if (isAd || isShorts) {
            console.log(`This is ${isAd ? 'an ad' : 'a Shorts video'}, applying permanent blur`);
            return;
        }

        // STEP 2: Check if this is a normal video (has video ID)
        const videoLink = videoElement.querySelector('a#video-title, a#video-title-link');
        if (!videoLink) {
            console.log('No video link found, skipping card injection');
            return;
        }

        const href = videoLink.getAttribute('href');
        if (!href) {
            console.log('No href found, skipping card injection');
            return;
        }

        // Extract video ID from href
        const videoIdMatch = href.match(/[?&]v=([^&]+)/);
        if (!videoIdMatch) {
            console.log('No video ID found (possibly shorts/other), skipping card injection');
            return;
        }

        const videoId = videoIdMatch[1];

        // Skip if already processed
        if (processedVideos.has(videoId)) return;
        processedVideos.add(videoId);

        // STEP 3: This is a normal video - inject card and fetch transcript
        console.log(`Processing normal video: ${videoId}`);

        // Create and inject placeholder card
        injectPlaceholderCard(videoElement, videoId);

        // Request transcript from service worker (which will ask us to fetch it)
        chrome.runtime.sendMessage({
            type: 'getTranscript',
            videoId: videoId
        }, (response) => {
            if (response && response.error) {
                console.error(`Failed to get transcript for ${videoId}:`, response.error);
            }
        });
    });
}
// 添加新函数：检查是否是广告
function checkIfAd(videoElement) {
    // 多种方式检查是否是广告
    const adIndicators = [
        // 检查是否是广告容器
        videoElement.tagName === 'YTD-AD-SLOT-RENDERER',
        videoElement.tagName === 'YTD-PROMOTED-VIDEO-RENDERER',
        // 检查是否包含广告标记
        videoElement.querySelector('.badge-style-type-ad') !== null,
        videoElement.querySelector('.ytp-ad-badge') !== null,
        videoElement.querySelector('.ytd-badge-supported-renderer[aria-label*="Ad"]') !== null,
        // 检查链接是否指向广告服务
        videoElement.querySelector('a[href*="googleadservices.com"]') !== null,
        videoElement.querySelector('a[href*="youtube.com/pagead"]') !== null,
        // 检查是否有"广告"文本标记
        videoElement.textContent.includes('Ad ') ||
        videoElement.textContent.includes('广告') ||
        videoElement.textContent.includes('Sponsored')
    ];

    return adIndicators.some(indicator => indicator);
}

function checkIfShorts(videoElement) {
    const shortsIndicators = [
        // 检查新的 Shorts 标签
        videoElement.tagName === 'YTM-SHORTS-LOCKUP-VIEW-MODEL',
        videoElement.tagName === 'YTM-SHORTS-LOCKUP-VIEW-MODEL-V2',
        // 检查类名
        videoElement.classList.contains('shortsLockupViewModelHost'),
        // 检查链接
        videoElement.querySelector('a[href*="/shorts/"]') !== null,
        videoElement.querySelector('a.reel-item-endpoint') !== null,
        // 检查 Shorts 特定的缩略图容器
        videoElement.querySelector('.shortsLockupViewModelHostThumbnailContainer') !== null
    ];

    return shortsIndicators.some(indicator => indicator);
}

// Apply blur effect to the thumbnail
function blurThumbnailOnly(videoElement, videoType = 'normal') {
    const thumbnail = videoElement.querySelector('ytd-thumbnail, #thumbnail, a#thumbnail');
    if (thumbnail) {
        thumbnail.classList.add('blurred-thumbnail');
        // 添加视频类型的类名
        if (videoType === 'ad') {
            thumbnail.classList.add('ad-video');
        } else if (videoType === 'shorts') {
            thumbnail.classList.add('shorts-video');
        } else {
            thumbnail.classList.add('normal-video');
        }

        thumbnail.style.position = 'relative';
        console.log('Applied blur to thumbnail');
    } else {
        console.warn('Thumbnail not found, trying to blur entire video element');
        videoElement.classList.add('blurred-thumbnail');


        // 添加视频类型的类名
        if (videoType === 'ad') {
            videoElement.classList.add('ad-video');
        } else if (videoType === 'shorts') {
            videoElement.classList.add('shorts-video');
        } else {
            videoElement.classList.add('normal-video');
        }

        videoElement.style.position = 'relative';
    }
}

// 修改 blurShortsVideo 函数
function blurShortsVideo(videoElement) {
    const thumbnailContainer = videoElement.querySelector(
        '.shortsLockupViewModelHostThumbnailContainer, ' +
        '.shortsLockupViewModelHostThumbnailParentContainer, ' +
        'a.shortsLockupViewModelHostEndpoint'
    );

    if (thumbnailContainer) {
        thumbnailContainer.classList.add('blurred-thumbnail', 'shorts-video');
        thumbnailContainer.style.position = 'relative';
        console.log('Applied blur to Shorts video');
    } else {
        videoElement.classList.add('blurred-thumbnail', 'shorts-video');
        videoElement.style.position = 'relative';
        console.log('Applied blur to entire Shorts element');
    }
}
// Inject placeholder card (shown while loading)
function injectPlaceholderCard(videoElement, videoId) {
    if (videoElement.querySelector(`#prerequisite-card-${videoId}`)) {
        return;
    }

    const thumbnail = videoElement.querySelector('ytd-thumbnail, #thumbnail, a#thumbnail');
    if (!thumbnail) {
        console.warn('Thumbnail not found, cannot inject card');
        return;
    }

    const cardHTML = `
        <div id="prerequisite-card-${videoId}" class="prerequisite-card prerequisite-loading">
            <div class="card-header">
                📚 Prerequisite Knowledge
            </div>
            <div class="card-content">
                <div class="loading-dots">
                    <span>.</span><span>.</span><span>.</span>
                </div>
            </div>
        </div>
    `;

    thumbnail.insertAdjacentHTML('beforeend', cardHTML);
    injectQuestionIcon(videoElement, videoId);
}

// Inject question icon
function injectQuestionIcon(videoElement, videoId) {
    if (videoElement.querySelector(`#question-icon-${videoId}`)) {
        return;
    }

    const metadataLine = videoElement.querySelector('#metadata-line, ytd-video-meta-block, #metadata');
    if (!metadataLine) {
        console.warn('Metadata line not found for question icon');
        return;
    }

    // === 新增: 获取视频时长并计算预估时间 ===
    const videoDuration = getVideoDuration(videoElement);
    const estimatedSeconds = estimateSummaryTime(videoDuration);
    const estimatedTimeText = formatEstimatedTime(estimatedSeconds);

    console.log(`📹 Video duration: ${videoDuration}s, Estimated summary time: ${estimatedTimeText}`);



    const iconHTML = `
    <div id="question-icon-container-${videoId}" class="question-icon-container">
        <span id="question-icon-${videoId}" class="video-question-icon" data-video-id="${videoId}" title="Ask about this video">
            ?
        </span>
        <!-- 预估时间 - 纯文字,无框 -->
        <span id="estimated-time-${videoId}" class="estimated-time-text" data-estimated-seconds="${estimatedSeconds}">
            ${estimatedTimeText}
        </span>

        <div id="question-popup-${videoId}" class="question-popup" style="display: none;">
    
            <div class="popup-section-header">Summary</div>
    
            <!-- 百分比进度倒计时 - 居中显示 -->
            <div class="summary-progress" id="summary-progress-${videoId}" style="display: none;">
                <div class="progress-percentage" id="progress-percentage-${videoId}">0%</div>
            </div>
            
            <!-- ⭐ 总结显示区域 -->
            <div class="summary-display" id="summary-display-${videoId}" style="display: none;"></div>
            
            <input type="text" 
                    class="question-input" 
                    id="question-input-${videoId}"
                    placeholder="e.g., Can I learn how to use print in this video?">
            <button class="question-submit-btn" data-video-id="${videoId}">Ask</button>
            <div class="question-loading" id="question-loading-${videoId}" style="display: none;">
                <div class="loading-dots"><span>.</span><span>.</span><span>.</span></div>
            </div>
            <div class="question-answer" id="question-answer-${videoId}" style="display: none;"></div>
        </div>
    </div>
`;
    metadataLine.insertAdjacentHTML('afterend', iconHTML);

    // Add event listeners
    const questionIcon = videoElement.querySelector(`#question-icon-${videoId}`);
    if (questionIcon) {
        questionIcon.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleQuestionPopup(videoId);
        });
    }

    const submitBtn = videoElement.querySelector(`.question-submit-btn[data-video-id="${videoId}"]`);
    if (submitBtn) {
        submitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleQuestionSubmit(videoId);
        });
    }

    const input = videoElement.querySelector(`#question-input-${videoId}`);
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.stopPropagation();
                handleQuestionSubmit(videoId);
            }
        });
    }
    const popup = videoElement.querySelector(`#question-popup-${videoId}`);
    if (popup) {
        // 捕获所有在 popup 内部的点击事件
        popup.addEventListener('click', (e) => {
            // 阻止点击事件“穿透”到下面的视频链接
            e.stopPropagation();
        });
    }
}

// Toggle question popup visibility
function toggleQuestionPopup(videoId) {
    const popup = document.getElementById(`question-popup-${videoId}`);
    if (!popup) return;

    if (popup.style.display === 'none') {
        popup.style.display = 'block';

        const input = document.getElementById(`question-input-${videoId}`);
        if (input) {
            setTimeout(() => input.focus(), 100);
        }

        // --- 新的总结逻辑 ---
        if (!videoSummaries.has(videoId)) {
            console.log(`[FocusFlow] Requesting summary for video ${videoId}`);

            // === 显示进度百分比 ===
            const progressDiv = document.getElementById(`summary-progress-${videoId}`);
            const progressPercentage = document.getElementById(`progress-percentage-${videoId}`);
            if (progressDiv) progressDiv.style.display = 'block';

            // === 获取预估时间并开始倒计时 ===
            const estimatedTimeText = document.getElementById(`estimated-time-${videoId}`);
            let totalSeconds = 10; // 默认值

            if (estimatedTimeText) {
                totalSeconds = parseInt(estimatedTimeText.dataset.estimatedSeconds) || 10;
                // 让图标旁边的时间文字高亮
                estimatedTimeText.classList.add('active');
            }

            let currentPercentage = 0;

            // 开始百分比倒计时 - 每 100ms 更新一次,更平滑
            const progressInterval = setInterval(() => {
                // 计算每次应该增加多少百分比
                // 总时间(秒) * 10 = 总共需要多少次更新才能到 100%
                const incrementPerUpdate = 99 / (totalSeconds * 10);

                currentPercentage += incrementPerUpdate;

                // 限制最大为 99%
                const displayPercentage = Math.min(Math.floor(currentPercentage), 99);

                if (progressPercentage) {
                    progressPercentage.textContent = `${displayPercentage}%`;
                }

                // 达到或超过 99% 后停止
                if (currentPercentage >= 99) {
                    if (progressPercentage) {
                        progressPercentage.textContent = '99%';
                    }
                    clearInterval(progressInterval);
                }
            }, 100); // 改为 100ms 更新一次,而不是 1000ms

            // 存储 interval ID 以便后续清除
            if (progressDiv) {
                progressDiv.dataset.intervalId = progressInterval;
            }

            // 禁用提问输入框，直到总结完成
            toggleQuestionInputs(videoId, false);

            // b. 直接调用 fetchTranscriptFromPage 获取字幕
            fetchTranscriptFromPage(videoId) //
                .then(transcript => {
                    const fullText = transcript.map(t => t.text).join(' ');

                    videoTranscripts.set(videoId, fullText); // 立即存储字幕，供“提问”功能使用

                    // c. 将完整字幕发送到 service-worker 请求总结
                    chrome.runtime.sendMessage({
                        type: 'generateSummary', // 新的消息类型
                        videoId: videoId,
                        transcript: fullText
                    });
                })
                .catch(error => {
                    console.error('Error fetching transcript for summary:', error);

                    // 清除进度条
                    if (progressDiv) {
                        clearInterval(progressDiv.dataset.intervalId);
                        progressDiv.style.display = 'none';
                    }

                    // 移除时间文字高亮
                    if (estimatedTimeText) {
                        estimatedTimeText.classList.remove('active');
                    }

                    displayVideoSummary(videoId, 'Error: Could not fetch transcript to generate summary.');
                });
        }
        // --- 结束新的总结逻辑 ---

        // 保留旧逻辑：为“提问”功能获取完整字幕并存储
        if (!videoTranscripts.has(videoId)) {
            console.log(`[FocusFlow] Requesting full transcript for video ${videoId}`);
            chrome.runtime.sendMessage({
                type: 'getFullTranscript', //
                videoId: videoId
            });
        }
    } else {
        popup.style.display = 'none';
    }
}

// Inject prerequisite knowledge card with actual content

function injectPrerequisiteCard(videoId, knowledge) {
    const cardElement = document.getElementById(`prerequisite-card-${videoId}`);
    if (!cardElement) return;

    cardElement.classList.remove('prerequisite-loading');

    const contentDiv = cardElement.querySelector('.card-content');
    if (contentDiv) {
        // 在注入之前格式化知识内容
        const formattedHTML = formatPrerequisiteKnowledge(knowledge);
        contentDiv.innerHTML = formattedHTML;
    }
}

// Setup MutationObserver
function setupObserver() {
    const targetNode = document.querySelector('ytd-app');
    if (!targetNode) {
        console.warn('YouTube app container not found, retrying...');
        setTimeout(setupObserver, 1000);
        return;
    }

    const observerConfig = {
        childList: true,
        subtree: true
    };

    const callback = function (mutationsList, observer) {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                const hasNewVideos = Array.from(mutation.addedNodes).some(node => {
                    return node.nodeType === 1 && (
                        node.matches && (
                            node.matches('ytd-video-renderer') ||
                            node.matches('ytd-grid-video-renderer') ||
                            node.matches('ytd-compact-video-renderer')
                        ) ||
                        node.querySelector && (
                            node.querySelector('ytd-video-renderer') ||
                            node.querySelector('ytd-grid-video-renderer') ||
                            node.querySelector('ytd-compact-video-renderer')
                        )
                    );
                });

                if (hasNewVideos) {
                    clearTimeout(window.focusFlowProcessTimeout);
                    window.focusFlowProcessTimeout = setTimeout(processVideos, 300);
                }
            }
        }
    };

    const observer = new MutationObserver(callback);
    observer.observe(targetNode, observerConfig);
    console.log('MutationObserver setup complete - monitoring for new videos');
}

// Initial processing when page loads
function initialize() {
    processVideos();
    setupObserver();

    let scrollTimeout;
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(processVideos, 500);
    });
}

// Wait for page to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// Handle question submission
function handleQuestionSubmit(videoId) {
    const input = document.getElementById(`question-input-${videoId}`);
    const loadingDiv = document.getElementById(`question-loading-${videoId}`);
    const answerDiv = document.getElementById(`question-answer-${videoId}`);
    const submitBtn = document.querySelector(`.question-submit-btn[data-video-id="${videoId}"]`);

    if (!input || !input.value.trim()) {
        return;
    }

    const question = input.value.trim();
    console.log(`User question for video ${videoId}: ${question}`);

    if (loadingDiv) loadingDiv.style.display = 'block';
    if (answerDiv) answerDiv.style.display = 'none';
    if (submitBtn) submitBtn.disabled = true;

    chrome.runtime.sendMessage({
        type: 'answerQuestion',
        videoId: videoId,
        question: question,
        transcript: videoTranscripts.get(videoId) || ''
    }, (response) => {
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (submitBtn) submitBtn.disabled = false;

        if (response && response.error) {
            console.error('Error answering question:', response.error);
            if (answerDiv) {
                answerDiv.textContent = 'Unable to answer at this time.';
                answerDiv.style.display = 'block';
            }
        }
    });
}

// Display the answer
function displayQuestionAnswer(videoId, answer) {
    const answerDiv = document.getElementById(`question-answer-${videoId}`);
    const loadingDiv = document.getElementById(`question-loading-${videoId}`);

    if (answerDiv) {
        if (loadingDiv) loadingDiv.style.display = 'none';
        answerDiv.textContent = answer;
        answerDiv.style.display = 'block';
    }
}

// 格式化先决知识，将 markdown 转换为 HTML
function formatPrerequisiteKnowledge(knowledge) {
    const sections = knowledge.split('###').filter(s => s.trim());

    if (sections.length === 0) {
        return '<span class="card-section-empty">No prerequisites identified</span>';
    }

    let html = '';
    let hasAnyContent = false; // 追踪是否有任何实际内容

    sections.forEach(section => {
        const lines = section.trim().split('\n');
        const title = lines[0].trim();
        const items = lines.slice(1).filter(line => line.trim());

        // 检查这个 section 是否有实际内容
        const hasValidItems = items.some(item => {
            const cleanItem = item.replace(/^[•\-\*]\s*/, '').trim();
            return cleanItem && !cleanItem.toLowerCase().includes('none');
        });

        // 检查是否只有 "None"
        const isOnlyNone = items.length === 1 && items[0].toLowerCase().includes('none');
        const isEmpty = items.length === 0;

        // 如果这个 section 只有 "None" 或为空,跳过整个 section
        if (isOnlyNone || isEmpty) {
            console.log(`Skipping empty section: ${title}`);
            return; // 跳过这个 section,不渲染
        }

        // 如果有实际内容,渲染这个 section
        if (hasValidItems) {
            hasAnyContent = true;

            html += '<div class="card-section">';
            html += `<span class="card-section-title">${title}</span>`;
            html += '<div class="card-section-content">';

            items.forEach(item => {
                const cleanItem = item.replace(/^[•\-\*]\s*/, '').trim();
                if (cleanItem && !cleanItem.toLowerCase().includes('none')) {
                    html += `<span class="item">${cleanItem}</span>`;
                }
            });

            html += '</div>';
            html += '</div>';
        }
    });

    // 如果没有任何实际内容,返回 "No prerequisites"
    if (!hasAnyContent) {
        return '<span class="card-section-empty">No prerequisites identified</span>';
    }

    return html;
}


// 更新 injectPrerequisiteCard 函数
function injectPrerequisiteCard(videoId, knowledge) {
    const cardElement = document.getElementById(`prerequisite-card-${videoId}`);
    if (!cardElement) return;

    cardElement.classList.remove('prerequisite-loading');

    const contentDiv = cardElement.querySelector('.card-content');
    if (contentDiv) {
        // 在注入之前格式化知识内容
        const formattedHTML = formatPrerequisiteKnowledge(knowledge);
        contentDiv.innerHTML = formattedHTML;
    }
}


// 显示视频总结
function displayVideoSummary(videoId, summary) {

    console.log(`🎯 [DEBUG] displayVideoSummary called for ${videoId}`);
    console.log(`🎯 [DEBUG] Summary content:`, summary);
    console.log(`🎯 [DEBUG] Summary length:`, summary?.length);
    // 隐藏进度百分比
    const progressDiv = document.getElementById(`summary-progress-${videoId}`);
    if (progressDiv) {
        clearInterval(progressDiv.dataset.intervalId);
        progressDiv.style.display = 'none';
    }

    // 显示总结
    const summaryDisplay = document.getElementById(`summary-display-${videoId}`);
    if (summaryDisplay) {
        summaryDisplay.innerHTML = formatSummary(summary);
        summaryDisplay.style.display = 'block';
    }


    // 移除时间文字高亮
    const estimatedTimeText = document.getElementById(`estimated-time-${videoId}`);
    if (estimatedTimeText) {
        estimatedTimeText.classList.remove('active');
    }
    // 启用提问输入框
    toggleQuestionInputs(videoId, true);
}

// 格式化总结 (将AI返回的带换行符的文本转换为HTML)
// content-script.js

// ===== 用这个新版本替换现有的 formatSummary 函数 =====
function formatSummary(summary) {
    // 按换行符分割
    return summary.split('\n')
        .filter(segment => segment.trim()) // 移除空行
        .map(segment => {
            // 检查是否是子要点 (e.g., "  -data types")
            if (segment.match(/^\s{2,}-\s/)) {
                // 替换掉匹配的符号，只留下文本
                return `<p class="summary-sub-item">${segment.replace(/^\s{2,}-\s/, '').trim()}</p>`;
            }
            // 检查是否是主要点 (e.g., "1. fundamental concepts")
            // 匹配开头的 (数字) + (.) + (空格)
            else if (segment.match(/^\s*\d+\.\s/)) {
                // 不替换，保留 "1."，让它成为文本的一部分
                return `<p class="summary-main-item">${segment.trim()}</p>`;
            }
            // 否则，视为主标题
            else {
                return `<p class="summary-title">${segment.trim()}</p>`;
            }
        })
        .join(''); // 重新组合成 HTML
}

/**
 * 启用或禁用提问框
 * @param {string} videoId - 视频ID
 * @param {boolean} enable - true为启用, false为禁用
 */
function toggleQuestionInputs(videoId, enable) {
    const input = document.getElementById(`question-input-${videoId}`); //
    const submitBtn = document.querySelector(`.question-submit-btn[data-video-id="${videoId}"]`); //

    if (input) {
        input.disabled = !enable;
        // 根据状态更新提示文字
        input.placeholder = enable
            ? "e.g., Can I learn how to use print...?" //
            : "Waiting for summary to finish...";
    }
    if (submitBtn) {
        submitBtn.disabled = !enable;
    }
}