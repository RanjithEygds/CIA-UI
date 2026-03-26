import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./AllCIAs.css";
import { getEngagements, type EngagementListItem } from "../api/engagements";

export default function AllCIAs() {
  const [engagements, setEngagements] = useState<EngagementListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getEngagements();
        setEngagements(data);
      } catch (err: any) {
        setError(err.message || "Failed to load CIAs.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <div className="all-cias-page">
      <h1>All CIAs / Engagements</h1>
      <p className="page-desc">
        Change engagements and their associated CIAs. Select an engagement to
        view details.
      </p>

      {loading && <p>Loading CIAs...</p>}
      {error && <p className="error">{error}</p>}

      <div className="all-cias-grid" role="list">
        {engagements.map((engagement) => (
          <Link
            key={engagement.id}
            to={`/all-cias/${engagement.id}`}
            className="engagement-tile card"
            role="listitem"
          >
            <h2 className="engagement-tile-title">
              {engagement.name || "Untitled Engagement"}
            </h2>

            <p className="engagement-tile-summary">
              {engagement.summary
                ? engagement.summary.slice(0, 250) + "..."
                : "No summary available."}
            </p>

            <p className="engagement-tile-meta">
              📄 {engagement.document_count} documents
            </p>

            <p className="engagement-tile-date">
              Created:{" "}
              {engagement.created_at
                ? new Date(engagement.created_at).toLocaleDateString()
                : "—"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
