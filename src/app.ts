import express, { Application } from 'express'
import swaggerUi from 'swagger-ui-express'
import urlRouter from './apps/urls/entry-points/api/urls.router'
import authRouter from './apps/auth/entry-points/api/auth.router'
import openapiSpecification from './swagger'

const app: Application = express()

app.use(express.json())
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpecification))

app.use('/auth', authRouter)
app.use('/urls', urlRouter)

export default app
