# Wikimedia Image-Enhanced Q&A Tool

This web application uses Google's Gemini AI to create rich, visual answers to questions by automatically retrieving and incorporating relevant images from Wikimedia Commons.

## Features

- **AI-powered Image Search**: Automatically generates search terms from your question to find relevant images
- **Visual Responses**: Creates comprehensive answers with embedded, relevant images
- **Shareable Results**: Create permanent links to share your Q&A results with others


## How It Works

1. **Search Term Generation**: When you submit a question, Gemini AI intelligently generates relevant search terms
2. **Image Retrieval**: These search terms are used to find appropriate images from Wikimedia Commons
3. **Image Analysis**: Gemini analyzes the images alongside your question to create a visual response
4. **Response Generation**: The AI creates a comprehensive answer that naturally incorporates relevant images with explanatory text

## Getting Started

1. Visit the tool at [https://llm.jonathanpagel.com/](https://llm.jonathanpagel.com/)
2. Type your question in the text box
3. Optionally add your own Gemini API key (get one for free from [Google AI Studio](https://aistudio.google.com/apikey))
4. Choose your preferred Gemini model:
   - **Gemini 2.0 Flash**: Faster responses (default)
   - **Gemini 2.0 Flash-Thinking**: More thoughtful responses with better reasoning
5. Click "Ask Question" and wait for your visual answer!

## Example Questions

The tool works best with questions that can benefit from visual aids:

- "Show me different types of cloud formations"
- "Explain the perceptron in machine learning"
- "How does the human heart work?"
- "What are the main architectural styles throughout history?"
- "Describe the life cycle of a butterfly"

## Technical Details

- **Frontend**: Pure HTML, CSS, and JavaScript
- **AI**: Google Gemini 2.0 models for text and image analysis
- **Image Source**: Wikimedia Commons API
- **Data Storage**: Supabase for storing and sharing responses

