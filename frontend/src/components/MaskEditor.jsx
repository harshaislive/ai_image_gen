import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Image, Line } from 'react-konva';
import useImage from 'use-image';

const MaskEditor = ({ imageUrl, onMaskChange }) => {
  const [image] = useImage(imageUrl);
  const [lines, setLines] = useState([]);
  const [linesHistory, setLinesHistory] = useState([]); 
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('brush');
  const [brushSize, setBrushSize] = useState(20);
  const [isMaskInverted, setIsMaskInverted] = useState(false);
  const stageRef = useRef(null);
  const [stageSize, setStageSize] = useState({ width: 512, height: 512 });
  const [imageSize, setImageSize] = useState({ width: 512, height: 512 });
  const maskGenerationTimeoutRef = useRef(null);
  
  // Clear lines and history when the image URL changes
  useEffect(() => {
    setLines([]);
    setLinesHistory([]);
    setIsMaskInverted(false);
    // Clear any pending mask generation
    if (maskGenerationTimeoutRef.current) {
      clearTimeout(maskGenerationTimeoutRef.current);
    }
    // Also clear mask when image changes
    onMaskChange(null);
  }, [imageUrl, onMaskChange]);

  // Stage container reference to get dimensions
  const containerRef = useRef(null);
  
  // Function to calculate proper dimensions
  const calculateDimensions = useCallback(() => {
    if (!image || !containerRef.current) return;
    
    const containerWidth = containerRef.current.clientWidth;
    const windowHeight = window.innerHeight;
    const maxHeight = Math.min(600, windowHeight * 0.7);
    
    // Store original image dimensions for mask generation
    setImageSize({ width: image.width, height: image.height });
    
    // Calculate aspect ratio and dimensions
    const aspectRatio = image.width / image.height;
    
    // First try to fit width
    let width = containerWidth - 2;
    let height = width / aspectRatio;
    
    // If height exceeds max, constrain by height instead
    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspectRatio;
    }
    
    // Make sure we don't exceed the container's dimensions
    width = Math.min(width, containerWidth);
    
    setStageSize({ width, height });
  }, [image]);
  
  // Resize stage based on image dimensions
  useEffect(() => {
    if (image) {
      calculateDimensions();
      // Also recalculate on window resize
      const handleResize = () => calculateDimensions();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [image, calculateDimensions]);

  const handleMouseDown = (e) => {
    e.evt.preventDefault(); // Prevent default browser behavior
    if (!image) return;
    setIsDrawing(true);
    
    // Save current lines state for undo functionality
    setLinesHistory(prev => [...prev, [...lines]]);
    
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;
    
    // Add new line with current tool and brush size
    const newLine = { 
      tool, 
      points: [pos.x, pos.y], 
      brushSize,
      id: Date.now() // Add unique ID for better tracking
    };
    setLines(prev => [...prev, newLine]);
  };

  const handleMouseMove = useCallback((e) => {
    e.evt.preventDefault(); // Prevent default browser behavior
    if (!isDrawing || !image) return;
    
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    if (!point) return;
    
    // Update the current line efficiently
    setLines(prev => {
      if (prev.length === 0) return prev;
      
      const lastLineIndex = prev.length - 1;
      const lastLine = prev[lastLineIndex];
      
      // Create updated line with new points
      const updatedLine = {
        ...lastLine,
        points: [...lastLine.points, point.x, point.y]
      };
      
      // Return new array with updated last line
      const newLines = [...prev];
      newLines[lastLineIndex] = updatedLine;
      return newLines;
    });
  }, [isDrawing, image]);

  const handleMouseUp = useCallback((e) => {
    e.evt.preventDefault(); // Prevent default browser behavior
    setIsDrawing(false);
  }, []);

  // Debounced mask generation for better performance
  const debouncedGenerateMask = useCallback(() => {
    // Clear any existing timeout
    if (maskGenerationTimeoutRef.current) {
      clearTimeout(maskGenerationTimeoutRef.current);
    }
    
    // Set a new timeout for mask generation
    maskGenerationTimeoutRef.current = setTimeout(() => {
      generateMask();
    }, 100); // Generate mask 100ms after user stops drawing
  }, []);

  // Effect to regenerate mask when lines or inversion state change
  useEffect(() => {
    if (image && lines.length > 0) {
      debouncedGenerateMask();
    } else if (image && lines.length === 0) {
      // Clear mask when no lines
      if (maskGenerationTimeoutRef.current) {
        clearTimeout(maskGenerationTimeoutRef.current);
      }
      onMaskChange(null);
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (maskGenerationTimeoutRef.current) {
        clearTimeout(maskGenerationTimeoutRef.current);
      }
    };
  }, [lines, isMaskInverted, image, debouncedGenerateMask, onMaskChange]);

  const clearMask = useCallback(() => {
    // Save current state before clearing
    if (lines.length > 0) {
      setLinesHistory(prev => [...prev, [...lines]]);
    }
    setLines([]);
    setIsMaskInverted(false); // Reset inversion state
    // Clear any pending mask generation
    if (maskGenerationTimeoutRef.current) {
      clearTimeout(maskGenerationTimeoutRef.current);
    }
    onMaskChange(null);
  }, [lines, onMaskChange]);

  const handleToggleInvert = useCallback(() => {
    // Toggle inversion state and regenerate mask
    setIsMaskInverted(prev => !prev);
  }, []);
  
  const handleUndo = useCallback(() => {
    if (linesHistory.length > 0) {
      // Get the previous lines state
      const prevLines = linesHistory[linesHistory.length - 1];
      // Update lines with previous state
      setLines(prevLines);
      // Remove the last history entry
      setLinesHistory(prev => prev.slice(0, -1));
    }
  }, [linesHistory]);

  const generateMask = useCallback(() => {
    if (!stageRef.current || !image || lines.length === 0) return;
    
    try {
      // Create a temporary canvas to draw the mask at the original image size
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      // Set canvas dimensions to match the original image dimensions
      canvas.width = imageSize.width;
      canvas.height = imageSize.height;

      // Always use white mask on black background for best results with OpenAI API
      const backgroundColor = isMaskInverted ? 'white' : 'black';
      const strokeColor = isMaskInverted ? 'black' : 'white';

      // Fill with background color
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);

      // Calculate scale ratios to map from stage coordinates to original image coordinates
      const scaleX = imageSize.width / stageSize.width;
      const scaleY = imageSize.height / stageSize.height;

      // Set common drawing properties
      context.lineJoin = 'round';
      context.lineCap = 'round';

      // Draw each line on the canvas
      lines.forEach(line => {
        if (!line.points || line.points.length < 4) return; // Need at least 2 points (4 coordinates)
        
        context.beginPath();
        context.lineWidth = line.brushSize * Math.max(scaleX, scaleY);
        // Brush draws with strokeColor, eraser draws with backgroundColor
        context.strokeStyle = line.tool === 'brush' ? strokeColor : backgroundColor;

        // Start the path
        const startX = line.points[0] * scaleX;
        const startY = line.points[1] * scaleY;
        context.moveTo(startX, startY);

        // Draw line segments
        for (let i = 2; i < line.points.length; i += 2) {
          const x = line.points[i] * scaleX;
          const y = line.points[i + 1] * scaleY;
          context.lineTo(x, y);
        }
        
        context.stroke();
      });

      // Binarize the mask to ensure only black and white pixels
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        // If any channel is not black, set it to white, else keep black
        const isMasked = data[i] > 127 || data[i+1] > 127 || data[i+2] > 127;
        if (isMasked) {
          data[i] = 255;
          data[i+1] = 255;
          data[i+2] = 255;
          data[i+3] = 255;
        } else {
          data[i] = 0;
          data[i+1] = 0;
          data[i+2] = 0;
          data[i+3] = 255;
        }
      }
      context.putImageData(imageData, 0, 0);
      // Convert to base64 and send to parent
      const maskDataUrl = canvas.toDataURL('image/png');
      onMaskChange(maskDataUrl);
    } catch (error) {
      console.error('Error generating mask:', error);
      onMaskChange(null);
    }
  }, [image, imageSize, stageSize, lines, isMaskInverted, onMaskChange]);

  // Use ResizeObserver to respond to container size changes
  useEffect(() => {
    if (!containerRef.current || !image) return;
    
    const resizeObserver = new ResizeObserver(() => {
      calculateDimensions();
    });
    
    resizeObserver.observe(containerRef.current);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [image, calculateDimensions]);

  // Optimized brush sizes for better user experience
  const brushSizes = useMemo(() => [5, 15, 30, 50, 100], []);

  // Memoized line rendering for better performance
  const renderedLines = useMemo(() => {
    return lines.map((line, i) => {
      // Define colors based on tool and inversion state
      let lineColor;
      if (isMaskInverted) {
        // For inverted masks: brush shows red, eraser shows blue
        lineColor = line.tool === 'brush' ? 'rgba(255, 0, 0, 0.7)' : 'rgba(30, 144, 255, 0.7)';
      } else {
        // For normal masks: brush shows blue, eraser shows red
        lineColor = line.tool === 'brush' ? 'rgba(30, 144, 255, 0.7)' : 'rgba(255, 0, 0, 0.7)';
      }
      
      // Only render lines that have valid points
      if (!line.points || line.points.length < 4) return null;
      
      return (
        <Line
          key={line.id || i}
          points={line.points}
          stroke={lineColor}
          strokeWidth={line.brushSize}
          tension={0.5}
          lineCap="round"
          lineJoin="round"
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false} // Disable shadows for better performance
        />
      );
    }).filter(Boolean);
  }, [lines, isMaskInverted]);

  return (
    <div className="mask-editor w-full h-full">
      <div className="flex flex-col gap-3 mb-3">
        {/* Simplified Controls */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Draw/Erase Toggle */}
          <div className="flex rounded-lg overflow-hidden border border-soft-gray bg-white">
            <button
              type="button"
              className={`px-3 py-1.5 flex items-center gap-1 text-sm font-medium transition-all duration-200 ${
                tool === 'brush'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-white text-charcoal-gray hover:bg-blue-50'
              } ${!image ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => image && setTool('brush')}
              disabled={!image}
            >
              ✏️ Draw
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 flex items-center gap-1 text-sm font-medium transition-all duration-200 ${
                tool === 'eraser'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-white text-charcoal-gray hover:bg-blue-50'
              } ${!image ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => image && setTool('eraser')}
              disabled={!image}
            >
              🧹 Erase
            </button>
          </div>

          {/* Brush Size Selector */}
          <div className="flex items-center gap-1 bg-white rounded-lg border border-soft-gray px-2 py-1">
            <span className="text-xs text-charcoal-gray whitespace-nowrap mr-1">Size:</span>
            {brushSizes.map(size => (
              <button
                type="button"
                key={size}
                onClick={() => setBrushSize(size)}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 ${
                  brushSize === size 
                    ? 'bg-blue-500 text-white shadow-sm' 
                    : 'bg-gray-100 text-charcoal-gray hover:bg-blue-100'
                } ${!image ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!image}
                title={`${size}px`}
              >
                <div 
                  className="rounded-full bg-current" 
                  style={{ 
                    width: Math.min(16, Math.max(2, size / 6)) + 'px', 
                    height: Math.min(16, Math.max(2, size / 6)) + 'px' 
                  }}
                ></div>
              </button>
            ))}
            <span className="text-xs text-charcoal-gray ml-1">{brushSize}px</span>
          </div>

          {/* Action Buttons */}
          <button
            type="button"
            className={`px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 transition-all duration-200 rounded-lg text-sm font-medium flex items-center gap-1 ${
              !image ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            onClick={() => image && clearMask()}
            disabled={!image}
          >
            🗑 Clear
          </button>
          
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 transition-all duration-200 ${
              isMaskInverted
                ? 'bg-orange-500 text-white shadow-sm'
                : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
            } ${!image ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => image && handleToggleInvert()}
            disabled={!image}
          >
            🔄 Invert
          </button>
          
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 transition-all duration-200
              ${linesHistory.length > 0 && image
                ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                : 'bg-gray-50 text-gray-400 cursor-not-allowed'
            }`}
            onClick={() => image && handleUndo()}
            disabled={linesHistory.length === 0 || !image}
          >
            ↩️ Undo
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="relative rounded-md overflow-hidden w-full">
        <div
          ref={containerRef}
          className="stage-container border border-soft-gray bg-off-white w-full flex justify-center items-center"
          style={{ minHeight: '400px', maxWidth: '100%', boxSizing: 'border-box' }}
        >
          {!image && (
            <div className="flex flex-col items-center justify-center w-full h-full py-20 text-charcoal-gray opacity-80 select-none">
              <div className="mb-4 text-6xl">🖼️</div>
              <div className="mb-2 font-semibold text-lg">Upload or drag an image to start</div>
              <div className="text-sm text-gray-500">Supported: PNG, JPG, 512x512+ recommended</div>
            </div>
          )}
          {image && (
            <Stage
              width={stageSize.width}
              height={stageSize.height}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchStart={handleMouseDown}
              onTouchMove={handleMouseMove}
              onTouchEnd={handleMouseUp}
              ref={stageRef}
              style={{ touchAction: 'none' }} // Prevent default touch behaviors
            >
              <Layer>
                <Image 
                  image={image} 
                  width={stageSize.width} 
                  height={stageSize.height}
                />
              </Layer>
              <Layer>
                {renderedLines}
              </Layer>
            </Stage>
          )}
        </div>
        
        {/* Simple Status Indicator */}
        {image && lines.length > 0 && (
          <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${tool === 'brush' ? 'bg-blue-400' : 'bg-red-400'}`}></div>
            {tool === 'brush' ? 'Drawing' : 'Erasing'} • {brushSize}px
            {isMaskInverted && ' • Inverted'}
          </div>
        )}
      </div>

      {/* Smart Help Text */}
      {image && (
        <div className="mt-2 text-xs text-center">
          {lines.length === 0 ? (
            <p className="text-charcoal-gray/70">
              <strong>Start drawing:</strong> Use the brush to select areas you want to {isMaskInverted ? "keep" : "edit"}
            </p>
          ) : (
            <p className="text-blue-600">
              <strong>Mask active:</strong> {lines.length} stroke{lines.length > 1 ? 's' : ''} • 
              {isMaskInverted ? " Inverted mode" : " Normal mode"}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default MaskEditor;
