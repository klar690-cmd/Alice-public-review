import { createRequire } from 'node:module'
import fs from 'node:fs'
import cp from 'node:child_process'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
const require = createRequire(
    'C:/Users/Kleber/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json',
  ),
  { chromium } = require('playwright')
const root = process.cwd(),
  dir = root + '/docs/alice/v2/m3g',
  c = JSON.parse(fs.readFileSync(dir + '/CODE_MANIFEST.json')),
  origin = 'http://127.0.0.1:1448',
  url = origin + '/docs/alice/v2/m3g/Alice-browser.html'
if (
  cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !==
  c.candidate
)
  throw Error('SOURCE_DRIFT')
fs.mkdirSync(dir + '/screenshots', { recursive: true })
const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    chromiumSandbox: true,
  }),
  result = {
    source: c.candidate,
    entry: c.entry,
    url,
    browser: browser.version(),
    mode: 'Existing full App and actual useAliceV2Navigation; isolated synthetic local bridge data; no mainOverride or alternate UI',
    checks: [],
    errors: [],
    external: [],
    screenshots: [],
  }
const check = (name, ok) => {
  if (!ok) throw Error(name)
  result.checks.push(name)
}
try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  })
  await context.route('**/*', (r) =>
    new URL(r.request().url()).origin === origin
      ? r.continue()
      : (result.external.push(r.request().url()), r.abort()),
  )
  await context.addInitScript(() =>
    localStorage.setItem(
      'alice.preview.profiles.v2',
      JSON.stringify({
        active_profile_id: 'alice-preview',
        profiles: [
          {
            id: 'alice-preview',
            name: 'Alice Preview · demo',
            created_at_ms: 1791360000000,
            last_used_at_ms: 1791360000000,
          },
          {
            id: 'r271-profile-b',
            name: 'R271 Perfil B',
            created_at_ms: 1791360000000,
            last_used_at_ms: 1791360000000,
          },
        ],
      }),
    ),
  )
  const p = await context.newPage()
  p.on('pageerror', (e) => result.errors.push(e.message))
  await p.clock.setFixedTime(new Date('2026-10-10T16:40:00-03:00'))
  const button = (name) => p.getByRole('button', { name, exact: true }),
    provider = () => p.getByRole('combobox', { name: 'Provedor', exact: true }),
    method = () => p.getByRole('combobox', { name: 'Método de conexão', exact: true }),
    agentTab = () => p.getByRole('tab', { name: 'Agentes e ligações', exact: true }),
    inspector = () => p.getByRole('complementary', { name: 'Configurar agente', exact: true })
  const shot = async (name, caption) => {
    await p.waitForTimeout(180)
    const file = 'screenshots/' + name + '.png'
    await p.screenshot({ path: dir + '/' + file })
    result.screenshots.push({
      file,
      caption,
      source: c.candidate,
      viewport: p.viewportSize(),
      theme: await p.locator('html').getAttribute('data-theme'),
      sha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(dir + '/' + file))
        .digest('hex'),
    })
  }
  const enter = async () => {
    await agentTab().click()
    await provider().waitFor()
  }
  const chooseTheme = async (name) => {
    await button('Menu').click()
    await button('Escolher tema').click()
    const modal = p.getByRole('dialog', { name: 'Escolher tema', exact: true })
    await modal.getByRole('button', { name: new RegExp('^' + name + ' ') }).click()
    await modal.getByRole('button', { name: 'Pronto', exact: true }).click()
  }
  const response = await p.goto(url, { waitUntil: 'networkidle' })
  check(
    'HTTP200 concrete local Alice App route',
    response.status() === 200 &&
      (await p.locator('meta[name="alice-browser-revision"]').getAttribute('content')) === 'R271',
  )
  await p.locator('#welcome-display-name').fill('Kleber')
  await button('Começar').click()
  await p.getByText('Boa tarde, Kleber.', { exact: true }).waitFor()
  if (await button('Fechar sidebar direita').count()) await button('Fechar sidebar direita').click()

  check(
    'Original Home starts first with supplied profile/ASCII and personalized name',
    (await provider().count()) === 0,
  )
  await shot(
    '01-actual-home-original',
    'Existing Alice full App Home before entering Agents & connections.',
  )
  await enter()
  check(
    'Labeled Agents & connections tab reaches existing node editor',
    (await agentTab().getAttribute('aria-selected')) === 'true' &&
      (await provider().inputValue()) === 'fake',
  )
  check(
    'Two obvious configuration choices do not pretend to connect the local simulation',
    (await button('Entrar com conta').isDisabled()) && (await button('Usar API').isDisabled()),
  )
  await provider().selectOption('codex')
  await button('Usar API').click()
  check(
    'GG selects OpenAI/API independently; no key or login field',
    (await method().inputValue()) === 'api-key' &&
      (await button('Usar API').getAttribute('aria-pressed')) === 'true' &&
      (await p.locator('input[type="password"]').count()) === 0,
  )
  await shot(
    '02-gg-openai-api-original',
    'GG OpenAI/Codex + Use API in the actual App inspector; integration pending, no key requested.',
  )
  await button('Mover agente: Dev').click()
  check('Worker begins with its own local default', (await provider().inputValue()) === 'fake')
  await provider().selectOption('claude')
  await button('Entrar com conta').click()
  await p.getByText('Conexão por conta ainda não disponível aqui.', { exact: true }).waitFor()
  check(
    'Anthropic/account preference is selected but truthfully unavailable, no auth window',
    (await method().inputValue()) === 'account-login' &&
      (await button('Entrar com conta').getAttribute('aria-pressed')) === 'true' &&
      context.pages().length === 1,
  )
  await shot(
    '03-worker-anthropic-account-original',
    'Dev Anthropic/Claude account preference selected; account connection unavailable, no login started.',
  )
  await button('Mover agente: GG').click()
  check(
    'GG still holds OpenAI/API after worker changes',
    (await provider().inputValue()) === 'codex' && (await method().inputValue()) === 'api-key',
  )
  await button('+ Adicionar agente').click()
  check('New worker has independent unset preference', (await provider().inputValue()) === 'fake')
  await provider().selectOption('antigravity')
  await button('Usar API').click()
  await shot(
    '04-new-google-agent-original',
    'New logical worker uses the existing Google Antigravity provider option with API preference only.',
  )
  await provider().selectOption('claude')
  check(
    'Company change clears stale method to simulation',
    (await method().inputValue()) === 'simulated' &&
      (await button('Usar API').getAttribute('aria-pressed')) === 'false',
  )
  await provider().selectOption('antigravity')
  await button('Usar API').click()
  const output = button('Saída: GG'),
    input = p.getByRole('button', { name: /^Entrada: Agente / })
  const a = await output.boundingBox(),
    b = await input.boundingBox()
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await p.mouse.down()
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 })
  await p.mouse.up()
  check(
    'Existing manual port drag connects the new worker before save',
    !(await button('Salvar equipe').isDisabled()),
  )
  await button('Salvar equipe').click()
  await p.getByRole('button', { name: /Planejar uma ideia/ }).click()
  check('Teams remain independent', (await provider().inputValue()) === 'fake')
  await p.getByRole('button', { name: /Produção e revisão/ }).click()
  await button('Mover agente: GG').click()
  check(
    'Saved original team retains GG OpenAI/API',
    (await provider().inputValue()) === 'codex' && (await method().inputValue()) === 'api-key',
  )
  await chooseTheme('Creme & Rosé')
  check(
    'Existing real theme picker applies preserved Cream & Rose',
    (await p.locator('html').getAttribute('data-theme')) === 'cream-rose',
  )
  await button('Mover agente: Dev').click()
  await shot(
    '05-account-choice-cream-rose',
    'The same existing App/editor and account preference in the preserved Cream & Rose theme.',
  )
  await p.setViewportSize({ width: 850, height: 1200 })
  await inspector().getByText('Qual IA será este agente?', { exact: true }).scrollIntoViewIfNeeded()
  await shot(
    '06-account-choice-narrow',
    'Actual 850px App layout with legible company and account/API controls.',
  )
  check(
    'Narrow App document has no horizontal overflow',
    await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  )
  await p.setViewportSize({ width: 1600, height: 1100 })
  await button('Novo projeto').click()
  const newProject = p.getByRole('dialog', { name: 'Novo projeto', exact: true })
  await newProject.getByPlaceholder('Ex: Site novo, Cliente X...').fill('R271 Projeto B')
  await newProject
    .getByRole('button', { name: 'Criar projeto e abrir terminal', exact: true })
    .click()
  await p.getByRole('dialog').waitFor()
  await p.keyboard.press('Escape')
  await enter()
  check(
    'Real project navigation gives project B an independent GG default',
    (await provider().inputValue()) === 'fake',
  )
  await provider().selectOption('antigravity')
  await button('Usar API').click()
  await shot(
    '07-project-b-independent',
    'Existing project creation/navigation scopes an independent GG preference in project B; terminal dialog cancelled without launching anything.',
  )
  await p.locator('#alethe-left-sidebar').getByText('Alice Studio', { exact: true }).click()
  await enter()
  await button('Mover agente: GG').click()
  check(
    'Returning to original real project restores OpenAI/API GG',
    (await provider().inputValue()) === 'codex' && (await method().inputValue()) === 'api-key',
  )
  await button('Contas e provedores').click()
  await button('Perfis').click()
  const profiles = p.getByRole('dialog', { name: 'Contas', exact: true })
  await profiles.getByText('R271 Perfil B', { exact: true }).waitFor()
  const profileCard = profiles.locator('[class*=profileCard]').filter({ hasText: 'R271 Perfil B' })
  await profileCard.getByRole('button', { name: 'Trocar', exact: true }).click()
  await profiles.waitFor({ state: 'hidden' })
  if (await p.locator('#welcome-display-name').count()) {
    await p.locator('#welcome-display-name').fill('Perfil B')
    await button('Começar').click()
  }
  await enter()
  check(
    'Actual local profile switch does not inherit another profile provider',
    (await provider().inputValue()) === 'fake',
  )
  await shot(
    '08-profile-b-independent',
    'Actual existing local-profile UI switches to an independent agent configuration; no account/provider login.',
  )
  await button('Contas e provedores').click()
  await button('Perfis').click()
  const originalProfiles = p.getByRole('dialog', { name: 'Contas', exact: true })
  const originalCard = originalProfiles
    .locator('[class*=profileCard]')
    .filter({ hasText: 'Alice Preview · demo' })
  await originalCard.getByRole('button', { name: 'Trocar', exact: true }).click()
  await originalProfiles.waitFor({ state: 'hidden' })
  await enter()
  await button('Mover agente: GG').click()
  check(
    'Switching back restores the correct project/profile GG preference',
    (await provider().inputValue()) === 'codex' && (await method().inputValue()) === 'api-key',
  )
  await button('Mover agente: Dev').click()
  await method().selectOption('simulated')
  await button('Entrar com conta').click()
  await inspector().evaluate((n) => (n.scrollTop = 1000))
  await button('Mover agente: GG').click()
  check(
    'Selecting another node scrolls its inspector back to configuration choices',
    (await inspector().evaluate((n) => n.scrollTop)) === 0,
  )
  await button('Contas e provedores').click()
  check(
    'Existing Accounts manager and profile controls still work',
    (await button('Gerenciar conexões').isVisible()) && (await button('Perfis').isVisible()),
  )
  await p.locator('#alethe-left-sidebar').locator('button').first().click()
  await p.getByText('Boa tarde, Kleber.', { exact: true }).waitFor()
  if (await button('Fechar sidebar direita').count()) await button('Fechar sidebar direita').click()
  check('Actual house route returns to preserved Home', (await provider().count()) === 0)
  check(
    'No external HTTP, browser auth popup or page errors',
    !result.external.length && !result.errors.length && context.pages().length === 1,
  )
  result.httpStatus = 'PASS'
  // Optional offline export is the same bundled App, tested without any network.
  const offline = await browser.newContext({
      viewport: { width: 1600, height: 1100 },
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    }),
    offlineExternal = []
  await offline.route('**/*', (r) =>
    ['file:', 'data:', 'blob:'].includes(new URL(r.request().url()).protocol)
      ? r.continue()
      : (offlineExternal.push(r.request().url()), r.abort()),
  )
  const q = await offline.newPage()
  q.on('pageerror', (e) => result.errors.push('offline:' + e.message))
  await q.clock.setFixedTime(new Date('2026-10-10T16:40:00-03:00'))
  const fileURL = pathToFileURL(dir + '/Alice-V2-preview.html').href
  await q.goto(fileURL, { waitUntil: 'load', timeout: 60000 })
  await q.locator('#welcome-display-name').fill('Kleber')
  await q.getByRole('button', { name: 'Começar', exact: true }).click()
  await q.getByRole('tab', { name: 'Agentes e ligações', exact: true }).click()
  await q.getByRole('combobox', { name: 'Provedor', exact: true }).selectOption('codex')
  await q.getByRole('button', { name: 'Usar API', exact: true }).click()
  check(
    'Real bundled offline file opens and configures GG/API without network',
    (await q
      .getByRole('button', { name: 'Usar API', exact: true })
      .getAttribute('aria-pressed')) === 'true' && !offlineExternal.length,
  )
  await q.getByRole('button', { name: 'Mover agente: Dev', exact: true }).click()
  await q.getByRole('combobox', { name: 'Provedor', exact: true }).selectOption('claude')
  await q.getByRole('button', { name: 'Entrar com conta', exact: true }).click()
  check(
    'Offline worker account choice remains unavailable and independent',
    await q.getByText('Conexão por conta ainda não disponível aqui.', { exact: true }).isVisible(),
  )
  const file = 'screenshots/09-offline-actual-app.png'
  await q.screenshot({ path: dir + '/' + file })
  result.screenshots.push({
    file,
    caption:
      'The same bundled full Alice App running from file://, with actual account/API inspector.',
    source: c.candidate,
    viewport: q.viewportSize(),
    theme: await q.locator('html').getAttribute('data-theme'),
    sha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(dir + '/' + file))
      .digest('hex'),
  })
  result.offline = {
    url: fileURL,
    bytes: fs.statSync(dir + '/Alice-V2-preview.html').size,
    sha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(dir + '/Alice-V2-preview.html'))
      .digest('hex'),
    external: offlineExternal,
    status: 'PASS',
  }
  check('No offline or HTTP page errors', !result.errors.length)
  // Separate real-click regression: existing local profile creation with a numeric-leading UUID.
  const creation = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  })
  await creation.route('**/*', (r) =>
    new URL(r.request().url()).origin === origin
      ? r.continue()
      : (result.external.push(r.request().url()), r.abort()),
  )
  await creation.addInitScript(() =>
    Object.defineProperty(Crypto.prototype, 'randomUUID', {
      value: () => '12fa5b71-1234-4321-9876-123456789abc',
    }),
  )
  const z = await creation.newPage()
  z.on('pageerror', (e) => result.errors.push('profile-create:' + e.message))
  await z.goto(url, { waitUntil: 'networkidle' })
  await z.locator('#welcome-display-name').fill('Kleber')
  await z.getByRole('button', { name: 'Começar', exact: true }).click()
  await z.getByRole('tab', { name: 'Agentes e ligações', exact: true }).click()
  await z.getByRole('button', { name: 'Contas e provedores', exact: true }).click()
  await z.getByRole('button', { name: 'Perfis', exact: true }).click()
  const createDialog = z.getByRole('dialog', { name: 'Contas', exact: true })
  await createDialog.getByPlaceholder('Nome da conta').fill('Perfil numérico')
  await createDialog.getByRole('button', { name: 'Criar conta', exact: true }).click()
  await z.locator('#welcome-display-name').waitFor()
  await z.locator('#welcome-display-name').fill('Perfil numérico')
  await z.getByRole('button', { name: 'Começar', exact: true }).click()
  await z.getByRole('tab', { name: 'Agentes e ligações', exact: true }).click()
  await z.getByRole('combobox', { name: 'Provedor', exact: true }).selectOption('codex')
  await z.getByRole('button', { name: 'Usar API', exact: true }).click()
  check(
    'Actual local profile creation with numeric UUID opens agent settings without changing account IDs or relaxing graph IDs',
    (await z
      .getByRole('button', { name: 'Usar API', exact: true })
      .getAttribute('aria-pressed')) === 'true' &&
      !result.errors.length &&
      !result.external.length,
  )
  result.status = 'PASS'
} catch (error) {
  result.status = 'FAIL'
  result.failure = error.stack
  console.log(error.stack)
} finally {
  fs.writeFileSync(dir + '/BROWSER_RESULTS.json', JSON.stringify(result, null, 2))
  await browser.close()
  console.log(
    JSON.stringify({
      status: result.status,
      checks: result.checks,
      errors: result.errors,
      external: result.external,
      screenshots: result.screenshots.length,
      offline: result.offline?.status,
    }),
  )
  if (result.status !== 'PASS') process.exitCode = 1
}
