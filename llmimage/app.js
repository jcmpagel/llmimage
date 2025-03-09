// Logger Module - Handles all logging functionality
const Logger = (() => {
    let debugLogElement;
    
    const init = (element) => {
        debugLogElement = element;
    };
    
    const log = (message, data = null) => {
        const timestamp = new Date().toISOString();
        let logMessage = `[${timestamp}] ${message}`;
        
        if (data) {
            if (typeof data === 'object') {
                logMessage += '\n' + JSON.stringify(data, null, 2);
            } else {
                logMessage += '\n' + data;
            }
        }
        
        console.log(logMessage);
        if (debugLogElement) {
            debugLogElement.innerHTML += logMessage + '\n\n';
            debugLogElement.scrollTop = debugLogElement.scrollHeight;
        }
        
        return logMessage;
    };
    
    return { init, log };
})();

// ImageProcessor Module - Handles image processing operations
const ImageProcessor = (() => {
    // Convert SVG to PNG using canvas
    const svgToPng = async (svgUrl) => {
        Logger.log(`Converting SVG to PNG: ${svgUrl}`);
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width || 300;
                canvas.height = img.height || 300;
                const ctx = canvas.getContext('2d');
                
                // Fill with white background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                ctx.drawImage(img, 0, 0);
                try {
                    const pngUrl = canvas.toDataURL('image/png');
                    resolve(pngUrl);
                } catch (e) {
                    Logger.log(`Error converting SVG to PNG: ${e.message}`);
                    reject(e);
                }
            };
            img.onerror = (e) => {
                Logger.log(`Error loading SVG: ${e.message}`);
                reject(new Error('Failed to load SVG'));
            };
            img.src = svgUrl;
        });
    };

    // Get base64 encoding of an image
    const getImageBase64 = async (url) => {
        Logger.log(`Getting base64 for image: ${url}`);
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.statusText}`);
            }
            
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            Logger.log(`Error getting image base64: ${error.message}`);
            throw error;
        }
    };
    
    // Check image size
    const checkImageSize = async (url) => {
        Logger.log(`Checking size for image: ${url}`);
        
        try {
            const response = await fetch(url, { method: 'HEAD' });
            if (!response.ok) {
                throw new Error(`Failed to check image size: ${response.statusText}`);
            }
            
            const contentLength = response.headers.get('content-length');
            if (!contentLength) {
                Logger.log('Content-Length header not available, proceeding with caution');
                return true; // Proceed if we can't determine size
            }
            
            const sizeInBytes = parseInt(contentLength, 10);
            const sizeInMB = sizeInBytes / (1024 * 1024);
            
            Logger.log(`Image size: ${sizeInMB.toFixed(2)} MB`);
            
            // Return true if image is under 0.5MB to be more conservative
            return sizeInMB <= 1.0;
        } catch (error) {
            Logger.log(`Error checking image size: ${error.message}`);
            return false; // Skip image if we can't check size
        }
    };

    // Estimate the size of a base64 string
    const estimateBase64Size = (base64String) => {
        // Remove the data:image/... prefix if present
        const base64Data = base64String.split(',')[1] || base64String;
        // Rough estimate: base64 encoded data is about 4/3 the size of binary
        return Math.ceil((base64Data.length * 3) / 4);
    };

    return { svgToPng, getImageBase64, checkImageSize, estimateBase64Size };
})();

// WikimediaAPI Module - Handles interactions with Wikimedia API
const WikimediaAPI = (() => {
    // Search Wikimedia for images
    const searchImages = async (searchTerm) => {
        Logger.log(`Searching Wikimedia for: ${searchTerm}`);
        
        const encodedSearchTerm = encodeURIComponent(searchTerm);
        // Modified query to exclude GIFs and focus on higher quality images
        const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodedSearchTerm}+filetype:bitmap|drawing+-filetype:gif&srnamespace=6&format=json&origin=*&srlimit=3`;
        
        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`Wikimedia API error: ${response.status}`);
            }
            
            const data = await response.json();
            Logger.log(`Received ${data.query.search.length} results for "${searchTerm}"`);
            
            return data.query.search.map(result => ({
                title: result.title,
                pageId: result.pageid
            }));
        } catch (error) {
            Logger.log(`Error searching Wikimedia: ${error.message}`);
            return [];
        }
    };

    // Get image details from Wikimedia
    const getImageDetails = async (imageTitle) => {
        Logger.log(`Getting details for image: ${imageTitle}`);
        
        const encodedTitle = encodeURIComponent(imageTitle);
        const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodedTitle}&prop=imageinfo&iiprop=url|extmetadata&format=json&origin=*`;
        
        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`Wikimedia API error: ${response.status}`);
            }
            
            const data = await response.json();
            const pages = data.query.pages;
            const pageId = Object.keys(pages)[0];
            
            if (pageId === '-1') {
                throw new Error('Image not found');
            }
            
            const imageInfo = pages[pageId].imageinfo[0];
            const metadata = imageInfo.extmetadata;
            
            // Get alt text (try different metadata fields that might contain descriptions)
            let altText = '';
            if (metadata.ImageDescription && metadata.ImageDescription.value) {
                altText = metadata.ImageDescription.value.replace(/<.*?>/g, ''); // Remove HTML tags
            } else if (metadata.ObjectName && metadata.ObjectName.value) {
                altText = metadata.ObjectName.value;
            } else if (metadata.Categories && metadata.Categories.value) {
                altText = metadata.Categories.value.replace(/<.*?>/g, '');
            } else {
                altText = imageTitle.replace('File:', '');
            }
            
            // Clean up alt text (limit length)
            altText = altText.trim().substring(0, 200);
            if (altText.length === 200) altText += '...';
            
            // Get license information
            let licenseInfo = 'Unknown license';
            if (metadata.LicenseShortName && metadata.LicenseShortName.value) {
                licenseInfo = metadata.LicenseShortName.value.replace(/<.*?>/g, ''); // Remove HTML tags
            } else if (metadata.License && metadata.License.value) {
                licenseInfo = metadata.License.value.replace(/<.*?>/g, '');
            }
            
            // Get attribution info (if available)
            let attribution = '';
            if (metadata.Artist && metadata.Artist.value) {
                attribution = metadata.Artist.value.replace(/<.*?>/g, ''); // Remove HTML tags
            }
            
            return {
                url: imageInfo.url,
                altText,
                title: imageTitle.replace('File:', ''),
                license: licenseInfo,
                attribution
            };
        } catch (error) {
            Logger.log(`Error getting image details: ${error.message}`);
            return null;
        }
    };

    return { searchImages, getImageDetails };
})();


// GeminiAPI Module - Handles interactions with Gemini API
const GeminiAPI = (() => {
    // Flag to track if we're using the proxy or direct API
    let usingProxy = true;
    const PROXY_URL = 'https://tight-brook-3d83.jcmpagel.workers.dev/generateContent';
    
    // Get search terms from Gemini API
    const getSearchTerms = async (question, apiKey) => {
        Logger.log(`Getting search terms for question: ${question}`);
        
        const promptText = PROMPTS.SEARCH_TERMS.replace('{question}', question);
        const requestData = {
            contents: [{
                parts: [{
                    text: promptText
                }]
            }]
        };
        
        // Try the proxy first if enabled
        if (usingProxy) {
            try {
                Logger.log("Attempting to use API proxy...");
                
                const response = await fetch(PROXY_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'gemini-2.0-flash-lite',
                        data: requestData
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`Proxy error: ${response.status}`);
                }
                
                const data = await response.json();
                const searchTermsText = data.candidates[0].content.parts[0].text.trim();
                Logger.log(`Successfully used API proxy`);
                
                // Parse the comma-separated search terms
                const searchTerms = searchTermsText.split(',').map(term => term.trim());
                return searchTerms;
            } catch (error) {
                Logger.log(`Proxy request failed: ${error.message}`);
                Logger.log("Falling back to direct API call");
                // Fall through to direct API call
            }
        }
        
        // Direct API call with user's key
        // Check if API key is provided
        if (!apiKey) {
            throw new Error('API key is required when proxy is unavailable');
        }
        
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;
        
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gemini API error: ${response.status} ${errorText}`);
            }
            
            const data = await response.json();
            const searchTermsText = data.candidates[0].content.parts[0].text.trim();
            Logger.log(`Received search terms from Gemini API directly`);
            
            // Parse the comma-separated search terms
            const searchTerms = searchTermsText.split(',').map(term => term.trim());
            return searchTerms;
        } catch (error) {
            Logger.log(`Error getting search terms: ${error.message}`);
            throw error;
        }
    };

    // Analyze images with Gemini - similar approach with proxy first, then fallback
    const analyzeImages = async (question, imageData, apiKey, modelName = 'gemini-2.0-flash') => {
        Logger.log(`Analyzing ${imageData.length} images with Gemini model: ${modelName}`);
        
        // Use the prompt from prompts.js
        const systemInstruction = PROMPTS.IMAGE_ANALYSIS;

        // Prepare the image parts for the Gemini API request
        const imageParts = imageData.map(img => ({
            inline_data: {
                mime_type: img.url.endsWith('.svg') ? 'image/png' : 'image/jpeg',
                data: img.base64.split(',')[1] // Remove the data:image/... prefix
            }
        }));

        // Prepare text parts with image metadata
        const imageMetadata = imageData.map(img => 
            `Image filename: ${img.title}\nDescription: ${img.altText}`
        ).join('\n\n');

        // Construct the full request to Gemini
        const requestData = {
            contents: [{
                parts: [
                    { text: systemInstruction },
                    ...imageParts,
                    { text: `Image metadata:\n${imageMetadata}\n\nUser question: ${question}` }
                ]
            }],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 1024
            }
        };

        // Try proxy first if enabled
        if (usingProxy) {
            try {
                Logger.log("Attempting to use API proxy for image analysis...");
                
                const response = await fetch(PROXY_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: modelName,
                        data: requestData
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`Proxy error: ${response.status}`);
                }
                
                const data = await response.json();
                const answerText = data.candidates[0].content.parts[0].text;
                Logger.log(`Successfully used API proxy for image analysis`);
                
                return answerText;
            } catch (error) {
                Logger.log(`Proxy request failed: ${error.message}`);
                Logger.log("Falling back to direct API call");
                // Fall through to direct API call
            }
        }
        
        // Direct API call with user's key
        if (!apiKey) {
            throw new Error('API key is required when proxy is unavailable');
        }
        
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gemini API error: ${response.status} ${errorText}`);
            }
            
            const data = await response.json();
            const answerText = data.candidates[0].content.parts[0].text;
            Logger.log(`Received response from Gemini API directly`);
            
            return answerText;
        } catch (error) {
            Logger.log(`Error analyzing images with Gemini: ${error.message}`);
            throw error;
        }
    };

    // Methods to control proxy usage
    const setUseProxy = (useProxy) => {
        usingProxy = useProxy;
        Logger.log(`Proxy usage set to: ${usingProxy}`);
    };

    return { 
        getSearchTerms, 
        analyzeImages,
        setUseProxy,
        isUsingProxy: () => usingProxy 
    };
})();

// UIController module - Add this line to define the module
const UIController = (() => {
    let elements = {};
    
    const init = (elementIds) => {
        elements = elementIds;
        
        // Attach event listeners
        elements.submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const question = elements.userQuestionInput.value.trim();
            const apiKey = elements.apiKeyInput.value.trim();
            const selectedModel = elements.modelSelector.value;
            const useProxy = elements.useProxyToggle ? elements.useProxyToggle.checked : true;
            
            if (!question) {
                alert('Please enter a question');
                return;
            }
            
            // Only require API key if proxy is disabled
            if (!useProxy && !apiKey) {
                alert('Please enter your Gemini API key when not using the proxy');
                return;
            }
            
            // Set the proxy usage preference
            GeminiAPI.setUseProxy(useProxy);
            
            AppController.processQuestion(question, apiKey, selectedModel);
        });
        
        if (elements.useProxyToggle) {
            // Default to checked if not already set
            if (elements.useProxyToggle.checked === undefined) {
                elements.useProxyToggle.checked = true;
            }
            
            elements.useProxyToggle.addEventListener('change', (e) => {
                const apiKeyField = elements.apiKeyInput;
                const apiKeyLabel = apiKeyField.parentElement.querySelector('label');
                
                if (e.target.checked) {
                    // Using proxy, API key is optional
                    apiKeyField.required = false;
                    apiKeyLabel.innerHTML = 'API Key (optional)';
                    apiKeyField.placeholder = 'Optional when using proxy';
                } else {
                    // Not using proxy, API key is required
                    apiKeyField.required = true;
                    apiKeyLabel.innerHTML = 'API Key (required)';
                    apiKeyField.placeholder = 'Required for direct API access';
                }
            });
            
            // Manually trigger the change event to set the initial state
            const event = new Event('change');
            elements.useProxyToggle.dispatchEvent(event);
        }    
        elements.toggleInfoBtn.addEventListener('click', () => {
            if (elements.infoContainer.style.display === 'none') {
                elements.infoContainer.style.display = 'block';
                elements.toggleInfoBtn.textContent = 'Hide';
            } else {
                elements.infoContainer.style.display = 'none';
                elements.toggleInfoBtn.textContent = 'Show';
            }
        });
    };
    
    const updateButtonState = (state) => {
        const button = elements.submitBtn;
        
        // Reset all classes
        button.classList.remove('btn-processing', 'btn-finding', 'btn-analyzing');
        
        switch(state) {
            case 'initial':
                button.disabled = false;
                button.textContent = 'Ask Question';
                break;
            case 'processing':
                button.disabled = true;
                button.textContent = 'Generating Search Terms...';
                button.classList.add('btn-processing');
                break;
            case 'finding':
                button.disabled = true;
                button.textContent = 'Finding Images...';
                button.classList.add('btn-finding');
                break;
            case 'analyzing':
                button.disabled = true;
                button.textContent = 'Creating Response...';
                button.classList.add('btn-analyzing');
                break;
            default:
                button.disabled = false;
                button.textContent = 'Ask Question';
        }
    };
    
    // Update showLoading function
    const showLoading = () => {
        elements.responseContainer.innerHTML = '';
        elements.loadingDiv.style.display = 'block';
        elements.debugLog.innerHTML = '';
        elements.imagePreview.innerHTML = '';
        updateButtonState('processing');
    };
    
    // Update hideLoading function
    const hideLoading = () => {
        elements.loadingDiv.style.display = 'none';
        updateButtonState('initial');
    };
    
    // Display error message
    const showError = (message) => {
        elements.responseContainer.innerHTML = `<p class="error">Error: ${message}</p>`;
    };
    
    // Display image previews
    const addImagePreview = (image) => {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'image-item';
        imgDiv.innerHTML = `
            <img src="${image.base64}" alt="${image.altText}">
            <p>${image.title}</p>
        `;
        elements.imagePreview.appendChild(imgDiv);
    };
    
    // Format and display the final response
    const displayResponse = (question, formattedResponse) => {
        const shareButtonsHtml = `
            <div class="share-buttons" style="margin-top: 20px;">
                <button id="share-btn" class="share-btn" style="background-color: #4285f4; color: white; border: none; padding: 8px 15px; margin-right: 10px; cursor: pointer; border-radius: 3px;">
                    Share this response
                </button>
                <div id="share-link" style="display: none; margin-top: 10px;">
                    <input type="text" id="share-url" readonly style="width: 80%; padding: 8px; margin-right: 10px;">
                    <button id="copy-link" style="background-color: #34a853; color: white; border: none; padding: 8px 15px; cursor: pointer; border-radius: 3px;">
                        Copy
                    </button>
                </div>
            </div>
        `;
        
        elements.responseContainer.innerHTML = `
            <h2>Answer:</h2>
            ${shareButtonsHtml}
            <div>${formattedResponse}</div>
        `;
        
        // Add event listeners to the share buttons
        document.getElementById('share-btn').addEventListener('click', async () => {
            try {
                const shareBtn = document.getElementById('share-btn');
                shareBtn.textContent = 'Generating link...';
                shareBtn.disabled = true;
                
                const shareUrl = await AppController.shareResponse(question, formattedResponse);
                
                document.getElementById('share-url').value = shareUrl;
                document.getElementById('share-link').style.display = 'block';
                shareBtn.textContent = 'Share this response';
                shareBtn.disabled = false;
            } catch (error) {
                alert(`Error sharing response: ${error.message}`);
            }
        });
        
        document.getElementById('copy-link').addEventListener('click', () => {
            const shareUrl = document.getElementById('share-url');
            shareUrl.select();
            document.execCommand('copy');
            alert('Link copied to clipboard!');
        });
        
        // Render any math formulas if MathJax is available
        if (window.MathJax) {
            MathJax.typesetPromise([elements.responseContainer]).catch((err) => {
                Logger.log(`Error rendering math: ${err.message}`);
            });
        }

        // Scroll to the response container with a smooth animation
        elements.responseContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Highlight the response container briefly to draw attention
        elements.responseContainer.style.transition = 'background-color 1s';
        elements.responseContainer.style.backgroundColor = '#f0f8ff'; // Light blue highlight
        
        // Remove the highlight after 1.5 seconds
        setTimeout(() => {
            elements.responseContainer.style.backgroundColor = '#fafafa'; // Return to original color
        }, 1500);
    };
    
    return { 
        init, 
        showLoading, 
        hideLoading, 
        showError, 
        addImagePreview, 
        displayResponse,
        updateButtonState
    };
})();

// App Controller - Main application logic
const AppController = (() => {
    let supabase; // Supabase client

    // Initialize Supabase client
    const initSupabase = () => {
        // Use the same Supabase values from viewer.js
        const SUPABASE_URL = 'https://werpauotigxjkcpfepyx.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlcnBhdW90aWd4amtjcGZlcHl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDEwMTk3MTIsImV4cCI6MjA1NjU5NTcxMn0._s_qAe73bGXEWuI-_ICGZ_AyHb8QN9VZ3fpuSYgG5mM';
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    };

    // Generate a random share ID
    const generateShareId = () => {
        return Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
    };

    // Share the response to Supabase
    const shareResponse = async (question, formattedResponse) => {
        try {
            if (!supabase) {
                initSupabase(); // Initialize Supabase if not already initialized
            }
            const shareId = generateShareId();

            Logger.log(`Sharing response with ID: ${shareId}`);

            const {
                data,
                error
            } = await supabase
                .from('shared_responses')
                .insert([{
                    share_id: shareId,
                    question: question,
                    response: formattedResponse,
                    created_at: new Date()
                }]);

            if (error) throw error;

            Logger.log('Response shared successfully');
            return `${window.location.origin}/view.html?id=${shareId}`;
        } catch (error) {
            Logger.log(`Error sharing response: ${error.message}`);
            throw error;
        }
    };
    // Process user's question
// Process user's question
const processQuestion = async (question, apiKey, modelName) => {
    try {
        UIController.showLoading(); // Sets to "processing" state
        
        Logger.log(`Processing question: ${question}`);
        
        // Only require API key if proxy is disabled
        if (!GeminiAPI.isUsingProxy() && !apiKey) {
            throw new Error('API key is required when not using the proxy');
        }

        // Get search terms from Gemini
        const searchTerms = await GeminiAPI.getSearchTerms(question, apiKey);
        Logger.log(`Using search terms: ${searchTerms.join(', ')}`);
        
        // Update UI state to "finding"
        UIController.updateButtonState('finding');
        
        // Search Wikimedia for each term and collect results
        Logger.log(`Searching Wikimedia for all terms in parallel`);
        const searchPromises = searchTerms.map(term => WikimediaAPI.searchImages(term));
        const searchResults = await Promise.all(searchPromises);
        
        // Flatten and limit results
        let allImageResults = searchResults.flat();
        if (allImageResults.length > 15) {
            Logger.log(`Limiting results to 15 images from ${allImageResults.length} total results`);
            allImageResults = allImageResults.slice(0, 15);
        }
        
        if (allImageResults.length === 0) {
            throw new Error('No images found on Wikimedia for the given search terms');
        }
        
        Logger.log(`Found ${allImageResults.length} total image results`);

        // Get details for each image
        const imageDetailsPromises = allImageResults.map(img => WikimediaAPI.getImageDetails(img.title));
        const imageDetails = (await Promise.all(imageDetailsPromises)).filter(Boolean);
        
        Logger.log(`Successfully retrieved details for ${imageDetails.length} images`);

        // Process each image (convert SVGs to PNGs if needed)
        const processedImages = await processImages(imageDetails);
        
        // Update UI state to "analyzing"
        UIController.updateButtonState('analyzing');
        
        // Analyze images with Gemini
        const geminiResponse = await GeminiAPI.analyzeImages(question, processedImages, apiKey, modelName);
        
        // Format the response
        const formattedResponse = formatResponse(geminiResponse, processedImages);
    
        // Display the response
        UIController.displayResponse(question, formattedResponse);
        
        Logger.log('Question processing completed successfully!');
    } catch (error) {
        Logger.log(`Error: ${error.message}`);
        UIController.hideLoading();
        UIController.showError(error.message);
    } finally {
        UIController.hideLoading();
    }
};
    
    // Process and prepare images for Gemini API
    const processImages = async (imageDetails) => {
        const processedImages = [];
        let totalPayloadSize = 0;
        const MAX_PAYLOAD_SIZE = 17 * 1024 * 1024; // 15MB to be safe (Gemini limit is 20MB)

        for (const img of imageDetails) {
            try {
                // Skip GIF files
                if (img.url.toLowerCase().endsWith('.gif')) {
                    Logger.log(`Skipping GIF file: ${img.title}`);
                    continue;
                }
                
                // Check image size - skip if over 0.5MB
                const isWithinSizeLimit = await ImageProcessor.checkImageSize(img.url);
                if (!isWithinSizeLimit) {
                    Logger.log(`Skipping oversized image: ${img.title} (exceeds 0.5MB)`);
                    continue;
                }
                
                let base64;
                const fileName = img.title.replace(/\s+/g, '_').toLowerCase();
                
                if (img.url.endsWith('.svg')) {
                    base64 = await ImageProcessor.svgToPng(img.url);
                    img.title = fileName.replace('.svg', '.png');
                } else {
                    base64 = await ImageProcessor.getImageBase64(img.url);
                    img.title = fileName;
                }
                
                // Check if adding this image would exceed our payload limit
                const imageSize = ImageProcessor.estimateBase64Size(base64);
                if (totalPayloadSize + imageSize > MAX_PAYLOAD_SIZE) {
                    Logger.log(`Skipping image ${img.title}: would exceed total payload limit`);
                    continue;
                }
                
                totalPayloadSize += imageSize;
                Logger.log(`Added image ${img.title}, size: ${(imageSize / (1024 * 1024)).toFixed(2)}MB, total: ${(totalPayloadSize / (1024 * 1024)).toFixed(2)}MB`);
                
                img.base64 = base64;
                processedImages.push(img);
                
                // Show preview of the image
                UIController.addImagePreview(img);
            } catch (error) {
                Logger.log(`Error processing image ${img.title}: ${error.message}`);
            }
        }

        // Limit to a maximum of 8 images in case we still have too many
        if (processedImages.length > 15) {
            Logger.log(`Limiting from ${processedImages.length} to 15 images to reduce payload size`);
            processedImages.splice(15);
        }

        Logger.log(`Successfully processed ${processedImages.length} images with total payload size: ${(totalPayloadSize / (1024 * 1024)).toFixed(2)}MB`);
        return processedImages;
    };
    
    const formatResponse = (geminiResponse, processedImages) => {
        // Extract image placeholders from the response
        const imagePlaceholders = {};
        const pattern = /\[\[\[(.*?)\]\]\]/g;
        let match;
        let formattedResponse = geminiResponse;
    
        Logger.log("Extracting image placeholders from Gemini response");
        while ((match = pattern.exec(geminiResponse)) !== null) {
            const placeholder = match[0]; // The full [[[filename.png]]] match
            const filename = match[1]; // Just the filename.png part
            imagePlaceholders[placeholder] = filename;
            Logger.log(`Found image placeholder: ${placeholder} -> ${filename}`);
        }
    
        // Log the extracted placeholders for debugging
        Logger.log(`Extracted ${Object.keys(imagePlaceholders).length} image placeholders`);
    
        // First replace our special image placeholders with actual images
        Object.entries(imagePlaceholders).forEach(([placeholder, filename]) => {
            // More flexible matching - normalize both strings and try different forms
            const normalizedFilename = filename.toLowerCase().trim();
            const img = processedImages.find(img => {
                const imgTitle = img.title.toLowerCase();
                return (
                    imgTitle === normalizedFilename || 
                    imgTitle.includes(normalizedFilename) || 
                    normalizedFilename.includes(imgTitle) ||
                    // Remove file extensions for comparison
                    imgTitle.replace(/\.\w+$/, '') === normalizedFilename.replace(/\.\w+$/, '')
                );
            });
            
            if (img) {
                // Create a cleaner caption by removing the alt text from visual display
                // and only showing source and attribution
                const captionElements = [
                    // License info with source prefix only if license is available
                    img.license && img.license !== 'Unknown license' 
                        ? `<small>Source: Wikimedia Commons - ${img.license}</small>` 
                        : '<small>Source: Wikimedia Commons</small>',
                    
                    // Attribution only if available and not empty
                    img.attribution && img.attribution.trim() 
                        ? `<small>Attribution: ${img.attribution}</small>` 
                        : null
                ];
                
                // Filter out null/empty elements and join with line breaks
                const figcaption = captionElements
                    .filter(element => element !== null)
                    .map(element => {
                        // Decode HTML entities that might be present in the text
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = element;
                        return tempDiv.innerHTML;
                    })
                    .join('<br>');
                
                // Clean the alt text by removing newlines and quotes
                const cleanAltText = (img.altText || 'Image from Wikimedia Commons')
                    .replace(/\r?\n|\r/g, ' ')  // Replace newlines with spaces
                    .replace(/"/g, '&quot;')     // Replace quotes with HTML entities
                    .replace(/'/g, '&#39;');     // Replace apostrophes with HTML entities
                
                // Use the original Wikimedia URL instead of base64
                const imgTag = `<figure style="margin: 20px 0;">
                    <img src="${img.url}" alt="${cleanAltText}" style="width:100%; border-radius:5px; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
                    <figcaption style="font-style:italic; font-size:0.9em; color:#555; margin-top:5px;">
                        ${figcaption}
                    </figcaption>
                </figure>`;
                formattedResponse = formattedResponse.replace(placeholder, imgTag);
            } else {
                Logger.log(`Warning: Could not find image for placeholder ${placeholder} with filename ${filename}`);
            }
        });

        // Convert markdown to HTML
        return marked.parse(formattedResponse);
    };
    
    return { processQuestion, shareResponse };
})();

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    const elements = {
        form: document.getElementById('question-form'),
        userQuestionInput: document.getElementById('user-question'),
        submitBtn: document.getElementById('submit-btn'),
        loadingDiv: document.getElementById('loading'),
        responseContainer: document.getElementById('response-container'),
        debugLog: document.getElementById('debug-log'),
        imagePreview: document.getElementById('image-preview'),
        apiKeyInput: document.getElementById('api-key'),
        toggleInfoBtn: document.getElementById('toggle-info'),
        infoContainer: document.getElementById('info-container'),
        modelSelector: document.getElementById('model-selector'),
        useProxyToggle: document.getElementById('use-proxy-toggle')
    };
    
    // Initialize modules
    Logger.init(elements.debugLog);
    UIController.init(elements);
    
    // Make sure proxy is properly initialized on page load
    if (elements.useProxyToggle) {
        // Default to checked/true if available
        elements.useProxyToggle.checked = true;
        
        // Manually update UI to match proxy state
        const apiKeyField = elements.apiKeyInput;
        const apiKeyLabel = apiKeyField.parentElement.querySelector('label');
        
        // Set API key as optional when using proxy (default)
        apiKeyField.required = false;
        apiKeyLabel.innerHTML = 'API Key (optional)';
        apiKeyField.placeholder = 'Optional when using proxy';
        
        // Ensure GeminiAPI knows we're using the proxy by default
        GeminiAPI.setUseProxy(true);
    }
    
    Logger.log('Application initialized and ready!');
});