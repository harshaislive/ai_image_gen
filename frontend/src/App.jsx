import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import MaskEditor from './components/MaskEditor';
import ImageSettings from './components/ImageSettings';
import ImageInput from './components/ImageInput';
import FlowiseChatbot from './components/FlowiseChatbot';

// Removed top-level readFileAsDataURL - will define it locally where needed

const DEFAULT_SETTINGS = {
  provider: 'openai', // 'openai' or 'replicate'
  model: 'gpt-image-1', // For OpenAI: 'gpt-image-1', 'dall-e-2', etc. For Replicate: 'ideogram', 'sdxl', etc.
  size: '1024x1024',
  quality: 'high',
  background: 'auto',
  format: 'png',
  output_compression: 100,
  moderation: 'auto',
};

// --- ErrorDisplay Component ---
function ErrorDisplay({ error }) {
  if (!error) return null;
  return (
    <div className="p-4 bg-burnt-red/10 border border-burnt-red rounded-xl">
      <div className="flex items-center gap-2 text-burnt-red font-sans">
        <span className="text-lg">⚠️</span>
        <span className="font-medium">Error</span>
      </div>
      <p className="text-burnt-red text-sm mt-1 font-sans">{error}</p>
    </div>
  );
}

// --- Footer Component ---
function Footer({ model, provider }) {
  return (
    <div className="text-center mt-8 space-y-2 font-sans">
      <div className="text-sm text-gray-500">
        Provider: <span className="font-medium text-charcoal-gray capitalize">{provider || 'openai'}</span> • 
        Model: <span className="font-medium text-charcoal-gray">{model || 'gpt-image-1'}</span>
      </div>
      <div className="text-xs text-charcoal-gray/60 font-sans">
        Built with ❤️ • Powered by {provider === 'replicate' ? 'Replicate' : 'OpenAI'}
      </div>
    </div>
  );
}

// --- GenerateButton Component ---
function GenerateButton({ loading, prompt, file, imageUrl, tab, handleGenerate, timer }) {
  return (
    <button
      type="button"
      className={`w-full py-4 rounded-xl font-semibold text-lg transition-all duration-200 ${
        loading || !prompt || (tab === 'image' && !file && !imageUrl)
          ? 'bg-soft-gray text-gray-400 cursor-not-allowed'
          : 'bg-gradient-to-r from-deep-blue to-dark-blue text-white hover:from-dark-blue hover:to-deep-blue shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
      } font-sans`}
      onClick={handleGenerate}
      disabled={loading || !prompt || (tab === 'image' && !file && !imageUrl)}
    >
      {loading ? (
        <div className="flex items-center justify-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
          {tab === 'text' ? 'Creating Image' : 'Transforming Image'} ({timer}s)
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2">
          {tab === 'text' ? (
            <>
              <span className="text-xl">🚀</span>
              <span>Generate Image from Text</span>
            </>
          ) : (
            <>
              <span className="text-xl">🎨</span>
              <span>Apply AI Edits to Image</span>
            </>
          )}
        </div>
      )}
    </button>
  );
}

// --- Main App Component ---
export default function App() {
  // All state declarations first
  const [tab, setTab] = useState('text'); // 'text', 'image'
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState(null);
  const [file, setFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null); // For image URLs
  const [originalFile, setOriginalFile] = useState(null);
  const [mask, setMask] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const [timerIntervalId, setTimerIntervalId] = useState(null);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [selectedIdeogramImage, setSelectedIdeogramImage] = useState(null);

  // Effect to update selectedIdeogramImage when result changes for Ideogram model
  useEffect(() => {
    if ((tab === 'text' || tab === 'image') && Array.isArray(result) && result.length > 0 && settings.model === 'ideogram') {
      setSelectedIdeogramImage(result[0]);
    } else if (!Array.isArray(result) || settings.model !== 'ideogram') {
      // Clear selection if not Ideogram array result, or if tab changes etc.
      setSelectedIdeogramImage(null);
    }
  }, [result, settings.model, tab]);

  // Memoize object URL for the uploaded image
  const imageObjectUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  // Cleanup object URL when file changes or component unmounts
  useEffect(() => {
    return () => {
      if (imageObjectUrl) {
        URL.revokeObjectURL(imageObjectUrl);
      }
    };
  }, [imageObjectUrl]);

  // --- Generate/Edit Button Handler ---
const handleGenerate = async () => {
    // For image-to-image: log and validate dimensions before sending
    if (tab === 'image' && file && mask) {
      const img = new window.Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const imageWidth = img.naturalWidth;
        const imageHeight = img.naturalHeight;
        const maskImg = new window.Image();
        maskImg.src = mask;
        maskImg.onload = () => {
          const maskWidth = maskImg.naturalWidth;
          const maskHeight = maskImg.naturalHeight;
          if (imageWidth !== maskWidth || imageHeight !== maskHeight) {
            setError('Image and mask must be the same size!');
            setLoading(false);
            return;
          } else {
            setError(''); // Clear any previous errors
            proceedGenerate();
          }
        };
      };
      return;
    }
    proceedGenerate();
  };

  // --- Main Generation/Editing Logic ---
  const proceedGenerate = async () => {
    if (timerIntervalId) {
      clearInterval(timerIntervalId);
    }
    setTimer(0);
    // setSelectedIdeogramImage(null); // This is handled by useEffect watching result

    setLoading(true);
    setError('');
    setResult(null); 

    // Start timer
    let seconds = 0;
    const intervalId = setInterval(() => {
      seconds += 1;
      setTimer(seconds);
    }, 1000);
    setTimerIntervalId(intervalId);

    try {
      // Simple utility function to read file as data URL
      function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      if (settings.provider === 'replicate') {
        // Use Replicate endpoint
        try {
          // Build basic request body
          const reqBody = { prompt, model: settings.model };
          
          // Handle text-to-image vs image-to-image modes
          if (tab === 'text') {
            // Text-to-image: Just use the prompt
            console.log('[REPLICATE] Text-to-image mode with model:', settings.model);
          } else if (tab === 'image') {
            // Image-to-image: Need both image and mask
            console.log('[REPLICATE] Image-to-image mode with model:', settings.model);
            console.log('- File present:', !!file);
            console.log('- Image URL present:', !!imageUrl);
            console.log('- Mask present:', !!mask);
            
            // Check if we have either a file or URL
            if (!file && !imageUrl) {
              setError('Please provide an image (upload or URL) for Replicate inpainting.');
              setLoading(false);
              if (timerIntervalId) clearInterval(timerIntervalId);
              setTimerIntervalId(null);
              setTimer(0);
              return;
            }
            
            // Create placeholder mask if none exists
            if (!mask) {
              console.log('No mask detected, creating a simple placeholder mask');
              // Create a simple placeholder mask
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              
              // Set canvas dimensions
              canvas.width = 512;
              canvas.height = 512;
              
              // Create a simple mask (white background with black circle in center)
              ctx.fillStyle = 'white';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = 'black';
              ctx.beginPath();
              ctx.arc(canvas.width/2, canvas.height/2, 100, 0, Math.PI * 2);
              ctx.fill();
              
              // Convert to data URL
              const placeholderMask = canvas.toDataURL('image/png');
              console.log('Created placeholder mask with length:', placeholderMask.length);
              reqBody.mask = placeholderMask;
            } else {
              reqBody.mask = mask;
            }
            
            // Set the image (either from file or URL)
            if (file) {
              // Convert file to data URL
              const imageDataUrl = await readFileAsDataURL(file);
              reqBody.image = imageDataUrl;
              console.log('- Image data URL length:', imageDataUrl?.length || 0);
            } else if (imageUrl) {
              // Use the URL directly
              reqBody.image = imageUrl;
              console.log('- Using image URL:', imageUrl);
            }
            
            console.log('- Mask data URL length:', reqBody.mask?.length || 0);
          }
          
          // Add optional parameters if present
          if (settings.negative_prompt) reqBody.negative_prompt = settings.negative_prompt;
          if (settings.aspect_ratio) reqBody.aspect_ratio = settings.aspect_ratio;
          if (settings.resolution && settings.resolution !== 'None') reqBody.resolution = settings.resolution;
          if (settings.magic_prompt_option) reqBody.magic_prompt_option = settings.magic_prompt_option;
          if (settings.style_type && settings.style_type !== 'None') reqBody.style_type = settings.style_type;
          if (typeof settings.seed === 'number') reqBody.seed = settings.seed;
          
          // Remove any undefined/null/empty values
          Object.keys(reqBody).forEach(key => {
            if (reqBody[key] === undefined || reqBody[key] === null || reqBody[key] === '') {
              delete reqBody[key];
            }
          });
          
          console.log('Sending request to Replicate with:', Object.keys(reqBody));
          
          const response = await axios.post(
            import.meta.env.VITE_BACKEND_URL + '/api/replicate/ideogram',
            reqBody
          );
          
          // Replicate returns an array of image URLs
          setResult(response.data.output);
          console.log('Received result from Replicate:', response.data.output);
        } catch (err) {
          console.error('Error generating image (Replicate):', err);
          setError(err?.response?.data?.error || 'Failed to generate image (Replicate).');
        } finally {
          setLoading(false);
          if (timerIntervalId) clearInterval(timerIntervalId);
          setTimerIntervalId(null);
          setTimer(0);
        }
      } else {
        // For OpenAI models
        if (tab === 'text') {
          // Text-to-image generation
          try {
            let endpoint = '/api/generate';
            
            // Choose the appropriate endpoint based on provider
            if (settings.provider === 'replicate') {
              console.log('[GENERATE] Using Replicate API for text-to-image');
              endpoint = '/api/replicate/ideogram'; // Use the Replicate endpoint
              
              // Set a default model for Replicate if not already specified
              if (!settings.model || settings.model === 'gpt-image-1') {
                console.log('[GENERATE] Setting default Replicate model to ideogram-ai/ideogram-v2-turbo');
                settings.model = 'ideogram-ai/ideogram-v2-turbo';
              }
            } else {
              console.log('[GENERATE] Using OpenAI API for text-to-image');
            }
            
            const response = await axios.post(
              import.meta.env.VITE_BACKEND_URL + endpoint,
              { prompt, ...settings }
            );
            
            // Handle different response formats
            if (settings.provider === 'replicate') {
              // Replicate returns an output array
              if (response.data.output && response.data.output.length > 0) {
                setResult(response.data.output);
              } else {
                setResult(null);
                setError('No result returned from Replicate');
              }
            } else {
              // OpenAI returns a single image URL
              setResult(response.data.url);
            }
            
            setLoading(false);
            if (timerIntervalId) clearInterval(timerIntervalId);
            setTimerIntervalId(null);
            setTimer(0);
          } catch (err) {
            console.error('Error generating image:', err);
            setError(err?.response?.data?.error || 'Failed to generate image.');
            setLoading(false);
            if (timerIntervalId) clearInterval(timerIntervalId);
            setTimerIntervalId(null);
            setTimer(0);
          }
        } else if (tab === 'image') {
          // Image editing - need either file or URL
          if (!file && !imageUrl) {
            setError('Please provide an image (upload or URL) for editing.');
            setLoading(false);
            if (timerIntervalId) clearInterval(timerIntervalId);
            setTimerIntervalId(null);
            setTimer(0);
            return;
          }
          
          // Need either mask or prompt
          if (!mask && !prompt) {
            setError('Please draw a mask or enter a prompt to edit the image.');
            setLoading(false);
            if (timerIntervalId) clearInterval(timerIntervalId);
            setTimerIntervalId(null);
            setTimer(0);
            return;
          }

          try {
            // Prepare the request body
            const body = { prompt, ...settings };
            
            // Add image from file or URL
            if (file) {
              console.log('[EDIT] Using uploaded file');
              const base64 = await readFileAsDataURL(file);
              body.image = base64;
            } else if (imageUrl) {
              console.log('[EDIT] Using image URL:', imageUrl);
              body.image = imageUrl;
            }
            
            // Add mask if available
            if (mask) body.mask = mask;

            console.log('[EDIT] Preparing request...');
            
            // Choose the appropriate endpoint based on provider
            let endpoint = '/api/edit';
            if (settings.provider === 'replicate') {
              console.log('[EDIT] Using Replicate API for image editing');
              endpoint = '/api/replicate/edit';
            } else {
              console.log('[EDIT] Using OpenAI API for image editing');
            }
            
            const response = await axios.post(
              import.meta.env.VITE_BACKEND_URL + endpoint,
              body
            );
            
            // Handle different response formats
            if (settings.provider === 'replicate') {
              // Replicate returns an output array
              if (response.data.output && response.data.output.length > 0) {
                setResult(response.data.output[0]);
              } else {
                setResult(null);
                setError('No result returned from Replicate');
              }
            } else {
              // OpenAI returns a single image URL
              setResult(response.data.image);
            }
            
            setLoading(false);
            if (timerIntervalId) clearInterval(timerIntervalId);
            setTimerIntervalId(null);
            setTimer(0);
          } catch (err) {
            console.error('Error during image edit:', err);
            setError(err?.response?.data?.error || 'Failed to edit image.');
            setLoading(false);
            if (timerIntervalId) clearInterval(timerIntervalId);
            setTimerIntervalId(null);
            setTimer(0);
          }
        }
      }
    } catch (err) {
      console.error('Error in proceedGenerate:', err);
      setError(err?.response?.data?.error || 'An unexpected error occurred.');
      setLoading(false);
      if (timerIntervalId) clearInterval(timerIntervalId);
      setTimerIntervalId(null);
      setTimer(0);
    }
  };

  // Handle image input changes (file or URL)
  const handleImageChange = (newFile, newUrl) => {
    // Reset previous state
    setResult(null);
    setMask(null);
    setError('');
    
    if (newFile) {
      // Handle file upload
      setFile(newFile);
      setOriginalFile(newFile);
      setImage(URL.createObjectURL(newFile));
      setImageUrl(null); // Clear URL when file is uploaded
    } else if (newUrl) {
      // Handle image URL
      setImageUrl(newUrl);
      setFile(null); // Clear file when URL is used
      setOriginalFile(null);
      setImage(null); // Don't create object URL for remote images
    } else {
      // Reset everything if both are null
      setFile(null);
      setOriginalFile(null);
      setImage(null);
      setImageUrl(null);
    }
  };

  // --- Utility: Download Image ---
  const downloadImage = (dataUrl, filename) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Main Render ---
  return (
    <div className="min-h-screen font-sans bg-off-white bg-[url('/brand-bg.jpg')] bg-cover bg-center bg-no-repeat flex flex-col items-center justify-center py-8">
      <FlowiseChatbot />
      <div className="w-full max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-dark-earth mb-2 font-sans">OpenAI Playground</h1>
          <p className="text-charcoal-gray font-sans">Replicate-style image generation & inpainting</p>
        </div>
        <div className="flex flex-col lg:flex-row gap-4 md:gap-6 mb-8">
          {/* Left Panel: Preview & Mask Editor */}
          <div className="flex-1 bg-off-white rounded-2xl shadow-xl p-4 md:p-6 border border-soft-gray overflow-hidden">
            {/* Tab Selector with Descriptions */}
            <div className="mb-8">
              {/* Tab Navigation */}
              <div className="flex border-b-2 border-soft-gray font-sans">
                <button
                  type="button"
                  className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                    tab === 'text'
                      ? 'bg-off-white text-deep-blue shadow-md font-sans'
                      : 'text-charcoal-gray font-sans hover:text-gray-800'
                  }`}
                  onClick={() => { setTab('text'); setResult(null); setError(''); }}
                >
                  ✨ Text to Image
                </button>
                <button
                  type="button"
                  className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                    tab === 'image'
                      ? 'bg-off-white text-deep-blue shadow-md font-sans'
                      : 'text-charcoal-gray font-sans hover:text-gray-800'
                  }`}
                  onClick={() => { setTab('image'); setResult(null); setError(''); }}
                >
                  🖼️ Image to Image
                </button>
              </div>
            </div>
            {/* --- Tab Content Start --- */}
            {/* TEXT TO IMAGE TAB */}
            {tab === 'text' && (
              <div className="space-y-6">
                {/* Loading State */}
                {loading && (
                  <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-deep-blue"></div>
                  </div>
                )}

                {/* Single Image Result (OpenAI) */}
                {!loading && result && typeof result === 'string' && settings.provider === 'openai' && (
                  <div className="space-y-4">
                    <div className="relative rounded-xl overflow-hidden border border-soft-gray bg-off-white">
                      <img
                        src={result}
                        alt="Generated image"
                        className="w-full h-auto object-contain max-h-[512px]"
                      />
                    </div>
                    <div className="flex flex-wrap gap-3 justify-center">
                      <button
                        type="button"
                        onClick={() => downloadImage(result, 'generated-image.png')}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-deep-blue text-white rounded-lg hover:bg-dark-blue transition-colors duration-200 text-sm"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Download Image
                      </button>
                    </div>
                  </div>
                )}

                {/* Gallery Result (Replicate) */}
                {!loading && Array.isArray(result) && settings.provider === 'replicate' && result.length > 0 && (
                  <div className="space-y-4">
                    <div className="relative rounded-xl overflow-hidden border border-soft-gray bg-off-white">
                      <img 
                        src={selectedIdeogramImage || result[0]} 
                        alt="Selected Ideogram image" 
                        className="w-full h-auto object-contain max-h-[480px]" 
                      />
                    </div>
                    {result.length > 1 && (
                      <div className="flex flex-wrap gap-2 justify-center p-2 bg-soft-gray/20 rounded-lg">
                        {result.map((imgUrl, idx) => (
                          <button 
                            key={idx} 
                            onClick={() => setSelectedIdeogramImage(imgUrl)} 
                            className={`w-16 h-16 rounded-md overflow-hidden border-2 ${selectedIdeogramImage === imgUrl ? 'border-deep-blue' : 'border-transparent'} hover:border-deep-blue transition-all duration-150 ease-in-out`}
                          >
                            <img src={imgUrl} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3 justify-center">
                      <button
                        type="button"
                        onClick={() => downloadImage(selectedIdeogramImage || result[0], 'ideogram-image.png')}
                        disabled={!(selectedIdeogramImage || (result && result.length > 0 && result[0]))}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-deep-blue text-white rounded-lg hover:bg-dark-blue transition-colors duration-200 text-sm disabled:bg-gray-300"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Download Selected
                      </button>
                    </div>
                  </div>
                )}

                {/* Placeholder when no result and not loading */}
                {!loading && !result && (
                  <div className="border-2 border-dashed border-soft-gray rounded-xl p-8 text-center">
                    <div className="w-16 h-16 bg-soft-gray/30 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-charcoal-gray">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.847a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                    </div>
                    <h3 className="font-medium text-charcoal-gray mb-2 font-sans">Create Amazing Images from Text</h3>
                    <p className="text-sm text-charcoal-gray/60 mb-4 font-sans">
                      Describe what you want to see and AI will generate a unique image for you.
                    </p>
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-charcoal-gray/60">
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <strong className="text-blue-800">Style Examples:</strong>
                        <div className="mt-1">photorealistic, artistic, cartoon, oil painting, watercolor</div>
                      </div>
                      <div className="bg-purple-50 p-3 rounded-lg">
                        <strong className="text-purple-800">Composition:</strong>
                        <div className="mt-1">close-up, wide shot, aerial view, macro photography</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* IMAGE TO IMAGE TAB */}
            {tab === 'image' && (
              <div className="space-y-6">
                {/* If no image (file or URL) is provided, show upload prompt and ImageInput */}
                {!file && !imageUrl && (
                  <>
                    <div className="space-y-4">
                      <label className="block text-charcoal-gray font-medium mb-2 font-sans">Upload Image or Enter URL</label>
                      <ImageInput 
                        onImageChange={handleImageChange}
                        currentImage={file}
                      />
                    </div>
                    <div className="border-2 border-dashed border-soft-gray rounded-xl p-8 text-center">
                      <div className="w-16 h-16 bg-soft-gray/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-charcoal-gray">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                      </svg>
                    </div>
                    <h3 className="font-medium text-charcoal-gray mb-2 font-sans">Step 1: Upload Your Image</h3>
                    <p className="text-sm text-charcoal-gray/60 mb-4 font-sans">
                      Upload an image to start editing with AI. Supported formats: PNG, JPG, WEBP (max 4MB)
                    </p>
                    <div className="mt-6 flex justify-center">
                      <div className="flex items-center gap-2 text-xs text-charcoal-gray/60">
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">1. Upload</span>
                        <span>→</span>
                        <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">2. Draw Mask</span>
                        <span>→</span>
                        <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded">3. Describe</span>
                        <span>→</span>
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded">4. Generate</span>
                      </div>
                    </div>
                  </div>
                  </>
                )}
                {/* If image (file or URL) is provided, show mask editor UI and then results below */}
                {(file || imageUrl) && (
                  <div className="space-y-6"> {/* Outer container for active image editing/viewing */}
                    {/* START: Mask Editor UI (always shown if file/imageUrl is present) */}
                    <div className="space-y-4"> 
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-medium text-charcoal-gray font-sans">Step 2: Draw Your Mask</h3>
                        <button
                          type="button"
                          onClick={() => {
                            setFile(null);
                            setOriginalFile(null);
                            setImage(null);
                            setImageUrl(null);
                            setMask(null);
                            setResult(null); // Clear result when changing image
                          }}
                          className="text-sm text-deep-blue hover:text-dark-blue transition-colors duration-200 font-sans"
                        >
                          Change Image
                        </button>
                      </div>
                      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-3 border border-purple-100">
                        <p className="text-sm text-charcoal-gray">
                          <strong>Instructions:</strong> Draw on the areas you want to edit or change. White areas will be modified by AI, black areas will remain unchanged.
                        </p>
                      </div>
                      <div className="space-y-4">
                        {/* Mask Editor - Single Column */}
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-charcoal-gray">Draw Your Mask</h4>
                          <div className="relative rounded-xl overflow-hidden border border-soft-gray bg-off-white">
                            <MaskEditor imageUrl={file ? imageObjectUrl : imageUrl} onMaskChange={setMask} />
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* END: Mask Editor UI */}

                    {/* START: Results Display Area (conditional) */}
                    {/* Loading State for results on this tab */}
                    {loading && (
                      <div className="flex justify-center items-center h-64 mt-4">
                        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-deep-blue"></div>
                      </div>
                    )}

                    {/* OpenAI Edit Result Display */}
                    {!loading && result && typeof result === 'string' && settings.provider === 'openai' && (
                      <div className="space-y-4 mt-6 pt-6 border-t border-soft-gray">
                        <h3 className="text-lg font-medium text-charcoal-gray font-sans">Generated Result</h3>
                        <div className="relative rounded-xl overflow-hidden border border-soft-gray bg-off-white">
                          <img src={result} alt="Generated result" className="w-full h-auto object-contain max-h-[512px]" />
                        </div>
                        <div className="flex flex-wrap gap-3 justify-center">
                          <button
                            type="button"
                            onClick={() => downloadImage(result, 'generated-image.png')}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-deep-blue text-white rounded-lg hover:bg-dark-blue transition-colors duration-200 text-sm"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                            Download Result
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                fetch(result)
                                  .then(res => res.blob())
                                  .then(blob => {
                                    const newFile = new File([blob], "generated-image.png", { type: "image/png" });
                                    setFile(newFile);
                                    setOriginalFile(newFile); 
                                    setImage(URL.createObjectURL(newFile)); 
                                    setResult(null); 
                                    setMask(null); 
                                  });
                              } catch (err) {
                                setError("Couldn't prepare image for editing");
                              }
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 text-sm"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a2.25 2.25 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                            Edit This Result
                          </button>
                          <button
                            type="button"
                            onClick={() => setResult(null)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 text-charcoal-gray rounded-lg hover:bg-gray-300 transition-colors duration-200 text-sm"
                          >
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                               <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                             </svg>
                            Clear Result
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Replicate Result Display */}
                    {!loading && result && settings.provider === 'replicate' && (
                      <div className="space-y-4 mt-6 pt-6 border-t border-soft-gray">
                        <h3 className="text-lg font-medium text-charcoal-gray font-sans">Replicate Generated Result</h3>
                        <div className="relative rounded-xl overflow-hidden border border-soft-gray bg-off-white">
                          <img 
                            src={Array.isArray(result) ? (selectedIdeogramImage || result[0]) : result} 
                            alt="Generated result" 
                            className="w-full h-auto object-contain max-h-[480px]" 
                          />
                        </div>
                        {Array.isArray(result) && result.length > 1 && (
                          <div className="flex flex-wrap gap-2 justify-center p-2 bg-soft-gray/20 rounded-lg">
                            {result.map((imgUrl, idx) => (
                              <button 
                                key={idx} 
                                onClick={() => setSelectedIdeogramImage(imgUrl)} 
                                className={`w-16 h-16 rounded-md overflow-hidden border-2 ${selectedIdeogramImage === imgUrl ? 'border-deep-blue' : 'border-transparent'} hover:border-deep-blue transition-all duration-150 ease-in-out`}
                              >
                                <img src={imgUrl} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-3 justify-center">
                          <button 
                            type="button" 
                            onClick={() => downloadImage(Array.isArray(result) ? (selectedIdeogramImage || result[0]) : result, 'replicate-image.png')} 
                            disabled={!result}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-deep-blue text-white rounded-lg hover:bg-dark-blue transition-colors duration-200 text-sm disabled:bg-gray-300"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                            Download Selected
                          </button>
                          <button
                            type="button"
                            onClick={() => setResult(null)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 text-charcoal-gray rounded-lg hover:bg-gray-300 transition-colors duration-200 text-sm"
                          >
                            Clear Results
                          </button>
                        </div>
                      </div>
                    )}
                    {/* END: Results Display Area */}
                  </div>
                )}
              </div>
            )}
            {/* --- Tab Content End --- */}
          </div>
          {/* Right Panel: Controls */}
          <div className="w-full lg:w-96 bg-off-white rounded-2xl shadow-xl p-4 md:p-6 border border-soft-gray flex flex-col gap-4 md:gap-6 overflow-hidden">
            <ImageSettings settings={settings} onChange={setSettings} />
            <div>
              <label className="block text-charcoal-gray font-medium mb-2 font-sans flex items-center gap-2">
                {tab === 'text' ? (
                  <>
                    <span className="text-lg">✨</span>
                    <span>Describe your image</span>
                  </>
                ) : (
                  <>
                    <span className="text-lg">🎨</span>
                    <span>Describe your edits</span>
                  </>
                )}
              </label>
              <textarea
                className="w-full p-4 border-2 border-soft-gray rounded-xl focus:outline-none focus:ring-2 focus:ring-deep-blue focus:border-transparent resize-none transition-all duration-200 font-sans"
                rows={4}
                placeholder={
                  tab === 'text'
                    ? 'A majestic lion in a golden savanna at sunset, photorealistic, cinematic lighting...'
                    : mask
                      ? 'Change the masked area to a starry night sky, add floating balloons, remove the tree...'
                      : 'First draw a mask on your image, then describe what changes you want in the masked area...'
                }
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
              />
              {/* Helpful hints based on tab */}
              <div className="mt-2 text-xs text-charcoal-gray/60">
                {tab === 'text' && (
                  <p>💡 <strong>Tip:</strong> Be specific about style, lighting, and composition for better results</p>
                )}
                {tab === 'image' && !mask && (
                  <p>⚠️ <strong>Note:</strong> Draw a mask on your image first to specify which areas to edit</p>
                )}
                {tab === 'image' && mask && (
                  <p>✅ <strong>Ready:</strong> Describe what you want to change in the masked area</p>
                )}
              </div>
            </div>
            <GenerateButton
              loading={loading}
              prompt={prompt}
              file={file}
              imageUrl={imageUrl}
              tab={tab}
              handleGenerate={handleGenerate}
              timer={timer}
            />
            {(tab === 'image' && !file && !imageUrl && !loading) && (
              <p className="text-xs text-center text-charcoal-gray/60 mt-2">
                Upload an image or enter a URL above to enable AI editing
              </p>
            )}
            {(tab === 'image' && (file || imageUrl) && !mask && !loading) && (
              <p className="text-xs text-center text-orange-600 mt-2 flex items-center justify-center gap-1">
                <span>⚠️</span>
                <span>Draw a mask on your image to specify edit areas</span>
              </p>
            )}
            <ErrorDisplay error={error} />
            {/* Ideogram results are now shown in the main panel for Text-to-Image tab */}
          </div>
        </div>
        <Footer model={settings.model} provider={settings.provider} />
      </div>
    </div>
  );
}