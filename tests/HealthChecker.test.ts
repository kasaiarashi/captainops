import axios from 'axios'
import HealthChecker from '../src/user/HealthChecker'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('HealthChecker', () => {
    let healthChecker: HealthChecker

    beforeEach(() => {
        healthChecker = new HealthChecker('captain-overlay-network')
        jest.clearAllMocks()
    })

    test('returns healthy after threshold consecutive successes', async () => {
        mockedAxios.get.mockResolvedValue({ status: 200 })

        const result = await healthChecker.checkServiceHealth(
            'srv-captain--myapp-blue',
            80,
            '/health',
            0.01, // minimal interval for test speed
            5,
            3
        )

        expect(result.healthy).toBe(true)
        expect(mockedAxios.get).toHaveBeenCalledTimes(3)
        expect(result.details).toContain('HTTP 200 - OK')
    })

    test('returns unhealthy on repeated failures', async () => {
        mockedAxios.get.mockResolvedValue({ status: 500 })

        const result = await healthChecker.checkServiceHealth(
            'srv-captain--myapp-green',
            80,
            '/health',
            0.01,
            5,
            3
        )

        expect(result.healthy).toBe(false)
        expect(result.details).toContain('HTTP 500 - Unhealthy')
    })

    test('returns healthy for 2xx and 3xx responses', async () => {
        mockedAxios.get
            .mockResolvedValueOnce({ status: 200 })
            .mockResolvedValueOnce({ status: 301 })
            .mockResolvedValueOnce({ status: 399 })

        const result = await healthChecker.checkServiceHealth(
            'srv-captain--myapp-blue',
            3000,
            '/health',
            0.01,
            5,
            3
        )

        expect(result.healthy).toBe(true)
    })

    test('handles connection errors gracefully', async () => {
        mockedAxios.get.mockRejectedValue(new Error('ECONNREFUSED'))

        const result = await healthChecker.checkServiceHealth(
            'srv-captain--myapp-blue',
            80,
            '/health',
            0.01,
            5,
            3
        )

        expect(result.healthy).toBe(false)
        expect(result.details).toContain('ECONNREFUSED')
    })

    test('handles timeout errors', async () => {
        mockedAxios.get.mockRejectedValue(new Error('timeout of 5000ms exceeded'))

        const result = await healthChecker.checkServiceHealth(
            'srv-captain--myapp-blue',
            80,
            '/health',
            0.01,
            5,
            2
        )

        expect(result.healthy).toBe(false)
        expect(result.details).toContain('timeout')
    })

    test('resets consecutive count on failure in the middle', async () => {
        // success, fail, success -> not healthy (need 3 consecutive)
        mockedAxios.get
            .mockResolvedValueOnce({ status: 200 })
            .mockResolvedValueOnce({ status: 500 })
            .mockResolvedValueOnce({ status: 200 })

        const result = await healthChecker.checkServiceHealth(
            'srv-captain--myapp-blue',
            80,
            '/health',
            0.01,
            5,
            3
        )

        expect(result.healthy).toBe(false)
    })

    test('calls correct URL with service name, port, and path', async () => {
        mockedAxios.get.mockResolvedValue({ status: 200 })

        await healthChecker.checkServiceHealth(
            'srv-captain--myapp-blue',
            3000,
            '/api/health',
            0.01,
            10,
            1
        )

        expect(mockedAxios.get).toHaveBeenCalledWith(
            'http://srv-captain--myapp-blue:3000/api/health',
            expect.objectContaining({
                timeout: 10000,
            })
        )
    })
})
