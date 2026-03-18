import { Link } from 'react-router-dom';
import CimmieIcon from '../components/CimmieIcon';
import './Home.css';

const agents = [
  {
    title: 'Data Extraction Agent',
    description: 'Extracts data from uploaded documents and creates a summary of the change.',
    accent: 'DX',
  },
  {
    title: 'Interview Agent',
    description: 'Conducts structured interviews through CIMMIE, and generates transcripts.',
    accent: 'IA',
  },
  {
    title: 'Insights Agent',
    description: 'Converts interview content into structured findings.',
    accent: 'IN',
  },
  {
    title: 'CIA Formulator Agent',
    description: 'Populates the CIA template with high-level and detailed outputs.',
    accent: 'CT',
  },
];

const flowSteps = [
  {
    step: 1,
    title: 'Upload & prepare',
    description: 'Upload change brief and scope, context pack, methods and templates, and interview plan.',
    icon: '📤',
  },
  {
    step: 2,
    title: 'Validate context',
    description: 'Validate extracted change context in preview before stakeholder outreach begins.',
    icon: '📝',
  },
  {
    step: 3,
    title: 'Launch interviews',
    description: 'Launch CIMMIE interviews and capture structured evidence consistently.',
    icon: '🚀',
  },
  {
    step: 4,
    title: 'Review outputs',
    description: 'Generate structured findings, and populate CIA template.',
    icon: '📊',
  },
];

export default function Home() {
  return (
    <div className="home-page">
      <section className="home-hero">
        <p className="hero-kicker">Enterprise Change Enablement Platform</p>
        <h1 className="hero-title-logo">
          <span className="ci-logo-ci">CI</span>
          <span className="ci-logo-a">A</span>
          <span className="ci-logo-ssist">ssist</span>
        </h1>
        <p className="home-hero-p">
          Turns stakeholder interviews into delivery-ready CIA outputs. Built for Change Management teams, CIAssist accelerates the Change Impact Assessment process from document intake to structured findings, narrative drafting, and template population.
        </p>
        <div className="home-cta">
          <Link to="/upload" className="btn btn-primary">
            Initiate CIA
          </Link>
        </div>
      </section>

      <section className="home-cimmie">
        <h2 className="home-section-title">
          <CimmieIcon className="cimmie-title-icon" size={32} />
          CIMMIE – Your interview assistant
        </h2>
        <div className="cimmie-card card">
          <div className="cimmie-card-inner">
            <div className="cimmie-card-icon cimmie-card-icon-themed" aria-hidden="true">
              <img src="/cimmie-robo-icon2.jpg" alt="" className="cimmie-robo-img" />
            </div>
            <div className="cimmie-card-text">
              <p>
                <strong>CIMMIE</strong> is a text-based chatbot used in scheduled, time-boxed
                interview sessions. Stakeholders join through one-time access links, complete
                their interview, and receive a real-time conversational read-back of captured
                evidence by topic.
              </p>
              {/* <p className="cimmie-note">
                Access is session-scoped and time-limited. Stakeholders cannot request post-interview
                outputs, view other transcripts, or access internal knowledge sources.
              </p> */}
            </div>
          </div>
        </div>
      </section>

      <section className="home-agents">
        <h2 className="home-section-title">Key components</h2>
        <div className="agents-grid agents-grid-3d">
          {agents.map((agent) => (
            <div key={agent.title} className="agent-card-3d">
              <div className="agent-card-3d-head">
                <span className="agent-card-3d-accent">{agent.accent}</span>
                <h3>{agent.title}</h3>
              </div>
              <p>{agent.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="home-flow">
        <h2 className="home-section-title">How it works</h2>
        <div className="flow-timeline">
          <div className="flow-timeline-line" aria-hidden="true" />
          {flowSteps.map(({ step, title, description, icon }) => (
            <div key={step} className="flow-step">
              <div className="flow-step-circle">
                <span className="flow-step-num">{step}</span>
                <span className="flow-step-icon" aria-hidden="true">{icon}</span>
              </div>
              <div className="flow-step-content">
                <h3 className="flow-step-title">{title}</h3>
                <p className="flow-step-desc">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
