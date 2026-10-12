const express = require('express')
const swaggerUi = require('swagger-ui-express')
const app = express()
const url_router = require("./routes/urls")
const auth_router = require('./routes/auth')
const openapiSpecification = require('./swagger')

app.use(express.json())
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpecification))

app.use('/auth', auth_router)
app.use('/urls', url_router)


module.exports = app