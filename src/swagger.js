const swaggerJsdoc = require('swagger-jsdoc')
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'URL Shortener API',
      version: '1.0.0',
      description: 'API documentation for the URL shortener service.',
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 8080}`,
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        AuthUser: {
          type: 'object',
          properties: {
            id: { type: 'integer', format: 'int64', example: 3 },
            username: { type: 'string', example: 'sam' },
            email: { type: 'string', format: 'email', example: 'sam@example.com' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        AuthenticatedSession: {
          type: 'object',
          properties: {
            user: { $ref: '#/components/schemas/AuthUser' },
            access_token: { type: 'string' },
            token_type: { type: 'string', example: 'Bearer' },
            expires_in: { type: 'integer', example: 900 },
            refresh_token: { type: 'string' },
            refresh_expires_in: { type: 'integer', example: 2592000 },
          },
        },
        RefreshedTokens: {
          type: 'object',
          properties: {
            access_token: { type: 'string' },
            token_type: { type: 'string', example: 'Bearer' },
            expires_in: { type: 'integer', example: 900 },
            refresh_token: { type: 'string' },
            refresh_expires_in: { type: 'integer', example: 2592000 },
          },
        },
        Url: {
          type: 'object',
          properties: {
            id: { type: 'integer', format: 'int64', example: 12 },
            user_id: { type: 'integer', format: 'int64', example: 1 },
            original_url: { type: 'string', format: 'uri', example: 'https://example.com/page' },
            short_key: { type: 'string', example: 'a1B2c3d4' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;   