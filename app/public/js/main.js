import { BASE } from './dom.js';
import { participantApp } from './participant.js';
import { adminApp } from './admin.js';

const root = document.getElementById('app');
const m = /^\/t\/([^/]+)\/?$/.exec(location.pathname.slice(BASE.length));
if (m) participantApp(root, decodeURIComponent(m[1]));
else adminApp(root);
