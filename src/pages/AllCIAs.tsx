import { Link } from 'react-router-dom';
import './AllCIAs.css';

export interface Engagement {
  id: string;
  title: string;
  summary: string;
}

export const MOCK_ENGAGEMENTS: Engagement[] = [
  {
    id: '1',
    title: 'Finance ERP Rollout',
    summary: 'Change Impact Assessment for the global Finance ERP implementation. Covers process, technology, and role changes across 12 countries.',
  },
  {
    id: '2',
    title: 'HR Service Delivery Transformation',
    summary: 'CIA for the move to shared services and self-service HR. Focus on People and Process impacts for HR and line managers.',
  },
  {
    id: '3',
    title: 'Supply Chain Digitisation',
    summary: 'Impact assessment for the new SCM platform and revised procurement workflows. Technology and Data lens emphasis.',
  },
  {
    id: '4',
    title: 'Customer Portal Launch',
    summary: 'Stakeholder and customer impact for the new B2B portal. High-level CIA to support adoption and training planning.',
  },
];

export default function AllCIAs() {
  return (
    <div className="all-cias-page">
      <h1>All CIAs / Engagements</h1>
      <p className="page-desc">
        Change engagements and their associated CIAs. Select an engagement to view details.
      </p>
      <div className="all-cias-grid" role="list">
        {MOCK_ENGAGEMENTS.map((engagement) => (
          <Link
            key={engagement.id}
            to={`/all-cias/${engagement.id}`}
            className="engagement-tile card"
            role="listitem"
          >
            <h2 className="engagement-tile-title">{engagement.title}</h2>
            <p className="engagement-tile-summary">{engagement.summary}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
