const express = require('express')
const swaggerUi = require('swagger-ui-express')
const app = express()
const url_router = require("./routes/urls")
const openapiSpecification = require('./swagger')

app.use(express.json())
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpecification))

app.use('/urls', url_router)


module.exports = app