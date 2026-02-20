import express = require('express')
import ApiStatusCodes from '../../../../api/ApiStatusCodes'
import BaseApi from '../../../../api/BaseApi'
import InjectionExtractor from '../../../../injection/InjectionExtractor'
import { BlueGreenConfig } from '../../../../models/AppDefinition'
import Logger from '../../../../utils/Logger'

const router = express.Router()

// Enable blue-green for an app
router.post('/enable/', function (req, res, next) {
    const serviceManager =
        InjectionExtractor.extractUserFromInjected(res).user.serviceManager

    const appName = req.body.appName as string
    const config = req.body.config as Partial<BlueGreenConfig> | undefined

    return Promise.resolve()
        .then(function () {
            return serviceManager
                .getBlueGreenManager()
                .enableBlueGreen(appName, config)
        })
        .then(function () {
            const msg = `Blue-green deployment enabled for: ${appName}`
            Logger.d(msg)
            res.send(new BaseApi(ApiStatusCodes.STATUS_OK, msg))
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

// Disable blue-green for an app
router.post('/disable/', function (req, res, next) {
    const serviceManager =
        InjectionExtractor.extractUserFromInjected(res).user.serviceManager

    const appName = req.body.appName as string

    return Promise.resolve()
        .then(function () {
            return serviceManager
                .getBlueGreenManager()
                .disableBlueGreen(appName)
        })
        .then(function () {
            const msg = `Blue-green deployment disabled for: ${appName}`
            Logger.d(msg)
            res.send(new BaseApi(ApiStatusCodes.STATUS_OK, msg))
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

// Deploy to inactive slot
router.post('/deploy/', function (req, res, next) {
    const serviceManager =
        InjectionExtractor.extractUserFromInjected(res).user.serviceManager

    const appName = req.body.appName as string
    const source = req.body.source

    return Promise.resolve()
        .then(function () {
            return serviceManager
                .getBlueGreenManager()
                .deployToInactiveSlot(appName, source)
        })
        .then(function (result) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                `Deployed to ${result.slot} slot`
            )
            baseApi.data = result
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

// Switch traffic to inactive slot
router.post('/switch/', function (req, res, next) {
    const serviceManager =
        InjectionExtractor.extractUserFromInjected(res).user.serviceManager

    const appName = req.body.appName as string
    const force = req.body.force as boolean | undefined
    const targetSlot = req.body.targetSlot as 'blue' | 'green' | undefined

    return Promise.resolve()
        .then(function () {
            return serviceManager
                .getBlueGreenManager()
                .switchTraffic(appName, { force, targetSlot })
        })
        .then(function () {
            const msg = `Traffic switched for: ${appName}`
            Logger.d(msg)
            res.send(new BaseApi(ApiStatusCodes.STATUS_OK, msg))
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

// Rollback to previous active slot
router.post('/rollback/', function (req, res, next) {
    const serviceManager =
        InjectionExtractor.extractUserFromInjected(res).user.serviceManager

    const appName = req.body.appName as string

    return Promise.resolve()
        .then(function () {
            return serviceManager.getBlueGreenManager().rollback(appName)
        })
        .then(function () {
            const msg = `Rollback completed for: ${appName}`
            Logger.d(msg)
            res.send(new BaseApi(ApiStatusCodes.STATUS_OK, msg))
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

// Get slot status
router.get('/status/:appName/', function (req, res, next) {
    const serviceManager =
        InjectionExtractor.extractUserFromInjected(res).user.serviceManager

    const appName = req.params.appName as string

    return Promise.resolve()
        .then(function () {
            return serviceManager.getBlueGreenManager().getSlotStatus(appName)
        })
        .then(function (status) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'Blue-green status retrieved'
            )
            baseApi.data = status
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

// Update blue-green config
router.post('/config/', function (req, res, next) {
    const dataStore =
        InjectionExtractor.extractUserFromInjected(res).user.dataStore

    const appName = req.body.appName as string
    const config = req.body.config as Partial<BlueGreenConfig>

    return Promise.resolve()
        .then(function () {
            return dataStore.getAppsDataStore().getAppDefinition(appName)
        })
        .then(function (app) {
            if (!app.blueGreen?.enabled) {
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.ILLEGAL_OPERATION,
                    'Blue-green deployment is not enabled for this app'
                )
            }

            const updatedConfig = {
                ...app.blueGreen,
                ...config,
                enabled: true, // cannot disable via config update
                activeSlot: app.blueGreen.activeSlot, // cannot change active slot via config
            }

            dataStore
                .getAppsDataStore()
                .setBlueGreenConfig(appName, updatedConfig, app.slotDeployments)

            const msg = `Blue-green config updated for: ${appName}`
            Logger.d(msg)
            res.send(new BaseApi(ApiStatusCodes.STATUS_OK, msg))
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

// Cancel auto-switch
router.post('/cancel-auto/', function (req, res, next) {
    const serviceManager =
        InjectionExtractor.extractUserFromInjected(res).user.serviceManager

    const appName = req.body.appName as string

    return Promise.resolve()
        .then(function () {
            serviceManager.getBlueGreenManager().cancelAutoSwitch(appName)
            const msg = `Auto-switch cancelled for: ${appName}`
            Logger.d(msg)
            res.send(new BaseApi(ApiStatusCodes.STATUS_OK, msg))
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

export default router
