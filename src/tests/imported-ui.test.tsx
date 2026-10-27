import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App';
import { fixtureText } from './importedTestUtils';

type Listener = (event: unknown, item: { datum: Record<string, unknown> } | undefined) => void;
const embedded = vi.hoisted(() => ({
  specs: [] as Record<string, unknown>[],
  click: null as null | Listener,
}));
vi.mock('vega-embed', () => ({
  default: vi.fn(async (_host: unknown, spec: Record<string, unknown>) => {
    embedded.specs.push(spec);
    return {
      view: {
        addEventListener: (name: string, cb: Listener) => {
          if (name === 'click') embedded.click = cb;
        },
        addSignalListener: () => undefined,
      },
      finalize: () => undefined,
    };
  }),
}));

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
if (typeof Blob.prototype.text !== 'function')
  Object.defineProperty(Blob.prototype, 'text', {
    configurable: true,
    value(this: Blob) {
      return readBlob(this);
    },
  });

const SECRET = 'SECRET-IMPORTED-TEXT-12345';
const record = (extra: Record<string, unknown> = {}) => ({
  fact_id: 'UI-F1',
  entity_id: 'UI-E1',
  predicate: 'ui_measure',
  object_value: 4,
  unit: 'ui units',
  as_of: '2025-01-01T00:00:00Z',
  valid_from: '2025-01-01T00:00:00Z',
  valid_to: null,
  ...extra,
});
const file = (name: string, text: string, path?: string) => {
  const f = new File([text], name, { type: 'text/plain' });
  if (path) Object.defineProperty(f, 'webkitRelativePath', { value: path });
  return f;
};

async function openAddData() {
  const toggle = screen.getByRole('button', { name: 'Add Data' });
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle);
}
async function previewText(text: string, synthetic = true) {
  await openAddData();
  const editor = screen.getByLabelText('JSON editor');
  fireEvent.change(editor, { target: { value: text } });
  if (!synthetic) fireEvent.click(screen.getByLabelText(/Label as synthetic/));
  fireEvent.click(screen.getByRole('button', { name: 'Validate and preview' }));
  await screen.findByRole('region', { name: 'Import preview' });
}
const activate = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Add valid records' }));
  await screen.findByRole('region', { name: 'Imported data workspace' });
};

describe('Add Data workflow', () => {
  beforeEach(() => {
    localStorage.clear();
    embedded.specs.length = 0;
    embedded.click = null;
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('offers the Add Data entry in Data & Filters with both paths and TXT guidance', async () => {
    render(<App />);
    const toggle = screen.getByRole('button', { name: 'Add Data' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tab', { name: 'Create / Paste Test Data' })).toBeInTheDocument();
    expect(screen.getByText(/must already contain supported JSON/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Import Files / Folder' }));
    expect(screen.getByText(/PDFs, images, executables/)).toBeInTheDocument();
    expect(screen.getByLabelText('Select files')).toHaveAttribute('multiple');
  });

  it('previews without activating, then activates explicitly and leaves the demo untouched', async () => {
    render(<App />);
    const demoHeading = screen.getByRole('heading', { name: 'Task & Context' });
    await openAddData();
    fireEvent.click(screen.getByRole('button', { name: 'Synthetic linked template' }));
    fireEvent.click(screen.getByRole('button', { name: 'Validate and preview' }));
    await screen.findByRole('region', { name: 'Import preview' });
    expect(screen.getByText('Synthetic test data.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Imported data workspace' })).toBeNull();
    expect(screen.getByLabelText(/Imported data/)).toBeDisabled();
    await activate();
    expect(screen.queryByRole('heading', { name: 'Task & Context' })).toBeNull();
    fireEvent.click(screen.getByLabelText(/Cedar Watch demo/));
    expect(screen.getByRole('heading', { name: 'Task & Context' })).toBeInTheDocument();
    expect(demoHeading).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Imported data workspace' })).toBeNull();
  });

  it('renders imported strings as text, never HTML', async () => {
    render(<App />);
    await previewText(
      JSON.stringify(
        record({
          fact_id: 'UI-F1',
          entity_id: '<img src=x onerror=alert(1)>',
          predicate: '<b>bold</b>',
        }),
      ),
    );
    await activate();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('.imported-workspace b')).toBeNull();
    expect(screen.getAllByText('<b>bold</b>').length).toBeGreaterThan(0);
  });

  it('selects the exact fact from a real chart click and shows its supporting deductions', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText(/Audience/), { target: { value: 'Analyst' } });
    const text = JSON.stringify({
      schema_version: 'avr-import/1',
      facts: [
        record({ supporting_deduction_ids: ['UI-D1', 'UI-D2'] }),
        record({
          fact_id: 'UI-F2',
          valid_from: '2025-03-01T00:00:00Z',
          valid_to: '2025-04-01T00:00:00Z',
        }),
      ],
      deductions: [
        { deduction_id: 'UI-D1', fact_id: 'UI-F1', provenance: { raw_text: 'raw one' } },
        { deduction_id: 'UI-D2', provenance: { raw_text: 'raw two' } },
        { deduction_id: 'UI-D3', provenance: { raw_text: 'independent raw' } },
      ],
    });
    await previewText(text);
    await activate();
    fireEvent.click(screen.getByRole('button', { name: /Supplied validity timeline/i }));
    await waitFor(() => expect(embedded.click).not.toBeNull());
    const spec = embedded.specs.at(-1) as { data: { values: Record<string, unknown>[] } };
    const datum = spec.data.values.find((v) => v.fact_id === 'UI-F1')!;
    act(() => embedded.click!({}, { datum }));
    const panel = await screen.findByRole('region', { name: 'Evidence for UI-F1' });
    expect(within(panel).getByText(/raw one/)).toBeInTheDocument();
    expect(within(panel).getByText(/raw two/)).toBeInTheDocument();
    expect(within(panel).queryByText(/independent raw/)).toBeNull();
    const other = spec.data.values.find((v) => v.fact_id === 'UI-F2')!;
    act(() => embedded.click!({}, { datum: other }));
    const second = await screen.findByRole('region', { name: 'Evidence for UI-F2' });
    expect(within(second).getByText(/Supporting extraction not linked/)).toBeInTheDocument();
    expect(within(second).queryByText(/raw one/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Provenance/i }));
    fireEvent.change(screen.getByLabelText('Search deductions'), {
      target: { value: 'independent' },
    });
    expect(screen.getByText(/1 of 3 deductions/)).toBeInTheDocument();
  });

  it('accepts files and folders, skips unsupported ones and keeps valid records', async () => {
    render(<App />);
    await openAddData();
    fireEvent.click(screen.getByRole('tab', { name: 'Import Files / Folder' }));
    const input = screen.getByLabelText('Select files');
    fireEvent.change(input, {
      target: {
        files: [
          file('a.json', JSON.stringify(record()), 'dir/a.json'),
          file('bad.json', '{ not json', 'dir/sub/bad.json'),
          file('notes.txt', 'plain prose', 'dir/notes.txt'),
          file('x.pdf', '%PDF', 'dir/x.pdf'),
        ],
      },
    });
    const preview = await screen.findByRole('region', { name: 'Import preview' });
    expect(within(preview).getByText('Files discovered: 4')).toBeInTheDocument();
    expect(within(preview).getAllByText(/dir\/sub\/bad\.json/).length).toBeGreaterThan(0);
    expect(within(preview).getByText(/TXT files must contain supported JSON/)).toBeInTheDocument();
    await activate();
    expect(screen.getAllByText('UI-F1').length).toBeGreaterThan(0);
  });

  it('supports append and replace and quarantines append collisions', async () => {
    render(<App />);
    await previewText(JSON.stringify(record()));
    await activate();
    await openAddData();
    fireEvent.change(screen.getByLabelText('JSON editor'), {
      target: { value: JSON.stringify(record({ object_value: 99 })) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validate and preview' }));
    const preview = await screen.findByRole('region', { name: 'Import preview' });
    expect(within(preview).getByText(/different contents/)).toBeInTheDocument();
    fireEvent.click(within(preview).getByLabelText(/Replace/i));
    expect(within(preview).queryByText(/different contents/)).toBeNull();
  });

  it('downloads authored JSON and TXT and exports with a sensitive-content warning', async () => {
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => (created.push(b as Blob), 'blob:x'));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<App />);
    await openAddData();
    fireEvent.change(screen.getByLabelText('JSON editor'), {
      target: { value: JSON.stringify(record()) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download TXT' }));
    expect(created.map((b) => b.type)).toEqual(['application/json', 'text/plain']);
    fireEvent.click(screen.getByRole('button', { name: 'Validate and preview' }));
    await screen.findByRole('region', { name: 'Import preview' });
    await activate();
    fireEvent.click(screen.getByRole('button', { name: /Export normalized JSON/ }));
    expect(screen.getByText(/source text/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download export' }));
    expect(created).toHaveLength(3);
    const exported = JSON.parse(await readBlob(created[2]));
    expect(exported.schema_version).toBe('avr-import/1');
    expect(exported.facts[0].fact_id).toBe('UI-F1');
  });

  it('opens a TXT file with JSON into the editor', async () => {
    render(<App />);
    await openAddData();
    fireEvent.change(screen.getByLabelText(/Open TXT or JSON file/), {
      target: { files: [file('data.txt', JSON.stringify(record()))] },
    });
    await waitFor(() =>
      expect((screen.getByLabelText('JSON editor') as HTMLTextAreaElement).value).toContain(
        'UI-F1',
      ),
    );
  });

  it('clears the import after confirmation and returns to the demo', async () => {
    render(<App />);
    await previewText(JSON.stringify(record()));
    await activate();
    fireEvent.click(screen.getByRole('button', { name: 'Clear imported data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm clear' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Imported data workspace' })).toBeNull(),
    );
    expect(screen.getByRole('heading', { name: 'Task & Context' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Imported data/)).toBeDisabled();
  });

  it('never persists imported text or sends it over the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const beacon = vi.fn();
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    render(<App />);
    await previewText(
      JSON.stringify(
        record({ source_file_path: 'https://example.invalid/secret.pdf', entity_id: SECRET }),
      ),
      false,
    );
    await activate();
    fireEvent.click(screen.getAllByText(/UI-F1/)[0]);
    const stored = Object.keys(localStorage)
      .map((k) => `${k}=${localStorage.getItem(k)}`)
      .join('\n');
    expect(stored).not.toContain(SECRET);
    expect(stored).not.toContain('UI-F1');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('shows progress, supports cancel and ignores stale completions', async () => {
    render(<App />);
    await openAddData();
    fireEvent.click(screen.getByRole('tab', { name: 'Import Files / Folder' }));
    let release: (t: string) => void = () => undefined;
    const slow = file('slow.json', '');
    Object.defineProperty(slow, 'text', { value: () => new Promise<string>((r) => (release = r)) });
    fireEvent.change(screen.getByLabelText('Select files'), { target: { files: [slow] } });
    expect(await screen.findByRole('progressbar', { name: 'Import progress' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel import' }));
    await act(async () => release(JSON.stringify(record())));
    expect(screen.queryByRole('region', { name: 'Import preview' })).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByLabelText(/Imported data/)).toBeDisabled();
  });

  it('keeps imported content out of research logs and feedback', async () => {
    render(<App />);
    await previewText(fixtureText('linked-evidence.json'));
    await activate();
    const all = Object.keys(localStorage)
      .map((k) => localStorage.getItem(k))
      .join('\n');
    expect(all).not.toMatch(/SYN-F-L1|SYNTHETIC|raw_text/);
  });
});
