import React, { useState } from 'react';

const ImageSettings = ({ settings, onChange }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleChange = (key, value) => {
    // If changing provider, also update the model to a default for that provider
    if (key === 'provider') {
      const newSettings = { ...settings, [key]: value };
      
      // Set default model based on provider
      if (value === 'openai' && !settings.model.includes('gpt-image') && !settings.model.includes('dall-e')) {
        newSettings.model = 'gpt-image-1';
      } else if (value === 'replicate' && (settings.model.includes('gpt-image') || settings.model.includes('dall-e'))) {
        newSettings.model = 'ideogram-ai/ideogram-v2-turbo';
      }
      
      onChange(newSettings);
    } else {
      onChange({ ...settings, [key]: value });
    }
  };

  return (
    <div className="image-settings">
      <h3 className="text-lg font-semibold text-dark-earth mb-4 flex items-center gap-2 font-sans">
        ⚙️ Settings
      </h3>
      
      <div className="basic-settings space-y-4">
        <div className="setting-group">
          <label className="block text-sm font-medium text-charcoal-gray mb-2 font-sans">Provider</label>
          <div className="grid grid-cols-2 gap-2">
            {['openai', 'replicate'].map(provider => (
              <button
                type="button"
                key={provider}
                className={`py-2.5 px-3 text-sm rounded-lg font-medium transition-all duration-200 font-sans capitalize ${
                  settings.provider === provider 
                    ? 'bg-deep-blue text-white shadow-md' 
                    : 'bg-warm-yellow text-rich-red hover:bg-warm-yellow/80'
                }`}
                onClick={() => handleChange('provider', provider)}
              >
                {provider}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-group">
          <label className="block text-sm font-medium text-charcoal-gray mb-2 font-sans">Image Size</label>
          <div className="grid grid-cols-1 gap-2">
            {['1024x1024', '1024x1536', '1536x1024'].map(size => (
              <button
                type="button"
                key={size}
                className={`py-2.5 px-3 text-sm rounded-lg font-medium transition-all duration-200 font-sans ${
                  settings.size === size 
                    ? 'bg-deep-blue text-white shadow-md' 
                    : 'bg-warm-yellow text-rich-red hover:bg-warm-yellow/80'
                }`}
                onClick={() => handleChange('size', size)}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className="setting-group">
          <label className="block text-sm font-medium text-charcoal-gray mb-2 font-sans">Quality</label>
          <div className="grid grid-cols-2 gap-2">
            {['high', 'standard'].map(quality => (
              <button
                type="button"
                key={quality}
                className={`py-2 px-3 text-sm rounded-lg font-medium capitalize transition-all duration-200 font-sans ${
                  settings.quality === quality 
                    ? 'bg-deep-blue text-white shadow-md' 
                    : 'bg-warm-yellow text-rich-red hover:bg-warm-yellow/80'
                }`}
                onClick={() => handleChange('quality', quality)}
              >
                {quality}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <button
          type="button"
          className="w-full text-sm text-deep-blue hover:text-deep-blue/80 flex items-center justify-center gap-2 py-2 hover:bg-burnt-red/10 text-burnt-red hover:bg-burnt-red/20 transition-colors duration-200 font-sans"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <span className="text-lg">{showAdvanced ? '−' : '+'}</span>
          {showAdvanced ? 'Hide advanced options' : 'Show advanced options'}
        </button>
      </div>

      {showAdvanced && (
        <div className="advanced-settings mt-6 space-y-4 border-t border-soft-gray pt-4">
          <div className="setting-group">
            <label className="block text-sm font-medium text-charcoal-gray mb-2 font-sans">Model</label>
            <select
              className="w-full p-3 border-2 border-soft-gray rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-deep-blue focus:border-transparent transition-all duration-200 font-sans"
              value={settings.model}
              onChange={(e) => handleChange('model', e.target.value)}
            >
              {settings.provider === 'openai' ? (
                // OpenAI models
                <>
                  <option value="gpt-image-1">GPT Image 1</option>
                  <option value="dall-e-3">DALL-E 3</option>
                  <option value="dall-e-2">DALL-E 2</option>
                </>
              ) : (
                // Replicate models
                <>
                  <option value="ideogram-ai/ideogram-v2-turbo">Ideogram v2 Turbo</option>
                  <option value="stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b">Stable Diffusion XL</option>
                  <option value="stability-ai/sdxl-inpainting:e5a34f7f9060b84b497a8c9cf3f12d43ca0c7875a99e7b301a83d81b5c82cdac">SDXL Inpainting</option>
                </>
              )}
            </select>
          </div>

          <div className="setting-group">
            <label className="block text-sm font-medium text-charcoal-gray mb-2 font-sans">Format</label>
            <div className="grid grid-cols-3 gap-2">
              {['png', 'jpeg', 'webp'].map(format => (
                <button
                  type="button"
                  key={format}
                  className={`py-2 px-3 text-sm rounded-lg uppercase font-medium transition-all duration-200 ${
                    settings.format === format 
                      ? 'bg-deep-blue text-white shadow-md' 
                      : 'bg-warm-yellow text-rich-red hover:bg-warm-yellow/80'
                  }`}
                  onClick={() => handleChange('format', format)}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>

          {(settings.format === 'jpeg' || settings.format === 'webp') && (
            <div className="setting-group">
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Compression
                </label>
                <span className="text-xs text-charcoal-gray bg-soft-gray px-2 py-1 rounded">
                  {settings.output_compression}%
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                value={settings.output_compression}
                onChange={(e) => handleChange('output_compression', parseInt(e.target.value))}
                className="w-full h-2 bg-soft-gray rounded-lg appearance-none cursor-pointer slider"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageSettings;
