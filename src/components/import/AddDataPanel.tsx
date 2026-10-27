import { useMemo, useRef, useState } from 'react';
import {
  buildDataset,
  isSyntheticBatch,
  nextBatchId,
  processFiles,
  textInput,
  type CancelToken,
  type ImportProgress,
} from '../../imported/ingest';
import { buildEvidenceIndex } from '../../imported/links';
import { downloadText } from '../../imported/exporters';
import { DEDUCTION_TEMPLATE, FACT_TEMPLATE, LINKED_TEMPLATE } from '../../imported/templates';
import {
  DEFAULT_LIMITS,
  type BatchResult,
  type ImportLimits,
  type ImportedDataset,
  type InputFile,
} from '../../imported/types';

type Tab = 'create' | 'import';
const KIB = 1024;
const folderSupported = () =>
  typeof document !== 'undefined' && 'webkitdirectory' in document.createElement('input');

/** Adapts browser File objects; the relative path is kept when the browser supplies one. */
export function fileToInput(file: File): InputFile {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return { path: relative || file.name, size: file.size, read: () => file.text() };
}

export function AddDataPanel({
  active,
  onActivate,
}: {
  active: ImportedDataset | null;
  onActivate: (dataset: ImportedDataset) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('create');
  const [text, setText] = useState('');
  const [markSynthetic, setMarkSynthetic] = useState(true);
  const [limits, setLimits] = useState<ImportLimits>(DEFAULT_LIMITS);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [batch, setBatch] = useState<{ result: BatchResult; synthetic: boolean } | null>(null);
  const [mode, setMode] = useState<'append' | 'replace'>('replace');
  const [status, setStatus] = useState('');
  const run = useRef(0);
  const token = useRef<CancelToken | null>(null);

  const start = async (inputs: InputFile[], label: string, synthetic: boolean | 'auto') => {
    if (token.current) token.current.cancelled = true;
    const id = ++run.current;
    const mine: CancelToken = { cancelled: false };
    token.current = mine;
    setBatch(null);
    setStatus('');
    setProgress({ done: 0, total: inputs.length, path: '' });
    const result = await processFiles(inputs, {
      batchId: nextBatchId(active),
      label,
      limits,
      token: mine,
      onProgress: (p) => {
        if (id === run.current) setProgress(p);
      },
    });
    // A newer run, a cancellation or a clear makes this completion stale: nothing is shown or activated.
    if (id !== run.current || result === null) return;
    setProgress(null);
    setBatch({ result, synthetic: synthetic === 'auto' ? isSyntheticBatch(result) : synthetic });
    setMode(active ? 'append' : 'replace');
  };

  const cancel = () => {
    if (token.current) token.current.cancelled = true;
    run.current += 1;
    setProgress(null);
    setBatch(null);
    setStatus('Import cancelled. Nothing was activated.');
  };

  const preview = useMemo(
    () =>
      batch
        ? buildDataset({ base: active, mode, batch: batch.result, synthetic: batch.synthetic })
        : null,
    [batch, active, mode],
  );
  const previewStats = useMemo(() => {
    if (!preview) return null;
    const entities = new Set([
      ...preview.facts.map((f) => f.entityId),
      ...preview.deductions.flatMap((d) => (d.subjectEntity ? [d.subjectEntity] : [])),
    ]);
    const predicates = new Set([
      ...preview.facts.map((f) => f.predicate),
      ...preview.deductions.flatMap((d) => (d.predicate ? [d.predicate] : [])),
    ]);
    return {
      entities: entities.size,
      predicates: predicates.size,
      evidence: buildEvidenceIndex(preview),
    };
  }, [preview]);

  const onFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length)
      void start(files.map(fileToInput), `Imported ${files.length} file(s)`, 'auto');
  };

  const openTxt = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    setText(await file.text());
    setStatus(`Opened ${file.name} in the editor. TXT files must contain supported JSON.`);
  };

  const activate = () => {
    if (!preview || !batch) return;
    run.current += 1;
    onActivate(preview);
    setBatch(null);
    setStatus(
      `Added ${preview.facts.length} fact(s) and ${preview.deductions.length} deduction(s) to the active import.`,
    );
  };

  const stats = batch?.result.counts;
  const errors = batch?.result.issues.filter((i) => i.severity === 'error') ?? [];
  const numberField = (label: string, key: keyof ImportLimits, unit: number, suffix: string) => (
    <label className="field" key={key}>
      <span>
        {label} ({suffix})
      </span>
      <input
        type="number"
        min={1}
        value={Math.round(limits[key] / unit)}
        onChange={(e) =>
          setLimits((old) => ({ ...old, [key]: Math.max(1, Number(e.target.value) || 1) * unit }))
        }
      />
    </label>
  );

  return (
    <div className="add-data">
      <button
        type="button"
        className="button secondary full"
        aria-expanded={open}
        aria-controls="add-data-region"
        onClick={() => setOpen((v) => !v)}
      >
        Add Data
      </button>
      {open && (
        <div id="add-data-region" role="region" aria-label="Add Data" className="add-data-region">
          <p className="help">
            Everything is processed in this browser, in memory. Nothing is uploaded or saved
            automatically.
          </p>
          <div role="tablist" aria-label="Add Data method" className="slice-actions">
            {(
              [
                ['create', 'Create / Paste Test Data'],
                ['import', 'Import Files / Folder'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`button ${tab === id ? 'primary' : 'ghost'}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'create' ? (
            <div role="tabpanel" aria-label="Create or paste test data">
              <label className="field">
                <span>JSON editor</span>
                <textarea
                  rows={10}
                  spellCheck={false}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste a fact, a deduction, an array, or a versioned envelope"
                />
              </label>
              <div className="slice-actions">
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setText(FACT_TEMPLATE)}
                >
                  Synthetic fact template
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setText(DEDUCTION_TEMPLATE)}
                >
                  Synthetic deduction template
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setText(LINKED_TEMPLATE)}
                >
                  Synthetic linked template
                </button>
              </div>
              <label className="field">
                <span>Open TXT or JSON file in editor</span>
                <input
                  type="file"
                  accept=".txt,.json,text/plain,application/json"
                  onChange={(e) => void openTxt(e.target.files)}
                />
                <small>
                  A TXT file must already contain supported JSON. Prose is not converted into facts
                  or deductions.
                </small>
              </label>
              <label className="field">
                <span>
                  <input
                    type="checkbox"
                    checked={markSynthetic}
                    onChange={(e) => setMarkSynthetic(e.target.checked)}
                  />{' '}
                  Label as synthetic test data
                </span>
              </label>
              <div className="slice-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={!text.trim()}
                  onClick={() =>
                    void start(
                      [textInput('editor/pasted-data.json', text)],
                      'Authored data',
                      markSynthetic,
                    )
                  }
                >
                  Validate and preview
                </button>
                <button
                  type="button"
                  className="button ghost"
                  disabled={!text.trim()}
                  onClick={() => downloadText('authored-data.json', text, 'application/json')}
                >
                  Download JSON
                </button>
                <button
                  type="button"
                  className="button ghost"
                  disabled={!text.trim()}
                  onClick={() => downloadText('authored-data.txt', text, 'text/plain')}
                >
                  Download TXT
                </button>
              </div>
            </div>
          ) : (
            <div role="tabpanel" aria-label="Import files or folder">
              <p className="help">
                Supported: .json and .txt files that contain supported JSON (single record, array,
                versioned envelope, or a mixed folder). Files are recognized by structure, not name.
                PDFs, images, executables and other binaries are skipped without being read.
              </p>
              <label className="field">
                <span>Select files</span>
                <input
                  type="file"
                  multiple
                  accept=".json,.txt,text/plain,application/json"
                  onChange={(e) => onFiles(e.target.files)}
                />
              </label>
              {folderSupported() ? (
                <label className="field">
                  <span>Select folder</span>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => onFiles(e.target.files)}
                    {...({ webkitdirectory: '' } as Record<string, string>)}
                  />
                </label>
              ) : (
                <p className="help">
                  Folder selection is not supported by this browser; select multiple files instead.
                </p>
              )}
              <details>
                <summary>Import limits</summary>
                {numberField('Max files', 'maxFiles', 1, 'files')}
                {numberField('Max file size', 'maxFileBytes', KIB, 'KiB')}
                {numberField('Max total size', 'maxTotalBytes', KIB, 'KiB')}
                {numberField('Max records', 'maxRecords', 1, 'records')}
              </details>
            </div>
          )}
          {progress && (
            <div role="status">
              <progress
                max={Math.max(1, progress.total)}
                value={progress.done}
                aria-label="Import progress"
              />
              <p className="help">
                Processing {progress.done} of {progress.total}
                {progress.path ? `: ${progress.path}` : ''}
              </p>
              <button type="button" className="button ghost" onClick={cancel}>
                Cancel import
              </button>
            </div>
          )}
          {status && (
            <p role="status" className="feedback">
              {status}
            </p>
          )}
          {batch && preview && stats && previewStats && (
            <section aria-label="Import preview" className="import-preview">
              <h3>Preview (not yet active)</h3>
              <p className="help">
                {batch.synthetic
                  ? 'Synthetic test data.'
                  : 'Not labeled synthetic; may contain sensitive source text that stays in this browser.'}
              </p>
              <ul>
                <li>Files discovered: {stats.discovered}</li>
                <li>Files processed: {stats.processed}</li>
                <li>Supported files: {stats.supported}</li>
                <li>Unsupported files skipped: {stats.unsupported}</li>
                <li>Skipped by limits: {stats.skippedLimit}</li>
                <li>Files with errors: {stats.failed}</li>
                <li>Facts: {preview.facts.length}</li>
                <li>Deductions: {preview.deductions.length}</li>
                <li>Entities: {previewStats.entities}</li>
                <li>Predicates: {previewStats.predicates}</li>
                <li>Identical duplicates collapsed: {preview.duplicates.length}</li>
                <li>Conflicting ID collisions (excluded): {preview.collisions.length}</li>
                <li>Excluded records: {preview.excluded.length + preview.collisions.length}</li>
                <li>Unresolved links: {previewStats.evidence.dangling.length}</li>
                <li>Conflicting links: {previewStats.evidence.conflictedFactIds.size}</li>
              </ul>
              <fieldset>
                <legend>Activation mode</legend>
                <label>
                  <input
                    type="radio"
                    name="import-mode"
                    checked={mode === 'append'}
                    disabled={!active}
                    onChange={() => setMode('append')}
                  />{' '}
                  Append to active import
                </label>{' '}
                <label>
                  <input
                    type="radio"
                    name="import-mode"
                    checked={mode === 'replace'}
                    onChange={() => setMode('replace')}
                  />{' '}
                  Replace active import
                </label>
              </fieldset>
              <p className="help">The Cedar Watch demo data is never modified.</p>
              <div className="tablewrap">
                <table>
                  <caption>Files</caption>
                  <thead>
                    <tr>
                      <th>Path</th>
                      <th>Status</th>
                      <th>Records</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.result.files.map((f) => (
                      <tr key={`${f.batchId}-${f.path}`}>
                        <td>{f.path}</td>
                        <td>
                          {f.status}
                          {f.note ? ` — ${f.note}` : ''}
                        </td>
                        <td>
                          {f.recordsAccepted}/{f.recordsFound}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(batch.result.issues.length > 0 || preview.collisions.length > 0) && (
                <div className="tablewrap">
                  <table>
                    <caption>Issues ({errors.length} error(s))</caption>
                    <thead>
                      <tr>
                        <th>Severity</th>
                        <th>File</th>
                        <th>Location</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batch.result.issues.map((i, index) => (
                        <tr key={index}>
                          <td>{i.severity}</td>
                          <td>{i.filePath}</td>
                          <td>{i.location}</td>
                          <td>{i.message}</td>
                        </tr>
                      ))}
                      {preview.collisions.map((c) => (
                        <tr key={`${c.kind}-${c.id}`}>
                          <td>error</td>
                          <td>
                            {c.variants
                              .flatMap((v) => v.occurrences.map((o) => o.filePath))
                              .join(', ')}
                          </td>
                          <td>
                            {c.variants
                              .flatMap((v) => v.occurrences.map((o) => o.location))
                              .join(', ')}
                          </td>
                          <td>
                            {c.kind} ID {JSON.stringify(c.id)} appears with {c.variants.length}{' '}
                            different contents; all variants excluded.
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="slice-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={!preview.facts.length && !preview.deductions.length}
                  onClick={activate}
                >
                  Add valid records
                </button>
                <button type="button" className="button ghost" onClick={() => setBatch(null)}>
                  Discard preview
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
