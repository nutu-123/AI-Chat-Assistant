const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();
const fetch = require('node-fetch');


const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// MongoDB Models
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String },
  country: { type: String },
  isVerified: { type: Boolean, default: false },
  verificationToken: String,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  createdAt: { type: Date, default: Date.now },
  requestCount: { type: Number, default: 0 }
});

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sessionId: { type: String, required: true, unique: true },
  title: { type: String, default: 'New Chat' },
  provider: { type: String, default: 'gemini' },
  model: { type: String, default: 'gemini-2.0-flash-exp' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  messageCount: { type: Number, default: 0 }
});

const messageSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  role: { type: String, required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  provider: String,
  model: String
});

const User = mongoose.model('User', userSchema);
const Session = mongoose.model('Session', sessionSchema);
const Message = mongoose.model('Message', messageSchema);

// Email Configuration - FIXED
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Verify email connection on startup
transporter.verify(function(error, success) {
  if (error) {
    console.log('❌ Email service error:', error.message);
  } else {
    console.log('✅ Email service ready');
  }
});

// Helper function to clean markdown formatting
function cleanMarkdownFormatting(text) {
  if (!text) return text;
  
  // Remove markdown bold (**text** or __text__)
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  
  // Remove markdown headers (## text)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '$1');
  
  // Remove markdown italic (*text* or _text_)
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  
  // Remove markdown code blocks (```code```)
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    return match.replace(/```/g, '');
  });
  
  // Remove inline code (`code`)
  text = text.replace(/`([^`]+)`/g, '$1');
  
  // Remove markdown links [text](url)
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  
  return text;
}

// Multi-Provider AI System with Fallback - FIXED
class AIProviderManager {
  constructor() {
    // Gemini first (default), then OpenAI, then Cohere as backup
    this.providers = [
      new GeminiProvider(),
      new OpenAIProvider(),
      new CohereProvider()
    ];
    this.currentProviderIndex = 0;
  }

  async generateContent(prompt, requestedModel = null) {
    let lastError = null;
    const attemptedProviders = [];
    
    // Always start with Gemini (index 0)
    this.currentProviderIndex = 0;
    
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[this.currentProviderIndex];
      attemptedProviders.push(provider.name);
      
      try {
        console.log(`🔵 Attempting provider: ${provider.name} (${i + 1}/${this.providers.length})`);
        
        // Use provider's default model if no specific model requested
        const modelToUse = requestedModel && requestedModel !== 'auto' 
          ? requestedModel 
          : provider.defaultModel;
        
        console.log(`   Using model: ${modelToUse}`);
        
        const result = await provider.generateContent(prompt, modelToUse);
        console.log(`✅ Success with ${provider.name}`);
        
        // Clean markdown formatting from response
        const cleanedResult = cleanMarkdownFormatting(result);
        
        return { 
          content: cleanedResult, 
          provider: provider.name, 
          model: modelToUse 
        };
      } catch (error) {
        console.error(`❌ ${provider.name} failed:`, error.message);
        lastError = error;
        
        // Move to next provider
        this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
        
        if (i < this.providers.length - 1) {
          console.log(`🔄 Falling back to next provider...`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    throw new Error(`All AI providers failed (${attemptedProviders.join(', ')}). Last error: ${lastError?.message}`);
  }

  async *streamResponse(text) {
    const chunkSize = 5;
    for (let i = 0; i < text.length; i += chunkSize) {
      yield text.slice(i, i + chunkSize);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }
}

// Google Gemini Provider - FIXED
class GeminiProvider {
  constructor() {
    this.name = 'Gemini';
    this.apiKey = process.env.GEMINI_API_KEY;
    this.baseURL = 'https://generativelanguage.googleapis.com/v1beta';
    this.defaultModel = 'gemini-2.0-flash-exp'; // Always use this model
  }

  async generateContent(prompt, model) {
    if (!this.apiKey) throw new Error('Gemini API key not configured');
    
    // Ensure we always have a valid model
    const useModel = model || this.defaultModel;
    
    const url = `${this.baseURL}/models/${useModel}:generateContent?key=${this.apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) throw new Error('No content in Gemini response');
    return text;
  }
}

// OpenAI Provider - FIXED
class OpenAIProvider {
  constructor() {
    this.name = 'OpenAI';
    this.apiKey = process.env.OPENAI_API_KEY;
    this.baseURL = 'https://api.openai.com/v1';
    this.defaultModel = 'gpt-3.5-turbo'; // Always use this model
  }

  async generateContent(prompt, model) {
    if (!this.apiKey) throw new Error('OpenAI API key not configured');
    
    // Ensure we always have a valid model
    const useModel = model || this.defaultModel;
    
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: useModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    
    if (!text) throw new Error('No content in OpenAI response');
    return text;
  }
}

// Cohere AI Provider - FIXED
class CohereProvider {
  constructor() {
    this.name = 'Cohere';
    this.apiKey = process.env.COHERE_API_KEY;
    this.baseURL = 'https://api.cohere.ai/v1';
    this.defaultModel = 'command-r'; // Always use this model
  }

  async generateContent(prompt, model) {
    if (!this.apiKey) throw new Error('Cohere API key not configured');
    
    // Ensure we always have a valid model
    const useModel = model || this.defaultModel;
    
    const response = await fetch(`${this.baseURL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: useModel,
        message: prompt,
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cohere API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.text;
    
    if (!text) throw new Error('No content in Cohere response');
    return text;
  }
}

// Initialize AI Manager
const aiManager = new AIProviderManager();

// Auth Middleware
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Authentication failed' });
  }
};

// Helper Functions
function generateTitle(message) {
  const words = message.split(' ').slice(0, 6).join(' ');
  return words.length < message.length ? words + '...' : words;
}

// Test Routes
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'NexaFlow AI Backend Running!', 
    timestamp: new Date(),
    mongodb: mongoose.connection.readyState === 1 ? 'Connected ✅' : 'Disconnected ❌',
    providers: {
      gemini: process.env.GEMINI_API_KEY ? 'Configured ✅' : 'Not configured ❌',
      openai: process.env.OPENAI_API_KEY ? 'Configured ✅' : 'Not configured ❌',
      cohere: process.env.COHERE_API_KEY ? 'Configured ✅' : 'Not configured ❌'
    },
    emailService: process.env.EMAIL_USER && process.env.EMAIL_PASSWORD ? 'Configured ✅' : 'Not configured ❌',
    version: '2.0.0'
  });
});

app.get('/api/test-ai', async (req, res) => {
  try {
    console.log('\n🧪 ===== TESTING AI PROVIDERS =====');
    const result = await aiManager.generateContent('Say hello in 5 words');
    console.log('===== TEST PASSED ✅ =====\n');
    
    res.json({ 
      success: true, 
      response: result.content,
      provider: result.provider,
      model: result.model,
      message: 'AI System is working perfectly! 🎉'
    });
  } catch (error) {
    console.error('❌ Test failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Auth Routes
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password, phone, country } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    const user = new User({ 
      name, 
      email, 
      password: hashedPassword,
      phone,
      country,
      verificationToken
    });
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Send verification email - IMPROVED
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      const verificationUrl = `http://localhost:5000/api/auth/verify-email/${verificationToken}`;
      
      try {
        const mailOptions = {
          from: {
            name: 'Smart Talk AI',
            address: process.env.EMAIL_USER
          },
          to: email,
          subject: '🚀 Verify Your Smart Talk AI Account',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
              <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 28px;">🚀 Welcome to NexaFlow AI!</h1>
                </div>
                
                <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                  <h2 style="color: #667eea; margin-top: 0;">Hello ${name}! 👋</h2>
                  
                  <p style="color: #333; font-size: 16px; line-height: 1.6;">
                    Thank you for joining <strong>Smart Talk AI</strong> - your next-generation AI intelligence platform!
                  </p>
                  
                  <p style="color: #333; font-size: 16px; line-height: 1.6;">
                    Please verify your email address by clicking the button below:
                  </p>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${verificationUrl}" style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      ✅ Verify Email Address
                    </a>
                  </div>
                  
                  <p style="color: #666; font-size: 14px; line-height: 1.6;">
                    Or copy and paste this link in your browser:
                  </p>
                  <p style="color: #667eea; font-size: 13px; word-break: break-all;">
                    ${verificationUrl}
                  </p>
                  
                  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                    <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
                      This link expires in 24 hours for security reasons.
                    </p>
                  </div>
                </div>
                
                <div style="text-align: center; margin-top: 20px;">
                  <p style="color: #999; font-size: 12px;">
                    © 2025 Smart Talk AI. All rights reserved.<br>
                    Developed with ❤️ by Nutan Phadtare
                  </p>
                </div>
              </div>
            </body>
            </html>
          `
        };

        await transporter.sendMail(mailOptions);
        console.log('✅ Verification email sent to:', email);
      } catch (emailError) {
        console.error('❌ Email send error:', emailError.message);
        console.error('   Make sure you are using Gmail App Password, not regular password!');
      }
    } else {
      console.log('⚠️  Email not configured - skipping verification email');
    }

    res.status(201).json({
      token,
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email,
        isVerified: user.isVerified 
      },
      message: 'Signup successful! Please check your email to verify your account.'
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/auth/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const user = await User.findOne({ verificationToken: token });
    
    if (!user) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Verification Failed</title>
        </head>
        <body style="font-family: Arial; text-align: center; padding: 50px; background: #f5f5f5;">
          <div style="background: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #e74c3c;">❌ Invalid or Expired Token</h2>
            <p style="color: #666;">This verification link is invalid or has expired.</p>
            <p style="color: #666;">Please request a new verification email.</p>
          </div>
        </body>
        </html>
      `);
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Email Verified</title>
      </head>
      <body style="font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
        <div style="background: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 20px rgba(0,0,0,0.2);">
          <div style="font-size: 60px; margin-bottom: 20px;">✅</div>
          <h2 style="color: #27ae60; margin-top: 0;">Email Verified Successfully!</h2>
          <p style="color: #333; font-size: 18px;">Your Smart Talk AI account is now active.</p>
          <p style="color: #666;">You can close this window and return to the app.</p>
          <a href="http://localhost:3000" style="display: inline-block; margin-top: 20px; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
            Go to Smart Talk AI
          </a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).send('Verification failed');
  }
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email,
        isVerified: user.isVerified 
      }
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Chat Routes
app.post('/api/chat/session', authMiddleware, async (req, res) => {
  try {
    const sessionId = `session-${req.user._id}-${Date.now()}`;
    
    const session = new Session({
      userId: req.user._id,
      sessionId,
      title: 'New Chat',
      provider: 'gemini',
      model: 'gemini-2.0-flash-exp'
    });

    await session.save();

    res.json({ 
      sessionId, 
      title: session.title,
      createdAt: session.createdAt
    });
  } catch (error) {
    console.error('Session error:', error);
    res.status(500).json({ message: 'Failed to create session' });
  }
});

app.get('/api/chat/sessions', authMiddleware, async (req, res) => {
  try {
    const sessions = await Session.find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .select('sessionId title createdAt updatedAt messageCount provider')
      .limit(50)
      .lean();

    res.json({ sessions });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ message: 'Failed to fetch sessions' });
  }
});

app.get('/api/chat/messages/:sessionId', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await Session.findOne({ 
      sessionId, 
      userId: req.user._id 
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const messages = await Message.find({ sessionId })
      .sort({ timestamp: 1 })
      .lean();

    res.json({ messages, session });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

app.post('/api/chat/stream', authMiddleware, async (req, res) => {
  console.log('\n🚀 ===== NEW CHAT REQUEST =====');
  
  try {
    const { message, sessionId, model } = req.body;

    console.log('📨 User:', req.user.name);
    console.log('📨 Message:', message);
    console.log('📨 Session:', sessionId);

    let session = await Session.findOne({ 
      sessionId, 
      userId: req.user._id 
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Save user message
    const userMessage = new Message({
      sessionId,
      role: 'user',
      content: message,
      timestamp: new Date()
    });
    await userMessage.save();

    // Update session title if first message
    if (session.messageCount === 0) {
      session.title = generateTitle(message);
    }

    session.updatedAt = new Date();
    session.messageCount += 1;
    await session.save();

    // Setup SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullResponse = '';

    try {
      console.log('🤖 Calling AI providers with fallback (starting with Gemini)...');
      const aiResponse = await aiManager.generateContent(message, model);
      
      if (!aiResponse.content || aiResponse.content.trim() === '') {
        throw new Error('Empty response from AI');
      }

      fullResponse = aiResponse.content;
      console.log('✅ Got response, length:', fullResponse.length);
      console.log('✅ Provider used:', aiResponse.provider);

      // Stream the response
      for await (const chunk of aiManager.streamResponse(aiResponse.content)) {
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }

      // Save assistant message
      const assistantMessage = new Message({
        sessionId,
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date(),
        provider: aiResponse.provider,
        model: aiResponse.model
      });
      await assistantMessage.save();

      // Update session
      session.messageCount += 1;
      session.provider = aiResponse.provider;
      session.model = aiResponse.model;
      session.updatedAt = new Date();
      await session.save();

      await User.findByIdAndUpdate(req.user._id, {
        $inc: { requestCount: 1 }
      });

      res.write('data: [DONE]\n\n');
      res.end();
      
      console.log('🎉 SUCCESS!');

    } catch (aiError) {
      console.error('❌ AI Error:', aiError.message);
      const errorMsg = `⚠️ AI Error: ${aiError.message}. Please try again.`;
      res.write(`data: ${JSON.stringify({ content: errorMsg })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }

  } catch (error) {
    console.error('❌ Chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Chat failed: ' + error.message });
    }
  }
});

app.delete('/api/chat/session/:sessionId', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    await Session.deleteOne({ 
      sessionId, 
      userId: req.user._id 
    });
    
    await Message.deleteMany({ sessionId });

    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ message: 'Failed to delete session' });
  }
});

app.patch('/api/chat/session/:sessionId/title', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title } = req.body;

    const session = await Session.findOneAndUpdate(
      { sessionId, userId: req.user._id },
      { title, updatedAt: new Date() },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    res.json({ session });
  } catch (error) {
    console.error('Update title error:', error);
    res.status(500).json({ message: 'Failed to update title' });
  }
});

app.post('/api/chat/clear', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.body;
    await Message.deleteMany({ sessionId });
    
    await Session.findOneAndUpdate(
      { sessionId, userId: req.user._id },
      { messageCount: 0, updatedAt: new Date() }
    );

    res.json({ message: 'Chat cleared successfully' });
  } catch (error) {
    console.error('Clear error:', error);
    res.status(500).json({ message: 'Failed to clear chat' });
  }
});

// Get suggested prompts (rotates based on time)
app.get('/api/prompts/suggested', (req, res) => {
  const allPrompts = [
    { icon: "💡", text: "Explain quantum computing", category: "Learn" },
    { icon: "✍️", text: "Write a creative story", category: "Create" },
    { icon: "🔍", text: "Help debug my code", category: "Code" },
    { icon: "🌍", text: "Latest AI trends", category: "Explore" },
    { icon: "🎨", text: "Design a landing page", category: "Design" },
    { icon: "📊", text: "Analyze market trends", category: "Business" },
    { icon: "🧪", text: "Chemistry experiment ideas", category: "Science" },
    { icon: "🎵", text: "Compose a song melody", category: "Music" },
    { icon: "🏋️", text: "Create workout plan", category: "Fitness" },
    { icon: "🍳", text: "Healthy meal recipe", category: "Cooking" },
    { icon: "📚", text: "Summarize a book", category: "Literature" },
    { icon: "🎮", text: "Game development tips", category: "Gaming" },
    { icon: "🚀", text: "Startup business ideas", category: "Business" },
    { icon: "🧠", text: "Memory improvement tips", category: "Learning" },
    { icon: "📱", text: "Build a mobile app", category: "Development" },
    { icon: "🌱", text: "Sustainable living tips", category: "Lifestyle" }
  ];

  // Rotate prompts based on hour and minute for more variation
  const now = new Date();
  const seed = now.getHours() * 60 + Math.floor(now.getMinutes() / 15);
  const startIndex = (seed % (allPrompts.length - 3));
  const selectedPrompts = allPrompts.slice(startIndex, startIndex + 4);

  res.json({ prompts: selectedPrompts });
});

// Database Connection & Server Start
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nexaflow-ai';

mongoose.connect(MONGODB_URI)
.then(() => {
  console.log('✅ MongoDB connected successfully');
  console.log(`📦 Database: ${MONGODB_URI}`);
  
  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => {
    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║     🚀 SMART TALK AI SERVER READY 🚀    ║`);
    console.log(`╚════════════════════════════════════════╝`);
    console.log(`\n📡 Port: ${PORT}`);
    console.log(`🤖 Multi-Provider AI: ACTIVE (Gemini First)`);
    console.log(`📧 Email Service: ${process.env.EMAIL_USER && process.env.EMAIL_PASSWORD ? 'CONFIGURED ✅' : 'NOT SET ❌'}`);
    console.log(`🔐 JWT Secret: ${process.env.JWT_SECRET ? 'CONFIGURED ✅' : 'NOT SET ❌'}`);
    console.log(`\n🔑 AI Providers (Priority Order):`);
    console.log(`   1️⃣ Gemini: ${process.env.GEMINI_API_KEY ? '✅ (DEFAULT)' : '❌'}`);
    console.log(`   2️⃣ OpenAI: ${process.env.OPENAI_API_KEY ? '✅ (FALLBACK)' : '❌'}`);
    console.log(`   3️⃣ Cohere: ${process.env.COHERE_API_KEY ? '✅ FREE (BACKUP)' : '❌'}`);
    console.log(`\n📝 Test Endpoints:`);
    console.log(`   • http://localhost:${PORT}/api/test`);
    console.log(`   • http://localhost:${PORT}/api/test-ai`);
    console.log(`\n════════════════════════════════════════\n`);
  });
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});