const express = require('express')
const swaggerUi = require('swagger-ui-express')
const app = express()
const url_router = require('./apps/urls/entry-points/api/urls.router')
const auth_router = require('./apps/auth/entry-points/api/auth.router')
const openapiSpecification = require('./swagger')

app.use(express.json())
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpecification))

app.use('/auth', auth_router)
app.use('/urls', url_router)


module.exports = app