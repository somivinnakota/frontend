import axios from 'axios';
import { API_BASE } from '../config';

// Sends the report shown on screen to the backend and downloads it as a PDF,
// so the PDF always matches what the user is looking at.
export async function downloadReportPdf({ title, subtitle = '', report }) {
  const response = await axios.post(`${API_BASE}/api/pdf`, { title, subtitle, report }, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'Report'}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}