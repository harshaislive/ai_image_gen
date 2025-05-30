import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import MaskEditor from './components/MaskEditor';
import ImageSettings from './components/ImageSettings';
import FlowiseChatbot from './components/FlowiseChatbot';

const DEFAULT_SETTINGS = {
  model: 'gpt-image-1',
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
function Footer({ model }) {
  return (
    <div className="text-center mt-8 space-y-2 font-sans">
      <div className="text-sm text-gray-500">
        Model: <span className="font-medium text-charcoal-gray">{model || 'gpt-image-1'}</span>
      </div>
      <div className="text-xs text-charcoal-gray/60 font-sans">
        Built with ❤️ • Powered by OpenAI
      </div>
    </div>
  );
}

// --- GenerateButton Component ---
function GenerateButton({ loading, prompt, file, tab, handleGenerate, timer }) {
  return (
    <button
      type="button"
      className={`w-full py-4 rounded-xl font-semibold text-lg transition-all duration-200 ${
        loading || !prompt || (tab === 'image' && !file)
          ? 'bg-soft-gray text-gray-400 cursor-not-allowed'
          : 'bg-gradient-to-r from-deep-blue to-dark-blue text-white hover:from-dark-blue hover:to-deep-blue shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
      } font-sans`}
      onClick={handleGenerate}
      disabled={loading || !prompt || (tab === 'image' && !file)}
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
  const [tab, setTab] = useState('text'); // 'text', 'image', 'mask'
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState(null);
  const [file, setFile] = useState(null);
  const [originalFile, setOriginalFile] = useState(null);
  const [mask, setMask] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const [timerIntervalId, setTimerIntervalId] = useState(null);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

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
            proceedGenerate();
          }
        };
      };
      return;
    }
    proceedGenerate();
  };

  const proceedGenerate = async () => {
    setError('');
    setLoading(true);
    setResult(null);
    setTimer(0);
    if (timerIntervalId) clearInterval(timerIntervalId);
    const intervalId = setInterval(() => setTimer(prevTimer => prevTimer + 1), 1000);
    setTimerIntervalId(intervalId);
    try {
      if (tab === 'text') {
        const res = await axios.post('/api/generate', { prompt, ...settings });
        setResult(res.data.image);
      } else {
        if (!originalFile) throw new Error('Please upload an image.');
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64 = reader.result;
            const body = { prompt, image: base64, ...settings };
            if (mask) body.mask = mask;
            const res = await axios.post('/api/edit', body);
            setResult(res.data.image);
          } catch (err) {
            setError('Failed to edit image.');
          } finally {
            setLoading(false);
            if (timerIntervalId) clearInterval(timerIntervalId);
            setTimerIntervalId(null);
            setTimer(0);
          }
        };
        reader.readAsDataURL(file);
        return;
      }
    } catch (err) {
      setError('Failed to generate image.');
    } finally {
      if (tab === 'text') {
        setLoading(false);
        if (timerIntervalId) clearInterval(timerIntervalId);
        setTimerIntervalId(null);
        setTimer(0);
      }
    }
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setOriginalFile(e.target.files[0]);
    setImage(URL.createObjectURL(e.target.files[0]));
    setMask(null);
    setResult(null);
    setError('');
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

  // --- Utility: Apply Mask to Image ---
  const applyMaskToImage = (imageSrc, maskSrc) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new window.Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        const maskImage = new window.Image();
        maskImage.crossOrigin = 'Anonymous';
        maskImage.onload = () => {
          if (img.width !== maskImage.width || img.height !== maskImage.height) {
            setError('Image and mask dimensions must match to create masked image.');
            resolve(null);
            return;
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          ctx.globalCompositeOperation = 'destination-in';
          ctx.drawImage(maskImage, 0, 0);
          ctx.globalCompositeOperation = 'source-over';
          resolve(canvas.toDataURL('image/png'));
        };
        maskImage.onerror = () => {
          setError('Failed to load mask image.');
          resolve(null);
        };
        maskImage.src = maskSrc;
      };
      img.onerror = () => {
        setError('Failed to load original image.');
        resolve(null);
      };
      img.src = imageSrc;
    });
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
                <button
                  type="button"
                  className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                    tab === 'mask'
                      ? 'bg-off-white text-deep-blue shadow-md font-sans'
                      : 'text-charcoal-gray font-sans hover:text-gray-800'
                  }`}
                  onClick={() => { setTab('mask'); setResult(null); setError(''); }}
                >
                  🎭 Mask & Download
                </button>
              </div>
            </div>
            {/* --- Tab Content Start --- */}
            {/* TEXT TO IMAGE TAB */}
            {tab === 'text' && (
              <div className="space-y-6">
                {/* Generated Result Display */}
                {result && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-charcoal-gray font-sans">Generated Image</h3>
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
                {/* Placeholder when no result */}
                {!result && !loading && (
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
                {/* Upload Area */}
                <div className="space-y-4">
                  <label className="block text-charcoal-gray font-medium mb-2 font-sans">Upload Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-charcoal-gray file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-warm-yellow file:text-rich-red hover:file:bg-warm-yellow/80 file:cursor-pointer cursor-pointer font-sans"
                  />
                </div>
                {/* If no file uploaded, show upload prompt */}
                {!file && (
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
                )}
                {/* If file uploaded, show mask editor and preview */}
                {file && (
                  <div className="space-y-6">
                    {/* Mask Editor Section */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-medium text-charcoal-gray font-sans">Step 2: Draw Your Mask</h3>
                        <button
                          type="button"
                          onClick={() => {
                            setFile(null);
                            setOriginalFile(null);
                            setImage(null);
                            setMask(null);
                            setResult(null);
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
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Original Image Preview */}
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-charcoal-gray">Original Image</h4>
                          <div className="relative rounded-xl overflow-hidden border border-soft-gray bg-off-white">
                            <img
                              src={URL.createObjectURL(file)}
                              alt="Original image"
                              className="w-full h-auto object-contain max-h-[400px]"
                            />
                          </div>
                        </div>
                        {/* Mask Editor */}
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-charcoal-gray">Draw Your Mask</h4>
                          <MaskEditor imageUrl={imageObjectUrl} onMaskChange={setMask} />
                        </div>
                      </div>
                    </div>
                    {/* Generated Result Display */}
                    {result && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-medium text-charcoal-gray font-sans">Generated Result</h3>
                        <div className="relative rounded-xl overflow-hidden border border-soft-gray bg-off-white">
                          <img
                            src={result}
                            alt="Generated result"
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
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                            Edit This Result
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* MASK & DOWNLOAD TAB */}
            {tab === 'mask' && (
              <div className="space-y-6">
                {/* Upload Area */}
                {!originalFile && (
                  <div className="border-2 border-dashed border-soft-gray rounded-xl p-8 text-center">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                      id="maskTabImageUpload"
                    />
                    <label
                      htmlFor="maskTabImageUpload"
                      className="cursor-pointer flex flex-col items-center justify-center gap-3"
                    >
                      <div className="w-16 h-16 bg-soft-gray/30 rounded-full flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-charcoal-gray">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-charcoal-gray font-sans">Upload an image to create masks</p>
                        <p className="text-sm text-charcoal-gray/60 mt-1 font-sans">PNG, JPG, or WEBP (max 4MB)</p>
                      </div>
                    </label>
                    <div className="mt-6 flex justify-center">
                      <div className="flex items-center gap-2 text-xs text-charcoal-gray/60">
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">1. Upload</span>
                        <span>→</span>
                        <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">2. Draw Mask</span>
                        <span>→</span>
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded">3. Download</span>
                      </div>
                    </div>
                  </div>
                )}
                {/* Mask Editor & Download Buttons */}
                {originalFile && (
                  <div className="space-y-6">
                    {/* Mask Editor */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-medium text-charcoal-gray font-sans">Edit Mask</h3>
                        <button
                          type="button"
                          onClick={() => {
                            setOriginalFile(null);
                            setFile(null);
                            setImage(null);
                            setMask(null);
                          }}
                          className="text-sm text-deep-blue hover:text-dark-blue transition-colors duration-200 font-sans"
                        >
                          Change Image
                        </button>
                      </div>
                      <div className={`grid grid-cols-1 ${mask ? 'md:grid-cols-2' : 'md:grid-cols-1'} gap-4 md:gap-6 mb-6`}>
                        {/* Mask Editor - Full width when no mask */}
                        <div className={`space-y-4 overflow-hidden ${!mask ? 'col-span-full w-full mx-auto max-w-3xl' : ''}`}>
                          <MaskEditor imageUrl={URL.createObjectURL(originalFile)} onMaskChange={setMask} />
                        </div>
                        {/* Preview Area (if mask exists) */}
                        {mask && (
                          <div className="space-y-4">
                            <div className="flex justify-between items-center">
                              <h3 className="text-lg font-medium text-charcoal-gray font-sans">Mask Preview</h3>
                              <button
                                type="button"
                                onClick={() => downloadImage(mask, 'mask.png')}
                                className="text-sm text-deep-blue hover:text-dark-blue transition-colors duration-200 flex items-center gap-1 font-sans"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                                Download
                              </button>
                            </div>
                            <div className="relative rounded-xl overflow-hidden border border-soft-gray bg-off-white w-full">
                              <img
                                src={mask}
                                alt="Mask preview"
                                className="w-full h-auto object-contain max-h-[512px]"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Download Buttons */}
                    {mask && (
                      <div className="flex flex-wrap gap-3 justify-center">
                        <button
                          type="button"
                          onClick={() => downloadImage(mask, 'mask.png')}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-deep-blue text-white rounded-xl hover:bg-dark-blue transition-colors duration-200 shadow-md hover:shadow-lg font-sans"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                          Download Mask
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const maskedImg = await applyMaskToImage(URL.createObjectURL(originalFile), mask);
                            if (maskedImg) downloadImage(maskedImg, 'masked-image.png');
                          }}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-forest-green text-white rounded-xl hover:bg-opacity-80 transition-colors duration-200 shadow-md hover:shadow-lg font-sans"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                          Download Masked Image
                        </button>
                      </div>
                    )}
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
              tab={tab}
              handleGenerate={handleGenerate}
              timer={timer}
            />
            {(tab === 'image' && !file && !loading) && (
              <p className="text-xs text-center text-charcoal-gray/60 mt-2">
                Upload an image above to enable AI editing
              </p>
            )}
            {(tab === 'image' && file && !mask && !loading) && (
              <p className="text-xs text-center text-orange-600 mt-2 flex items-center justify-center gap-1">
                <span>⚠️</span>
                <span>Draw a mask on your image to specify edit areas</span>
              </p>
            )}
            <ErrorDisplay error={error} />
          </div>
        </div>
        <Footer model={settings.model} />
      </div>
    </div>
  );
}