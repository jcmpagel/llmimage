// viewer.js
document.addEventListener('DOMContentLoaded', async () => {
    const loadingElement = document.getElementById('loading');
    const errorElement = document.getElementById('error');
    const sharedContentElement = document.getElementById('shared-content');
    const questionElement = document.getElementById('question');
    const responseElement = document.getElementById('response');
    
    // Define helper functions first
    function showError(message) {
        loadingElement.style.display = 'none';
        errorElement.style.display = 'block';
        errorElement.textContent = message;
    }
    
    const incrementViewCount = async (shareId) => {
        try {
            await supabase.rpc('increment_view', { share_id_param: shareId });
            console.log('View count incremented');
        } catch (error) {
            console.error('Error incrementing view count:', error);
        }
    };
    
    // Initialize Supabase client
    const SUPABASE_URL = 'https://werpauotigxjkcpfepyx.supabase.co'; // You'll need to replace this
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlcnBhdW90aWd4amtjcGZlcHl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDEwMTk3MTIsImV4cCI6MjA1NjU5NTcxMn0._s_qAe73bGXEWuI-_ICGZ_AyHb8QN9VZ3fpuSYgG5mM'; // You'll need to replace this
    
    let supabase;
    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (error) {
        showError('Error initializing Supabase client.');
        return;
    }
    
    // Get the share ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('id');
    
    if (!shareId) {
        showError('No share ID provided. Please check your link.');
        return;
    }
    
    try {
        // Fetch shared content from Supabase
        const { data, error } = await supabase
            .from('shared_responses')
            .select('question, response, created_at')
            .eq('share_id', shareId)
            .single();
        
        if (error) throw error;
        
        if (!data) {
            showError('Shared content not found or has expired.');
            return;
        }
        
        // Display the shared content
        questionElement.textContent = data.question;
        responseElement.innerHTML = data.response;
        
        // Show the content, hide loading
        loadingElement.style.display = 'none';
        sharedContentElement.style.display = 'block';
        
        // Render any math if MathJax is available
        if (window.MathJax) {
            MathJax.typesetPromise([responseElement]).catch(err => {
                console.error('Error rendering math:', err);
            });
        }
        
        // Set document title to include question
        document.title = `${data.question.substring(0, 50)}... | Wikimedia Q&A`;
        
        // Increment view count
        incrementViewCount(shareId);
        
    } catch (error) {
        showError(`Error loading shared content: ${error.message}`);
    }
});