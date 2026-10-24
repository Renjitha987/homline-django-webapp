import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../app';
import { ScrollManager, waLink } from '../lib';
import { Errors, FormAlert, hideModal, SubmitButton, useSubmit } from './forms';
import RequestFields from './RequestFields';

const NAV: [string, string][] = [
  ['/', 'Home'], ['/services', 'Services Directory'], ['/how-it-works', 'How It Works'], ['/membership', 'Membership'],
  ['/track', 'Track Status'], ['/about', 'About HOMline'], ['/faqs', 'FAQs'], ['/contact', 'Contact'],
];

function Header() {
  const { user, setUser, notify } = useApp();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const collapse = useRef<HTMLDivElement>(null);

  useEffect(() => {
    collapse.current?.classList.remove('show'); // close the mobile menu after navigating
  }, [pathname]);

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

  return (
    <header className="sticky-header">
      <nav className="navbar navbar-expand-lg custom-navbar">
        <div className="container custom-nav-container">
          <Link className="navbar-brand-logo" to="/" aria-label="HOMline DIGI seva Home">
            <img src="/static/images/logo.png" alt="HOMline DIGI seva - Online Service at Doorstep" className="navbar-brand-img" />
          </Link>
          <button className="navbar-toggler border-0 shadow-none p-1" type="button" data-bs-toggle="collapse" data-bs-target="#mainNavbar" aria-controls="mainNavbar" aria-expanded="false" aria-label="Toggle navigation">
            <span className="navbar-toggler-icon"></span>
          </button>
          <div className="collapse navbar-collapse justify-content-between" id="mainNavbar" ref={collapse}>
            <ul className="nav-center-menu">
              {NAV.map(([to, label]) => (
                <li className="nav-item" key={to}>
                  <NavLink className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} to={to} end={to === '/'}>{label}</NavLink>
                </li>
              ))}
            </ul>
            <div className="header-actions">
              {user ? (
                <div className="dropdown d-inline-block">
                  <button className="header-btn btn-header-user dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                    <i className="bi bi-person-circle text-gold me-1"></i> {(user.first_name || user.username).slice(0, 10)}
                  </button>
                  <ul className="dropdown-menu dropdown-menu-end shadow border-0 rounded-3 mt-1">
                    <li className="px-3 py-2 border-bottom">
                      <small className="text-muted d-block font-monospace">Signed in as</small>
                      <strong className="text-navy">{user.username}</strong>
                    </li>
                    <li><Link className="dropdown-item fw-bold text-teal" to="/dashboard"><i className="bi bi-speedometer2 text-teal me-2"></i> My Dashboard</Link></li>
                    <li><Link className="dropdown-item" to="/dashboard#my-requests"><i className="bi bi-card-checklist text-primary me-2"></i> My Service Requests</Link></li>
                    <li><Link className="dropdown-item" to="/dashboard#my-membership"><i className="bi bi-person-badge text-gold me-2"></i> My Membership</Link></li>
                    <li><Link className="dropdown-item" to="/dashboard#account-settings"><i className="bi bi-gear-fill text-secondary me-2"></i> Account Settings</Link></li>
                    {user.is_staff && (
                      <>
                        <li><hr className="dropdown-divider" /></li>
                        <li><Link className="dropdown-item" to="/panel"><i className="bi bi-shield-lock-fill text-gold me-2"></i> {user.is_superuser ? 'Admin' : 'Staff'} Panel</Link></li>
                      </>
                    )}
                    <li><hr className="dropdown-divider" /></li>
                    <li><button type="button" className="dropdown-item text-danger fw-bold" onClick={logout}><i className="bi bi-box-arrow-right me-2"></i> Logout</button></li>
                  </ul>
                </div>
              ) : (
                <Link to="/login" className="header-btn btn-header-signup" title="Sign in or create a free account">
                  <i className="bi bi-person-circle me-1"></i> Sign In / Sign Up
                </Link>
              )}
              <a href="tel:6282268453" className="header-btn btn-header-call" title="Call HOMline Support">
                <i className="bi bi-telephone-fill text-gold me-1"></i> <span className="d-none d-xl-inline">Call Now</span><span className="d-inline d-xl-none">Call</span>
              </a>
              <a href={waLink('Hi HOMline, I want to enquire about a digital service.')} target="_blank" rel="noreferrer" className="header-btn btn-header-whatsapp" title="WhatsApp Customer Support">
                <i className="bi bi-whatsapp me-1"></i> <span>WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="main-footer">
      <div className="container">
        <div className="row g-3 g-lg-4">
          <div className="col-lg-4 col-md-6">
            <div className="d-flex align-items-center gap-2 mb-2">
              <div className="footer-logo-badge"><img src="/static/images/logo.png" alt="HOMline DIGI seva - Online Service at Doorstep" /></div>
            </div>
            <p className="text-white-50 small mb-2 footer-desc">Digital Services. Simplified for You. Access essential online services with reliable assistance, convenient digital support and guidance — from the comfort of your home.</p>
            <div className="badge bg-teal text-white px-2.5 py-1 rounded-pill font-monospace small mb-2"><i className="bi bi-shield-check me-1"></i> Connecting Convenience</div>
            <div className="d-flex flex-column gap-1 small text-white-50">
              <div><i className="bi bi-globe text-gold me-1"></i> <a href="https://www.homline.in" target="_blank" rel="noopener noreferrer" className="text-gold fw-bold text-decoration-none">homline.in</a></div>
              <div><i className="bi bi-envelope-fill text-teal me-1"></i> <a href="mailto:homelinedigital@gmail.com" className="text-white-50 text-decoration-none">homelinedigital@gmail.com</a></div>
              <div><i className="bi bi-telephone-fill text-gold me-1"></i> <a href="tel:6282268453" className="text-white-50 text-decoration-none">+91 62822 68453</a></div>
            </div>
          </div>
          <div className="col-lg-2 col-md-6 col-6">
            <h5 className="footer-title">Quick Links</h5>
            <ul className="footer-links">
              <li><Link to="/">Home</Link></li>
              <li><Link to="/about">About HOMline</Link></li>
              <li><Link to="/services">Services Directory</Link></li>
              <li><Link to="/how-it-works">How It Works</Link></li>
              <li><Link to="/membership">Membership Plans</Link></li>
              <li><Link to="/updates">Latest Updates</Link></li>
              <li><Link to="/faqs">FAQs</Link></li>
              <li><Link to="/contact">Contact Us</Link></li>
            </ul>
          </div>
          <div className="col-lg-3 col-md-6 col-6">
            <h5 className="footer-title">Quick Portals</h5>
            <ul className="footer-links">
              <li><Link to="/services"><i className="bi bi-grid text-teal me-1"></i> Explore Services</Link></li>
              <li><Link to="/membership"><i className="bi bi-person-badge text-gold me-1"></i> Apply Membership</Link></li>
              <li><Link to="/track"><i className="bi bi-search text-cyan me-1"></i> Track Status</Link></li>
              <li><a href="#pwdModal" data-bs-toggle="modal"><i className="bi bi-universal-access text-info me-1"></i> PwD-Friendly Desk</a></li>
              <li><Link to="/complaint-suggestion"><i className="bi bi-chat-heart text-danger me-1"></i> Complaint / Suggestion</Link></li>
            </ul>
          </div>
          <div className="col-lg-3 col-md-6">
            <h5 className="footer-title">HOMline Portal</h5>
            <p className="text-white-50 small mb-1.5 footer-desc">All Internet Services at your fingertip. Designed to Easy Access and Reduce Travel.</p>
            <p className="small text-white-50 mb-2 footer-desc">HOMline is an independent assistance service. We are not a government office.</p>
            <ul className="footer-links small">
              <li><Link to="/policy/terms">Terms &amp; Privacy Policy</Link></li>
              <li><Link to="/policy/disclaimer">Service Disclaimer</Link></li>
              <li><Link to="/login">Staff login</Link></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom d-flex flex-column flex-md-row justify-content-between align-items-center gap-2 border-top border-secondary border-opacity-25 pt-2 mt-2.5">
          <div className="d-flex flex-wrap align-items-center gap-2 text-center text-md-start">
            <span className="fw-bold text-white">HOMline DIGI seva</span>
            <span className="text-white-50 d-none d-sm-inline">•</span>
            <a href="https://www.homline.in" target="_blank" rel="noopener noreferrer" className="text-gold fw-semibold text-decoration-none">homline.in</a>
            <span className="text-white-50 d-none d-sm-inline">•</span>
            <span className="text-white-50">Powered By AMDG GROUP</span>
          </div>
          <div className="text-white-50 small d-flex flex-wrap align-items-center gap-2"><span>© 2026 HOMline. Digital Services at Doorstep.</span></div>
        </div>
      </div>
    </footer>
  );
}

function RequestModal() {
  const { notify } = useApp();
  const navigate = useNavigate();
  const el = useRef<HTMLDivElement>(null);
  const { errors, busy, submit } = useSubmit<{ request_id: string }>('requests/', (d, form) => {
    hideModal(el.current);
    form.reset();
    notify(`Your request has been submitted successfully! Your Request ID is: ${d.request_id}. Please save this ID to track your request status.`);
    navigate(`/track/${d.request_id}`);
  });
  return (
    <div className="modal fade" id="requestModal" tabIndex={-1} aria-labelledby="requestModalLabel" aria-hidden="true" ref={el}>
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content rounded-4 border-0 shadow-lg">
          <div className="modal-header bg-navy text-white p-4">
            <div className="d-flex align-items-center gap-2">
              <div className="brand-icon-box" style={{ width: 36, height: 36, fontSize: '1.1rem' }}><i className="bi bi-send-fill"></i></div>
              <div>
                <h5 className="modal-title font-brand text-white mb-0" id="requestModalLabel">Request a Digital Service</h5>
                <small className="text-white-50">Provide your details for instant guidance &amp; assistance</small>
              </div>
            </div>
            <button type="button" className="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form className="p-4" onSubmit={submit}>
            <FormAlert errors={errors} />
            <RequestFields errors={errors} idp="rq-" />
            <div className="alert alert-light border border-teal rounded-3 mt-3 p-3 small text-muted">
              <i className="bi bi-shield-lock-fill text-teal me-1"></i> Your details are handled with strict confidentiality per HOMline privacy practices.
            </div>
            <div className="d-flex justify-content-end gap-2 mt-4">
              <button type="button" className="btn btn-light" data-bs-dismiss="modal">Cancel</button>
              <SubmitButton busy={busy}>Submit Service Request <i className="bi bi-arrow-right ms-1"></i></SubmitButton>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const PWD_MODES = ['Doorstep Visit Assistance', 'WhatsApp / Chat Support', 'Direct Phone Call Support', 'Mobility / Senior Support', 'Voice / Visual Support', 'General Assistance'];

function PwdModal() {
  const { notify } = useApp();
  const el = useRef<HTMLDivElement>(null);
  const { errors, busy, submit } = useSubmit<{ name: string; message: string }>('pwd/', (d, form) => {
    hideModal(el.current);
    form.reset();
    notify(`Thank you ${d.name}. Your PwD-Friendly Assistance request has been registered. You can also connect directly via WhatsApp or Call below.`);
  });
  const req = <><span className="text-danger" aria-hidden="true">*</span></>;
  return (
    <div className="modal fade" id="pwdModal" tabIndex={-1} aria-labelledby="pwdModalLabel" aria-hidden="true" ref={el}>
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content rounded-4 border-0 shadow-lg" style={{ border: '2px solid #6366f1' }}>
          <div className="modal-header bg-navy text-white p-4">
            <div className="d-flex align-items-center gap-3">
              <div className="brand-icon-box bg-indigo text-white" style={{ width: 44, height: 44, fontSize: '1.4rem', background: '#6366f1' }}><i className="bi bi-universal-access"></i></div>
              <div>
                <h5 className="modal-title font-brand text-white mb-0" id="pwdModalLabel">PwD-Friendly Assistance Desk</h5>
                <small className="text-warning">“Accessible digital empowerment for all abilities — no travel required.”</small>
              </div>
            </div>
            <button type="button" className="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form className="p-4" onSubmit={submit}>
            <FormAlert errors={errors} />
            <div className="pwd-quote-box mb-4">
              <i className="bi bi-quote fs-4 text-warning align-middle me-1"></i>
              Dedicated assistance for Persons with Disabilities (PwD) and Senior Citizens. We provide comfortable doorstep guidance, voice calls, or direct WhatsApp support so you never have to travel.
            </div>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label fw-bold text-navy" htmlFor="pw1">Full Name {req}</label>
                <input id="pw1" name="name" className="form-control form-control-lg" placeholder="Applicant name" required />
                <Errors errors={errors} name="name" />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-bold text-navy" htmlFor="pw2">WhatsApp / Phone Number {req}</label>
                <input id="pw2" name="mobile" type="tel" className="form-control form-control-lg" placeholder="Mobile number" required />
                <Errors errors={errors} name="mobile" />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-bold text-navy" htmlFor="pw3">Location / Place {req}</label>
                <input id="pw3" name="place" className="form-control" placeholder="Village / Town / District" required />
                <Errors errors={errors} name="place" />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-bold text-navy" htmlFor="pw4">Preferred Assistance Mode</label>
                <select id="pw4" name="assistance_type" className="form-select">{PWD_MODES.map((m) => <option key={m}>{m}</option>)}</select>
              </div>
              <div className="col-12">
                <label className="form-label fw-bold text-navy" htmlFor="pw5">Service Needed {req}</label>
                <input id="pw5" name="service_needed" className="form-control" placeholder="e.g. Disability Certificate, Pension, Ticket Booking, PAN card, Ration card" required />
                <Errors errors={errors} name="service_needed" />
              </div>
              <div className="col-12">
                <label className="form-label fw-bold text-navy" htmlFor="pw6">Specific Needs / Notes</label>
                <textarea id="pw6" name="details" className="form-control" rows={2} placeholder="Tell us how we can help you comfortably (e.g. communicate in Malayalam, audio call, assistance for caregiver)..." />
              </div>
            </div>
            <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mt-4 pt-3 border-top">
              <div className="d-flex gap-2">
                <a href={waLink('Hi HOMline, I am inquiring about PwD-Friendly Assistance.')} target="_blank" rel="noreferrer" className="btn btn-whatsapp"><i className="bi bi-whatsapp me-1"></i> WhatsApp Desk</a>
                <a href="tel:6282268453" className="btn btn-outline-navy"><i className="bi bi-telephone-fill me-1"></i> Call 6282268453</a>
              </div>
              <SubmitButton busy={busy} className="btn btn-teal px-4 fw-bold">Submit PwD Request <i className="bi bi-send-check-fill ms-1"></i></SubmitButton>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const { flash, clearFlash, ready } = useApp();
  const { pathname } = useLocation();
  useEffect(() => { if (flash) { const t = setTimeout(clearFlash, 12000); return () => clearTimeout(t); } }, [flash, clearFlash]);
  if (!ready) return null;
  return (
    <>
      <ScrollManager />
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Header />
      {flash && (
        <div className="container mt-3">
          <div className={`alert alert-${flash.type} alert-dismissible fade show rounded-4 shadow-sm`} role="alert">
            <i className="bi bi-info-circle-fill me-2"></i> {flash.text}
            <button type="button" className="btn-close" aria-label="Close" onClick={clearFlash}></button>
          </div>
        </div>
      )}
      <main id="main-content" tabIndex={-1} key={pathname}>
        <Outlet />
      </main>
      <Footer />
      <div className="fixed-mobile-bottom-nav d-md-none">
        <a href={waLink('Hi HOMline, I need assistance.')} target="_blank" rel="noreferrer" className="mobile-nav-btn btn-whatsapp"><i className="bi bi-whatsapp"></i> WhatsApp</a>
        <a href="tel:6282268453" className="mobile-nav-btn btn-navy"><i className="bi bi-telephone-fill"></i> Call</a>
        <Link to="/request" className="mobile-nav-btn btn-teal"><i className="bi bi-pencil-square"></i> Request</Link>
      </div>
      <RequestModal />
      <PwdModal />
    </>
  );
}
