import { FormEvent, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError, FieldErrors } from '../api';
import { useApp } from '../app';
import { fmtDate, Loading, useApi, useDebounced, useTitle } from '../lib';
import './panel.css';

interface Section { key: string; title: string; icon: string; queue: boolean }
interface Row { id: number; cells: string[]; status: string | null; links: Links }
interface Links { wa?: string; tel?: string; track?: string; receipt?: string; card?: string }
interface FilterDef { name: string; label: string; options: { value: string; label: string }[] }
interface ListData {
  title: string; heads: string[]; queue: boolean; filters: FilterDef[]; date: boolean; actions: { key: string; label: string }[];
  exportable: boolean; rows: Row[]; page: number; pages: number; count: number; can_create: boolean;
}
interface Field { name: string; label: string; type: string; required: boolean; help: string; value: string | boolean; choices: { value: string; label: string }[] | null }
interface DetailData {
  title: string; label: string; fields: Field[]; details: { label: string; value: string }[]; doc_url: string | null; links: Links;
  can_delete: boolean; can_timeline: boolean; status_choices: { value: string; label: string }[];
  timeline: { id: number; status: string; title: string; description: string; created_at: string }[];
}

const base = (key: string) => `/panel/${key}`;
const TONE: Record<string, string> = {
  Pending: 'warning', 'Under Review': 'purple', Processing: 'info', 'Information Required': 'orange', Completed: 'success', Cancelled: 'secondary',
  Approved: 'success', Active: 'success', Answered: 'primary', Closed: 'secondary', Received: 'warning', 'Action Required': 'orange',
  Escalated: 'danger', Resolved: 'success',
};
const Badge = ({ text }: { text: string }) => <span className={`panel-badge tone-${TONE[text] ?? 'secondary'}`}>{text}</span>;

function QuickLinks({ links }: { links: Links }) {
  return (
    <span className="d-inline-flex gap-1">
      {links.wa && <a className="panel-qa wa" href={links.wa} target="_blank" rel="noreferrer" title="WhatsApp"><i className="bi bi-whatsapp"></i></a>}
      {links.tel && <a className="panel-qa tel" href={links.tel} title="Call"><i className="bi bi-telephone-fill"></i></a>}
      {links.receipt && <Link className="panel-qa rc" to={links.receipt} target="_blank" title="Receipt"><i className="bi bi-file-earmark-text"></i></Link>}
      {links.track && <Link className="panel-qa tr" to={links.track} target="_blank" title="Tracking page"><i className="bi bi-box-arrow-up-right"></i></Link>}
      {links.card && <Link className="panel-qa rc" to={links.card} target="_blank" title="Membership card"><i className="bi bi-person-badge"></i></Link>}
    </span>
  );
}

export function PanelLayout() {
  const { user, ready, setUser, notify } = useApp();
  const navigate = useNavigate();
  const { data } = useApi<{ sections: Section[] }>(user?.is_staff ? 'panel/meta/' : null);
  useTitle('HOMline Panel');
  if (!ready) return null;
  if (!user) return <Navigate to="/login?next=/panel" replace />;
  if (!user.is_staff) return <div className="container py-5 text-center"><h1 className="h3 fw-bold">Staff access only</h1><Link to="/" className="btn btn-teal mt-3">Go to site</Link></div>;
  const sections = data?.sections ?? [];
  const logout = async () => {
    try {
      await api('auth/logout/', { method: 'POST', body: {} });
    } catch {
      // Ensure client state is cleared even if network fails
    }
    setUser(null);
    notify('Logged out successfully.', 'success');
    navigate('/', { replace: true });
  };
  const item = (s: Section) => <NavLink key={s.key} to={base(s.key)} className={({ isActive }) => (isActive ? 'on' : '')}><i className={`bi ${s.icon}`}></i> {s.title}</NavLink>;
  return (
    <div className="panel-root d-flex panel-shell">
      <nav className="panel-side pb-3">
        <div className="px-3 py-3 text-white fw-bold fs-5">
          <i className="bi bi-shield-check"></i> HOMline Panel
          <div className="small fw-normal text-secondary">{user.is_superuser ? 'Admin' : 'Staff'} · {user.username}</div>
        </div>
        <NavLink to="/panel" end className={({ isActive }) => (isActive ? 'on' : '')}><i className="bi bi-speedometer2"></i> Overview</NavLink>
        <h6>Work queues</h6>
        {sections.filter((s) => s.queue).map(item)}
        {user.is_superuser && (
          <>
            <h6>Site content</h6>
            {sections.filter((s) => !s.queue).map(item)}
            <h6>Admin</h6>
            <NavLink to="/panel/users" className={({ isActive }) => (isActive ? 'on' : '')}><i className="bi bi-people"></i> Users</NavLink>
          </>
        )}
        <h6>Site</h6>
        <a href="/" target="_blank" rel="noreferrer"><i className="bi bi-box-arrow-up-right"></i> View website</a>
        <Link to="/dashboard"><i className="bi bi-person"></i> My account</Link>
        <button className="link text-danger" onClick={logout}><i className="bi bi-box-arrow-right"></i> Logout</button>
      </nav>
      <main className="flex-grow-1 p-3 p-lg-4" style={{ minWidth: 0 }}><Outlet /></main>
    </div>
  );
}

export function PanelHome() {
  const [q, setQ] = useState('');
  const applied = useDebounced(q.trim());
  const { data } = useApi<{ stats: { key: string; title: string; icon: string; open: number; total: number }[]; by_status: Record<string, number>; recent: any[] }>(`panel/overview/?q=${encodeURIComponent(applied)}`);
  if (!data) return <Loading />;
  return (
    <>
      <h1 className="h4 fw-bold mb-3">Overview</h1>
      <div className="d-flex flex-wrap gap-2 mb-3">
        {Object.entries(data.by_status).map(([s, n]) => (
          <Link key={s} to={`/panel/requests?status=${encodeURIComponent(s)}`} className="text-decoration-none"><Badge text={`${s}: ${n}`} /></Link>
        ))}
      </div>
      <div className="row g-3 mb-4">
        {data.stats.map((s) => (
          <div className="col-6 col-xl-4" key={s.key}>
            <Link className="panel-stat card p-3 d-block" to={base(s.key)}>
              <div className="d-flex justify-content-between text-muted small"><span>{s.title}</span><i className={`bi ${s.icon}`}></i></div>
              <div className="fs-2 fw-bold">{s.open} <span className="fs-6 fw-normal text-muted">open / {s.total} total</span></div>
            </Link>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-header bg-white d-flex flex-wrap gap-2 justify-content-between align-items-center">
          <strong>Latest service requests</strong>
          <input className="form-control form-control-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, name, mobile, service…" aria-label="Search recent requests" style={{ minWidth: 240, maxWidth: 320 }} />
          <Link className="small" to="/panel/requests">View all</Link>
        </div>
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead><tr><th>ID</th><th>Customer</th><th>Service</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {data.recent.map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/panel/requests/${r.id}`}>{r.request_id}</Link></td>
                  <td>{r.full_name}<div className="small text-muted">{r.mobile}</div></td>
                  <td>{r.service}</td>
                  <td><Badge text={r.status} /></td>
                  <td className="small">{fmtDate(r.created_at, true)}</td>
                </tr>
              ))}
              {!data.recent.length && <tr><td colSpan={5} className="text-center text-muted py-4">{applied ? `No requests match "${applied}".` : 'No requests yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function PanelList() {
  const { key = '' } = useParams();
  const { notify } = useApp();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const [selected, setSelected] = useState<number[]>([]);
  const [action, setAction] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => { setText(params.get('q') ?? ''); }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSelected([]); }, [key, params]);
  const typed = useDebounced(text.trim());
  useEffect(() => {
    if (typed !== (params.get('q') ?? '')) set({ q: typed });
  }, [typed]);   // eslint-disable-line react-hooks/exhaustive-deps
  const qs = params.toString();
  const exportQs = (() => { const p = new URLSearchParams(params); p.delete('page'); return p.toString(); })();
  const { data, error, loading } = useApi<ListData>(`panel/${key}/?${qs}&v=${version}`);
  const set = (patch: Record<string, string>) => {
    const p = new URLSearchParams(params);
    Object.entries({ page: '', ...patch }).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    setParams(p, { replace: true });
  };
  useTitle(data ? `${data.title} · HOMline Panel` : 'HOMline Panel');
  if (error) return <div className="alert alert-danger">{error.status === 403 ? 'You do not have access to this section.' : error.message}</div>;
  if (!data || (loading && !data)) return <Loading />;

  const allOnPage = data.rows.length > 0 && data.rows.every((r) => selected.includes(r.id));
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const run = async () => {
    if (!action || !selected.length) return;
    if (action === 'delete' && !confirm(`Delete ${selected.length} item(s) permanently?`)) return;
    try {
      const d = await api<{ message: string }>(`panel/${key}/bulk/`, { body: { ids: selected, action } });
      notify(d.message);
      setSelected([]);
      setAction('');
      setVersion((v) => v + 1);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Action failed.', 'danger');
    }
  };
  const hasFilters = data.filters.length > 0 || data.date;
  const editPath = (id: number) => `${base(key)}/${id}`;

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 className="h4 fw-bold mb-0">{data.title} <span className="text-muted fs-6">({data.count})</span></h1>
        <div className="d-flex gap-2">
          {data.exportable && <a className="btn btn-outline-secondary btn-sm" href={`/api/panel/${key}/export/?${exportQs}`}><i className="bi bi-filetype-csv"></i> Export CSV</a>}
          {data.can_create && <Link className="btn btn-primary btn-sm" to={`${base(key)}/new`}><i className="bi bi-plus-lg"></i> Add</Link>}
        </div>
      </div>

      <div className="mb-2 position-relative">
        <input className="form-control" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search — results update as you type" aria-label="Search" />
        {loading && <span className="spinner-border spinner-border-sm text-secondary position-absolute" style={{ right: 40, top: 10 }} aria-hidden="true"></span>}
      </div>
      {hasFilters && (
        <div className="panel-filters d-flex flex-wrap gap-3 mb-3 align-items-center">
          {data.filters.map((f) => (
            <select
              key={f.name}
              className="form-select form-select-sm w-auto panel-filter-select"
              aria-label={f.label}
              value={params.get(f.name) ?? ''}
              onChange={(e) => set({ [f.name]: e.target.value })}
            >
              <option value="">{f.label}: all</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
          {data.date && (
            <div className="d-flex flex-wrap align-items-center gap-3">
              <label className="small text-muted d-inline-flex align-items-center gap-2">
                <span>From</span>
                <input
                  type="date"
                  className="form-control form-control-sm d-inline-block w-auto panel-date-input"
                  value={params.get('date_from') ?? ''}
                  onChange={(e) => set({ date_from: e.target.value })}
                />
              </label>
              <label className="small text-muted d-inline-flex align-items-center gap-2">
                <span>To</span>
                <input
                  type="date"
                  className="form-control form-control-sm d-inline-block w-auto panel-date-input"
                  value={params.get('date_to') ?? ''}
                  onChange={(e) => set({ date_to: e.target.value })}
                />
              </label>
            </div>
          )}
          {[...params.keys()].some((k) => k !== 'page') && (
            <button className="btn btn-link btn-sm text-decoration-none" onClick={() => { setText(''); setParams({}, { replace: true }); }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {data.actions.length > 0 && (
        <div className="panel-bulk d-flex flex-wrap align-items-center gap-2 mb-2">
          <span className="small text-muted">{selected.length} of {data.rows.length} selected</span>
          <select className="form-select form-select-sm w-auto panel-filter-select" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Bulk action">
            <option value="">Action…</option>
            {data.actions.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
          <button className="btn btn-sm btn-dark" disabled={!action || !selected.length} onClick={run}>Run</button>
        </div>
      )}

      <div className="card" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead>
              <tr>
                {data.actions.length > 0 && <th style={{ width: 32 }}><input type="checkbox" className="form-check-input" aria-label="Select all" checked={allOnPage} onChange={() => setSelected(allOnPage ? [] : data.rows.map((r) => r.id))} /></th>}
                {data.heads.map((h) => <th key={h}>{h}</th>)}
                {data.queue && <th>Follow up</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className={selected.includes(r.id) ? 'table-active' : ''}>
                  {data.actions.length > 0 && <td><input type="checkbox" className="form-check-input" aria-label="Select row" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} /></td>}
                  {r.cells.map((c, i) => (
                    <td key={i} className={i === 0 ? 'fw-semibold' : ''} style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.status && c === r.status ? <Badge text={c} /> : c.length > 70 ? c.slice(0, 69) + '…' : c}
                    </td>
                  ))}
                  {data.queue && <td><QuickLinks links={r.links} /></td>}
                  <td className="text-end"><Link className="btn btn-sm btn-outline-primary" to={editPath(r.id)}>Open</Link></td>
                </tr>
              ))}
              {!data.rows.length && <tr><td colSpan={data.heads.length + 3} className="text-center text-muted py-4">Nothing here.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {data.pages > 1 && (
        <nav className="d-flex justify-content-between align-items-center mt-3 small">
          <span>Page {data.page} of {data.pages}</span>
          <span className="d-flex gap-2">
            {data.page > 1 && <button className="btn btn-sm btn-outline-secondary" onClick={() => set({ page: String(data.page - 1) })}>Prev</button>}
            {data.page < data.pages && <button className="btn btn-sm btn-outline-secondary" onClick={() => set({ page: String(data.page + 1) })}>Next</button>}
          </span>
        </nav>
      )}
    </>
  );
}

function FieldInput({ f, value, onChange }: { f: Field; value: string | boolean; onChange: (v: string | boolean) => void }) {
  const id = `pf-${f.name}`;
  if (f.type === 'checkbox') return <input id={id} name={f.name} type="checkbox" className="form-check-input" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
  if (f.type === 'select') {
    return (
      <select id={id} name={f.name} className="form-select" value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {f.choices!.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
    );
  }
  if (f.type === 'file') return <input id={id} name={f.name} type="file" className="form-control" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" />;
  if (f.type === 'textarea') return <textarea id={id} name={f.name} className="form-control" rows={4} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
  return <input id={id} name={f.name} className="form-control" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'password' ? 'password' : 'text'} value={String(value)} onChange={(e) => onChange(e.target.value)} autoComplete={f.type === 'password' ? 'new-password' : undefined} />;
}

function TimelineBox({ data, id, reload, isAdmin }: { data: DetailData; id: string; reload: () => void; isAdmin: boolean }) {
  const [err, setErr] = useState('');
  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setErr('');
    try {
      await api(`panel/requests/${id}/timeline/`, { body: { title: f.get('title'), status: f.get('status'), description: f.get('description') } });
      form.reset();
      reload();
    } catch (er) {
      setErr(er instanceof ApiError ? er.message : 'Could not add entry.');
    }
  };
  const del = async (logId: number) => {
    if (!confirm('Delete this timeline entry?')) return;
    await api(`panel/requests/${id}/timeline/${logId}/`, { method: 'DELETE' });
    reload();
  };
  return (
    <div className="card p-3 mt-3">
      <h2 className="h6 fw-bold">Timeline <span className="text-muted fw-normal small">(customers see these on the tracker)</span></h2>
      {data.timeline.map((l) => (
        <div key={l.id} className="small border-top py-2 d-flex justify-content-between gap-2">
          <span><Badge text={l.status} /> <strong>{l.title}</strong> <span className="text-muted">· {fmtDate(l.created_at, true)}</span></span>
          {isAdmin && <button className="btn btn-link btn-sm text-danger p-0" onClick={() => del(l.id)} aria-label="Delete entry"><i className="bi bi-trash"></i></button>}
        </div>
      ))}
      <form className="row g-2 border-top pt-3 mt-1" onSubmit={add}>
        {err && <div className="col-12 text-danger small">{err}</div>}
        <div className="col-md-5"><input name="title" className="form-control form-control-sm" placeholder="New entry, e.g. Documents verified" required aria-label="Entry title" /></div>
        <div className="col-md-4">
          <select name="status" className="form-select form-select-sm" aria-label="Entry status">{data.status_choices.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        </div>
        <div className="col-md-3"><button className="btn btn-sm btn-outline-primary w-100">Add entry</button></div>
      </form>
    </div>
  );
}

/** Shared create/edit page for every section (users have their own routes). */
export function PanelForm({ users = false }: { users?: boolean }) {
  const { key = 'users', id } = useParams();
  const { user } = useApp();
  const sectionKey = users ? 'users' : key;
  const [version, setVersion] = useState(0);
  const apiPath = users ? (id ? `panel/users/${id}/` : 'panel/users/new/') : id ? `panel/${key}/${id}/` : `panel/${key}/new/`;
  const listPath = users ? 'panel/users/' : `panel/${key}/`;
  const navigate = useNavigate();
  const { notify } = useApp();
  const { data, error } = useApi<DetailData>(`${apiPath}${apiPath.includes('?') ? '&' : '?'}v=${version}`);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setValues(Object.fromEntries(data.fields.map((f) => [f.name, f.value]))); }, [data?.label, data?.fields.length, version === 0]);  // eslint-disable-line react-hooks/exhaustive-deps
  useTitle(data ? `${data.title} · HOMline Panel` : 'HOMline Panel');
  if (error) return <div className="alert alert-danger">{error.status === 403 ? 'You do not have access to this section.' : error.message}</div>;
  if (!data) return <Loading />;

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api(id ? apiPath : listPath, { method: id ? 'PATCH' : 'POST', body: new FormData(e.currentTarget) });
      notify('Saved.');
      navigate(`/panel/${sectionKey}`);
    } catch (err) {
      setErrors(err instanceof ApiError ? (Object.keys(err.errors).length ? err.errors : { __all__: [err.message] }) : { __all__: ['Unexpected error.'] });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm('Delete this permanently?')) return;
    try {
      await api(apiPath, { method: 'DELETE' });
      notify('Deleted.');
      navigate(`/panel/${sectionKey}`);
    } catch (err) {
      setErrors({ __all__: [err instanceof ApiError ? err.message : 'Delete failed.'] });
    }
  };

  const hasLinks = Object.keys(data.links).length > 0;
  return (
    <>
      <Link className="small" to={`/panel/${sectionKey}`}>← {data.title}</Link>
      <div className="d-flex flex-wrap align-items-center gap-2 my-2">
        <h1 className="h4 fw-bold mb-0">{data.label}</h1>
        {hasLinks && <QuickLinks links={data.links} />}
      </div>
      <div className="row g-3">
        {data.details.length > 0 && (
          <div className="col-lg-5">
            <div className="card p-3">
              <h2 className="h6 fw-bold">Details</h2>
              <dl className="mb-0 small">
                {data.details.map((d) => <div key={d.label}><dt className="text-muted mt-2">{d.label}</dt><dd className="mb-0" style={{ whiteSpace: 'pre-line' }}>{d.value}</dd></div>)}
              </dl>
              {data.doc_url && <a className="btn btn-outline-primary btn-sm mt-3" href={data.doc_url}><i className="bi bi-download"></i> Download document</a>}
            </div>
          </div>
        )}
        <div className={data.details.length ? 'col-lg-7' : 'col-lg-8'}>
          <form className="card p-3" onSubmit={save} encType="multipart/form-data">
            {errors.__all__?.map((e) => <div key={e} className="alert alert-danger py-2">{e}</div>)}
            {data.fields.map((f) => (
              <div className="mb-3" key={f.name}>
                {f.type === 'checkbox' ? (
                  <div className="form-check"><FieldInput f={f} value={values[f.name] ?? false} onChange={(v) => setValues({ ...values, [f.name]: v })} /> <label className="form-check-label" htmlFor={`pf-${f.name}`}>{f.label}</label></div>
                ) : (
                  <>
                    <label className="form-label small fw-semibold" htmlFor={`pf-${f.name}`}>{f.label}{f.required && <span className="text-danger"> *</span>}</label>
                    <FieldInput f={f} value={values[f.name] ?? ''} onChange={(v) => setValues({ ...values, [f.name]: v })} />
                  </>
                )}
                {f.help && <div className="form-text">{f.help}</div>}
                {errors[f.name]?.map((e) => <div key={e} className="text-danger small">{e}</div>)}
              </div>
            ))}
            <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
          </form>
          {data.can_delete && <button className="btn btn-outline-danger btn-sm mt-3" onClick={remove}><i className="bi bi-trash"></i> Delete</button>}
          {data.can_timeline && id && <TimelineBox data={data} id={id} reload={() => setVersion((v) => v + 1)} isAdmin={!!user?.is_superuser} />}
        </div>
      </div>
    </>
  );
}
