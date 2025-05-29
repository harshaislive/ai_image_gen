import React, { useState, useRef } from 'react';

const ImageInput = ({ onImageChange, currentImage }) => {
  const [inputType, setInputType] = useState('upload'); // 'upload' or 'url'
  const [imageUrl, setImageUrl] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // Handle file upload
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      processFile(file);
    }
  };

  // Process the selected file
  const processFile = (file) => {
    // Reset URL input when file is uploaded
    setImageUrl('');
    setInputType('upload');
    
    // Call the parent component's handler with the file
    onImageChange(file, null); // Pass file, not URL
  };

  // Handle URL input
  const handleUrlChange = (e) => {
    setImageUrl(e.target.value);
  };

  // Submit URL
  const handleUrlSubmit = () => {
    if (imageUrl.trim()) {
      // Call the parent component's handler with the URL
      onImageChange(null, imageUrl); // Pass URL, not file
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle drag events
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  // Handle drop event
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // Trigger file input click
  const handleButtonClick = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="w-full">
      {/* Tab selector for upload/URL */}
      <div className="flex rounded-t-xl overflow-hidden border-b border-soft-gray mb-2">
        <button
          type="button"
          className={`flex-1 py-2 px-4 text-sm font-medium ${
            inputType === 'upload'
              ? 'bg-deep-blue text-white'
              : 'bg-gray-100 text-charcoal-gray hover:bg-gray-200'
          }`}
          onClick={() => setInputType('upload')}
        >
          Upload Image
        </button>
        <button
          type="button"
          className={`flex-1 py-2 px-4 text-sm font-medium ${
            inputType === 'url'
              ? 'bg-deep-blue text-white'
              : 'bg-gray-100 text-charcoal-gray hover:bg-gray-200'
          }`}
          onClick={() => setInputType('url')}
        >
          Image URL
        </button>
      </div>

      {/* File upload area */}
      {inputType === 'upload' && (
        <div
          className={`border-2 border-dashed rounded-lg p-4 text-center ${
            dragActive ? 'border-deep-blue bg-blue-50' : 'border-soft-gray'
          } transition-all duration-200 cursor-pointer`}
          onClick={handleButtonClick}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          
          {currentImage && inputType === 'upload' ? (
            <div className="flex flex-col items-center">
              <div className="relative w-full max-w-xs mx-auto mb-2">
                <img
                  src={URL.createObjectURL(currentImage)}
                  alt="Uploaded"
                  className="w-full h-auto object-contain rounded-lg border border-soft-gray"
                />
                <button
                  type="button"
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    onImageChange(null, null);
                  }}
                >
                  ×
                </button>
              </div>
              <span className="text-xs text-charcoal-gray">Click to change image</span>
            </div>
          ) : (
            <div className="py-6">
              <div className="text-4xl mb-2">🖼️</div>
              <p className="text-charcoal-gray font-medium">
                Drag & drop an image or click to browse
              </p>
              <p className="text-xs text-charcoal-gray/70 mt-1">
                PNG, JPG, WEBP • Max 4MB
              </p>
            </div>
          )}
        </div>
      )}

      {/* URL input area */}
      {inputType === 'url' && (
        <div className="border border-soft-gray rounded-lg p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={imageUrl}
              onChange={handleUrlChange}
              placeholder="https://example.com/image.jpg"
              className="flex-1 p-2 border border-soft-gray rounded-lg focus:outline-none focus:ring-2 focus:ring-deep-blue"
            />
            <button
              type="button"
              onClick={handleUrlSubmit}
              className="bg-deep-blue text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              disabled={!imageUrl.trim()}
            >
              Use URL
            </button>
          </div>
          
          {currentImage === null && imageUrl && (
            <div className="mt-4">
              <p className="text-xs text-charcoal-gray mb-2">Preview:</p>
              <div className="relative w-full max-w-xs mx-auto">
                <img
                  src={imageUrl}
                  alt="URL Preview"
                  className="w-full h-auto object-contain rounded-lg border border-soft-gray"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNOCAxNkM3LjIgMTYgNi40NjcgMTUuODQgNS44IDE1LjUyQzUuMTMzIDE1LjE4NyA0LjU0IDE0Ljc0IDQuMDIgMTQuMTgzQzMuNTEzIDEzLjYyNyAzLjEgMTIuOTkzIDIuNzggMTIuMjhDMi40NiAxMS41NTMgMi4zIDEwLjggMi4zIDEwQzIuMyA5LjIgMi40NiA4LjQ0NyAyLjc4IDcuNzRDMy4xIDcuMDMzIDMuNTEzIDYuNCA0LjAyIDUuODRDNC41NCA1LjI4IDUuMTMzIDQuODMzIDUuOCA0LjVDNi40NjcgNC4xNjcgNy4yIDQgOCA0QzguOCA0IDkuNTMzIDQuMTY3IDEwLjIgNC41QzEwLjg2NyA0LjgzMyAxMS40NiA1LjI4IDExLjk4IDUuODRDMTIuNSA2LjQgMTIuOTEzIDcuMDMzIDEzLjIyIDcuNzRDMTMuNTQgOC40NDcgMTMuNyA5LjIgMTMuNyAxMEMxMy43IDEwLjggMTMuNTQgMTEuNTUzIDEzLjIyIDEyLjI4QzEyLjkxMyAxMi45OTMgMTIuNSAxMy42MjcgMTEuOTggMTQuMTgzQzExLjQ2IDE0Ljc0IDEwLjg2NyAxNS4xODcgMTAuMiAxNS41MkM5LjUzMyAxNS44NCA4LjggMTYgOCAxNlpNOCA3QzcuNzE3IDcgNy40NzMgNy4wOTMgNy4yNyA3LjI4QzcuMDkgNy40NjcgNyA3LjcgNyA4QzcgOC4zIDcuMDkgOC41NCA3LjI3IDguNzJDNy40NzMgOC45IDcuNzE3IDkgOCA5QzguMyA5IDguNTQgOC45IDguNzIgOC43MkM4LjkgOC41NCA5IDguMyA5IDhDOSA3LjcgOC45IDcuNDY3IDguNzIgNy4yOEM4LjU0IDcuMDkzIDguMyA3IDggN1pNOCAxNEMxMC4yIDE0IDEyITIuMiAxMiAxMEMxMiA3LjggMTAuMiA2IDggNkM1LjggNiA0IDcuOCA0IDEwQzQgMTIuMiA1LjggMTQgOCAxNFoiIGZpbGw9IiNGRjAwMDAiLz48L3N2Zz4=';
                    e.target.alt = 'Invalid image URL';
                  }}
                />
              </div>
            </div>
          )}
          
          <p className="text-xs text-charcoal-gray/70 mt-2">
            Enter a direct link to a publicly accessible image
          </p>
        </div>
      )}
    </div>
  );
};

export default ImageInput;
