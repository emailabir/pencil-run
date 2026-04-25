import './style.css';
import { createGame } from './game/core/createGame';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app container for Pencil Run');
}

createGame(app);
