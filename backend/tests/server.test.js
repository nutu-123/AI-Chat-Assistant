// tests/server.test.js
const request = require('supertest');
const mongoose = require('mongoose');

// Mock environment variables
process.env.JWT_SECRET = 'test-secret';
process.env.MONGODB_URI = 'mongodb://localhost:27017/nexaflow-test';

describe('NexaFlow AI API Tests', () => {
  let app;
  let server;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI);
    app = require('../server');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Health Check Endpoints', () => {
    test('GET /api/test should return server status', async () => {
      const response = await request(app)
        .get('/api/test')
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('mongodb');
      expect(response.body).toHaveProperty('providers');
    });
  });

  describe('Authentication', () => {
    const testUser = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123'
    };

    test('POST /api/auth/signup should create new user', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send(testUser)
        .expect(201);

      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toHaveProperty('email', testUser.email);
    });

    test('POST /api/auth/signin should authenticate user', async () => {
      const response = await request(app)
        .post('/api/auth/signin')
        .send({
          email: testUser.email,
          password: testUser.password
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toHaveProperty('email', testUser.email);
    });

    test('POST /api/auth/signin should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/signin')
        .send({
          email: testUser.email,
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body).toHaveProperty('message', 'Invalid credentials');
    });
  });

  describe('AI Provider Fallback System', () => {
    test('Should successfully get AI response from available provider', async () => {
      // This test requires at least one API key to be configured
      const response = await request(app)
        .get('/api/test-ai')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('provider');
      expect(response.body).toHaveProperty('response');
    });
  });

  describe('Chat Session Management', () => {
    let authToken;
    let sessionId;

    beforeAll(async () => {
      // Create and authenticate a user
      const signupResponse = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Chat Test User',
          email: 'chattest@example.com',
          password: 'password123'
        });
      
      authToken = signupResponse.body.token;
    });

    test('POST /api/chat/session should create new session', async () => {
      const response = await request(app)
        .post('/api/chat/session')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('sessionId');
      sessionId = response.body.sessionId;
    });

    test('GET /api/chat/sessions should return user sessions', async () => {
      const response = await request(app)
        .get('/api/chat/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('sessions');
      expect(Array.isArray(response.body.sessions)).toBe(true);
    });

    test('GET /api/chat/messages/:sessionId should return session messages', async () => {
      const response = await request(app)
        .get(`/api/chat/messages/${sessionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('messages');
      expect(Array.isArray(response.body.messages)).toBe(true);
    });

    test('PATCH /api/chat/session/:sessionId/title should update title', async () => {
      const newTitle = 'Updated Chat Title';
      const response = await request(app)
        .patch(`/api/chat/session/${sessionId}/title`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: newTitle })
        .expect(200);

      expect(response.body.session).toHaveProperty('title', newTitle);
    });

    test('DELETE /api/chat/session/:sessionId should delete session', async () => {
      await request(app)
        .delete(`/api/chat/session/${sessionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  describe('Suggested Prompts', () => {
    test('GET /api/prompts/suggested should return rotating prompts', async () => {
      const response = await request(app)
        .get('/api/prompts/suggested')
        .expect(200);

      expect(response.body).toHaveProperty('prompts');
      expect(Array.isArray(response.body.prompts)).toBe(true);
      expect(response.body.prompts.length).toBe(4);
      
      response.body.prompts.forEach(prompt => {
        expect(prompt).toHaveProperty('icon');
        expect(prompt).toHaveProperty('text');
        expect(prompt).toHaveProperty('category');
      });
    });
  });

  describe('Authorization Middleware', () => {
    test('Should reject requests without token', async () => {
      await request(app)
        .get('/api/chat/sessions')
        .expect(401);
    });

    test('Should reject requests with invalid token', async () => {
      await request(app)
        .get('/api/chat/sessions')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});

// Mock Provider Tests
describe('AI Provider Mock Tests', () => {
  class MockGeminiProvider {
    constructor() {
      this.name = 'MockGemini';
      this.defaultModel = 'mock-model';
    }

    async generateContent(prompt) {
      return `Mock response to: ${prompt}`;
    }
  }

  test('Mock provider should return deterministic response', async () => {
    const provider = new MockGeminiProvider();
    const prompt = 'Hello';
    const response = await provider.generateContent(prompt);
    
    expect(response).toBe('Mock response to: Hello');
  });
});

// Streaming Tests
describe('Streaming Response Tests', () => {
  test('Should stream response in chunks', async () => {
    const text = 'Hello World';
    const chunks = [];
    
    async function* mockStream(text) {
      for (let i = 0; i < text.length; i += 2) {
        yield text.slice(i, i + 2);
      }
    }

    for await (const chunk of mockStream(text)) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe(text);
  });
});