export enum CapRoverEventType {
    UserLoggedIn = 'UserLoggedIn',
    AppBuildSuccessful = 'AppBuildSuccessful',
    AppBuildFailed = 'AppBuildFailed',
    InstanceStarted = 'InstanceStarted',
    OneClickAppDetailsFetched = 'OneClickAppDetailsFetched',
    OneClickAppListFetched = 'OneClickAppListFetched',
    OneClickAppDeployStarted = 'OneClickAppDeployStarted',
    BlueGreenDeployStarted = 'BlueGreenDeployStarted',
    BlueGreenDeployCompleted = 'BlueGreenDeployCompleted',
    BlueGreenDeployFailed = 'BlueGreenDeployFailed',
    BlueGreenSwitchCompleted = 'BlueGreenSwitchCompleted',
    BlueGreenSwitchFailed = 'BlueGreenSwitchFailed',
    BlueGreenRollback = 'BlueGreenRollback',
    BlueGreenHealthCheckFailed = 'BlueGreenHealthCheckFailed',
}

export interface ICapRoverEvent {
    eventType: CapRoverEventType
    eventMetadata: any
}

export class CapRoverEventFactory {
    static create(
        eventType: CapRoverEventType,
        eventMetadata: any
    ): ICapRoverEvent {
        return {
            eventType,
            eventMetadata,
        }
    }
}
