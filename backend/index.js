import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Polyfill __dirname for ES modules
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for larger images

const PORT = process.env.PORT || 5000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

// Create tmp directory if it doesn't exist
fs.mkdirSync(path.join(__dirname, 'tmp'), { recursive: true });

// Text-to-Image Endpoint
app.post('/api/generate', async (req, res) => {
  const { 
    prompt,
    model = 'gpt-image-1',
    n = 1,
    size = '1024x1024',
    quality = 'high',
    background = 'auto',
    format = 'png',
    output_compression = 100,
    moderation = 'auto'
  } = req.body;
  
  if (!prompt) return res.status(400).json({ error: 'Prompt required.' });
  
  try {
    let requestBody;

    if (model === 'gpt-image-1') {
      requestBody = {
        model,
        prompt,
      };
    } else {
      // For dall-e-2, dall-e-3, etc.
      requestBody = {
        model,
        prompt,
        n,
        size,
        response_format: format === 'url' ? 'url' : 'b64_json',
      };

      // Only add 'quality' if the model is 'dall-e-3' and quality is valid for it.
      if (model === 'dall-e-3' && (quality === 'standard' || quality === 'hd')) {
        requestBody.quality = quality;
      }
    }
    
    const response = await axios.post(
      'https://api.openai.com/v1/images/generations',
      requestBody,
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );
    
    // Return either URL or base64 data depending on response format
    const imageData = response.data.data[0];
    res.json({ 
      image: imageData.url || `data:image/${format};base64,${imageData.b64_json}`,
      format: format === 'url' ? 'url' : format
    });
  } catch (err) {
    console.error('Error generating image:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to generate image.', details: err.response?.data?.error || err.message });
  }
});

// Add a test route to verify OpenAI API key
app.get('/api/test-openai', async (req, res) => {
  try {
    console.log('[TEST] Testing OpenAI API key');
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key is missing' });
    }
    
    // Make a simple request to OpenAI to test the key
    try {
      const response = await axios.get('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
      });
      return res.json({ success: true, message: 'OpenAI API key is valid', models: response.data.data.slice(0, 5) });
    } catch (err) {
      console.error('[TEST] OpenAI API key test failed:', err.message);
      return res.status(401).json({ error: 'OpenAI API key is invalid or expired', details: err.message });
    }
  } catch (err) {
    console.error('[TEST] Error testing OpenAI API key:', err);
    return res.status(500).json({ error: 'Error testing OpenAI API key' });
  }
});

// Image-to-Image + Masking Endpoint
app.post('/api/edit', async (req, res) => {
  try {
    console.log('[EDIT] Incoming request to /api/edit');
    console.log('Body:', JSON.stringify(req.body).slice(0, 500)); // Log only first 500 chars for brevity
    
    // Check API key first
    if (!OPENAI_API_KEY) {
      console.error('[ERROR] Missing OpenAI API key');
      return res.status(500).json({ error: 'Server configuration error: Missing OpenAI API key' });
    }
    
    const { 
      prompt, 
      image, 
      mask,
      model = 'gpt-image-1',
      n = 1,
      size = '1024x1024',
      quality = 'high',
      background = 'auto',
      format = 'png',
      output_compression = 100,
      moderation = 'auto'
    } = req.body;
    
    if (!prompt || !image) {
      console.error('[ERROR] Missing prompt or image in /api/edit');
      return res.status(400).json({ error: 'Prompt and image required.' });
    }
    
    // Prepare image and mask files for OpenAI API (multipart/form-data)
    // Robustly decode base64 data URL to buffer for any image type
    function dataUrlToBuffer(dataUrl) {
      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (!matches) {
        throw new Error('Invalid image data: not a valid base64 image data URL');
      }
      return Buffer.from(matches[2], 'base64');
    }
    
    let imageBuffer, maskBuffer = null;
    try {
      imageBuffer = dataUrlToBuffer(image);
      if (mask) maskBuffer = dataUrlToBuffer(mask);
      console.log('[EDIT] Successfully decoded image and mask');
    } catch (err) {
      console.error('[ERROR] Failed to decode image/mask:', err.message);
      return res.status(400).json({ error: err.message });
    }
    
    // --- Dimension validation using sharp ---
    const sharp = (await import('sharp')).default;
    let imgMeta, maskMeta;
    try {
      imgMeta = await sharp(imageBuffer).metadata();
      if (maskBuffer) maskMeta = await sharp(maskBuffer).metadata();
      console.log('[Validation] Uploaded image size:', imgMeta.width, imgMeta.height);
      if (maskMeta) console.log('[Validation] Uploaded mask size:', maskMeta.width, maskMeta.height);
      if (maskBuffer && (imgMeta.width !== maskMeta.width || imgMeta.height !== maskMeta.height)) {
        console.error('[ERROR] Image and mask must be the same size!');
        return res.status(400).json({ error: 'Image and mask must be the same size!' });
      }
    } catch (err) {
      console.error('[ERROR] Failed to validate image/mask dimensions:', err.message);
      return res.status(400).json({ error: 'Failed to validate image/mask dimensions.' });
    }
    // --- End validation ---
    // Write temp files
    const timestamp = Date.now();
    const imgPath = path.join(__dirname, 'tmp', `img_${timestamp}.png`);
    const maskPath = mask ? path.join(__dirname, 'tmp', `mask_${timestamp}.png`) : null;
    fs.writeFileSync(imgPath, imageBuffer);
    
    if (mask && maskBuffer) {
      const sharp = (await import('sharp')).default; // Ensure sharp is available in this scope if not already.
      // Process the mask: ensure it's RGBA, then use its luminance for the new alpha.
      // The input mask from frontend is B&W (black for edit, white for preserve).
      // We need an output mask for OpenAI where RGB is black, and Alpha is:
      //   0 (transparent) for 'edit' areas (frontend black).
      //   255 (opaque) for 'preserve' areas (frontend white).

      // Convert the input mask to raw grayscale pixel data first.
      const { data: maskPixelData, info: maskInfo } = await sharp(maskBuffer)
        .greyscale() // Convert to single channel grayscale
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Create a new buffer for the final RGBA mask.
      const finalMaskRgbaBuffer = Buffer.alloc(maskInfo.width * maskInfo.height * 4);
      for (let i = 0; i < maskInfo.width * maskInfo.height; i++) {
        const grayscaleValue = maskPixelData[i]; // This is the grayscale value (0 for black, 255 for white).
        finalMaskRgbaBuffer[i * 4 + 0] = 0;   // R channel = 0
        finalMaskRgbaBuffer[i * 4 + 1] = 0;   // G channel = 0
        finalMaskRgbaBuffer[i * 4 + 2] = 0;   // B channel = 0
        finalMaskRgbaBuffer[i * 4 + 3] = grayscaleValue; // Alpha channel = grayscale value
      }

      // Save the newly created RGBA mask to a file.
      await sharp(finalMaskRgbaBuffer, { raw: { width: maskInfo.width, height: maskInfo.height, channels: 4 } })
        .png()
        .toFile(maskPath);
    }

    // Prepare form data
    console.log('[EDIT] Preparing form data for OpenAI request');
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    
    // Add all parameters
    console.log('[EDIT] Adding parameters to form');
    form.append('model', model);
    form.append('prompt', prompt);
    
    // Check if image file exists
    if (!fs.existsSync(imgPath)) {
      console.error('[ERROR] Image file does not exist:', imgPath);
      return res.status(500).json({ error: 'Image file not found on server' });
    }
    
    console.log('[EDIT] Adding image to form:', imgPath);
    form.append('image', fs.createReadStream(imgPath));
    
    if (mask && maskBuffer) {
      if (!fs.existsSync(maskPath)) {
        console.error('[ERROR] Mask file does not exist:', maskPath);
        return res.status(500).json({ error: 'Mask file not found on server' });
      }
      console.log('[EDIT] Adding mask to form:', maskPath);
      form.append('mask', fs.createReadStream(maskPath));
    }
    
    form.append('n', n);
    form.append('size', size);
    form.append('quality', quality);
    // Removed response_format as it is not supported by OpenAI's image edit API
    
    // Add optional parameters if they're not default
    if (background !== 'auto') form.append('background', background);
    if (format !== 'png' && format !== 'url') form.append('format', format);
    if (format !== 'png' && output_compression !== 100) form.append('output_compression', output_compression);
    if (moderation !== 'auto') form.append('moderation', moderation);

    try {
      // Log the API key length (for debugging, don't log the actual key)
      console.log(`[EDIT] OpenAI API Key length: ${OPENAI_API_KEY.length}, starts with: ${OPENAI_API_KEY.substring(0, 3)}...`);
      console.log('[EDIT] Sending request to OpenAI /v1/images/edits...');
      console.log('[EDIT] Request parameters:', {
        model,
        prompt: prompt.substring(0, 30) + '...',
        size,
        quality,
        hasImage: !!imgPath,
        hasMask: !!(mask && maskPath),
        formHeaders: Object.keys(form.getHeaders())
      });
      
      // Make the API call with a timeout
      const response = await axios.post(
        'https://api.openai.com/v1/images/edits',
        form,
        {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${OPENAI_API_KEY}`
          },
          timeout: 60000 // 60 second timeout
        }
      );
      
      console.log('[EDIT] Received response from OpenAI:', {
        status: response.status,
        statusText: response.statusText,
        hasData: !!response.data,
        hasImages: !!(response.data && response.data.data && response.data.data.length > 0)
      });

      // Cleanup temp files
      fs.unlinkSync(imgPath);
      if (mask && maskBuffer) fs.unlinkSync(maskPath);

      // Return either URL or base64 data depending on response format
      const imageData = response.data.data[0];
      console.log(`[RESULT] Image generated via /api/edit, model: ${model}, format: ${format}, url: ${imageData.url ? imageData.url : '[base64 returned]'}`);
      return res.json({ 
        image: imageData.url || `data:image/${format};base64,${imageData.b64_json}`,
        format: format === 'url' ? 'url' : format
      });
    } catch (err) {
      // Log and surface OpenAI error
      console.error('[OpenAI API ERROR]', err.response?.data || err.message);
      // Attempt to surface OpenAI error message to frontend
      let openaiMsg = err.response?.data?.error?.message || err.message;
      return res.status(500).json({ error: `OpenAI API error: ${openaiMsg}` });
    }
  } catch (err) {
    // This is a catch-all for any other errors in the main try block
    console.error('[ERROR] Unexpected error in /api/edit:', err);
    return res.status(500).json({ error: `Server error: ${err.message || 'Unknown error'}` });
  }
});

// Global error handler to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥');
  console.error(err.name, err.message);
  console.error(err.stack);
  console.log('Server continuing to run despite uncaught exception');
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥');
  console.error(err);
  console.log('Server continuing to run despite unhandled promise rejection');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend listening on port ${PORT} (0.0.0.0)`);
  console.log('You can access this server from other devices on your network using http://<YOUR_LOCAL_IP>:' + PORT);
});
