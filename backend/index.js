import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import Replicate from 'replicate';
import fs from 'fs';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import fileUpload from 'express-fileupload';

dotenv.config();

// Polyfill __dirname for ES modules
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for larger images
app.use(fileUpload());

const PORT = process.env.PORT || 5000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const PUBLIC_BACKEND_URL = process.env.PUBLIC_BACKEND_URL;

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

// Create temporary file storage
const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir);
}

// Serve static files from the tmp directory
app.use('/tmp', express.static(tmpDir));

// Helper function to save base64 data to a file and return a URL
const saveBase64ToFile = async (base64Data, filePrefix) => {
  // Remove the data URL prefix if present
  const base64Content = base64Data.includes('base64,') 
    ? base64Data.split('base64,')[1] 
    : base64Data;
  
  // Generate a unique filename
  const filename = `${filePrefix}_${Date.now()}.png`;
  const filepath = path.join(tmpDir, filename);
  
  // Save the file
  await fs.promises.writeFile(filepath, Buffer.from(base64Content, 'base64'));
  
  // Return the URL (relative to the server)
  return `/tmp/${filename}`;
};

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
      // Process the mask according to OpenAI documentation for GPT-image-1
      // From the docs: "The mask image must also contain an alpha channel"
      // Black areas (0) in the mask = areas to edit
      // White areas (255) in the mask = areas to preserve
      
      try {
        console.log('[MASK] Processing mask for GPT-image-1...');
        
        // First convert to grayscale to ensure we're working with a proper B&W mask
        const { data: maskPixelData, info: maskInfo } = await sharp(maskBuffer)
          .grayscale() // Ensure grayscale
          .raw()
          .toBuffer({ resolveWithObject: true });
        
        console.log(`[MASK] Grayscale mask dimensions: ${maskInfo.width}x${maskInfo.height}`);
        
        // Following the OpenAI documentation example for adding alpha channel to B&W mask
        // Create an RGBA image where:
        // - RGB values are preserved from the original mask
        // - Alpha channel is set to the grayscale value itself
        // This matches the Python example in the OpenAI docs:
        // mask_rgba = mask.convert("RGBA")
        // mask_rgba.putalpha(mask)
        
        const finalMaskBuffer = Buffer.alloc(maskInfo.width * maskInfo.height * 4);
        
        for (let i = 0; i < maskInfo.width * maskInfo.height; i++) {
          const grayscaleValue = maskPixelData[i]; // 0 (black) to 255 (white)
          
          // Set RGB to the grayscale value (creates a B&W image)
          finalMaskBuffer[i * 4 + 0] = grayscaleValue; // R
          finalMaskBuffer[i * 4 + 1] = grayscaleValue; // G
          finalMaskBuffer[i * 4 + 2] = grayscaleValue; // B
          
          // Set alpha to the same grayscale value
          // Black areas (0) = transparent (alpha=0) = areas to edit
          // White areas (255) = opaque (alpha=255) = areas to preserve
          finalMaskBuffer[i * 4 + 3] = grayscaleValue;
        }
        
        // Save the processed mask as PNG
        await sharp(finalMaskBuffer, {
          raw: {
            width: maskInfo.width,
            height: maskInfo.height,
            channels: 4 // RGBA
          }
        })
        .png()
        .toFile(maskPath);
        
        console.log(`[MASK] Successfully created mask at: ${maskPath}`);
        console.log(`[IMAGE] Image saved at: ${imgPath}`);
      } catch (err) {
        console.error('[ERROR] Failed to process mask:', err);
        return res.status(500).json({ error: 'Failed to process mask: ' + err.message });
      }
    }

    // Prepare form data
    console.log('[EDIT] Preparing form data for OpenAI request');
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    
    // Add all parameters
    console.log('[EDIT] Adding parameters to form');
    
    // Handle different models differently
    if (model === 'dall-e-2') {
      // DALL-E 2 supports the edit endpoint with mask
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
    } else {
      // For gpt-image-1 and other models, we need to use a different approach
      // We'll use the images/edit endpoint but with different parameters
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
      
      // For GPT-image-1, we use the images/edit endpoint as per OpenAI docs
      const endpoint = 'https://api.openai.com/v1/images/edits';
      
      console.log(`[EDIT] Using API endpoint: ${endpoint} with model ${model}`);
      
      // Make the API call with a timeout
      const response = await axios.post(
        endpoint,
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

// --- Replicate Ideogram Test Endpoint ---
app.get('/api/replicate/ideogram/test', (req, res) => {
  if (REPLICATE_API_TOKEN) {
    res.json({ status: 'ok', message: 'Replicate API token loaded.' });
  } else {
    res.status(500).json({ status: 'error', message: 'REPLICATE_API_TOKEN is missing.' });
  }
});

// --- Replicate Ideogram Endpoint ---
app.post('/api/replicate/ideogram', async (req, res) => {
  try {
    if (!REPLICATE_API_TOKEN) {
      return res.status(500).json({ error: 'Missing REPLICATE_API_TOKEN in .env' });
    }
    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

    // Define effectiveServerUrl for Replicate callbacks
    let effectiveServerUrl = process.env.PUBLIC_BACKEND_URL;
    if (!effectiveServerUrl) {
      effectiveServerUrl = `http://localhost:${PORT}`; // PORT is already defined globally as const PORT = process.env.PORT || 5000;
      console.warn(`[WARN] PUBLIC_BACKEND_URL is not set. Defaulting to ${effectiveServerUrl}. Replicate may not be able to access temporary image/mask URLs unless this server is publicly accessible and PUBLIC_BACKEND_URL is configured to its public address.`);
    }

    const {
      prompt,
      negative_prompt,
      image,
      mask,
      aspect_ratio,
      resolution,
      magic_prompt_option,
      style_type,
      seed
    } = req.body;

    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ error: 'Prompt is required and must be a non-empty string.' });
    }

    // Enum values from schema
    const allowedAspectRatios = [
      "1:1","16:9","9:16","4:3","3:4","3:2","2:3","16:10","10:16","3:1","1:3"
    ];
    const allowedResolutions = [
      "None","512x1536","576x1408","576x1472","576x1536","640x1344","640x1408","640x1472","640x1536","704x1152","704x1216","704x1280","704x1344","704x1408","704x1472","736x1312","768x1088","768x1216","768x1280","768x1344","832x960","832x1024","832x1088","832x1152","832x1216","832x1248","864x1152","896x960","896x1024","896x1088","896x1120","896x1152","960x832","960x896","960x1024","960x1088","1024x832","1024x896","1024x960","1024x1024","1088x768","1088x832","1088x896","1088x960","1120x896","1152x704","1152x832","1152x864","1152x896","1216x704","1216x768","1216x832","1248x832","1280x704","1280x768","1280x800","1312x736","1344x640","1344x704","1344x768","1408x576","1408x640","1408x704","1472x576","1472x640","1472x704","1536x512","1536x576","1536x640"
    ];
    const allowedStyleTypes = ["None","Auto","General","Realistic","Design","Render 3D","Anime"];
    const allowedMagicPromptOptions = ["Auto","On","Off"];

    // Get the model from the request or use default
    const model = req.body.model || 'ideogram-ai/ideogram-v2-turbo';
    console.log(`[REPLICATE] Using model: ${model}`);
    
    // Validate and build input object for Replicate
    const input = { prompt };
    if (typeof negative_prompt === 'string' && negative_prompt.trim() !== '') input.negative_prompt = negative_prompt;
    
    // Process image if it exists
    if (typeof image === 'string' && image.trim() !== '') {
      // If it's a URL, use it directly
      if (image.startsWith('http')) {
        input.image = image;
        console.log('Using external image URL');
      } else {
        // For base64, save to file and use URL for consistency with mask handling
        if (image.startsWith('data:') || !image.startsWith('http')) {
          // Save the image to a file and get a URL
          const imageUrl = await saveBase64ToFile(image, 'image');
          // Convert to absolute URL with hostname
          const serverUrl = effectiveServerUrl;
          input.image = `${serverUrl}${imageUrl}`;
          console.log('Saved image to file and using URL:', input.image);
        }
      }
    }
    
    // Process mask if it exists
    if (typeof mask === 'string' && mask.trim() !== '') {
      // If it's a URL, use it directly
      if (mask.startsWith('http')) {
        input.mask = mask;
        console.log('Using external mask URL');
      } else {
        // For base64, save to file and use URL (Replicate requires URI format for mask)
        if (mask.startsWith('data:') || !mask.startsWith('http')) {
          // Save the mask to a file and get a URL
          const maskUrl = await saveBase64ToFile(mask, 'mask');
          // Convert to absolute URL with hostname
          const serverUrl = effectiveServerUrl;
          input.mask = `${serverUrl}${maskUrl}`;
          console.log('Saved mask to file and using URL:', input.mask);
        }
      }
    }
    
    if (typeof aspect_ratio === 'string' && allowedAspectRatios.includes(aspect_ratio)) input.aspect_ratio = aspect_ratio;
    if (typeof resolution === 'string' && allowedResolutions.includes(resolution)) input.resolution = resolution;
    if (typeof magic_prompt_option === 'string' && allowedMagicPromptOptions.includes(magic_prompt_option)) input.magic_prompt_option = magic_prompt_option;
    if (typeof style_type === 'string' && allowedStyleTypes.includes(style_type)) input.style_type = style_type;
    if (typeof seed === 'number' && !isNaN(seed)) input.seed = seed;

    // Call Replicate API with retry logic
    const MAX_RETRIES = 3;
    let retryCount = 0;
    let output;
    
    while (retryCount < MAX_RETRIES) {
      try {
        console.log(`Replicate API attempt ${retryCount + 1} of ${MAX_RETRIES}...`);
        output = await replicate.run(
          model,
          { input }
        );
        // Success! Break out of retry loop
        break;
      } catch (retryError) {
        retryCount++;
        // Only retry on specific error codes (PA = Prediction interrupted)
        if (retryCount < MAX_RETRIES && retryError.message && retryError.message.includes('code: PA')) {
          console.log(`Replicate API interrupted (code: PA), retrying... (${retryCount}/${MAX_RETRIES})`);
          // Wait a bit before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        } else {
          // If we've exhausted retries or it's not a retryable error, rethrow
          throw retryError;
        }
      }
    }
    
    // Normalize output to always be an array
    if (typeof output === 'string') output = [output];
    if (!Array.isArray(output)) output = [];
    return res.json({ output });
  } catch (err) {
    // Log full error details
    if (err && err.response && err.response.data) {
      console.error('[REPLICATE ERROR]', err.response.data);
      return res.status(500).json({ error: err.response.data.error || JSON.stringify(err.response.data) });
    }
    console.error('[REPLICATE ERROR]', err);
    return res.status(500).json({ error: err.message || 'Replicate API error' });
  }
});

// --- Replicate Image Edit with Mask Endpoint ---
app.post('/api/replicate/edit', async (req, res) => {
  try {
    console.log('[REPLICATE EDIT] Received request body:', JSON.stringify(req.body, null, 2));
    console.log('[REPLICATE EDIT] Received prompt from req.body.prompt:', req.body.prompt);
    console.log('[REPLICATE EDIT] Received files:', req.files ? Object.keys(req.files) : 'No files');

    if (!REPLICATE_API_TOKEN) {
      return res.status(500).json({ error: 'Missing REPLICATE_API_TOKEN in .env' });
    }

    console.log('[REPLICATE EDIT] Incoming request to /api/replicate/edit'); // This line already existed, good to keep
    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

    // Extract request parameters
    const { prompt, model = 'stability-ai/sdxl-inpainting:e5a34f7f9060b84b497a8c9cf3f12d43ca0c7875a99e7b301a83d81b5c82cdac' } = req.body;
    
    // Define effectiveServerUrl for Replicate callbacks
    const effectiveServerUrl = PUBLIC_BACKEND_URL || `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
    if (!PUBLIC_BACKEND_URL) {
      console.warn(`[WARN] PUBLIC_BACKEND_URL is not set. Defaulting to ${effectiveServerUrl}. Replicate may not be able to access temporary image/mask URLs unless this server is publicly accessible and PUBLIC_BACKEND_URL is configured to its public address.`);
    }

    // Handle file uploads
    if (!req.files || !req.files.image) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    // Get the uploaded image and mask
    const imageFile = req.files.image;
    const maskFile = req.files.mask;
    const imageBuffer = imageFile.data;
    const maskBuffer = maskFile ? maskFile.data : null;

    // Create unique filenames
    const timestamp = Date.now();
    const imgFilename = `image_${timestamp}.png`;
    const maskFilename = maskBuffer ? `mask_${timestamp}.png` : null;
    const imgPath = path.join(uploadsDir, imgFilename);
    const maskPath = maskBuffer ? path.join(uploadsDir, maskFilename) : null;

    // Save the image file
    fs.writeFileSync(imgPath, imageBuffer);
    
    if (maskBuffer) {
      // Process the mask according to Replicate's requirements
      // Most Replicate models expect a similar format to OpenAI
      try {
        console.log('[REPLICATE MASK] Processing mask...');
        
        // First convert to grayscale to ensure we're working with a proper B&W mask
        const { data: maskPixelData, info: maskInfo } = await sharp(maskBuffer)
          .grayscale() // Ensure grayscale
          .raw()
          .toBuffer({ resolveWithObject: true });
        
        console.log(`[REPLICATE MASK] Grayscale mask dimensions: ${maskInfo.width}x${maskInfo.height}`);
        
        // Create an RGBA image where:
        // - RGB values are preserved from the original mask
        // - Alpha channel is set to the grayscale value itself
        const finalMaskBuffer = Buffer.alloc(maskInfo.width * maskInfo.height * 4);
        
        for (let i = 0; i < maskInfo.width * maskInfo.height; i++) {
          const grayscaleValue = maskPixelData[i]; // 0 (black) to 255 (white)
          
          // Set RGB to the grayscale value (creates a B&W image)
          finalMaskBuffer[i * 4 + 0] = grayscaleValue; // R
          finalMaskBuffer[i * 4 + 1] = grayscaleValue; // G
          finalMaskBuffer[i * 4 + 2] = grayscaleValue; // B
          
          // Set alpha to the same grayscale value
          // Black areas (0) = transparent (alpha=0) = areas to edit
          // White areas (255) = opaque (alpha=255) = areas to preserve
          finalMaskBuffer[i * 4 + 3] = grayscaleValue;
        }
        
        // Save the processed mask as PNG
        await sharp(finalMaskBuffer, {
          raw: {
            width: maskInfo.width,
            height: maskInfo.height,
            channels: 4 // RGBA
          }
        })
        .png()
        .toFile(maskPath);
        
        console.log(`[REPLICATE MASK] Successfully created mask at: ${maskPath}`);
        console.log(`[REPLICATE IMAGE] Image saved at: ${imgPath}`);
      } catch (err) {
        console.error('[ERROR] Failed to process mask:', err);
        return res.status(500).json({ error: 'Failed to process mask: ' + err.message });
      }
    }

    // Create URLs for the files
    const imageUrl = `${effectiveServerUrl}/uploads/${imgFilename}`;
    const maskUrl = maskPath ? `${effectiveServerUrl}/uploads/${maskFilename}` : null;

    console.log('[REPLICATE EDIT] Image URL:', imageUrl);
    if (maskUrl) console.log('[REPLICATE EDIT] Mask URL:', maskUrl);

    // Prepare input for Replicate
    const input = {
      prompt: prompt,
      image: imageUrl,
      mask_image: maskUrl,
      num_outputs: 1,
      guidance_scale: 7.5,
      num_inference_steps: 50,
    };

    console.log('[REPLICATE EDIT] Sending request to Replicate...');
    console.log('[REPLICATE EDIT] Model:', model);
    console.log('[REPLICATE EDIT] Prompt:', prompt);

    // Call Replicate API
    const MAX_RETRIES = 3;
    let retryCount = 0;
    let output = null;

    while (retryCount < MAX_RETRIES && !output) {
      try {
        console.log(`[REPLICATE EDIT] API attempt ${retryCount + 1} of ${MAX_RETRIES}...`);
        output = await replicate.run(model, { input });
      } catch (err) {
        retryCount++;
        if (err.message && err.message.includes('PA')) {
          console.log(`[REPLICATE EDIT] API interrupted (code: PA), retrying... (${retryCount}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
        } else if (retryCount < MAX_RETRIES) {
          console.log(`[REPLICATE EDIT] API error, retrying... (${retryCount}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
        } else {
          throw err; // Re-throw if we've exhausted retries
        }
      }
    }

    console.log('[REPLICATE EDIT] Response received:', output);
    return res.json({ output });
  } catch (err) {
    if (err.response && err.response.data) {
      console.error('[REPLICATE EDIT ERROR]', err.response.data);
      return res.status(500).json({ error: err.response.data.detail || 'Replicate API error' });
    }
    console.error('[REPLICATE EDIT ERROR]', err);
    return res.status(500).json({ error: err.message || 'Replicate API error' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend listening on port ${PORT} (0.0.0.0)`);
  console.log('You can access this server from other devices on your network using http://<YOUR_LOCAL_IP>:' + PORT);
});
