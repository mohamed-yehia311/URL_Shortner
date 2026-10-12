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
      schemas: {
        Url: {
          type: 'object',
          properties: {
            id: { type: 'integer', format: 'int64', example: 12 },
            user_id: { type: 'integer', format: 'int64', example: 1 },
            original_url: { type: 'string', format: 'uri', example: 'https://example.com/page' },
            short_code: { type: 'string', example: 'a1B2c3d4' },
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