// service-worker.js - COMPLETE VERSION WITH CONTENT SCRIPT METHOD

// Pre-create AI session on startup
let globalSession = null;

initializeAISession();

async function initializeAISession() {
    try {
        const availability = await LanguageModel.availability();
        if (availability === "available") {
            globalSession = await LanguageModel.create({
                initialPrompts: [
                    {
                        role: "system",
                        content: `You are an intelligent assistant for a YouTube learning browser extension.
                                You help with various tasks including keyword extraction and transcript analysis.
                                Always return responses in valid JSON format without markdown formatting.`
                    }
                ]
            });
            console.log("✅ AI session pre-initialized successfully");
        } else {
            console.warn("⚠️ Built-in AI not available. Status:", availability);
        }
    } catch (error) {
        console.error("❌ Failed to initialize AI session:", error);
    }
}

// Track processed videos for testing
let processedVideoIds = new Set();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getKeywords') {
        handleKeywordExtraction(request.topic).then(result => {
            sendResponse(result);
        }).catch(error => {
            sendResponse({ success: false, error: error.message });
        });
        return true;
    }

    if (request.action === 'openYouTube') {
        const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(request.searchQuery)}`;
        chrome.tabs.create({ url: youtubeUrl });
        console.log("Opening YouTube with query:", request.searchQuery);
        sendResponse({ message: "YouTube tab opened" });
        return true;
    }

    if (request.type === 'getTranscript') {
        handleTranscriptRequestViaContentScript(request.videoId, sender.tab.id).then(result => {
            sendResponse(result);
        }).catch(error => {
            sendResponse({ error: error.message });
        });
        return true;
    }

    if (request.type === 'transcriptData') {
        handleTranscriptData(request.videoId, request.transcript, sender.tab.id).then(result => {
            sendResponse(result);
        }).catch(error => {
            sendResponse({ error: error.message });
        });
        return true;
    }

    if (request.type === 'getFullTranscript') {
        handleFullTranscriptRequest(request.videoId, sender.tab.id).then(result => {
            sendResponse(result);
        }).catch(error => {
            sendResponse({ error: error.message });
        });
        return true;
    }

    if (request.type === 'answerQuestion') {
        handleQuestionAnswer(request.videoId, request.question, request.transcript, sender.tab.id).then(result => {
            sendResponse(result);
        }).catch(error => {
            sendResponse({ error: error.message });
        });
        return true;
    }

    if (request.type === 'generateSummary') {
        handleSummaryGeneration(request.videoId, request.transcript, sender.tab.id).then(result => {
            sendResponse(result);
        }).catch(error => {
            sendResponse({ error: error.message });
        });
        return true;
    }

    if (request.topic && !request.action) {
        handleTopicWithAI(request.topic);
        sendResponse({ message: "Topic received. AI is processing..." });
        return true;
    }
});

// Request transcript via content script
// Request transcript via content script
async function handleTranscriptRequestViaContentScript(videoId, tabId) {
    try {
        console.log(`🎬 [SW] Processing video via content script: ${videoId}`);

        // Record processed videos (avoid duplicate processing)
        processedVideoIds.add(videoId);

        console.log(`📤 [SW] Requesting transcript from content script for: ${videoId}`);

        // Ask content script to fetch transcript
        chrome.tabs.sendMessage(tabId, {
            type: 'fetchTranscriptInPage',
            videoId: videoId
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error(`❌ [SW] Error sending message to content script:`, chrome.runtime.lastError);
            } else {
                console.log(`✅ [SW] Message sent to content script, response:`, response);
            }
        });

        return { success: true, message: 'Request sent to content script' };

    } catch (error) {
        console.error(`❌ [SW] Error requesting transcript for ${videoId}:`, error);
        return { error: error.message };
    }
}

// Process transcript data received from content script
async function handleTranscriptData(videoId, transcript, tabId) {
    try {
        console.log(`📥 [SW] Received transcript data for ${videoId}`);
        console.log(`📊 [SW] Transcript segments: ${transcript?.length || 0}`);

        if (!transcript || transcript.length === 0) {
            console.warn(`⚠️ [SW] No transcript data for video: ${videoId}`);
            chrome.tabs.sendMessage(tabId, {
                type: 'prerequisiteKnowledge',
                videoId: videoId,
                knowledge: 'No transcript available for this video.'
            });
            return { success: false, error: 'No transcript available' };
        }

        // Show sample of transcript
        console.log(`📝 [SW] First segment: "${transcript[0].text.substring(0, 50)}..."`);

        const fullTranscript = transcript.map(item => item.text).join(' ');
        console.log(`✅ [SW] Full transcript length: ${fullTranscript.length} characters`);

        console.log(`🤖 [SW] Generating prerequisite knowledge...`);
        const prerequisiteKnowledge = await generatePrerequisiteKnowledge(fullTranscript, videoId);

        console.log(`📤 [SW] Sending prerequisite knowledge to content script`);
        chrome.tabs.sendMessage(tabId, {
            type: 'prerequisiteKnowledge',
            videoId: videoId,
            knowledge: prerequisiteKnowledge
        });

        return { success: true };

    } catch (error) {
        console.error(`❌ [SW] Error processing transcript data for ${videoId}:`, error);

        chrome.tabs.sendMessage(tabId, {
            type: 'prerequisiteKnowledge',
            videoId: videoId,
            knowledge: 'Unable to analyze this video at the moment.'
        });

        return { error: error.message };
    }
}

// Generate prerequisite knowledge from transcript using AI
async function generatePrerequisiteKnowledge(transcript, videoId) {
    try {
        const availability = await LanguageModel.availability();
        if (availability !== "available") {
            return 'AI analysis unavailable. Please watch the video to understand prerequisites.';
        }

        const prereqSession = await LanguageModel.create({
            initialPrompts: [
                {
                    role: "system",
                    content: `You are an intelligent assistant for a YouTube learning browser extension.
                            Your task is to analyze video transcripts and extract prerequisite knowledge in a structured format.
                            
                            Analyze the transcript and identify:
                            1. Required Prerequisites: Essential knowledge the learner MUST have (leave empty if none)
                            2. Helpful Background: Knowledge that would be helpful but not strictly required
                            
                            Format your response as a JSON object with this structure:
                            {
                              "prerequisiteKnowledge": "### Required\\n[list required items with • or leave empty]\\n\\n### Helpful Background\\n• [item 1]\\n• [item 2]"
                            }
                            
                            Guidelines:
                            - Be concise - each point should be one short line
                            - Use bullet points (•) for lists
                            - If no required prerequisites, put "None" under Required section
                            - Focus on concepts/skills mentioned in the first 3 minutes
                            - Maximum 3-4 points total
                            
                            IMPORTANT: Output ONLY the JSON object, no markdown code blocks or explanations.`
                }
            ]
        });

        const processedTranscript = processLongTranscript(transcript);
        console.log(`🤖 [SW] Sending to AI: ${processedTranscript.length} chars for analysis`);

        const prompt = `Analyze this video transcript (focus on the beginning) and identify prerequisite knowledge needed:

"${processedTranscript}"

What should learners know BEFORE watching this video? Return JSON with prerequisiteKnowledge field.`;

        const response = await prereqSession.prompt(prompt);
        console.log(`🤖 [SW] AI prerequisite response for ${videoId}:`, response);

        prereqSession.destroy();

        let jsonResponse;
        try {
            const jsonStartIndex = response.indexOf('{');
            const jsonEndIndex = response.lastIndexOf('}');

            if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
                const jsonString = response.substring(jsonStartIndex, jsonEndIndex + 1);
                jsonResponse = JSON.parse(jsonString);
            } else {
                throw new Error("No JSON object found");
            }
        } catch (parseError) {
            console.error("❌ [SW] Failed to parse AI response:", parseError);
            return 'This video covers advanced topics. Some background knowledge may be helpful.';
        }

        const result = jsonResponse.prerequisiteKnowledge || 'No specific prerequisites identified.';
        console.log(`✅ [SW] Generated prerequisite knowledge: "${result}"`);
        return result;

    } catch (error) {
        console.error('❌ [SW] Error generating prerequisite knowledge:', error);
        return 'Unable to analyze prerequisites at this time.';
    }
}

// Process long transcripts
function processLongTranscript(transcript) {
    const MAX_CHARS = 3000;

    if (transcript.length <= MAX_CHARS) {
        console.log('Transcript is short enough, using full text');
        return transcript;
    }

    console.log(`Transcript is long (${transcript.length} chars), using smart extraction`);
    const firstPortion = transcript.substring(0, MAX_CHARS);
    console.log(`Using first ${firstPortion.length} characters`);

    return firstPortion;
}

// Keyword extraction
async function handleKeywordExtraction(topic) {
    try {
        const availability = await LanguageModel.availability();
        if (availability !== "available") {
            console.warn("AI not available, using fallback");
            return {
                success: true,
                keywords: [topic],
                searchQuery: topic
            };
        }

        const keywordSession = await LanguageModel.create({
            initialPrompts: [
                {
                    role: "system",
                    content: `You are an intelligent assistant for a YouTube learning browser extension. Your task is to deconstruct a user's learning request into a set of relevant search keywords.
                    Follow these steps:
                    1.  Identify the core "subject" of the user's learning goal from their input sentence.
                    2.  Based on the subject, generate 5 distinct and relevant keywords or short phrases that a person would use to search for tutorials on this topic.
                    3.  From those 5 phrases, extract a final list of unique, single-word keywords. Remove any duplicates and generic words (like "a", "to", "at"). The keywords should be lowercase.
                    4.  Return a JSON object containing two keys:
                        - "subject": The core topic you identified in step 1.
                        - "keywords": An array of the unique, single-word keywords you generated in step 3.
                    Output ONLY the valid JSON object.`
                }
            ]
        });

        const userPrompt = `User's learning goal: "${topic}"

Follow the steps to extract the subject and keywords.`;

        const fullResult = await keywordSession.prompt(userPrompt);
        console.log("AI keyword extraction response:", fullResult);

        keywordSession.destroy();

        let jsonResponse;
        try {
            const jsonStartIndex = fullResult.indexOf('{');
            const jsonEndIndex = fullResult.lastIndexOf('}');

            if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
                const jsonString = fullResult.substring(jsonStartIndex, jsonEndIndex + 1);
                jsonResponse = JSON.parse(jsonString);
            } else {
                throw new Error("No JSON object found");
            }
        } catch (parseError) {
            console.error("Failed to parse AI response, using fallback");
            const words = topic.toLowerCase()
                .split(/\s+/)
                .filter(word =>
                    word.length > 2 &&
                    !['the', 'and', 'for', 'want', 'wanna', 'learn', 'how', 'make', 'get'].includes(word)
                );
            const fallbackKeywords = words.slice(0, 5);
            if (fallbackKeywords.length === 0) fallbackKeywords.push(topic);

            return {
                success: true,
                keywords: fallbackKeywords,
                searchQuery: fallbackKeywords.join(' ')
            };
        }

        const cleanedKeywords = (jsonResponse.keywords || [])
            .map(k => k.toLowerCase().trim())
            .filter(k => k.length > 0);

        return {
            success: true,
            keywords: cleanedKeywords.length > 0 ? cleanedKeywords : [topic],
            searchQuery: cleanedKeywords.join(' ') || topic
        };

    } catch (error) {
        console.error("Error during keyword extraction:", error);
        const words = topic.toLowerCase()
            .split(/\s+/)
            .filter(word =>
                word.length > 2 &&
                !['the', 'and', 'for', 'want', 'wanna', 'learn', 'how', 'make', 'get'].includes(word)
            );
        const fallbackKeywords = words.slice(0, 5);
        if (fallbackKeywords.length === 0) fallbackKeywords.push(topic);

        return {
            success: true,
            keywords: fallbackKeywords,
            searchQuery: fallbackKeywords.join(' ')
        };
    }
}

// Legacy function
async function handleTopicWithAI(topic) {
    let session;
    try {
        const availability = await LanguageModel.availability();
        if (availability !== "available") {
            console.error("Built-in AI is not available");
            return;
        }

        session = await LanguageModel.create({
            initialPrompts: [
                {
                    role: "system",
                    content: `You are an intelligent assistant for a YouTube learning browser extension.
                            Return a JSON object with:
                            1. "subject": core topic
                            2. "searchQuery": YouTube search query
                            Output ONLY valid JSON.`
                }
            ]
        });

        const userPrompt = `User Goal: "${topic}"`;
        const resultStream = await session.promptStreaming(userPrompt);

        let fullResult = "";
        for await (const chunk of resultStream) {
            fullResult += chunk;
        }

        let jsonResponse;
        const jsonStartIndex = fullResult.indexOf('{');
        const jsonEndIndex = fullResult.lastIndexOf('}');

        if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
            const jsonString = fullResult.substring(jsonStartIndex, jsonEndIndex + 1);
            jsonResponse = JSON.parse(jsonString);
        }

        const searchQuery = jsonResponse?.searchQuery;
        if (searchQuery) {
            const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
            chrome.tabs.create({ url: youtubeUrl });
        }

    } catch (error) {
        console.error("Error in legacy AI processing:", error);
    } finally {
        if (session) {
            session.destroy();
        }
    }
}

// Handle full transcript request
async function handleFullTranscriptRequest(videoId, tabId) {
    try {
        console.log(`📥 [SW] Fetching full transcript for question feature: ${videoId}`);

        // Request from content script
        chrome.tabs.sendMessage(tabId, {
            type: 'fetchFullTranscriptInPage',
            videoId: videoId
        });

        return { success: true };

    } catch (error) {
        console.error(`❌ [SW] Error fetching full transcript for ${videoId}:`, error);
        return { error: error.message };
    }
}

// Handle question answering
async function handleQuestionAnswer(videoId, question, transcript, tabId) {
    try {
        console.log(`❓ [SW] Answering question for video ${videoId}: ${question}`);

        if (!transcript) {
            chrome.tabs.sendMessage(tabId, {
                type: 'questionAnswer',
                videoId: videoId,
                answer: 'Transcript not available for this video.'
            });
            return { success: false };
        }

        const availability = await LanguageModel.availability();
        if (availability !== "available") {
            chrome.tabs.sendMessage(tabId, {
                type: 'questionAnswer',
                videoId: videoId,
                answer: 'AI analysis unavailable at this time.'
            });
            return { success: false };
        }

        const questionSession = await LanguageModel.create({
            initialPrompts: [
                {
                    role: "system",
                    content: `You are a helpful assistant analyzing YouTube video transcripts.
                            When a user asks if they can learn something specific from a video, analyze the transcript and provide a clear answer.
                            Explain what specific knowledge points about their topic are covered in this video.
                            Be concise (2-4 sentences) and specific about what they will learn.
                            Return ONLY a JSON object with key "answer" containing your response.
                            IMPORTANT: Output ONLY the JSON object, no markdown or explanations.`
                }
            ]
        });

        const truncatedTranscript = transcript.length > 4000
            ? transcript.substring(0, 4000) + '...'
            : transcript;

        const prompt = `User's question: "${question}"

Video transcript:
"${truncatedTranscript}"

Analyze the transcript and answer whether they can learn what they're asking about, and specifically what knowledge points are covered.`;

        const response = await questionSession.prompt(prompt);
        console.log(`🤖 [SW] AI question response for ${videoId}:`, response);

        questionSession.destroy();

        let jsonResponse;
        try {
            const jsonStartIndex = response.indexOf('{');
            const jsonEndIndex = response.lastIndexOf('}');

            if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
                const jsonString = response.substring(jsonStartIndex, jsonEndIndex + 1);
                jsonResponse = JSON.parse(jsonString);
            } else {
                throw new Error("No JSON object found");
            }
        } catch (parseError) {
            console.error("Failed to parse AI response:", parseError);
            chrome.tabs.sendMessage(tabId, {
                type: 'questionAnswer',
                videoId: videoId,
                answer: 'Unable to analyze this video at the moment.'
            });
            return { success: false };
        }

        chrome.tabs.sendMessage(tabId, {
            type: 'questionAnswer',
            videoId: videoId,
            answer: jsonResponse.answer || 'No specific information found about your question.'
        });

        return { success: true };

    } catch (error) {
        console.error('Error answering question:', error);
        chrome.tabs.sendMessage(tabId, {
            type: 'questionAnswer',
            videoId: videoId,
            answer: 'Unable to answer at this time.'
        });
        return { error: error.message };
    }
}

async function handleSummaryGeneration(videoId, transcript, tabId) {
    try {
        console.log(`🤖 [SW] Generating *PARALLEL* summary for video ${videoId}. Length: ${transcript.length}`);

        if (!transcript) { throw new Error("Transcript is empty."); }
        const availability = await LanguageModel.availability(); //
        if (availability !== "available") { throw new Error("AI analysis unavailable."); }

        // 1. Split the transcript into chunks
        const chunks = chunkTranscript(transcript, 3500); //

        const chunkSession = await LanguageModel.create({ //
            initialPrompts: [{
                role: "system",
                content: `You are a summarization assistant. Analyze the following video transcript chunk and extract the key points.
                          Return ONLY the key points as a simple text list. Do not add conversational text or JSON formatting.`
            }]
        });

        // 2. Create an array of Promises for all summary tasks
        const summaryPromises = chunks.map((chunk, i) => {
            console.log(`[SW] Preparing chunk ${i + 1} for parallel summary...`);
            const prompt = `Summarize the key points of this transcript chunk:\n\n"${chunk}"`;
            return chunkSession.prompt(prompt); //
        });

        // 3. Execute all summaries in parallel using Promise.all
        console.log(`[SW] Summarizing all ${chunks.length} chunks in parallel...`);
        const intermediateSummaries = await Promise.all(summaryPromises);
        console.log(`[SW] All chunks summarized in parallel.`);

        chunkSession.destroy(); //

        // 4. Combine all partial summaries
        const finalSummaryText = intermediateSummaries.join('\n\n');

        // 5. Create a new session to summarize the summaries
        const finalSession = await LanguageModel.create({ //
            initialPrompts: [{
                role: "system",
                // ===== [FIXED PROMPT] =====
                content: `You are a helpful assistant. You will be given a collection of summaries from a video.
                          Your task is to combine them into a structured, hierarchical summary.
                          
                          1. Start with a single, concise line describing the video's main topic.
                          2. Below that, list the main concepts using a numbered list (e.g., "1. Java", "2. Concepts").
                          3. If a category has sub-points, list them on new lines below it.
                          4. Indent sub-points with two spaces and precede them with a '-' and a space (e.g., "  -Intro: [Details]").
                          
                          EXAMPLE FORMAT:
                            An introductory Java tutorial for beginners.
                            1. Java
                            -Intro: It is a versatile programming language...
                            2. Fundamental Concepts
                            -data types
                          
                          Return ONLY a JSON object with key "summary" containing this multi-line, formatted string.
                          If you cannot create a proper summary, return:{"summary": "Unavailable"}.`
                // ===== END FIX =====
            }]
        });

        const finalPrompt = `This is a collection of summaries from chunks of a video transcript. Combine them into a final 3-5 point summary:\n\n"${finalSummaryText}"`;

        const response = await finalSession.prompt(finalPrompt);
        finalSession.destroy();

        console.log(`🤖 [SW] AI *final* summary response:`, response);

        // 6. Parse and send the final result
        let jsonResponse;
        try {
            const jsonStartIndex = response.indexOf('{');
            const jsonEndIndex = response.lastIndexOf('}');
            const jsonString = response.substring(jsonStartIndex, jsonEndIndex + 1);
            jsonResponse = JSON.parse(jsonString);
        } catch (parseError) {
            console.error("Failed to parse AI final summary response:", parseError);
            throw new Error("Unable to generate summary at this time. Please reload the page");
        }

        const summary = jsonResponse.summary || 'Unable to generate final summary.';

        chrome.tabs.sendMessage(tabId, {
            type: 'videoSummary',
            videoId: videoId,
            summary: summary
        });

        return { success: true };

    } catch (error) {
        console.error('❌ [SW] Error generating parallel summary:', error);
        chrome.tabs.sendMessage(tabId, {
            type: 'videoSummary',
            videoId: videoId,
            summary: `Error: ${error.message}`
        });
        return { error: error.message };
    }
}

/**
 * Split long text into smaller chunks
 * @param {string} transcript - Full transcript text
 * @param {number} [chunkSize=3500] - Maximum characters per chunk
 * @returns {string[]} - Array of text chunks
 */
function chunkTranscript(transcript, chunkSize = 3500) {
    const chunks = [];
    for (let i = 0; i < transcript.length; i += chunkSize) {
        chunks.push(transcript.substring(i, i + chunkSize));
    }
    console.log(`[SW] Split transcript into ${chunks.length} chunks.`);
    return chunks;
}