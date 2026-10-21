import { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Service, UpdateItem } from '../types';
import { fmtDate, truncate, useApi, useTitle } from '../lib';

const words = (s: string, n: number) => { const w = s.split(/\s+/); return w.length > n ? w.slice(0, n).join(' ') + '…' : s; };

function FeaturedServices({ services }: { services: Service[] }) {
  if (!services.length) return <div className="col-12 text-center"><p className="text-muted">Explore the directory to find the service you need.</p></div>;
  return (
    <>
      {services.map((service) => (
        <div className="col-lg-3 col-md-6" key={service.id}>
          <Link to={`/services/${service.slug}`} className="home-feature-card service-card-animated p-4 h-100 d-flex flex-column justify-content-between text-decoration-none">
            <div>
              <div className="d-flex justify-content-between align-items-start mb-3">
                <div className="home-feature-icon feature-icon-tile"><i className={`bi ${service.icon_class}`}></i></div>
                {service.badge && <span className="badge bg-gold text-dark font-monospace small">{service.badge}</span>}
              </div>
              <span className="small text-muted font-monospace d-block mb-1">{service.category.name}</span>
              <h3 className="h6 fw-bold text-navy mb-2">{service.title}</h3>
              <p className="text-muted small mb-3">{words(service.short_summary, 14)}</p>
            </div>
            <div className="pt-3 border-top d-flex justify-content-between align-items-center">
              <span className="small font-monospace text-teal fw-bold">{service.homline_charge}</span>
              <span className="btn btn-sm btn-outline-navy py-1 px-2" style={{ fontSize: '0.75rem' }}>View Details →</span>
            </div>
          </Link>
        </div>
      ))}
    </>
  );
}

function FeaturedUpdates({ updates }: { updates: UpdateItem[] }) {
  if (!updates.length) return <div className="p-3 bg-soft-mist rounded-3 text-muted small">No recent updates posted. Check back soon!</div>;
  return (
    <>
      {updates.map((u) => (
        <div className="p-3 bg-soft-mist rounded-3 border-start border-4 border-teal" key={u.id}>
          <div className="d-flex justify-content-between align-items-center mb-1">
            <span className="badge bg-teal-subtle text-teal font-monospace small" style={{ fontSize: '0.72rem' }}>{u.category_tag}</span>
            <small className="text-muted font-monospace">{fmtDate(u.published_at)}</small>
          </div>
          <h6 className="fw-bold text-navy mb-1">{u.title}</h6>
          <p className="text-muted small mb-0">{words(u.summary, 15)}</p>
        </div>
      ))}
    </>
  );
}

export default function Home() {
  useTitle('HOMline DIGI seva • Digital Services. Simplified for You.');
  const { data } = useApi<{ services: Service[]; updates: UpdateItem[] }>('home/');
  const navigate = useNavigate();
  const search = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = (new FormData(e.currentTarget).get('q') as string).trim();
    navigate(q ? `/services?q=${encodeURIComponent(q)}` : '/services');
  };
  return (
    <>
<section className="hero-section home-hero py-5">
  <div className="container">
    <div className="row align-items-center g-5">
      <div className="col-lg-7">
        
        {/* Animated HOMline 24/7 Brand Badge */}
        <div className="hero-brand-247-wrapper mb-3">
          <span className="hero-brand-247-homline">HOMline</span>
          <span className="hero-brand-247-badge" aria-label="24 by 7 service">
            <span className="hero-brand-247-ring" aria-hidden="true"></span>
            <span className="hero-brand-247-text">24/7</span>
          </span>
        </div>

        <div className="hero-kerala-banner mb-4">
          <i className="bi bi-geo-alt-fill hero-kerala-icon" aria-hidden="true"></i>
          <span>
            <span className="hero-kerala-platform">Kerala's Online-First Assisted Platform</span>
            <span className="hero-kerala-sep" aria-hidden="true"> — </span>
            <span className="hero-kerala-brand">HOMLINE</span>
          </span>
        </div>

        
        <h1 className="hero-headline mb-3">
          Your digital tasks,<br />
          <span className="hero-headline-animated">All Internet Services at Your Fingertip.</span>
        </h1>
        
        <p className="hero-subtitle mb-4">
          Designed to Easy Access and Reduce Travel. Access passport assistance, PAN cards, exam applications, ticket bookings, poster designs & DTP with friendly doorstep and online guidance.
        </p>


        <form onSubmit={search} className="services-search mb-4" role="search">
          <label className="visually-hidden" htmlFor="homeSearch">Search services</label>
          <i className="bi bi-search" aria-hidden="true"></i>
          <input id="homeSearch" type="search" name="q" placeholder="Find a service: PAN, passport, exam…" autoComplete="off" />
          <button className="btn btn-teal" type="submit">Search</button>
        </form>

        <div className="d-flex flex-wrap align-items-center gap-3 mb-2">
          <Link to="/request" className="btn btn-teal btn-lg px-4 hero-cta-primary">
            <i className="bi bi-pencil-square me-2" aria-hidden="true"></i> Request a Service
          </Link>
          <a href="https://wa.me/916282268453?text=Hi%20HOMline,%20I%20need%20assistance%20with%20a%20digital%20service." target="_blank" rel="noopener" className="btn btn-whatsapp btn-lg px-4">
            <i className="bi bi-whatsapp me-2" aria-hidden="true"></i> WhatsApp Us
          </a>
        </div>
        <p className="mb-4 small">
          <Link to="/services" className="fw-bold text-decoration-none">Browse all services →</Link>
          <span className="text-muted mx-2" aria-hidden="true">·</span>
          <a href="#pwd-assistance" className="fw-bold text-decoration-none"><i className="bi bi-universal-access me-1" aria-hidden="true"></i>PwD-friendly desk</a>
        </p>

        <div className="home-trust-notes">
          <span><i className="bi bi-shield-check text-teal"></i> Clear, guided support</span>
          <span><i className="bi bi-house-door text-teal"></i> Help from home</span>
          <span><i className="bi bi-receipt text-teal"></i> Transparent charges</span>
          <span className="trust-note-24x7">
            <span className="pulse-dot pulse-dot-gold" aria-hidden="true"></span>
            <i className="bi bi-clock-fill me-1" aria-hidden="true"></i>
            24×7 Trusted Online Services
          </span>
        </div>
      </div>

      
      <div className="col-lg-5">
        <div className="hero-console-card home-service-card position-relative">
          <div className="floating-pill-badge floating-pill-top-right">
            <span className="pulse-dot"></span>
            <span className="text-navy fw-bold">Help by call & WhatsApp</span>
          </div>
          
          <div className="d-flex align-items-center gap-3 mb-3 pb-3 border-bottom">
            <div className="brand-icon-box bg-navy text-white desk-float-icon" style={{ width: "52px", height: "52px", fontSize: "1.5rem" }}>
              <i className="bi bi-laptop-fill text-cyan"></i>
            </div>
            <div>
              <h2 className="h6 fw-extrabold text-navy mb-0">Doorstep Digital Desk</h2>
              <small className="text-muted">Assistance without leaving your home</small>
            </div>
          </div>

          
          <div className="home-service-visual position-relative my-3" aria-hidden="true" style={{ minHeight: "180px" }}>
            <div className="home-service-orbit orbit-one desk-orbit-glow"></div>
            <div className="home-service-orbit orbit-two desk-orbit-glow" style={{ animationDirection: "reverse" }}></div>
            <div className="home-service-paper shadow-sm">
              <i className="bi bi-file-earmark-check-fill text-teal"></i>
              <span>Documents<br />Prepared & Checked</span>
            </div>
            <div className="home-service-icon icon-id desk-float-icon" title="Identity Services"><i className="bi bi-person-vcard-fill text-primary"></i></div>
            <div className="home-service-icon icon-cap desk-float-icon" title="Education & Exams"><i className="bi bi-mortarboard-fill text-warning"></i></div>
            <div className="home-service-icon icon-building desk-float-icon" title="Business & Tickets"><i className="bi bi-ticket-perforated-fill text-success"></i></div>
          </div>

          <div className="p-3 bg-soft-mist rounded-3 border border-teal-subtle">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <strong className="text-navy small"><i className="bi bi-patch-check-fill text-teal me-1"></i> No-Travel Assistance</strong>
              
            </div>
            <p className="small text-muted mb-0">HOMline is an independent assistance service, not a government office. We help you through document preparation, sizing, verification, and portal submission comfortably from your residence.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>


<section className="py-4 bg-white border-top border-bottom">
  <div className="container">
    <div className="row g-3">
      
      <div className="col-lg-3 col-sm-6">
        <Link to="/services" className="quick-box-gateway shadow-sm">
          <div className="quick-box-icon bg-primary-subtle text-primary">
            <i className="bi bi-grid-fill"></i>
          </div>
          <div>
            <span className="small text-muted d-block font-monospace">CATALOG</span>
            <strong className="fs-6 d-block text-navy">Explore Services</strong>
            <small className="text-muted">Browse all doorstep services →</small>
          </div>
        </Link>
      </div>

      
      <div className="col-lg-3 col-sm-6">
        <Link to="/complaint-suggestion" className="quick-box-gateway shadow-sm">
          <div className="quick-box-icon bg-danger-subtle text-danger">
            <i className="bi bi-chat-heart-fill"></i>
          </div>
          <div>
            <span className="small text-muted d-block font-monospace">FEEDBACK</span>
            <strong className="fs-6 d-block text-navy">Complaint / Suggestion</strong>
            <small className="text-muted">Direct to management →</small>
          </div>
        </Link>
      </div>

      
      <div className="col-lg-3 col-sm-6">
        <Link to="/membership" className="quick-box-gateway shadow-sm">
          <div className="quick-box-icon bg-warning-subtle text-dark">
            <i className="bi bi-person-badge-fill text-warning"></i>
          </div>
          <div>
            <span className="small text-muted d-block font-monospace">PRIVILEGES</span>
            <strong className="fs-6 d-block text-navy">Apply Membership</strong>
            <small className="text-muted">Discounts & Card PDF →</small>
          </div>
        </Link>
      </div>

      
      <div className="col-lg-3 col-sm-6">
        <Link to="/track" className="quick-box-gateway shadow-sm">
          <div className="quick-box-icon bg-success-subtle text-success">
            <i className="bi bi-search"></i>
          </div>
          <div>
            <span className="small text-muted d-block font-monospace">LIVE TRACKING</span>
            <strong className="fs-6 d-block text-navy">Track Status</strong>
            <small className="text-muted">Check reference & QR →</small>
          </div>
        </Link>
      </div>
    </div>
  </div>
</section>


<section className="py-5 bg-white home-featured-section">
  <div className="container">
    <div className="text-center max-width-700 mx-auto mb-5">
      <span className="badge bg-teal text-white px-3 py-2 rounded-pill font-monospace text-uppercase">Directory Highlights</span>
      <h2 className="fw-extrabold display-6 text-navy mt-2 mb-3">Popular Services</h2>
      <p className="text-muted">Doorstep assistance for official documents, tickets, printing, designing, and online registrations.</p>
    </div>

    <div className="row g-4">
      <FeaturedServices services={data?.services ?? []} />
    </div>

    <div className="text-center mt-5">
      <Link to="/services" className="btn btn-teal btn-lg px-4 shadow-sm">
        <i className="bi bi-grid-fill me-2"></i> View All Services
      </Link>
    </div>
  </div>
</section>


<section className="py-5 bg-white border-bottom">
  <div className="container py-2">
    <div className="row align-items-stretch g-4">
      
      <div className="col-lg-7 d-flex flex-column justify-content-between">
        <div className="mb-3">
          <div className="d-inline-flex align-items-center gap-2 bg-soft-teal border border-teal text-teal px-3 py-1 rounded-pill small font-monospace fw-bold mb-3">
            <i className="bi bi-compass-fill"></i> PURPOSE & DIRECTION
          </div>
          <h2 className="display-6 fw-extrabold text-navy mb-2" style={{ letterSpacing: "0.015em" }}>
            Driving Digital Inclusion For Everyone
          </h2>
          <p className="text-muted small mb-0" style={{ letterSpacing: "0.01em" }}>
            Making eligible digital services simpler, closer, and accessible without travel anxiety.
          </p>
        </div>

        <div className="d-flex flex-column gap-3 my-2">
          
          <div className="p-4 rounded-4 border border-teal shadow-sm position-relative overflow-hidden vm-card vm-card-teal">
            <div className="d-flex align-items-center gap-3 mb-2">
              <div className="brand-icon-box bg-teal text-white flex-shrink-0" style={{ width: "44px", height: "44px", fontSize: "1.3rem" }}>
                <i className="bi bi-eye-fill"></i>
              </div>
              <div>
                <span className="badge bg-teal text-white font-monospace small px-2 py-1">CORE DIRECTION</span>
                <h3 className="h4 fw-extrabold text-navy mb-0 mt-1" style={{ letterSpacing: "0.02em" }}>Our Vision</h3>
              </div>
            </div>
            <p className="fs-5 fw-bold text-navy fst-italic ps-3 border-start border-4 border-teal mt-3 mb-0" style={{ letterSpacing: "0.02em", lineHeight: "1.55" }}>
              “To make digital services simple, accessible, and convenient for everyone.”
            </p>
          </div>

          
          <div className="p-4 rounded-4 border border-navy shadow-sm position-relative overflow-hidden vm-card vm-card-navy">
            <div className="d-flex align-items-center gap-3 mb-2">
              <div className="brand-icon-box bg-navy text-white flex-shrink-0" style={{ width: "44px", height: "44px", fontSize: "1.3rem" }}>
                <i className="bi bi-flag-fill text-gold"></i>
              </div>
              <div>
                <span className="badge bg-gold text-dark font-monospace small px-2 py-1">EVERYDAY MISSION</span>
                <h3 className="h4 fw-extrabold text-navy mb-0 mt-1" style={{ letterSpacing: "0.02em" }}>Our Mission</h3>
              </div>
            </div>
            <p className="fs-6 text-secondary ps-3 border-start border-4 border-gold mt-3 mb-0" style={{ letterSpacing: "0.015em", lineHeight: "1.65" }}>
              “HOMline exists to connect people with the digital services they need through one trusted point of assistance – simplifying processes, saving time, providing transparent support, and making everyday online services easier to access.”
            </p>
          </div>
        </div>

        <div className="pt-2">
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <span className="badge bg-soft-mist text-navy border font-monospace small px-3 py-2"><i className="bi bi-shield-check text-teal me-1"></i> Transparent Support</span>
            <span className="badge bg-soft-mist text-navy border font-monospace small px-3 py-2"><i className="bi bi-clock-history text-gold me-1"></i> Time Saving</span>
            <span className="badge bg-soft-mist text-navy border font-monospace small px-3 py-2"><i className="bi bi-house-door text-teal me-1"></i> Doorstep Guidance</span>
          </div>
        </div>
      </div>

      
      <div className="col-lg-5">
        <div className="h-100 p-4 rounded-4 bg-navy text-white shadow-lg d-flex flex-column justify-content-between position-relative overflow-hidden">
          <div>
            <div className="d-flex align-items-center justify-content-between mb-3">
              <span className="badge bg-gold text-dark font-monospace fw-bold text-uppercase px-3 py-1 rounded-pill">Leadership & Vision</span>
              <div className="d-flex align-items-center gap-2">
                <span className="badge bg-white bg-opacity-10 text-white-75 font-monospace small">AMDG MEDIA</span>
              </div>
            </div>

            <div className="row align-items-center g-3 mb-3">
              <div className="col-sm-5 text-center">
                <div className="rounded-4 overflow-hidden border border-2 border-gold shadow-sm mx-auto position-relative" style={{ maxWidth: "170px", aspectRatio: "4/5" }}>
                  <img onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/static/images/founder-placeholder.svg"; }} src="/static/images/founder.jpg" alt="HOMline Founder" className="w-100 h-100 object-fit-cover shadow-sm" />
                </div>
              </div>
              <div className="col-sm-7">
                <span className="text-gold small fw-bold font-monospace d-block">FOUNDER & SOCIAL INNOVATOR</span>
                <h4 className="fw-extrabold text-white mb-1 d-inline-flex align-items-center gap-2" style={{ letterSpacing: "0.02em" }}>
                  HOMline Founder
                </h4>
                <p className="small text-white-75 mb-2">AMDG Group • AMDG Media • YUVA Manass</p>
                <div className="badge bg-teal text-white small px-2 py-1 font-monospace">
                  Social Work + Tech + Accessibility
                </div>
              </div>
            </div>

            <div className="p-3 bg-white bg-opacity-10 rounded-3 border-start border-4 border-gold mb-3">
              <p className="small text-white-75 fst-italic mb-0" style={{ letterSpacing: "0.02em", lineHeight: "1.5" }}>
                “A service is truly accessible only when people can realistically reach, understand and use it.”
              </p>
            </div>

            <p className="small text-white-50 mb-0" style={{ letterSpacing: "0.01em", lineHeight: "1.6" }}>
              Conceived through social work field interaction, academic education, community volunteering, and digital media experience to eliminate the physical distance between citizens and digital governance.
            </p>
          </div>

          <div className="mt-4 pt-3 border-top border-white border-opacity-10 d-flex flex-wrap gap-2 justify-content-between align-items-center">
            <Link to="/about" className="btn btn-gold btn-sm px-3 rounded-pill fw-bold text-dark">
              Read Founder’s Story →
            </Link>
            <Link to="/about#futurePlansSection" className="btn btn-outline-light btn-sm px-3 rounded-pill">
              Future Plans (Kerala & India)
            </Link>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>


<section className="py-5 bg-soft-mist" id="pwd-assistance">
  <div className="container">
    <div className="row g-4 align-items-start">
      
      <div className="col-lg-7">
        <div className="pwd-assistance-card shadow-lg">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div className="d-flex align-items-center gap-3">
              <div className="pwd-icon-tile">
                <i className="bi bi-universal-access"></i>
              </div>
              <div>
                <span className="badge bg-gold text-dark font-monospace fw-bold mb-1">INCLUSIVE SERVICE</span>
                <h3 className="fw-extrabold text-white mb-0">PwD-Friendly Assistance</h3>
              </div>
            </div>
            <span className="badge bg-success px-3 py-2 rounded-pill font-monospace small">Active Desk</span>
          </div>

          <div className="pwd-quote-box mb-4">
            <i className="bi bi-quote fs-4 text-warning align-middle me-1"></i>
            “Accessible digital empowerment for all abilities — designed for easy access and zero travel.”
          </div>

          <p className="text-white-50 small mb-4">
            Persons with Disabilities (PwD) and elderly citizens can request specialized assistance for official certificates, welfare applications, exam forms, ticket bookings, or identity cards without leaving their residence.
          </p>

          <div className="d-flex flex-wrap gap-2">
            <button type="button" className="btn btn-teal btn-lg fw-bold" data-bs-toggle="modal" data-bs-target="#pwdModal">
              <i className="bi bi-pencil-square me-2" aria-hidden="true"></i> Request assistance
            </button>
            <a href="https://wa.me/916282268453?text=Hi%20HOMline,%20I%20need%20PwD-Friendly%20Assistance%20for%20a%20digital%20service." target="_blank" rel="noopener" className="btn btn-whatsapp btn-lg fw-bold">
              <i className="bi bi-whatsapp me-1" aria-hidden="true"></i> WhatsApp
            </a>
            <a href="tel:6282268453" className="btn btn-outline-light btn-lg fw-bold">
              <i className="bi bi-telephone-fill me-1" aria-hidden="true"></i> Call
            </a>
          </div>
        </div>
      </div>

      
      <div className="col-lg-5">
        <div className="homline-card bg-white p-4 shadow-sm h-100">
          <div className="d-flex align-items-center justify-content-between pb-3 mb-3 border-bottom">
            <div>
              <span className="badge bg-gold text-dark font-monospace small">BULLETIN</span>
              <h4 className="fw-bold text-navy mb-0">Latest Updates</h4>
            </div>
          </div>

          <div className="d-flex flex-column gap-3 mb-4">
            <FeaturedUpdates updates={data?.updates ?? []} />
          </div>

          
          <div className="d-flex justify-content-between align-items-center pt-3 border-top">
            <Link to="/updates" className="btn btn-link text-teal p-0 fw-bold text-decoration-none">
              View all updates <i className="bi bi-arrow-right ms-1"></i>
            </Link>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
    </>
  );
}
