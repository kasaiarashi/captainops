import ApiStatusCodes from '../api/ApiStatusCodes'
import DataStore from '../datastore/DataStore'
import DockerApi from '../docker/DockerApi'
import {
    BlueGreenConfig,
    BlueGreenSlot,
    SlotDeploymentMetadata,
    IAppDef,
} from '../models/AppDefinition'
import { IHashMapGeneric } from '../models/ICacheGeneric'
import { IImageSource } from '../models/IImageSource'
import CaptainConstants from '../utils/CaptainConstants'
import Logger from '../utils/Logger'
import HealthChecker from './HealthChecker'
import ImageMaker from './ImageMaker'
import DockerRegistryHelper from './DockerRegistryHelper'
import { EventLogger } from './events/EventLogger'
import {
    CapRoverEventFactory,
    CapRoverEventType,
} from './events/ICapRoverEvent'
import LoadBalancerManager from './system/LoadBalancerManager'

const DEFAULT_BLUE_GREEN_CONFIG: BlueGreenConfig = {
    enabled: true,
    activeSlot: 'blue',
    autoSwitchEnabled: false,
    autoSwitchDelayMinutes: 5,
    healthCheckPath: '/health',
    healthCheckIntervalSeconds: 10,
    healthCheckTimeoutSeconds: 5,
    healthCheckThreshold: 3,
}

class BlueGreenManager {
    private switchLocks: IHashMapGeneric<boolean> = {}
    private autoSwitchTimers: IHashMapGeneric<NodeJS.Timeout> = {}

    constructor(
        private dataStore: DataStore,
        private dockerApi: DockerApi,
        private loadBalancerManager: LoadBalancerManager,
        private healthChecker: HealthChecker,
        private eventLogger: EventLogger,
        private imageMaker: ImageMaker,
        private dockerRegistryHelper: DockerRegistryHelper
    ) {}

    getInactiveSlot(app: IAppDef): BlueGreenSlot {
        if (!app.blueGreen?.enabled) {
            throw ApiStatusCodes.createError(
                ApiStatusCodes.ILLEGAL_OPERATION,
                'Blue-green deployment is not enabled for this app'
            )
        }
        return app.blueGreen.activeSlot === 'blue' ? 'green' : 'blue'
    }

    async enableBlueGreen(
        appName: string,
        config?: Partial<BlueGreenConfig>
    ): Promise<void> {
        const appsDataStore = this.dataStore.getAppsDataStore()
        const app = await appsDataStore.getAppDefinition(appName)

        if (app.blueGreen?.enabled) {
            throw ApiStatusCodes.createError(
                ApiStatusCodes.ILLEGAL_OPERATION,
                'Blue-green deployment is already enabled for this app'
            )
        }

        const blueGreenConfig: BlueGreenConfig = {
            ...DEFAULT_BLUE_GREEN_CONFIG,
            ...config,
            enabled: true,
            activeSlot: 'blue',
        }

        const currentServiceName = appsDataStore.getServiceName(appName)
        const blueServiceName = appsDataStore.getBlueServiceName(appName)
        const greenServiceName = appsDataStore.getGreenServiceName(appName)

        // Find the currently deployed image
        let currentImage = CaptainConstants.configs.appPlaceholderImageName
        for (const ver of app.versions) {
            if (ver.version === app.deployedVersion && ver.deployedImageName) {
                currentImage = ver.deployedImageName
                break
            }
        }

        // Create blue slot service with current app config
        const isRunning =
            await this.dockerApi.isServiceRunningByName(currentServiceName)

        if (isRunning) {
            await this.dockerApi.removeServiceByName(currentServiceName)
        }

        // Create blue slot with the current image
        await this.dockerApi.createServiceOnNodeId(
            currentImage,
            blueServiceName,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined
        )

        // Create green slot scaled to 0 (placeholder)
        await this.dockerApi.createServiceOnNodeId(
            CaptainConstants.configs.appPlaceholderImageName,
            greenServiceName,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined
        )

        // Update app definition
        app.blueGreen = blueGreenConfig
        app.slotDeployments = {
            blue: {
                slot: 'blue',
                deployedAt: new Date().toISOString(),
                deployedVersion: app.deployedVersion,
                deployedImageName: currentImage,
                status: 'live',
            },
            green: {
                slot: 'green',
                deployedAt: new Date().toISOString(),
                deployedVersion: 0,
                deployedImageName:
                    CaptainConstants.configs.appPlaceholderImageName,
                status: 'idle',
            },
        }

        // Save via the data store's internal mechanism
        this.dataStore
            .getAppsDataStore()
            .setBlueGreenConfig(appName, app.blueGreen, app.slotDeployments)

        await this.loadBalancerManager.rePopulateNginxConfigFile()

        Logger.d(`Blue-green enabled for ${appName}`)
    }

    async disableBlueGreen(appName: string): Promise<void> {
        const appsDataStore = this.dataStore.getAppsDataStore()
        const app = await appsDataStore.getAppDefinition(appName)

        if (!app.blueGreen?.enabled) {
            throw ApiStatusCodes.createError(
                ApiStatusCodes.ILLEGAL_OPERATION,
                'Blue-green deployment is not enabled for this app'
            )
        }

        const activeSlot = app.blueGreen.activeSlot
        const activeServiceName = appsDataStore.getSlotServiceName(
            appName,
            activeSlot
        )
        const inactiveServiceName = appsDataStore.getSlotServiceName(
            appName,
            activeSlot === 'blue' ? 'green' : 'blue'
        )
        const standardServiceName = appsDataStore.getServiceName(appName)

        // Get the active slot's image
        let activeImage = CaptainConstants.configs.appPlaceholderImageName
        const activeSlotMeta = app.slotDeployments?.[activeSlot]
        if (activeSlotMeta?.deployedImageName) {
            activeImage = activeSlotMeta.deployedImageName
        }

        // Create standard service with active config
        await this.dockerApi.createServiceOnNodeId(
            activeImage,
            standardServiceName,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined
        )

        // Remove both slot services
        const removeService = async (svcName: string) => {
            const running = await this.dockerApi.isServiceRunningByName(svcName)
            if (running) {
                await this.dockerApi.removeServiceByName(svcName)
            }
        }

        await removeService(activeServiceName)
        await removeService(inactiveServiceName)

        // Clear blue-green from app def
        this.dataStore
            .getAppsDataStore()
            .setBlueGreenConfig(appName, undefined, undefined)

        this.cancelAutoSwitch(appName)

        await this.loadBalancerManager.rePopulateNginxConfigFile()

        Logger.d(`Blue-green disabled for ${appName}`)
    }

    async deployToInactiveSlot(
        appName: string,
        source: IImageSource
    ): Promise<{ slot: BlueGreenSlot; builtImage: string }> {
        const appsDataStore = this.dataStore.getAppsDataStore()
        const app = await appsDataStore.getAppDefinition(appName)

        if (!app.blueGreen?.enabled) {
            throw ApiStatusCodes.createError(
                ApiStatusCodes.ILLEGAL_OPERATION,
                'Blue-green deployment is not enabled for this app'
            )
        }

        const inactiveSlot = this.getInactiveSlot(app)
        const inactiveServiceName = appsDataStore.getSlotServiceName(
            appName,
            inactiveSlot
        )

        this.eventLogger.trackEvent(
            CapRoverEventFactory.create(
                CapRoverEventType.BlueGreenDeployStarted,
                { appName, slot: inactiveSlot }
            )
        )

        try {
            // Create a new version
            const newVersion = await appsDataStore.createNewVersion(appName)

            // Build the image
            const builtImage = await this.imageMaker.ensureImage(
                source,
                appName,
                app.captainDefinitionRelativeFilePath,
                newVersion,
                app.envVars || []
            )

            // Set deployed version and image
            await appsDataStore.setDeployedVersionAndImage(
                appName,
                newVersion,
                builtImage
            )

            // Update the inactive slot service with the new image
            const isRunning =
                await this.dockerApi.isServiceRunningByName(inactiveServiceName)

            if (!isRunning) {
                await this.dockerApi.createServiceOnNodeId(
                    builtImage.imageName,
                    inactiveServiceName,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined
                )
            } else {
                const dockerAuthObject =
                    await this.dockerRegistryHelper.getDockerAuthObjectForImageName(
                        builtImage.imageName
                    )

                await this.dockerApi.updateService(
                    inactiveServiceName,
                    builtImage.imageName,
                    app.volumes,
                    app.networks,
                    app.envVars,
                    undefined,
                    dockerAuthObject,
                    Number(app.instanceCount),
                    app.nodeId,
                    this.dataStore.getNameSpace(),
                    app.ports,
                    app,
                    undefined,
                    undefined,
                    undefined
                )
            }

            // Update slot deployment metadata
            const slotDeployments = app.slotDeployments || {}
            slotDeployments[inactiveSlot] = {
                slot: inactiveSlot,
                deployedAt: new Date().toISOString(),
                deployedVersion: newVersion,
                deployedImageName: builtImage.imageName,
                status: 'deployed',
            }

            appsDataStore.setBlueGreenConfig(
                appName,
                app.blueGreen,
                slotDeployments
            )

            this.eventLogger.trackEvent(
                CapRoverEventFactory.create(
                    CapRoverEventType.BlueGreenDeployCompleted,
                    {
                        appName,
                        slot: inactiveSlot,
                        image: builtImage.imageName,
                    }
                )
            )

            // Schedule auto switch if enabled
            if (app.blueGreen.autoSwitchEnabled) {
                this.scheduleAutoSwitch(
                    appName,
                    app.blueGreen.autoSwitchDelayMinutes
                )
            }

            return {
                slot: inactiveSlot,
                builtImage: builtImage.imageName,
            }
        } catch (error: any) {
            this.eventLogger.trackEvent(
                CapRoverEventFactory.create(
                    CapRoverEventType.BlueGreenDeployFailed,
                    {
                        appName,
                        slot: inactiveSlot,
                        error: (error.message || '').substring(0, 1000),
                    }
                )
            )
            throw error
        }
    }

    async switchTraffic(
        appName: string,
        options?: { force?: boolean; targetSlot?: BlueGreenSlot }
    ): Promise<void> {
        const appsDataStore = this.dataStore.getAppsDataStore()
        const app = await appsDataStore.getAppDefinition(appName)

        if (!app.blueGreen?.enabled) {
            throw ApiStatusCodes.createError(
                ApiStatusCodes.ILLEGAL_OPERATION,
                'Blue-green deployment is not enabled for this app'
            )
        }

        this.acquireSwitchLock(appName)

        try {
            const targetSlot = options?.targetSlot || this.getInactiveSlot(app)

            if (!options?.force) {
                // Run health check on target slot
                const targetServiceName = appsDataStore.getSlotServiceName(
                    appName,
                    targetSlot
                )
                const containerPort = app.containerHttpPort || 80

                const healthResult =
                    await this.healthChecker.checkServiceHealth(
                        targetServiceName,
                        containerPort,
                        app.blueGreen.healthCheckPath,
                        app.blueGreen.healthCheckIntervalSeconds,
                        app.blueGreen.healthCheckTimeoutSeconds,
                        app.blueGreen.healthCheckThreshold
                    )

                if (!healthResult.healthy) {
                    this.eventLogger.trackEvent(
                        CapRoverEventFactory.create(
                            CapRoverEventType.BlueGreenHealthCheckFailed,
                            {
                                appName,
                                slot: targetSlot,
                                details: healthResult.details,
                            }
                        )
                    )

                    throw ApiStatusCodes.createError(
                        ApiStatusCodes.STATUS_ERROR_GENERIC,
                        `Health check failed for ${targetSlot} slot: ${healthResult.details}`
                    )
                }
            }

            // Switch traffic
            app.blueGreen.previousActiveSlot = app.blueGreen.activeSlot
            app.blueGreen.activeSlot = targetSlot

            // Update slot statuses
            const slotDeployments = app.slotDeployments || {}
            if (slotDeployments[targetSlot]) {
                slotDeployments[targetSlot]!.status = 'live'
            }
            const previousSlot = targetSlot === 'blue' ? 'green' : 'blue'
            if (slotDeployments[previousSlot]) {
                slotDeployments[previousSlot]!.status = 'idle'
            }

            appsDataStore.setBlueGreenConfig(
                appName,
                app.blueGreen,
                slotDeployments
            )

            await this.loadBalancerManager.rePopulateNginxConfigFile()

            this.eventLogger.trackEvent(
                CapRoverEventFactory.create(
                    CapRoverEventType.BlueGreenSwitchCompleted,
                    {
                        appName,
                        activeSlot: targetSlot,
                        previousSlot: app.blueGreen.previousActiveSlot,
                    }
                )
            )

            Logger.d(`Traffic switched to ${targetSlot} slot for ${appName}`)
        } catch (error: any) {
            if (
                error.captainErrorType !== ApiStatusCodes.STATUS_ERROR_GENERIC
            ) {
                this.eventLogger.trackEvent(
                    CapRoverEventFactory.create(
                        CapRoverEventType.BlueGreenSwitchFailed,
                        {
                            appName,
                            error: (error.message || '').substring(0, 1000),
                        }
                    )
                )
            }
            throw error
        } finally {
            this.releaseSwitchLock(appName)
        }
    }

    async rollback(appName: string): Promise<void> {
        const appsDataStore = this.dataStore.getAppsDataStore()
        const app = await appsDataStore.getAppDefinition(appName)

        if (!app.blueGreen?.enabled) {
            throw ApiStatusCodes.createError(
                ApiStatusCodes.ILLEGAL_OPERATION,
                'Blue-green deployment is not enabled for this app'
            )
        }

        if (!app.blueGreen.previousActiveSlot) {
            throw ApiStatusCodes.createError(
                ApiStatusCodes.ILLEGAL_OPERATION,
                'No previous active slot to rollback to'
            )
        }

        this.eventLogger.trackEvent(
            CapRoverEventFactory.create(CapRoverEventType.BlueGreenRollback, {
                appName,
                targetSlot: app.blueGreen.previousActiveSlot,
            })
        )

        await this.switchTraffic(appName, {
            force: true,
            targetSlot: app.blueGreen.previousActiveSlot,
        })
    }

    scheduleAutoSwitch(appName: string, delayMinutes: number): void {
        this.cancelAutoSwitch(appName)

        this.autoSwitchTimers[appName] = setTimeout(
            async () => {
                try {
                    const appsDataStore = this.dataStore.getAppsDataStore()
                    const app = await appsDataStore.getAppDefinition(appName)

                    if (!app.blueGreen?.enabled) return

                    const targetSlot = this.getInactiveSlot(app)
                    const targetServiceName = appsDataStore.getSlotServiceName(
                        appName,
                        targetSlot
                    )
                    const containerPort = app.containerHttpPort || 80

                    const healthResult =
                        await this.healthChecker.checkServiceHealth(
                            targetServiceName,
                            containerPort,
                            app.blueGreen.healthCheckPath,
                            app.blueGreen.healthCheckIntervalSeconds,
                            app.blueGreen.healthCheckTimeoutSeconds,
                            app.blueGreen.healthCheckThreshold
                        )

                    if (healthResult.healthy) {
                        await this.switchTraffic(appName)
                    } else {
                        this.eventLogger.trackEvent(
                            CapRoverEventFactory.create(
                                CapRoverEventType.BlueGreenHealthCheckFailed,
                                {
                                    appName,
                                    slot: targetSlot,
                                    details: healthResult.details,
                                    autoSwitch: true,
                                }
                            )
                        )
                        Logger.d(
                            `Auto-switch cancelled for ${appName}: health check failed`
                        )
                    }
                } catch (err) {
                    Logger.e(err)
                }

                delete this.autoSwitchTimers[appName]
            },
            delayMinutes * 60 * 1000
        )

        Logger.d(
            `Auto-switch scheduled for ${appName} in ${delayMinutes} minutes`
        )
    }

    cancelAutoSwitch(appName: string): void {
        if (this.autoSwitchTimers[appName]) {
            clearTimeout(this.autoSwitchTimers[appName])
            delete this.autoSwitchTimers[appName]
            Logger.d(`Auto-switch cancelled for ${appName}`)
        }
    }

    async getSlotStatus(appName: string): Promise<{
        blue?: SlotDeploymentMetadata
        green?: SlotDeploymentMetadata
        activeSlot: BlueGreenSlot
        autoSwitchPending: boolean
    }> {
        const appsDataStore = this.dataStore.getAppsDataStore()
        const app = await appsDataStore.getAppDefinition(appName)

        if (!app.blueGreen?.enabled) {
            throw ApiStatusCodes.createError(
                ApiStatusCodes.ILLEGAL_OPERATION,
                'Blue-green deployment is not enabled for this app'
            )
        }

        return {
            blue: app.slotDeployments?.blue,
            green: app.slotDeployments?.green,
            activeSlot: app.blueGreen.activeSlot,
            autoSwitchPending: !!this.autoSwitchTimers[appName],
        }
    }

    private acquireSwitchLock(appName: string): void {
        if (this.switchLocks[appName]) {
            throw ApiStatusCodes.createError(
                ApiStatusCodes.ILLEGAL_OPERATION,
                `A traffic switch is already in progress for ${appName}`
            )
        }
        this.switchLocks[appName] = true
    }

    private releaseSwitchLock(appName: string): void {
        delete this.switchLocks[appName]
    }
}

export default BlueGreenManager
