import React, { useState, useEffect, useRef } from 'react';
import { Send, Plus, Menu, Settings, Download, Trash2, User, Lock, Mail, Sparkles, MessageSquare, Edit2, Check, X, Sun, Moon, LogOut, Phone, Globe, CheckCircle, Brain, Cpu, ChevronRight, Square } from 'lucide-react';

const API_URL = 'http://localhost:5000/api';

export default function NexaFlowAI() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [chatSessions, setChatSessions] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const messagesEndRef = useRef(null);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [authData, setAuthData] = useState({ 
    email: '', 
    password: '', 
    name: '', 
    phone: '', 
    country: '' 
  });
  const [suggestedPrompts, setSuggestedPrompts] = useState([]);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (token && userData) {
      setUser(JSON.parse(userData));
      setIsAuthenticated(true);
      loadChatSessions();
      loadSuggestedPrompts();
    } else {
      loadSuggestedPrompts();
    }
  }, []);

  const loadSuggestedPrompts = async () => {
    try {
      const response = await fetch(`${API_URL}/prompts/suggested`);
      const data = await response.json();
      setSuggestedPrompts(data.prompts || []);
    } catch (error) {
      console.error('Failed to load prompts:', error);
      setSuggestedPrompts([
        { icon: "💡", text: "Explain quantum computing", category: "Learn" },
        { icon: "✍️", text: "Write a creative story", category: "Create" },
        { icon: "🔍", text: "Help debug code", category: "Code" },
        { icon: "🌍", text: "Latest AI trends", category: "Explore" }
      ]);
    }
  };

  const loadChatSessions = async () => {
    try {
      const response = await fetch(`${API_URL}/chat/sessions`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setChatSessions(data.sessions || []);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const loadSessionMessages = async (sessionId) => {
    try {
      const response = await fetch(`${API_URL}/chat/messages/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setMessages(data.messages || []);
      setCurrentSessionId(sessionId);
      loadSuggestedPrompts();
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const createNewChat = async () => {
    try {
      const response = await fetch(`${API_URL}/chat/session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      setCurrentSessionId(data.sessionId);
      setMessages([]);
      loadChatSessions();
      loadSuggestedPrompts();
      return data.sessionId;
    } catch (error) {
      console.error('Failed to create session:', error);
      return null;
    }
  };

  const deleteSession = async (sessionId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this chat?')) return;

    try {
      await fetch(`${API_URL}/chat/session/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (sessionId === currentSessionId) {
        await createNewChat();
      }
      
      loadChatSessions();
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const updateSessionTitle = async (sessionId, newTitle) => {
    try {
      await fetch(`${API_URL}/chat/session/${sessionId}/title`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: newTitle })
      });
      
      loadChatSessions();
      setEditingSessionId(null);
    } catch (error) {
      console.error('Failed to update title:', error);
    }
  };

  const handleAuth = async () => {
    if (!authData.email || !authData.password) {
      alert('Please fill in all required fields');
      return;
    }
    if (authMode === 'signup' && !authData.name) {
      alert('Please enter your name');
      return;
    }
    
    const endpoint = authMode === 'signin' ? '/auth/signin' : '/auth/signup';
    
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authData)
      });

      const data = await response.json();
      
      if (response.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setUser(data.user);
        setIsAuthenticated(true);
        
        if (authMode === 'signup' && data.message) {
          alert(data.message);
        }
        
        const sessionId = await createNewChat();
        if (sessionId) {
          setCurrentSessionId(sessionId);
        }
        loadChatSessions();
      } else {
        alert(data.message || 'Authentication failed');
      }
    } catch (error) {
      alert('Cannot connect to backend. Please ensure the server is running.');
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    if (streamingMessage) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: streamingMessage + ' [Stopped by user]', 
        timestamp: new Date()
      }]);
    }
    
    setStreamingMessage('');
    setIsLoading(false);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    // CRITICAL FIX: Ensure session exists BEFORE sending
    let sessionId = currentSessionId;
    if (!sessionId) {
      console.log('No session ID, creating new session...');
      sessionId = await createNewChat();
      if (!sessionId) {
        alert('Failed to create chat session. Please try again.');
        return;
      }
      setCurrentSessionId(sessionId);
      // IMPORTANT: Wait for session to be fully created
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('Sending message with session ID:', sessionId);

    const userMessage = { role: 'user', content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);
    setStreamingMessage('');

    // Create abort controller for stop functionality
    abortControllerRef.current = new AbortController();

    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API_URL}/chat/stream`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: currentInput,
          sessionId: sessionId  // Using the confirmed session ID
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullMessage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullMessage += parsed.content;
                setStreamingMessage(fullMessage);
              }
            } catch (e) {}
          }
        }
      }

      if (fullMessage.trim()) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: fullMessage, 
          timestamp: new Date()
        }]);
      }
      setStreamingMessage('');
      loadChatSessions();

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Generation stopped by user');
      } else {
        console.error('Chat error:', error);
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: '⚠️ Error connecting to AI. Please try again.', 
          timestamp: new Date(),
          isError: true
        }]);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isAuthenticated) {
        handleSendMessage();
      } else {
        handleAuth();
      }
    }
  };

  const exportChat = () => {
    const content = messages.map(m => 
      `[${new Date(m.timestamp).toLocaleString()}] ${m.role}: ${m.content}`
    ).join('\n\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexaflow-ai-${new Date().toISOString()}.txt`;
    a.click();
  };

  const clearCurrentChat = async () => {
    if (!currentSessionId) return;
    if (!window.confirm('Clear all messages?')) return;

    try {
      await fetch(`${API_URL}/chat/clear`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionId: currentSessionId })
      });
      setMessages([]);
      loadChatSessions();
    } catch (error) {
      console.error('Clear error:', error);
    }
  };

  // FIXED: Accurate date calculation
  const formatDate = (dateString) => {
    const chatDate = new Date(dateString);
    const today = new Date();
    
    // Normalize to midnight for accurate comparison
    const chatDay = new Date(chatDate.getFullYear(), chatDate.getMonth(), chatDate.getDate());
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // Calculate difference in milliseconds
    const diffMs = todayDay - chatDay;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays} days ago`;
    if (diffDays <= 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    
    // For older dates, show formatted date
    const options = { month: 'short', day: 'numeric' };
    if (chatDate.getFullYear() !== today.getFullYear()) {
      options.year = 'numeric';
    }
    return chatDate.toLocaleDateString('en-US', options);
  };

  if (!isAuthenticated) {
    return (
      <div className={`min-h-screen ${darkMode ? 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900' : 'bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50'} flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-500`}>
        <div className="absolute inset-0">
          <div className={`absolute top-20 left-20 w-72 h-72 ${darkMode ? 'bg-purple-500' : 'bg-purple-300'} rounded-full mix-blend-multiply filter blur-xl ${darkMode ? 'opacity-20' : 'opacity-30'} animate-blob`}></div>
          <div className={`absolute top-40 right-20 w-72 h-72 ${darkMode ? 'bg-blue-500' : 'bg-blue-300'} rounded-full mix-blend-multiply filter blur-xl ${darkMode ? 'opacity-20' : 'opacity-30'} animate-blob animation-delay-2000`}></div>
          <div className={`absolute bottom-20 left-1/2 w-72 h-72 ${darkMode ? 'bg-pink-500' : 'bg-pink-300'} rounded-full mix-blend-multiply filter blur-xl ${darkMode ? 'opacity-20' : 'opacity-30'} animate-blob animation-delay-4000`}></div>
        </div>

        <button
          onClick={() => setDarkMode(!darkMode)}
          className={`absolute top-6 right-6 p-3 rounded-full ${darkMode ? 'bg-white/10 hover:bg-white/20' : 'bg-purple-100 hover:bg-purple-200'} backdrop-blur-sm transition-all duration-300 shadow-lg z-50`}
        >
          {darkMode ? (
            <Sun className="w-6 h-6 text-yellow-300" />
          ) : (
            <Moon className="w-6 h-6 text-purple-700" />
          )}
        </button>

        <div className="relative w-full max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className={`${darkMode ? 'text-white' : 'text-gray-900'} space-y-6`}>
              <div className="mb-8">
                <svg viewBox="0 0 400 400" className="w-64 h-64 mx-auto">
                  <defs>
                    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" style={{stopColor: '#8b5cf6', stopOpacity: 1}} />
                      <stop offset="100%" style={{stopColor: '#3b82f6', stopOpacity: 1}} />
                    </linearGradient>
                  </defs>
                  <circle cx="200" cy="200" r="180" fill="url(#grad1)" opacity="0.2"/>
                  <circle cx="200" cy="200" r="140" fill="url(#grad1)" opacity="0.3"/>
                  <circle cx="200" cy="200" r="100" fill="url(#grad1)" opacity="0.4"/>
                  
                  <g className="animate-pulse">
                    <path d="M200 120 L240 160 L200 200 L160 160 Z" fill="#8b5cf6"/>
                    <path d="M200 200 L240 240 L200 280 L160 240 Z" fill="#3b82f6"/>
                    <circle cx="200" cy="160" r="8" fill="white"/>
                    <circle cx="240" cy="200" r="8" fill="white"/>
                    <circle cx="200" cy="240" r="8" fill="white"/>
                    <circle cx="160" cy="200" r="8" fill="white"/>
                  </g>
                  
                  <text x="200" y="340" textAnchor="middle" fill={darkMode ? 'white' : '#1f2937'} fontSize="32" fontWeight="bold">Smart Talk</text>
                  <text x="200" y="365" textAnchor="middle" fill={darkMode ? '#a78bfa' : '#8b5cf6'} fontSize="14">AI Intelligence Platform</text>
                </svg>
              </div>

              <div className="text-center md:text-left space-y-4">
                <div className="space-y-2">
                  <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                    Smart Talk AI
                  </h1>
                  <p className={`text-xl ${darkMode ? 'text-purple-300' : 'text-purple-600'} font-semibold`}>
                    Next-Generation Intelligence
                  </p>
                </div>

                <div className={`space-y-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'} text-lg leading-relaxed`}>
                  <p className="flex items-start gap-3">
                    <Brain className="w-6 h-6 text-purple-500 flex-shrink-0 mt-1" />
                    <span>Experience cutting-edge AI with multi-provider fallback system ensuring 99.9% uptime and intelligent responses.</span>
                  </p>
                  <p className="flex items-start gap-3">
                    <Cpu className="w-6 h-6 text-blue-500 flex-shrink-0 mt-1" />
                    <span>Powered by Gemini, OpenAI, and Cohere - seamlessly switching to ensure you always get the best response.</span>
                  </p>
                  <p className="flex items-start gap-3">
                    <ChevronRight className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-1" />
                    <span>Lightning-fast streaming responses, smart context retention, and unlimited conversations - completely free.</span>
                  </p>
                </div>

                <div className="pt-6 flex flex-wrap gap-3 justify-center md:justify-start">
                  <span className={`px-4 py-2 rounded-full text-sm font-semibold ${darkMode ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-green-100 text-green-700 border border-green-300'}`}>
                    ✓ Multi-AI Powered
                  </span>
                  <span className={`px-4 py-2 rounded-full text-sm font-semibold ${darkMode ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-blue-100 text-blue-700 border border-blue-300'}`}>
                    ✓ 99.9% Uptime
                  </span>
                  <span className={`px-4 py-2 rounded-full text-sm font-semibold ${darkMode ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-purple-100 text-purple-700 border border-purple-300'}`}>
                    ✓ Enterprise Grade
                  </span>
                </div>
              </div>
            </div>

            <div className={`${darkMode ? 'bg-white/10 border-white/20' : 'bg-white border-gray-200'} backdrop-blur-xl rounded-2xl p-8 shadow-2xl border`}>
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setAuthMode('signin')}
                  className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                    authMode === 'signin'
                      ? darkMode 
                        ? 'bg-white text-purple-600 shadow-lg'
                        : 'bg-purple-600 text-white shadow-lg'
                      : darkMode
                        ? 'text-white hover:bg-white/10'
                        : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => setAuthMode('signup')}
                  className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                    authMode === 'signup'
                      ? darkMode 
                        ? 'bg-white text-purple-600 shadow-lg'
                        : 'bg-purple-600 text-white shadow-lg'
                      : darkMode
                        ? 'text-white hover:bg-white/10'
                        : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Sign Up for Free
                </button>
              </div>

              <div className="space-y-4">
                {authMode === 'signup' && (
                  <>
                    <div className="relative">
                      <User className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                      <input
                        type="text"
                        placeholder="Full Name *"
                        value={authData.name}
                        onChange={(e) => setAuthData({...authData, name: e.target.value})}
                        onKeyPress={handleKeyPress}
                        className={`w-full pl-12 pr-4 py-3 rounded-xl ${darkMode ? 'bg-white/10 border-white/20 text-white placeholder-gray-400' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500'} border focus:outline-none focus:border-purple-400 transition-all`}
                      />
                    </div>

                    <div className="relative">
                      <Phone className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                      <input
                        type="tel"
                        placeholder="Phone Number *"
                        value={authData.phone}
                        onChange={(e) => setAuthData({...authData, phone: e.target.value})}
                        onKeyPress={handleKeyPress}
                        className={`w-full pl-12 pr-4 py-3 rounded-xl ${darkMode ? 'bg-white/10 border-white/20 text-white placeholder-gray-400' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500'} border focus:outline-none focus:border-purple-400 transition-all`}
                      />
                    </div>

                    <div className="relative">
                      <Globe className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                      <input
                        type="text"
                        placeholder="Country *"
                        value={authData.country}
                        onChange={(e) => setAuthData({...authData, country: e.target.value})}
                        onKeyPress={handleKeyPress}
                        className={`w-full pl-12 pr-4 py-3 rounded-xl ${darkMode ? 'bg-white/10 border-white/20 text-white placeholder-gray-400' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500'} border focus:outline-none focus:border-purple-400 transition-all`}
                      />
                    </div>
                  </>
                )}

                <div className="relative">
                  <Mail className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                  <input
                    type="email"
                    placeholder="Email *"
                    value={authData.email}
                    onChange={(e) => setAuthData({...authData, email: e.target.value})}
                    onKeyPress={handleKeyPress}
                    className={`w-full pl-12 pr-4 py-3 rounded-xl ${darkMode ? 'bg-white/10 border-white/20 text-white placeholder-gray-400' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500'} border focus:outline-none focus:border-purple-400 transition-all`}
                  />
                </div>

                <div className="relative">
                  <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                  <input
                    type="password"
                    placeholder="Password *"
                    value={authData.password}
                    onChange={(e) => setAuthData({...authData, password: e.target.value})}
                    onKeyPress={handleKeyPress}
                    className={`w-full pl-12 pr-4 py-3 rounded-xl ${darkMode ? 'bg-white/10 border-white/20 text-white placeholder-gray-400' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500'} border focus:outline-none focus:border-purple-400 transition-all`}
                  />
                </div>

                {authMode === 'signup' && (
                  <div className={`flex items-start gap-2 p-3 rounded-lg ${darkMode ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'} border text-sm`}>
                    <CheckCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className={darkMode ? 'text-blue-200' : 'text-blue-800'}>
                      We'll send a verification email to confirm your account.
                    </p>
                  </div>
                )}

                <button
                  onClick={handleAuth}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold hover:shadow-xl transition-all hover:scale-[1.02]"
                >
                  {authMode === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
              </div>

              <p className={`text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-6`}>
                {authMode === 'signin' ? "New here? " : "Already have an account? "}
                <button
                  onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                  className={`${darkMode ? 'text-purple-300 hover:text-white' : 'text-purple-600 hover:text-purple-700'} font-semibold`}
                >
                  {authMode === 'signin' ? 'Sign Up' : 'Sign In'}
                </button>
              </p>

              <div className={`mt-8 pt-6 border-t ${darkMode ? 'border-white/10' : 'border-gray-200'}`}>
                <p className={`text-center text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  © 2025 Smart Talk AI. All rights reserved.
                </p>
                <p className={`text-center text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'} mt-1`}>
                  Developed with ❤️ by <span className="font-semibold text-purple-400">Nutan Phadtare</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes blob {
            0%, 100% { transform: translate(0, 0) scale(1); }
            25% { transform: translate(20px, -50px) scale(1.1); }
            50% { transform: translate(-20px, 20px) scale(0.9); }
            75% { transform: translate(50px, 50px) scale(1.05); }
          }
          .animate-blob { animation: blob 7s infinite; }
          .animation-delay-2000 { animation-delay: 2s; }
          .animation-delay-4000 { animation-delay: 4s; }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`flex h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className={`${sidebarOpen ? 'w-72' : 'w-0'} transition-all duration-300 ${darkMode ? 'bg-gray-950 border-gray-800' : 'bg-white border-gray-200'} border-r flex flex-col overflow-hidden`}>
        <div className={`p-4 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <button
            onClick={createNewChat}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${darkMode ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-purple-100 hover:bg-purple-200 text-purple-900'} font-medium transition-colors`}
          >
            <Plus className="w-5 h-5" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <div className={`px-3 py-2 text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-600'} uppercase tracking-wide`}>
            Chat History
          </div>
          {chatSessions.map((session) => (
            <div
              key={session.sessionId}
              onClick={() => loadSessionMessages(session.sessionId)}
              className={`group flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                session.sessionId === currentSessionId
                  ? darkMode ? 'bg-gray-800 text-white' : 'bg-purple-50 text-purple-900'
                  : darkMode ? 'hover:bg-gray-800/50 text-gray-300' : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              <MessageSquare className="w-4 h-4 mt-1 flex-shrink-0 text-purple-500" />
              <div className="flex-1 min-w-0">
                {editingSessionId === session.sessionId ? (
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className={`flex-1 px-2 py-1 text-xs rounded ${darkMode ? 'bg-gray-900 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border`}
                      autoFocus
                    />
                    <button onClick={() => updateSessionTitle(session.sessionId, editTitle)}>
                      <Check className="w-4 h-4 text-green-500" />
                    </button>
                    <button onClick={() => setEditingSessionId(null)}>
                      <X className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                ) : (
                  <>
                    <p className={`text-sm truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {session.title}
                    </p>
                    <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-600'}`}>
                      {formatDate(session.updatedAt)}
                    </p>
                  </>
                )}
              </div>
              <div className="hidden group-hover:flex gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingSessionId(session.sessionId);
                    setEditTitle(session.title);
                  }}
                  className={`p-1 rounded ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => deleteSession(session.sessionId, e)}
                  className={`p-1 rounded ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                >
                  <Trash2 className="w-3 h-3 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className={`p-4 border-t ${darkMode ? 'border-gray-800' : 'border-gray-200'} space-y-2`}>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg ${darkMode ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-700'} transition-colors`}
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium">Settings</span>
          </button>

          {showSettings && (
            <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-100'} space-y-3`}>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`w-full flex items-center justify-center gap-3 px-3 py-2 rounded-lg ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'} border ${darkMode ? 'border-gray-700' : 'border-gray-300'} hover:scale-105 transition-transform`}
              >
                {darkMode ? (
                  <>
                    <Sun className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm font-medium">Light Mode</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-medium">Dark Mode</span>
                  </>
                )}
              </button>

              <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-900/50 border-gray-700' : 'bg-white border-gray-300'} border`}>
                <p className={`text-xs font-semibold mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>AI Providers</p>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Gemini</span>
                    <span className="text-green-500">●</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>OpenAI</span>
                    <span className="text-green-500">●</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Cohere</span>
                    <span className="text-green-500">●</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={clearCurrentChat}
            className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg ${darkMode ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-700'} transition-colors`}
          >
            <Trash2 className="w-5 h-5" />
            <span className="font-medium">Clear Chat</span>
          </button>

          <button
            onClick={exportChat}
            className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg ${darkMode ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-700'} transition-colors`}
          >
            <Download className="w-5 h-5" />
            <span className="font-medium">Export Chat</span>
          </button>

          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center font-bold text-white">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{user?.name}</p>
              <p className={`text-xs truncate ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{user?.email}</p>
            </div>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'} transition-colors`}
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className={`${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'} border-b px-6 py-4 flex items-center justify-between`}>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-700'} transition-colors`}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Smart Talk AI</h1>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Multi-Provider Intelligence</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8">
              <div className="max-w-3xl w-full">
                <div className="text-center mb-12">
                  <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl mb-6 shadow-2xl">
                    <Sparkles className="w-10 h-10 text-white" />
                  </div>
                  <h2 className={`text-4xl font-bold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    How can I help you today?
                  </h2>
                  <p className={`text-lg ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Powered by multiple AI providers for maximum reliability
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {suggestedPrompts.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(prompt.text)}
                      className={`group p-5 rounded-xl text-left transition-all hover:scale-105 ${
                        darkMode ? 'bg-gray-800 hover:bg-gray-750 border-gray-700' : 'bg-white hover:bg-gray-50 border-gray-200'
                      } border shadow-lg hover:shadow-xl`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-3xl">{prompt.icon}</span>
                        <div className="flex-1">
                          <p className={`text-xs font-bold mb-1 uppercase tracking-wide ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                            {prompt.category}
                          </p>
                          <p className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                            {prompt.text}
                          </p>
                        </div>
                        <ChevronRight className={`w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full p-6 space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className="flex gap-4 animate-fadeIn">
                  {msg.role === 'assistant' ? (
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0 shadow-lg">
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0 font-bold text-white shadow-lg">
                      {user?.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {msg.role === 'user' ? user?.name : 'NexaFlow AI'}
                      </span>
                      {msg.provider && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${darkMode ? 'bg-purple-900/50 text-purple-300' : 'bg-purple-100 text-purple-700'}`}>
                          {msg.provider}
                        </span>
                      )}
                    </div>
                    <p className={`whitespace-pre-wrap leading-relaxed ${msg.isError ? 'text-red-500' : darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))}

              {streamingMessage && (
                <div className="flex gap-4 animate-fadeIn">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0 shadow-lg">
                    <Sparkles className="w-5 h-5 text-white animate-pulse" />
                  </div>
                  <div className="flex-1">
                    <span className={`text-sm font-bold block mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Smart Talk AI
                    </span>
                    <p className={`whitespace-pre-wrap leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {streamingMessage}
                      <span className="inline-block w-2 h-4 bg-purple-500 ml-1 animate-pulse"></span>
                    </p>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className={`${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'} border-t p-4`}>
          <div className="max-w-3xl mx-auto">
            <div className={`flex gap-4 p-4 rounded-2xl ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'} border shadow-lg`}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask Smart Talk AI anything..."
                disabled={isLoading}
                rows={1}
                className={`flex-1 bg-transparent border-none focus:outline-none resize-none ${darkMode ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'} disabled:opacity-50`}
                style={{ minHeight: '24px', maxHeight: '200px' }}
              />
              {isLoading ? (
                <button
                  onClick={stopGeneration}
                  className="w-12 h-12 rounded-xl bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all hover:scale-105 flex-shrink-0"
                  title="Stop generation"
                >
                  <Square className="w-5 h-5 text-white fill-white" />
                </button>
              ) : (
                <button
                  onClick={handleSendMessage}
                  disabled={!input.trim()}
                  className="w-12 h-12 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl transition-all hover:scale-105 flex-shrink-0"
                >
                  <Send className="w-5 h-5 text-white" />
                </button>
              )}
            </div>
            <p className={`text-xs text-center mt-3 ${darkMode ? 'text-gray-500' : 'text-gray-600'}`}>
              Smart Talk AI uses multiple providers for best results. Always verify important information.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}