import { mountPortfolio } from './app';

const host = document.getElementById('app');
if (host) mountPortfolio(host, { routing: 'hash' });
