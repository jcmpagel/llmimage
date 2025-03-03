document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('question-form');
    const userQuestionInput = document.getElementById('user-question');
    const submitBtn = document.getElementById('submit-btn');
    const loadingDiv = document.getElementById('loading');
    const responseContainer = document.getElementById('response-container');
    const debugLog = document.getElementById('debug-log');
    const imagePreview = document.getElementById('image-preview');
    const apiKeyInput = document.getElementById('api-key');

    // Helper function to log debug messages
    function log(message, data = null) {
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
        debugLog.innerHTML += logMessage + '\n\n';
        debugLog.scrollTop = debugLog.scrollHeight;
    }

    // Function to convert SVG to PNG using canvas
    async function svgToPng(svgUrl) {
        log(`Converting SVG to PNG: ${svgUrl}`);
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
                    log(`Error converting SVG to PNG: ${e.message}`);
                    reject(e);
                }
            };
            img.onerror = (e) => {
                log(`Error loading SVG: ${e.message}`);
                reject(new Error('Failed to load SVG'));
            };
            img.src = svgUrl;
        });
    }

    // Function to get base64 encoding of an image
    async function getImageBase64(url) {
        log(`Getting base64 for image: ${url}`);
        
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
            log(`Error getting image base64: ${error.message}`);
            throw error;
        }
    }

    // Get search terms from Gemini API
    async function getSearchTerms(question, apiKey) {
        log(`Getting search terms for question: ${question}`);
        
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;
        const requestData = {
            contents: [{
                parts: [{
                    text: `Generate 3-5 specific search terms that could be used to find images related to this question on Wikimedia. 
                    Return only the search terms as a comma-separated list, with no other text or explanation:
                    
                    Question: ${question}`
                }]
            }]
        };
        
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
            log(`Received search terms from Gemini: ${searchTermsText}`);
            
            // Parse the comma-separated search terms
            const searchTerms = searchTermsText.split(',').map(term => term.trim());
            return searchTerms;
        } catch (error) {
            log(`Error getting search terms: ${error.message}`);
            throw error;
        }
    }
// Function to search Wikimedia for images
// Function to search Wikimedia for images
async function searchWikimediaImages(searchTerm) {
    log(`Searching Wikimedia for: ${searchTerm}`);
    
    const encodedSearchTerm = encodeURIComponent(searchTerm);
    // Modified query to exclude GIFs and focus on higher quality images
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodedSearchTerm}+filetype:bitmap|drawing+-filetype:gif&srnamespace=6&format=json&origin=*&srlimit=3`;
    
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Wikimedia API error: ${response.status}`);
        }
        
        const data = await response.json();
        log(`Received ${data.query.search.length} results for "${searchTerm}"`);
        
        return data.query.search.map(result => ({
            title: result.title,
            pageId: result.pageid
        }));
    } catch (error) {
        log(`Error searching Wikimedia: ${error.message}`);
        return [];
    }
}

// Function to get image details from Wikimedia
async function getImageDetails(imageTitle) {
    log(`Getting details for image: ${imageTitle}`);
    
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
        log(`Error getting image details: ${error.message}`);
        return null;
    }
}

    // Function to analyze images with Gemini and get response
    async function analyzeImagesWithGemini(question, imageData, apiKey) {
        log(`Analyzing ${imageData.length} images with Gemini`);
        
        // Prepare the system instruction
        const systemInstruction = `You are an assistant that helps answer questions using visual aids. 
    Examine the provided images and use ONLY the ones that are directly relevant to answering the user's question.
    Prioritize images with English text and labels. If an image contains non-English text, either:
    1. Only use it if the visual content is clear without needing to understand the text, or
    2. Skip it in favor of images with English labels or no text dependency.
    
    In your response:
    1. When inserting an image, include it using triple square brackets like this: [[[filename.png]]]
    2. Only include images that directly help explain your answer
    3. Always naturally reference each image in your text before showing it (e.g., "As shown in the image below," or "You can see in the following illustration that...")
    4. Describe specific elements within images when relevant
    5. Make your response feel like a well-written article that integrates visuals with explanatory text
    6. Provide a clear, informative response to the user's question if there is no good image, just provide a pure text answer`;

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
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
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
            log(`Received response from Gemini`);
            
            return answerText;
        } catch (error) {
            log(`Error analyzing images with Gemini: ${error.message}`);
            throw error;
        }
    }

    // Main function to process the user's question
    async function processQuestion(question, apiKey) {
        try {
            responseContainer.innerHTML = '';
            loadingDiv.style.display = 'block';
            debugLog.innerHTML = '';
            imagePreview.innerHTML = '';
            
            log(`Processing question: ${question}`);
            
            if (!apiKey) {
                throw new Error('API key is required');
            }

            // Get search terms from Gemini
            const searchTerms = await getSearchTerms(question, apiKey);
            log(`Using search terms: ${searchTerms.join(', ')}`);
            
            // Search Wikimedia for each term and collect results
            log(`Searching Wikimedia for all terms in parallel`);
            const searchPromises = searchTerms.map(term => searchWikimediaImages(term));
            const searchResults = await Promise.all(searchPromises);
            
            // Flatten and limit results
            let allImageResults = searchResults.flat();
            if (allImageResults.length > 15) {
                log(`Limiting results to 10 images from ${allImageResults.length} total results`);
                allImageResults = allImageResults.slice(0, 15);
            }
            
            if (allImageResults.length === 0) {
                throw new Error('No images found on Wikimedia for the given search terms');
            }
            
            log(`Found ${allImageResults.length} total image results`);

            // Get details for each image
            const imageDetailsPromises = allImageResults.map(img => getImageDetails(img.title));
            const imageDetails = (await Promise.all(imageDetailsPromises)).filter(Boolean);
            
            log(`Successfully retrieved details for ${imageDetails.length} images`);
// Function to check if an image is within size limits
// Function to check if an image is within size limits
async function checkImageSize(url) {
    log(`Checking size for image: ${url}`);
    
    try {
        const response = await fetch(url, { method: 'HEAD' });
        if (!response.ok) {
            throw new Error(`Failed to check image size: ${response.statusText}`);
        }
        
        const contentLength = response.headers.get('content-length');
        if (!contentLength) {
            log('Content-Length header not available, proceeding with caution');
            return true; // Proceed if we can't determine size
        }
        
        const sizeInBytes = parseInt(contentLength, 10);
        const sizeInMB = sizeInBytes / (1024 * 1024);
        
        log(`Image size: ${sizeInMB.toFixed(2)} MB`);
        
        // Return true if image is under 0.5MB to be more conservative
        return sizeInMB <= 0.5;
    } catch (error) {
        log(`Error checking image size: ${error.message}`);
        return false; // Skip image if we can't check size
    }
}

// Add this function to track total payload size
function estimateBase64Size(base64String) {
    // Remove the data:image/... prefix if present
    const base64Data = base64String.split(',')[1] || base64String;
    // Rough estimate: base64 encoded data is about 4/3 the size of binary
    return Math.ceil((base64Data.length * 3) / 4);
}

// Process each image (convert SVGs to PNGs if needed)
const processedImages = [];
let totalPayloadSize = 0;
const MAX_PAYLOAD_SIZE = 15 * 1024 * 1024; // 15MB to be safe (Gemini limit is 20MB)

for (const img of imageDetails) {
    try {
        // Skip GIF files
        if (img.url.toLowerCase().endsWith('.gif')) {
            log(`Skipping GIF file: ${img.title}`);
            continue;
        }
        
        // Check image size - skip if over 0.5MB
        const isWithinSizeLimit = await checkImageSize(img.url);
        if (!isWithinSizeLimit) {
            log(`Skipping oversized image: ${img.title} (exceeds 0.5MB)`);
            continue;
        }
        
        let base64;
        const fileName = img.title.replace(/\s+/g, '_').toLowerCase();
        
        if (img.url.endsWith('.svg')) {
            base64 = await svgToPng(img.url);
            img.title = fileName.replace('.svg', '.png');
        } else {
            base64 = await getImageBase64(img.url);
            img.title = fileName;
        }
        
        // Check if adding this image would exceed our payload limit
        const imageSize = estimateBase64Size(base64);
        if (totalPayloadSize + imageSize > MAX_PAYLOAD_SIZE) {
            log(`Skipping image ${img.title}: would exceed total payload limit`);
            continue;
        }
        
        totalPayloadSize += imageSize;
        log(`Added image ${img.title}, size: ${(imageSize / (1024 * 1024)).toFixed(2)}MB, total: ${(totalPayloadSize / (1024 * 1024)).toFixed(2)}MB`);
        
        img.base64 = base64;
        processedImages.push(img);
        
        // Show preview of the image
        const imgDiv = document.createElement('div');
        imgDiv.className = 'image-item';
        imgDiv.innerHTML = `
            <img src="${base64}" alt="${img.altText}">
            <p>${img.title}</p>
        `;
        imagePreview.appendChild(imgDiv);
    } catch (error) {
        log(`Error processing image ${img.title}: ${error.message}`);
    }
}

// Limit to a maximum of 8 images in case we still have too many
if (processedImages.length > 8) {
    log(`Limiting from ${processedImages.length} to 8 images to reduce payload size`);
    processedImages.splice(8);
}

log(`Successfully processed ${processedImages.length} images with total payload size: ${(totalPayloadSize / (1024 * 1024)).toFixed(2)}MB`);
            
// This section should be properly indented within the processQuestion function
// Analyze images with Gemini
const geminiResponse = await analyzeImagesWithGemini(question, processedImages, apiKey);

// Extract image placeholders from the response
const imagePlaceholders = {};
const pattern = /\[\[\[(.*?)\]\]\]/g;
let match;
let formattedResponse = geminiResponse;

log("Extracting image placeholders from Gemini response");
while ((match = pattern.exec(geminiResponse)) !== null) {
    const placeholder = match[0]; // The full [[[filename.png]]] match
    const filename = match[1]; // Just the filename.png part
    imagePlaceholders[placeholder] = filename;
    log(`Found image placeholder: ${placeholder} -> ${filename}`);
}

// Log the extracted placeholders for debugging
log(`Extracted ${Object.keys(imagePlaceholders).length} image placeholders`);

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
        // Create an array of caption elements that will be filtered to remove empty ones
        const captionElements = [
            // Always include the alt text if available
            img.altText ? `${img.altText}` : null,
            
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
            .join('<br>');
            
        const imgTag = `<figure style="margin: 20px 0;">
            <img src="${img.base64}" alt="${img.altText || 'Image from Wikimedia Commons'}" style="max-width:100%; border-radius:5px; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
            <figcaption style="font-style:italic; font-size:0.9em; color:#555; margin-top:5px;">
                ${figcaption}
            </figcaption>
        </figure>`;
        formattedResponse = formattedResponse.replace(placeholder, imgTag);
    } else {
        log(`Warning: Could not find image for placeholder ${placeholder} with filename ${filename}`);
    }
});

// Convert markdown to HTML
formattedResponse = marked.parse(formattedResponse);

// Display the response
responseContainer.innerHTML = `
    <h2>Answer:</h2>
    <div>${formattedResponse}</div>
`;

// Render any math formulas if MathJax is available
if (window.MathJax) {
    MathJax.typesetPromise([responseContainer]).catch((err) => {
        log(`Error rendering math: ${err.message}`);
    });
}

log('Question processing completed successfully!');
        } catch (error) {
            loadingDiv.style.display = 'none';
            log(`Error: ${error.message}`);
            responseContainer.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        } finally {
            loadingDiv.style.display = 'none';
        }
    }

    // Event listener for form submission
    submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const question = userQuestionInput.value.trim();
        const apiKey = apiKeyInput.value.trim();
        
        if (!question) {
            alert('Please enter a question');
            return;
        }
        
        if (!apiKey) {
            alert('Please enter your Gemini API key');
            return;
        }
        
        processQuestion(question, apiKey);
    });
    
    log('Application initialized and ready!');

    const toggleInfoBtn = document.getElementById('toggle-info');
const infoContainer = document.getElementById('info-container');
    
toggleInfoBtn.addEventListener('click', () => {
    if (infoContainer.style.display === 'none') {
        infoContainer.style.display = 'block';
        toggleInfoBtn.textContent = 'Hide';
    } else {
        infoContainer.style.display = 'none';
        toggleInfoBtn.textContent = 'Show';
    }
});
});