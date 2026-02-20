import { IAppDef } from '../src/models/AppDefinition'

// Minimal mock of AppsDataStore to test naming methods
// We replicate the logic directly since AppsDataStore requires configstore
describe('Blue-Green Service Naming', () => {
    const namespace = 'captain'

    function getServiceName(appName: string) {
        return `srv-${namespace}--${appName}`
    }

    function getBlueServiceName(appName: string) {
        return `srv-${namespace}--${appName}-blue`
    }

    function getGreenServiceName(appName: string) {
        return `srv-${namespace}--${appName}-green`
    }

    function getSlotServiceName(appName: string, slot: 'blue' | 'green') {
        return slot === 'blue'
            ? getBlueServiceName(appName)
            : getGreenServiceName(appName)
    }

    function getActiveServiceName(appName: string, app: IAppDef) {
        if (app.blueGreen?.enabled) {
            return getSlotServiceName(appName, app.blueGreen.activeSlot)
        }
        return getServiceName(appName)
    }

    const baseApp: IAppDef = {
        description: '',
        deployedVersion: 1,
        notExposeAsWebApp: false,
        hasPersistentData: false,
        hasDefaultSubDomainSsl: false,
        captainDefinitionRelativeFilePath: './captain-definition',
        forceSsl: false,
        websocketSupport: false,
        instanceCount: 1,
        networks: [],
        customDomain: [],
        ports: [],
        volumes: [],
        envVars: [],
        versions: [],
    }

    test('getBlueServiceName returns correct name', () => {
        expect(getBlueServiceName('myapp')).toBe('srv-captain--myapp-blue')
    })

    test('getGreenServiceName returns correct name', () => {
        expect(getGreenServiceName('myapp')).toBe(
            'srv-captain--myapp-green'
        )
    })

    test('getSlotServiceName delegates to blue', () => {
        expect(getSlotServiceName('myapp', 'blue')).toBe(
            'srv-captain--myapp-blue'
        )
    })

    test('getSlotServiceName delegates to green', () => {
        expect(getSlotServiceName('myapp', 'green')).toBe(
            'srv-captain--myapp-green'
        )
    })

    test('getActiveServiceName returns blue service when blue is active', () => {
        const appWithBlueActive: IAppDef = {
            ...baseApp,
            blueGreen: {
                enabled: true,
                activeSlot: 'blue',
                autoSwitchEnabled: false,
                autoSwitchDelayMinutes: 5,
                healthCheckPath: '/health',
                healthCheckIntervalSeconds: 10,
                healthCheckTimeoutSeconds: 5,
                healthCheckThreshold: 3,
            },
        }
        expect(getActiveServiceName('myapp', appWithBlueActive)).toBe(
            'srv-captain--myapp-blue'
        )
    })

    test('getActiveServiceName returns green service when green is active', () => {
        const appWithGreenActive: IAppDef = {
            ...baseApp,
            blueGreen: {
                enabled: true,
                activeSlot: 'green',
                autoSwitchEnabled: false,
                autoSwitchDelayMinutes: 5,
                healthCheckPath: '/health',
                healthCheckIntervalSeconds: 10,
                healthCheckTimeoutSeconds: 5,
                healthCheckThreshold: 3,
            },
        }
        expect(getActiveServiceName('myapp', appWithGreenActive)).toBe(
            'srv-captain--myapp-green'
        )
    })

    test('getActiveServiceName returns standard service when blue-green not enabled', () => {
        expect(getActiveServiceName('myapp', baseApp)).toBe(
            'srv-captain--myapp'
        )
    })

    test('getActiveServiceName returns standard service when blueGreen is undefined', () => {
        const appNoBlueGreen: IAppDef = {
            ...baseApp,
            blueGreen: undefined,
        }
        expect(getActiveServiceName('myapp', appNoBlueGreen)).toBe(
            'srv-captain--myapp'
        )
    })
})
