import AppDataRouter from './appdata/AppDataRouter'
import AppDefinitionRouter from './appdefinition/AppDefinitionRouter'
import BlueGreenRouter from './bluegreen/BlueGreenRouter'
import WebhooksRouter from './webhooks/WebhooksRouter'

import express = require('express')

const router = express.Router()

router.use('/appDefinitions/', AppDefinitionRouter)

router.use('/appData/', AppDataRouter)

router.use('/bluegreen/', BlueGreenRouter)

// semi-secured end points:
router.use('/webhooks/', WebhooksRouter)

export default router
