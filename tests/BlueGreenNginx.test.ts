import ejs from 'ejs'
import fs from 'fs-extra'
import path from 'path'

const templatePath = path.join(
    __dirname,
    '..',
    'template',
    'server-block-conf.ejs'
)
const template = fs.readFileSync(templatePath).toString()

function makeServerBlock(overrides: Record<string, any> = {}) {
    return {
        hasSsl: false,
        forceSsl: false,
        websocketSupport: false,
        publicDomain: 'myapp.example.com',
        localDomain: 'srv-captain--myapp',
        nginxConfigTemplate: template,
        containerHttpPort: 80,
        customErrorPagesDirectory: '/default',
        staticWebRoot: '/usr/share/nginx/domains/myapp.example.com',
        isBlueGreen: false,
        blueLocalDomain: undefined as string | undefined,
        greenLocalDomain: undefined as string | undefined,
        activeSlot: undefined as string | undefined,
        ...overrides,
    }
}

describe('Blue-Green Nginx Template', () => {
    test('renders blue upstream when activeSlot is blue', () => {
        const s = makeServerBlock({
            isBlueGreen: true,
            activeSlot: 'blue',
            blueLocalDomain: 'srv-captain--myapp-blue',
            greenLocalDomain: 'srv-captain--myapp-green',
        })

        const rendered = ejs.render(template, { s })

        expect(rendered).toContain(
            'http://srv-captain--myapp-blue:80'
        )
        expect(rendered).not.toContain(
            'http://srv-captain--myapp-green:80'
        )
        expect(rendered).toContain('Blue-Green: route to active slot (blue)')
    })

    test('renders green upstream when activeSlot is green', () => {
        const s = makeServerBlock({
            isBlueGreen: true,
            activeSlot: 'green',
            blueLocalDomain: 'srv-captain--myapp-blue',
            greenLocalDomain: 'srv-captain--myapp-green',
        })

        const rendered = ejs.render(template, { s })

        expect(rendered).toContain(
            'http://srv-captain--myapp-green:80'
        )
        expect(rendered).not.toContain(
            'http://srv-captain--myapp-blue:80'
        )
        expect(rendered).toContain('Blue-Green: route to active slot (green)')
    })

    test('renders standard upstream when isBlueGreen is false', () => {
        const s = makeServerBlock({
            isBlueGreen: false,
        })

        const rendered = ejs.render(template, { s })

        expect(rendered).toContain(
            'http://srv-captain--myapp:80'
        )
        expect(rendered).not.toContain('Blue-Green')
    })

    test('renders standard upstream when isBlueGreen is undefined', () => {
        const s = makeServerBlock()
        delete (s as any).isBlueGreen

        const rendered = ejs.render(template, { s })

        expect(rendered).toContain(
            'http://srv-captain--myapp:80'
        )
        expect(rendered).not.toContain('Blue-Green')
    })

    test('respects custom containerHttpPort with blue-green', () => {
        const s = makeServerBlock({
            isBlueGreen: true,
            activeSlot: 'blue',
            blueLocalDomain: 'srv-captain--myapp-blue',
            greenLocalDomain: 'srv-captain--myapp-green',
            containerHttpPort: 3000,
        })

        const rendered = ejs.render(template, { s })

        expect(rendered).toContain(
            'http://srv-captain--myapp-blue:3000'
        )
    })
})
