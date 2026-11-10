import React, { useCallback, useState } from 'react';

// Keeps track of which data sources failed to load, so the page can say so
// instead of quietly showing empty cards.
//   const [failed, failedToLoad] = useLoadFailures();
//   axios.get(url).then(...).catch(failedToLoad('Facebook'));
//   <LoadWarning failed={failed} />
export function useLoadFailures() {
  const [failed, setFailed] = useState([]);
  const failedToLoad = useCallback(
    name => () => setFailed(list => (list.includes(name) ? list : [...list, name])),
    []
  );
  return [failed, failedToLoad];
}

export default function LoadWarning({ failed }) {
  if (!failed?.length) return null;
  return (
    <div role="alert" className="info-note" style={{ color: 'var(--destructive)' }}>
      Could not load: {failed.join(', ')}. Figures from {failed.length === 1 ? 'this source' : 'these sources'} are
      missing below. Check that the backend is running and the connection is set up.
    </div>
  );
}