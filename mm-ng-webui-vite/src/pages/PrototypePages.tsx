import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { MineMeldApi } from '../api/minemeld';
import { ConfirmModal } from '../components/ConfirmModal';
import { EmptyState, ErrorState, LoadingState } from '../components/DataState';
import { ModalBanner } from '../components/ModalBanner';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/useAuth';
import type { CandidateConfigNode, Prototype, PrototypeLibraries, PrototypePayload, RunningConfigNode } from '../types/minemeld';

function valueList(values: string[] | undefined) {
  if (!values?.length) {
    return <em>None</em>;
  }

  return (
    <div className="label-list">
      {values.map((value) => (
        <span className="node-type-badge neutral" key={value}>
          {value}
        </span>
      ))}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function ConfigValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return value.length ? (
      <ul className="config-list">
        {value.map((item, index) => (
          <li key={index}>
            <ConfigValue value={item} />
          </li>
        ))}
      </ul>
    ) : (
      <em>empty</em>
    );
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    return entries.length ? (
      <dl className="config-object">
        {entries.map(([key, child]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>
              <ConfigValue value={child} />
            </dd>
          </div>
        ))}
      </dl>
    ) : (
      <em>empty</em>
    );
  }

  if (value === null || typeof value === 'undefined') {
    return <em>null</em>;
  }

  return <span>{typeof value === 'boolean' ? String(value) : String(value)}</span>;
}

function prototypeNodeType(prototype: Prototype) {
  return prototype.node_type ?? prototype.nodeType;
}

function prototypeDevelopmentStatus(prototype: Prototype) {
  return prototype.development_status ?? prototype.developmentStatus;
}

function prototypeIndicatorTypes(prototype: Prototype) {
  return prototype.indicator_types ?? prototype.indicatorTypes;
}

function findPrototype(prototypes: PrototypeLibraries | undefined, prototypeName: string | undefined) {
  if (!prototypeName) {
    return undefined;
  }

  const [libraryName, ...prototypeParts] = prototypeName.split('.');
  return prototypes?.[libraryName]?.prototypes?.[prototypeParts.join('.')];
}

function nodeTypeFromPrototype(prototype: Prototype | undefined, node?: RunningConfigNode | CandidateConfigNode['properties']) {
  const fromPrototype = prototype ? prototypeNodeType(prototype) : undefined;
  if (fromPrototype === 'miner' || fromPrototype === 'processor' || fromPrototype === 'output') {
    return fromPrototype;
  }

  const configured = `${node?.node_type ?? node?.nodeType ?? ''}`;
  if (configured === 'miner' || configured === 'processor' || configured === 'output') {
    return configured;
  }

  if (node?.output === false) {
    return 'output';
  }

  return Array.isArray(node?.inputs) && node.inputs.length > 0 ? 'processor' : 'miner';
}

function emptyPrototypeUsage() {
  return {
    miners: [] as string[],
    aggregates: [] as string[],
    outputs: [] as string[],
  };
}

function addPrototypeUsage(usage: ReturnType<typeof emptyPrototypeUsage>, nodeName: string, nodeType: string) {
  if (nodeType === 'output') {
    usage.outputs.push(nodeName);
  } else if (nodeType === 'processor') {
    usage.aggregates.push(nodeName);
  } else {
    usage.miners.push(nodeName);
  }
}

function prototypeUsageCount(usage: ReturnType<typeof emptyPrototypeUsage>) {
  return usage.miners.length + usage.aggregates.length + usage.outputs.length;
}

function PrototypeUsageSummary({ usage }: { usage: ReturnType<typeof emptyPrototypeUsage> }) {
  const sections = [
    ['Miners', usage.miners],
    ['Aggregates', usage.aggregates],
    ['Outputs', usage.outputs],
  ] as const;
  const total = prototypeUsageCount(usage);

  if (total === 0) {
    return <p>This prototype is not used by current running or candidate nodes.</p>;
  }

  return (
    <div className="usage-summary">
      <p>This prototype is used and cannot be deleted until those nodes are changed or removed.</p>
      {sections.map(([label, names]) => (
        <div key={label}>
          <strong>{label}</strong>
          <span>{names.length ? names.join(', ') : 'none'}</span>
        </div>
      ))}
    </div>
  );
}

function parseList(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

type PrototypeFormState = {
  name: string;
  className: string;
  nodeType: string;
  developmentStatus: string;
  indicatorTypes: string;
  tags: string;
  description: string;
  config: string;
};

function scalarToYaml(value: unknown) {
  if (typeof value === 'string') {
    if (value === '' || /[:#\n\r{}\[\],&*?|<>=!%@`]/.test(value) || /^\s|\s$/.test(value)) {
      return JSON.stringify(value);
    }
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value === null || typeof value === 'undefined') {
    return 'null';
  }

  return JSON.stringify(value);
}

function valueToYaml(value: unknown, depth = 0): string {
  const indent = '  '.repeat(depth);
  const childIndent = '  '.repeat(depth + 1);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }

    return value
      .map((item) => {
        if (isRecord(item) || Array.isArray(item)) {
          return `${indent}-\n${valueToYaml(item, depth + 1)}`;
        }
        return `${indent}- ${scalarToYaml(item)}`;
      })
      .join('\n');
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return '{}';
    }

    return entries
      .map(([key, child]) => {
        if (isRecord(child) || Array.isArray(child)) {
          return `${indent}${key}:\n${valueToYaml(child, depth + 1)}`;
        }
        return `${indent}${key}: ${scalarToYaml(child)}`;
      })
      .join('\n');
  }

  return `${childIndent}${scalarToYaml(value)}`;
}

function prototypeToForm(name: string, prototype: Prototype): PrototypeFormState {
  return {
    name,
    className: prototype.class,
    nodeType: prototypeNodeType(prototype) ?? 'miner',
    developmentStatus: prototypeDevelopmentStatus(prototype) ?? 'STABLE',
    indicatorTypes: prototypeIndicatorTypes(prototype)?.join(', ') ?? 'IPv4',
    tags: prototype.tags?.join(', ') ?? '',
    description: prototype.description ?? '',
    config: typeof prototype.config === 'undefined' ? '{}' : valueToYaml(prototype.config),
  };
}

function prototypeFormErrors(form: PrototypeFormState, existing: Set<string>, currentFullName?: string) {
  const errors: string[] = [];
  const shortName = form.name.trim();
  const fullName = `minemeldlocal.${shortName}`;

  if (!shortName) {
    errors.push('Prototype name is required.');
  } else if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(shortName)) {
    errors.push('Prototype name can contain only letters, numbers, underscore, and dash, and must start with a letter or number.');
  } else if (existing.has(fullName) && fullName !== currentFullName) {
    errors.push('A local prototype with this name already exists.');
  }

  if (!form.className.trim()) {
    errors.push('Class is required.');
  } else if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(form.className.trim())) {
    errors.push('Class must be a dotted Python class path.');
  }

  if (!['miner', 'processor', 'output'].includes(form.nodeType)) {
    errors.push('Node type must be miner, processor, or output.');
  }

  if (!['STABLE', 'EXPERIMENTAL', 'DEPRECATED'].includes(form.developmentStatus)) {
    errors.push('Development status must be STABLE, EXPERIMENTAL, or DEPRECATED.');
  }

  if (parseList(form.indicatorTypes).length === 0) {
    errors.push('At least one indicator type is required.');
  }

  if (form.config.trim() && !/^[\s\S]*:\s*[\s\S]*$/.test(form.config) && form.config.trim() !== '{}') {
    errors.push('Config must be YAML-style key/value content or {}.');
  }

  return errors;
}

function PrototypeEditorForm({
  form,
  setForm,
  disabled,
  pending,
  submitLabel,
  onSubmit,
  lockName = false,
}: {
  form: PrototypeFormState;
  setForm: (form: PrototypeFormState) => void;
  disabled: boolean;
  pending: boolean;
  submitLabel: string;
  onSubmit: (event: FormEvent) => void;
  lockName?: boolean;
}) {
  return (
    <form className="editor-form" onSubmit={onSubmit}>
      <label>
        Prototype name
        <span className="input-prefix">
          <span>minemeldlocal.</span>
          <input value={form.name} disabled={disabled || lockName} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </span>
      </label>
      <label>
        Class
        <input value={form.className} placeholder="minemeld.ft.http.HttpFT" disabled={disabled} onChange={(event) => setForm({ ...form, className: event.target.value })} />
      </label>
      <label>
        Node type
        <select value={form.nodeType} disabled={disabled} onChange={(event) => setForm({ ...form, nodeType: event.target.value })}>
          <option value="miner">Miner</option>
          <option value="processor">Processor</option>
          <option value="output">Output</option>
        </select>
      </label>
      <label>
        Development status
        <select value={form.developmentStatus} disabled={disabled} onChange={(event) => setForm({ ...form, developmentStatus: event.target.value })}>
          <option value="STABLE">STABLE</option>
          <option value="EXPERIMENTAL">EXPERIMENTAL</option>
          <option value="DEPRECATED">DEPRECATED</option>
        </select>
      </label>
      <label>
        Indicator types
        <input value={form.indicatorTypes} placeholder="IPv4, URL, domain" disabled={disabled} onChange={(event) => setForm({ ...form, indicatorTypes: event.target.value })} />
      </label>
      <label>
        Tags
        <input value={form.tags} placeholder="ShareLevelGreenConfidenceHigh" disabled={disabled} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
      </label>
      <label className="wide-field">
        Description
        <textarea value={form.description} rows={3} disabled={disabled} onChange={(event) => setForm({ ...form, description: event.target.value })} />
      </label>
      <label className="wide-field">
        Config YAML
        <textarea value={form.config} rows={12} disabled={disabled} onChange={(event) => setForm({ ...form, config: event.target.value })} />
      </label>
      <div className="form-actions wide-field">
        <button className="button primary" type="submit" disabled={disabled || pending}>
          {submitLabel}
        </button>
        <Link className="button secondary" to="/prototypes">Cancel</Link>
      </div>
    </form>
  );
}

export function PrototypesPage() {
  const prototypesQuery = useQuery({ queryKey: ['prototype'], queryFn: MineMeldApi.prototypes });
  const libraries = Object.entries(prototypesQuery.data ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <PageHeader
        title="Prototypes"
        description="Prototype libraries remain the source for creating and understanding MineMeld nodes."
        actions={<Link className="button primary" to="/prototypeadd">Add prototype</Link>}
      />
      <section className="section-block">
        {prototypesQuery.isLoading ? <LoadingState /> : null}
        {prototypesQuery.isError ? <ErrorState error={prototypesQuery.error} /> : null}
        {prototypesQuery.isSuccess && libraries.length === 0 ? <EmptyState title="No prototype libraries found" /> : null}
        {libraries.map(([libraryName, library]) => {
          const prototypes = Object.entries(library.prototypes ?? {}).sort(([a], [b]) => a.localeCompare(b));
          return (
            <div className="library-block" key={libraryName}>
              <div className="section-heading">
                <div>
                  <h2>{libraryName}</h2>
                  {library.description ? <p>{library.description}</p> : null}
                </div>
                <span className="count-label">{prototypes.length} prototypes</span>
              </div>
              <div className="item-grid">
                {prototypes.map(([prototypeName, prototype]) => (
                  <Link
                    className="item-card"
                    key={`${libraryName}.${prototypeName}`}
                    to={`/prototypes/${encodeURIComponent(libraryName)}/${encodeURIComponent(prototypeName)}`}
                  >
                    <strong>{prototypeName}</strong>
                    <span>{prototype.nodeType ?? prototype.node_type ?? 'node'}</span>
                    <small>{prototype.description ?? prototype.class}</small>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}

export function PrototypeDetailPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { libraryName = '', prototypeName = '' } = useParams();
  const decodedLibrary = decodeURIComponent(libraryName);
  const decodedPrototype = decodeURIComponent(prototypeName);
  const prototypesQuery = useQuery({ queryKey: ['prototype'], queryFn: MineMeldApi.prototypes });
  const runningConfigQuery = useQuery({ queryKey: ['config', 'running'], queryFn: MineMeldApi.runningConfig });
  const candidateConfigQuery = useQuery({ queryKey: ['config', 'full'], queryFn: MineMeldApi.fullConfig });
  const library = prototypesQuery.data?.[decodedLibrary];
  const prototype = library?.prototypes?.[decodedPrototype];
  const nodeType = prototype ? prototypeNodeType(prototype) : undefined;
  const developmentStatus = prototype ? prototypeDevelopmentStatus(prototype) : undefined;
  const fqpn = `${decodedLibrary}.${decodedPrototype}`;
  const canEdit = auth.isReadWrite && decodedLibrary === 'minemeldlocal';
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message?: string } | null>(null);
  const usage = useMemo(() => {
    const result = emptyPrototypeUsage();

    Object.entries(runningConfigQuery.data?.nodes ?? {}).forEach(([nodeName, node]) => {
      if (node.prototype !== fqpn) {
        return;
      }

      addPrototypeUsage(result, nodeName, nodeTypeFromPrototype(findPrototype(prototypesQuery.data, node.prototype), node));
    });

    (candidateConfigQuery.data?.nodes ?? []).forEach((node) => {
      if (!node || node.deleted || node.properties?.prototype !== fqpn) {
        return;
      }

      addPrototypeUsage(result, node.name, nodeTypeFromPrototype(findPrototype(prototypesQuery.data, String(node.properties.prototype)), node.properties));
    });

    result.miners = Array.from(new Set(result.miners)).sort((a, b) => a.localeCompare(b));
    result.aggregates = Array.from(new Set(result.aggregates)).sort((a, b) => a.localeCompare(b));
    result.outputs = Array.from(new Set(result.outputs)).sort((a, b) => a.localeCompare(b));

    return result;
  }, [candidateConfigQuery.data, fqpn, prototypesQuery.data, runningConfigQuery.data]);
  const usageCount = prototypeUsageCount(usage);
  const deletePrototype = useMutation({
    mutationFn: () => MineMeldApi.deletePrototype(fqpn),
    onSuccess: async () => {
      setNotice({ title: 'Prototype deleted', message: `${fqpn} was removed from minemeldlocal.` });
      setDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['prototype'] });
      window.setTimeout(() => navigate('/prototypes'), 900);
    },
  });

  return (
    <>
      <PageHeader
        title={fqpn}
        eyebrow="Prototype"
        description={prototype?.description ?? 'Prototype detail'}
        actions={(
          <>
            {canEdit ? (
              <Link className="button primary" to={`/prototypes/${encodeURIComponent(decodedLibrary)}/${encodeURIComponent(decodedPrototype)}/edit`}>
                Edit prototype
              </Link>
            ) : null}
            {canEdit ? (
              <button className="button danger" type="button" onClick={() => setDeleteOpen(true)}>
                Delete prototype
              </button>
            ) : null}
            <Link className="button secondary" to="/prototypes">Back to Prototypes</Link>
          </>
        )}
      />
      {notice ? <ModalBanner title={notice.title} message={notice.message} onClose={() => setNotice(null)} /> : null}
      {prototypesQuery.isLoading ? <LoadingState /> : null}
      {prototypesQuery.isError ? <ErrorState error={prototypesQuery.error} /> : null}
      {runningConfigQuery.isError ? <ErrorState error={runningConfigQuery.error} /> : null}
      {candidateConfigQuery.isError ? <ErrorState error={candidateConfigQuery.error} /> : null}
      {deletePrototype.error ? <ErrorState error={deletePrototype.error} /> : null}
      {prototypesQuery.isSuccess && !prototype ? <EmptyState title="Prototype not found" /> : null}
      {prototype ? (
        <>
          <section className="prototype-status-line">
            {nodeType ? <span className={`node-type-badge ${nodeType === 'processor' ? 'aggregate' : nodeType}`}>{nodeType.toUpperCase()}</span> : null}
            {developmentStatus ? (
              <span className={`status-badge ${developmentStatus === 'STABLE' ? 'good' : 'bad'}`}>
                {developmentStatus}
              </span>
            ) : null}
          </section>
          <section className="section-block prototype-detail">
            {library?.description || library?.url ? (
              <div className="prototypedetail-section">
                <h2>About {decodedLibrary}</h2>
                {library.description ? <p>{library.description}</p> : null}
                {library.url ? (
                  <p>
                    For more details: <a className="text-link" href={library.url}>{library.url}</a>
                  </p>
                ) : null}
              </div>
            ) : null}
            {prototype.description ? (
              <div className="prototypedetail-section">
                <h2>About {fqpn}</h2>
                <p>{prototype.description}</p>
              </div>
            ) : null}
            {prototype.author ? (
              <div className="prototypedetail-section">
                <h2>Author</h2>
                <p>{prototype.author}</p>
              </div>
            ) : null}
            <div className="prototypedetail-section">
              <h2>Class</h2>
              <p>{prototype.class}</p>
            </div>
            <div className="prototypedetail-section">
              <h2>Indicator Types</h2>
              {valueList(prototypeIndicatorTypes(prototype))}
            </div>
            <div className="prototypedetail-section">
              <h2>Tags</h2>
              {valueList(prototype.tags)}
            </div>
            {typeof prototype.config !== 'undefined' ? (
              <div className="prototypedetail-section">
                <h2>Config</h2>
                <div className="config-panel">
                  <ConfigValue value={prototype.config} />
                </div>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
      {deleteOpen ? (
        <ConfirmModal
          title="Delete prototype"
          pending={deletePrototype.isPending}
          confirmDisabled={usageCount > 0 || runningConfigQuery.isLoading || candidateConfigQuery.isLoading}
          onConfirm={() => deletePrototype.mutate()}
          onCancel={() => setDeleteOpen(false)}
        >
          <p>
            Delete <strong>{fqpn}</strong>?
          </p>
          <PrototypeUsageSummary usage={usage} />
        </ConfirmModal>
      ) : null}
    </>
  );
}

export function PrototypeAddPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const prototypesQuery = useQuery({ queryKey: ['prototype'], queryFn: MineMeldApi.prototypes });
  const [form, setForm] = useState<PrototypeFormState>({
    name: '',
    className: '',
    nodeType: 'miner',
    developmentStatus: 'STABLE',
    indicatorTypes: 'IPv4',
    tags: '',
    description: '',
    config: '{}',
  });
  const [errors, setErrors] = useState<string[]>([]);

  const existingLocalPrototypes = new Set(
    Object.keys(prototypesQuery.data?.minemeldlocal?.prototypes ?? {}).map((name) => `minemeldlocal.${name}`),
  );

  const createPrototype = useMutation({
    mutationFn: (payload: { name: string; body: PrototypePayload }) => MineMeldApi.createPrototype(payload.name, payload.body),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['prototype'] });
      navigate(`/prototypes/minemeldlocal/${encodeURIComponent(variables.name.replace(/^minemeldlocal\./, ''))}`);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const validationErrors = prototypeFormErrors(form, existingLocalPrototypes);
    setErrors(validationErrors);
    if (validationErrors.length > 0) {
      return;
    }

    const prototypeName = `minemeldlocal.${form.name.trim()}`;
    createPrototype.mutate({
      name: prototypeName,
      body: {
        class: form.className.trim(),
        config: form.config.trim() || '{}',
        developmentStatus: form.developmentStatus,
        nodeType: form.nodeType,
        description: form.description.trim() || undefined,
        indicatorTypes: parseList(form.indicatorTypes),
        tags: parseList(form.tags),
      },
    });
  };

  return (
    <>
      <PageHeader title="Add Prototype" description="Create a local prototype in minemeldlocal using the existing MineMeld prototype API." />
      <section className="section-block editor-section">
        <div className="section-heading">
          <div>
            <h2>Local prototype</h2>
            <p>Saved as minemeldlocal.&lt;name&gt; and available immediately for candidate node creation.</p>
          </div>
        </div>
        {prototypesQuery.isLoading ? <LoadingState label="Loading prototypes" /> : null}
        {prototypesQuery.isError ? <ErrorState error={prototypesQuery.error} /> : null}
        {createPrototype.error ? <ErrorState error={createPrototype.error} /> : null}
        {errors.length > 0 ? (
          <div className="form-error">
            {errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        ) : null}
        <PrototypeEditorForm
          form={form}
          setForm={setForm}
          disabled={!auth.isReadWrite || prototypesQuery.isLoading}
          pending={createPrototype.isPending}
          submitLabel="Create prototype"
          onSubmit={submit}
        />
      </section>
    </>
  );
}

export function PrototypeEditPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { libraryName = '', prototypeName = '' } = useParams();
  const decodedLibrary = decodeURIComponent(libraryName);
  const decodedPrototype = decodeURIComponent(prototypeName);
  const prototypesQuery = useQuery({ queryKey: ['prototype'], queryFn: MineMeldApi.prototypes });
  const prototype = prototypesQuery.data?.[decodedLibrary]?.prototypes?.[decodedPrototype];
  const [form, setForm] = useState<PrototypeFormState>({
    name: decodedPrototype,
    className: '',
    nodeType: 'miner',
    developmentStatus: 'STABLE',
    indicatorTypes: 'IPv4',
    tags: '',
    description: '',
    config: '{}',
  });
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (prototype) {
      setForm(prototypeToForm(decodedPrototype, prototype));
    }
  }, [decodedPrototype, prototype]);

  const existingLocalPrototypes = useMemo(
    () => new Set(
      Object.keys(prototypesQuery.data?.minemeldlocal?.prototypes ?? {}).map((name) => `minemeldlocal.${name}`),
    ),
    [prototypesQuery.data],
  );

  const savePrototype = useMutation({
    mutationFn: (payload: { name: string; body: PrototypePayload }) => MineMeldApi.createPrototype(payload.name, payload.body),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['prototype'] });
      navigate(`/prototypes/minemeldlocal/${encodeURIComponent(variables.name.replace(/^minemeldlocal\./, ''))}`);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const prototypeFullName = `minemeldlocal.${decodedPrototype}`;
    const validationErrors = prototypeFormErrors(form, existingLocalPrototypes, prototypeFullName);
    setErrors(validationErrors);
    if (validationErrors.length > 0 || decodedLibrary !== 'minemeldlocal') {
      return;
    }

    savePrototype.mutate({
      name: prototypeFullName,
      body: {
        class: form.className.trim(),
        config: form.config.trim() || '{}',
        developmentStatus: form.developmentStatus,
        nodeType: form.nodeType,
        description: form.description.trim() || undefined,
        indicatorTypes: parseList(form.indicatorTypes),
        tags: parseList(form.tags),
      },
    });
  };

  const editable = decodedLibrary === 'minemeldlocal';

  return (
    <>
      <PageHeader
        title={`${decodedLibrary}.${decodedPrototype}`}
        eyebrow="Edit Prototype"
        description={editable ? 'Update a local prototype in minemeldlocal.' : 'Only local prototypes can be edited.'}
        actions={<Link className="button secondary" to={`/prototypes/${encodeURIComponent(decodedLibrary)}/${encodeURIComponent(decodedPrototype)}`}>Back to Prototype</Link>}
      />
      <section className="section-block editor-section">
        <div className="section-heading">
          <div>
            <h2>Local prototype</h2>
            <p>Changes are saved to the local prototype library. Existing nodes continue to use the updated prototype after the normal config workflow.</p>
          </div>
        </div>
        {prototypesQuery.isLoading ? <LoadingState label="Loading prototype" /> : null}
        {prototypesQuery.isError ? <ErrorState error={prototypesQuery.error} /> : null}
        {prototypesQuery.isSuccess && !prototype ? <EmptyState title="Prototype not found" /> : null}
        {prototypesQuery.isSuccess && prototype && !editable ? <ErrorState error="Only minemeldlocal prototypes can be edited." /> : null}
        {savePrototype.error ? <ErrorState error={savePrototype.error} /> : null}
        {errors.length > 0 ? (
          <div className="form-error">
            {errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        ) : null}
        {prototype && editable ? (
          <PrototypeEditorForm
            form={form}
            setForm={setForm}
            disabled={!auth.isReadWrite || prototypesQuery.isLoading}
            pending={savePrototype.isPending}
            submitLabel="Save prototype"
            onSubmit={submit}
            lockName
          />
        ) : null}
      </section>
    </>
  );
}
