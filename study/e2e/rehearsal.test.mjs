import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const studyRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromium = process.env.CHROMIUM_BIN ??
  ['chromium', 'chromium-browser', 'google-chrome'].find(
    (command) => spawnSync('which', [command], { stdio: 'ignore' }).status === 0,
  );
const browserAvailable = Boolean(chromium && typeof globalThis.WebSocket === 'function');

async function stopProcess(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  if (await Promise.race([exited.then(() => true), delay(3000).then(() => false)])) return;
  child.kill('SIGKILL');
  await Promise.race([exited, delay(3000)]);
}

class CdpConnection {
  constructor(url) {
    this.socket = new globalThis.WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.errors = [];
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === 'Runtime.exceptionThrown') {
        this.errors.push(message.params.exceptionDetails.text);
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        this.errors.push(message.params.args.map((item) => item.value ?? item.description).join(' '));
      }
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.nextId;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }

  async callFunction(functionDeclaration, args = []) {
    const windowObject = await this.send('Runtime.evaluate', {
      expression: 'window',
      returnByValue: false,
    });
    const result = await this.send('Runtime.callFunctionOn', {
      objectId: windowObject.result.objectId,
      functionDeclaration,
      arguments: args.map((value) => ({ value })),
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

test(
  'real-browser consent, draft recovery, chart readability, responsive trials and completion',
  { skip: !browserAvailable && 'Chromium and Node global WebSocket are required for CDP browser checks', timeout: 180_000 },
  async (t) => {
    const artifacts = await mkdtemp(path.join(os.tmpdir(), 'cedar-watch-rehearsal-'));
    const profile = path.join(artifacts, 'chromium-profile');
    const appPortServer = net.createServer();
    await new Promise((resolve) => appPortServer.listen(0, '127.0.0.1', resolve));
    const appPort = appPortServer.address().port;
    await new Promise((resolve) => appPortServer.close(resolve));

    const devServer = spawn(
      process.execPath,
      [path.join(studyRoot, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(appPort)],
      { cwd: studyRoot, stdio: 'ignore' },
    );
    const browser = spawn(
      chromium,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { stdio: 'ignore' },
    );
    let cdp;
    try {
      const baseUrl = `http://127.0.0.1:${appPort}/`;
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          const response = await globalThis.fetch(baseUrl);
          if (response.ok) {
            ready = true;
            break;
          }
        } catch {
          await delay(100);
        }
      }
      assert.equal(ready, true, 'study Vite server did not start');

      let activePort;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          [activePort] = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n');
          if (activePort) break;
        } catch {
          await delay(100);
        }
      }
      assert.ok(activePort, 'Chromium DevTools endpoint did not start');
      const targets = await (await globalThis.fetch(`http://127.0.0.1:${activePort}/json/list`)).json();
      const page = targets.find((target) => target.type === 'page');
      assert.ok(page, 'Chromium page target is unavailable');
      cdp = new CdpConnection(page.webSocketDebuggerUrl);
      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');
      await cdp.send('Page.setDeviceMetricsOverride', {
        width: 1440,
        height: 1050,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await cdp.send('Page.navigate', { url: baseUrl });
      await delay(1200);
      assert.match(await cdp.evaluate('document.title'), /Cedar Watch/);
      await cdp.evaluate('localStorage.clear(); location.reload()');
      await delay(500);

      async function evaluate(expression) {
        return cdp.evaluate(expression);
      }
      async function clickText(selector, text) {
        const clicked = await cdp.callFunction(
          `function(selector,text) {
            const element=[...document.querySelectorAll(selector)].find((item)=>item.textContent.includes(text));
            if (!element) return false;
            element.click();
            return true;
          }`,
          [selector, text],
        );
        assert.equal(clicked, true, `missing ${selector} containing ${text}`);
        await delay(250);
      }
      async function selectValue(label, value) {
        const selected = await cdp.callFunction(
          `function(label,value) {
            const select=[...document.querySelectorAll('select')].find((item)=>
              item.getAttribute('aria-label')===label || item.labels?.[0]?.textContent.includes(label));
            if (!select) return false;
            select.value=value;
            select.dispatchEvent(new Event('change',{bubbles:true}));
            return true;
          }`,
          [label, value],
        );
        assert.equal(selected, true, `missing select ${label}`);
        await delay(180);
      }
      async function capture(name) {
        const image = await cdp.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: false,
          fromSurface: true,
        });
        await writeFile(path.join(artifacts, `${name}.png`), Buffer.from(image.data, 'base64'));
      }
      async function state() {
        return evaluate(`(() => {
          const panel=document.querySelector('[aria-label="Trial response panel"]');
          const firstTable=document.querySelector('.tablewrap');
          return {
            kicker:document.querySelector('.study-kicker')?.textContent.trim().replace(/\\\\s+/g,' '),
            question:document.querySelector('.study-header h1')?.textContent.trim(),
            condition:document.querySelector('.condition-label')?.textContent.trim(),
            scenario:document.querySelector('#scenario-context-heading + p')?.textContent.trim(),
            responseVisible:!!panel,
            responsePosition:panel && getComputedStyle(panel).position,
            scrollY:window.scrollY,
            documentWidth:document.documentElement.scrollWidth,
            viewportWidth:window.innerWidth,
            tableMaxHeight:firstTable && getComputedStyle(firstTable).maxHeight,
            tableClientHeight:firstTable?.clientHeight,
            tableScrollHeight:firstTable?.scrollHeight,
            visualizations:[...(document.querySelector('select')?.options ?? [])].map(o=>({value:o.value,label:o.textContent.trim()})),
            selectedAnswer:document.querySelector('.response-card input[type=radio]:checked')?.value ?? null,
            ratings:[...document.querySelectorAll('.response-card select')].map((select)=>select.value)
          };
        })()`);
      }

      await clickText('button', 'Continue to draft consent');
      await evaluate(`document.querySelector('input[type="checkbox"]').click()`);
      await clickText('button', 'Agree and begin practice');
      await evaluate(`([...document.querySelectorAll('input[type=radio]')].find((item)=>item.value==='no')).click()`);
      await clickText('button', 'Check practice response');
      await clickText('button', 'Begin experimental trials');
      await delay(450);
      let firstTrial = await state();
      assert.equal(firstTrial.responsePosition, 'static');
      assert.equal(firstTrial.responseVisible, true);
      assert.equal(firstTrial.tableMaxHeight, 'none');
      await capture('trial-01-desktop');

      await evaluate(`(() => {
        const radios=[...document.querySelectorAll('.response-card input[type=radio]')];
        radios[radios.length-1].click();
        const selects=document.querySelectorAll('.response-card select');
        selects[0].value='4'; selects[0].dispatchEvent(new Event('change',{bubbles:true}));
        selects[1].value='2'; selects[1].dispatchEvent(new Event('change',{bubbles:true}));
      })()`);
      await delay(180);
      await cdp.send('Page.reload', { ignoreCache: true });
      await delay(1100);
      await clickText('button', 'Resume saved session');
      firstTrial = await state();
      assert.equal(firstTrial.selectedAnswer, 'unknown', 'answer was not restored after page reload');
      assert.deepEqual(firstTrial.ratings, ['4', '2'], 'ratings were not restored after page reload');

      const scenarios = new Set();
      const conditions = new Set();
      let chartCount = 0;
      for (let index = 0; index < 10; index += 1) {
        const trial = await state();
        assert.match(trial.kicker, new RegExp(`Trial ${index + 1} of 10`));
        assert.ok(trial.condition === 'Evidence-only view' || trial.condition === 'Task-aware recommended view');
        assert.equal(trial.responseVisible, true);
        assert.equal(trial.responsePosition, 'static');
        assert.equal(trial.tableMaxHeight, 'none');
        assert.ok((trial.tableScrollHeight ?? 0) <= (trial.tableClientHeight ?? 0) + 1);
        scenarios.add(trial.scenario);
        conditions.add(trial.condition);
        await evaluate('window.scrollTo(0,0)');
        await capture(`trial-${String(index + 1).padStart(2, '0')}-${trial.condition.startsWith('Evidence') ? 'baseline' : 'recommended'}`);

        if (trial.condition === 'Task-aware recommended view') {
          const responseBeforeCharts = await evaluate(`(() => {
            const radios=[...document.querySelectorAll('.response-card input[type=radio]')];
            if (!radios.some((radio)=>radio.checked)) radios.find((radio)=>radio.value!=='unknown')?.click();
            const selects=document.querySelectorAll('.response-card select');
            if (!selects[0].value) { selects[0].value='4'; selects[0].dispatchEvent(new Event('change',{bubbles:true})); }
            if (!selects[1].value) { selects[1].value='2'; selects[1].dispatchEvent(new Event('change',{bubbles:true})); }
            return {answer:document.querySelector('.response-card input[type=radio]:checked')?.value,ratings:[...selects].map((select)=>select.value)};
          })()`);
          for (let chartIndex = 0; chartIndex < trial.visualizations.length; chartIndex += 1) {
            const chart = trial.visualizations[chartIndex];
            await selectValue('Select visualization', chart.value);
            const readableTable = await evaluate(
              `!!document.querySelector('[aria-label^="Readable table for"]')`,
            );
            if (chart.label === 'Report detail table') assert.equal(readableTable, true);
            const responseAfterChart = await evaluate(`({
              answer:document.querySelector('.response-card input[type=radio]:checked')?.value,
              ratings:[...document.querySelectorAll('.response-card select')].map((select)=>select.value)
            })`);
            assert.deepEqual(responseAfterChart, responseBeforeCharts, 'chart switching erased an entered response');
            await evaluate('window.scrollTo(0,0)');
            await capture(`chart-${trial.scenario.replace(/[^a-z0-9]+/gi, '-')}-${String(chartIndex + 1).padStart(2, '0')}`);
            chartCount += 1;
          }
        }

        const preserved = await evaluate(`(() => {
          const radios=[...document.querySelectorAll('.response-card input[type=radio]')];
          const answer=radios.find((radio)=>radio.value!=='unknown');
          if (!radios.some((radio)=>radio.checked)) answer?.click();
          const selects=document.querySelectorAll('.response-card select');
          if (!selects[0].value) { selects[0].value='4'; selects[0].dispatchEvent(new Event('change',{bubbles:true})); }
          if (!selects[1].value) { selects[1].value='2'; selects[1].dispatchEvent(new Event('change',{bubbles:true})); }
          const beforeEvidenceClick=window.scrollY;
          document.querySelector('.situation-table button[aria-label^="Inspect "]')?.click();
          const afterEvidenceClick=window.scrollY;
          return {
            answer:document.querySelector('.response-card input[type=radio]:checked')?.value,
            ratings:[...selects].map((select)=>select.value),
            evidenceClickKeptScroll:beforeEvidenceClick===afterEvidenceClick,
          };
        })()`);
        await delay(120);
        const inspectorState = await evaluate(`(() => {
          [...document.querySelectorAll('.evidence summary')].find((item)=>item.textContent.includes('Technical details'))?.click();
          const inspector=document.querySelector('.evidence');
          const panel=document.querySelector('[aria-label="Trial response panel"]');
          return {
            responseVisible:!!panel,
            responsePosition:getComputedStyle(panel).position,
            technicalDetailsExpanded:!![...document.querySelectorAll('.evidence details')].find((item)=>item.open),
            inspectorBottom:inspector.getBoundingClientRect().bottom+window.scrollY,
            responseTop:panel.getBoundingClientRect().top+window.scrollY
          };
        })()`);
        assert.ok(preserved.answer);
        assert.deepEqual(preserved.ratings, ['4', '2']);
        assert.equal(preserved.evidenceClickKeptScroll, true);
        assert.equal(inspectorState.responseVisible, true);
        assert.equal(inspectorState.responsePosition, 'static');
        assert.equal(inspectorState.technicalDetailsExpanded, true);
        assert.ok(inspectorState.responseTop >= inspectorState.inspectorBottom, 'response panel overlaps inspector content');
        await capture(`trial-${String(index + 1).padStart(2, '0')}-inspector`);

        await cdp.send('Page.setDeviceMetricsOverride', {
          width: 390,
          height: 844,
          deviceScaleFactor: 1,
          mobile: true,
        });
        const narrow = await state();
        assert.ok(narrow.documentWidth <= narrow.viewportWidth + 1, `document overflows at 390px: ${trial.scenario}`);
        assert.equal(narrow.responsePosition, 'static');
        assert.equal(narrow.tableMaxHeight, 'none');
        await capture(`trial-${String(index + 1).padStart(2, '0')}-mobile`);
        await cdp.send('Page.setDeviceMetricsOverride', {
          width: 1440,
          height: 1050,
          deviceScaleFactor: 1,
          mobile: false,
        });

        if (index < 9) {
          await clickText('button', 'Record response and continue');
          await delay(350);
          const next = await state();
          assert.match(next.kicker, new RegExp(`Trial ${index + 2} of 10`));
          assert.equal(await evaluate('document.activeElement?.textContent?.trim()'), next.question);
          assert.equal(next.scrollY, 0);
        } else {
          await clickText('button', 'Record response and continue');
          await selectValue('Evidence clarity', '4');
          await selectValue('Condition preference', 'recommended');
          await selectValue('Easier condition', 'recommended');
          await clickText('button', 'Save responses and view debrief');
        }
      }

      assert.equal(scenarios.size, 5, 'the ten trials must cover all five scenario families');
      assert.deepEqual([...conditions].sort(), ['Evidence-only view', 'Task-aware recommended view']);
      assert.equal(chartCount, 16, 'all selectable recommended charts should be visited');
      const completeSession = await evaluate(
        `JSON.parse(localStorage.getItem('avr-cedar-watch-pilot-v1'))`,
      );
      assert.equal(completeSession.status, 'complete');
      assert.equal(completeSession.responses.length, 10);
      assert.equal(completeSession.uiVersion, 'rehearsal-2026.11.03.1');
      assert.deepEqual(cdp.errors, []);
      t.diagnostic(`Captured desktop/mobile trial and chart screenshots in ${artifacts}`);
    } finally {
      cdp?.close();
      await Promise.all([stopProcess(devServer), stopProcess(browser)]);
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  },
);
