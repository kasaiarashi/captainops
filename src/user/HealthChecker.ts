import axios from 'axios'
import Logger from '../utils/Logger'

class HealthChecker {
    constructor(networkName: string) {
        // networkName identifies the Docker overlay network for service-to-service communication
        void networkName
    }

    async checkServiceHealth(
        serviceName: string,
        containerPort: number,
        healthCheckPath: string,
        intervalSeconds: number,
        timeoutSeconds: number,
        threshold: number
    ): Promise<{ healthy: boolean; details: string }> {
        let consecutiveSuccesses = 0
        const details: string[] = []

        for (let attempt = 0; attempt < threshold; attempt++) {
            if (attempt > 0) {
                await new Promise((resolve) =>
                    setTimeout(resolve, intervalSeconds * 1000)
                )
            }

            try {
                const url = `http://${serviceName}:${containerPort}${healthCheckPath}`
                const response = await axios.get(url, {
                    timeout: timeoutSeconds * 1000,
                    validateStatus: () => true,
                })

                if (response.status >= 200 && response.status < 400) {
                    consecutiveSuccesses++
                    details.push(
                        `Attempt ${attempt + 1}: HTTP ${response.status} - OK`
                    )
                } else {
                    consecutiveSuccesses = 0
                    details.push(
                        `Attempt ${attempt + 1}: HTTP ${response.status} - Unhealthy`
                    )
                }
            } catch (err: any) {
                consecutiveSuccesses = 0
                const errMsg = err.message || 'Unknown error'
                details.push(`Attempt ${attempt + 1}: Error - ${errMsg}`)
                Logger.d(`Health check failed for ${serviceName}: ${errMsg}`)
            }
        }

        const healthy = consecutiveSuccesses >= threshold

        return {
            healthy,
            details: details.join('\n'),
        }
    }
}

export default HealthChecker
