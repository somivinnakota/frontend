// Talking to the shared sheet storage on the server (backend sheets.js).
// The four sheet pages are saved there, so everyone sees the same data.

import axios from 'axios';
import { API_BASE } from '../config';

// The server's name for a page, from its title: "Press and media" → "press-and-media".
export const pageFor = title => String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const url = title => `${API_BASE}/api/sheets/${pageFor(title)}`;

// Each returns { workbook, history, canUndo }, except preview, which returns what an upload would change.
export const getSheet = title => axios.get(url(title)).then(r => r.data);
export const previewUpload = (title, upload, mode) => axios.post(`${url(title)}/preview`, { upload, mode }).then(r => r.data);
export const applyUpload = (title, upload, mode) => axios.post(url(title), { upload, mode }).then(r => r.data);
export const undoLast = title => axios.post(`${url(title)}/undo`).then(r => r.data);
export const clearSheet = title => axios.delete(url(title)).then(r => r.data);

// Just the saved workbook (or null), e.g. for the AI reports.
export const loadSharedWorkbook = title => getSheet(title).then(d => d.workbook).catch(() => null);