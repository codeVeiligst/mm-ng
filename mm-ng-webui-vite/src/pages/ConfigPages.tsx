import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { MineMeldApi } from '../api/minemeld';
import { ConfirmModal } from '../components/ConfirmModal';
import { EmptyState, ErrorState, LoadingState } from '../components/DataState';
import { ModalBanner } from '../components/ModalBanner';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../auth/useAuth';
import { dumpYaml, parseConfigYaml } from '../utils/configYaml';
import type { CandidateConfigNode, Prototype, PrototypeLibraries } from '../types/minemeld';

type ConfigNodeRow = {
  index: number;
  node: CandidateConfigNode;
};

function isConfigNode(node: CandidateConfigNode | null): node is CandidateConfigNode {
  return node !== null && node.deleted !== true;
}

function candidateNodeRows(nodes: Array<CandidateConfigNode | null> | undefined): ConfigNodeRow[] {
  return (nodes ?? []).flatMap((node, index) => (isConfigNode(node) ? [{ node, index }] : []));
}

function configNodePrototype(node: CandidateConfigNode) {
  const prototype = node.properties?.prototype;
  return typeof prototype === 'string' ? prototype : undefined;
}

function prototypeNodeType(prototype: Prototype | undefined) {
  return (prototype?.node_type ?? prototype?.nodeType ?? 'UNKNOWN').toUpperCase();
}

function prototypeIndicatorTypes(prototype: Prototype | undefined) {
  return prototype?.indicator_types ?? prototype?.indicatorTypes ?? [];
}

function prototypeDevelopmentStatus(prototype: Prototype | undefined) {
  return prototype?.development_status ?? prototype?.developmentStatus;
}

function canUseAsInput(selectedType: string, candidateType: string) {
  if (candidateType === 'UNKNOWN') {
    return true;
  }

  if (selectedType === 'PROCESSOR' || selectedType === 'OUTPUT') {
    return candidateType === 'PROCESSOR' || candidateType === 'MINER';
  }

  return false;
}

function indicatorTypesMatch(selectedTypes: string[], candidateTypes: string[]) {
  if (selectedTypes.length === 0 || selectedTypes[0] === 'any') {
    return true;
  }

  if (candidateTypes.length === 0 || candidateTypes[0] === 'any') {
    return true;
  }

  return candidateTypes.some((type) => selectedTypes.includes(type));
}

function outputForNodeType(nodeType: string) {
  if (nodeType === 'OUTPUT') {
    return false;
  }

  return nodeType === 'MINER' || nodeType === 'PROCESSOR';
}

type ImportNode = {
  name: string;
  properties: Record<string, unknown>;
};

function cloneExportProperties(properties: Record<string, unknown>) {
  const result = { ...properties };
  delete result.node_type;
  delete result.nodeType;
  delete result.indicator_types;
  delete result.indicatorTypes;

  if (typeof result.inputs !== 'undefined' && !Array.isArray(result.inputs)) {
    delete result.inputs;
  }

  return result;
}

function exportCandidateConfig(nodes: CandidateConfigNode[]) {
  const exportedNodes = Object.fromEntries(nodes.map((node) => [node.name, cloneExportProperties(node.properties)]));
  return `${dumpYaml({ nodes: exportedNodes })}\n`;
}

function validateImportConfig(input: string, prototypes: PrototypeLibraries | undefined) {
  const errors: string[] = [];
  let parsed: unknown;

  try {
    parsed = parseConfigYaml(input);
  } catch (error) {
    return { nodes: [] as ImportNode[], errors: [error instanceof Error ? error.message : 'Invalid YAML.'] };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { nodes: [] as ImportNode[], errors: ['Config must be a YAML object.'] };
  }

  const root = parsed as Record<string, unknown>;
  const unknownKeys = Object.keys(root).filter((key) => key !== 'nodes');
  if (unknownKeys.length > 0) {
    errors.push(`Unknown top level attributes: ${unknownKeys.join(', ')}`);
  }

  if (!root.nodes || typeof root.nodes !== 'object' || Array.isArray(root.nodes)) {
    errors.push('Nodes list not defined.');
    return { nodes: [] as ImportNode[], errors };
  }

  const nodeEntries = Object.entries(root.nodes as Record<string, unknown>);
  if (nodeEntries.length === 0) {
    errors.push('Invalid nodes list.');
  }

  const nodes = nodeEntries.flatMap(([name, properties]) => {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      errors.push(`${name}: invalid node name.`);
      return [];
    }
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
      errors.push(`${name}: invalid node format.`);
      return [];
    }

    const node = properties as Record<string, unknown>;
    if (typeof node.inputs !== 'undefined') {
      if (!Array.isArray(node.inputs) || !node.inputs.every((input) => typeof input === 'string')) {
        errors.push(`${name}: wrong inputs list.`);
      }
    }
    if (typeof node.output !== 'boolean') {
      errors.push(`${name}: wrong or missing output field.`);
    }
    if (typeof node.class !== 'undefined' && typeof node.class !== 'string') {
      errors.push(`${name}: class field if defined should be a string.`);
    }
    if (typeof node.config !== 'undefined' && (!node.config || typeof node.config !== 'object' || Array.isArray(node.config))) {
      errors.push(`${name}: config field if defined should be a dictionary.`);
    }
    if (typeof node.prototype !== 'undefined') {
      if (typeof node.prototype !== 'string') {
        errors.push(`${name}: prototype field if defined should be a string.`);
      } else {
        const [libraryName, ...prototypeParts] = node.prototype.split('.');
        const prototypeName = prototypeParts.join('.');
        if (!prototypes?.[libraryName]) {
          errors.push(`${name}: unknown prototype library.`);
        } else if (!prototypes[libraryName].prototypes?.[prototypeName]) {
          errors.push(`${name}: unknown prototype.`);
        }
      }
    }
    if (typeof node.prototype === 'undefined' && (typeof node.config === 'undefined' || typeof node.class === 'undefined')) {
      errors.push(`${name}: prototype field or class and config fields should be defined.`);
    }

    return [{ name, properties: node }];
  });

  return { nodes, errors };
}

function downloadText(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'application/x-yaml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ConfigPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const configQuery = useQuery({ queryKey: ['config', 'full'], queryFn: MineMeldApi.fullConfig });
  const prototypesQuery = useQuery({ queryKey: ['prototype'], queryFn: MineMeldApi.prototypes });
  const nodeRows = candidateNodeRows(configQuery.data?.nodes);
  const nodes = nodeRows.map((row) => row.node);
  const [notice, setNotice] = useState<{ title: string; message?: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConfigNodeRow | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const [importText, setImportText] = useState('nodes:\n');
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const busy = configQuery.isLoading;

  const invalidateConfig = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['config'] }),
      queryClient.invalidateQueries({ queryKey: ['status'] }),
      queryClient.invalidateQueries({ queryKey: ['metrics'] }),
    ]);
  };

  const commitConfig = useMutation({
    mutationFn: async () => {
      if (!configQuery.data?.version) {
        throw new Error('Candidate config version is not loaded.');
      }
      await MineMeldApi.commitConfig(configQuery.data.version);
      await MineMeldApi.restartEngine();
    },
    onSuccess: async () => {
      setNotice({ title: 'Commit successful', message: 'Engine restart requested.' });
      await invalidateConfig();
    },
  });

  const loadCommitted = useMutation({
    mutationFn: () => MineMeldApi.reloadConfig('committed'),
    onSuccess: async () => {
      setNotice({ title: 'Candidate config loaded', message: 'Loaded from committed config.' });
      await invalidateConfig();
    },
  });

  const revertRunning = useMutation({
    mutationFn: () => MineMeldApi.reloadConfig('running'),
    onSuccess: async () => {
      setNotice({ title: 'Candidate config reverted', message: 'Reverted to running config.' });
      await invalidateConfig();
    },
  });

  const deleteNode = useMutation({
    mutationFn: ({ index, node }: ConfigNodeRow) => MineMeldApi.deleteConfigNode(index, node.version),
    onSuccess: async (_result, row) => {
      setNotice({ title: 'Node deleted', message: `${row.node.name} was removed from candidate config.` });
      setDeleteTarget(null);
      await invalidateConfig();
    },
  });

  const importConfig = useMutation({
    mutationFn: async ({ mode, importedNodes }: { mode: 'append' | 'replace'; importedNodes: ImportNode[] }) => {
      if (!configQuery.data?.version) {
        throw new Error('Candidate config version is not loaded.');
      }

      if (mode === 'append') {
        const existingNames = new Set(nodes.map((node) => node.name));
        const duplicates = importedNodes.map((node) => node.name).filter((name) => existingNames.has(name));
        if (duplicates.length > 0) {
          throw new Error(`Node name conflict: ${duplicates.join(', ')}`);
        }
      }

      if (mode === 'replace') {
        for (const row of nodeRows) {
          await MineMeldApi.deleteConfigNode(row.index, row.node.version);
        }
      }

      for (const node of importedNodes) {
        await MineMeldApi.createConfigNode({
          version: configQuery.data.version,
          name: node.name,
          properties: node.properties,
        });
      }
    },
    onSuccess: async (_result, variables) => {
      setNotice({
        title: variables.mode === 'replace' ? 'Candidate config replaced' : 'Config appended',
        message: `${variables.importedNodes.length} node${variables.importedNodes.length === 1 ? '' : 's'} imported.`,
      });
      setImportOpen(false);
      setReplaceConfirmOpen(false);
      setImportErrors([]);
      await invalidateConfig();
    },
  });

  const actionPending = commitConfig.isPending || loadCommitted.isPending || revertRunning.isPending || deleteNode.isPending || importConfig.isPending;
  const actionError = commitConfig.error ?? loadCommitted.error ?? revertRunning.error ?? deleteNode.error ?? importConfig.error;
  const exportText = exportCandidateConfig(nodes);

  const parsedImport = () => {
    const result = validateImportConfig(importText, prototypesQuery.data);
    setImportErrors(result.errors);
    return result;
  };

  const appendImport = () => {
    const result = parsedImport();
    if (result.errors.length > 0) {
      return;
    }
    importConfig.mutate({ mode: 'append', importedNodes: result.nodes });
  };

  const requestReplaceImport = () => {
    const result = parsedImport();
    if (result.errors.length > 0) {
      return;
    }
    setReplaceConfirmOpen(true);
  };

  const replaceImport = () => {
    const result = parsedImport();
    if (result.errors.length > 0) {
      setReplaceConfirmOpen(false);
      return;
    }
    importConfig.mutate({ mode: 'replace', importedNodes: result.nodes });
  };

  return (
    <>
      <PageHeader
        title="Config"
        description="Candidate configuration workflow with legacy commit, load, and revert controls."
        actions={(
          <>
            <button
              className="button primary"
              type="button"
              disabled={!auth.isReadWrite || !configQuery.data?.changed || actionPending || busy}
              onClick={() => {
                setNotice(null);
                commitConfig.mutate();
              }}
            >
              Commit
            </button>
            <Link className="button primary" to="/config/add">Add node</Link>
          </>
        )}
      />
      <section className={`config-status-panel ${configQuery.data?.changed ? 'changed' : 'unchanged'}`}>
        <div>
          <strong>{configQuery.data?.changed ? 'CHANGED' : 'UNCHANGED'}</strong>
          <span>{configQuery.data?.changed ? 'Candidate config has unapplied changes.' : 'Candidate config matches committed state.'}</span>
        </div>
        <div className="config-action-bar">
          <button
            className="button secondary"
            type="button"
            disabled={!auth.isReadWrite || actionPending || busy}
            onClick={() => {
              setNotice(null);
              loadCommitted.mutate();
            }}
          >
            Load committed
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={!auth.isReadWrite || actionPending || busy}
            onClick={() => {
              setNotice(null);
              revertRunning.mutate();
            }}
          >
            Revert running
          </button>
          <button className="button secondary" type="button" disabled={!auth.isReadWrite || actionPending || busy} onClick={() => setExportOpen(true)}>
            Export
          </button>
          <button className="button secondary" type="button" disabled={!auth.isReadWrite || actionPending || busy || prototypesQuery.isLoading} onClick={() => setImportOpen(true)}>
            Import
          </button>
        </div>
      </section>
      {notice ? <ModalBanner title={notice.title} message={notice.message} onClose={() => setNotice(null)} /> : null}
      {actionError ? <ErrorState error={actionError} /> : null}
      <section className="section-block">
        <div className="section-heading">
          <div>
            <h2>Candidate Configuration</h2>
            <p>Version {configQuery.data?.version ?? '-'}</p>
          </div>
          <StatusBadge label={configQuery.data?.changed ? 'CHANGED' : 'UNCHANGED'} />
        </div>
        {configQuery.isLoading ? <LoadingState /> : null}
        {configQuery.isError ? <ErrorState error={configQuery.error} /> : null}
        {configQuery.isSuccess && nodes.length === 0 ? <EmptyState title="No candidate nodes found" /> : null}
        {nodes.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Prototype</th>
                  <th>Inputs</th>
                  <th>Output</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {nodeRows.map((row) => (
                  <tr key={`${row.index}-${row.node.name}`}>
                    <td>{row.node.name}</td>
                    <td>{String(row.node.properties?.prototype ?? '-')}</td>
                    <td>{Array.isArray(row.node.properties?.inputs) ? row.node.properties.inputs.join(', ') : '-'}</td>
                    <td>{row.node.properties?.output ? 'yes' : 'no'}</td>
                    <td>
                      <button
                        className="button compact"
                        type="button"
                        disabled={!auth.isReadWrite || actionPending}
                        onClick={() => navigate(`/config/${row.index}/edit`)}
                      >
                        Edit
                      </button>
                      <button className="button danger compact" type="button" disabled={!auth.isReadWrite || actionPending} onClick={() => setDeleteTarget(row)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {deleteTarget ? (
        <ConfirmModal
          title="Delete node"
          pending={deleteNode.isPending}
          onConfirm={() => deleteNode.mutate(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        >
          <p>
            Delete <strong>{deleteTarget.node.name}</strong> from candidate config?
          </p>
        </ConfirmModal>
      ) : null}
      {exportOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="wide-modal" role="dialog" aria-modal="true" aria-labelledby="export-config-title">
            <header>
              <h2 id="export-config-title">Export config</h2>
            </header>
            <div className="wide-modal-body">
              <textarea readOnly value={exportText} rows={18} />
            </div>
            <footer>
              <button className="button secondary" type="button" onClick={() => void navigator.clipboard.writeText(exportText)}>
                Copy
              </button>
              <button className="button primary" type="button" onClick={() => downloadText('mm-ng-config.yml', exportText)}>
                Download
              </button>
              <button className="button secondary" type="button" onClick={() => setExportOpen(false)}>
                Close
              </button>
            </footer>
          </div>
        </div>
      ) : null}
      {importOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="wide-modal" role="dialog" aria-modal="true" aria-labelledby="import-config-title">
            <header>
              <h2 id="import-config-title">Import config</h2>
            </header>
            <div className="wide-modal-body">
              <textarea value={importText} rows={18} onChange={(event) => setImportText(event.target.value)} />
              {importErrors.length > 0 ? (
                <div className="form-error">
                  {importErrors.map((error) => (
                    <div key={error}>{error}</div>
                  ))}
                </div>
              ) : null}
            </div>
            <footer>
              <button className="button primary" type="button" disabled={actionPending || prototypesQuery.isLoading} onClick={appendImport}>
                Append
              </button>
              <button className="button danger" type="button" disabled={actionPending || prototypesQuery.isLoading} onClick={requestReplaceImport}>
                Replace
              </button>
              <button className="button secondary" type="button" disabled={actionPending} onClick={() => setImportOpen(false)}>
                Cancel
              </button>
            </footer>
          </div>
        </div>
      ) : null}
      {replaceConfirmOpen ? (
        <ConfirmModal
          title="Replace candidate config"
          pending={importConfig.isPending}
          confirmLabel="Replace"
          onConfirm={replaceImport}
          onCancel={() => setReplaceConfirmOpen(false)}
        >
          <p>Replace the existing candidate config with the imported nodes?</p>
        </ConfirmModal>
      ) : null}
    </>
  );
}

export function ConfigAddPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const configQuery = useQuery({ queryKey: ['config', 'full'], queryFn: MineMeldApi.fullConfig });
  const prototypesQuery = useQuery({ queryKey: ['prototype'], queryFn: MineMeldApi.prototypes });
  const [form, setForm] = useState({
    name: `node-${Date.now()}`,
    prototype: '',
    inputs: [] as string[],
  });
  const [errors, setErrors] = useState<string[]>([]);

  const nodes = (configQuery.data?.nodes ?? []).filter(isConfigNode);
  const existingNames = new Set(nodes.map((node) => node.name));
  const prototypeOptions = useMemo(() => {
    return Object.entries(prototypesQuery.data ?? {})
      .flatMap(([libraryName, library]) =>
        Object.entries(library.prototypes ?? {}).map(([prototypeName, prototype]) => ({
          name: `${libraryName}.${prototypeName}`,
          description: prototype.description,
          nodeType: prototypeNodeType(prototype),
          indicatorTypes: prototypeIndicatorTypes(prototype),
          developmentStatus: prototypeDevelopmentStatus(prototype),
        })),
      )
      .sort((a, b) => a.nodeType.localeCompare(b.nodeType) || a.name.localeCompare(b.name));
  }, [prototypesQuery.data]);
  const prototypeByName = useMemo(() => new Map(prototypeOptions.map((prototype) => [prototype.name, prototype])), [prototypeOptions]);
  const selectedPrototype = prototypeByName.get(form.prototype);
  const selectedNodeType = selectedPrototype?.nodeType ?? 'UNKNOWN';
  const inputsDisabled = selectedNodeType === 'MINER';
  const inputLimit = selectedNodeType === 'OUTPUT' ? 1 : selectedNodeType === 'PROCESSOR' ? 1024 : 0;
  const decoratedNodes = useMemo(() => {
    return nodes.map((node) => {
      const prototype = configNodePrototype(node);
      const metadata = prototype ? prototypeByName.get(prototype) : undefined;

      return {
        name: node.name,
        nodeType: metadata?.nodeType ?? 'UNKNOWN',
        indicatorTypes: metadata?.indicatorTypes ?? [],
        output: node.properties?.output !== false,
      };
    });
  }, [nodes, prototypeByName]);
  const availableInputs = useMemo(() => {
    if (!selectedPrototype || inputsDisabled) {
      return [];
    }

    let result = decoratedNodes.filter((node) => node.output);
    result = result.filter((node) => canUseAsInput(selectedNodeType, node.nodeType));
    result = result.filter((node) => indicatorTypesMatch(selectedPrototype.indicatorTypes, node.indicatorTypes));

    if (inputLimit > 0 && form.inputs.length >= inputLimit) {
      result = result.filter((node) => form.inputs.includes(node.name));
    }

    return result;
  }, [decoratedNodes, form.inputs, inputLimit, inputsDisabled, selectedNodeType, selectedPrototype]);
  const prototypeGroups = ['MINER', 'PROCESSOR', 'OUTPUT', 'UNKNOWN'].map((nodeType) => ({
    nodeType,
    prototypes: prototypeOptions.filter((prototype) => prototype.nodeType === nodeType),
  })).filter((group) => group.prototypes.length > 0);
  const inputGroups = ['MINER', 'PROCESSOR', 'UNKNOWN'].map((nodeType) => ({
    nodeType,
    nodes: availableInputs.filter((node) => node.nodeType === nodeType),
  })).filter((group) => group.nodes.length > 0);

  const createNode = useMutation({
    mutationFn: (body: { version: string; name: string; properties: Record<string, unknown> }) => MineMeldApi.createConfigNode(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['config', 'full'] });
      navigate('/config');
    },
  });

  const validate = () => {
    const nextErrors: string[] = [];
    const name = form.name.trim();
    if (!name) {
      nextErrors.push('Node name is required.');
    } else if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) {
      nextErrors.push('Node name can contain only letters, numbers, underscore, and dash, and must start with a letter or number.');
    } else if (existingNames.has(name)) {
      nextErrors.push('A node with this name already exists in candidate config.');
    }

    if (!form.prototype) {
      nextErrors.push('Prototype is required.');
    } else if (!prototypeByName.has(form.prototype)) {
      nextErrors.push('Selected prototype is not available.');
    }

    const validInputNames = new Set(availableInputs.map((node) => node.name));
    const invalidInputs = form.inputs.filter((input) => !validInputNames.has(input) || input === name);
    if (invalidInputs.length > 0) {
      nextErrors.push(`Invalid input node: ${invalidInputs.join(', ')}`);
    }

    if (inputLimit > 0 && form.inputs.length > inputLimit) {
      nextErrors.push(`Selected prototype allows at most ${inputLimit} input node${inputLimit === 1 ? '' : 's'}.`);
    }

    if (inputLimit === 0 && form.inputs.length > 0) {
      nextErrors.push('Selected prototype does not accept input nodes.');
    }

    return nextErrors;
  };

  const updatePrototype = (prototype: string) => {
    const nextType = prototypeByName.get(prototype)?.nodeType ?? 'UNKNOWN';
    setForm({
      ...form,
      prototype,
      inputs: [],
      name: form.name || (prototype ? `${prototype.split('.').at(-1)}-${Date.now()}` : form.name),
    });

    if (nextType === 'MINER') {
      setErrors([]);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (validationErrors.length > 0 || !configQuery.data?.version) {
      return;
    }

    const output = outputForNodeType(selectedNodeType);
    createNode.mutate({
      version: configQuery.data.version,
      name: form.name.trim(),
      properties: {
        prototype: form.prototype,
        inputs: form.inputs,
        output,
      },
    });
  };

  return (
    <>
      <PageHeader title="Add Node" description="Create a candidate configuration node from an existing prototype." />
      <section className="section-block editor-section">
        <div className="section-heading">
          <div>
            <h2>ADD NODE</h2>
            <p>Select a prototype and connect suitable input nodes. Output behavior is derived from the prototype type.</p>
          </div>
          <StatusBadge label={configQuery.data?.changed ? 'CHANGED' : 'UNCHANGED'} />
        </div>
        {configQuery.isLoading || prototypesQuery.isLoading ? <LoadingState label="Loading configuration" /> : null}
        {configQuery.isError ? <ErrorState error={configQuery.error} /> : null}
        {prototypesQuery.isError ? <ErrorState error={prototypesQuery.error} /> : null}
        {createNode.error ? <ErrorState error={createNode.error} /> : null}
        {errors.length > 0 ? (
          <div className="form-error">
            {errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        ) : null}
        <form className="editor-form" onSubmit={submit}>
          <label>
            Name
            <input value={form.name} disabled={!auth.isReadWrite} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label>
            Prototype
            <select value={form.prototype} disabled={!auth.isReadWrite} onChange={(event) => updatePrototype(event.target.value)}>
              <option value="">Select prototype</option>
              {prototypeGroups.map((group) => (
                <optgroup key={group.nodeType} label={group.nodeType}>
                  {group.prototypes.map((prototype) => (
                    <option key={prototype.name} value={prototype.name}>{prototype.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="wide-field">
            Inputs
            <select
              multiple
              value={form.inputs}
              disabled={!auth.isReadWrite || inputsDisabled || !selectedPrototype}
              onChange={(event) =>
                setForm({
                  ...form,
                  inputs: Array.from(event.currentTarget.selectedOptions).map((option) => option.value),
                })
              }
            >
              {inputGroups.map((group) => (
                <optgroup key={group.nodeType} label={group.nodeType}>
                  {group.nodes.map((node) => (
                    <option key={node.name} value={node.name}>{node.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {selectedPrototype ? (
            <div className="wide-field legacy-form-note">
              <strong>{selectedPrototype.nodeType}</strong>
              <span>{selectedPrototype.description ?? selectedPrototype.name}</span>
              {selectedPrototype.developmentStatus && selectedPrototype.developmentStatus !== 'STABLE' ? (
                <span className="form-warning">WARNING: selected prototype is marked as {selectedPrototype.developmentStatus}</span>
              ) : null}
              {inputsDisabled ? <span>Miner prototypes do not accept input nodes.</span> : null}
              {!inputsDisabled && availableInputs.length === 0 ? <span>No suitable input nodes found.</span> : null}
              {inputLimit === 1 ? <span>Output prototypes accept one input node.</span> : null}
            </div>
          ) : null}
          <div className="form-actions wide-field">
            <button className="button primary" type="submit" disabled={!auth.isReadWrite || createNode.isPending || configQuery.isLoading || prototypesQuery.isLoading}>
              OK
            </button>
            <Link className="button secondary" to="/config">Cancel</Link>
          </div>
        </form>
      </section>
    </>
  );
}

export function ConfigEditPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { nodenum } = useParams();
  const queryClient = useQueryClient();
  const configQuery = useQuery({ queryKey: ['config', 'full'], queryFn: MineMeldApi.fullConfig });
  const prototypesQuery = useQuery({ queryKey: ['prototype'], queryFn: MineMeldApi.prototypes });
  const [form, setForm] = useState({
    name: '',
    prototype: '',
    inputs: [] as string[],
  });
  const [loadedKey, setLoadedKey] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const nodeIndex = Number(nodenum);
  const nodeRows = candidateNodeRows(configQuery.data?.nodes);
  const currentRow = Number.isInteger(nodeIndex) ? nodeRows.find((row) => row.index === nodeIndex) : undefined;
  const nodes = nodeRows.map((row) => row.node);
  const existingNames = new Set(nodeRows.filter((row) => row.index !== nodeIndex).map((row) => row.node.name));
  const prototypeOptions = useMemo(() => {
    return Object.entries(prototypesQuery.data ?? {})
      .flatMap(([libraryName, library]) =>
        Object.entries(library.prototypes ?? {}).map(([prototypeName, prototype]) => ({
          name: `${libraryName}.${prototypeName}`,
          description: prototype.description,
          nodeType: prototypeNodeType(prototype),
          indicatorTypes: prototypeIndicatorTypes(prototype),
          developmentStatus: prototypeDevelopmentStatus(prototype),
        })),
      )
      .sort((a, b) => a.nodeType.localeCompare(b.nodeType) || a.name.localeCompare(b.name));
  }, [prototypesQuery.data]);
  const prototypeByName = useMemo(() => new Map(prototypeOptions.map((prototype) => [prototype.name, prototype])), [prototypeOptions]);

  useEffect(() => {
    if (!currentRow) {
      return;
    }

    const key = `${currentRow.index}:${currentRow.node.version}`;
    if (key === loadedKey) {
      return;
    }

    const inputs = Array.isArray(currentRow.node.properties?.inputs) ? currentRow.node.properties.inputs.filter((input): input is string => typeof input === 'string') : [];
    setForm({
      name: currentRow.node.name,
      prototype: String(currentRow.node.properties?.prototype ?? ''),
      inputs,
    });
    setLoadedKey(key);
    setErrors([]);
  }, [currentRow, loadedKey]);

  const selectedPrototype = prototypeByName.get(form.prototype);
  const selectedNodeType = selectedPrototype?.nodeType ?? 'UNKNOWN';
  const inputsDisabled = selectedNodeType === 'MINER';
  const inputLimit = selectedNodeType === 'OUTPUT' ? 1 : selectedNodeType === 'PROCESSOR' ? 1024 : 0;
  const decoratedNodes = useMemo(() => {
    return nodes
      .filter((node) => node.name !== currentRow?.node.name)
      .map((node) => {
        const prototype = configNodePrototype(node);
        const metadata = prototype ? prototypeByName.get(prototype) : undefined;

        return {
          name: node.name,
          nodeType: metadata?.nodeType ?? 'UNKNOWN',
          indicatorTypes: metadata?.indicatorTypes ?? [],
          output: node.properties?.output !== false,
        };
      });
  }, [currentRow?.node.name, nodes, prototypeByName]);
  const availableInputs = useMemo(() => {
    if (!selectedPrototype || inputsDisabled) {
      return [];
    }

    let result = decoratedNodes.filter((node) => node.output);
    result = result.filter((node) => canUseAsInput(selectedNodeType, node.nodeType));
    result = result.filter((node) => indicatorTypesMatch(selectedPrototype.indicatorTypes, node.indicatorTypes));

    if (inputLimit > 0 && form.inputs.length >= inputLimit) {
      result = result.filter((node) => form.inputs.includes(node.name));
    }

    return result;
  }, [decoratedNodes, form.inputs, inputLimit, inputsDisabled, selectedNodeType, selectedPrototype]);
  const prototypeGroups = ['MINER', 'PROCESSOR', 'OUTPUT', 'UNKNOWN'].map((nodeType) => ({
    nodeType,
    prototypes: prototypeOptions.filter((prototype) => prototype.nodeType === nodeType),
  })).filter((group) => group.prototypes.length > 0);
  const inputGroups = ['MINER', 'PROCESSOR', 'UNKNOWN'].map((nodeType) => ({
    nodeType,
    nodes: availableInputs.filter((node) => node.nodeType === nodeType),
  })).filter((group) => group.nodes.length > 0);

  const updateNode = useMutation({
    mutationFn: (body: { version: string; name: string; properties: Record<string, unknown> }) => MineMeldApi.updateConfigNode(nodeIndex, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['config', 'full'] });
      navigate('/config');
    },
  });

  const validate = () => {
    const nextErrors: string[] = [];
    const name = form.name.trim();
    if (!currentRow) {
      nextErrors.push('Node not found in candidate config.');
    }
    if (!name) {
      nextErrors.push('Node name is required.');
    } else if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) {
      nextErrors.push('Node name can contain only letters, numbers, underscore, and dash, and must start with a letter or number.');
    } else if (existingNames.has(name)) {
      nextErrors.push('A node with this name already exists in candidate config.');
    }

    if (!form.prototype) {
      nextErrors.push('Prototype is required.');
    } else if (!prototypeByName.has(form.prototype)) {
      nextErrors.push('Selected prototype is not available.');
    }

    const validInputNames = new Set(availableInputs.map((node) => node.name));
    const invalidInputs = form.inputs.filter((input) => !validInputNames.has(input) || input === name);
    if (invalidInputs.length > 0) {
      nextErrors.push(`Invalid input node: ${invalidInputs.join(', ')}`);
    }

    if (inputLimit > 0 && form.inputs.length > inputLimit) {
      nextErrors.push(`Selected prototype allows at most ${inputLimit} input node${inputLimit === 1 ? '' : 's'}.`);
    }

    if (inputLimit === 0 && form.inputs.length > 0) {
      nextErrors.push('Selected prototype does not accept input nodes.');
    }

    return nextErrors;
  };

  const updatePrototype = (prototype: string) => {
    setForm({
      ...form,
      prototype,
      inputs: [],
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (validationErrors.length > 0 || !currentRow) {
      return;
    }

    const output = outputForNodeType(selectedNodeType);
    updateNode.mutate({
      version: currentRow.node.version,
      name: form.name.trim(),
      properties: {
        ...currentRow.node.properties,
        prototype: form.prototype,
        inputs: form.inputs,
        output,
      },
    });
  };

  return (
    <>
      <PageHeader title="Edit Node" description="Update a candidate configuration node. Changes are applied only after commit." />
      <section className="section-block editor-section">
        <div className="section-heading">
          <div>
            <h2>EDIT NODE</h2>
            <p>Adjust the prototype and inputs in the candidate configuration. Node name changes are intentionally disabled to preserve connections.</p>
          </div>
          <StatusBadge label={configQuery.data?.changed ? 'CHANGED' : 'UNCHANGED'} />
        </div>
        {configQuery.isLoading || prototypesQuery.isLoading ? <LoadingState label="Loading configuration" /> : null}
        {configQuery.isError ? <ErrorState error={configQuery.error} /> : null}
        {prototypesQuery.isError ? <ErrorState error={prototypesQuery.error} /> : null}
        {configQuery.isSuccess && !currentRow ? <EmptyState title="Node not found" detail="This candidate config node no longer exists." /> : null}
        {updateNode.error ? <ErrorState error={updateNode.error} /> : null}
        {errors.length > 0 ? (
          <div className="form-error">
            {errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        ) : null}
        {currentRow ? (
          <form className="editor-form" onSubmit={submit}>
            <label>
              Name
              <input value={form.name} readOnly disabled />
            </label>
            <label>
              Prototype
              <select value={form.prototype} disabled={!auth.isReadWrite} onChange={(event) => updatePrototype(event.target.value)}>
                <option value="">Select prototype</option>
                {prototypeGroups.map((group) => (
                  <optgroup key={group.nodeType} label={group.nodeType}>
                    {group.prototypes.map((prototype) => (
                      <option key={prototype.name} value={prototype.name}>{prototype.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="wide-field">
              Inputs
              <select
                multiple
                value={form.inputs}
                disabled={!auth.isReadWrite || inputsDisabled || !selectedPrototype}
                onChange={(event) =>
                  setForm({
                    ...form,
                    inputs: Array.from(event.currentTarget.selectedOptions).map((option) => option.value),
                  })
                }
              >
                {inputGroups.map((group) => (
                  <optgroup key={group.nodeType} label={group.nodeType}>
                    {group.nodes.map((node) => (
                      <option key={node.name} value={node.name}>{node.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {selectedPrototype ? (
              <div className="wide-field legacy-form-note">
                <strong>{selectedPrototype.nodeType}</strong>
                <span>{selectedPrototype.description ?? selectedPrototype.name}</span>
                {selectedPrototype.developmentStatus && selectedPrototype.developmentStatus !== 'STABLE' ? (
                  <span className="form-warning">WARNING: selected prototype is marked as {selectedPrototype.developmentStatus}</span>
                ) : null}
                {inputsDisabled ? <span>Miner prototypes do not accept input nodes.</span> : null}
                {!inputsDisabled && availableInputs.length === 0 ? <span>No suitable input nodes found.</span> : null}
                {inputLimit === 1 ? <span>Output prototypes accept one input node.</span> : null}
              </div>
            ) : null}
            <div className="form-actions wide-field">
              <button className="button primary" type="submit" disabled={!auth.isReadWrite || updateNode.isPending || configQuery.isLoading || prototypesQuery.isLoading}>
                OK
              </button>
              <Link className="button secondary" to="/config">Cancel</Link>
            </div>
          </form>
        ) : null}
      </section>
    </>
  );
}
